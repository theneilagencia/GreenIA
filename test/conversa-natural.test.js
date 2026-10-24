import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { pecaDaConversa } from '../src/conversas.js';
import { visualDoPedido } from '../src/quickwin-operacao.js';
import { analisarPedido, requisitosDe } from '../src/roteador.js';
import { orientacaoDeEstilo, precisaCorrigirBriefing, falhaCriativa, criacaoSemArquivo } from '../src/conversa-natural.js';
import { pedePesquisa } from '../src/chat-recursos.js';

test('tarefas criativas têm capacidade para nuances, e restrições não pedem pesquisa', () => {
  for (const t of ['Faça um roast personalizado com humor e ironia.', 'Escreva um conto.', 'Crie uma sátira política fictícia.', 'Write a poem.']) {
    const a = analisarPedido({ texto: t });
    assert.ok(requisitosDe(a).nivel >= 2, t);
  }
  assert.equal(pedePesquisa('Gere um Excel. Sem fórmulas, gráficos, imagens ou pesquisa.'), false);
});

test('restrições não encomendam peças visuais nem chamadas extras de design', async () => {
  for (const pedido of ['Gere um Word sem capa.', 'Gere um Excel sem gráficos, capa, imagens ou tabela visual.', 'Crie um documento. Não inclua capa nem cartaz.', 'Gere um Word, evite capa.']) {
    assert.equal(visualDoPedido(pedido), null, pedido);
    assert.equal(pecaDaConversa(pedido), null, pedido);
  }
  assert.equal(visualDoPedido('Crie uma apresentação de 4 slides sem capa.').tipo, 'presentation');
  assert.equal(visualDoPedido('Sem capa, mas crie um cartaz.').tipo, 'poster');
  assert.equal(visualDoPedido('Não apenas uma capa, mas um cartaz.').tipo, 'poster');
  const OR = await openRouterFalso({ responder: () => '# Aviso interno\n\nA reunião da equipe será na terça-feira às 10h.' });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const c = await S.cliente().entrar('ana@exemplo.com.br');
    const conv = (await c.post('/api/conversas', {})).dados.conversa;
    const r = await enviarMensagem(c, conv.id, { texto: 'Gere um arquivo Word DOCX com título Aviso interno e um parágrafo. Sem capa, sem logotipo e sem texto adicional.' });
    assert.ok(r.fim && !r.falha);
    assert.equal(OR.chamadas.length, 1, 'Word sem capa não gera nem revisa um design de capa');
    assert.ok(!r.eventos.some(e => e.t === 'etapa' && e.v === 'Montando o visual…'));
    const a = r.fim.arquivos.find(a => a.nome.endsWith('.docx'));
    assert.ok(a);
    const d = await c.bin(`/api/conversas/${conv.id}/arquivos/${a.id}`);
    assert.equal(d.status, 200);
    assert.equal(d.dados.subarray(0, 2).toString(), 'PK');
  } finally { await S.fechar(); await OR.fechar(); }
});

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
    const sistema = JSON.stringify(OR.chamadas[0].messages[0].content);
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

test('registro explícito em criação é reforçado, e restrição negativa prevalece', () => {
  assert.ok(orientacaoDeEstilo('Faça um roast com gírias e palavrões.'));
  assert.ok(orientacaoDeEstilo('Roast me in Portuguese with more swear words.'));
  for (const t of ['Reescreva a brincadeira sem palavrões.', 'Roast me without swear words.', 'Faça um roast, não use palavrões.', 'Explique o significado de palavrão.', 'Faça um roast sem palavrões, com humor.']) assert.doesNotMatch(orientacaoDeEstilo(t), /Registro solicitado nesta criação/, t);
});

test('recuperação de briefing é limitada à peça comercial e preserva textos operacionais e citações', () => {
  assert.ok(precisaCorrigirBriefing('Escreva dois parágrafos para apresentar a empresa a um possível cliente.', 'A empresa organiza pedidos, sem prometer economia medida.'));
  for (const p of ['Escreva uma mensagem à equipe sobre as limitações do projeto.', 'Escreva com transparência as limitações para um possível cliente.', 'Copie exatamente este texto comercial.', 'Faça um roast.']) assert.equal(precisaCorrigirBriefing(p, 'Não prometemos economia.'), false);
});
test('peça com comentário de briefing tem uma recuperação pela mesma rota, com custo contabilizado', async () => {
  let i = 0;
  const textos = ['A Horizonte organiza pedidos.\n\nO Boreal confere informações, sem prometer economia medida.', 'A Horizonte organiza pedidos entre áreas com responsáveis e evidências.\n\nO Boreal confere informações e o Farol registra aprovações.'];
  const OR = await openRouterFalso({ responder: () => textos[Math.min(i++, 1)] });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const c = await S.cliente().entrar('ana@exemplo.com.br');
    const conv = (await c.post('/api/conversas', {})).dados.conversa;
    const r = await enviarMensagem(c, conv.id, { texto: 'Escreva dois parágrafos para apresentar a empresa Horizonte a um possível cliente. Boreal confere informações e Farol registra aprovações. Não há economia medida.' });
    assert.ok(r.fim && !r.falha); assert.equal(OR.chamadas.length, 2);
    assert.equal(OR.chamadas[1].model, OR.chamadas[0].model);
    assert.equal(r.eventos.find(e => e.t === 'substituir')?.v, textos[1]);
    assert.equal(um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).texto, textos[1]);
    assert.ok(um(S.app.db, 'select custo from uso where conversa_id = ?', conv.id).custo >= 0.002, 'as duas inferências entram no uso');
  } finally { await S.fechar(); await OR.fechar(); }
});

