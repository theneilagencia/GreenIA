// Bloco 5: classificação e organização. Classifica cada documento numa
// taxonomia do assistente, identifica o período (mês/ano) e sugere um nome
// padronizado. O índice é exportável; o pacote ZIP organizado (pastas por
// categoria, arquivos renomeados, índice em CSV) é montado na exportação, a
// partir da versão revisada do índice.
//
// Regras: nome do arquivo ou início do conteúdo = confiança alta; só no meio
// do texto = baixa (vai para revisão); mais de uma categoria no mesmo nível ou
// nenhuma = revisão. Modelo: o modelo escolhe a categoria (validada contra a
// taxonomia) e o período; confiança baixa ou média vai para revisão.
import { classificarParams, type PipelineStep } from './params.ts';
import type { ReadDoc, ReviewFlag, RunContext, Section } from './types.ts';
import { containsPhrase } from './values.ts';
import { normPt, stripAccents } from '../util/text.ts';
import { parseJsonReply } from './extrair.ts';

export interface LinhaIndice {
  arquivo: string;
  categoria: string | null;       // id da taxonomia
  categoriaNome: string;
  periodo: string | null;         // AAAA-MM
  nomeSugerido: string;
  confianca: 'alta' | 'baixa';
  como: string;
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n: number) => String(n).padStart(2, '0');

// Período do documento: competência/referência explícita, mês por extenso,
// a data dada por um leitor especializado ou a primeira data dd/mm/aaaa do texto.
export function detectPeriod(d: Pick<ReadDoc, 'text' | 'periodo'>): string | null {
  if (d.periodo) return d.periodo;
  const t = normPt(d.text.slice(0, 5000));
  let m = t.match(/(?:competencia|referencia|referente a|periodo)[:\s]+(\d{1,2})\s*[/-]\s*(\d{4})/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(+m[1])}`;
  m = t.match(new RegExp(`(${MESES.join('|')})\\s*(?:de\\s*|/\\s*)?(\\d{4})`));
  if (m) return `${m[2]}-${pad(MESES.indexOf(m[1]) + 1)}`;
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[3]}-${pad(+m[2])}`;
  m = t.match(/\b(\d{4})-(\d{2})-\d{2}\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2]}`;
  return null;
}

const slug = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'documento';

export function suggestName(pattern: string, v: { categoria: string | null; categoriaNome: string; periodo: string | null; arquivo: string }, used: Set<string>): string {
  const ext = (v.arquivo.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  const base = v.arquivo.replace(/\.[^.]+$/, '');
  const name = pattern
    .replace(/\{categoria\}/g, v.categoria ?? 'nao-classificado')
    .replace(/\{categoriaNome\}/g, slug(v.categoriaNome))
    .replace(/\{periodo\}/g, v.periodo ?? 'sem-periodo')
    .replace(/\{nome\}/g, slug(base));
  let out = name.split('/').map(p => p.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/-+/g, '-')).join('/') + ext;
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${name}-${i}${ext}`;
  used.add(out.toLowerCase());
  return out;
}

type Categoria = ReturnType<typeof classificarParams.parse>['taxonomia'][number];

function classifyByRules(d: ReadDoc, tax: Categoria[]): { cat: Categoria | null; confianca: 'alta' | 'baixa'; como: string; ambigua: boolean } {
  const nameN = normPt(d.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' '));
  const head = normPt(d.text.slice(0, 500));
  const body = normPt(d.text);
  for (const [text, como, conf] of [[nameN, 'nome do arquivo', 'alta'], [head, 'início do conteúdo', 'alta'], [body, 'meio do texto', 'baixa']] as const) {
    const hits = tax.filter(c => [c.nome, ...c.sinonimos].some(t => containsPhrase(text, t)));
    if (hits.length) return { cat: hits[0], confianca: hits.length > 1 ? 'baixa' : conf, como, ambigua: hits.length > 1 };
  }
  return { cat: null, confianca: 'baixa', como: 'sem correspondência', ambigua: false };
}

