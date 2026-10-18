// QA dos Quick Wins com IA real no CANDIDATO (o código deste branch), sem tocar na produção:
//
//   node scripts/qa-candidato.mjs        (QA_CANAL=chrome por padrão; CHROMIUM=/caminho/do/chromium para outro)
//
// Sobe a plataforma deste código na própria máquina, com banco temporário (apagado no fim) e empresa fictícia. Abre
// um navegador COM JANELA no console local, já autenticado com uma conta local fictícia, na tela da chave do
// OpenRouter: no modo interativo, quem conduz o QA cola a chave ali e salva, como faria na aplicação. Nesse modo,
// espera só o estado seguro (origem "console"). No modo isolado, recebe a chave em memória pelo descritor 3.
// Todas as chamadas ao OpenRouter passam por um espião que mede tipo,
// modelo, duração e custo, e confere se a busca na internet levou algo interno. Nada do espião guarda a chave.
//
// Saída: qa-candidato-saida/<data>/relatorio.json (métricas e verificações) e um .md por execução (material fictício).
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { enviarMensagem } from '../test/openrouter-falso.js';
import { arquivo, docx, xlsx } from '../test/arquivos.js';
import { criarOpenRouter, criarIndisponivel } from '../src/ia.js';
import { json, um, todos } from '../src/db.js';
import { limparCacheInterpretacao } from '../src/quickwin-interpretacao.js';
import { rotuloEntregavel, MARCADOR_PERGUNTA } from '../src/quickwin-operacao.js';
import { observarResposta, falhasDaEntrega, consolidarRecibos, canaisNaoPedidos, preservarArtefatosQa } from './qa-real-evidencias.mjs';
import { verificarPlanilhaQa } from './qa-planilha-oraculo.mjs';
import { prepararAdvancedQa } from './qa-advanced-real.mjs';
import { verificarFacilitiesQa } from './qa-facilities-oraculo.mjs';
import { lerModelos } from '../src/modelos.js';
import { consultarGeracao } from './qa-consultar-recibo.mjs';
import { extrairMaterialRetomada } from './qa-baixar-candidata.mjs';
import { BATERIA, SURPRESA, CONTRATO, PROPOSTAS, TRANSCRICAO, CVS, planilha, SMOKE15, MATERIAIS_TEXTO, SURPRESA10 } from './qa-cenarios.mjs';
// QA_PARTES=homologacao: só os 15 casos principais e os 10 surpresa (com as classes); padrão: tudo.
const PARTES = (process.env.QA_PARTES || 'tudo').split(',');
const roda = p => PARTES.includes('tudo') || PARTES.includes(p);
const SELECAO = process.env.QA_CASOS ? new Set(process.env.QA_CASOS.split(',')) : null;
const SELECAO_CLASSES = process.env.QA_CLASSES ? new Set(process.env.QA_CLASSES.split(',')) : null;

const RODADA = new Date().toISOString().replace(/[:.]/g, '-');
const SAIDA = join(process.cwd(), 'qa-candidato-saida', RODADA); mkdirSync(SAIDA, { recursive: true });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const mediana = l => { const s = [...l].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const resumo = l => (l.length ? { n: l.length, mediana: mediana(l), maximo: Math.max(...l), medio: l.reduce((a, b) => a + b, 0) / l.length } : { n: 0 });
const R = { rodada: RODADA, interpretacoes: [], surpresa: [], execucoes: {}, classes: {}, lacunas: {}, qa04: {}, erros: [] };
const ISOLADO = process.env.QA_KEY_FD === '3';
if (ISOLADO && process.env.QA_AUTOTESTE === '1') throw new Error('O modo real não aceita IA simulada.');
R.escopo = { candidato: process.env.QA_COMMIT || null, bancoTemporario: true, autenticacao: 'contas fictícias locais', iaRealSolicitada: ISOLADO, designIA: process.env.DESIGN_IA === '1', liberacaoProducao: false,
  selecao: SELECAO ? [...SELECAO] : null,
  selecaoClasses: SELECAO_CLASSES ? [...SELECAO_CLASSES] : null,
  pendente: ['login e permissões no ambiente implantado', 'download e inspeção dos arquivos gerados', 'aceitação dos resultados pelo tipo de trabalho', 'casos negativos com configuração real do cliente'] };
if (process.env.QA_CONTEXTO_ANTERIOR) R.pendenciasAnteriores = JSON.parse(readFileSync(process.env.QA_CONTEXTO_ANTERIOR, 'utf8'));
const salvar = () => {
  R.recibos = chamadas.map(({ pronto, ...c }) => c);
  R.evidenciaProvedor = consolidarRecibos(chamadas);
  writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify(R, null, 2));
};
const log = (...a) => console.log(...a);

