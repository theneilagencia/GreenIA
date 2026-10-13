import { dialogo, ligarAcoesConversas } from '/historico-conversas.js';
import { confirmar } from '/admin-ui.js';
import { detalheExecucao } from '/execucao-detalhe.js';
import { guiaConcluido } from '/onboarding.js';
// Vista de uma conversa (chat geral ou dentro de um quick win).
import { api, esc, ICONE, iconeIA, toast } from '/comum.js';
import { renderizar, baixarCsv } from '/md.js';
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
const FEEDBACK = [['serviu', 'Serviu'], ['ajustes', 'Serviu com ajustes'], ['nao_serviu', 'Não serviu']];
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

function htmlMensagem(m) {
  const anim = vistos.has(String(m.id)) || m.carregando ? '' : ' anim';
  if (!m.carregando) vistos.add(String(m.id));
  if (m.papel === 'user') {
    return `<div class="bolha-eu${anim}">${esc(m.texto)}${(m.anexos || []).length ? `<div>${m.anexos.map(a => `<span class="anexo-chip">${ICONE.doc} ${esc(a)}</span>`).join('')}</div>` : ''}</div>`;
  }
  if (m.papel === 'aviso') return `<div class="linha-aviso${anim}">${esc(m.texto)}</div>`;
  const { html, tabelas } = m.carregando ? { html: esc(m.texto).replace(/\n/g, '<br>') + '<span class="cursor"></span>', tabelas: [] } : renderizar(m.texto, { csvHref: Number.isInteger(m.id) && m.guardado !== false ? i => `/api/conversas/${C.conv.id}/mensagens/${m.id}/tabelas/${i}/csv` : undefined });
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
  return `<div class="resposta${anim}" data-msg="${m.id}">
    <span class="sim"><img src="${iconeIA()}" width="16" height="16" alt="" aria-hidden="true"></span>
    <div class="resposta-corpo">${execucao ? `<span class="rotulo-execucao">${ICONE.raio} Resultado do Quick Win</span>` : ''}${htmlArtefatos(m.artefatos)}${revisar ? qc : ''}<div class="bolha-ia${m.erro ? ' aviso-bolha' : ''}${revisar ? ' oculto' : ''}" id="resultado-${esc(m.id)}">${html}</div>${revisar ? '' : qc}${integracoes}
      ${m.carregando || m.erro ? '' : `<div class="rodape-resposta">${C.qw ? '<span class="revise">Revise antes de usar.</span>' : ''}
        <button type="button" class="btn btn-linha btn-pequeno" data-copiar="${m.id}">Copiar</button>${m.id === C.podeRegerar ? `<button type="button" class="btn btn-linha btn-pequeno" data-regerar="${m.id}" ${C.enviando ? 'disabled' : ''} title="Pede outra resposta ao mesmo pedido. Usa créditos como uma nova mensagem.">Gerar de novo</button>` : ''}${execucao && C.qw?.painel && m.guardado !== false && (!E.permissoes || E.permissoes.includes('chat.use')) ? `<a class="link-sutil" href="#/qw/${C.qw.id}/acompanhamento/resultado/${m.id}">Conferir dados para os resultados</a><a class="link-sutil" href="#/qw/${C.qw.id}/acompanhamento">Acompanhar resultados</a>` : ''}${execucao && C.qw?.v2 && C.qw.podeEditar && C.qw.status !== 'descartado' ? `<a class="link-sutil" href="#/qw/${C.qw.id}/refinar/${C.conv?.id}/${m.id}">Refinar Quick Win</a>` : ''}${E.iaSimulada ? '<span class="selo selo-simulada">Resposta simulada</span>' : ''}${infoResposta(m)}</div>
        ${avaliacao(m)}${fontes}${detalheExecucao(m)}`}
    </div></div>`;
}

// Informação técnica da resposta (nível, motivo da escolha, simulação) recolhida num "i", fora do caminho da leitura.
function infoResposta(m) {
  const nivel = !C.qw?.v2 && (m.modelo || m.classe || m.rota_modo)
    ? (m.rota_modo === 'externo' ? 'Escolha automática do nível.' : `Nível ${esc(CLASSES[m.classe] || 'Rápido')}${m.rota_modo === 'automatico' ? ', pela escolha automática do nível' : ''}.`) : '';
  const motivo = m.rota_explicacao && !C.qw?.v2 ? esc(m.rota_explicacao_simples || m.rota_explicacao) : '';
  const simulada = E.iaSimulada ? 'Ambiente de demonstração: a resposta foi simulada e nenhum modelo de IA real foi usado.' : '';
  if (!nivel && !motivo && !simulada) return '';
  return `<details class="info-resposta"><summary title="Sobre esta resposta"><span aria-hidden="true">i</span><span class="sr">Sobre esta resposta</span></summary><div class="info-resposta-texto">${[nivel, motivo, simulada].filter(Boolean).map(t => `<p>${t}</p>`).join('')}</div></details>`;
}

