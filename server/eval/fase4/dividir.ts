// Divisão do corpus em desenvolvimento (60%) e reservado (40%).
// A divisão é por lote (frente + procedência: gerado, pncp...), estratificada por
// tipo de caso, formato e origem (digital, escaneado, foto). Casos que dividem um
// arquivo ficam juntos (em Suprimentos, todas as cotações de uma especificação),
// para nada do reservado aparecer no desenvolvimento.
// As variações de um caso (-sintetica = escaneado, -fotos = foto) herdam o
// conjunto do caso de origem; assim cada origem mantém a mesma proporção.
// A divisão não olha resultados: só o gabarito congelado e uma semente fixa.
// Fica congelada em divisao.json, com o sha256 em divisao.sha256.
//   node --experimental-strip-types eval/fase4/dividir.ts            (confere)
//   node --experimental-strip-types eval/fase4/dividir.ts --congelar sim  (só lotes novos)
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, rng, sha256 } from './lib.ts';

export const SEMENTE = 4401;
export const PROPORCAO = 0.6;
export type Conjunto = 'desenvolvimento' | 'reservado';
const AQUI = fileURLToPath(new URL('.', import.meta.url));
export const DIVISAO = join(AQUI, 'divisao.json');
export const DIVISAO_HASH = join(AQUI, 'divisao.sha256');
export const USO_RESERVADO = join(AQUI, 'resultados', 'uso-do-reservado.log');

interface Gab { caso: string; frente: string; variacao: string; procedencia?: string; arquivos: { tipo: string }[]; esperado: Record<string, unknown> }
export interface Caso { caso: string; unidade: string; rotulos: string[] }
export interface Lote { semente: number; unidades: number; desenvolvimento: number; reservado: number; casos: Record<string, Conjunto>; distribuicao: Record<string, { desenvolvimento: number; reservado: number }> }
export interface Divisao { versao: 1; proporcao: number; regra: string; lotes: Record<string, Lote> }

// Origem do caso pelo nome da variação ou pelo tipo dos arquivos.
export function origemDe(g: Gab): 'digital' | 'escaneado' | 'foto' {
  if (/-fotos$/.test(g.caso) || g.arquivos.some(a => a.tipo === 'foto')) return 'foto';
  if (/-sintetica$/.test(g.caso) || g.arquivos.some(a => a.tipo === 'escaneado')) return 'escaneado';
  return 'digital';
}

const formatoDe = (g: Gab) => (/\b(pdf|docx|xlsx|csv|txt|json|xml)\b/.exec(g.variacao)?.[1]) ?? 'misto';
export const casoBase = (caso: string) => caso.replace(/-(sintetica|fotos)$/, '');

// Rótulos de estrato de um caso. Um caso pode ter vários tipos (ex.: uma cotação
// com divergência de quantidade e de unidade); a divisão equilibra todos.
export function rotulosDe(g: Gab): string[] {
  const e = g.esperado;
  const tipos = new Set<string>();
  if (Array.isArray(e.itens) && e.itens.every(i => i && typeof i === 'object' && 'situacao' in i)) {
    for (const i of e.itens as { situacao: string }[]) if (i.situacao !== 'presente') tipos.add(i.situacao);
  }
  if (Array.isArray(e.divergencias)) for (const d of e.divergencias as { tipo: string }[]) tipos.add(d.tipo);
  if (e.campos && typeof e.campos === 'object') for (const [k, v] of Object.entries(e.campos)) if (v === null) tipos.add('faltante');
  for (const k of ['tipoCaso', 'tipo'] as const) if (typeof e[k] === 'string') tipos.add(e[k] as string);
  if (!tipos.size) tipos.add('completo');
  // Layout de exportação (Fiscal): cada layout com a mesma proporção.
  const layout = (e.pedido as { layout?: string } | undefined)?.layout;
  return [...[...tipos].sort().map(t => `tipo:${t}`), `formato:${formatoDe(g)}`, `origem:${origemDe(g)}`, ...(layout ? [`layout:${layout}`] : []), ...(/dois documentos/.test(g.variacao) ? ['arquivo:combinado'] : [])];
}

// Unidade de divisão: casos que compartilham um arquivo andam juntos.
export function unidadeDe(g: Gab): string {
  const base = casoBase(g.caso);
  if (g.frente === 'suprimentos') return base.replace(/-\d+$/, '');
  return base;
}

export const loteDe = (g: Gab) => `${g.frente}/${g.procedencia ?? 'gerado'}`;

const semente = (lote: string) => SEMENTE ^ parseInt(sha256(lote).slice(0, 8), 16);

