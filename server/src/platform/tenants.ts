// Criação de tenant (operação de plataforma da TheNeil). Roda com a conexão do
// dono das tabelas, numa transação, e fica registrada na auditoria do tenant novo.
import { z } from 'zod';
import type { Db } from '../db/pool.ts';
import { parseTenantConfig } from '../tenants/config.ts';

export const newTenantSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(120),
  config: z.unknown().optional(),
  domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).min(1),
  hosts: z.array(z.string().trim().toLowerCase()).default([]),
  areas: z.array(z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/), name: z.string().min(1).max(80) })).default([]),
  providers: z.array(z.object({
    kind: z.enum(['entra', 'google', 'email_code', 'oidc']),
    label: z.string().min(1).max(80),
    config: z.record(z.string(), z.unknown()).default({}),
  })).min(1),
  admins: z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),
});

export type NewTenant = z.infer<typeof newTenantSchema>;

export async function createTenant(ownerDb: Db, input: unknown, actor?: { tenantId: string; userId: string }) {
  const t = newTenantSchema.parse(input);
  const { config, theme } = parseTenantConfig(t.config);
  for (const a of t.admins) {
    if (!t.domains.includes(a.split('@')[1])) throw new Error(`admin ${a} fora dos domínios do tenant`);
  }
  for (const p of t.providers) {
    if (p.config.clientSecret) throw new Error('segredo não vai na configuração: use clientSecretEnv com o nome da variável');
  }
  const client = await ownerDb.connect();
  try {
    await client.query('begin');
    const id = (await client.query(`insert into tenants (slug, name, config) values ($1, $2, $3) returning id`, [t.slug, t.name, config])).rows[0].id;
    for (const d of t.domains) await client.query(`insert into tenant_domains (tenant_id, domain) values ($1, $2)`, [id, d]);
    for (const h of t.hosts) await client.query(`insert into tenant_hosts (host, tenant_id) values ($1, $2)`, [h, id]);
    for (const a of t.areas) await client.query(`insert into areas (tenant_id, slug, name) values ($1, $2, $3)`, [id, a.slug, a.name]);
    for (const p of t.providers) {
      await client.query(`insert into auth_providers (tenant_id, kind, label, config) values ($1, $2, $3, $4)`, [id, p.kind, p.label, p.config]);
    }
    for (const email of t.admins) {
      const u = (await client.query(`insert into users (tenant_id, email) values ($1, $2) returning id`, [id, email])).rows[0];
      await client.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin_cliente')`, [id, u.id]);
    }
    await client.query(`insert into audit_log (tenant_id, actor_user_id, action, details) values ($1, $2, 'tenant_criado', $3)`,
      [id, actor?.userId || null, { porTenant: actor?.tenantId || 'cli', ajustesDeCor: theme.adjustments }]);
    await client.query('commit');
    return { id, slug: t.slug, themeAdjustments: theme.adjustments };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
