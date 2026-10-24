// Preparação das imagens para o OCR, usada dentro do processo de OCR (ocr-processo.js) e, nos testes, pelo leitor
// injetado. Nada aqui grava arquivo ou registra conteúdo.
//   • imagem acima da resolução de leitura: decodificada e reduzida (em cinza) antes do OCR;
//   • PDF escaneado: uma página por vez (decodifica, reduz, lê, libera), nunca todas as imagens juntas.
import { inflateSync } from 'node:zlib';
import { extractImages, extractText, getDocumentProxy } from 'unpdf';
import { dimensoes, decodificarPng, reduzirParaLeitura, pngDePixels, ErroOcr } from './ocr.js';

const inflar = (z, max) => inflateSync(z, { maxOutputLength: max });

/** Imagem pronta para o OCR: a original, se couber na resolução de leitura; senão, reduzida em cinza. */
export async function prepararImagem(b, pixelsLeitura) {
  return (await prepararComPixels(b, pixelsLeitura)).png;
}

/** Como prepararImagem, devolvendo também os pixels em cinza quando a imagem foi reduzida (null quando não foi):
 * uma nova tentativa com a imagem girada reaproveita esses pixels, sem decodificar a imagem grande de novo. */
export async function prepararComPixels(b, pixelsLeitura) {
  const d = dimensoes(b);
  if (!d || d.largura * d.altura <= pixelsLeitura) return { png: b, cinza: null };
  let crua = d.formato === 'png' ? decodificarPng(b, { inflar }) : d.formato === 'jpeg' ? await jpegCru(b, d) : null;
  if (!crua) throw new ErroOcr('grande');
  const cinza = reduzirParaLeitura(crua, pixelsLeitura);
  crua = null;
  return { png: pngDePixels(cinza), cinza };
}

/** Pixels em cinza, na resolução de leitura, para tentar a imagem girada. null se o formato não der para decodificar
 * sem biblioteca nova (WEBP, TIFF): nesse caso não há nova tentativa. Só é chamada quando a primeira leitura falha. */
export async function pixelsParaLeitura(b, pixelsLeitura) {
  const d = dimensoes(b);
  if (!d) return null;
  const crua = d.formato === 'png' ? decodificarPng(b, { inflar }) : d.formato === 'jpeg' ? await jpegCru(b, d) : null;
  if (!crua) return null;
  // Imagem que já era em cinza: a versão em cinza sem girar seria a mesma leitura; quem chama pula essa tentativa.
  return { ...reduzirParaLeitura(crua, pixelsLeitura), cinzaNaOrigem: crua.channels <= 2 };
}

/**
 * Páginas escaneadas de um PDF, uma por vez. `ler(png, cinza)` lê uma imagem (com os pixels em cinza, para tentar
 * girada); `aoLer(i, texto)` recebe cada página.
 * Uma falha numa página interrompe o arquivo todo (nada é devolvido pela metade).
 */
export async function lerPaginas(bytes, indices, pixelsLeitura, ler, aoLer = () => {}) {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const textos = [];
  try {
    for (const i of indices) {
      const brutas = await extractImages(doc, i + 1);
      const lidos = [];
      while (brutas.length) {
        const cinza = reduzirParaLeitura(brutas.shift(), pixelsLeitura);   // a imagem crua sai da lista antes da leitura
        lidos.push(await ler(pngDePixels(cinza), cinza));
      }
      const texto = lidos.join('\n').trim();
      textos.push(texto);
      aoLer(i, texto);
      (await doc.getPage(i + 1)).cleanup();   // libera as imagens decodificadas desta página
    }
    return textos;
  } finally { await doc.loadingTask?.destroy().catch(() => {}); }
}

/** Texto digital de cada página de um PDF (sem OCR). */
export async function textoDoPdf(bytes) {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text, totalPages } = await extractText(doc, { mergePages: false });
    return { paginas: text.map(t => t.trim()), total: totalPages };
  } finally { await doc.loadingTask?.destroy().catch(() => {}); }
}

// JPEG decodificado pelo leitor de PDF (sem biblioteca de imagem nova): a imagem vira a única de um PDF mínimo.
async function jpegCru(jpeg, { largura, altura }) {
  const conteudo = `q ${largura} 0 0 ${altura} 0 0 cm /I Do Q`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] /Contents 4 0 R /Resources << /XObject << /I 5 0 R >> >> >>`,
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`, null];
  const partes = [Buffer.from('%PDF-1.4\n', 'latin1')], pos = [];
  let tam = partes[0].length;
  objs.forEach((o, i) => {
    const corpo = o ?? Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'), jpeg, Buffer.from('\nendstream', 'latin1')]);
    const x = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]);
    pos.push(tam); partes.push(x); tam += x.length;
  });
  partes.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF\n`, 'latin1'));
  const doc = await getDocumentProxy(new Uint8Array(Buffer.concat(partes)));
  try { return (await extractImages(doc, 1))[0] || null; } finally { await doc.loadingTask?.destroy().catch(() => {}); }
}
