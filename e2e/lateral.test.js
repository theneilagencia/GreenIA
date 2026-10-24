// Navegação lateral (padrão assistente): Nova conversa e Buscar no alto; atalhos (Quick Wins, Conhecimento e, quando há
// o que resolver, Pendências); o histórico completo de conversas por data, com "Ver todas" para a tela de Conversas; e
// a conta no pé, com a troca para a Administração (só para quem tem permissão). Estresse com 0, 1, 5, 10, 50 e 100
// conversas: os atalhos continuam imediatamente visíveis, em desktop e no menu do celular.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { abrirConta, abrirLateral } from './casca.js';

let N, OR, areaId, admin;
before(async () => {
  OR = await openRouterFalso({ responder: () => 'Certo.' });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  areaId = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  for (const e of ['c0', 'c1', 'c5', 'c10', 'c50', 'c100']) await admin.post('/api/admin/pessoas', { email: `${e}@empresa-exemplo.com.br`, nome: e, areas: [{ id: areaId }] });
  // Conversas de cada pessoa (direto no banco: só a lista importa aqui). Títulos longos de propósito.
  for (const [e, n] of [['c0', 0], ['c1', 1], ['c5', 5], ['c10', 10], ['c50', 50], ['c100', 100]]) {
    const id = um(N.app.db, 'select id from pessoas where email = ?', `${e}@empresa-exemplo.com.br`).id;
    for (let k = 1; k <= n; k++) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now', ?), datetime('now', ?))", id,
      k === 1 ? 'Conversa com um título muito comprido para testar o truncamento elegante da lateral sem quebrar o layout de jeito nenhum' : `Conversa ${k}`, `-${k} seconds`, `-${k} seconds`);   // segundos: perto da meia-noite, minutos cairiam em "Ontem"
  }
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N.fechar(); await OR.fechar(); });

