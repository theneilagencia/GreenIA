// Registro de detectores da política de dados. Os de fábrica (CPF, CNPJ,
// cartão, dados bancários, e-mail, telefone, endereço, nome...) vêm da lib
// compartilhada com o navegador. Cada tenant cadastra os seus, sem código:
// matrícula interna, número de contrato, placa de veículo, código de paciente.
// Um detector do tenant tem padrão (expressão regular), validação opcional do
// dígito verificador, palavras de contexto opcionais, classe e ação padrão.
// A ação ainda pode ser trocada pela política do tenant e do assistente.
import { z } from 'zod';
import core from '../../../lib/greenia-core.js';
import type { DataAction } from '../../../lib/greenia-core.js';
import { normPt } from '../util/text.ts';

const ACTIONS = core.DATA_ACTIONS as [DataAction, ...DataAction[]];
export const BUILTIN_TYPES = Object.keys(core.SENSITIVE_LABELS);
export const TYPE_KEY = /^[a-z][a-z0-9_]{1,40}$/;

// Expressão regular aceitável: compila, sem referência para trás e sem
// quantificador aninhado (o padrão clássico de travamento por backtracking).
export function regexProblem(pattern: string): string | null {
  try { new RegExp(pattern, 'u'); } catch (e) { return 'expressão regular inválida: ' + (e as Error).message; }
  if (/\\[1-9]|\\k</.test(pattern)) return 'referência para trás não é aceita';
  if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(pattern)) return 'quantificador aninhado não é aceito (ex.: (a+)+)';
  if (/\.\*.*\.\*/.test(pattern)) return 'mais de um ".*" não é aceito';
  return null;
}

export const customDetectorSchema = z.object({
  key: z.string().regex(TYPE_KEY, 'identificador em minúsculas, sem espaço (ex.: matricula)').refine(k => !BUILTIN_TYPES.includes(k) && k !== 'restrito', 'identificador reservado para um detector de fábrica'),
  label: z.string().trim().min(2).max(60),
  pattern: z.string().min(2).max(200).superRefine((p, ctx) => { const e = regexProblem(p); if (e) ctx.addIssue({ code: 'custom', message: e }); }),
  ignoreCase: z.boolean().default(true),
  validation: z.enum(['nenhuma', 'cpf', 'cnpj', 'luhn', 'mod11']).default('nenhuma'),
  context: z.array(z.string().trim().min(2).max(40)).max(10).default([]),   // alguma dessas palavras até 40 caracteres antes
  class: z.enum(['amarela', 'vermelha']).default('amarela'),
  action: z.enum(ACTIONS).default('avisar'),
});
export type CustomDetector = z.infer<typeof customDetectorSchema>;

export const detectorsSchema = z.array(customDetectorSchema).max(50).default([]).superRefine((list, ctx) => {
  const seen = new Set<string>();
  list.forEach((d, i) => { if (seen.has(d.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `identificador repetido: ${d.key}` }); seen.add(d.key); });
});

// Módulo 11 genérico (pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 dá 0).
function validMod11(digits: string): boolean {
  if (digits.length < 2) return false;
  let sum = 0, w = 2;
  for (let i = digits.length - 2; i >= 0; i--) { sum += Number(digits[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = sum % 11;
  return String(r < 2 ? 0 : 11 - r) === digits[digits.length - 1];
}

function validates(value: string, v: CustomDetector['validation']): boolean {
  const d = value.replace(/\D/g, '');
  switch (v) {
    case 'cpf': return core.isValidCPF(d);
    case 'cnpj': return core.isValidCNPJ(d);
    case 'luhn': return core.isValidLuhn(d);
    case 'mod11': return validMod11(d);
    default: return true;
  }
}

export interface Span { type: string; start: number; end: number }

// Ocorrências dos detectores do tenant num texto.
export function findCustom(text: string, detectors: CustomDetector[]): Span[] {
  const out: Span[] = [];
  const plain = normPt(text);                      // mesmo tamanho do original (acentos removidos)
  for (const d of detectors) {
    const re = new RegExp(d.pattern, 'gu' + (d.ignoreCase ? 'i' : ''));
    const ctxWords = d.context.map(normPt);
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      const start = m.index!;
      if (!validates(m[0], d.validation)) continue;
      if (ctxWords.length && !ctxWords.some(w => plain.slice(Math.max(0, start - 40), start).includes(w))) continue;
      out.push({ type: d.key, start, end: start + m[0].length });
    }
  }
  return out;
}

export function detectCustom(text: string, detectors: CustomDetector[]): string[] {
  return [...new Set(findCustom(text, detectors).map(s => s.type))];
}

// Troca as ocorrências dos tipos pedidos por [RÓTULO].
export function maskCustom(text: string, types: string[], detectors: CustomDetector[]): string {
  const want = detectors.filter(d => types.includes(d.key));
  if (!want.length) return text;
  const spans = findCustom(text, want).sort((a, b) => a.start - b.start || b.end - a.end);
  let out = '', pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    out += text.slice(pos, s.start) + '[' + want.find(d => d.key === s.type)!.label.toUpperCase() + ']';
    pos = s.end;
  }
  return out + text.slice(pos);
}

// Rótulo de cada tipo (de fábrica e do tenant), para as mensagens.
export function typeLabels(detectors: CustomDetector[]): Record<string, string> {
  return { ...core.SENSITIVE_LABELS, restrito: 'informação restrita pela Política de Uso de IA', ...Object.fromEntries(detectors.map(d => [d.key, d.label])) };
}
