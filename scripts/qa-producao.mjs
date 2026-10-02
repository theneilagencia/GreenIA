// QA dos Quick Wins com IA real, em produção, pelo fluxo de quem usa. Roda na máquina de quem conduz o QA:
//
//   node scripts/qa-producao.mjs                (padrão: https://greenia.theneil.com.br)
//   QA_BASE=https://... QA_CANAL=chrome node scripts/qa-producao.mjs
//
// Abre um navegador COM JANELA. A pessoa entra com o próprio código de acesso, na tela da GreenIA; o script nunca
// lê, pede ou guarda o código, o cookie, o CSRF nem a chave do OpenRouter. Todas as chamadas são feitas DE DENTRO da
// página (fetch da própria aplicação), então a sessão não sai do navegador. Ao final, sai da conta (/api/sair).
//
// O que o script faz em produção: só cria Quick Wins "QA - …" em rascunho (nunca publica para a equipe), executa em
// modo de teste com material 100% fictício, lê o próprio uso (eventos de auditoria, se a conta for admin) e, no
// fim, exclui (exclusão lógica) só os Quick Wins que ELE criou nesta rodada. Não altera configuração da empresa,
// modelos, chave, créditos, plano, nem Quick Wins existentes.
//
// Saída: qa-producao-saida/<data>/relatorio.json (métricas e verificações, sem conteúdo sensível) e um .md por
// execução com o texto do resultado (material fictício). Nada disso tem segredo.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { arquivo, docx, xlsx } from '../test/arquivos.js';
import { BATERIA, SURPRESA, CONTRATO, PROPOSTAS, TRANSCRICAO, CVS, planilha } from './qa-cenarios.mjs';

