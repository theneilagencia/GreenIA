// Bloco 9: exportação da saída revisada em XLSX, CSV, PDF, DOCX e, para a
// classificação, ZIP organizado (pastas por categoria, arquivos renomeados e
// índice). Só saída aprovada é exportada como final (a rota confere); o arquivo
// traz a execução, a versão do assistente e quem revisou.
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { toCsv } from '../util/csv.ts';
import type { GeneratedFile, InputFile, Section } from './types.ts';
import type { LinhaIndice } from './classificar.ts';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'docx' | 'zip';

export interface ExportMeta {
  runId: string;
  assistente: string;
  versao: number;
  criadoEm: string;
  revisao: { status: string; revisor: string; em: string };
  tenant: string;
}

interface Tabela { titulo: string; colunas: string[]; linhas: Record<string, unknown>[]; texto?: string[] }

const fmt = (v: unknown): string => v === null || v === undefined ? '' : Array.isArray(v) ? v.map(fmt).join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v);

function flatten(obj: unknown, prefix = ''): [string, unknown][] {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  if (Array.isArray(obj) && obj.some(x => x && typeof x === 'object')) return obj.flatMap((x, i) => flatten(x, `${prefix}[${i + 1}]`));
  return [[prefix, obj]];
}

// Cada seção vira uma tabela (e, se for texto, parágrafos).
// Como o arquivo foi lido, em palavras (OCR, visão, conversão), e a situação dada por um leitor.
const LEITURA: Record<string, string> = { texto: 'texto', parser: 'leitura direta', ocr: 'OCR', visao: 'OCR e visão do modelo' };
export function leituraLabel(x: { leitura: string; confiancaOcr?: number; paginasPorVisao?: number[]; convertidoDe?: string }): string {
  const parts = [LEITURA[x.leitura] ?? x.leitura];
  if (x.confiancaOcr !== undefined) parts.push(`confiança ${x.confiancaOcr}%`);
  if (x.paginasPorVisao?.length) parts.push(`visão nas p. ${x.paginasPorVisao.join(', ')}`);
  if (x.convertidoDe) parts.push(`convertido de ${x.convertidoDe}`);
  return parts.join('; ');
}
export const situacaoLabel = (x: { situacao?: string }) => x.situacao ?? '';

