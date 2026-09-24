// Peças extras dos geradores das frentes fiscal, financeiro e LGPD. Ficam só no
// corpus (eval/fase4): nada daqui vai para o núcleo da plataforma.
//   - CNPJ fictício com dígitos verificadores válidos;
//   - texto em Latin-1 ou UTF-8, datas e números no formato brasileiro;
//   - leitura de um pedido de compra pelo mapeamento de importação
//     (mapeamentos/<layout>.json). É a leitura de referência do corpus: o teste
//     confere que cada mapeamento, aplicado ao arquivo gerado, dá os registros
//     normalizados do gabarito.
import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import type { Rng } from './lib.ts';

// CNPJ inventado, com dígitos verificadores válidos (só dígitos).
export function cnpj(r: Rng): string {
  const n = [...Array.from({ length: 8 }, () => r.int(0, 9)), 0, 0, 0, 1];
  if (new Set(n.slice(0, 8)).size === 1) n[0] = (n[0] + 1) % 10;
  const dv = (base: number[]) => { const w = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = base.reduce((a, d, i) => a + d * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(n); const d2 = dv([...n, d1]);
  return [...n, d1, d2].join('');
}
export const cnpjFormatado = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export const latin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
export const utf8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
export const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const r2 = (n: number) => Math.round(n * 100 + Number.EPSILON * Math.sign(n)) / 100;
export const r4 = (n: number) => Math.round(n * 10000) / 10000;

// Datas ISO (aaaa-mm-dd), sem fuso: contas em UTC.
export function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
export const dataBr = (iso: string) => iso.split('-').reverse().join('/');
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesPorExtenso = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]} de ${aaaamm.slice(0, 4)}`;
export const ultimoDia = (aaaamm: string) => new Date(Date.UTC(Number(aaaamm.slice(0, 4)), Number(aaaamm.slice(5, 7)), 0)).getUTCDate();

// Número com casas fixas, separador decimal e de milhar escolhidos.
export function fmtNum(n: number, casas: number, decimal = ',', milhar = '.'): string {
  const [int, dec] = Math.abs(n).toFixed(casas).split('.');
  const intFmt = milhar ? int.replace(/\B(?=(\d{3})+(?!\d))/g, milhar) : int;
  return (n < 0 ? '-' : '') + intFmt + (casas ? decimal + dec : '');
}


// ---- Mapeamento de importação de pedido de compra ------------------------------------------------
// Os mapeamentos (mapeamentos/<layout>.json) seguem o formato genérico do núcleo
// (server/src/imports/schema.ts, mapeamentoConfigSchema); o teste valida cada um
// nele. Esta é a leitura de referência do corpus, independente do núcleo:
//   - csv, txt: o arquivo em linhas; as ignorarLinhasInicio primeiras são o
//     topo (onde doTopo procura), depois o cabeçalho (se linhaCabecalho, só
//     CSV), e saem as ignorarLinhasFim últimas e as que casam com ignorarLinhasQue;
//   - xlsx: o mesmo com as linhas da planilha; daPlanilha lê outra planilha de
//     duas colunas (campo | valor);
//   - json, xml: registros em caminhoRegistros; origem é o caminho no registro;
//   - transformações de texto na ordem, depois o tipo, depois multiplicar e
//     dividirPor; texto aparado nas pontas; data em aaaa-mm-dd.
export type Transformacao =
  | { tipo: 'dividir'; separador: string; parte: number }
  | { tipo: 'substituir'; de: string; para: string }
  | { tipo: 'mapear'; valores: Record<string, string> }
  | { tipo: 'aparar' } | { tipo: 'maiusculas' } | { tipo: 'minusculas' } | { tipo: 'somenteDigitos' }
  | { tipo: 'multiplicar'; fator?: number; porOrigem?: string }
  | { tipo: 'dividirPor'; fator: number };
export interface CampoMapeado {
  campo: string; tipo: 'texto' | 'numero' | 'data' | 'inteiro'; obrigatorio?: boolean;
  origem?: string; posicao?: { inicio: number; tamanho: number }; doTopo?: { padrao: string }; daPlanilha?: { planilha: string; chave: string };
  transformacoes?: Transformacao[];
}
export interface Mapeamento {
  nome?: string;
  formato: 'csv' | 'xlsx' | 'txt_largura_fixa' | 'json' | 'xml';
  codificacao: 'utf-8' | 'latin1';
  separador?: string;
  planilha?: string;
  ignorarLinhasInicio: number;
  ignorarLinhasFim: number;
  ignorarLinhasQue?: string[];
  linhaCabecalho: boolean;
  caminhoRegistros?: string;
  numero: { decimal: ',' | '.'; milhar: '.' | ',' | ' ' | '' };
  data: 'dd/mm/aaaa' | 'dd-mm-aaaa' | 'dd.mm.aaaa' | 'aaaa-mm-dd' | 'aaaa/mm/dd' | 'aaaammdd' | 'ddmmaaaa' | 'dd/mm/aa';
  campos: CampoMapeado[];
}

// Campos normalizados do pedido (fixos no núcleo); totalPedido é opcional.
export const CAMPOS_PEDIDO = ['pedido', 'cnpjFornecedor', 'dataPedido', 'totalPedido', 'codigo', 'descricao', 'quantidade', 'unidade', 'valorUnitario', 'valorTotal'] as const;
export type CampoPedido = typeof CAMPOS_PEDIDO[number];
export type Registro = Record<string, string | number | null>;

type Bruto = string | number | null | undefined;

function csvLinha(linha: string, sep: string): string[] {
  const out: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (q) { if (c === '"' && linha[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === sep) { out.push(cell); cell = ''; }
    else cell += c;
  }
  out.push(cell);
  return out;
}

const caminho = (obj: unknown, path: string): unknown => path.split('.').filter(Boolean).reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

export function converterNumero(v: Bruto, m: Mapeamento['numero']): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  let s = v.trim().replace(/^R\$\s*/, '');
  if (m.milhar) s = s.split(m.milhar).join('');
  s = s.replace(/\s/g, '');
  if (!s) return null;
  if (m.decimal !== '.') s = s.replace(m.decimal, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function converterData(v: Bruto, formato: Mapeamento['data']): string | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const s = String(v).trim();
  const re = new RegExp('^' + formato.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace('dd', '(?<d>\\d{2})').replace('mm', '(?<m>\\d{2})').replace('aaaa', '(?<a>\\d{4})').replace('aa', '(?<a>\\d{2})') + '$');
  const g = s.match(re)?.groups;
  if (!g) return null;
  return `${g.a.length === 2 ? '20' + g.a : g.a}-${g.m}-${g.d}`;
}

function textoTransformado(v: string, ts: Transformacao[]): string {
  for (const t of ts) {
    if (t.tipo === 'dividir') v = v.split(t.separador).at(t.parte) ?? '';
    else if (t.tipo === 'substituir') v = v.split(t.de).join(t.para);
    else if (t.tipo === 'mapear') v = t.valores[v.trim()] ?? v;
    else if (t.tipo === 'aparar') v = v.trim();
    else if (t.tipo === 'maiusculas') v = v.toUpperCase();
    else if (t.tipo === 'minusculas') v = v.toLowerCase();
    else if (t.tipo === 'somenteDigitos') v = v.replace(/\D/g, '');
  }
  return v;
}

function converter(bruto: Bruto, c: CampoMapeado, m: Mapeamento, outro: (origem: string) => Bruto): string | number | null {
  const ts = c.transformacoes ?? [];
  let v: Bruto = bruto;
  if (typeof v === 'string') v = textoTransformado(v, ts).trim();
  if (c.tipo === 'texto') return v === null || v === undefined ? null : String(v).trim();
  if (c.tipo === 'data') return converterData(v, m.data);
  let n = converterNumero(v, m.numero);
  if (n === null) return null;
  for (const t of ts) {
    if (t.tipo === 'multiplicar') n = n * (t.fator ?? converterNumero(outro(t.porOrigem!), m.numero) ?? NaN);
    if (t.tipo === 'dividirPor') n = n / t.fator;
  }
  n = Number(n.toFixed(10));
  return c.tipo === 'inteiro' ? Math.trunc(n) : n;
}

function celula(v: ExcelJS.CellValue): Bruto {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in v) return celula((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  if (typeof v === 'object' && 'richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(t => t.text).join('');
  return String(v);
}

function linhasPlanilha(ws: ExcelJS.Worksheet): Bruto[][] {
  const rows: Bruto[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) { const row = ws.getRow(r); const vals: Bruto[] = []; for (let c = 1; c <= ws.columnCount; c++) vals.push(celula(row.getCell(c).value)); rows.push(vals); }
  return rows;
}

// Registros normalizados de um pedido, pelo mapeamento.
export async function aplicarMapeamento(bytes: Uint8Array, m: Mapeamento): Promise<Registro[]> {
  const que = (m.ignorarLinhasQue ?? []).map(p => new RegExp(p));
  let topo: string[] = [];
  let planilhas: Record<string, Bruto[][]> = {};
  let registros: ((origem: string, c?: CampoMapeado) => Bruto)[] = [];
  const colunas = (nomes: string[], vals: Bruto[]) => (origem: string) => /^\d+$/.test(origem) ? vals[Number(origem) - 1] : vals[nomes.indexOf(origem)];
  if (m.formato === 'csv' || m.formato === 'txt_largura_fixa') {
    const txt = Buffer.from(bytes).toString(m.codificacao === 'latin1' ? 'latin1' : 'utf8').replace(/^\uFEFF/, '');
    const linhas = txt.split(/\r?\n/);
    if (linhas.at(-1) === '') linhas.pop();
    topo = linhas.slice(0, m.ignorarLinhasInicio);
    let resto = linhas.slice(m.ignorarLinhasInicio, linhas.length - m.ignorarLinhasFim);
    let nomes: string[] = [];
    if (m.formato === 'csv' && m.linhaCabecalho) { nomes = csvLinha(resto[0] ?? '', m.separador ?? ';').map(s => s.trim()); resto = resto.slice(1); }
    resto = resto.filter(l => l.trim() !== '' && !que.some(re => re.test(l)));
    registros = resto.map(l => {
      if (m.formato === 'csv') return colunas(nomes, csvLinha(l, m.separador ?? ';'));
      return (_o: string, c?: CampoMapeado) => c?.posicao ? l.substr(c.posicao.inicio - 1, c.posicao.tamanho) : undefined;
    });
  } else if (m.formato === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    planilhas = Object.fromEntries(wb.worksheets.map(ws => [ws.name, linhasPlanilha(ws)]));
    const rows = m.planilha ? planilhas[m.planilha] : wb.worksheets.map(ws => planilhas[ws.name]).find(r => r.length);
    if (!rows) throw new Error(`planilha ${m.planilha} não encontrada`);
    topo = rows.slice(0, m.ignorarLinhasInicio).map(r => r.filter(v => v !== null && v !== undefined).join(' '));
    let resto = rows.slice(m.ignorarLinhasInicio, rows.length - m.ignorarLinhasFim);
    let nomes: string[] = [];
    if (m.linhaCabecalho) { nomes = (resto[0] ?? []).map(v => String(v ?? '').trim()); resto = resto.slice(1); }
    resto = resto.filter(vals => vals.some(v => v !== null && String(v).trim() !== '') && !que.some(re => re.test(vals.map(v => v ?? '').join(' '))));
    registros = resto.map(vals => colunas(nomes, vals));
  } else {
    const txt = Buffer.from(bytes).toString(m.codificacao === 'latin1' ? 'latin1' : 'utf8').replace(/^\uFEFF/, '');
    const ultimo = (m.caminhoRegistros ?? '').split('.').at(-1);
    const raiz = m.formato === 'json' ? JSON.parse(txt) : new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false, isArray: n => n === ultimo }).parse(txt);
    const regs = caminho(raiz, m.caminhoRegistros ?? '');
    registros = (Array.isArray(regs) ? regs : []).map(reg => (origem: string) => caminho(reg, origem) as Bruto);
  }
  const fora = (c: CampoMapeado): Bruto => {
    if (c.doTopo) { const re = new RegExp(c.doTopo.padrao); for (const l of topo) { const x = l.match(re); if (x) return x[1]; } return null; }
    if (c.daPlanilha) { const rows = planilhas[c.daPlanilha.planilha] ?? []; const hit = rows.find(r => String(r[0] ?? '').trim() === c.daPlanilha!.chave); return hit ? hit[1] : null; }
    return undefined;
  };
  return registros.map(get => Object.fromEntries(m.campos.map(c => {
    const bruto = c.doTopo || c.daPlanilha ? fora(c) : get(c.origem ?? '', c);
    return [c.campo, converter(bruto, c, m, o => get(o))];
  })));
}
