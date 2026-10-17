// PDF "leve" para ler como modelo de apresentação: as imagens muito grandes (fotos de 20 megapixels, camadas de
// transparência do mesmo tamanho) viram cópias no tamanho que um slide usa, numa atualização incremental do próprio
// PDF (o original fica intacto; as versões novas dos objetos vêm no fim, com xref próprio). Sem isso, desenhar a
// página exige abrir cada foto inteira (80 MB cada) e o servidor de 512 MB cai.
import { inflateSync, deflateSync } from 'node:zlib';
import sharp from 'sharp';

export const LADO_MAXIMO = 2000;

// Em processo separado (o servidor nunca sente o pico de memória da redução das fotos).
export function pdfLeveSeparado(pdf, { tempoMs = 60000 } = {}) {
  return new Promise((ok, falha) => {
    import('node:child_process').then(({ fork }) => {
      const filho = fork(new URL('./pdf-leve-processo.js', import.meta.url), [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['--max-old-space-size=128'] });
      const fim = setTimeout(() => { filho.kill('SIGKILL'); falha(Object.assign(new Error('tempo'), { codigo: 'modelo_sem_memoria' })); }, tempoMs);
      filho.once('message', m => { clearTimeout(fim); filho.kill(); m.ok ? ok({ pdf: Buffer.from(m.pdf), trocas: m.trocas }) : falha(new Error(m.erro)); });
      filho.once('exit', c => { clearTimeout(fim); falha(Object.assign(new Error(`saiu ${c}`), { codigo: 'modelo_sem_memoria' })); });
      filho.send({ pdf });
    }, falha);
  });
}

// Redução por média de áreas (box): w x h x c -> nw x nh x c.
function reduzir(px, w, h, c, nw, nh) {
  const out = new Uint8Array(nw * nh * c), fx = w / nw, fy = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      for (let k = 0; k < c; k++) {
        let s = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0, i = (yy * w + x0) * c + k; xx < x1; xx++, i += c) s += px[i];
        out[(y * nw + x) * c + k] = Math.round(s / ((y1 - y0) * (x1 - x0)));
      }
    }
  }
  return out;
}

const num = (re, s) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
function componentes(dic, bruto) {
  if (/\/ColorSpace\s*\/DeviceGray/.test(dic)) return 1;
  if (/\/ColorSpace\s*\/DeviceRGB/.test(dic)) return 3;
  if (/\/ColorSpace\s*\/DeviceCMYK/.test(dic)) return 4;
  const ref = /\/ColorSpace\s+(\d+)\s+(\d+)\s+R/.exec(dic);
  if (ref) {   // ICCBased: o número de componentes (/N) está no objeto do perfil
    const obj = new RegExp(`(?:^|[\\r\\n])${ref[1]}\\s+${ref[2]}\\s+obj\\s*\\[\\s*/ICCBased\\s+(\\d+)\\s+(\\d+)\\s+R`).exec(bruto);
    const perfil = obj ? new RegExp(`(?:^|[\\r\\n])${obj[1]}\\s+${obj[2]}\\s+obj\\s*<<([\\s\\S]{0,400}?)>>`).exec(bruto) : null;
    const n = perfil ? num(/\/N\s+(\d)/, perfil[1]) : null;
    if (n) return n;
  }
  return null;
}

