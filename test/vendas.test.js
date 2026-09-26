// Página de vendas: só na instalação do operador. Contato vira lead e email ao operador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';

let V, C;
before(async () => {
  V = await subir({ paginaInicial: 'vendas', adminEmail: 'suporte@operadora.com', operadores: ['suporte@operadora.com'] });
  C = await subir({});
});
after(async () => { await V.fechar(); await C.fechar(); });
const contato = (S, corpo, h = {}) => fetch(`${S.base}/api/contato`, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(corpo) });
const lead = { nome: 'Ana Souza', email: 'ana@cliente.com.br', empresa: 'Cliente Exemplo', pessoas: '51 a 200', mensagem: 'Queremos conhecer.' };

test('a raiz abre a página de vendas só com PAGINA_INICIAL=vendas', async () => {
  const v = await (await fetch(`${V.base}/`)).text();
  assert.match(v, /A infraestrutura de IA da sua empresa/);
  assert.match(v, /US\$ 750/);
  const c = await (await fetch(`${C.base}/`)).text();
  assert.doesNotMatch(c, /A infraestrutura de IA da sua empresa/);
  assert.equal((await fetch(`${C.base}/vendas.html`, { redirect: 'manual' })).status, 302);
  assert.equal((await contato(C, lead)).status, 404);
});

test('a página não promete o que não existe nem mostra custo de fornecedor', async () => {
  const v = await (await fetch(`${V.base}/`)).text();
  for (const proibido of [/\bSSO\b/, /\bSCIM\b/, /\bSLA\b/, /0,01/, /por token/i, /OpenRouter/]) assert.doesNotMatch(v, proibido);
  // Títulos sem ponto final.
  for (const [, t] of v.matchAll(/<h[123][^>]*>([^<]+)<\/h[123]>/g)) assert.doesNotMatch(t.trim(), /\.$/, t);
});

test('contato válido vira lead, evento e email; inválido e robô não', async () => {
  assert.equal((await contato(V, { ...lead, email: 'sem-arroba' })).status, 400);
  assert.equal((await contato(V, { ...lead, pessoas: 'muitas' })).status, 400);
  assert.equal((await contato(V, lead)).status, 200);
  assert.equal((await contato(V, { ...lead, site: 'http://spam' })).status, 200);
  const leads = V.app.db.prepare('select * from leads').all();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].empresa, 'Cliente Exemplo');
  assert.ok(V.app.email.enviados.some(m => m.para === 'suporte@operadora.com' && /contato de Cliente Exemplo/.test(m.assunto)));
  const op = await V.cliente().entrar('suporte@operadora.com');
  assert.equal((await op.get('/api/operador/leads')).dados.leads.length, 1);
});

test('limite de contatos por endereço', async () => {
  const h = { 'x-forwarded-for': '10.1.1.1' };
  for (let i = 0; i < 5; i++) assert.equal((await contato(V, lead, h)).status, 200);
  assert.equal((await contato(V, lead, h)).status, 429);
});
