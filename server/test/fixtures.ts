// Arquivos de teste gerados na hora (dados fictícios): PDF com texto, PDF só com
// imagem (escaneado), DOCX, XLSX, CSV, NF-e e imagem PNG.
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import type { InputFile, BlockEnv } from '../src/blocks/types.ts';
import type { LlmCompletion } from '../src/llm/provider.ts';

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

export interface NFeItemFx { codigo: string; descricao: string; qtd: number; unit: number; pedido?: string; itemPedido?: string }

// NF-e autorizada (nfeProc) no layout 4.00, fictícia.
export function nfeXml(o: { numero: string; emissao: string; emitente?: string; cnpj?: string; pedido?: string; itens: NFeItemFx[] }): string {
  const det = o.itens.map((it, i) => `
      <det nItem="${i + 1}"><prod>
        <cProd>${it.codigo}</cProd><cEAN>SEM GTIN</cEAN><xProd>${it.descricao}</xProd><NCM>39239000</NCM><CFOP>1102</CFOP>
        <uCom>UN</uCom><qCom>${it.qtd.toFixed(4)}</qCom><vUnCom>${it.unit.toFixed(10)}</vUnCom><vProd>${(it.qtd * it.unit).toFixed(2)}</vProd>
        ${it.pedido ? `<xPed>${it.pedido}</xPed>` : ''}${it.itemPedido ? `<nItemPed>${it.itemPedido}</nItemPed>` : ''}
      </prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS></imposto></det>`).join('');
  const total = o.itens.reduce((s, it) => s + it.qtd * it.unit, 0).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe35260912345678000199550010000${o.numero.padStart(5, '0')}1000000001" versao="4.00">
      <ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${o.numero}</nNF><dhEmi>${o.emissao}T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>${o.cnpj ?? '12345678000199'}</CNPJ><xNome>${o.emitente ?? 'Plásticos Exemplo Ltda'}</xNome><enderEmit><UF>SP</UF></enderEmit><IE>111222333444</IE></emit>
      <dest><CNPJ>98765432000155</CNPJ><xNome>Empresa Exemplo S.A.</xNome><enderDest><UF>SP</UF></enderDest></dest>${det}
      <total><ICMSTot><vProd>${total}</vProd><vNF>${total}</vNF><vICMS>0.00</vICMS><vIPI>0.00</vIPI><vFrete>0.00</vFrete><vDesc>0.00</vDesc></ICMSTot></total>
      ${o.pedido ? `<compra><xPed>${o.pedido}</xPed></compra>` : ''}
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><nProt>135260000000001</nProt></infProt></protNFe>
</nfeProc>`;
}

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
    keyUserContact: 'Key user do RH: rh.key@exemplo.com.br',
    now: () => new Date('2026-09-24T12:00:00-03:00'),
    ...extra,
  };
  return { env, calls };
}
