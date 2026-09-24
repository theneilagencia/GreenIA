// Política de dados no servidor: o que fazer com cada tipo de dado sensível
// detectado, por tenant e por assistente. Detectores de fábrica vêm da lib
// compartilhada com o navegador (lib/greenia-core.js); os do tenant, do
// registro em detectors.ts. No servidor é que a decisão vale.
import core from '../../../lib/greenia-core.js';
import type { DataAction, DataPolicy, Decision, SensitiveType } from '../../../lib/greenia-core.js';
import { detectCustom, maskCustom, type CustomDetector } from './detectors.ts';

export type DataClass = 'verde' | 'amarela' | 'vermelha';

// Classe de cada tipo: vermelha = regulado, financeiro ou pessoal sensível;
// amarela = dado interno ou pessoal comum. Credencial não tem classe: é sempre bloqueada.
export const TYPE_CLASS: Record<Exclude<SensitiveType, 'credencial'>, Exclude<DataClass, 'verde'>> = {
  cpf: 'vermelha', rg: 'vermelha', cartao: 'vermelha', bancario: 'vermelha', pix: 'vermelha', lista: 'vermelha',
  cnpj: 'amarela', email: 'amarela', telefone: 'amarela', cep: 'amarela', endereco: 'amarela', nome: 'amarela',
};

// Ações permitidas para um tipo cuja classe o assistente NÃO aceita. Dado
// vermelho num assistente que não aceita vermelho só pode ser bloqueado ou
// mascarado; amarelo pode também gerar aviso (como email numa tarefa Verde).
const OUTSIDE_CLASS: Record<Exclude<DataClass, 'verde'>, DataAction[]> = {
  vermelha: ['bloquear', 'mascarar'],
  amarela: ['bloquear', 'avisar', 'mascarar'],
};

export interface PolicyProblem { type: string; action: DataAction; reason: string }

// Confere se a política respeita as classes aceitas. Usado ao salvar assistente.
// Tipos do tenant usam a classe declarada no detector; tipo desconhecido é
// conferido na rota, que conhece os detectores do tenant.
export function checkPolicyAgainstClasses(policy: DataPolicy, classes: DataClass[], custom: CustomDetector[] = []): PolicyProblem[] {
  const problems: PolicyProblem[] = [];
  for (const [type, action] of Object.entries(policy) as [string, DataAction][]) {
    if (type === 'credencial') {
      if (action !== 'bloquear') problems.push({ type, action, reason: 'credencial é sempre bloqueada' });
      continue;
    }
    const cls = (TYPE_CLASS as Record<string, Exclude<DataClass, 'verde'>>)[type] ?? custom.find(d => d.key === type)?.class;
    if (!cls) continue;
    if (!classes.includes(cls) && !OUTSIDE_CLASS[cls].includes(action)) {
      problems.push({ type, action, reason: `o assistente não aceita dado ${cls}; ações possíveis: ${OUTSIDE_CLASS[cls].join(', ')}` });
    }
  }
  return problems;
}

// Política efetiva: a do assistente, tipo a tipo, sobre a do tenant. Tipo sem
// ação definida em nenhuma das duas fica bloqueado (o mais seguro).
// Tipo do tenant sem ação nas políticas usa a ação padrão do detector.
export function effectivePolicy(tenantPolicy: DataPolicy, assistantPolicy?: DataPolicy, custom: CustomDetector[] = []): DataPolicy {
  const out: Record<string, DataAction> = {};
  const a = (assistantPolicy ?? {}) as Record<string, DataAction>;
  const t = tenantPolicy as Record<string, DataAction>;
  for (const k of Object.keys(core.SENSITIVE_LABELS)) out[k] = a[k] ?? t[k] ?? 'bloquear';
  for (const d of custom) out[d.key] = a[d.key] ?? t[d.key] ?? d.action;
  out.credencial = 'bloquear';
  return out as DataPolicy;
}

export interface Inspection {
  decision: Decision;
  types: string[];
}

// Examina todos os textos da requisição (inclusive os que dizem ser do
// assistente: o cliente poderia forjar o histórico).
export function inspect(texts: string[], policy: DataPolicy, custom: CustomDetector[] = []): Inspection {
  const found = new Set<string>();
  for (const t of texts) {
    for (const type of core.detectSensitive(t)) found.add(type);
    for (const type of detectCustom(t, custom)) found.add(type);
  }
  const order = [...Object.keys(core.SENSITIVE_LABELS), ...custom.map(d => d.key)];
  const types = order.filter(t => found.has(t));
  return { types, decision: core.decideAction(types as SensitiveType[], policy) };
}

export const maskText = (text: string, types: string[], custom: CustomDetector[] = []) =>
  maskCustom(core.maskSensitive(text, types as SensitiveType[]), types, custom);
