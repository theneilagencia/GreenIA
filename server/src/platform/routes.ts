// Rotas de plataforma: só admin_theneil do tenant interno da TheNeil.
import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { createTenant } from './tenants.ts';
import type { AuthContext } from '../auth/session.ts';
import { INCIDENT_STATUS, NEXT, code } from '../incidents/routes.ts';

// Operação da plataforma: pessoa admin_theneil no tenant interno da TheNeil.
async function isPlatformAdmin(app: FastifyInstance, a: AuthContext) {
  const isPlatform = await withTenant(app.deps.db, tenantCtx(a), tx =>
    tx.query(`select is_platform from tenants where id = $1`, [a.tenantId]).then(r => r.rows[0]?.is_platform === true));
  return isPlatform && can(a, 'platform.tenants');
}

export async function platformRoutes(app: FastifyInstance) {
  app.post('/api/platform/tenants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
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

  // Incidentes de todos os clientes, para o suporte da TheNeil acompanhar.
  // Lê pela conexão do dono (fora da RLS por tenant); cada acesso fica na
  // auditoria do tenant do incidente.
  app.get('/api/platform/incidents', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const q = z.object({ status: z.enum(INCIDENT_STATUS).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = (await app.deps.ownerDb.query(
      `select i.id, i.tenant_id, t.slug as tenant, i.kind, i.status, i.description, ar.name as area, i.created_at, i.updated_at
       from incidents i join tenants t on t.id = i.tenant_id left join areas ar on ar.id = i.area_id
       where ($1::text is null or i.status = $1) order by i.created_at desc limit 500`, [q.data.status ?? null])).rows;
    const perTenant = new Map<string, number>();
    for (const r of rows) perTenant.set(r.tenant_id, (perTenant.get(r.tenant_id) ?? 0) + 1);
    for (const [tenantId, n] of perTenant) {
      await app.deps.ownerDb.query(`insert into audit_log (tenant_id, action, details) values ($1, 'incidentes_consultados_pela_theneil', $2)`,
        [tenantId, { quantidade: n, por: a.email }]);
    }
    return rows.map(r => ({ id: r.id, codigo: code(r.id), tenant: r.tenant, tipo: r.kind, status: r.status, descricao: r.description, area: r.area, criadoEm: r.created_at, atualizadoEm: r.updated_at, proximos: NEXT[r.status] }));
  });

  app.post('/api/platform/incidents/:id/status', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const { id } = req.params as { id: string };
    const p = z.object({ status: z.enum(INCIDENT_STATUS), nota: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const client = await app.deps.ownerDb.connect();
    try {
      await client.query('begin');
      const i = (await client.query(`select tenant_id, status from incidents where id = $1 for update`, [id])).rows[0];
      if (!i) { await client.query('rollback'); return reply.code(404).send({ error: 'nao_encontrado' }); }
      if (!NEXT[i.status].includes(p.data.status)) { await client.query('rollback'); return reply.code(409).send({ error: 'transicao_invalida', de: i.status, possiveis: NEXT[i.status] }); }
      await client.query(`update incidents set status = $2, updated_at = now() where id = $1`, [id, p.data.status]);
      await client.query(`insert into incident_events (tenant_id, incident_id, actor, status_from, status_to, note) values ($1, $2, $3, $4, $5, $6)`,
        [i.tenant_id, id, `TheNeil (${a.email})`, i.status, p.data.status, p.data.nota]);
      await client.query(`insert into audit_log (tenant_id, action, target, details) values ($1, 'incidente_status', $2, $3)`,
        [i.tenant_id, `incidente:${id}`, { de: i.status, para: p.data.status, por: `TheNeil (${a.email})` }]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return { id, status: p.data.status };
  });
}
