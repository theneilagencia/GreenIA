// Arquivos de teste gerados na hora (dados fictícios): PDF com texto, PDF só com
// imagem (escaneado), DOCX, XLSX, CSV, NF-e e imagem PNG.
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import type { InputFile, BlockEnv } from '../src/blocks/types.ts';
import type { LlmCompletion } from '../src/llm/provider.ts';
import type { Converter, OcrPage } from '../src/convert/converter.ts';
import { READERS } from '../src/readers/registry.ts';

let seq = 0;
export function inputFile(name: string, bytes: Uint8Array | string, mime = 'application/octet-stream'): InputFile {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return { id: `f${++seq}`, name, mime, bytes: b, sha256: createHash('sha256').update(b).digest('hex') };
}

function pdfBytes(draw: (doc: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

export const textPdf = (pages: string[]) => pdfBytes(doc => pages.forEach((t, i) => { if (i) doc.addPage(); doc.fontSize(12).text(t); }));

// "Escaneado": só desenho, nenhum texto.
export const scannedPdf = (pages = 1) => pdfBytes(doc => {
  for (let i = 0; i < pages; i++) { if (i) doc.addPage(); doc.rect(50, 50, 400, 200).fill('#999999'); }
});

export async function docx(paragraphs: string[]): Promise<Uint8Array> {
  const d = new Document({ sections: [{ children: paragraphs.map(p => new Paragraph(p)) }] });
  return new Uint8Array(await Packer.toBuffer(d));
}

export async function xlsx(sheets: Record<string, (string | number | Date | null)[][]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) wb.addWorksheet(name).addRows(rows);
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// PNG 1x1 (branco).
export const png = () => new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'));

// NF-e fictícia: o mesmo gerador das amostras de demonstração.
export { nfeXml, nfeKey, danfePdf } from '../src/demo/samples.ts';

// Ambiente de bloco para testes unitários: o modelo responde pela função dada.
export function testEnv(reply: (req: Parameters<BlockEnv['complete']>[0]) => string = () => '', extra: Partial<BlockEnv> = {}) {
  const calls: Parameters<BlockEnv['complete']>[0][] = [];
  const env: BlockEnv = {
    async complete(req): Promise<LlmCompletion> {
      calls.push(req);
      const text = reply(req);
      return { text, model: 'fake', stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: Math.ceil(text.length / 4) } };
    },
    async searchKnowledge() { return []; },
    keyUserContact: 'Key user da área: key.user@exemplo.com.br',
    readers: READERS,                                      // nos testes de bloco, todos os leitores ligados
    now: () => new Date('2026-09-24T12:00:00-03:00'),
    ...extra,
  };
  return { env, calls };
}

// Conversor simulado: o OCR devolve as páginas dadas (por número), sem ferramentas do sistema.
export function fakeConverter(ocr: (pages?: number[]) => OcrPage[], extra: Partial<Converter> = {}) {
  const calls: string[] = [];
  const c: Converter = {
    async available() { return { ocr: true, images: true, office: true }; },
    async ocrPdf(_b, pages) { calls.push(`ocrPdf:${(pages ?? []).join(',')}`); return ocr(pages); },
    async ocrImage() { calls.push('ocrImage'); return ocr(); },
    async imageToJpeg() { calls.push('imageToJpeg'); return [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]; },
    async officeToOoxml() { throw new Error('conversão não simulada'); },
    ...extra,
  };
  return { converter: c, calls };
}

export const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
