// Todo custo cobrado pelo provedor vira crédito: chamada interrompida, chamada refeita, etapa que falha depois de
// gastar, execução que falha e imagem cobrada sem imagem. Na conferência com a conta do OpenRouter, ~4% do custo real
// escapava dos créditos por esses caminhos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/servidor.js';
import { comUso, anotarUso, registrarUso } from '../src/custo-ia.js';
import { todos, um, exec } from '../src/db.js';
import { criarOpenRouter } from '../src/ia.js';

const espera = ms => new Promise(ok => setTimeout(ok, ms));
// IA falsa: cada chamada cobra `custo`; `interromper` corta o stream depois do primeiro texto (sem o custo no fim).
function iaFalsa({ custo = 0.01, interromper = false, custoGeracao = 0.02, imagem = 'ok' } = {}) {
  let n = 0;
  return {
    configurada: true, geraImagem: true,
    async *enviar(_m, op) {
      n++; op.aoGerar?.(`gen-${n}`);
      yield { tipo: 'texto', texto: 'parte' };
      if (interromper) throw new Error('stream cortado');
      yield { tipo: 'fim', modelo: op.modelo, custo };
    },
    async custoDaGeracao(id) { return /^gen-/.test(id) ? custoGeracao : null; },
    async gerarImagem() {
      if (imagem === 'erro') throw Object.assign(new Error('sem imagem'), { custo: 0.04 });
      return { dataUrl: 'data:image/png;base64,AA==', custo: 0.04, modelo: 'img' };
    },
  };
}
const app = ia => { const a = criarApp({ ia }); a.esperasCustoIaMs = [5, 5, 5]; exec(a.db, "insert into pessoas (email, nome, papel, ativo) values ('p@x.com', 'P', 'usuario', 1)"); return a; };
const consumir = async (a, op = {}) => { let fim = null; for await (const ev of a.ia.enviar([], { modelo: 'm', ...op })) if (ev.tipo === 'fim') fim = ev; return fim; };
const total = a => um(a.db, 'select coalesce(sum(custo), 0) as c from uso').c;

test('chamada refeita: o custo da primeira (que a rota sobrescreveu) entra na linha de uso do pedido', async () => {
  const a = app(iaFalsa());
  await comUso(a, { pessoa_id: 1 }, async () => {
    await consumir(a);                      // primeira chamada (ex.: execução que voltou só com pergunta)
    const fim = await consumir(a);          // reavaliação: a rota só guarda o custo desta
    registrarUso(a, { em: new Date().toISOString(), pessoa_id: 1, conversa_id: 7, modelo_pedido: 'm', modelo_usado: 'm', custo: fim.custo });
  });
  const linhas = todos(a.db, 'select conversa_id, custo from uso');
  assert.equal(linhas.length, 1, 'não cria resposta a mais');
  assert.ok(Math.abs(linhas[0].custo - 0.02) < 1e-9, JSON.stringify(linhas));
  assert.ok(todos(a.db, "select detalhes from eventos where tipo = 'credits.consumed'").some(e => /custo_nao_registrado/.test(e.detalhes)));
});

test('execução que falha depois de gastar (nada gravado pela rota): uma linha com o custo, atribuída à conversa', async () => {
  const a = app(iaFalsa());
  await assert.rejects(comUso(a, { pessoa_id: 1 }, async () => {
    anotarUso({ conversa_id: 9, quick_win_id: 3, teste: 1 });
    await consumir(a);                      // pesquisa paga
    throw new Error('a execução falhou');
  }));
  const l = um(a.db, 'select pessoa_id, conversa_id, quick_win_id, teste, custo from uso');
  assert.deepEqual({ ...l }, { pessoa_id: 1, conversa_id: 9, quick_win_id: 3, teste: 1, custo: 0.01 });
});

test('stream interrompido: o custo é buscado no provedor pela identificação da geração e vira crédito', async () => {
  const a = app(iaFalsa({ interromper: true, custoGeracao: 0.03 }));
  await comUso(a, { pessoa_id: 1 }, async () => {
    anotarUso({ conversa_id: 5 });
    await assert.rejects(consumir(a));
  });
  await espera(60);
  assert.ok(Math.abs(total(a) - 0.03) < 1e-9, String(total(a)));
  assert.equal(um(a.db, 'select conversa_id from uso').conversa_id, 5);
});

test('quem para de ler antes do fim também paga: o custo vem do provedor', async () => {
  const a = app(iaFalsa({ custoGeracao: 0.015 }));
  await comUso(a, { pessoa_id: 1 }, async () => { for await (const ev of a.ia.enviar([], { modelo: 'm' })) { if (ev.tipo === 'texto') break; } });
  await espera(60);
  assert.ok(Math.abs(total(a) - 0.015) < 1e-9);
});

test('caminho feliz: nada muda (sem ajuste, sem linha a mais) e imagem cobrada sem imagem entra no pedido', async () => {
  const a = app(iaFalsa());
  await comUso(a, { pessoa_id: 1 }, async () => {
    const fim = await consumir(a);
    registrarUso(a, { em: new Date().toISOString(), pessoa_id: 1, modelo_pedido: 'm', modelo_usado: 'm', custo: fim.custo });
  });
  assert.equal(um(a.db, 'select count(*) as n from uso').n, 1);
  assert.equal(total(a), 0.01);
  assert.equal(todos(a.db, "select 1 from eventos where tipo = 'credits.consumed'").length, 0);

  const b = app(iaFalsa({ imagem: 'erro' }));
  await comUso(b, { pessoa_id: 1 }, async () => { await assert.rejects(b.ia.gerarImagem('x', { modelo: 'img' })); });
  assert.equal(total(b), 0.04);
});

test('cliente OpenRouter: avisa a geração no stream, busca o custo da geração e devolve o custo junto do erro de imagem', async () => {
  const pedidos = [];
  const f = async (url, init) => {
    pedidos.push(url);
    if (url.includes('/generation?id=gen-abc')) return new Response(JSON.stringify({ data: { id: 'gen-abc', total_cost: 0.0123 } }));
    if (init?.body && JSON.parse(init.body).modalities) return new Response(JSON.stringify({ id: 'gen-img', choices: [{ message: { content: '' } }], usage: { cost: 0.039 } }));
    const corpo = `data: ${JSON.stringify({ id: 'gen-abc', choices: [{ delta: { content: 'oi' } }] })}\n\ndata: ${JSON.stringify({ id: 'gen-abc', error: { message: 'caiu' } })}\n\n`;
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(corpo)); c.close(); } }));
  };
  const ia = criarOpenRouter({ chave: 'k', fetch: f });
  let gerou = null;
  await assert.rejects(async () => { for await (const _ of ia.enviar([], { modelo: 'm', aoGerar: g => { gerou = g; } })) { /* consome */ } });
  assert.equal(gerou, 'gen-abc');
  assert.equal(await ia.custoDaGeracao('gen-abc'), 0.0123);
  assert.equal(await ia.custoDaGeracao('gen-xyz').catch(() => 'erro'), null);
  const e = await ia.gerarImagem('x', { modelo: 'img' }).catch(x => x);
  assert.equal(e.custo, 0.039);
  assert.equal(e.geracao, 'gen-img');
});