// Avaliação ao pé da última resposta, em qualquer conversa (menos nos testes de Quick Win).
function avaliacao(m) {
  if (!C.conv || C.conv.teste || m.id !== C.ultimaResposta) return '';
  return `<div class="feedback avaliacao-resposta" role="group" aria-label="Esta resposta serviu?"><span class="dica">Serviu?</span>${FEEDBACK.map(([v, r]) => `<button type="button" data-fb="${v}" aria-pressed="${C.conv.feedback === v}">${r}</button>`).join('')}</div>`;
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
  $('coluna').innerHTML = (vazio ? boasVindas : corte) + C.mensagens.map(htmlMensagem).join('') + (C.pensando ? `<div class="resposta"><span class="sim"><img src="${iconeIA()}" width="16" height="16" alt=""></span>${C.execucao ? progressoExecucao(C.etapa) : '<span class="pensando" aria-label="Pensando"><span></span><span></span><span></span></span>'}</div>` : '');
  atalhosInicio();
  // Artefatos visuais: visualizar, baixar e editar. Uma edição cria nova versão; a conversa é relida do servidor.
  ligarArtefatos($('coluna'), { aoMudar: () => recarregarConversa(false) });
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
    if (cp) { const m = C.mensagens.find(x => String(x.id) === cp.dataset.copiar); navigator.clipboard?.writeText(m.texto).then(() => toast('Resposta copiada.')); }
    const csv = ev.target.closest('[data-csv]');
    if (csv && csv.tagName !== 'A') baixarCsv(C.tabelas[csv.closest('[data-msg]').dataset.msg][Number(csv.dataset.csv)], `${(C.qw?.nome || 'tabela').replace(/[^\wÀ-ú -]/g, '')}.csv`);
  });
  ligarVerResultado($('coluna'));
  const alternar = v => { C.proximaExecucao = v; desenhar(); $('entrada').focus(); };
  $('nova-execucao')?.addEventListener('click', () => alternar(!C.proximaExecucao));
  $('cancelar-execucao')?.addEventListener('click', () => alternar(false));
  $('coluna').addEventListener('click', ev => { const b = ev.target.closest('[data-fb]'); if (b) darFeedback(b.dataset.fb); });
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

async function darFeedback(valor) {
  const s = C;
  const salvar = async motivo => {
    const conv = (await api(`/api/conversas/${s.conv.id}`, { metodo: 'PATCH', corpo: { feedback: valor, motivo } })).conversa;
    if (C !== s) return;
    C.conv = conv;
    document.querySelectorAll('[data-fb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fb === valor)));
    toast('Obrigado pelo retorno.');
  };
  if (valor !== 'nao_serviu') return salvar(null).catch(e => toast(e.message));
  dialogo({ titulo: 'O que não serviu?', texto: 'Se quiser, conte o que faltou ou veio errado. A avaliação ajuda a melhorar as próximas respostas.',
    conteudo: '<label class="hc-campo">Motivo (opcional)<textarea class="entrada" data-motivo rows="3" maxlength="500"></textarea></label>',
    acao: 'Enviar avaliação', executar: fundo => salvar(fundo.querySelector('[data-motivo]').value.trim() || null) });
}

async function garantirConversa() {
  if (C.conv) return;
  C.conv = (await api('/api/conversas', { metodo: 'POST', corpo: { quick_win_id: C.qw?.id, teste: C.teste } })).conversa;
  history.replaceState(null, '', `#/c/${C.conv.id}`);   // não dispara hashchange
}

// Sem feedback numa conversa com resposta: lembrete discreto ao sair.
export function lembreteAoSair() {
  if (C?.qw && C.conv && !C.conv.teste && !C.conv.feedback && C.mensagens.some(m => m.papel === 'assistant')) toast('Esta conversa serviu? Dê seu retorno ao pé da última resposta quando puder.', 5000);
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
      if (ev.t === 'etapa' && C.pensando) { C.etapa = ev.v; $('ao-vivo').textContent = ev.v; }
      if (ev.t === 'texto') {
        if (C.pensando) { C.pensando = false; C.mensagens.push(resposta); }
        resposta.texto += ev.v;
      }
      if (ev.t === 'erro') { C.pensando = false; if (!C.mensagens.includes(resposta)) C.mensagens.push(resposta); Object.assign(resposta, { texto: ev.mensagem, erro: true, carregando: false }); }
      if (ev.t === 'fim') Object.assign(resposta, { id: ev.id, guardado: ev.guardado, modelo: ev.modelo, classe: ev.classe, fornecedor: ev.fornecedor, fontes: ev.fontes, qualidade: ev.qualidade, artefatos: ev.artefatos, rota_modo: ev.rota?.modo, rota_explicacao: ev.rota?.explicacao, rota_explicacao_simples: ev.rota?.explicacao_simples, carregando: false });
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
