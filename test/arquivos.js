// Arquivos de teste gerados na hora: ZIP (DOCX, XLSX, PPTX), PDF com e sem texto, PDF escaneado, PNG.
import { readFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

export function zip(entradas) {
  const locais = [], centrais = [];
  let pos = 0;
  for (const [nome, conteudo] of Object.entries(entradas)) {
    const dados = Buffer.from(conteudo), comp = deflateRawSync(dados), n = Buffer.from(nome);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc32(dados), 14); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(dados.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(dados), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    locais.push(l, n, comp); centrais.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(entradas).length, 8); fim.writeUInt16LE(Object.keys(entradas).length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, dir, fim]);
}

const x = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const docx = paragrafos => zip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragrafos.map(p => `<w:p><w:r><w:t>${x(p)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
});

// PPTX: um slide por item da lista, cada linha como um parágrafo.
export const pptx = slides => zip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  ...Object.fromEntries(slides.map((linhas, i) => [`ppt/slides/slide${i + 1}.xml`,
    `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>${linhas.map(l => `<a:p><a:r><a:t>${x(l)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`])),
});

export function xlsx(linhas, nome = 'Plan1') {
  const textos = [...new Set(linhas.flat().filter(v => typeof v === 'string'))];
  const col = i => String.fromCharCode(65 + i);
  return zip({
    'xl/workbook.xml': `<workbook><sheets><sheet name="${nome}" sheetId="1"/></sheets></workbook>`,
    'xl/sharedStrings.xml': `<sst>${textos.map(t => `<si><t>${x(t)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => typeof v === 'string'
      ? `<c r="${col(c)}${r + 1}" t="s"><v>${textos.indexOf(v)}</v></c>` : `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`,
  });
}

// PDF digital de uma página (texto em ASCII) ou sem texto (como um escaneado).
export function pdf(linhas = []) {
  const conteudo = linhas.length ? `BT /F1 12 Tf 72 720 Td 14 TL ${linhas.map(l => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ')} ET` : '0 0 1 rg 72 72 200 200 re f';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let s = '%PDF-1.4\n';
  const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

// PDF escaneado: cada página é só uma imagem JPEG (sem camada de texto), como sai de um scanner.
export function pdfEscaneado(paginas) {
  const objs = [], lista = [];
  const add = o => (objs.push(o), objs.length);
  add(null); add(null);   // 1: catálogo, 2: páginas
  for (const { jpeg, largura, altura } of paginas) {
    const img = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'), jpeg, Buffer.from('\nendstream', 'latin1')]));
    const desenho = `q 612 0 0 ${Math.round(612 * altura / largura)} 0 ${792 - Math.round(612 * altura / largura)} cm /Im1 Do Q`;
    const cont = add(`<< /Length ${desenho.length} >>\nstream\n${desenho}\nendstream`);
    lista.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${cont} 0 R /Resources << /XObject << /Im1 ${img} 0 R >> >> >>`));
  }
  objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[1] = `<< /Type /Pages /Kids [${lista.map(n => `${n} 0 R`).join(' ')}] /Count ${lista.length} >>`;
  const partes = [Buffer.from('%PDF-1.4\n', 'latin1')], pos = [];
  let tam = partes[0].length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]);
    pos.push(tam); partes.push(b); tam += b.length;
  });
  partes.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

// Imagens de teste (geradas por scripts/fixtures-ocr.js), para o OCR.
export const imagem = nome => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url));
export const jpegDe = nome => { const b = imagem(nome); for (let i = 2; i < b.length;) { const m = b[i + 1], n = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return { jpeg: b, altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) }; i += 2 + n; } throw new Error('JPEG sem SOF'); };

export const png = () => Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
export const b64 = b => Buffer.from(b).toString('base64');
export const arquivo = (nome, conteudo) => ({ nome, base64: b64(conteudo) });
