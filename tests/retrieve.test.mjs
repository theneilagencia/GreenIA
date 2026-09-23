import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import core from '../lib/greenia-core.js';

const { retrieve, retrieveForTurn, stemPt, tokenizePt } = core;

// Usa a base que está de fato na página, para o teste não divergir do protótipo.
function kbFromPage() {
  const src = readFileSync(new URL('../GreenIA.dc.html', import.meta.url), 'utf8');
  const m = src.match(/\n\s*KB = (\[[\s\S]*?\n\s*\]);/);
  assert.ok(m, 'KB não encontrada em GreenIA.dc.html');
  return new Function('return ' + m[1])();
}
const KB = kbFromPage();
const titles = q => retrieve(KB, q).map(d => d.title);

test('"limite de refeição em viagem" retorna "Reembolso de despesas"', () => {
  assert.equal(titles('limite de refeição em viagem')[0], 'Reembolso de despesas');
});

test('"quantos dias de férias" retorna "Férias e ausências"', () => {
  assert.equal(titles('quantos dias de férias')[0], 'Férias e ausências');
});

test('"dia" isolado não retorna documento', () => {
  assert.deepEqual(titles('dia'), []);
});

test('match por token inteiro: "dia" não casa com "diária"', () => {
  const kb = [{ title: 'Hotel', text: 'A diária inclui café.' }];
  assert.deepEqual(retrieve(kb, 'dia hotel'), [kb[0]]); // pelo título
  assert.deepEqual(retrieve(kb, 'dia café'), []); // só "café" no corpo: 1 ponto
});

test('uma palavra genérica só no corpo não injeta contexto', () => {
  assert.deepEqual(titles('portal'), []);
});

test('palavra do título basta', () => {
  assert.equal(titles('reembolso')[0], 'Reembolso de despesas');
});

test('plural e singular casam', () => {
  assert.equal(titles('despesa de viagens')[0], 'Reembolso de despesas');
  assert.equal(titles('chamados de suporte')[0], 'Suporte de TI (DIT)');
});

test('stemming leve de plural', () => {
  assert.equal(stemPt('aprovacoes'), 'aprovacao');
  assert.equal(stemPt('gerais'), 'geral');
  assert.equal(stemPt('viagens'), 'viagem');
  assert.equal(stemPt('gestores'), 'gestor');
  assert.equal(stemPt('dias'), 'dia');
  assert.equal(stemPt('ferias'), 'feria');
  assert.equal(stemPt('dia'), 'dia');
});

test('tokenização ignora acento, caixa e stopwords', () => {
  assert.deepEqual(tokenizePt('Quantos DIAS de Férias?'), ['dia', 'feria']);
});

test('pergunta de seguimento usa a mensagem anterior do usuário', () => {
  assert.deepEqual(retrieve(KB, 'e se for internacional?'), []);
  const hits = retrieveForTurn(KB, 'e se for internacional?', 'qual o limite de refeição em viagem?');
  assert.equal(hits[0].title, 'Reembolso de despesas');
});

test('seguimento não é usado quando a última mensagem já acha algo', () => {
  const hits = retrieveForTurn(KB, 'quantos dias de férias', 'limite de refeição em viagem');
  assert.equal(hits[0].title, 'Férias e ausências');
});
