import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avaliarCasoChat, diagnosticarChat, iniciarDiagnosticoChat, CASOS_CHAT } from '../src/diagnostico-chat.js';
import { criarApp } from '../src/servidor.js';
import { lerModelos } from '../src/modelos.js';
import { openRouterFalso } from './openrouter-falso.js';

const recibo = { geracao: 'teste-123', modelo: 'modelo-teste', custoConfirmado: true };
const resposta = texto => ({ http: 200, fim: true, texto, recibos: [recibo] });
test('diagnóstico não confunde HTTP 200, mock ou relatório burocrático com atendimento', () => {
  const roast = CASOS_CHAT.find(c => c.id === 'roast-sem-biografia');
  assert.ok(avaliarCasoChat(roast, resposta('Para realizar esta tarefa, preciso que você forneça informações sobre si mesmo.')).includes('bloqueio_desnecessario'));
  assert.ok(avaliarCasoChat(roast, { ...resposta('Porra, sua agenda tem mais promessas que uma campanha eleitoral. '.repeat(3)), recibos: [] }).includes('inferencia_sem_comprovacao'));
  assert.deepEqual(avaliarCasoChat({ exato: '☕' }, resposta('☕')), []);
  assert.ok(avaliarCasoChat({ exato: '☕' }, resposta('Café.')).includes('fidelidade_literal'));
  assert.ok(avaliarCasoChat({}, resposta('## O que foi feito\nNada.')).includes('relatorio_nao_pedido'));
  assert.ok(avaliarCasoChat({ arquivo: 'xlsx' }, resposta('Planilha pronta.')).includes('download_arquivo'));
});
test('IA simulada e indisponível são recusadas antes de qualquer chamada', async () => {
  await assert.rejects(diagnosticarChat({ ia: { simulada: true } }), /IA real indisponível/);
  await assert.rejects(diagnosticarChat({ ia: { configurada: false } }), /IA real indisponível/);
});
test('identificação inválida ou já iniciada não toca em IA nem bancos de clientes', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'greenia-diagnostico-test-'));
  try {
    const P = { get ia() { throw new Error('não deve acessar'); } };
    await iniciarDiagnosticoChat(P, { id: '../fora', pasta });
    writeFileSync(join(pasta, 'chat-ja-iniciado.json'), '{}');
    await iniciarDiagnosticoChat(P, { id: 'ja-iniciado', pasta });
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('autoteste do coletor: login HTTP, continuidade, recibos e downloads, sem inferência real', async () => {
  const a = criarApp({ log: () => {} });
  const modelos = lerModelos(a.db).map(m => ({ ...m, maxSaida: 32768, parametros: ['max_tokens', 'tools'], modalidades: ['text'] }));
  a.db.close();
  let i = 0;
  const OR = await openRouterFalso({ modelos: modelos.map(m => ({ id: m.id, name: m.nome, pricing: { prompt: String(m.precoEntrada), completion: String(m.precoSaida) }, context_length: m.contexto, top_provider: { max_completion_tokens: 32768 }, supported_parameters: ['tools', 'max_tokens'], architecture: { input_modalities: ['text'] } })), responder: b => {
    const ultima = b.messages.filter(m => m.role === 'user').at(-1)?.content || '';
    const caso = CASOS_CHAT.find(c => String(ultima).startsWith(c.pedido)) || { id: 'auxiliar' };
    return caso.exato || (caso.humor ? 'Porra, você organiza a Aurora em planilhas como se o Excel fosse resolver essa fila interminável de ideias que você começa antes de terminar a anterior. Sua agenda já está pedindo férias de tanta promessa!' : caso.umaFrase ? 'Sua planilha já tem mais ideias que linhas.' : caso.id === 'email' ? 'Olá, equipe! A reunião mudou para terça-feira às 10h. ☕' : caso.id === 'word' ? '# Aviso interno\n\nA reunião da equipe será na terça-feira às 10h.' : '| Item | Valor |\n|---|---|\n| A | 125 |\n| B | 275 |\n| C | 100 |');
  } });
  const ia = { listarModelos: OR.ia.listarModelos, listarRotas: async () => [], async *enviar(m, op) { op.aoGerar?.('autoteste-' + i); for await (const ev of OR.ia.enviar(m, op)) yield ev; i++; } };
  try {
    const logs = [];
    const r = await diagnosticarChat({ ia, log: (...v) => logs.push(v), versao: 'autoteste-simulado' });
    if (r.aprovados !== CASOS_CHAT.length) console.log('COLETOR_FALHAS', JSON.stringify(logs));
    assert.ok(r.aprovados === CASOS_CHAT.length, JSON.stringify(logs));
    assert.equal(r.casos, CASOS_CHAT.length);
    assert.deepEqual(r.falhas, []);
    assert.ok(r.inferencias >= CASOS_CHAT.length);
  } catch (e) { console.log('COLETOR_ERRO', e.stack); throw e; } finally { await OR.fechar(); }
});
