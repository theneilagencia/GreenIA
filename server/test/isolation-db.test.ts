// Isolamento no próprio banco: o papel do servidor nunca vê nem altera dado de
// outro tenant, mesmo que o código peça.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { withTenant } from '../src/db/pool.ts';

let db: TestDb;
let A: Awaited<ReturnType<typeof seedTenant>>;
let B: Awaited<ReturnType<typeof seedTenant>>;

before(async () => {
  db = await createTestDb();
  A = await seedTenant(db.owner, 'alfa');
  B = await seedTenant(db.owner, 'beta');
});
after(async () => { await db?.drop(); });

test('o papel do servidor não é dono nem tem BYPASSRLS', async () => {
  const r = await db.app.query(`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
  assert.deepEqual(r.rows[0], { rolsuper: false, rolbypassrls: false });
});

test('sem contexto de tenant, nenhuma linha aparece', async () => {
  const r = await db.app.query('select * from users');
  assert.equal(r.rowCount, 0);
});

test('com o tenant A, só aparecem dados de A', async () => {
  const rows = await withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query('select tenant_id, email from users').then(r => r.rows));
  assert.deepEqual(rows.map(r => r.email), [A.email]);
  const tenants = await withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query('select id from tenants').then(r => r.rows));
  assert.deepEqual(tenants.map(r => r.id), [A.tenantId]);
});

test('não dá para ler um registro de B pelo id, estando em A', async () => {
  const r = await withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query('select * from users where id = $1', [B.userId]));
  assert.equal(r.rowCount, 0);
});

test('não dá para inserir linha com tenant_id de outro tenant', async () => {
  await assert.rejects(
    withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(`insert into users (tenant_id, email) values ($1, 'intruso@beta.com.br')`, [B.tenantId])),
    /row-level security/,
  );
});

test('update e delete em linhas de B não afetam nada', async () => {
  const n = await withTenant(db.app, { tenantId: A.tenantId }, async tx => {
    const u = await tx.query(`update users set name = 'x' where id = $1`, [B.userId]);
    const d = await tx.query(`delete from users where id = $1`, [B.userId]);
    return u.rowCount! + d.rowCount!;
  });
  assert.equal(n, 0);
  const still = await db.owner.query('select name from users where id = $1', [B.userId]);
  assert.equal(still.rows[0].name, 'Pessoa beta');
});

test('mover uma linha de A para B é recusado', async () => {
  await assert.rejects(
    withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(`update users set tenant_id = $1 where id = $2`, [B.tenantId, A.userId])),
    /row-level security/,
  );
});

test('contexto vale só dentro da transação', async () => {
  await withTenant(db.app, { tenantId: A.tenantId }, async () => {});
  const r = await db.app.query('select * from users');
  assert.equal(r.rowCount, 0);
});

test('auditoria é somente inclusão', async () => {
  await withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(`insert into audit_log (tenant_id, action) values ($1, 'teste')`, [A.tenantId]));
  await assert.rejects(
    withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(`update audit_log set action = 'x'`)),
    /permission denied/,
  );
  await assert.rejects(db.owner.query(`update audit_log set action = 'x'`), /somente inclusão/);
  await assert.rejects(db.owner.query(`delete from audit_log`), /somente inclusão/);
});

test('public_tenant e session_lookup funcionam sem contexto, só com o mínimo', async () => {
  const r = await db.app.query('select * from public_tenant($1, $2)', ['', 'alfa']);
  assert.equal(r.rows[0].id, A.tenantId);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['config', 'id', 'name', 'providers', 'slug', 'status']);
  const none = await db.app.query('select * from session_lookup($1)', [Buffer.alloc(32)]);
  assert.equal(none.rowCount, 0);
});

test('withTenant recusa tenantId que não é uuid', async () => {
  await assert.rejects(withTenant(db.app, { tenantId: "x'; drop table users; --" }, async () => {}), /inválido/);
});
