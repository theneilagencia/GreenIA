// E2E no navegador: login por código → chat → quick win (conversa, ajuste, retomada, feedback).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../test/ajuda.js';
import { salvarConfig } from '../src/config.js';

let N, qwId;
before(async () => {
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br' });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Área Teste' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado', areas: [{ id: area }] });
  const q = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { status: 'ativo' });
  qwId = q.id;
});
after(() => N.fechar());

test('login → chat → quick win', async () => {
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await N.entrar('lia@empresa-exemplo.com.br', p);
  // Chat: Enter envia, Shift+Enter quebra linha; a resposta chega por streaming.
  await p.waitForSelector('#entrada');
  await p.fill('#entrada', 'Primeira linha');
  await p.keyboard.press('Shift+Enter');
  await p.keyboard.type('Segunda linha');
  assert.equal(await p.inputValue('#entrada'), 'Primeira linha\nSegunda linha');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.rodape-resposta');
  assert.match(await p.textContent('.bolha-eu'), /Primeira linha\nSegunda linha/);
  assert.equal(await p.locator('.lateral .item-lat[href^="#/c/"]').count(), 1);
  // Dado bloqueado não sai: aviso na tela, texto volta para a caixa.
  await p.fill('#entrada', 'CPF 529.982.247-25');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.aviso-bolha');
  assert.match(await p.textContent('.aviso-bolha'), /CPF/);
  // Quick win: abre pela lateral, usa uma sugestão, pede ajuste.
  await p.click(`.lateral a[href="#/qw/${qwId}"]`);
  await p.waitForSelector('[data-sug]');
  await p.click('[data-sug="0"]');
  await p.waitForFunction(() => document.getElementById('entrada')?.value.length > 0);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.rodape-resposta');
  await p.fill('#entrada', 'Tire a coluna de valor');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('.rodape-resposta').length >= 2);
  await p.waitForSelector('[data-csv]');   // tabela da resposta, com download em CSV
  assert.match(await p.textContent('.coluna'), /Revise antes de usar/);
  // Feedback no topo.
  await p.click('[data-fb="serviu"]');
  await p.waitForSelector('[data-fb="serviu"][aria-pressed="true"]');
  // Retomar: a conversa está na página do quick win e abre com o histórico.
  await p.click(`.lateral a[href="#/qw/${qwId}"]`);
  await p.waitForSelector('.lista-item a');
  assert.match(await p.textContent('.lista-item'), /Serviu/);
  await p.click('.lista-item a');
  await p.waitForSelector('.bolha-eu');
  assert.equal(await p.locator('.bolha-eu').count(), 2);
  assert.deepEqual(erros, []);
});

test('360 px: sem rolagem horizontal, menu abre a lateral', async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: 360, height: 740 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await N.entrar('lia@empresa-exemplo.com.br', await ctx.newPage());
  await p.waitForSelector('#entrada');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.click('#menu');
  await p.waitForSelector('.lateral.aberta');
  for (const u of ['/', '/entrar', '/politica']) {
    await p.goto(N.base + u);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), u);
  }
  await ctx.close();
});
