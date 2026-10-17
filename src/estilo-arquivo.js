// Identidade visual de um arquivo enviado (PDF, PPTX, DOCX): cores de destaque e fontes, lidas no servidor, sem IA e
// sem enviar o arquivo a ninguém. Serve para "faça no mesmo layout": a peça visual e os arquivos do Office seguem as
// cores e as fontes do material. É uma leitura aproximada e só de estilo (nunca do conteúdo):
//  - PPTX/DOCX: o tema do arquivo (cores de destaque accent1..6 e as fontes de título e de corpo), que é exato;
//  - PDF: as cores de preenchimento usadas no desenho das páginas (operadores rg/k), sem decodificar imagens, e os
//    nomes das fontes embutidas. Fotos não contam: só o que foi desenhado como cor.
import { inflateSync } from 'node:zlib';

const MAX_DESCOMPACTADO = 8 * 1048576, MAX_FLUXOS = 400;
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const SERIFADAS = /times|georgia|garamond|serif(?!.*sans)|merriweather|playfair|cambria|baskerville|bodoni|didot|palatino|book ?antiqua|lora|caslon|minion|libre ?baskerville/i;

// Cor de destaque: nem quase branca, nem quase preta, nem cinza.
function hsl(c) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
const destaque = c => { const { s, l } = hsl(c); return s >= 0.25 && l >= 0.12 && l <= 0.85; };
const limparFonte = n => String(n || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](Bold|Italic|Regular|Light|Medium|Semibold|SemiBold|Black|Oblique|BoldItalic|MT|PSMT)+$/gi, '').replace(/MT$|PSMT$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();

function resumo(contagem, fontes) {
  const cores = [...contagem.entries()].filter(([c]) => destaque(c)).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  // Tons muito próximos contam como um só (o mesmo azul em 2 arredondamentos).
  const distintas = [];
  for (const c of cores) if (!distintas.some(d => [1, 3, 5].every(i => Math.abs(parseInt(c.slice(i, i + 2), 16) - parseInt(d.slice(i, i + 2), 16)) < 24))) distintas.push(c);
  const nomes = [...new Set(fontes.map(limparFonte).filter(n => n && !/^(Symbol|ZapfDingbats|Wingdings)/i.test(n)))];
  if (!distintas.length && !nomes.length) return null;
  return { cores: distintas.slice(0, 4), fontes: nomes.slice(0, 4), serif: nomes.length ? SERIFADAS.test(nomes[0]) : false };
}

export function estiloDoPdf(b) {
  const contagem = new Map(), fontes = [];
  const contar = (c, n = 1) => contagem.set(c, (contagem.get(c) || 0) + n);
  const lerTexto = s => {
    for (const m of s.matchAll(/(?:^|[\s\]])(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(rg|sc|scn)\b/g)) contar(hex(m[1] * 255, m[2] * 255, m[3] * 255));
    for (const m of s.matchAll(/(?:^|[\s\]])(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+k\b/g)) { const [c, y, mg, k] = [m[1], m[3], m[2], m[4]].map(Number); contar(hex(255 * (1 - c) * (1 - k), 255 * (1 - mg) * (1 - k), 255 * (1 - y) * (1 - k))); }
    for (const m of s.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-_,#]+)/g)) fontes.push(m[1].replace(/#20/g, ' '));
  };
  const bruto = b.toString('latin1');
  lerTexto(bruto.replace(/stream\r?\n[\s\S]*?endstream/g, ''));   // dicionários fora dos fluxos (fontes)
  let total = 0, n = 0;
  const re = /<<((?:(?!>>\s*stream)[\s\S]){0,2000})>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(bruto)) && n < MAX_FLUXOS && total < MAX_DESCOMPACTADO) {
    const dic = m[1];
    if (/\/Subtype\s*\/Image|\/Type\s*\/XRef|\/(DCT|JPX|JBIG2|CCITTFax)Decode|\/Length1|\/FontFile/.test(dic)) continue;
    const tam = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dic)?.[1]);
    const ini = m.index + m[0].length;
    const fimEst = Number.isFinite(tam) && tam > 0 ? ini + tam : bruto.indexOf('endstream', ini);
    if (fimEst <= ini) continue;
    const dados = b.subarray(ini, fimEst);
    let s;
    try { s = /FlateDecode/.test(dic) ? inflateSync(dados, { maxOutputLength: MAX_DESCOMPACTADO - total }).toString('latin1') : /\/Filter/.test(dic) ? null : dados.toString('latin1'); } catch { s = null; }
    if (!s) continue;
    total += s.length; n++;
    lerTexto(s);
  }
  return resumo(contagem, fontes);
}

// Tema de um arquivo do Office (pptx: ppt/theme/theme1.xml; docx: word/theme/theme1.xml).
export function estiloDoTema(xml) {
  if (!xml) return null;
  const contagem = new Map();
  [...xml.matchAll(/<a:accent([1-6])>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/g)].forEach((m, i) => contagem.set(`#${m[2].toUpperCase()}`, 10 - i));
  const fonte = t => /<a:latin typeface="([^"]+)"/.exec(/<a:(?:major|minor)Font>[\s\S]*?<\/a:(?:major|minor)Font>/.exec(xml.slice(xml.indexOf(`<a:${t}Font>`)))?.[0] || '')?.[1];
  const fontes = [fonte('major'), fonte('minor')].filter(Boolean);
  return resumo(contagem, fontes);
}

// Texto curto para o pedido de estilo da produção visual (cores em código, "serifada" quando for o caso).
export const estiloComoTexto = e => (e ? [...(e.cores || []).slice(0, 2), e.serif ? 'serifada' : ''].filter(Boolean).join(' ') : '');
