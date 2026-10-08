// Quick Wins na tela: ensinar o trabalho à IA (uma etapa por vez), testar como se fosse o uso real, revisar e
// publicar; usar; versões. Nada técnico aparece: sem prompt, modelo, fornecedor, tokens ou JSON. A GreenIA
// sugere; a pessoa confirma. Governança e conferência de qualidade continuam no servidor, iguais.
import { api, esc, ICONE, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara, pode } from '/app.js';
import { vistaConversa } from '/conversa.js';
import { htmlArtefatos, ligarArtefatos } from '/artefatos.js';
import { renderizar, baixarCsv } from '/md.js';
import { aviso, cabecalhoPg, FORMATOS_SAIDA, htmlPorCanal, lerEventos, ligarPorCanal, ligarVerResultado, oQueEnviar, painelIntegracoes, painelQualidade, progressoEtapas, progressoExecucao, separarPorCanal } from '/qw-ui.js';
import { excluirQw } from '/quickwin.js';
import { htmlSistemas, htmlPessoasLimites, guardarPreparacao, ligarPreparacao } from '/qw-preparacao.js';
import { montarFontes } from '/fontes.js';

const $ = id => document.getElementById(id);
let wizardAtual = null;
function pendente(W) {
  if (!W || !document.querySelector('.qw-wizard')) return false;
  guardarEtapa(W);
  return !!W.edicaoPendente && !!W.descricao && assinatura(respostas(W)) !== W.salvo;
}
function estadoRascunho(W, texto) {
  const el = $('estado-rascunho');
  if (el && wizardAtual === W) el.textContent = texto;
}
window.addEventListener('beforeunload', ev => {
  if (pendente(wizardAtual) || wizardAtual?.salvando && document.querySelector('.qw-wizard')) { ev.preventDefault(); ev.returnValue = ''; }
});
document.addEventListener('greenia:antes-navegar', ev => {
  const W = wizardAtual;
  if (!W || !document.querySelector('.qw-wizard')) return;
  if (W.salvando || pendente(W) && !confirm('Há alterações que ainda não foram salvas. Sair sem salvar?')) {
    ev.preventDefault(); history.replaceState(null, '', W.rotaAtiva);
  }
});
const ACEITOS = '.pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.tif,.tiff';
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const ETAPAS = ['Objetivo', 'Processo', 'Regras', 'Resultado', 'Testar'];
const REVISAR = 5, SUCESSO = 6;
const ORDEM_SAIDAS = ['resumo', 'tabela', 'lista', 'relatorio', 'outro'];
const EXEMPLOS = [
  ['analisar um documento', 'Analisar documentos e apontar pontos de atenção, riscos e o que estiver faltando.', 'analisar_documentos'],
  ['comparar propostas', 'Comparar propostas de fornecedores e mostrar, item por item, o que muda em valor, prazo e condições.', 'comparar_documentos'],
  ['preparar um resumo', 'Preparar um resumo curto de documentos longos, com o que pede decisão.', null],
  ['organizar informações', 'Organizar anotações soltas em uma lista de tarefas com responsável e prazo.', 'organizar_informacoes'],
  ['conferir fornecedores', 'Conferir documentos de fornecedores, consultar o cadastro no sistema de fornecedores e preparar atualizações para aprovação.', null],
  ['organizar atendimento', 'Consultar chamados no sistema de atendimento, preparar respostas e atualizar o registro depois de aprovação.', null],
  ['acompanhar compras', 'Comparar propostas, consultar pedidos no ERP e preparar um resumo para o responsável pela compra.', null],
  ['identificar riscos', 'Identificar riscos em contratos e documentos, mostrando de onde veio cada um.', 'analisar_documentos'],
];

export const lerArquivo = f => new Promise((ok, falha) => {
  if (f.size > 25 * 1024 * 1024) return falha(new Error(`${f.name}: acima de 25 MB. Envie uma versão menor ou só a parte necessária.`));
  const r = new FileReader(); r.onload = () => ok({ nome: f.name, base64: String(r.result).split(',')[1], tamanho: f.size }); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(f);
});

// ---- Criar, testar, revisar e publicar (um só fluxo, uma etapa por vez) -------------------------------------
export const testeQw = qw => assistenteQw(qw.id, { passo: 4 });
export const publicarQw = id => assistenteQw(id, { passo: REVISAR });

