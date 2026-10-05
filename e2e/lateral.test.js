// Navegação lateral: Conversas, Quick Wins, Conhecimento e (com permissão) Administração no primeiro nível; conversas
// recentes como subitens de Conversas, no máximo 5, com "Ver todas" quando houver mais. Estresse com 0, 1, 5, 10, 50
// e 100 conversas: Quick Wins e Conhecimento continuam imediatamente visíveis, em desktop e no menu do celular.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { openRouterFalso } from '../test/openrouter-falso.js';

let N, OR, areaId;
before(async () => {
  OR = await openRouterFalso({ responder: () => 'Certo.' });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  areaId = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  for (const e of ['c0', 'c1', 'c5', 'c10', 'c50', 'c100']) await admin.post('/api/admin/pessoas', { email: `${e}@empresa-exemplo.com.br`, nome: e, areas: [{ id: areaId }] });
  // Conversas de cada pessoa (direto no banco: só a lista importa aqui). Títulos longos de propósito.
  for (const [e, n] of [['c0', 0], ['c1', 1], ['c5', 5], ['c10', 10], ['c50', 50], ['c100', 100]]) {
    const id = um(N.app.db, 'select id from pessoas where email = ?', `${e}@empresa-exemplo.com.br`).id;
    for (let k = 1; k <= n; k++) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now', ?), datetime('now', ?))", id,
      k === 1 ? 'Conversa com um título muito comprido para testar o truncamento elegante da lateral sem quebrar o layout de jeito nenhum' : `Conversa ${k}`, `-${k} minutes`, `-${k} minutes`);
  }
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N.fechar(); await OR.fechar(); });