export function sectionTable(s: Section): Tabela | null {
  const d = s.data as any;
  switch (s.kind) {
    case 'documentos':
      return { titulo: s.titulo, colunas: ['Arquivo', 'Tipo', 'Leitura', 'Páginas', 'Situação', 'Avisos'], linhas: d.map((x: any) => ({ Arquivo: x.arquivo, Tipo: x.tipo, Leitura: leituraLabel(x), 'Páginas': x.paginas, 'Situação': situacaoLabel(x), Avisos: fmt(x.avisos) })) };
    case 'campos':
      return { titulo: s.titulo, colunas: ['Documento', 'Campo', 'Valor', 'Página', 'Trecho de origem', 'Válido'], linhas: d.flatMap((e: any) => flatten(e.campos ?? {}).map(([campo, valor]) => {
        const o = e.origem.find((x: any) => x.campo === campo || x.campo.replace(/\[(\d+)\]/g, (_: string, n: string) => `[${+n + 1}]`) === campo);
        return { Documento: e.arquivo, Campo: campo, Valor: fmt(valor), 'Página': o?.pagina ?? '', 'Trecho de origem': o?.trecho ?? '', 'Válido': e.valido ? 'sim' : 'não: ' + e.erros.join('; ') };
      })) };
    case 'divergencias': {
      const L = d.rotulos.esquerda, R = d.rotulos.direita;
      return { titulo: s.titulo, colunas: ['Chave', 'Campo', 'Divergência', L, `Origem (${L})`, R, `Origem (${R})`],
        texto: [`${d.resumo.pares} registros comparados, ${d.resumo.divergencias} divergências (${L}: ${d.resumo.esquerda}; ${R}: ${d.resumo.direita}).`],
        linhas: d.divergencias.map((x: any) => ({ Chave: x.chave, Campo: x.campo, 'Divergência': x.motivo, [L]: fmt(x.esquerda?.valor), [`Origem (${L})`]: x.esquerda?.origem ?? '', [R]: fmt(x.direita?.valor), [`Origem (${R})`]: x.direita?.origem ?? '' })) };
    }
    case 'checklist':
      return { titulo: s.titulo, colunas: ['Item', 'Obrigatório', 'Situação', 'Evidência', 'Observação'],
        texto: [`Presentes: ${d.resumo.presente}; ausentes: ${d.resumo.ausente}; duvidosos: ${d.resumo.duvidoso}.`, ...(d.naoIdentificados.length ? [`Arquivos não identificados: ${d.naoIdentificados.join(', ')}.`] : [])],
        linhas: d.itens.map((i: any) => ({ Item: i.nome, 'Obrigatório': i.obrigatorio ? 'sim' : 'não', 'Situação': i.status, 'Evidência': i.evidencias.map((e: any) => `${e.arquivo} (${e.como})`).join('; '), 'Observação': i.motivo })) };
    case 'classificacao':
      return { titulo: s.titulo, colunas: ['Arquivo', 'Categoria', 'Período', 'Nome sugerido', 'Confiança'], linhas: d.indice.map((r: LinhaIndice) => ({ Arquivo: r.arquivo, Categoria: r.categoriaNome, 'Período': r.periodo ?? '', 'Nome sugerido': r.nomeSugerido, 'Confiança': r.confianca })) };
    case 'resposta':
      return { titulo: s.titulo, colunas: ['Documento', 'Versão'], linhas: d.fontes.map((f: any) => ({ Documento: f.title, 'Versão': f.version })), texto: [`Pergunta: ${d.pergunta}`, d.resposta] };
    case 'busca':
      return { titulo: s.titulo, colunas: ['Origem', 'Documento', 'Versão', 'Trecho'], linhas: d.resultados.map((r: any) => ({ Origem: r.origem === 'base' ? 'base de conhecimento' : 'arquivo enviado', Documento: r.titulo, 'Versão': r.version ?? '', Trecho: r.trecho })) };
    case 'resumo':
      return { titulo: s.titulo, colunas: ['Tópico', 'Texto'], linhas: d.topicos.map((t: any) => ({ 'Tópico': t.titulo, Texto: t.texto })), texto: d.topicos.map((t: any) => `${t.titulo}: ${t.texto}`) };
    default:
      return null;
  }
}

const STATUS_LABEL: Record<string, string> = { aprovado: 'aprovada sem edição', aprovado_com_edicao: 'aprovada com edição', rejeitado: 'rejeitada', rascunho: 'rascunho, não revisado' };

const metaLines = (m: ExportMeta) => [
  `Assistente: ${m.assistente} (versão ${m.versao})`,
  `Execução: ${m.runId}, de ${m.criadoEm.slice(0, 16).replace('T', ' ')}`,
  `Revisão: ${STATUS_LABEL[m.revisao.status] ?? m.revisao.status} por ${m.revisao.revisor} em ${m.revisao.em.slice(0, 16).replace('T', ' ')}`,
  `Cliente: ${m.tenant}`,
];

const tables = (sections: Section[]) => sections.map(sectionTable).filter((t): t is Tabela => !!t);
// Tabela principal (para CSV): a primeira que não seja a lista de documentos lidos.
const primary = (ts: Tabela[], sections: Section[]) => ts[sections.filter(s => sectionTable(s)).findIndex(s => s.kind !== 'documentos')] ?? ts[0];

