// Administração de assistentes: criar, publicar nova versão, mudar status,
// consultar versões e exportar o pacote portátil. Toda alteração gera nova
// versão; as anteriores ficam guardadas.
import { activeQuickWinsFor } from '../quickwins/context.ts';
import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import { canApproveShare, changeShares, shareSchema, sharesOf, shareTarget } from '../areas/sharing.ts';
import { READERS, enabledReaders, readersUsedBy } from '../readers/registry.ts';
import { getTemplate, type AssistantTemplate } from '../catalog/catalog.ts';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { assistantDefinitionSchema } from './schema.ts';
import { buildPackageMarkdown, buildPackageZip, type PackageMeta } from './package.ts';
import { applyFloor, classConflicts, currentPolicy } from '../policy/usage-policy.ts';
import { checkPolicyAgainstClasses, effectivePolicy } from '../policy/data-policy.ts';
import { BUILTIN_TYPES, typeLabels } from '../policy/detectors.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { guideMarkdown, guidePdf } from './guide.ts';

class ShareError extends Error {
  missing: string[];
  constructor(missing: string[]) { super('áreas não encontradas'); this.missing = missing; }
}
import type { Tx } from '../db/pool.ts';

// Assistente em piloto ou ativo só aceita as classes de dado que a Política de Uso de IA permite.
async function policyConflict(tx: Tx, status: string, dataClasses: string[]) {
  if (!['piloto', 'ativo'].includes(status)) return null;
  const conflicts = classConflicts(dataClasses, (await currentPolicy(tx))?.rules);
  return conflicts.length ? { status: 409, body: { error: 'classe_nao_permitida_pela_politica', classes: conflicts } } : null;
}

// O que a definição usa precisa existir no tenant: leitores especializados
// ligados e tipos de dado cadastrados (com a classe do detector respeitada).
async function readerConflict(tx: Tx, def: Parameters<typeof readersUsedBy>[0] & { dataPolicy: Record<string, string>; dataClasses: ('verde' | 'amarela' | 'vermelha')[] }) {
  const cfg = parseTenantConfig((await tx.query(`select config from tenants where id = app_tenant()`)).rows[0]?.config).config;
  const missing = readersUsedBy(def).filter(id => !cfg.readers.includes(id));
  if (missing.length) return { status: 409, body: { error: 'leitor_desligado', leitores: missing, detalhe: 'ligue o leitor na configuração do cliente antes de usar este tipo de arquivo' } };
  const unknown = Object.keys(def.dataPolicy).filter(k => !BUILTIN_TYPES.includes(k) && !cfg.detectors.some(d => d.key === k));
  if (unknown.length) return { status: 400, body: { error: 'tipo_de_dado_desconhecido', tipos: unknown } };
  const problems = checkPolicyAgainstClasses(def.dataPolicy as never, def.dataClasses, cfg.detectors).filter(p => !BUILTIN_TYPES.includes(p.type));
  if (problems.length) return { status: 400, body: { error: 'definicao_invalida', detalhes: problems.map(p => `dataPolicy.${p.type}: ${p.action}: ${p.reason}`) } };
  return null;
}

// De onde o assistente veio. O assistente é do cliente: versão nova do modelo
// no catálogo só gera aviso, nunca muda o assistente.
function originView(r: { template_slug: string | null; template_version: number | null; duplicated_from: string | null; template_latest: number | null }) {
  if (!r.template_slug && !r.duplicated_from) return { tipo: 'do_zero' };
  return {
    tipo: r.duplicated_from ? 'duplicado' : 'modelo', duplicadoDe: r.duplicated_from ?? undefined,
    modelo: r.template_slug ? { slug: r.template_slug, versao: r.template_version, versaoNova: r.template_latest && r.template_latest > (r.template_version ?? 0) ? Number(r.template_latest) : null } : undefined,
  };
}

