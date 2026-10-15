// Apresentação exportada em PDF (texto digital em cada slide + fotos grandes, alguns slides só com imagem): o texto
// dos slides é lido sempre, num processo à parte e com a guarda de memória só da leitura de texto. O OCR entra só nos
// slides sem texto; se ele não couber (memória, tamanho, páginas) ou não ler nada, a resposta segue com o texto dos
// outros slides e marca os não lidos, em vez de recusar o arquivo inteiro como "grande demais".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairTexto } from '../src/texto.js';
import { LIMITES_OCR, rssMb, MSG_GRANDE } from '../src/ocr.js';
import { arquivo, jpegDe, pdfEscaneado } from './arquivos.js';

const FOTO = jpegDe('a4.jpg');            // 2480x3508 (8,7 MP): tratada como imagem de página
const SO_FOTO = jpegDe('raiox-sintetico.jpg');

// Slide = página com texto digital (fonte Helvetica) e, se houver, uma foto ocupando parte da página.
function apresentacao(slides) {
  const objs = [], lista = [];
  const add = o => (objs.push(o), objs.length);
  add(null); add(null); const fonte = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const { texto, foto } of slides) {
    const recursos = [`/Font << /F1 ${fonte} 0 R >>`];
    let desenho = '';
    if (foto) {
      const img = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${foto.largura} /Height ${foto.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${foto.jpeg.length} >>\nstream\n`, 'latin1'), foto.jpeg, Buffer.from('\nendstream', 'latin1')]));
      recursos.push(`/XObject << /Im1 ${img} 0 R >>`);
      desenho += 'q 300 0 0 400 300 100 cm /Im1 Do Q ';
    }
    if (texto) desenho += `BT /F1 20 Tf 40 560 Td 24 TL ${texto.map(l => `(${l}) Tj T*`).join(' ')} ET`;
    const cont = add(`<< /Length ${desenho.length} >>\nstream\n${desenho}\nendstream`);
    lista.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents ${cont} 0 R /Resources << ${recursos.join(' ')} >> >>`));
  }
  objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[1] = `<< /Type /Pages /Kids [${lista.map(n => `${n} 0 R`).join(' ')}] /Count ${lista.length} >>`;
  const partes = [Buffer.from('%PDF-1.4\n', 'latin1')], pos = [];
  let tam = partes[0].length;
  objs.forEach((o, i) => { const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]); pos.push(tam); partes.push(b); tam += b.length; });
  partes.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}
const KICKOFF = apresentacao([
  { texto: ['Kickoff do projeto Repet', 'Objetivo: reduzir retrabalho em 30%'], foto: FOTO },
  { texto: ['Cronograma', 'Fase 1: diagnostico em novembro', 'Fase 2: piloto em dezembro'], foto: FOTO },
  { foto: SO_FOTO },                                   // slide só com imagem
  { texto: ['Proximos passos', 'Responsavel: Marina'], foto: FOTO },
]);
const ler = async limites => (await extrairTexto(arquivo('Apresentacao-Kickoff-Repet.pdf', KICKOFF), { limitesOcr: limites })).texto;
const confere = t => {
  for (const s of ['Kickoff do projeto Repet', 'reduzir retrabalho em 30%', 'Fase 2: piloto em dezembro', 'Responsavel: Marina']) assert.match(t, new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
};

test('memória curta para o OCR: o texto dos slides chega e o slide só com imagem fica marcado (antes: "grande demais")', async () => {
  // A guarda deixa a leitura de texto (processo + cópias do arquivo) e recusa o OCR (tesseract + imagem).
  const t = await ler({ ...LIMITES_OCR, memoriaMaxMb: rssMb() + 150 });
  confere(t);
  assert.match(t, /\[Página 3\]\n\[Esta página só tem imagem e não foi lida/);
});

test('arquivo acima do limite do OCR: o texto digital é lido mesmo assim', async () => {
  const t = await ler({ ...LIMITES_OCR, maxPdfMb: 0.5, memoriaMaxMb: 4000 });
  confere(t);
  assert.match(t, /não foi lida/);
});

test('com folga: o OCR roda no slide sem texto; sem nada legível nele, o resto da apresentação continua valendo', async () => {
  const t = await ler({ ...LIMITES_OCR, memoriaMaxMb: 4000 });
  confere(t);
  assert.doesNotMatch(t, /grande demais/);
});

test('PDF só escaneado e grande demais para o OCR continua com a mensagem técnica (não há texto a aproveitar)', async () => {
  const b = pdfEscaneado([FOTO, FOTO]);
  const e = await extrairTexto(arquivo('scan.pdf', b), { limitesOcr: { ...LIMITES_OCR, maxPdfMb: 0.5, memoriaMaxMb: 4000 } }).then(() => null, x => x);
  assert.equal(e?.message, MSG_GRANDE);
});
