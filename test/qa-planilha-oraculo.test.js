import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planilha } from '../scripts/qa-cenarios.mjs';
import { verificarPlanilhaQa } from '../scripts/qa-planilha-oraculo.mjs';
import { resumoDeTabela } from '../src/planilha.js';
const entrada = planilha();
test('QA: a resposta real marcada PASS é reprovada por ranking e percentuais, sem depender do conferente IA', () => {
  const material = readFileSync(new URL('./fixtures/qa-real/planilha-reprovada-20261018.md', import.meta.url), 'utf8');
  const r = verificarPlanilhaQa(material, entrada);
  assert.equal(r.totalRealizadoConhecido, 1801408);
  assert.ok(r.falhas.some(f => /ordem decrescente/.test(f)));
  assert.ok(r.falhas.includes('Percentual divergente: L092'));
  assert.ok(r.falhas.includes('Percentual divergente: L103'));
  assert.ok(r.falhas.some(f => /contradiz/.test(f)));
});
test('QA: ranking correto é conferido, valores ausentes não entram como zero e texto sem tabela fica pendente', () => {
  const texto = '## Maiores gastos\n| ID | Realizado | % do Total |\n|---|---:|---:|\n| L118 | 207.036 | 11,49% |\n| L012 | 24.899 | 1,38% |\n| L092 | 24.589 | 1,36% |\n| L039 | 24.385 | 1,35% |\n| L103 | 24.225 | 1,34% |';
  assert.deepEqual(verificarPlanilhaQa(texto, entrada).falhas, []);
  assert.ok(verificarPlanilhaQa('Tudo certo, planilha conferida.', entrada).falhas.length);
  assert.ok(verificarPlanilhaQa(texto.replace('24.225', '24.226'), entrada).falhas.includes('Valor realizado divergente: L103'));
});
test('produto: a extração entrega ranking, percentuais e denominadores comparáveis calculados', () => {
  const r = resumoDeTabela(entrada[0], entrada.slice(1));
  assert.match(r, /L118 207\.036 \(11,49% do total conhecido 1\.801\.408\).*L012 24\.899.*L092 24\.589 \(1,36%.*L039 24\.385.*L103 24\.225 \(1,34%/);
  assert.match(r, /linhas com os dois valores: "Previsto \(R\$\)"/);
  assert.match(r, /Valores ausentes não são zero/);
});
