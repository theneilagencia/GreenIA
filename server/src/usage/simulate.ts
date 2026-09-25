// Simulador de custo mensal por assistente: execuções por mês × páginas por
// execução → tokens → reais, pela tabela de preços vigente. Usa as médias
// medidas nas execuções do assistente quando existem ("medido"); senão, as
// premissas abaixo ("premissa"). Serve para apresentar mensalidade e consumo
// antes da contratação: é projeção, não resultado.
import { z } from 'zod';
import type { Tx } from '../db/pool.ts';
import { costBrl, currentPrice, priceCost } from './pricing.ts';

// Página digitalizada: o OCR local lê sem custo de modelo, e o texto dela
// conta como página de texto quando vai ao modelo. Só a parcela que cai no
// fallback de visão (OCR abaixo do limiar, com o assistente permitindo) paga a
// imagem na entrada e a transcrição na saída.
export const ASSUMPTIONS = {
  tokensPorPaginaTexto: 750,         // ~3.000 caracteres por página, ~4 caracteres por token (vale para o texto do OCR)
  tokensPorPaginaVisao: 2300,        // página A4 enviada como JPEG de até 1568 px (largura × altura / 750)
  tokensSaidaPorPaginaVisao: 750,    // transcrição da página pelo modelo
  percentualFallbackVisao: 10,       // das páginas digitalizadas, quantas caem no fallback (premissa até medir)
  tokensFixosPorExecucao: 1200,      // instruções, schema e contexto de cada chamada
  tokensSaidaPorExecucao: 800,       // resposta do modelo por execução
  segundosOcrPorPagina: 2.5,         // CPU do servidor por página no OCR (informativo: não entra no consumo)
  caracteresPorPagina: 3000,
  caracteresPorParte: 120_000,       // leitura por partes: documento maior vai em mais de uma chamada (≈ 40 páginas por chamada)
};

// Chamadas ao modelo para ler um documento de N páginas por partes.
export const partesPara = (paginas: number, caracteresPorParte = ASSUMPTIONS.caracteresPorParte) =>
  Math.max(1, Math.ceil(paginas * ASSUMPTIONS.caracteresPorPagina / caracteresPorParte));

export const ROTULO_ESTIMATIVA = 'estimativa com modelo simulado, a substituir pelas rodadas com o modelo real';

// Estimativa de uma execução pela definição do assistente: cada bloco que chama o
// modelo, com a leitura por partes (extração: uma chamada por parte; resumo: um
// parcial por parte e uma consolidação). Blocos em código (ler, conferir,
// checklist e classificação por regras, busca, exportação) não consomem tokens.
type Passo = { bloco: string; params?: Record<string, unknown> };
export function estimarExecucao(def: { pipeline: Passo[]; reading?: { visionFallback?: boolean } }, paginas: number, opts: { percentualDigitalizado?: number } = {}) {
  const A = ASSUMPTIONS;
  let chamadas = 0, tin = 0, tout = 0;
  // Página digitalizada: OCR local sem custo; a parcela abaixo do limiar vai à visão, se o assistente permitir.
  const visao = def.reading?.visionFallback && def.pipeline.some(p => p.bloco === 'ler') ? paginas * (opts.percentualDigitalizado ?? 0) / 100 * A.percentualFallbackVisao / 100 : 0;
  if (visao) { chamadas += Math.ceil(visao); tin += visao * A.tokensPorPaginaVisao; tout += visao * A.tokensSaidaPorPaginaVisao; }
  const texto = paginas * A.tokensPorPaginaTexto;
  for (const p of def.pipeline) {
    const params = p.params ?? {};
    const cpp = Number(params.caracteresPorParte ?? A.caracteresPorParte);
    const partes = partesPara(paginas, cpp);
    if (p.bloco === 'extrair') {
      const schema = Math.ceil(JSON.stringify(params.schema ?? {}).length / 4);
      chamadas += partes; tin += texto + partes * (A.tokensFixosPorExecucao + schema); tout += partes * A.tokensSaidaPorExecucao;
    } else if (p.bloco === 'resumir') {
      const saida = Math.ceil(Number(params.palavrasMax ?? 600) * 1.4);
      if (partes === 1) { chamadas += 1; tin += texto + A.tokensFixosPorExecucao; tout += saida; }
      else { chamadas += partes + 1; tin += texto + partes * A.tokensFixosPorExecucao + A.tokensFixosPorExecucao + partes * saida; tout += (partes + 1) * saida; }
    } else if ((p.bloco === 'classificar' || p.bloco === 'checklist') && params.metodo === 'modelo') {
      chamadas += 1; tin += A.tokensFixosPorExecucao + Math.min(texto, 750); tout += 300;
    } else if (p.bloco === 'consultar') {
      chamadas += 1; tin += A.tokensFixosPorExecucao + 2000; tout += 500;
    }
  }
  return { chamadas, tokensEntrada: Math.round(tin), tokensSaida: Math.round(tout) };
}

export const simulateSchema = z.object({
  mensalidadeBrl: z.number().min(0).default(0),
  modelo: z.string().max(120).optional(),
  itens: z.array(z.object({
    nome: z.string().trim().min(1).max(120),
    assistente: z.string().max(80).optional(),           // usa as médias medidas deste assistente, se houver
    execucoesPorMes: z.number().int().min(0).max(1_000_000),
    paginasPorExecucao: z.number().min(0).max(5000).default(1),
    percentualDigitalizado: z.number().min(0).max(100).default(0),   // páginas escaneadas ou fotos (passam pelo OCR local)
    percentualFallbackVisao: z.number().min(0).max(100).optional(), // das digitalizadas, quantas vão à visão; sem valor: a premissa
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
    let tin = 0, tout = 0, base: string, chamadas: number | null = null;
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
      // Documento acima do limite por chamada é lido por partes: cada parte repete
      // as instruções e devolve a sua resposta.
      const dig = it.percentualDigitalizado / 100;
      const visao = it.paginasPorExecucao * dig * (it.percentualFallbackVisao ?? ASSUMPTIONS.percentualFallbackVisao) / 100;
      const partes = partesPara(it.paginasPorExecucao);
      tin = partes * ASSUMPTIONS.tokensFixosPorExecucao + it.paginasPorExecucao * ASSUMPTIONS.tokensPorPaginaTexto + visao * ASSUMPTIONS.tokensPorPaginaVisao;
      tout = partes * ASSUMPTIONS.tokensSaidaPorExecucao + visao * ASSUMPTIONS.tokensSaidaPorPaginaVisao;
      chamadas = partes;
      base = `premissa (sem histórico suficiente: mínimo de 5 execuções); ${ROTULO_ESTIMATIVA}`;
    }
    const inTok = Math.round(tin * it.execucoesPorMes), outTok = Math.round(tout * it.execucoesPorMes);
    const paginas = Math.round(it.paginasPorExecucao * it.execucoesPorMes);
    const custo = price ? priceCost(price, inTok, outTok, paginas) : costBrl(model, inTok, outTok, opts.usdBrlFallback);
    itens.push({ nome: it.nome, execucoesPorMes: it.execucoesPorMes, paginasPorMes: paginas, tokensEntrada: inTok, tokensSaida: outTok, consumoBrl: Math.round(custo * 100) / 100, base, ...(chamadas !== null ? { chamadasPorExecucao: chamadas } : {}) });
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
