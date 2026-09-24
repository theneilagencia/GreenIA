import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryEmailSender } from '../src/email/sender.ts';
import { RedisRateLimiter } from '../src/usage/rate-limit.ts';
import { costBrl } from '../src/usage/pricing.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
const email = new MemoryEmailSender();
let t: Awaited<ReturnType<typeof seedTenant>>;
let people: string[] = [];

before(async () => {
  db = await createTestDb();
  t = await seedTenant(db.owner, 'repet', { role: 'admin_cliente', email: 'admin@repet.com.br' });
  await db.owner.query(`update tenants set config = $1 where id = $2`,
    [{ limits: { userPerMinute: 3, tenantPerMinute: 5, monthlyBudgetBrl: 0.05, hardLimit: true } }, t.tenantId]);
  people = [await addPerson(db, t.tenantId, 'a@repet.com.br', 'usuario'), await addPerson(db, t.tenantId, 'b@repet.com.br', 'usuario')];
  app = await buildTestApp(db, { fake, email }, { USD_BRL: '5' });
});
after(async () => { await app?.close(); await db?.drop(); });

async function chat(userId: string) {
  return app.inject({ method: 'POST', url: '/api/chat', headers: (await loginAs(db, userId)).headers, payload: { messages: [{ role: 'user', content: 'oi' }] } });
}

test('custo em reais pela tabela de preços e câmbio', () => {
  // Haiku 4.5: US$ 1 e US$ 5 por milhão de tokens.
  assert.equal(costBrl('claude-haiku-4-5', 1_000_000, 0, 5), 5);
  assert.equal(costBrl('claude-haiku-4-5', 0, 1_000_000, 5), 25);
  // Modelo desconhecido: usa o preço mais alto (não subestima).
  assert.equal(costBrl('modelo-novo', 1_000_000, 0, 1), 5);
});

test('limite por pessoa: a 4ª requisição no minuto é recusada', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await chat(people[0])).statusCode, 200);
  const r = await chat(people[0]);
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'muitas_requisicoes');
});

test('limite do tenant soma as pessoas', async () => {
  // 3 de a (acima) + 2 de b = 5; a próxima de b estoura o limite do tenant.
  assert.equal((await chat(people[1])).statusCode, 200);
  assert.equal((await chat(people[1])).statusCode, 200);
  assert.equal((await chat(people[1])).json().error, 'muitas_requisicoes_no_cliente');
});

test('cada resposta registra tokens e custo', async () => {
  const rows = (await db.owner.query(`select model, input_tokens, output_tokens, cost_brl from usage_events where tenant_id = $1`, [t.tenantId])).rows;
  assert.equal(rows.length, 5);
  assert.ok(rows.every(r => r.model === 'claude-haiku-4-5' && r.input_tokens > 0 && Number(r.cost_brl) > 0));
});

test('cota: a resposta que cruza 80% e 100% dispara cada alerta uma vez, com email aos admins; depois, bloqueio', async () => {
  // Leva o consumo do mês a 97% da cota (R$ 0,05), sem passar pelo limite de requisições.
  const spent = Number((await db.owner.query(`select coalesce(sum(cost_brl), 0) as s from usage_events where tenant_id = $1`, [t.tenantId])).rows[0].s);
  await db.owner.query(`insert into usage_events (tenant_id, provider, model, input_tokens, output_tokens, cost_brl) values ($1, 'x', 'x', 0, 0, $2)`, [t.tenantId, 0.0485 - spent]);
  await db.owner.query(`update tenants set config = jsonb_set(config, '{limits,tenantPerMinute}', '100') where id = $1`, [t.tenantId]);
  const other = await addPerson(db, t.tenantId, 'c@repet.com.br', 'usuario');
  const before = email.sent.length;
  // Abaixo de 100%: a resposta sai, e o custo dela cruza os dois limites.
  assert.equal((await chat(other)).statusCode, 200);
  const alerts = (await db.owner.query(`select threshold from quota_alerts where tenant_id = $1 order by threshold`, [t.tenantId])).rows.map(r => r.threshold);
  assert.deepEqual(alerts, [80, 100]);
  const sent = email.sent.slice(before);
  assert.equal(sent.filter(m => /80%/.test(m.subject)).length, 1);
  assert.equal(sent.filter(m => /100%/.test(m.subject)).length, 1);
  assert.ok(sent.every(m => m.to === 'admin@repet.com.br'));
  // Acima da cota, com bloqueio: recusa antes de chamar o modelo.
  const calls = fake.requests.length;
  const r = await chat(other);
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'cota_mensal_esgotada');
  assert.equal(fake.requests.length, calls);
  // Os alertas não se repetem no mesmo mês.
  const audits = (await db.owner.query(`select count(*) from audit_log where tenant_id = $1 and action = 'alerta_cota'`, [t.tenantId])).rows[0].count;
  assert.equal(Number(audits), 2);
});

test('sem bloqueio (hardLimit falso), a cota só alerta', async () => {
  await db.owner.query(`update tenants set config = jsonb_set(config, '{limits,hardLimit}', 'false') where id = $1`, [t.tenantId]);
  const u = await addPerson(db, t.tenantId, 'd@repet.com.br', 'usuario');
  assert.equal((await chat(u)).statusCode, 200);
});

test('RedisRateLimiter: conta no Redis real e recusa acima do limite', async () => {
  const rl = new RedisRateLimiter(process.env.REDIS_URL || 'redis://localhost:6379');
  const key = 'teste:' + Date.now();
  const results = [];
  for (let i = 0; i < 4; i++) results.push((await rl.hit(key, 3, 60)).ok);
  await rl.close();
  assert.deepEqual(results, [true, true, true, false]);
});
