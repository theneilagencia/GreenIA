// Casca do assistente (padrão Claude + ChatGPT): lateral com Nova conversa, Buscar, atalhos e o histórico completo por
// data; lateral recolhível no computador (lembrada neste navegador); conta no pé da lateral com Ajuda, Tema, Política de
// uso de IA, Reportar problema, Administração (só para quem tem acesso) e Sair; topo mínimo, só com o título (e, na
// conversa, o menu "…" dela). Celular: menu (gaveta), título e "Nova conversa". Claro e escuro, sem rolagem horizontal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { abrirConta, abrirLateral, itemConta } from './casca.js';

let N, OR, conversa;
const EMAIL = 'marina@empresa-exemplo.com.br';
// [título, deslocamento no SQLite, grupo esperado]
const DATAS = [
  ['Resumo do e-mail do fornecedor', '-1 minutes', 'Hoje'],
  ['Plano de comunicação interna', '-1 days', 'Ontem'],
  ['Revisão do contrato de limpeza', '-4 days', 'Últimos 7 dias'],
  ['Checklist de recebimento', '-20 days', 'Últimos 30 dias'],
  ['Roteiro da reunião mensal', '-75 days', null],
];
before(async () => {
  OR = await openRouterFalso({ responder: () => 'Resposta fictícia em texto corrido.' });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  await admin.post('/api/admin/pessoas', { email: EMAIL, nome: 'Marina Costa' });
  const marina = await cliente(N.app, N.base).entrar(EMAIL);
  conversa = (await marina.post('/api/conversas', {})).dados.conversa;
  await marina.post(`/api/conversas/${conversa.id}/mensagens`, { texto: 'Organize os próximos passos da implantação' });
  const id = um(N.app.db, 'select id from pessoas where email = ?', EMAIL).id;
  // Datas controladas direto no banco (só a lista importa aqui); a conversa com mensagens fica em "Hoje".
  exec(N.app.db, "update conversas set titulo = ?, atualizado_em = datetime('now') where id = ?", 'Próximos passos da implantação', conversa.id);
  for (const [titulo, desloc] of DATAS) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now', ?), datetime('now', ?))", id, titulo, desloc, desloc);
  // Uma conversa antiga além das 200 carregadas na lateral: a busca precisa achá-la mesmo assim.
  for (let k = 1; k <= 205; k++) exec(N.app.db, "insert into conversas (pessoa_id, titulo, criado_em, atualizado_em) values (?, ?, datetime('now', ?), datetime('now', ?))", id, k === 205 ? 'Orçamento da frota antiga' : `Rascunho ${k}`, `-${200 + k} days`, `-${200 + k} days`);
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N.fechar(); await OR.fechar(); });

