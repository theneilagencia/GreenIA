// Bloco 1: leitura de documentos.
//   PDF com texto ....... texto por página (pdf.js, via unpdf)
//   PDF escaneado ....... OCR local (Tesseract, via OCRmyPDF) nas páginas sem texto
//   imagem .............. OCR local; TIFF e HEIC convertidos no servidor
//   DOCX ................ texto (mammoth); DOC e ODT convertidos antes (LibreOffice)
//   XLSX ................ planilhas com cabeçalho (exceljs); XLS e ODS convertidos antes
//   CSV ................. planilha com cabeçalho (leitor próprio)
//   texto (TXT, MD, XML)  como está
// Formatos de um setor (ex.: XML de NF-e, chave de acesso de DANFE) ficam no
// registro de leitores (src/readers/) e só valem se o tenant os ligar.
// Visão do modelo: só como fallback, na página cujo OCR ficou abaixo do limiar
// de confiança, quando o assistente e a Política de Uso permitem. Antes do
// envio, o texto do próprio OCR passa pela política de dados; cada uso vai
// para a auditoria. Sem fallback, o texto do OCR segue com aviso para revisão.
// "Páginas processadas" (consumo): páginas do PDF; 1 por página de imagem; nos
// demais, 1 a cada 3.000 caracteres (mínimo 1).
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import type { FileKind, PipelineStep } from './params.ts';
import { lerParams } from './params.ts';
import { parseCsv } from '../util/csv.ts';
import type { Reader } from '../readers/registry.ts';
import type { OcrPage, OfficeKind } from '../convert/converter.ts';
import type { ContentPart } from '../llm/provider.ts';
import type { BlockEnv, InputFile, ReadDoc, RunContext, Section, Sheet } from './types.ts';

// Menos que isso de texto numa página: página escaneada (imagem), vai para o OCR.
const SCANNED_CHARS_PER_PAGE = 25;
const IMAGE_MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const ext = (name: string) => (name.split('.').pop() || '').toLowerCase();
const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

function imageType(b: Uint8Array): keyof typeof IMAGE_MIME | 'tiff' | 'heic' | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50])) return 'webp';
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  // HEIF (foto de celular): caixa "ftyp" com marca HEIC/HEIF.
  if (startsWith(b.subarray(4), [0x66, 0x74, 0x79, 0x70]) && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(Buffer.from(b.subarray(8, 12)).toString('latin1'))) return 'heic';
  return null;
}

// Formato pelo conteúdo (assinatura), com a extensão só para desempatar
// formatos ZIP, OLE e texto. "from" indica o formato original que o servidor
// converte antes de ler (DOC, XLS, ODT, ODS).
export function detectFormat(file: Pick<InputFile, 'name' | 'bytes'>, readers: readonly Reader[] = []): { kind: FileKind; from?: OfficeKind; reader?: Reader } | null {
  const b = file.bytes;
  const e = ext(file.name);
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return { kind: 'pdf' };        // %PDF
  if (imageType(b)) return { kind: 'imagem' };
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {                           // ZIP: DOCX, XLSX, ODT ou ODS
    const head = Buffer.from(b.subarray(0, Math.min(b.length, 4096))).toString('latin1');
    if (head.includes('mimetypeapplication/vnd.oasis.opendocument.text')) return { kind: 'docx', from: 'odt' };
    if (head.includes('mimetypeapplication/vnd.oasis.opendocument.spreadsheet')) return { kind: 'xlsx', from: 'ods' };
    if (e === 'docx' || head.includes('word/')) return { kind: 'docx' };
    if (e === 'xlsx' || head.includes('xl/')) return { kind: 'xlsx' };
    if (e === 'odt') return { kind: 'docx', from: 'odt' };
    if (e === 'ods') return { kind: 'xlsx', from: 'ods' };
    return null;
  }
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {  // OLE: Word 97 ou Excel 97
    if (e === 'doc') return { kind: 'docx', from: 'doc' };
    if (e === 'xls') return { kind: 'xlsx', from: 'xls' };
    return null;
  }
  if (b.subarray(0, 4096).includes(0)) return null;                        // binário desconhecido
  // Leitores especializados ligados no tenant reconhecem o arquivo pelo conteúdo.
  const specialized = readers.filter(r => r.kind && r.matches && r.read);
  if (specialized.length) {
    const full = decodeText(b);
    for (const r of specialized) if (r.matches!(full, file.name)) return { kind: r.kind!.id, reader: r };
  }
  if (e === 'csv') return { kind: 'csv' };
  if (e === 'xml' || e === 'json') return { kind: 'texto' };
  if (['txt', 'md', 'markdown', ''].includes(e) || e.length <= 4) return { kind: 'texto' };
  return null;
}

