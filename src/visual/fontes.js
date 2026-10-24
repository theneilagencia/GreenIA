// Fontes da produção visual: arquivos TrueType empacotados (Inter e Source Serif 4, licença OFL, em
// src/visual/fontes). A medida do texto vem das próprias tabelas da fonte (cmap e hmtx), então a composição sabe
// exatamente quanto cada linha ocupa, e o mesmo arquivo vai para o PNG (resvg) e para o PDF (fonte embutida).
// Nenhuma fonte do sistema é usada: o resultado é igual em qualquer máquina.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'fontes');

// Famílias disponíveis. "sans" é a padrão; "serif" serve a títulos quando a marca pede um tom editorial.
export const FAMILIAS = {
  sans: { nome: 'Inter', pesos: { 400: 'inter-400.ttf', 600: 'inter-600.ttf', 700: 'inter-700.ttf' } },
  serif: { nome: 'Source Serif 4', pesos: { 400: 'source-serif-4-400.ttf', 600: 'source-serif-4-600.ttf', 700: 'source-serif-4-700.ttf' } },
};

function tabela(buf, tag) {
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (buf.toString('latin1', o, o + 4) === tag) return { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) };
  }
  return null;
}

// cmap formato 4 (BMP) -> Map(código -> glifo).
function lerCmap(buf) {
  const t = tabela(buf, 'cmap');
  const n = buf.readUInt16BE(t.off + 2);
  let sub = null;
  for (let i = 0; i < n; i++) {
    const o = t.off + 4 + i * 8, plat = buf.readUInt16BE(o), enc = buf.readUInt16BE(o + 2), off = buf.readUInt32BE(o + 4);
    if (buf.readUInt16BE(t.off + off) === 4 && (plat === 3 && enc === 1 || plat === 0)) { sub = t.off + off; if (plat === 3) break; }
  }
  const mapa = new Map();
  if (sub === null) return mapa;
  const segX2 = buf.readUInt16BE(sub + 6), seg = segX2 / 2;
  const fins = sub + 14, inicios = fins + segX2 + 2, deltas = inicios + segX2, ranges = deltas + segX2;
  for (let s = 0; s < seg; s++) {
    const fim = buf.readUInt16BE(fins + s * 2), ini = buf.readUInt16BE(inicios + s * 2);
    const delta = buf.readInt16BE(deltas + s * 2), ro = buf.readUInt16BE(ranges + s * 2);
    for (let c = ini; c <= fim && c !== 0xffff; c++) {
      let g;
      if (ro === 0) g = (c + delta) & 0xffff;
      else {
        const p = ranges + s * 2 + ro + (c - ini) * 2;
        g = buf.readUInt16BE(p);
        if (g) g = (g + delta) & 0xffff;
      }
      if (g) mapa.set(c, g);
    }
  }
  return mapa;
}

function lerNome(buf) {
  const t = tabela(buf, 'name');
  const n = buf.readUInt16BE(t.off + 2), strs = t.off + buf.readUInt16BE(t.off + 4);
  const achados = {};
  for (let i = 0; i < n; i++) {
    const o = t.off + 6 + i * 12, plat = buf.readUInt16BE(o), id = buf.readUInt16BE(o + 6), len = buf.readUInt16BE(o + 8), off = buf.readUInt16BE(o + 10);
    if (plat !== 3 || ![1, 4, 6, 16].includes(id)) continue;
    const b = buf.subarray(strs + off, strs + off + len);
    let s = ''; for (let k = 0; k + 1 < b.length; k += 2) s += String.fromCharCode(b.readUInt16BE(k));
    achados[id] ??= s;
  }
  return { familia: achados[16] || achados[1] || '', completo: achados[4] || '', postscript: (achados[6] || '').replace(/[^\w-]/g, '') };
}

const cache = new Map();
export function carregarFonte(familia = 'sans', peso = 400) {
  const f = FAMILIAS[familia] || FAMILIAS.sans;
  const p = f.pesos[peso] ? peso : peso >= 600 ? 700 : 400;
  const chave = `${familia}:${p}`;
  if (cache.has(chave)) return cache.get(chave);
  const arquivo = join(PASTA, f.pesos[p]);
  const buf = readFileSync(arquivo);
  const head = tabela(buf, 'head'), hhea = tabela(buf, 'hhea'), hmtx = tabela(buf, 'hmtx'), os2 = tabela(buf, 'OS/2');
  const upm = buf.readUInt16BE(head.off + 18);
  const bbox = [buf.readInt16BE(head.off + 36), buf.readInt16BE(head.off + 38), buf.readInt16BE(head.off + 40), buf.readInt16BE(head.off + 42)];
  const ascender = buf.readInt16BE(hhea.off + 4), descender = buf.readInt16BE(hhea.off + 6), lineGap = buf.readInt16BE(hhea.off + 8);
  const nMetricas = buf.readUInt16BE(hhea.off + 34);
  const avancos = [];
  for (let i = 0; i < nMetricas; i++) avancos.push(buf.readUInt16BE(hmtx.off + i * 4));
  const capHeight = os2 && os2.len >= 90 ? buf.readInt16BE(os2.off + 88) : Math.round(ascender * 0.7);
  const cmap = lerCmap(buf);
  const nome = lerNome(buf);
  const largura = new Map();
  const avancoDe = g => avancos[Math.min(g, avancos.length - 1)];
  for (const [c, g] of cmap) largura.set(c, avancoDe(g));
  const fonte = {
    familia, peso: p, arquivo, buf, upm, bbox, ascender, descender, lineGap, capHeight, nome, cmap,
    nomeCss: nome.familia || f.nome,
    // Largura de um caractere, em unidades da fonte (sem kerning: a medida nunca fica menor que o desenho).
    avanco: c => largura.get(c) ?? largura.get(0x3f) ?? upm * 0.5,
    tem: c => cmap.has(c),
  };
  cache.set(chave, fonte);
  return fonte;
}

