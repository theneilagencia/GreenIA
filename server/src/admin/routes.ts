// Administração do tenant: áreas e pessoas. Tudo dentro do contexto do tenant da
// sessão (RLS): um admin nunca alcança áreas ou pessoas de outro tenant.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx, type Role } from '../auth/session.ts';
import { assignableRoles, can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';

const areaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  name: z.string().trim().min(1).max(80),
});

const membershipSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().max(200).optional(),
  areaSlug: z.string().optional(),
  role: z.enum(['usuario', 'revisor', 'key_user', 'admin_cliente']),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), tx =>
      tx.query(`select id, slug, name from areas order by name`).then(r => r.rows));
  });

  app.post('/api/admin/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'areas.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    const p = areaSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    try {
      const row = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        const r = (await tx.query(`insert into areas (tenant_id, slug, name) values ($1, $2, $3) returning id, slug, name`,
          [a.tenantId, p.data.slug, p.data.name])).rows[0];
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'area_criada', target: r.id });
        return r;
      });
      return reply.code(201).send(row);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'area_ja_existe' });
      throw e;
    }
  });

  // Dá um papel a uma pessoa (cria a pessoa, se ainda não existir no tenant).
  app.post('/api/admin/memberships', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = membershipSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      let areaId: string | null = null;
      if (p.data.areaSlug) {
        areaId = (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id || null;
        if (!areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      }
      if (!can(a, 'people.manage', areaId) || !assignableRoles(a, areaId).includes(p.data.role as Role)) {
        return { status: 403, body: { error: 'sem_permissao' } };
      }
      const domain = p.data.email.split('@')[1];
      const allowed = (await tx.query(`select 1 from tenant_domains where domain = $1`, [domain])).rowCount;
      if (!allowed) return { status: 422, body: { error: 'dominio_nao_permitido' } };
      const user = (await tx.query(
        `insert into users (tenant_id, email, name) values ($1, $2, $3)
         on conflict (tenant_id, email) do update set name = coalesce(nullif(excluded.name, ''), users.name)
         returning id`, [a.tenantId, p.data.email, p.data.name || ''])).rows[0];
      await tx.query(
        `insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, $4) on conflict do nothing`,
        [a.tenantId, user.id, areaId, p.data.role]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'papel_atribuido', target: user.id, details: { role: p.data.role, areaId } });
      return { status: 201, body: { userId: user.id, role: p.data.role, areaId } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/admin/users', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'people.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    return withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select u.id, u.email, u.name, u.status,
              coalesce(json_agg(json_build_object('role', m.role, 'area', ar.slug)) filter (where m.id is not null), '[]') as papeis
       from users u left join memberships m on m.user_id = u.id left join areas ar on ar.id = m.area_id
       group by u.id order by u.email`).then(r => r.rows));
  });
}