export function detectKind(file: Pick<InputFile, 'name' | 'bytes'>, readers: readonly Reader[] = []): FileKind | null {
  return detectFormat(file, readers)?.kind ?? null;
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

export interface ReadOpts { paginasMax: number; ocrMinConfidence: number; visionFallback: boolean }
type PageOut = ReadDoc['pages'][number];

// Transcrição pela visão do modelo (fallback do OCR). Cada imagem vai com o
// número da página no documento; um PDF inteiro (sem OCR) vai com o número 0.
async function transcribe(env: BlockEnv, name: string, media: { n: number; part: ContentPart }[]): Promise<{ pages: { n: number; text: string }[]; blocked?: string[] }> {
  const content: ContentPart[] = [];
  for (const m of media) {
    if (m.n) content.push({ type: 'text', text: `Página ${m.n}:` });
    content.push(m.part);
  }
  content.push({ type: 'text', text: `Transcreva o documento "${name}".` });
  const r = await env.complete({
    purpose: 'leitura por visão (fallback do OCR)',
    system: 'Você transcreve documentos digitalizados. Transcreva todo o texto visível, sem resumir, corrigir ou interpretar. Antes do texto de cada página, escreva uma linha "=== Página N ===", com o número indicado antes da imagem (ou a ordem da página no PDF). Marque trecho ilegível como [ilegível].',
    content,
    maxOutputTokens: Math.min(16000, 3000 * Math.max(1, media.length)),
  });
  const parts = r.text.split(/^=== Página (\d+) ===\s*$/m);
  const pages: { n: number; text: string }[] = [];
  if (parts.length > 1) for (let i = 1; i < parts.length; i += 2) pages.push({ n: Number(parts[i]), text: parts[i + 1].trim() });
  else pages.push({ n: media[0]?.n || 1, text: r.text.trim() });
  return { pages, blocked: r.blocked };
}

const pct = (n: number | undefined) => `${Math.round(n ?? 0)}%`;

// OCR das páginas escaneadas (PDF: as indicadas; imagem: todas) e, se preciso
// e permitido, fallback de visão nas páginas abaixo do limiar.
async function readScanned(file: InputFile, kind: 'pdf' | 'imagem', pdfPages: number[], opts: ReadOpts, env: BlockEnv, warnings: string[]): Promise<PageOut[]> {
  let ocr: OcrPage[] | null = null;
  let ocrError: string | null = null;
  if (!env.converter) ocrError = 'OCR indisponível no servidor';
  else {
    try { ocr = kind === 'pdf' ? await env.converter.ocrPdf(file.bytes, pdfPages) : await env.converter.ocrImage(file.bytes); }
    catch (e) { ocrError = (e as Error).message; }
  }
  if (ocrError) warnings.push('OCR não foi feito: ' + ocrError);
  const pages: PageOut[] = ocr?.length ? ocr.map(p => ({ n: p.n, text: p.text, via: 'ocr' as const, confianca: p.confidence }))
    : (kind === 'pdf' ? pdfPages : [1]).map(n => ({ n, text: '', via: 'ocr' as const, confianca: 0 }));
  const low = pages.filter(p => (p.confianca ?? 0) < opts.ocrMinConfidence);
  if (!low.length) return pages;
  const lowDesc = low.map(p => `p. ${p.n}: ${pct(p.confianca)}`).join(', ');
  if (!opts.visionFallback) {
    warnings.push(`OCR com baixa confiança (${lowDesc}; mínimo ${opts.ocrMinConfidence}%): confira no original`);
    return pages;
  }
  // O texto do OCR passa pela política antes de qualquer imagem sair do servidor.
  const blocked = env.screen ? await env.screen(low.map(p => p.text).filter(Boolean)) : [];
  if (blocked.length) {
    warnings.push(`OCR com baixa confiança (${lowDesc}); a visão do modelo não foi usada porque o texto lido contém ${blocked.join(', ')}: confira no original`);
    await env.record?.('leitura_visao_nao_usada', { arquivo: file.name, sha256: file.sha256, paginas: low.map(p => p.n), tipos: blocked });
    return pages;
  }
  // Imagem da página já tratada pelo OCR (endireitada); sem OCR, o arquivo original.
  const byN = new Map((ocr ?? []).map(p => [p.n, p]));
  let media: { n: number; part: ContentPart }[] = [];
  if (low.every(p => byN.get(p.n)?.image)) {
    media = low.map(p => ({ n: p.n, part: { type: 'image', mediaType: 'image/jpeg', data: b64(byN.get(p.n)!.image!) } }));
  } else if (kind === 'pdf') {
    media = [{ n: 0, part: { type: 'pdf', data: b64(file.bytes), title: file.name } }];
  } else {
    const t = imageType(file.bytes);
    if (t && t in IMAGE_MIME) media = [{ n: 1, part: { type: 'image', mediaType: IMAGE_MIME[t], data: b64(file.bytes) } }];
    else if (env.converter) {
      const jpgs = await env.converter.imageToJpeg(file.bytes).catch(() => [] as Uint8Array[]);
      media = jpgs.map((j, i) => ({ n: i + 1, part: { type: 'image', mediaType: 'image/jpeg', data: b64(j) } }));
    }
  }
  if (!media.length) {
    warnings.push(`OCR com baixa confiança (${lowDesc}) e a imagem não pôde ser preparada para a visão: confira no original`);
    return pages;
  }
  await env.record?.('leitura_visao_fallback', {
    arquivo: file.name, sha256: file.sha256, paginas: low.map(p => p.n), confiancas: low.map(p => p.confianca ?? 0),
    limiar: opts.ocrMinConfidence, motivo: ocrError ? 'ocr_indisponivel' : 'confianca_baixa',
  });
  const t = await transcribe(env, file.name, media);
  if (t.blocked?.length) {
    warnings.push('transcrição com dado bloqueado pela política: ' + t.blocked.join(', '));
    return pages;
  }
  const lowSet = new Set(low.map(p => p.n));
  for (const tp of t.pages) {
    const target = pages.find(p => p.n === tp.n);
    if (target && lowSet.has(tp.n)) Object.assign(target, { text: tp.text, via: 'visao' });
    else if (!target && kind === 'imagem') pages.push({ n: tp.n, text: tp.text, via: 'visao' });
  }
  warnings.push(`lida pela visão do modelo (OCR abaixo de ${opts.ocrMinConfidence}%): ${low.map(p => 'p. ' + p.n).join(', ')}`);
  return pages;
}

const viaOf = (pages: PageOut[]): ReadDoc['via'] => pages.some(p => p.via === 'visao') ? 'visao' : pages.some(p => p.via === 'ocr') ? 'ocr' : 'texto';
const joinPages = (pages: PageOut[]) => pages.map(p => p.text).filter(Boolean).join('\n\n');

// Leitura genérica e, depois, o que os leitores ligados acrescentam.
export async function readFile(input: InputFile, opts: ReadOpts, env: BlockEnv): Promise<ReadDoc> {
  const doc = await readBase(input, opts, env);
  for (const r of env.readers ?? []) {
    const e = r.enrich?.(doc);
    if (!e) continue;
    doc.dados = { ...doc.dados, [r.id]: e.dados };
    if (e.semExtracao) doc.semExtracao = e.semExtracao;
    if (e.periodo) doc.periodo = e.periodo;
  }
  return doc;
}

async function readBase(input: InputFile, opts: ReadOpts, env: BlockEnv): Promise<ReadDoc> {
  const fmt = detectFormat(input, env.readers);
  const base = { fileId: input.id, name: input.name, sha256: input.sha256, warnings: [] as string[] };
  if (!fmt) return { ...base, kind: 'texto', via: 'texto', pages: [], text: '', pageCount: 0, warnings: ['tipo de arquivo não reconhecido'] };
  const kind = fmt.kind;
  let file = input;
  let convertedFrom: string | undefined;
  if (fmt.from) {
    // DOC, XLS, ODT, ODS: convertidos para DOCX ou XLSX no servidor antes da leitura.
    convertedFrom = fmt.from.toUpperCase();
    if (!env.converter) return { ...base, kind, via: 'texto', pages: [], text: '', pageCount: 0, convertedFrom, warnings: [`arquivo ${convertedFrom} não lido: conversão indisponível no servidor`] };
    try { file = { ...input, bytes: await env.converter.officeToOoxml(input.bytes, fmt.from) }; }
    catch (e) { return { ...base, kind, via: 'texto', pages: [], text: '', pageCount: 0, convertedFrom, warnings: [`arquivo ${convertedFrom} não pôde ser convertido: ${(e as Error).message}`] }; }
  }

  if (kind === 'pdf') {
    let pages: PageOut[] = [];
    let total = 0;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
      const r = await extractText(pdf, { mergePages: false });
      total = r.totalPages;
      pages = r.text.slice(0, opts.paginasMax).map((t, i) => ({ n: i + 1, text: t.trim(), via: 'texto' as const }));
    } catch (e) {
      return { ...base, kind, via: 'texto', pages: [], text: '', pageCount: 0, warnings: ['PDF não pôde ser aberto: ' + (e as Error).message] };
    }
    if (total > opts.paginasMax) base.warnings.push(`PDF com ${total} páginas: lidas só as ${opts.paginasMax} primeiras`);
    const scanned = pages.filter(p => p.text.replace(/\s+/g, '').length < SCANNED_CHARS_PER_PAGE).map(p => p.n);
    if (scanned.length) {
      const ocr = await readScanned(file, 'pdf', scanned, opts, env, base.warnings);
      pages = pages.map(p => ocr.find(o => o.n === p.n) ?? p);
    }
    const text = joinPages(pages);
    return { ...base, kind, via: viaOf(pages), pages, text, pageCount: Math.min(total, opts.paginasMax) };
  }

  if (kind === 'imagem') {
    const t = imageType(file.bytes);
    if (t === 'tiff' || t === 'heic') convertedFrom = t.toUpperCase();
    const pages = await readScanned(file, 'imagem', [], opts, env, base.warnings);
    return { ...base, kind, via: viaOf(pages), pages, text: joinPages(pages), pageCount: pages.length, convertedFrom };
  }

  if (kind === 'docx') {
    const r = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
    const text = r.value.replace(/\n{3,}/g, '\n\n').trim();
    return { ...base, kind, via: 'texto', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text), convertedFrom };
  }

  if (kind === 'xlsx') {
    const sheets = await readXlsx(file.bytes);
    const text = sheets.map(sheetText).join('\n\n');
    return { ...base, kind, via: 'parser', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text), sheets, convertedFrom };
  }

  if (kind === 'csv') {
    const sheets = [sheetFromRows(file.name.replace(/\.csv$/i, ''), parseCsv(decodeText(file.bytes)))];
    const text = sheetText(sheets[0]);
    return { ...base, kind, via: 'parser', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text), sheets };
  }

  if (fmt.reader) {
    try {
      const out = fmt.reader.read!(decodeText(file.bytes));
      return { ...base, kind, via: 'parser', pages: [{ n: 1, text: out.text }], text: out.text, pageCount: 1, dados: { [fmt.reader.id]: out.dados }, periodo: out.periodo ?? null };
    } catch (e) {
      return { ...base, kind, via: 'parser', pages: [], text: '', pageCount: 0, warnings: [(e as Error).message] };
    }
  }

  const text = decodeText(file.bytes).trim();
  return { ...base, kind: 'texto', via: 'texto', pages: [{ n: 1, text }], text, pageCount: pagesFromChars(text) };
}

