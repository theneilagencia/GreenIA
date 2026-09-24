// Resultados por assistente: antes × depois, com a origem de cada número.
//   antes   último valor "antes" registrado (medido ou informado)
//   depois  último valor "depois" registrado; se não houver e o indicador for
//           automático, a medição das execuções do período
// Sem valor "antes" não há comparação nem diferença acumulada: o painel mostra
// a lacuna ("sem ponto de partida"). Nada é estimado para preencher lacuna.
import type { Tx } from '../db/pool.ts';
import type { AssistantDefinition } from '../assistants/schema.ts';

export interface Period { de: string; ate: string }     // datas (AAAA-MM-DD), inclusive

export interface MetricValue {
  id: string; indicator: string; phase: 'antes' | 'depois'; value: number; unit: string; origin: 'medido' | 'informado';
  periodStart: string | null; periodEnd: string | null; method: string | null; informedBy: string | null; notes: string | null;
  recordedBy: string; createdAt: string;
}

export interface Origem { tipo: 'medido' | 'informado' | 'automatico'; detalhe: string }

export interface IndicatorResult {
  key: string; label: string; unit: string; direction: 'menor_melhor' | 'maior_melhor'; auto: string | null;
  antes: { valor: number; origem: Origem } | null;
  depois: { valor: number; origem: Origem } | null;
  automatico: number | null;
  comparacao: { diferenca: number; percentual: number | null; melhorou: boolean } | null;
  acumuladoNoPeriodo: { valor: number; unidade: string; calculo: string } | null;
  lacuna: string | null;
}