// ---- espião das chamadas ao OpenRouter --------------------------------------------------------------------------
// Frases que só existem no documento interno da empresa fictícia: nunca podem ir numa chamada com a busca.
const INTERNO = ['organização documental, compliance, fornecedores e reporte', 'clientes em Minas Gerais e no Pará', 'Contato comercial: carla.souza@minadocs.exemplo', 'Tabela interna: R$ 48.000'];
const PARA_FORA = /[\w.+-]+@[\w-]+\.[\w.]+|\bR\$|\(?\b\d{2}\)?\s?\d{4,5}-?\d{4}\b|\d[\d.\-/]{5,}\d|https?:\/\//i;
const chamadas = [];
const custoDe = lista => consolidarRecibos(lista).custoTotalUsd;
const mostrarCusto = custo => custo === null ? 'PENDENTE' : `US$${custo.toFixed(4)}`;
const textoDe = c => (typeof c === 'string' ? c : (c || []).map(p => p.text).join('\n'));
function tipoDe(b) {
  const sis = textoDe(b.messages?.[0]?.content), ult = textoDe(b.messages?.at(-1)?.content);
  if (sis.includes('PLANO DE TRABALHO')) return 'interpretacao';
  if (sis.includes('material FICTÍCIO')) return 'exemplo';
  if (sis.includes('Você organiza o pedido')) return 'estrutura';
  if (sis.includes('conferente de qualidade')) return 'conferencia';
  if (sis.includes('Etapa 1 de 2')) return 'coleta';
  if (ult.startsWith('Confira o resultado acima')) return 'correcao';
  if (ult.includes('Reavalie as suas perguntas')) return 'autonomia';
  return 'execucao';
}
let rotulo = null;
async function espiao(url, init = {}) {
  if (!String(url).endsWith('/chat/completions')) return fetch(url, init);
  if (ISOLADO) {
    await esperar();
    const anterior = consolidarRecibos(chamadas);
    if (chamadas.length >= Number(process.env.QA_MAX_CHAMADAS || 180) || anterior.custoConfirmadoUsd >= Number(process.env.QA_PARAR_CUSTO_USD || 2) || anterior.tentativasComCustoPendente || chamadas.some(c => c.erroStream)) {
      R.interrompido = 'Limite de tentativas, custo observado ou recibo pendente; não iniciar outra inferência.';
      salvar(); throw new Error(R.interrompido);
    }
  }
  const b = JSON.parse(init.body), corpo = String(init.body), web = !!b.plugins?.some(p => p.id === 'web');
  const consulta = web ? textoDe(b.messages.at(-1)?.content) : null;
  const c = { tipo: tipoDe(b), modelo: b.model, rotulo, custo: null, t0: Date.now(), web,
    ...(web ? { mensagens: b.messages.length, interno: INTERNO.some(x => corpo.includes(x)), dadoParaFora: PARA_FORA.test(consulta), linhasConsulta: consulta.split('\n').map(l => l.split(':')[0]) } : {}) };
  chamadas.push(c);
  let r;
  try { r = await fetch(url, init); } catch { c.erroTransporte = true; c.ms = Date.now() - c.t0; throw new Error('Falha de transporte para o provedor; custo pendente.'); }
  c.status = r.status;
  if (!r.ok) { c.ms = Date.now() - c.t0; return r; }
  return observarResposta(c, r, b.stream, ISOLADO ? () => consultarGeracao(c, new Headers(init.headers).get('authorization')?.replace(/^Bearer /i, '') || '') : null);
}
const esperar = async () => {
  await Promise.all(chamadas.map(c => c.pronto));
  if (ISOLADO && chamadas.some(c => c.custo === null || c.erroStream)) R.interrompido = 'Recibo pendente ou coleta interrompida; casos seguintes não executados.';
};

// ---- plataforma local do candidato ------------------------------------------------------------------------------
// QA_AUTOTESTE=1: só para conferir o roteiro — OpenRouter falso local, navegador sem janela e uma chave falsa digitada
// na tela. Não mede IA real e o relatório diz isso.
const AUTOTESTE = process.env.QA_AUTOTESTE === '1';
const falso = AUTOTESTE ? await (await import('../test/openrouter-falso.js')).openRouterFalso({ responder: b => (tipoDe(b) === 'interpretacao' ? '{"entregaveis":[]}' : tipoDe(b) === 'conferencia' ? '{"criterios":[]}' : '## Resultado\nTexto fictício.') }) : null;
R.autoteste = AUTOTESTE;
const pasta = mkdtempSync(join(tmpdir(), 'greenia-qa-candidato-'));
const OPS = 'qa-ops@local.exemplo';
const S = await subirPlataforma({ banco: join(pasta, 'p.sqlite'), pastaEmpresas: join(pasta, 'empresas'), chaveMestra: randomBytes(32), chaveVariavel: null, ia: criarIndisponivel(),
  criarIA: k => criarOpenRouter({ chave: k, fetch: espiao, ...(falso ? { base: falso.base } : {}) }), admins: [OPS], hostPlataforma: 'localhost', urlBase: 'http://localhost' });
const porta = new URL(S.base).port;
const ops = await S.navegador('localhost').entrarConsole(OPS);
if (ISOLADO) process.once('uncaughtException', async () => {
  R.erros.push('Interrupção inesperada do roteiro; consulte os casos e recibos preservados.');
  salvar(); await encerrar().catch(() => {}); process.exit(2);
});

let navegador;
if (ISOLADO) {
  let chave = readFileSync(3, 'utf8');
  const configuracao = await ops.put('/api/plataforma/openrouter/chave', { chave }); chave = null;
  if (configuracao.status !== 200) { R.erros.push('A validação da chave pelo provedor falhou.'); salvar(); await encerrar(); process.exit(2); }
} else {
// Navegador com janela: o console local já autenticado, na tela da chave.
const opcoes = { headless: AUTOTESTE, ...(process.env.CHROMIUM && existsSync(process.env.CHROMIUM) ? { executablePath: process.env.CHROMIUM } : { channel: process.env.QA_CANAL || 'chrome' }) };
navegador = await chromium.launch(opcoes);
const pagina = await (await navegador.newContext()).newPage();
await pagina.goto(`http://localhost:${porta}/plataforma`);
await pagina.fill('#c-email', OPS); await pagina.press('#c-email', 'Enter');
await pagina.waitForSelector('#c-codigo', { state: 'visible' });
await pagina.fill('#c-codigo', /(\d{6})/.exec(S.P.email.enviados.filter(m => m.para === OPS).at(-1).assunto)[1]);   // código da conta LOCAL fictícia
await pagina.press('#c-codigo', 'Enter');
await pagina.waitForLoadState('networkidle');
await pagina.goto(`http://localhost:${porta}/plataforma#/uso`);
log('\nCole a chave do OpenRouter na tela "Uso" do console local que abriu e salve. O script só espera o estado "configurada".');
if (AUTOTESTE) { await pagina.waitForSelector('#or-chave-in'); await pagina.fill('#or-chave-in', 'sk-or-v1-' + randomBytes(32).toString('hex')); await pagina.locator('#or-chave-in').press('Enter'); }
}
const configurada = async () => (await ops.get('/api/plataforma/consumo')).dados?.chaveConfig?.origem === 'console';
for (let i = 0; i < 180 && !(await configurada()); i++) await new Promise(r => setTimeout(r, 5000));
R.credencial = await configurada();
log(`OPENROUTER_CREDENTIAL_CONFIGURED=${R.credencial}`);
await navegador?.close();
if (!R.credencial) { salvar(); await encerrar(); process.exit(2); }