export async function classificarBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = classificarParams.parse(step.params);
  const flags: ReviewFlag[] = [];
  const used = new Set<string>();
  const rows: LinhaIndice[] = [];
  let modelAnswers: Map<string, { categoria: string | null; periodo: string | null; confianca: string }> | null = null;

  if (p.metodo === 'modelo' && ctx.docs.length) {
    const reply = await ctx.env.complete({
      purpose: 'classificação',
      system: 'Você organiza documentos. Para cada arquivo, escolha uma categoria da lista (pelo id) ou null se nenhuma servir, o período no formato AAAA-MM (ou null) e a confiança ("alta", "media" ou "baixa"). Responda só com JSON: {"arquivos": [{"arquivo": "...", "categoria": "id ou null", "periodo": "AAAA-MM ou null", "confianca": "..."}]}.',
      content: [{ type: 'text', text: `Categorias:\n${p.taxonomia.map(c => `- ${c.id}: ${c.nome}${c.sinonimos.length ? ` (${c.sinonimos.join(', ')})` : ''}`).join('\n')}\n\n${ctx.docs.map(d => `### Arquivo: ${d.name}\n${d.text.slice(0, 2000)}`).join('\n\n')}` }],
      jsonSchema: { type: 'object', properties: { arquivos: { type: 'array', items: { type: 'object', properties: { arquivo: { type: 'string' }, categoria: { type: ['string', 'null'] }, periodo: { type: ['string', 'null'] }, confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] } }, required: ['arquivo', 'categoria', 'periodo', 'confianca'] } } }, required: ['arquivos'] },
      maxOutputTokens: 3000,
    });
    try {
      if (reply.blocked?.length) throw new Error('não enviado ao modelo: contém ' + reply.blocked.join(', '));
      const list = (parseJsonReply(reply.text) as { arquivos: { arquivo: string; categoria: string | null; periodo: string | null; confianca: string }[] }).arquivos;
      modelAnswers = new Map(list.map(a => [a.arquivo, a]));
    } catch (e) {
      flags.push({ reason: 'classificação pelo modelo falhou (' + (e as Error).message + '); usadas as regras' });
    }
  }

  for (const d of ctx.docs) {
    let cat: Categoria | null, confianca: 'alta' | 'baixa', como: string, periodo = detectPeriod(d);
    const a = modelAnswers?.get(d.name);
    if (modelAnswers && a) {
      cat = p.taxonomia.find(c => c.id === a.categoria) ?? null;
      if (a.categoria && !cat) flags.push({ reason: `categoria ${a.categoria} fora da taxonomia`, ref: d.name });
      confianca = a.confianca === 'alta' && cat ? 'alta' : 'baixa';
      como = `modelo, confiança ${a.confianca}`;
      if (a.periodo && /^\d{4}-(0[1-9]|1[0-2])$/.test(a.periodo)) periodo = periodo ?? a.periodo;
    } else {
      const r = classifyByRules(d, p.taxonomia);
      cat = r.cat; confianca = r.confianca; como = r.como;
      if (r.ambigua) flags.push({ reason: 'mais de uma categoria possível', ref: d.name });
    }
    if (!cat) flags.push({ reason: 'documento não classificado', ref: d.name });
    else if (confianca === 'baixa') flags.push({ reason: `classificação com baixa confiança (${como})`, ref: d.name });
    if (!periodo) flags.push({ reason: 'período não identificado', ref: d.name });
    const categoriaNome = cat?.nome ?? 'Não classificado';
    rows.push({ arquivo: d.name, categoria: cat?.id ?? null, categoriaNome, periodo, confianca, como,
      nomeSugerido: suggestName(p.padraoNome, { categoria: cat?.id ?? null, categoriaNome, periodo, arquivo: d.name }, used) });
  }
  if (!ctx.docs.length) flags.push({ reason: 'nenhum documento para classificar' });
  return { id: step.id, bloco: 'classificar', titulo: step.titulo || 'Classificação e índice', kind: 'classificacao', data: { indice: rows, pacoteZip: p.pacoteZip }, flags };
}
