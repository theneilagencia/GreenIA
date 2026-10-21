import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { criarPrazoArquivo } from '../src/tempo-arquivo.js';
import { eventosDaResposta } from '../public/fluxo-resposta.js';
import { caminhoChromium, comLeitorPdf } from '../src/visual/chromium.js';

test('leitor PDF travado é encerrado e a fila aceita o próximo arquivo', { skip: !caminhoChromium() }, async () => {
  await assert.rejects(comLeitorPdf(Buffer.from('teste'), page => page.evaluate(() => new Promise(() => {})), { tempoMs: 200 }), { codigo: 'arquivo_tempo_excedido' });
  assert.equal(await comLeitorPdf(Buffer.from('teste'), page => page.evaluate(() => document.body.tagName)), 'BODY');
});

test('montagem interrompe o provedor e impede novas tentativas depois do prazo', async () => {
  const prazo = criarPrazoArquivo({ chamadaMs: 15 });
  let chamadas = 0;
  await assert.rejects(prazo.executar(async signal => {
    chamadas++;
    await esperar(1000, null, { signal });
  }), { codigo: 'arquivo_tempo_excedido' });
  await assert.rejects(prazo.executar(() => { chamadas++; }), { codigo: 'arquivo_tempo_excedido' });
  assert.equal(chamadas, 1);
  assert.throws(prazo.conferir, { codigo: 'arquivo_tempo_excedido' });
});

test('prazo total é compartilhado pelas etapas, sem reiniciar a cada chamada', async () => {
  let agora = 0, chamadas = 0;
  const prazo = criarPrazoArquivo({ totalMs: 100, agora: () => agora });
  assert.equal(await prazo.executar(() => { chamadas++; return 'plano'; }), 'plano');
  agora = 101;
  await assert.rejects(prazo.executar(() => { chamadas++; }), { codigo: 'arquivo_tempo_excedido' });
  assert.equal(chamadas, 1);
});

test('um timeout cancela também as chamadas de montagem em paralelo', async () => {
  const prazo = criarPrazoArquivo({ chamadaMs: 20 });
  let cancelada = false;
  const resultados = await Promise.allSettled([
    prazo.executar(signal => esperar(1000, null, { signal })),
    prazo.executar(async signal => {
      try { await esperar(1000, null, { signal }); }
      catch (e) { cancelada = signal.aborted; throw e; }
    }),
  ]);
  assert.ok(cancelada);
  assert.ok(resultados.every(r => r.status === 'rejected' && r.reason.codigo === 'arquivo_tempo_excedido'));
});

test('falha normal do provedor mantém a tentativa controlada já existente', async () => {
  const prazo = criarPrazoArquivo();
  await assert.rejects(prazo.executar(() => { throw new Error('indisponivel'); }), /indisponivel/);
  assert.equal(await prazo.executar(() => 'arquivo'), 'arquivo');
});

const fluxo = partes => new ReadableStream({ start(c) {
  for (const p of partes) c.enqueue(new TextEncoder().encode(p));
  c.close();
} });
const ler = async partes => {
  const eventos = [];
  for await (const ev of eventosDaResposta(fluxo(partes))) eventos.push(ev);
  return eventos;
};

test('download confirmado é recebido mesmo sem quebra de linha no último evento', async () => {
  const eventos = await ler(['{"t":"texto","v":"Aná', 'lise"}\n{"t":"fim","arquivos":[{"id":42}]}']);
  assert.equal(eventos[0].v, 'Análise');
  assert.equal(eventos[1].arquivos[0].id, 42);
});

test('conexão fechada sem confirmação não significa arquivo pronto', async () => {
  await assert.rejects(ler(['{"t":"texto","v":"O arquivo está pronto"}\n']), /resposta_interrompida/);
  await assert.rejects(ler([]), /resposta_interrompida/);
});

test('falha explícita encerra o fluxo sem inventar uma entrega', async () => {
  const eventos = await ler(['{"t":"erro","mensagem":"Não foi gerado"}']);
  assert.equal(eventos[0].t, 'erro');
});

test('evento truncado é falha de comunicação, não conclusão', async () => {
  await assert.rejects(ler(['{"t":"fim","arquivos":']), SyntaxError);
});

test('Interromper libera a leitura de uma conexão presa que não envia mais eventos', async () => {
  const c = new AbortController();
  const body = new ReadableStream({ start() {} });
  const leitura = (async () => { for await (const _ of eventosDaResposta(body, { sinal: c.signal })) {} })();
  c.abort();
  await assert.rejects(leitura, { name: 'AbortError' });
});