async function abrir(email, hash, { largura = 1366, altura = 860, esquema = 'light' } = {}) {
  const ctx = await N.navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: esquema, isMobile: largura < 700, hasTouch: largura < 700 });
  await ctx.route(u => !u.href.startsWith(N.base), r => r.abort());
  const p = await N.entrar(email, await ctx.newPage());
  p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  await p.goto(`${N.base}/app${hash}`);
  await p.waitForSelector('#principal h1');
  await p.waitForSelector('#lateral #conta', { state: 'attached' });
  return p;
}
const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('histórico completo na lateral, agrupado por data: Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, mês/ano', async () => {
  const p = await abrir(EMAIL, '#/nova');
  const grupos = await p.$$eval('#lateral .hist-grupo', gs => gs.map(g => ({ titulo: g.querySelector('h3').textContent, itens: [...g.querySelectorAll('.hc-recente a')].map(a => a.textContent.trim()) })));
  assert.deepEqual(grupos.slice(0, 4).map(g => g.titulo), ['Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias']);
  for (const [titulo, , grupo] of DATAS) {
    const g = grupos.find(x => x.itens.includes(titulo));
    assert.ok(g, `${titulo} está na lateral`);
    if (grupo) assert.equal(g.titulo, grupo, titulo);
    else assert.match(g.titulo, /^[A-ZÇ][a-zç]+ de \d{4}$/, `${titulo}: mês e ano`);
  }
  assert.deepEqual(grupos[0].itens.slice(0, 2), ['Próximos passos da implantação', 'Resumo do e-mail do fornecedor']);
  // Cada conversa mantém o "⋯" (renomear, excluir), com nome acessível.
  assert.match(await p.locator('#lateral .hc-recente .hc-acoes').first().getAttribute('aria-label'), /^Ações de Próximos passos/);
  // Lista longa: mostra de 50 em 50, com "Ver todas" para a tela de Conversas.
  assert.equal(await p.locator('#lateral .hc-recente').count(), 50);
  assert.equal(await p.locator('#lateral #hist-mais').count(), 1);
  assert.equal(await p.getAttribute('#lateral .ver-todas', 'href'), '#/conversas');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('Buscar (Ctrl K e o botão da lateral) acha conversas pelo título, inclusive as que não estão carregadas', async () => {
  const p = await abrir(EMAIL, '#/nova');
  await p.click('#abrir-busca');
  await p.keyboard.type('frota antiga');
  const item = p.locator('.paleta-item', { hasText: 'Orçamento da frota antiga' });
  await item.waitFor();
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+k');
  await p.keyboard.type('Checklist');
  await p.locator('.paleta-item', { hasText: 'Checklist de recebimento' }).waitFor();
  await p.keyboard.press('Enter');
  const id = um(N.app.db, "select id from conversas where titulo = 'Checklist de recebimento'").id;
  await p.waitForURL(new RegExp(`#/c/${id}$`));
  assert.equal(await p.getAttribute(`#lateral a[href="#/c/${id}"]`, 'aria-current'), 'page');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('topo mínimo: só o título (h1 único); sem email, Sair, Ajuda ou trilha no topo', async () => {
  const p = await abrir(EMAIL, '#/quick-wins');
  for (const hash of ['#/nova', '#/quick-wins', '#/conhecimento', '#/conversas', `#/c/${conversa.id}`]) {
    await p.goto(`${N.base}/app${hash}`); await p.waitForTimeout(400); await p.waitForSelector('#principal h1');
    const topo = await p.locator('.cabeca').innerText();
    assert.doesNotMatch(topo, /marina@|Sair|Ajuda|Trabalho \//, `${hash}: ${topo}`);
    assert.equal(await p.locator('.cabeca :is(#sair,#ajuda-tela,.migalha,.usuario,.avatar)').count(), 0, hash);
    assert.equal(await p.locator('h1').count(), 1, `${hash}: um h1 só`);
    assert.ok(await p.locator('main#principal').count() && await p.locator('nav[aria-label="Navegação"]').count(), 'marcos main e nav');
  }
  assert.equal((await p.locator('.cabeca h1').innerText()).trim(), 'Próximos passos da implantação');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('título da conversa com "…": Renomear muda o título no topo e na lateral', async () => {
  const p = await abrir(EMAIL, `#/c/${conversa.id}`);
  await p.click('#acoes-conversa');
  await p.getByRole('menuitem', { name: 'Renomear', exact: true }).click();
  const d = p.getByRole('dialog', { name: 'Renomear conversa' });
  await d.locator('[data-nome]').fill('Implantação: próximos passos');
  await d.getByRole('button', { name: 'Salvar nome' }).click();
  await p.waitForFunction(() => document.querySelector('.cabeca h1')?.textContent.trim() === 'Implantação: próximos passos');
  await p.locator(`#lateral a[href="#/c/${conversa.id}"]`, { hasText: 'Implantação: próximos passos' }).waitFor();
  assert.equal(um(N.app.db, 'select titulo from conversas where id = ?', conversa.id).titulo, 'Implantação: próximos passos');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('lateral recolhível no computador: trilho de ícones, nome acessível, aria-expanded e lembrada ao recarregar', async () => {
  const p = await abrir(EMAIL, '#/nova');
  const largura = () => p.locator('#lateral').evaluate(e => Math.round(e.getBoundingClientRect().width));
  assert.ok(await largura() > 200);
  assert.equal(await p.getAttribute('#recolher-lateral', 'aria-expanded'), 'true');
  assert.equal(await p.getAttribute('#recolher-lateral', 'aria-controls'), 'lateral');
  await p.click('#recolher-lateral');
  await p.waitForFunction(() => document.querySelector('#lateral').getBoundingClientRect().width < 80);
  assert.equal(await p.getAttribute('#recolher-lateral', 'aria-expanded'), 'false');
  assert.equal(await p.getAttribute('#recolher-lateral', 'aria-label'), 'Expandir a barra lateral');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'recolher-lateral', 'o foco fica no botão');
  assert.equal(await p.locator('#lateral .historico-lat').isVisible(), false, 'o histórico sai do trilho');
  for (const nome of ['Nova conversa', 'Buscar', 'Quick Wins', 'Conhecimento']) {
    const el = p.getByRole('link', { name: nome }).or(p.getByRole('button', { name: new RegExp(`^${nome}`) })).first();
    assert.ok(await el.isVisible(), `${nome}: ícone visível com nome acessível`);
    const caixa = await el.boundingBox();
    assert.ok(caixa.width <= 48 && caixa.height >= 36, `${nome}: ${JSON.stringify(caixa)}`);
  }
  assert.equal(await p.getAttribute('#lateral [data-item="quick-wins"]', 'title'), 'Quick Wins', 'dica ao passar o mouse');
  assert.ok(await semRolagem(p));
  await p.screenshot({ path: 'capturas/tmp/assistente-recolhida.png' });
  // A conta continua no pé: o menu abre por inteiro, fora do trilho estreito.
  await abrirConta(p);
  const menu = await p.locator('#menu-conta').boundingBox();
  assert.ok(menu.width >= 240 && menu.x >= 0 && menu.x + menu.width <= 1366, JSON.stringify(menu));
  await p.keyboard.press('Escape');
  await p.reload(); await p.waitForSelector('#recolher-lateral');
  assert.equal(await p.getAttribute('#recolher-lateral', 'aria-expanded'), 'false', 'lembrada ao recarregar');
  assert.ok(await largura() < 80);
  await p.click('#recolher-lateral');
  await p.waitForFunction(() => document.querySelector('#lateral').getBoundingClientRect().width > 200);
  await p.reload(); await p.waitForSelector('#recolher-lateral');
  assert.equal(await p.getAttribute('#recolher-lateral', 'aria-expanded'), 'true');
  assert.equal(await p.evaluate(() => localStorage.getItem('greenia-lateral-recolhida')), null);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('menu da conta: itens, teclado (setas, Home, End, Esc) e cada item funciona', async () => {
  const p = await abrir(EMAIL, '#/conversas');
  assert.match(await p.locator('#conta').innerText(), /Marina Costa[\s\S]*Empresa Exemplo/);
  assert.equal(await p.getAttribute('#conta', 'aria-haspopup'), 'menu');
  await p.focus('#conta'); await p.keyboard.press('Enter');
  await p.waitForSelector('#menu-conta:not([hidden])');
  assert.equal(await p.getAttribute('#conta', 'aria-expanded'), 'true');
  const itens = await p.locator('#menu-conta [role^="menuitem"]').evaluateAll(l => l.map(e => e.textContent.trim()));
  assert.deepEqual(itens, ['Ajuda', 'Automático', 'Claro', 'Escuro', 'Política de uso de IA', 'Reportar problema', 'Sair']);
  assert.match(await p.locator('#menu-conta').innerText(), /marina@empresa-exemplo\.com\.br/);
  assert.equal(await p.locator('#menu-conta [data-contexto]').count(), 0, 'sem Administração para quem não administra');
  const foco = () => p.evaluate(() => document.activeElement.textContent.trim());
  assert.equal(await foco(), 'Ajuda');
  await p.keyboard.press('ArrowDown'); assert.equal(await foco(), 'Automático');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); assert.equal(await foco(), 'Sair', 'volta ao fim');
  await p.keyboard.press('Home'); assert.equal(await foco(), 'Ajuda');
  await p.keyboard.press('End'); assert.equal(await foco(), 'Sair');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#menu-conta').isVisible(), false);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'conta');
  // Clique fora fecha.
  await p.click('#conta'); await p.waitForSelector('#menu-conta:not([hidden])');
  await p.mouse.click(1300, 28);
  assert.equal(await p.locator('#menu-conta').isVisible(), false);
  // Ajuda: a ajuda desta tela.
  await itemConta(p, '#ajuda-tela'); await p.waitForSelector('#ajuda-titulo');
  assert.match(await p.locator('#ajuda-titulo').innerText(), /Retome suas conversas/);
  await p.keyboard.press('Escape'); assert.equal(await p.evaluate(() => document.activeElement.id), 'conta');
  // Tema: muda o data-tema na hora e vale ao recarregar.
  await itemConta(p, '[data-tema-opcao="escuro"]');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.tema), 'escuro');
  assert.equal(await p.getAttribute('#menu-conta [data-tema-opcao="escuro"]', 'aria-checked'), 'true');
  await p.reload(); await p.waitForSelector('#conta');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.tema), 'escuro');
  await itemConta(p, '[data-tema-opcao="claro"]');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.tema), 'claro');
  await p.click('#menu-conta [data-tema-opcao="auto"]');
  assert.equal(await p.evaluate(() => document.documentElement.hasAttribute('data-tema')), false);
  await p.keyboard.press('Escape');
  // Política de uso de IA e Reportar problema abrem os diálogos de sempre.
  await itemConta(p, '#ver-politica'); await p.getByRole('dialog', { name: 'Como a empresa usa IA' }).waitFor();
  await p.keyboard.press('Escape');
  await itemConta(p, '#reportar'); await p.getByRole('dialog', { name: 'O que aconteceu?' }).waitFor();
  await p.keyboard.press('Escape');
  // Sair: encerra a sessão e não volta para a área privada.
  await itemConta(p, '#sair'); await p.waitForURL(N.base + '/');
  await p.goto(`${N.base}/app#/nova`); await p.waitForURL(/\/entrar$/);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('Administração no menu da conta para quem administra: troca de contexto nos dois sentidos', async () => {
  const p = await abrir('admin@empresa-exemplo.com.br', '#/nova');
  await abrirConta(p);
  assert.deepEqual(await p.locator('#menu-conta [data-contexto]').allInnerTexts(), ['Administração']);
  await p.click('#menu-conta [data-contexto="admin"]');
  await p.waitForFunction(() => document.body.dataset.contexto === 'admin');
  await p.waitForSelector('#lateral .selo-contexto');
  assert.equal(await p.locator('#lateral a.nova').count(), 0, 'na Administração, sem "Nova conversa"');
  await abrirConta(p);
  assert.deepEqual(await p.locator('#menu-conta [data-contexto]').allInnerTexts(), ['Usar a GreenIA']);
  await p.click('#menu-conta [data-contexto="uso"]');
  await p.waitForURL(/#\/nova$/);
  await p.waitForFunction(() => document.body.dataset.contexto === 'uso');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

for (const esquema of ['light', 'dark']) {
  test(`celular 390 px (${esquema === 'dark' ? 'escuro' : 'claro'}): menu, título e Nova conversa no topo; gaveta com histórico e conta; sem rolagem horizontal`, async () => {
    const p = await abrir(EMAIL, `#/c/${conversa.id}`, { largura: 390, altura: 844, esquema });
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor !== ''), true);
    for (const sel of ['#menu', '.cabeca h1', '.cabeca .nova-topo']) assert.ok(await p.locator(sel).isVisible(), sel);
    for (const sel of ['#menu', '.cabeca .nova-topo', '#acoes-conversa']) {
      const c = await p.locator(sel).boundingBox();
      assert.ok(c.width >= 44 && c.height >= 44, `${sel}: ${JSON.stringify(c)}`);
    }
    assert.equal(await p.locator('#recolher-lateral').isVisible(), false, 'no celular, a lateral é a gaveta');
    assert.ok(await semRolagem(p));
    await abrirLateral(p);
    assert.equal(await p.getAttribute('#menu', 'aria-expanded'), 'true');
    assert.ok(await p.locator('#lateral .historico-lat').isVisible());
    const alturas = await p.$$eval('#lateral .item-lat, #lateral #conta, #fechar-lateral', l => l.slice(0, 15).map(e => Math.round(e.getBoundingClientRect().height)));
    assert.ok(alturas.every(h => h >= 44), `alvos de toque: ${alturas}`);
    await abrirConta(p);
    const menu = await p.locator('#menu-conta').boundingBox();
    assert.ok(menu.x >= 0 && menu.x + menu.width <= 390 && menu.y >= 0, JSON.stringify(menu));
    await p.screenshot({ path: `capturas/tmp/assistente-390-${esquema}.png` });
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#lateral').classList.contains('aberta'));
    assert.equal(await p.evaluate(() => document.activeElement.id), 'menu');
    await p.click('.cabeca .nova-topo'); await p.waitForURL(/#\/nova$/); await p.waitForSelector('#entrada');
    assert.ok(await semRolagem(p));
    if (esquema === 'dark') {
      const fundo = await p.evaluate(() => getComputedStyle(document.querySelector('.principal')).backgroundColor);
      const [r, g, b] = fundo.match(/\d+/g).map(Number);
      assert.ok(r + g + b < 150, `fundo escuro: ${fundo}`);
    }
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });
}

test('1920 e 820 px, claro e escuro: lateral, topo e conta sem rolagem horizontal', async () => {
  for (const [largura, altura] of [[1920, 1080], [820, 1180]]) for (const esquema of ['light', 'dark']) {
    const p = await abrir(EMAIL, '#/nova', { largura, altura, esquema });
    assert.ok(await semRolagem(p), `${largura} ${esquema}`);
    await abrirConta(p);
    assert.ok(await semRolagem(p), `${largura} ${esquema} com o menu aberto`);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  }
});
