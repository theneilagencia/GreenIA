// Limite de descompactação para arquivos ZIP vindos de fora (DOCX, XLSX, ODT,
// ODS). Um arquivo de poucos KB pode expandir para gigabytes ("bomba de ZIP") e
// derrubar o processo dentro do mammoth ou do ExcelJS. Antes de entregar o
// arquivo a eles, cada entrada é descompactada de verdade, com teto de saída
// (o tamanho declarado no ZIP pode mentir), e o total é somado.
import { inflateRawSync } from 'node:zlib';

export const LIMITES_ZIP = { totalMb: 256, entradas: 10_000 };

export class ZipRecusado extends Error {
  constructor(message: string) { super(message); this.name = 'ZipRecusado'; }
}

export function conferirZip(bytes: Uint8Array, limites = LIMITES_ZIP): { entradas: number; descompactado: number } {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const teto = limites.totalMb * 1024 * 1024;
  // Fim do diretório central: nos últimos 22 + 65535 bytes (comentário).
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new ZipRecusado('arquivo compactado inválido (sem diretório central)');
  const total = b.readUInt16LE(fim + 10);
  let p = b.readUInt32LE(fim + 16);
  if (total === 0xffff || p === 0xffffffff) throw new ZipRecusado('arquivo compactado no formato ZIP64: não aceito para documentos');
  if (total > limites.entradas) throw new ZipRecusado(`arquivo compactado com ${total} entradas (limite ${limites.entradas})`);
  let soma = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new ZipRecusado('arquivo compactado inválido (diretório central corrompido)');
    const metodo = b.readUInt16LE(p + 10);
    const compactado = b.readUInt32LE(p + 20);
    const nome = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), coment = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    p += 46 + nome + extra + coment;
    if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new ZipRecusado('arquivo compactado inválido (entrada corrompida)');
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const dados = b.subarray(inicio, inicio + compactado);
    const resta = teto - soma;
    if (metodo === 0) soma += dados.length;
    else if (metodo === 8) {
      try { soma += inflateRawSync(dados, { maxOutputLength: Math.max(1, resta) + 1 }).length; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|larger than/.test((e as Error).message)) soma = teto + 1;
        else throw new ZipRecusado('arquivo compactado inválido (dados corrompidos)');
      }
    } else throw new ZipRecusado(`arquivo compactado com método ${metodo}: não aceito`);
    if (soma > teto) throw new ZipRecusado(`arquivo compactado expande para mais de ${limites.totalMb} MB: recusado`);
  }
  return { entradas: total, descompactado: soma };
}
