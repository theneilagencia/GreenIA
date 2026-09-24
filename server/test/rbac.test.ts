import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { withTenant } from '../src/db/pool.ts';

let db: TestDb;
let app: FastifyInstance;
let repet: Awaited<ReturnType<typeof seedTenant>>;
let outro: Awaited<ReturnType<typeof seedTenant>>;
let ids: Record<string, string> = {};

before(async () => {
  db = await createTestDb();
  repet = await seedTenant(db.owner, 'repet', { email: 'admin@repet.com.br', role: 'admin_cliente' });
  outro = await seedTenant(db.owner, 'outro', { email: 'admin@outro.com.br', role: 'admin_cliente' });
  for (const [slug, name] of [['rh', 'RH / DP'], ['fiscal', 'Fiscal']]) {
    await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, $2, $3)`, [repet.tenantId, slug, name]);
  }
  ids = {
    usuario: await addPerson(db, repet.tenantId, 'usuario@repet.com.br', 'usuario'),
    keyRh: await addPerson(db, repet.tenantId, 'key.rh@repet.com.br', 'key_user', 'rh'),
    usuarioFiscal: await addPerson(db, repet.tenantId, 'fiscal@repet.com.br', 'usuario', 'fiscal'),
  };
  const theneil = await seedTenant(db.owner, 'theneil', { email: 'ops@theneil.com.br', role: 'admin_theneil' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [theneil.tenantId]);
  ids.ops = theneil.userId;
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

const post = async (userId: string, url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: (await loginAs(db, userId)).headers });

test('admin do cliente cria área; usuário comum não', async () => {
  assert.equal((await post(repet.userId, '/api/admin/areas', { slug: 'financeiro', name: 'Financeiro' })).statusCode, 201);
  assert.equal((await post(ids.usuario, '/api/admin/areas', { slug: 'lgpd', name: 'LGPD & Compliance' })).statusCode, 403);
});

test('key user dá papel de usuário ou revisor só na própria área', async () => {
  assert.equal((await post(ids.keyRh, '/api/admin/memberships', { email: 'nova@repet.com.br', areaSlug: 'rh', role: 'revisor' })).statusCode, 201);
  assert.equal((await post(ids.keyRh, '/api/admin/memberships', { email: 'nova@repet.com.br', areaSlug: 'fiscal', role: 'usuario' })).statusCode, 403);
  assert.equal((await post(ids.keyRh, '/api/admin/memberships', { email: 'nova@repet.com.br', areaSlug: 'rh', role: 'key_user' })).statusCode, 403);
  assert.equal((await post(ids.keyRh, '/api/admin/memberships', { email: 'nova@repet.com.br', role: 'admin_cliente' })).statusCode, 403);
});

test('usuário comum não atribui papel nenhum', async () => {
  assert.equal((await post(ids.usuario, '/api/admin/memberships', { email: 'x@repet.com.br', areaSlug: 'rh', role: 'usuario' })).statusCode, 403);
});

test('admin não dá papel a email de domínio fora do tenant', async () => {
  assert.equal((await post(repet.userId, '/api/admin/memberships', { email: 'x@outro.com.br', role: 'usuario' })).statusCode, 422);
});

test('admin de um tenant não enxerga áreas nem pessoas de outro', async () => {
  const r = await app.inject({ url: '/api/admin/users', headers: (await loginAs(db, outro.userId)).headers });
  assert.equal(r.statusCode, 200);
  assert.ok(r.json().every((u: { email: string }) => u.email.endsWith('@outro.com.br')));
  const areas = await app.inject({ url: '/api/admin/areas', headers: (await loginAs(db, outro.userId)).headers });
  assert.deepEqual(areas.json(), []);
  assert.equal((await post(outro.userId, '/api/admin/memberships', { email: 'y@outro.com.br', areaSlug: 'rh', role: 'usuario' })).statusCode, 404);
});

test('visibilidade por área no banco: só as próprias áreas, admin vê todas', async () => {
  const [rh, fiscal] = (await db.owner.query(`select id from areas where tenant_id = $1 and slug in ('rh', 'fiscal') order by slug desc`, [repet.tenantId])).rows.map(r => r.id);
  const see = (ctx: { areaIds?: string[]; allAreas?: boolean }) => withTenant(db.app, { tenantId: repet.tenantId, ...ctx }, tx =>
    tx.query(`select app_can_see_area(null) as geral, app_can_see_area($1) as rh, app_can_see_area($2) as fiscal`, [rh, fiscal]).then(r => r.rows[0]));
  assert.deepEqual(await see({ areaIds: [rh] }), { geral: true, rh: true, fiscal: false });
  assert.deepEqual(await see({ areaIds: [] }), { geral: true, rh: false, fiscal: false });
  assert.deepEqual(await see({ allAreas: true }), { geral: true, rh: true, fiscal: true });
});

test('sessão carrega papéis e áreas', async () => {
  const r = await app.inject({ url: '/api/session', headers: (await loginAs(db, ids.keyRh)).headers });
  assert.deepEqual(r.json().areas, [{ slug: 'rh', name: 'RH / DP', role: 'key_user' }]);
});

test('criar tenant: só admin_theneil do tenant da TheNeil', async () => {
  const body = {
    slug: 'cliente-novo', name: 'Cliente Novo', domains: ['clientenovo.com.br'],
    providers: [{ kind: 'email_code', label: 'Código por email' }], admins: ['ti@clientenovo.com.br'],
    areas: [{ slug: 'fiscal', name: 'Fiscal' }], config: { branding: { colors: { primary: '#66D9A0' } } },
  };
  assert.equal((await post(repet.userId, '/api/platform/tenants', body)).statusCode, 403);
  const r = await post(ids.ops, '/api/platform/tenants', body);
  assert.equal(r.statusCode, 201);
  assert.ok(r.json().themeAdjustments.length > 0, 'cor clara deveria gerar variante');
  assert.equal((await post(ids.ops, '/api/platform/tenants', body)).statusCode, 409);
  const cfg = await app.inject({ url: '/api/tenant/config?tenant=cliente-novo' });
  assert.equal(cfg.statusCode, 200);
});

test('criar tenant recusa segredo na configuração e admin fora do domínio', async () => {
  const base = { slug: 'x-teste', name: 'X', domains: ['x.com.br'], admins: ['a@x.com.br'] };
  const secret = await post(ids.ops, '/api/platform/tenants', { ...base, providers: [{ kind: 'entra', label: 'MS', config: { clientSecret: 'abc' } }] });
  assert.equal(secret.statusCode, 400);
  const admin = await post(ids.ops, '/api/platform/tenants', { ...base, admins: ['a@gmail.com'], providers: [{ kind: 'email_code', label: 'C' }] });
  assert.equal(admin.statusCode, 400);
});
