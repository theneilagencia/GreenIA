import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarRecibo, observarResposta, falhasDaEntrega, consolidarRecibos } from '../scripts/qa-real-evidencias.mjs';
import { criarOpenRouter } from '../src/ia.js';

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
test('QA real: imagem JSON preserva o corpo e registra geração, modelo e custo', async () => {
  const corpo = { id: 'gen-imagem', model: 'modelo-imagem', provider: 'Rota', choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,cWE=' } }] } }], usage: { cost: 0.04, prompt_tokens: 30, completion_tokens: 90 } };
  const c = { custo: null, t0: Date.now(), status: 200 };
  const original = new Response(JSON.stringify(corpo), { headers: { 'content-type': 'application/json' } });
  const resposta = observarResposta(c, original, false);
  assert.equal(resposta, original); assert.deepEqual(await resposta.json(), corpo); await c.pronto;
  assert.equal(c.custo, 0.04); assert.equal(c.geracao, 'gen-imagem'); assert.equal(c.modeloResposta, 'modelo-imagem'); assert.equal(c.formatoResposta, 'json');
  assert.equal(consolidarRecibos([c]).tentativasComCustoPendente, 0);
});
test('QA real: JSON sem custo continua pendente mesmo com HTTP 200 e imagem', async () => {
  const c = { custo: null, t0: Date.now(), status: 200 };
  observarResposta(c, new Response(JSON.stringify({ id: 'gen-img', model: 'm', choices: [] }), { headers: { 'content-type': 'application/json' } }), false);
  await c.pronto; assert.equal(c.custo, null); assert.equal(consolidarRecibos([c]).custoTotalUsd, null);
  assert.ok(falhasDaEntrega({ http: 200, finalizou: true, texto: 'Entregue', chamadasReais: 1, custosPendentes: 1 }).includes('custo pendente de comprovação'));
});
test('QA real: SSE dividido em blocos, CRLF e último recibo sem newline', async () => {
  const partes = ['data: {"id":"gen-sse","model":"m"}\r\n', 'data: {"usage":{"co', 'st":0.012,"prompt_tokens":5,"completion_tokens":8}}'];
  const texto = partes.join(''); const c = { custo: null, t0: Date.now() };
  const stream = new ReadableStream({ start(controller) { for (const p of partes) controller.enqueue(new TextEncoder().encode(p)); controller.close(); } });
  const original = new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  const r = observarResposta(c, original); assert.equal(await r.text(), texto); await c.pronto;
  assert.equal(c.geracao, 'gen-sse'); assert.equal(c.custo, 0.012); assert.deepEqual(c.tokens, { entrada: 5, saida: 8 });
});
test('QA real: JSON inválido não altera o corpo da aplicação nem inventa custo', async () => {
  const c = { custo: null, t0: Date.now() };
  const r = observarResposta(c, new Response('{invalido'), false);
  assert.equal(await r.text(), '{invalido'); await c.pronto;
  assert.ok(c.erroStream); assert.equal(c.custo, null);
});
test('QA real: o cliente de imagem consome o mesmo JSON observado e a próxima chamada não fica bloqueada', async () => {
  // Transporte simulado só para regressão do coletor; nenhuma inferência externa ou evidência real.
  const chamadas = [];
  const ia = criarOpenRouter({ chave: 'teste-local', fetch: async (_url, init) => {
    assert.equal(JSON.parse(init.body).stream, false);
    await Promise.all(chamadas.map(c => c.pronto));
    assert.equal(consolidarRecibos(chamadas).tentativasComCustoPendente, 0);
    const c = { custo: null, t0: Date.now(), status: 200 }; chamadas.push(c);
    return observarResposta(c, new Response(JSON.stringify({ id: `gen-${chamadas.length}`, model: 'imagem-qa', choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,cWE=' } }] } }], usage: { cost: 0.039 } }), { headers: { 'content-type': 'application/json' } }), false);
  } });
  for (let i = 0; i < 2; i++) { const imagem = await ia.gerarImagem('Material fictício', { modelo: 'imagem-qa' }); assert.equal(imagem.custo, 0.039); assert.equal(imagem.dataUrl, 'data:image/png;base64,cWE='); }
  await Promise.all(chamadas.map(c => c.pronto));
  assert.equal(consolidarRecibos(chamadas).custoTotalUsd, 0.078); assert.equal(consolidarRecibos(chamadas).inferenciasComRecibo, 2);
});
