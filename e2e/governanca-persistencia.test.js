import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';

test('recomendações são padrão e persistem após salvar, navegar e recarregar', { timeout: 30000 }, async () => {
  const N = await subirComNavegador();
  try {
    const p = await N.entrar('admin@empresa-exemplo.com.br');
    await p.goto(N.base + '/app#/modelos');
    const recomendado = p.locator('input[name="gov"][value="recomendado"]');
    const manual = p.locator('input[name="gov"][value="manual"]');
    await recomendado.waitFor(); assert.equal(await recomendado.isChecked(), true);
    await manual.check();
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="manual"]')?.checked && !document.querySelector('input[name="gov"][value="manual"]').disabled);
    p.once('dialog', d => d.accept());
    await recomendado.check();
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="recomendado"]')?.checked && !document.querySelector('input[name="gov"][value="recomendado"]').disabled);
    await p.locator('#modelos-manuais > summary').click();
    await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/admin/modelos-config') && r.request().method() === 'PUT'), p.getByRole('button', { name: 'Salvar configuração de modelos', exact: true }).click()]);
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="recomendado"]')?.checked);
    await p.reload(); await recomendado.waitFor(); assert.equal(await recomendado.isChecked(), true);
    await p.goto(N.base + '/app#/modelos/roteamento');
    await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/admin/modelos-config') && r.request().method() === 'PUT'), p.getByRole('button', { name: 'Salvar roteamento', exact: true }).click()]);
    await p.goto(N.base + '/app#/modelos'); await recomendado.waitFor(); assert.equal(await recomendado.isChecked(), true);
    await manual.check();
    await p.waitForFunction(() => document.querySelector('input[name="gov"][value="manual"]')?.checked && !document.querySelector('input[name="gov"][value="manual"]').disabled);
    await p.reload(); await manual.waitFor(); assert.equal(await manual.isChecked(), true, 'escolha manual explícita também permanece');
  } finally { await N.fechar(); }
});