export async function assistenteQw(id = null, { passo = 0, atualizar = false, refinar = false } = {}) {
  const qw = id ? await api(`/api/quick-wins/${id}`) : null;
  if (qw && (!qw.podeEditar || (!qw.v2 && !atualizar))) return irPara(`#/qw/${id}`);
  // "Atualizar para Quick Win inteligente": o antigo (sem especificação) começa do que ele já descreve.
  const o = qw?.assistente || (atualizar && qw ? { descricao: [qw.para_que_serve, qw.instrucoes].filter(Boolean).join('\n').slice(0, 1000) } : {});
  const W = {
    id, qw, abrirRefinamento: refinar, responsavelId: qw?.responsavel?.id || E.eu.id, controles: qw?.operacao?.controles ? structuredClone(qw.operacao.controles) : null, passo, maximo: passo, editando: !!qw,
    descricao: o.descricao || '', arquetipo: o.arquetipo || null,
    modoProc: o.como?.modo === 'mostrar' ? 'exemplo' : 'explicar', processo: o.como?.modo === 'explicar' ? o.como.texto || '' : '',
    exemplo: '', exemploNome: '', estruturaAnterior: o.exemplo || null, estruturaSugerida: null,
    sugestao: null, regras: o.regras ? new Set(o.regras) : null, proprias: [...(o.regras_proprias || [])], formato: o.formato || null, formatoDescricao: o.formato_descricao || '',
    formatoPessoa: !!o.formato,
    // Colunas da tabela: a estrutura pedida no objetivo (calculada uma vez por objetivo), as colunas atuais e
    // de onde vieram. Definidas pela pessoa, valem até ela mesma trocar.
    // Estruturas por objetivo: cada resposta fica com o objetivo que a originou (nunca com o que está na tela
    // quando ela chega). A que vale é sempre a do objetivo atual.
    estruturas: new Map(o.estrutura_objetivo ? [[o.descricao || '', { ...o.estrutura_objetivo }]] : []), pendentes: new Map(), vez: 0,
    colunas: o.colunas ? [...o.colunas] : null, colunasOrigem: o.colunas_origem || null, colunasDescricao: o.descricao || '',
    salvo: qw ? assinatura({ descricao: o.descricao || '', arquetipo: o.arquetipo || null, como: o.como || {}, regras: o.regras || [], formato: o.formato || null, formato_descricao: o.formato_descricao || '', regras_proprias: o.regras_proprias || [],
      colunas: o.colunas || null, colunas_origem: o.colunas_origem || null, estrutura_objetivo: paraEnvio(o.estrutura_objetivo),
      ...(qw.operacao?.origem === 'pessoa' ? { operacao: qw.operacao } : {}) }) : null,
    teste: { modo: 'auto', texto: '', anexo: null, exemplo: null }, resultado: null, publicado: null,
    // Plano da operação (o que entra, as etapas, o que sai, as ferramentas): o interpretado pela GreenIA ou o
    // ajustado pela pessoa. Um Quick Win antigo (sem plano) recebe a estrutura sugerida só como sugestão: nada muda
    // até a pessoa aceitar.
    operacao: ['pessoa', 'ia'].includes(qw?.operacao?.origem) ? structuredClone(qw.operacao) : null, operacaoPessoa: qw?.operacao?.origem === 'pessoa', catalogo: null, lacunas: [], pesquisaLiberada: false,
    plano: o.interpretacao ? { chave: o.interpretacao.chave, fonte: 'ia', operacao: o.interpretacao.operacao } : null, planoDe: o.interpretacao ? chavePlano(o.descricao || '', o.como?.modo === 'explicar' ? o.como.texto || '' : '') : null,
    legado: !!qw && (atualizar || qw.operacao?.v !== 2), planoAceito: !!qw && qw.operacao?.v === 2, editandoPlano: false, indisponiveis: [],
  };
  const publicada = qw?.versao;
  wizardAtual = W;
  W.rotaAtiva = location.hash;
  if (qw) W.salvo = assinatura(respostas(W));
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg qw-wizard">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], ...(qw ? [[qw.nome, `#/qw/${qw.id}`]] : []), [qw ? 'Editar' : 'Criar']], titulo: qw ? 'Editar Quick Win' : 'Criar Quick Win', descricao: 'Ensine à GreenIA como realizar esse trabalho.',
        lado: qw ? '<button type="button" class="link-sutil link-perigo" id="excluir-qw">Excluir Quick Win</button>' : '' })}
      ${publicada ? aviso(`<b>Versão publicada: v${publicada}.</b> Você está editando a v${publicada + 1}. A equipe continua usando a v${publicada} até você publicar.`) : ''}
      ${atualizar && qw && !qw.v2 ? aviso('<b>Atualizando para Quick Win inteligente.</b> A GreenIA sugere uma estrutura a partir do que este Quick Win já faz. Nada muda para a equipe até você publicar; as conversas e o histórico continuam.') : ''}
      <div id="progresso"></div>
      <div class="rascunho-barra"><span id="estado-rascunho" role="status">${qw ? 'Rascunho carregado' : 'Seu rascunho será salvo ao continuar'}</span><button type="button" class="btn btn-linha btn-pequeno" id="salvar-rascunho">Salvar rascunho</button></div>
      <div id="etapa"></div>
    </div></div>`;
  ligarCabecalho();
  $('salvar-rascunho').onclick = async e => {
    guardarEtapa(W);
    if (!W.descricao) return erroEtapa('Descreva o objetivo antes de salvar.');
    e.target.disabled = true;
    try { await salvar(W); } catch (err) { erroEtapa(err.message); }
    finally { if (e.target.isConnected) e.target.disabled = false; }
  };
  const marcarEdicao = () => { W.edicaoPendente = true; W.revisaoEdicao = (W.revisaoEdicao || 0) + 1; estadoRascunho(W, 'Alterações ainda não salvas · continue ou salve o rascunho'); };
  $('etapa').addEventListener('input', ev => { if (!ev.target.closest('#fontes-qw')) marcarEdicao(); });
  $('etapa').addEventListener('change', ev => { if (!ev.target.closest('#fontes-qw')) marcarEdicao(); });
  $('etapa').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b && !b.closest('#fontes-qw') && !b.matches('[data-continuar],[data-voltar],[data-ir-etapa],[data-ir-teste]')) marcarEdicao();
  });
  $('excluir-qw')?.addEventListener('click', () => excluirQw(W.qw).catch(e => toast(e.message, 6000)));
  ligarVerResultado($('etapa'));
  await desenhar(W, { foco: false });
  if (W.passo === 0) $('objetivo')?.focus();
}

const assinatura = a => JSON.stringify(a);
const chavePlano = (descricao, processo) => `${descricao}\n${processo}`;
// Vários entregáveis (seções ou peças próprias) ou um só de formato simples (o contrato daquele formato).
const FORMATO_TIPO = { resumo: 'resumo', lista: 'lista', tabela: 'tabela', relatorio: 'relatorio' };
export const multipla = op => !!op?.entregaveis?.length && (op.entregaveis.length > 1 || op.entregaveis.some(e => e.canal || !FORMATO_TIPO[e.tipo]));
const formatoDoPlano = op => (op?.entregaveis?.length === 1 && !multipla(op) ? FORMATO_TIPO[op.entregaveis[0].tipo] : null);
const rotuloEnt = (W, e) => `${e.canal ? `${W.catalogo?.canais.find(c => c.id === e.canal)?.rotulo || e.canal} · ` : ''}${e.rotulo || (e.tipo === 'outro' && e.config?.detalhe) || W.catalogo?.entregaveis.find(t => t.id === e.tipo)?.rotulo || e.tipo}`;

// Interpretação do pedido: o plano da operação, uma vez por pedido (objetivo + como faz hoje). A resposta é do
// pedido que a originou; se a pessoa mudou o pedido enquanto ela vinha, não vale.
async function interpretarPlano(W) {
  const proc = W.modoProc === 'explicar' ? W.processo.trim() : '';
  const chave = chavePlano(W.descricao, proc);
  if (!W.descricao || (W.plano && W.planoDe === chave)) return W.plano;
  let r;
  try { r = await api('/api/quick-wins/assistente/interpretar', { metodo: 'POST', corpo: { descricao: W.descricao, processo: proc, ...(W.id ? { quick_win_id: W.id } : {}) } }); }
  catch (e) { if (e.status === 422) throw e; r = { fonte: 'heuristica', operacao: null, lacunas: [] }; }
  if (chavePlano(W.descricao, W.modoProc === 'explicar' ? W.processo.trim() : '') !== chave) return interpretarPlano(W);
  W.plano = r; W.planoDe = chave; W.lacunas = r.lacunas || []; W.pesquisaLiberada = !!r.pesquisaLiberada; W.indisponiveis = r.ferramentasIndisponiveis || []; W.integracoes = r.integracoes || [];
  // O plano novo vale se a pessoa não ajustou o dela; num Quick Win antigo, fica como sugestão até ela aceitar.
  if (!W.operacaoPessoa && !(W.legado && !W.planoAceito) && r.operacao) { W.operacao = structuredClone(r.operacao); W.planoAceito = true; aplicarFormato(W); }
  return W.plano;
}
function aplicarFormato(W) {
  if (W.formatoPessoa) return;
  if (multipla(W.operacao)) W.formato = 'outro';
  else if (formatoDoPlano(W.operacao)) W.formato = formatoDoPlano(W.operacao);
}
// Regra própria: texto curto, sem repetir outra. O servidor aplica os mesmos limites.
const MAX_PROPRIAS = 5;
function adicionarPropria(W, texto) {
  const t = String(texto).replace(/\s+/g, ' ').trim().slice(0, 160);
  const igual = x => x.toLowerCase() === t.toLowerCase();
  if (t.length < 3 || W.proprias.some(igual) || W.proprias.length >= MAX_PROPRIAS) return;
  W.proprias.push(t);
}
function respostas(W) {
  const como = W.modoProc === 'exemplo'
    ? (W.exemplo || W.estruturaAnterior ? { modo: 'mostrar', exemplo: W.exemplo } : { modo: 'pronto' })
    : W.processo.trim() ? { modo: 'explicar', texto: W.processo.trim() } : { modo: 'pronto' };
  return { responsavel_id: W.responsavelId, descricao: W.descricao, arquetipo: W.arquetipo, como, regras: [...(W.regras || [])], formato: W.formato, formato_descricao: W.formato === 'outro' ? W.formatoDescricao : '', regras_proprias: [...W.proprias],
    colunas: W.formato === 'tabela' && W.colunas ? W.colunas.filter(Boolean) : null, colunas_origem: W.formato === 'tabela' ? W.colunasOrigem : null, estrutura_objetivo: estruturaAtual(W),
    ...(W.operacaoPessoa || (W.operacao && W.planoAceito) ? { operacao: { ...W.operacao, ...(W.controles ? { controles: W.controles } : {}) } } : {}),
    ...(W.plano?.fonte === 'ia' && W.plano.chave ? { interpretacao: { chave: W.plano.chave, operacao: W.plano.operacao } } : {}) };
}
const paraEnvio = e => (e ? { chave: e.chave, colunas: e.colunas || [], falhou: !!e.falhou } : null);
const estruturaDoObjetivo = W => W.estruturas.get(W.descricao) || null;
const estruturaAtual = W => { const e = estruturaDoObjetivo(W); return e?.chave ? paraEnvio(e) : null; };

// Estrutura pedida no objetivo: uma chamada só quando o objetivo é novo ou mudou (voltar, avançar e reabrir a
// etapa Resultado não chamam de novo). Falhou: a pessoa define as colunas; nada é inventado.
async function estruturar(W) {
  const desc = W.descricao;   // o objetivo enviado: a resposta é dele, qualquer que seja o objetivo quando ela voltar
  if (!desc || W.estruturas.has(desc)) return;
  if (!W.pendentes.has(desc)) W.pendentes.set(desc, (async () => {
    let r;
    try { r = await api('/api/quick-wins/assistente/estrutura', { metodo: 'POST', corpo: { descricao: desc, ...(W.id ? { quick_win_id: W.id } : {}) } }); }
    catch { r = { chave: null, colunas: [], falhou: true }; }
    W.estruturas.set(desc, { chave: r.chave, colunas: r.colunas || [], falhou: !!r.falhou });
    W.pendentes.delete(desc);
  })());
  await W.pendentes.get(desc);
}
const mesmas = (a, b) => a.length === b.length && a.every((x, i) => x.toLowerCase() === String(b[i]).toLowerCase());
function definirColunas(W, s) {
  const exemplo = s.exemplo?.colunas?.length ? s.exemplo.colunas : W.modoProc === 'exemplo' && !W.exemplo ? W.estruturaAnterior?.colunas || [] : [];
  const doObjetivo = (estruturaDoObjetivo(W)?.colunas || []).map(c => c.nome);
  W.novaSugestao = null;
  if (W.colunasOrigem === 'pessoa') {
    // A decisão da pessoa vale. Se o objetivo mudou depois dela, a nova estrutura vira só uma sugestão.
    if (W.colunasDescricao !== W.descricao && doObjetivo.length && !exemplo.length && !mesmas(doObjetivo, W.colunas || [])) W.novaSugestao = doObjetivo;
    return;
  }
  if (exemplo.length) [W.colunas, W.colunasOrigem] = [[...exemplo], 'exemplo'];
  else if (doObjetivo.length) [W.colunas, W.colunasOrigem] = [doObjetivo, 'objetivo'];
  else if (estruturaDoObjetivo(W)?.falhou) [W.colunas, W.colunasOrigem] = [[], 'livre'];
  else [W.colunas, W.colunasOrigem] = [[...(s.colunasSugeridas || [])], 'sugestao'];
}
const marcarPessoa = W => { W.colunasOrigem = 'pessoa'; W.colunasDescricao = W.descricao; W.novaSugestao = null; };
const ORIGEM_COLUNAS = {
  objetivo: 'Pelo que você escreveu no objetivo. Ajuste se precisar.',
  exemplo: 'Do exemplo que você mostrou.',
  sugestao: 'Sugestão para esse tipo de trabalho. Ajuste como preferir.',
  pessoa: 'Do jeito que você definiu.',
};
function htmlColunas(W) {
  const c = W.colunas || [];
  const origem = W.colunasOrigem === 'livre' || (!c.length && estruturaDoObjetivo(W)?.falhou && W.colunasOrigem !== 'pessoa')
    ? 'Não conseguimos sugerir a estrutura agora. Você pode defini-la abaixo.'
    : !c.length ? 'Sem colunas definidas: a GreenIA monta as que o pedido pedir.' : ORIGEM_COLUNAS[W.colunasOrigem] || '';
  return `<div id="colunas-bloco" class="bloco-extra colunas ${W.formato === 'tabela' ? '' : 'oculto'}">
      <p class="legenda" id="colunas-titulo">O que deve aparecer em cada linha?</p>
      <p class="dica" id="colunas-origem">${esc(origem)}</p>
      ${W.novaSugestao ? aviso(`O objetivo mudou. Pelo novo objetivo: <b>${esc(W.novaSugestao.join(', '))}</b>.`, 'info',
        '<button type="button" class="btn btn-linha btn-pequeno" id="usar-sugestao-colunas">Usar estas colunas</button><button type="button" class="link-sutil" id="manter-colunas">Manter as minhas</button>') : ''}
      <ol class="colunas-lista" aria-labelledby="colunas-titulo">${c.map((nome, i) => `<li>
        <label class="sr" for="coluna-${i}">Coluna ${i + 1}</label><input class="entrada" id="coluna-${i}" data-coluna="${i}" maxlength="40" value="${esc(nome)}">
        <button type="button" class="btn-icone" data-subir="${i}" aria-label="Subir a coluna ${esc(nome || i + 1)}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn-icone" data-descer="${i}" aria-label="Descer a coluna ${esc(nome || i + 1)}" ${i === c.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="link-sutil" data-remover-coluna="${i}" aria-label="Remover a coluna ${esc(nome || i + 1)}">Remover</button></li>`).join('')}</ol>
      ${c.length >= 8 ? '<p class="dica">Até 8 colunas.</p>' : '<button type="button" class="link-sutil" id="adicionar-coluna">+ Adicionar coluna</button>'}
    </div>`;
}

async function desenhar(W, { foco = true } = {}) {
  $('progresso').innerHTML = W.passo === SUCESSO ? '' : progressoEtapas(ETAPAS, Math.min(W.passo, 5), { concluidas: W.passo >= REVISAR ? 5 : Math.max(W.maximo, W.editando ? 4 : 0) });
  $('progresso').querySelectorAll('[data-ir-etapa]').forEach(b => { b.onclick = () => irEtapa(W, Number(b.dataset.irEtapa)); });
  const el = $('etapa');
  // Cada desenho tem a sua vez: se a pessoa já foi para outra etapa enquanto este carregava (uma resposta que
  // demorou), ele não desenha, não liga eventos, não navega e não pega o foco.
  const vez = ++W.vez, passo = W.passo;
  el.innerHTML = '<p class="dica">Carregando…</p>';
  let html;
  try { html = await ETAPA_HTML[passo](W); }
  catch (e) { if (vez === W.vez) el.innerHTML = aviso(esc(e.message), 'erro'); return; }
  if (vez !== W.vez || passo !== W.passo) return;
  el.innerHTML = `<div class="etapa-foco">${html}</div>`;
  ETAPA_LIGAR[W.passo]?.(W);
  if (W.abrirRefinamento && $('refinar-qw')) {
    W.abrirRefinamento = false;
    $('refinar-qw').open = true;
    requestAnimationFrame(() => { $('refinamento-texto')?.focus(); $('refinar-qw')?.scrollIntoView({ block: 'center' }); });
  }
  ligarPreparacao(W, { salvar: async () => { guardarEtapa(W); await salvar(W); }, redesenhar: async () => { guardarEtapa(W); await desenhar(W, { foco: false }); } });
  el.querySelector('[data-voltar]')?.addEventListener('click', () => irEtapa(W, W.passo - 1));
  if (W.passo !== REVISAR) el.querySelector('[data-continuar]')?.addEventListener('click', () => continuar(W));
  if (foco) { $('pergunta')?.focus(); window.scrollTo?.({ top: 0 }); }
}
async function irEtapa(W, n) {
  if (W.salvando) return;
  if (!guardarEtapa(W)) return;
  W.passo = Math.max(0, n);
  W.maximo = Math.max(W.maximo, W.passo);
  await desenhar(W);
}
function erroEtapa(msg) {
  const e = $('erro-etapa');
  if (!e) return toast(msg, 6000);
  e.innerHTML = aviso(esc(msg), 'erro');
}

// Guarda o que está na tela da etapa atual (voltar e avançar nunca perdem o que a pessoa escreveu).
function guardarEtapa(W) {
  guardarPreparacao(W);
  const mudou = (campo, valor) => { if (W[campo] !== valor) { W[campo] = valor; W.sugestao = null; } };
  if (W.passo === 0 && $('objetivo')) mudou('descricao', $('objetivo').value.trim());
  if (W.passo === 1) {
    guardarPlano(W);
    if ($('processo')) mudou('processo', $('processo').value);
    if ($('exemplo')) mudou('exemplo', $('exemplo').value.trim());
  }
  if (W.passo === 2 && document.querySelector('input[name=regra]')) W.regras = new Set(['nao_inventar', ...[...document.querySelectorAll('input[name=regra]:checked')].map(i => i.value)]);
  if (W.passo === 2 && $('nova-regra-texto')?.value.trim()) adicionarPropria(W, $('nova-regra-texto').value);   // escrita e não adicionada: não se perde
  if (W.passo === 3) {
    W.formato = document.querySelector('input[name=saida]:checked')?.value || W.formato;
    const campos = [...document.querySelectorAll('[data-coluna]')].map(i => i.value.trim());
    if (document.querySelector('[data-coluna]') && !mesmas(campos, W.colunas || [])) { W.colunas = campos; marcarPessoa(W); }
    if ($('formato-descricao')) W.formatoDescricao = $('formato-descricao').value.trim();
    if ($('entregas')) guardarEntregas(W);
  }
  if (W.passo === 4 && $('teste-texto')) W.teste.texto = $('teste-texto').value;
  return true;
}

async function continuar(W) {
  if (W.salvando) return;
  guardarEtapa(W);
  if (W.passo === 0) {
    if (!W.descricao) return erroEtapa('Conte com suas palavras o que a IA deve fazer.');
  }
  if (W.passo <= 3) {
    const botao = document.querySelector('[data-continuar]');
    botao.disabled = true; botao.textContent = 'Salvando…';
    try { await salvar(W); } catch (e) { botao.disabled = false; botao.textContent = 'Continuar'; return erroEtapa(e.message); }
  }
  W.passo++;
  W.maximo = Math.max(W.maximo, W.passo);
  await desenhar(W);
}

async function sugerir(W) {
  const est = estruturaAtual(W);
  if (W.sugestao && W.sugestaoChave === (est?.chave ?? null)) return W.sugestao;
  const r = respostas(W), desc = W.descricao;
  const s = await api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: desc, arquetipo: W.arquetipo, como: { modo: r.como.modo, texto: r.como.texto, exemplo: r.como.exemplo }, estrutura: est,
    ...(W.operacao && (W.operacaoPessoa || W.planoAceito) ? { operacao: W.operacao } : {}) } });
  if (W.descricao !== desc) return sugerir(W);   // o objetivo mudou enquanto a sugestão vinha: ela não vale para o atual
  W.sugestao = s;
  W.catalogo = s.catalogo; W.lacunas = s.lacunas || []; W.pesquisaLiberada = !!s.pesquisaLiberada;
  if (!W.operacaoPessoa && !W.planoAceito) W.operacao = s.operacao ? structuredClone(s.operacao) : null;
  aplicarFormato(W);
  W.sugestaoChave = est?.chave ?? null;
  const sugeridas = W.sugestao.regras.map(x => x.id);
  // Mantém as escolhas anteriores que continuam valendo; "não inventar" sempre.
  W.regras = W.regras ? new Set(['nao_inventar', ...[...W.regras].filter(x => sugeridas.includes(x))]) : new Set(W.sugestao.regras.filter(x => x.marcada).map(x => x.id));
  if (W.regras.size <= 1) W.sugestao.regras.forEach(x => x.marcada && W.regras.add(x.id));
  if ((!W.formato || !W.formatoPessoa || (W.modoProc === 'exemplo' && W.exemplo)) && !multipla(W.operacao) && !formatoDoPlano(W.operacao)) W.formato = W.sugestao.formato.sugerido;
  return W.sugestao;
}

// Salva (cria ou ajusta o rascunho) só quando algo mudou. O rascunho nunca muda a versão publicada.
async function salvar(W) {
  if (W.salvando) return W.salvando;
  W.salvando = salvarAgora(W);
  try { await W.salvando; }
  catch (e) { estadoRascunho(W, 'Não foi possível salvar · suas alterações continuam nesta tela'); throw e; }
  finally { W.salvando = null; }
}
async function salvarAgora(W) {
  const revisao = W.revisaoEdicao || 0;
  const a = respostas(W), ass = assinatura(a);
  if (W.id && W.salvo === ass) { W.edicaoPendente = false; estadoRascunho(W, 'Rascunho salvo'); return; }
  estadoRascunho(W, 'Salvando rascunho…');
  if (W.id) W.qw = await api(`/api/quick-wins/${W.id}`, { metodo: 'PUT', corpo: { assistente: a, responsavel_id: W.responsavelId } });
  else {
    const areas = E.permQw.areas.slice(0, 1).map(x => x.id);
    W.qw = await api('/api/quick-wins', { metodo: 'POST', corpo: { assistente: a, responsavel_id: W.responsavelId, areas, toda_empresa: !areas.length && E.permQw.todaEmpresa } });
    W.id = W.qw.id;
    history.replaceState(null, '', `#/qw/${W.id}/ajustar`);
    W.rotaAtiva = location.hash;
    await recarregarLateral();
  }
  W.salvo = ass;
  if ((W.revisaoEdicao || 0) === revisao) W.edicaoPendente = false;
  estadoRascunho(W, W.edicaoPendente ? 'Há novas alterações ainda não salvas' : 'Rascunho salvo · a versão publicada não muda');
  W.resultado = null;   // o trabalho mudou: o teste anterior não vale mais para esta versão
  W.teste.exemplo = null;   // e o exemplo pronto é refeito para o trabalho novo
}

