// Medição dos quick wins: registro de valores (antes e depois, sempre com
// origem) e os dois relatórios do tenant (portfólio de oportunidades e
// resultados dos quick wins), em JSON, PDF e XLSX. A medição é do processo,
// não da ferramenta: as medições automáticas vêm das execuções dos
// assistentes vinculados ao quick win.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { buildResults, loadQuickWin, period } from '../quickwins/service.ts';
import { portfolio } from '../quickwins/routes.ts';
import { portfolioPdf, portfolioXlsx, resultsPdf, resultsXlsx } from '../quickwins/reports.ts';

const valueSchema = z.object({
  indicador: z.string().regex(/^[a-z0-9_]{1,60}$/),
  fase: z.enum(['antes', 'depois']),
  valor: z.number().finite(),
  unidade: z.string().max(30).optional(),
  origem: z.enum(['medido', 'informado']),
  periodoInicio: z.iso.date().optional(),
  periodoFim: z.iso.date().optional(),
  metodo: z.string().trim().max(1000).optional(),
  informadoPor: z.string().trim().max(200).optional(),
  observacao: z.string().trim().max(1000).optional(),
}).superRefine((v, ctx) => {
  if (v.origem === 'medido') {
    if (!v.periodoInicio || !v.periodoFim) ctx.addIssue({ code: 'custom', path: ['periodoInicio'], message: 'valor medido precisa do período' });
    else if (v.periodoFim < v.periodoInicio) ctx.addIssue({ code: 'custom', path: ['periodoFim'], message: 'fim antes do início' });
    if (!v.metodo) ctx.addIssue({ code: 'custom', path: ['metodo'], message: 'valor medido precisa do método' });
  }
  if (v.origem === 'informado' && !v.informadoPor) ctx.addIssue({ code: 'custom', path: ['informadoPor'], message: 'valor informado precisa de quem informou' });
});

const canManageArea = (a: AuthContext, areaId: string | null) => can(a, 'people.manage', areaId) || can(a, 'qw.decide', areaId);
const canReadReports = (a: AuthContext) => a.qwAll || a.areaRoles.some(r => r.role === 'key_user' || r.role === 'revisor' || r.role === 'patrocinador');
const formatSchema = z.object({ format: z.enum(['json', 'pdf', 'xlsx']).default('json') });

export async function metricsRoutes(app: FastifyInstance) {
  // Valor de um indicador do quick win (ponto de partida ou depois).
  app.post('/api/quick-wins/:id/valores', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = valueSchema.safeParse(req.body);
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'nao_encontrado' });
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!loaded.areas.some(ar => canManageArea(a, ar.id))) return { status: 403, body: { error: 'sem_permissao' } };
      const ind = loaded.indicators.find(i => i.key === p.data.indicador);
      if (!ind) return { status: 400, body: { error: 'indicador_nao_definido', detalhe: 'defina o indicador no quick win antes de registrar valores' } };
      const v = p.data;
      const row = (await tx.query(
        `insert into quick_win_values (tenant_id, quick_win_id, indicator, phase, value, unit, origin, period_start, period_end, method, informed_by, notes, recorded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [a.tenantId, id, v.indicador, v.fase, v.valor, v.unidade ?? ind.unit, v.origem, v.periodoInicio ?? null, v.periodoFim ?? null,
         v.metodo ?? null, v.informadoPor ?? null, v.observacao ?? null, a.userId])).rows[0];
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'valor_de_indicador_registrado', target: `quick_win:${id}`,
        details: { indicador: v.indicador, fase: v.fase, valor: v.valor, origem: v.origem } });
      return { status: 201, body: { id: row.id } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Portfólio de oportunidades do tenant (o que a pessoa enxerga), com filtros.
  app.get('/api/quick-wins/relatorios/portfolio', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!canReadReports(a)) return reply.code(403).send({ error: 'sem_permissao' });
    const q = formatSchema.extend({ area: z.string().max(60).optional(), criterio: z.string().max(40).optional(), min: z.coerce.number().optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const { rows, crit, tenant } = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const t = (await tx.query(`select name, config from tenants where id = $1`, [a.tenantId])).rows[0];
      return { rows: await portfolio(tx, q.data), crit: parseTenantConfig(t.config).config.qwCriteria, tenant: t.name as string };
    });
    if (q.data.format === 'xlsx') return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', 'attachment; filename="portfolio-oportunidades.xlsx"').send(await portfolioXlsx(tenant, rows, crit));
    if (q.data.format === 'pdf') return reply.type('application/pdf').header('content-disposition', 'attachment; filename="portfolio-oportunidades.pdf"').send(await portfolioPdf(tenant, rows, crit));
    return { criterios: crit, oportunidades: rows };
  });

  // Resultados dos quick wins do tenant: antes × depois, decisões e trajetória.
  app.get('/api/quick-wins/relatorios/resultados', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!canReadReports(a)) return reply.code(403).send({ error: 'sem_permissao' });
    const q = formatSchema.extend({ de: z.iso.date().optional(), ate: z.iso.date().optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const { all, tenant } = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const ids = (await tx.query(`select id from quick_wins order by created_at`)).rows.map(r => r.id as string);
      const out = [];
      for (const id of ids) { const l = await loadQuickWin(tx, id); if (l) out.push(await buildResults(tx, l, period(q.data))); }
      return { all: out, tenant: (await tx.query(`select name from tenants where id = $1`, [a.tenantId])).rows[0].name as string };
    });
    if (q.data.format === 'xlsx') return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', 'attachment; filename="resultados-quick-wins.xlsx"').send(await resultsXlsx(tenant, all));
    if (q.data.format === 'pdf') return reply.type('application/pdf').header('content-disposition', 'attachment; filename="resultados-quick-wins.pdf"').send(await resultsPdf(tenant, all));
    return { quickWins: all };
  });
}
