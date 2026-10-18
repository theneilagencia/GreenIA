import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';

test('recomendações são padrão e persistem após salvar, navegar e recarregar', { timeout: 60000 }, async () => {
  const N = await subirComNavegador();
  try {
    const p = await N.entrar('admin@empresa-exemplo.com.br');
    await p.goto(N.base + '/app#/modelos');
    const recomendado = p.locator('input[name="gov"][value="recomendado"]');
    const manual = p.locator('input[name="gov"][value="manual"]');
    await recomendado.waitFor(); assert.equal(await recomendado.isChecked(), true);
    await manual.check();
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="manual"]')?.checked && !document.querySelector('input[name="gov"][value="manual"]').disabled);
    await recomendado.check();
    await p.getByRole('dialog').getByRole('button', { name: 'Seguir as recomendações', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="recomendado"]')?.checked && !document.querySelector('input[name="gov"][value="recomendado"]').disabled);
    await p.getByRole('button', { name: 'Ajustar manualmente' }).click();
    await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/admin/modelos-config') && r.request().method() === 'PUT'), p.getByRole('button', { name: 'Salvar configuração de modelos', exact: true }).click()]);
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="recomendado"]')?.checked);
    await p.reload(); await recomendado.waitFor(); assert.equal(await recomendado.isChecked(), true);
    await p.goto(N.base + '/app#/modelos/roteamento');
    await p.locator('#cfg-rota').waitFor();
    assert.equal(await p.locator('.trabalho-salvar').isVisible(),false,'sem alterações, não oferece gravação desnecessária');
    assert.equal(await p.locator('#rota-switch').getAttribute('aria-checked'),'true');
    await p.goto(N.base + '/app#/modelos'); await recomendado.waitFor(); assert.equal(await recomendado.isChecked(), true);
    await manual.check();
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="manual"]')?.checked && !document.querySelector('input[name="gov"][value="manual"]').disabled);
    await p.reload(); await manual.waitFor(); assert.equal(await manual.isChecked(), true, 'escolha manual explícita também permanece');
  } finally { await N.fechar(); }
});