const rodape = (W, { voltar = true, continuar = 'Continuar', extra = '' } = {}) => `<div id="erro-etapa" class="msg-etapa"></div><div class="etapa-rodape">
    ${voltar && W.passo > 0 ? '<button type="button" class="btn btn-texto" data-voltar>Voltar</button>' : '<a class="btn btn-texto" href="#/quick-wins">Cancelar</a>'}
    <div class="direita">${extra}${continuar ? `<button type="button" class="btn btn-verde" data-continuar>${continuar}</button>` : ''}</div></div>`;
const pergunta = (texto, micro, idMicro = 'micro') => `<h3 class="pergunta" id="pergunta" tabindex="-1">${texto}</h3>${micro ? `<p class="micro" id="${idMicro}">${micro}</p>` : ''}`;

const ETAPA_HTML = [
  // 1. Objetivo
  W => `${pergunta('O que você quer que a IA faça?', 'Descreva o trabalho como explicaria para alguém da sua equipe.', 'micro-objetivo')}
    <label class="sr" for="objetivo">O que a IA deve fazer</label>
    <textarea class="campo-amplo" id="objetivo" maxlength="1000" aria-describedby="micro-objetivo" placeholder="Ex.: Analisar propostas comerciais e apontar valores, prazos, riscos e o que estiver faltando">${esc(W.descricao)}</textarea>
    <p class="exemplos">Exemplos: ${EXEMPLOS.map(([t], i) => `<button type="button" data-exemplo="${i}">${esc(t)}</button>`).join('<span class="ponto-sep" aria-hidden="true">·</span>')}</p>
    ${rodape(W)}`,
  // 2. Processo (com o entendimento do trabalho: o plano que a GreenIA montou do pedido)
  async W => { await interpretarPlano(W); await sugerir(W); if (W.passo !== 1) return ''; return `${htmlPlano(W)}${await htmlSistemas(W)}${pergunta('O que normalmente precisa ser considerado para fazer isso bem?', W.modoProc === 'exemplo'
      ? 'Mostre um resultado que você considera bom. A GreenIA aprende a estrutura, o nível de detalhe e o tom. O exemplo em si não é guardado.'
      : 'Conte o que precisa ser analisado, conferido ou considerado. Não precisa ser completo.', 'micro-processo')}
    ${W.modoProc === 'exemplo' ? `
      <label class="sr" for="exemplo">Exemplo de um bom resultado</label>
      <textarea class="campo-amplo" id="exemplo" maxlength="8000" aria-describedby="micro-processo" placeholder="Cole aqui um resultado bom (uma tabela, uma lista, um relatório)">${esc(W.exemplo)}</textarea>
      <div class="arquivo-escolhido bloco-extra"><button type="button" class="btn btn-linha btn-pequeno" id="ex-arquivo">${ICONE.clipe} Enviar um arquivo de exemplo</button>
        <input type="file" id="ex-input" hidden accept="${ACEITOS}"><span class="dica" id="ex-nome">${esc(W.exemploNome || (W.estruturaAnterior && !W.exemplo ? 'Um exemplo já foi analisado. Envie outro se quiser trocar.' : ''))}</span></div>
      <p class="bloco-extra"><button type="button" class="link-sutil" id="modo-explicar">Prefiro explicar com minhas palavras</button></p>`
    : `
      <label class="sr" for="processo">O que precisa ser considerado</label>
      <textarea class="campo-amplo menor" id="processo" maxlength="3000" aria-describedby="micro-processo" placeholder="Ex.: Confiro valor, prazo de entrega e multa. Vejo se falta assinatura. Anoto o que precisa de decisão.">${esc(W.processo)}</textarea>
      <p class="dica bloco-extra">Se deixar em branco, a GreenIA segue uma estrutura sugerida para esse tipo de trabalho.</p>
      <p class="exemplos"><button type="button" id="sugerir-estrutura">Ver a estrutura sugerida</button><span class="ponto-sep" aria-hidden="true">·</span><button type="button" id="modo-exemplo">Prefiro mostrar um exemplo de resultado</button></p>
      <div id="estrutura">${W.estruturaSugerida ? htmlEstrutura(W.estruturaSugerida) : ''}</div>`}
    ${rodape(W)}`; },
  // 3. Regras
  async W => {
    const s = await sugerir(W);
    return `${pergunta('O que a IA não pode ignorar?', 'Estas regras valem em todas as execuções. Sugerimos as mais importantes para esse trabalho; desmarque o que não fizer sentido.')}
      <ul class="regras-lista">${s.regras.map(r => `<li><label class="${r.travada ? 'travada' : ''}"><input type="checkbox" name="regra" value="${esc(r.id)}" ${r.travada || W.regras.has(r.id) ? 'checked' : ''} ${r.travada ? 'disabled' : ''}>
        <span>${esc(r.rotulo)}</span>${r.travada ? '<span class="tag">Sempre ativa</span>' : ''}</label></li>`).join('')}
        ${W.proprias.map((t, i) => `<li class="regra-propria"><span class="regra-marca" aria-hidden="true">${ICONE.check}</span><span>${esc(t)}</span>
          <button type="button" class="link-sutil" data-remover-regra="${i}" aria-label="Remover a regra: ${esc(t)}">Remover</button></li>`).join('')}</ul>
      ${await htmlPessoasLimites(W)}
      ${W.proprias.length >= MAX_PROPRIAS ? `<p class="dica bloco-extra">Você já adicionou ${MAX_PROPRIAS} regras suas.</p>`
        : `<div class="nova-regra"><button type="button" class="link-sutil" id="adicionar-regra" aria-expanded="false" aria-controls="nova-regra">+ Adicionar regra</button>
        <div class="nova-regra-campo oculto" id="nova-regra"><label class="sr" for="nova-regra-texto">Nova regra</label>
          <input class="entrada" id="nova-regra-texto" maxlength="160" placeholder="Ex.: Destacar documentos vencidos">
          <button type="button" class="btn btn-linha btn-pequeno" id="confirmar-regra">Adicionar</button></div></div>`}
      ${rodape(W)}`;
  },
  // 4. Resultado
  async W => {
    await estruturar(W);
    const s = await sugerir(W);
    if (W.passo !== 3) return '';   // a pessoa saiu da etapa: nada muda nas colunas por causa desta resposta
    definirColunas(W, s);
    const sug = s.formato.sugerido;
    const porCanal = multipla(W.operacao);
    return `${pergunta('Como você quer receber a resposta?', '')}
      ${porCanal ? htmlEntregas(W) : ''}
      <div class="${porCanal ? 'oculto' : ''}" id="formato-unico">
      <p class="saida-motivo"><b>Sugestão da GreenIA:</b> ${esc(s.formato.motivo)}</p>
      <fieldset class="saidas"><legend class="sr">Formato do resultado</legend>
        ${ORDEM_SAIDAS.map(id => `<label class="saida"><input type="radio" name="saida" value="${id}" ${W.formato === id ? 'checked' : ''}>
          <span class="marcado" aria-hidden="true">${ICONE.check}</span>
          <span class="previa ${id}" aria-hidden="true">${'<i></i>'.repeat(id === 'tabela' ? 9 : id === 'outro' ? 1 : 4)}</span>
          <b>${esc(FORMATOS_SAIDA[id].rotulo)}${id === sug ? '<span class="sug">Sugerido</span>' : ''}</b><span class="desc">${esc(FORMATOS_SAIDA[id].desc)}</span></label>`).join('')}
      </fieldset>
      <div id="saida-outro" class="bloco-extra ${W.formato === 'outro' ? '' : 'oculto'}"><label class="legenda" for="formato-descricao">Como o resultado deve vir?</label>
        <input class="entrada" id="formato-descricao" maxlength="200" value="${esc(W.formatoDescricao || s.formato.descricao || '')}" placeholder="Ex.: mensagem pronta para enviar ao cliente, com o que conferir antes"></div>
      ${htmlColunas(W)}
      <p class="exemplos"><button type="button" id="por-canal">Entregar mais de um resultado (seções, peças ou canais)</button></p>
      </div>
      <div id="fontes-qw"></div>
      ${rodape(W)}`;
  },
  // 5. Testar (também é a tela de teste de um Quick Win já criado)
  async W => {
    // Exemplo pronto: contextual e fictício, feito para este Quick Win (ou a orientação de enviar arquivo ou completar).
    if (W.teste.modo === 'auto' && !W.teste.exemplo && W.id) {
      try { W.teste.exemplo = await api(`/api/quick-wins/${W.id}/exemplo-teste`, { metodo: 'POST', corpo: {} }); }
      catch { W.teste.exemplo = { modo: 'insuficiente', mensagem: 'Este Quick Win ainda não tem contexto suficiente para gerar um exemplo automático. Complete as informações acima, cole um texto ou envie um arquivo.' }; }
    }
    const ex = W.teste.exemplo;
    const r = W.resultado;
    const pronto = r && !r.erro && !r.rodando;
    const pausado = pronto && r.qualidade?.status === 'pergunta';
    // Lacuna necessária sem resposta: o teste pode rodar, mas a GreenIA avisa antes (e vai perguntar na hora).
    const faltando = (W.lacunas || []).filter(l => l.obrigatoria && !(W.operacao?.contexto_respostas || []).some(x => x.id === l.id && x.resposta));
    return `${pergunta('Vamos testar antes de colocar em uso', 'O teste roda o Quick Win completo, com a conferência de qualidade. Nada fica disponível para a equipe ainda.', 'micro-teste')}
      ${faltando.length ? aviso(`<b>Falta uma informação para este trabalho:</b> ${faltando.map(l => esc(l.pergunta)).join(' ')}`, 'info', '<button type="button" class="btn btn-linha btn-pequeno" id="responder-lacunas">Responder agora</button>') : ''}
      <div class="segmento-sutil" role="group" aria-label="Material do teste">
        ${[['auto', 'Exemplo pronto'], ['colar', 'Colar um texto'], ['arquivo', 'Enviar um arquivo']].map(([v, t]) => `<button type="button" data-material="${v}" aria-pressed="${W.teste.modo === v}">${t}</button>`).join('')}</div>
      <div id="teste-corpo">${W.teste.modo === 'auto' ? (ex?.modo === 'texto' ? `<pre class="previa-texto" aria-label="Material fictício do teste">${esc(ex.texto)}</pre><p class="dica bloco-extra">${esc(ex.aviso)}</p>`
          : aviso(esc(ex?.mensagem || ''), 'info', `${ex?.modo === 'arquivo' ? '' : '<button type="button" class="btn btn-linha btn-pequeno" data-material="colar">Colar um texto</button>'}<button type="button" class="btn btn-linha btn-pequeno" data-material="arquivo">Enviar um arquivo</button>`))
        : W.teste.modo === 'colar' ? `<label class="sr" for="teste-texto">Texto do teste</label><textarea class="campo-amplo menor" id="teste-texto" placeholder="Cole um trecho do seu dia a dia">${esc(W.teste.texto)}</textarea>`
        : `<div class="arquivo-escolhido"><button type="button" class="btn btn-linha" id="teste-arquivo">${ICONE.clipe} Escolher arquivo</button><input type="file" id="teste-input" hidden accept="${ACEITOS}"><span class="dica" id="teste-nome">${esc(W.teste.anexo?.nome || 'PDF, Word, planilha ou imagem com texto')}</span></div>`}</div>
      <div id="teste-resultado">${r ? htmlResultado(W) : ''}</div>
      ${W.id && !r?.rodando ? htmlRefinamento(W) : ''}
      ${rodape(W, { continuar: pronto ? (['inconsistente', 'pergunta'].includes(r.qualidade?.status) ? '' : 'Revisar e publicar') : '',
        extra: pronto ? `${r.qualidade?.status === 'inconsistente' ? '<button type="button" class="btn btn-linha" data-revisar-assim>Revisar mesmo assim</button><button type="button" class="btn btn-verde" data-ajustar>Ajustar Quick Win</button>' : '<button type="button" class="btn btn-texto" data-ajustar>Ajustar Quick Win</button>'}${pausado ? '' : '<button type="button" class="btn btn-linha" data-testar>Testar novamente</button>'}`
          : `<button type="button" class="btn btn-verde" data-testar ${r?.rodando || (W.teste.modo === 'auto' && ex?.modo !== 'texto') ? 'disabled' : ''}>${r?.rodando ? 'Testando…' : 'Testar agora'}</button>` })}`;
  },
  // 6. Revisar e publicar
  async W => {
    if (!W.qw) throw new Error('Crie o Quick Win antes de publicar.');
    const q = await api(`/api/quick-wins/${W.id}`), a = q.assistente || {}, areas = E.permQw.areas;
    W.qw = q;
    const teste = q.ultimo_teste || null;
    const considera = a.como?.modo === 'explicar' && a.como.texto ? esc(a.como.texto.length > 220 ? `${a.como.texto.slice(0, 220)}…` : a.como.texto)
      : a.como?.modo === 'mostrar' ? 'A estrutura do exemplo que você mostrou.' : 'A estrutura sugerida para esse tipo de trabalho.';
    return `${pergunta('Revise e publique', 'Confira o que a equipe vai usar. Você pode ajustar depois; cada publicação vira uma nova versão.')}
      <ul class="resumo-pub" aria-label="Este Quick Win vai">
        <li><span class="r">Nome</span><div><div class="editavel" id="nome-ver"><span class="valor" id="nome-atual">${esc(q.nome)}</span><button type="button" class="link-sutil" id="editar-nome">Editar</button></div>
          <div class="oculto" id="nome-edicao"><label class="sr" for="nome">Nome do Quick Win</label><input class="entrada" id="nome" maxlength="80" value="${esc(q.nome)}"></div></div></li>
        <li><span class="r">Faz</span><div><div class="editavel" id="desc-ver"><span id="desc-atual">${esc(q.para_que_serve)}</span><button type="button" class="link-sutil" id="editar-desc">Editar</button></div>
          <div class="oculto" id="desc-edicao"><label class="sr" for="desc">O que o Quick Win faz</label><textarea class="entrada" id="desc" rows="2" maxlength="200">${esc(q.para_que_serve)}</textarea></div></div></li>
        <li><span class="r">Acompanha</span><div>${esc(q.responsavel?.nome || 'Responsável ainda não definido')}</div></li>
        ${q.operacao?.integracoes?.length ? `<li><span class="r">Sistemas</span><div>${q.operacao.integracoes.map(n => `${esc(n.sistema || 'Sistema da empresa')}: ${esc(n.acao)}`).join('<br>')}<p class="dica">${q.operacao.controles?.modo === 'preparar' ? 'Prepara o resultado sem acessar sistemas.' : q.operacao.controles?.modo === 'consultar' ? 'Somente consultas, sem alterações.' : 'Alterações sujeitas às regras e à aprovação.'} ${q.operacao.controles ? `Até ${q.operacao.controles.max_acoes} ações externas e ${q.operacao.controles.max_registros} itens por ação.` : ''}</p></div></li>` : ''}
        <li><span class="r">Considera</span><div>${considera}</div></li>
        <li><span class="r">Respeita</span><ul>${(q.regras_rascunho || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></li>
        <li><span class="r">Entrega</span><div>${esc(FORMATOS_SAIDA[a.formato]?.rotulo || '')}${a.formato === 'outro' && a.formato_descricao ? ` · ${esc(a.formato_descricao)}` : ''}${a.formato === 'tabela' && a.colunas?.length ? ` · ${esc(a.colunas.join(', '))}` : ''}</div></li>
        <li><span class="r">Teste</span><div>${teste ? (painelQualidade(teste, { id: 'revisao' }) || '<span class="dica">A IA pediu mais informação no último teste.</span>') : '<span class="dica">Ainda não testado.</span> <button type="button" class="link-sutil" data-ir-teste>Testar agora</button>'}${htmlRefinamento(W)}</div></li>
        ${areas.length > 1 || E.permQw.todaEmpresa ? `<li><span class="r">Quem usa</span><div class="opcoes">${areas.map(x => `<label><input type="checkbox" name="area" value="${x.id}" ${q.areas.includes(x.id) ? 'checked' : ''}> ${esc(x.nome)}</label>`).join('')}
          ${E.permQw.todaEmpresa ? `<label><input type="checkbox" id="toda" ${q.toda_empresa ? 'checked' : ''}> Toda a empresa</label>` : ''}</div></li>` : ''}
      </ul>
      ${rodape(W, { continuar: 'Publicar Quick Win' })}`;
  },
  // 7. Publicado
  W => `<div class="sucesso" role="status"><span class="sucesso-icone" aria-hidden="true">${ICONE.check}</span>
      <h2 id="pergunta" tabindex="-1">Quick Win publicado</h2>
      <p>Agora ele está disponível para sua equipe. Versão atual: v${W.publicado.versao}.</p>
      <div class="linha-botoes"><a class="btn btn-verde btn-grande" href="#/qw/${W.id}/usar">Usar agora</a><a class="btn btn-linha btn-grande" href="#/quick-wins">Voltar para Quick Wins</a></div></div>`,
];

