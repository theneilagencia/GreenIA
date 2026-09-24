// Oportunidades e quick wins.
//   oportunidade  registrada pelo key user ou admin na área: processo,
//                 problema, quem executa hoje, volume, evidência; avaliada
//                 pelos critérios do tenant. Ciclo: registrada → avaliada →
//                 selecionada | roadmap (grande demais para quick win) |
//                 arquivada; roadmap e arquivada sempre com motivo
//   quick win     nasce da oportunidade selecionada: responsável, áreas,
//                 objetivo, indicadores do processo (escolhidos pelo cliente),
//                 janelas de ponto de partida e de medição, recursos
//                 (assistentes e documentos), revisores, prazo. Ciclo: em
//                 implantação → em medição → decisão (manter, descartar,
//                 ampliar) → encerrado; na implantação pode voltar ao roadmap
// Quem decide: key users e admins propõem; selecionar e registrar a decisão
// final exigem patrocinador (do tenant ou da área) ou admin do cliente. Toda
// mudança de etapa vai para o histórico e para a auditoria, com quem e por quê.
// Ampliar cria outro quick win (outra área, unidade ou processo) com os mesmos
// recursos, compartilhados ou duplicados, baseline próprio e vínculo com a origem.
// O número de quick wins não é fixo: a cota, se houver, é do plano do tenant.
import { randomUUID, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig, tenantConfigSchema } from '../tenants/config.ts';
import { isPlatformAdmin } from '../platform/routes.ts';
import { tenantPrefix } from '../storage/object-store.ts';
import { requestShares } from '../areas/sharing.ts';
import { AUTO_METRICS } from '../metrics/metrics.ts';
import { weightedScore, type QwCriteria } from './criteria.ts';
import { NEXT_STAGE, STAGE_LABEL, activeCount, buildResults, loadQuickWin, period, windowsOf, windowWarnings } from './service.ts';

const indicatorSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,60}$/),
  label: z.string().trim().min(1).max(120),
  unit: z.string().max(30).default(''),
  direction: z.enum(['menor_melhor', 'maior_melhor']).default('menor_melhor'),
  auto: z.enum(AUTO_METRICS).nullable().optional(),        // medição automática das execuções; sem valor: lançada à mão
  comparacao: z.enum(['valor', 'por_mes', 'por_item']).default('valor'),
});
const resourcesFields = z.object({ assistentes: z.array(z.string().max(80)).max(50).default([]), documentos: z.array(z.uuid()).max(200).default([]) });
const resourcesSchema = resourcesFields.prefault({});
const note = z.string().trim().min(3).max(4000);
const windowSchema = z.object({ inicio: z.iso.date().nullable().optional(), fim: z.iso.date().nullable().optional(), volume: z.number().positive().nullable().optional() })
  .refine(w => !w.inicio || !w.fim || w.fim >= w.inicio, { message: 'fim antes do início' });
const windowsSchema = z.object({ pontoDePartida: windowSchema.optional(), medicao: windowSchema.optional(), unidadeVolume: z.string().trim().max(40).optional() });

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

const uniqueKeys = (list: { key: string }[] | undefined, ctx: z.RefinementCtx) => {
  const keys = new Set<string>();
  (list ?? []).forEach((i, n) => { if (keys.has(i.key)) ctx.addIssue({ code: 'custom', path: ['indicadores', n, 'key'], message: `indicador repetido: ${i.key}` }); keys.add(i.key); });
};

const selectSchema = z.object({
  titulo: z.string().trim().min(3).max(200).optional(),
  objetivo: z.string().trim().min(3).max(2000),
  responsavel: z.string().trim().toLowerCase().pipe(z.email()),
  areas: z.array(z.string().max(60)).max(20).optional(),      // padrão: a área da oportunidade
  prazo: z.iso.date().optional(),
  indicadores: z.array(indicatorSchema).max(30).default([]),
  janelas: windowsSchema.optional(),
  recursos: resourcesSchema,
  revisores: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(50).default([]),
  substitui: z.uuid().optional(),                             // quick win que voltou ao roadmap
  nota: note,
}).superRefine((b, ctx) => uniqueKeys(b.indicadores, ctx));

