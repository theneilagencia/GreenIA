// Criação de tenant (operação de plataforma da TheNeil). Roda com a conexão do
// dono das tabelas, numa transação, e fica registrada na auditoria do tenant novo.
import { mapeamentoConfigSchema } from '../imports/schema.ts';
import { criarMapeamento } from '../imports/service.ts';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { usageRulesSchema } from '../policy/usage-policy.ts';
import type { Db } from '../db/pool.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { slugify } from '../admin/routes.ts';
import { getTemplate, type AreasTemplate } from '../catalog/catalog.ts';
import { applyAreasTemplate } from '../catalog/routes.ts';

export const newTenantSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(120),
  config: z.unknown().optional(),
  domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).min(1),
  hosts: z.array(z.string().trim().toLowerCase()).default([]),
  // Modelo inicial de áreas do catálogo (opcional), aplicado antes das áreas da lista.
  modeloAreas: z.string().max(80).optional(),
  // Áreas do cliente. Sem áreas nem modelo, o tenant começa vazio e o admin cria pelo painel.
  areas: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/).optional(),
    name: z.string().min(1).max(80),
    description: z.string().max(1000).default(''),
    parent: z.string().optional(),                     // slug da área mãe (declarada antes na lista)
  })).default([]),
  providers: z.array(z.object({
    kind: z.enum(['entra', 'google', 'email_code', 'oidc']),
    label: z.string().min(1).max(80),
    config: z.record(z.string(), z.unknown()).default({}),
  })).min(1),
  admins: z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),
  // Key users por área, já na implantação.
  keyUsers: z.array(z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), area: z.string() })).default([]),
  // Política de Uso de IA inicial (versão 1), opcional.
  policy: z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(20), rules: z.unknown().optional() }).optional(),
  // Mapeamentos de importação da implantação (arquivos exportados dos sistemas do cliente).
  mapeamentosImportacao: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/).optional(),
    nome: z.string().trim().min(2).max(120),
    descricao: z.string().max(1000).default(''),
    config: mapeamentoConfigSchema,
  })).default([]),
});

export type NewTenant = z.infer<typeof newTenantSchema>;

export async function createTenant(ownerDb: Db, input: unknown, actor?: { tenantId: string; userId: string }) {
  const t = newTenantSchema.parse(input);
  const areas = t.areas.map(a => ({ ...a, slug: a.slug ?? slugify(a.name) }));
  const { config, theme } = parseTenantConfig(t.config);
  for (const a of [...t.admins, ...t.keyUsers.map(k => k.email)]) {
    if (!t.domains.includes(a.split('@')[1])) throw new Error(`pessoa ${a} fora dos domínios do tenant`);
  }
  const rules = t.policy ? usageRulesSchema.parse(t.policy.rules ?? {}) : null;
  for (const p of t.providers) {
    if (p.config.clientSecret) throw new Error('segredo não vai na configuração: use clientSecretEnv com o nome da variável');
  }
  const client = await ownerDb.connect();
  try {
    await client.query('begin');
    const id = (await client.query(`insert into tenants (slug, name, config) values ($1, $2, $3) returning id`, [t.slug, t.name, config])).rows[0].id;
    for (const d of t.domains) await client.query(`insert into tenant_domains (tenant_id, domain) values ($1, $2)`, [id, d]);
    for (const h of t.hosts) await client.query(`insert into tenant_hosts (host, tenant_id) values ($1, $2)`, [h, id]);
    let fromTemplate: string[] = [];
    if (t.modeloAreas) {
      const tpl = await getTemplate(client, 'areas', t.modeloAreas) as AreasTemplate | null;
      if (!tpl) throw new Error(`modelo de áreas ${t.modeloAreas} não existe no catálogo`);
      fromTemplate = await applyAreasTemplate(client, id, tpl);
    }
    const areaIds = new Map<string, string>((await client.query(`select slug, id from areas where tenant_id = $1`, [id])).rows.map(r => [r.slug as string, r.id as string]));
    for (const [i, a] of areas.entries()) {
      if (a.parent && !areaIds.has(a.parent)) throw new Error(`área mãe ${a.parent} da área ${a.slug} não existe no tenant (declare antes)`);
      const r = await client.query(`insert into areas (tenant_id, slug, name, description, parent_id, position) values ($1, $2, $3, $4, $5, $6) returning id`,
        [id, a.slug, a.name, a.description, a.parent ? areaIds.get(a.parent) : null, i]);
      areaIds.set(a.slug, r.rows[0].id);
    }
    for (const p of t.providers) {
      await client.query(`insert into auth_providers (tenant_id, kind, label, config) values ($1, $2, $3, $4)`, [id, p.kind, p.label, p.config]);
    }
    const userIds = new Map<string, string>();
    const person = async (email: string) => {
      if (!userIds.has(email)) userIds.set(email, (await client.query(`insert into users (tenant_id, email) values ($1, $2) returning id`, [id, email])).rows[0].id);
      return userIds.get(email)!;
    };
    for (const email of t.admins) {
      await client.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin_cliente')`, [id, await person(email)]);
    }
    for (const k of t.keyUsers) {
      if (!areaIds.has(k.area)) throw new Error(`área ${k.area} do key user ${k.email} não existe no tenant`);
      const areaId = (await client.query(`select id from areas where tenant_id = $1 and slug = $2`, [id, k.area])).rows[0].id;
      await client.query(`insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, 'key_user') on conflict do nothing`, [id, await person(k.email), areaId]);
    }
    if (t.policy && rules) {
      await client.query(`insert into usage_policies (tenant_id, version, title, body, body_sha256, rules, published_by) values ($1, 1, $2, $3, $4, $5, $6)`,
        [id, t.policy.title, t.policy.body, createHash('sha256').update(t.policy.body).digest('hex'), rules, await person(t.admins[0])]);
    }
    for (const m of t.mapeamentosImportacao) await criarMapeamento(client, id, null, { ...m, nota: 'implantação' });
    await client.query(`insert into audit_log (tenant_id, actor_user_id, action, details) values ($1, $2, 'tenant_criado', $3)`,
      [id, actor?.userId || null, { porTenant: actor?.tenantId || 'cli', ajustesDeCor: theme.adjustments, keyUsers: t.keyUsers.length, politica: !!t.policy, mapeamentosImportacao: t.mapeamentosImportacao.map(m => m.nome), modeloAreas: t.modeloAreas ?? null, areasDoModelo: fromTemplate }]);
    await client.query('commit');
    return { id, slug: t.slug, themeAdjustments: theme.adjustments };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
