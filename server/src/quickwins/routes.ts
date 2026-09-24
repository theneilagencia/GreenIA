// Oportunidades e quick wins.
//   oportunidade  registrada pelo key user ou admin na área: processo,
//                 problema, quem executa hoje, volume, evidência; avaliada
//                 pelos critérios do tenant; devolvida ao portfólio com motivo
//   quick win     nasce da oportunidade selecionada: responsável, áreas,
//                 objetivo, indicadores do processo (escolhidos pelo cliente),
//                 recursos (assistentes e documentos), revisores, prazo
// Ciclo: identificada → avaliada → selecionada → em implantação → em medição
// → decisão (manter, descartar, ampliar) → encerrada. Toda mudança de etapa
// vai para o histórico e para a auditoria, com quem decidiu e por quê.
// Ampliar cria outro quick win (outra área, unidade ou processo) com os mesmos
// recursos como ponto de partida, baseline próprio e vínculo com a origem.
// O número de quick wins não é fixo: a cota, se houver, é do plano do tenant.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig, tenantConfigSchema } from '../tenants/config.ts';
import { isPlatformAdmin } from '../platform/routes.ts';
import { AUTO_METRICS } from '../metrics/metrics.ts';
import { weightedScore, type QwCriteria } from './criteria.ts';
import { NEXT_STAGE, STAGE_LABEL, activeCount, buildResults, loadQuickWin, period } from './service.ts';

const indicatorSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,60}$/),
  label: z.string().trim().min(1).max(120),
  unit: z.string().max(30).default(''),
  direction: z.enum(['menor_melhor', 'maior_melhor']).default('menor_melhor'),
  auto: z.enum(AUTO_METRICS).nullable().optional(),        // medição automática das execuções; sem valor: lançada à mão
});
const resourcesSchema = z.object({ assistentes: z.array(z.string().max(80)).max(50).default([]), documentos: z.array(z.uuid()).max(200).default([]) }).prefault({});
const note = z.string().trim().min(3).max(4000);

const opportunitySchema = z.object({
  areaSlug: z.string().max(60),
  titulo: z.string().trim().min(3).max(200),
  processo: z.string().trim().min(3).max(500),
  problema: z.string().trim().min(3).max(4000),
  executorAtual: z.string().trim().max(500).default(''),
  volume: z.string().trim().max(200).default(''),
  evidencia: z.enum(['comprovado', 'hipotese']),
  evidenciaNota: z.string().trim().max(2000).default(''),
});

const selectSchema = z.object({
  titulo: z.string().trim().min(3).max(200).optional(),
  objetivo: z.string().trim().min(3).max(2000),
  responsavel: z.string().trim().toLowerCase().pipe(z.email()),
  areas: z.array(z.string().max(60)).max(20).optional(),      // padrão: a área da oportunidade
  prazo: z.iso.date().optional(),
  indicadores: z.array(indicatorSchema).max(30).default([]),
  recursos: resourcesSchema,
  revisores: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(50).default([]),
  nota: note,
}).superRefine((b, ctx) => {
  const keys = new Set<string>();
  b.indicadores.forEach((i, n) => { if (keys.has(i.key)) ctx.addIssue({ code: 'custom', path: ['indicadores', n, 'key'], message: `indicador repetido: ${i.key}` }); keys.add(i.key); });
});

// Key user ou admin da área (e das áreas acima, por herança).
const canManageArea = (a: AuthContext, areaId: string | null) => can(a, 'people.manage', areaId);

async function config(tx: Tx, tenantId: string) {
  return parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [tenantId])).rows[0]?.config).config;
}

async function event(tx: Tx, a: AuthContext, ref: { opportunityId?: string | null; quickWinId?: string | null }, from: string | null, to: string, reason: string, action: string) {
  await tx.query(`insert into quick_win_events (tenant_id, opportunity_id, quick_win_id, actor, stage_from, stage_to, note) values ($1, $2, $3, $4, $5, $6, $7)`,
    [a.tenantId, ref.opportunityId ?? null, ref.quickWinId ?? null, a.email, from, to, reason]);
  await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action, target: ref.quickWinId ? `quick_win:${ref.quickWinId}` : `oportunidade:${ref.opportunityId}`,
    details: { de: from, para: to, motivo: reason, por: a.email } });
}

