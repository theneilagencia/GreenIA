// Bloco 2: extração estruturada. O modelo extrai os campos do JSON Schema do
// assistente e indica a origem de cada um (página e trecho). A plataforma:
//   - valida os campos contra o schema (ajv); falhou, vai para revisão;
//   - nunca completa campo faltante: o que o modelo não achou fica vazio;
//   - confere se o trecho de origem existe mesmo no documento (evita origem inventada);
//   - marca campo preenchido sem origem.
import { Ajv, type ErrorObject } from 'ajv';
import { extrairParams, type PipelineStep } from './params.ts';
import type { ReadDoc, ReviewFlag, RunContext, Section } from './types.ts';
import { normPt as norm } from '../util/text.ts';
import { descreverParte, dividirEmPartes } from './partes.ts';

const ajv = new Ajv({ allErrors: true, strict: false });

export interface Origem { campo: string; pagina: number | null; trecho: string; confere?: boolean }

export interface Extracao {
  arquivo: string;                  // documento (ou "conjunto")
  arquivos: string[];
  partes?: string[];                // documento longo: lido em partes (páginas de cada uma), consolidado no fim
  campos: Record<string, unknown> | null;
  origem: Origem[];
  valido: boolean;
  erros: string[];
}


// Texto com marcação de página, para o modelo citar a origem.
export function docForModel(d: ReadDoc, paginas?: ReadDoc['pages']): string {
  const pages = paginas ?? (d.pages.length ? d.pages : [{ n: 1, text: d.text }]);
  const how = (p: ReadDoc['pages'][number]) => p.via === 'ocr' ? ` (lida por OCR, confiança ${Math.round(p.confianca ?? 0)}%: pode ter erro de leitura)` : '';
  return `### Documento: ${d.name}\n` + pages.map(p => `=== Página ${p.n} ===${how(p)}\n${p.text}`).join('\n');
}

// JSON dentro da resposta (com ou sem bloco de código).
export function parseJsonReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error('resposta sem JSON');
  return JSON.parse(raw.slice(start, Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']')) + 1));
}

const describeAjv = (errs: ErrorObject[] | null | undefined) =>
  (errs || []).map(e => `${e.instancePath || '(raiz)'} ${e.message}${e.params && 'missingProperty' in e.params ? `: ${e.params.missingProperty}` : ''}`);

