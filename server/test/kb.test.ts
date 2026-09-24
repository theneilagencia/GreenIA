import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { chunkText } from '../src/kb/knowledge.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
const objects = new MemoryObjectStore();
let repet: Awaited<ReturnType<typeof seedTenant>>;
let outro: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
const docs: Record<string, string> = {};

// Mesmos documentos de exemplo do protótipo (Fase 1).
const REEMBOLSO = 'Despesas de viagem e representação são reembolsadas mediante nota fiscal. O pedido é feito no portal de despesas em até 30 dias após o gasto. O pagamento sai no quinto dia útil após a aprovação do gestor. Despesas sem comprovante não são reembolsadas. O limite de refeição em viagem nacional é de R$ 90 por dia.';
const FERIAS = 'As férias são de 30 dias por período aquisitivo de 12 meses. O pedido deve ser feito com no mínimo 30 dias de antecedência e aprovação do gestor. É possível dividir em até três períodos, um deles com pelo menos 14 dias. Faltas justificadas precisam de atestado enviado ao RH em até 48 horas.';

async function upload(userId: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/kb/documents', headers: (await loginAs(db, userId)).headers, payload });
}
async function search(userId: string, q: string) {
  const r = await app.inject({ url: '/api/kb/search?q=' + encodeURIComponent(q), headers: (await loginAs(db, userId)).headers });
  return r.json() as { title: string; version: number }[];
}

before(async () => {
  db = await createTestDb();
  repet = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  outro = await seedTenant(db.owner, 'outro', { role: 'admin_cliente' });
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'rh', 'RH'), ($1, 'financeiro', 'Financeiro')`, [repet.tenantId]);
  people.keyFin = await addPerson(db, repet.tenantId, 'key.fin@repet.com.br', 'key_user', 'financeiro');
  people.rh = await addPerson(db, repet.tenantId, 'rh@repet.com.br', 'usuario', 'rh');
  people.fin = await addPerson(db, repet.tenantId, 'fin@repet.com.br', 'usuario', 'financeiro');
  people.geral = await addPerson(db, repet.tenantId, 'geral@repet.com.br', 'usuario');
  app = await buildTestApp(db, { fake, objects });
  const r1 = await upload(people.keyFin, { title: 'Reembolso de despesas', areaSlug: 'financeiro', contentType: 'text/plain', text: REEMBOLSO });
  assert.equal(r1.statusCode, 201);
  docs.reembolso = r1.json().documentId;
  const r2 = await upload(repet.userId, { title: 'Férias e ausências', areaSlug: 'rh', contentType: 'text/markdown', text: FERIAS });
  docs.ferias = r2.json().documentId;
  const r3 = await upload(repet.userId, { title: 'Suporte de TI (DIT)', contentType: 'text/plain', text: 'Para abrir um chamado, use o portal de suporte. O reset de senha é feito no autoatendimento ou pelo ramal 4000.' });
  docs.ti = r3.json().documentId;
});
after(async () => { await app?.close(); await db?.drop(); });

test('documento enviado vai para o armazenamento, dentro do prefixo do tenant, e é indexado', async () => {
  const keys = await objects.list(`tenants/${repet.tenantId}/kb/${docs.reembolso}/`);
  assert.equal(keys.length, 1);
  const list = (await app.inject({ url: '/api/kb/documents', headers: (await loginAs(db, repet.userId)).headers })).json();
  assert.ok(list.every((d: { ultimo_status: string }) => d.ultimo_status === 'indexado'));
});

test('busca da Fase 1 no servidor: mesmos casos, mesmo resultado', async () => {
  assert.equal((await search(people.fin, 'limite de refeição em viagem'))[0]?.title, 'Reembolso de despesas');
  assert.equal((await search(people.rh, 'quantos dias de férias'))[0]?.title, 'Férias e ausências');
  assert.deepEqual(await search(repet.userId, 'dia'), []);
});

test('quem não é da área não vê o documento restrito', async () => {
  assert.deepEqual(await search(people.rh, 'limite de refeição em viagem'), []);
  assert.deepEqual(await search(people.geral, 'quantos dias de férias'), []);
  // Documento geral (sem área) aparece para todos.
  assert.equal((await search(people.geral, 'reset de senha no suporte'))[0]?.title, 'Suporte de TI (DIT)');
});

test('outro tenant não vê nada da base da Repet', async () => {
  assert.deepEqual(await search(outro.userId, 'reset de senha no suporte'), []);
  const list = (await app.inject({ url: '/api/kb/documents', headers: (await loginAs(db, outro.userId)).headers })).json();
  assert.deepEqual(list, []);
});

test('só key user da área (ou admin) envia documento na área', async () => {
  assert.equal((await upload(people.fin, { title: 'X', areaSlug: 'financeiro', contentType: 'text/plain', text: 'x' })).statusCode, 403);
  assert.equal((await upload(people.keyFin, { title: 'X', areaSlug: 'rh', contentType: 'text/plain', text: 'x' })).statusCode, 403);
  assert.equal((await upload(people.keyFin, { title: 'X', contentType: 'text/plain', text: 'x' })).statusCode, 403);
  assert.equal((await upload(people.keyFin, { title: 'X', areaSlug: 'financeiro', contentType: 'application/pdf', text: 'x' })).statusCode, 415);
});

test('chat usa a base: trechos na pergunta, fontes no meta e documento/versão na auditoria', async () => {
  const { headers } = await loginAs(db, people.fin);
  const r = await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { messages: [{ role: 'user', content: 'qual o limite de refeição em viagem?' }] } });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /event: meta\ndata: \{"sources":\[\{"title":"Reembolso de despesas"/);
  assert.match(fake.requests.at(-1)!.messages[0].content, /R\$ 90 por dia/);
  const a = (await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'resposta_gerada' order by id desc limit 1`, [repet.tenantId])).rows[0];
  assert.deepEqual(a.details.fontes, [{ documento: docs.reembolso, versao: 1 }]);
  assert.ok(!JSON.stringify(a).includes('90 por dia'), 'auditoria não guarda conteúdo');
});