// Uma entrada por pessoa (o envio de códigos tem limite): os outros contextos reaproveitam a sessão.
const sessoes = {};
async function sessao(email) {
  if (!sessoes[email]) { const c = await N.navegador.newContext(); await N.entrar(email, await c.newPage()); sessoes[email] = await c.storageState(); await c.close(); }
  return sessoes[email];
}
const contexto = async (email, viewport) => N.navegador.newContext({ viewport, storageState: await sessao(email) });
async function abrir(email, hash, largura = 1280, altura = 800) {
  const ctx = await contexto(`${email}@empresa-exemplo.com.br`, { width: largura, height: altura });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${N.base}/app${hash}`);
  await p.waitForSelector('#lateral .item-lat.item-principal');
  return { ctx, p, erros };
}
const visivelNaJanela = (p, sel) => p.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; });
const principais = p => p.$$eval('#lateral .item-lat.item-principal', l => l.map(a => a.dataset.item));
const historico = '#lateral .historico-lat .hc-recente';

for (const [email, n] of [['c0', 0], ['c1', 1], ['c5', 5], ['c10', 10], ['c50', 50], ['c100', 100]]) {
  test(`${n} conversas: histórico completo por data (de 50 em 50), "Ver todas" com conversas, atalhos visíveis (A, B, C, D)`, async () => {
    const { ctx, p, erros } = await abrir(email, '#/nova', 1280, 720);
    assert.deepEqual(await principais(p), ['quick-wins', 'resultados', 'conhecimento']);
    assert.equal(await p.locator(historico).count(), Math.min(n, 50));
    assert.equal(await p.locator('#lateral .ver-todas').count(), n ? 1 : 0);
    assert.equal(await p.locator('#lateral #hist-mais').count(), n > 50 ? 1 : 0, '"Mostrar mais conversas" só quando há mais');
    if (n) assert.deepEqual(await p.$$eval('#lateral .hist-grupo h3', l => l.map(h => h.textContent)), ['Hoje']);
    for (const sel of ['a.nova', '#abrir-busca', '[data-item="quick-wins"]', '[data-item="resultados"]', '[data-item="conhecimento"]', '#conta']) assert.ok(await visivelNaJanela(p, `#lateral ${sel}`), `${sel} visível sem rolar`);
    // Atalhos antes do histórico, independentemente da quantidade de conversas.
    const ordem = await p.$$eval('#lateral .lateral-rolagem a', l => l.map(a => a.dataset.item || (a.classList.contains('ver-todas') ? 'ver-todas' : 'conversa')));
    assert.equal(ordem.indexOf('quick-wins'), 0, JSON.stringify(ordem));
    if (n) assert.ok(ordem.indexOf('conhecimento') < ordem.indexOf('conversa'), JSON.stringify(ordem));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal');
    if (n === 100) {
      // Rolagem até o fim da lista: carrega as próximas 50 (todas as 100), sem precisar clicar.
      await p.$eval('#lateral .lateral-rolagem', n => { n.scrollTop = n.scrollHeight; });
      await p.waitForFunction(s => document.querySelectorAll(s).length === 100, historico);
      assert.equal(await p.locator('#lateral #hist-mais').count(), 0);
      await p.screenshot({ path: 'capturas/tmp/lateral-100-1280.png' });
    }
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test('mais de 200 conversas: "Mostrar mais" busca a próxima página no servidor', async () => {
  const id = um(N.app.db, "select id from pessoas where email = 'c50@empresa-exemplo.com.br'").id;
  for (let k = 51; k <= 230; k++) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now', ?), datetime('now', ?))", id, `Antiga ${k}`, `-${k} days`, `-${k} days`);
  const { ctx, p, erros } = await abrir('c50', '#/nova');
  for (let vistas = 50; vistas < 230; vistas += 50) {
    await p.$eval('#lateral #hist-mais', b => b.click());   // clique direto (sem rolar até o fim, que também carrega)
    await p.waitForFunction(([s, v]) => document.querySelectorAll(s).length === Math.min(230, v + 50), [historico, vistas]).catch(async e => { throw new Error(`${vistas}: ${await p.locator(historico).count()} ${e.message}`); });
  }
  assert.equal(await p.locator(historico).count(), 230);
  assert.equal(await p.locator('#lateral #hist-mais').count(), 0);
  const grupos = await p.$$eval('#lateral .hist-grupo h3', l => l.map(h => h.textContent));
  assert.equal(grupos[0], 'Hoje');
  assert.ok(grupos.length >= 6, JSON.stringify(grupos));
  for (const g of grupos.slice(1)) assert.match(g, /^[A-ZÇ][a-zç]+ de \d{4}$/, 'mês e ano por extenso');
  assert.deepEqual(erros, []);
  exec(N.app.db, "delete from conversas where titulo like 'Antiga %'");
  await ctx.close();
});

test('"Ver todas" leva à lista completa existente; títulos longos numa linha, com o título completo no tooltip (C, I)', async () => {
  const { ctx, p } = await abrir('c10', '#/nova');
  const longo = p.locator(`${historico} .item-lat.sub`).filter({ hasText: 'título muito comprido' });
  assert.ok(await longo.count());
  assert.match(await longo.getAttribute('title'), /truncamento elegante/);
  const caixa = await longo.boundingBox(), lateral = await p.locator('#lateral').boundingBox();
  assert.ok(caixa.x + caixa.width <= lateral.x + lateral.width + 1, 'não sai da lateral');
  assert.ok(caixa.height < 60, 'uma linha');
  await p.click('#lateral .ver-todas');
  await p.waitForURL(/#\/conversas$/);
  await p.waitForSelector('.hc-lista .hc-conversa');
  assert.equal(await p.locator('.hc-lista .hc-conversa').count(), 10);
  assert.equal(await p.getAttribute('#lateral .ver-todas', 'aria-current'), 'page');
  await ctx.close();
});

test('estado ativo: só o lugar atual (Nova conversa, a conversa aberta); Quick Wins em todas as rotas filhas; Conhecimento (E, F, G)', async () => {
  const { ctx, p } = await abrir('c5', '#/nova');
  const ativo = async () => p.$$eval('#lateral .item-lat.item-principal[aria-current="page"]', l => l.map(a => a.dataset.item));
  assert.deepEqual(await ativo(), []);
  assert.equal(await p.getAttribute('#lateral a.nova', 'aria-current'), 'page');
  const conv = um(N.app.db, "select c.id from conversas c join pessoas p on p.id = c.pessoa_id where p.email = 'c5@empresa-exemplo.com.br' order by c.atualizado_em asc limit 1").id;
  await p.goto(`${N.base}/app#/c/${conv}`); await p.waitForTimeout(400);
  assert.deepEqual(await ativo(), [], 'numa conversa, só ela fica ativa');
  assert.equal(await p.getAttribute(`#lateral .historico-lat a[href="#/c/${conv}"]`, 'aria-current'), 'page');
  assert.equal(await p.locator('#lateral [aria-current="page"]').count(), 1);
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

test('Pendências: atalho só com o que resolver (com a contagem); o endereço vale sempre', async () => {
  const total = (await admin.get('/api/acompanhamento')).dados.pendencias.length;
  assert.ok(total > 0, 'o admin tem pendências (acessos para revisar)');
  const a = await contexto('admin@empresa-exemplo.com.br', { width: 1280, height: 800 });
  const pa = await a.newPage();
  await pa.goto(`${N.base}/app#/nova`);
  await pa.waitForSelector('#lateral [data-item="pendencias"]');
  assert.deepEqual(await principais(pa), ['quick-wins', 'resultados', 'conhecimento', 'pendencias']);
  assert.equal(await pa.locator('#lateral [data-item="pendencias"] .selo-lat [aria-hidden="true"]').innerText(), String(total));
  assert.match(await pa.locator('#lateral [data-item="pendencias"] .sr').innerText(), new RegExp(`${total} pendência`));
  // Sem pendências, o atalho some; a tela continua no endereço (e o atalho aparece enquanto ela está aberta).
  await pa.route('**/api/acompanhamento', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ passos: [], pendencias: [], avisos: [], atualizado_em: new Date().toISOString() }) }));
  await pa.reload(); await pa.waitForSelector('#lateral .item-lat.item-principal'); await pa.waitForTimeout(400);
  assert.deepEqual(await principais(pa), ['quick-wins', 'resultados', 'conhecimento']);
  await pa.goto(`${N.base}/app#/pendencias`); await pa.waitForSelector('#pend-lista');
  assert.equal(await pa.getAttribute('#lateral [data-item="pendencias"]', 'aria-current'), 'page');
  // Membro sem acompanhamento: nunca vê o atalho.
  const { ctx, p } = await abrir('c1', '#/nova');
  assert.equal(await p.locator('#lateral [data-item="pendencias"]').count(), 0);
  await ctx.close(); await a.close();
});

