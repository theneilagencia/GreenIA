// Corpus versão 2: os mesmos casos e resultados esperados da versão 1, com nomes
// genéricos em pelo menos 60% dos arquivos de cada frente; divisão congelada com
// hash, com os mesmos conjuntos da versão 1 e o estrato de tipo de nome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIVISAO_V2, DIVISAO_V2_HASH, GABARITOS_V2, gerarOficialV2, lerDivisaoV2, tipoDeNome } from '../eval/fase4/congelar-v2.ts';
import { GABARITOS } from '../eval/fase4/congelar.ts';
import { lerDivisao, lerGabaritos, unidadeDe } from '../eval/fase4/dividir.ts';
import { auditar, revela } from '../eval/fase4/nomes.ts';
import { sha256 } from '../eval/fase4/lib.ts';
import { gabaritosEm } from '../eval/fase4/validar.ts';

type G = { caso: string; frente: string; arquivos: { nome: string; sha256: string }[]; esperado: Record<string, unknown> };
const v1 = lerGabaritos(GABARITOS) as unknown as G[], v2 = lerGabaritos(GABARITOS_V2) as unknown as G[];
const porCaso = new Map(v1.map(g => [g.caso, g]));

test('divisão v2: hash confere, mesmos conjuntos da v1 (nenhum caso do desenvolvimento foi para o reservado)', () => {
  assert.equal(sha256(readFileSync(DIVISAO_V2, 'utf8')), readFileSync(DIVISAO_V2_HASH, 'utf8').split(/\s+/)[0]);
  const d1 = lerDivisao(), d2 = lerDivisaoV2();
  for (const [l, lote] of Object.entries(d1.lotes)) assert.deepEqual(d2.lotes[l].casos, lote.casos, l);
  assert.equal(d2.base.sha256, sha256(readFileSync(new URL('../eval/fase4/divisao.json', import.meta.url), 'utf8')));
});

test('pelo menos 60% dos arquivos de cada frente com nome genérico; os dois tipos em cada conjunto; unidade inteira de um tipo', () => {
  const d = lerDivisaoV2();
  const frentes = new Map<string, { g: number; t: number }>();
  const porConjunto = new Map<string, Set<string>>();
  for (const g of v2) {
    const t = tipoDeNome(g.caso, d)!;
    const f = frentes.get(g.frente) ?? { g: 0, t: 0 };
    f.t += g.arquivos.length; if (t === 'generico') f.g += g.arquivos.length;
    frentes.set(g.frente, f);
    const c = d.lotes[`${g.frente}/gerado`].casos[g.caso];
    porConjunto.set(`${g.frente}/${c}`, new Set([...(porConjunto.get(`${g.frente}/${c}`) ?? []), t]));
  }
  for (const [fr, f] of frentes) assert.ok(f.g / f.t >= 0.6, `${fr}: ${f.g}/${f.t}`);
  for (const [k, s] of porConjunto) assert.equal(s.size, 2, k);
  // Casos da mesma especificação (Suprimentos) têm o mesmo tipo de nome.
  const porUnidade = new Map<string, Set<string>>();
  for (const g of v2) { const u = unidadeDe(porCaso.get(g.caso)! as never); porUnidade.set(u, new Set([...(porUnidade.get(u) ?? []), tipoDeNome(g.caso, d)!])); }
  for (const [u, s] of porUnidade) assert.equal(s.size, 1, u);
});

test('gabaritos v2 = v1 com outros nomes: mesmos casos, mesmos bytes (sha256), mesmos resultados esperados', () => {
  assert.equal(v2.length, v1.length);
  const d = lerDivisaoV2();
  for (const g of v2) {
    const a = porCaso.get(g.caso)!;
    assert.deepEqual(g.arquivos.map(x => x.sha256).sort(), a.arquivos.map(x => x.sha256).sort(), g.caso);
    const mapa = new Map(a.arquivos.map(x => [x.nome, g.arquivos.find(y => y.sha256 === x.sha256)!.nome]));
    // Trocando os nomes da v1 pelos da v2, o esperado é o mesmo (salvo o nome sugerido do LGPD, que deriva do nome do arquivo).
    let e1 = JSON.stringify(a.esperado);
    for (const [x, y] of [...mapa].sort((p, q) => q[0].length - p[0].length)) e1 = e1.split(x).join(y);
    const limpa = (s: string) => s.replace(/"nome":"[^"]*"/g, '"nome":""');
    assert.equal(limpa(JSON.stringify(g.esperado)), limpa(e1), g.caso);
    if (tipoDeNome(g.caso, d) === 'generico') for (const x of g.arquivos) assert.deepEqual(revela(g.frente, x.nome), [], `${g.caso}: ${x.nome}`);
    else assert.deepEqual(g.arquivos.map(x => x.nome).sort(), a.arquivos.map(x => x.nome).sort(), g.caso);
  }
});

test('auditoria: na v1 os nomes entregam a resposta; na v2, só nos casos descritivos', () => {
  const a1 = auditar(v1 as never), a2 = auditar(v2 as never);
  for (const f of ['rh', 'contratacao', 'fiscal', 'suprimentos', 'juridico', 'financeiro']) assert.equal(a1.porFrente[f].revelam, a1.porFrente[f].arquivos, f);
  for (const [f, x] of Object.entries(a2.porFrente)) assert.ok(x.revelam / x.arquivos <= 0.4, `${f}: ${x.revelam}/${x.arquivos}`);
  const gravada = JSON.parse(readFileSync(new URL('../eval/fase4/resultados/auditoria-nomes.json', import.meta.url), 'utf8'));
  assert.deepEqual(gravada.v2.porFrente, a2.porFrente);
});

let dir = '';
before(async () => { dir = mkdtempSync(join(tmpdir(), 'fase4-v2-')); await gerarOficialV2(dir); });
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

test('o corpus v2 gerado de novo bate com os gabaritos v2 congelados', () => {
  const man = JSON.parse(readFileSync(join(GABARITOS_V2, 'manifesto.json'), 'utf8')).sha256 as Record<string, string>;
  const fresh = gabaritosEm(dir).map(f => ({ f, g: JSON.parse(readFileSync(f, 'utf8')) }));
  assert.equal(fresh.length, v2.length);
  for (const { f, g } of fresh) assert.equal(sha256(readFileSync(f)), man[`${g.frente}/${g.caso}.json`], g.caso);
  assert.equal(sha256(readFileSync(join(dir, 'juridico', 'perguntas.json'))), man['juridico/perguntas.json']);
});