// Caminhos preenchidos (folhas não vazias), para exigir origem de cada um.
function filledPaths(v: unknown, prefix = ''): string[] {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.length ? [prefix] : [];
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => filledPaths(x, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

export function wrapperSchema(schema: Record<string, unknown>) {
  return {
    type: 'object',
    properties: {
      campos: schema,
      origem: {
        type: 'array',
        items: {
          type: 'object',
          properties: { campo: { type: 'string' }, pagina: { type: ['integer', 'null'] }, trecho: { type: 'string' } },
          required: ['campo', 'pagina', 'trecho'],
        },
      },
    },
    required: ['campos', 'origem'],
  };
}

// Consolidação das partes: valor preenchido em uma parte completa o null das
// outras; listas se juntam sem repetir; o mesmo campo com valores diferentes em
// duas partes fica com o primeiro e vai para revisão.
type Resposta = { campos?: unknown; origem?: unknown; parte: string };
export function consolidar(rs: Resposta[], conflito: (campo: string, a: { valor: unknown; parte: string }, b: { valor: unknown; parte: string }) => void) {
  if (rs.length === 1) return rs[0];
  const vazio = (v: unknown) => v === null || v === undefined || v === '';
  const merge = (a: unknown, b: unknown, path: string, pa: string, pb: string): unknown => {
    if (vazio(a)) return b;
    if (vazio(b)) return a;
    if (Array.isArray(a) && Array.isArray(b)) { const seen = new Set(a.map(x => JSON.stringify(x))); return [...a, ...b.filter(x => !seen.has(JSON.stringify(x)))]; }
    if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const o: Record<string, unknown> = { ...(a as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b as Record<string, unknown>)) o[k] = merge(o[k], v, path ? `${path}.${k}` : k, pa, pb);
      return o;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) conflito(path || '(raiz)', { valor: a, parte: pa }, { valor: b, parte: pb });
    return a;
  };
  let campos: unknown = null, parteDe = '';
  const origem: unknown[] = [];
  for (const r of rs) {
    campos = campos === null ? (r.campos ?? null) : merge(campos, r.campos, '', parteDe, r.parte);
    if (!parteDe && r.campos) parteDe = r.parte;
    if (Array.isArray(r.origem)) origem.push(...r.origem);
  }
  return { campos, origem, parte: rs.map(r => r.parte).join(' + ') };
}

export async function extrairBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = extrairParams.parse(step.params);
  const validate = ajv.compile(p.schema);
  const flags: ReviewFlag[] = [];
  // Documento que um leitor especializado marcou para não extrair (ex.: DANFE:
  // a nota vem do XML de mesma chave, nunca do texto impresso).
  for (const d of ctx.docs.filter(d => d.semExtracao && (!p.tipos || p.tipos.includes(d.kind)))) {
    flags.push({ reason: d.semExtracao!, ref: d.name });
  }
  const docs = ctx.docs.filter(d => !d.semExtracao && (!p.tipos || p.tipos.includes(d.kind)) && (d.text || d.dados));
  const groups = p.por === 'conjunto' ? (docs.length ? [docs] : []) : docs.map(d => [d]);
  const out: Extracao[] = [];
  if (!groups.length) flags.push({ reason: 'nenhum documento com texto para extrair' });

  for (const group of groups) {
    const label = group.length === 1 ? group[0].name : 'conjunto';
    const r: Extracao = { arquivo: label, arquivos: group.map(d => d.name), campos: null, origem: [], valido: false, erros: [] };
    // Documento longo: uma chamada por parte (páginas em blocos) e consolidação no fim.
    const partes = dividirEmPartes(group, p.caracteresPorParte);
    if (partes.length > 1) r.partes = partes.map(descreverParte);
    const respostas: { campos?: unknown; origem?: unknown; parte: string }[] = [];
    for (const [k, parte] of partes.entries()) {
      const reply = await ctx.env.complete({
        purpose: partes.length > 1 ? `extração estruturada (parte ${k + 1} de ${partes.length})` : 'extração estruturada',
        system: [
          'Você extrai informações de documentos para um formulário.',
          'Responda só com JSON no formato {"campos": {...}, "origem": [{"campo": "caminho.do.campo", "pagina": N, "trecho": "texto copiado do documento"}]}.',
          '"campos" segue o schema informado. "origem" tem uma entrada para cada campo preenchido, com a página e um trecho copiado literalmente do documento.',
          'Se uma informação não estiver no documento, use null. Nunca deduza, estime ou complete um valor.',
          partes.length > 1 ? `O documento é longo e foi dividido em ${partes.length} partes. Esta é a parte ${k + 1} (${descreverParte(parte)}). Extraia só o que está nesta parte; o que não estiver nela fica null.` : '',
          p.instrucoes,
        ].filter(Boolean).join('\n'),
        content: [{ type: 'text', text: `Schema dos campos:\n${JSON.stringify(p.schema)}\n\n${parte.itens.map(i => docForModel(i.doc, i.paginas)).join('\n\n')}` }],
        jsonSchema: wrapperSchema(p.schema),
        maxOutputTokens: 4000,
      });
      const quem = partes.length > 1 ? `${label} (parte ${k + 1})` : label;
      if (reply.blocked?.length) { r.erros.push(`não enviado ao modelo${partes.length > 1 ? ` (parte ${k + 1})` : ''}: contém ` + reply.blocked.join(', ')); continue; }
      try { respostas.push({ ...(parseJsonReply(reply.text) as object), parte: descreverParte(parte) }); }
      catch { r.erros.push(`resposta do modelo não é JSON válido${partes.length > 1 ? ` (${quem})` : ''}`); }
    }
    if (!respostas.length) {
      for (const e of r.erros) flags.push({ reason: e, ref: label });
      out.push(r);
      continue;
    }
    const parsed = consolidar(respostas, (campo, a, b) => flags.push({ reason: `valores diferentes entre as partes para ${campo}: ${JSON.stringify(a.valor)} (${a.parte}) e ${JSON.stringify(b.valor)} (${b.parte})`, ref: label }));
    r.campos = parsed?.campos && typeof parsed.campos === 'object' ? parsed.campos as Record<string, unknown> : null;
    r.origem = Array.isArray(parsed?.origem) ? (parsed.origem as Origem[]).filter(o => o && typeof o.campo === 'string') : [];
    if (!r.campos) r.erros.push('resposta sem o objeto "campos"');
    else if (!validate(r.campos)) r.erros.push(...describeAjv(validate.errors).map(e => 'fora do schema: ' + e));

    // Origem: o trecho precisa existir no documento citado.
    const allText = norm(group.map(d => d.text).join('\n'));
    for (const o of r.origem) o.confere = !!o.trecho && allText.includes(norm(o.trecho));
    for (const o of r.origem.filter(x => !x.confere)) flags.push({ reason: `origem do campo ${o.campo} não encontrada no documento`, ref: label });
    const withOrigin = new Set(r.origem.filter(o => o.confere).map(o => o.campo.replace(/\[\d+\]/g, '')));
    for (const path of filledPaths(r.campos)) {
      if (![...withOrigin].some(c => c === path || path.startsWith(c + '.') || c.startsWith(path + '.'))) {
        flags.push({ reason: `campo ${path} preenchido sem origem`, ref: label });
      }
    }
    r.valido = r.erros.length === 0;
    for (const e of r.erros) flags.push({ reason: e, ref: label });
    out.push(r);
  }
  return { id: step.id, bloco: 'extrair', titulo: step.titulo || 'Campos extraídos', kind: 'campos', data: out, flags };
}
