// Consulta da auditoria: verificação da cadeia de hash, histórico de um
// documento, execução ou arquivo ("como este dado ou documento foi tratado?")
// e exportação. Key user e admin do cliente consultam; a visibilidade do objeto
// consultado segue as permissões de área (RLS).
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { toCsv } from '../util/csv.ts';
import { checkLatestAnchor } from './anchor.ts';

const COLUMNS = ['seq', 'at', 'actor_email', 'action', 'target', 'details', 'prev_hash', 'hash'];

// Pode ler auditoria: admin do cliente no tenant todo, key user nas suas áreas.
export const canReadAudit = (a: AuthContext) => can(a, 'audit.read') || a.areaRoles.some(r => r.role === 'key_user');

const historySchema = z.object({
  documento: z.uuid().optional(),
  execucao: z.uuid().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  format: z.enum(['json', 'csv']).default('json'),
}).refine(q => [q.documento, q.execucao, q.sha256].filter(Boolean).length === 1, 'informe documento, execucao ou sha256');

const logSchema = z.object({
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
  acao: z.string().max(60).optional(),
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(50000).default(1000),
});

async function send(reply: FastifyReply, rows: Record<string, unknown>[], format: 'json' | 'csv', name: string) {
  if (format === 'csv') {
    return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${name}.csv"`).send(toCsv(rows, COLUMNS));
  }
  return reply.send(rows);
}

const SELECT = `select l.seq, l.at, u.email as actor_email, l.action, l.target, l.details, l.prev_hash, l.hash
                from audit_log l left join users u on u.id = l.actor_user_id`;

export async function verifyChain(tx: Tx) {
  return (await tx.query(`select * from audit_verify()`)).rows[0] as { ok: boolean; registros: string; primeiro_quebrado: string | null; motivo: string | null; hash_final: string | null };
}

export async function auditRoutes(app: FastifyInstance) {
  app.get('/api/audit/verify', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!canReadAudit(a)) return reply.code(403).send({ error: 'sem_permissao' });
    // A cadeia é refeita no banco e comparada com a última âncora publicada no
    // bucket externo: reescrever a cadeia inteira não passa despercebido.
    const { r, ancora } = await withTenant(app.deps.db, tenantCtx(a), async tx => ({ r: await verifyChain(tx), ancora: await checkLatestAnchor(tx, app.deps.anchors) }));
    const ok = r.ok && ancora.status !== 'diverge';
    return { ok, registros: Number(r.registros), primeiroQuebrado: r.primeiro_quebrado ? Number(r.primeiro_quebrado) : null,
      motivo: r.motivo ?? (ancora.status === 'diverge' ? ancora.motivo : null), hashFinal: r.hash_final, ancora };
  });

  // Histórico das âncoras publicadas (admin do cliente), em JSON ou CSV.
  app.get('/api/audit/anchors', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure')) return reply.code(403).send({ error: 'sem_permissao' });
    const q = z.object({ format: z.enum(['json', 'csv']).default('json') }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const list = (await tx.query(`select anchor_date, seq, hash, records, bucket, object_key, version_id, retain_until, published_at from audit_anchors order by anchor_date desc limit 3660`)).rows;
      if (q.data.format === 'csv') await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'ancoras_exportadas', details: { quantidade: list.length } });
      return list.map(r => ({
        data: r.anchor_date instanceof Date ? r.anchor_date.toISOString().slice(0, 10) : String(r.anchor_date), seq: Number(r.seq), hash: r.hash, registros: Number(r.records),
        bucket: r.bucket, chave: r.object_key, versao: r.version_id, retidaAte: new Date(r.retain_until).toISOString(), publicadaEm: new Date(r.published_at).toISOString(),
      }));
    });
    if (q.data.format === 'csv') {
      return reply.type('text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="ancoras-auditoria.csv"')
        .send(toCsv(rows, ['data', 'seq', 'hash', 'registros', 'bucket', 'chave', 'versao', 'retidaAte', 'publicadaEm']));
    }
    return { ligada: !!app.deps.anchors, ancoras: rows };
  });

  // Histórico de um documento da base, de uma execução de assistente ou de um
  // arquivo de entrada (pelo sha256). O objeto precisa ser visível para quem pede.
  app.get('/api/audit/history', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!canReadAudit(a)) return reply.code(403).send({ error: 'sem_permissao' });
    const q = historySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      if (q.data.documento) {
        const doc = (await tx.query(`select id, area_id from kb_documents where id = $1`, [q.data.documento])).rows[0];
        if (!doc || !can(a, 'audit.read', doc.area_id)) return null;
        return (await tx.query(`${SELECT} where l.target like $1 or l.details->'documentos' @> $2::jsonb order by l.seq`,
          [`documento:${doc.id}%`, JSON.stringify([{ id: doc.id }])])).rows;
      }
      if (q.data.execucao) {
        const run = (await tx.query(`select id, area_id from runs where id = $1`, [q.data.execucao])).rows[0];
        if (!run || !can(a, 'audit.read', run.area_id)) return null;
        return (await tx.query(`${SELECT} where l.target like $1 order by l.seq`, [`execucao:${run.id}%`])).rows;
      }
      // Arquivo de entrada: só registros de execuções que o solicitante pode ver.
      const runs = (await tx.query(`select r.id, r.area_id from runs r join run_files f on f.run_id = r.id where f.sha256 = $1`, [q.data.sha256])).rows
        .filter(r => can(a, 'audit.read', r.area_id)).map(r => `execucao:${r.id}`);
      if (!runs.length) return null;
      return (await tx.query(`${SELECT} where split_part(l.target, '@', 1) = any($1) order by l.seq`, [runs])).rows;
    });
    if (!rows) return reply.code(404).send({ error: 'nao_encontrado' });
    return send(reply, rows, q.data.format, 'historico');
  });

  // Registro completo do tenant (admin do cliente), com filtros e exportação.
  app.get('/api/audit/log', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'audit.read')) return reply.code(403).send({ error: 'sem_permissao' });
    const q = logSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = (await tx.query(
        `${SELECT} where ($1::date is null or l.at >= $1::date) and ($2::date is null or l.at < $2::date + 1)
           and ($3::text is null or l.action = $3) order by l.seq limit $4`,
        [q.data.de ?? null, q.data.ate ?? null, q.data.acao ?? null, q.data.limit])).rows;
      if (q.data.format === 'csv') await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'auditoria_exportada', details: { registros: r.length, de: q.data.de, ate: q.data.ate } });
      return r;
    });
    return send(reply, rows, q.data.format, 'auditoria');
  });
}
