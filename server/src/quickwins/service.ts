// Quick wins: leitura dos dados, resultados (antes × depois) e trajetória das
// ampliações. As rotas (routes.ts) e os relatórios (reports.ts) usam daqui.
import type { Tx } from '../db/pool.ts';
import { autoMetrics, daysOf, indicatorResults, loadValues, monthly, type Indicator, type Period, type Windows } from '../metrics/metrics.ts';

export const STAGES = ['em_implantacao', 'em_medicao', 'decisao', 'encerrada', 'roadmap'] as const;
export type Stage = typeof STAGES[number];
export const STAGE_LABEL: Record<string, string> = {
  registrada: 'registrada', avaliada: 'avaliada', selecionada: 'selecionada', em_implantacao: 'em implantação',
  em_medicao: 'em medição', decisao: 'decisão', encerrada: 'encerrado', roadmap: 'enviado ao roadmap', arquivada: 'arquivada',
};
// Avanço permitido pela rota de etapa (a decisão tem rota própria).
export const NEXT_STAGE: Record<string, string[]> = {
  em_implantacao: ['em_medicao'],    // ou volta ao roadmap (rota própria)
  em_medicao: [],                    // sai por decisão
  decisao: ['encerrada'],
  encerrada: [],
  roadmap: [],
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
  const resources = (await tx.query(`select * from quick_win_resource_info($1)`, [id])).rows as {
    assistant_id: string | null; document_id: string | null; assistant_slug: string | null; assistant_name: string | null; assistant_status: string | null;
    assistant_definition: unknown; template_slug: string | null; template_version: number | null; document_title: string | null; area_id: string | null; company_wide: boolean | null }[];
  const indicators = (await tx.query(`select key, label, unit, direction, auto, comparison from quick_win_indicators where quick_win_id = $1 order by position, key`, [id])).rows as Indicator[];
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
export function windowsOf(q: Record<string, unknown>): Windows {
  const num = (v: unknown) => v === null || v === undefined ? null : Number(v);
  return {
    pontoDePartida: { inicio: day(q.baseline_start as Date | null), fim: day(q.baseline_end as Date | null), volume: num(q.baseline_volume) },
    medicao: { inicio: day(q.measure_start as Date | null), fim: day(q.measure_end as Date | null), volume: num(q.measure_volume) },
    unidadeVolume: (q.volume_unit as string) || '',
  };
}

// Janelas comparáveis? Avisa quando falta data, quando a duração ou o volume
// são muito diferentes (mais de 2 vezes) e quando as janelas se sobrepõem.
export function windowWarnings(w: Windows): string[] {
  const out: string[] = [];
  const b = daysOf(w.pontoDePartida.inicio, w.pontoDePartida.fim);
  const m = daysOf(w.medicao.inicio, w.medicao.fim);
  if (!b) out.push('Janela do ponto de partida sem datas: a comparação não tem período de referência.');
  if (!m) out.push('Janela de medição sem datas: as medições automáticas usam o período da consulta.');
  if (b && m && Math.max(b, m) / Math.min(b, m) > 2) out.push(`Janelas com duração muito diferente: ${b} dias no ponto de partida e ${m} dias na medição. Compare por mês ou por item.`);
  const vb = w.pontoDePartida.volume, vm = w.medicao.volume;
  const u = w.unidadeVolume || 'itens';
  if (vb && vm && Math.max(vb, vm) / Math.min(vb, vm) > 2) out.push(`Volume muito diferente: ${vb} ${u} no ponto de partida e ${vm} ${u} na medição. Compare por item.`);
  if (w.pontoDePartida.fim && w.medicao.inicio && w.medicao.inicio <= w.pontoDePartida.fim) out.push('As janelas se sobrepõem: a medição começa antes do fim do ponto de partida.');
  return out;
}

export async function buildResults(tx: Tx, loaded: LoadedQuickWin, query: Period) {
  const { q, areas, resources, indicators } = loaded;
  const hasAssistants = resources.some(r => r.assistant_id);
  const values = await loadValues(tx, q.id);
  const w = windowsOf(q);
  // A janela de medição, com datas, define o período das medições automáticas.
  const p: Period = w.medicao.inicio && w.medicao.fim ? { de: w.medicao.inicio, ate: w.medicao.fim } : query;
  const auto = await autoMetrics(tx, q.id, p);
  // Volume da medição: o informado, senão as execuções concluídas do quick win na janela.
  const volMedicao = w.medicao.volume ?? (hasAssistants ? auto.concluidas - auto.erros : null);
  const win: Windows = { ...w, medicao: { ...w.medicao, volume: volMedicao || null, volumeInformado: w.medicao.volume !== null } };
  const indicadores = indicatorResults(indicators, values, auto, p, win);
  const semPontoDePartida = !indicadores.length || indicadores.every(i => !i.antes);
  return {
    quickWin: {
      id: q.id, titulo: q.title, objetivo: q.objective, etapa: q.stage, etapaNome: STAGE_LABEL[q.stage], responsavel: q.owner_email, prazo: day(q.deadline),
      areas: areas.map(a => a.name as string), oportunidade: q.opportunity_title ?? null, notaDaOportunidade: q.opportunity_score === null ? null : Number(q.opportunity_score),
      recursos: resources.map(r => r.assistant_id ? { tipo: 'assistente', nome: r.assistant_name, slug: r.assistant_slug } : { tipo: 'documento', nome: r.document_title, id: r.document_id }),
      decisao: q.decision ? { decisao: q.decision, justificativa: q.decision_note, por: q.decided_by_email, em: q.decided_at } : null,
    },
    periodo: p,
    janelas: {
      pontoDePartida: { ...win.pontoDePartida, dias: daysOf(win.pontoDePartida.inicio, win.pontoDePartida.fim) },
      medicao: { ...win.medicao, dias: daysOf(win.medicao.inicio, win.medicao.fim), volumeOrigem: w.medicao.volume !== null ? 'informado' : volMedicao ? 'execucoes' : null },
      unidadeVolume: win.unidadeVolume,
      avisos: windowWarnings(win),
    },
    semPontoDePartida,
    aviso: semPontoDePartida
      ? (indicadores.length ? 'Sem ponto de partida: nenhum indicador tem valor "antes" registrado. Não há comparação nem ganho calculado.' : 'Sem ponto de partida: o quick win não tem indicadores definidos.')
      : null,
    indicadores,
    execucoes: hasAssistants ? auto : null,
    mensal: hasAssistants ? await monthly(tx, q.id, p) : [],
    valores: values,
    trajetoria: await trajectory(tx, q.id),
    historico: loaded.events,
    // Mudanças de indicador, ponto de partida ou janela depois de iniciada a medição.
    alteracoes: (await tx.query(`select at, actor, stage, what, reason from quick_win_changes where quick_win_id = $1 order by id`, [q.id])).rows
      .map(r => ({ em: new Date(r.at).toISOString(), por: r.actor as string, etapa: STAGE_LABEL[r.stage] ?? r.stage, oQue: r.what as string, motivo: r.reason as string })),
  };
}
export type QuickWinResults = Awaited<ReturnType<typeof buildResults>>;

// Quick wins em andamento (não encerrados) do tenant inteiro, para a cota do plano.
export async function activeCount(tx: Tx) {
  return Number((await tx.query(`select quick_wins_active_count() as n`)).rows[0].n);
}
