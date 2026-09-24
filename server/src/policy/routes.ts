// Política de Uso de IA: consulta (qualquer pessoa do tenant), ciência por
// versão, publicação de nova versão e acompanhamento de quem já registrou
// ciência (admin do cliente).
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { classConflicts, currentPolicy, policyState, usageRulesSchema } from './usage-policy.ts';

const publishSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(20).max(200000),
  rules: z.unknown().optional(),
});

export async function policyRoutes(app: FastifyInstance) {
  app.get('/api/policy', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { policy, acked } = await withTenant(app.deps.db, tenantCtx(a), tx => policyState(tx, a.userId));
    if (!policy) return { policy: null, acked: true };
    return { policy: { version: policy.version, title: policy.title, body: policy.body, publishedAt: policy.publishedAt, tools: policy.rules.tools, allowedClasses: policy.rules.allowedClasses }, acked };
  });

  app.get('/api/policy/versions/:version', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const v = Number((req.params as { version: string }).version);
    const r = await withTenant(app.deps.db, tenantCtx(a), async tx => (await tx.query(`select version, title, body, published_at from usage_policies where version = $1`, [v])).rows[0]);
    if (!r) return reply.code(404).send({ error: 'versao_nao_encontrada' });
    return { version: r.version, title: r.title, body: r.body, publishedAt: r.published_at };
  });

  app.post('/api/policy/ack', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = z.object({ version: z.number().int().min(1) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = await currentPolicy(tx);
      if (!cur || cur.version !== p.data.version) return { status: 409, body: { error: 'versao_nao_vigente', vigente: cur?.version ?? null } };
      const r = await tx.query(`insert into policy_acks (tenant_id, user_id, version) values ($1, $2, $3) on conflict do nothing`, [a.tenantId, a.userId, cur.version]);
      if (r.rowCount) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'politica_ciencia', target: `politica:${cur.version}`, details: { sha256: cur.bodySha256 } });
      return { status: 200, body: { version: cur.version, acked: true } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Nova versão: todos precisam registrar ciência de novo. Devolve os
  // assistentes em piloto ou ativos com classe de dado que a política não permite.
  app.post('/api/admin/policy', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure')) return reply.code(403).send({ error: 'sem_permissao' });
    const p = publishSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const rules = usageRulesSchema.safeParse(p.data.rules ?? {});
    if (!rules.success) return reply.code(400).send({ error: 'regras_invalidas', detalhes: rules.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    if (rules.data.dataPolicy.credencial && rules.data.dataPolicy.credencial !== 'bloquear') return reply.code(400).send({ error: 'regras_invalidas', detalhes: ['credencial é sempre bloqueada'] });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      await tx.query(`select pg_advisory_xact_lock(hashtext('politica:' || $1))`, [a.tenantId]);
      const version = Number((await tx.query(`select coalesce(max(version), 0) + 1 as v from usage_policies`)).rows[0].v);
      const sha = createHash('sha256').update(p.data.body).digest('hex');
      await tx.query(`insert into usage_policies (tenant_id, version, title, body, body_sha256, rules, published_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        [a.tenantId, version, p.data.title, p.data.body, sha, rules.data, a.userId]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'politica_publicada', target: `politica:${version}`,
        details: { sha256: sha, informacoesRestritas: rules.data.restrictedTerms.length, classesPermitidas: rules.data.allowedClasses, piso: rules.data.dataPolicy } });
      const assistants = (await tx.query(
        `select a.slug, a.status, v.definition from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
         where a.status in ('piloto', 'ativo')`)).rows;
      const conflitos = assistants.map(r => ({ slug: r.slug, status: r.status, classes: classConflicts(assistantDefinitionSchema.parse(r.definition).dataClasses, rules.data) })).filter(c => c.classes.length);
      return { version, conflitos };
    });
    return reply.code(201).send(out);
  });

  app.get('/api/admin/policy/acks', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure') && !can(a, 'audit.read')) return reply.code(403).send({ error: 'sem_permissao' });
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = await currentPolicy(tx);
      if (!cur) return { version: null, pessoas: [] };
      const pessoas = (await tx.query(
        `select u.email, k.acked_at from users u left join policy_acks k on k.user_id = u.id and k.version = $1
         where u.status = 'ativo' order by k.acked_at nulls first, u.email`, [cur.version])).rows;
      return { version: cur.version, total: pessoas.length, comCiencia: pessoas.filter(x => x.acked_at).length, pessoas };
    });
  });
}