// ---- Entendimento do trabalho (o plano da operação) ---------------------------------------------------------
// "Entendi que este Quick Win vai fazer": objetivo, o que precisa, como faz, o que entrega e o que usa. A pessoa
// confirma, ajusta (entradas e etapas aqui; entregáveis na etapa Resultado), responde o que falta e escolhe as
// sugestões. Num Quick Win antigo, a estrutura aparece como sugestão: só vale se a pessoa usar.
function htmlPlano(W) {
  const sugerido = W.legado && !W.planoAceito;
  const op = sugerido ? W.plano?.operacao : W.operacao;
  if (!op) return '';
  const cat = W.catalogo || { entradas: [], ferramentas: [], entregaveis: [], canais: [] };
  const rotuloF = f => cat.ferramentas.find(x => x.id === f)?.rotulo || f;
  const entregas = op.entregaveis?.length ? op.entregaveis.map(e => rotuloEnt(W, e)) : [FORMATOS_SAIDA[W.formato || W.sugestao?.formato?.sugerido]?.rotulo || 'Resultado no formato combinado'];
  const respostas = new Map((op.contexto_respostas || []).map(r => [r.id, r.resposta]));
  // Perguntas: as do plano (respondidas continuam visíveis, com a resposta) e as de comunicação que faltarem.
  const lacunas = sugerido ? [] : [...(op.lacunas || []), ...(W.lacunas || []).filter(l => !(op.lacunas || []).some(x => x.id === l.id))];
  const editar = W.editandoPlano && !sugerido;
  const precisa = op.entradas?.length ? op.entradas.map((x, i) => editar ? `<li class="plano-entrada">
      <select class="entrada" data-x-tipo="${i}" aria-label="Tipo do material ${i + 1}">${cat.entradas.map(t => `<option value="${esc(t.id)}" ${t.id === x.tipo ? 'selected' : ''}>${esc(t.rotulo)}</option>`).join('')}</select>
      <input class="entrada" data-x-rotulo="${i}" maxlength="80" value="${esc(x.rotulo)}" aria-label="Descrição do material ${i + 1}">
      <span class="cfg-grupo"><input class="entrada cfg" type="number" min="1" max="10" data-x-qtd="${i}" value="${esc(x.quantidade || 1)}" aria-label="Quantidade do material ${i + 1}"><span class="dica" aria-hidden="true">un.</span></span>
      <label class="dica"><input type="checkbox" data-x-obrig="${i}" ${x.obrigatoria ? 'checked' : ''}> obrigatório</label>
      <button type="button" class="link-sutil" data-x-remover="${i}" aria-label="Remover o material ${i + 1}">Remover</button></li>`
    : `<li>${esc(x.rotulo)}${x.quantidade > 1 ? ` (${x.quantidade})` : ''}${x.obrigatoria ? '' : ' <span class="dica">(opcional)</span>'}</li>`).join('') : '<li class="dica">Nenhum material: só o pedido do dia.</li>';
  return `<section class="plano" id="plano" aria-labelledby="plano-titulo">
    <h4 id="plano-titulo">${sugerido ? 'Sugestão: a GreenIA estruturaria este Quick Win assim' : 'Entendi que este Quick Win vai fazer:'}</h4>
    <dl class="plano-lista">
      <div><dt>Objetivo</dt><dd>${esc(op.resumo || W.descricao)}</dd></div>
      <div><dt>Vai precisar de</dt><dd><ul>${precisa}${op.contexto_empresa ? '<li>Contexto da empresa (documentos autorizados)</li>' : ''}</ul>
        ${editar ? '<button type="button" class="link-sutil" id="x-adicionar">+ Adicionar material</button>' : ''}</dd></div>
      <div><dt>Vai fazer</dt><dd>${editar ? `<label class="sr" for="plano-etapas">Etapas, uma por linha</label><textarea class="campo-amplo menor" id="plano-etapas">${esc((op.etapas || []).map(x => x.texto).join('\n'))}</textarea><p class="dica">Uma etapa por linha.</p>`
        : `<ol>${(op.etapas || []).map(x => `<li>${esc(x.texto)}</li>`).join('') || '<li class="dica">Do jeito que o trabalho pedir.</li>'}</ol>`}</dd></div>
      <div><dt>Vai entregar</dt><dd><ul>${entregas.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${sugerido ? '' : '<button type="button" class="link-sutil" id="plano-entregas">Ajustar o que vai entregar</button>'}</dd></div>
      <div><dt>Vai usar</dt><dd><ul>${(op.ferramentas || []).map(f => { const ind = W.indisponiveis.find(x => x.id === f); return `<li>${esc(rotuloF(f))}${ind ? ` <span class="dica">(não disponível: entrega ${esc(ind.alternativa)})</span>` : f === 'pesquisa_web' && !W.pesquisaLiberada ? ' <span class="dica">(ainda não liberada pela empresa: o resultado sai parcial)</span>' : ''}</li>`; }).join('') || '<li>IA da GreenIA</li>'}</ul></dd></div>
    </dl>
    ${lacunas.length ? `<div class="lacunas" id="plano-lacunas"><p class="legenda">Para o resultado não sair genérico</p>${lacunas.map(l => `<div><label for="lacuna-${esc(l.id)}">${esc(l.pergunta)}${l.obrigatoria ? ' <span class="tag">Necessário</span>' : ''}</label>
      <input class="entrada" id="lacuna-${esc(l.id)}" data-lacuna="${esc(l.id)}" data-pergunta="${esc(l.pergunta)}" maxlength="600" value="${esc(respostas.get(l.id) || '')}" placeholder="${esc(l.exemplo || '')}"></div>`).join('')}
      <p class="dica">Sem a resposta, a GreenIA usa o que estiver nos documentos da empresa ou pergunta na hora.</p></div>` : ''}
    ${!sugerido && op.sugestoes?.length ? `<div class="plano-sugestoes"><p class="legenda">Sugestões da GreenIA (só entram se você quiser)</p><ul>${op.sugestoes.map((x, i) => `<li><span>${esc(x.texto)}</span><button type="button" class="btn btn-linha btn-pequeno" data-sugestao="${i}">Incluir</button></li>`).join('')}</ul></div>` : ''}
    <div class="plano-acoes">${sugerido ? '<button type="button" class="btn btn-verde btn-pequeno" id="plano-usar">Usar esta estrutura</button><span class="dica">Ou siga sem mudar: o Quick Win continua como está.</span>'
      : `<button type="button" class="btn btn-linha btn-pequeno" id="plano-ok" aria-pressed="${!!W.planoConfirmado}">${W.planoConfirmado ? 'Confirmado' : 'Está certo'}</button><button type="button" class="link-sutil" id="plano-editar">${editar ? 'Concluir edição' : 'Editar'}</button>`}</div>
  </section>`;
}
// Integration Builder (só com o recurso ligado): o que o trabalho precisa fazer em sistemas fora da GreenIA.
// Guarda as escolhas do plano sem perder os dados do trabalho.
function guardarPlano(W) {
  if (!W.operacao || !$('plano')) return;
  const op = structuredClone(W.operacao);
  const lac = [...document.querySelectorAll('#plano [data-lacuna]')];
  if (lac.length) {
    const outras = (op.contexto_respostas || []).filter(r => !lac.some(i => i.dataset.lacuna === r.id));
    op.contexto_respostas = [...outras, ...lac.map(i => ({ id: i.dataset.lacuna, pergunta: i.dataset.pergunta, resposta: i.value.trim() })).filter(r => r.resposta)];
  }
  if (document.querySelector('[data-x-tipo]')) op.entradas = op.entradas.map((x, i) => ({ ...x, tipo: document.querySelector(`[data-x-tipo="${i}"]`).value, rotulo: document.querySelector(`[data-x-rotulo="${i}"]`).value.trim() || x.rotulo,
    quantidade: Number(document.querySelector(`[data-x-qtd="${i}"]`).value) || 1, obrigatoria: document.querySelector(`[data-x-obrig="${i}"]`).checked }));
  if ($('plano-etapas')) op.etapas = $('plano-etapas').value.split('\n').map(t => t.trim()).filter(t => t.length >= 3).slice(0, 10).map((texto, i) => ({ ...(op.etapas?.[i] || {}), id: `p${i + 1}`, texto }));
  if (JSON.stringify(op) !== JSON.stringify(W.operacao)) { W.operacao = { ...op, origem: 'pessoa' }; W.operacaoPessoa = true; }
}
function ligarPlano(W) {
  const redesenhar = foco => { guardarEtapa(W); desenhar(W, { foco: false }).then(() => (typeof foco === 'function' ? foco() : $(foco))?.focus()); };
  $('plano-ok')?.addEventListener('click', () => { W.planoConfirmado = true; W.editandoPlano = false; redesenhar('plano-ok'); });
  $('plano-editar')?.addEventListener('click', () => { W.editandoPlano = !W.editandoPlano; redesenhar(W.editandoPlano ? () => document.querySelector('[data-x-rotulo]') || $('plano-etapas') : 'plano-editar'); });
  $('plano-entregas')?.addEventListener('click', () => irEtapa(W, 3));
  $('plano-usar')?.addEventListener('click', () => { W.operacao = { ...structuredClone(W.plano.operacao), origem: 'pessoa' }; W.operacaoPessoa = true; W.planoAceito = true; W.formatoPessoa = false; aplicarFormato(W); W.sugestao = null; redesenhar('plano-ok'); });
  $('x-adicionar')?.addEventListener('click', () => { guardarEtapa(W); W.operacao = { ...W.operacao, origem: 'pessoa', entradas: [...(W.operacao.entradas || []), { id: '', tipo: 'documento', rotulo: 'Documento', quantidade: 1, obrigatoria: true }] }; W.operacaoPessoa = true;
    desenhar(W, { foco: false }).then(() => document.querySelector(`[data-x-rotulo="${W.operacao.entradas.length - 1}"]`)?.focus()); });
  document.querySelectorAll('[data-x-remover]').forEach(b => { b.onclick = () => { guardarEtapa(W); W.operacao = { ...W.operacao, origem: 'pessoa', entradas: W.operacao.entradas.filter((_, i) => i !== Number(b.dataset.xRemover)) }; W.operacaoPessoa = true; desenhar(W, { foco: false }).then(() => $('x-adicionar')?.focus()); }; });
  document.querySelectorAll('[data-sugestao]').forEach(b => { b.onclick = () => {
    guardarEtapa(W);
    const op = structuredClone(W.operacao), [x] = op.sugestoes.splice(Number(b.dataset.sugestao), 1);
    if (x.entregavel) {
      // Um resultado só (formato simples) que ganha outro entregável: o atual vira o primeiro da lista.
      if (!op.entregaveis.length) op.entregaveis.push({ id: 'e1', tipo: FORMATO_TIPO[W.formato] ? W.formato : 'resumo', canal: null, config: {} });
      op.entregaveis.push({ id: '', tipo: x.entregavel.tipo, canal: null, config: {}, ...(x.entregavel.rotulo ? { rotulo: x.entregavel.rotulo } : {}) });
    } else op.criterios = [...(op.criterios || []), x.texto].slice(0, 6);
    W.operacao = { ...op, origem: 'pessoa' }; W.operacaoPessoa = true; W.formatoPessoa = false; aplicarFormato(W); W.sugestao = null;
    desenhar(W, { foco: false }).then(() => (document.querySelector('[data-sugestao]') || $('plano-ok'))?.focus());
  }; });
}

