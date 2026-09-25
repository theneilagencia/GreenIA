// Leitura por partes: documento longo não é cortado. As páginas são agrupadas
// em partes de até N caracteres, cada parte vai ao modelo numa chamada, e o
// resultado é consolidado no fim. A saída diz em quantas partes foi lido.
import type { ReadDoc } from './types.ts';

export const CARACTERES_POR_PARTE = 120_000;              // cerca de 30 mil tokens por chamada

type Pagina = ReadDoc['pages'][number];
export interface Parte { itens: { doc: ReadDoc; paginas: Pagina[] }[]; caracteres: number }

const paginasDe = (d: ReadDoc): Pagina[] => (d.pages.length ? d.pages : [{ n: 1, text: d.text }]);

// Agrupa as páginas dos documentos, em ordem, sem passar do limite por parte.
// Uma página maior que o limite fica sozinha na sua parte.
export function dividirEmPartes(docs: ReadDoc[], max = CARACTERES_POR_PARTE): Parte[] {
  const partes: Parte[] = [];
  let atual: Parte = { itens: [], caracteres: 0 };
  for (const d of docs) {
    for (const pg of paginasDe(d)) {
      const n = pg.text.length + 40;
      if (atual.caracteres && atual.caracteres + n > max) { partes.push(atual); atual = { itens: [], caracteres: 0 }; }
      const ult = atual.itens[atual.itens.length - 1];
      if (ult && ult.doc === d) ult.paginas.push(pg); else atual.itens.push({ doc: d, paginas: [pg] });
      atual.caracteres += n;
    }
  }
  if (atual.itens.length) partes.push(atual);
  return partes;
}

// "contrato.pdf, p. 1–40; anexo.pdf, p. 1–3"
export const descreverParte = (p: Parte) => p.itens.map(i => {
  const a = i.paginas[0].n, b = i.paginas[i.paginas.length - 1].n;
  return `${i.doc.name}, p. ${a === b ? a : `${a}–${b}`}`;
}).join('; ');