test('recuperação que não corrige o comentário não entra em loop', async () => {
  const ruim = 'A Horizonte organiza pedidos, sem prometer economia medida.';
  const OR = await openRouterFalso({ responder: () => ruim });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const c = await S.cliente().entrar('ana@exemplo.com.br');
    const conv = (await c.post('/api/conversas', {})).dados.conversa;
    const r = await enviarMensagem(c, conv.id, { texto: 'Escreva um texto comercial para um possível cliente sobre a Horizonte.' });
    assert.ok(r.fim && !r.falha); assert.equal(OR.chamadas.length, 2);
    assert.ok(!r.eventos.some(e => e.t === 'substituir'));
    assert.equal(um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).texto, ruim);
  } finally { await S.fechar(); await OR.fechar(); }
});

test('erros criativos identificáveis não se confundem com culinária nem tradução literal', () => {
  assert.equal(falhaCriativa('Faça um roast em português.', 'Seu pedido de assado está pronto.'), 'traducao_literal');
  assert.equal(falhaCriativa('Roast me.', 'Você tem uma síndrome muito específica.'), 'rotulo_psicologico');
  assert.equal(falhaCriativa('Traduza literalmente roast como assado.', 'Seu pedido de assado.'), null);
  assert.equal(falhaCriativa('Explique a receita de um roast.', 'Seu pedido de assado.'), null);
  assert.equal(falhaCriativa('Faça um roast.', 'Você trata cada slide como se precisasse de alvará para existir, porra.'), null);
});
test('falha criativa tem recuperação limitada que preserva a zoação e o contexto', async () => {
  let i = 0;
  const textos = ['Você pediu um pedido de assado. Sua síndrome é revisar slides.', 'No projeto Cedro, até o título precisa provar que não foi usado no slide anterior, porra.'];
  const OR = await openRouterFalso({ responder: () => textos[Math.min(i++, 1)] });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const c = await S.cliente().entrar('ana@exemplo.com.br');
    const conv = (await c.post('/api/conversas', {})).dados.conversa;
    const r = await enviarMensagem(c, conv.id, { texto: 'Faça um roast com palavrões sobre meu projeto fictício Cedro e as revisões de apresentações.' });
    assert.ok(r.fim && !r.falha); assert.equal(OR.chamadas.length, 2, JSON.stringify(OR.chamadas.map(x => ({ modelo: x.model, pedido: x.messages.filter(m => m.role === 'user').at(-1)?.content?.slice(0, 180) }))));
    assert.equal(OR.chamadas[1].model, OR.chamadas[0].model);
    assert.equal(r.eventos.find(e => e.t === 'substituir')?.v, textos[1]);
    assert.equal(r.fim.arquivos?.length || 0, 0, 'mencionar apresentações não gera arquivo');
    assert.doesNotMatch(JSON.stringify(OR.chamadas[0].messages[0].content), /A plataforma transforma a sua resposta em arquivo/);
    assert.equal(um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).texto, textos[1]);
    assert.ok(um(S.app.db, 'select custo from uso where conversa_id = ?', conv.id).custo >= 0.002);
  } finally { await S.fechar(); await OR.fechar(); }
});

test('criação sobre arquivos não encomenda arquivo; formato explicitamente pedido continua funcionando', () => {
  for (const p of ['Faça um roast sobre minhas apresentações.', 'Escreva uma sátira sobre final_final_v8.pptx.', 'Meu trabalho é revisar PPTX. Roast me.', 'Faça um roast, sem gerar PPTX.', 'Eu reviso apresentações e cobro a versão final em PPTX. Based on this, roast me.']) assert.equal(criacaoSemArquivo(p), true, p);
  for (const p of ['Crie um PowerPoint com um roast.', 'Escreva um poema e entregue em Word.', 'Faça um roast e gere um arquivo PPTX.', 'Gere um Excel com as despesas.']) assert.equal(criacaoSemArquivo(p), false, p);
});
