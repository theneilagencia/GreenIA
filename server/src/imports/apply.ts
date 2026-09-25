// Aplica um mapeamento de importação a um arquivo: lê CSV, XLSX, texto de
// largura fixa, JSON ou XML e devolve registros normalizados, com a origem de
// cada campo (arquivo, planilha, linha). Tudo vem da configuração; nada aqui
// sabe de onde o arquivo foi exportado.
import ExcelJS from 'exceljs';
import { conferirZip, ZipRecusado } from '../util/zip.ts';
import { XMLParser } from 'fast-xml-parser';
import { cellValue } from '../blocks/ler.ts';
import { getPath } from '../blocks/values.ts';
import { normPt } from '../util/text.ts';
import type { CampoMapeado, MapeamentoConfig, Transformacao } from './schema.ts';
import { lerMetadados, metadado, temMetadados, type Metadados } from '../util/metadados.ts';

export type Valor = string | number | null;
export interface RegistroImportado { dados: Record<string, Valor>; origem: string; origens: Record<string, string> }
export interface ErroImportacao { linha?: number; campo?: string; motivo: string }
export interface ResultadoImportacao {
  registros: RegistroImportado[];
  erros: ErroImportacao[];                 // erros de linha (registro fora) e gerais (sem linha)
  colunas: string[];                       // cabeçalho encontrado (tabelas) ou chaves do primeiro registro
  linhasLidas: number;
  linhasIgnoradas: number;
  metadados?: Metadados;                   // linhas ignoradas do início lidas como título e rótulo: valor
}

type Linha = { n: number; celulas: Valor[]; texto: string };
const MAX_ERROS = 200;

export function decodificar(bytes: Uint8Array, codificacao: MapeamentoConfig['codificacao']): string {
  return new TextDecoder(codificacao === 'latin1' ? 'latin1' : 'utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

// CSV com aspas (o separador e a quebra de linha podem estar dentro de aspas).
export function lerCsv(texto: string, separador: string, aspas: string): Linha[] {
  const sep = separador === '\\t' ? '\t' : separador;
  const out: Linha[] = [];
  let cel = '', row: string[] = [], dentro = false, linha = 1, inicio = 1, bruto = '';
  const fecha = () => { row.push(cel); out.push({ n: inicio, celulas: row, texto: bruto }); row = []; cel = ''; bruto = ''; inicio = linha; };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentro) {
      if (aspas && ch === aspas) { if (texto[i + 1] === aspas) { cel += aspas; bruto += ch + ch; i++; continue; } dentro = false; bruto += ch; continue; }
      if (ch === '\n') linha++;
      cel += ch; bruto += ch; continue;
    }
    if (aspas && ch === aspas && cel === '') { dentro = true; bruto += ch; continue; }
    if (texto.startsWith(sep, i)) { row.push(cel); cel = ''; bruto += sep; i += sep.length - 1; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { linha++; fecha(); continue; }
    cel += ch; bruto += ch;
  }
  if (cel !== '' || row.length) fecha();
  return out;
}

export async function lerXlsx(bytes: Uint8Array, planilha?: string) {
  conferirZip(bytes);                                     // teto de descompactação antes do ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const linhasDe = (ws: ExcelJS.Worksheet): Linha[] => {
    const out: Linha[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const celulas: Valor[] = [];
      for (let c = 1; c <= ws.columnCount; c++) celulas.push(cellValue(row.getCell(c).value));
      out.push({ n: r, celulas, texto: celulas.map(v => v ?? '').join(' ') });
    }
    return out;
  };
  const alvo = planilha ? wb.worksheets.find(w => normPt(w.name) === normPt(planilha)) : wb.worksheets.find(w => w.rowCount > 0);
  const planilhas = new Map(wb.worksheets.map(w => [normPt(w.name), { nome: w.name, linhas: () => linhasDe(w) }]));
  return { nome: alvo?.name ?? null, linhas: alvo ? linhasDe(alvo) : [], planilhas };
}

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

