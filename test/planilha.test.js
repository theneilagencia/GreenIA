// Cálculos conferidos de planilhas (planilha.js): sobre todas as linhas, genéricos (nenhum nome de coluna esperado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numero, resumoDeTabela, resumoDeCsv, MIN_LINHAS } from '../src/planilha.js';
import { extrairTexto } from '../src/texto.js';
import { xlsx } from './arquivos.js';

test('números em formatos comuns (pt-BR, ponto, moeda, porcentagem) e texto não é número', () => {
  assert.deepEqual(['1.234,50', '1234.5', 'R$ 9.773', '-10,9%', ' 42 ', '1.682.153', 42, 'abc', '', 'L023'].map(numero), [1234.5, 1234.5, 9773, -10.9, 42, 1682153, 42, null, null, null]);
});

test('totais, vazios, fora do padrão, variação e somas por categoria sobre todas as linhas (inclusive as últimas)', () => {
  const cab = ['Código', 'Grupo', 'Meta', 'Feito'];
  const linhas = Array.from({ length: 30 }, (_, i) => [`X${i + 1}`, i % 2 ? 'Norte' : 'Sul', 100, i === 28 ? 900 : i === 5 ? '' : 100 + i]);
  const r = resumoDeTabela(cab, linhas);
  assert.match(r, /todas as 30 linhas/);
  assert.match(r, /Vazios em "Feito": 1 \(X6\)/);
  assert.match(r, /"Meta": total 3\.000 \(30 valores\)/);
  assert.match(r, /Fora do padrão em "Feito": X29 \(900\)/, 'o extremo perto do fim aparece');
  assert.match(r, /Maiores variações de "Feito" em relação a "Meta": X29 \+800,0%/);
  assert.match(r, /Por "Grupo": Sul \(15 linhas\)/);
  assert.match(r, /nas 14 linhas com os dois valores/, 'variação da categoria só de igual para igual');
  assert.equal(resumoDeTabela(cab, linhas.slice(0, MIN_LINHAS - 1)), null, 'planilha pequena: o modelo lê sem ajuda');
  assert.equal(resumoDeTabela(['Nome', 'Obs'], linhas.map(l => [l[0], 'texto'])), null, 'sem coluna numérica: nada a calcular');
});

test('XLSX e CSV: o texto extraído leva os cálculos conferidos', async () => {
  const linhas = [['ID', 'Tipo', 'Valor'], ...Array.from({ length: 12 }, (_, i) => [`A${i + 1}`, i < 6 ? 'Ação' : 'Ônibus', i + 1])];
  const t = (await extrairTexto({ nome: 'p.xlsx', base64: Buffer.from(xlsx(linhas)).toString('base64') })).texto;
  assert.match(t, /# Planilha: Plan1\nID;Tipo;Valor\nA1;Ação;1/);
  assert.match(t, /"Valor": total 78 \(12 valores\)/);
  assert.match(t, /Por "Tipo": Ação \(6 linhas\): Valor 21 \| Ônibus \(6 linhas\): Valor 57/);
  const csv = ['id;valor', ...Array.from({ length: 11 }, (_, i) => `c${i};${i * 10}`)].join('\n');
  assert.match(resumoDeCsv(csv), /"valor": total 550 \(11 valores\)/);
  const c = (await extrairTexto({ nome: 'p.csv', base64: Buffer.from(csv).toString('base64') })).texto;
  assert.match(c, /Cálculos conferidos pela GreenIA/);
});
