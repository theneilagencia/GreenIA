// Nomes de arquivo do corpus.
//  - Auditoria: arquivos cujo nome revela a resposta (tipo de documento, item do
//    checklist, categoria) para a plataforma.
//  - Versão 2: pelo menos 60% dos arquivos de cada frente com nome genérico
//    (scan_0043.pdf, Documento (3).xlsx, anexo (2).pdf...). A unidade da divisão
//    (caso; em Suprimentos, a especificação) fica inteira genérica ou descritiva.
//    Os gabaritos não mudam: só os nomes de arquivo dentro deles.
import { readFileSync, readdirSync, renameSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rng, sha256 } from './lib.ts';
import { stripAccents } from '../../src/util/text.ts';
import { nomePadrao } from './gerar-lgpd.ts';

export type TipoNome = 'generico' | 'descritivo';

const tokens = (nome: string) => stripAccents(nome.replace(/\.[^.]+$/, '')).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const catalogo = (slug: string) => JSON.parse(readFileSync(new URL(`../../catalog/modelos/${slug}.json`, import.meta.url), 'utf8'));
const termos = (slug: string, bloco: string) => {
  const p = catalogo(slug).definition.pipeline.find((s: { bloco: string }) => s.bloco === bloco).params;
  return ((p.itens ?? p.taxonomia) as { id: string; nome: string; sinonimos: string[] }[]).flatMap(i => [i.id, i.nome, ...i.sinonimos]);
};

// Vocabulário que, no nome do arquivo, entrega a resposta de cada frente.
export function vocabulario(): Record<string, string[]> {
  return {
    rh: [...termos('checklist-documentos-admissao', 'checklist'), 'rg', 'cpf', 'ctps', 'aso', 'titulo', 'eleitor', 'luz', 'conta', 'salario', 'banco', 'ficha', 'admissao', 'pessoais'],
    contratacao: [...termos('checklist-documentos-contratacao', 'checklist'), 'contrato', 'art', 'alvara', 'apolice', 'seguro', 'garantia', 'certidao', 'cnpj', 'cartao', 'contratada'],
    lgpd: [...termos('organizacao-evidencias', 'classificar'), 'politica', 'norma', 'treinamento', 'certificado', 'presenca', 'contrato', 'dpa', 'aditivo', 'incidente', 'inventario', 'ropa', 'ata', 'comite', 'privacidade'],
    fiscal: ['nfe', 'danfe', 'nota', 'pedido', 'xml'],
    suprimentos: ['cotacao', 'especificacao', 'proposta', 'orcamento'],
    juridico: ['contrato'],
    financeiro: ['dre', 'balancete', 'razao', 'fluxo', 'caixa', 'inadimplencia'],
  };
}

// Termos (inteiros, por palavra ou sequência de palavras) do vocabulário que aparecem no nome.
export function revela(frente: string, nome: string, voc = vocabulario()): string[] {
  const t = tokens(nome).join(' ');
  return [...new Set((voc[frente] ?? []).map(v => tokens(v).join(' ')).filter(v => v && new RegExp(`(^| )${v}( |$)`).test(t)))];
}

export interface Achado { frente: string; caso: string; arquivo: string; revela: string[] }
export function auditar(gabaritos: { caso: string; frente: string; arquivos: { nome: string }[] }[]) {
  const voc = vocabulario();
  const achados: Achado[] = [];
  const porFrente: Record<string, { arquivos: number; revelam: number; casos: number; pastaRevela: number }> = {};
  for (const g of gabaritos) {
    const f = (porFrente[g.frente] ??= { arquivos: 0, revelam: 0, casos: 0, pastaRevela: 0 });
    f.casos++;
    // Nome da pasta do caso: só a frente e um número (ex.: rh-pasta-03); não entrega a resposta.
    if (revela(g.frente, g.caso.replace(new RegExp(`^${g.frente}-`), ''), voc).length) f.pastaRevela++;
    for (const a of g.arquivos) {
      f.arquivos++;
      const r = revela(g.frente, a.nome, voc);
      if (r.length) { f.revelam++; achados.push({ frente: g.frente, caso: g.caso, arquivo: a.nome, revela: r }); }
    }
  }
  return { porFrente, achados };
}

