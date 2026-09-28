// OCR local, para imagem e PDF escaneado. É só uma forma de LER o arquivo: o texto lido segue exatamente o
// mesmo caminho do texto de um arquivo digital (arquivo → OCR → classificação → governança → elegibilidade →
// processamento) e a mesma retenção. Nada de governança acontece aqui.
//
// Onde o conteúdo fica: só na memória do processo. A imagem não sai para outro serviço; os dados do idioma vêm
// do pacote instalado (sem download e sem cache em disco); cada leitura usa um worker próprio, encerrado no fim
// (inclusive em erro ou tempo esgotado), então nada de uma empresa fica disponível para outra.
import { deflateSync, crc32 } from 'node:zlib';
import { createRequire } from 'node:module';

// Limite técnico de leitura, e não de segurança ou de política.
export const MSG_SEM_TEXTO = 'Este arquivo não contém texto que o GreenIA consiga ler neste momento.';
export const OCR_PAGINAS = 30;          // páginas escaneadas lidas por arquivo
const TEMPO_MS = 90e3;                  // por arquivo
const SIMULTANEAS = Math.max(1, Number(process.env.OCR_SIMULTANEAS) || 1);   // leituras ao mesmo tempo (cada uma usa ~150 MB de memória)
const CONFIANCA_MINIMA = 30;            // abaixo disso, o que foi "lido" é ruído

let carregado;
async function tesseract() {
  // Sem o pacote (instalação sem a dependência), o OCR fica indisponível e o arquivo recebe a mensagem técnica.
  carregado ??= (async () => {
    try {
      const { createWorker } = await import('tesseract.js');
      const por = createRequire(import.meta.url)('@tesseract.js-data/por');
      return { createWorker, por };
    } catch { return null; }
  })();
  return carregado;
}

let emUso = 0;
const fila = [];
const vez = () => emUso < SIMULTANEAS ? (emUso++, Promise.resolve()) : new Promise(r => fila.push(r));
const liberar = () => { const prox = fila.shift(); if (prox) prox(); else emUso--; };

/**
 * Leitor padrão: recebe imagens (PNG, JPEG, WEBP, TIFF...) e devolve o texto de cada uma, na ordem.
 * Devolve null quando o OCR não está disponível. Lança em erro ou tempo esgotado (quem chama responde com a
 * mensagem técnica). @param {Buffer[]} imagens @returns {Promise<string[] | null>}
 */
export async function lerImagens(imagens, { tempoMs = TEMPO_MS } = {}) {
  const t = await tesseract();
  if (!t) return null;
  await vez();
  let worker = null, relogio, encerrado = false;
  try {
    const trabalho = (async () => {
      const w = await t.createWorker('por', 1, { langPath: t.por.langPath, gzip: t.por.gzip, cacheMethod: 'none', logger: () => {}, errorHandler: () => {} });
      if (encerrado) { await w.terminate().catch(() => {}); throw new Error('cancelado'); }   // o tempo acabou antes de o worker subir
      worker = w;
      const out = [];
      for (const img of imagens) {
        const { data } = await worker.recognize(img);
        out.push(data.confidence >= CONFIANCA_MINIMA ? data.text.trim() : '');
      }
      return out;
    })();
    trabalho.catch(() => {});   // depois do tempo esgotado, o resultado (ou o erro) é descartado
    const limite = new Promise((_, rej) => { relogio = setTimeout(() => rej(new Error('tempo esgotado')), tempoMs); });
    return await Promise.race([trabalho, limite]);
  } finally {
    encerrado = true;
    clearTimeout(relogio);
    await worker?.terminate().catch(() => {});
    liberar();
  }
}

// Pixels de uma imagem de PDF (como o leitor de PDF entrega) em PNG, sem biblioteca de imagem.
export function pngDePixels({ data, width, height, channels }) {
  const tipo = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
  if (tipo === undefined || !width || !height) return null;
  const linha = width * channels;
  const cru = Buffer.alloc((linha + 1) * height);
  const px = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  for (let y = 0; y < height; y++) px.copy(cru, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
  const bloco = (nome, conteudo) => {
    const tam = Buffer.alloc(4); tam.writeUInt32BE(conteudo.length);
    const nc = Buffer.concat([Buffer.from(nome, 'latin1'), conteudo]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(nc) >>> 0);
    return Buffer.concat([tam, nc, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = tipo;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(cru)), bloco('IEND', Buffer.alloc(0))]);
}
