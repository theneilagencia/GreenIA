// Medição de um quick win: antes × depois, com a origem de cada número.
//   antes   último valor "antes" registrado (medido ou informado)
//   depois  último valor "depois" registrado; se não houver e o indicador for
//           automático, a medição das execuções do período, só dos
//           assistentes vinculados e só nas áreas do quick win
// Sem valor "antes" não há comparação nem diferença acumulada: o painel mostra
// a lacuna ("sem ponto de partida"). Nada é estimado para preencher lacuna.
import type { Tx } from '../db/pool.ts';

// Medições automáticas que um indicador pode usar (vêm das execuções).
export const AUTO_METRICS = ['tempo_processamento', 'tempo_ate_revisao', 'aprovacao_sem_edicao', 'taxa_revisao', 'divergencias', 'pendencias', 'consumo', 'volume', 'usuarios_ativos'] as const;
export type AutoMetric = typeof AUTO_METRICS[number];

// comparison: como antes e depois são comparados. 'valor' compara como está
// (o indicador já é uma taxa, ex. minutos por nota); 'por_mes' divide o total
// pelos meses do período; 'por_item' divide o total pelo volume da janela.
export interface Indicator { key: string; label: string; unit: string; direction: 'menor_melhor' | 'maior_melhor'; auto?: string | null; comparison?: 'valor' | 'por_mes' | 'por_item' }

// Janelas do quick win: ponto de partida e medição, com datas e volume de itens do processo.
export interface Window { inicio: string | null; fim: string | null; volume: number | null; volumeInformado?: boolean }
export interface Windows { pontoDePartida: Window; medicao: Window; unidadeVolume: string }
export const NO_WINDOWS: Windows = { pontoDePartida: { inicio: null, fim: null, volume: null }, medicao: { inicio: null, fim: null, volume: null }, unidadeVolume: '' };

export interface Period { de: string; ate: string }     // datas (AAAA-MM-DD), inclusive

export interface MetricValue {
  id: string; indicator: string; phase: 'antes' | 'depois'; value: number; unit: string; origin: 'medido' | 'informado';
  periodStart: string | null; periodEnd: string | null; method: string | null; informedBy: string | null; notes: string | null;
  recordedBy: string; createdAt: string;
}

export interface Origem { tipo: 'medido' | 'informado' | 'automatico'; detalhe: string }

