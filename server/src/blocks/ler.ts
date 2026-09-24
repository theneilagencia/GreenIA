// Bloco 1: leitura de documentos.
//   PDF com texto ....... texto por página (pdf.js, via unpdf)
//   PDF escaneado ....... visão do modelo (quando o PDF quase não tem texto)
//   imagem .............. visão do modelo
//   DOCX ................ texto (mammoth)
//   XLSX ................ planilhas com cabeçalho (exceljs)
//   CSV ................. planilha com cabeçalho (leitor próprio)
//   XML de NF-e ......... campos por parser, sem modelo
//   texto (TXT, MD) ..... como está
// "Páginas processadas" (consumo): páginas do PDF; 1 por imagem; nos demais,
// 1 a cada 3.000 caracteres (mínimo 1).
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import type { FileKind, PipelineStep } from './params.ts';
import { lerParams } from './params.ts';
import { parseCsv } from '../util/csv.ts';
import { isNFeXml, nfeToText, parseNFe } from './nfe.ts';
import type { BlockEnv, InputFile, ReadDoc, RunContext, Section, Sheet } from './types.ts';

// Menos que isso de texto por página: PDF escaneado (imagem), vai para a visão.
const SCANNED_CHARS_PER_PAGE = 25;
const IMAGE_MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const ext = (name: string) => (name.split('.').pop() || '').toLowerCase();
const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

function imageType(b: Uint8Array): keyof typeof IMAGE_MIME | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50])) return 'webp';
  return null;
}

// Tipo pelo conteúdo (assinatura), com a extensão só para desempatar formatos ZIP e texto.
export function detectKind(file: Pick<InputFile, 'name' | 'bytes'>): FileKind | null {
  const b = file.bytes;
  const e = ext(file.name);
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return 'pdf';               // %PDF
  if (imageType(b)) return 'imagem';
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {                           // ZIP: DOCX ou XLSX
    const head = Buffer.from(b.subarray(0, Math.min(b.length, 4096))).toString('latin1');
    if (e === 'docx' || head.includes('word/')) return 'docx';
    if (e === 'xlsx' || head.includes('xl/')) return 'xlsx';
    return null;
  }
  const text = Buffer.from(b.subarray(0, 4096)).toString('utf8');
  if (b.subarray(0, 4096).includes(0)) return null;                        // binário desconhecido
  if (e === 'xml' || text.trimStart().startsWith('<?xml') || text.includes('<nfeProc') || text.includes('<NFe')) {
    return isNFeXml(Buffer.from(b).toString('utf8')) ? 'nfe_xml' : 'texto';
  }
  if (e === 'csv') return 'csv';
  if (['txt', 'md', 'markdown', ''].includes(e) || e.length <= 4) return 'texto';
  return null;
}

const decodeText = (b: Uint8Array) => {
  const utf8 = Buffer.from(b).toString('utf8');
  // Arquivo em Latin-1 (comum em exportações de ERP): caracteres inválidos em UTF-8.
  return utf8.includes('\uFFFD') ? Buffer.from(b).toString('latin1') : utf8;
};
const pagesFromChars = (text: string) => Math.max(1, Math.ceil(text.length / 3000));
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

const filled = (r: (string | number | null)[]) => r.filter(c => c !== null && String(c).trim() !== '').length;

