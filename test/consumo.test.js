// Consumo de IA no console: conta no OpenRouter, total da plataforma, cada empresa e alerta de saldo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { exec } from '../src/db.js';
import { conferirSaldo } from '../src/plataforma/consumo.js';

let S, ops, A, conta, chamadasConta = 0;
const ia = { configurada: true, async listarModelos() { return []; }, async *enviar() {},
  async conta() { chamadasConta++; return conta; } };

before(async () => {
  S = await subirPlataforma({ ia });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  A = (await ops.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa', status: 'ativa', plan_id: planos.find(p => p.credits > 0).id, admin_email: 'x@alfa.com' })).dados;
  const db = S.P.tenant(A.id).db, hoje = new Date();
  for (let d = 0; d < 10; d++) for (let i = 0; i < 3; i++) exec(db, 'insert into uso (em, pessoa_id, conversa_id, modelo_usado, custo) values (?, 1, 1, ?, 0.5)', new Date(hoje - d * 864e5).toISOString(), i ? 'x/modelo-a' : 'y/modelo-b');
});
after(() => S.fechar());

test('console mostra saldo, créditos e uso da chave no OpenRouter, e o consumo diário da plataforma e da empresa', async () => {
  conta = { chave: { label: 'prod', usage: 100, limit: null, limit_remaining: null, usage_daily: 1.5, usage_weekly: 10.5, usage_monthly: 15 }, creditos: { total_credits: 200, total_usage: 150 } };
  const r = (await ops.get('/api/plataforma/consumo?forcar=1')).dados;
  assert.equal(r.conta.saldo, 50);
  assert.deepEqual([r.conta.comprado, r.conta.gasto, r.conta.chave.hoje, r.conta.chave.mes], [200, 150, 1.5, 15]);
  assert.equal(r.serie.length, 30);
  assert.equal(r.serie.at(-1).custo, 1.5, 'hoje: três respostas de 0,50');
  const e = r.empresas.find(x => x.id === A.id);
  assert.deepEqual([e.custoHoje, e.custo7], [1.5, 10.5]);
  assert.equal(e.serie.length, 30);
  assert.equal(r.alerta.diasRestantes, Math.floor(50 / 1.5));
  assert.equal(JSON.stringify(r).includes('Bearer'), false);
  const d = (await ops.get(`/api/plataforma/empresas/${A.id}/consumo`)).dados;
  assert.deepEqual(d.porModelo.map(x => x.modelo), ['x/modelo-a', 'y/modelo-b']);
  // Cache de 5 minutos: sem forcar, não chama o OpenRouter de novo.
  const n = chamadasConta; await ops.get('/api/plataforma/consumo'); assert.equal(chamadasConta, n);
});

test('só o admin da plataforma vê; a empresa não vê a conta nem o consumo das outras', async () => {
  const x = S.navegador(); await x.get('/alfa'); await x.entrarEmpresa('x@alfa.com');
  assert.notEqual((await x.get('/api/plataforma/consumo')).status, 200);
  assert.equal((await S.navegador().get('/api/plataforma/consumo')).status, 401);
});

test('saldo abaixo do alerta avisa os admins por email, no máximo uma vez por dia; o limite é configurável', async () => {
  assert.equal((await ops.put('/api/plataforma/consumo/alerta', { limiarUsd: -1 })).status, 400);
  conta = { chave: { usage: 1, usage_daily: 1, usage_weekly: 1, usage_monthly: 1 }, creditos: { total_credits: 10, total_usage: 7 } };
  const antes = S.P.email.enviados.length;
  assert.equal((await ops.put('/api/plataforma/consumo/alerta', { limiarUsd: 5 })).status, 200);
  const m = S.P.email.enviados.slice(antes).find(x => /Saldo de IA baixo/.test(x.assunto));
  assert.ok(m, 'email enviado');
  assert.match(m.texto, /US\$ 3\.00/);
  const n = S.P.email.enviados.length;
  await conferirSaldo(S.P);
  assert.equal(S.P.email.enviados.length, n, 'não repete no mesmo dia');
  // Chave sem acesso ao saldo: usa o que resta do limite da chave.
  conta = { chave: { usage: 1, limit: 50, limit_remaining: 42 }, creditos: { erro: 403 } };
  const r = (await ops.get('/api/plataforma/consumo?forcar=1')).dados;
  assert.equal(r.conta.saldo, null);
  assert.match(r.conta.creditosIndisponivel, /não tem acesso/);
  assert.equal(r.alerta.abaixo, false);
});

test('cliente do OpenRouter lê /key e /credits e tolera a parte que falhar', async () => {
  const { criarOpenRouter } = await import('../src/ia.js');
  const pedidos = [];
  const f = async (url, op) => { pedidos.push([url, op.headers.authorization]); return url.endsWith('/key')
    ? new Response(JSON.stringify({ data: { label: 'k', usage: 3, usage_daily: 1 } }), { status: 200 })
    : new Response('{}', { status: 403 }); };
  const r = await criarOpenRouter({ chave: 'sk-teste', fetch: f }).conta();
  assert.deepEqual(r, { chave: { label: 'k', usage: 3, usage_daily: 1 }, creditos: { erro: 403 } });
  assert.deepEqual(pedidos.map(p => p[0]).sort(), ['https://openrouter.ai/api/v1/credits', 'https://openrouter.ai/api/v1/key']);
  assert.ok(pedidos.every(p => p[1] === 'Bearer sk-teste'));
});