// Empresa fictícia, com documento INTERNO na base (para provar que não vai para a busca externa).
const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company')) || (await ops.get('/api/plataforma/planos')).dados.planos[0];
const empresa = (await ops.post('/api/plataforma/empresas', { name: 'QA Mina Docs (fictícia)', slug: 'qaminadocs', plan_id: plano.id, admin_email: 'ana@qaminadocs.exemplo', status: 'ativa' })).dados;
const ana = S.navegador('localhost'); await ana.get('/qaminadocs'); await ana.entrarEmpresa('ana@qaminadocs.exemplo');
await ana.put('/api/admin/config', { pesquisaWeb: { ativa: true } });
const area = (await ana.post('/api/admin/areas', { nome: 'QA Operações' })).dados.id;
await ana.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo('sobre.docx', docx([`Sobre a empresa Mina Docs (fictícia): empresa B2B de tecnologia para mineração, focada em ${INTERNO[0]}. Atua no Brasil, com ${INTERNO[1]}. ${INTERNO[2]}. ${INTERNO[3]} por licença.`])) });
const db = S.P.tenant(empresa.id).db;
const evento = tipo => json(um(db, 'select detalhes from eventos where tipo = ? order by id desc limit 1', tipo)?.detalhes, null);
if (ISOLADO) {
  const conferir = (r, etapa) => { if (r.status !== 200) throw new Error(`${etapa}: HTTP ${r.status}`); return r.dados; };
  const eu = conferir(await ana.get('/api/eu'), 'Conta local');
  if (!eu.iaConfigurada || eu.iaSimulada) throw new Error('O serviço local não está com IA real configurada.');
  conferir(await ana.post('/api/admin/modelos/atualizar'), 'Catálogo real');
  // A API da empresa remove preços por política. O operador lê o catálogo INTERNO do banco fictício;
  // não se abre a informação financeira na interface do cliente para preparar o QA.
  const modelos = lerModelos(db);
  R.catalogo = modelos.map(m => ({ id: m.id, perfil: m.perfil, liberado: m.liberado, noCatalogo: m.noCatalogo, catalogo: m.atributos?.catalogo }));
  const preparacao = await prepararAdvancedQa(ana, modelos, eu.pessoa.id);
  R.autorizacoesLocais = preparacao.id ? [preparacao] : [];
  if (preparacao.pendente) R.erros.push(preparacao.pendente);
  salvar();
}