// Cabeçalho: a primeira linha (entre as 20 primeiras) com pelo menos 60% das
// colunas preenchidas. Pula títulos e linhas em branco acima da tabela, comuns
// em planilhas exportadas do ERP.
function sheetFromRows(name: string, rows: (string | number | null)[][], firstRowNumber = 1): Sheet {
  const top = rows.slice(0, 20).map(filled);
  const widest = Math.max(0, ...top);
  const headerIdx = widest === 0 ? -1 : top.findIndex(n => n >= Math.max(1, Math.ceil(widest * 0.6)));
  if (headerIdx < 0) return { name, header: [], rows: [], rowNumbers: [] };
  const header = rows[headerIdx].map((h, i) => (h === null || String(h).trim() === '' ? `coluna_${i + 1}` : String(h).trim()));
  const out: Sheet = { name, header, rows: [], rowNumbers: [] };
  rows.slice(headerIdx + 1).forEach((r, i) => {
    if (!filled(r)) return;
    out.rows.push(Object.fromEntries(header.map((h, j) => [h, r[j] ?? null])));
    out.rowNumbers.push(firstRowNumber + headerIdx + 1 + i);
  });
  return out;
}

function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(t => t.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ('error' in v) return null;
  }
  return String(v);
}

async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets.map(ws => {
    const rows: (string | number | null)[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const vals: (string | number | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(row.getCell(c).value));
      rows.push(vals);
    }
    return sheetFromRows(ws.name, rows);
  });
}

const sheetText = (s: Sheet) => [`[${s.name}]`, s.header.join(' | '), ...s.rows.map(r => s.header.map(h => r[h] ?? '').join(' | '))].join('\n');

// Transcrição pela visão do modelo, página a página.
async function transcribe(env: BlockEnv, file: InputFile, kind: 'pdf' | 'imagem'): Promise<{ pages: { n: number; text: string }[]; blocked?: string[] }> {
  const media = kind === 'pdf' ? { type: 'pdf' as const, data: b64(file.bytes), title: file.name }
    : { type: 'image' as const, mediaType: IMAGE_MIME[imageType(file.bytes)!], data: b64(file.bytes) };
  const r = await env.complete({
    purpose: 'leitura por visão',
    system: 'Você transcreve documentos digitalizados. Transcreva todo o texto visível, sem resumir, corrigir ou interpretar. Antes do texto de cada página, escreva uma linha "=== Página N ===". Marque trecho ilegível como [ilegível].',
    content: [media, { type: 'text', text: `Transcreva o documento "${file.name}".` }],
    maxOutputTokens: 8000,
  });
  const parts = r.text.split(/^=== Página (\d+) ===\s*$/m);
  const pages: { n: number; text: string }[] = [];
  if (parts.length > 1) for (let i = 1; i < parts.length; i += 2) pages.push({ n: Number(parts[i]), text: parts[i + 1].trim() });
  else pages.push({ n: 1, text: r.text.trim() });
  return { pages, blocked: r.blocked };
}

