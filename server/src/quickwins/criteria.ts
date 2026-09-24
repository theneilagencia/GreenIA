// Critérios de avaliação de oportunidades, configuráveis por tenant. O padrão
// é Valor, Complexidade, Risco e Dependências, numa escala de 1 a 5; o admin
// muda escala, pesos, nomes e acrescenta critérios. Nota da oportunidade: a
// média ponderada das notas normalizadas (0 a 100), com os critérios em que
// menor é melhor invertidos.
import { z } from 'zod';

export const criterionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(60),
  descricao: z.string().max(300).default(''),
  peso: z.number().positive().max(100),
  sentido: z.enum(['maior_melhor', 'menor_melhor']),
});
export type Criterion = z.infer<typeof criterionSchema>;

export const DEFAULT_CRITERIA: Criterion[] = [
  { key: 'valor', label: 'Valor', descricao: 'Ganho esperado para o processo (tempo, erro, custo, risco evitado).', peso: 40, sentido: 'maior_melhor' },
  { key: 'complexidade', label: 'Complexidade', descricao: 'Esforço para implantar.', peso: 20, sentido: 'menor_melhor' },
  { key: 'risco', label: 'Risco', descricao: 'Risco de dado sensível, de erro ou de rejeição pela equipe.', peso: 20, sentido: 'menor_melhor' },
  { key: 'dependencias', label: 'Dependências', descricao: 'Depende de sistema, fornecedor ou outra área.', peso: 20, sentido: 'menor_melhor' },
];

export const qwCriteriaSchema = z.object({
  escala: z.object({ min: z.number().int().min(0).max(10).default(1), max: z.number().int().min(1).max(100).default(5) })
    .prefault({}).refine(e => e.max > e.min, 'o máximo da escala precisa ser maior que o mínimo'),
  criterios: z.array(criterionSchema).min(1).max(12).default(DEFAULT_CRITERIA).superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((c, i) => { if (seen.has(c.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `critério repetido: ${c.key}` }); seen.add(c.key); });
  }),
}).prefault({});
export type QwCriteria = z.infer<typeof qwCriteriaSchema>;

// Nota ponderada de 0 a 100. Todas as notas são obrigatórias e dentro da escala.
export function weightedScore(cfg: QwCriteria, scores: Record<string, number>): { score: number } | { error: string } {
  const { min, max } = cfg.escala;
  let sum = 0, weights = 0;
  for (const c of cfg.criterios) {
    const v = scores[c.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `falta a nota de ${c.label}` };
    if (v < min || v > max) return { error: `nota de ${c.label} fora da escala (${min} a ${max})` };
    const n = (v - min) / (max - min);
    sum += c.peso * (c.sentido === 'menor_melhor' ? 1 - n : n);
    weights += c.peso;
  }
  return { score: Math.round(sum / weights * 1000) / 10 };
}
