// Estimativa por definição de assistente, com a leitura por partes: chamadas em
// função das páginas e do limite por chamada; blocos em código não custam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimarExecucao, partesPara } from '../src/usage/simulate.ts';
import { tabela } from '../eval/fase4/simular-custo.ts';

test('partes: 40 páginas por chamada com o limite padrão; limite menor, mais partes', () => {
  assert.deepEqual([5, 20, 40, 41, 50, 150].map(n => partesPara(n)), [1, 1, 1, 2, 2, 4]);
  assert.equal(partesPara(50, 30_000), 5);
});

test('extração e resumo por partes; conferência e checklist por regras não chamam o modelo', () => {
  const ext = estimarExecucao({ pipeline: [{ bloco: 'ler' }, { bloco: 'extrair', params: { schema: { type: 'object' } } }] }, 150);
  assert.equal(ext.chamadas, 4);
  const res = estimarExecucao({ pipeline: [{ bloco: 'resumir', params: { palavrasMax: 500 } }] }, 150);
  assert.equal(res.chamadas, 5);                                            // 4 parciais + consolidação
  assert.equal(estimarExecucao({ pipeline: [{ bloco: 'resumir', params: { palavrasMax: 500 } }] }, 20).chamadas, 1);
  assert.deepEqual(estimarExecucao({ pipeline: [{ bloco: 'ler' }, { bloco: 'conferir' }, { bloco: 'checklist', params: { metodo: 'regras' } }] }, 150), { chamadas: 0, tokensEntrada: 0, tokensSaida: 0 });
  // Escaneado com fallback de visão permitido: só a parcela abaixo do limiar custa.
  const rh = estimarExecucao({ reading: { visionFallback: true }, pipeline: [{ bloco: 'ler' }, { bloco: 'checklist' }] }, 20, { percentualDigitalizado: 100 });
  assert.equal(rh.tokensEntrada, 2 * 2300);
});

test('tabela por assistente de referência: 5, 20, 50 e 150 páginas, Haiku 4.5 e Sonnet 5; custo cresce com as páginas', () => {
  const t = tabela();
  const ref = t.filter(r => r.referencia).map(r => r.modelo).sort();
  assert.deepEqual(ref, ['checklist-documentos-admissao', 'conferencia-nota-pedido', 'organizacao-evidencias', 'resumo-financeiro-mensal']);
  const fin = t.find(r => r.modelo === 'resumo-financeiro-mensal')!;
  assert.deepEqual(fin.porPaginas.map(p => p.paginas), [5, 20, 50, 150]);
  assert.deepEqual(fin.porPaginas.map(p => p.chamadas), [2, 2, 5, 9]);
  const h = fin.porPaginas.map(p => p.custoBrl['claude-haiku-4-5']), s = fin.porPaginas.map(p => p.custoBrl['claude-sonnet-5']);
  for (let i = 1; i < 4; i++) { assert.ok(h[i] > h[i - 1]); assert.ok(s[i] > s[i - 1]); }
  assert.ok(s.every((v, i) => v > h[i]));
  assert.equal(t.find(r => r.modelo === 'conferencia-nota-pedido')!.porPaginas[3].custoBrl['claude-sonnet-5'], 0);
});
