// Arquivos de teste gerados na hora: ZIP (DOCX, XLSX), PDF com e sem texto, PNG.
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

export const png = () => Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
export const b64 = b => Buffer.from(b).toString('base64');
export const arquivo = (nome, conteudo) => ({ nome, base64: b64(conteudo) });
