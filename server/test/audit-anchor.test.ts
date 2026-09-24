// Âncora diária da auditoria: publicação por tenant, uma por dia, sem
// sobrescrever; verificação contra a âncora; histórico e exportação para o
// admin do cliente. O caso principal: o dono do banco reescreve a cadeia
// inteira de forma consistente; audit_verify() passa, a âncora não.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { MemoryAnchorStore, anchorKey, publishTenantAnchor } from '../src/audit/anchor.ts';

let db: TestDb;
let app: FastifyInstance;
const anchors = new MemoryAnchorStore();
let T: Awaited<ReturnType<typeof seedTenant>>;
let P: Awaited<ReturnType<typeof seedTenant>>;
let key = '';
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });
const post = async (userId: string, url: string, payload: object = {}) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal')`, [T.tenantId]);
  key = await addPerson(db, T.tenantId, 'key.fiscal@repet.com.br', 'key_user', 'fiscal');
  for (const action of ['login', 'documento_enviado', 'resposta_gerada']) {
    await db.owner.query(`insert into audit_log (tenant_id, action, details) values ($1, $2, '{}')`, [T.tenantId, action]);
  }
  app = await buildTestApp(db, { anchors });
});
after(async () => { await app?.close(); await db?.drop(); });

test('publicação diária: uma âncora por tenant e por dia, com retenção, sem sobrescrever', async () => {
  assert.equal((await post(T.userId, '/api/platform/audit/anchors/run')).statusCode, 403);
  const r = await post(P.userId, '/api/platform/audit/anchors/run');
  assert.equal(r.statusCode, 200, r.body);
  const mine = r.json().resultados.find((x: { tenantId: string }) => x.tenantId === T.tenantId);
  assert.equal(mine.status, 'publicada');
  const head = (await db.owner.query(`select seq, hash from audit_log where tenant_id = $1 and seq = $2`, [T.tenantId, mine.seq])).rows[0];
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const obj = anchors.objects.get(anchorKey(T.tenantId, date))!;
  const body = JSON.parse(obj.body);
  assert.deepEqual([body.formato, body.tenantId, body.seq, body.hash, body.ancoraAnterior], ['greenia-ancora-v1', T.tenantId, Number(head.seq), head.hash, null]);
  assert.ok(obj.retainUntil.getTime() - Date.now() > 1800 * 86400_000, 'retenção de 5 anos por padrão');
  assert.doesNotMatch(obj.body, /repet|login|documento/, 'a âncora não leva conteúdo nem nome do cliente');
  // Segunda rodada no mesmo dia: nada novo, e o bucket recusaria sobrescrever.
  const again = (await post(P.userId, '/api/platform/audit/anchors/run')).json().resultados.find((x: { tenantId: string }) => x.tenantId === T.tenantId);
  assert.equal(again.status, 'ja_publicada');
  await assert.rejects(anchors.publish(anchorKey(T.tenantId, date), body, new Date()), /./);
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and action = 'ancora_publicada'`, [T.tenantId])).rowCount;
  assert.equal(acts, 1);
});

test('verificação compara a cadeia com a última âncora publicada', async () => {
  const v = (await get(T.userId, '/api/audit/verify')).json();
  assert.equal(v.ok, true);
  assert.equal(v.ancora.status, 'confere');
});

test('admin do cliente vê e exporta o histórico de âncoras; key user não', async () => {
  const list = (await get(T.userId, '/api/audit/anchors')).json();
  assert.equal(list.ligada, true);
  assert.equal(list.ancoras.length, 1);
  assert.match(list.ancoras[0].hash, /^[a-f0-9]{64}$/);
  assert.equal(list.ancoras[0].bucket, 'ancoras-teste');
  const csv = await get(T.userId, '/api/audit/anchors?format=csv');
  assert.match(csv.headers['content-type'] as string, /text\/csv/);
  assert.match(csv.body, /data;seq;hash;registros;bucket;chave;versao;retidaAte;publicadaEm/);
  assert.equal((await db.owner.query(`select 1 from audit_log where tenant_id = $1 and action = 'ancoras_exportadas'`, [T.tenantId])).rowCount, 1);
  assert.equal((await get(key, '/api/audit/anchors')).statusCode, 403);
});

test('dono do banco reescreve a cadeia inteira de forma consistente: a verificação interna passa, a âncora acusa', async () => {
  const c = await db.owner.connect();
  try {
    await c.query('begin');
    await c.query(`alter table audit_log disable trigger audit_log_no_update`);
    await c.query(`update audit_log set details = '{"adulterado": true}' where tenant_id = $1 and seq = 1`, [T.tenantId]);
    // Recalcula todos os hashes do tenant, como faria quem quer esconder a alteração.
    await c.query(`do $$
      declare r record; h text := repeat('0', 64);
      begin
        for r in select * from audit_log where tenant_id = '${T.tenantId}' order by seq loop
          update audit_log set prev_hash = h,
            hash = audit_hash(audit_canonical(r.tenant_id, r.seq, r.at, r.actor_user_id, r.action, r.target, r.details, h))
          where id = r.id returning hash into h;
        end loop;
      end $$`);
    await c.query(`alter table audit_log enable trigger audit_log_no_update`);
    await c.query('commit');
  } finally { c.release(); }
  const v = (await get(T.userId, '/api/audit/verify')).json();
  assert.equal(v.primeiroQuebrado, null, 'a cadeia refeita passa na verificação interna');
  assert.equal(v.ok, false);
  assert.equal(v.ancora.status, 'diverge');
  assert.match(v.motivo, /tem hash diferente do ancorado em \d{4}-\d{2}-\d{2}/);
});

test('cadeia quebrada não é ancorada; bucket fora do ar vira registro, sem derrubar a tarefa', async () => {
  await db.owner.query(`alter table audit_log disable trigger audit_log_no_update`);
  await db.owner.query(`update audit_log set details = '{"de novo": true}' where tenant_id = $1 and seq = 2`, [T.tenantId]);
  await db.owner.query(`alter table audit_log enable trigger audit_log_no_update`);
  const tomorrow = new Date(Date.now() + 86400_000);
  assert.equal((await publishTenantAnchor(app, anchors, T.tenantId, tomorrow)).status, 'cadeia_quebrada');
  assert.equal((await db.owner.query(`select 1 from audit_log where tenant_id = $1 and action = 'ancora_nao_publicada'`, [T.tenantId])).rowCount, 1);
  await db.owner.query(`insert into audit_log (tenant_id, action, details) values ($1, 'login', '{}')`, [P.tenantId]);
  const broken = { bucket: 'x', async publish(): Promise<never> { throw new Error('AccessDenied'); }, async read(): Promise<never> { throw new Error('AccessDenied'); } };
  assert.equal((await publishTenantAnchor(app, broken, P.tenantId, tomorrow)).status, 'erro');
  assert.equal((await db.owner.query(`select details->>'motivo' as m from audit_log where tenant_id = $1 and action = 'ancora_nao_publicada'`, [P.tenantId])).rows[0].m, 'falha no bucket');
});

test('exclusão do tenant: o comprovante registra que as âncoras externas ficam retidas, sem conteúdo', async () => {
  const X = await seedTenant(db.owner, 'saindo', { role: 'admin_cliente', domain: 'saindo.com.br' });
  await db.owner.query(`insert into audit_log (tenant_id, action, details) values ($1, 'login', '{}')`, [X.tenantId]);
  assert.equal((await publishTenantAnchor(app, anchors, X.tenantId)).status, 'publicada');
  const { deleteTenant } = await import('../src/portability/portability.ts');
  const receipt = await deleteTenant(db.owner, app.deps.objects, X.tenantId, { email: 'pessoa@theneil.com.br', reason: 'Fim do contrato de teste.' });
  assert.equal(receipt.verificacao.ok, true);
  assert.equal(receipt.auditoria.ancorasExternas!.quantidade, 1);
  assert.match(receipt.auditoria.ancorasExternas!.observacao, /sem conteúdo/);
});
