import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';

test('criador sem administração prepara conexão, define pessoas e limites, retoma rascunho no celular', async () => {
  const N = await subirComNavegador();
  try {
    salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], integracoes: { ativa: true, pessoas: [] } });
    const adm = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
    const area = (await adm.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
    await adm.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia', areas: [{ id: area, responsavel: true }] });
    const p = await N.entrar('lia@empresa-exemplo.com.br');
    const erros = []; p.on('pageerror', e => erros.push(e.message));
    await p.goto(`${N.base}/app#/qw/nova`); await p.waitForSelector('#objetivo');
    await p.fill('#objetivo', 'Organize os pedidos de fornecedores e prepare um plano de acompanhamento.');
    await p.click('[data-continuar]'); await p.waitForSelector('#qw-sistema', { state: 'attached' });
    await p.locator('summary').filter({ hasText: 'Usar também um sistema da empresa' }).click();
    await p.locator('summary').filter({ hasText: 'Não encontrei o sistema' }).click();
    await p.fill('#qw-sistema-novo', 'ERP de compras');
    await p.selectOption('#qw-acao-nova', 'create_record');
    await p.click('[data-prep-necessidade]'); await p.waitForSelector('[data-prep-pedir]');
    await p.click('[data-prep-pedir]'); await p.waitForSelector('text=Pedido registrado. Quem prepara conexões');
    const id = /qw\/(\d+)/.exec(p.url())[1];
    assert.equal((await adm.get('/api/quick-wins/pedidos-conexao')).dados.pedidos.length, 1);
    const lia = await cliente(N.app, N.base).entrar('lia@empresa-exemplo.com.br');
    assert.equal((await lia.get('/api/quick-wins/pedidos-conexao')).status, 403);
    await p.click('[data-continuar]'); await p.waitForSelector('#qw-responsavel');
    await p.check('[name="qw-modo"][value="aprovar"]');
    await p.selectOption('#qw-aprovador', '1');
    await p.fill('#qw-max-acoes', '2'); await p.fill('#qw-max-itens', '3');
    await p.click('[data-continuar]'); await p.waitForSelector('input[name=saida]', { state: 'attached' });
    const q = (await adm.get(`/api/quick-wins/${id}`)).dados;
    assert.deepEqual(q.operacao.controles, { modo: 'aprovar', aprovador_id: 1, max_acoes: 2, max_registros: 3 });
    await p.reload(); await p.waitForSelector('#objetivo');
    await p.click('[data-continuar]'); await p.waitForSelector('#processo');
    await p.click('[data-continuar]'); await p.waitForSelector('#qw-max-itens');
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(await p.inputValue('#qw-max-itens'), '3');
    assert.equal(await p.inputValue('#qw-aprovador'), '1');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(erros, []);
  } finally { await N.fechar(); }
});
