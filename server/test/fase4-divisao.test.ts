// Divisão do corpus em desenvolvimento e reservado: congelada com hash, cobre
// todos os gabaritos congelados, refeita dá o mesmo resultado, as variações
// herdam o conjunto do caso de origem e o reservado exige a rodada final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIVISAO, DIVISAO_HASH, calcular, conjuntoDe, exigirConjunto, lerDivisao, lerGabaritos, unidadeDe } from '../eval/fase4/dividir.ts';
import { sha256 } from '../eval/fase4/lib.ts';
import { GABARITOS } from '../eval/fase4/congelar.ts';

test('divisao.json confere com o sha256 congelado', () => {
  const hash = readFileSync(DIVISAO_HASH, 'utf8').split(/\s+/)[0];
  assert.equal(sha256(readFileSync(DIVISAO, 'utf8')), hash);
  assert.doesNotThrow(() => lerDivisao());
});

test('todo gabarito congelado está em um conjunto, e a divisão refeita é a mesma', () => {
  const d = lerDivisao();
  const gs = lerGabaritos(GABARITOS);
  for (const g of gs) assert.ok(conjuntoDe(g.caso, d), `${g.caso} sem conjunto`);
  const refeita = calcular(gs);
  for (const [l, lote] of Object.entries(refeita)) {
    if (!d.lotes[l]) continue;                                       // lote novo ainda não congelado
    assert.deepEqual(lote.casos, d.lotes[l].casos, `lote ${l} mudou`);
  }
});

test('60% das unidades no desenvolvimento por lote; casos que dividem arquivo ficam juntos', () => {
  const d = lerDivisao();
  const gs = lerGabaritos(GABARITOS);
  for (const [l, lote] of Object.entries(d.lotes)) {
    assert.equal(lote.desenvolvimento, Math.round(lote.unidades * 0.6), l);
    for (const [rot, n] of Object.entries(lote.distribuicao)) {
      const tot = n.desenvolvimento + n.reservado;
      if (tot >= 5) assert.ok(Math.abs(n.desenvolvimento / tot - 0.6) <= 0.2, `${l} ${rot}: ${n.desenvolvimento}/${tot}`);
    }
  }
  const porUnidade = new Map<string, Set<string>>();
  for (const g of gs) { const u = unidadeDe(g); porUnidade.set(u, new Set([...(porUnidade.get(u) ?? []), conjuntoDe(g.caso, d)!])); }
  for (const [u, s] of porUnidade) assert.equal(s.size, 1, `${u} dividido entre conjuntos`);
});

test('variações herdam o conjunto; o reservado só na rodada final', () => {
  const d = lerDivisao();
  assert.equal(conjuntoDe('rh-pasta-03-fotos', d), conjuntoDe('rh-pasta-03', d));
  assert.equal(conjuntoDe('rh-pasta-03-sintetica', d), conjuntoDe('rh-pasta-03', d));
  assert.throws(() => exigirConjunto('reservado', false, 'teste'), /rodada final/);
  assert.equal(exigirConjunto('desenvolvimento', false, 'teste'), 'desenvolvimento');
});