// QA_AUTOTESTE=1: só para conferir o roteiro — sobe a GreenIA local com OpenRouter falso, navegador sem janela e
// login automático da conta LOCAL. Nunca toca a produção nem a IA real.
const AUTOTESTE = process.env.QA_AUTOTESTE === '1';
const local = AUTOTESTE ? await (async () => {
  const { subir } = await import('../test/ajuda.js'), { openRouterFalso } = await import('../test/openrouter-falso.js'), { salvarConfig } = await import('../src/config.js');
  const OR = await openRouterFalso({ responder: b => (JSON.stringify(b.messages[0].content).includes('conferente') ? '{"criterios":[]}' : '## Resultado\nTexto fictício.') });
  const S = await subir({ ia: OR.ia }); salvarConfig(S.app.db, { dominios: ['apymine.com'] });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  const a = (await admin.post('/api/admin/areas', { nome: 'QA' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'viniicus@apymine.com', nome: 'QA', areas: [{ id: a.id, responsavel: true }] });
  return { S, OR };
})() : null;
const BASE = (AUTOTESTE ? local.S.base : process.env.QA_BASE || 'https://greenia.theneil.com.br').replace(/\/$/, '');
const CONTA = process.env.QA_CONTA || 'vinicius@apymine.com';
const EMPRESA = process.env.QA_EMPRESA || '';
// QA_CODIGO_FIFO: o código de acesso chega por um canal local (FIFO) e vai direto para o campo da tela de login;
// o script não o imprime, não o guarda e não o reutiliza. Nesse modo o navegador é sem janela.
const FIFO = process.env.QA_CODIGO_FIFO || '';
const RODADA = new Date().toISOString().replace(/[:.]/g, '-');
const SAIDA = join(process.cwd(), 'qa-producao-saida', RODADA); mkdirSync(SAIDA, { recursive: true });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const mediana = l => { const s = [...l].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const R = { autoteste: AUTOTESTE, base: BASE, conta: CONTA, rodada: RODADA, interpretacoes: [], surpresa: [], execucoes: {}, classes: {}, lacunas: {}, exclusao: {}, criados: [], erros: [] };
const salvar = () => writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify(R, null, 2));
const log = (...a) => console.log(...a);

// ---- sessão --------------------------------------------------------------------------------------------------
// QA_MODO_API=1: sem navegador (onde o navegador não confia no certificado do proxy da rede). Mesmo fluxo da tela:
// abre o endereço da empresa, pede o código, entra com ele e segue com a sessão só na memória deste processo.
const MODO_API = process.env.QA_MODO_API === '1';
let navegador = null, pagina = null, api, enviar;
if (MODO_API) {
  const jar = new Map(); let csrf = '';
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 GreenIA-QA';
  const pedir = async (metodo, caminho, corpo, redirecionar = 'follow') => {
    const r = await fetch(BASE + caminho, { method: metodo, redirect: redirecionar, headers: { 'user-agent': UA, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' && csrf ? { 'x-csrf': csrf } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
    return r;
  };
  const ciencia = async () => { const p = await (await pedir('GET', '/api/politica')).json(); await pedir('POST', '/api/politica/ciencia', { versao: p.versao }); };
  api = async (metodo, caminho, corpo) => {
    let r = await pedir(metodo, caminho, corpo); if (r.status === 428) { await ciencia(); r = await pedir(metodo, caminho, corpo); }
    const t = await r.text(); let dados; try { dados = JSON.parse(t); } catch { dados = t; }
    return { status: r.status, dados };
  };
  enviar = async (convId, corpo) => {
    const t0 = performance.now(), linhas = [];
    let r = await pedir('POST', `/api/conversas/${convId}/mensagens`, corpo); if (r.status === 428) { await ciencia(); r = await pedir('POST', `/api/conversas/${convId}/mensagens`, corpo); }
    if (!r.headers.get('content-type')?.includes('ndjson')) return { status: r.status, erro: await r.text(), ms: performance.now() - t0 };
    const dec = new TextDecoder(); let resto = '';
    for await (const pedaco of r.body) { resto += dec.decode(pedaco, { stream: true }); const ls = resto.split('\n'); resto = ls.pop();
      for (const l of ls) if (l.trim()) { try { linhas.push({ ms: performance.now() - t0, ...JSON.parse(l) }); } catch {} } }
    return { status: r.status, linhas, ms: performance.now() - t0 };
  };
  if (EMPRESA) await pedir('GET', `/${EMPRESA}/entrar`, undefined, 'manual');
  const c = await pedir('POST', '/api/login/codigo', { email: CONTA });
  if (c.status !== 200) { log('CODIGO_NAO_SOLICITADO', c.status, (await c.text()).slice(0, 200)); process.exit(1); }
  log('CODIGO_SOLICITADO');
  const { readFileSync } = await import('node:fs');
  const e = await pedir('POST', '/api/login/entrar', { email: CONTA, codigo: readFileSync(FIFO, 'utf8').trim() });   // bloqueia até o código chegar pelo canal local
  const d = await e.json().catch(() => ({}));
  if (e.status !== 200) { log('LOGIN_RECUSADO', e.status, String(d.mensagem || d.erro || '').slice(0, 200)); process.exit(1); }
  csrf = d.csrf;
  await ciencia().catch(() => {});
} else {
// ---- navegador com janela; a pessoa entra -------------------------------------------------------------------
const opcoes = { headless: AUTOTESTE || !!FIFO, ...(process.env.CHROMIUM && existsSync(process.env.CHROMIUM) ? { executablePath: process.env.CHROMIUM } : { channel: process.env.QA_CANAL || 'chrome' }) };
navegador = await chromium.launch(opcoes);
pagina = await (await navegador.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
await pagina.goto(EMPRESA ? `${BASE}/${EMPRESA}/entrar` : `${BASE}/entrar`);
log(`\nLOGIN_QA_NECESSARIO — conta ${CONTA}: entre pela janela que abriu (o código vai para o seu e-mail).`);
if (AUTOTESTE) { await pagina.fill('#email', CONTA); await pagina.click('#btn-email'); await pagina.waitForSelector('#codigo', { state: 'visible' });
  await pagina.fill('#codigo', /(\d{6})/.exec(local.S.app.email.enviados.filter(m => m.para === CONTA).at(-1).assunto)[1]); await pagina.click('#btn-codigo'); }
if (FIFO) {
  const { readFileSync } = await import('node:fs');
  await pagina.fill('#email', CONTA); await pagina.click('#btn-email');
  const ok = await pagina.waitForSelector('#codigo', { state: 'visible', timeout: 30e3 }).then(() => true).catch(() => false);
  if (!ok) { log('CODIGO_NAO_SOLICITADO', (await pagina.textContent('body')).replace(/\s+/g, ' ').slice(0, 300)); await navegador?.close(); process.exit(1); }
  log('CODIGO_SOLICITADO');
  const codigo = readFileSync(FIFO, 'utf8').trim();   // bloqueia até o código chegar pelo canal local
  await pagina.fill('#codigo', codigo); await pagina.click('#btn-codigo');
}
await pagina.waitForURL(/\/app(\b|#|\/|$)/, { timeout: 15 * 60e3 });
// Ciência da política, se a tela pedir (é o fluxo normal da aplicação).
const ciencia = await pagina.waitForSelector('#dar-ciencia', { timeout: 4000 }).catch(() => null);
if (ciencia) await ciencia.click();

// Chamada pela própria página: o cookie e o CSRF ficam no navegador e nunca voltam para o script.
api = async function (metodo, caminho, corpo) {
  return pagina.evaluate(async ({ metodo, caminho, corpo }) => {
    if (!window.__qaCsrf) window.__qaCsrf = (await (await fetch('/api/eu', { credentials: 'same-origin' })).json()).csrf;
    const ir = () => fetch(caminho, { method: metodo, credentials: 'same-origin', headers: { ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' ? { 'x-csrf': window.__qaCsrf } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    let r = await ir();
    if (r.status === 428) { const p = await (await fetch('/api/politica', { credentials: 'same-origin' })).json(); await fetch('/api/politica/ciencia', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf': window.__qaCsrf }, body: JSON.stringify({ versao: p.versao }) }); r = await ir(); }
    const t = await r.text(); let dados; try { dados = JSON.parse(t); } catch { dados = t; }
    return { status: r.status, dados };
  }, { metodo, caminho, corpo });
}
// Envio de mensagem (resposta em linhas JSON), com o instante de cada etapa para medir coleta, produção e conferência.
enviar = async function (convId, corpo) {
  return pagina.evaluate(async ({ convId, corpo }) => {
    const t0 = performance.now(), linhas = [];
    const ir = () => fetch(`/api/conversas/${convId}/mensagens`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf': window.__qaCsrf }, body: JSON.stringify(corpo) });
    let r = await ir();
    if (r.status === 428) { const p = await (await fetch('/api/politica', { credentials: 'same-origin' })).json(); await fetch('/api/politica/ciencia', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf': window.__qaCsrf }, body: JSON.stringify({ versao: p.versao }) }); r = await ir(); }
    if (!r.headers.get('content-type')?.includes('ndjson')) return { status: r.status, erro: await r.text(), ms: performance.now() - t0 };
    const leitor = r.body.getReader(), dec = new TextDecoder(); let resto = '';
    for (;;) { const { value, done } = await leitor.read(); if (done) break; resto += dec.decode(value, { stream: true }); const ls = resto.split('\n'); resto = ls.pop();
      for (const l of ls) if (l.trim()) { try { linhas.push({ ms: performance.now() - t0, ...JSON.parse(l) }); } catch {} } }
    return { status: r.status, linhas, ms: performance.now() - t0 };
  }, { convId, corpo });
}
}

const eu = (await api('GET', '/api/eu')).dados;
log('LOGIN_QA_CONCLUIDO=true');
R.login = { concluido: true, empresa: EMPRESA || (pagina ? new URL(pagina.url()).pathname.split('/').filter(Boolean)[0] : null) || null, admin: !!eu.pessoa?.admin, emailCorreto: norm(eu.pessoa?.email) === norm(CONTA) };
if (!R.login.emailCorreto) { R.erros.push('a sessão aberta não é da conta autorizada'); salvar(); log('A conta logada não é a autorizada para o QA. Parando.'); await navegador?.close(); process.exit(1); }
R.credencial = eu.iaConfigurada === true;
log(`OPENROUTER_CREDENTIAL_CONFIGURED=${R.credencial}`);
if (!R.credencial) { salvar(); log('A chave precisa ser configurada pela própria interface da GreenIA. Parando.'); await navegador?.close(); process.exit(0); }

// Área onde a conta pode criar (o Quick Win fica em rascunho, nunca publicado).
const perm = eu.quickWins || {};
const destino = perm.areas?.length ? { areas: [perm.areas[0].id] } : perm.todaEmpresa ? { toda_empresa: true } : null;
if (!perm.criar || !destino) { R.erros.push('a conta não pode criar Quick Wins'); salvar(); log('A conta não pode criar Quick Wins. Parando.'); await navegador?.close(); process.exit(1); }
// Modelos de cada classe (configuração da empresa, só leitura; precisa de admin).
const modelos = R.login.admin ? (await api('GET', '/api/admin/modelos')).dados?.config?.padroes : null;
R.padroesClasse = modelos ? { rapido: modelos.rapido, equilibrado: modelos.equilibrado, avancado: modelos.avancado } : 'nao_observavel_sem_admin';
const eventosDesde = new Date(Date.now() - 60e3).toISOString().slice(0, 10);
const custoDe = async () => {
  if (!R.login.admin) return null;
  const r = await api('GET', `/api/admin/eventos?tipo=credits.consumed&de=${eventosDesde}`);
  return Array.isArray(r.dados?.eventos) ? r.dados.eventos.map(e => ({ id: e.id, em: e.em, ...(typeof e.detalhes === 'string' ? JSON.parse(e.detalhes) : e.detalhes || {}) })) : null;
};

// ---- interpretação, criação e execução ------------------------------------------------------------------------
async function interpretar(descricao) {
  const t0 = Date.now(), r = await api('POST', '/api/quick-wins/assistente/interpretar', { descricao });
  // e1088fe não tem a interpretação pela IA (entrou depois, no motor generalista do candidato).
  if (r.status === 404) return { ms: Date.now() - t0, status: 404, fonte: 'inexistente_em_producao' };
  return { ms: Date.now() - t0, status: r.status, ...r.dados };
}
async function criar(nome, descricao, it) {
  const assistente = it.operacao ? { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } } : { descricao };
  const r = await api('POST', '/api/quick-wins', { nome: `QA - ${nome}`, ...destino, assistente });
  if (r.status !== 200) throw new Error(`criação ${r.status}: ${JSON.stringify(r.dados).slice(0, 200)}`);
  R.criados.push(r.dados.id); salvar();
  // O assistente dá um nome automático; o prefixo "QA - " identifica o artefato de teste (e é conferido antes de excluir).
  const nomeQa = `QA - ${nome}`;
  await api('PUT', `/api/quick-wins/${r.dados.id}`, { nome: nomeQa });
  const conf = (await api('GET', `/api/quick-wins/${r.dados.id}`)).dados;
  if (!String(conf?.nome).startsWith('QA - ')) R.erros.push(`Quick Win ${r.dados.id} sem o prefixo QA no nome`);
  return r.dados;
}
async function executar(qwId, corpo, conv = null) {
  conv ??= (await api('POST', '/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  (R.conversas ??= {})[qwId] ??= conv.id;
  // O limite de rajada da aplicação (mensagens por minuto por pessoa) vale também para o QA: espera e repete.
  let r;
  for (let i = 0; ; i++) { r = await enviar(conv.id, { executar_quick_win: true, ...corpo }); if (r.status !== 429 || i >= 3) break; log('   (limite de rajada: aguardando 65 s)'); await new Promise(ok => setTimeout(ok, 65e3)); }
  const texto = (r.linhas || []).filter(l => l.t === 'texto').map(l => l.v).join('');
  const fim = (r.linhas || []).find(l => l.t === 'fim');
  const etapa = v => (r.linhas || []).find(l => l.t === 'etapa' && l.v.startsWith(v))?.ms ?? null;
  const tempos = { total: r.ms, coleta: etapa('Pesquisando') != null && etapa('Organizando') != null ? etapa('Organizando') - etapa('Pesquisando') : null,
    conferencia: etapa('Conferindo') != null ? (fim?.ms ?? r.ms) - etapa('Conferindo') : null };
  return { conv, status: r.status, erro: r.erro || (r.linhas || []).find(l => l.t === 'erro')?.mensagem || null, texto, fim, qualidade: fim?.qualidade || null,
    fontes: (fim?.fontes || []).filter(f => f && f.url).map(f => f.url), modelo: fim?.modelo || null, classe: fim?.classe || null, pergunta: texto.trim().startsWith('Antes de começar, preciso de uma informação:'), tempos };
}
const resumoOp = op => ({ entradas: (op?.entradas || []).map(x => `${x.tipo}${x.quantidade > 1 ? `x${x.quantidade}` : ''}${x.obrigatoria === false ? '?' : ''}:${x.rotulo}`),
  etapas: (op?.etapas || []).length, ferramentas: op?.ferramentas || [], lacunas: (op?.lacunas || []).map(l => `${l.obrigatoria ? '!' : ''}${l.pergunta}`), sugestoes: (op?.sugestoes || []).length,
  entregaveis: (op?.entregaveis || []).map(e => `${e.canal ? `${e.canal}·` : ''}${e.rotulo || e.tipo}${e.config?.colunas?.length ? `[${e.config.colunas.join('|')}]` : ''}`) });
function avaliarPlano(it, esp) {
  const op = it.operacao || {}, ent = op.entradas || [], entg = op.entregaveis || [], ferr = op.ferramentas || [], lac = [...(op.lacunas || []), ...(it.lacunas || [])];
  const t = norm(entg.map(e => `${e.tipo} ${e.rotulo || ''} ${e.config?.detalhe || ''} ${(e.config?.colunas || []).join(' ')}`).join(' | '));
  const f = [];
  if (it.status !== 200) f.push(`http ${it.status}`);
  if (esp.entrada && !ent.some(e => new RegExp(esp.entrada).test(e.tipo))) f.push(`entrada ${esp.entrada} [${ent.map(e => e.tipo)}]`);
  if (esp.qtd && !ent.some(e => e.quantidade === esp.qtd)) f.push(`quantidade ${esp.qtd}`);
  if (esp.obrigatoria && !ent.some(e => e.obrigatoria !== false)) f.push('material não obrigatório');
  if (esp.ferramenta && !ferr.includes(esp.ferramenta)) f.push(`ferramenta ${esp.ferramenta}`);
  if (esp.semFerramenta && ferr.includes(esp.semFerramenta)) f.push(`${esp.semFerramenta} indevida`);
  for (const i of esp.itens || []) if (!new RegExp(i).test(t)) f.push(`~${i}`);
  if (esp.canais) for (const c of esp.canais) if (!entg.some(e => e.canal === c)) f.push(`canal ${c}`);
  if (!esp.canais && entg.some(e => e.canal)) f.push('canal indevido');
  if (esp.vago && !(lac.some(l => l.obrigatoria) || ent.some(e => e.obrigatoria !== false))) f.push('vago sem pergunta');
  if (!entg.length && !lac.length) f.push('plano vazio');
  if (it.fonte === 'inexistente_em_producao') return { resultado: 'NAO_EXISTE_EM_PRODUCAO', falhas: [] };
  return { resultado: it.fonte === 'heuristica' ? 'FALLBACK' : f.length ? 'FAIL' : 'PASS', falhas: f };
}

// ---- 1. Smoke test -------------------------------------------------------------------------------------------
log('\n[1] smoke test');
try {
  const pedido = 'Resuma este texto em cinco pontos.';
  const it = await interpretar(pedido); const qw = await criar('Resumo simples', pedido, it);
  const x = await executar(qw.id, { texto: 'Texto fictício para o QA: a Cooperativa Modelo (fictícia) trocou o sistema de pedidos em março. O tempo de separação caiu de 40 para 28 minutos, mas as devoluções subiram 3%. A equipe pediu treinamento e um painel diário. A diretoria quer decidir até junho se amplia o sistema para as outras duas filiais.' });
  const hist = await api('GET', `/api/conversas/${x.conv.id}`);
  R.smoke = { interpretacao: it.fonte, criado: !!qw.id, execucao: x.status, erro: x.erro, checker: x.qualidade?.status || null, pontos: (x.texto.match(/^\s*(\d+[.)]|[-*•])\s+/gm) || []).length, historico: hist.status === 200 && (hist.dados.mensagens || []).length >= 2, ms: x.tempos.total };
  writeFileSync(join(SAIDA, 'smoke.md'), x.texto);
  log('smoke', JSON.stringify(R.smoke));
  if (x.status !== 200 || x.erro || !x.texto) throw new Error(`erro sistêmico no smoke: ${x.erro || x.status}`);
} catch (e) { R.erros.push(String(e.message)); salvar(); log('PAROU:', e.message); await limpar(); await sair(); process.exit(1); }

// ---- 2. Interpretação com IA real (bateria representativa) ---------------------------------------------------
log('\n[2] interpretação com IA real');
for (const [id, pedido, esp] of BATERIA) {
  const it = await interpretar(pedido); const a = avaliarPlano(it, esp);
  R.interpretacoes.push({ id, pedido, fonte: it.fonte, cache: !!it.cache, ms: it.ms, ...a, plano: resumoOp(it.operacao), lacunasTela: (it.lacunas || []).map(l => l.pergunta) });
  log(a.resultado, id, it.fonte, `${it.ms}ms`, a.falhas.join('; '));
  salvar();
}

// ---- 3. Pedidos surpresa (escritos para esta rodada; o motor não muda) -----------------------------------------
log('\n[3] 20 pedidos surpresa');
for (const [id, area, pedido, esp] of SURPRESA) {
  const it = await interpretar(pedido); const a = avaliarPlano(it, esp);
  R.surpresa.push({ id, area, pedido, fonte: it.fonte, ms: it.ms, ...a, plano: resumoOp(it.operacao) });
  log(a.resultado, id, area, `${it.ms}ms`, a.falhas.join('; '));
  salvar();
}

// ---- 4. Execuções reais com material fictício ------------------------------------------------------------------
const marcadores = t => [...new Set(t.match(/\b(Concorrente|Empresa|Player|Competidor)[ \t]+(?:[A-E]|[1-5]|X|Y|Z)\b/g) || [])];
const arquivoSimulado = t => /\.(mp4|mov|avi|webm)\b|\[(link|arquivo|download|v[ií]deo)[^\]]*\]|baixe aqui|link do v[ií]deo|v[ií]deo (gerado|renderizado|pronto)/i.test(t);
async function caso(id, nome, pedido, corpo, checar = () => ({})) {
  try {
    const it = await interpretar(pedido); const qw = await criar(nome, pedido, it);
    const x = await executar(qw.id, corpo);
    writeFileSync(join(SAIDA, `exec-${id}.md`), x.texto);
    R.execucoes[id] = { pedido, interpretacao: it.fonte, status: x.status, erro: x.erro, checker: x.qualidade?.status || null, avisos: x.qualidade?.avisos || [], entregaveis: x.qualidade?.entregaveis || null,
      pesquisa: x.qualidade?.pesquisa || null, objetivo: x.qualidade?.objetivo || null, fontes: x.fontes.length, pergunta: x.pergunta, modelo: x.modelo, classe: x.classe, conv: x.conv.id, tempos: x.tempos, ...checar(x) };
    log('exec', id, R.execucoes[id].checker, x.modelo || '', `${Math.round(x.tempos.total)}ms`, JSON.stringify(checar(x)));
    salvar();
    return { x, qw, it };
  } catch (e) { R.execucoes[id] = { erro: String(e.message) }; salvar(); log('exec', id, 'ERRO', e.message); return {}; }
}
log('\n[4] execuções reais');
await caso('contrato', 'Contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', { texto: 'Analise o contrato anexo (fictício).', anexos: [arquivo('contrato-qa.docx', docx(CONTRATO))] },
  x => ({ riscos: /risco/i.test(x.texto), obrigacoes: /obriga/i.test(x.texto), prazos: /prazo|vig[êe]ncia|24 meses/i.test(x.texto), multas: ['2%', '30%', '5.000'].every(v => x.texto.includes(v)),
    renovacao: /renova/i.test(x.texto), rescisao: /rescis/i.test(x.texto), confidencialidade: /confiden|sigilo/i.test(x.texto),
    clausulaInventada: [...new Set([...x.texto.matchAll(/cl[áa]usula\s+(\d+)/gi)].map(m => Number(m[1])))].filter(n => n < 1 || n > 9) }));
await caso('fornecedores', 'Fornecedores', 'Compare três propostas de fornecedores considerando preço, prazo, escopo e risco.', { texto: 'Compare as três propostas anexas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) },
  x => ({ tres: ['Alfa', 'Beta', 'Gama'].every(n => x.texto.includes(n)), precos: ['182.000', '158.500', '205.900'].every(v => x.texto.includes(v)), prazos: ['30 dias', '45 dias', '20 dias'].every(v => x.texto.includes(v)),
    matriz: /\|.*\|/.test(x.texto), recomendacao: /recomend/i.test(x.texto), fornecedorInventado: /\b(Delta|Ômega|Omega|Épsilon)\b/.test(x.texto) }));
const L = planilha(); const soma = k => L.slice(1).reduce((s, l) => s + (typeof l[k] === 'number' ? l[k] : 0), 0);
await caso('planilha', 'Planilha de custos', 'Analise esta planilha mensal e identifique desvios relevantes, maiores gastos e itens fora do padrão.', { texto: 'Planilha anexa (fictícia).', anexos: [arquivo('custos-qa.xlsx', xlsx(L, 'Custos'))] },
  x => ({ outlierL118: /L118/.test(x.texto), altoL023: /L023/.test(x.texto), baixoL067: /L067/.test(x.texto), vazios: ['L041', 'L077', 'L095', 'L109'].filter(i => x.texto.includes(i)).length,
    totalPrevistoCerto: x.texto.includes(soma(4).toLocaleString('pt-BR')), totalRealizadoCerto: x.texto.includes(soma(5).toLocaleString('pt-BR')), linhas: L.length - 1 }));
await caso('reuniao', 'Reunião', 'Transforme esta reunião em ata, decisões, responsáveis e próximos passos.', { texto: TRANSCRICAO.join('\n') },
  x => { const d = (x.texto.split(/##[^\n]*decis/i)[1] || '').split(/\n##\s/)[0];
    return { ata: /##[^\n]*ata/i.test(x.texto), decisaoTC04: /TC-04|sábado|dia 20/i.test(d), cotacoes: /cota[çc]/i.test(x.texto), opiniaoComoDecisao: /trocar o fornecedor de rolos/i.test(d), pendencia: /or[çc]amento extra/i.test(x.texto) }; });
await caso('relatorio', 'Relatório executivo', 'Prepare um relatório executivo mensal com principais fatos, riscos e decisões necessárias.',
  { texto: ['Indicadores de setembro/2026 (fictícios) — Empresa QA:', 'Receita: R$ 1,92 mi (meta R$ 2,10 mi; agosto R$ 1,85 mi).', 'Chamados de suporte: 318 (agosto: 240); tempo médio de resposta 6,4 h (meta 4 h).', 'Projeto Norte QA: 3 semanas de atraso por falta de acesso ao ambiente do cliente.', 'Decisão pendente: contratar mais 2 analistas de suporte (R$ 28 mil/mês).'].join('\n') },
  x => ({ secoes: (x.texto.match(/^##\s/gm) || []).length, fatos: /fato/i.test(x.texto), riscos: /risco/i.test(x.texto), decisoes: /decis/i.test(x.texto), receita: /1,92/.test(x.texto), chamados: /318/.test(x.texto) }));
// Pesquisa de concorrentes: o perfil público só existe na branch candidata; aqui não se altera a configuração da empresa.
const semPerfil = await caso('pesquisa_sem_perfil', 'Concorrentes', 'Pesquise os principais concorrentes e monte uma matriz de posicionamento.', { texto: 'Execute agora.' },
  x => ({ marcadores: marcadores(x.texto), matriz: /\|.*\|/.test(x.texto) }));
if (semPerfil.x?.pergunta) {   // pausa e retomada na mesma execução
  const y = await executar(semPerfil.qw.id, { texto: 'Software B2B de gestão documental para mineradoras no Brasil.' }, semPerfil.x.conv);
  writeFileSync(join(SAIDA, 'exec-pesquisa_retomada.md'), y.texto);
  R.execucoes.pesquisa_retomada = { checker: y.qualidade?.status || null, fontes: y.fontes.length, perguntaDeNovo: y.pergunta, marcadores: marcadores(y.texto), mesmaConversa: true, tempos: y.tempos, modelo: y.modelo };
  log('exec pesquisa_retomada', JSON.stringify(R.execucoes.pesquisa_retomada)); salvar();
}
await caso('curriculos', 'Currículos', 'Analise estes currículos e monte uma comparação objetiva com base nos requisitos da vaga.', { texto: 'Vaga (fictícia): planejador de manutenção. Requisitos: 4+ anos em planejamento, SAP PM, inglês intermediário.', anexos: CVS.map((c, i) => arquivo(`cv-qa-${i + 1}.docx`, docx(c))) },
  x => ({ tres: ['Candidato A', 'Candidato B', 'Candidato C'].every(c => x.texto.includes(c)), requisitos: /SAP/.test(x.texto), atributoProtegido: /\b(idade|g[êe]nero|sexo|estado civil|etnia|ra[çc]a|religi|gravidez|casad[oa]|solteir[oa])\b/i.test(x.texto) }));
await caso('social', 'Social media', 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.', { texto: 'Tema (fictício): lançamento do módulo de compliance documental da Empresa QA.' },
  x => ({ linkedin: /LinkedIn/.test(x.texto), instagram: /Instagram/.test(x.texto), copy: /copy|legenda/i.test(x.texto), carrossel: /carrossel/i.test(x.texto), reels: /reels/i.test(x.texto) }));
await caso('video_com_campanha', 'Vídeo com campanha', 'Crie o vídeo final desta campanha.', { texto: 'Campanha (fictícia) "Zero acidente na correia": vídeo de 30 segundos para operadores; mensagem central "pare, bloqueie e sinalize antes de intervir".' },
  x => ({ pacote: ['conceito', 'roteiro', 'storyboard|cena', 'locu', 'briefing', 'prompt'].filter(p => new RegExp(p, 'i').test(x.texto)), arquivoSimulado: arquivoSimulado(x.texto) }));
await caso('video_sem_campanha', 'Vídeo sem campanha', 'Crie o vídeo final desta campanha.', { texto: 'Execute agora.' }, x => ({ arquivoSimulado: arquivoSimulado(x.texto) }));
await caso('revise_pesquisa', 'Revise esta pesquisa', 'Revise esta pesquisa.', { texto: 'Pesquisa de clima (fictícia) anexa.', anexos: [arquivo('pesquisa-de-clima-qa.docx', docx(['Pesquisa de clima 2026 (fictícia)', 'Participação: 212 de 260 (81,5%).', 'Favorabilidade: 68% (2025: 71%).', 'Itens com queda: reconhecimento (-9 p.p.).', 'Texto com erros de digitaçao e frases longas demais.']))] },
  x => ({ numerosPreservados: ['212', '81,5', '68%', '71%'].every(v => x.texto.includes(v)), buscouNaInternet: x.fontes.length > 0 || x.qualidade?.pesquisa?.feita === true }));

// ---- 5. Lacunas e pausa -----------------------------------------------------------------------------------------
log('\n[5] lacunas');
for (const [id, pedido, corpo] of [['sem_propostas', 'Compare os três fornecedores.', { texto: 'Faça a comparação.' }], ['sem_contrato', 'Analise o contrato.', { texto: 'Faça agora.' }], ['refaca', 'Faça isso de novo, mas melhor.', { texto: 'Execute.' }]]) {
  const r = await caso(`lacuna_${id}`, `Lacuna ${id}`, pedido, corpo, x => ({ pediuMaterial: x.pergunta || /envie|anexe|preciso d|falt|qual/i.test(x.texto.slice(0, 400)), inventouTabela: !x.pergunta && /\|.*\|.*\|/.test(x.texto) }));
  R.lacunas[id] = R.execucoes[`lacuna_${id}`];
  if (id === 'sem_propostas' && r.x?.pergunta) {   // retomada: as propostas chegam na mesma conversa
    const y = await executar(r.qw.id, { texto: 'Seguem as três propostas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) }, r.x.conv);
    R.lacunas.retomada = { checker: y.qualidade?.status || null, perguntaDeNovo: y.pergunta, precos: ['182.000', '158.500', '205.900'].every(v => y.texto.includes(v)) };
    log('retomada', JSON.stringify(R.lacunas.retomada)); salvar();
  }
}

// ---- 6. Classes de modelo (o Quick Win de QA fixa a classe; a configuração da empresa não muda) ---------------
log('\n[6] classes');
const distintas = modelos && new Set([modelos.rapido, modelos.equilibrado, modelos.avancado]).size === 3;
R.classesDistintas = modelos ? distintas : 'nao_observavel_sem_admin';
const AMOSTRA = [['contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', { texto: 'Contrato anexo (fictício).', anexos: [arquivo('contrato-qa.docx', docx(CONTRATO))] }],
  ['fornecedores', 'Compare três propostas de fornecedores considerando preço, prazo, escopo e risco.', { texto: 'Propostas anexas (fictícias).', anexos: PROPOSTAS.map((p, i) => arquivo(`proposta-qa-${i + 1}.docx`, docx(p))) }],
  ['pesquisa', 'Pesquise tendências recentes de gestão documental digital na mineração e resuma as três mais relevantes.', { texto: 'Execute agora.' }],
  ['reuniao', 'Transforme esta reunião em ata, decisões, responsáveis e próximos passos.', { texto: TRANSCRICAO.join('\n') }],
  ['social', 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.', { texto: 'Tema (fictício): lançamento do módulo de compliance documental.' }]];
if (distintas || !modelos) {
  for (const [id, pedido, corpo] of AMOSTRA) {
    const it = await interpretar(pedido); const qw = await criar(`Classe ${id}`, pedido, it);
    for (const classe of ['rapido', 'equilibrado', 'avancado']) {
      const up = await api('PUT', `/api/quick-wins/${qw.id}`, { modelo: `classe:${classe}`, pode_trocar: false });
      const x = await executar(qw.id, corpo);
      writeFileSync(join(SAIDA, `classe-${classe}-${id}.md`), x.texto);
      (R.classes[classe] ??= {})[id] = { ajuste: up.status, esperado: modelos?.[classe] || null, modelo: x.modelo, classeResposta: x.classe, ms: x.tempos.total, checker: x.qualidade?.status || null, entregaveis: x.qualidade?.entregaveis || null, conv: x.conv.id, erro: x.erro };
      log('classe', classe, id, x.modelo || '?', x.qualidade?.status, `${Math.round(x.tempos.total)}ms`); salvar();
    }
  }
} else R.classes = 'NAO_COBERTO — a configuração atual resolve as classes para modelos não distintos';

// ---- 7. Custos (eventos de consumo da própria empresa; só metadados) --------------------------------------------
const eventos = await custoDe();
if (eventos) {
  const conv = new Map(); for (const e of eventos) if (e.conversa) conv.set(e.conversa, (conv.get(e.conversa) || 0) + Number(e.custo || 0));
  const interp = eventos.filter(e => e.origem === 'quick_win_interpretacao').map(e => Number(e.custo || 0));
  for (const x of Object.values(R.execucoes)) if (x?.conv) x.custo = conv.get(x.conv) ?? null;
  for (const c of Object.values(typeof R.classes === 'object' ? R.classes : {})) for (const x of Object.values(c)) x.custo = conv.get(x.conv) ?? null;
  const execs = [...conv.values()];
  R.custos = { interpretacao: { n: interp.length, medio: interp.length ? interp.reduce((a, b) => a + b, 0) / interp.length : null, maximo: interp.length ? Math.max(...interp) : null },
    execucao: { n: execs.length, medio: execs.length ? execs.reduce((a, b) => a + b, 0) / execs.length : null, maximo: execs.length ? Math.max(...execs) : null },
    total: eventos.filter(e => R.criados.includes(e.quick_win) || conv.has(e.conversa)).reduce((s, e) => s + Number(e.custo || 0), 0) };
} else R.custos = 'nao_observavel_sem_admin';
const tI = [...R.interpretacoes, ...R.surpresa].map(x => x.ms), tE = Object.values(R.execucoes).filter(x => x?.tempos).map(x => x.tempos.total);
const tC = Object.values(R.execucoes).map(x => x?.tempos?.coleta).filter(v => v != null), tQ = Object.values(R.execucoes).map(x => x?.tempos?.conferencia).filter(v => v != null);
R.performance = { interpretacao: { mediana: mediana(tI), maximo: Math.max(...tI) }, execucao_total: { mediana: mediana(tE), maximo: Math.max(...tE) },
  pesquisa: tC.length ? { mediana: mediana(tC), maximo: Math.max(...tC) } : null, checker: tQ.length ? { mediana: mediana(tQ), maximo: Math.max(...tQ) } : null };
salvar();

// ---- 8. Exclusão e limpeza (só o que esta rodada criou) --------------------------------------------------------
await limpar();
await sair();
log(`\nFim. Relatório em ${join(SAIDA, 'relatorio.json')}`);

async function limpar() {
  log('\n[8] exclusão dos Quick Wins "QA - …" desta rodada');
  for (const id of R.criados) {
    const q = (await api('GET', `/api/quick-wins/${id}`)).dados;
    if (!q || !String(q.nome).startsWith('QA - ')) { R.exclusao[id] = 'nao_excluido_nome_nao_confere'; continue; }
    const conv = R.conversas?.[id] ? { id: R.conversas[id] } : null;
    const d = await api('DELETE', `/api/quick-wins/${id}`, {});
    const depois = await api('GET', `/api/quick-wins/${id}`);
    const nova = await api('POST', '/api/conversas', { quick_win_id: id, teste: true });
    const historico = conv ? (await api('GET', `/api/conversas/${conv.id}`)).status : null;
    R.exclusao[id] = { excluido: d.status === 200, someDoCatalogo: depois.status === 404, novaExecucaoBloqueada: nova.status >= 400, historicoPreservado: historico == null ? 'sem_conversa_listada' : historico === 200 };
  }
  salvar();
}
async function sair() { await api('POST', '/api/sair', {}).catch(() => {}); await navegador?.close(); if (local) { await local.S.fechar(); await local.OR.fechar(); } }
