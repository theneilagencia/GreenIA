// Administração de assistentes: criar, publicar nova versão, listar. Cada
// alteração gera nova versão; a anterior fica guardada.
import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { assistantDefinitionSchema } from './schema.ts';

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  name: z.string().trim().min(1).max(120),
  areaSlug: z.string().optional(),
  status: z.enum(['rascunho', 'piloto', 'ativo', 'pausado', 'descartado']).default('rascunho'),
  definition: z.unknown(),
});

const versionSchema = z.object({
  status: z.enum(['rascunho', 'piloto', 'ativo', 'pausado', 'descartado']).optional(),
  definition: z.unknown(),
});

const issues = (e: ZodError) => e.issues.map(i => `${i.path.join('.')}: ${i.message}`);

export async function assistantRoutes(app: FastifyInstance) {
  app.get('/api/assistants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select a.slug, a.name, a.status, a.current_version as version, ar.slug as area
       from assistants a left join areas ar on ar.id = a.area_id order by a.name`).then(r => r.rows));
  });

  app.post('/api/admin/assistants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = createSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: issues(p.error) });
    const def = assistantDefinitionSchema.safeParse(p.data.definition ?? {});
    if (!def.success) return reply.code(400).send({ error: 'definicao_invalida', detalhes: issues(def.error) });
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const areaId = p.data.areaSlug ? (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id : null;
      if (p.data.areaSlug && !areaId) return reply.code(404).send({ error: 'area_nao_encontrada' });
      if (!can(a, 'kb.manage', areaId)) return reply.code(403).send({ error: 'sem_permissao' });
      try {
        const row = (await tx.query(
          `insert into assistants (tenant_id, slug, name, area_id, status) values ($1, $2, $3, $4, $5) returning id`,
          [a.tenantId, p.data.slug, p.data.name, areaId, p.data.status])).rows[0];
        await tx.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, 1, $3, $4)`,
          [a.tenantId, row.id, def.data, a.userId]);
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_criado', target: `assistente:${p.data.slug}@1` });
        return reply.code(201).send({ slug: p.data.slug, version: 1 });
      } catch (e) {
        if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'assistente_ja_existe' });
        throw e;
      }
    });
  });

  app.post('/api/admin/assistants/:slug/versions', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = versionSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const def = assistantDefinitionSchema.safeParse(p.data.definition ?? {});
    if (!def.success) return reply.code(400).send({ error: 'definicao_invalida', detalhes: issues(def.error) });
    const { slug } = req.params as { slug: string };
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = (await tx.query(`select id, area_id, current_version from assistants where slug = $1 for update`, [slug])).rows[0];
      if (!cur) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
      if (!can(a, 'kb.manage', cur.area_id)) return reply.code(403).send({ error: 'sem_permissao' });
      const version = cur.current_version + 1;
      await tx.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, $3, $4, $5)`,
        [a.tenantId, cur.id, version, def.data, a.userId]);
      await tx.query(`update assistants set current_version = $1, status = coalesce($2, status) where id = $3`, [version, p.data.status ?? null, cur.id]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_nova_versao', target: `assistente:${slug}@${version}` });
      return reply.code(201).send({ slug, version });
    });
  });
}