async function abrir(email, hash, largura = 1280, altura = 800) {
  const ctx = await N.navegador.newContext({ viewport: { width: largura, height: altura } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await N.entrar(`${email}@empresa-exemplo.com.br`, await ctx.newPage());
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${N.base}/app${hash}`);
  await p.waitForSelector('#lateral .item-lat.item-principal');
  return { ctx, p, erros };
}
const visivelNaJanela = (p, sel) => p.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; });
const principais = p => p.$$eval('#lateral .item-lat.item-principal', l => l.map(a => a.dataset.item));

for (const [email, n] of [['c0', 0], ['c1', 1], ['c5', 5], ['c10', 10], ['c50', 50], ['c100', 100]]) {
  test(`${n} conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)`, async () => {
    const { ctx, p, erros } = await abrir(email, '#/nova', 1280, 720);
    assert.deepEqual(await principais(p), ['conversas', 'quick-wins', 'conhecimento']);
    assert.equal(await p.locator('#lateral .recentes-lat .item-lat.sub:not(.ver-todas)').count(), Math.min(n, 5));
    assert.equal(await p.locator('#lateral .ver-todas').count(), n > 5 ? 1 : 0);
    for (const sel of ['[data-item="quick-wins"]', '[data-item="conhecimento"]']) assert.ok(await visivelNaJanela(p, `#lateral ${sel}`), `${sel} visível sem rolar`);
    // Destinos principais aparecem antes do histórico recente, independentemente da quantidade de conversas.
    const ordem = await p.$$eval('#lateral .lateral-rolagem a', l => l.map(a => a.dataset.item || (a.classList.contains('ver-todas') ? 'ver-todas' : 'recente')));
    assert.equal(ordem.indexOf('quick-wins'), 1, JSON.stringify(ordem));
    if (n) assert.ok(ordem.indexOf('conhecimento') < ordem.indexOf('recente'), JSON.stringify(ordem));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal');
    if (n === 100) await p.screenshot({ path: 'capturas/tmp/lateral-100-1280.png' });
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test('"Ver todas" leva à lista completa existente; títulos longos são truncados com o título no tooltip (C, I)', async () => {
  const { ctx, p } = await abrir('c10', '#/nova');
  const longo = p.locator('#lateral .recentes-lat .item-lat.sub').filter({ hasText: 'título muito comprido' });
  assert.ok(await longo.count());
  assert.match(await longo.getAttribute('title'), /truncamento elegante/);
  const caixa = await longo.boundingBox(), lateral = await p.locator('#lateral').boundingBox();
  assert.ok(caixa.x + caixa.width <= lateral.x + lateral.width + 1, 'não sai da lateral');
  assert.ok(caixa.height < 60, 'uma linha só');
  await p.click('#lateral .ver-todas');
  await p.waitForURL(/#\/conversas$/);
  await p.waitForSelector('.lista .lista-item');
  assert.equal(await p.locator('.lista .lista-item').count(), 10);
  assert.equal(await p.getAttribute('#lateral [data-item="conversas"]', 'aria-current'), 'page');
  await ctx.close();
});

test('estado ativo: Conversas nas rotas de conversa; Quick Wins em todas as rotas filhas; Conhecimento (E, F, G)', async () => {
  const { ctx, p } = await abrir('c5', '#/nova');
  const ativo = async () => p.$$eval('#lateral .item-lat.item-principal[aria-current="page"]', l => l.map(a => a.dataset.item));
  assert.deepEqual(await ativo(), ['conversas']);
  const conv = um(N.app.db, "select c.id from conversas c join pessoas p on p.id = c.pessoa_id where p.email = 'c5@empresa-exemplo.com.br' order by c.atualizado_em desc limit 1").id;
  await p.goto(`${N.base}/app#/c/${conv}`); await p.waitForTimeout(400);
  assert.deepEqual(await ativo(), ['conversas']);
  assert.equal(await p.getAttribute(`#lateral .recentes-lat a[href="#/c/${conv}"]`, 'aria-current'), 'page');
  for (const h of ['#/quick-wins', '#/qw/nova', '#/qw/123', '#/qw/123/ajustar']) {
    await p.goto(`${N.base}/app${h}`); await p.waitForTimeout(400);
    assert.deepEqual(await ativo(), ['quick-wins'], h);
  }
  await p.goto(`${N.base}/app#/conhecimento`); await p.waitForSelector('#lateral [data-item="conhecimento"][aria-current="page"]');
  await ctx.close();
});

test('estado ativo acompanha o clique mesmo com a tela ainda carregando (rede lenta)', async () => {
  const { ctx, p } = await abrir('c5', '#/nova');
  await p.route(/\/api\/quick-wins/, async r => { await new Promise(ok => setTimeout(ok, 3000)); await r.continue(); });
  await p.click('#lateral [data-item="quick-wins"]');
  await p.waitForTimeout(500);
  assert.deepEqual(await p.$$eval('#lateral .item-lat.item-principal[aria-current="page"]', l => l.map(a => a.dataset.item)), ['quick-wins']);
  await ctx.close();
});

test('Administração: aparece no primeiro nível só para quem tem permissão e leva à administração (H)', async () => {
  const { ctx, p } = await abrir('c1', '#/nova');
  assert.equal(await p.locator('#lateral [data-item="administracao"]').count(), 0, 'sem permissão: não aparece');
  await ctx.close();
  const a = await N.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const pa = await N.entrar('admin@empresa-exemplo.com.br', await a.newPage());
  await pa.goto(`${N.base}/app#/nova`);
  await pa.waitForSelector('#lateral [data-item="administracao"]');
  assert.deepEqual(await principais(pa), ['conversas', 'quick-wins', 'conhecimento', 'administracao']);
  await pa.click('#lateral [data-item="administracao"]');
  await pa.waitForFunction(() => document.body.dataset.contexto === 'admin');
  await a.close();
});

test('teclado: os itens principais são alcançáveis por Tab com foco visível', async () => {
  const { ctx, p } = await abrir('c10', '#/nova');
  await p.focus('#lateral [data-item="conversas"]');
  const vistos = [];
  for (let k = 0; k < 12; k++) { vistos.push(await p.evaluate(() => document.activeElement?.dataset?.item || document.activeElement?.className || '')); await p.keyboard.press('Tab'); }
  assert.ok(vistos.includes('quick-wins') && vistos.includes('conhecimento'), JSON.stringify(vistos));
  await p.focus('#lateral [data-item="quick-wins"]');
  assert.notEqual(await p.$eval('#lateral [data-item="quick-wins"]', el => getComputedStyle(el).outlineStyle), 'none');
  await ctx.close();
});

test('celular/tablet 320, 390 e 768px com 100 conversas: menu com a mesma hierarquia, Quick Wins acessível, alvos de toque e sem rolagem horizontal (J)', async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: 390, height: 740 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await N.entrar('c100@empresa-exemplo.com.br', await ctx.newPage());
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  for (const largura of [320, 390, 768]) {
    await p.setViewportSize({ width: largura, height: 740 });
    await p.goto(`${N.base}/app#/nova`);
    await p.waitForSelector('#lateral .item-lat.item-principal', { state: 'attached' });
    if (await p.locator('#menu').isVisible()) { await p.click('#menu'); await p.waitForSelector('#lateral.aberta'); await p.waitForTimeout(350); }
    assert.deepEqual(await principais(p), ['conversas', 'quick-wins', 'conhecimento'], String(largura));
    assert.equal(await p.locator('#lateral .recentes-lat .item-lat.sub:not(.ver-todas)').count(), 5);
    for (const it of ['quick-wins', 'conhecimento']) assert.ok(await visivelNaJanela(p, `#lateral [data-item="${it}"]`), `${it} visível no menu sem rolar (${largura})`);
    assert.ok(await visivelNaJanela(p, '#lateral .ver-todas'), `"Ver todas" visível (${largura})`);
    const alturas = await p.$$eval('#lateral .item-lat.item-principal, #lateral .recentes-lat .item-lat.sub', l => l.map(a => a.getBoundingClientRect().height));
    if (largura < 900) assert.ok(alturas.every(h => h >= 44), `alvos de toque (${largura}): ${alturas}`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `sem rolagem horizontal (${largura})`);
    await p.screenshot({ path: `capturas/tmp/lateral-100-${largura}.png` });
    await p.click('#lateral [data-item="quick-wins"]');
    await p.waitForURL(/#\/quick-wins$/);
  }
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('tela baixa (320x568), admin com 100 conversas: todos os itens principais, inclusive Administração, e "Ver todas" à vista sem rolar', async () => {
  const id = um(N.app.db, "select id from pessoas where email = 'admin@empresa-exemplo.com.br'").id;
  for (let k = 1; k <= 100; k++) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now'), datetime('now'))", id, `Admin ${k}`);
  const ctx = await N.navegador.newContext({ viewport: { width: 320, height: 568 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await N.entrar('admin@empresa-exemplo.com.br', await ctx.newPage());
  for (const [largura, altura] of [[320, 568], [1280, 600]]) {
    await p.setViewportSize({ width: largura, height: altura });
    await p.goto(`${N.base}/app#/nova`);
    await p.waitForSelector('#lateral [data-item="administracao"]', { state: 'attached' });
    await p.waitForSelector('#lateral [data-item="conversas"][aria-current="page"]', { state: 'attached' }); await p.waitForTimeout(400);
    if (await p.locator('#menu').isVisible()) { await p.click('#menu'); await p.waitForSelector('#lateral.aberta'); await p.waitForTimeout(350); }
    for (const it of ['conversas', 'quick-wins', 'conhecimento', 'administracao']) assert.ok(await visivelNaJanela(p, `#lateral [data-item="${it}"]`), `${it} visível (${largura}x${altura})`);
    assert.ok(await visivelNaJanela(p, '#lateral .ver-todas'), `"Ver todas" visível (${largura}x${altura})`);
    await p.screenshot({ path: `capturas/tmp/lateral-admin-${largura}x${altura}.png` });
    for (const it of ['quick-wins']) { await p.click(`#lateral [data-item="${it}"]`); await p.waitForURL(/#\/quick-wins$/); }
  }
  await ctx.close();
});