// Escolhe, entre muitas divisões sorteadas com a semente do lote, a que mais se
// aproxima de 60% em cada estrato. Determinística.
export function dividirLote(lote: string, casos: Caso[], tentativas = 4000): Lote {
  const unidades = [...new Set(casos.map(c => c.unidade))].sort();
  const nDev = Math.round(unidades.length * PROPORCAO);
  const rotulos = [...new Set(casos.flatMap(c => c.rotulos))].sort();
  const total = Object.fromEntries(rotulos.map(r => [r, casos.filter(c => c.rotulos.includes(r)).length]));
  const r = rng(semente(lote));
  let melhor: Set<string> | null = null, nota = Infinity;
  for (let t = 0; t < tentativas; t++) {
    const u = [...unidades];
    for (let i = u.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [u[i], u[j]] = [u[j], u[i]]; }
    const dev = new Set(u.slice(0, nDev));
    let n = 0;
    for (const rot of rotulos) {
      const d = casos.filter(c => c.rotulos.includes(rot) && dev.has(c.unidade)).length;
      n += (d - total[rot] * PROPORCAO) ** 2;
    }
    if (n < nota - 1e-9) { nota = n; melhor = dev; }
  }
  const casosOut: Record<string, Conjunto> = {};
  for (const c of [...casos].sort((a, b) => a.caso.localeCompare(b.caso))) casosOut[c.caso] = melhor!.has(c.unidade) ? 'desenvolvimento' : 'reservado';
  const distribuicao = Object.fromEntries(rotulos.map(rot => {
    const cs = casos.filter(c => c.rotulos.includes(rot));
    const d = cs.filter(c => casosOut[c.caso] === 'desenvolvimento').length;
    return [rot, { desenvolvimento: d, reservado: cs.length - d }];
  }));
  return { semente: semente(lote), unidades: unidades.length, desenvolvimento: nDev, reservado: unidades.length - nDev, casos: casosOut, distribuicao };
}

export function lerGabaritos(dir: string): Gab[] {
  return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
    readdirSync(join(dir, d.name)).filter(n => n.endsWith('.json') && n !== 'perguntas.json')
      .map(n => JSON.parse(readFileSync(join(dir, d.name, n), 'utf8')) as Gab).filter(g => g.caso && g.frente));
}

export function calcular(gabaritos: Gab[]): Record<string, Lote> {
  const porLote = new Map<string, Caso[]>();
  for (const g of gabaritos) {
    if (casoBase(g.caso) !== g.caso) continue;                            // variações herdam
    const l = loteDe(g);
    porLote.set(l, [...(porLote.get(l) ?? []), { caso: g.caso, unidade: unidadeDe(g), rotulos: rotulosDe(g) }]);
  }
  return Object.fromEntries([...porLote.keys()].sort().map(l => [l, dividirLote(l, porLote.get(l)!)]));
}

export const textoDivisao = (d: Divisao) => JSON.stringify(d, null, 2) + '\n';

export function lerDivisao(): Divisao {
  const txt = readFileSync(DIVISAO, 'utf8');
  const hash = readFileSync(DIVISAO_HASH, 'utf8').trim().split(/\s+/)[0];
  if (sha256(txt) !== hash) throw new Error('divisao.json foi alterado: o sha256 não confere com divisao.sha256');
  return JSON.parse(txt) as Divisao;
}

// Conjunto de um caso (ou de uma variação, pelo caso de origem).
export function conjuntoDe(caso: string, d: Divisao = lerDivisao()): Conjunto | null {
  const base = casoBase(caso);
  for (const l of Object.values(d.lotes)) if (l.casos[base]) return l.casos[base];
  return null;
}

// Guarda do reservado: só na rodada final, e cada uso fica registrado.
export function exigirConjunto(conjunto: string, rodadaFinal: boolean, quem: string): Conjunto {
  if (conjunto !== 'desenvolvimento' && conjunto !== 'reservado') throw new Error(`conjunto desconhecido: ${conjunto}`);
  if (conjunto === 'reservado') {
    if (!rodadaFinal) throw new Error('o conjunto reservado só é usado na rodada final (--rodada-final sim)');
    appendFileSync(USO_RESERVADO, `${new Date().toISOString()} ${quem}\n`);
  }
  return conjunto;
}

// Congela os lotes novos. Um lote já congelado nunca é refeito: se os casos dele
// mudarem, o script para e pede decisão.
export function congelar(gabaritosDir: string): Divisao {
  const atual: Divisao = existsSync(DIVISAO) ? lerDivisao() : { versao: 1, proporcao: PROPORCAO, regra: '', lotes: {} };
  const novo = calcular(lerGabaritos(gabaritosDir));
  for (const [l, lote] of Object.entries(novo)) {
    const velho = atual.lotes[l];
    if (!velho) { atual.lotes[l] = lote; continue; }
    if (JSON.stringify(Object.keys(velho.casos)) !== JSON.stringify(Object.keys(lote.casos))) throw new Error(`os casos do lote ${l} mudaram depois de congelado; crie um lote novo`);
  }
  atual.regra = 'Lote = frente/procedência. Unidade = caso (em Suprimentos, a especificação). Estratos = tipo de caso, formato e origem. Variações herdam o conjunto do caso de origem. Semente fixa, sem olhar resultados.';
  atual.lotes = Object.fromEntries(Object.keys(atual.lotes).sort().map(k => [k, atual.lotes[k]]));
  const txt = textoDivisao(atual);
  writeFileSync(DIVISAO, txt);
  writeFileSync(DIVISAO_HASH, `${sha256(txt)}  divisao.json\n`);
  return atual;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { congelar: 'nao' });
  const g = join(AQUI, 'gabaritos');
  const d = a.congelar === 'sim' ? congelar(g) : lerDivisao();
  for (const [l, lote] of Object.entries(d.lotes)) console.log(`${l}: ${lote.desenvolvimento} unidades no desenvolvimento, ${lote.reservado} no reservado`);
}