// ---------------------------------------------------------------- versão 2

export const SEMENTE_NOMES = 4601;
export const PROPORCAO_GENERICO = 0.65;

// Nome genérico, como sai de scanner, celular, download ou "salvar como".
export function geradorDeNomes(semente: number) {
  const r = rng(semente);
  const usados = new Set<string>();
  let n = 1;
  const d2 = (x: number) => String(x).padStart(2, '0');
  const data = () => `2026${d2(r.int(1, 9))}${d2(r.int(1, 28))}_${d2(r.int(7, 19))}${d2(r.int(0, 59))}${d2(r.int(0, 59))}`;
  const padroes: Record<string, (() => string)[]> = {
    pdf: [() => `scan_${r.digits(4)}.pdf`, () => `anexo (${n++}).pdf`, () => `Documento (${n++}).pdf`, () => `digitalizado_${data()}.pdf`, () => `anexo.pdf`],
    docx: [() => `Documento (${n++}).docx`, () => `doc${r.digits(4)}.docx`, () => `arquivo_${r.digits(4)}.docx`],
    xlsx: [() => `Documento (${n++}).xlsx`, () => `Planilha sem título (${n++}).xlsx`, () => `export_${r.digits(4)}.xlsx`],
    csv: [() => `export (${n++}).csv`, () => `dados_${r.digits(4)}.csv`],
    txt: [() => `export_${r.digits(4)}.txt`, () => `arquivo (${n++}).txt`],
    xml: [() => `arquivo (${n++}).xml`, () => `download (${n++}).xml`],
    json: [() => `dados (${n++}).json`, () => `download (${n++}).json`],
    jpg: [() => `IMG_${data()}.jpg`], jpeg: [() => `IMG_${data()}.jpeg`], png: [() => `Screenshot_${data()}.png`],
  };
  return (original: string) => {
    const ext = (original.split('.').pop() ?? '').toLowerCase();
    const ps = padroes[ext] ?? [() => `arquivo (${n++}).${ext}`];
    for (let i = 0; i < 50; i++) {
      const nome = r.pick(ps)();
      if (!usados.has(nome.toLowerCase())) { usados.add(nome.toLowerCase()); return nome; }
    }
    const nome = `arquivo_${n++}.${ext}`;
    usados.add(nome.toLowerCase());
    return nome;
  };
}

// Tipo de nome por unidade: dentro de cada lote e de cada conjunto (desenvolvimento
// e reservado), 65% das unidades com nome genérico, por sorteio com semente fixa.
// Se a frente ficar abaixo de 60% dos arquivos genéricos, sorteia mais unidades.
export function atribuirTipos(
  lotes: Record<string, { casos: Record<string, 'desenvolvimento' | 'reservado'> }>,
  unidadeDe: (caso: string) => string, arquivosDe: (caso: string) => number,
): Record<string, Record<string, TipoNome>> {
  const out: Record<string, Record<string, TipoNome>> = {};
  for (const [l, lote] of Object.entries(lotes)) {
    const tipos: Record<string, TipoNome> = {};
    const porConjunto: Record<string, string[]> = { desenvolvimento: [], reservado: [] };
    for (const [caso, c] of Object.entries(lote.casos)) { const u = unidadeDe(caso); if (!porConjunto[c].includes(u)) porConjunto[c].push(u); }
    const ordem: string[] = [];
    for (const c of ['desenvolvimento', 'reservado']) {
      const r = rng(SEMENTE_NOMES ^ parseInt(sha256(`${l}|${c}`).slice(0, 8), 16));
      const us = r.shuffle([...porConjunto[c]].sort());
      // Com 2 ou mais unidades, pelo menos uma de cada tipo, para medir os dois em cada conjunto.
      const k = us.length >= 2 ? Math.min(us.length - 1, Math.max(1, Math.round(us.length * PROPORCAO_GENERICO))) : us.length;
      us.forEach((u, i) => { tipos[u] = i < k ? 'generico' : 'descritivo'; });
      ordem.push(...us.slice(k));
    }
    const arquivos = (t: TipoNome) => Object.keys(lote.casos).filter(c => tipos[unidadeDe(c)] === t).reduce((n, c) => n + arquivosDe(c), 0);
    while (arquivos('generico') / (arquivos('generico') + arquivos('descritivo')) < 0.6 && ordem.length) tipos[ordem.shift()!] = 'generico';
    out[l] = tipos;
  }
  return out;
}

