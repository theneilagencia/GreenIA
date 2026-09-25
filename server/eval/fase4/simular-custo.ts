// Custo estimado por execução, por assistente de referência, para documentos de
// 5, 20, 50 e 150 páginas, em Haiku 4.5 e Sonnet 5, com a leitura por partes.
// Estimativa com modelo simulado (premissas do simulador da plataforma), a ser
// substituída pelas rodadas com o modelo real.
//   node --experimental-strip-types eval/fase4/simular-custo.ts [--resultado <json>]
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assistantDefinitionSchema } from '../../src/assistants/schema.ts';
import { ASSUMPTIONS, ROTULO_ESTIMATIVA, estimarExecucao, partesPara } from '../../src/usage/simulate.ts';
import { PRICES_USD } from '../../src/usage/pricing.ts';
import { args, gravarJson } from './lib.ts';

export const USD_BRL = 5.5;                                    // câmbio da tabela de preços da plataforma (migração 011)
export const PAGINAS = [5, 20, 50, 150] as const;
export const MODELOS = ['claude-haiku-4-5', 'claude-sonnet-5'] as const;
const CATALOGO = new URL('../../catalog/modelos/', import.meta.url);
const DEMO = new URL('../../deploy/demo/tenant-demo.json', import.meta.url);

const brl = (m: typeof MODELOS[number], tin: number, tout: number) => Math.round((tin * PRICES_USD[m].inputPerMTok + tout * PRICES_USD[m].outputPerMTok) / 1e6 * USD_BRL * 100) / 100;

export function tabela() {
  const referencia = new Set((JSON.parse(readFileSync(DEMO, 'utf8')).assistentes as { modelo: string }[]).map(a => a.modelo));
  const modelos = readdirSync(CATALOGO).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(new URL(f, CATALOGO), 'utf8')));
  return modelos.map(t => {
    const def = assistantDefinitionSchema.parse(t.definition);
    return {
      modelo: t.slug, nome: t.name, referencia: referencia.has(t.slug),
      blocosComModelo: def.pipeline.filter(p => ['extrair', 'resumir', 'consultar'].includes(p.bloco) || (['classificar', 'checklist'].includes(p.bloco) && (p.params as { metodo?: string }).metodo === 'modelo')).map(p => p.bloco),
      porPaginas: PAGINAS.map(n => {
        const e = estimarExecucao(def, n);
        const d = estimarExecucao(def, n, { percentualDigitalizado: 100 });
        return { paginas: n, partes: partesPara(n), chamadas: e.chamadas, tokensEntrada: e.tokensEntrada, tokensSaida: e.tokensSaida, custoBrl: Object.fromEntries(MODELOS.map(m => [m, brl(m, e.tokensEntrada, e.tokensSaida)])),
          ...(d.tokensEntrada !== e.tokensEntrada ? { digitalizado: { chamadas: d.chamadas, custoBrl: Object.fromEntries(MODELOS.map(m => [m, brl(m, d.tokensEntrada, d.tokensSaida)])) } } : {}) };
      }),
    };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { resultado: '' });
  const t = tabela();
  for (const r of t) console.log(`${r.nome}${r.referencia ? ' (referência)' : ''}: ${r.porPaginas.map(p => `${p.paginas} p. → ${p.chamadas} chamada(s), Haiku R$ ${p.custoBrl['claude-haiku-4-5']}, Sonnet R$ ${p.custoBrl['claude-sonnet-5']}${p.digitalizado ? ` (escaneado: Haiku R$ ${p.digitalizado.custoBrl['claude-haiku-4-5']}, Sonnet R$ ${p.digitalizado.custoBrl['claude-sonnet-5']})` : ''}`).join(' | ')}`);
  if (a.resultado) gravarJson(a.resultado, { natureza: ROTULO_ESTIMATIVA, usdBrl: USD_BRL, premissas: ASSUMPTIONS, precosUsdPorMTok: Object.fromEntries(MODELOS.map(m => [m, PRICES_USD[m]])), assistentes: t });
}
