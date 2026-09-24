// Preço por milhão de tokens (US$), para calcular o custo de cada resposta em
// reais. Tabela da API da Anthropic (preços de primeira parte, referência de
// 24/06/2026). Conferir na página de preços antes de faturar; o câmbio vem de
// USD_BRL. A Fase 3 torna a tabela configurável no painel.
export interface Price { inputPerMTok: number; outputPerMTok: number }

export const PRICES_USD: Record<string, Price> = {
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
  'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
};

// Modelo sem preço conhecido: usa o mais caro da tabela (nunca subestima o custo).
const FALLBACK: Price = { inputPerMTok: 5, outputPerMTok: 25 };

export function costBrl(model: string, inputTokens: number, outputTokens: number, usdBrl: number) {
  const p = PRICES_USD[model] ?? FALLBACK;
  const usd = (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
  return Math.round(usd * usdBrl * 1_000_000) / 1_000_000;
}
