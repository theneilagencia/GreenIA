// Rotas de portabilidade: exportação completa (admin do cliente, gerada na
// fila) e exclusão total do tenant (operação da TheNeil ao fim do contrato).
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { tenantPrefix } from '../storage/object-store.ts';
import { buildTenantExport, deleteTenant } from './portability.ts';

export function makeExportJob(app: FastifyInstance) {
  return async (data: Record<string, unknown>) => {
    const tenantId = String(data.tenantId), exportId = String(data.exportId);
    try {
      const { bytes, manifest } = await buildTenantExport(app.deps.db, app.deps.objects, tenantId);
      const key = `${tenantPrefix(tenantId)}exports/${exportId}.zip`;
      await app.deps.objects.put(key, bytes, 'application/zip');
      const sha = createHash('sha256').update(bytes).digest('hex');
      await withTenant(app.deps.db, { tenantId, allAreas: true }, async tx => {
        await tx.query(`update tenant_exports set status = 'pronta', object_key = $2, bytes = $3, sha256 = $4, manifest = $5, finished_at = now() where id = $1`,
          [exportId, key, bytes.length, sha, { registros: manifest.registros, arquivos: manifest.arquivos, auditoria: manifest.auditoria }]);
        await audit(tx, { tenantId, action: 'exportacao_completa_gerada', target: `exportacao:${exportId}`, details: { bytes: bytes.length, sha256: sha, arquivos: manifest.arquivos } });
      });
    } catch (e) {
      await withTenant(app.deps.db, { tenantId, allAreas: true }, tx =>
        tx.query(`update tenant_exports set status = 'erro', error = $2, finished_at = now() where id = $1`, [exportId, (e as Error).message.slice(0, 500)]));
    }
  };
}

export async function portabilityRoutes(app: FastifyInstance) {
  app.post('/api/admin/exports', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure')) return reply.code(403).send({ error: 'sem_permissao' });
    const id = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = (await tx.query(`insert into tenant_exports (tenant_id, requested_by) values ($1, $2) returning id`, [a.tenantId, a.userId])).rows[0];
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'exportacao_completa_solicitada', target: `exportacao:${r.id}` });
      return r.id as string;
    });
    await app.deps.queue.enqueue('tenant:export', { tenantId: a.tenantId, exportId: id });
    return reply.code(202).send({ id, status: 'processando' });
  });

  app.get('/api/admin/exports', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure')) return reply.code(403).send({ error: 'sem_permissao' });
    return withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select e.id, e.status, e.bytes, e.sha256, e.manifest, e.error, e.created_at, e.finished_at, u.email as solicitada_por
       from tenant_exports e left join users u on u.id = e.requested_by order by e.created_at desc`).then(r => r.rows));
  });

  app.get('/api/admin/exports/:id/download', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure')) return reply.code(403).send({ error: 'sem_permissao' });
    const { id } = req.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const e = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = (await tx.query(`select status, object_key, created_at from tenant_exports where id = $1`, [id])).rows[0];
      if (r?.status === 'pronta') await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'exportacao_completa_baixada', target: `exportacao:${id}` });
      return r;
    });
    if (!e) return reply.code(404).send({ error: 'nao_encontrado' });
    if (e.status !== 'pronta') return reply.code(409).send({ error: 'exportacao_nao_pronta', status: e.status });
    const bytes = await app.deps.objects.get(e.object_key);
    return reply.type('application/zip').header('content-disposition', `attachment; filename="exportacao-${new Date(e.created_at).toISOString().slice(0, 10)}.zip"`).send(Buffer.from(bytes));
  });

  // Exclusão total ao fim do contrato: confirmação pelo slug e motivo obrigatório.
  app.post('/api/platform/tenants/:slug/delete', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const isPlatform = await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(`select is_platform from tenants where id = $1`, [a.tenantId]).then(r => r.rows[0]?.is_platform === true));
    if (!isPlatform || !can(a, 'platform.tenants')) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const { slug } = req.params as { slug: string };
    const p = z.object({ confirmacao: z.string(), motivo: z.string().trim().min(10).max(2000) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    if (p.data.confirmacao !== slug) return reply.code(400).send({ error: 'confirmacao_nao_confere' });
    const t = (await app.deps.ownerDb.query(`select id from tenants where slug = $1`, [slug])).rows[0];
    if (!t) return reply.code(404).send({ error: 'tenant_nao_encontrado' });
    try {
      const receipt = await deleteTenant(app.deps.ownerDb, app.deps.objects, t.id, { email: a.email, reason: p.data.motivo });
      await withTenant(app.deps.db, tenantCtx(a), tx => audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'tenant_excluido', target: `comprovante:${receipt.comprovante}`,
        details: { slug, sha256: receipt.sha256, ok: receipt.verificacao.ok } }));
      return receipt;
    } catch (e) {
      if (/não pode ser excluído/.test((e as Error).message)) return reply.code(409).send({ error: (e as Error).message });
      throw e;
    }
  });

  app.get('/api/platform/deletions', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const isPlatform = await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(`select is_platform from tenants where id = $1`, [a.tenantId]).then(r => r.rows[0]?.is_platform === true));
    if (!isPlatform || !can(a, 'platform.tenants') || !app.deps.ownerDb) return reply.code(403).send({ error: 'sem_permissao' });
    return (await app.deps.ownerDb.query(`select * from tenant_deletions order by deleted_at desc`)).rows;
  });
}