test('pergunta de seguimento usa a mensagem anterior da pessoa', async () => {
  const { headers } = await loginAs(db, people.fin);
  const r = await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { messages: [
    { role: 'user', content: 'qual o limite de refeição em viagem?' }, { role: 'assistant', content: 'R$ 90 por dia.' },
    { role: 'user', content: 'e se for internacional?' },
  ] } });
  assert.match(r.body, /Reembolso de despesas/);
});

test('com a base desligada, nada é injetado', async () => {
  const { headers } = await loginAs(db, people.fin);
  await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { useKnowledge: false, messages: [{ role: 'user', content: 'qual o limite de refeição em viagem?' }] } });
  assert.equal(fake.requests.at(-1)!.messages[0].content, 'qual o limite de refeição em viagem?');
});

test('nova versão substitui o texto pesquisável e a resposta registra a versão 2', async () => {
  const r = await app.inject({ method: 'POST', url: `/api/kb/documents/${docs.reembolso}/versions`, headers: (await loginAs(db, people.keyFin)).headers,
    payload: { contentType: 'text/plain', text: REEMBOLSO.replace('R$ 90 por dia', 'R$ 110 por dia') } });
  assert.deepEqual(r.json(), { documentId: docs.reembolso, version: 2 });
  const hits = await search(people.fin, 'limite de refeição em viagem');
  assert.equal(hits[0].version, 2);
  const { headers } = await loginAs(db, people.fin);
  await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { messages: [{ role: 'user', content: 'qual o limite de refeição em viagem?' }] } });
  assert.match(fake.requests.at(-1)!.messages[0].content, /R\$ 110 por dia/);
  assert.doesNotMatch(fake.requests.at(-1)!.messages[0].content, /R\$ 90 por dia/);
  // A versão 1 continua guardada no armazenamento (histórico).
  assert.equal((await objects.list(`tenants/${repet.tenantId}/kb/${docs.reembolso}/`)).length, 2);
});

test('trechos: texto longo é quebrado por parágrafo, sem perder conteúdo', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i}. ` + 'palavra '.repeat(20)).join('\n\n');
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 1200));
  const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
  assert.equal(flat(chunks.join(' ')), flat(text));
});