// Key user ou admin da área (e das áreas acima, por herança): propõe e conduz.
const canManageArea = (a: AuthContext, areaId: string | null) => can(a, 'people.manage', areaId);
// Patrocinador (do tenant ou da área) ou admin do cliente: seleciona e decide.
const canDecideArea = (a: AuthContext, areaId: string | null) => can(a, 'qw.decide', areaId);
const canDecideAll = (a: AuthContext, areaIds: string[]) => areaIds.length > 0 && areaIds.every(x => canDecideArea(a, x));
const canWork = (a: AuthContext, areaIds: string[]) => areaIds.some(x => canManageArea(a, x) || canDecideArea(a, x));

async function config(tx: Tx, tenantId: string) {
  return parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [tenantId])).rows[0]?.config).config;
}

async function event(tx: Tx, a: AuthContext, ref: { opportunityId?: string | null; quickWinId?: string | null }, from: string | null, to: string, reason: string, action: string) {
  await tx.query(`insert into quick_win_events (tenant_id, opportunity_id, quick_win_id, actor, stage_from, stage_to, note) values ($1, $2, $3, $4, $5, $6, $7)`,
    [a.tenantId, ref.opportunityId ?? null, ref.quickWinId ?? null, a.email, from, to, reason]);
  await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action, target: ref.quickWinId ? `quick_win:${ref.quickWinId}` : `oportunidade:${ref.opportunityId}`,
    details: { de: from, para: to, motivo: reason, por: a.email } });
}

async function areaIdsFor(tx: Tx, slugs: string[]): Promise<{ ids: string[]; missing: string[]; rows: { id: string; slug: string; name: string }[] }> {
  const rows = slugs.length ? (await tx.query(`select id, slug, name from areas where slug = any($1)`, [slugs])).rows : [];
  return { ids: rows.map(r => r.id as string), missing: slugs.filter(s => !rows.some(r => r.slug === s)), rows };
}

// Janelas: grava só o que veio (undefined mantém, null apaga).
async function setWindows(tx: Tx, qwId: string, j: z.infer<typeof windowsSchema> | undefined) {
  if (!j) return;
  const sets: string[] = [];
  const vals: unknown[] = [qwId];
  const put = (col: string, v: unknown) => { if (v !== undefined) { vals.push(v); sets.push(`${col} = $${vals.length}`); } };
  put('baseline_start', j.pontoDePartida?.inicio); put('baseline_end', j.pontoDePartida?.fim); put('baseline_volume', j.pontoDePartida?.volume);
  put('measure_start', j.medicao?.inicio); put('measure_end', j.medicao?.fim); put('measure_volume', j.medicao?.volume);
  put('volume_unit', j.unidadeVolume);
  if (sets.length) await tx.query(`update quick_wins set ${sets.join(', ')}, updated_at = now() where id = $1`, vals);
}

