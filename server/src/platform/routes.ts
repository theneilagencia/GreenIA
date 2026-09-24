// Rotas de plataforma: só admin_theneil do tenant interno da TheNeil.
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { createTenant } from './tenants.ts';

export async function platformRoutes(app: FastifyInstance) {
  app.post('/api/platform/tenants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const isPlatform = await withTenant(app.deps.db, tenantCtx(a), tx =>
      tx.query(`select is_platform from tenants where id = $1`, [a.tenantId]).then(r => r.rows[0]?.is_platform === true));
    if (!isPlatform || !can(a, 'platform.tenants')) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    try {
      return reply.code(201).send(await createTenant(app.deps.ownerDb, req.body, { tenantId: a.tenantId, userId: a.userId }));
    } catch (e) {
      if (e instanceof ZodError) return reply.code(400).send({ error: 'dados_invalidos', detalhes: e.issues.map(i => i.path.join('.') + ': ' + i.message) });
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'slug_dominio_ou_host_ja_usado' });
      if (e instanceof Error && /fora dos domínios|segredo não vai/.test(e.message)) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });
}
