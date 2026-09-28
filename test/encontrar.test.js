// "Encontre o seu ambiente": o link de entrada chega por email, e a resposta nunca revela
// se o email ou a empresa existem.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { RESPOSTA } from '../src/plataforma/encontrar.js';

let S, ops;
const doEmail = e => S.P.email.enviados.filter(m => m.para === e && /Seu acesso/.test(m.assunto));
before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  for (const [name, slug, status] of [['Alfa', 'alfa', 'ativa'], ['Beta', 'beta', 'ativa'], ['Gama', 'gama', 'suspensa'], ['Apy Mine', 'apy-mine', 'ativa']]) {
    const c = (await ops.post('/api/plataforma/empresas', { name, slug, plan_id: planos[0].id, admin_email: 'ana@grupo.com', status: 'ativa' })).dados;
    if (status !== 'ativa') await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status });
  }
});
after(() => S.fechar());

test('página: /encontrar abre no endereço da plataforma; /entrar sem empresa leva para lá', async () => {
  const v = S.navegador();
  const p = await v.get('/encontrar');
  assert.equal(p.status, 200);
  assert.match(p.dados, /Encontre o seu ambiente/);
  const e = await v.get('/entrar');
  assert.equal(e.status, 302);
  assert.equal(e.headers.get('location'), '/encontrar');
});

test('email com acesso recebe os links das empresas disponíveis; suspensa fica de fora', async () => {
  const r = await S.navegador().post('/api/encontrar', { email: 'Ana@Grupo.com' }, { 'x-forwarded-for': '10.2.0.1' });
  assert.equal(r.status, 200);
  assert.equal(r.dados.mensagem, RESPOSTA);
  const [m] = doEmail('ana@grupo.com');
  assert.ok(m, 'email enviado');
  assert.match(m.texto, /Alfa: http:\/\/plataforma\.teste\/alfa\/entrar/);
  assert.match(m.texto, /Beta: http:\/\/plataforma\.teste\/beta\/entrar/);
  assert.doesNotMatch(m.texto, /gama/i);
});

test('email sem acesso: mesma resposta, nenhum email enviado', async () => {
  const antes = S.P.email.enviados.length;
  const r = await S.navegador().post('/api/encontrar', { email: 'ninguem@fora.com' }, { 'x-forwarded-for': '10.2.0.2' });
  assert.equal(r.status, 200);
  assert.equal(r.dados.mensagem, RESPOSTA);
  assert.equal(S.P.email.enviados.length, antes);
  assert.equal((await S.navegador().post('/api/encontrar', { email: 'invalido' }, { 'x-forwarded-for': '10.2.0.2' })).status, 400);
});

test('limites: no máximo 3 emails por hora para o mesmo endereço, e 10 pedidos por IP', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await S.navegador().post('/api/encontrar', { email: 'ana@grupo.com' }, { 'x-forwarded-for': `10.3.0.${i}` })).status, 200);
  assert.equal(doEmail('ana@grupo.com').length, 3);   // 1 do teste anterior + 2; o resto é ignorado em silêncio
  const h = { 'x-forwarded-for': '10.4.0.1' };
  for (let i = 0; i < 10; i++) assert.equal((await S.navegador().post('/api/encontrar', { email: `p${i}@fora.com` }, h)).status, 200);
  assert.equal((await S.navegador().post('/api/encontrar', { email: 'x@fora.com' }, h)).status, 429);
});

test('domínio próprio entra no link só depois de verificado', async () => {
  const { linkDeEntrada } = await import('../src/plataforma/encontrar.js');
  const c = { slug: 'alfa', custom_domain: 'ia.alfa.com.br', domain_status: 'pendente' };
  assert.equal(linkDeEntrada(S.P, c, 'http://x'), 'http://plataforma.teste/alfa/entrar');
  assert.equal(linkDeEntrada(S.P, { ...c, domain_status: 'verificado' }, 'http://x'), 'https://ia.alfa.com.br/entrar');
});

test('administrador da plataforma recebe o link do console', async () => {
  const r = await S.navegador().post('/api/encontrar', { email: 'ops@theneil.com.br' }, { 'x-forwarded-for': '10.5.0.1' });
  assert.equal(r.status, 200);
  const m = S.P.email.enviados.filter(x => x.para === 'ops@theneil.com.br' && /Seu acesso/.test(x.assunto)).at(-1);
  assert.ok(m, 'email enviado');
  assert.match(m.texto, /Console da plataforma: http:\/\/plataforma\.teste\/plataforma/);
});

test('endereço de empresa inexistente: página da marca com o caminho para encontrar; sem hífen leva ao endereço certo', async () => {
  const v = S.navegador();
  const r = await v.get('/empresa-que-nao-existe');
  assert.equal(r.status, 404);
  assert.match(r.dados, /Não encontramos este endereço/);
  assert.match(r.dados, /href="\/encontrar"/);
  assert.doesNotMatch(r.dados, /alfa|beta|apy/i, 'não revela quais empresas existem');
  // Digitado sem o hífen (ou com hífen a mais): uma só empresa corresponde → redireciona.
  const sem = await v.get('/apymine');
  assert.equal(sem.status, 301);
  assert.equal(sem.headers.get('location'), '/apy-mine');
  const app = await v.get('/apymine/entrar');
  assert.equal(app.headers.get('location'), '/apy-mine/entrar');
});
