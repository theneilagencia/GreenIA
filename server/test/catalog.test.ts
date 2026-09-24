// Catálogo de modelos da TheNeil: publicado pelo migrador a partir dos
// arquivos, lido pelos clientes, versionado. O assistente criado a partir de
// um modelo é do cliente: versão nova do modelo só gera aviso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';
import { loadCatalogFiles, syncCatalog } from '../src/catalog/catalog.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
let P: Awaited<ReturnType<typeof seedTenant>>;
const call = async (userId: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, userId)).headers, payload });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'construtora', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

test('o migrador publica o catálogo inteiro; nenhum modelo cita cliente', async () => {
  const files = loadCatalogFiles();
  const published = (await call(P.userId, 'GET', '/api/platform/catalog')).json();
  assert.equal(published.length, files.length);
  assert.ok(files.filter(f => f.kind === 'assistente').length >= 8);
  assert.doesNotMatch(JSON.stringify(files), /repet|sygecom|prumo|demonstracao/i);
  assert.equal((await call(T.userId, 'GET', '/api/platform/catalog')).statusCode, 403);
});

test('o cliente vê os modelos, com os leitores que faltam ligar', async () => {
  const list = (await call(T.userId, 'GET', '/api/catalog/assistants')).json();
  const slugs = list.map((m: { slug: string }) => m.slug);
  for (const s of ['comercial-proposta-requisitos', 'juridico-localizar-clausulas', 'suprimentos-cotacoes-especificacao', 'atendimento-procedimentos', 'conferencia-nota-pedido']) assert.ok(slugs.includes(s), s);
  assert.deepEqual(list.find((m: { slug: string }) => m.slug === 'conferencia-nota-pedido').leitoresDesligados, ['nfe', 'danfe']);
  assert.deepEqual(list.find((m: { slug: string }) => m.slug === 'juridico-localizar-clausulas').leitoresDesligados, []);
});

test('três formas de criar: do modelo, duplicando e do zero; modelo com leitor desligado é recusado', async () => {
  let r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'clausulas', name: 'Cláusulas dos contratos de obra', modelo: { slug: 'juridico-localizar-clausulas' } });
  assert.equal(r.statusCode, 201, r.body);
  r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'clausulas-locacao', name: 'Cláusulas de locação de equipamentos', duplicar: 'clausulas' });
  assert.equal(r.statusCode, 201, r.body);
  r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'notas', name: 'Notas', modelo: { slug: 'conferencia-nota-pedido' } });
  assert.equal(r.json().error, 'leitor_desligado');
  r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'xx', name: 'X', modelo: { slug: 'nao-existe' } });
  assert.equal(r.json().error, 'modelo_nao_encontrado');
  r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'yy', name: 'Y', modelo: { slug: 'juridico-localizar-clausulas' }, definition: {} });
  assert.equal(r.statusCode, 400);
  const list = (await call(T.userId, 'GET', '/api/assistants')).json();
  assert.deepEqual(list.find((a: { slug: string }) => a.slug === 'clausulas').origem, { tipo: 'modelo', modelo: { slug: 'juridico-localizar-clausulas', versao: 1, versaoNova: null } });
  assert.equal(list.find((a: { slug: string }) => a.slug === 'clausulas-locacao').origem.duplicadoDe, 'clausulas');
});

test('versão nova do modelo: o assistente do cliente não muda, só aparece o aviso', async () => {
  const v1 = (await call(T.userId, 'GET', '/api/admin/assistants/clausulas')).json();
  const tpl = (await call(T.userId, 'GET', '/api/catalog/assistants/juridico-localizar-clausulas')).json();
  const v2 = { ...tpl, version: 2, description: tpl.description + ' Inclui a cláusula de garantia.' };
  assert.equal((await call(P.userId, 'POST', '/api/platform/catalog', { ...v2, version: 5 })).json().error, 'versao_fora_de_ordem');
  assert.equal((await call(P.userId, 'POST', '/api/platform/catalog', v2)).statusCode, 201);
  const after = (await call(T.userId, 'GET', '/api/admin/assistants/clausulas')).json();
  assert.deepEqual(after.definition, v1.definition);
  assert.equal(after.version, 1);
  assert.equal(after.origem.modelo.versaoNova, 2);
});

test('conteúdo mudado sem mudar a versão é erro na publicação pelos arquivos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'catalogo-'));
  mkdirSync(join(dir, 'areas'));
  const t = { kind: 'areas', slug: 'teste-versao', version: 1, name: 'Teste', areas: [{ name: 'Uma' }] };
  writeFileSync(join(dir, 'areas', 'teste.json'), JSON.stringify(t));
  assert.deepEqual(await syncCatalog(db.owner, { dir }), ['areas:teste-versao@1']);
  writeFileSync(join(dir, 'areas', 'teste.json'), JSON.stringify({ ...t, areas: [{ name: 'Outra' }] }));
  await assert.rejects(syncCatalog(db.owner, { dir }), /mudou sem mudar a versão/);
});

test('modelo de áreas: aplicado no painel (sem repetir) e na criação do tenant', async () => {
  const models = (await call(T.userId, 'GET', '/api/catalog/areas')).json().map((m: { slug: string }) => m.slug);
  assert.ok(models.includes('construtora'));
  let r = await call(T.userId, 'POST', '/api/admin/areas/modelo', { modelo: 'construtora' });
  assert.deepEqual(r.json().criadas, ['engenharia', 'obras', 'suprimentos', 'juridico', 'seguranca-do-trabalho', 'financeiro']);
  r = await call(T.userId, 'POST', '/api/admin/areas/modelo', { modelo: 'construtora' });
  assert.deepEqual(r.json().criadas, []);
  const tree = (await call(T.userId, 'GET', '/api/admin/areas')).json();
  assert.ok(tree.some((a: { caminho: string }) => a.caminho === 'Engenharia > Obras'));
  r = await call(P.userId, 'POST', '/api/platform/tenants', {
    slug: 'clinicas-sul', name: 'Clínicas Sul', domains: ['clinicassul.com.br'], providers: [{ kind: 'email_code', label: 'Código por email' }],
    admins: ['admin@clinicassul.com.br'], modeloAreas: 'rede-de-clinicas', areas: [{ name: 'Pesquisa clínica' }], keyUsers: [{ email: 'gestor@clinicassul.com.br', area: 'manutencao' }],
  });
  assert.equal(r.statusCode, 201, r.body);
  const areas = (await db.owner.query(`select a.slug, p.slug as mae from areas a join tenants t on t.id = a.tenant_id left join areas p on p.id = a.parent_id where t.slug = 'clinicas-sul' order by a.position, a.slug`)).rows;
  assert.ok(areas.some(a => a.slug === 'manutencao' && a.mae === 'operacoes'));
  assert.ok(areas.some(a => a.slug === 'pesquisa-clinica'));
  r = await call(P.userId, 'POST', '/api/platform/tenants', { slug: 'vazio', name: 'Vazio', domains: ['vazio.com.br'], providers: [{ kind: 'email_code', label: 'Código' }], admins: ['a@vazio.com.br'] });
  assert.equal(r.statusCode, 201);
  assert.equal((await db.owner.query(`select count(*)::int as n from areas a join tenants t on t.id = a.tenant_id where t.slug = 'vazio'`)).rows[0].n, 0);
});