const TIME_UNITS: Record<string, number> = { s: 1, seg: 1, segundo: 1, segundos: 1, min: 60, minuto: 60, minutos: 60, h: 3600, hora: 3600, horas: 3600 };
const toSeconds = (unit: string) => TIME_UNITS[unit.trim().toLowerCase()];
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const fmtDay = (d: string | Date | null) => d ? (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null;

function origemDe(v: MetricValue): Origem {
  return v.origin === 'medido'
    ? { tipo: 'medido', detalhe: `medido de ${v.periodStart} a ${v.periodEnd}; método: ${v.method}` }
    : { tipo: 'informado', detalhe: `informado por ${v.informedBy} em ${v.createdAt.slice(0, 10)}` };
}

// Medições automáticas das execuções do período (todas as versões do assistente).
export async function autoMetrics(tx: Tx, assistantId: string, p: Period) {
  const r = (await tx.query(
    `select count(*)::int as execucoes,
            count(*) filter (where status <> 'processando')::int as concluidas,
            count(*) filter (where status = 'erro')::int as erros,
            count(distinct user_id)::int as usuarios,
            avg(processing_ms) filter (where processing_ms is not null) as proc_ms,
            avg(extract(epoch from reviewed_at - finished_at)) filter (where reviewed_at is not null) as ate_revisao_s,
            count(*) filter (where status = 'aprovado')::int as aprovadas,
            count(*) filter (where status = 'aprovado_com_edicao')::int as editadas,
            count(*) filter (where status = 'rejeitado')::int as rejeitadas,
            count(*) filter (where status = 'rascunho')::int as aguardando,
            avg(divergences) filter (where status <> 'processando' and status <> 'erro') as div,
            avg(pendings) filter (where status <> 'processando' and status <> 'erro') as pend,
            coalesce(sum(divergences), 0)::int as div_total, coalesce(sum(pendings), 0)::int as pend_total,
            coalesce(sum(cost_brl), 0) as custo, coalesce(sum(pages), 0)::int as paginas,
            coalesce(sum(input_tokens), 0)::bigint as tin, coalesce(sum(output_tokens), 0)::bigint as tout,
            array_agg(distinct assistant_version order by assistant_version) as versoes
     from runs where assistant_id = $1 and created_at >= $2::date and created_at < $3::date + 1`,
    [assistantId, p.de, p.ate])).rows[0];
  const revisadas = r.aprovadas + r.editadas + r.rejeitadas;
  const concl = r.concluidas - r.erros;
  return {
    execucoes: r.execucoes, concluidas: r.concluidas, erros: r.erros, usuariosAtivos: r.usuarios,
    tempoProcessamentoS: r.proc_ms === null ? null : round(Number(r.proc_ms) / 1000),
    tempoAteRevisaoMin: r.ate_revisao_s === null ? null : round(Number(r.ate_revisao_s) / 60),
    revisao: { aprovadas: r.aprovadas, aprovadasComEdicao: r.editadas, rejeitadas: r.rejeitadas, aguardando: r.aguardando, revisadas },
    aprovacaoSemEdicaoPct: revisadas ? round(r.aprovadas / revisadas * 100, 1) : null,
    divergenciasPorExecucao: r.div === null ? null : round(Number(r.div)), divergenciasTotal: r.div_total,
    pendenciasPorExecucao: r.pend === null ? null : round(Number(r.pend)), pendenciasTotal: r.pend_total,
    consumo: { custoBrl: round(Number(r.custo), 4), custoPorExecucaoBrl: concl > 0 ? round(Number(r.custo) / concl, 4) : null, paginas: r.paginas, tokensEntrada: Number(r.tin), tokensSaida: Number(r.tout) },
    versoes: (r.versoes || []).filter((v: number | null) => v !== null),
  };
}
export type AutoMetrics = Awaited<ReturnType<typeof autoMetrics>>;

// Valor automático de um indicador, na unidade do indicador quando for tempo.
function autoValue(auto: string, a: AutoMetrics, unit: string): { valor: number; unidade: string } | null {
  const time = (seconds: number | null) => {
    if (seconds === null) return null;
    const f = toSeconds(unit);
    return f ? { valor: round(seconds / f), unidade: unit } : { valor: round(seconds), unidade: 's' };
  };
  switch (auto) {
    case 'tempo_processamento': return time(a.tempoProcessamentoS);
    case 'tempo_ate_revisao': return time(a.tempoAteRevisaoMin === null ? null : a.tempoAteRevisaoMin * 60);
    case 'aprovacao_sem_edicao': return a.aprovacaoSemEdicaoPct === null ? null : { valor: a.aprovacaoSemEdicaoPct, unidade: '%' };
    case 'divergencias': return a.divergenciasPorExecucao === null ? null : { valor: a.divergenciasPorExecucao, unidade: 'por execução' };
    case 'pendencias': return a.pendenciasPorExecucao === null ? null : { valor: a.pendenciasPorExecucao, unidade: 'por execução' };
    case 'consumo': return a.consumo.custoPorExecucaoBrl === null ? null : { valor: a.consumo.custoPorExecucaoBrl, unidade: 'R$ por execução' };
    case 'volume': return { valor: a.execucoes, unidade: 'execuções' };
    case 'usuarios_ativos': return { valor: a.usuariosAtivos, unidade: 'pessoas' };
  }
  return null;
}

export function indicatorResults(def: AssistantDefinition, values: MetricValue[], auto: AutoMetrics, p: Period): IndicatorResult[] {
  const latest = (key: string, phase: 'antes' | 'depois') => values.filter(v => v.indicator === key && v.phase === phase).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  return def.metrics.indicators.map(ind => {
    const a = latest(ind.key, 'antes');
    const d = latest(ind.key, 'depois');
    const av = ind.auto ? autoValue(ind.auto, auto, ind.unit) : null;
    const antes = a ? { valor: Number(a.value), origem: origemDe(a) } : null;
    const depois = d ? { valor: Number(d.value), origem: origemDe(d) }
      : av ? { valor: av.valor, origem: { tipo: 'automatico' as const, detalhe: `média das execuções de ${p.de} a ${p.ate} (${auto.concluidas} concluídas)${ind.auto === 'tempo_processamento' ? '; mede o processamento, não o tempo de revisão humana' : ''}` } }
        : null;
    let comparacao: IndicatorResult['comparacao'] = null;
    let acumulado: IndicatorResult['acumuladoNoPeriodo'] = null;
    if (antes && depois) {
      const diferenca = round(depois.valor - antes.valor);
      comparacao = { diferenca, percentual: antes.valor !== 0 ? round(diferenca / antes.valor * 100, 1) : null, melhorou: ind.direction === 'menor_melhor' ? diferenca < 0 : diferenca > 0 };
      // Diferença acumulada só para tempo por execução, com os dois lados medidos ou informados.
      const f = toSeconds(ind.unit);
      const volume = auto.concluidas - auto.erros;
      if (f && ind.direction === 'menor_melhor' && volume > 0) {
        const horas = round((antes.valor - depois.valor) * f * volume / 3600, 1);
        acumulado = { valor: horas, unidade: 'h', calculo: `(${antes.valor} − ${depois.valor}) ${ind.unit} × ${volume} execuções concluídas no período` };
      }
    }
    return {
      key: ind.key, label: ind.label, unit: ind.unit, direction: ind.direction, auto: ind.auto ?? null,
      antes, depois, automatico: av?.valor ?? null, comparacao, acumuladoNoPeriodo: acumulado,
      lacuna: !antes ? 'sem ponto de partida' : !depois ? 'sem medição depois' : null,
    };
  });
}

export async function loadValues(tx: Tx, assistantId: string): Promise<MetricValue[]> {
  return (await tx.query(
    `select v.*, u.email as recorded_email from metric_values v left join users u on u.id = v.recorded_by
     where v.assistant_id = $1 order by v.created_at`, [assistantId])).rows.map(r => ({
    id: r.id, indicator: r.indicator, phase: r.phase, value: Number(r.value), unit: r.unit, origin: r.origin,
    periodStart: fmtDay(r.period_start), periodEnd: fmtDay(r.period_end), method: r.method, informedBy: r.informed_by, notes: r.notes,
    recordedBy: r.recorded_email ?? '', createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function monthly(tx: Tx, assistantId: string, p: Period) {
  return (await tx.query(
    `select to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
            count(*)::int as execucoes, count(distinct user_id)::int as usuarios,
            count(*) filter (where status = 'aprovado')::int as aprovadas,
            count(*) filter (where status = 'aprovado_com_edicao')::int as aprovadas_com_edicao,
            count(*) filter (where status = 'rejeitado')::int as rejeitadas,
            coalesce(sum(cost_brl), 0)::float as custo_brl
     from runs where assistant_id = $1 and created_at >= $2::date and created_at < $3::date + 1
     group by 1 order by 1`, [assistantId, p.de, p.ate])).rows;
}

export async function decisions(tx: Tx, assistantId: string) {
  return (await tx.query(
    `select d.decision, d.decided_on, d.responsible, d.justification, d.created_at, u.email as recorded_by
     from assistant_decisions d left join users u on u.id = d.recorded_by where d.assistant_id = $1 order by d.created_at desc`, [assistantId])).rows
    .map(r => ({ decisao: r.decision, data: fmtDay(r.decided_on), responsavel: r.responsible, justificativa: r.justification, registradoPor: r.recorded_by, registradoEm: new Date(r.created_at).toISOString() }));
}
