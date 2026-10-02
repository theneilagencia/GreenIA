// Renderização SVG de uma página composta. O SVG é a fonte do PNG e do JPG (resvg) e uma exportação por si.
// `embutirFontes`: o SVG baixado leva as fontes (base64), para abrir igual em qualquer lugar; o usado no PNG não
// precisa (o resvg carrega os mesmos arquivos de fonte).
import { hrefRenderizavel } from './webp.js';
import { carregarFonte, metricas } from './fontes.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = v => (Math.round(v * 100) / 100).toString();

function textoSvg(p) {
  const f = carregarFonte(p.familia, p.peso);
  const m = metricas(f, p.tam, p.lh / p.tam);
  const ancora = p.alin === 'middle' ? 'middle' : p.alin === 'end' ? 'end' : 'start';
  const x = p.alin === 'middle' ? p.x + p.w / 2 : p.alin === 'end' ? p.x + p.w : p.x;
  return p.linhas.map((l, i) => l ? `<text x="${n(x)}" y="${n(p.y + i * p.lh + m.base)}" font-family="${esc(f.nomeCss)}" font-weight="${f.peso}" font-size="${n(p.tam)}" fill="${p.cor}"${ancora !== 'start' ? ` text-anchor="${ancora}"` : ''} xml:space="preserve">${esc(l)}</text>` : '').join('');
}

export function svgDaPagina(pagina, { embutirFontes = false, id = 'p' } = {}) {
  const defs = [], corpo = [];
  let clip = 0;
  const usadas = new Set();
  for (const p of pagina.prims) {
    const op = p.opacidade !== undefined ? ` opacity="${p.opacidade}"` : '';
    switch (p.t) {
      case 'rect':
        corpo.push(`<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(Math.max(0, p.w))}" height="${n(Math.max(0, p.h))}"${p.r ? ` rx="${n(p.r)}"` : ''} fill="${p.fill || 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.sw || 1)}"` : ''}${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}${op}/>`);
        break;
      case 'line': corpo.push(`<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.cor}" stroke-width="${n(p.sw || 1)}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}${op}/>`); break;
      case 'circle': corpo.push(`<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${p.fill || 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.sw || 1)}"` : ''}${op}/>`); break;
      case 'path': {
        const e = p.escala || 1;
        const tr = p.dx || p.dy || e !== 1 ? ` transform="translate(${n(p.dx || 0)} ${n(p.dy || 0)})${e !== 1 ? ` scale(${n(e * 1000) / 1000})` : ''}"` : '';
        corpo.push(`<path d="${p.d}" fill="${p.fill || 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n((p.sw || 1) / e)}" stroke-linecap="round" stroke-linejoin="round"` : ''}${tr}${op}/>`);
        break;
      }
      case 'image': {
        const par = p.ajuste === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
        let cp = '';
        if (p.r) { const cid = `${id}c${clip++}`; defs.push(`<clipPath id="${cid}"><rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" rx="${n(p.r)}"/></clipPath>`); cp = ` clip-path="url(#${cid})"`; }
        corpo.push(`<image href="${hrefRenderizavel(p.href) || ''}" x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" preserveAspectRatio="${par}"${cp}/>`);
        break;
      }
      case 'text': corpo.push(textoSvg(p)); usadas.add(`${p.familia}:${carregarFonte(p.familia, p.peso).peso}`); break;
      default: break;
    }
  }
  if (embutirFontes && usadas.size) {
    const faces = [...usadas].map(k => { const [fa, pe] = k.split(':'); const f = carregarFonte(fa, Number(pe)); return `@font-face{font-family:'${f.nomeCss}';font-weight:${f.peso};src:url(data:font/ttf;base64,${f.buf.toString('base64')}) format('truetype');}`; });
    defs.push(`<style>${faces.join('')}</style>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pagina.w}" height="${pagina.h}" viewBox="0 0 ${pagina.w} ${pagina.h}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<rect width="${pagina.w}" height="${pagina.h}" fill="${pagina.fundo || '#FFFFFF'}"/>${corpo.join('')}</svg>`;
}
