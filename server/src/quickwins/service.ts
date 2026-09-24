// Quick wins: leitura dos dados, resultados (antes × depois) e trajetória das
// ampliações. As rotas (routes.ts) e os relatórios (reports.ts) usam daqui.
import type { Tx } from '../db/pool.ts';
import { autoMetrics, indicatorResults, loadValues, monthly, type Indicator, type Period } from '../metrics/metrics.ts';

export const STAGES = ['selecionada', 'em_implantacao', 'em_medicao', 'decisao', 'encerrada'] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABEL: Record<string, string> = {
  identificada: 'identificada', avaliada: 'avaliada', selecionada: 'selecionada', em_implantacao: 'em implantação',
  em_medicao: 'em medição', decisao: 'decisão', encerrada: 'encerrada',
};
// Avanço permitido pela rota de etapa (a decisão tem rota própria).
export const NEXT_STAGE: Record<string, string[]> = {
  selecionada: ['em_implantacao'],
  em_implantacao: ['em_medicao'],
  em_medicao: [],                    // sai por decisão
  decisao: ['encerrada'],
  encerrada: [],
};

// Período padrão: do primeiro dia do mês, 3 meses atrás, até hoje.
export function period(q: { de?: string; ate?: string }): Period {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 3, 1);
  return { de: q.de ?? d.toISOString().slice(0, 10), ate: q.ate ?? today };
}

const day = (d: Date | string | null) => d ? new Date(d).toISOString().slice(0, 10) : null;

export async function loadQuickWin(tx: Tx, id: string) {
  const q = (await tx.query(
    `select q.*, o.title as opportunity_title, o.score as opportunity_score, u.email as decided_by_email
     from quick_wins q left join opportunities o on o.id = q.opportunity_id left join users u on u.id = q.decided_by where q.id = $1`, [id])).rows[0];
  if (!q) return null;
  const areas = (await tx.query(`select a.id, a.slug, a.name from quick_win_areas qa join areas a on a.id = qa.area_id where qa.quick_win_id = $1 order by a.name`, [id])).rows;
  const resources = (await tx.query(
    `select r.assistant_id, r.document_id, s.slug as assistant_slug, s.name as assistant_name, d.title as document_title
     from quick_win_resources r left join assistants s on s.id = r.assistant_id left join kb_documents d on d.id = r.document_id where r.quick_win_id = $1`, [id])).rows;
  const indicators = (await tx.query(`select key, label, unit, direction, auto from quick_win_indicators where quick_win_id = $1 order by position, key`, [id])).rows as Indicator[];
  const reviewers = (await tx.query(`select u.email from quick_win_reviewers r join users u on u.id = r.user_id where r.quick_win_id = $1 order by u.email`, [id])).rows.map(r => r.email as string);
  const events = (await tx.query(`select at, actor, stage_from, stage_to, note from quick_win_events where quick_win_id = $1 order by id`, [id])).rows;
  return { q, areas, resources, indicators, reviewers, events };
}
export type LoadedQuickWin = NonNullable<Awaited<ReturnType<typeof loadQuickWin>>>;

// Origem (para trás) e ampliações (para frente) do quick win: só título e áreas,
// também de áreas que a pessoa não enxerga (função quick_win_lineage).
export async function trajectory(tx: Tx, id: string) {
  const rows = (await tx.query(`select * from quick_win_lineage($1)`, [id])).rows;
  return {
    origem: rows.filter(r => r.direcao === 'origem').sort((x, y) => y.nivel - x.nivel).map(r => ({ id: r.id as string, titulo: r.title as string, areas: (r.areas ?? '') as string })),
    ampliacoes: rows.filter(r => r.direcao === 'ampliacao').sort((x, y) => x.nivel - y.nivel || String(x.title).localeCompare(String(y.title)))
      .map(r => ({ id: r.id as string, titulo: r.title as string, areas: (r.areas ?? '') as string, nivel: r.nivel as number })),
  };
}

// Resultados do quick win: indicadores antes × depois, medições automáticas
// das execuções dos assistentes vinculados (nas áreas do quick win), valores e decisão.
export async function buildResults(tx: Tx, loaded: LoadedQuickWin, p: Period) {
  const { q, areas, resources, indicators } = loaded;
  const assistantIds = resources.filter(r => r.assistant_id).map(r => r.assistant_id as string);
  const areaIds = areas.map(a => a.id as string);
  const values = await loadValues(tx, q.id);
  const auto = await autoMetrics(tx, assistantIds, p, areaIds.length ? areaIds : null);
  const indicadores = indicatorResults(indicators, values, auto, p);
  const semPontoDePartida = !indicadores.length || indicadores.every(i => !i.antes);
  return {
    quickWin: {
      id: q.id, titulo: q.title, objetivo: q.objective, etapa: q.stage, etapaNome: STAGE_LABEL[q.stage], responsavel: q.owner_email, prazo: day(q.deadline),
      areas: areas.map(a => a.name as string), oportunidade: q.opportunity_title ?? null, notaDaOportunidade: q.opportunity_score === null ? null : Number(q.opportunity_score),
      recursos: resources.map(r => r.assistant_id ? { tipo: 'assistente', nome: r.assistant_name, slug: r.assistant_slug } : { tipo: 'documento', nome: r.document_title, id: r.document_id }),
      decisao: q.decision ? { decisao: q.decision, justificativa: q.decision_note, por: q.decided_by_email, em: q.decided_at } : null,
    },
    periodo: p,
    semPontoDePartida,
    aviso: semPontoDePartida
      ? (indicadores.length ? 'Sem ponto de partida: nenhum indicador tem valor "antes" registrado. Não há comparação nem ganho calculado.' : 'Sem ponto de partida: o quick win não tem indicadores definidos.')
      : null,
    indicadores,
    execucoes: assistantIds.length ? auto : null,
    mensal: assistantIds.length ? await monthly(tx, assistantIds, p, areaIds.length ? areaIds : null) : [],
    valores: values,
    trajetoria: await trajectory(tx, q.id),
    historico: loaded.events,
  };
}
export type QuickWinResults = Awaited<ReturnType<typeof buildResults>>;

// Quick wins em andamento (não encerrados) do tenant inteiro, para a cota do plano.
export async function activeCount(tx: Tx) {
  return Number((await tx.query(`select quick_wins_active_count() as n`)).rows[0].n);
}