const STATUS = ['rascunho', 'piloto', 'ativo', 'pausado', 'descartado'] as const;

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  name: z.string().trim().min(1).max(120),
  areaSlug: z.string().optional(),
  status: z.enum(['rascunho', 'piloto', 'ativo', 'pausado', 'descartado']).default('rascunho'),
  definition: z.unknown().optional(),
  compartilhar: shareSchema.optional(),      // outras áreas ou toda a empresa
  // Três formas de criar: do zero (definition), de um modelo do catálogo ou duplicando um assistente próprio.
  modelo: z.object({ slug: z.string().max(80), versao: z.number().int().min(1).optional() }).optional(),
  duplicar: z.string().max(80).optional(),
}).refine(b => [b.definition !== undefined, !!b.modelo, !!b.duplicar].filter(Boolean).length === 1, { message: 'informe definition, modelo ou duplicar (um só)' });

const versionSchema = z.object({
  status: z.enum(STATUS).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  definition: z.unknown(),
});

const statusSchema = z.object({ status: z.enum(STATUS), motivo: z.string().trim().max(500).optional() });
const packageQuery = z.object({ format: z.enum(['zip', 'md']).default('zip'), version: z.coerce.number().int().min(1).optional() });

const issues = (e: ZodError) => e.issues.map(i => `${i.path.join('.')}: ${i.message}`);