// Grava áreas, recursos, revisores e indicadores de um quick win (substitui os anteriores).
async function setParts(tx: Tx, tenantId: string, qwId: string, parts: { areaIds?: string[]; recursos?: z.infer<typeof resourcesSchema>; revisores?: string[]; indicadores?: z.infer<typeof indicatorSchema>[] }): Promise<string | null> {
  if (parts.areaIds) {
    await tx.query(`delete from quick_win_areas where quick_win_id = $1`, [qwId]);
    for (const id of parts.areaIds) await tx.query(`insert into quick_win_areas (tenant_id, quick_win_id, area_id) values ($1, $2, $3)`, [tenantId, qwId, id]);
  }
  if (parts.recursos) {
    const found = (await tx.query(`select * from quick_win_lookup_resources($1, $2)`, [parts.recursos.assistentes, parts.recursos.documentos])).rows as { kind: string; id: string; ref: string }[];
    const as = found.filter(r => r.kind === 'assistente');
    const missingA = parts.recursos.assistentes.filter(s => !as.some(r => r.ref === s));
    if (missingA.length) return `assistente não encontrado: ${missingA.join(', ')}`;
    const ds = found.filter(r => r.kind === 'documento');
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
      await tx.query(`insert into quick_win_indicators (tenant_id, quick_win_id, key, label, unit, direction, auto, comparison, position) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, qwId, i.key, i.label, i.unit, i.direction, i.auto ?? null, i.comparacao, n]);
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

// Oportunidade para mudar de situação: carrega e confere quem pode.
async function oppFor(tx: Tx, a: AuthContext, id: string, who: 'propor' | 'decidir') {
  const o = (await tx.query(`select id, area_id, status, score, title from opportunities where id = $1 for update`, [id])).rows[0];
  if (!o) return { err: { status: 404, body: { error: 'nao_encontrada' } } };
  const ok = who === 'decidir' ? canDecideArea(a, o.area_id) : canManageArea(a, o.area_id) || canDecideArea(a, o.area_id);
  if (!ok) return { err: { status: 403, body: { error: who === 'decidir' ? 'so_patrocinador_ou_admin' : 'sem_permissao' } } };
  return { o };
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
      const d = p.data;
      const areaId = (await tx.query(`select id from areas where slug = $1`, [d.areaSlug])).rows[0]?.id as string | undefined;
      if (!areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      if (!canManageArea(a, areaId)) return { status: 403, body: { error: 'sem_permissao' } };
      const id = randomUUID();
      await tx.query(
        `insert into opportunities (id, tenant_id, area_id, title, process, problem, current_executor, volume, evidence, evidence_note, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, a.tenantId, areaId, d.titulo, d.processo, d.problema, d.executorAtual, d.volume, d.evidencia, d.evidenciaNota, a.userId]);
      await event(tx, a, { opportunityId: id }, null, 'registrada', `Oportunidade registrada (${d.evidencia === 'comprovado' ? 'comprovada' : 'hipótese'}).`, 'oportunidade_registrada');
      return { status: 201, body: { id, status: 'registrada' } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Portfólio: oportunidades visíveis, com filtro por área, situação e critério.
  app.get('/api/opportunities', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = portfolioFilter.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    return withTenant(app.deps.db, tenantCtx(a), async tx => (await portfolio(tx, q.data)).map(o => ({
      ...o, podePropor: canManageArea(a, o.areaId) || canDecideArea(a, o.areaId), podeDecidir: canDecideArea(a, o.areaId),
    })));
  });

  app.post('/api/opportunities/:id/avaliar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ notas: z.record(z.string(), z.number()), nota: note }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const { o, err } = await oppFor(tx, a, id, 'propor');
      if (err) return err;
      if (!['registrada', 'avaliada'].includes(o.status)) return { status: 409, body: { error: 'so_registrada_ou_avaliada', status: o.status } };
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

  // Enviada ao roadmap (grande ou complexa demais para quick win) ou arquivada, sempre com motivo.
  for (const [path, to, from, action] of [
    ['roadmap', 'roadmap', ['registrada', 'avaliada'], 'oportunidade_enviada_ao_roadmap'],
    ['arquivar', 'arquivada', ['registrada', 'avaliada', 'roadmap'], 'oportunidade_arquivada'],
    ['reabrir', 'registrada', ['roadmap', 'arquivada'], 'oportunidade_reaberta'],
  ] as const) {
    app.post(`/api/opportunities/:id/${path}`, async (req, reply) => {
      const a = requireAuth(req, reply);
      if (!a) return;
      const { id } = req.params as { id: string };
      const p = z.object({ motivo: note }).safeParse(req.body);
      if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhe: 'o motivo é obrigatório' });
      const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        const { o, err } = await oppFor(tx, a, id, 'propor');
        if (err) return err;
        if (!(from as readonly string[]).includes(o.status)) return { status: 409, body: { error: 'situacao_nao_permite', status: o.status, possiveis: from } };
        await tx.query(`update opportunities set status = $2, status_reason = $3, status_by = $4, status_at = now(), updated_at = now() where id = $1`,
          [id, to, to === 'registrada' ? null : p.data.motivo, a.userId]);
        await event(tx, a, { opportunityId: id }, o.status, to, p.data.motivo, action);
        return { status: 200, body: { id, status: to } };
      });
      return reply.code(out.status).send(out.body);
    });
  }

  // Oportunidade avaliada vira quick win: só patrocinador ou admin.
  app.post('/api/opportunities/:id/selecionar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = selectSchema.safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.success ? [] : p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const o = (await tx.query(`select o.id, o.area_id, o.status, o.title, a.slug as area from opportunities o join areas a on a.id = o.area_id where o.id = $1 for update of o`, [id])).rows[0];
      if (!o) return { status: 404, body: { error: 'nao_encontrada' } };
      if (!canDecideArea(a, o.area_id)) return { status: 403, body: { error: 'so_patrocinador_ou_admin' } };
      if (o.status !== 'avaliada') return { status: 409, body: { error: 'avalie_antes_de_selecionar' } };
      const q = await quota(tx, a.tenantId);
      if (q.blocked) return { status: 409, body: { error: 'cota_de_quick_wins', maximo: q.max, emAndamento: q.em } };
      const areas = await areaIdsFor(tx, p.data.areas ?? [o.area]);
      if (areas.missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: areas.missing } };
      if (!canDecideAll(a, areas.ids)) return { status: 403, body: { error: 'so_patrocinador_ou_admin' } };
      const d = p.data;
      if (d.substitui) {
        const old = (await tx.query(`select stage from quick_wins where id = $1`, [d.substitui])).rows[0];
        if (!old || old.stage !== 'roadmap') return { status: 409, body: { error: 'so_substitui_quick_win_enviado_ao_roadmap' } };
      }
      // Id gerado aqui: sem as áreas, a linha nova ainda não é visível pela RLS (sem "returning").
      const qwId = randomUUID();
      await tx.query(`insert into quick_wins (id, tenant_id, opportunity_id, title, objective, owner_email, deadline, replaces_id, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [qwId, a.tenantId, id, d.titulo ?? o.title, d.objetivo, d.responsavel, d.prazo ?? null, d.substitui ?? null, a.userId]);
      const err = await setParts(tx, a.tenantId, qwId, { areaIds: areas.ids, recursos: d.recursos, revisores: d.revisores, indicadores: d.indicadores });
      if (err) throw new PartError(err);
      await setWindows(tx, qwId, d.janelas);
      await tx.query(`update opportunities set status = 'selecionada', status_by = $2, status_at = now(), updated_at = now() where id = $1`, [id, a.userId]);
      await event(tx, a, { opportunityId: id }, 'avaliada', 'selecionada', d.nota, 'oportunidade_selecionada');
      await event(tx, a, { quickWinId: qwId }, null, 'em_implantacao', d.nota + (d.substitui ? ' (no lugar de um quick win enviado ao roadmap)' : ''), 'quick_win_criado');
      return { status: 201, body: { id: qwId, etapa: 'em_implantacao', aviso: q.aviso } };
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
      const areaIds = loaded.areas.map(ar => ar.id as string);
      return { ...r, indicadoresDefinidos: loaded.indicators, revisores: loaded.reviewers,
        podeGerenciar: canWork(a, areaIds), podeDecidir: canDecideAll(a, areaIds), proximasEtapas: NEXT_STAGE[loaded.q.stage] ?? [] };
    });
    if (!out) return reply.code(404).send({ error: 'nao_encontrado' });
    return out;
  });

  // Ajustes antes do encerramento: indicadores, janelas, recursos, revisores, responsável, prazo, objetivo.
  app.patch('/api/quick-wins/:id', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({
      objetivo: z.string().trim().min(3).max(2000).optional(), responsavel: z.string().trim().toLowerCase().pipe(z.email()).optional(), prazo: z.iso.date().nullable().optional(),
      indicadores: z.array(indicatorSchema).max(30).optional(), janelas: windowsSchema.optional(), recursos: resourcesFields.optional(),   // sem o campo: recursos ficam como estão
      revisores: z.array(z.string().trim().toLowerCase().pipe(z.email())).max(50).optional(),
    }).superRefine((b, ctx) => uniqueKeys(b.indicadores, ctx)).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.success ? [] : p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!canWork(a, loaded.areas.map(ar => ar.id as string))) return { status: 403, body: { error: 'sem_permissao' } };
      if (['encerrada', 'roadmap'].includes(loaded.q.stage)) return { status: 409, body: { error: 'quick_win_fechado' } };
      const d = p.data;
      await tx.query(`update quick_wins set objective = $2, owner_email = $3, deadline = $4, updated_at = now() where id = $1`,
        [id, d.objetivo ?? loaded.q.objective, d.responsavel ?? loaded.q.owner_email, d.prazo === undefined ? loaded.q.deadline : d.prazo]);
      const err = await setParts(tx, a.tenantId, id, { recursos: d.recursos, revisores: d.revisores, indicadores: d.indicadores });
      if (err) throw new PartError(err);
      await setWindows(tx, id, d.janelas);
      const after = (await tx.query(`select * from quick_wins where id = $1`, [id])).rows[0];
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'quick_win_alterado', target: `quick_win:${id}`, details: { campos: Object.keys(d) } });
      return { status: 200, body: { id, avisosDasJanelas: windowWarnings(windowsOf(after)) } };
    }).catch(e => { if (e instanceof PartError) return { status: 400, body: { error: 'dados_invalidos', detalhe: e.message } }; throw e; });
    return reply.code(out.status).send(out.body);
  });

  app.post('/api/quick-wins/:id/etapa', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ etapa: z.enum(['em_medicao', 'encerrada']), nota: note }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!canWork(a, loaded.areas.map(ar => ar.id as string))) return { status: 403, body: { error: 'sem_permissao' } };
      const from = loaded.q.stage as string;
      if (!(NEXT_STAGE[from] ?? []).includes(p.data.etapa)) return { status: 409, body: { error: 'etapa_invalida', de: from, possiveis: NEXT_STAGE[from] ?? [] } };
      await tx.query(`update quick_wins set stage = $2, updated_at = now() where id = $1`, [id, p.data.etapa]);
      await event(tx, a, { quickWinId: id }, from, p.data.etapa, p.data.nota, 'quick_win_etapa');
      return { status: 200, body: { id, etapa: p.data.etapa } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Complexo demais, descoberto na implantação: volta ao portfólio como
  // oportunidade enviada ao roadmap, com motivo. Outra pode ser selecionada no lugar.
  app.post('/api/quick-wins/:id/roadmap', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ motivo: note }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhe: 'o motivo é obrigatório' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      const areaIds = loaded.areas.map(ar => ar.id as string);
      if (!canWork(a, areaIds)) return { status: 403, body: { error: 'sem_permissao' } };
      if (loaded.q.stage !== 'em_implantacao') return { status: 409, body: { error: 'so_na_implantacao', etapa: loaded.q.stage } };
      await tx.query(`update quick_wins set stage = 'roadmap', updated_at = now() where id = $1`, [id]);
      await event(tx, a, { quickWinId: id }, 'em_implantacao', 'roadmap', p.data.motivo, 'quick_win_enviado_ao_roadmap');
      // A oportunidade de origem volta ao portfólio no roadmap; ampliação ganha uma oportunidade própria.
      let oppId = loaded.q.opportunity_id as string | null;
      if (loaded.q.origin_id || !oppId) {
        const src = oppId ? (await tx.query(`select * from opportunities where id = $1`, [oppId])).rows[0] : null;
        oppId = randomUUID();
        await tx.query(
          `insert into opportunities (id, tenant_id, area_id, title, process, problem, current_executor, volume, evidence, evidence_note, status, status_reason, status_by, status_at, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'roadmap', $11, $12, now(), $12)`,
          [oppId, a.tenantId, areaIds[0], loaded.q.title, src?.process ?? loaded.q.title, src?.problem ?? loaded.q.objective, src?.current_executor ?? '', src?.volume ?? '',
           src?.evidence ?? 'hipotese', src?.evidence_note ?? '', p.data.motivo, a.userId]);
        await event(tx, a, { opportunityId: oppId }, null, 'roadmap', `Veio do quick win "${loaded.q.title}": ${p.data.motivo}`, 'oportunidade_enviada_ao_roadmap');
      } else {
        await tx.query(`update opportunities set status = 'roadmap', status_reason = $2, status_by = $3, status_at = now(), updated_at = now() where id = $1`, [oppId, p.data.motivo, a.userId]);
        await event(tx, a, { opportunityId: oppId }, 'selecionada', 'roadmap', `Quick win voltou ao portfólio: ${p.data.motivo}`, 'oportunidade_enviada_ao_roadmap');
      }
      return { status: 200, body: { id, etapa: 'roadmap', oportunidade: oppId } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Decisão, depois da medição: manter, descartar ou ampliar. Só patrocinador ou admin.
  app.post('/api/quick-wins/:id/decisao', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ decisao: z.enum(['manter', 'descartar', 'ampliar']), justificativa: z.string().trim().min(10).max(4000) }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!canDecideAll(a, loaded.areas.map(ar => ar.id as string))) return { status: 403, body: { error: 'so_patrocinador_ou_admin' } };
      if (loaded.q.stage !== 'em_medicao') return { status: 409, body: { error: 'decisao_so_depois_da_medicao', etapa: loaded.q.stage } };
      await tx.query(`update quick_wins set stage = 'decisao', decision = $2, decision_note = $3, decided_by = $4, decided_at = now(), updated_at = now() where id = $1`,
        [id, p.data.decisao, p.data.justificativa, a.userId]);
      await event(tx, a, { quickWinId: id }, 'em_medicao', 'decisao', `${p.data.decisao.toUpperCase()}: ${p.data.justificativa}`, 'quick_win_decidido');
      return { status: 200, body: { id, etapa: 'decisao', decisao: p.data.decisao } };
    });
    return reply.code(out.status).send(out.body);
  });

  // Ampliar: novo quick win em outra área, unidade ou processo, com os mesmos
  // recursos (compartilhados ou duplicados, à escolha), os mesmos indicadores e
  // baseline próprio. Só patrocinador ou admin das áreas novas.
  app.post('/api/quick-wins/:id/ampliar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({
      titulo: z.string().trim().min(3).max(200), objetivo: z.string().trim().min(3).max(2000), responsavel: z.string().trim().toLowerCase().pipe(z.email()),
      areas: z.array(z.string().max(60)).min(1).max(20), prazo: z.iso.date().optional(), nota: note,
      recursos: z.enum(['compartilhar', 'duplicar']).default('compartilhar'), janelas: windowsSchema.optional(),
    }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const copies: { documentId: string; version: number }[] = [];
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const loaded = await loadQuickWin(tx, id);
      if (!loaded) return { status: 404, body: { error: 'nao_encontrado' } };
      if (loaded.q.decision !== 'ampliar') return { status: 409, body: { error: 'decisao_nao_e_ampliar' } };
      const areas = await areaIdsFor(tx, p.data.areas);
      if (areas.missing.length) return { status: 404, body: { error: 'area_nao_encontrada', areas: areas.missing } };
      if (!canDecideAll(a, areas.ids)) return { status: 403, body: { error: 'so_patrocinador_ou_admin' } };
      const q = await quota(tx, a.tenantId);
      if (q.blocked) return { status: 409, body: { error: 'cota_de_quick_wins', maximo: q.max, emAndamento: q.em } };
      const newId = randomUUID();
      const mode = p.data.recursos === 'duplicar' ? 'duplicados' : 'compartilhados';
      await tx.query(`insert into quick_wins (id, tenant_id, opportunity_id, origin_id, title, objective, owner_email, deadline, resources_mode, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [newId, a.tenantId, loaded.q.opportunity_id, id, p.data.titulo, p.data.objetivo, p.data.responsavel, p.data.prazo ?? null, mode, a.userId]);
      for (const aid of areas.ids) await tx.query(`insert into quick_win_areas (tenant_id, quick_win_id, area_id) values ($1, $2, $3)`, [a.tenantId, newId, aid]);
      const target = areas.rows.find(r => r.id === areas.ids[0])!;
      const done: string[] = [];
      const pendentes: string[] = [];
      for (const r of loaded.resources) {
        if (mode === 'duplicados') {
          // Cópia independente, na primeira área nova: muda sem afetar a origem.
          const copy = r.assistant_id ? await duplicateAssistant(tx, a, r, target) : await duplicateDocument(tx, app, a, r.document_id!, target);
          if ('documentId' in copy) copies.push({ documentId: copy.id, version: 1 });
          await tx.query(`insert into quick_win_resources (tenant_id, quick_win_id, assistant_id, document_id) values ($1, $2, $3, $4)`,
            [a.tenantId, newId, r.assistant_id ? copy.id : null, r.assistant_id ? null : copy.id]);
          done.push(`${r.assistant_id ? 'assistente' : 'documento'} ${copy.label}`);
          continue;
        }
        // Compartilhado: o mesmo assistente ou documento passa a servir as áreas novas,
        // depois da aprovação do key user da área dona (quem aprova e amplia aplica direto).
        if (!r.company_wide) {
          const kind = r.assistant_id ? 'assistente' as const : 'documento' as const;
          const target = { id: (r.assistant_id ?? r.document_id)!, area_id: r.area_id, company_wide: false, label: (r.assistant_slug ?? r.document_title ?? '') };
          const s = await requestShares(tx, a, kind, target, areas.rows.filter(x => x.id !== r.area_id), false, `ampliação do quick win ${loaded.q.title}`);
          for (const x of s.aplicados) done.push(`${kind} ${target.label} → ${x}`);
          for (const x of s.pendentes) pendentes.push(`${kind} ${target.label} → ${x}`);
        }
        await tx.query(`insert into quick_win_resources (tenant_id, quick_win_id, assistant_id, document_id) values ($1, $2, $3, $4)`, [a.tenantId, newId, r.assistant_id, r.document_id]);
      }
      if (done.length) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: mode === 'duplicados' ? 'recursos_duplicados_na_ampliacao' : 'recursos_compartilhados_na_ampliacao', target: `quick_win:${newId}`, details: { recursos: done } });
      for (const [n, i] of loaded.indicators.entries()) {
        await tx.query(`insert into quick_win_indicators (tenant_id, quick_win_id, key, label, unit, direction, auto, comparison, position) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [a.tenantId, newId, i.key, i.label, i.unit, i.direction, i.auto ?? null, i.comparison ?? 'valor', n]);
      }
      await setWindows(tx, newId, { unidadeVolume: loaded.q.volume_unit ?? '', ...p.data.janelas });
      await event(tx, a, { quickWinId: newId }, null, 'em_implantacao', `Ampliação de "${loaded.q.title}" (recursos ${mode}): ${p.data.nota}`, 'quick_win_ampliado');
      await event(tx, a, { quickWinId: id }, 'decisao', 'decisao', `Ampliado para "${p.data.titulo}".`, 'quick_win_ampliacao_criada');
      return { status: 201, body: { id: newId, origem: id, etapa: 'em_implantacao', recursos: mode, aviso: q.aviso, compartilhamentosPendentes: pendentes } };
    }).catch(e => { if (e instanceof PartError) return { status: 403, body: { error: 'sem_permissao', detalhe: e.message } }; throw e; });
    for (const c of out.status === 201 ? copies : []) await app.deps.queue.enqueue('kb:index', { tenantId: a.tenantId, documentId: c.documentId, version: c.version });
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

// Cópia independente de um assistente na área nova (slug e nome com a área).
type Resource = { assistant_slug: string | null; assistant_name: string | null; assistant_status: string | null; assistant_definition: unknown; template_slug: string | null; template_version: number | null };
async function duplicateAssistant(tx: Tx, a: AuthContext, r: Resource, area: { id: string; slug: string; name: string }) {
  const src = { slug: r.assistant_slug!, name: r.assistant_name!, status: r.assistant_status!, template_slug: r.template_slug, template_version: r.template_version, definition: r.assistant_definition };
  const base = `${src.slug}-${area.slug}`.slice(0, 55);
  let slug = base;
  for (let n = 2; (await tx.query(`select 1 from assistants where slug = $1`, [slug])).rows.length; n++) slug = `${base}-${n}`;
  const id = randomUUID();
  await tx.query(`insert into assistants (id, tenant_id, slug, name, area_id, status, template_slug, template_version, duplicated_from) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, a.tenantId, slug, `${src.name} (${area.name})`.slice(0, 120), area.id, src.status, src.template_slug, src.template_version, src.slug]);
  await tx.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, 1, $3, $4)`, [a.tenantId, id, src.definition, a.userId]);
  await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'assistente_criado', target: `assistente:${slug}@1`, details: { duplicadoDe: src.slug, motivo: 'ampliação de quick win' } });
  return { id, label: slug };
}

// Cópia independente de um documento da base na área nova (mesmo conteúdo, nova indexação).
async function duplicateDocument(tx: Tx, app: FastifyInstance, a: AuthContext, documentId: string, area: { id: string; slug: string; name: string }) {
  const src = (await tx.query(
    `select d.title, v.object_key, v.mime from kb_documents d join kb_document_versions v on v.document_id = d.id
     where d.id = $1 order by v.version desc limit 1`, [documentId])).rows[0];
  if (!src) throw new PartError('duplicar um documento exige acesso a ele: peça ao key user da área dona ou compartilhe');
  const bytes = await app.deps.objects.get(src.object_key);
  const id = randomUUID();
  await tx.query(`insert into kb_documents (id, tenant_id, area_id, title, created_by) values ($1, $2, $3, $4, $5)`, [id, a.tenantId, area.id, src.title, a.userId]);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const key = `${tenantPrefix(a.tenantId)}kb/${id}/v1/${sha}`;
  await app.deps.objects.put(key, bytes, src.mime);
  await tx.query(`insert into kb_document_versions (tenant_id, document_id, version, object_key, sha256, mime, bytes, created_by) values ($1, $2, 1, $3, $4, $5, $6, $7)`,
    [a.tenantId, id, key, sha, src.mime, bytes.length, a.userId]);
  await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'documento_enviado', target: `documento:${id}@1`, details: { sha256: sha, bytes: bytes.length, duplicadoDe: documentId } });
  return { id, documentId: id, label: src.title as string };
}

const portfolioFilter = z.object({
  area: z.string().max(60).optional(),
  status: z.enum(['registrada', 'avaliada', 'selecionada', 'roadmap', 'arquivada']).optional(),
  criterio: z.string().max(40).optional(),
  min: z.coerce.number().optional(),
});

// Portfólio de oportunidades (vista, relatório e exportação usam o mesmo).
export async function portfolio(tx: Tx, f: { area?: string; status?: string; criterio?: string; min?: number } = {}) {
  const rows = (await tx.query(
    `select o.*, a.slug as area_slug, a.name as area_name, u.email as created_by_email,
            (select q.id from quick_wins q where q.opportunity_id = o.id and q.origin_id is null order by q.created_at desc limit 1) as quick_win_id,
            (select q.stage from quick_wins q where q.opportunity_id = o.id and q.origin_id is null order by q.created_at desc limit 1) as quick_win_stage,
            (select e.note from quick_win_events e where e.opportunity_id = o.id order by e.id desc limit 1) as last_note
     from opportunities o join areas a on a.id = o.area_id left join users u on u.id = o.created_by
     where ($1::text is null or a.id = any(area_subtree((select id from areas where slug = $1))))
       and ($2::text is null or o.status = $2)
     order by o.score desc nulls last, o.created_at`, [f.area ?? null, f.status ?? null])).rows;
  return rows
    .filter(r => !f.criterio || f.min === undefined || (r.scores && Number(r.scores[f.criterio]) >= f.min))
    .map(r => ({
      id: r.id as string, titulo: r.title, area: r.area_name, areaId: r.area_id as string, areaSlug: r.area_slug, processo: r.process, problema: r.problem, executorAtual: r.current_executor, volume: r.volume,
      evidencia: r.evidence, evidenciaNota: r.evidence_note, status: r.status as string, situacao: STAGE_LABEL[r.status] ?? r.status, motivo: (r.status_reason ?? null) as string | null,
      notas: r.scores ?? null, nota: r.score === null ? null : Number(r.score),
      criteriosUsados: r.criteria_snapshot ?? null, quickWin: r.quick_win_id ? { id: r.quick_win_id, etapa: r.quick_win_stage } : null,
      registradaPor: r.created_by_email, registradaEm: r.created_at, ultimoRegistro: (r.last_note ?? null) as string | null,
    }));
}
export type PortfolioRow = Awaited<ReturnType<typeof portfolio>>[number];
