import { dialogo, ligarAcoesConversas } from '/historico-conversas.js';
import { confirmar } from '/admin-ui.js';
import { detalheExecucao } from '/execucao-detalhe.js';
import { guiaConcluido } from '/onboarding.js';
// Vista de uma conversa (chat geral ou dentro de um quick win).
import { api, esc, ICONE, toast } from '/comum.js';
import { ICONE_RESPOSTA, anunciar, copiarTexto, alternarDetalhes } from '/resposta-ui.js';
import { renderizar, baixarCsv } from '/md.js';
import { abrirPrevia, ligarMiniaturas } from '/previa-pptx.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, pedirCiencia } from '/app.js';
import { aviso, ligarVerResultado, marcaQw, oQueEnviar, painelIntegracoes, painelQualidade, progressoExecucao } from '/qw-ui.js';
import { htmlArtefatos, ligarArtefatos } from '/artefatos.js';
import { pedidoMelhoria } from '/resultado-orientacao.js';
import { avisoPesquisa, abrirOrientacaoPesquisa, pedeLiberacaoPesquisa } from '/pesquisa-orientacao.js';

const $ = id => document.getElementById(id);
// Sugestões da conversa vazia: o chip preenche a caixa com um começo de pedido para a pessoa completar (nunca envia).
const SUGESTOES_CHAT = [
  ['Resumir um documento', 'Resuma o material abaixo (ou anexado) em poucos pontos. Destaque decisões, prazos e o que ainda falta definir.\n\n'],
  ['Escrever um email', 'Rascunhe um email curto e cordial.\nPara quem: \nO que precisa dizer: '],
  ['Comparar dois arquivos', 'Compare os dois arquivos anexados. Mostre item por item o que muda, os riscos e as informações que faltam. A decisão final será humana.'],
  ['Organizar em tabela', 'Organize as informações abaixo em uma tabela, com uma linha por item e colunas claras. Não invente dados.\n\n'],
];
const TAREFAS_NO_INICIO = 3;
const ESTADOS = { identificado: 'Identificado', em_configuracao: 'Em configuração', em_teste: 'Em teste', em_uso: 'Em uso', em_avaliacao: 'Em avaliação', aprovado: 'Aprovado', em_expansao: 'Em expansão', descartado: 'Descartado' };
const CLASSES = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
const FEEDBACK = { serviu: 'Serviu', ajustes: 'Serviu com ajustes', nao_serviu: 'Não serviu' };
let C = null;       // estado da conversa aberta
let materialEmRevisao = null; // só em memória, durante a ida à configuração da pesquisa
document.addEventListener('greenia:integracao-atualizada', ev => {
  for (const m of C?.mensagens || []) if (m.qualidade?.integracoes?.plano === ev.detail.plano) m.qualidade.integracoes = { ...m.qualidade.integracoes, ...ev.detail };
});
const vistos = new Set();   // mensagens já mostradas (só as novas animam)

// enviarAgora: { texto, anexos } para já executar ao abrir (Quick Win: "Executar" e o teste da criação).
export async function vistaConversa({ id = null, qw = null, teste = false, enviarAgora = null } = {}) {
  // Navegações seguidas: só a última desenha (uma vista antiga não sobrescreve o estado da nova).
  const estado = C = { conv: null, mensagens: [], qw, teste, opcoes: [], modelo: null, anexos: [], enviando: false, tabelas: {}, noFim: true, homologadoPadrao: null };
  if (id) {
    const d = await api(`/api/conversas/${id}`);
    if (C !== estado) return;
    Object.assign(C, { conv: d.conversa, mensagens: d.mensagens });
    d.mensagens.forEach(m => vistos.add(String(m.id)));
    if (d.conversa.quick_win_id && !qw) C.qw = await api(`/api/quick-wins/${d.conversa.quick_win_id}`).catch(() => null);
    if (C !== estado) return;
  }
  await carregarModelos();
  if (C !== estado) return;
  if (materialEmRevisao?.conversa === id && materialEmRevisao.pessoa === E.eu?.email) {
    C.anexos = materialEmRevisao.anexos;
    C.textoRetomado = materialEmRevisao.texto;
    materialEmRevisao = null;
  }
  desenhar();
  if (C.textoRetomado) { $('entrada').value = C.textoRetomado; ajustarAltura(); atualizarEnviar(); }
  // Conversa vazia no computador: o cursor já fica na caixa, como nos assistentes de chat. No celular, não abre o
  // teclado sozinho; a saudação e a caixa já estão à vista.
  else if (!C.mensagens.length && !enviarAgora && matchMedia('(min-width:761px) and (pointer:fine)').matches && !document.querySelector('[aria-modal="true"]')) $('entrada').focus({ preventScroll: true });
  // Ação explícita de execução do Quick Win ("Executar", teste da criação): o servidor faz a execução completa.
  if (enviarAgora) { $('entrada').value = enviarAgora.texto || ''; C.anexos = enviarAgora.anexos || []; ajustarAltura(); desenharAnexos(); atualizarEnviar(); await enviar(null, { executar: true }); }
}

async function carregarModelos() {
  const q = new URLSearchParams({ sigilosa: C.conv?.sigilosa ? '1' : '0', ...(C.qw ? { quick_win: C.qw.id } : {}) });
  const s = C, m = await api(`/api/modelos?${q}`);
  if (C !== s) return;
  C.opcoes = m.opcoes;
  C.homologadoPadrao = m.homologadoPadrao;
  const preferido = C.conv?.modelo || m.padrao;
  const livres = C.opcoes.filter(o => !o.bloqueado);
  C.modelo = livres.some(o => o.id === preferido) ? preferido : C.conv?.sigilosa ? m.homologadoPadrao : livres[0]?.id || null;
}

function titulo() {
  if (C.conv) return C.conv.titulo;
  return C.qw ? C.qw.nome : 'Nova conversa';
}