test('Administração: uma entrada só (no menu da conta), só para quem tem permissão, e leva à administração (H)', async () => {
  const { ctx, p } = await abrir('c1', '#/nova');
  assert.equal(await p.locator('#lateral [data-contexto]').count(), 0, 'sem permissão: não aparece');
  await abrirConta(p);
  assert.equal(await p.locator('#lateral').getByText('Administração', { exact: true }).count(), 0);
  await ctx.close();
  const a = await contexto('admin@empresa-exemplo.com.br', { width: 1280, height: 800 });
  const pa = await a.newPage();
  await pa.goto(`${N.base}/app#/nova`);
  await pa.waitForSelector('#lateral #conta');
  assert.equal(await pa.locator('#lateral [data-contexto]').count(), 1, 'uma entrada só');
  await abrirConta(pa);
  assert.equal(await pa.locator('#lateral').getByText('Administração', { exact: true }).count(), 1, '"Administração" aparece uma vez só');
  await pa.click('#menu-conta [data-contexto="admin"]');
  await pa.waitForFunction(() => document.body.dataset.contexto === 'admin');
  await a.close();
});

test('teclado: os itens são alcançáveis por Tab com foco visível', async () => {
  const { ctx, p } = await abrir('c10', '#/nova');
  await p.focus('#lateral a.nova');
  const vistos = [];
  for (let k = 0; k < 12; k++) { vistos.push(await p.evaluate(() => document.activeElement?.dataset?.item || document.activeElement?.id || document.activeElement?.className || '')); await p.keyboard.press('Tab'); }
  assert.ok(vistos.includes('abrir-busca') && vistos.includes('quick-wins') && vistos.includes('conhecimento'), JSON.stringify(vistos));
  await p.focus('#lateral [data-item="quick-wins"]');
  assert.notEqual(await p.$eval('#lateral [data-item="quick-wins"]', el => getComputedStyle(el).outlineStyle), 'none');
  await ctx.close();
});