function numero(v: Valor, cfg: MapeamentoConfig): number | null {
  if (typeof v === 'number') return v;
  if (vazio(v)) return null;
  let s = String(v).trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (cfg.numero.milhar && cfg.numero.milhar !== ' ') s = s.split(cfg.numero.milhar).join('');
  if (cfg.numero.decimal === ',') s = s.replace(',', '.');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function data(v: Valor, formato: MapeamentoConfig['data']): string | null {
  if (vazio(v)) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return valida(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10));   // célula de data do XLSX
  const partes: Record<string, RegExp> = {
    'dd/mm/aaaa': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, 'dd-mm-aaaa': /^(\d{1,2})-(\d{1,2})-(\d{4})$/, 'dd.mm.aaaa': /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    'aaaa-mm-dd': /^(\d{4})-(\d{1,2})-(\d{1,2})$/, 'aaaa/mm/dd': /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, 'aaaammdd': /^(\d{4})(\d{2})(\d{2})$/,
    'ddmmaaaa': /^(\d{2})(\d{2})(\d{4})$/, 'dd/mm/aa': /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
  };
  const m = partes[formato].exec(s.split(/[ T]/)[0]);
  if (!m) return null;
  if (formato.startsWith('aaaa')) return valida(+m[1], +m[2], +m[3]);
  const ano = formato === 'dd/mm/aa' ? 2000 + +m[3] : +m[3];
  return valida(ano, +m[2], +m[1]);
}
function valida(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const NUMERICAS = new Set(['multiplicar', 'dividirPor']);

function textual(v: Valor, t: Transformacao): Valor {
  if (v === null) return null;
  const s = String(v);
  switch (t.tipo) {
    case 'dividir': { const p = s.split(t.separador); const i = t.parte < 0 ? p.length + t.parte : t.parte; return p[i] !== undefined ? p[i].trim() : null; }
    case 'substituir': return s.split(t.de).join(t.para);
    case 'mapear': return t.valores[s.trim()] ?? t.valores[s.trim().toUpperCase()] ?? s;
    case 'aparar': return s.trim().replace(/\s+/g, ' ');
    case 'maiusculas': return s.toUpperCase();
    case 'minusculas': return s.toLowerCase();
    case 'somenteDigitos': return s.replace(/\D/g, '');
    default: return v;
  }
}

// Converte o valor bruto de um campo: transformações de texto, tipo, depois
// as numéricas (conversão de unidade).
function converter(bruto: Valor, c: CampoMapeado, cfg: MapeamentoConfig, outra: (origem: string) => Valor): { valor: Valor; erro?: string } {
  let v: Valor = typeof bruto === 'string' ? bruto.trim() : bruto;
  for (const t of c.transformacoes) if (!NUMERICAS.has(t.tipo)) v = textual(v, t);
  if (vazio(v)) return c.obrigatorio ? { valor: null, erro: 'vazio' } : { valor: null };
  if (c.tipo === 'texto') v = String(v).trim();
  else if (c.tipo === 'data') { const d = data(v, cfg.data); if (!d) return { valor: null, erro: `data inválida (${String(v)}), esperado ${cfg.data}` }; v = d; }
  else {
    const n = numero(v, cfg);
    if (n === null) return { valor: null, erro: `número inválido (${String(v)})` };
    v = n;
  }
  for (const t of c.transformacoes) {
    if (!NUMERICAS.has(t.tipo)) continue;
    if (typeof v !== 'number') return { valor: null, erro: `${t.tipo} só vale para número` };
    if (t.tipo === 'dividirPor') v = v / t.fator;
    else if (t.tipo === 'multiplicar') {
      const f = t.fator ?? numero(outra(t.porOrigem!), cfg);
      if (f === null || f === undefined) return { valor: null, erro: `fator vazio em ${t.porOrigem}` };
      v = v * f;
    }
    v = Math.round(v * 1e6) / 1e6;
  }
  if (c.tipo === 'inteiro' && typeof v === 'number' && !Number.isInteger(v)) return { valor: null, erro: `número não inteiro (${v})` };
  return { valor: v };
}

// Valores que ficam fora das linhas de dados: título acima do cabeçalho e
// planilha de campo | valor.
function valoresFixos(cfg: MapeamentoConfig, topo: Linha[], nome: string, planilhas?: Awaited<ReturnType<typeof lerXlsx>>['planilhas']) {
  const valores: Record<string, { bruto: Valor; origem: string }> = {};
  const erros: ErroImportacao[] = [];
  const meta = lerMetadados(topo.map(l => ({ n: l.n, celulas: cfg.formato === 'csv' || cfg.formato === 'xlsx' ? l.celulas : [l.texto] })));
  for (const c of cfg.campos) {
    if (c.doMetadado) {
      const m = metadado(meta, c.doMetadado.chave);
      if (m) valores[c.campo] = { bruto: m.valor, origem: `${nome} › linha ${m.linha}` };
      else if (c.obrigatorio) erros.push({ campo: c.campo, motivo: `metadado ${c.doMetadado.chave} não encontrado nas linhas acima da tabela` });
    }
    if (c.doTopo) {
      const re = new RegExp(c.doTopo.padrao, 'i');
      const hit = topo.map(l => ({ l, m: re.exec(l.texto) })).find(x => x.m);
      if (hit) valores[c.campo] = { bruto: hit.m![1] ?? hit.m![0], origem: `${nome} › linha ${hit.l.n}` };
      else if (c.obrigatorio) erros.push({ campo: c.campo, motivo: `não encontrado nas linhas do início (${c.doTopo.padrao})` });
    }
    if (c.daPlanilha) {
      const p = planilhas?.get(normPt(c.daPlanilha.planilha));
      if (!p) { erros.push({ campo: c.campo, motivo: `planilha ${c.daPlanilha.planilha} não encontrada` }); continue; }
      const hit = p.linhas().find(l => normPt(String(l.celulas[0] ?? '')) === normPt(c.daPlanilha!.chave));
      if (hit) valores[c.campo] = { bruto: hit.celulas[1] ?? null, origem: `${nome} › ${p.nome} › linha ${hit.n}` };
      else if (c.obrigatorio) erros.push({ campo: c.campo, motivo: `campo ${c.daPlanilha.chave} não encontrado na planilha ${p.nome}` });
    }
  }
  return { valores, erros, meta };
}

function montar(cfg: MapeamentoConfig, fixos: ReturnType<typeof valoresFixos>, linhas: { n: number; origem: string; valor: (c: CampoMapeado) => Valor; outra: (o: string) => Valor }[], erros: ErroImportacao[]) {
  const registros: RegistroImportado[] = [];
  for (const l of linhas) {
    const dados: Record<string, Valor> = {}, origens: Record<string, string> = {};
    let ok = true;
    for (const c of cfg.campos) {
      const deFora = !!(c.doTopo || c.daPlanilha || c.doMetadado);
      const fixo = deFora ? fixos.valores[c.campo] : undefined;
      const bruto = deFora ? (fixo?.bruto ?? null) : l.valor(c);
      const r = converter(bruto, c, cfg, l.outra);
      if (r.erro) { ok = false; if (erros.length < MAX_ERROS) erros.push({ linha: l.n, campo: c.campo, motivo: r.erro }); }
      dados[c.campo] = r.valor;
      origens[c.campo] = fixo?.origem ?? l.origem;
    }
    if (ok) registros.push({ dados, origem: l.origem, origens });
  }
  return registros;
}

export async function aplicarMapeamento(bytes: Uint8Array, nome: string, cfg: MapeamentoConfig): Promise<ResultadoImportacao> {
  const erros: ErroImportacao[] = [];
  if (cfg.formato === 'json' || cfg.formato === 'xml') {
    let raiz: unknown;
    try {
      const texto = decodificar(bytes, cfg.codificacao);
      raiz = cfg.formato === 'json' ? JSON.parse(texto)
        : new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, removeNSPrefix: true, trimValues: true }).parse(texto);
    } catch (e) {
      return { registros: [], erros: [{ motivo: `arquivo ${cfg.formato.toUpperCase()} inválido: ${(e as Error).message.slice(0, 120)}` }], colunas: [], linhasLidas: 0, linhasIgnoradas: 0 };
    }
    const lista = getPath(raiz, cfg.caminhoRegistros ?? '');
    const recs = Array.isArray(lista) ? lista : lista && typeof lista === 'object' ? [lista] : [];
    if (!recs.length) erros.push({ motivo: `nenhum registro em ${cfg.caminhoRegistros || 'raiz'}` });
    // Caminho com "$." é a partir da raiz (cabeçalho do arquivo); sem, a partir do registro.
    const pegar = (rec: unknown, o: string): Valor => {
      const v = o.startsWith('$.') ? getPath(raiz, o.slice(2)) : getPath(rec, o);
      if (v === undefined || v === null) return null;
      if (typeof v === 'object') return (v as Record<string, unknown>)['#text'] !== undefined ? String((v as Record<string, unknown>)['#text']) : null;
      return typeof v === 'number' ? v : String(v);
    };
    const registros = montar(cfg, { valores: {}, erros: [], meta: { campos: {}, linhaDe: {}, linhas: [] } }, recs.map((rec, i) => ({
      n: i + 1, origem: `${nome} › registro ${i + 1}`, valor: (c: CampoMapeado) => pegar(rec, c.origem!), outra: (o: string) => pegar(rec, o),
    })), erros);
    const colunas = recs[0] && typeof recs[0] === 'object' ? Object.keys(recs[0] as object) : [];
    return { registros, erros, colunas, linhasLidas: recs.length, linhasIgnoradas: 0 };
  }

  let todas: Linha[], rotulo = nome, planilhas: Awaited<ReturnType<typeof lerXlsx>>['planilhas'] | undefined;
  if (cfg.formato === 'xlsx') {
    try {
      const x = await lerXlsx(bytes, cfg.planilha);
      if (!x.nome) return { registros: [], erros: [{ motivo: cfg.planilha ? `planilha ${cfg.planilha} não encontrada` : 'planilha vazia' }], colunas: [], linhasLidas: 0, linhasIgnoradas: 0 };
      todas = x.linhas; rotulo = `${nome} › ${x.nome}`; planilhas = x.planilhas;
    } catch (e) {
      return { registros: [], erros: [{ motivo: e instanceof ZipRecusado ? e.message : 'arquivo XLSX inválido' }], colunas: [], linhasLidas: 0, linhasIgnoradas: 0 };
    }
  } else {
    const texto = decodificar(bytes, cfg.codificacao);
    todas = cfg.formato === 'csv' ? lerCsv(texto, cfg.separador, cfg.aspas)
      : texto.split(/\r?\n/).map((t, i) => ({ n: i + 1, celulas: [t], texto: t }));
  }
  const vaziaL = (l: Linha) => l.celulas.every(vazio);
  while (todas.length && vaziaL(todas[todas.length - 1])) todas.pop();
  const topo = todas.slice(0, cfg.ignorarLinhasInicio);
  let corpo = todas.slice(cfg.ignorarLinhasInicio, Math.max(cfg.ignorarLinhasInicio, todas.length - cfg.ignorarLinhasFim));
  const pulos = cfg.ignorarLinhasQue.map(p => new RegExp(p, 'i'));
  corpo = corpo.filter(l => !vaziaL(l) && !pulos.some(re => re.test(l.texto)));
  let ignoradas = todas.length - corpo.length;
  const fixos = valoresFixos(cfg, topo, nome, planilhas);
  erros.push(...fixos.erros);

  let colunas: string[] = [];
  if (cfg.linhaCabecalho && corpo.length) { colunas = corpo.shift()!.celulas.map(v => String(v ?? '').trim()); ignoradas++; }
  const indice = (o: string): number => {
    if (/^\d+$/.test(o)) return Number(o) - 1;
    let i = colunas.findIndex(c => c === o.trim());
    if (i < 0) i = colunas.findIndex(c => normPt(c) === normPt(o));
    return i;
  };
  if (cfg.formato !== 'txt_largura_fixa') {
    for (const c of cfg.campos) if (c.origem !== undefined && indice(c.origem) < 0) erros.push({ campo: c.campo, motivo: `coluna ${c.origem} não encontrada` });
    for (const c of cfg.campos) for (const t of c.transformacoes) if (t.tipo === 'multiplicar' && t.porOrigem && indice(t.porOrigem) < 0) erros.push({ campo: c.campo, motivo: `coluna ${t.porOrigem} não encontrada` });
  }
  if (erros.some(e => e.linha === undefined)) return { registros: [], erros, colunas, linhasLidas: corpo.length, linhasIgnoradas: ignoradas };

  const registros = montar(cfg, fixos, corpo.map(l => {
    const pegar = (o: string): Valor => { const i = indice(o); return i >= 0 ? (l.celulas[i] ?? null) : null; };
    return {
      n: l.n, origem: `${rotulo} › linha ${l.n}`,
      valor: (c: CampoMapeado) => cfg.formato === 'txt_largura_fixa'
        ? (c.posicao ? l.texto.slice(c.posicao.inicio - 1, c.posicao.inicio - 1 + c.posicao.tamanho) : null)
        : pegar(c.origem!),
      outra: pegar,
    };
  }), erros);
  return { registros, erros, colunas, linhasLidas: corpo.length, linhasIgnoradas: ignoradas, ...(temMetadados(fixos.meta) ? { metadados: fixos.meta } : {}) };
}

// O mapeamento pode servir para o arquivo? (pela extensão; exportações em
// texto costumam vir como .txt com separador ou em largura fixa)
const EXTENSOES: Record<MapeamentoConfig['formato'], string[]> = {
  csv: ['csv', 'txt'], txt_largura_fixa: ['txt', 'prn', 'dat'], xlsx: ['xlsx'], json: ['json'], xml: ['xml'],
};
export function serveParaArquivo(cfg: Pick<MapeamentoConfig, 'formato'>, nome: string): boolean {
  return EXTENSOES[cfg.formato].includes(nome.toLowerCase().split('.').pop() ?? '');
}
