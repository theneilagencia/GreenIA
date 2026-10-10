import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';

test('LP operações: animações finitas, controles, saída da tela e nenhum efeito externo', async () => {
  const N = await subirComNavegador({ paginaInicial: 'vendas', altura: 1000 });
  try {
    const p = await N.contexto.newPage(), erros = [], mutacoes = [], externos = [];
    p.on('pageerror', e => erros.push(e.message));
    p.on('request', r => { if (r.method() !== 'GET') mutacoes.push(r.url()); if (!r.url().startsWith(N.base)) externos.push(r.url()); });
    await p.goto(N.base);
    for (const id of ['integracoes', 'programados']) {
      const demo = p.locator(`#${id} [data-op-demo]`);
      await demo.scrollIntoViewIfNeeded();
      await p.waitForFunction(id => document.querySelector(`#${id} [data-op-demo]`).dataset.playing === 'true', id);
      await demo.locator('[data-op-play]').click();
      const time = await demo.locator('.op-time').textContent();
      await p.waitForTimeout(1050); assert.equal(await demo.locator('.op-time').textContent(), time);
      for (let step = 0; step < 3; step++) {
        await demo.locator(`[data-op-step="${step}"]`).click();
        assert.equal(await demo.getAttribute('data-stage'), String(step));
        assert.equal(await demo.locator('[data-op-panel]:visible').count(), 1);
        assert.equal(await demo.locator('[data-op-panel]:visible').evaluate(el => getComputedStyle(el).opacity), '1');
        assert.equal(await demo.locator(`[data-op-step="${step}"]`).getAttribute('aria-current'), 'step');
      }
      await demo.locator('[data-op-play]').click();
      await p.locator('h1').scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
      assert.equal(await demo.getAttribute('data-playing'), 'false');
      const offscreen = await demo.locator('.op-time').textContent();
      await p.waitForTimeout(1050); assert.equal(await demo.locator('.op-time').textContent(), offscreen);
      await demo.scrollIntoViewIfNeeded();
      await p.waitForFunction(id => document.querySelector(`#${id} [data-op-demo]`).dataset.playing === 'false' && document.querySelector(`#${id} .op-time`).textContent === '00:15 / 00:15', id, { timeout: 7000 });
      assert.match(await demo.locator('[data-op-play]').getAttribute('aria-label'), /^Rever exemplo/);
      await demo.locator('[data-op-play]').click();
      assert.equal(await demo.getAttribute('data-stage'), '0');
      await demo.locator('[data-op-play]').click();
    }
    assert.deepEqual(erros, []); assert.deepEqual(mutacoes, []); assert.deepEqual(externos, []);
  } finally { await N.fechar(); }
});

test('LP operações: movimento reduzido, teclado e etapas legíveis de 320 a 1280 pixels', async () => {
  const N = await subirComNavegador({ paginaInicial: 'vendas', altura: 1000 });
  try {
    const p = await N.contexto.newPage();
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.goto(N.base);
    for (const width of [320, 390, 768, 1280]) {
      await p.setViewportSize({ width, height: 1000 });
      for (const id of ['integracoes', 'programados']) {
        const demo = p.locator(`#${id} [data-op-demo]`);
        await demo.scrollIntoViewIfNeeded(); assert.equal(await demo.getAttribute('data-playing'), 'false');
        for (let step = 0; step < 3; step++) {
          const button = demo.locator(`[data-op-step="${step}"]`);
          await button.focus(); await p.keyboard.press('Enter');
          assert.equal(await demo.getAttribute('data-stage'), String(step));
          const box = await demo.locator(`[data-op-panel="${step}"]`).boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width, `${id} stage ${step} at ${width}`);
          assert.equal(await demo.locator('.op-simulation').textContent(), 'Simulação · dados fictícios');
          assert.equal(await demo.locator('.op-signal, .op-working, .op-date i').first().evaluate(el => getComputedStyle(el).animationName), 'none');
        }
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      }
    }
    await p.setViewportSize({ width: 1280, height: 1000 });
    await p.locator('#integracoes').scrollIntoViewIfNeeded();
    await p.screenshot({ path: '/tmp/greenia-integracoes-local.png' });
    await p.locator('#programados').scrollIntoViewIfNeeded();
    await p.screenshot({ path: '/tmp/greenia-programados-local.png' });
  } finally { await N.fechar(); }
});
