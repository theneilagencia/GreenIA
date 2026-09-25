// Custo e tempo da leitura por partes, nos pacotes do Financeiro do conjunto de
// desenvolvimento, com o modelo do catálogo (ler, extrair, resumir). Sem chamar
// o modelo: um modelo simulado conta as chamadas e os tokens (4 caracteres por
// token), e o custo sai da tabela de preços. Compara o jeito antigo (50 páginas,
// uma chamada por documento) com a leitura por partes, e diz se a página de cada
// valor do gabarito chega ao modelo.
//   node --experimental-strip-types eval/fase4/medir-leitura-longa.ts [--saida eval/fase4/saida] [--resultado <json>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistantDefinitionSchema } from '../../src/assistants/schema.ts';
import { readFile } from '../../src/blocks/ler.ts';
import { extrairBlock } from '../../src/blocks/extrair.ts';
import { resumirBlock } from '../../src/blocks/consultar.ts';
import type { BlockEnv, ReadDoc, RunContext } from '../../src/blocks/types.ts';
import { PRICES_USD } from '../../src/usage/pricing.ts';
import { args, gravarJson, sha256 } from './lib.ts';
import { gabaritosEm } from './validar.ts';
import { conjuntoDe } from './dividir.ts';

const TEMPLATE = JSON.parse(readFileSync(new URL('../../catalog/modelos/resumo-financeiro-mensal.json', import.meta.url), 'utf8'));
const USD_BRL = 5.4;                                         // mesma ordem da tabela de preços da plataforma
const MODELOS = ['claude-haiku-4-5', 'claude-sonnet-5'] as const;

interface Chamada { etapa: string; entrada: number; saida: number; paginas: Record<string, number[]> }

function envSimulado(chamadas: Chamada[]): BlockEnv {
  return {
    async complete(req) {
      const texto = [req.system, ...req.content.map(c => (c.type === 'text' ? c.text : ''))].join('\n');
      // Páginas recebidas por documento ("### Documento: nome" seguido de "=== Página N ===").
      const paginas: Record<string, number[]> = {};
      for (const bloco of texto.split(/^### Documento: /m).slice(1)) {
        const nome = bloco.split('\n')[0].trim();
        (paginas[nome] ??= []).push(...[...bloco.matchAll(/=== Página (\d+) ===/g)].map(m => Number(m[1])));
      }
      const saida = req.purpose.startsWith('extração') ? JSON.stringify({ campos: { periodo: null, receita_total: null, despesa_total: null, resultado: null }, origem: [] })
        : TEMPLATE.definition.pipeline.find((s: { bloco: string }) => s.bloco === 'resumir').params.topicos.map((t: string) => `## ${t}\n${'palavra '.repeat(70)}`).join('\n');
      chamadas.push({ etapa: req.purpose, entrada: Math.ceil(texto.length / 4), saida: Math.ceil(saida.length / 4), paginas });
      return { text: saida, model: 'simulado', stopReason: 'end_turn', usage: { inputTokens: Math.ceil(texto.length / 4), outputTokens: Math.ceil(saida.length / 4) } };
    },
    async searchKnowledge() { return []; }, keyUserContact: '', now: () => new Date(), readers: [], visionAllowedByPolicy: false,
  };
}

const custo = (cs: Chamada[], m: typeof MODELOS[number]) => {
  const p = PRICES_USD[m];
  const usd = cs.reduce((n, c) => n + c.entrada * p.inputPerMTok + c.saida * p.outputPerMTok, 0) / 1e6;
  return Math.round(usd * USD_BRL * 100) / 100;
};

async function rodar(dir: string, g: { arquivos: { nome: string }[] }, modo: 'antigo' | 'partes') {
  const def = assistantDefinitionSchema.parse(TEMPLATE.definition);
  const chamadas: Chamada[] = [];
  const env = envSimulado(chamadas);
  const t0 = Date.now();
  const docs: ReadDoc[] = [];
  for (const a of g.arquivos) {
    const bytes = new Uint8Array(readFileSync(join(dir, a.nome)));
    docs.push(await readFile({ id: a.nome, name: a.nome, mime: '', sha256: sha256(bytes), bytes }, { paginasMax: modo === 'antigo' ? 50 : 2000, ocrMinConfidence: 70, visionFallback: false }, env));
  }
  const tLeitura = Date.now() - t0;
  const ctx: RunContext = { def, text: '', files: [], docs, sections: [], env };
  const t1 = Date.now();
  for (const step of def.pipeline.filter(s => s.bloco === 'extrair' || s.bloco === 'resumir')) {
    const s = modo === 'antigo' ? { ...step, params: { ...step.params, caracteresPorParte: 400_000 } } : step;
    ctx.sections.push(await (step.bloco === 'extrair' ? extrairBlock(ctx, s) : resumirBlock(ctx, s)));
  }
  return { chamadas, docs, msLeitura: tLeitura, msPlataforma: Date.now() - t1 };
}

export async function medir(saida: string) {
  const out = [];
  for (const f of gabaritosEm(join(saida, 'financeiro'))) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    if (conjuntoDe(g.caso) !== 'desenvolvimento') continue;
    const dir = join(f, '..');
    const linha: Record<string, unknown> = { caso: g.caso, variacao: g.variacao };
    for (const modo of ['antigo', 'partes'] as const) {
      const r = await rodar(dir, g, modo);
      // Páginas do gabarito (valor e página) que chegaram ao modelo na extração.
      const vistas = new Map<string, Set<number>>();
      for (const c of r.chamadas.filter(c => c.etapa.startsWith('extração'))) for (const [nome, ps] of Object.entries(c.paginas)) for (const n of ps) (vistas.get(nome) ?? vistas.set(nome, new Set()).get(nome)!).add(n);
      const esperadas = (g.esperado.campos as { arquivo: string; pagina: number | null }[]).filter(c => c.pagina);
      const chegaram = esperadas.filter(c => vistas.get(c.arquivo)?.has(c.pagina!)).length;
      linha[modo] = {
        paginasLidas: r.docs.reduce((n, d) => n + d.pages.length, 0),
        paginasNaoLidas: r.docs.flatMap(d => (d.paginasNaoLidas ? [`${d.name}: ${d.paginasNaoLidas.paginas}`] : [])),
        chamadas: r.chamadas.length,
        tokensEntrada: r.chamadas.reduce((n, c) => n + c.entrada, 0),
        tokensSaida: r.chamadas.reduce((n, c) => n + c.saida, 0),
        custoBrl: Object.fromEntries(MODELOS.map(m => [m, custo(r.chamadas, m)])),
        valoresDoGabaritoQueChegamAoModelo: `${chegaram} de ${esperadas.length}`,
        msLeitura: r.msLeitura, msPlataforma: r.msPlataforma,
      };
    }
    out.push(linha);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', resultado: '' });
  medir(a.saida).then(rs => {
    console.log(JSON.stringify(rs, null, 2));
    if (a.resultado) gravarJson(a.resultado, { conjunto: 'desenvolvimento', natureza: 'medição de desenvolvimento, não é estimativa de acerto', usdBrl: USD_BRL, tokensPorCaractere: 0.25, pacotes: rs });
  });
}
