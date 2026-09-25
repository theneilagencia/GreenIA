// Versão 2 do corpus: os mesmos casos e gabaritos da versão 1, com nomes
// genéricos em pelo menos 60% dos arquivos de cada frente. A divisão mantém os
// conjuntos da versão 1 (nenhum caso visto no desenvolvimento vai para o
// reservado) e acrescenta o estrato "nome genérico × descritivo", sorteado dentro
// de cada conjunto. Congela gabaritos-v2/, divisao-v2.json (sha256 em
// divisao-v2.sha256) e a auditoria dos nomes.
//   node --experimental-strip-types eval/fase4/congelar-v2.ts --saida eval/fase4/saida-v2
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, gravarJson, sha256 } from './lib.ts';
import { GABARITOS, gerarOficial } from './congelar.ts';
import { DIVISAO, casoBase, lerDivisao, lerGabaritos, rotulosDe, unidadeDe, type Divisao } from './dividir.ts';
import { aplicarNomesV2, atribuirTipos, auditar, type TipoNome } from './nomes.ts';
import { gabaritosEm } from './validar.ts';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
export const GABARITOS_V2 = join(AQUI, 'gabaritos-v2');
export const DIVISAO_V2 = join(AQUI, 'divisao-v2.json');
export const DIVISAO_V2_HASH = join(AQUI, 'divisao-v2.sha256');

export interface DivisaoV2 extends Omit<Divisao, 'versao'> {
  versao: 2;
  base: { arquivo: 'divisao.json'; sha256: string };
  lotes: Record<string, Divisao['lotes'][string] & { nomes: Record<string, TipoNome> }>;
}

export function lerDivisaoV2(): DivisaoV2 {
  const txt = readFileSync(DIVISAO_V2, 'utf8');
  if (sha256(txt) !== readFileSync(DIVISAO_V2_HASH, 'utf8').split(/\s+/)[0]) throw new Error('divisao-v2.json foi alterado: o sha256 não confere');
  return JSON.parse(txt);
}

// Unidade de cada caso (pelo gabarito da versão 1).
const unidades = () => new Map(lerGabaritos(GABARITOS).map(g => [g.caso, unidadeDe(g)]));

export function tipoDeNome(caso: string, d: DivisaoV2 = lerDivisaoV2()): TipoNome | null {
  const u = unidades().get(casoBase(caso));
  if (!u) return null;
  for (const l of Object.values(d.lotes)) if (l.nomes[u]) return l.nomes[u];
  return null;
}

// Aplica os nomes da versão 2 congelada a um corpus gerado (inteiro ou só algumas frentes).
export function aplicarV2(saida: string, d: DivisaoV2 = lerDivisaoV2()) {
  const u = unidades();
  return aplicarNomesV2(saida, Object.fromEntries(Object.entries(d.lotes).map(([l, x]) => [l, x.nomes])), (_f, caso) => u.get(caso) ?? caso);
}

export async function gerarOficialV2(saida: string) {
  await gerarOficial(saida);
  aplicarV2(saida);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida-v2' });
  (async () => {
    const v1 = lerDivisao();
    const gabV1 = lerGabaritos(GABARITOS);
    const u = new Map(gabV1.map(g => [g.caso, unidadeDe(g)]));
    const nArq = new Map(gabV1.map(g => [g.caso, g.arquivos.length]));
    const tipos = atribuirTipos(v1.lotes, c => u.get(c)!, c => nArq.get(c) ?? 0);
    rmSync(a.saida, { recursive: true, force: true });
    await gerarOficial(a.saida);
    aplicarNomesV2(a.saida, tipos, (_f, caso) => u.get(caso) ?? caso);
    // Gabaritos da versão 2 (a versão 1 fica como está).
    rmSync(GABARITOS_V2, { recursive: true, force: true });
    const files = gabaritosEm(a.saida).filter(f => !/-(sintetica|fotos)\//.test(f));
    const manifesto: Record<string, string> = {};
    const gabV2 = [];
    for (const f of files) {
      const g = JSON.parse(readFileSync(f, 'utf8'));
      mkdirSync(join(GABARITOS_V2, g.frente), { recursive: true });
      copyFileSync(f, join(GABARITOS_V2, g.frente, `${g.caso}.json`));
      manifesto[`${g.frente}/${g.caso}.json`] = sha256(readFileSync(f));
      gabV2.push(g);
    }
    for (const fr of ['juridico']) if (existsSync(join(a.saida, fr, 'perguntas.json'))) {
      copyFileSync(join(a.saida, fr, 'perguntas.json'), join(GABARITOS_V2, fr, 'perguntas.json'));
      manifesto[`${fr}/perguntas.json`] = sha256(readFileSync(join(a.saida, fr, 'perguntas.json')));
    }
    const auditoriaV1 = auditar(gabV1 as never), auditoriaV2 = auditar(gabV2 as never);
    gravarJson(join(GABARITOS_V2, 'manifesto.json'), { versao: 2, base: 'gabaritos/ (versão 1): mesmos casos e resultados esperados; só os nomes de arquivo mudam',
      casos: files.length, sha256: Object.fromEntries(Object.keys(manifesto).sort().map(k => [k, manifesto[k]])) });
    gravarJson(join(AQUI, 'resultados', 'auditoria-nomes.json'), { v1: auditoriaV1, v2: { porFrente: auditoriaV2.porFrente } });
    // Divisão v2: os conjuntos da v1 e o tipo de nome de cada unidade, com a distribuição.
    const lotes: DivisaoV2['lotes'] = {};
    for (const [l, lote] of Object.entries(v1.lotes)) {
      const rot = new Map(gabV2.filter(g => `${g.frente}/${g.procedencia ?? 'gerado'}` === l).map(g => [g.caso, [...rotulosDe(g), `nome:${tipos[l][u.get(g.caso)!]}`]]));
      const distribuicao: Record<string, { desenvolvimento: number; reservado: number }> = {};
      for (const [caso, conj] of Object.entries(lote.casos)) for (const r of rot.get(caso) ?? []) { (distribuicao[r] ??= { desenvolvimento: 0, reservado: 0 })[conj]++; }
      lotes[l] = { ...lote, nomes: Object.fromEntries(Object.keys(tipos[l]).sort().map(k => [k, tipos[l][k]])), distribuicao: Object.fromEntries(Object.keys(distribuicao).sort().map(k => [k, distribuicao[k]])) };
    }
    const d: DivisaoV2 = { versao: 2, proporcao: v1.proporcao, base: { arquivo: 'divisao.json', sha256: sha256(readFileSync(DIVISAO, 'utf8')) },
      regra: `${v1.regra} Versão 2: mesmos conjuntos da versão 1; estrato "nome genérico × descritivo" sorteado dentro de cada conjunto (65% das unidades genéricas; pelo menos 60% dos arquivos de cada frente).`,
      lotes };
    const txt = JSON.stringify(d, null, 2) + '\n';
    writeFileSync(DIVISAO_V2, txt);
    writeFileSync(DIVISAO_V2_HASH, `${sha256(txt)}  divisao-v2.json\n`);
    console.log(JSON.stringify({ gabaritos: files.length, v1: auditoriaV1.porFrente, v2: auditoriaV2.porFrente }, null, 1));
  })();
}