// ---- interpretação, criação, execução ---------------------------------------------------------------------------
async function interpretar(descricao) {
  limparCacheInterpretacao(); rotulo = 'interpretacao';
  const antes = chamadas.length, t0 = Date.now();
  const r = await ana.post('/api/quick-wins/assistente/interpretar', { descricao }); await esperar();
  const minhas = chamadas.slice(antes);
  return { ms: Date.now() - t0, status: r.status, custo: custoDe(minhas), modelo: minhas[0]?.modeloResposta || null, ...r.dados, invariantes: evento('quickwin.interpreted')?.invariantes || [], estrutura: evento('quickwin.interpreted')?.estrutura || null };
}
const criar = async (descricao, it) => (await ana.post('/api/quick-wins', { nome: `QA - ${descricao.slice(0, 50)}`, areas: [area], assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } } })).dados;
async function executar(qwId, corpo, rot, conv = null) {
  conv ??= (await ana.post('/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  const antes = chamadas.length; rotulo = rot; const t0 = Date.now();
  const eventoInicial = um(db, 'select coalesce(max(id),0) id from eventos').id;
  // O limite de rajada da aplicação (mensagens por minuto por pessoa) vale também para o QA: espera e repete.
  let r;
  for (let i = 0; ; i++) { r = await enviarMensagem(ana, conv.id, { executar_quick_win: true, ...corpo }); if (r.status !== 429 || i >= 3) break; log('   (limite de rajada: aguardando 65 s)'); await new Promise(ok => setTimeout(ok, 65e3)); }
  await esperar();
  const diagnostico = todos(db, "select tipo,detalhes from eventos where id > ? and tipo in ('ai.failed','advanced.reserved','quickwin.tool_used') order by id", eventoInicial).map(ev => {
    const d = json(ev.detalhes, {});
    return { tipo: ev.tipo, etapa: d.etapa || null, modelo: d.modelo || null, erro: ev.tipo === 'ai.failed' ? d.erro || null : null, estimativa: d.estimativa ?? null, ferramenta: d.ferramenta || null, fontes: d.fontes ?? null };
  });
  (R.diagnosticos ??= []).push({ caso: rot, eventos: diagnostico });
  const minhas = chamadas.slice(antes), soma = t => minhas.filter(x => x.tipo === t).reduce((s, x) => s + (x.ms || 0), 0);
  // Preserva os arquivos sintéticos antes de apagar o banco temporário. Isso não substitui testar
  // download, conteúdo e aparência: os bytes ficam disponíveis para essa inspeção posterior.
  const artefatos = ISOLADO ? preservarArtefatosQa(db, conv.id, SAIDA) : [];
  if (artefatos.length) (R.artefatosPreservados ??= []).push({ caso: rot, conversa: conv.id, arquivos: artefatos });
  const rt = um(db, 'select classe_necessaria,classe_pedida,motivo_bloqueio,requisitos,fallback from roteamento where conversa_id = ? order by id desc limit 1', conv.id);
  const roteamento = rt ? { ...rt, requisitos: json(rt.requisitos, {}), fallback: json(rt.fallback, null) } : null;
  const texto = r.texto || '';
  return { conv, roteamento, http: r.status, finalizou: !!r.fim, custosPendentes: minhas.filter(c => c.custo === null).length, erroCodigo: r.erro?.erro || r.falha?.codigo || null, erroDetalhes: r.erro || r.falha || null, chamadasReais: minhas.filter(c => c.status === 200 && c.geracao && c.modeloResposta && !c.erroStream && !c.erroProvedor).length, ms: Date.now() - t0, texto, status: r.fim?.qualidade?.status || (r.falha || r.erro ? 'erro' : null), falha: r.falha?.mensagem || (r.erro ? `${r.status} ${r.erro.erro || ''} ${r.erro.mensagem || ''}`.trim() : null), qualidade: r.fim?.qualidade || null,
    fontes: (r.fim?.fontes || []).filter(f => f.url).map(f => f.url), pergunta: texto.startsWith(MARCADOR_PERGUNTA), modelos: [...new Set(minhas.filter(x => x.tipo === 'execucao').map(x => x.modeloResposta || x.modelo))],
    pedido: minhas.find(x => x.tipo === 'execucao')?.modelo || null, custo: custoDe(minhas),
    fases: { coleta: soma('coleta'), execucao: soma('execucao') + soma('autonomia'), conferencia: soma('conferencia') + soma('correcao') }, web: minhas.filter(x => x.web) };
}
const plano_ = op => ({ entradas: (op?.entradas || []).map(x => `${x.tipo}${x.quantidade > 1 ? `x${x.quantidade}` : ''}${x.obrigatoria === false ? '?' : ''}:${x.rotulo}`), etapas: (op?.etapas || []).map(x => x.texto),
  ferramentas: op?.ferramentas || [], lacunas: (op?.lacunas || []).map(l => `${l.obrigatoria ? '!' : ''}${l.pergunta}`), sugestoes: (op?.sugestoes || []).map(s => s.texto), entregaveis: (op?.entregaveis || []).map(e => `${rotuloEntregavel(e)}${e.config?.colunas?.length ? `[${e.config.colunas.join('|')}]` : ''}`) });
function avaliar(it, esp) {
  const op = it.operacao || {}, ent = op.entradas || [], entg = op.entregaveis || [], ferr = op.ferramentas || [], lac = [...(op.lacunas || []), ...(it.lacunas || [])];
  const t = norm(entg.map(e => `${e.tipo} ${e.rotulo || ''} ${e.config?.detalhe || ''} ${(e.config?.colunas || []).join(' ')}`).join(' | ')), f = [];
  if (it.status !== 200) f.push(`http ${it.status}`);
  if (esp.entrada && !ent.some(e => new RegExp(esp.entrada).test(e.tipo))) f.push(`entrada ${esp.entrada} [${ent.map(e => e.tipo)}]`);
  if (esp.qtd && !ent.some(e => e.quantidade === esp.qtd)) f.push(`quantidade ${esp.qtd}`);
  if (esp.ferramenta && !ferr.includes(esp.ferramenta)) f.push(`ferramenta ${esp.ferramenta}`);
  if (esp.semFerramenta && ferr.includes(esp.semFerramenta)) f.push(`${esp.semFerramenta} indevida`);
  for (const i of esp.itens || []) if (!new RegExp(i).test(t)) f.push(`~${i}`);
  if (esp.canais) for (const c of esp.canais) if (!entg.some(e => e.canal === c)) f.push(`canal ${c}`);
  if (!esp.canais && entg.some(e => e.canal)) f.push('canal indevido');
  if (esp.vago && !lac.some(l => l.obrigatoria)) f.push('vago sem pergunta obrigatória');
  if (!entg.length && !lac.length) f.push('plano vazio');
  return { resultado: it.fonte === 'heuristica' ? 'FALLBACK' : f.length ? 'FAIL' : 'PASS', falhas: f };
}

// ---- Homologação: 15 casos principais e 10 surpresa, de ponta a ponta, com critério de pessoa leiga ------------
// Reprova o caso se: canal que não foi pedido, estrutura genérica de social media, pedido de configuração técnica,
// pergunta em caso normal (com material), resultado "inconsistente" (o "Ajustar Quick Win" da tela), invenção
// apontada pela conferência, ou texto que só descreve o que faria.
R.homologacao = { principais: [], surpresa: [] };
function casoSuspenso(destino, id) {
  if (!R.interrompido) return false;
  destino.push({ id, estado: 'nao_executado', utilizavel: null, motivo: R.interrompido }); salvar(); return true;
}
function usabilidade(pedido, it, x, esperado, { vago = false } = {}) {
  const op = it.operacao || {}, f = ISOLADO ? falhasDaEntrega(x, { permitePergunta: vago }) : [];
  if (it.status !== 200 || it.fonte !== 'ia') f.push('interpretação sem confirmação de IA');
  if (!vago && !(op.entregaveis || []).length) f.push('plano sem entregáveis');
  for (const canal of canaisNaoPedidos(pedido, op.entregaveis || [])) f.push(`canal que não foi pedido: ${canal}`);
  if (/configur(e|ar) (o|a) (modelo|prompt|json)|ajuste o quick win|edite a configura/i.test(x.texto)) f.push('pede configuração técnica');
  if (vago) { if (!x.pergunta && !(it.lacunas || op.lacunas || []).some(l => l.obrigatoria)) f.push('vago sem pergunta'); }
  else {
    if (!['aprovado', 'corrigido'].includes(x.status)) f.push('conferência da execução não aprovada');
    if (x.pergunta) f.push('pergunta num caso com material');
    if (x.status === 'inconsistente') f.push('inconsistente (pede ajustar e testar de novo)');
    if (x.qualidade?.itens?.some(i => i.id === 'invencao' && i.conferido && !i.ok)) f.push('conferência aponta invenção');
    if (/^\s*(vou|irei|posso|eu faria|o plano é)\b/i.test(x.texto)) f.push('só descreve o que faria');
    if (esperado && !esperado.test(x.texto)) f.push('não usou o material');
  }
  return f;
}
const materialDe = chave => chave === 'contrato' ? { texto: 'Material anexo (fictício).', anexos: [arquivo('contrato-qa.docx', docx(CONTRATO))] }
  : chave === 'propostas' ? { texto: 'Propostas anexas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) }
  : chave === 'planilha' ? { texto: 'Planilha anexa (fictícia).', anexos: [arquivo('custos-qa.xlsx', xlsx(planilha(), 'Custos'))] }
  : chave === 'reuniao' ? { texto: TRANSCRICAO.join('\n') }
  : chave === 'curriculos' ? { texto: 'Vaga (fictícia): planejador de manutenção. Requisitos: 4+ anos em planejamento, SAP PM, inglês intermediário.', anexos: CVS.map((c, i) => arquivo(`cv-qa-${i + 1}.docx`, docx(c))) }
  : chave ? { texto: MATERIAIS_TEXTO[chave] } : { texto: 'Execute agora.' };
if (roda('homologacao')) {
  log(`\n[H1] ${SMOKE15.filter(([id]) => !SELECAO || SELECAO.has(id)).length} casos principais selecionados`);
  for (const [id, pedido, material, esperado] of SMOKE15) {
    if (SELECAO && !SELECAO.has(id)) { R.homologacao.principais.push({ id, estado: 'fora_desta_rodada', utilizavel: null }); continue; }
    if (casoSuspenso(R.homologacao.principais, id)) continue;
    try {
      const it = await interpretar(pedido); if (casoSuspenso(R.homologacao.principais, id)) continue;
      const qw = await criar(pedido, it);
      const x = await executar(qw.id, materialDe(material), `h_${id}`);
      writeFileSync(join(SAIDA, `h-${id}.md`), x.texto);
      const falhas = usabilidade(pedido, it, x, esperado, { vago: id.endsWith('vago') });
      const conferenciaNumerica = id === '03-planilha' ? verificarPlanilhaQa(x.texto, planilha()) : null;
      if (conferenciaNumerica) falhas.push(...conferenciaNumerica.falhas);
      R.homologacao.principais.push({ id, pedido, fonte: it.fonte, plano: plano_(it.operacao), status: x.status, http: x.http, erroCodigo: x.erroCodigo, erroDetalhes: x.erroDetalhes, custosPendentes: x.custosPendentes, pergunta: x.pergunta, avisos: x.qualidade?.avisos || [], objetivo: x.qualidade?.objetivo || null,
        entregaveis: x.qualidade?.entregaveis || null, conferenciaNumerica, fontes: x.fontes.length, modelos: x.modelos, ms: x.ms, custo: x.custo, utilizavel: !falhas.length && it.fonte === 'ia', falhas });
      log(falhas.length ? 'FAIL' : 'PASS', id, it.fonte, x.status, `${x.ms}ms`, mostrarCusto(x.custo), falhas.join('; ')); salvar();
    } catch (e) { R.homologacao.principais.push({ id, erro: String(e.message) }); salvar(); }
  }
  log(`\n[H2] ${SURPRESA10.filter(([id]) => !SELECAO || SELECAO.has(id)).length} casos surpresa selecionados`);
  for (const [id, pedido] of SURPRESA10) {
    if (SELECAO && !SELECAO.has(id)) { R.homologacao.surpresa.push({ id, estado: 'fora_desta_rodada', utilizavel: null }); continue; }
    if (casoSuspenso(R.homologacao.surpresa, id)) continue;
    try {
      const it = await interpretar(pedido); if (casoSuspenso(R.homologacao.surpresa, id)) continue;
      const qw = await criar(pedido, it);
      rotulo = `h_${id}_exemplo`;
      const ex = process.env.QA_MATERIAIS
        ? { modo: 'texto', texto: existsSync(join(process.env.QA_MATERIAIS, `material-${id}.txt`)) ? readFileSync(join(process.env.QA_MATERIAIS, `material-${id}.txt`), 'utf8') : extrairMaterialRetomada(readFileSync(join(process.env.QA_MATERIAIS, `h-${id}.md`), 'utf8')), origem: 'rodada_anterior' }
        : { ...(await ana.post(`/api/quick-wins/${qw.id}/exemplo-teste`, {})).dados, origem: 'exemplo_gerado' };
      await esperar();
      if (ex.texto) writeFileSync(join(SAIDA, `material-${id}.txt`), ex.texto);
      if (ex.modo !== 'texto') { R.homologacao.surpresa.push({ id, pedido, fonte: it.fonte, exemplo: ex.modo, utilizavel: false, falhas: [`exemplo pronto não gerou texto (${ex.modo})`] }); salvar(); continue; }
      const x = await executar(qw.id, { texto: ex.texto }, `h_${id}`);
      writeFileSync(join(SAIDA, `h-${id}.md`), `${ex.texto}\n\n---\n\n${x.texto}`);
      const falhas = usabilidade(pedido, it, x, null);
      const conferenciaDados = id === 'U05' ? verificarFacilitiesQa(ex.texto, x.texto) : null;
      if (conferenciaDados) falhas.push(...conferenciaDados.falhas);
      R.homologacao.surpresa.push({ id, pedido, fonte: it.fonte, plano: plano_(it.operacao), material: { origem: ex.origem, sha256: createHash('sha256').update(ex.texto).digest('hex') }, conferenciaDados, qualidade: x.qualidade, status: x.status, http: x.http, erroCodigo: x.erroCodigo, erroDetalhes: x.erroDetalhes, pergunta: x.pergunta, avisos: x.qualidade?.avisos || [], ms: x.ms, custo: x.custo, utilizavel: !falhas.length && it.fonte === 'ia', falhas });
      log(falhas.length ? 'FAIL' : 'PASS', id, it.fonte, x.status, `${x.ms}ms`, falhas.join('; ')); salvar();
    } catch (e) { R.homologacao.surpresa.push({ id, erro: String(e.message) }); salvar(); }
  }
}

if (roda('tudo')) {
log('\n[1] interpretação com IA real');
for (const [id, pedido, esp] of BATERIA) {
  const it = await interpretar(pedido), a = avaliar(it, esp);
  R.interpretacoes.push({ id, pedido, fonte: it.fonte, ms: it.ms, custo: it.custo, modelo: it.modelo, invariantes: it.invariantes, estrutura: it.estrutura, ...a, plano: plano_(it.operacao) });
  log(a.resultado, id, `${it.ms}ms`, a.falhas.join('; ')); salvar();
}
log('\n[2] 20 pedidos surpresa (motor congelado)');
for (const [id, areaNome, pedido, esp] of SURPRESA) {
  const it = await interpretar(pedido), a = avaliar(it, esp);
  R.surpresa.push({ id, area: areaNome, pedido, fonte: it.fonte, ms: it.ms, custo: it.custo, ...a, plano: plano_(it.operacao) });
  log(a.resultado, id, areaNome, `${it.ms}ms`, a.falhas.join('; ')); salvar();
}

// ---- execuções ---------------------------------------------------------------------------------------------------
const marcadores = t => [...new Set(t.match(/\b(Concorrente|Empresa|Player|Competidor)[ \t]+(?:[A-E]|[1-5]|X|Y|Z)\b/g) || [])];
const arquivoSimulado = t => /\.(mp4|mov|avi|webm)\b|\[(link|arquivo|download|v[ií]deo)[^\]]*\]|baixe aqui|link do v[ií]deo|v[ií]deo (gerado|renderizado|pronto)/i.test(t);
const registro = (id, x, extra = {}) => { R.execucoes[id] = { status: x.status, falha: x.falha, avisos: x.qualidade?.avisos || [], objetivo: x.qualidade?.objetivo || null, entregaveis: x.qualidade?.entregaveis || null,
  pesquisa: x.qualidade?.pesquisa || null, fontes: x.fontes.length, pergunta: x.pergunta, modelos: x.modelos, ms: x.ms, fases: x.fases, custo: x.custo,
  buscas: x.web.map(w => ({ mensagens: w.mensagens, interno: w.interno, dadoParaFora: w.dadoParaFora, linhas: w.linhasConsulta })), ...extra };
  writeFileSync(join(SAIDA, `exec-${id}.md`), x.texto); log('exec', id, x.status, x.modelos.join(','), `${x.ms}ms`, mostrarCusto(x.custo), JSON.stringify(extra)); salvar(); };
async function caso(id, pedido, corpo, checar = () => ({})) {
  try { const it = await interpretar(pedido); const qw = await criar(pedido, it); const x = await executar(qw.id, corpo, `exec_${id}`); registro(id, x, checar(x)); return { x, qw }; }
  catch (e) { R.execucoes[id] = { erro: String(e.message) }; R.erros.push(`${id}: ${e.message}`); salvar(); return {}; }
}
log('\n[3] execuções reais');
await caso('contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', { texto: 'Analise o contrato anexo (fictício).', anexos: [arquivo('contrato-qa.docx', docx(CONTRATO))] },
  x => ({ riscos: /risco/i.test(x.texto), obrigacoes: /obriga/i.test(x.texto), prazos: /prazo|vig[êe]ncia|24 meses/i.test(x.texto), multas: ['2%', '30%', '5.000'].every(v => x.texto.includes(v)), renovacao: /renova/i.test(x.texto),
    rescisao: /rescis/i.test(x.texto), confidencialidade: /confiden|sigilo/i.test(x.texto), clausulaInventada: [...new Set([...x.texto.matchAll(/cl[áa]usula\s+(\d+)/gi)].map(m => Number(m[1])))].filter(n => n < 1 || n > 9) }));
await caso('fornecedores', 'Compare três propostas de fornecedores considerando preço, prazo, escopo e risco.', { texto: 'Compare as três propostas anexas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) },
  x => ({ tres: ['Alfa', 'Beta', 'Gama'].every(n => x.texto.includes(n)), precos: ['182.000', '158.500', '205.900'].every(v => x.texto.includes(v)), prazos: ['30 dias', '45 dias', '20 dias'].every(v => x.texto.includes(v)),
    matriz: /\|.*\|/.test(x.texto), recomendacao: /recomend/i.test(x.texto), fornecedorInventado: /\b(Delta|Ômega|Omega|Épsilon)\b/.test(x.texto) }));
const L = planilha(), soma = k => L.slice(1).reduce((s, l) => s + (typeof l[k] === 'number' ? l[k] : 0), 0);
await caso('planilha', 'Analise esta planilha mensal e identifique desvios relevantes, maiores gastos e itens fora do padrão.', { texto: 'Planilha anexa (fictícia).', anexos: [arquivo('custos-qa.xlsx', xlsx(L, 'Custos'))] },
  x => ({ outlierL118: /L118/.test(x.texto), altoL023: /L023/.test(x.texto), baixoL067: /L067/.test(x.texto), vazios: ['L041', 'L077', 'L095', 'L109'].filter(i => x.texto.includes(i)).length,
    totalPrevisto: x.texto.includes(soma(4).toLocaleString('pt-BR')), totalRealizado: x.texto.includes(soma(5).toLocaleString('pt-BR')), linhas: L.length - 1 }));
await caso('reuniao', 'Transforme esta reunião em ata, decisões, responsáveis e próximos passos.', { texto: TRANSCRICAO.join('\n') },
  x => { const d = (x.texto.split(/##[^\n]*decis/i)[1] || '').split(/\n##\s/)[0]; return { ata: /##[^\n]*ata/i.test(x.texto), decisaoTC04: /TC-04|sábado|dia 20/i.test(d), cotacoes: /cota[çc]/i.test(x.texto), opiniaoComoDecisao: /trocar o fornecedor de rolos/i.test(d), pendencia: /or[çc]amento extra/i.test(x.texto) }; });
await caso('relatorio', 'Prepare um relatório executivo mensal com principais fatos, riscos e decisões necessárias.',
  { texto: ['Indicadores de setembro/2026 (fictícios):', 'Receita: R$ 1,92 mi (meta R$ 2,10 mi; agosto R$ 1,85 mi).', 'Chamados de suporte: 318 (agosto: 240); tempo médio 6,4 h (meta 4 h).', 'Projeto Norte QA: 3 semanas de atraso.', 'Decisão pendente: contratar mais 2 analistas de suporte (R$ 28 mil/mês).'].join('\n') },
  x => ({ secoes: (x.texto.match(/^##\s/gm) || []).length, fatos: /fato/i.test(x.texto), riscos: /risco/i.test(x.texto), decisoes: /decis/i.test(x.texto), receita: /1,92/.test(x.texto), chamados: /318/.test(x.texto) }));
// QA-04: sem perfil público (pergunta e continua na mesma execução) e com perfil público.
const sp = await caso('pesquisa_sem_perfil', 'Pesquise os principais concorrentes e monte uma matriz de posicionamento.', { texto: 'Execute para a nossa empresa.' }, x => ({ marcadores: marcadores(x.texto) }));
if (sp.x?.pergunta) {
  const y = await executar(sp.qw.id, { texto: 'Software B2B de gestão documental para mineradoras no Brasil.' }, 'exec_pesquisa_retomada', sp.x.conv);
  registro('pesquisa_retomada', y, { perguntaDeNovo: y.pergunta, marcadores: marcadores(y.texto), mesmaConversa: true });
}
await ana.put('/api/admin/config', { pesquisaWeb: { ativa: true, perfil: { nome: 'Mina Docs', setor: 'Software B2B para mineração', categoria: 'Gestão documental e compliance para mineradoras', regiao: 'Brasil' } } });
await caso('pesquisa_com_perfil', 'Pesquise os principais concorrentes e monte uma matriz de posicionamento.', { texto: 'Execute agora.' }, x => ({ marcadores: marcadores(x.texto), matriz: /\|.*\|/.test(x.texto), urls: x.fontes.slice(0, 8) }));
await ana.put('/api/admin/config', { pesquisaWeb: { ativa: true, perfil: {} } });
await caso('curriculos', 'Analise estes currículos e monte uma comparação objetiva com base nos requisitos da vaga.', { texto: 'Vaga (fictícia): planejador de manutenção. Requisitos: 4+ anos em planejamento, SAP PM, inglês intermediário.', anexos: CVS.map((c, i) => arquivo(`cv-qa-${i + 1}.docx`, docx(c))) },
  x => ({ tres: ['Candidato A', 'Candidato B', 'Candidato C'].every(c => x.texto.includes(c)), requisitos: /SAP/.test(x.texto), atributoProtegido: /\b(idade|g[êe]nero|sexo|estado civil|etnia|ra[çc]a|religi|gravidez|casad[oa]|solteir[oa])\b/i.test(x.texto) }));
await caso('social', 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.', { texto: 'Tema (fictício): lançamento do módulo de compliance documental.' },
  x => ({ linkedin: /LinkedIn/.test(x.texto), instagram: /Instagram/.test(x.texto), carrossel: /carrossel/i.test(x.texto), reels: /reels/i.test(x.texto) }));
await caso('video_com_campanha', 'Crie o vídeo final desta campanha.', { texto: 'Campanha (fictícia) "Zero acidente na correia": vídeo de 30 segundos para operadores; mensagem central "pare, bloqueie e sinalize antes de intervir".' },
  x => ({ pacote: ['conceito', 'roteiro', 'storyboard|cena', 'locu', 'briefing', 'prompt'].filter(p => new RegExp(p, 'i').test(x.texto)), arquivoSimulado: arquivoSimulado(x.texto) }));
await caso('video_sem_campanha', 'Crie o vídeo final desta campanha.', { texto: 'Execute agora.' }, x => ({ arquivoSimulado: arquivoSimulado(x.texto) }));
await caso('revise_pesquisa', 'Revise esta pesquisa.', { texto: 'Pesquisa de clima (fictícia) anexa.', anexos: [arquivo('pesquisa-de-clima-qa.docx', docx(['Pesquisa de clima 2026 (fictícia)', 'Participação: 212 de 260 (81,5%).', 'Favorabilidade: 68% (2025: 71%).', 'Texto com erros de digitaçao.']))] },
  x => ({ numerosPreservados: ['212', '81,5', '68%', '71%'].every(v => x.texto.includes(v)), buscou: x.web.length > 0 }));
log('\n[4] lacunas e retomada');
for (const [id, pedido, corpo] of [['sem_propostas', 'Compare os três fornecedores.', { texto: 'Faça a comparação.' }], ['sem_contrato', 'Analise o contrato.', { texto: 'Faça agora.' }], ['refaca', 'Faça isso de novo, mas melhor.', { texto: 'Execute.' }]]) {
  const r = await caso(`lacuna_${id}`, pedido, corpo, x => ({ inventouTabela: !x.pergunta && /\|.*\|.*\|/.test(x.texto) }));
  R.lacunas[id] = R.execucoes[`lacuna_${id}`];
  if (id === 'sem_propostas' && r.x?.pergunta) {
    const y = await executar(r.qw.id, { texto: 'Seguem as três propostas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) }, 'exec_retomada', r.x.conv);
    registro('lacuna_retomada', y, { perguntaDeNovo: y.pergunta, precos: ['182.000', '158.500', '205.900'].every(v => y.texto.includes(v)) }); R.lacunas.retomada = R.execucoes.lacuna_retomada;
  }
}

// ---- classes de modelo (configuração da empresa fictícia; o Quick Win fixa a classe) ----------------------------
}
log('\n[5] classes');
await ana.put('/api/admin/modelos-config', { acessoPerfis: { avancado: { todos: true, grupos: [], areas: [] } } });
const padroes = (await ana.get('/api/admin/modelos')).dados.config.padroes;
R.padroesClasse = { rapido: padroes.rapido, equilibrado: padroes.equilibrado, avancado: padroes.avancado };
R.classesDistintas = new Set(Object.values(R.padroesClasse)).size === 3;
const AMOSTRA = [['contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', { texto: 'Contrato anexo (fictício).', anexos: [arquivo('contrato-qa.docx', docx(CONTRATO))] }],
  ['fornecedores', 'Compare três propostas de fornecedores considerando preço, prazo, escopo e risco.', { texto: 'Propostas anexas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) }],
  ['pesquisa', 'Pesquise tendências recentes de gestão documental digital na mineração e resuma as três mais relevantes.', { texto: 'Execute agora.' }],
  ['reuniao', 'Transforme esta reunião em ata, decisões, responsáveis e próximos passos.', { texto: TRANSCRICAO.join('\n') }],
  ['social', 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.', { texto: 'Tema (fictício): lançamento do módulo de compliance documental.' }]];
if (R.classesDistintas && !R.interrompido) for (const [id, pedido, corpo] of AMOSTRA) {
  if (R.interrompido) break;
  if (SELECAO_CLASSES && !['rapido', 'equilibrado', 'avancado'].some(c => SELECAO_CLASSES.has(`${c}/${id}`))) continue;
  const it = await interpretar(pedido); const qw = await criar(pedido, it);
  for (const classe of ['rapido', 'equilibrado', 'avancado']) {
    if (R.interrompido) break;
    if (SELECAO_CLASSES && !SELECAO_CLASSES.has(`${classe}/${id}`)) continue;
    const up = await ana.put(`/api/quick-wins/${qw.id}`, { modelo: `classe:${classe}`, pode_trocar: false });
    const x = await executar(qw.id, corpo, `classe_${classe}_${id}`);
    writeFileSync(join(SAIDA, `classe-${classe}-${id}.md`), x.texto);
    (R.classes[classe] ??= {})[id] = { ajuste: up.status, configurado: padroes[classe], pedido: x.pedido, usados: x.modelos, ms: x.ms, custo: x.custo, status: x.status, roteamento: x.roteamento, http: x.http, erroCodigo: x.erroCodigo, erroDetalhes: x.erroDetalhes, qualidade: x.qualidade, pergunta: x.pergunta, fontes: x.fontes, entregaveis: x.qualidade?.entregaveis || null, fases: x.fases, falhas: ISOLADO ? falhasDaEntrega(x) : [], requerRevisao: true };
    log('classe', classe, id, x.pedido, '→', x.modelos.join(','), x.status, `${x.ms}ms`, mostrarCusto(x.custo)); salvar();
  }
} else R.classes = R.interrompido ? 'NAO_EXECUTADO — rodada interrompida' : 'NAO_COBERTO — as classes não resolvem para modelos distintos';

// ---- QA-04, performance e custo --------------------------------------------------------------------------------
const web = chamadas.filter(c => c.web);
R.qa04 = { buscas: web.length, comInterno: web.filter(c => c.interno).length, comDadoParaFora: web.filter(c => c.dadoParaFora).length, soDuasMensagens: web.every(c => c.mensagens === 2),
  linhasPermitidas: [...new Set(web.flatMap(c => c.linhasConsulta))] };
const por = t => chamadas.filter(c => c.tipo === t);
R.performance = Object.fromEntries(['interpretacao', 'execucao', 'coleta', 'conferencia', 'correcao', 'autonomia'].map(t => [t, { ms: resumo(por(t).map(c => c.ms || 0)), custo: resumo(por(t).map(c => c.custo).filter(Number.isFinite)), custosPendentes: por(t).filter(c => c.custo === null).length }]));
R.performance.total_execucao = { ms: resumo(Object.values(R.execucoes).filter(x => x.ms).map(x => x.ms)), custo: resumo(Object.values(R.execucoes).filter(x => x.custo != null).map(x => x.custo)) };
R.custoTotal = consolidarRecibos(chamadas).custoTotalUsd; R.chamadas = chamadas.length; R.falhasHttp = chamadas.filter(c => c.status && c.status !== 200).length;
salvar();
log(`\nFim. ${chamadas.length} chamadas. Custo confirmado: US$${consolidarRecibos(chamadas).custoConfirmadoUsd.toFixed(4)}; total: ${R.custoTotal === null ? 'PENDENTE' : R.custoTotal}. Relatório em ${join(SAIDA, 'relatorio.json')}`);
if (ISOLADO && (R.interrompido || R.erros.length || R.falhasHttp || R.custoTotal === null || !chamadas.length || !R.classesDistintas || R.homologacao.principais.length !== SMOKE15.length || R.homologacao.surpresa.length !== SURPRESA10.length || [...R.homologacao.principais, ...R.homologacao.surpresa].some(c => c.estado !== 'fora_desta_rodada' && !c.utilizavel) || Object.values(R.classes).some(classe => Object.values(classe).some(c => c.falhas?.length)))) process.exitCode = 2;
await encerrar();

async function encerrar() {
  // A chave fica só no banco temporário desta rodada, que é apagado agora.
  await esperar().catch(() => {}); await S.fechar(); await falso?.fechar(); rmSync(pasta, { recursive: true, force: true });
}