test('celular/tablet 320, 390 e 768px com 100 conversas: menu com a mesma hierarquia, Quick Wins acessível, alvos de toque e sem rolagem horizontal (J)', async () => {
  const ctx = await contexto('c100@empresa-exemplo.com.br', { width: 390, height: 740 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  for (const largura of [320, 390, 768]) {
    await p.setViewportSize({ width: largura, height: 740 });
    await p.goto(`${N.base}/app#/nova`);
    await p.waitForSelector('#entrada'); // Aguarda a conversa atual antes de abrir o menu.
    await p.waitForSelector('#lateral .item-lat.item-principal', { state: 'attached' });
    await abrirLateral(p);
    assert.deepEqual(await principais(p), ['quick-wins', 'resultados', 'conhecimento'], String(largura));
    assert.equal(await p.locator(historico).count(), 50);
    for (const sel of ['a.nova', '[data-item="quick-wins"]', '[data-item="resultados"]', '[data-item="conhecimento"]', '.ver-todas', '#conta']) assert.ok(await visivelNaJanela(p, `#lateral ${sel}`), `${sel} visível no menu sem rolar (${largura})`);
    const alturas = await p.$$eval('#lateral .item-lat.item-principal, #lateral .lat-acoes .item-lat, #lateral .historico-lat .item-lat.sub, #lateral #conta, #lateral .hc-acoes', l => l.slice(0, 20).map(a => Math.round(a.getBoundingClientRect().height)));
    if (largura < 900) assert.ok(alturas.every(h => h >= 40), `alvos de toque (${largura}): ${alturas}`);
    const principaisAlt = await p.$$eval('#lateral .item-lat, #lateral #conta', l => l.slice(0, 12).map(a => Math.round(a.getBoundingClientRect().height)));
    if (largura < 900) assert.ok(principaisAlt.every(h => h >= 44), `itens com 44px (${largura}): ${principaisAlt}`);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `sem rolagem horizontal (${largura})`);
    await p.screenshot({ path: `capturas/tmp/lateral-100-${largura}.png` });
    await p.click('#lateral [data-item="quick-wins"]');
    await p.waitForURL(/#\/quick-wins$/);
  }
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('tela baixa (320x568), admin com 100 conversas: atalhos, conta (com a Administração) e "Ver todas" à vista sem rolar', async () => {
  const id = um(N.app.db, "select id from pessoas where email = 'admin@empresa-exemplo.com.br'").id;
  for (let k = 1; k <= 100; k++) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now'), datetime('now'))", id, `Admin ${k}`);
  const ctx = await contexto('admin@empresa-exemplo.com.br', { width: 320, height: 568 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  for (const [largura, altura] of [[320, 568], [1280, 600]]) {
    await p.setViewportSize({ width: largura, height: altura });
    await p.goto(`${N.base}/app#/nova`);
    await p.waitForSelector('#lateral [data-item="pendencias"]', { state: 'attached' });
    await p.waitForSelector('#lateral a.nova[aria-current="page"]', { state: 'attached' }); await p.waitForTimeout(400);
    await abrirLateral(p);
    for (const it of ['quick-wins', 'resultados', 'conhecimento', 'pendencias']) assert.ok(await visivelNaJanela(p, `#lateral [data-item="${it}"]`), `${it} visível (${largura}x${altura})`);
    assert.ok(await visivelNaJanela(p, '#lateral #conta'), `conta visível (${largura}x${altura})`);
    assert.ok(await visivelNaJanela(p, '#lateral .ver-todas'), `"Ver todas" visível (${largura}x${altura})`);
    await abrirConta(p);
    assert.ok(await visivelNaJanela(p, '#menu-conta [data-contexto="admin"]'), `Administração visível no menu (${largura}x${altura})`);
    await p.keyboard.press('Escape');
    await p.screenshot({ path: `capturas/tmp/lateral-admin-${largura}x${altura}.png` });
    await p.click('#lateral [data-item="quick-wins"]'); await p.waitForURL(/#\/quick-wins$/);
  }
  await ctx.close();
});
