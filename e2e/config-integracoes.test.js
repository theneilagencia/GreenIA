// Configurações da empresa: o admin liga e desliga as integrações para a empresa toda, e o menu Integrações aparece
// ou some na hora. Desligado (padrão), as rotas de integração não existem para ninguém.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig, lerConfig } from '../src/config.js';

let N;
before(async () => {
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br' });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo', integracoes: { ativa: false, pessoas: ['qa@empresa-exemplo.com.br'] } });
});
after(async () => { await N.fechar(); });

test('admin liga as integrações para a empresa toda em Configurações; o menu aparece; desligar esconde de novo', async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await N.entrar('admin@empresa-exemplo.com.br', await ctx.newPage());
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${N.base}/app#/configuracoes`);
  await p.waitForSelector('#cfg-integracoes');
  assert.equal(await p.isChecked('#cfg-integracoes'), false, 'desligado por padrão');
  assert.equal(await p.locator('#lateral [data-item="integracoes"]').count(), 0);
  await p.check('#cfg-integracoes');
  await p.click('#form-cfg .cfg-salvar .btn-verde');
  await p.waitForSelector('#lateral [data-item="integracoes"]');
  const cfg = lerConfig(N.app.db).integracoes;
  assert.equal(cfg.ativa, true);
  assert.deepEqual(cfg.pessoas, [], 'vale para a empresa toda (a lista de pessoas é limpa)');
  // A tela de integrações abre.
  await p.click('#lateral [data-item="integracoes"]');
  await p.waitForURL(/#\/integracoes/);
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(300);   // a tela termina de carregar antes de sair dela
  // Desliga: o menu some e a API de integrações deixa de existir.
  await p.goto(`${N.base}/app#/configuracoes`);
  await p.waitForSelector('#cfg-integracoes'); await p.waitForLoadState('networkidle');
  assert.equal(await p.isChecked('#cfg-integracoes'), true);
  await p.uncheck('#cfg-integracoes');
  await p.click('#form-cfg .cfg-salvar .btn-verde');
  await p.waitForSelector('#lateral [data-item="integracoes"]', { state: 'detached' });
  assert.equal(lerConfig(N.app.db).integracoes.ativa, false);
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  assert.equal((await admin.get('/api/admin/integracoes')).status, 404);
  assert.deepEqual(erros, []);
  await ctx.close();
});