export async function pdfLeve(pdf, { lado = LADO_MAXIMO } = {}) {
  const bruto = pdf.toString('latin1');
  const trocas = [];
  const re = /(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\s*<<((?:(?!>>\s*stream|endobj)[\s\S]){0,3000})>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(bruto))) {
    const [, id, ger, dic] = m;
    if (!/\/Subtype\s*\/Image/.test(dic)) continue;
    const w = num(/\/Width\s+(\d+)/, dic), h = num(/\/Height\s+(\d+)/, dic), bpc = num(/\/BitsPerComponent\s+(\d+)/, dic);
    if (!w || !h || Math.max(w, h) <= lado * 1.1 || bpc !== 8 || /\/DecodeParms|\/Decode\s*\[|\/ImageMask\s+true/.test(dic)) continue;
    const len = num(/\/Length\s+(\d+)(?!\s+\d+\s+R)/, dic);
    if (!len) continue;
    const ini = m.index + m[0].length, dados = pdf.subarray(ini, ini + len);
    const f = Math.max(w, h) / lado, nw = Math.max(1, Math.round(w / f)), nh = Math.max(1, Math.round(h / f));
    let novo, filtro;
    try {
      if (/\/Filter\s*\/DCTDecode/.test(dic) && !/\/Filter\s*\[/.test(dic)) {
// Leitura já reduzida do JPEG (libvips): não abre a foto inteira na memória.
        novo = await sharp(dados, { limitInputPixels: false, sequentialRead: true }).resize(nw, nh, { fit: 'fill' }).jpeg({ quality: 88 }).toBuffer(); filtro = '/DCTDecode';
      } else if (/\/Filter\s*\/FlateDecode/.test(dic) && !/\/Filter\s*\[/.test(dic)) {
        const c = componentes(dic, bruto);
        if (!c) continue;
        const px = inflateSync(dados, { maxOutputLength: w * h * c + 16 });
        if (px.length < w * h * c) continue;
        novo = deflateSync(Buffer.from(reduzir(px, w, h, c, nw, nh)), { level: 6 }); filtro = '/FlateDecode';
      } else continue;
    } catch { continue; }
    const dicNovo = dic.replace(/\/Width\s+\d+/, `/Width ${nw}`).replace(/\/Height\s+\d+/, `/Height ${nh}`).replace(/\/Length\s+\d+/, `/Length ${novo.length}`)
      .replace(/\/Filter\s*\/\w+/, `/Filter ${filtro}`);
    trocas.push({ id: Number(id), ger: Number(ger), cabeca: `${id} ${ger} obj\n<<${dicNovo}>>\nstream\n`, dados: Buffer.from(novo) });
  }
  if (!trocas.length) return { pdf, trocas: 0 };
  // Atualização incremental: objetos novos + xref só deles + trailer apontando para o xref anterior.
  const inicioXref = Number(/startxref\s+(\d+)\s*%%EOF\s*$/.exec(bruto.slice(-2048))?.[1]);
  const trailer = bruto.lastIndexOf('trailer') >= 0 ? bruto.slice(bruto.lastIndexOf('trailer')) : '';
  const raiz = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1] || /\/Root\s+(\d+\s+\d+\s+R)/.exec(bruto.slice(-200000))?.[1];
  const tamanho = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1] || /\/Size\s+(\d+)/.exec(bruto.slice(-200000))?.[1]);
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
  if (!Number.isFinite(inicioXref) || !raiz || !tamanho) return { pdf, trocas: 0 };
  const partes = [pdf, Buffer.from('\n')];
  let pos = pdf.length + 1;
  const offsets = [];
  for (const t of trocas) {
    offsets.push({ id: t.id, ger: t.ger, pos });
    const b = Buffer.concat([Buffer.from(t.cabeca, 'latin1'), t.dados, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    partes.push(b); pos += b.length;
  }
  const xref = ['xref'];
  for (const o of offsets.sort((a, b) => a.id - b.id)) xref.push(`${o.id} 1`, `${String(o.pos).padStart(10, '0')} ${String(o.ger).padStart(5, '0')} n\r`);
  xref.push(`trailer\n<< /Size ${tamanho} /Root ${raiz}${info ? ` /Info ${info}` : ''} /Prev ${inicioXref} >>\nstartxref\n${pos}\n%%EOF\n`);
  partes.push(Buffer.from(xref.join('\n'), 'latin1'));
  return { pdf: Buffer.concat(partes), trocas: trocas.length };
}
