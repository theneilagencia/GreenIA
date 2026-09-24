// Comparador da frente RH, sem modelo: roda os blocos reais da plataforma
// (leitura e checklist por regras, com a definição do modelo do catálogo) em
// cada caso e compara item a item com o gabarito. Serve de linha de base antes
// da rodada com o modelo real e testa o próprio comparador.
//   node --experimental-strip-types eval/fase4/avaliar-rh-offline.ts --saida eval/fase4/saida [--ocr sim]
//     [--conjunto desenvolvimento|reservado] [--rodada-final sim]
// O padrão é o conjunto de desenvolvimento. O reservado só roda com --rodada-final
// sim, cada uso fica em resultados/uso-do-reservado.log e a saída traz só o resumo.
// Com --ocr sim, as imagens (variação sintética ou fotos) passam pelo OCR local
// (OCRmyPDF/Tesseract); a visão do modelo fica desligada.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistantDefinitionSchema } from '../../src/assistants/schema.ts';
import { readFile } from '../../src/blocks/ler.ts';
import { checklistBlock, type ResultadoChecklist } from '../../src/blocks/checklist.ts';
import type { BlockEnv, RunContext } from '../../src/blocks/types.ts';
import { LocalConverter } from '../../src/convert/converter.ts';
import { args, gravarJson, sha256 } from './lib.ts';
import { gabaritosEm } from './validar.ts';
import { conjuntoDe, exigirConjunto, type Conjunto } from './dividir.ts';

const TEMPLATE = JSON.parse(readFileSync(new URL('../../catalog/modelos/checklist-documentos-admissao.json', import.meta.url), 'utf8'));

export interface ResultadoCaso { caso: string; variacao: string; itens: { item: string; esperado: string; obtido: string }[]; acertos: number; total: number; errosGraves: string[]; segundos: number }

export async function avaliarRh(dir: string, opts: { ocr?: boolean; conjunto?: Conjunto } = {}): Promise<ResultadoCaso[]> {
  const conjunto = opts.conjunto ?? 'desenvolvimento';
  const def = assistantDefinitionSchema.parse(TEMPLATE.definition);
  const step = def.pipeline.find(s => s.bloco === 'checklist')!;
  const e = process.env;
  const converter = opts.ocr ? new LocalConverter({ OCRMYPDF_CMD: e.OCRMYPDF_CMD || 'ocrmypdf', OCR_LANG: e.OCR_LANG || 'por', MAGICK_CMD: e.MAGICK_CMD || 'convert', SOFFICE_CMD: e.SOFFICE_CMD || 'soffice', CONVERT_TIMEOUT_S: 120 }) : undefined;
  const env: BlockEnv = {
    async complete() { throw new Error('sem modelo nesta avaliação'); },
    async searchKnowledge() { return []; }, keyUserContact: '', now: () => new Date(), converter, readers: [],
    visionAllowedByPolicy: false, async screen() { return []; }, async record() {},
  };
  const out: ResultadoCaso[] = [];
  for (const f of gabaritosEm(join(dir, 'rh'))) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    const c = conjuntoDe(g.caso);
    if (!c) throw new Error(`caso ${g.caso} fora da divisão congelada`);
    if (c !== conjunto) continue;
    const casoDir = join(f, '..');
    const t0 = Date.now();
    const docs = [];
    for (const a of g.arquivos) {
      const bytes = new Uint8Array(readFileSync(join(casoDir, a.nome)));
      docs.push(await readFile({ id: a.nome, name: a.nome, mime: '', sha256: sha256(bytes), bytes }, { paginasMax: 20, ocrMinConfidence: 70, visionFallback: false }, env));
    }
    const ctx: RunContext = { def, text: '', files: [], docs, sections: [], env };
    const r = (await checklistBlock(ctx, step)).data as ResultadoChecklist;
    const itens = (g.esperado.itens as { item: string; situacao: string }[]).map(e => ({ item: e.item, esperado: e.situacao, obtido: r.itens.find(i => i.id === e.item)?.status ?? 'ausente' }));
    out.push({ caso: g.caso, variacao: g.variacao, itens, acertos: itens.filter(i => i.esperado === i.obtido).length, total: itens.length,
      errosGraves: itens.filter(i => i.obtido === 'presente' && i.esperado === 'ausente').map(i => i.item), segundos: (Date.now() - t0) / 1000 });
  }
  return out;
}

export function resumo(rs: ResultadoCaso[]) {
  const total = rs.reduce((n, r) => n + r.total, 0);
  const acertos = rs.reduce((n, r) => n + r.acertos, 0);
  const porItem: Record<string, { acertos: number; total: number }> = {};
  const confusao: Record<string, number> = {};
  for (const r of rs) for (const i of r.itens) {
    porItem[i.item] ??= { acertos: 0, total: 0 };
    porItem[i.item].total++; if (i.esperado === i.obtido) porItem[i.item].acertos++;
    const k = `${i.esperado}→${i.obtido}`; confusao[k] = (confusao[k] ?? 0) + 1;
  }
  return { casos: rs.length, itens: total, acerto: total ? Math.round(acertos / total * 1000) / 10 : null, errosGraves: rs.flatMap(r => r.errosGraves.map(i => `${r.caso}:${i}`)), porItem, confusao };
}

// No reservado, só números agregados: nenhum caso, item ou nome de arquivo que
// permita corrigir olhando para ele.
export function resumoReservado(rs: ResultadoCaso[]) {
  const s = resumo(rs);
  return { casos: s.casos, itens: s.itens, acerto: s.acerto, errosGraves: s.errosGraves.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', ocr: 'nao', resultado: '', conjunto: 'desenvolvimento', 'rodada-final': 'nao', motivo: 'rodada final' });
  const conjunto = exigirConjunto(a.conjunto, a['rodada-final'] === 'sim', `avaliar-rh-offline ocr=${a.ocr} motivo=${a.motivo}`);
  avaliarRh(a.saida, { ocr: a.ocr === 'sim', conjunto }).then(rs => {
    const s = conjunto === 'reservado' ? resumoReservado(rs) : resumo(rs);
    console.log(JSON.stringify(s, null, 2));
    if (a.resultado) gravarJson(a.resultado, conjunto === 'reservado' ? { conjunto, resumo: s } : { conjunto, resumo: s, casos: rs });
  });
}