export const arquivosDeFonte = () => Object.values(FAMILIAS).flatMap(f => Object.values(f.pesos).map(a => join(PASTA, a)));
export const nomeCss = familia => carregarFonte(familia, 400).nomeCss;

export function medir(texto, fonte, tamanho) {
  let u = 0;
  for (const ch of String(texto)) u += fonte.avanco(ch.codePointAt(0));
  return (u / fonte.upm) * tamanho;
}

// Texto seguro para as três saídas (SVG, PNG e PDF com codificação WinAnsi): só caracteres que a fonte desenha e
// que o PDF codifica. O resto vira o equivalente mais próximo (seta vira "->", aspas tipográficas ficam), ou sai.
const TROCAS = new Map(Object.entries({ '→': '->', '←': '<-', '⇒': '=>', '↔': '<->', '≥': '>=', '≤': '<=', '≠': '!=', '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '×': 'x',
  ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '−': '-', '‐': '-', '‑': '-', '→': '->', '▪': '•', '●': '•', '◦': '•', '■': '•', '□': '-', '☐': '-', '☑': 'v', '⚠': '!' }));
// WinAnsi (CP1252): 0x80-0x9F que não são Latin-1.
export const WINANSI = new Map([[0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89],
  [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]]);
export const codigoWinAnsi = cp => (cp >= 0x20 && cp < 0x7f) || (cp >= 0xa0 && cp <= 0xff) ? cp : WINANSI.get(cp) ?? null;
export function textoSeguro(texto, fonte = carregarFonte('sans', 400)) {
  let out = '';
  for (const ch of String(texto ?? '').normalize('NFC').replace(/[\r\t]/g, ' ')) {
    const t = TROCAS.get(ch);
    if (t !== undefined) { out += t; continue; }
    const cp = ch.codePointAt(0);
    if (ch === '\n') { out += ch; continue; }
    if (codigoWinAnsi(cp) !== null && fonte.tem(cp)) out += ch;
    else {
      // Letra com acento fora do conjunto: a letra sem o acento. Emoji e símbolo: sai.
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (base && base !== ch && [...base].every(c => codigoWinAnsi(c.codePointAt(0)) !== null)) out += base;
    }
  }
  return out.replace(/ {2,}/g, ' ');
}

// Quebra em linhas que cabem na largura. Palavra maior que a linha é partida (com hífen), nunca cortada.
export function quebrarLinhas(texto, fonte, tamanho, largura) {
  const linhas = [];
  let partidas = 0, largas = 0;
  for (const paragrafo of String(texto).split('\n')) {
    // Símbolo de moeda fica junto do número ("R$ 18.400,00" nunca se separa em duas linhas).
    const palavras = paragrafo.split(/(?<!(?:^|\s)(?:R\$|US\$|€|\$|nº|n\.º))\s+/).filter(Boolean);
    if (!palavras.length) { linhas.push(''); continue; }
    let atual = '';
    const espaco = medir(' ', fonte, tamanho);
    let larg = 0;
    for (let p of palavras) {
      let lp = medir(p, fonte, tamanho);
      // Número, valor e data nunca são partidos (o valor mudaria de sentido): a linha fica larga e a conferência
      // visual acusa; a correção resolve com escala ou colunas.
      if (lp > largura && /\d/.test(p)) {
        if (atual) linhas.push(atual);
        linhas.push(p); largas++;
        atual = ''; larg = 0; continue;
      }
      while (lp > largura && p.length > 1) {
        partidas++;
        // Parte a palavra longa (endereço, código) no ponto que cabe.
        let k = p.length - 1;
        const resto = atual ? largura - larg - espaco : largura;
        while (k > 1 && medir(p.slice(0, k) + '-', fonte, tamanho) > resto) k--;
        if (resto < medir(p.slice(0, 2) + '-', fonte, tamanho) && atual) { linhas.push(atual); atual = ''; larg = 0; continue; }
        const pedaco = p.slice(0, k) + '-';
        linhas.push(atual ? `${atual} ${pedaco}` : pedaco);
        atual = ''; larg = 0;
        p = p.slice(k); lp = medir(p, fonte, tamanho);
      }
      if (!atual) { atual = p; larg = lp; }
      else if (larg + espaco + lp <= largura + 0.01) { atual += ` ${p}`; larg += espaco + lp; }
      else { linhas.push(atual); atual = p; larg = lp; }
    }
    if (atual) linhas.push(atual);
  }
  // Metadados da quebra: palavras partidas à força e linhas mais largas que a caixa (para a conferência).
  Object.defineProperty(linhas, 'partidas', { value: partidas });
  Object.defineProperty(linhas, 'largas', { value: largas });
  return linhas;
}

// Métricas verticais em px para um tamanho: altura da linha e a distância do topo da linha à base do texto.
export function metricas(fonte, tamanho, entrelinha = 1.25) {
  const asc = (fonte.ascender / fonte.upm) * tamanho, desc = (-fonte.descender / fonte.upm) * tamanho;
  const linha = tamanho * entrelinha;
  return { linha, base: (linha - (asc + desc)) / 2 + asc, asc, desc, cap: (fonte.capHeight / fonte.upm) * tamanho };
}