export async function lerBlock(ctx: RunContext, step: PipelineStep): Promise<Section> {
  const p = lerParams.parse(step.params);
  const opts: ReadOpts = {
    paginasMax: p.paginasMax,
    ocrMinConfidence: ctx.def.reading.ocrMinConfidence,
    visionFallback: ctx.def.reading.visionFallback && p.visao !== 'nunca' && ctx.env.visionAllowedByPolicy !== false,
  };
  const accept = new Set(p.tipos ?? ctx.def.inputs.files.accept);
  const flags: Section['flags'] = [];
  const read: ReadDoc[] = [];
  for (const f of ctx.files) {
    if (ctx.docs.some(d => d.fileId === f.id)) continue;               // já lido por outro bloco de leitura
    const kind = detectKind(f, ctx.env.readers);
    if (!kind || !accept.has(kind)) {
      flags.push({ reason: kind ? `tipo ${kind} não aceito por este assistente` : 'tipo de arquivo não reconhecido', ref: f.name });
      continue;
    }
    const doc = await readFile(f, opts, ctx.env);
    for (const w of doc.warnings) flags.push({ reason: w, ref: f.name });
    if (!doc.text && !doc.sheets?.length && !doc.dados) flags.push({ reason: 'nenhum conteúdo lido', ref: f.name });
    read.push(doc);
  }
  ctx.docs.push(...read);
  // Leitores que relacionam documentos da execução (ex.: DANFE com o XML de mesma chave).
  let pendencias = 0;
  for (const r of ctx.env.readers ?? []) {
    for (const l of r.link?.(read, ctx.docs) ?? []) {
      const d = read.find(x => x.fileId === l.fileId);
      if (!d) continue;
      d.situacao = l.situacao;
      if (l.pendencia) { pendencias++; flags.push({ reason: l.pendencia, ref: d.name }); }
    }
  }
  const summaries = (d: ReadDoc) => Object.fromEntries((ctx.env.readers ?? []).filter(r => d.dados?.[r.id] !== undefined)
    .map(r => [r.id, r.summary ? r.summary(d.dados![r.id], d) : true]));
  const ocrConf = (d: ReadDoc) => {
    const c = d.pages.filter(pg => pg.via === 'ocr' && pg.confianca !== undefined).map(pg => pg.confianca!);
    return c.length ? Math.round(c.reduce((a, b) => a + b, 0) / c.length) : undefined;
  };
  return {
    id: step.id, bloco: 'ler', titulo: step.titulo || 'Documentos lidos', kind: 'documentos', flags,
    counts: pendencias ? { pendencias } : undefined,
    data: read.map(d => ({
      arquivo: d.name, tipo: d.kind, leitura: d.via, convertidoDe: d.convertedFrom, paginas: d.pageCount,
      confiancaOcr: ocrConf(d),
      paginasPorVisao: d.pages.filter(pg => pg.via === 'visao').map(pg => pg.n),
      planilhas: d.sheets?.map(s => ({ nome: s.name, linhas: s.rows.length })),
      ...summaries(d),
      situacao: d.situacao,
      avisos: d.warnings,
    })),
  };
}
