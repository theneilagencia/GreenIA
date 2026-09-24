// Peças comuns dos geradores do corpus da Fase 4. Tudo é fictício e
// determinístico: a mesma semente gera os mesmos arquivos (mesmo sha256), para
// o gabarito poder ser escrito, conferido e versionado antes de qualquer rodada.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const MARCA = 'ESPÉCIME · DOCUMENTO FICTÍCIO';
const FIXA = new Date('2026-09-01T12:00:00Z');                      // data fixa nos metadados: o mesmo arquivo a cada geração

// Aleatório com semente (mulberry32).
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[int(0, list.length - 1)];
  const shuffle = <T>(list: readonly T[]) => { const c = [...list]; for (let i = c.length - 1; i > 0; i--) { const j = int(0, i); [c[i], c[j]] = [c[j], c[i]]; } return c; };
  return { next, int, pick, shuffle, digits: (n: number) => Array.from({ length: n }, () => int(0, 9)).join('') };
}
export type Rng = ReturnType<typeof rng>;

// Nomes inventados (combinação de listas comuns; nenhuma pessoa real).
const PRENOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sílvia', 'Tiago', 'Vanessa', 'Wagner'];
const SOBRENOMES = ['Albuquerque Fictício', 'Barreto Exemplo', 'Cardoso Modelo', 'Duarte Teste', 'Esteves Fictícia', 'Fontes Exemplo', 'Guimarães Modelo', 'Hartmann Teste', 'Leal Fictício', 'Moraes Exemplo'];
const RUAS = ['Rua das Acácias', 'Avenida dos Ipês', 'Rua Projetada 12', 'Travessa do Exemplo', 'Rua Fictícia', 'Alameda das Palmeiras'];
const CIDADES = [['Campinas', 'SP'], ['Curitiba', 'PR'], ['Recife', 'PE'], ['Goiânia', 'GO'], ['Porto Alegre', 'RS'], ['Belo Horizonte', 'MG']] as const;
export const pessoa = (r: Rng) => {
  const [cidade, uf] = r.pick(CIDADES);
  return { nome: `${r.pick(PRENOMES)} ${r.pick(SOBRENOMES)}`, cpf: cpf(r), rg: `${r.digits(2)}.${r.digits(3)}.${r.digits(3)}-${r.int(0, 9)}`,
    nascimento: `${String(r.int(1, 28)).padStart(2, '0')}/${String(r.int(1, 12)).padStart(2, '0')}/${r.int(1970, 2004)}`,
    endereco: `${r.pick(RUAS)}, ${r.int(10, 2500)}`, cidade, uf, cep: `${r.digits(5)}-${r.digits(3)}` };
};
export type Pessoa = ReturnType<typeof pessoa>;

// CPF com dígitos verificadores válidos (o filtro de dados e a validação do
// detector se comportam como com um documento real). Número inventado.
export function cpf(r: Rng): string {
  const n = Array.from({ length: 9 }, () => r.int(0, 9));
  if (new Set(n).size === 1) n[0] = (n[0] + 1) % 10;
  const dv = (base: number[]) => { const s = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0); const m = (s * 10) % 11; return m === 10 ? 0 : m; };
  const d1 = dv(n); const d2 = dv([...n, d1]);
  const s = [...n, d1, d2].join('');
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
export function cpfValido(c: string): boolean {
  const d = c.replace(/\D/g, '').split('').map(Number);
  if (d.length !== 11 || new Set(d).size === 1) return false;
  const dv = (k: number) => { const s = d.slice(0, k).reduce((acc, x, i) => acc + x * (k + 1 - i), 0); const m = (s * 10) % 11; return m === 10 ? 0 : m; };
  return dv(9) === d[9] && dv(10) === d[10];
}

export interface PdfBlock { titulo?: string; linhas: string[] }

// PDF digital com marca d'água diagonal em cada página (a marca também sai no texto do PDF).
export function pdf(paginas: PdfBlock[][], opts: { marca?: boolean } = {}): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: paginas[0]?.[0]?.titulo ?? 'Documento fictício', Creator: 'GreenIA · corpus da Fase 4', CreationDate: FIXA, ModDate: FIXA } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    paginas.forEach((blocos, i) => {
      if (i) doc.addPage();
      if (opts.marca !== false) {
        doc.save().rotate(-35, { origin: [300, 420] }).fontSize(46).fillColor('#d9d9d9').text(MARCA, 20, 400, { width: 600, align: 'center' }).restore();
        doc.fillColor('#000000');
      }
      doc.x = 56; doc.y = 60;
      for (const b of blocos) {
        if (b.titulo) doc.font('Helvetica-Bold').fontSize(14).text(b.titulo).moveDown(0.4);
        doc.font('Helvetica').fontSize(11);
        for (const l of b.linhas) doc.text(l);
        doc.moveDown(0.8);
      }
      doc.font('Helvetica').fontSize(8).fillColor('#666666').text(MARCA, 56, 760, { lineBreak: false }).fillColor('#000000');
    });
    doc.end();
  });
}

export async function docx(titulo: string, paragrafos: string[]): Promise<Uint8Array> {
  const children = [new Paragraph({ children: [new TextRun({ text: titulo, bold: true, size: 28 })] }), ...paragrafos.map(p => new Paragraph(p)), new Paragraph({ children: [new TextRun({ text: MARCA, size: 16, color: '888888' })] })];
  return fixZip(new Uint8Array(await Packer.toBuffer(new Document({ creator: 'GreenIA · corpus da Fase 4', sections: [{ children }] }))));
}

export async function xlsx(sheets: Record<string, (string | number | null)[][]>): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreenIA · corpus da Fase 4';
  wb.created = new Date('2026-09-01T00:00:00Z'); wb.modified = wb.created;       // determinístico
  for (const [name, rows] of Object.entries(sheets)) wb.addWorksheet(name).addRows(rows);
  return fixZip(new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer));
}

// DOCX e XLSX são ZIPs com a data da geração dentro: fixa as datas para o mesmo arquivo sair a cada geração.
async function fixZip(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const out = new JSZip();
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name];
    if (f.dir) continue;
    let content: string | Uint8Array = await f.async('uint8array');
    if (name === 'docProps/core.xml') content = Buffer.from(content).toString('utf8').replace(/(<dcterms:(created|modified)[^>]*>)[^<]*/g, `$1${FIXA.toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
    out.file(name, content, { date: FIXA, createFolders: false });
  }
  return new Uint8Array(await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE', platform: 'UNIX' }));
}

export const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

export type TipoArquivo = 'digital' | 'escaneado' | 'foto' | 'xml' | 'planilha';
export type Origem = 'gerado' | 'degradacao-sintetica' | 'foto-manual' | 'theneil';
export interface ArquivoCaso { nome: string; sha256: string; tipo: TipoArquivo; origem: Origem; bytes: number }

// Grava os arquivos de um caso e devolve as entradas do gabarito.
export function gravar(dir: string, files: { nome: string; bytes: Uint8Array; tipo: TipoArquivo; origem?: Origem }[]): ArquivoCaso[] {
  mkdirSync(dir, { recursive: true });
  return files.map(f => {
    const p = join(dir, f.nome);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.bytes);
    return { nome: f.nome, sha256: sha256(f.bytes), tipo: f.tipo, origem: f.origem ?? 'gerado', bytes: f.bytes.length };
  });
}

export function gravarJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function args(argv: string[], defaults: Record<string, string>): Record<string, string> {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] ?? '';
  return out;
}
