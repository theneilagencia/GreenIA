// Registro de leitores: um cliente que não lida com nota fiscal nunca vê os
// leitores fiscais. Sem o leitor ligado, o XML de NF-e é só texto e um
// assistente que exige nfe_xml não é gravado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, enableReaders, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';
import { READERS } from '../src/readers/registry.ts';
import { detectKind } from '../src/blocks/ler.ts';
import { inputFile, nfeXml } from './fixtures.ts';

let db: TestDb;
let app: FastifyInstance;
let semNota: Awaited<ReturnType<typeof seedTenant>>;
let comNota: Awaited<ReturnType<typeof seedTenant>>;
const call = async (userId: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, userId)).headers, payload });
const NFE_DEF = { inputs: { files: { enabled: true, accept: ['nfe_xml', 'xlsx'] } }, pipeline: [{ bloco: 'ler' }] };

before(async () => {
  db = await createTestDb();
  semNota = await seedTenant(db.owner, 'clinica', { role: 'admin_cliente' });
  comNota = await seedTenant(db.owner, 'distribuidora', { role: 'admin_cliente' });
  await enableReaders(db.owner, comNota.tenantId);
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

test('cada leitor declara o que reconhece e os campos que entrega', () => {
  for (const r of READERS) {
    assert.ok(r.id && r.label && r.description && r.instruction, r.id);
    assert.ok(r.fields.length > 0, r.id);
    assert.ok((r.kind && r.matches && r.read) || r.enrich, `${r.id} precisa reconhecer um arquivo ou enriquecer um documento`);
  }
});

test('a lista de leitores do cliente só tem os ligados', async () => {
  assert.deepEqual((await call(semNota.userId, 'GET', '/api/readers')).json(), []);
  const ids = (await call(comNota.userId, 'GET', '/api/readers')).json().map((r: { id: string }) => r.id);
  assert.deepEqual(ids, ['nfe', 'danfe']);
});

test('sem o leitor, NF-e é texto e o assistente que exige nfe_xml não é gravado', async () => {
  const xml = inputFile('nota.xml', nfeXml({ numero: '7', emissao: '2026-09-01', itens: [] }));
  assert.equal(detectKind(xml), 'texto');
  const r = await call(semNota.userId, 'POST', '/api/admin/assistants', { slug: 'conferencia', name: 'Conferência', definition: NFE_DEF });
  assert.equal(r.statusCode, 409);
  assert.deepEqual([r.json().error, r.json().leitores], ['leitor_desligado', ['nfe']]);
  assert.equal((await call(comNota.userId, 'POST', '/api/admin/assistants', { slug: 'conferencia', name: 'Conferência', definition: NFE_DEF })).statusCode, 201);
});

test('tipo de arquivo desconhecido e leitor inexistente na conferência são recusados', async () => {
  let r = await call(comNota.userId, 'POST', '/api/admin/assistants', { slug: 'x1', name: 'X', definition: { inputs: { files: { enabled: true, accept: ['dwg'] } } } });
  assert.equal(r.json().error, 'definicao_invalida');
  r = await call(comNota.userId, 'POST', '/api/admin/assistants', { slug: 'x2', name: 'X', definition: { inputs: { files: { enabled: true } },
    pipeline: [{ bloco: 'conferir', params: { esquerda: { de: 'leitor', leitor: 'cte' }, direita: { de: 'tabela' }, regras: [{ campo: 'a', esquerda: 'a', direita: 'a' }] } }] } });
  assert.equal(r.json().error, 'definicao_invalida');
  assert.match(JSON.stringify(r.json().detalhes), /leitor registrado/);
});