// ---- Entregáveis (etapa Resultado) --------------------------------------------------------------------------
// O que o Quick Win entrega: os entregáveis (cada um com título próprio, tipo, configuração e, só em conteúdo, um
// canal), a pesquisa na internet e os canais. Vale para qualquer trabalho. A GreenIA sugere pelo plano; qualquer
// ajuste vira a decisão da pessoa. As perguntas de contexto ficam no entendimento do trabalho (etapa Processo).
const PECA_DO_CANAL = { linkedin: 'copy', instagram: 'legenda', facebook: 'copy', tiktok: 'roteiro', youtube: 'roteiro', x: 'copy', blog: 'texto', email: 'texto' };
const TAMANHOS = [['', 'Padrão'], ['curto', 'Curto'], ['medio', 'Médio'], ['longo', 'Longo']];
function htmlEntregas(W) {
  const op = W.operacao, cat = W.catalogo || { canais: [], entregaveis: [], ferramentas: [] };
  const tipo = id => cat.entregaveis.find(e => e.id === id) || { config: {} };
  const cfg = (e, i) => {
    const t = tipo(e.tipo).config;
    if (e.tipo === 'outro') return `<input class="entrada" data-e-detalhe="${i}" maxlength="160" value="${esc(e.config?.detalhe || '')}" placeholder="O que entregar" aria-label="O que entregar na peça ${i + 1}">`;
    if (t.slides !== undefined) return `<span class="cfg-grupo"><input class="entrada cfg" type="number" min="2" max="20" data-e-slides="${i}" value="${esc(e.config?.slides ?? t.slides)}" aria-label="Quantidade de slides da peça ${i + 1}"><span class="dica" aria-hidden="true">slides</span></span>`;
    if (t.duracao !== undefined) return `<span class="cfg-grupo"><input class="entrada cfg" type="number" min="10" max="600" step="5" data-e-duracao="${i}" value="${esc(e.config?.duracao ?? t.duracao)}" aria-label="Duração em segundos da peça ${i + 1}"><span class="dica" aria-hidden="true">seg</span></span>`;
    return `<select class="entrada cfg" data-e-tamanho="${i}" aria-label="Tamanho da peça ${i + 1}">${TAMANHOS.map(([v, r]) => `<option value="${v}" ${(e.config?.tamanho || '') === v ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
  };
  return `<section class="entregas" id="entregas" aria-labelledby="entregas-titulo">
    <h4 id="entregas-titulo">O que este Quick Win entrega</h4>
    <p class="dica">A GreenIA separou o trabalho em entregáveis. Cada um sai com título próprio${op.canais.length ? ' e, no conteúdo, adaptado ao canal' : ''}. Ajuste o que quiser.</p>
    <details class="canais-detalhe" ${op.canais.length ? 'open' : ''}><summary>Canais (opcional, para conteúdo)</summary>
      <fieldset><legend class="sr">Canais</legend><div class="canais-opcoes">${cat.canais.map(c => `<label><input type="checkbox" name="canal" value="${esc(c.id)}" ${op.canais.includes(c.id) ? 'checked' : ''}> ${esc(c.rotulo)}</label>`).join('')}</div></fieldset></details>
    <p class="legenda" id="pecas-titulo">Entregáveis</p>
    <ol class="entregaveis-lista ${op.canais.length ? '' : 'sem-canal'}" aria-labelledby="pecas-titulo">${op.entregaveis.map((e, i) => `<li>
      <input class="entrada" data-e-rotulo="${i}" maxlength="60" value="${esc(e.rotulo || '')}" placeholder="${esc(tipo(e.tipo).rotulo || 'Título')}" aria-label="Título do entregável ${i + 1}">
      <select class="entrada" data-e-tipo="${i}" aria-label="Tipo da peça ${i + 1}">${cat.entregaveis.map(t => `<option value="${esc(t.id)}" ${t.id === e.tipo ? 'selected' : ''}>${esc(t.rotulo)}${t.visual && !/briefing/i.test(t.rotulo) ? ' (briefing)' : ''}</option>`).join('')}</select>
      ${op.canais.length ? `<select class="entrada" data-e-canal="${i}" aria-label="Canal da peça ${i + 1}"><option value="">Sem canal</option>${cat.canais.map(c => `<option value="${esc(c.id)}" ${c.id === e.canal ? 'selected' : ''}>${esc(c.rotulo)}</option>`).join('')}</select>` : ''}
      ${cfg(e, i)}
      <button type="button" class="link-sutil" data-e-remover="${i}" aria-label="Remover a peça ${i + 1}">Remover</button></li>`).join('')}</ol>
    ${op.entregaveis.length < 10 ? '<button type="button" class="link-sutil" id="add-entregavel">+ Adicionar entregável</button>' : ''}
    ${op.entregaveis.some(e => tipo(e.tipo).visual) ? '<p class="dica">Imagem (briefing), carrossel, Reels e vídeo saem como briefing para quem produz. Para a peça pronta, use "Imagem final".</p>' : ''}
    <label class="ferramenta"><input type="checkbox" id="pesquisa-web" ${op.ferramentas.includes('pesquisa_web') ? 'checked' : ''}>
      <span><b>Pesquisar na internet antes de escrever</b><br><span class="dica">${W.pesquisaLiberada ? 'Usa fontes reais e mostra de onde veio cada tema. Não roda com informação sigilosa.'
        : 'A empresa ainda não liberou a pesquisa na internet (quem administra libera em Configurações). Até lá, o resultado sai parcial, sem temas confirmados como atuais.'}</span></span></label>
    <p class="exemplos"><button type="button" id="formato-unico-btn">Prefiro um resultado só (texto, lista, tabela...)</button></p>
  </section>`;
}
function guardarEntregas(W) {
  const op = W.operacao || { canais: [], entregaveis: [], ferramentas: [], contexto_respostas: [] };
  const n = v => (v === '' || v == null ? undefined : Number(v));
  const entregaveis = op.entregaveis.map((e, i) => {
    const tipo = document.querySelector(`[data-e-tipo="${i}"]`)?.value || e.tipo;
    const config = {};
    const sl = n(document.querySelector(`[data-e-slides="${i}"]`)?.value), du = n(document.querySelector(`[data-e-duracao="${i}"]`)?.value);
    const ta = document.querySelector(`[data-e-tamanho="${i}"]`)?.value, de = document.querySelector(`[data-e-detalhe="${i}"]`)?.value.trim();
    if (tipo === e.tipo) { if (sl) config.slides = sl; if (du) config.duracao = du; if (ta) config.tamanho = ta; if (de) config.detalhe = de; if (e.config?.colunas) config.colunas = e.config.colunas; }
    const rotulo = document.querySelector(`[data-e-rotulo="${i}"]`)?.value.trim();
    const { rotulo: _r, ...resto } = e;
    return { ...resto, ...(rotulo ? { rotulo } : {}), tipo, canal: document.querySelector(`[data-e-canal="${i}"]`)?.value || null, config };
  });
  const novo = { ...op, canais: [...document.querySelectorAll('input[name=canal]:checked')].map(i => i.value), entregaveis,
    ferramentas: $('pesquisa-web')?.checked ? ['pesquisa_web'] : [],
    contexto_respostas: op.contexto_respostas || [] };
  if (JSON.stringify(novo) !== JSON.stringify(op)) { W.operacao = { ...novo, origem: 'pessoa' }; W.operacaoPessoa = true; }
}
function ligarEntregas(W) {
  const mudar = (fn, foco) => { guardarEtapa(W); fn(W.operacao); W.operacaoPessoa = true; desenhar(W, { foco: false }).then(() => (typeof foco === 'function' ? foco() : $(foco))?.focus()); };
  document.querySelectorAll('input[name=canal]').forEach(c => { c.onchange = () => mudar(op => {
    if (!c.checked) op.entregaveis = op.entregaveis.filter(e => e.canal !== c.value);
    else if (!op.entregaveis.some(e => e.canal === c.value)) op.entregaveis.push({ id: '', tipo: PECA_DO_CANAL[c.value] || 'texto', canal: c.value, config: {} });
  }, () => document.querySelector(`input[name=canal][value="${c.value}"]`)); });
  document.querySelectorAll('[data-e-tipo]').forEach(sel => { sel.onchange = () => mudar(() => {}, () => document.querySelector(`[data-e-tipo="${sel.dataset.eTipo}"]`)); });
  document.querySelectorAll('[data-e-remover]').forEach(b => { b.onclick = () => mudar(op => { op.entregaveis.splice(Number(b.dataset.eRemover), 1); }, 'add-entregavel'); });
  $('add-entregavel')?.addEventListener('click', () => mudar(op => { op.entregaveis.push({ id: '', tipo: 'texto', canal: op.canais[0] || null, config: {} }); },
    () => document.querySelector(`[data-e-tipo="${W.operacao.entregaveis.length - 1}"]`)));
  $('formato-unico-btn')?.addEventListener('click', () => {
    guardarEtapa(W);
    // Um resultado só: os entregáveis saem; o resto do plano (material, etapas, ferramentas, respostas) continua.
    W.operacao = { ...(W.operacao || {}), canais: [], entregaveis: [], ferramentas: (W.operacao?.ferramentas || []), contexto_respostas: W.operacao?.contexto_respostas || [], origem: 'pessoa' };
    W.operacaoPessoa = true; W.formatoPessoa = true;
    const sug = W.sugestao?.formato?.sugerido;
    W.formato = sug && sug !== 'outro' ? sug : 'resumo';
    desenhar(W, { foco: false }).then(() => document.querySelector('input[name=saida]:checked')?.focus());
  });
  $('por-canal')?.addEventListener('click', () => {
    guardarEtapa(W);
    // Mais de um resultado: o formato atual vira o primeiro entregável e a pessoa acrescenta os demais (com canal,
    // se for conteúdo).
    const primeiro = { id: '', tipo: FORMATO_TIPO[W.formato] || 'resumo', canal: null, config: {} };
    W.operacao = { ...(W.operacao || {}), canais: [], entregaveis: [primeiro, { id: '', tipo: 'lista', rotulo: 'Pontos de atenção', canal: null, config: {} }], ferramentas: W.operacao?.ferramentas || [], contexto_respostas: W.operacao?.contexto_respostas || [], origem: 'pessoa' };
    W.operacaoPessoa = true; W.formato = 'outro'; W.formatoPessoa = true;
    desenhar(W, { foco: false }).then(() => document.querySelector('[data-e-rotulo]')?.focus());
  });
}

const htmlEstrutura = passos => `<div class="estrutura"><p>A GreenIA seguiria estes passos:</p><ol>${passos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
  <button type="button" class="btn btn-linha btn-pequeno" id="usar-estrutura">Usar estes passos e ajustar</button></div>`;

function htmlRefinamento(W) {
  return `<details class="editor bloco-extra" id="refinar-qw"><summary>Refinar Quick Win</summary>
    <p>O resultado não ficou como você esperava? Acrescente uma orientação ou escolha o que precisa ajustar.</p>
    <label class="legenda" for="refinamento-texto">O que deve mudar no próximo resultado?</label>
    <textarea class="entrada" id="refinamento-texto" maxlength="160" rows="3" placeholder="Ex.: Começar com uma recomendação e explicar os riscos antes da conclusão.">${esc(W.refinamentoTexto || '')}</textarea>
    <p class="dica">Até 160 caracteres. A orientação será adicionada às regras deste Quick Win. Para mudanças maiores, use as opções abaixo.</p>
    <p class="msg-erro" id="refinamento-erro" role="alert"></p>
    <button type="button" class="btn btn-linha" id="salvar-refinamento">Salvar orientação no rascunho</button>
    <div class="linha-botoes bloco-extra">${[['Objetivo',0],['Processo e sistemas',1],['Regras e limites',2],['Formato e fontes',3]].map(([t,n]) => `<button type="button" class="btn btn-texto" data-refinar-etapa="${n}">${t}</button>`).join('')}</div>
    <p class="dica">Depois de salvar, teste novamente e confira o resultado antes de publicar. A versão usada pela equipe só muda quando você publicar.</p></details>`;
}
function ligarRefinamento(W) {
  $('refinamento-texto')?.addEventListener('input', ev => { W.refinamentoTexto = ev.target.value; });
  document.querySelectorAll('[data-refinar-etapa]').forEach(b => { b.onclick = () => irEtapa(W, Number(b.dataset.refinarEtapa)); });
  $('salvar-refinamento')?.addEventListener('click', async ev => {
    const texto = String(W.refinamentoTexto || '').trim().replace(/\s+/g, ' '), erro = $('refinamento-erro');
    if (texto.length < 3) { erro.textContent = 'Descreva o que precisa mudar antes de salvar.'; $('refinamento-texto').focus(); return; }
    if (texto.length > 160) { erro.textContent = 'Use até 160 caracteres ou ajuste o processo nas opções abaixo.'; return; }
    const existe = W.proprias.some(t => t.toLowerCase() === texto.toLowerCase());
    if (!existe && W.proprias.length >= MAX_PROPRIAS) { erro.textContent = 'As cinco regras próprias já estão preenchidas. Abra Regras e limites para revisar uma delas.'; return; }
    if (!guardarEtapa(W)) return;
    if (!existe) W.proprias.push(texto);
    W.edicaoPendente = true;
    const exemplo = W.teste.exemplo, b = ev.currentTarget;
    b.disabled = true;
    try {
      await salvar(W);
      W.teste.exemplo = exemplo; // repetir o mesmo caso permite comparar o resultado
      W.refinamentoTexto = '';
      W.passo = 4;
      await desenhar(W);
      toast('Orientação salva no rascunho. Teste novamente para conferir o resultado.');
    } catch (e) { if (erro.isConnected) erro.textContent = e.message || 'Não foi possível salvar. Sua orientação continua aqui.'; }
    finally { if (b.isConnected) b.disabled = false; }
  });
}

function htmlResultado(W) {
  const r = W.resultado;
  if (r.rodando) return `<div class="resultado">${progressoExecucao(r.etapa)}</div>`;
  if (r.erro) return `<div class="resultado">${aviso(esc(r.erro), 'erro')}</div>`;
  const q = r.qualidade, revisar = q?.status === 'inconsistente';
  // Entrega por canal: um grupo por canal e um cartão por peça, com as fontes da pesquisa à parte.
  const sep = r.sep, conteudo = sep ? htmlPorCanal(sep, renderizar, r.fontes) : r.html;
  const corpo = `${htmlArtefatos(r.artefatos)}<div class="resultado-corpo ${sep ? '' : 'bolha-ia'} ${revisar ? 'oculto' : ''}" id="resultado-teste">${conteudo}</div>`;
  // A execução pausou para pedir contexto: a pessoa responde aqui e a mesma execução continua.
  const responder = q?.status === 'pergunta' ? `<div class="responder-continuar"><label class="legenda" for="responder-texto">Sua resposta</label>
      <textarea class="campo-amplo menor" id="responder-texto" placeholder="Responda à pergunta acima para a GreenIA continuar"></textarea>
      <div><button type="button" class="btn btn-verde" data-responder>Responder e continuar</button></div></div>` : '';
  return `<section class="resultado" aria-label="Resultado do teste">
    <div class="resultado-cabeca"><b>${q?.status === 'pergunta' ? 'A GreenIA precisa de uma informação' : 'Resultado do teste'}</b>${r.conversa ? `<a class="link-sutil" href="#/c/${r.conversa}">Continuar como conversa</a>` : ''}</div>
    ${revisar ? `${painelQualidade(q, { id: 'teste' })}<div style="margin-top:12px">${corpo}</div>` : `${corpo}${painelQualidade(q, { id: 'teste' })}${painelIntegracoes(q?.integracoes)}`}${responder}</section>`;
}

// Executa o teste aqui mesmo: conversa de teste (fora da medição), execução explícita, etapas e conferência.
async function testar(W) {
  guardarEtapa(W);
  if (W.teste.modo === 'auto' && W.teste.exemplo?.modo !== 'texto') return erroEtapa(W.teste.exemplo?.mensagem || 'Cole um texto ou envie um arquivo para o teste.');
  const texto = W.teste.modo === 'auto' ? W.teste.exemplo.texto : W.teste.modo === 'colar' ? W.teste.texto.trim() : 'Faça o trabalho com o arquivo anexado.';
  if (W.teste.modo === 'colar' && !texto) return erroEtapa('Cole um texto para o teste ou use o exemplo pronto.');
  if (W.teste.modo === 'arquivo' && !W.teste.anexo) return erroEtapa('Escolha um arquivo para o teste ou use o exemplo pronto.');
  await rodarTeste(W, null, { texto, anexos: W.teste.modo === 'arquivo' ? [W.teste.anexo] : [], executar_quick_win: true });
}
// Responder e continuar: a resposta vai para a mesma conversa e a execução pausada continua (com a conferência).
async function responderEContinuar(W) {
  const texto = $('responder-texto')?.value.trim();
  if (!texto) return $('responder-texto')?.focus();
  await rodarTeste(W, W.resultado.conversa, { texto });
}
async function rodarTeste(W, conversa, corpo) {
  W.resultado = { rodando: true, etapa: null, conversa };
  await desenhar(W, { foco: false });
  try {
    const conv = conversa ? { id: conversa } : (await api('/api/conversas', { metodo: 'POST', corpo: { quick_win_id: W.id, teste: true } })).conversa;
    const r = await api(`/api/conversas/${conv.id}/mensagens`, { metodo: 'POST', corpo, bruto: true });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).mensagem || 'Não foi possível testar agora.');
    let saida = '', fim = null, falha = null;
    await lerEventos(r, ev => {
      if (ev.t === 'etapa') { W.resultado.etapa = ev.v; const t = $('teste-resultado'); if (t) t.innerHTML = htmlResultado(W); }
      if (ev.t === 'texto') saida += ev.v;
      if (ev.t === 'fim') fim = ev;
      if (ev.t === 'erro') falha = ev.mensagem;
    });
    if (falha) throw new Error(falha);
    const { html, tabelas } = renderizar(saida);
    W.resultado = { html, tabelas, saida, mensagem: fim?.id, guardado: fim?.guardado, sep: separarPorCanal(saida, { porSecao: multipla(W.operacao) }), fontes: fim?.fontes || [], qualidade: fim?.qualidade || null, conversa: conv.id, artefatos: fim?.artefatos || [] };
    W.qw = await api(`/api/quick-wins/${W.id}`);
  } catch (e) { W.resultado = { erro: e.message }; }
  await desenhar(W, { foco: false });
  $('teste-resultado')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
}
// Artefatos do teste: uma edição troca o cartão pela nova versão; um artefato derivado entra na lista.
function ligarArtefatosDoTeste(W) {
  const raiz = $('teste-resultado');
  if (!raiz || !W.resultado?.artefatos?.length) return;
  ligarArtefatos(raiz, { aoMudar: async novo => {
    const lista = W.resultado.artefatos, i = lista.findIndex(x => x.base_id === novo.base_id);
    if (i >= 0) lista[i] = novo; else lista.push(novo);
    await desenhar(W, { foco: false });
  } });
}

