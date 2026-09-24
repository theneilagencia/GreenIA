// Política de Uso de IA do cliente, publicada na plataforma com versão. As
// regras dela valem dentro da GreenIA:
//   dataPolicy       piso por tipo de dado: nenhum assistente pode ser mais
//                    permissivo que a política (vale sempre o mais restritivo)
//   restrictedTerms  informações restritas (ex.: nome de projeto sigiloso):
//                    texto que as contém não vai ao modelo
//   allowedClasses   classes de dado permitidas: assistente que aceita outra
//                    classe não pode ir para piloto nem ficar ativo
//   tools            texto livre sobre ferramentas permitidas (informativo)
// No primeiro acesso e a cada nova versão, a pessoa registra ciência antes de
// usar o chat ou os assistentes (conferido no servidor).
import { z } from 'zod';
import core from '../../../lib/greenia-core.js';
import type { DataAction, DataPolicy, SensitiveType } from '../../../lib/greenia-core.js';
import type { Tx } from '../db/pool.ts';
import { dataPolicySchema } from '../tenants/config.ts';
import { containsPhrase } from '../blocks/values.ts';
import { normPt } from '../util/text.ts';

export const usageRulesSchema = z.object({
  dataPolicy: dataPolicySchema.default({}),
  restrictedTerms: z.array(z.string().trim().min(3).max(120)).max(200).default([]),
  allowedClasses: z.array(z.enum(['verde', 'amarela', 'vermelha'])).min(1).default(['verde', 'amarela', 'vermelha']),
  tools: z.string().max(4000).default(''),
}).prefault({});
export type UsageRules = z.infer<typeof usageRulesSchema>;

export interface UsagePolicy { version: number; title: string; body: string; bodySha256: string; rules: UsageRules; publishedAt: string }

export async function currentPolicy(tx: Tx): Promise<UsagePolicy | null> {
  const r = (await tx.query(`select * from usage_policies order by version desc limit 1`)).rows[0];
  if (!r) return null;
  return { version: r.version, title: r.title, body: r.body, bodySha256: r.body_sha256, rules: usageRulesSchema.parse(r.rules), publishedAt: new Date(r.published_at).toISOString() };
}

// Política vigente e se a pessoa já registrou ciência dela.
export async function policyState(tx: Tx, userId: string) {
  const policy = await currentPolicy(tx);
  if (!policy) return { policy: null, acked: true };
  const acked = !!(await tx.query(`select 1 from policy_acks where user_id = $1 and version = $2`, [userId, policy.version])).rowCount;
  return { policy, acked };
}

const severity = (a: DataAction) => core.DATA_ACTIONS.indexOf(a);   // 0 = bloquear (mais restritivo)

// O mais restritivo entre a política efetiva (tenant + assistente) e o piso da Política de Uso.
export function applyFloor(policy: DataPolicy, floor: DataPolicy | undefined): DataPolicy {
  if (!floor) return policy;
  const out: DataPolicy = { ...policy };
  for (const [type, action] of Object.entries(floor) as [SensitiveType, DataAction][]) {
    const cur = out[type] ?? 'bloquear';
    out[type] = severity(action) < severity(cur) ? action : cur;
  }
  return out;
}

// Informações restritas presentes nos textos (a comparação ignora acentos e maiúsculas).
export function restrictedHits(texts: string[], terms: string[]): string[] {
  if (!terms.length) return [];
  const all = normPt(texts.join('\n'));
  return terms.filter(t => containsPhrase(all, t));
}

export function classConflicts(dataClasses: string[], rules: UsageRules | undefined): string[] {
  if (!rules) return [];
  return dataClasses.filter(c => !rules.allowedClasses.includes(c as UsageRules['allowedClasses'][number]));
}
