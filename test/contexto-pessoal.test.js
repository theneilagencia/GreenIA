import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig, lerConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { contextoPessoal, pedeContextoPessoal } from '../src/contexto-pessoal.js';

test('contexto pessoal exige pedido explícito e respeita a negativa', () => {
  for (const p of ['Based on everything you know about me, roast me.', 'Com base em tudo o que você sabe sobre mim, faça uma apresentação.', 'Use minhas conversas anteriores para descrever meu trabalho.']) assert.equal(pedeContextoPessoal(p), true, p);
  for (const p of ['Olá, crie um texto.', 'O que sabe sobre a empresa?', 'Não use meu histórico. Based on everything you know about me, roast me.', 'Ignore minhas conversas anteriores. Use somente esta mensagem.']) assert.equal(pedeContextoPessoal(p), false, p);
});

test('recuperação na API: só o próprio usuário; exclui IA, anexos, sigilo, dados e retenção vencida', async () => {
  const OR = await openRouterFalso({ responder: () => 'Resposta de teste.' });
  const S = await subir({ ia: OR.ia });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const ana = await S.cliente().entrar('ana@exemplo.com.br'), bia = await S.cliente().entrar('bia@exemplo.com.br');
    const criar = async c => (await c.post('/api/conversas', {})).dados.conversa;
    const origem = await criar(ana);
    await enviarMensagem(ana, origem.id, { texto: 'Sou fundadora da Horizonte e meu produto se chama Boreal.' });
    exec(S.app.db, "update mensagens set texto='FatoInventadoPelaIA' where conversa_id=? and papel='assistant'", origem.id);
    const segredo = await criar(bia);
    await enviarMensagem(bia, segredo.id, { texto: 'Meu projeto privado se chama ProjetoDaBia.' });
    const inserir = async (t, atributos = {}) => {
      const c = await criar(ana);
      exec(S.app.db, "insert into mensagens(conversa_id,papel,texto,criado_em) values (?,'user',?,?)", c.id, t, atributos.data || S.app.agora().toISOString());
      if (atributos.sigilosa) exec(S.app.db, 'update conversas set sigilosa=1 where id=?', c.id);
      if (atributos.mascarada) exec(S.app.db, 'update conversas set mascarada=1 where id=?', c.id);
      if (atributos.teste) exec(S.app.db, 'update conversas set teste=1 where id=?', c.id);
      return c;
    };
    await inserir('MaterialDaConversaSigilosa', { sigilosa: true });
    await inserir('MaterialDaConversaMascarada', { mascarada: true });
    await inserir('MaterialDeTesteFicticio', { teste: true });
    await inserir('MaterialForaDaRetencao', { data: '2000-01-01T00:00:00Z' });
    await inserir('DadoRestrito: CPF 123.456.789-09');
    await inserir('password: XyTeste123456!');
    const mid = um(S.app.db, "select id from mensagens where conversa_id=? and papel='user'", origem.id).id;
    exec(S.app.db, "insert into anexos(conversa_id,mensagem_id,nome,texto) values (?,?,'interno.txt','ConteudoDoAnexoPrivado')", origem.id, mid);
    const destino = await criar(ana);
    await enviarMensagem(ana, destino.id, { texto: 'Based on everything you know about me, roast me.' });
    const payload = JSON.stringify(OR.chamadas.at(-1).messages);
    assert.match(payload, /Horizonte.*Boreal/);
    assert.match(payload, /amostra limitada/);
    for (const fora of ['FatoInventadoPelaIA', 'ProjetoDaBia', 'MaterialDaConversaSigilosa', 'MaterialDaConversaMascarada', 'MaterialDeTesteFicticio', 'MaterialForaDaRetencao', 'DadoRestrito', 'XyTeste123456', 'ConteudoDoAnexoPrivado']) assert.ok(!payload.includes(fora), fora);
    const simples = await criar(ana);
    await enviarMensagem(ana, simples.id, { texto: 'Escreva uma piada curta.' });
    assert.doesNotMatch(JSON.stringify(OR.chamadas.at(-1).messages), /Horizonte|Boreal|Contexto pessoal solicitado/);
    salvarConfig(S.app.db, { retencaoDias: 0 });
    assert.equal(contextoPessoal(S.app, ana.pessoa, simples, 'Use meu histórico.', lerConfig(S.app.db)), null);
  } finally { await S.fechar(); await OR.fechar(); }
});
