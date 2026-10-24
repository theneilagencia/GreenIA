// WEBP -> PNG. O renderizador (resvg) e o PDF não leem WEBP; logo ou foto em WEBP (comum em marca enviada pela
// web) sumiria da peça. A imagem é decodificada uma vez (decodificador WebAssembly, sem binário nativo) e regravada
// como PNG, sem recolorir nem redimensionar.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync, crc32 } from 'node:zlib';
import webpDec from '@jsquash/webp/codec/dec/webp_dec.js';
import { initEmscriptenModule } from '@jsquash/webp/utils.js';

const req = createRequire(import.meta.url);
const modulo = await initEmscriptenModule(webpDec, await WebAssembly.compile(readFileSync(req.resolve('@jsquash/webp/codec/dec/webp_dec.wasm'))));

const ehWebp = b => b.length > 16 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';

function pedaco(tipo, dados) {
  const t = Buffer.from(tipo, 'latin1'), n = Buffer.alloc(4), c = Buffer.alloc(4);
  n.writeUInt32BE(dados.length); c.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0);
  return Buffer.concat([n, t, dados, c]);
}
export function pngDeRgba(w, h, rgba) {
  const linhas = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(linhas, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', deflateSync(linhas)), pedaco('IEND', Buffer.alloc(0))]);
}

// bytes WEBP -> bytes PNG (null se não decodificar).
export function webpParaPng(bytes) {
  if (!ehWebp(bytes)) return null;
  const img = modulo.decode(bytes);
  return img?.width && img?.height ? pngDeRgba(img.width, img.height, img.data) : null;
}

// data URL renderizável: WEBP vira PNG; o resto passa como veio.
export function renderizavel(dataUrl) {
  const m = /^data:image\/webp;base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return dataUrl;
  const png = webpParaPng(Buffer.from(m[1], 'base64'));
  return png ? `data:image/png;base64,${png.toString('base64')}` : null;
}

// Artefatos já gravados com a marca em WEBP: conversão na hora de desenhar, com memória curta.
const memoria = new Map();
export function hrefRenderizavel(href) {
  if (!String(href || '').startsWith('data:image/webp')) return href;
  if (!memoria.has(href)) { if (memoria.size >= 16) memoria.delete(memoria.keys().next().value); memoria.set(href, renderizavel(href)); }
  return memoria.get(href);
}
