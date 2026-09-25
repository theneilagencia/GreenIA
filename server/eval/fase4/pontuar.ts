// Pontuação de três estados pela matriz congelada (matriz.json, sha256 em
// matriz.sha256). Cada frente vira pares (gabarito, plataforma) por unidade; a
// matriz diz se cada par é acerto, erro grave, erro comum ou revisão.
//   node --experimental-strip-types eval/fase4/pontuar.ts    (reaplica a todas as medições do desenvolvimento)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gravarJson, sha256 } from './lib.ts';
import { normKey } from '../../src/blocks/values.ts';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
export type Estado = 'presente' | 'ausente' | 'duvidoso';
export type Resultado = 'acerto' | 'erro_grave' | 'erro_comum' | 'revisao';
export interface Par { caso: string; unidade: string; gabarito: Estado; plataforma: Estado }
interface Regra { gabarito: Estado | '*'; plataforma: Estado | '*'; resultado: Resultado }

export function lerMatriz(): { regras: Regra[] } {
  const txt = readFileSync(join(AQUI, 'matriz.json'), 'utf8');
  const hash = readFileSync(join(AQUI, 'matriz.sha256'), 'utf8').split(/\s+/)[0];
  if (sha256(txt) !== hash) throw new Error('matriz.json foi alterada: o sha256 não confere com matriz.sha256');
  return JSON.parse(txt);
}

export function classificar(gabarito: Estado, plataforma: Estado, m = lerMatriz()): Resultado {
  const r = m.regras.find(x => (x.gabarito === '*' || x.gabarito === gabarito) && (x.plataforma === '*' || x.plataforma === plataforma));
  if (!r) throw new Error(`matriz sem regra para gabarito ${gabarito} × plataforma ${plataforma}`);
  return r.resultado;
}

export interface Pontuacao { casos: number; unidades: number; acerto: number; errosGraves: number; errosComuns: number; revisao: number; taxas: { acerto: number; errosGraves: number; errosComuns: number; revisao: number }; graves: string[] }
const pct = (n: number, d: number) => (d ? Math.round(n / d * 1000) / 10 : 0);

export function pontuar(pares: Par[]): Pontuacao {
  const m = lerMatriz();
  const c = { acerto: 0, erro_grave: 0, erro_comum: 0, revisao: 0 } as Record<Resultado, number>;
  const graves: string[] = [];
  for (const p of pares) { const r = classificar(p.gabarito, p.plataforma, m); c[r]++; if (r === 'erro_grave') graves.push(`${p.caso}:${p.unidade}`); }
  const n = pares.length;
  return { casos: new Set(pares.map(p => p.caso)).size, unidades: n, acerto: c.acerto, errosGraves: c.erro_grave, errosComuns: c.erro_comum, revisao: c.revisao,
    taxas: { acerto: pct(c.acerto, n), errosGraves: pct(c.erro_grave, n), errosComuns: pct(c.erro_comum, n), revisao: pct(c.revisao, n) }, graves };
}

// Checklist (RH, contratação): cada item é uma unidade.
export function paresChecklist(casos: { caso: string; itens: { item: string; esperado: string; obtido: string }[] }[]): Par[] {
  return casos.flatMap(c => c.itens.map(i => ({ caso: c.caso, unidade: i.item, gabarito: i.esperado as Estado, plataforma: i.obtido as Estado })));
}

// Fiscal: campos conferidos de cada item do pedido e do cabeçalho; "presente" = conforme.
const CAMPO_ITEM: Record<string, string> = { quantidade: 'quantidade', preco_fora_tolerancia: 'valorUnitario', descricao: 'descricao', so_no_pedido: 'par', so_na_nota: 'par' };
const CAMPO_CAB: Record<string, string> = { valor_total: 'total', prazo_emissao: 'prazo', pedido: 'pedido', cnpj: 'cnpj' };
const unidadeDe = (tipo: string, chave: string) => chave === 'cabecalho' ? `cabecalho:${CAMPO_CAB[tipo] ?? tipo}` : `${normKey(chave)}:${CAMPO_ITEM[tipo] ?? tipo}`;

export interface CasoFiscal {
  caso: string;
  esperado: { tipoCaso: string; pedido: { registros: { codigo: string }[] }; divergencias: { chave: string; tipo: string }[] };
  obtido: { naoRealizada: boolean; divergencias: { chave: string; tipo: string }[] };
}
export function paresFiscal(casos: CasoFiscal[]): Par[] {
  const out: Par[] = [];
  for (const c of casos) {
    if (c.obtido.naoRealizada) {
      // Conferência não realizada (ex.: falta o XML): uma unidade, duvidosa.
      out.push({ caso: c.caso, unidade: 'conferencia', gabarito: c.esperado.tipoCaso === 'danfe_sem_xml' ? 'ausente' : 'presente', plataforma: 'duvidoso' });
      continue;
    }
    const unidades = new Set<string>();
    for (const r of c.esperado.pedido.registros) for (const f of ['quantidade', 'valorUnitario', 'descricao', 'par']) unidades.add(`${normKey(r.codigo)}:${f}`);
    for (const f of ['pedido', 'cnpj', 'prazo', 'total']) unidades.add(`cabecalho:${f}`);
    const esperadas = new Set(c.esperado.divergencias.map(d => unidadeDe(d.tipo, d.chave)));
    const achadas = new Set(c.obtido.divergencias.map(d => unidadeDe(d.tipo, d.chave)));
    for (const u of [...esperadas, ...achadas]) unidades.add(u);                // item só na nota entra como unidade própria
    for (const u of [...unidades].sort()) out.push({ caso: c.caso, unidade: u, gabarito: esperadas.has(u) ? 'ausente' : 'presente', plataforma: achadas.has(u) ? 'ausente' : 'presente' });
  }
  return out;
}

