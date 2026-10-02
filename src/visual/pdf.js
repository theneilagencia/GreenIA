// PDF das páginas compostas, escrito aqui (sem biblioteca): vetorial, com as mesmas fontes TrueType embutidas
// (codificação WinAnsi, a mesma régua de caracteres da composição) e as imagens em JPEG (direto) ou em pixels
// (PNG, WEBP, GIF e SVG decodificados pelo resvg; transparência como máscara). O texto é texto de verdade:
// selecionável e pesquisável.
import { deflateSync } from 'node:zlib';
import { carregarFonte, codigoWinAnsi, metricas, medir, WINANSI } from './fontes.js';

const DO_CODIGO = new Map([...WINANSI].map(([u, c]) => [c, u]));
import { decodificarDataUrl, inspecionarImagem } from './assets.js';
import { pixelsDaImagem } from './raster.js';
import { rgb } from './marca.js';

const f2 = v => (Math.round(v * 1000) / 1000).toString();
const cor = c => rgb(c).map(v => f2(v / 255)).join(' ');

// ---- Caminhos SVG -> operadores PDF (M, L, H, V, C, S, Q, A, Z e as formas relativas) -----------------------
function arcoParaCurvas(x1, y1, rx, ry, rot, grande, varre, x2, y2) {
  if (!rx || !ry) return [[x2, y2]];
  const phi = rot * Math.PI / 180, cs = Math.cos(phi), sn = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cs * dx + sn * dy, yp = -sn * dx + cs * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sinal = grande === varre ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const co = sinal * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = co * rx * yp / ry, cyp = -co * ry * xp / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2, cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!varre && dt > 0) dt -= 2 * Math.PI; else if (varre && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), d = dt / n, k = 4 / 3 * Math.tan(d / 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * d, b = a + d;
    const p = (t, r = 1) => [cx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, cy + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs];
    const [ax, ay] = p(a), [bx, by] = p(b);
    const c1 = [ax - k * (rx * Math.sin(a) * cs + ry * Math.cos(a) * sn), ay - k * (rx * Math.sin(a) * sn - ry * Math.cos(a) * cs)];
    const c2 = [bx + k * (rx * Math.sin(b) * cs + ry * Math.cos(b) * sn), by + k * (rx * Math.sin(b) * sn - ry * Math.cos(b) * cs)];
    out.push([c1[0], c1[1], c2[0], c2[1], bx, by]);
  }
  return out;
}
export function caminhoPdf(d) {
  const toks = String(d).match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
  const ops = [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cpx = null, cpy = null;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z' ? 1 : 0;
    switch (cmd.toUpperCase()) {
      case 'M': { const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0); x = nx; y = ny; sx = x; sy = y; ops.push(`${f2(x)} ${f2(y)} m`); cmd = rel ? 'l' : 'L'; cpx = null; break; }
      case 'L': { x = num() + (rel ? x : 0); y = num() + (rel ? y : 0); ops.push(`${f2(x)} ${f2(y)} l`); cpx = null; break; }
      case 'H': { x = num() + (rel ? x : 0); ops.push(`${f2(x)} ${f2(y)} l`); cpx = null; break; }
      case 'V': { y = num() + (rel ? y : 0); ops.push(`${f2(x)} ${f2(y)} l`); cpx = null; break; }
      case 'C': { const a = [num(), num(), num(), num(), num(), num()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0)); ops.push(`${a.map(f2).join(' ')} c`); cpx = a[2]; cpy = a[3]; x = a[4]; y = a[5]; break; }
      case 'S': { const a = [num(), num(), num(), num()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0)); const c1 = cpx === null ? [x, y] : [2 * x - cpx, 2 * y - cpy]; ops.push(`${f2(c1[0])} ${f2(c1[1])} ${a.map(f2).join(' ')} c`); cpx = a[0]; cpy = a[1]; x = a[2]; y = a[3]; break; }
      case 'Q': { const a = [num(), num(), num(), num()].map((v, k) => v + (rel ? (k % 2 ? y : x) : 0)); const c1 = [x + 2 / 3 * (a[0] - x), y + 2 / 3 * (a[1] - y)], c2 = [a[2] + 2 / 3 * (a[0] - a[2]), a[3] + 2 / 3 * (a[1] - a[3])]; ops.push(`${[...c1, ...c2, a[2], a[3]].map(f2).join(' ')} c`); x = a[2]; y = a[3]; cpx = null; break; }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), g = num(), v = num();
        const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0);
        for (const c of arcoParaCurvas(x, y, rx, ry, rot, g, v, nx, ny)) ops.push(c.length === 2 ? `${f2(c[0])} ${f2(c[1])} l` : `${c.map(f2).join(' ')} c`);
        x = nx; y = ny; cpx = null; break;
      }
      case 'Z': ops.push('h'); x = sx; y = sy; cpx = null; break;
      default: i++;
    }
  }
  return ops.join('\n');
}
const retArredondado = (x, y, w, h, r) => {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  if (!r) return `${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)} re`;
  const k = r * 0.5523;
  return [`${f2(x + r)} ${f2(y)} m`, `${f2(x + w - r)} ${f2(y)} l`, `${f2(x + w - r + k)} ${f2(y)} ${f2(x + w)} ${f2(y + r - k)} ${f2(x + w)} ${f2(y + r)} c`, `${f2(x + w)} ${f2(y + h - r)} l`,
    `${f2(x + w)} ${f2(y + h - r + k)} ${f2(x + w - r + k)} ${f2(y + h)} ${f2(x + w - r)} ${f2(y + h)} c`, `${f2(x + r)} ${f2(y + h)} l`, `${f2(x + r - k)} ${f2(y + h)} ${f2(x)} ${f2(y + h - r + k)} ${f2(x)} ${f2(y + h - r)} c`,
    `${f2(x)} ${f2(y + r)} l`, `${f2(x)} ${f2(y + r - k)} ${f2(x + r - k)} ${f2(y)} ${f2(x + r)} ${f2(y)} c`, 'h'].join('\n');
};
const circulo = (cx, cy, r) => { const k = r * 0.5523; return [`${f2(cx + r)} ${f2(cy)} m`, `${f2(cx + r)} ${f2(cy + k)} ${f2(cx + k)} ${f2(cy + r)} ${f2(cx)} ${f2(cy + r)} c`, `${f2(cx - k)} ${f2(cy + r)} ${f2(cx - r)} ${f2(cy + k)} ${f2(cx - r)} ${f2(cy)} c`,
  `${f2(cx - r)} ${f2(cy - k)} ${f2(cx - k)} ${f2(cy - r)} ${f2(cx)} ${f2(cy - r)} c`, `${f2(cx + k)} ${f2(cy - r)} ${f2(cx + r)} ${f2(cy - k)} ${f2(cx + r)} ${f2(cy)} c`, 'h'].join('\n'); };

