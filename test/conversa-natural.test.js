import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';

test('chat preserva o estilo recebido, sem revisão oculta nem chamadas extras', async () => {
  const respostas = [
    'Você quer um roast sem me contar nada? Porra, até sua biografia terceirizou o trabalho! 😂',
    'Oi, equipe! Bora fechar essa jornada — com café e sem drama 😂',
    'Não é apenas café, é combustível — e ponto. ☕',
  ];
  let indice = 0;
  const OR = await openRouterFalso({ responder: () => respostas[indice] });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const c = await S.cliente().entrar('ana@exemplo.com.br');
    const pedidos = [
      'Based on everything you know about me, roast and don’t hold back. Say it in Portuguese slang Just like this, but add way more português swear words',
      'Escreva só uma frase descontraída com emoji para a equipe.',
      'Repita literalmente: Não é apenas café, é combustível — e ponto. ☕',
    ];
    for (indice = 0; indice < pedidos.length; indice++) {
      const conv = (await c.post('/api/conversas', {})).dados.conversa;
      const antes = OR.chamadas.length;
      const r = await enviarMensagem(c, conv.id, { texto: pedidos[indice] });
      assert.equal(r.status, 200);
      assert.ok(r.fim && !r.falha);
      assert.equal(OR.chamadas.length - antes, 1, 'nenhuma reescrita editorial após o stream');
      assert.equal(r.texto, respostas[indice]);
      assert.ok(!r.eventos.some(e => e.t === 'substituir'));
      assert.equal(um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).texto, respostas[indice]);
    }
    const sistema = OR.chamadas[0].messages[0].content;
    assert.match(sistema, /falta de biografia não deve bloquear/);
    assert.match(sistema, /histórico disponível/);
    assert.doesNotMatch(sistema, /Escreva como um consultor sênior/);
  } finally { await S.fechar(); await OR.fechar(); }
});

test('continuação recebe fatos e resposta anteriores da própria conversa, sem cruzar usuários', async () => {
  const OR = await openRouterFalso({ responder: () => 'Texto de teste.' });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const ana = await S.cliente().entrar('ana@exemplo.com.br');
    const bia = await S.cliente().entrar('bia@exemplo.com.br');
    const privada = (await bia.post('/api/conversas', {})).dados.conversa;
    await enviarMensagem(bia, privada.id, { texto: 'Meu projeto exclusivo se chama SegredoDaBia.' });
    const conv = (await ana.post('/api/conversas', {})).dados.conversa;
    await enviarMensagem(ana, conv.id, { texto: 'Meu projeto se chama Aurora e organizo tudo em planilhas.' });
    await enviarMensagem(ana, conv.id, { texto: 'Agora faça uma brincadeira com isso, sem perguntas.' });
    const mensagens = OR.chamadas.at(-1).messages;
    assert.ok(mensagens.some(m => m.role === 'user' && m.content.includes('Aurora')));
    assert.ok(mensagens.some(m => m.role === 'assistant' && m.content === 'Texto de teste.'));
    assert.ok(!JSON.stringify(mensagens).includes('SegredoDaBia'));
    assert.equal((await ana.get(`/api/conversas/${privada.id}`)).status, 404);
  } finally { await S.fechar(); await OR.fechar(); }
});
