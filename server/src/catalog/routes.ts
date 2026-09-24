// Catálogo para os clientes (leitura) e para a TheNeil (publicação de versões).
// O cliente cria assistentes a partir de um modelo pela rota de assistentes
// (campo "modelo"); aqui só se lê o catálogo e se aplica um modelo de áreas.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { isPlatformAdmin } from '../platform/routes.ts';
import { slugify } from '../admin/routes.ts';
import { contentSha, getTemplate, latestTemplates, templateSchema, type AreasTemplate, type AssistantTemplate } from './catalog.ts';

export async function catalogRoutes(app: FastifyInstance) {
  // Modelos de assistente (última versão de cada), com os leitores que faltam ligar no cliente.
  app.get('/api/catalog/assistants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cfg = parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0]?.config).config;
      return (await latestTemplates(tx, 'assistente')).map(r => {
        const t = r.content as AssistantTemplate;
        const def = assistantDefinitionSchema.parse(t.definition);
        return { slug: t.slug, versao: t.version, nome: t.name, descricao: t.description, areaSugerida: t.areaSugerida, leitores: t.leitores,
          leitoresDesligados: t.leitores.filter(id => !cfg.readers.includes(id)), etapas: def.pipeline.map(s => s.titulo || s.bloco), publicadoEm: r.published_at };
      });
    });
  });

  app.get('/api/catalog/assistants/:slug', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { slug } = req.params as { slug: string };
    const q = z.object({ versao: z.coerce.number().int().min(1).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const t = await withTenant(app.deps.db, tenantCtx(a), tx => getTemplate(tx, 'assistente', slug, q.data.versao));
    if (!t) return reply.code(404).send({ error: 'modelo_nao_encontrado' });
    return t;
  });

  app.get('/api/catalog/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), async tx => (await latestTemplates(tx, 'areas')).map(r => {
      const t = r.content as AreasTemplate;
      return { slug: t.slug, versao: t.version, nome: t.name, descricao: t.description, areas: t.areas.map(x => (x.parent ? x.parent + ' > ' : '') + x.name) };
    }));
  });

  // Aplica um modelo de áreas no cliente: cria as que ainda não existem (pelo slug).
  app.post('/api/admin/areas/modelo', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'areas.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    const p = z.object({ modelo: z.string().max(80) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const t = await getTemplate(tx, 'areas', p.data.modelo) as AreasTemplate | null;
      if (!t) return { status: 404, body: { error: 'modelo_nao_encontrado' } };
      const created = await applyAreasTemplate(tx, a.tenantId, t);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'modelo_de_areas_aplicado', details: { modelo: t.slug, versao: t.version, criadas: created } });
      return { status: 200, body: { modelo: t.slug, versao: t.version, criadas: created } };
    });
    return reply.code(out.status).send(out.body);
  });

  // TheNeil: todas as versões publicadas e publicação de versão nova (sem mexer em cliente).
  app.get('/api/platform/catalog', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    return (await app.deps.ownerDb.query(`select kind, slug, version, name, published_at, published_by from catalog_templates order by kind, slug, version`)).rows;
  });

  app.post('/api/platform/catalog', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const p = templateSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'modelo_invalido', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const t = p.data;
    const latest = (await app.deps.ownerDb.query(`select max(version) as v from catalog_templates where kind = $1 and slug = $2`, [t.kind, t.slug])).rows[0].v;
    const expected = latest === null ? 1 : Number(latest) + 1;
    if (t.version !== expected) return reply.code(409).send({ error: 'versao_fora_de_ordem', esperada: expected });
    await app.deps.ownerDb.query(`insert into catalog_templates (kind, slug, version, name, description, content, content_sha256, published_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [t.kind, t.slug, t.version, t.name, t.description, t, contentSha(t), `TheNeil (${a.email})`]);
    return reply.code(201).send({ kind: t.kind, slug: t.slug, version: t.version });
  });
}

// Cria as áreas de um modelo que ainda não existem no tenant (subáreas depois das mães).
export async function applyAreasTemplate(tx: { query(sql: string, p?: unknown[]): Promise<{ rows: any[] }> }, tenantId: string, t: AreasTemplate): Promise<string[]> {
  const created: string[] = [];
  for (const [i, ar] of t.areas.entries()) {
    const s = ar.slug ?? slugify(ar.name);
    // Filtra pelo tenant também: a criação do tenant usa a conexão do dono (fora da RLS).
    if ((await tx.query(`select 1 from areas where tenant_id = $1 and slug = $2`, [tenantId, s])).rows.length) continue;
    const parentId = ar.parent ? (await tx.query(`select id from areas where tenant_id = $1 and slug = $2`, [tenantId, ar.parent])).rows[0]?.id ?? null : null;
    await tx.query(`insert into areas (tenant_id, slug, name, description, parent_id, position) values ($1, $2, $3, $4, $5, $6)`, [tenantId, s, ar.name, ar.description, parentId, i]);
    created.push(s);
  }
  return created;
}
