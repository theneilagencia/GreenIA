// Política de dados no servidor: o que fazer com cada tipo de dado sensível
// detectado, por tenant e por assistente. Usa o mesmo detector do navegador
// (lib/greenia-core.js); no servidor é que a decisão vale.
import core from '../../../lib/greenia-core.js';
import type { DataAction, DataPolicy, Decision, SensitiveType } from '../../../lib/greenia-core.js';

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

export interface PolicyProblem { type: SensitiveType; action: DataAction; reason: string }

// Confere se a política respeita as classes aceitas. Usado ao salvar assistente.
export function checkPolicyAgainstClasses(policy: DataPolicy, classes: DataClass[]): PolicyProblem[] {
  const problems: PolicyProblem[] = [];
  for (const [type, action] of Object.entries(policy) as [SensitiveType, DataAction][]) {
    if (type === 'credencial') {
      if (action !== 'bloquear') problems.push({ type, action, reason: 'credencial é sempre bloqueada' });
      continue;
    }
    const cls = TYPE_CLASS[type];
    if (!classes.includes(cls) && !OUTSIDE_CLASS[cls].includes(action)) {
      problems.push({ type, action, reason: `o assistente não aceita dado ${cls}; ações possíveis: ${OUTSIDE_CLASS[cls].join(', ')}` });
    }
  }
  return problems;
}

// Política efetiva: a do assistente, tipo a tipo, sobre a do tenant. Tipo sem
// ação definida em nenhuma das duas fica bloqueado (o mais seguro).
export function effectivePolicy(tenantPolicy: DataPolicy, assistantPolicy?: DataPolicy): DataPolicy {
  const out: DataPolicy = {};
  for (const t of Object.keys(core.SENSITIVE_LABELS) as SensitiveType[]) {
    out[t] = assistantPolicy?.[t] ?? tenantPolicy[t] ?? 'bloquear';
  }
  out.credencial = 'bloquear';
  return out;
}

export interface Inspection {
  decision: Decision;
  types: SensitiveType[];
}

// Examina todos os textos da requisição (inclusive os que dizem ser do
// assistente: o cliente poderia forjar o histórico).
export function inspect(texts: string[], policy: DataPolicy): Inspection {
  const found = new Set<SensitiveType>();
  for (const t of texts) for (const type of core.detectSensitive(t)) found.add(type);
  const types = (Object.keys(core.SENSITIVE_LABELS) as SensitiveType[]).filter(t => found.has(t));
  return { types, decision: core.decideAction(types, policy) };
}

export const maskText = (text: string, types: SensitiveType[]) => core.maskSensitive(text, types);
