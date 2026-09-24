// Definição de um assistente (versão). A Fase 2 cobre persona, política de dados
// e retenção; a Fase 3 acrescenta pipeline, entradas, saída, revisão e medição.
import { z } from 'zod';
import { dataPolicySchema } from '../tenants/config.ts';
import { checkPolicyAgainstClasses } from '../policy/data-policy.ts';

export const assistantDefinitionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  description: z.string().max(500).default(''),
  instructions: z.string().max(20000).default(''),
  dataClasses: z.array(z.enum(['verde', 'amarela', 'vermelha'])).min(1).default(['verde']),
  dataPolicy: dataPolicySchema.default({}),
  retention: z.object({
    keepOutputs: z.boolean().default(false), // grava as saídas como evidência?
    days: z.number().int().min(1).max(3650).optional(), // sem valor: o padrão do tenant
  }).prefault({}),
}).superRefine((d, ctx) => {
  for (const p of checkPolicyAgainstClasses(d.dataPolicy, d.dataClasses)) {
    ctx.addIssue({ code: 'custom', path: ['dataPolicy', p.type], message: `${p.action}: ${p.reason}` });
  }
});

export type AssistantDefinition = z.infer<typeof assistantDefinitionSchema>;
