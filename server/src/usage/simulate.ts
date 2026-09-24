// Simulador de custo mensal por assistente: execuções por mês × páginas por
// execução → tokens → reais, pela tabela de preços vigente. Usa as médias
// medidas nas execuções do assistente quando existem ("medido"); senão, as
// premissas abaixo ("premissa"). Serve para apresentar mensalidade e consumo
// antes da contratação: é projeção, não resultado.
import { z } from 'zod';
import type { Tx } from '../db/pool.ts';
import { costBrl, currentPrice, priceCost } from './pricing.ts';

export const ASSUMPTIONS = {
  tokensPorPaginaTexto: 750,     // ~3.000 caracteres por página, ~4 caracteres por token
  tokensPorPaginaVisao: 1800,    // página A4 digitalizada enviada como imagem
  tokensFixosPorExecucao: 1200,  // instruções, schema e contexto de cada chamada
  tokensSaidaPorExecucao: 800,   // resposta do modelo por execução
};

export const simulateSchema = z.object({
  mensalidadeBrl: z.number().min(0).default(0),
  modelo: z.string().max(120).optional(),
  itens: z.array(z.object({
    nome: z.string().trim().min(1).max(120),
    assistente: z.string().max(80).optional(),           // usa as médias medidas deste assistente, se houver
    execucoesPorMes: z.number().int().min(0).max(1_000_000),
    paginasPorExecucao: z.number().min(0).max(5000).default(1),
    percentualDigitalizado: z.number().min(0).max(100).default(0),   // páginas que vão para a visão do modelo
    usaModelo: z.boolean().default(true),                // conferência só em código não consome tokens
  })).min(1).max(50),
});

export interface Measured { execucoes: number; tokensEntradaPorExecucao: number; tokensSaidaPorExecucao: number; paginasPorExecucao: number }

export async function measuredFor(tx: Tx, slug: string): Promise<Measured | null> {
  const r = (await tx.query(
    `select count(*)::int as n, avg(r.input_tokens) as tin, avg(r.output_tokens) as tout, avg(r.pages) as pages
     from runs r join assistants a on a.id = r.assistant_id
     where a.slug = $1 and r.status not in ('processando', 'erro') and r.created_at > now() - interval '90 days'`, [slug])).rows[0];
  return r.n >= 5 ? { execucoes: r.n, tokensEntradaPorExecucao: Number(r.tin), tokensSaidaPorExecucao: Number(r.tout), paginasPorExecucao: Number(r.pages) } : null;
}

export async function simulate(tx: Tx, input: z.infer<typeof simulateSchema>, opts: { provider: string; model: string; usdBrlFallback: number; measured?: (slug: string) => Promise<Measured | null> }) {
  const model = input.modelo ?? opts.model;
  const price = await currentPrice(tx, opts.provider, model);
  const itens = [];
  for (const it of input.itens) {
    const m = it.assistente && opts.measured ? await opts.measured(it.assistente) : null;
    let tin = 0, tout = 0, base: string;
    if (!it.usaModelo) { base = 'sem uso do modelo (processamento em código)'; }
    else if (m && m.paginasPorExecucao > 0) {
      // Médias medidas, escaladas pelas páginas informadas.
      const perPage = m.tokensEntradaPorExecucao / m.paginasPorExecucao;
      tin = perPage * it.paginasPorExecucao;
      tout = m.tokensSaidaPorExecucao;
      base = `medido: médias de ${m.execucoes} execuções dos últimos 90 dias`;
    } else if (m) {
      tin = m.tokensEntradaPorExecucao; tout = m.tokensSaidaPorExecucao;
      base = `medido: médias de ${m.execucoes} execuções dos últimos 90 dias`;
    } else {
      const dig = it.percentualDigitalizado / 100;
      tin = ASSUMPTIONS.tokensFixosPorExecucao + it.paginasPorExecucao * ((1 - dig) * ASSUMPTIONS.tokensPorPaginaTexto + dig * ASSUMPTIONS.tokensPorPaginaVisao);
      tout = ASSUMPTIONS.tokensSaidaPorExecucao;
      base = 'premissa (sem histórico suficiente: mínimo de 5 execuções)';
    }
    const inTok = Math.round(tin * it.execucoesPorMes), outTok = Math.round(tout * it.execucoesPorMes);
    const paginas = Math.round(it.paginasPorExecucao * it.execucoesPorMes);
    const custo = price ? priceCost(price, inTok, outTok, paginas) : costBrl(model, inTok, outTok, opts.usdBrlFallback);
    itens.push({ nome: it.nome, execucoesPorMes: it.execucoesPorMes, paginasPorMes: paginas, tokensEntrada: inTok, tokensSaida: outTok, consumoBrl: Math.round(custo * 100) / 100, base });
  }
  const consumo = Math.round(itens.reduce((s, i) => s + i.consumoBrl, 0) * 100) / 100;
  return {
    modelo: model,
    preco: price ? { vigenteDesde: price.validFrom, entradaUsdPorMTok: price.inputPerMTok, saidaUsdPorMTok: price.outputPerMTok, porPaginaBrl: price.perPageBrl, cambio: price.usdBrl, fonte: price.source } : { fonte: 'tabela fixa de reserva (modelo sem preço vigente)', cambio: opts.usdBrlFallback },
    premissas: ASSUMPTIONS,
    itens,
    consumoMensalBrl: consumo,
    mensalidadeBrl: input.mensalidadeBrl,
    totalMensalBrl: Math.round((consumo + input.mensalidadeBrl) * 100) / 100,
    aviso: 'Projeção para apresentação comercial. O consumo real é medido por execução e cobrado conforme o uso.',
  };
}
