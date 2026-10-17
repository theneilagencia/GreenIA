// Quick Wins 2.0 entre empresas: o Quick Win, a especificação e as versões de uma empresa não são alcançáveis
// a partir de outra (cada empresa tem o próprio banco; o id de uma não abre nada na outra).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { um } from '../src/db.js';

let S, ops, A, B;
before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company'));
  A = (await ops.post('/api/plataforma/empresas', { name: 'Alfa Ltda', slug: 'alfa', plan_id: plano.id, admin_email: 'ana@alfa.com', status: 'ativa' })).dados;
  B = (await ops.post('/api/plataforma/empresas', { name: 'Beta SA', slug: 'beta', plan_id: plano.id, admin_email: 'bia@beta.com', status: 'ativa' })).dados;
});
after(() => S.fechar());

test('isolamento: Quick Win 2.0 da empresa A não aparece nem abre na empresa B', async () => {
  const ana = S.navegador();
  await ana.get('/alfa');
  assert.equal((await ana.entrarEmpresa('ana@alfa.com')).status, 200);
  await ana.post('/api/politica/ciencia', { versao: (await ana.get('/api/politica')).dados.versao });
  const area = (await ana.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
  const r = await ana.post('/api/quick-wins', { assistente: { descricao: 'Compare pedidos de compra com notas de entrega' }, areas: [area] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const qw = r.dados;
  assert.equal(qw.v2, true);

  const bia = S.navegador();
  await bia.get('/beta');
  assert.equal((await bia.entrarEmpresa('bia@beta.com')).status, 200);
  assert.deepEqual((await bia.get('/api/quick-wins')).dados.quickWins, []);
  for (const [m, c] of [['get', `/api/quick-wins/${qw.id}`], ['get', `/api/quick-wins/${qw.id}/versoes`], ['post', `/api/quick-wins/${qw.id}/publicar`], ['post', `/api/quick-wins/${qw.id}/versoes/1/restaurar`]])
    assert.equal((await bia[m](c)).status, 404, c);
  assert.equal((await bia.post('/api/conversas', { quick_win_id: qw.id, teste: true })).status, 404);
  // No banco da empresa B não há nada da A.
  assert.equal(um(S.P.tenant(B.id).db, 'select count(*) as n from quick_wins').n, 0);
  assert.equal(um(S.P.tenant(B.id).db, 'select count(*) as n from quick_win_versoes').n, 0);
  assert.ok(um(S.P.tenant(A.id).db, 'select especificacao from quick_wins where id = ?', qw.id).especificacao);
  // A sessão de uma empresa não vale na outra.
  const cruzada = S.navegador();
  await cruzada.get('/alfa');
  await cruzada.entrarEmpresa('ana@alfa.com');
  cruzada.host = bia.host;
  await cruzada.get('/beta');
  assert.notEqual((await cruzada.get(`/api/quick-wins/${qw.id}`)).status, 200);
});
