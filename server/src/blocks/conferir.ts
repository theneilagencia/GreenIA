// Bloco 3: conferência. Compara dois conjuntos de dados (ex.: itens da NF-e ×
// pedido em planilha, nota × contrato, exportação do ERP × documento) pelas
// regras declaradas no assistente. A comparação é feita em código, não pelo
// modelo. Cada divergência traz os dois valores e a origem de cada um.
// Conjunto vazio ou não encontrado nunca vira "sem divergências": a conferência
// fica "não realizada: falta [fonte]" e vai para revisão.
import { conferirParams, type DatasetRef, type PipelineStep } from './params.ts';
import type { ReviewFlag, RunContext, Section } from './types.ts';
import type { Extracao } from './extrair.ts';
import { getPath, globMatch, isoDay, normKey, parseDateBr, parseNumberBr } from './values.ts';
import { normPt } from '../util/text.ts';

export interface Registro {
  dados: Record<string, unknown>;
  origem: string;
  origemCampo?: (campo: string) => string | null;   // origem de um campo específico (campos extraídos)
}

export interface Divergencia {
  chave: string;
  campo: string;
  regra: string;
  esquerda: { valor: unknown; origem: string } | null;
  direita: { valor: unknown; origem: string } | null;
  motivo: string;
}

export interface ResultadoConferencia {
  // Sem os dados de um dos lados (ex.: só o DANFE, sem o XML), a conferência não
  // é feita: um único status, sem listar cada item como "sem par".
  situacao: 'realizada' | 'nao_realizada';
  motivo?: string;
  rotulos: { esquerda: string; direita: string };
  resumo: { esquerda: number; direita: number; pares: number; divergencias: number; conferidos: number };
  divergencias: Divergencia[];
}

// Registros de um conjunto, com a origem de cada um.
export function resolveDataset(ctx: RunContext, ref: DatasetRef): Registro[] {
  if (ref.de === 'leitor') {
    // Dados de um leitor especializado (ex.: itens do XML de NF-e).
    return ctx.docs.filter(d => d.dados?.[ref.leitor!] !== undefined && globMatch(ref.arquivo, d.name)).flatMap(d => {
      const v = getPath(d.dados![ref.leitor!], ref.caminho ?? '');
      if (Array.isArray(v)) return v.map((item, i) => ({ dados: item as Record<string, unknown>, origem: `${d.name} › item ${(item as { n?: number }).n ?? i + 1}` }));
      return v && typeof v === 'object' ? [{ dados: v as Record<string, unknown>, origem: `${d.name}${ref.caminho ? ' › ' + ref.caminho : ''}` }] : [];
    });
  }
  if (ref.de === 'importacao') {
    // Registros normalizados pelo mapeamento de importação, com a origem de cada campo.
    return ctx.docs.filter(d => d.importado?.[ref.conjunto!] && globMatch(ref.arquivo, d.name)).flatMap(d => {
      const regs = d.importado![ref.conjunto!].registros;
      if (ref.registro === 'cada' || !regs.length) return regs.map(r => ({ dados: r.dados as Record<string, unknown>, origem: r.origem, origemCampo: (c: string) => r.origens[c] ?? null }));
      const [p] = regs;
      const dados: Record<string, unknown> = { ...p.dados };
      for (const s of ref.somar) dados[s.em] = Math.round(regs.reduce((n, r) => n + (parseNumberBr(r.dados[s.campo]) ?? 0), 0) * 1e6) / 1e6;
      const somas = new Set(ref.somar.map(s => s.em));
      return [{ dados, origem: `${d.name}`, origemCampo: (c: string) => somas.has(c) ? `${d.name} › soma de ${regs.length} linhas` : p.origens[c] ?? null }];
    });
  }
  if (ref.de === 'tabela') {
    return ctx.docs.filter(d => d.sheets?.length && globMatch(ref.arquivo, d.name)).flatMap(d => {
      const sheet = ref.planilha ? d.sheets!.find(s => normPt(s.name) === normPt(ref.planilha!)) : d.sheets!.find(s => s.rows.length);
      if (!sheet) return [];
      if (ref.orientacao === 'chave_valor') {
        // Duas colunas (Campo | Valor), uma informação por linha: vira um registro,
        // com a linha de cada campo como origem.
        const [k, v] = sheet.header;
        const dados: Record<string, unknown> = { [k]: v };                        // a linha de cabeçalho também é um par
        const linhas: Record<string, number> = { [k]: sheet.rowNumbers[0] - 1 };
        sheet.rows.forEach((r, i) => { const key = String(r[k] ?? '').trim(); if (key) { dados[key] = r[v]; linhas[key] = sheet.rowNumbers[i]; } });
        return [{ dados, origem: `${d.name} › ${sheet.name}`, origemCampo: (c: string) => {
          const hit = Object.keys(linhas).find(x => x === c) ?? Object.keys(linhas).find(x => normPt(x) === normPt(c));
          return hit ? `${d.name} › ${sheet.name} › linha ${linhas[hit]}` : null;
        } }];
      }
      return sheet.rows.map((r, i) => ({ dados: r as Record<string, unknown>, origem: `${d.name} › ${sheet.name} › linha ${sheet.rowNumbers[i]}` }));
    });
  }
  const sec = ctx.sections.find(s => s.id === ref.bloco && s.kind === 'campos') ?? (ref.bloco ? undefined : ctx.sections.find(s => s.kind === 'campos'));
  if (!sec) return [];
  return (sec.data as Extracao[]).filter(e => e.campos && globMatch(ref.arquivo, e.arquivo)).flatMap(e => {
    const v = getPath(e.campos, ref.caminho ?? '');
    const base = ref.caminho ?? '';
    // Origem de um campo: a página indicada na extração para aquele campo.
    const src = (campo: string) => {
      const full = [base, campo].filter(Boolean).join('.');
      const o = e.origem.find(x => x.confere !== false && x.pagina && (x.campo === full || x.campo.replace(/\[(\d+)\]/g, '.$1') === full || x.campo.startsWith(full + '.') || x.campo.startsWith(full + '[')));
      return o ? `${e.arquivo} › p. ${o.pagina}` : null;
    };
    if (Array.isArray(v)) return v.map((item, i) => ({ dados: item as Record<string, unknown>, origem: `${e.arquivo} › ${base} › item ${i + 1}`, origemCampo: (c: string) => src(`${i}.${c}`) }));
    return v && typeof v === 'object' ? [{ dados: v as Record<string, unknown>, origem: e.arquivo + (base ? ` › ${base}` : ''), origemCampo: src }] : [];
  });
}

