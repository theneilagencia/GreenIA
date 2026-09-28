// Auditoria de responsividade: abre cada tela em várias larguras e aponta rolagem horizontal,
// elementos que passam da borda, alvos de toque pequenos e texto miúdo.
//   node scripts/auditoria-responsiva.js [pasta-de-capturas]
// Sai com código 1 se alguma tela tiver rolagem horizontal ou elemento cortado.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { criarApp } from '../src/servidor.js';
import { criarPlataforma } from '../src/plataforma/servidor.js';
import { salvarConfig } from '../src/config.js';
import { cliente } from './cliente.js';

const PASTA = process.argv[2] || '';
if (PASTA) mkdirSync(PASTA, { recursive: true });
const LARGURAS = [360, 390, 768, 1024, 1440];
const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM].find(p => p && existsSync(p));
const ouvir = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));

// Instalação de uma empresa, com dados para as telas não ficarem vazias.
const app = criarApp({ cookieSeguro: false, log: () => {}, adminEmail: 'admin@empresa-exemplo.com.br' });
const base = await ouvir(app.servidor);
salvarConfig(app.db, { empresa: 'Empresa Exemplo', dominios: ['empresa-exemplo.com.br'] });
const admin = await cliente(app, base).entrar('admin@empresa-exemplo.com.br');
const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
await admin.post('/api/admin/pessoas', { email: 'marina@empresa-exemplo.com.br', nome: 'Marina Costa', areas: [{ id: area, responsavel: true }] });
const marina = await cliente(app, base).entrar('marina@empresa-exemplo.com.br');
const modelos = (await marina.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
const qw = (await marina.post('/api/quick-wins', { modelo_inicial: 0, areas: [area] })).dados;
await marina.put(`/api/quick-wins/${qw.id}`, { status: 'em_uso', problema: 'Conferência manual demorada.', objetivo: 'Conferir em até 10 minutos.' });
const conversa = (await admin.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
await admin.req('POST', `/api/conversas/${conversa.id}/mensagens`, { texto: 'Liste as diferenças em uma tabela com item, pedido, nota e situação' });
void modelos;

// Página de vendas e console da plataforma.
const vendas = criarApp({ cookieSeguro: false, log: () => {}, paginaInicial: 'vendas' });
const baseVendas = await ouvir(vendas.servidor);
const P = criarPlataforma({ cookieSeguro: false, log: () => {}, admins: ['ops@operadora.com'] });
const basePlat = await ouvir(P.servidor);

const navegador = await chromium.launch({ executablePath: CHROMIUM });
const codigoDe = (email, caixa) => /(\d{6})/.exec(caixa.enviados.filter(m => m.para === email).at(-1).assunto)[1];

const sessoes = {};
async function contexto(w) {
  const c = await navegador.newContext({ storageState: sessoes.estado, viewport: { width: w, height: w < 700 ? 780 : 900 }, reducedMotion: 'reduce', hasTouch: w < 700, isMobile: w < 700 });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return c;
}
async function entrarApp(c) {
  const p = await c.newPage();
  if (sessoes.app) { await p.goto(base + '/app'); return p; }
  await p.goto(base + '/entrar'); await p.fill('#email', 'admin@empresa-exemplo.com.br'); await p.click('#btn-email');
  await p.waitForSelector('#codigo', { state: 'visible' }); await p.fill('#codigo', codigoDe('admin@empresa-exemplo.com.br', app.email)); await p.click('#btn-codigo');
  await p.waitForURL(/\/app/);
  const ciencia = await p.waitForSelector('#dar-ciencia', { timeout: 3000 }).catch(() => null);
  if (ciencia) await ciencia.click();
  sessoes.app = true;
  return p;
}
async function entrarConsole(c) {
  const p = await c.newPage();
  if (sessoes.plat) { await p.goto(basePlat + '/plataforma'); return p; }
  await p.goto(basePlat + '/plataforma'); await p.fill('#c-email', 'ops@operadora.com'); await p.click('#f-email button');
  await p.waitForSelector('#c-codigo', { state: 'visible' }); await p.fill('#c-codigo', codigoDe('ops@operadora.com', P.email)); await p.click('#f-codigo button');
  await p.waitForSelector('#lateral .item-lat', { state: 'attached' });
  sessoes.plat = true;
  return p;
}

// Medições dentro da página.
function medir() {
  const vw = document.documentElement.clientWidth;
  const corta = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) return true; } return false; };
  const nome = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
  const visivel = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"],.oculto,.lateral:not(.aberta)'); };
  const fora = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visivel(el) || corta(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) fora.push(`${nome(el)} (${Math.round(r.left)}→${Math.round(r.right)})`);
  }
  const pequenos = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button]')].filter(visivel)
    .filter(el => { const r = el.getBoundingClientRect(); return (r.height < 32 || r.width < 32) && !el.closest('p,li,td') && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'hidden'; })
    .map(el => `${nome(el)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
  const miudos = [...document.querySelectorAll('body *')].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && visivel(el) && parseFloat(getComputedStyle(el).fontSize) < 11.5).map(nome);
  return { rolagem: document.documentElement.scrollWidth - vw, fora: [...new Set(fora)].slice(0, 8), pequenos: [...new Set(pequenos)].slice(0, 8), miudos: [...new Set(miudos)].slice(0, 6) };
}

const APP = ['#/visao-geral', '#/conversas', '#/nova', `#/c/${conversa.id}`, '#/quick-wins', `#/qw/${qw.id}`, '#/conhecimento', '#/uso', '#/pessoas', '#/pessoas/pessoas', '#/pessoas/grupos', '#/modelos', '#/politicas', '#/atividade', '#/configuracoes'];
const CONSOLE = ['#/empresas', '#/usuarios', '#/planos', '#/ambientes', '#/uso', '#/auditoria', '#/configuracoes'];
const problemas = [];
let telas = 0;

async function auditar(p, rotulo, w) {
  await p.waitForTimeout(450);
  const m = await p.evaluate(medir);
  telas++;
  // No app e no console só a área de conteúdo rola; se o documento inteiro rolar, algo vazou da casca.
  if (/^(app|console) /.test(rotulo)) m.vazaVertical = await p.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const grave = m.rolagem > 1 || m.fora.length || m.vazaVertical > 1;
  if (grave || (w < 700 && (m.pequenos.length || m.miudos.length))) problemas.push({ tela: rotulo, largura: w, grave, ...m });
  if (PASTA && w === 360) await p.screenshot({ path: join(PASTA, `${rotulo.replace(/[^a-z0-9]+/gi, '-')}-${w}.png`), fullPage: true });
}

for (const w of LARGURAS) {
  const c = await contexto(w);
  const pub = await c.newPage();
  for (const [rotulo, url] of [['vendas', baseVendas + '/'], ['portal', base + '/'], ['entrar', base + '/entrar'], ['politica', base + '/politica'], ['console-login', basePlat + '/plataforma']]) {
    await pub.goto(url); await auditar(pub, rotulo, w);
  }
  const p = await entrarApp(c);
  for (const h of APP) { await p.goto(base + '/app' + h); await auditar(p, 'app ' + h, w); }
  if (w < 1000) { await p.goto(base + '/app#/visao-geral'); await p.waitForTimeout(300); await p.click('.menu-btn').catch(() => {}); await auditar(p, 'app menu aberto', w); }
  const o = await entrarConsole(c);
  for (const h of CONSOLE) { await o.goto(basePlat + '/plataforma' + h); await auditar(o, 'console ' + h, w); }
  sessoes.estado = await c.storageState();
  await c.close();
}

await navegador.close();
for (const s of [app.servidor, vendas.servidor, P.servidor]) { s.close(); s.closeAllConnections?.(); }
console.log(`${telas} telas auditadas em ${LARGURAS.join(', ')} px.`);
for (const x of problemas) {
  console.log(`\n${x.grave ? '✗' : '·'} ${x.tela} @ ${x.largura}px${x.rolagem > 1 ? `  rolagem horizontal ${x.rolagem}px` : ''}${x.vazaVertical > 1 ? `  página vaza ${x.vazaVertical}px para baixo` : ''}`);
  if (x.fora.length) console.log('   passa da borda:', x.fora.join(', '));
  if (x.pequenos.length) console.log('   toque pequeno:', x.pequenos.join(', '));
  if (x.miudos.length) console.log('   texto < 11,5px:', x.miudos.join(', '));
}
const graves = problemas.filter(x => x.grave).length;
console.log(`\n${graves} tela(s) com rolagem ou corte.`);
process.exit(graves ? 1 : 0);
