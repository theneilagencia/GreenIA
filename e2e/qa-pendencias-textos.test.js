// Pendências do QA de formatação (out/2026): termos internos fora das telas de Perfis e Atividade, cor secundária da
// Marca coerente com a prévia, botão Enviar desabilitado que não parece ativo no tema escuro e a faixa da página de
// apresentação com as ações alinhadas também no console.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, emp, admin;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1366, height = 860, colorScheme = 'light' } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height }, colorScheme });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  return p;
}

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Textos', slug: 'empresa-textos', status: 'ativa', admin_email: 'admin@textos.test' })).dados;
  admin = S.navegador(); await admin.get('/empresa-textos'); await admin.entrarEmpresa('admin@textos.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  const qw = (await admin.post('/api/quick-wins', { modelo_inicial: 0, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qw.id}`, { status: 'em_uso' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('Perfis: permissões e perfis do sistema sem "role", "landing page" nem "quick wins" em minúsculas', async () => {
  const d = (await admin.get('/api/empresa/roles')).dados;
  const textos = [...d.permissoes.map(p => p.description), ...d.roles.filter(r => r.system).map(r => `${r.name} ${r.description}`)];
  for (const t of textos) assert.doesNotMatch(t, /\broles?\b|landing page|quick wins?\b|\busuários\b|\bclasses\b/, t);
  assert.ok(textos.includes('Editar a página de apresentação'));
});

test('Atividade: o detalhe mostra o estado do Quick Win em texto, não o código', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/atividade`);
  await p.waitForSelector('#conteudo table');
  const texto = await p.locator('#conteudo').evaluate(c => { c.querySelectorAll('table details').forEach(d => { d.open = true; }); return [...c.querySelectorAll('table')].map(t => t.innerText).join('\n'); });
  assert.doesNotMatch(texto, /\bem_uso\b|\bem_teste\b|\b[a-z]+\.[a-z_]+_[a-z_]+\b/);
  assert.deepEqual(p.erros, []);
});

test('Marca: sem cor secundária salva, seletor, campo e prévia mostram o mesmo padrão (não a cor principal)', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/empresa/marca`);
  await p.waitForSelector('#mk-secondary_color-sel');
  const r = await p.evaluate(() => ({
    sel: document.querySelector('#mk-secondary_color-sel').value.toLowerCase(),
    dica: document.querySelector('#mk-secondary_color').placeholder.toLowerCase(),
    previa: getComputedStyle(document.querySelector('#mk-previa-s')).backgroundColor,
  }));
  assert.equal(r.sel, '#f3f3f1');
  assert.equal(r.dica, '#f3f3f1');
  assert.equal(r.previa, 'rgb(243, 243, 241)');
});

test('Tema escuro: Enviar desabilitado tem fundo neutro e texto apagado', async () => {
  const p = await pagina(admin, { colorScheme: 'dark' });
  await p.goto(`${S.base}/app#/nova`);
  await p.waitForSelector('.enviar:disabled');
  const c = await p.locator('.enviar:disabled').first().evaluate(b => { const s = getComputedStyle(b); return { fundo: s.backgroundColor, texto: s.color }; });
  const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
  const [r, g, b] = rgb(c.fundo);
  assert.ok(g - Math.min(r, b) < 12, `fundo sem tom verde: ${c.fundo}`);
  assert.notEqual(c.texto, 'rgb(255, 255, 255)', 'texto não fica branco como no botão ativo');
});

test('Console: na página de apresentação, "Ver prévia" e "Ver a página no ar" ficam na mesma linha e centrados', async () => {
  const p = await pagina(ops);
  await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/landing`);
  await p.waitForSelector('.ld-situacao .linha-botoes > *');
  const itens = await p.locator('.ld-situacao .linha-botoes > :is(a,button)').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
  assert.ok(itens.length >= 1);
  for (const y of itens) assert.ok(Math.abs(y - itens[0]) <= 2, JSON.stringify(itens));
  assert.deepEqual(p.erros, []);
});
