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
  assert.match(v, /IA para a empresa inteira, com regras, sigilo e custo sob controle/);
  const c = await (await fetch(`${C.base}/`)).text();
  assert.doesNotMatch(c, /IA para a empresa inteira, com regras, sigilo e custo sob controle/);
  assert.equal((await fetch(`${C.base}/vendas.html`, { redirect: 'manual' })).status, 302);
  assert.equal((await contato(C, lead)).status, 404);
});

test('a página não promete o que não existe nem mostra custo de fornecedor', async () => {
  const v = await (await fetch(`${V.base}/`)).text();
  // Venda consultiva: sem preço, sem plano com valor e sem cadastro autônomo; o CTA principal é a apresentação.
  assert.doesNotMatch(v, /US\$|R\$|por mês<\/span>|data-plano|Criar conta|Cadastre-se|Teste grátis/i);
  assert.match(v, /href="#contato">Agendar apresentação</);
  // Prumo Discovery: convite, nunca requisito.
  assert.match(v, /href="https:\/\/theneil\.com\.br\/prumo-discovery-lp\.html"/);
  assert.match(v, /A GreenIA funciona com ou sem o Prumo/);
  assert.doesNotMatch(v, /(?:exige|requer|precisa d[eo]|obrigat[óo]ri\w*|só funciona com)[^.<]{0,40}Prumo|Prumo[^.<]{0,40}(?:obrigat[óo]ri|exigid|requisito)/i);
  for (const proibido of [/\bSSO\b/, /\bSCIM\b/, /\bSLA\b/, /0,01/, /por token/i, /OpenRouter/]) assert.doesNotMatch(v, proibido);
  // Títulos sem ponto final.
  for (const [, t] of v.matchAll(/<h[123][^>]*>([^<]+)<\/h[123]>/g)) assert.doesNotMatch(t.trim(), /\.$/, t);
});

test('a página da empresa orienta o uso e segue as mesmas regras de texto', async () => {
  const c = await (await fetch(`${C.base}/`)).text();
  assert.match(c, /IA para o trabalho, com as regras da casa/);
  assert.match(c, /href="\/entrar"/);
  assert.doesNotMatch(c, /US\$|créditos/);   // quem usa não vê plano nem preço
  for (const [, t] of c.matchAll(/<h[123][^>]*>([^<]+)<\/h[123]>/g)) assert.doesNotMatch(t.trim(), /\.$/, t);
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
