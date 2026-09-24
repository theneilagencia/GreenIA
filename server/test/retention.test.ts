import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { InlineJobQueue } from '../src/jobs/queue.ts';
import { withTenant } from '../src/db/pool.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
const queue = new InlineJobQueue();
let repet: Awaited<ReturnType<typeof seedTenant>>;
let outro: Awaited<ReturnType<typeof seedTenant>>;
let fiscalUser = '';
let rhUser = '';

async function createAssistant(tenantAdmin: string, slug: string, definition: unknown, areaSlug?: string) {
  const r = await app.inject({ method: 'POST', url: '/api/admin/assistants', headers: (await loginAs(db, tenantAdmin)).headers,
    payload: { slug, name: slug, status: 'ativo', areaSlug, definition } });
  assert.equal(r.statusCode, 201, r.body);
}
async function chat(userId: string, assistant: string | undefined, content: string) {
  const r = await app.inject({ method: 'POST', url: '/api/chat', headers: (await loginAs(db, userId)).headers,
    payload: { assistant, messages: [{ role: 'user', content }] } });
  assert.equal(r.statusCode, 200, r.body);
}
const count = async (tenantId: string) => Number((await db.owner.query(`select count(*) from outputs where tenant_id = $1`, [tenantId])).rows[0].count);

before(async () => {
  db = await createTestDb();
  repet = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  outro = await seedTenant(db.owner, 'outro', { role: 'admin_cliente' });
  await db.owner.query(`update tenants set config = '{"retention":{"defaultOutputDays":30}}' where id = $1`, [repet.tenantId]);
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal'), ($1, 'rh', 'RH')`, [repet.tenantId]);
  fiscalUser = await addPerson(db, repet.tenantId, 'fiscal@repet.com.br', 'usuario', 'fiscal');
  rhUser = await addPerson(db, repet.tenantId, 'rh@repet.com.br', 'usuario', 'rh');
  app = await buildTestApp(db, { fake, queue });
  fake.reply = () => 'Divergência: valor da nota 1.200,00 x pedido 1.150,00.';
  await createAssistant(repet.userId, 'conferencia-nf', { retention: { keepOutputs: true, days: 7 } }, 'fiscal');
  await createAssistant(repet.userId, 'resumo', { retention: { keepOutputs: false } });
  await createAssistant(repet.userId, 'evidencia-padrao', { retention: { keepOutputs: true } });
  await createAssistant(outro.userId, 'outro-evidencia', { retention: { keepOutputs: true, days: 1 } });
});
after(async () => { await app?.close(); await db?.drop(); });

test('chat livre e assistente sem evidência não gravam nada', async () => {
  await chat(repet.userId, undefined, 'Resumir: tudo certo');
  await chat(repet.userId, 'resumo', 'Resumir: tudo certo');
  assert.equal(await count(repet.tenantId), 0);
});

test('assistente com evidência grava a saída com o prazo dele, hashes e versão', async () => {
  await chat(fiscalUser, 'conferencia-nf', 'Confere a nota 123 contra o pedido 456');
  const o = (await db.owner.query(`select *, round(extract(epoch from expires_at - created_at) / 86400) as dias from outputs where tenant_id = $1`, [repet.tenantId])).rows[0];
  assert.equal(Number(o.dias), 7);
  assert.equal(o.assistant_version, 1);
  assert.equal(o.content, 'Divergência: valor da nota 1.200,00 x pedido 1.150,00.');
  assert.match(o.input_sha256, /^[0-9a-f]{64}$/);
  assert.match(o.output_sha256, /^[0-9a-f]{64}$/);
});

test('sem prazo no assistente, vale o padrão do tenant', async () => {
  await chat(repet.userId, 'evidencia-padrao', 'Organizar evidências');
  const o = (await db.owner.query(`select round(extract(epoch from expires_at - created_at) / 86400) as dias from outputs where tenant_id = $1 and assistant_version = 1 order by created_at desc limit 1`, [repet.tenantId])).rows[0];
  assert.equal(Number(o.dias), 30);
});

test('saída da área Fiscal: quem gerou vê; pessoa de outra área não', async () => {
  const see = (userId: string, areaIds: string[]) => withTenant(db.app, { tenantId: repet.tenantId, userId, areaIds }, tx =>
    tx.query(`select count(*) from outputs where area_id is not null`).then(r => Number(r.rows[0].count)));
  const rhArea = (await db.owner.query(`select id from areas where slug = 'rh' and tenant_id = $1`, [repet.tenantId])).rows[0].id;
  assert.equal(await see(fiscalUser, []), 1);
  assert.equal(await see(rhUser, [rhArea]), 0);
});

test('limpeza apaga só o que venceu, de cada tenant, e registra a contagem', async () => {
  await chat(outro.userId, 'outro-evidencia', 'Organizar');
  assert.equal(await count(outro.tenantId), 1);
  // Vence a saída do assistente de 7 dias; as de 30 dias e a do outro tenant continuam.
  await db.owner.query(`update outputs set expires_at = now() - interval '1 minute' where tenant_id = $1 and area_id is not null`, [repet.tenantId]);
  const before = await count(repet.tenantId);
  await queue.enqueue('retention:sweep', {});
  assert.equal(await count(repet.tenantId), before - 1);
  assert.equal(await count(outro.tenantId), 1);
  const a = (await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'retencao_expurgo'`, [repet.tenantId])).rows;
  assert.deepEqual(a.map(r => r.details), [{ saidasApagadas: 1 }]);
});

test('o servidor não consegue apagar saída diretamente (só pela rotina de expurgo)', async () => {
  await assert.rejects(withTenant(db.app, { tenantId: repet.tenantId, allAreas: true }, tx => tx.query(`delete from outputs`)), /permission denied/);
});