async function areaIdsFor(tx: Tx, slugs: string[]): Promise<{ ids: string[]; missing: string[] }> {
  const rows = slugs.length ? (await tx.query(`select id, slug from areas where slug = any($1)`, [slugs])).rows : [];
  return { ids: rows.map(r => r.id as string), missing: slugs.filter(s => !rows.some(r => r.slug === s)) };
}

// Grava áreas, recursos, revisores e indicadores de um quick win (substitui os anteriores).
async function setParts(tx: Tx, tenantId: string, qwId: string, parts: { areaIds?: string[]; recursos?: z.infer<typeof resourcesSchema>; revisores?: string[]; indicadores?: z.infer<typeof indicatorSchema>[] }): Promise<string | null> {
  if (parts.areaIds) {
    await tx.query(`delete from quick_win_areas where quick_win_id = $1`, [qwId]);
    for (const id of parts.areaIds) await tx.query(`insert into quick_win_areas (tenant_id, quick_win_id, area_id) values ($1, $2, $3)`, [tenantId, qwId, id]);
  }
  if (parts.recursos) {
    const as = parts.recursos.assistentes.length ? (await tx.query(`select id, slug from assistants where slug = any($1)`, [parts.recursos.assistentes])).rows : [];
    const missingA = parts.recursos.assistentes.filter(s => !as.some(r => r.slug === s));
    if (missingA.length) return `assistente não encontrado: ${missingA.join(', ')}`;
    const ds = parts.recursos.documentos.length ? (await tx.query(`select id from kb_documents where id = any($1)`, [parts.recursos.documentos])).rows : [];
    if (ds.length !== new Set(parts.recursos.documentos).size) return 'documento da base não encontrado';
    await tx.query(`delete from quick_win_resources where quick_win_id = $1`, [qwId]);
    for (const r of as) await tx.query(`insert into quick_win_resources (tenant_id, quick_win_id, assistant_id) values ($1, $2, $3)`, [tenantId, qwId, r.id]);
    for (const r of ds) await tx.query(`insert into quick_win_resources (tenant_id, quick_win_id, document_id) values ($1, $2, $3)`, [tenantId, qwId, r.id]);
  }
  if (parts.revisores) {
    const us = parts.revisores.length ? (await tx.query(`select id, email from users where email = any($1)`, [parts.revisores])).rows : [];
    const missing = parts.revisores.filter(e => !us.some(u => u.email === e));
    if (missing.length) return `revisor não cadastrado no cliente: ${missing.join(', ')}`;
    await tx.query(`delete from quick_win_reviewers where quick_win_id = $1`, [qwId]);
    for (const u of us) await tx.query(`insert into quick_win_reviewers (tenant_id, quick_win_id, user_id) values ($1, $2, $3)`, [tenantId, qwId, u.id]);
  }
  if (parts.indicadores) {
    // Indicador com valores registrados não some: só muda nome, unidade ou medição.
    const used = (await tx.query(`select distinct indicator from quick_win_values where quick_win_id = $1`, [qwId])).rows.map(r => r.indicator as string);
    const dropped = used.filter(k => !parts.indicadores!.some(i => i.key === k));
    if (dropped.length) return `indicador com valores registrados não pode sair: ${dropped.join(', ')}`;
    await tx.query(`delete from quick_win_indicators where quick_win_id = $1`, [qwId]);
    for (const [n, i] of parts.indicadores.entries()) {
      await tx.query(`insert into quick_win_indicators (tenant_id, quick_win_id, key, label, unit, direction, auto, position) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, qwId, i.key, i.label, i.unit, i.direction, i.auto ?? null, n]);
    }
  }
  return null;
}

// Cota do plano: bloqueia acima do limite e avisa quando o limite é atingido.
async function quota(tx: Tx, tenantId: string): Promise<{ blocked: boolean; aviso: string | null; em: number; max: number | null }> {
  const max = (await config(tx, tenantId)).limits.maxQuickWins;
  const em = await activeCount(tx);
  if (max === null) return { blocked: false, aviso: null, em, max };
  if (em >= max) return { blocked: true, aviso: null, em, max };
  return { blocked: false, aviso: em + 1 >= max ? `Cota do plano atingida: ${max} quick wins em andamento. Para abrir outro, encerre um ou fale com a TheNeil.` : null, em, max };
}

export async function quickWinRoutes(app: FastifyInstance) {
  // Critérios do tenant, escala e uso da cota.
  app.get('/api/quick-wins/criterios', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const cfg = await config(tx, a.tenantId);
      return { ...cfg.qwCriteria, cota: { emAndamento: await activeCount(tx), maximo: cfg.limits.maxQuickWins } };
    });
  });

  app.put('/api/admin/quick-wins/criterios', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure')) return reply.code(403).send({ error: 'sem_permissao' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const raw = (await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0]?.config ?? {};
      const next = tenantConfigSchema.safeParse({ ...raw, qwCriteria: req.body });
      if (!next.success) return { status: 400, body: { error: 'criterios_invalidos', detalhes: next.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) } };
      await tx.query(`select tenant_set_setting('qwCriteria', $1)`, [JSON.stringify(next.data.qwCriteria)]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'criterios_alterados', details: { criterios: next.data.qwCriteria.criterios.map(c => `${c.key}:${c.peso}`), escala: next.data.qwCriteria.escala } });
      return { status: 200, body: next.data.qwCriteria };
    });
    return reply.code(out.status).send(out.body);
  });

  // ---- Oportunidades --------------------------------------------------------------------------
  app.post('/api/opportunities', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = opportunitySchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const areaId = (await tx.query(`select id from areas where slug = $1 and active`, [p.data.areaSlug])).rows[0]?.id as string | undefined;
      if (!areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      if (!canManageArea(a, areaId)) return { status: 403, body: { error: 'sem_permissao' } };
      const d = p.data;
      const id = (await tx.query(
        `insert into opportunities (tenant_id, area_id, title, process, problem, current_executor, volume, evidence, evidence_note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [a.tenantId, areaId, d.titulo, d.processo, d.problema, d.executorAtual, d.volume, d.evidencia, d.evidenciaNota, a.userId])).rows[0].id as string;
      await event(tx, a, { opportunityId: id }, null, 'identificada', `Oportunidade registrada (${d.evidencia === 'comprovado' ? 'comprovada' : 'hipótese'}).`, 'oportunidade_registrada');
      return { status: 201, body: { id, status: 'identificada' } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Portfólio: oportunidades visíveis, com filtro por área, situação e critério.
  app.get('/api/opportunities', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = z.object({ area: z.string().max(60).optional(), status: z.enum(['identificada', 'avaliada', 'selecionada']).optional(), criterio: z.string().max(40).optional(), min: z.coerce.number().optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    return withTenant(app.deps.db, tenantCtx(a), tx => portfolio(tx, q.data));
  });

  app.post('/api/opportunities/:id/avaliar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ notas: z.record(z.string(), z.number()), nota: note }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const o = (await tx.query(`select id, area_id, status from opportunities where id = $1 for update`, [id])).rows[0];
      if (!o) return { status: 404, body: { error: 'nao_encontrada' } };
      if (!canManageArea(a, o.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      if (o.status === 'selecionada') return { status: 409, body: { error: 'ja_selecionada' } };
      const crit: QwCriteria = (await config(tx, a.tenantId)).qwCriteria;
      const r = weightedScore(crit, p.data.notas);
      if ('error' in r) return { status: 400, body: { error: 'avaliacao_invalida', detalhe: r.error } };
      const scores = Object.fromEntries(crit.criterios.map(c => [c.key, p.data.notas[c.key]]));
      await tx.query(`update opportunities set status = 'avaliada', scores = $2, score = $3, criteria_snapshot = $4, evaluated_by = $5, evaluated_at = now(), updated_at = now() where id = $1`,
        [id, scores, r.score, crit, a.userId]);
      await event(tx, a, { opportunityId: id }, o.status, 'avaliada', `${p.data.nota} (nota ${String(r.score).replace('.', ',')})`, 'oportunidade_avaliada');
      return { status: 200, body: { id, status: 'avaliada', nota: r.score } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Não passou nos critérios: volta ao portfólio, com motivo, sem a avaliação.
  app.post('/api/opportunities/:id/devolver', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ motivo: note }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const o = (await tx.query(`select id, area_id, status, score from opportunities where id = $1 for update`, [id])).rows[0];
      if (!o) return { status: 404, body: { error: 'nao_encontrada' } };
      if (!canManageArea(a, o.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      if (o.status !== 'avaliada') return { status: 409, body: { error: 'so_avaliada_volta_ao_portfolio' } };
      await tx.query(`update opportunities set status = 'identificada', scores = null, score = null, criteria_snapshot = null, evaluated_by = null, evaluated_at = null, updated_at = now() where id = $1`, [id]);
      await event(tx, a, { opportunityId: id }, 'avaliada', 'identificada', `Devolvida ao portfólio: ${p.data.motivo} (nota anterior ${o.score === null ? '—' : String(o.score).replace('.', ',')})`, 'oportunidade_devolvida');
      return { status: 200, body: { id, status: 'identificada' } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Oportunidade avaliada vira quick win.
  app.post('/api/opportunities/:id/selecionar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = selectSchema.safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.success ? [] : p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const o = (await tx.query(`select o.id, o.area_id, o.status, o.title, a.slug as area from opportunities o join areas a on a.id = o.area_id where o.id = $1 for update of o`, [id])).rows[0];
      if (!o) return { status: 404, body: { error: 'nao_encontrada' } };
      if (!canManageArea(a, o.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      if (o.status !== 'avaliada') return { status: 409, body: { error: 'avalie_antes_de_selecionar' } };
      const q = await quota(tx, a.tenantId);
      if (q.blocked) return { status: 409, body: { error: 'cota_de_quick_wins', maximo: q.max, emAndamento: q.em } };
      const areas = await areaIdsFor(tx, p.data.areas ?? [o.area]);
      if (areas.missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: areas.missing } };
      if (areas.ids.some(x => !canManageArea(a, x))) return { status: 403, body: { error: 'sem_permissao_em_alguma_area' } };
      const d = p.data;
      // Id gerado aqui: sem as áreas, a linha nova ainda não é visível pela RLS (sem "returning").
      const qwId = randomUUID();
      await tx.query(`insert into quick_wins (id, tenant_id, opportunity_id, title, objective, owner_email, deadline, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [qwId, a.tenantId, id, d.titulo ?? o.title, d.objetivo, d.responsavel, d.prazo ?? null, a.userId]);
      const err = await setParts(tx, a.tenantId, qwId, { areaIds: areas.ids, recursos: d.recursos, revisores: d.revisores, indicadores: d.indicadores });
      if (err) throw new PartError(err);
      await tx.query(`update opportunities set status = 'selecionada', updated_at = now() where id = $1`, [id]);
      await event(tx, a, { opportunityId: id }, 'avaliada', 'selecionada', d.nota, 'oportunidade_selecionada');
      await event(tx, a, { quickWinId: qwId }, null, 'selecionada', d.nota, 'quick_win_criado');
      return { status: 201, body: { id: qwId, etapa: 'selecionada', aviso: q.aviso } };
    }).catch(e => { if (e instanceof PartError) return { status: 400, body: { error: 'dados_invalidos', detalhe: e.message } }; throw e; });
    return reply.code(out.status).send(out.body);
  });

  // ---- Quick wins -----------------------------------------------------------------------------
  app.get('/api/quick-wins', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), async tx => (await tx.query(
      `select q.id, q.title, q.stage, q.decision, q.owner_email, q.deadline, q.origin_id, q.created_at, o.score,
              (select string_agg(ar.name, ', ' order by ar.name) from quick_win_areas qa join areas ar on ar.id = qa.area_id where qa.quick_win_id = q.id) as areas,
              (select count(*) from quick_win_resources r where r.quick_win_id = q.id and r.assistant_id is not null)::int as assistentes,
              (select count(*) from quick_win_resources r where r.quick_win_id = q.id and r.document_id is not null)::int as documentos
       from quick_wins q left join opportunities o on o.id = q.opportunity_id order by q.created_at desc`)).rows.map(r => ({
      id: r.id, titulo: r.title, etapa: r.stage, etapaNome: STAGE_LABEL[r.stage], decisao: r.decision, responsavel: r.owner_email, prazo: r.deadline ? new Date(r.deadline).toISOString().slice(0, 10) : null,
      origem: r.origin_id, areas: r.areas ?? '', assistentes: r.assistentes, documentos: r.documentos, notaDaOportunidade: r.score === null ? null : Number(r.score), criadoEm: r.created_at,
    })));
  });

  app.get('/api/quick-wins/:id', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const q = z.object({ de: z.iso.date().optional(), ate: z.iso.date().optional() }).safeParse(req.query);
    if (!z.uuid().safeParse(id).success || !q.success) return reply.code(404).send({ error: 'nao_encontrado' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return null;
      const r = await buildResults(tx, loaded, period(q.data));
      return { ...r, indicadoresDefinidos: loaded.indicators, revisores: loaded.reviewers, podeGerenciar: loaded.areas.some(ar => canManageArea(a, ar.id)), proximasEtapas: NEXT_STAGE[loaded.q.stage] };
    });
    if (!out) return reply.code(404).send({ error: 'nao_encontrado' });
    return out;
  });

  // Ajustes antes do encerramento: indicadores, recursos, revisores, responsável, prazo, objetivo.
  app.patch('/api/quick-wins/:id', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({
      objetivo: z.string().trim().min(3).max(2000).optional(), responsavel: z.string().trim().toLowerCase().pipe(z.email()).optional(), prazo: z.iso.date().nullable().optional(),
      indicadores: z.array(indicatorSchema).max(30).optional(), recursos: resourcesSchema.optional(), revisores: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(50).optional(),
    }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!loaded.areas.some(ar => canManageArea(a, ar.id))) return { status: 403, body: { error: 'sem_permissao' } };
      if (loaded.q.stage === 'encerrada') return { status: 409, body: { error: 'quick_win_encerrado' } };
      const d = p.data;
      await tx.query(`update quick_wins set objective = $2, owner_email = $3, deadline = $4, updated_at = now() where id = $1`,
        [id, d.objetivo ?? loaded.q.objective, d.responsavel ?? loaded.q.owner_email, d.prazo === undefined ? loaded.q.deadline : d.prazo]);
      const err = await setParts(tx, a.tenantId, id, { recursos: d.recursos, revisores: d.revisores, indicadores: d.indicadores });
      if (err) throw new PartError(err);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'quick_win_alterado', target: `quick_win:${id}`, details: { campos: Object.keys(d) } });
      return { status: 200, body: { id } };
    }).catch(e => { if (e instanceof PartError) return { status: 400, body: { error: 'dados_invalidos', detalhe: e.message } }; throw e; });
    return reply.code(out.status).send(out.body);
  });

  app.post('/api/quick-wins/:id/etapa', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ etapa: z.enum(['em_implantacao', 'em_medicao', 'encerrada']), nota: note }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!loaded.areas.some(ar => canManageArea(a, ar.id))) return { status: 403, body: { error: 'sem_permissao' } };
      const from = loaded.q.stage as string;
      if (!NEXT_STAGE[from].includes(p.data.etapa)) return { status: 409, body: { error: 'etapa_invalida', de: from, possiveis: NEXT_STAGE[from] } };
      await tx.query(`update quick_wins set stage = $2, updated_at = now() where id = $1`, [id, p.data.etapa]);
      await event(tx, a, { quickWinId: id }, from, p.data.etapa, p.data.nota, 'quick_win_etapa');
      return { status: 200, body: { id, etapa: p.data.etapa } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Decisão, depois da medição: manter, descartar ou ampliar, com justificativa.
  app.post('/api/quick-wins/:id/decisao', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ decisao: z.enum(['manter', 'descartar', 'ampliar']), justificativa: z.string().trim().min(10).max(4000) }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!loaded.areas.some(ar => canManageArea(a, ar.id))) return { status: 403, body: { error: 'sem_permissao' } };
      if (loaded.q.stage !== 'em_medicao') return { status: 409, body: { error: 'decisao_so_depois_da_medicao', etapa: loaded.q.stage } };
      await tx.query(`update quick_wins set stage = 'decisao', decision = $2, decision_note = $3, decided_by = $4, decided_at = now(), updated_at = now() where id = $1`,
        [id, p.data.decisao, p.data.justificativa, a.userId]);
      await event(tx, a, { quickWinId: id }, 'em_medicao', 'decisao', `${p.data.decisao.toUpperCase()}: ${p.data.justificativa}`, 'quick_win_decidido');
      return { status: 200, body: { id, etapa: 'decisao', decisao: p.data.decisao } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Ampliar: novo quick win em outra área, unidade ou processo, com os mesmos
  // recursos e indicadores como ponto de partida e baseline próprio.
  app.post('/api/quick-wins/:id/ampliar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({
      titulo: z.string().trim().min(3).max(200), objetivo: z.string().trim().min(3).max(2000), responsavel: z.string().trim().toLowerCase().pipe(z.email()),
      areas: z.array(z.string().max(60)).min(1).max(20), prazo: z.iso.date().optional(), nota: note,
    }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (loaded.q.decision !== 'ampliar') return { status: 409, body: { error: 'decisao_nao_e_ampliar' } };
      const areas = await areaIdsFor(tx, p.data.areas);
      if (areas.missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: areas.missing } };
      if (areas.ids.some(x => !canManageArea(a, x))) return { status: 403, body: { error: 'sem_permissao_em_alguma_area' } };
      const q = await quota(tx, a.tenantId);
      if (q.blocked) return { status: 409, body: { error: 'cota_de_quick_wins', maximo: q.max, emAndamento: q.em } };
      const newId = randomUUID();
      await tx.query(`insert into quick_wins (id, tenant_id, opportunity_id, origin_id, title, objective, owner_email, deadline, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newId, a.tenantId, loaded.q.opportunity_id, id, p.data.titulo, p.data.objetivo, p.data.responsavel, p.data.prazo ?? null, a.userId]);
      for (const aid of areas.ids) await tx.query(`insert into quick_win_areas (tenant_id, quick_win_id, area_id) values ($1, $2, $3)`, [a.tenantId, newId, aid]);
      // Mesmos recursos: os assistentes e documentos passam a ser compartilhados com as áreas novas.
      const shared: string[] = [];
      for (const r of loaded.resources) {
        const own = r.assistant_id
          ? (await tx.query(`select area_id, company_wide from assistants where id = $1`, [r.assistant_id])).rows[0]
          : (await tx.query(`select area_id, company_wide from kb_documents where id = $1`, [r.document_id])).rows[0];
        const need = own && !own.company_wide ? areas.ids.filter(x => x !== own.area_id) : [];
        if (need.length && !canManageArea(a, own.area_id)) throw new PartError(`sem permissão para compartilhar ${r.assistant_id ? 'o assistente ' + r.assistant_name : 'o documento ' + r.document_title} com as áreas novas`);
        for (const x of need) {
          if (r.assistant_id) await tx.query(`insert into assistant_shares (tenant_id, assistant_id, area_id) values ($1, $2, $3) on conflict do nothing`, [a.tenantId, r.assistant_id, x]);
          else await tx.query(`insert into kb_document_shares (tenant_id, document_id, area_id) values ($1, $2, $3) on conflict do nothing`, [a.tenantId, r.document_id, x]);
        }
        if (need.length) shared.push(r.assistant_id ? `assistente ${r.assistant_slug}` : `documento ${r.document_title}`);
        await tx.query(`insert into quick_win_resources (tenant_id, quick_win_id, assistant_id, document_id) values ($1, $2, $3, $4)`, [a.tenantId, newId, r.assistant_id, r.document_id]);
      }
      if (shared.length) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'recursos_compartilhados_na_ampliacao', target: `quick_win:${newId}`, details: { recursos: shared } });
      for (const [n, i] of loaded.indicators.entries()) {
        await tx.query(`insert into quick_win_indicators (tenant_id, quick_win_id, key, label, unit, direction, auto, position) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [a.tenantId, newId, i.key, i.label, i.unit, i.direction, i.auto ?? null, n]);
      }
      await event(tx, a, { quickWinId: newId }, null, 'selecionada', `Ampliação de "${loaded.q.title}": ${p.data.nota}`, 'quick_win_ampliado');
      await event(tx, a, { quickWinId: id }, 'decisao', 'decisao', `Ampliado para "${p.data.titulo}".`, 'quick_win_ampliacao_criada');
      return { status: 201, body: { id: newId, origem: id, etapa: 'selecionada', aviso: q.aviso } };
    }).catch(e => { if (e instanceof PartError) return { status: 403, body: { error: 'sem_permissao', detalhe: e.message } }; throw e; });
    return reply.code(out.status).send(out.body);
  });

  // Plataforma: cota de quick wins do plano do tenant (sem valor: sem limite).
  app.put('/api/platform/tenants/:slug/quick-wins-quota', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const { slug } = req.params as { slug: string };
    const p = z.object({ maximo: z.number().int().min(1).max(100000).nullable() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const t = (await app.deps.ownerDb.query(`select id, config from tenants where slug = $1`, [slug])).rows[0];
    if (!t) return reply.code(404).send({ error: 'tenant_nao_encontrado' });
    const limits = { ...(t.config?.limits ?? {}), maxQuickWins: p.data.maximo };
    await app.deps.ownerDb.query(`update tenants set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('limits', $2::jsonb) where id = $1`, [t.id, JSON.stringify(limits)]);
    await app.deps.ownerDb.query(`insert into audit_log (tenant_id, action, details) values ($1, 'cota_de_quick_wins_alterada', $2)`, [t.id, { maximo: p.data.maximo, por: `TheNeil (${a.email})` }]);
    return { slug, maximo: p.data.maximo };
  });
}

class PartError extends Error {}

// Portfólio de oportunidades (vista, relatório e exportação usam o mesmo).
export async function portfolio(tx: Tx, f: { area?: string; status?: string; criterio?: string; min?: number } = {}) {
  const rows = (await tx.query(
    `select o.*, a.slug as area_slug, a.name as area_name, u.email as created_by_email,
            (select q.id from quick_wins q where q.opportunity_id = o.id and q.origin_id is null order by q.created_at limit 1) as quick_win_id,
            (select q.stage from quick_wins q where q.opportunity_id = o.id and q.origin_id is null order by q.created_at limit 1) as quick_win_stage,
            (select e.note from quick_win_events e where e.opportunity_id = o.id order by e.id desc limit 1) as last_note
     from opportunities o join areas a on a.id = o.area_id left join users u on u.id = o.created_by
     where ($1::text is null or a.id = any(area_subtree((select id from areas where slug = $1))))
       and ($2::text is null or o.status = $2)
     order by o.score desc nulls last, o.created_at`, [f.area ?? null, f.status ?? null])).rows;
  return rows
    .filter(r => !f.criterio || f.min === undefined || (r.scores && Number(r.scores[f.criterio]) >= f.min))
    .map(r => ({
      id: r.id, titulo: r.title, area: r.area_name, areaSlug: r.area_slug, processo: r.process, problema: r.problem, executorAtual: r.current_executor, volume: r.volume,
      evidencia: r.evidence, evidenciaNota: r.evidence_note, status: r.status, notas: r.scores ?? null, nota: r.score === null ? null : Number(r.score),
      criteriosUsados: r.criteria_snapshot ?? null, quickWin: r.quick_win_id ? { id: r.quick_win_id, etapa: r.quick_win_stage } : null,
      registradaPor: r.created_by_email, registradaEm: r.created_at, ultimoRegistro: (r.last_note ?? null) as string | null,
    }));
}
export type PortfolioRow = Awaited<ReturnType<typeof portfolio>>[number];
