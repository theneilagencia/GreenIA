import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { withTenant } from '../src/db/pool.ts';
import { audit } from '../src/audit.ts';
import { parseCsv } from '../src/util/csv.ts';

let db: TestDb;
let app: FastifyInstance;
let A: Awaited<ReturnType<typeof seedTenant>>;
let B: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};

const verify = async (userId: string) => (await app.inject({ url: '/api/audit/verify', headers: (await loginAs(db, userId)).headers })).json();
const log = (tenantId: string, action: string, details: Record<string, unknown> = {}) =>
  withTenant(db.app, { tenantId }, tx => audit(tx, { tenantId, action, details }));

before(async () => {
  db = await createTestDb();
  A = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  B = await seedTenant(db.owner, 'outro', { role: 'admin_cliente' });
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'rh', 'RH'), ($1, 'fiscal', 'Fiscal')`, [A.tenantId]);
  people.keyRh = await addPerson(db, A.tenantId, 'key.rh@repet.com.br', 'key_user', 'rh');
  people.keyFiscal = await addPerson(db, A.tenantId, 'key.fiscal@repet.com.br', 'key_user', 'fiscal');
  people.user = await addPerson(db, A.tenantId, 'ana@repet.com.br', 'usuario', 'rh');
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

test('cada registro aponta para o hash do anterior do mesmo tenant; a cadeia verifica', async () => {
  for (let i = 0; i < 5; i++) await log(A.tenantId, 'teste_cadeia', { i });
  await log(B.tenantId, 'teste_cadeia', { i: 0 });
  const rows = (await db.owner.query(`select seq, prev_hash, hash from audit_log where tenant_id = $1 order by seq`, [A.tenantId])).rows;
  assert.deepEqual(rows.map(r => Number(r.seq)), rows.map((_, i) => i + 1));
  assert.equal(rows[0].prev_hash, '0'.repeat(64));
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].prev_hash, rows[i - 1].hash);
  const v = await verify(A.userId);
  assert.equal(v.ok, true);
  assert.equal(v.registros, rows.length);
  assert.equal(v.hashFinal, rows.at(-1).hash);
  // A cadeia do outro tenant é independente.
  const b = (await db.owner.query(`select seq from audit_log where tenant_id = $1`, [B.tenantId])).rows;
  assert.ok(b.every(r => Number(r.seq) <= b.length));
});

test('inclusões simultâneas não repetem posição na cadeia', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => log(A.tenantId, 'teste_paralelo', { i })));
  assert.equal((await verify(A.userId)).ok, true);
});

test('o servidor não altera nem apaga registros, nem escolhe a data', async () => {
  await assert.rejects(withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(`update audit_log set action = 'x'`)));
  await assert.rejects(withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(`delete from audit_log`)));
  await withTenant(db.app, { tenantId: A.tenantId }, tx => tx.query(
    `insert into audit_log (tenant_id, action, at, seq, hash) values ($1, 'data_forjada', '2001-01-01', 1, 'x')`, [A.tenantId]));
  const r = (await db.owner.query(`select at, seq, hash from audit_log where action = 'data_forjada'`)).rows[0];
  assert.ok(new Date(r.at).getFullYear() > 2020);
  assert.notEqual(Number(r.seq), 1);
  assert.notEqual(r.hash, 'x');
  assert.equal((await verify(A.userId)).ok, true);
});

test('alterar um registro antigo quebra a verificação e aponta o registro', async () => {
  const alvo = (await db.owner.query(`select seq from audit_log where tenant_id = $1 and action = 'teste_cadeia' order by seq limit 1 offset 2`, [A.tenantId])).rows[0].seq;
  // Só o dono das tabelas, desligando a proteção, consegue alterar: é o ataque que a cadeia detecta.
  await db.owner.query(`alter table audit_log disable trigger audit_log_no_update`);
  try {
    await db.owner.query(`update audit_log set details = '{"i": 999}' where tenant_id = $1 and seq = $2`, [A.tenantId, alvo]);
    let v = await verify(A.userId);
    assert.equal(v.ok, false);
    assert.equal(v.primeiroQuebrado, Number(alvo));
    assert.equal(v.motivo, 'conteúdo alterado');
    // Recalcular o hash do registro alterado não basta: o seguinte deixa de conferir.
    await db.owner.query(`update audit_log set hash = audit_hash(audit_canonical(tenant_id, seq, at, actor_user_id, action, target, details, prev_hash)) where tenant_id = $1 and seq = $2`, [A.tenantId, alvo]);
    v = await verify(A.userId);
    assert.equal(v.primeiroQuebrado, Number(alvo) + 1);
    assert.equal(v.motivo, 'hash do anterior não confere');
    // O outro tenant continua íntegro.
    assert.equal((await verify(B.userId)).ok, true);
  } finally {
    await db.owner.query(`alter table audit_log enable trigger audit_log_no_update`);
  }
});

test('apagar um registro do meio também é detectado', async () => {
  const t = await seedTenant(db.owner, 'terceiro', { role: 'admin_cliente' });
  for (let i = 0; i < 4; i++) await log(t.tenantId, 'teste', { i });
  await db.owner.query(`alter table audit_log disable trigger audit_log_no_update`);
  try {
    await db.owner.query(`delete from audit_log where tenant_id = $1 and seq = 2`, [t.tenantId]);
  } finally {
    await db.owner.query(`alter table audit_log enable trigger audit_log_no_update`);
  }
  const v = await verify(t.userId);
  assert.equal(v.ok, false);
  assert.equal(v.primeiroQuebrado, 3);
});

test('histórico de um documento: envio, novas versões e uso; só para quem vê a área', async () => {
  const h = (await loginAs(db, people.keyRh)).headers;
  const up = await app.inject({ method: 'POST', url: '/api/kb/documents', headers: h, payload: { title: 'Admissão', areaSlug: 'rh', contentType: 'text/plain', text: 'Documentos de admissão: RG, CPF, comprovante de endereço.' } });
  assert.equal(up.statusCode, 201);
  const id = up.json().documentId;
  await app.inject({ method: 'POST', url: `/api/kb/documents/${id}/versions`, headers: h, payload: { contentType: 'text/plain', text: 'Documentos de admissão: RG, CPF, comprovante de endereço e carteira de trabalho.' } });
  await log(A.tenantId, 'execucao_concluida', { documentos: [{ id, version: 2 }] });
  const r = await app.inject({ url: `/api/audit/history?documento=${id}`, headers: h });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().map((x: { action: string }) => x.action), ['documento_enviado', 'documento_nova_versao', 'execucao_concluida']);
  // Key user de outra área e usuário comum não consultam.
  assert.equal((await app.inject({ url: `/api/audit/history?documento=${id}`, headers: (await loginAs(db, people.keyFiscal)).headers })).statusCode, 404);
  assert.equal((await app.inject({ url: `/api/audit/history?documento=${id}`, headers: (await loginAs(db, people.user)).headers })).statusCode, 403);
  // Outro tenant não enxerga o documento.
  assert.equal((await app.inject({ url: `/api/audit/history?documento=${id}`, headers: (await loginAs(db, B.userId)).headers })).statusCode, 404);
});

test('exportação da auditoria em CSV, com registro da própria exportação', async () => {
  const r = await app.inject({ url: '/api/audit/log?format=csv&acao=teste_cadeia', headers: (await loginAs(db, A.userId)).headers });
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['content-type'] as string, /text\/csv/);
  const rows = parseCsv(r.body);
  assert.deepEqual(rows[0], ['seq', 'at', 'actor_email', 'action', 'target', 'details', 'prev_hash', 'hash']);
  assert.equal(rows.length - 1, 5);
  const last = (await db.owner.query(`select action from audit_log where tenant_id = $1 order by seq desc limit 1`, [A.tenantId])).rows[0];
  assert.equal(last.action, 'auditoria_exportada');
  assert.equal((await app.inject({ url: '/api/audit/log', headers: (await loginAs(db, people.keyRh)).headers })).statusCode, 403);
});