export async function assistantRoutes(app: FastifyInstance) {
  app.get('/api/assistants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const rows = await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select a.slug, a.name, a.status, a.current_version as version, ar.slug as area, ar.name as area_name, a.area_id, a.company_wide, v.definition,
              coalesce((select array_agg(x.slug order by x.slug) from assistant_shares s join areas x on x.id = s.area_id where s.assistant_id = a.id), '{}') as shared,
              a.template_slug, a.template_version, a.duplicated_from, (select max(c.version) from catalog_templates c where c.kind = 'assistente' and c.slug = a.template_slug) as template_latest
       from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
       left join areas ar on ar.id = a.area_id order by a.name`).then(r => r.rows));
    // ?para=chat: só os assistentes de conversa em uso (piloto ou ativo). A RLS já
    // limita às áreas da pessoa, aos compartilhados com elas e aos da empresa toda.
    const paraChat = (req.query as { para?: string }).para === 'chat';
    return rows.filter(r => !paraChat || (['piloto', 'ativo'].includes(r.status) && !assistantDefinitionSchema.parse(r.definition).pipeline.length)).map(r => {
      const def = assistantDefinitionSchema.parse(r.definition);
      return { slug: r.slug, name: r.name, status: r.status, version: r.version, area: r.area, areaName: r.area_name, compartilhadoCom: r.shared, empresa: r.company_wide, origem: originView(r),
        tipo: def.pipeline.length ? 'execucao' : 'conversa', description: def.description, podeGerenciar: can(a, 'kb.manage', r.area_id) };
    });
  });

  // Todos os leitores registrados na plataforma (para o admin escolher quais ligar).
  app.get('/api/readers/catalogo', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return READERS.map(r => ({ id: r.id, label: r.label, description: r.description, kind: r.kind ?? null, fields: r.fields }));
  });

  // Leitores especializados ligados no tenant: tipos de arquivo e campos que entregam.
  app.get('/api/readers', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const cfg = await withTenant(app.deps.db, tenantCtx(a), async tx => parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0]?.config).config);
    return enabledReaders(cfg.readers).map(r => ({ id: r.id, label: r.label, description: r.description, kind: r.kind ?? null, fields: r.fields }));
  });

  // Resumo do assistente para quem vai usar: o que faz, o que enviar, o que sai.
  app.get('/api/assistants/:slug', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { slug } = req.params as { slug: string };
    const row = await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select a.id, a.slug, a.name, a.status, a.current_version as version, ar.name as area, v.definition
       from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
       left join areas ar on ar.id = a.area_id where a.slug = $1`, [slug]).then(async r => r.rows[0] && { ...r.rows[0], quickWins: await activeQuickWinsFor(tx, r.rows[0].id) }));
    if (!row) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
    const d = assistantDefinitionSchema.parse(row.definition);
    return { slug: row.slug, name: row.name, status: row.status, version: row.version, area: row.area,
      tipo: d.pipeline.length ? 'execucao' : 'conversa', description: d.description, objective: d.objective,
      inputs: d.inputs, output: { format: d.output.format, files: d.output.files }, etapas: d.pipeline.map(s => ({ bloco: s.bloco, titulo: s.titulo ?? null })),
      review: { required: d.review.required, reviewers: d.review.reviewers, checklist: d.review.checklist },
      // Quick wins ativos que usam o assistente: com mais de um, a pessoa escolhe em qual a execução conta.
      quickWins: row.quickWins.map((q: { id: string; titulo: string; areas: string }) => ({ id: q.id, titulo: q.titulo, areas: q.areas })) };
  });

  app.post('/api/admin/assistants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = createSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: issues(p.error) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      // Origem da definição: o que veio no pedido, o modelo do catálogo ou o assistente duplicado.
      let raw: unknown = p.data.definition;
      let origin: { template_slug: string | null; template_version: number | null; duplicated_from: string | null } = { template_slug: null, template_version: null, duplicated_from: null };
      if (p.data.modelo) {
        const t = await getTemplate(tx, 'assistente', p.data.modelo.slug, p.data.modelo.versao) as AssistantTemplate | null;
        if (!t) return { status: 404, body: { error: 'modelo_nao_encontrado' } };
        raw = t.definition;
        origin = { template_slug: t.slug, template_version: t.version, duplicated_from: null };
      } else if (p.data.duplicar) {
        const src = (await tx.query(`select a.slug, a.template_slug, a.template_version, v.definition from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version where a.slug = $1`, [p.data.duplicar])).rows[0];
        if (!src) return { status: 404, body: { error: 'assistente_nao_encontrado' } };
        raw = src.definition;
        origin = { template_slug: src.template_slug, template_version: src.template_version, duplicated_from: src.slug };
      }
      const def = assistantDefinitionSchema.safeParse(raw ?? {});
      if (!def.success) return { status: 400, body: { error: 'definicao_invalida', detalhes: issues(def.error) } };
      const areaId = p.data.areaSlug ? (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id : null;
      if (p.data.areaSlug && !areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      if (!can(a, 'kb.manage', areaId)) return { status: 403, body: { error: 'sem_permissao' } };
      const blocked = await policyConflict(tx, p.data.status, def.data.dataClasses) ?? await readerConflict(tx, def.data);
      if (blocked) return blocked;
      try {
        const row = (await tx.query(
          `insert into assistants (tenant_id, slug, name, area_id, status, template_slug, template_version, duplicated_from) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [a.tenantId, p.data.slug, p.data.name, areaId, p.data.status, origin.template_slug, origin.template_version, origin.duplicated_from])).rows[0];
        await tx.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, 1, $3, $4)`,
          [a.tenantId, row.id, def.data, a.userId]);
        let share: { aplicados: string[]; pendentes: string[] } | undefined;
        if (p.data.compartilhar) {
          const r = await changeShares(tx, a, 'assistente', { id: row.id, area_id: areaId ?? null, company_wide: false, label: p.data.slug }, p.data.compartilhar, 'criação', true);
          if ('error' in r) throw new Error(r.error);
          if (r.missing.length) throw new ShareError(r.missing);
          share = { aplicados: r.aplicados, pendentes: r.pendentes };
        }
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_criado', target: `assistente:${p.data.slug}@1`, details: { ...(p.data.compartilhar ? { compartilhado: p.data.compartilhar } : {}), ...(origin.template_slug ? { modelo: `${origin.template_slug}@${origin.template_version}` } : {}), ...(origin.duplicated_from ? { duplicadoDe: origin.duplicated_from } : {}) } });
        return { status: 201, body: { slug: p.data.slug, version: 1, ...(share ? { compartilhamento: share } : {}) } };
      } catch (e) {
        if ((e as { code?: string }).code === '23505') return { status: 409, body: { error: 'assistente_ja_existe' } };
        if (e instanceof ShareError) return { status: 404, body: { error: 'area_nao_encontrada', areas: e.missing } };
        throw e;
      }
    });
    return reply.code(out.status).send(out.body);
  });

  app.post('/api/admin/assistants/:slug/versions', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = versionSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const def = assistantDefinitionSchema.safeParse(p.data.definition ?? {});
    if (!def.success) return reply.code(400).send({ error: 'definicao_invalida', detalhes: issues(def.error) });
    const { slug } = req.params as { slug: string };
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = (await tx.query(`select id, area_id, status, current_version from assistants where slug = $1 for update`, [slug])).rows[0];
      if (!cur) return { status: 404, body: { error: 'assistente_nao_encontrado' } };
      if (!can(a, 'kb.manage', cur.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      const blocked = await policyConflict(tx, p.data.status ?? cur.status, def.data.dataClasses) ?? await readerConflict(tx, def.data);
      if (blocked) return blocked;
      const version = cur.current_version + 1;
      await tx.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, $3, $4, $5)`,
        [a.tenantId, cur.id, version, def.data, a.userId]);
      await tx.query(`update assistants set current_version = $1, status = coalesce($2, status), name = coalesce($3, name) where id = $4`,
        [version, p.data.status ?? null, p.data.name ?? null, cur.id]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_nova_versao', target: `assistente:${slug}@${version}` });
      return { status: 201, body: { slug, version } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Detalhe: versão atual e histórico de versões.
  app.get('/api/admin/assistants/:slug', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { slug } = req.params as { slug: string };
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = (await tx.query(
        `select a.id, a.slug, a.name, a.status, a.area_id, ar.slug as area, a.current_version as version, v.definition,
                a.template_slug, a.template_version, a.duplicated_from, (select max(c.version) from catalog_templates c where c.kind = 'assistente' and c.slug = a.template_slug) as template_latest
         from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
         left join areas ar on ar.id = a.area_id where a.slug = $1`, [slug])).rows[0];
      if (!cur) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
      if (!can(a, 'kb.manage', cur.area_id)) return reply.code(403).send({ error: 'sem_permissao' });
      const versions = (await tx.query(
        `select v.version, v.created_at, u.email as created_by from assistant_versions v left join users u on u.id = v.created_by
         where v.assistant_id = $1 order by v.version desc`, [cur.id])).rows;
      return { slug: cur.slug, name: cur.name, status: cur.status, area: cur.area, version: cur.version,
        definition: assistantDefinitionSchema.parse(cur.definition), versions, compartilhamento: await sharesOf(tx, 'assistente', cur.id), origem: originView(cur) };
    });
  });

  app.get('/api/admin/assistants/:slug/versions/:version', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { slug, version } = req.params as { slug: string; version: string };
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const row = (await tx.query(
        `select a.area_id, v.version, v.definition, v.created_at from assistants a join assistant_versions v on v.assistant_id = a.id
         where a.slug = $1 and v.version = $2`, [slug, Number(version) || 0])).rows[0];
      if (!row) return reply.code(404).send({ error: 'versao_nao_encontrada' });
      if (!can(a, 'kb.manage', row.area_id)) return reply.code(403).send({ error: 'sem_permissao' });
      return { version: row.version, createdAt: row.created_at, definition: assistantDefinitionSchema.parse(row.definition) };
    });
  });

  // Mudança de status (piloto, ativo, pausado, descartado): também é alteração,
  // então gera nova versão com a mesma definição.
  app.post('/api/admin/assistants/:slug/status', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = statusSchema.safeParse(req.body);
    if (!p.success) return { status: 400, body: { error: 'dados_invalidos' } };
    const { slug } = req.params as { slug: string };
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = (await tx.query(
        `select a.id, a.area_id, a.status, a.current_version, v.definition from assistants a
         join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version where a.slug = $1 for update of a`, [slug])).rows[0];
      if (!cur) return { status: 404, body: { error: 'assistente_nao_encontrado' } };
      if (!can(a, 'kb.manage', cur.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      if (cur.status === p.data.status) return { status: 200, body: { slug, version: cur.current_version, status: cur.status } };
      const blocked = await policyConflict(tx, p.data.status, assistantDefinitionSchema.parse(cur.definition).dataClasses);
      if (blocked) return blocked;
      const version = cur.current_version + 1;
      await tx.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, $3, $4, $5)`,
        [a.tenantId, cur.id, version, cur.definition, a.userId]);
      await tx.query(`update assistants set current_version = $1, status = $2 where id = $3`, [version, p.data.status, cur.id]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_status', target: `assistente:${slug}@${version}`,
        details: { de: cur.status, para: p.data.status, motivo: p.data.motivo } });
      return { status: 200, body: { slug, version, status: p.data.status } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Pacote portátil (ZIP com Markdown e JSON, ou um único Markdown).
  // Compartilha com outras áreas ou com toda a empresa (quem administra a área dona).
  app.put('/api/admin/assistants/:slug/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { slug } = req.params as { slug: string };
    const p = shareSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    // Quem administra a área dona, o patrocinador ou quem aprova pede; só quem aprova aplica na hora.
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cur = await shareTarget(tx, 'assistente', slug);
      if (!cur) return { status: 404, body: { error: 'nao_encontrado' } };
      const approver = await canApproveShare(tx, a, cur.area_id);
      const manages = can(a, 'kb.manage', cur.area_id);
      if (!approver && !manages && !can(a, 'qw.decide', cur.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      const r = await changeShares(tx, a, 'assistente', cur, p.data, 'painel', approver || manages);
      if ('error' in r) return { status: 403, body: { error: r.error } };
      if (r.missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: r.missing } };
      return { status: 200, body: { slug, aplicados: r.aplicados, pendentes: r.pendentes, removidos: r.removidos } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/admin/assistants/:slug/package', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = packageQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const { slug } = req.params as { slug: string };
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const row = (await tx.query(
        `select a.slug, a.name, a.status, a.area_id, ar.name as area, v.version, v.definition, t.name as tenant_name
         from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = coalesce($2, a.current_version)
         join tenants t on t.id = a.tenant_id left join areas ar on ar.id = a.area_id where a.slug = $1`, [slug, q.data.version ?? null])).rows[0];
      if (!row) return { status: 404 as const };
      if (!can(a, 'kb.manage', row.area_id)) return { status: 403 as const };
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_exportado', target: `assistente:${slug}@${row.version}`, details: { formato: q.data.format } });
      const meta: PackageMeta = { slug: row.slug, name: row.name, area: row.area, status: row.status, version: row.version, tenantName: row.tenant_name };
      return { status: 200 as const, def: assistantDefinitionSchema.parse(row.definition), meta };
    });
    if (out.status === 404) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
    if (out.status === 403) return reply.code(403).send({ error: 'sem_permissao' });
    const base = `${out.meta.slug}-v${out.meta.version}`;
    if (q.data.format === 'md') {
      return reply.type('text/markdown; charset=utf-8').header('content-disposition', `attachment; filename="${base}.md"`).send(buildPackageMarkdown(out.def, out.meta));
    }
    return reply.type('application/zip').header('content-disposition', `attachment; filename="${base}.zip"`).send(await buildPackageZip(out.def, out.meta));
  });

  // Guia rápido do assistente (treinamento): para quem enxerga o assistente.
  app.get('/api/assistants/:slug/guide', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = z.object({ format: z.enum(['pdf', 'md']).default('pdf') }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const { slug } = req.params as { slug: string };
    const g = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const row = (await tx.query(
        `select a.name, a.current_version, ar.name as area, v.definition, t.config from assistants a
         join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
         join tenants t on t.id = a.tenant_id left join areas ar on ar.id = a.area_id where a.slug = $1`, [slug])).rows[0];
      if (!row) return null;
      const def = assistantDefinitionSchema.parse(row.definition);
      const config = parseTenantConfig(row.config).config;
      const rules = (await currentPolicy(tx))?.rules;
      return { name: row.name, area: row.area, version: row.current_version, def, rules, keyUser: config.keyUserContact, policy: applyFloor(effectivePolicy(config.dataPolicy, def.dataPolicy, config.detectors), rules?.dataPolicy), labels: typeLabels(config.detectors) };
    });
    if (!g) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
    if (q.data.format === 'md') return reply.type('text/markdown; charset=utf-8').header('content-disposition', `attachment; filename="guia-${slug}.md"`).send(guideMarkdown(g));
    return reply.type('application/pdf').header('content-disposition', `attachment; filename="guia-${slug}.pdf"`).send(await guidePdf(g));
  });
}
