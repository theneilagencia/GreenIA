// Preço do consumo em reais. A tabela configurável (price_tables, mantida pela
// operação da TheNeil, com vigência e câmbio) é a fonte. Esta tabela fixa e o
// câmbio USD_BRL só valem para modelo sem linha vigente naquela tabela.
import type { Tx } from '../db/pool.ts';

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


export interface PriceRow { id: string; inputPerMTok: number; outputPerMTok: number; perPageBrl: number; usdBrl: number; validFrom: string; source: string }

// Linha vigente para o modelo na data (a mais recente com vigência até o dia),
// preferindo a do mesmo provedor.
export async function currentPrice(tx: Tx, provider: string, model: string, day?: string): Promise<PriceRow | null> {
  const r = (await tx.query(
    `select * from price_tables where model = $2 and valid_from <= coalesce($3::date, (now() at time zone 'America/Sao_Paulo')::date)
     order by (provider = $1) desc, valid_from desc limit 1`, [provider, model, day ?? null])).rows[0];
  return r ? { id: r.id, inputPerMTok: Number(r.input_per_mtok_usd), outputPerMTok: Number(r.output_per_mtok_usd), perPageBrl: Number(r.per_page_brl), usdBrl: Number(r.usd_brl), validFrom: new Date(r.valid_from).toISOString().slice(0, 10), source: r.source } : null;
}

// Custo em reais: tokens pelo preço em US$ e câmbio da linha, mais páginas pelo preço por página.
export function priceCost(p: PriceRow, inputTokens: number, outputTokens: number, pages = 0) {
  const usd = (inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok) / 1_000_000;
  return Math.round((usd * p.usdBrl + pages * p.perPageBrl) * 1_000_000) / 1_000_000;
}
