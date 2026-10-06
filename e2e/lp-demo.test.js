import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';

test('LP: exemplo finito, pausa, etapas manuais e nenhum efeito externo', async () => {
  const N = await subirComNavegador({ paginaInicial: 'vendas', altura: 1000 });
  try {
    const p = await N.contexto.newPage(), erros = [], externos = [], mutacoes = [];
    p.on('pageerror', e => erros.push(e.message));
    p.on('request', r => { if (!r.url().startsWith(N.base)) externos.push(r.url()); if (r.method() !== 'GET') mutacoes.push(r.url()); });
    await p.goto(N.base); await p.locator('#demo-quick-win').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => document.querySelector('.qw-demo').dataset.playing === 'true');
    await p.getByRole('button', { name: 'Pausar demonstração' }).click();
    const paused = await p.locator('.qd-time').textContent();
    await p.waitForTimeout(1100); assert.equal(await p.locator('.qd-time').textContent(), paused);
    await p.locator('[data-go="1"]').click();
    assert.ok(await p.getByRole('heading', { name: 'Há duas diferenças para revisar' }).isVisible());
    assert.equal(await p.locator('.qd-table mark').count(), 2);
    await p.locator('[data-go="2"]').click();
    assert.ok(await p.getByText('Apenas leitura do cadastro').isVisible());
    await p.locator('[data-go="3"]').click();
    assert.ok(await p.getByText('Nenhuma alteração enviada').isVisible());
    await p.getByRole('button', { name: 'Reproduzir demonstração' }).click();
    await p.waitForFunction(() => document.querySelector('.qd-time').textContent === '00:24 / 00:24', { timeout: 10000 });
    assert.equal(await p.locator('.qw-demo').getAttribute('data-playing'), 'false');
    assert.ok(await p.getByRole('button', { name: 'Rever demonstração' }).isVisible());
    await p.getByRole('button', { name: 'Reiniciar demonstração' }).click();
    assert.equal(await p.locator('.qw-demo').getAttribute('data-stage'), '0');
    assert.deepEqual(mutacoes, []); assert.deepEqual(externos, []); assert.deepEqual(erros, []);
  } finally { await N.fechar(); }
});

test('LP: redução de movimento, leitura no celular e formulário com tentativa recuperável', async () => {
  const N = await subirComNavegador({ paginaInicial: 'vendas' });
  try {
    const p = await N.contexto.newPage(), erros = []; p.on('pageerror', e => erros.push(e.message));
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(N.base); await p.locator('#demo-quick-win').scrollIntoViewIfNeeded();
    assert.equal(await p.locator('.qw-demo').getAttribute('data-playing'), 'false');
    for (const width of [320, 390, 768, 1280]) {
      await p.setViewportSize({ width, height: 920 });
      for (let stage=0; stage<4; stage++) {
        await p.locator(`[data-go="${stage}"]`).click();
        assert.ok(await p.locator(`[data-panel="${stage}"]`).isVisible());
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `largura ${width}, etapa ${stage}`);
      }
    }
    await p.getByRole('button', { name: 'Reiniciar demonstração' }).click();
    assert.equal(await p.locator('.qw-demo').getAttribute('data-playing'), 'false');
    await p.locator('.l-tela-real').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => document.querySelector('.l-tela-real img').naturalWidth === 1280);
    assert.ok(await p.locator('a[href^="#"]').evaluateAll(es => es.every(a => document.getElementById(a.getAttribute('href').slice(1)))));
    await p.getByText('O Quick Win executa tudo sozinho?', { exact: true }).click();
    assert.ok(await p.getByText('Depende do fluxo preparado.', { exact: false }).isVisible());
    await p.locator('#c-enviar').click(); assert.ok(await p.getByText('Preencha nome, email e empresa.').isVisible());
    await p.fill('#c-nome', 'Ana QA'); await p.fill('#c-email', 'ana@cliente.com.br'); await p.fill('#c-empresa', 'Empresa QA');
    await p.route('**/api/contato', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"mensagem":"Tente de novo."}' }));
    await p.locator('#c-enviar').click(); await p.waitForSelector('#c-erro:not(.oculto)');
    assert.equal(await p.inputValue('#c-nome'), 'Ana QA'); assert.ok(await p.locator('#c-enviar').isEnabled());
    await p.unroute('**/api/contato'); await p.locator('#c-enviar').click(); await p.waitForSelector('#c-ok:not(.oculto)');
    assert.equal(N.app.db.prepare('select count(*) as n from leads').get().n, 1);
    assert.deepEqual(erros, []);
    await p.setViewportSize({width:1280,height:1000}); await p.locator('[data-go="3"]').click();
    await p.locator('#demo-quick-win').screenshot({ path: '/tmp/greenia-demo-desktop.png' });
    await p.setViewportSize({width:390,height:844}); await p.locator('[data-go="1"]').click();
    await p.locator('#demo-quick-win').screenshot({ path: '/tmp/greenia-demo-mobile.png' });
  } finally { await N.fechar(); }
});