async function publicar(W) {
  const corpo = { nome: $('nome').value.trim() || W.qw.nome, para_que_serve: $('desc').value.trim() || W.qw.para_que_serve };
  if (document.querySelector('input[name=area]') || $('toda')) { corpo.areas = [...document.querySelectorAll('input[name=area]:checked')].map(i => Number(i.value)); corpo.toda_empresa = $('toda')?.checked || false; }
  const b = document.querySelector('[data-continuar]');
  b.disabled = true; b.textContent = 'Publicando…';
  try {
    W.publicado = await api(`/api/quick-wins/${W.id}/publicar`, { metodo: 'POST', corpo });
    W.qw = W.publicado;
    await recarregarLateral();
    W.passo = SUCESSO;
    await desenhar(W);
  } catch (e) { b.disabled = false; b.textContent = 'Publicar Quick Win'; erroEtapa(e.message); }
}

const ETAPA_LIGAR = [
  W => {
    document.querySelectorAll('[data-exemplo]').forEach(b => { b.onclick = () => {
      const [, texto, arq] = EXEMPLOS[Number(b.dataset.exemplo)];
      $('objetivo').value = texto; W.arquetipo = arq; W.descricao = texto; W.sugestao = null; $('objetivo').focus();
    }; });
    $('objetivo').addEventListener('input', () => { W.arquetipo = null; });
    $('objetivo').addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) continuar(W); });
  },
  W => {
    ligarPlano(W);
    const trocar = modo => { guardarEtapa(W); W.modoProc = modo; W.sugestao = null; desenhar(W, { foco: false }).then(() => $(modo === 'exemplo' ? 'exemplo' : 'processo')?.focus()); };
    $('modo-exemplo')?.addEventListener('click', () => trocar('exemplo'));
    $('modo-explicar')?.addEventListener('click', () => trocar('explicar'));
    $('sugerir-estrutura')?.addEventListener('click', async () => {
      try {
        guardarEtapa(W);
        const s = await api('/api/quick-wins/assistente/sugerir', { metodo: 'POST', corpo: { descricao: W.descricao, arquetipo: W.arquetipo } });
        W.estruturaSugerida = s.estruturaPronta;
        $('estrutura').innerHTML = htmlEstrutura(W.estruturaSugerida);
        ligarUsarEstrutura(W);
      } catch (e) { erroEtapa(e.message); }
    });
    ligarUsarEstrutura(W);
    if ($('ex-arquivo')) {
      $('ex-arquivo').onclick = () => $('ex-input').click();
      $('ex-input').onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        $('ex-nome').textContent = 'Lendo o exemplo…';
        try {
          const r = await api('/api/quick-wins/assistente/exemplo', { metodo: 'POST', corpo: { arquivo: await lerArquivo(f) } });
          W.exemplo = r.texto; W.exemploNome = f.name; $('exemplo').value = r.texto; $('ex-nome').textContent = `${f.name}: exemplo lido.`;
        } catch (e) { $('ex-nome').textContent = ''; erroEtapa(e.message); }
      };
    }
  },
  W => {
    const redesenhar = foco => { guardarEtapa(W); desenhar(W, { foco: false }).then(() => $(foco)?.focus()); };
    document.querySelectorAll('[data-remover-regra]').forEach(b => { b.onclick = () => { W.proprias.splice(Number(b.dataset.removerRegra), 1); redesenhar('adicionar-regra'); }; });
    $('adicionar-regra')?.addEventListener('click', () => { $('nova-regra').classList.remove('oculto'); $('adicionar-regra').setAttribute('aria-expanded', 'true'); $('nova-regra-texto').focus(); });
    const confirmar = () => { if (!$('nova-regra-texto').value.trim()) return $('nova-regra-texto').focus(); redesenhar('adicionar-regra'); };
    $('confirmar-regra')?.addEventListener('click', confirmar);
    $('nova-regra-texto')?.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); confirmar(); } });
  },
  W => {
    document.querySelectorAll('input[name=saida]').forEach(r => { r.onchange = () => { W.formato = r.value; W.formatoPessoa = true; $('saida-outro').classList.toggle('oculto', r.value !== 'outro'); $('colunas-bloco').classList.toggle('oculto', r.value !== 'tabela'); }; });
    // Colunas: adicionar, remover, renomear (no próprio campo) e mudar a ordem. Qualquer ajuste é decisão da pessoa.
    const refazer = (mudar, foco) => { guardarEtapa(W); W.colunas = [...(W.colunas || [])]; mudar(W.colunas); marcarPessoa(W); desenhar(W, { foco: false }).then(() => (typeof foco === 'function' ? foco() : $(foco))?.focus()); };
    const trocar = (i, j) => c => { [c[i], c[j]] = [c[j], c[i]]; };
    document.querySelectorAll('[data-subir]').forEach(b => { const i = Number(b.dataset.subir); b.onclick = () => refazer(trocar(i, i - 1), () => document.querySelector(`[data-subir="${i - 1}"]`) || $(`coluna-${i - 1}`)); });
    document.querySelectorAll('[data-descer]').forEach(b => { const i = Number(b.dataset.descer); b.onclick = () => refazer(trocar(i, i + 1), () => document.querySelector(`[data-descer="${i + 1}"]`) || $(`coluna-${i + 1}`)); });
    document.querySelectorAll('[data-remover-coluna]').forEach(b => { const i = Number(b.dataset.removerColuna); b.onclick = () => refazer(c => c.splice(i, 1), 'adicionar-coluna'); });
    $('adicionar-coluna')?.addEventListener('click', () => refazer(c => c.push(''), () => $(`coluna-${W.colunas.length - 1}`)));
    $('usar-sugestao-colunas')?.addEventListener('click', () => { guardarEtapa(W); W.colunas = [...W.novaSugestao]; W.colunasOrigem = 'objetivo'; W.novaSugestao = null; desenhar(W, { foco: false }).then(() => $('coluna-0')?.focus()); });
    $('manter-colunas')?.addEventListener('click', () => { guardarEtapa(W); W.colunasDescricao = W.descricao; W.novaSugestao = null; desenhar(W, { foco: false }).then(() => $('coluna-0')?.focus()); });
    ligarEntregas(W);
    // Fontes (separadas dos entregáveis): o rascunho é salvo na primeira fonte adicionada.
    montarFontes($('fontes-qw'), { idAtual: W.id, obterId: async () => { if (!W.id) { guardarEtapa(W); await salvar(W); } return W.id; } });
  },
  W => {
    ligarRefinamento(W);
    document.querySelectorAll('[data-material]').forEach(b => { b.onclick = () => { guardarEtapa(W); W.teste.modo = b.dataset.material; W.resultado = W.resultado?.rodando ? W.resultado : null; desenhar(W, { foco: false }); }; });
    document.querySelectorAll('[data-testar]').forEach(b => { b.onclick = () => testar(W); });
    document.querySelector('[data-responder]')?.addEventListener('click', () => responderEContinuar(W));
    if (W.resultado?.sep && $('resultado-teste')) ligarPorCanal($('resultado-teste'), W.resultado.sep, m => toast(m));
    document.querySelector('[data-ajustar]')?.addEventListener('click', () => irEtapa(W, 0));
    $('responder-lacunas')?.addEventListener('click', () => irEtapa(W, 1).then(() => document.querySelector('#plano [data-lacuna]')?.focus()));
    document.querySelector('[data-revisar-assim]')?.addEventListener('click', () => irEtapa(W, REVISAR));
    if ($('teste-arquivo')) {
      $('teste-arquivo').onclick = () => $('teste-input').click();
      $('teste-input').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { W.teste.anexo = await lerArquivo(f); $('teste-nome').textContent = f.name; } catch (e) { erroEtapa(e.message); } };
    }
    document.querySelectorAll('#teste-resultado [data-csv]').forEach(b => {
      const r = W.resultado, linhas = (r.sep?.tabelas || r.tabelas)[Number(b.dataset.csv)];
      // Os cartões podem reagrupar as tabelas por canal: o índice do download é o da resposta original.
      const indice = r.tabelas.findIndex(t => JSON.stringify(t) === JSON.stringify(linhas));
      if (r.mensagem && r.guardado !== false && indice >= 0) {
        const a = document.createElement('a');
        a.className = b.className; a.textContent = b.textContent; a.dataset.csv = b.dataset.csv;
        a.setAttribute('role', 'button'); a.download = 'tabela.csv';
        a.href = `/api/conversas/${r.conversa}/mensagens/${r.mensagem}/tabelas/${indice}/csv`;
        b.replaceWith(a);
      } else b.onclick = () => baixarCsv(linhas, `${(W.qw?.nome || 'resultado').replace(/[^\wÀ-ú -]/g, '')}.csv`);
    });
    ligarArtefatosDoTeste(W);
  },
  W => {
    ligarRefinamento(W);
    const editar = (ver, edicao, campo) => { $(ver).classList.add('oculto'); $(edicao).classList.remove('oculto'); $(campo).focus(); };
    $('editar-nome').onclick = () => editar('nome-ver', 'nome-edicao', 'nome');
    $('editar-desc').onclick = () => editar('desc-ver', 'desc-edicao', 'desc');
    document.querySelector('[data-ir-teste]')?.addEventListener('click', () => irEtapa(W, 4));
    document.querySelector('[data-continuar]').onclick = () => publicar(W);
  },
];
function ligarUsarEstrutura(W) {
  $('usar-estrutura')?.addEventListener('click', () => {
    $('processo').value = W.estruturaSugerida.map((p, i) => `${i + 1}. ${p}`).join('\n');
    W.processo = $('processo').value;
    $('processo').focus();
  });
}

