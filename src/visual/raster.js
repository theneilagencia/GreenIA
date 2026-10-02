// PNG e JPG a partir do SVG da página (resvg, com as fontes empacotadas; nenhuma fonte do sistema). Também serve
// de decodificador universal de imagem (PNG, JPEG, WEBP, GIF e SVG viram pixels RGBA) para o PDF.
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { arquivosDeFonte } from './fontes.js';
import { svgDaPagina } from './svg.js';

const OPCOES_FONTE = () => ({ fontFiles: arquivosDeFonte(), loadSystemFonts: false, defaultFontFamily: 'Inter' });

export function rasterizarSvg(svg, { largura = null } = {}) {
  const r = new Resvg(svg, { font: OPCOES_FONTE(), ...(largura ? { fitTo: { mode: 'width', value: Math.round(largura) } } : {}), imageRendering: 0, shapeRendering: 2, textRendering: 1 });
  return r.render();
}

export function pngDaPagina(pagina, escala = 1) {
  const img = rasterizarSvg(svgDaPagina(pagina), { largura: pagina.w * escala });
  return { bytes: img.asPng(), w: img.width, h: img.height };
}

// RGBA -> JPG (fundo branco onde houver transparência).
export function jpgDeRgba(rgba, w, h, qualidade = 90) {
  const d = Buffer.from(rgba);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a < 1) { d[i] = d[i] * a + 255 * (1 - a); d[i + 1] = d[i + 1] * a + 255 * (1 - a); d[i + 2] = d[i + 2] * a + 255 * (1 - a); d[i + 3] = 255; }
  }
  return jpeg.encode({ data: d, width: w, height: h }, qualidade).data;
}
export function jpgDaPagina(pagina, escala = 1) {
  const img = rasterizarSvg(svgDaPagina(pagina), { largura: pagina.w * escala });
  return { bytes: jpgDeRgba(img.pixels, img.width, img.height), w: img.width, h: img.height };
}

// Imagem (data URL) -> pixels RGBA, no máximo `lado` px no maior lado.
export function pixelsDaImagem(dataUrl, nw, nh, lado = 1600) {
  const k = Math.min(1, lado / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/></svg>`;
  const img = new Resvg(svg, { font: OPCOES_FONTE() }).render();
  return { rgba: img.pixels, w: img.width, h: img.height };
}
