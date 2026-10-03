// Plano Liberado: créditos ilimitados, todos os recursos, nenhum limite; o cliente continua sem ver dólar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';

let S, ops, liberado, c, ana;
before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  liberado = planos.find(p => p.name === 'GreenIA Liberado');
  c = (await ops.post('/api/plataforma/empresas', { name: 'Livre', slug: 'livre', plan_id: liberado.id, admin_email: 'ana@livre.com', status: 'ativa' })).dados;
  ana = S.navegador(); await ana.get('/livre'); await ana.entrarEmpresa('ana@livre.com');
});
after(() => S.fechar());

test('o plano Liberado existe, com todos os recursos e sem limites', () => {
  assert.ok(liberado);
  assert.equal(liberado.credits, 0);
  assert.ok(Object.values(liberado.features).every(Boolean));
  assert.ok(Object.values(liberado.limits).every(v => v === 0));
});

test('empresa no Liberado: plano ilimitado, sem bloqueio nem limite de mensagens, e sem dólar para o cliente', async () => {
  const t = S.P.tenant(c.id);
  assert.equal(t.plano.ilimitado, true);
  assert.equal(t.rajada, Infinity);
  const eu = (await ana.get('/api/eu')).dados;
  assert.equal(eu.unidade, 'creditos');
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  for (let i = 0; i < 15; i++) assert.equal((await ana.post(`/api/conversas/${conv.id}/mensagens`, { texto: `Olá ${i}` })).status, 200);
  const v = (await ana.get('/api/admin/visao-geral')).dados;
  assert.equal(v.uso.plano.ilimitado, true);
  assert.equal(v.uso.plano.fase, 'normal');
  assert.equal(v.uso.custo, v.uso.plano.usados);   // valores já convertidos em créditos, não dólar
  assert.equal((await ana.post('/api/quick-wins', { nome: 'Teste', areas: [] })).status !== 403, true);
});