export async function readFile(file: InputFile, opts: { visao: 'auto' | 'sempre' | 'nunca'; paginasMax: number }, env: BlockEnv): Promise<ReadDoc> {
  const kind = detectKind(file);
  const base = { fileId: file.id, name: file.name, sha256: file.sha256, warnings: [] as string[] };
  if (!kind) return { ...base, kind: 'texto', via: 'texto', pages: [], text: '', pageCount: 0, warnings: ['tipo de arquivo não reconhecido'] };

  if (kind === 'pdf') {
    let pages: { n: number; text: string }[] = [];
    let total = 0;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
      const r = await extractText(pdf, { mergePages: false });
      total = r.totalPages;
      pages = r.text.slice(0, opts.paginasMax).map((t, i) => ({ n: i + 1, text: t.trim() }));
    } catch (e) {
      return { ...base, kind, via: 'texto', pages: [], text: '', pageCount: 0, warnings: ['PDF não pôde ser aberto: ' + (e as Error).message] };
    }
    if (total > opts.paginasMax) base.warnings.push(`PDF com ${total} páginas: lidas só as ${opts.paginasMax} primeiras`);
    const chars = pages.reduce((n, p) => n + p.text.length, 0);
    const scanned = chars / Math.max(1, pages.length) < SCANNED_CHARS_PER_PAGE;
    if ((scanned && opts.visao !== 'nunca') || opts.visao === 'sempre') {
      const t = await transcribe(env, file, 'pdf');
      if (t.blocked?.length) base.warnings.push('transcrição com dado bloqueado pela política: ' + t.blocked.join(', '));
      return { ...base, kind, via: 'visao', pages: t.pages, text: t.pages.map(p => p.text).join('\n\n'), pageCount: Math.min(total, opts.paginasMax) };
    }
    if (scanned) base.warnings.push('PDF sem texto (escaneado) e leitura por visão desligada neste assistente');
    return { ...base, kind, via: 'texto', pages, text: pages.map(p => p.text).join('\n\n'), pageCount: Math.min(total, opts.paginasMax) };
  }

  if (kind === 'imagem') {
    if (opts.visao === 'nunca') return { ...base, kind, via: 'texto', pages: [], text: '', pageCount: 0, warnings: ['imagem ignorada: leitura por visão desligada neste assistente'] };
    const t = await transcribe(env, file, 'imagem');
    if (t.blocked?.length) base.warnings.push('transcrição com dado bloqueado pela política: ' + t.blocked.join(', '));
    return { ...base, kind, via: 'visao', pages: t.pages, text: t.pages.map(p => p.text).join('\n\n'), pageCount: 1 };
  }

  if (kind === 'docx') {
    const r = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
    const text = r.value.replace(/\n{3,}/g, '\n\n').trim();
    return { ...base, kind, via: 'texto', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text) };
  }

  if (kind === 'xlsx') {
    const sheets = await readXlsx(file.bytes);
    const text = sheets.map(sheetText).join('\n\n');
    return { ...base, kind, via: 'parser', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text), sheets };
  }

  if (kind === 'csv') {
    const sheets = [sheetFromRows(file.name.replace(/\.csv$/i, ''), parseCsv(decodeText(file.bytes)))];
    const text = sheetText(sheets[0]);
    return { ...base, kind, via: 'parser', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text), sheets };
  }

  if (kind === 'nfe_xml') {
    try {
      const nfe = parseNFe(decodeText(file.bytes));
      const text = nfeToText(nfe);
      return { ...base, kind, via: 'parser', pages: [{ n: 1, text }], text, pageCount: 1, nfe };
    } catch (e) {
      return { ...base, kind, via: 'parser', pages: [], text: '', pageCount: 0, warnings: [(e as Error).message] };
    }
  }

  const text = decodeText(file.bytes).trim();
  return { ...base, kind: 'texto', via: 'texto', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text) };
}

export async function lerBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = lerParams.parse(step.params);
  const accept = new Set(p.tipos ?? ctx.def.inputs.files.accept);
  const flags: Section['flags'] = [];
  const read: ReadDoc[] = [];
  for (const f of ctx.files) {
    if (ctx.docs.some(d => d.fileId === f.id)) continue;               // já lido por outro bloco de leitura
    const kind = detectKind(f);
    if (!kind || !accept.has(kind)) {
      flags.push({ reason: kind ? `tipo ${kind} não aceito por este assistente` : 'tipo de arquivo não reconhecido', ref: f.name });
      continue;
    }
    const doc = await readFile(f, p, ctx.env);
    for (const w of doc.warnings) flags.push({ reason: w, ref: f.name });
    if (!doc.text && !doc.sheets?.length && !doc.nfe) flags.push({ reason: 'nenhum conteúdo lido', ref: f.name });
    read.push(doc);
  }
  ctx.docs.push(...read);
  return {
    id: step.id, bloco: 'ler', titulo: step.titulo || 'Documentos lidos', kind: 'documentos', flags,
    data: read.map(d => ({ arquivo: d.name, tipo: d.kind, leitura: d.via, paginas: d.pageCount, planilhas: d.sheets?.map(s => ({ nome: s.name, linhas: s.rows.length })), nfe: d.nfe ? { numero: d.nfe.numero, itens: d.nfe.itens.length } : undefined, avisos: d.warnings })),
  };
}