// Natureza de cada número do relatório. Estimativa de acerto só vem do
// reservado; o desenvolvimento serve para corrigir e comparar versões; os casos
// equivalentes de outra área provam que a correção é da plataforma.
export type Natureza = 'estimativa_de_acerto' | 'desenvolvimento' | 'prova_de_generalizacao';
export const NATUREZA: Record<Natureza, string> = {
  estimativa_de_acerto: 'estimativa de acerto',
  desenvolvimento: 'medição de desenvolvimento, não é estimativa de acerto',
  prova_de_generalizacao: 'prova de generalização, não é estimativa de acerto',
};
export function rotulo(conjunto: 'desenvolvimento' | 'reservado', natureza: Natureza): string {
  if (natureza === 'estimativa_de_acerto' && conjunto !== 'reservado') throw new Error('estimativa de acerto só vem do conjunto reservado');
  if (conjunto === 'reservado' && natureza !== 'estimativa_de_acerto') throw new Error('o reservado só entra no relatório como estimativa de acerto');
  return `[${conjunto} · ${NATUREZA[natureza]}]`;
}

// Medições do desenvolvimento gravadas em resultados/. O reservado não entra:
// dele só existe o resumo antigo, e a matriz só é aplicada a ele na rodada final.
export const MEDICOES = [
  { frente: 'rh', rotulo: 'RH, checklist anterior, catálogo v1 (linha de base)', arquivo: 'rh-linha-de-base-desenvolvimento.json', tipo: 'checklist', natureza: 'desenvolvimento' },
  { frente: 'rh', rotulo: 'RH, checklist anterior, catálogo v2', arquivo: 'rh-desenvolvimento-checklist-anterior-catalogo-v2.json', tipo: 'checklist', natureza: 'desenvolvimento' },
  { frente: 'rh', rotulo: 'RH, plataforma corrigida, catálogo v2', arquivo: 'rh-desenvolvimento-depois-das-correcoes.json', tipo: 'checklist', natureza: 'desenvolvimento' },
  { frente: 'contratacao', rotulo: 'Construtora (contratação), checklist anterior', arquivo: 'contratacao-desenvolvimento-checklist-anterior.json', tipo: 'checklist', natureza: 'prova_de_generalizacao' },
  { frente: 'contratacao', rotulo: 'Construtora (contratação), plataforma corrigida', arquivo: 'contratacao-desenvolvimento.json', tipo: 'checklist', natureza: 'prova_de_generalizacao' },
  { frente: 'fiscal', rotulo: 'Fiscal, conferência pelos mapeamentos (cinco layouts)', arquivo: 'fiscal-desenvolvimento.json', tipo: 'fiscal', natureza: 'desenvolvimento' },
] as const;

export function pontuarMedicoes() {
  return MEDICOES.map(m => {
    const p = join(AQUI, 'resultados', m.arquivo);
    if (!existsSync(p)) return { ...m, conjunto: 'desenvolvimento', rotuloRelatorio: rotulo('desenvolvimento', m.natureza), pontuacao: null };
    const r = JSON.parse(readFileSync(p, 'utf8'));
    if (r.conjunto && r.conjunto !== 'desenvolvimento') throw new Error(`${m.arquivo} não é do desenvolvimento`);
    const pares = m.tipo === 'fiscal' ? paresFiscal(r.casos) : paresChecklist(r.casos);
    return { ...m, conjunto: 'desenvolvimento', rotuloRelatorio: rotulo('desenvolvimento', m.natureza), pontuacao: pontuar(pares) };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rs = pontuarMedicoes();
  gravarJson(join(AQUI, 'resultados', 'pontuacao-desenvolvimento.json'), { matriz: readFileSync(join(AQUI, 'matriz.sha256'), 'utf8').split(/\s+/)[0], conjunto: 'desenvolvimento', medicoes: rs });
  for (const r of rs) {
    const p = r.pontuacao;
    console.log(p ? `${r.rotulo} ${r.rotuloRelatorio}: ${p.casos} casos, ${p.unidades} unidades · acerto ${p.taxas.acerto}% · erros graves ${p.errosGraves} (${p.taxas.errosGraves}%) · erros comuns ${p.errosComuns} (${p.taxas.errosComuns}%) · revisão ${p.taxas.revisao}%` : `${r.rotulo}: sem medição gravada`);
  }
}
