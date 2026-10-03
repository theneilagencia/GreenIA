// Sessão de QA em produção (genérica): login normal por OTP UMA vez e um laço de comandos que roda módulos de
// teste (scripts/qa-modulos/*.mjs) na MESMA sessão, sem novo código. Nada de bypass: é o fluxo da tela.
//
//   QA_BASE=https://<endereço> QA_EMPRESA=<slug> QA_CODIGO_FIFO=/fifo QA_COMANDOS=/fifo2 node scripts/qa-sessao.mjs
//
// O código chega pelo FIFO e vai direto para o login (não é impresso, guardado nem repetido). Cookie e CSRF ficam só
// na memória deste processo; o módulo de tela recebe os cookies para o navegador local, também só em memória.
// Comandos (um por escrita no FIFO de comandos): rodar <modulo> [args...] | sair
// Saída: qa-producao-saida/<nome>-<data>/ (relatórios JSON por módulo, prévias; sem segredo nem conteúdo sensível).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = String(process.env.QA_BASE || '').replace(/\/$/, ''), EMPRESA = process.env.QA_EMPRESA || '', FIFO = process.env.QA_CODIGO_FIFO || '';
const CONTA = (process.env.QA_CONTA || 'vinicius@apymine.com').toLowerCase();
if (!BASE || !FIFO || !process.env.QA_COMANDOS) { console.log('Informe QA_BASE, QA_CODIGO_FIFO e QA_COMANDOS.'); process.exit(1); }
const RAIZ = join(process.cwd(), 'qa-producao-saida', `${process.env.QA_NOME || 'sessao'}-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(RAIZ, { recursive: true });
const log = (...a) => console.log(...a);
const CHAMADAS = [];   // endpoint, status e duração (sem conteúdo), para correlacionar e medir

const jar = new Map(); let csrf = '';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 GreenIA-QA';
const rotulo = c => c.replace(/\d+/g, ':n').replace(/[?].*$/, '');
async function pedir(metodo, caminho, corpo, redirecionar = 'follow') {
  const t0 = performance.now();
  const r = await fetch(BASE + caminho, { method: metodo, redirect: redirecionar, headers: { 'user-agent': UA, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' && csrf ? { 'x-csrf': csrf } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
  if (!caminho.startsWith('/api/login')) CHAMADAS.push({ em: new Date().toISOString(), metodo, rota: rotulo(caminho), status: r.status, ms: Math.round(performance.now() - t0) });
  return r;
}
const ciencia = async () => { const p = await (await pedir('GET', '/api/politica')).json(); await pedir('POST', '/api/politica/ciencia', { versao: p.versao }); };
async function api(metodo, caminho, corpo) {
  let r = await pedir(metodo, caminho, corpo); if (r.status === 428) { await ciencia(); r = await pedir(metodo, caminho, corpo); }
  const t = await r.text(); let dados; try { dados = JSON.parse(t); } catch { dados = t; }
  return { status: r.status, dados };
}
async function binario(caminho) {
  const t0 = performance.now(), r = await pedir('GET', caminho);
  return { status: r.status, tipo: r.headers.get('content-type'), disposicao: r.headers.get('content-disposition'), dados: Buffer.from(await r.arrayBuffer()), ms: Math.round(performance.now() - t0) };
}
// Envio de mensagem (stream NDJSON): linhas com o tempo de chegada de cada uma.
async function enviar(convId, corpo) {
  const t0 = performance.now(), linhas = [];
  for (let i = 0; ; i++) {
    let r = await pedir('POST', `/api/conversas/${convId}/mensagens`, corpo); if (r.status === 428) { await ciencia(); r = await pedir('POST', `/api/conversas/${convId}/mensagens`, corpo); }
    if (r.status === 429 && i < 3) { log('   (limite de rajada: aguardando 65 s)'); await new Promise(ok => setTimeout(ok, 65e3)); continue; }
    if (!r.headers.get('content-type')?.includes('ndjson')) return { status: r.status, erro: (await r.text()).slice(0, 300), linhas, ms: Math.round(performance.now() - t0) };
    const dec = new TextDecoder(); let resto = '';
    for await (const pedaco of r.body) { resto += dec.decode(pedaco, { stream: true }); const ls = resto.split('\n'); resto = ls.pop();
      for (const l of ls) if (l.trim()) { try { linhas.push({ ms: Math.round(performance.now() - t0), ...JSON.parse(l) }); } catch {} } }
    return { status: r.status, linhas, ms: Math.round(performance.now() - t0) };
  }
}
// Cookies para o navegador local (Playwright), só em memória.
const cookiesNavegador = () => { const u = new URL(BASE); return [...jar].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', secure: u.protocol === 'https:', httpOnly: true, sameSite: 'Lax' })); };

if (EMPRESA) await pedir('GET', `/${EMPRESA}/entrar`, undefined, 'manual');
if (process.env.QA_CODIGO_JA_PEDIDO !== '1') {
  const c = await pedir('POST', '/api/login/codigo', { email: CONTA });
  if (c.status !== 200) { log('CODIGO_NAO_SOLICITADO', c.status); process.exit(1); }
  log('CODIGO_SOLICITADO');
}
const e = await pedir('POST', '/api/login/entrar', { email: CONTA, codigo: readFileSync(FIFO, 'utf8').trim() });
const d = await e.json().catch(() => ({}));
if (e.status !== 200) { log('LOGIN_RECUSADO', e.status, String(d.mensagem || d.erro || '').slice(0, 200)); process.exit(1); }
csrf = d.csrf; await ciencia().catch(() => {});
const eu = (await api('GET', '/api/eu')).dados;
if (String(eu.pessoa?.email).toLowerCase() !== CONTA) { log('Conta inesperada. Parando.'); process.exit(1); }
log('LOGIN_QA_CONCLUIDO=true', 'admin=' + !!eu.pessoa?.admin);

// Estado compartilhado entre módulos (o que foi criado nesta sessão, para a limpeza).
const estado = { criados: { quick_wins: [], conectores: [] }, conversas: {}, casos: {} };
const ctx = {
  BASE, EMPRESA, CONTA, RAIZ, eu, api, pedir, enviar, binario, log, estado, cookiesNavegador, chamadas: CHAMADAS,
  salvar: (nome, obj) => writeFileSync(join(RAIZ, `${nome}.json`), JSON.stringify(obj, null, 2)),
  arquivo: (nome, dados) => writeFileSync(join(RAIZ, nome), dados),
  pasta: nome => { const p = join(RAIZ, nome); mkdirSync(p, { recursive: true }); return p; },
};
const { readFile } = await import('node:fs/promises');
const vivo = setInterval(() => api('GET', '/api/eu').catch(() => {}), 4 * 60e3);
for (;;) {
  log('PRONTO');
  const [cmd, mod, ...args] = (await readFile(process.env.QA_COMANDOS, 'utf8')).trim().split(/\s+/);
  try {
    if (cmd === 'rodar') {
      const arq = join(process.cwd(), 'scripts', 'qa-modulos', `${String(mod).replace(/[^\w-]/g, '')}.mjs`);
      if (!existsSync(arq)) { log('MODULO_INEXISTENTE'); continue; }
      const m = await import(`${pathToFileURL(arq).href}?v=${Date.now()}`);
      const t0 = Date.now();
      await m.default(ctx, ...args);
      ctx.salvar('chamadas', CHAMADAS);
      log(`MODULO_FIM ${mod} ${Math.round((Date.now() - t0) / 1000)}s`);
    } else if (cmd === 'sair') { await api('POST', '/api/sair', {}).catch(() => {}); clearInterval(vivo); ctx.salvar('chamadas', CHAMADAS); log('SESSAO_ENCERRADA'); process.exit(0); }
    else log('COMANDO_DESCONHECIDO');
  } catch (err) { log('ERRO_COMANDO', String(err.stack || err.message || err).slice(0, 600)); }
}
