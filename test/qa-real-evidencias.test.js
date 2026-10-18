import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarRecibo, falhasDaEntrega, consolidarRecibos } from '../scripts/qa-real-evidencias.mjs';

test('QA real: custo ausente ou textual fica pendente, nunca vira zero', () => {
  for (const usage of [{}, { cost: null }, { cost: '0' }, { cost: -1 }]) {
    const c = { custo: null }; registrarRecibo(c, { usage });
    assert.equal(c.custo, null);
    assert.equal(consolidarRecibos([c]).custoTotalUsd, null);
  }
});
test('QA real: registra zero explícito e soma custos das tentativas que falharam', () => {
  const c = { custo: null, status: 200 }; registrarRecibo(c, { id: 'gen-qa', model: 'modelo-qa', provider: 'rota-qa', usage: { cost: 0, prompt_tokens: 12, completion_tokens: 8 } });
  const r = consolidarRecibos([c, { custo: 0.02, status: 500 }]);
  assert.equal(c.geracao, 'gen-qa'); assert.deepEqual(c.tokens, { entrada: 12, saida: 8 });
  assert.equal(r.custoTotalUsd, 0.02); assert.equal(r.tentativas, 2); assert.equal(r.inferenciasComRecibo, 1); assert.equal(r.liberacaoProducao, false);
});
test('QA real: HTTP 200 sozinho, stream quebrado e resposta vazia não aprovam entrega', () => {
  assert.equal(falhasDaEntrega({ http: 200, texto: '', chamadasReais: 0 }).length, 3);
  assert.ok(falhasDaEntrega({ http: 200, texto: 'Resultado', chamadasReais: 1, finalizou: true, falha: 'interrompida' }).includes('execução falhou'));
  assert.equal(consolidarRecibos([{ status: 200, geracao: 'gen-x', modeloResposta: 'm', erroStream: 'ECONNRESET', custo: null }]).inferenciasComRecibo, 0);
});
test('QA real: execução concluída com recibo pode passar pela verificação estrutural, sem liberar produção', () => {
  assert.deepEqual(falhasDaEntrega({ http: 200, finalizou: true, texto: 'Material verificável', chamadasReais: 1 }), []);
  assert.equal(consolidarRecibos([]).liberacaoProducao, false);
});