async function toXlsx(sections: Section[], m: ExportMeta): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreenIA';
  const info = wb.addWorksheet('Identificação');
  metaLines(m).forEach(l => info.addRow([l]));
  info.getColumn(1).width = 100;
  const names = new Set<string>(['identificação']);
  for (const t of tables(sections)) {
    let name = t.titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Seção';
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${name.slice(0, 26)} ${i}`;
    names.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    ws.addRow(t.colunas).font = { bold: true };
    for (const r of t.linhas) ws.addRow(t.colunas.map(c => { const v = r[c]; return typeof v === 'number' ? v : fmt(v); }));
    t.colunas.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(60, Math.max(12, c.length + 2, ...t.linhas.map(r => fmt(r[c]).length + 2))); });
    if (t.linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.colunas.length } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

function toPdf(sections: Section[], m: ExportMeta): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: m.assistente, Creator: 'GreenIA' } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(16).text(m.assistente);
    doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#444444');
    metaLines(m).forEach(l => doc.text(l));
    doc.fillColor('#000000');
    for (const t of tables(sections)) {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(12).text(t.titulo);
      doc.font('Helvetica').fontSize(9.5);
      for (const p of t.texto ?? []) doc.moveDown(0.3).text(p);
      if (!t.linhas.length) { doc.moveDown(0.3).fillColor('#666666').text('Nenhum registro.').fillColor('#000000'); continue; }
      for (const r of t.linhas) {
        doc.moveDown(0.4);
        t.colunas.forEach((c, i) => {
          const v = fmt(r[c]);
          if (!v) return;
          doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').text(`${c}: `, { continued: true }).font('Helvetica').text(v);
        });
      }
    }
    doc.end();
  });
}

async function toDocx(sections: Section[], m: ExportMeta): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: m.assistente, heading: HeadingLevel.HEADING_1 }),
    ...metaLines(m).map(l => new Paragraph({ children: [new TextRun({ text: l, size: 18, color: '444444' })] })),
  ];
  for (const t of tables(sections)) {
    children.push(new Paragraph({ text: t.titulo, heading: HeadingLevel.HEADING_2 }));
    for (const p of t.texto ?? []) children.push(new Paragraph(p));
    if (!t.linhas.length) { children.push(new Paragraph('Nenhum registro.')); continue; }
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: t.colunas.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })] })) }),
        ...t.linhas.map(r => new TableRow({ children: t.colunas.map(c => new TableCell({ children: [new Paragraph(fmt(r[c]))] })) })),
      ],
    }));
  }
  return new Uint8Array(await Packer.toBuffer(new Document({ creator: 'GreenIA', title: m.assistente, sections: [{ children }] })));
}

// ZIP organizado a partir do índice revisado: arquivo original renomeado,
// em pasta por categoria (ou no caminho do nome sugerido), com o índice em CSV.
async function toZip(sections: Section[], m: ExportMeta, files: InputFile[]): Promise<Uint8Array> {
  const sec = sections.find(s => s.kind === 'classificacao');
  if (!sec) throw new Error('não há classificação nesta saída para montar o pacote');
  const indice = (sec.data as { indice: LinhaIndice[] }).indice;
  const zip = new JSZip();
  const rows: Record<string, unknown>[] = [];
  for (const r of indice) {
    const f = files.find(x => x.name === r.arquivo);
    const path = (r.nomeSugerido.includes('/') ? r.nomeSugerido : `${r.categoria ?? 'nao-classificado'}/${r.nomeSugerido}`).replace(/\.\.+/g, '.').replace(/^\/+/, '');
    if (f) zip.file(path, f.bytes);
    rows.push({ 'Arquivo original': r.arquivo, Categoria: r.categoriaNome, 'Período': r.periodo ?? '', 'Caminho no pacote': f ? path : '(arquivo original indisponível)', sha256: f?.sha256 ?? '' });
  }
  zip.file('indice.csv', toCsv(rows));
  zip.file('LEIAME.txt', metaLines(m).join('\r\n') + '\r\n');
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

const MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
};

export async function exportSections(format: ExportFormat, sections: Section[], meta: ExportMeta, files: InputFile[] = []): Promise<GeneratedFile> {
  const base = `${meta.assistente.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'saida'}-${meta.runId.slice(0, 8)}`;
  const visible = sections.filter(s => s.kind !== 'exportacao');
  let bytes: Uint8Array;
  if (format === 'xlsx') bytes = await toXlsx(visible, meta);
  else if (format === 'pdf') bytes = await toPdf(visible, meta);
  else if (format === 'docx') bytes = await toDocx(visible, meta);
  else if (format === 'zip') bytes = await toZip(visible, meta, files);
  else {
    const ts = tables(visible);
    const t = primary(ts, visible);
    bytes = new TextEncoder().encode(toCsv(t?.linhas ?? [], t?.colunas));
  }
  return { name: `${base}.${format}`, mime: MIME[format], bytes };
}

// A etapa "exportar" do pipeline só declara os formatos disponíveis para a
// saída aprovada.
export async function exportarBlock(_ctx: unknown, step: { id: string; titulo?: string; params: Record<string, unknown> }): Promise<Section> {
  return { id: step.id, bloco: 'exportar', titulo: step.titulo || 'Exportação', kind: 'exportacao', data: { formatos: step.params.formatos }, flags: [] };
}
