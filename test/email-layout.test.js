// Emails formatados: cartão da GreenIA (logo, rótulo, título, texto, botão ou código) junto do texto puro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlDoEmail } from '../src/email-layout.js';
import { criarEmail } from '../src/email.js';

test('convite: título do assunto, link no texto e botão de ação na cor da marca; texto escapado', () => {
  const h = htmlDoEmail({ assunto: 'Convite para a GreenIA da <Apy Mine>', texto: 'Para entrar, acesse https://www.greenia.com.br/apy-mine e use este email (a@b.com).' });
  assert.match(h, /<h1[^>]*>Convite para a GreenIA da &lt;Apy Mine&gt;<\/h1>/);
  assert.match(h, /<a href="https:\/\/www\.greenia\.com\.br\/apy-mine" style="display:inline-block[^"]*background|<td style="background:#1B7950[^>]*><a href="https:\/\/www\.greenia\.com\.br\/apy-mine"[^>]*>Aceitar o convite<\/a>/);
  assert.match(h, /src="https:\/\/www\.greenia\.com\.br\/assets\/greenia-email\.png"/);
  assert.match(h, /Green<span style="color:#17764D">IA<\/span>/);
  assert.doesNotMatch(h, /<Apy Mine>/);
});

test('código de acesso: em destaque, sem botão, e sem repetir o número no parágrafo', () => {
  const h = htmlDoEmail({ assunto: 'Seu código de acesso à GreenIA: 635803', texto: 'Seu código de acesso é 635803.\n\nEle vale por 10 minutos.' });
  assert.match(h, /<h1[^>]*>Seu código de acesso à GreenIA<\/h1>/);
  assert.equal((h.match(/635803/g) || []).length, 2);   // caixa do código + prévia oculta da caixa de entrada
  assert.match(h, /Use este código para entrar:/);
  assert.doesNotMatch(h, /Abrir a GreenIA<\/a>/);
});

test('envio: o texto puro continua e o HTML vai junto (Resend)', async () => {
  const pedidos = [];
  const e = criarEmail({ lerSmtp: () => ({ url: 'resend://chave', remetente: 'GreenIA <oi@x.com>' }), log: () => {}, fetch: async (u, o) => { pedidos.push(JSON.parse(o.body)); return new Response('{"id":"1"}', { status: 200 }); } });
  await e.enviar('a@b.com', 'Teste de email da GreenIA', 'Se você recebeu esta mensagem, o envio está funcionando.');
  assert.equal(pedidos[0].text, 'Se você recebeu esta mensagem, o envio está funcionando.');
  assert.match(pedidos[0].html, /^<!doctype html>/);
  assert.match(pedidos[0].html, /Teste de email da GreenIA<\/h1>/);
});
