// Frente LGPD sem modelo: leitura e classificação por regras (os blocos reais,
// com o modelo organizacao-evidencias do catálogo), comparadas com o gabarito
// documento × categoria. Serve à matriz de três estados: por documento e
// categoria, "presente" = o documento pertence à categoria.
//   node --experimental-strip-types eval/fase4/avaliar-lgpd-offline.ts [--saida eval/fase4/saida] [--resultado <json>]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistantDefinitionSchema } from '../../src/assistants/schema.ts';
import { readFile } from '../../src/blocks/ler.ts';
import { classificarBlock, type LinhaIndice } from '../../src/blocks/classificar.ts';
import type { BlockEnv, RunContext } from '../../src/blocks/types.ts';
import { args, gravarJson, sha256 } from './lib.ts';
import { gabaritosEm } from './validar.ts';
import { conjuntoDe, exigirConjunto, type Conjunto } from './dividir.ts';
import type { Par } from './pontuar.ts';

const TEMPLATE = JSON.parse(readFileSync(new URL('../../catalog/modelos/organizacao-evidencias.json', import.meta.url), 'utf8'));

export interface CasoLgpd { caso: string; categorias: string[]; documentos: { arquivo: string; esperado: string | null; obtido: string | null; confianca: 'alta' | 'baixa' }[] }

export async function avaliarLgpd(dir: string, conjunto: Conjunto = 'desenvolvimento'): Promise<CasoLgpd[]> {
  const def = assistantDefinitionSchema.parse(TEMPLATE.definition);
  const step = def.pipeline.find(s => s.bloco === 'classificar')!;
  const categorias = (step.params as { taxonomia: { id: string }[] }).taxonomia.map(t => t.id);
  const env: BlockEnv = { async complete() { throw new Error('sem modelo nesta avaliação'); }, async searchKnowledge() { return []; }, keyUserContact: '', now: () => new Date(), readers: [], visionAllowedByPolicy: false };
  const out: CasoLgpd[] = [];
  for (const f of gabaritosEm(join(dir, 'lgpd'))) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    if (conjuntoDe(g.caso) !== conjunto) continue;
    const docs = [];
    for (const a of g.arquivos) {
      const bytes = new Uint8Array(readFileSync(join(f, '..', a.nome)));
      docs.push(await readFile({ id: a.nome, name: a.nome, mime: '', sha256: sha256(bytes), bytes }, { paginasMax: 2000, ocrMinConfidence: 70, visionFallback: false }, env));
    }
    const ctx: RunContext = { def, text: '', files: [], docs, sections: [], env };
    const idx = ((await classificarBlock(ctx, step)).data as { indice: LinhaIndice[] }).indice;
    const esperado = new Map((g.esperado.documentos as { arquivo: string; categoria: string | null }[]).map(d => [d.arquivo, d.categoria]));
    out.push({ caso: g.caso, categorias, documentos: g.arquivos.map((a: { nome: string }) => {
      const r = idx.find(x => x.arquivo === a.nome);
      return { arquivo: a.nome, esperado: esperado.get(a.nome) ?? null, obtido: r?.categoria ?? null, confianca: r?.confianca ?? 'baixa' };
    }) });
  }
  return out;
}

// Documento × categoria. Categoria com confiança baixa, ou documento não
// classificado (vai para revisão), fica duvidoso.
export function paresLgpd(casos: CasoLgpd[]): Par[] {
  return casos.flatMap(c => c.documentos.flatMap(d => c.categorias.map(cat => ({
    caso: c.caso, unidade: `${d.arquivo}:${cat}`,
    gabarito: d.esperado === cat ? 'presente' as const : 'ausente' as const,
    plataforma: !d.obtido || (d.obtido === cat && d.confianca === 'baixa') ? 'duvidoso' as const : d.obtido === cat ? 'presente' as const : 'ausente' as const,
  }))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', resultado: '', conjunto: 'desenvolvimento', 'rodada-final': 'nao' });
  const conjunto = exigirConjunto(a.conjunto, a['rodada-final'] === 'sim', 'avaliar-lgpd-offline');
  avaliarLgpd(a.saida, conjunto).then(rs => {
    console.log(JSON.stringify(rs.map(r => ({ caso: r.caso, certos: r.documentos.filter(d => d.esperado === d.obtido).length, total: r.documentos.length }))));
    if (a.resultado) gravarJson(a.resultado, { conjunto, casos: rs });
  });
}