// ---- Usar: o que enviar → Executar → resultado (na conversa) ------------------------------------------------
export async function usarQw(id) {
  const qw = await api(`/api/quick-wins/${id}`);
  if (!qw.v2) return irPara(`#/qw/${id}/nova`);
  const teste = !qw.versao;
  if (teste && !qw.podeEditar) return irPara(`#/qw/${id}`);
  const anexos = [];
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome, `#/qw/${id}`], ['Usar']], titulo: qw.nome, descricao: esc(qw.para_que_serve || '') })}
      ${teste ? aviso('<b>Ainda não publicado.</b> Esta execução é um teste e não entra na medição.') : ''}
      <form class="usar-caixa" id="executar" novalidate>
        <label class="pergunta" for="entrada-qw" id="pergunta" style="display:block;font-size:20px">${esc(oQueEnviar(qw))}</label>
        <textarea class="campo-amplo" id="entrada-qw" placeholder="Cole o texto aqui ou anexe o arquivo"></textarea>
        <div class="anexos-pendentes" id="anexos-qw" style="margin-top:10px"></div>
        <div id="erro-exec"></div>
        <div class="rodape-usar"><button type="button" class="btn btn-linha" id="anexar-qw">${ICONE.clipe} Anexar arquivo</button><input type="file" id="arquivo-qw" hidden multiple accept="${ACEITOS}">
          <button type="submit" class="btn btn-verde btn-grande" id="executar-btn">Executar</button></div>
      </form>
    </div></div>`;
  ligarCabecalho();
  const desenharAnexos = () => {
    $('anexos-qw').innerHTML = anexos.map((a, i) => `<span class="anexo-chip">${ICONE.doc} ${esc(a.nome)}<button type="button" data-tirar="${i}" aria-label="Tirar ${esc(a.nome)}">×</button></span>`).join('');
    $('anexos-qw').querySelectorAll('[data-tirar]').forEach(b => { b.onclick = () => { anexos.splice(Number(b.dataset.tirar), 1); desenharAnexos(); }; });
  };
  $('anexar-qw').onclick = () => $('arquivo-qw').click();
  $('arquivo-qw').onchange = async ev => {
    for (const f of [...ev.target.files]) {
      if (anexos.length >= 5) { toast('Até 5 anexos por vez.', 6000); break; }
      try { anexos.push(await lerArquivo(f)); } catch (e) { toast(e.message, 6000); }
    }
    ev.target.value = ''; desenharAnexos();
  };
  $('executar').onsubmit = async ev => {
    ev.preventDefault();
    const texto = $('entrada-qw').value.trim();
    if (!texto && !anexos.length) { $('erro-exec').innerHTML = aviso('Cole um texto ou anexe um arquivo.', 'erro'); $('entrada-qw').focus(); return; }
    await vistaConversa({ qw, teste, enviarAgora: { texto: texto || 'Faça o trabalho com o arquivo anexado.', anexos: [...anexos] } });
  };
  $('entrada-qw').focus();
}

// ---- Versões ------------------------------------------------------------------------------------------------
export async function versoesQw(id) {
  const [qw, { versoes }] = await Promise.all([api(`/api/quick-wins/${id}`), api(`/api/quick-wins/${id}/versoes`)]);
  $('principal').innerHTML = `${cabecalho('Quick Wins')}
    <div class="pagina"><div class="pg">
      ${cabecalhoPg({ trilha: [['Quick Wins', '#/quick-wins'], [qw.nome, `#/qw/${id}`], ['Versões']], titulo: 'Versões', descricao: 'Cada publicação vira uma versão. A equipe usa sempre a versão atual.' })}
      ${qw.rascunho_alterado && qw.versao ? aviso(`<b>Rascunho em edição: v${qw.versao + 1}.</b> Ainda não publicado.`, 'info', `<a class="btn btn-linha btn-pequeno" href="#/qw/${id}/teste">Testar nova versão</a><a class="btn btn-verde btn-pequeno" href="#/qw/${id}/publicar">Publicar</a>`) : ''}
      ${versoes.length>1?`<details class="qw-acompanhamento"><summary>Comparar versões</summary><form id="comparar-versoes" class="grade-2"><div class="campo"><label for="versao-antes">Versão anterior</label><select class="entrada" id="versao-antes">${versoes.map((v,i)=>`<option value="${v.numero}" ${i===1?'selected':''}>v${v.numero}</option>`).join('')}</select></div><div class="campo"><label for="versao-depois">Comparar com</label><select class="entrada" id="versao-depois">${versoes.map(v=>`<option value="${v.numero}">v${v.numero}</option>`).join('')}</select></div><button class="btn btn-linha">Ver diferenças</button></form><div id="versoes-diferencas" role="status"></div></details>`:''}
      <ul class="execucoes">${versoes.map(v => `<li><div class="execucao" style="padding:14px 4px;display:flex;flex-direction:column;flex:1"><b>v${v.numero}${v.atual ? ' · Versão atual' : ''}</b>
        <span class="dica">${dataCurta(v.publicada_em)}${v.publicada_por ? ` · ${esc(v.publicada_por)}` : ''}${v.teste ? ` · teste ${v.teste === 'inconsistente' ? 'com pontos para revisar' : v.teste === 'parcial' ? 'com conferência incompleta' : 'conferido'}` : ''}</span></div>
        ${v.atual ? '' : `<button type="button" class="btn btn-linha btn-pequeno" data-restaurar="${v.numero}">Restaurar esta versão</button>`}</li>`).join('') || '<li><span class="dica" style="padding:14px 4px">Ainda não publicado.</span></li>'}</ul>
    </div></div>`;
  ligarCabecalho();
  if($('comparar-versoes')) $('comparar-versoes').onsubmit=async ev=>{
    ev.preventDefault();const b=ev.target.querySelector('button');b.disabled=true;
    try {const c=await api(`/api/quick-wins/${id}/comparar?antes=${$('versao-antes').value}&depois=${$('versao-depois').value}`);const texto=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('\n'):String(v??'');
      $('versoes-diferencas').innerHTML=`<p class="dica">${esc(c.nota)}</p>`+Object.entries(c.antes.campos).map(([k,v])=>JSON.stringify(v)===JSON.stringify(c.depois.campos[k])?'':`<article class="comparacao-campo"><h3>${esc(k)}</h3><div class="grade-2"><div><b>v${c.antes.numero}</b><p>${esc(texto(v)||'Não definido')}</p></div><div><b>v${c.depois.numero}</b><p>${esc(texto(c.depois.campos[k])||'Não definido')}</p></div></div></article>`).join('');
      if(!$('versoes-diferencas').querySelector('article'))$('versoes-diferencas').insertAdjacentHTML('beforeend','<p>Nenhuma diferença nos campos comparados.</p>');
    }catch(e){$('versoes-diferencas').textContent=e.message;}finally{b.disabled=false;}
  };
  document.querySelectorAll('[data-restaurar]').forEach(b => { b.onclick = async () => {
    if (!confirm(`Voltar para a v${b.dataset.restaurar}? Quem usa passa a receber essa versão agora, e o rascunho passa a ser ela.`)) return;
    b.disabled=true;try {await api(`/api/quick-wins/${id}/versoes/${b.dataset.restaurar}/restaurar`, { metodo: 'POST', corpo: {} });
    toast(`v${b.dataset.restaurar} é a versão atual.`);await versoesQw(id);}catch(e){toast(e.message);b.disabled=false;}
  }; });
}
