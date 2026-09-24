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

const ajv = new Ajv({ allErrors: true, strict: false });

export interface Origem { campo: string; pagina: number | null; trecho: string; confere?: boolean }

export interface Extracao {
  arquivo: string;                  // documento (ou "conjunto")
  arquivos: string[];
  campos: Record<string, unknown> | null;
  origem: Origem[];
  valido: boolean;
  erros: string[];
}


// Texto com marcação de página, para o modelo citar a origem.
export function docForModel(d: ReadDoc): string {
  const pages = d.pages.length ? d.pages : [{ n: 1, text: d.text }];
  return `### Documento: ${d.name}\n` + pages.map(p => `=== Página ${p.n} ===\n${p.text}`).join('\n');
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

export async function extrairBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = extrairParams.parse(step.params);
  const validate = ajv.compile(p.schema);
  const docs = ctx.docs.filter(d => (!p.tipos || p.tipos.includes(d.kind)) && (d.text || d.nfe));
  const groups = p.por === 'conjunto' ? (docs.length ? [docs] : []) : docs.map(d => [d]);
  const flags: ReviewFlag[] = [];
  const out: Extracao[] = [];
  if (!groups.length) flags.push({ reason: 'nenhum documento com texto para extrair' });

  for (const group of groups) {
    const label = group.length === 1 ? group[0].name : 'conjunto';
    const r: Extracao = { arquivo: label, arquivos: group.map(d => d.name), campos: null, origem: [], valido: false, erros: [] };
    const reply = await ctx.env.complete({
      purpose: 'extração estruturada',
      system: [
        'Você extrai informações de documentos para um formulário.',
        'Responda só com JSON no formato {"campos": {...}, "origem": [{"campo": "caminho.do.campo", "pagina": N, "trecho": "texto copiado do documento"}]}.',
        '"campos" segue o schema informado. "origem" tem uma entrada para cada campo preenchido, com a página e um trecho copiado literalmente do documento.',
        'Se uma informação não estiver no documento, use null. Nunca deduza, estime ou complete um valor.',
        p.instrucoes,
      ].filter(Boolean).join('\n'),
      content: [{ type: 'text', text: `Schema dos campos:\n${JSON.stringify(p.schema)}\n\n${group.map(docForModel).join('\n\n')}` }],
      jsonSchema: wrapperSchema(p.schema),
      maxOutputTokens: 4000,
    });
    if (reply.blocked?.length) {
      r.erros.push('não enviado ao modelo: contém ' + reply.blocked.join(', '));
      flags.push({ reason: r.erros[0], ref: label });
      out.push(r);
      continue;
    }
    let parsed: { campos?: unknown; origem?: unknown };
    try {
      parsed = parseJsonReply(reply.text) as typeof parsed;
    } catch (e) {
      r.erros.push('resposta do modelo não é JSON válido');
      flags.push({ reason: r.erros[0], ref: label });
      out.push(r);
      continue;
    }
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