let desenhadoPara = null;
function desenhar() {
  const conv = C.conv, qw = C.qw;
  // Redesenhar (depois de cada resposta, ao mudar o sigilo...) não pode perder o que a pessoa já começou a
  // escrever ou anexar para a próxima mensagem.
  // Só na mesma conversa: abrir outra começa com o campo vazio.
  const rascunho = desenhadoPara === C ? document.getElementById('entrada') : null, texto = rascunho?.value || '', focado = rascunho && document.activeElement === rascunho;
  desenhadoPara = C;
  const sig = !!conv?.sigilosa;
  const podeTrocar = !qw || qw.pode_trocar || C.opcoes.length > 1;
  $('principal').innerHTML = `
    ${cabecalho(titulo(), conv ? `<button type="button" class="icone-btn hc-acoes acoes-conversa" id="acoes-conversa" data-hc-acoes="${conv.id}" aria-label="Ações da conversa" title="Ações da conversa" aria-haspopup="menu" aria-expanded="false">${ICONE.opcoes}</button>` : '')}
    ${qw ? `<div class="barra-conversa"><a class="qw-contexto" href="#/qw/${qw.id}" title="Abrir o Quick Win">${marcaQw(qw)}${esc(qw.nome)}</a>${C.teste ? '<span class="dica">Teste: não conta nos resultados</span>' : qw.v2 || !qw.podeEditar ? '' : `<span class="dica">${ESTADOS[qw.status] || ''}</span>`}</div>` : ''}
    ${qw && !qw.v2 && C.teste && qw.podeEditar ? `<div class="faixa-teste" role="region" aria-label="Teste do Quick Win">${aviso('<b>Teste do Quick Win.</b> Não entra nos resultados. Quando estiver bom, publique para a equipe.', 'info',
      `${['em_uso', 'em_avaliacao', 'aprovado', 'em_expansao'].includes(qw.status) ? '' : `<a class="btn btn-verde btn-pequeno" href="#/qw/${qw.id}/publicar">Publicar para a equipe</a>`}<a class="btn btn-linha btn-pequeno" href="#/qw/${qw.id}/editar">Ajustar instruções</a><a class="btn btn-texto btn-pequeno" href="#/qw/${qw.id}">Voltar ao Quick Win</a>`)}</div>` : ''}
    ${qw?.v2 && C.teste && qw.podeEditar ? `<div class="faixa-teste" role="region" aria-label="Teste do Quick Win">${aviso('<b>Teste do Quick Win.</b> Usa a versão em edição e não entra nos resultados.', 'info',
      `<a class="btn btn-verde btn-pequeno" href="#/qw/${qw.id}/publicar">Publicar Quick Win</a><a class="btn btn-linha btn-pequeno" href="#/qw/${qw.id}/ajustar">Ajustar</a>`)}</div>` : ''}
    <div class="mensagens" id="msgs"><div class="coluna" id="coluna"></div></div>
    <div class="compositor"><div class="compositor-dentro">
      ${avisoPesquisa(C.conv?.pesquisa)}
      ${qw?.v2 && C.proximaExecucao ? `<div class="proxima-execucao" role="status"><span>${ICONE.raio}</span><span><b>Nova execução do Quick Win.</b> O próximo envio roda o trabalho completo, com conferência.</span><button type="button" class="btn btn-texto btn-pequeno" id="cancelar-execucao">Cancelar</button></div>` : ''}
      <div class="caixa caixa-chat" id="caixa-chat">
        <div class="anexos-pendentes" id="anexos"></div>
        <div class="link-novo oculto" id="link-novo"><label class="sr" for="link-url">Link (https)</label><input class="entrada" id="link-url" type="url" inputmode="url" maxlength="2000" placeholder="https://… (página pública usada como fonte)">
          <button type="button" class="btn btn-linha btn-pequeno" id="link-ok">Adicionar</button><button type="button" class="btn-texto btn-pequeno" id="link-cancelar">Cancelar</button></div>
        <input type="file" id="arquivo" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff">
        <textarea id="entrada" rows="1" placeholder="${esc(!qw ? 'Pergunte alguma coisa…' : !qw.v2 ? 'Cole o texto ou anexe…' : !C.mensagens.length || C.proximaExecucao ? 'Cole o texto ou anexe o material…' : 'Peça um ajuste, faça uma pergunta ou continue a conversa…')}" aria-label="Mensagem"></textarea>
        <div class="caixa-barra">
          <div class="menu-anexos">
            <button type="button" class="caixa-icone" id="mais-anexos" aria-label="Adicionar arquivo ou link" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-anexos" title="Adicionar arquivo ou link">${ICONE.mais}</button>
            <div class="menu-anexos-lista" id="menu-anexos" role="menu" aria-label="Adicionar" hidden>
              <button type="button" role="menuitem" id="anexar">${ICONE.clipe}<span><b>Anexar arquivo</b><small>PDF, Word, apresentação, planilha, texto ou imagem</small></span></button>
              <button type="button" role="menuitem" id="anexar-link" aria-controls="link-novo" aria-expanded="false">${ICONE.link}<span><b>Adicionar link</b><small>Página pública usada como fonte</small></span></button>
            </div>
          </div>
          ${C.opcoes.length > 1 && !qw?.v2 ? `<select class="caixa-nivel" id="modelo" aria-label="Nível" title="Nível. Opcional: no Automático, cada pedido já recebe o nível certo." ${podeTrocar ? '' : 'disabled'}>
            ${C.opcoes.map(o => `<option value="${esc(o.id)}" ${o.id === C.modelo ? 'selected' : ''} ${o.bloqueado ? 'disabled' : ''}>${esc(o.automatico ? 'Automático' : o.nivel || o.nome)}${o.bloqueado ? ' · indisponível até a renovação' : ''}</option>`).join('')}
          </select>` : ''}
          <button type="button" class="caixa-chave" id="sigilosa" role="switch" aria-checked="${sig}" ${sig ? 'aria-readonly="true"' : ''} aria-describedby="efeito-sigilo"
            title="${esc(sig ? `Dados sigilosos: ligado até a conversa ser apagada${conv.motivo_sigilosa ? ` (${conv.motivo_sigilosa})` : ''}` : 'Dados sigilosos: desligado')}">${sig ? ICONE.cadeado : ICONE.cadeadoAberto}<span class="caixa-chave-rotulo">Dados sigilosos</span></button>
          <span class="sr" id="efeito-sigilo">${sig ? `Ligado até a conversa ser apagada.${conv.motivo_sigilosa ? ` Motivo: ${esc(conv.motivo_sigilosa)}.` : ''}` : 'Desligado. Ao ligar, a plataforma pede confirmação.'}</span>
          ${qw?.v2 && C.mensagens.length ? `<button type="button" class="btn-execucao" id="nova-execucao" aria-pressed="${!!C.proximaExecucao}" aria-label="Nova execução do Quick Win" title="Rodar o Quick Win de novo, com conferência">${ICONE.raio}<span>Nova execução</span></button>` : ''}
          <button class="enviar" id="enviar" aria-label="Enviar" title="Enviar (Enter)" disabled>${ICONE.enviar}<span class="sr">Enviar</span></button>
        </div>
        <div class="caixa-soltar" aria-hidden="true">Solte os arquivos para anexar</div>
      </div>
      <div class="inicio-atalhos" id="inicio-atalhos"></div>
      ${qw?.v2 && C.mensagens.length ? `<p class="continuar-caso"><a href="#/qw/${qw.id}/usar">Usar com outro material →</a></p>` : ''}
      ${qw && C.mensagens.length ? '' : '<p class="nota-compositor">Revise antes de usar: a IA pode errar.</p>'}
    </div></div>
    <div class="sr" aria-live="polite" id="ao-vivo"></div>`;
  ligarCabecalho();
  desenharMensagens();
  ligar();
  if (texto) { $('entrada').value = texto; ajustarAltura(); }
  if (focado) $('entrada').focus();
  desenharAnexos(); atualizarEnviar();
}

// Conversa vazia: sugestões (chips que preenchem a caixa) e, na conversa livre, até 3 Quick Wins publicados para
// esta pessoa (a mesma lista da lateral, que o servidor já filtra pelo acesso). Com mensagens, nada disso aparece.
function atalhosInicio() {
  const raiz = $('inicio-atalhos');
  if (C.mensagens.length || C.pensando) { raiz.innerHTML = ''; return; }
  const lista = C.qw ? (C.qw.sugestoes || []).map(t => [t, t]) : SUGESTOES_CHAT;
  const prontos = C.qw ? [] : (E.quickWins || []).filter(q => q.publicado).slice(0, TAREFAS_NO_INICIO);
  raiz.innerHTML = (lista.length ? `<div class="inicio-sugestoes" id="sugestoes" role="group" aria-label="Sugestões de pedido">${lista.map(([rotulo], i) => `<button type="button" class="chip-inicio" data-sugestao-inicio="${i}">${esc(rotulo)}</button>`).join('')}</div>` : '')
    + (prontos.length ? `<nav class="inicio-tarefas" id="tarefas-prontas" aria-label="Tarefas prontas"><span class="inicio-tarefas-rotulo">Ou use uma tarefa pronta:</span>${prontos.map(q => `<a class="chip-inicio chip-tarefa" href="#/qw/${q.id}">${marcaQw(q)}<span>${esc(q.nome)}</span></a>`).join('')}<a class="inicio-ver-todos" href="#/quick-wins">Ver todos</a></nav>` : '');
  raiz.querySelectorAll('[data-sugestao-inicio]').forEach(b => { b.onclick = async () => {
    const s = C, texto = lista[Number(b.dataset.sugestaoInicio)][1];
    if ($('entrada').value.trim() && $('entrada').value !== texto && !await substituirPedido()) return;
    if (C !== s || !$('entrada')) return;
    const t = $('entrada');
    t.value = texto; ajustarAltura(); atualizarEnviar();
    t.focus(); t.setSelectionRange(texto.length, texto.length);
  }; });
}