// Nome da fonte que faltou: a do leitor especializado (ex.: o XML que ele lê) ou o rótulo do lado.
function fonteDe(ctx: RunContext, ref: DatasetRef, rotulo: string): string {
  if (ref.de === 'leitor') {
    const r = (ctx.env.readers ?? []).find(x => x.id === ref.leitor);
    return r ? (r.kind?.label ?? r.label) : rotulo;
  }
  return rotulo;
}

type Regra = ReturnType<typeof conferirParams.parse>['regras'][number];

// Compara dois valores por uma regra. null = confere; texto = motivo da divergência.
export function compare(r: Regra, a: unknown, b: unknown): string | null {
  const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
  if (empty(a) && empty(b)) return null;
  if (empty(a) || empty(b)) return `valor ausente ${empty(a) ? 'à esquerda' : 'à direita'}`;
  switch (r.tipo) {
    case 'numero': {
      const x = parseNumberBr(a), y = parseNumberBr(b);
      if (x === null || y === null) return 'valor não numérico';
      const diff = Math.abs(x - y);
      if (diff < 1e-9) return null;
      const tol = r.tolerancia;
      if (tol?.absoluta !== undefined && diff <= tol.absoluta + 1e-9) return null;
      if (tol?.percentual !== undefined && diff <= Math.abs(y) * tol.percentual / 100 + 1e-9) return null;
      const pct = y !== 0 ? ` (${((x - y) / Math.abs(y) * 100).toFixed(2).replace('.', ',')}%)` : '';
      return `diferença de ${(x - y).toFixed(4).replace(/\.?0+$/, '').replace('.', ',')}${pct}${tol ? ', acima da tolerância' : ''}`;
    }
    case 'data': {
      // O prazo conta a partir da data de referência (esquerda, por padrão).
      const [x, y] = r.referencia === 'direita' ? [parseDateBr(b), parseDateBr(a)] : [parseDateBr(a), parseDateBr(b)];
      if (!x || !y) return 'data inválida';
      const days = Math.round((y.getTime() - x.getTime()) / 86400000);
      if (r.prazoDias === undefined) return days === 0 ? null : `datas diferentes (${isoDay(x)} × ${isoDay(y)})`;
      if (days < 0) return `${-days} dia(s) antes da data de referência`;
      return days <= r.prazoDias ? null : `${days} dias, acima do prazo de ${r.prazoDias}`;
    }
    case 'texto':
      return normPt(String(a)) === normPt(String(b)) ? null : 'textos diferentes';
    default: {
      const x = parseNumberBr(a), y = parseNumberBr(b);
      if (x !== null && y !== null && typeof a !== 'string' && typeof b !== 'string') return x === y ? null : 'valores diferentes';
      return String(a).trim() === String(b).trim() ? null : 'valores diferentes';
    }
  }
}

