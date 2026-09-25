// Isolamento entre tenants pela API, por id: o admin de um tenant, conhecendo o
// id de algo de outro tenant, não lê, não baixa e não altera nada. A RLS devolve
// "não existe" (404), sem dizer que o id é de outro cliente.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';

let db: TestDb, app: FastifyInstance;
let A: Awaited<ReturnType<typeof seedTenant>>, B: Awaited<ReturnType<typeof seedTenant>>;
const objects = new MemoryObjectStore();
const req = async (userId: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url, headers: (await loginAs(db, userId)).headers, ...(payload ? { payload } : {}) });
const RESUMO = { inputs: { text: { enabled: true }, files: { enabled: true, accept: ['texto'] } }, pipeline: [{ bloco: 'ler' }, { bloco: 'resumir', params: { topicos: ['Situação'] } }] };
const ids: { run: string; file: string; exportacao: string } = { run: '', file: '', exportacao: '' };

before(async () => {
  db = await createTestDb();
  A = await seedTenant(db.owner, 'alfa', { role: 'admin_cliente' });
  B = await seedTenant(db.owner, 'beta', { role: 'admin_cliente' });
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'financeiro', 'Financeiro')`, [A.tenantId]);
  const anaA = await addPerson(db, A.tenantId, 'ana@alfa.com.br', 'usuario', 'financeiro');
  app = await buildTestApp(db, { fake: new FakeProvider(), objects });
  assert.equal((await req(A.userId, 'POST', '/api/admin/assistants', { slug: 'resumo', name: 'Resumo', areaSlug: 'financeiro', status: 'ativo', definition: RESUMO })).statusCode, 201);
  const r = await req(anaA, 'POST', '/api/runs', { assistant: 'resumo', text: 'Resumo do mês.', files: [{ name: 'notas.txt', contentBase64: Buffer.from('Receita de agosto: R$ 10 mil.').toString('base64') }] });
  assert.equal(r.statusCode, 202, r.body);
  ids.run = r.json().runId;
  ids.file = (await req(A.userId, 'GET', `/api/runs/${ids.run}`)).json().files[0].id;
  const e = await req(A.userId, 'POST', '/api/admin/exports', {});
  ids.exportacao = e.json().id;
  assert.ok(ids.run && ids.file && ids.exportacao);
});
after(async () => { await app?.close(); await db?.drop(); });

test('o admin do tenant A lê o que é dele (controle do teste)', async () => {
  assert.equal((await req(A.userId, 'GET', `/api/runs/${ids.run}`)).statusCode, 200);
  assert.equal((await req(A.userId, 'GET', `/api/runs/${ids.run}/files/${ids.file}`)).statusCode, 200);
  assert.equal((await req(A.userId, 'GET', `/api/admin/exports/${ids.exportacao}/download`)).statusCode, 200);
});

test('o admin do tenant B, com os ids de A, recebe 404 em execução, arquivo, exportação, revisão e assistente', async () => {
  const tentativas: [string, 'GET' | 'POST', string, object?][] = [
    ['execução', 'GET', `/api/runs/${ids.run}`],
    ['arquivo de entrada', 'GET', `/api/runs/${ids.run}/files/${ids.file}`],
    ['exportação da execução', 'GET', `/api/runs/${ids.run}/export?format=xlsx`],
    ['revisão', 'POST', `/api/runs/${ids.run}/review`, { decisao: 'aprovado' }],
    ['exportação completa do tenant', 'GET', `/api/admin/exports/${ids.exportacao}/download`],
    ['assistente', 'GET', '/api/admin/assistants/resumo'],
    ['pacote do assistente', 'GET', '/api/admin/assistants/resumo/package'],
  ];
  for (const [o, method, url, payload] of tentativas) {
    const r = await req(B.userId, method, url, payload);
    assert.equal(r.statusCode, 404, `${o}: ${r.statusCode} ${r.body.slice(0, 120)}`);
    assert.ok(!r.body.includes('Receita de agosto'), `${o}: nada do conteúdo de A`);
  }
  // Nada mudou em A: a execução continua em rascunho.
  assert.equal((await req(A.userId, 'GET', `/api/runs/${ids.run}`)).json().status, 'rascunho');
  // E a lista de B não mostra nada de A.
  const lista = await req(B.userId, 'GET', '/api/runs');
  assert.ok(!lista.body.includes(ids.run));
  const aud = await req(B.userId, 'GET', '/api/audit');
  assert.ok(!aud.body.includes(ids.run));
});