// Saudação da conversa vazia, com o primeiro nome quando há um (nunca o email).
function saudacao() {
  const nome = (E.eu?.nome || '').trim().split(/\s+/)[0];
  return nome && !nome.includes('@') ? `Olá, ${nome[0].toLocaleUpperCase('pt-BR')}${nome.slice(1)}. O que você precisa fazer?` : 'Olá! O que você precisa fazer?';
}

// Resposta guardada no servidor: dá para baixar como arquivo (Word, PowerPoint, Excel).
const servidor = m => Number.isInteger(m.id) && m.guardado !== false && !!C.conv && !/^\[Conteúdo processado e não guardado/.test(m.texto || '');
const arquivoHref = (m, f) => `/api/conversas/${C.conv.id}/mensagens/${m.id}/arquivo/${f}`;
// O pedido logo antes da resposta diz qual arquivo a pessoa quer: esse vira um cartão à vista, como um anexo.
const PEDE = { docx: /\b(word|docx|\.doc\b)/i, pptx: /\b(power ?point|pptx|ppt|slides?|apresenta[cç](ão|ao|ões|oes))\b/i, xlsx: /\b(excel|xlsx|xls|planilhas?)\b/i };
const MESMO_LAYOUT = /\b(mesm[oa]s? (layout|estilo|estrutura|modelo|template|identidade|fontes?|cores?)|seguindo (o|a) (layout|estrutura|modelo|template))\b/i;
const ARQ = { docx: ['documento', 'Documento Word', '.docx editável'], pptx: ['slides', 'Apresentação PowerPoint', '.pptx editável'], xlsx: ['planilha', 'Planilha Excel', '.xlsx com as tabelas'] };
// Arquivo gerado no servidor para esta resposta (apresentação no layout do modelo enviado).
function arquivosGerados(m) {
  if (!C.conv || !(m.arquivos || []).length) return '';
  return `<div class="arquivos-resposta">${m.arquivos.map(a => cartaoComPrevia({ previa: `/api/conversas/${C.conv.id}/arquivos/${a.id}/previa`, baixar: `/api/conversas/${C.conv.id}/arquivos/${a.id}`, nome: a.nome,
    detalhe: `PowerPoint editável · ${a.slides} slides no layout de ${a.modelo || 'modelo'}${a.sem_adaptacao ? ` · ${a.sem_adaptacao} textos sem adaptação` : ''}` })).join('')}</div>`;
}
// Cartão de apresentação com prévia: miniatura do 1º slide (clique abre todos os slides) e o download logo abaixo.
function cartaoComPrevia({ previa, baixar, nome, detalhe }) {
  return `<div class="arquivo-previa"><button type="button" class="pv-mini" data-abrir-previa="${esc(previa)}" data-baixar="${esc(baixar)}" data-nome="${esc(nome)}" aria-label="Ver os slides de ${esc(nome)}"><span class="pv-mini-slide" data-previa="${esc(previa)}" hidden></span><span class="pv-mini-ver">Ver slides · <span data-previa-total></span></span></button>
    <a class="anexo-resposta" href="${esc(baixar)}" download><span class="anexo-resposta-icone">${ICONE_RESPOSTA.slides}</span><span class="anexo-resposta-texto"><b>${esc(nome)}</b><small>${esc(detalhe)}</small></span><span class="anexo-resposta-acao">${ICONE_RESPOSTA.baixar}</span></a></div>`;
}
function arquivosPedidos(m, tabelas) {
  if (!servidor(m)) return '';
  if ((m.arquivos || []).length) return arquivosGerados(m);
  const i = C.mensagens.indexOf(m), pedido = C.mensagens.slice(0, i).reverse().find(x => x.papel === 'user')?.texto || '';
  // Pedido "no mesmo layout" de um modelo: só vale o arquivo montado no layout (m.arquivos); nada genérico no lugar.
  if (MESMO_LAYOUT.test(pedido)) return '';
  const pedidos = Object.keys(PEDE).filter(f => PEDE[f].test(pedido) && (f !== 'xlsx' || tabelas.length));
  // Excel com uma tabela só: o cartão da própria tabela já é a planilha.
  const lista = pedidos.filter(f => !(f === 'xlsx' && tabelas.length === 1));
  return lista.length ? `<div class="arquivos-resposta">${lista.map(f => f === 'pptx' ? cartaoComPrevia({ previa: `${arquivoHref(m, 'pptx')}/previa`, baixar: arquivoHref(m, 'pptx'), nome: ARQ.pptx[1], detalhe: `Baixar arquivo ${ARQ.pptx[2]}` }) : `<a class="anexo-resposta" href="${arquivoHref(m, f)}" download data-arquivo="${f}"><span class="anexo-resposta-icone">${ICONE_RESPOSTA[ARQ[f][0]]}</span><span class="anexo-resposta-texto"><b>${ARQ[f][1]}</b><small>Baixar arquivo ${ARQ[f][2]}</small></span><span class="anexo-resposta-acao">${ICONE_RESPOSTA.baixar}</span></a>`).join('')}</div>` : '';
}
// "Baixar como": qualquer resposta guardada vira Word ou PowerPoint; com tabela, também Excel.
function baixarComo(m) {
  if (!servidor(m)) return '';
  const tabelas = (C.tabelas[m.id] || []).length;
  const itens = [['docx', 'Word (.docx)'], ['pptx', 'PowerPoint (.pptx)'], ...(tabelas ? [['xlsx', `Excel (.xlsx)${tabelas > 1 ? ', todas as tabelas' : ''}`]] : [])];
  const id = `baixar-como-${esc(m.id)}`;
  return `<span class="baixar-como"><button type="button" class="acao-resposta" data-baixar-como aria-expanded="false" aria-controls="${id}" aria-label="Baixar como arquivo" title="Baixar como arquivo">${ICONE_RESPOSTA.baixar}</button><div class="baixar-como-menu" id="${id}" role="group" aria-label="Formatos do arquivo" hidden>${itens.map(([f, r]) => `<a href="${arquivoHref(m, f)}" download data-arquivo="${f}">${r}</a>`).join('')}</div></span>`;
}

function menuBaixar(botao, abrir) {
  botao.setAttribute('aria-expanded', String(abrir));
  const menu = document.getElementById(botao.getAttribute('aria-controls'));
  menu.hidden = !abrir;
  if (abrir) {
    menu.querySelector('a')?.focus();
    menu.onkeydown = e => { if (e.key === 'Escape') { menuBaixar(botao, false); botao.focus(); } };
  }
}

// Resposta cuja entrega é um arquivo de apresentação: o arquivo (com a prévia) vem primeiro e o roteiro longo fica
// recolhido, como nos outros assistentes. Resposta comum: o texto e, abaixo, os cartões de arquivo.
function corpoComArquivo(m, html, tabelas, revisar) {
  const bolha = `<div class="bolha-ia${m.erro ? ' aviso-bolha' : ''}${revisar ? ' oculto' : ''}" id="resultado-${esc(m.id)}">${html}</div>`;
  if (m.carregando || m.erro) return bolha;
  const cartoes = arquivosPedidos(m, tabelas);
  if (!cartoes.includes('arquivo-previa') || String(m.texto || '').length < 1200) return bolha + cartoes;
  const slides = (String(m.texto).match(/^\s*#{1,3}\s|^\s*\**\s*slide\s+\d+/gim) || []).length;
  return `${cartoes}<details class="texto-recolhido"><summary>Ver o texto completo${slides > 2 ? ` (${slides} seções)` : ''}</summary>${bolha}</details>`;
}

function htmlMensagem(m) {
  const anim = vistos.has(String(m.id)) || m.carregando ? '' : ' anim';
  if (!m.carregando) vistos.add(String(m.id));
  if (m.papel === 'user') {
    // Pedido da pessoa: balão à direita (quebras de linha preservadas), anexos em etiquetas logo acima.
    return `<div class="msg-eu${anim}">${(m.anexos || []).length ? `<div class="msg-eu-anexos">${m.anexos.map(a => `<span class="anexo-chip">${ICONE.doc} ${esc(a)}</span>`).join('')}</div>` : ''}<div class="bolha-eu">${esc(m.texto)}</div></div>`;
  }
  if (m.papel === 'aviso') return `<div class="linha-aviso${anim}">${esc(m.texto)}</div>`;
  const { html, tabelas } = m.carregando ? { html: esc(m.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>' + (C.etapa && !C.execucao ? `<p class="dica" role="status">${esc(C.etapa)}</p>` : ''), tabelas: [] } : renderizar(m.texto, servidor(m) ? { csvHref: i => `/api/conversas/${C.conv.id}/mensagens/${m.id}/tabelas/${i}/csv`, xlsxHref: i => `/api/conversas/${C.conv.id}/mensagens/${m.id}/tabelas/${i}/xlsx` } : {});
  C.tabelas[m.id] = tabelas;
  // Execução do Quick Win: resultado primeiro e conferência logo abaixo, secundária. Mensagens seguintes: normais.
  const execucao = !m.carregando && !!m.qualidade && m.qualidade.status !== 'pergunta';
  const revisar = execucao && m.qualidade.status === 'inconsistente';
  const refinarHref = C.qw?.v2 && C.qw.status !== 'descartado' ? `#/qw/${C.qw.id}/refinar/${C.conv?.id}/${m.id}` : '';
  const qc = execucao ? painelQualidade(m.qualidade, { id: m.id, podeMelhorar: true, podeAjustar: !!C.qw?.podeEditar, ajustarHref: refinarHref, resolverPesquisa: !!C.conv?.pesquisa?.bloqueada }) : '';
  const integracoes = execucao ? painelIntegracoes(m.qualidade.integracoes, { refinarHref: C.qw?.podeEditar ? refinarHref : '' }) : '';
  // Fontes: documentos da empresa (título) e, quando houve pesquisa na internet, os endereços consultados.
  const fontes = (m.fontes || []).length ? `<div class="fontes"><b>Fontes</b>${m.fontes.map(f => (f && typeof f === 'object' && /^https?:\/\//.test(f.url || '')
    ? `<a class="selo" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo || f.url)}</a>` : `<span class="selo">${ICONE.doc} ${esc(f)}</span>`)).join('')}</div>` : '';
  // Próximos passos do Quick Win ligados a este resultado (levam a outra tela), discretos, abaixo das ações.
  const conferir = execucao && C.qw?.painel && m.guardado !== false && (!E.permissoes || E.permissoes.includes('chat.use'));
  const refinar = execucao && C.qw?.v2 && C.qw.podeEditar && C.qw.status !== 'descartado';
  const proximos = conferir || refinar ? `<div class="resposta-proximos">${conferir ? `<a class="link-sutil" href="#/qw/${C.qw.id}/acompanhamento/resultado/${m.id}">Conferir dados para os resultados</a>` : ''}${refinar ? `<a class="link-sutil" href="#/qw/${C.qw.id}/refinar/${C.conv?.id}/${m.id}">Refinar Quick Win</a>` : ''}</div>` : '';
  const ultima = m.id === C.ultimaResposta;
  return `<div class="resposta${anim}${ultima ? ' resposta-ultima' : ''}" data-msg="${m.id}">
    <div class="resposta-corpo">${execucao ? `<span class="rotulo-execucao">${ICONE.raio} Resultado do Quick Win</span>` : ''}${htmlArtefatos(m.artefatos)}${revisar ? qc : ''}${corpoComArquivo(m, html, tabelas, revisar)}${revisar ? '' : qc}${integracoes}
      ${m.carregando || m.erro ? '' : `${fontes}${acoesResposta(m, { execucao, conferir })}${proximos}`}
    </div></div>`;
}

// Ações da resposta numa linha só de ícones (com dica e nome acessível): copiar, gerar de novo, 👍, 👎 e detalhes.
// Na última resposta ficam sempre à vista; nas anteriores aparecem ao passar o mouse ou com o foco do teclado.
function acoesResposta(m, { execucao, conferir }) {
  const regerar = m.id === C.podeRegerar ? `<button type="button" class="acao-resposta" data-regerar="${m.id}" ${C.enviando ? 'disabled' : ''} aria-label="Gerar de novo" title="Gerar de novo (usa créditos como uma nova mensagem)">${ICONE_RESPOSTA.regerar}</button>` : '';
  return `<div class="rodape-resposta acoes-resposta" role="group" aria-label="Ações da resposta">
      <button type="button" class="acao-resposta" data-copiar="${m.id}" aria-label="Copiar resposta" title="Copiar">${ICONE_RESPOSTA.copiar}</button>${baixarComo(m)}${regerar}${avaliacao(m)}${detalhesResposta(m, { execucao, conferir })}
      ${E.iaSimulada ? `<span class="selo-simulada" title="Ambiente de demonstração: nenhum modelo de IA real foi usado">${ICONE_RESPOSTA.simulada}<span>Resposta simulada</span></span>` : ''}
      ${C.qw ? '<span class="revise">Revise antes de usar.</span>' : ''}
    </div>`;
}

// "Detalhes" (o antigo "i"): nível, motivo da escolha, modelo (só para quem administra), data, simulação, o registro
// da execução do Quick Win e o atalho para os resultados. Num painel que abre sobre a conversa, fora da leitura.
function detalhesResposta(m, { execucao, conferir }) {
  const nivel = !C.qw?.v2 && (m.modelo || m.classe || m.rota_modo)
    ? (m.rota_modo === 'externo' ? 'Escolha automática do nível.' : `Nível ${esc(CLASSES[m.classe] || 'Rápido')}${m.rota_modo === 'automatico' ? ', pela escolha automática do nível' : ''}.`) : '';
  const motivo = m.rota_explicacao && !C.qw?.v2 ? esc(m.rota_explicacao_simples || m.rota_explicacao) : '';
  const modelo = m.modelo ? `Modelo usado: ${esc(C.opcoes.find(o => o.id === m.modelo)?.nome || m.modelo)}.` : '';
  const quando = m.criado_em && !Number.isNaN(Date.parse(m.criado_em)) ? `Respondida em ${esc(new Date(m.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}.` : '';
  const simulada = E.iaSimulada ? 'Ambiente de demonstração: a resposta foi simulada e nenhum modelo de IA real foi usado.' : '';
  const acompanhar = conferir ? `<a class="link-sutil" href="#/qw/${C.qw.id}/acompanhamento">Acompanhar resultados</a>` : '';
  const exec = execucao ? detalheExecucao(m) : '';
  const linhas = [nivel, motivo, modelo, quando, simulada].filter(Boolean);
  if (!linhas.length && !exec && !acompanhar) return '';
  const id = `detalhes-${esc(m.id)}`;
  return `<span class="detalhes-resposta"><button type="button" class="acao-resposta" data-detalhes aria-expanded="false" aria-controls="${id}" aria-label="Detalhes da resposta" title="Detalhes">${ICONE_RESPOSTA.detalhes}</button>
    <div class="detalhes-resposta-painel info-resposta-texto" id="${id}" role="region" aria-label="Detalhes da resposta" hidden>${linhas.map(t => `<p>${t}</p>`).join('')}${exec}${acompanhar ? `<p>${acompanhar}</p>` : ''}</div></span>`;
}

// Avaliação (vale para a conversa) na última resposta, em qualquer conversa (menos nos testes de Quick Win):
// 👍 registra "Serviu"; 👎 abre um diálogo com "Serviu com ajustes" e "Não serviu". Dá para mudar depois.
function avaliacao(m) {
  if (!C.conv || C.conv.teste || m.id !== C.ultimaResposta) return '';
  const fb = C.conv.feedback, negativo = fb === 'ajustes' || fb === 'nao_serviu';
  const rotuloNeg = fb === 'ajustes' ? 'Serviu com ajustes' : 'Não serviu';
  return `<button type="button" class="acao-resposta" data-fb="serviu" aria-pressed="${fb === 'serviu'}" aria-label="Serviu" title="Serviu">${ICONE_RESPOSTA.gostei}</button><button type="button" class="acao-resposta" data-fb-negativo aria-pressed="${negativo}" aria-haspopup="dialog" aria-label="${rotuloNeg}" title="${negativo ? `${rotuloNeg} (mudar avaliação)` : 'Não serviu'}">${ICONE_RESPOSTA.naoGostei}</button>`;
}

function desenharMensagens() {
  const vazio = !C.mensagens.length;
  C.ultimaResposta = [...C.mensagens].reverse().find(m => m.papel === 'assistant' && !m.erro && !m.carregando && Number.isInteger(m.id))?.id ?? null;
  // "Gerar de novo": só a última resposta guardada, logo depois do pedido, na conversa livre e no Quick Win do
  // formato anterior (testes e execuções do formato novo têm conferência própria). O servidor confere de novo.
  const fim = C.mensagens.filter(m => m.papel !== 'aviso' && !m.erro);   // uma falha mostrada não conta: dá para tentar de novo
  const ultima = fim.at(-1), pedido = fim.at(-2);
  C.podeRegerar = C.conv && !C.conv.teste && !C.qw?.v2 && ultima?.id === C.ultimaResposta && pedido?.papel === 'user' && Number.isInteger(pedido.id)
    && ultima.guardado !== false && !/^\[Conteúdo processado e não guardado/.test(ultima.texto) && !ultima.artefatos?.length ? ultima.id : null;
  // Quem nunca teve uma conversa (e não concluiu o guia) vê uma linha só com o caminho para o guia, que fica na Ajuda.
  const primeiraVez = !C.conv && !(E.totalConversas || E.conversas?.length) && !guiaConcluido();
  const boasVindas = C.qw
    ? `<div class="boas-vindas inicio-conversa"><span class="passo" style="margin:0 auto;background:${esc(C.qw.cor)};color:#fff">${esc((C.qw.icone || C.qw.nome[0] || '').slice(0, 2))}</span>
        <h2>${esc(C.qw.nome)}</h2><p>${esc(C.qw.para_que_serve)}</p>${C.qw.v2 ? `<p class="o-que-enviar">${esc(oQueEnviar(C.qw))}</p>` : ''}</div>`
    : `<div class="boas-vindas inicio-conversa"><h2 id="saudacao">${esc(saudacao())}</h2>${primeiraVez ? '<p class="inicio-dica">Primeira vez aqui? Veja o <a href="#/primeiros-passos">guia de primeiros passos</a>.</p>' : ''}</div>`;
  const corte = C.conv?.cortada ? '<div class="linha-aviso">As primeiras mensagens desta conversa não estão mais sendo consideradas.</div>' : '';
  $('coluna').innerHTML = (vazio ? boasVindas : corte) + C.mensagens.map(htmlMensagem).join('') + (C.pensando ? `<div class="resposta resposta-pensando">${C.execucao ? progressoExecucao(C.etapa) : '<span class="pensando" role="status" aria-label="Pensando"><span></span><span></span><span></span></span>'}</div>` : '');
  atalhosInicio();
  // Artefatos visuais: visualizar, baixar e editar. Uma edição cria nova versão; a conversa é relida do servidor.
  ligarArtefatos($('coluna'), { aoMudar: () => recarregarConversa(false) });
  ligarMiniaturas($('coluna'));
  rolarSeNoFim();
}

// Trocar o texto que a pessoa já escreveu pede confirmação no modal da plataforma (os anexos ficam).
function substituirPedido() {
  return confirmar({ titulo: 'Substituir o pedido que você começou?', texto: 'O texto que está na caixa de mensagem será trocado pelo pedido preparado. Os anexos continuam.', botao: 'Substituir pedido', cancelar: 'Manter meu texto' });
}

// Conversa vazia começa no topo (saudação à vista); com mensagens, acompanha o fim.
function rolarSeNoFim() { const msgs = $('msgs'); if (!msgs || !C) return; if (!C.mensagens.length && !C.pensando) msgs.scrollTop = 0; else if (C.noFim) msgs.scrollTop = msgs.scrollHeight; }
function ajustarAltura() { const t = $('entrada'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; t.style.overflowY = t.scrollHeight > 220 ? 'auto' : 'hidden'; }
function atualizarEnviar() { $('enviar').disabled = C.enviando || (!$('entrada').value.trim() && !C.anexos.length); }

function desenharAnexos() {
  // Papel do material (fontes): material da execução (padrão), só referência de estilo ou fonte principal.
  const papel = (a, i) => `<select class="papel-anexo" data-papel-anexo="${i}" aria-label="Como usar ${esc(a.nome)}">${[['', 'Material'], ['REFERENCE', 'Só referência'], ['REQUIRED_SOURCE', 'Fonte principal']].map(([v, r]) => `<option value="${v}" ${(a.papel || '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
  $('anexos').innerHTML = C.anexos.map((a, i) => `<span class="anexo-chip">${a.link ? ICONE.link : ICONE.doc} ${esc(a.nome)}${papel(a, i)}<button type="button" data-tirar="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join('');
  $('anexos').querySelectorAll('[data-papel-anexo]').forEach(s => { s.onchange = () => { C.anexos[Number(s.dataset.papelAnexo)].papel = s.value || undefined; }; });
  $('anexos').querySelectorAll('[data-tirar]').forEach(b => { b.onclick = () => { C.anexos.splice(Number(b.dataset.tirar), 1); desenharAnexos(); atualizarEnviar(); }; });
}

function ligar() {
  $('resolver-pesquisa')?.addEventListener('click', resolverPesquisa);
  const t = $('entrada');
  t.addEventListener('input', () => { ajustarAltura(); atualizarEnviar(); });
  t.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!$('enviar').disabled) enviar(); } });
  $('enviar').onclick = () => enviar();
  const estado = C;
  $('msgs').addEventListener('scroll', ev => { const m = ev.currentTarget; if (C === estado && m.isConnected) C.noFim = m.scrollHeight - m.scrollTop - m.clientHeight < 40; });
  if ($('modelo')) $('modelo').onchange = ev => { C.modelo = ev.target.value; desenhar(); };
  $('sigilosa').onclick = explicarSigilo;
  // Menu "+" da caixa (como nos assistentes de chat): anexar arquivo ou link; Esc e clique fora fecham.
  const menu = $('menu-anexos'), mais = $('mais-anexos');
  const abrirMenu = aberto => {
    menu.hidden = !aberto; mais.setAttribute('aria-expanded', String(aberto));
    if (aberto) { menu.querySelector('[role=menuitem]').focus(); document.addEventListener('pointerdown', foraDoMenu, true); }
    else document.removeEventListener('pointerdown', foraDoMenu, true);
  };
  const foraDoMenu = ev => { if (!ev.target.closest?.('.menu-anexos')) abrirMenu(false); };
  mais.onclick = () => abrirMenu(menu.hidden);
  menu.onkeydown = ev => {
    const itens = [...menu.querySelectorAll('[role=menuitem]')], i = itens.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); abrirMenu(false); mais.focus(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); itens[(i + (ev.key === 'ArrowDown' ? 1 : itens.length - 1)) % itens.length].focus(); }
    else if (ev.key === 'Tab') abrirMenu(false);
  };
  const mostrarLink = aberto => { $('link-novo').classList.toggle('oculto', !aberto); $('anexar-link').setAttribute('aria-expanded', String(aberto)); if (aberto) $('link-url').focus(); else $('entrada').focus(); };
  $('anexar').onclick = () => { abrirMenu(false); $('arquivo').click(); };
  $('anexar-link').onclick = () => { abrirMenu(false); mostrarLink($('link-novo').classList.contains('oculto')); };
  $('link-cancelar').onclick = () => { $('link-url').value = ''; mostrarLink(false); };
  const addLink = () => {
    const url = $('link-url').value.trim();
    if (!/^https:\/\/\S+$/i.test(url)) return toast('Use um link que comece com https://', 6000);
    if (C.anexos.filter(a => a.link).length >= 3) return toast('Até 3 links por mensagem.', 6000);
    let nome = url; try { const u = new URL(url); nome = u.host + u.pathname; } catch { /* mostra o texto digitado */ }
    C.anexos.push({ link: true, url, nome: nome.slice(0, 80), tamanho: 0 });
    $('link-url').value = ''; mostrarLink(false);
    desenharAnexos(); atualizarEnviar();
  };
  $('link-ok').onclick = addLink;
  $('link-url').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); addLink(); } else if (ev.key === 'Escape') { ev.preventDefault(); $('link-cancelar').click(); } };
  // Arquivos entram pelo menu "+", arrastando para a caixa ou colando (Ctrl+V) no campo de texto.
  const adicionarArquivos = async arquivos => {
    for (const f of arquivos) {
      if (C.anexos.length >= 5) { toast('Até 5 anexos por mensagem. Envie os demais na próxima.', 6000); break; }
      if (f.size > 25 * 1024 * 1024) { toast(`${f.name}: acima de 25 MB. Envie uma versão menor ou só a parte necessária.`, 6000); continue; }
      if (C.anexos.reduce((t, a) => t + a.tamanho, 0) + f.size > 30 * 1024 * 1024) { toast('Os anexos desta mensagem passariam de 30 MB. Envie em mais de uma mensagem.', 6000); break; }
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
      C.anexos.push({ nome: f.name, base64, tamanho: f.size });
    }
    desenharAnexos(); atualizarEnviar();
  };
  $('arquivo').onchange = ev => {
    // O campo pode ser redesenhado enquanto os arquivos são lidos (a resposta anterior terminou): a lista fica
    // guardada antes da leitura, e o anexo entra no campo atual.
    const campo = ev.target, arquivos = [...campo.files];
    campo.value = '';
    return adicionarArquivos(arquivos);
  };
  const caixa = $('caixa-chat');
  const temArquivos = ev => [...(ev.dataTransfer?.types || [])].includes('Files');
  caixa.addEventListener('dragover', ev => { if (!temArquivos(ev)) return; ev.preventDefault(); caixa.classList.add('soltando'); });
  caixa.addEventListener('dragleave', ev => { if (!caixa.contains(ev.relatedTarget)) caixa.classList.remove('soltando'); });
  caixa.addEventListener('drop', ev => { if (!temArquivos(ev)) return; ev.preventDefault(); caixa.classList.remove('soltando'); adicionarArquivos([...ev.dataTransfer.files]); });
  $('entrada').addEventListener('paste', ev => { const fs = [...(ev.clipboardData?.files || [])]; if (fs.length) { ev.preventDefault(); adicionarArquivos(fs); } });
  $('coluna').addEventListener('click', ev => {
    if (ev.target.closest('[data-resolver-pesquisa]')) resolverPesquisa();
    const melhorar = ev.target.closest('[data-melhorar-resultado]');
    if (melhorar) {
      const m = C.mensagens.find(x => String(x.id) === melhorar.dataset.melhorarResultado);
      if (m) (async () => {
        if ($('entrada').value.trim() && !await substituirPedido()) return;
        if (!$('entrada') || !C?.mensagens.includes(m)) return;
        $('entrada').value = pedidoMelhoria(m.qualidade); C.proximaExecucao = false;
        desenhar(); $('entrada').focus(); ajustarAltura(); atualizarEnviar();
        toast('Pedido preparado. Confira o texto e clique em Enviar. Nenhuma nova execução foi iniciada.');
      })();
    }
    const rg = ev.target.closest('[data-regerar]');
    if (rg && !rg.disabled) gerarDeNovo(Number(rg.dataset.regerar));
    const cp = ev.target.closest('[data-copiar]');
    if (cp) { const m = C.mensagens.find(x => String(x.id) === cp.dataset.copiar); if (m) copiarTexto(m.texto, cp, 'Resposta copiada.'); }
    const det = ev.target.closest('[data-detalhes]');
    if (det) alternarDetalhes(det);
    // "Baixar como": o botão abre e fecha o menu; escolher um formato ou clicar fora fecha.
    const bc = ev.target.closest('[data-baixar-como]');
    for (const b of $('coluna').querySelectorAll('[data-baixar-como][aria-expanded="true"]')) if (b !== bc) menuBaixar(b, false);
    if (bc) menuBaixar(bc, bc.getAttribute('aria-expanded') !== 'true');
    if (ev.target.closest('.baixar-como-menu a')) menuBaixar(ev.target.closest('.baixar-como').querySelector('[data-baixar-como]'), false);
    const pv = ev.target.closest('[data-abrir-previa]');
    if (pv) abrirPrevia(pv.dataset.abrirPrevia, { baixar: pv.dataset.baixar, nome: pv.dataset.nome });
    const csv = ev.target.closest('[data-csv]');
    if (csv && csv.tagName !== 'A') baixarCsv(C.tabelas[csv.closest('[data-msg]').dataset.msg][Number(csv.dataset.csv)], `${(C.qw?.nome || 'tabela').replace(/[^\wÀ-ú -]/g, '')}.csv`);
  });
  ligarVerResultado($('coluna'));
  const alternar = v => { C.proximaExecucao = v; desenhar(); $('entrada').focus(); };
  $('nova-execucao')?.addEventListener('click', () => alternar(!C.proximaExecucao));
  $('cancelar-execucao')?.addEventListener('click', () => alternar(false));
  $('coluna').addEventListener('click', ev => {
    const b = ev.target.closest('[data-fb]'); if (b) darFeedback(b.dataset.fb).catch(e => toast(e.message, 6000));
    if (ev.target.closest('[data-fb-negativo]')) avaliarNegativo();
  });
  // Ações da conversa: o mesmo menu "⋯" da lateral e do histórico.
  if (C.conv) ligarAcoesConversas(document.querySelector('.cabeca'), [C.conv], async c => { if (C === estado && c) { C.conv = c; desenhar(); } },
    { antesDeExcluir: () => (C.enviando ? (toast('Aguarde a resposta terminar antes de excluir.'), false) : true) });

}

function resolverPesquisa() {
  const s = C;
  materialEmRevisao = { conversa: C.conv.id, pessoa: E.eu?.email, texto: $('entrada').value, anexos: [...C.anexos] };
  const d = abrirOrientacaoPesquisa(C.conv.pesquisa, C.conv.id);
  $('conferir-pesquisa').onclick = async () => {
    const status = $('pesquisa-verificacao'), botao = $('conferir-pesquisa');
    botao.disabled = true; status.textContent = 'Conferindo as regras atuais…';
    try {
      const atual = await api(`/api/conversas/${s.conv.id}`);
      if (C !== s) { d.fechar(); return; }
      C.conv.pesquisa = atual.conversa.pesquisa;
      if (C.conv.pesquisa && !C.conv.pesquisa.bloqueada) { d.fechar(); desenhar(); toast('As configurações permitem a pesquisa. Execute novamente; os resultados anteriores não mudam.'); }
      else { d.fechar(); if(C.conv.pesquisa) { resolverPesquisa(); $('pesquisa-verificacao').textContent = 'A pesquisa continua bloqueada. Revise as regras indicadas; nenhuma proteção foi alterada.'; } else { desenhar(); toast('Este Quick Win não prevê pesquisa na internet. Revise o trabalho antes de executar.'); } }
    } catch(e) { status.textContent = `Não foi possível conferir agora. ${e.message} Seu texto foi mantido.`; botao.disabled = false; }
  };
}

// "Dados sigilosos": explica o efeito definitivo num diálogo da plataforma antes de ligar; ligado, só explica.
function explicarSigilo() {
  const s = C;
  if (s.conv?.sigilosa) return dialogo({ titulo: 'Esta conversa é sigilosa', texto: `Nesta conversa, a GreenIA usa só os modelos de IA aprovados para dados sigilosos.${s.conv.motivo_sigilosa ? ` Motivo: ${s.conv.motivo_sigilosa}.` : ''}`,
    conteudo: '<p class="hc-modal-nota">Não dá para desligar: a conversa continua sigilosa até ser apagada, porque o histórico já tem os dados. Para um assunto sem dados sigilosos, comece uma nova conversa.</p>', icone: 'escudo' });
  dialogo({ titulo: 'Marcar como dados sigilosos?', texto: 'Use quando a conversa tiver informação confidencial que a GreenIA não reconheceu sozinha. A partir daí, ela usa só os modelos de IA aprovados para dados sigilosos.',
    conteudo: '<p class="hc-modal-nota"><b>É definitivo: não dá para desligar depois.</b> A conversa continua sigilosa até ser apagada, porque o histórico já tem os dados. A marcação não libera dados que a política da empresa bloqueia.</p>',
    acao: 'Marcar como sigilosa', icone: 'escudo', executar: async () => {
      await garantirConversa();
      const d = await api(`/api/conversas/${s.conv.id}`, { metodo: 'PATCH', corpo: { sigilosa: true } });
      if (C !== s) return;
      C.conv = d.conversa; C.mensagens = d.mensagens;
      await carregarModelos(); desenhar(); recarregarLateral();
    } });
}

async function darFeedback(valor, motivo = null) {
  const s = C;
  const conv = (await api(`/api/conversas/${s.conv.id}`, { metodo: 'PATCH', corpo: { feedback: valor, motivo } })).conversa;
  if (C !== s) return;
  C.conv = conv;
  // Atualiza só os botões (sem redesenhar a conversa): 👍 marcado em "Serviu"; 👎 marcado nos outros dois.
  const neg = document.querySelector('#coluna [data-fb-negativo]'), pos = document.querySelector('#coluna [data-fb="serviu"]');
  pos?.setAttribute('aria-pressed', String(valor === 'serviu'));
  if (neg) {
    const rotulo = valor === 'ajustes' ? 'Serviu com ajustes' : 'Não serviu';
    neg.setAttribute('aria-pressed', String(valor !== 'serviu')); neg.setAttribute('aria-label', rotulo);
    neg.title = valor !== 'serviu' ? `${rotulo} (mudar avaliação)` : 'Não serviu';
  }
  anunciar(`Avaliação registrada: ${FEEDBACK[valor]}. Obrigado pelo retorno.`);
}

// 👎: diálogo curto, como o retorno dos assistentes de chat, com observação opcional nas duas opções.
function avaliarNegativo() {
  const atual = C.conv?.feedback;
  const opcao = (v, rotulo, desc) => `<label class="fb-opcao"><input type="radio" name="fb-valor" value="${v}" ${atual === v ? 'checked' : ''}><span><b>${rotulo}</b><small>${desc}</small></span></label>`;
  dialogo({ titulo: 'Como foi esta resposta?', texto: 'Sua avaliação ajuda a melhorar as próximas respostas.', icone: 'conversa',
    conteudo: `<fieldset class="fb-opcoes"><legend class="sr">Avaliação</legend>${opcao('ajustes', 'Serviu com ajustes', 'Aproveitei, mas precisei corrigir ou completar.')}${opcao('nao_serviu', 'Não serviu', 'Não deu para usar.')}</fieldset>
      <label class="hc-campo fb-motivo">O que faltou ou veio errado? (opcional)<textarea class="entrada" data-motivo rows="3" maxlength="500">${atual && atual !== 'serviu' ? esc(C.conv.feedback_motivo || '') : ''}</textarea></label>`,
    acao: 'Enviar avaliação', executar: async fundo => {
      const valor = fundo.querySelector('[name=fb-valor]:checked')?.value;
      if (!valor) throw new Error('Escolha uma das opções.');
      await darFeedback(valor, fundo.querySelector('[data-motivo]').value.trim() || null);
    } });
  const fundo = [...document.querySelectorAll('.hc-modal-fundo')].at(-1);
  if (!fundo?.querySelector('.fb-opcoes')) return;
  const confirmar = fundo.querySelector('[data-confirmar]'), campo = fundo.querySelector('.fb-motivo');
  const atualizar = () => { const v = fundo.querySelector('[name=fb-valor]:checked')?.value; confirmar.disabled = !v; campo.hidden = !v; };
  fundo.querySelectorAll('[name=fb-valor]').forEach(r => { r.onchange = atualizar; });
  atualizar();
  (fundo.querySelector('[name=fb-valor]:checked') || fundo.querySelector('[name=fb-valor]')).focus();
}

async function garantirConversa() {
  if (C.conv) return;
  C.conv = (await api('/api/conversas', { metodo: 'POST', corpo: { quick_win_id: C.qw?.id, teste: C.teste } })).conversa;
  history.replaceState(null, '', `#/c/${C.conv.id}`);   // não dispara hashchange
}

// Sem feedback numa conversa com resposta: lembrete discreto ao sair.
export function lembreteAoSair() {
  if (C?.qw && C.conv && !C.conv.teste && !C.conv.feedback && C.mensagens.some(m => m.papel === 'assistant')) toast('Esta conversa serviu? Avalie com o polegar ao pé da última resposta quando puder.', 5000);
}

async function enviar(reenvio = null, { executar = false } = {}) {
  if (!reenvio && C.conv?.pesquisa?.bloqueada && pedeLiberacaoPesquisa($('entrada').value)) {
    resolverPesquisa();
    return;
  }
  // "Nova execução" (explícita) vale só para o próximo envio.
  if (C.proximaExecucao) {
    executar = true; C.proximaExecucao = false;
    document.querySelector('.proxima-execucao')?.remove(); $('nova-execucao')?.setAttribute('aria-pressed', 'false');
  }
  const texto = reenvio?.texto ?? $('entrada').value.trim();
  const anexos = reenvio?.anexos ?? C.anexos;
  if (!texto && !anexos.length) return;
  C.enviando = true; atualizarEnviar();
  try { await garantirConversa(); } catch (e) { toast(e.message); C.enviando = false; atualizarEnviar(); return; }
  if (!reenvio) {
    C.mensagens.push({ id: 'eu' + Date.now(), papel: 'user', texto, anexos: anexos.map(a => a.nome) });
    $('entrada').value = ''; C.anexos = []; ajustarAltura(); desenharAnexos();
  }
  C.pensando = true; C.etapa = null; C.execucao = false; C.noFim = true; desenharMensagens();
  // Quick Win 2.0: quem usa não escolhe modelo; o roteamento da GreenIA decide.
  const arquivos = anexos.filter(a => !a.link), links = anexos.filter(a => a.link).map(a => ({ url: a.url, ...(a.papel ? { papel: a.papel } : {}) }));
  const r = await api(`/api/conversas/${C.conv.id}/mensagens`, { metodo: 'POST', corpo: { texto, anexos: arquivos, ...(links.length ? { links } : {}), ...(C.qw?.v2 ? (executar ? { executar_quick_win: true } : {}) : { modelo: C.modelo }) }, bruto: true });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    C.pensando = false;
    if (r.status === 428) {
      // A política mudou: registra ciência e reenvia.
      C.enviando = false;
      await pedirCiencia();
      await new Promise(ok => { const t = setInterval(() => { if (!document.querySelector('#dar-ciencia')) { clearInterval(t); ok(); } }, 300); });
      return enviar({ texto, anexos }, { executar });
    }
    // Bloqueio (sigilo sem recurso autorizado, nada disponível): a conversa pode ter virado sigilosa no servidor.
    if (r.status === 409 || r.status === 503) await recarregarConversa(false).catch(() => {});
    C.mensagens = C.mensagens.filter(m => !(m.papel === 'user' && String(m.id).startsWith('eu') && m.texto === texto));
    if (!reenvio) { $('entrada').value = texto; C.anexos = anexos; desenharAnexos(); ajustarAltura(); }
    C.mensagens.push({ id: 'er' + Date.now(), papel: 'assistant', texto: d.mensagem || 'Não foi possível enviar.', erro: true });
    C.enviando = false; desenharMensagens(); atualizarEnviar();
    return;
  }
  await receberResposta(r);
}

// Resposta em streaming (uma linha JSON por evento), do envio normal e do "Gerar de novo".
// manterErro: a falha continua à vista depois de reler a conversa (ao gerar de novo, a resposta anterior volta).
async function receberResposta(r, { manterErro = false } = {}) {
  const resposta = { id: 'ia' + Date.now(), papel: 'assistant', texto: '', carregando: true };
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas.filter(Boolean)) {
      const ev = JSON.parse(l);
      if (ev.t === 'inicio' && ev.cortada && C.conv) C.conv.cortada = true;
      if (ev.t === 'inicio' && ev.qualidade) C.execucao = true;
      if (ev.t === 'etapa') { C.etapa = ev.v; $('ao-vivo').textContent = ev.v; if (!C.pensando && !C.execucao) desenharMensagens(); }
      if (ev.t === 'texto') {
        if (C.pensando) { C.pensando = false; C.mensagens.push(resposta); }
        resposta.texto += ev.v;
      }
      if (ev.t === 'substituir') resposta.texto = ev.v;   // versão final, depois da conferência de escrita
      if (ev.t === 'erro') { C.pensando = false; if (!C.mensagens.includes(resposta)) C.mensagens.push(resposta); Object.assign(resposta, { texto: ev.mensagem, erro: true, carregando: false }); }
      if (ev.t === 'fim') Object.assign(resposta, { id: ev.id, guardado: ev.guardado, modelo: ev.modelo, classe: ev.classe, fornecedor: ev.fornecedor, fontes: ev.fontes, qualidade: ev.qualidade, artefatos: ev.artefatos, arquivos: ev.arquivos, rota_modo: ev.rota?.modo, rota_explicacao: ev.rota?.explicacao, rota_explicacao_simples: ev.rota?.explicacao_simples, carregando: false });
    }
    // Durante o streaming, atualiza só a bolha da resposta.
    const bolha = resposta.carregando && document.querySelector(`[data-msg="${resposta.id}"] .bolha-ia`);
    if (bolha) { bolha.innerHTML = esc(resposta.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>'; rolarSeNoFim(); } else desenharMensagens();
  }
  C.etapa = null; C.execucao = false;
  $('ao-vivo').textContent = resposta.erro ? resposta.texto : resposta.qualidade ? 'Pronto.' : 'Resposta pronta.';
  C.enviando = false;
  await recarregarConversa(true);
  if (manterErro && resposta.erro && $('coluna')) { C.mensagens.push({ ...resposta, id: 'er' + Date.now() }); desenharMensagens(); }
  recarregarLateral();
}

// "Gerar de novo" (QA UX M13): o servidor refaz a última resposta pelo mesmo caminho do envio (mesmas regras,
// mesmos créditos). A resposta anterior some da tela enquanto a nova é gerada e volta se algo der errado.
async function gerarDeNovo(id, depoisDaCiencia = false) {
  if (C.enviando || !C.conv) return;
  const anterior = C.mensagens.find(m => m.id === id);
  if (!anterior) return;
  C.enviando = true; atualizarEnviar();
  const pos = C.mensagens.indexOf(anterior);
  C.mensagens.splice(pos, 1);
  C.pensando = true; C.etapa = null; C.execucao = false; C.noFim = true; desenharMensagens();
  $('ao-vivo').textContent = 'Gerando outra resposta…';
  const voltar = texto => {
    C.pensando = false;
    if (!C.mensagens.some(m => m.id === anterior.id)) C.mensagens.splice(Math.min(pos, C.mensagens.length), 0, anterior);
    C.mensagens.push({ id: 'er' + Date.now(), papel: 'assistant', texto, erro: true });
    C.enviando = false; desenharMensagens(); atualizarEnviar();
    $('ao-vivo').textContent = texto;
  };
  let r;
  try { r = await api(`/api/conversas/${C.conv.id}/regenerar`, { metodo: 'POST', corpo: { mensagem_id: id, ...(C.qw?.v2 ? {} : { modelo: C.modelo }) }, bruto: true }); }
  catch { return voltar('Não foi possível gerar outra resposta agora. Confira a conexão e tente de novo.'); }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (r.status === 428 && !depoisDaCiencia) {
      // A política mudou: registra ciência e tenta de novo, como no envio.
      C.pensando = false; C.mensagens.splice(pos, 0, anterior); C.enviando = false; desenharMensagens();
      await pedirCiencia();
      await new Promise(ok => { const t = setInterval(() => { if (!document.querySelector('#dar-ciencia')) { clearInterval(t); ok(); } }, 300); });
      return gerarDeNovo(id, true);
    }
    // Bloqueio (sigilo, nada disponível, conversa mudou): relê a conversa (avisos e sigilo) sem perder a resposta.
    if ([409, 503].includes(r.status)) await recarregarConversa(true).catch(() => {});
    return voltar(d.mensagem || 'Não foi possível gerar outra resposta.');
  }
  await receberResposta(r, { manterErro: true });
}

async function recarregarConversa(redesenharTudo) {
  const atual = C;
  let d;
  try { d = await api(`/api/conversas/${atual.conv.id}`); }
  catch (e) { if (e.name === 'AbortError') return; throw e; }
  if (C !== atual || !$('coluna')) return;
  const sigAntes = C.conv.sigilosa;
  C.conv = d.conversa;
  if (redesenharTudo) { C.mensagens = d.mensagens; d.mensagens.forEach(m => vistos.add(String(m.id))); }
  if (sigAntes !== d.conversa.sigilosa) await carregarModelos();
  const noFim = C.noFim;
  desenhar();
  C.noFim = noFim; rolarSeNoFim();
}