// Troca, em qualquer texto do gabarito, o nome antigo pelo novo.
function trocarNomes(v: unknown, mapa: Map<string, string>): unknown {
  if (typeof v === 'string') { let s = v; for (const [a, b] of mapa) s = s.split(a).join(b); return s; }
  if (Array.isArray(v)) return v.map(x => trocarNomes(x, mapa));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trocarNomes(x, mapa)]));
  return v;
}

// Aplica os nomes da versão 2 a um corpus gerado (arquivos e gabaritos). Nomes
// genéricos únicos na frente inteira (as perguntas do Jurídico citam o arquivo).
export function aplicarNomesV2(saida: string, tipos: Record<string, Record<string, TipoNome>>, unidadeDe: (frente: string, caso: string) => string) {
  const mapas: Record<string, Map<string, string>> = {};
  for (const frente of readdirSync(saida).filter(f => statSync(join(saida, f)).isDirectory())) {
    const tiposFrente = tipos[`${frente}/gerado`];
    if (!tiposFrente) continue;
    const novo = geradorDeNomes(SEMENTE_NOMES ^ parseInt(sha256(frente).slice(0, 8), 16));
    const porUnidade = new Map<string, Map<string, string>>();
    const casos = readdirSync(join(saida, frente)).filter(c => existsSync(join(saida, frente, c, 'gabarito.json'))).sort();
    const mapaFrente = (mapas[frente] = new Map());
    for (const caso of casos) {
      const u = unidadeDe(frente, caso);
      if (tiposFrente[u] !== 'generico') continue;
      const dir = join(saida, frente, caso);
      const g = JSON.parse(readFileSync(join(dir, 'gabarito.json'), 'utf8'));
      const mapa = porUnidade.get(u) ?? new Map<string, string>();
      porUnidade.set(u, mapa);
      for (const a of g.arquivos as { nome: string }[]) if (!mapa.has(a.nome)) mapa.set(a.nome, novo(a.nome));
      // Nomes mais longos primeiro: "contrato-1.pdf" não pode estragar "contrato-10.pdf".
      const ordem = new Map([...mapa].sort((x, y) => y[0].length - x[0].length));
      for (const [a, b] of ordem) if (existsSync(join(dir, a))) renameSync(join(dir, a), join(dir, b));
      const g2 = trocarNomes(g, ordem) as typeof g;
      if (g2.frente === 'lgpd') {
        for (const d of g2.esperado.documentos as { arquivo: string; categoria: string | null; periodo: string | null; nome: string | null }[]) {
          d.nome = d.categoria && d.periodo ? nomePadrao(d.categoria as never, d.periodo, d.arquivo) : null;
        }
      }
      writeFileSync(join(dir, 'gabarito.json'), JSON.stringify(g2, null, 2) + '\n');
      for (const [a, b] of ordem) mapaFrente.set(`${caso}/${a}`, b);
    }
    // Arquivos da frente que citam arquivos dos casos (perguntas do Jurídico).
    const perguntas = join(saida, frente, 'perguntas.json');
    if (existsSync(perguntas)) {
      const p = JSON.parse(readFileSync(perguntas, 'utf8'));
      const global = new Map<string, string>();
      for (const [k, b] of mapaFrente) { const a = k.split('/').slice(1).join('/'); if (!global.has(a)) global.set(a, b); }
      writeFileSync(perguntas, JSON.stringify(trocarNomes(p, new Map([...global].sort((x, y) => y[0].length - x[0].length))), null, 2) + '\n');
    }
  }
  return mapas;
}