export function conferir(ctx: RunContext, params: ReturnType<typeof conferirParams.parse>) {
  const left = resolveDataset(ctx, params.esquerda);
  const right = resolveDataset(ctx, params.direita);
  const flags: ReviewFlag[] = [];
  const { rotulos } = params;
  const faltam = [...(!left.length ? [fonteDe(ctx, params.esquerda, rotulos.esquerda)] : []), ...(!right.length ? [fonteDe(ctx, params.direita, rotulos.direita)] : [])];
  if (faltam.length) {
    const motivo = `conferência não realizada: falta ${faltam.join(' e ')}`;
    flags.push({ reason: motivo });
    return { result: { situacao: 'nao_realizada', motivo, rotulos, resumo: { esquerda: left.length, direita: right.length, pares: 0, divergencias: 0, conferidos: 0 }, divergencias: [] } as ResultadoConferencia, flags };
  }

  const pairs: [Registro | null, Registro | null, string][] = [];
  if (params.chave) {
    const index = new Map<string, Registro[]>();
    for (const r of right) {
      const k = normKey(getPath(r.dados, params.chave.direita));
      index.set(k, [...(index.get(k) || []), r]);
    }
    const used = new Set<Registro>();
    for (const l of left) {
      const raw = getPath(l.dados, params.chave.esquerda);
      const k = normKey(raw);
      const candidates = (index.get(k) || []).filter(r => !used.has(r));
      if ((index.get(k) || []).length > 1) flags.push({ reason: `chave ${String(raw)} repetida em ${rotulos.direita}`, ref: l.origem });
      const match = candidates[0] ?? null;
      if (match) used.add(match);
      pairs.push([l, match, String(raw ?? '')]);
    }
    for (const r of right) if (!used.has(r)) pairs.push([null, r, String(getPath(r.dados, params.chave.direita) ?? '')]);
  } else {
    for (let i = 0; i < Math.max(left.length, right.length); i++) pairs.push([left[i] ?? null, right[i] ?? null, String(i + 1)]);
  }

  const divergencias: Divergencia[] = [];
  let pares = 0;
  for (const [l, r, chave] of pairs) {
    if (!l || !r) {
      if (params.semPar === 'divergencia') {
        divergencias.push({ chave, campo: '(registro)', regra: 'par', esquerda: l ? { valor: chave, origem: l.origem } : null, direita: r ? { valor: chave, origem: r.origem } : null,
          motivo: l ? `sem par em ${rotulos.direita}` : `sem par em ${rotulos.esquerda}` });
      }
      continue;
    }
    pares++;
    for (const regra of params.regras) {
      const a = getPath(l.dados, regra.esquerda), b = getPath(r.dados, regra.direita);
      const motivo = compare(regra, a, b);
      if (motivo) divergencias.push({ chave, campo: regra.campo, regra: regra.tipo, motivo,
        esquerda: { valor: a ?? null, origem: l.origemCampo?.(regra.esquerda) ?? l.origem },
        direita: { valor: b ?? null, origem: r.origemCampo?.(regra.direita) ?? r.origem } });
    }
  }
  const result: ResultadoConferencia = {
    situacao: 'realizada',
    rotulos,
    resumo: { esquerda: left.length, direita: right.length, pares, divergencias: divergencias.length, conferidos: pares * params.regras.length },
    divergencias,
  };
  return { result, flags };
}

export async function conferirBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const { result, flags } = conferir(ctx, conferirParams.parse(step.params));
  return { id: step.id, bloco: 'conferir', titulo: step.titulo || 'Conferência', kind: 'divergencias', data: result, flags, counts: { divergencias: result.divergencias.length } };
}