export interface IndicatorResult {
  key: string; label: string; unit: string; direction: 'menor_melhor' | 'maior_melhor'; auto: string | null;
  antes: { valor: number; origem: Origem; comparavel: number | null } | null;
  depois: { valor: number; origem: Origem; comparavel: number | null } | null;
  comparacaoPor: string;                        // em que unidade antes e depois foram comparados
  automatico: number | null;
  comparacao: { diferenca: number; percentual: number | null; melhorou: boolean; parcial: boolean } | null;
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

// Execuções de um quick win no período (função quick_win_runs: só números,
// para quem enxerga o quick win). Cada execução pertence a no máximo um quick win.
const RUNS = `quick_win_runs($1::uuid, $2::date, $3::date)`;

export async function autoMetrics(tx: Tx, quickWinId: string, p: Period) {
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
     from ${RUNS}`,
    [quickWinId, p.de, p.ate])).rows[0];
  const revisadas = r.aprovadas + r.editadas + r.rejeitadas;
  const concl = r.concluidas - r.erros;
  return {
    execucoes: r.execucoes, concluidas: r.concluidas, erros: r.erros, usuariosAtivos: r.usuarios,
    tempoProcessamentoS: r.proc_ms === null ? null : round(Number(r.proc_ms) / 1000),
    tempoAteRevisaoMin: r.ate_revisao_s === null ? null : round(Number(r.ate_revisao_s) / 60),
    revisao: { aprovadas: r.aprovadas, aprovadasComEdicao: r.editadas, rejeitadas: r.rejeitadas, aguardando: r.aguardando, revisadas },
    aprovacaoSemEdicaoPct: revisadas ? round(r.aprovadas / revisadas * 100, 1) : null,
    // Saídas que precisaram de mudança ou foram recusadas na revisão.
    taxaRevisaoPct: revisadas ? round((r.editadas + r.rejeitadas) / revisadas * 100, 1) : null,
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
    case 'taxa_revisao': return a.taxaRevisaoPct === null ? null : { valor: a.taxaRevisaoPct, unidade: '%' };
    case 'divergencias': return a.divergenciasPorExecucao === null ? null : { valor: a.divergenciasPorExecucao, unidade: 'por execução' };
    case 'pendencias': return a.pendenciasPorExecucao === null ? null : { valor: a.pendenciasPorExecucao, unidade: 'por execução' };
    case 'consumo': return a.consumo.custoPorExecucaoBrl === null ? null : { valor: a.consumo.custoPorExecucaoBrl, unidade: 'R$ por execução' };
    case 'volume': return { valor: a.execucoes, unidade: 'execuções' };
    case 'usuarios_ativos': return { valor: a.usuariosAtivos, unidade: 'pessoas' };
  }
  return null;
}

const DAY = 86400000;
export const daysOf = (inicio: string | null, fim: string | null) => inicio && fim ? Math.round((Date.parse(fim) - Date.parse(inicio)) / DAY) + 1 : null;

export function indicatorResults(indicators: Indicator[], values: MetricValue[], auto: AutoMetrics, p: Period, win: Windows = NO_WINDOWS): IndicatorResult[] {
  const latest = (key: string, phase: 'antes' | 'depois') => values.filter(v => v.indicator === key && v.phase === phase).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  return indicators.map(ind => {
    const a = latest(ind.key, 'antes');
    const d = latest(ind.key, 'depois');
    const av = ind.auto ? autoValue(ind.auto, auto, ind.unit) : null;
    const mode = ind.comparison ?? 'valor';
    // Valor na unidade de comparação: por mês (meses do período do valor, ou da janela) ou por item (volume da janela).
    let falta: string | null = null;
    const norm = (valor: number, side: 'pontoDePartida' | 'medicao', ini: string | null, fim: string | null): number | null => {
      if (mode === 'valor') return valor;
      const w = win[side];
      if (mode === 'por_mes') {
        const dias = daysOf(ini ?? w.inicio, fim ?? w.fim);
        if (!dias) { falta = 'sem período para comparar por mês'; return null; }
        return round(valor / (dias / 30.44));
      }
      if (!w.volume) { falta = `sem volume na janela ${side === 'pontoDePartida' ? 'do ponto de partida' : 'de medição'} para comparar por item`; return null; }
      return round(valor / w.volume, 4);
    };
    const antes = a ? { valor: Number(a.value), origem: origemDe(a), comparavel: norm(Number(a.value), 'pontoDePartida', a.periodStart, a.periodEnd) } : null;
    const depois = d ? { valor: Number(d.value), origem: origemDe(d), comparavel: norm(Number(d.value), 'medicao', d.periodStart, d.periodEnd) }
      : av ? { valor: av.valor, origem: { tipo: 'automatico' as const, detalhe: `média das execuções de ${p.de} a ${p.ate} (${auto.concluidas} concluídas)${ind.auto === 'tempo_processamento' ? '; mede o processamento, não o tempo de revisão humana' : ''}` },
               comparavel: norm(av.valor, 'medicao', p.de, p.ate) }
        : null;
    const comparacaoPor = mode === 'por_mes' ? `${ind.unit || 'valor'} por mês` : mode === 'por_item' ? `${ind.unit || 'valor'} por ${win.unidadeVolume || 'item'}` : (ind.unit || 'valor');
    let comparacao: IndicatorResult['comparacao'] = null;
    let acumulado: IndicatorResult['acumuladoNoPeriodo'] = null;
    // Tempo medido pela plataforma é só o processamento: comparado ao tempo do
    // processo manual, mostra a comparação como parcial e não vira ganho acumulado.
    const f = toSeconds(ind.unit);
    const parcial = !!f && depois?.origem.tipo === 'automatico';
    if (antes && depois && antes.comparavel !== null && depois.comparavel !== null) {
      const diferenca = round(depois.comparavel - antes.comparavel, mode === 'por_item' ? 4 : 2);
      comparacao = { diferenca, percentual: antes.comparavel !== 0 ? round(diferenca / antes.comparavel * 100, 1) : null, melhorou: ind.direction === 'menor_melhor' ? diferenca < 0 : diferenca > 0, parcial };
      // Diferença acumulada só para tempo por execução, com os dois lados medidos ou informados por pessoas.
      const volume = win.medicao.volume ?? (auto.concluidas - auto.erros);
      if (mode === 'valor' && f && !parcial && ind.direction === 'menor_melhor' && volume > 0) {
        const horas = round((antes.valor - depois.valor) * f * volume / 3600, 1);
        acumulado = { valor: horas, unidade: 'h', calculo: `(${antes.valor} − ${depois.valor}) ${ind.unit} × ${volume} ${win.medicao.volumeInformado ? (win.unidadeVolume || 'itens') + ' na janela de medição' : 'execuções concluídas no período'}` };
      }
    }
    return {
      key: ind.key, label: ind.label, unit: ind.unit, direction: ind.direction, auto: ind.auto ?? null,
      antes, depois, comparacaoPor, automatico: av?.valor ?? null, comparacao, acumuladoNoPeriodo: acumulado,
      lacuna: !antes ? 'sem ponto de partida' : !depois ? 'sem medição depois' : falta ? falta : parcial ? 'comparação parcial: o automático mede só o processamento; registre o tempo "depois" medido com a revisão' : null,
    };
  });
}

export async function loadValues(tx: Tx, quickWinId: string): Promise<MetricValue[]> {
  return (await tx.query(
    `select v.*, u.email as recorded_email from quick_win_values v left join users u on u.id = v.recorded_by
     where v.quick_win_id = $1 order by v.created_at`, [quickWinId])).rows.map(r => ({
    id: r.id, indicator: r.indicator, phase: r.phase, value: Number(r.value), unit: r.unit, origin: r.origin,
    periodStart: fmtDay(r.period_start), periodEnd: fmtDay(r.period_end), method: r.method, informedBy: r.informed_by, notes: r.notes,
    recordedBy: r.recorded_email ?? '', createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function monthly(tx: Tx, quickWinId: string, p: Period) {
  return (await tx.query(
    `select to_char(date_trunc('month', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
            count(*)::int as execucoes, count(distinct user_id)::int as usuarios,
            count(*) filter (where status = 'aprovado')::int as aprovadas,
            count(*) filter (where status = 'aprovado_com_edicao')::int as aprovadas_com_edicao,
            count(*) filter (where status = 'rejeitado')::int as rejeitadas,
            coalesce(sum(cost_brl), 0)::float as custo_brl
     from ${RUNS}
     group by 1 order by 1`, [quickWinId, p.de, p.ate])).rows;
}