// ---- Documento ---------------------------------------------------------------------------------------------------
export function pdfDasPaginas(paginas, { escala = 0.75, titulo = '', autor = '' } = {}) {
  const objs = [];   // índice = número do objeto - 1
  const novo = () => { objs.push(null); return objs.length; };
  const definir = (n, conteudo) => { objs[n - 1] = conteudo; };
  const stream = (dict, dados, comprimir = true) => {
    const b = comprimir ? deflateSync(dados) : Buffer.from(dados);
    return { dict: `${dict}${comprimir ? ' /Filter /FlateDecode' : ''} /Length ${b.length}`, dados: b };
  };
  const catalogo = novo(), raiz = novo();
  const fontes = new Map(), imagens = new Map(), estados = new Map();
  const fonteRef = (familia, peso) => {
    const f = carregarFonte(familia, peso), k = `${f.familia}:${f.peso}`;
    if (fontes.has(k)) return fontes.get(k);
    const nome = `F${fontes.size + 1}`, obj = novo(), desc = novo(), arq = novo();
    const larguras = [];
    for (let c = 32; c <= 255; c++) {
      const uni = c >= 0x80 && c <= 0x9f ? DO_CODIGO.get(c) : c === 0x7f ? null : c;
      larguras.push(uni ? Math.round(f.avanco(uni) * 1000 / f.upm) : 0);
    }
    const ps = f.nome.postscript || `GreenIA-${nome}`;
    definir(arq, stream(`<< /Length1 ${f.buf.length}`, f.buf));
    definir(desc, `<< /Type /FontDescriptor /FontName /${ps} /Flags 32 /FontBBox [${f.bbox.map(v => Math.round(v * 1000 / f.upm)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(f.ascender * 1000 / f.upm)} /Descent ${Math.round(f.descender * 1000 / f.upm)} /CapHeight ${Math.round(f.capHeight * 1000 / f.upm)} /StemV ${f.peso >= 600 ? 120 : 80} /FontFile2 ${arq} 0 R >>`);
    definir(obj, `<< /Type /Font /Subtype /TrueType /BaseFont /${ps} /FirstChar 32 /LastChar 255 /Widths [${larguras.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${desc} 0 R >>`);
    const r = { nome, obj, fonte: f };
    fontes.set(k, r);
    return r;
  };
  const imagemRef = (href, nw, nh) => {
    if (imagens.has(href)) return imagens.get(href);
    const d = decodificarDataUrl(href);
    if (!d) return null;
    const info = inspecionarImagem(d.bytes);
    if (!info) return null;
    const nome = `Im${imagens.size + 1}`, obj = novo();
    if (info.mime === 'image/jpeg') {
      // Componentes do JPEG (1 cinza, 3 RGB, 4 CMYK).
      let comp = 3;
      for (let i = 2; i + 9 < d.bytes.length;) { if (d.bytes[i] !== 0xff) { i++; continue; } const m = d.bytes[i + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { comp = d.bytes[i + 9]; break; } i += 2 + d.bytes.readUInt16BE(i + 2); }
      const cs = comp === 1 ? '/DeviceGray' : comp === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
      definir(obj, { dict: `<< /Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${d.bytes.length}`, dados: d.bytes });
    } else {
      const px = pixelsDaImagem(href, nw || info.w, nh || info.h);
      const n = px.w * px.h, cores = Buffer.alloc(n * 3), alfa = Buffer.alloc(n);
      let transparente = false;
      for (let i = 0; i < n; i++) {
        const a = px.rgba[i * 4 + 3];
        // Pixels pré-multiplicados no resvg: desfaz a multiplicação para a cor certa.
        const k = a ? 255 / a : 0;
        cores[i * 3] = Math.min(255, px.rgba[i * 4] * k); cores[i * 3 + 1] = Math.min(255, px.rgba[i * 4 + 1] * k); cores[i * 3 + 2] = Math.min(255, px.rgba[i * 4 + 2] * k);
        alfa[i] = a; if (a < 255) transparente = true;
      }
      let smask = '';
      if (transparente) { const m = novo(); definir(m, stream(`<< /Type /XObject /Subtype /Image /Width ${px.w} /Height ${px.h} /ColorSpace /DeviceGray /BitsPerComponent 8`, alfa)); smask = ` /SMask ${m} 0 R`; }
      definir(obj, stream(`<< /Type /XObject /Subtype /Image /Width ${px.w} /Height ${px.h} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}`, cores));
    }
    const r = { nome, obj, w: info.w, h: info.h };
    imagens.set(href, r);
    return r;
  };
  const opacidade = a => {
    const k = f2(a);
    if (!estados.has(k)) { const obj = novo(); definir(obj, `<< /Type /ExtGState /ca ${k} /CA ${k} >>`); estados.set(k, { nome: `GS${estados.size + 1}`, obj }); }
    return estados.get(k).nome;
  };

  const paginasRefs = [];
  for (const pg of paginas) {
    const ops = [`${f2(escala)} 0 0 ${f2(-escala)} 0 ${f2(pg.h * escala)} cm`, `${cor(pg.fundo || '#FFFFFF')} rg`, `0 0 ${pg.w} ${pg.h} re f`];
    for (const p of pg.prims) {
      const q = [];
      if (p.opacidade !== undefined) q.push(`/${opacidade(p.opacidade)} gs`);
      switch (p.t) {
        case 'rect': {
          const forma = retArredondado(p.x, p.y, p.w, p.h, p.r);
          if (p.fill && p.fill !== 'none') q.push(`${cor(p.fill)} rg`, forma, 'f');
          if (p.stroke) q.push(`${cor(p.stroke)} RG ${f2(p.sw || 1)} w`, p.dash ? `[${p.dash}] 0 d` : '', forma, 'S', p.dash ? '[] 0 d' : '');
          break;
        }
        case 'line': q.push(`${cor(p.cor)} RG ${f2(p.sw || 1)} w`, p.dash ? `[${p.dash}] 0 d` : '', `${f2(p.x1)} ${f2(p.y1)} m ${f2(p.x2)} ${f2(p.y2)} l S`, p.dash ? '[] 0 d' : ''); break;
        case 'circle': {
          const forma = circulo(p.cx, p.cy, p.r);
          if (p.fill && p.fill !== 'none') q.push(`${cor(p.fill)} rg`, forma, 'f');
          if (p.stroke) q.push(`${cor(p.stroke)} RG ${f2(p.sw || 1)} w`, forma, 'S');
          break;
        }
        case 'path': {
          const e = p.escala || 1;
          q.push('q', `${f2(e)} 0 0 ${f2(e)} ${f2(p.dx || 0)} ${f2(p.dy || 0)} cm`, '1 J 1 j');
          const forma = caminhoPdf(p.d);
          if (p.fill && p.fill !== 'none' && p.stroke) q.push(`${cor(p.fill)} rg ${cor(p.stroke)} RG ${f2((p.sw || 1) / e)} w`, forma, 'B');
          else if (p.fill && p.fill !== 'none') q.push(`${cor(p.fill)} rg`, forma, 'f');
          else if (p.stroke) q.push(`${cor(p.stroke)} RG ${f2((p.sw || 1) / e)} w`, forma, 'S');
          q.push('Q');
          break;
        }
        case 'image': {
          const im = imagemRef(p.href, p.nw, p.nh);
          if (!im) break;
          const r = (p.nw || im.w) / (p.nh || im.h);
          let w = p.w, h = p.h;
          if (p.ajuste === 'cover') { if (w / h > r) h = w / r; else w = h * r; } else { if (w / h > r) w = h * r; else h = w / r; }
          const x = p.x + (p.w - w) / 2, y = p.y + (p.h - h) / 2;
          q.push('q', retArredondado(p.x, p.y, p.w, p.h, p.r || 0), 'W n', `${f2(w)} 0 0 ${f2(-h)} ${f2(x)} ${f2(y + h)} cm`, `/${im.nome} Do`, 'Q');
          break;
        }
        case 'text': {
          const fr = fonteRef(p.familia, p.peso), f = fr.fonte;
          const m = metricas(f, p.tam, p.lh / p.tam);
          q.push('BT', `/${fr.nome} ${f2(p.tam)} Tf`, `${cor(p.cor)} rg`);
          p.linhas.forEach((l, i) => {
            if (!l) return;
            const larg = medir(l, f, p.tam);
            const x = p.alin === 'middle' ? p.x + (p.w - larg) / 2 : p.alin === 'end' ? p.x + p.w - larg : p.x;
            let hex = '';
            for (const ch of l) { const c = codigoWinAnsi(ch.codePointAt(0)); hex += (c ?? 0x3f).toString(16).padStart(2, '0'); }
            q.push(`1 0 0 -1 ${f2(x)} ${f2(p.y + i * p.lh + m.base)} Tm <${hex}> Tj`);
          });
          q.push('ET');
          break;
        }
        default: break;
      }
      if (p.opacidade !== undefined) { ops.push('q', ...q.filter(Boolean), 'Q'); } else ops.push(...q.filter(Boolean));
    }
    const conteudo = novo(), pagina = novo();
    definir(conteudo, stream('<<', Buffer.from(ops.join('\n'), 'latin1')));
    paginasRefs.push({ pagina, conteudo, w: pg.w * escala, h: pg.h * escala });
  }
  const recursos = `<< /Font << ${[...fontes.values()].map(f => `/${f.nome} ${f.obj} 0 R`).join(' ')} >> /XObject << ${[...imagens.values()].map(i => `/${i.nome} ${i.obj} 0 R`).join(' ')} >> /ExtGState << ${[...estados.values()].map(e => `/${e.nome} ${e.obj} 0 R`).join(' ')} >> >>`;
  for (const p of paginasRefs) definir(p.pagina, `<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${f2(p.w)} ${f2(p.h)}] /Resources ${recursos} /Contents ${p.conteudo} 0 R >>`);
  definir(raiz, `<< /Type /Pages /Kids [${paginasRefs.map(p => `${p.pagina} 0 R`).join(' ')}] /Count ${paginasRefs.length} >>`);
  definir(catalogo, `<< /Type /Catalog /Pages ${raiz} 0 R >>`);
  const info = novo();
  const strPdf = s => `(${String(s).replace(/[^\x20-\x7e]/g, c => { const k = codigoWinAnsi(c.codePointAt(0)); return k ? `\\${k.toString(8).padStart(3, '0')}` : '?'; }).replace(/([()\\])(?![0-7]{3})/g, '\\$1')})`;
  definir(info, `<< /Title ${strPdf(titulo || 'Artefato visual')} /Producer (GreenIA) ${autor ? `/Author ${strPdf(autor)}` : ''} >>`);
  // Serialização.
  const partes = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offs = [];
  let pos = partes[0].length;
  objs.forEach((o, i) => {
    let b;
    if (typeof o === 'string') b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    else b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict} >>\nstream\n`, 'latin1'), o.dados, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    offs.push(pos); partes.push(b); pos += b.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}
