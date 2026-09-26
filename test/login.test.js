import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';

let S;
before(async () => { S = await subir(); salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] }); });
after(() => S.fechar());

const ultimoCodigo = email => /(\d{6})/.exec(S.app.email.enviados.filter(m => m.para === email).at(-1).assunto)[1];

test('código por email: só domínio permitido; entra, recebe cookie HttpOnly e SameSite=Lax', async () => {
  const c = S.cliente();
  assert.equal((await c.post('/api/login/codigo', { email: 'alguem@outra.com' })).status, 403);
  assert.equal((await c.post('/api/login/codigo', { email: 'ana@exemplo.com.br' })).status, 200);
  const r = await c.post('/api/login/entrar', { email: 'ana@exemplo.com.br', codigo: ultimoCodigo('ana@exemplo.com.br') });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const eu = await c.get('/api/eu');
  assert.equal(eu.dados.pessoa.email, 'ana@exemplo.com.br');
  assert.equal(eu.dados.pessoa.papel, 'usuario');
});

test('cookie Secure quando a instalação usa HTTPS', async () => {
  const T = await subir({ cookieSeguro: true });
  const c = T.cliente();
  await c.post('/api/login/codigo', { email: 'admin@exemplo.com.br' });
  const codigo = /(\d{6})/.exec(T.app.email.enviados.at(-1).assunto)[1];
  const r = await c.post('/api/login/entrar', { email: 'admin@exemplo.com.br', codigo });
  assert.match(r.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  await T.fechar();
});

test('código errado conta tentativa; depois de 5, nem o certo entra; código vale uma vez só', async () => {
  const c = S.cliente();
  await c.post('/api/login/codigo', { email: 'bia@exemplo.com.br' });
  const certo = ultimoCodigo('bia@exemplo.com.br');
  const errado = certo === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/login/entrar', { email: 'bia@exemplo.com.br', codigo: errado })).status, 401);
  assert.equal((await c.post('/api/login/entrar', { email: 'bia@exemplo.com.br', codigo: certo })).status, 401);
  await c.post('/api/login/codigo', { email: 'bia@exemplo.com.br' });
  const novo = ultimoCodigo('bia@exemplo.com.br');
  assert.equal((await c.post('/api/login/entrar', { email: 'bia@exemplo.com.br', codigo: novo })).status, 200);
  assert.equal((await S.cliente().post('/api/login/entrar', { email: 'bia@exemplo.com.br', codigo: novo })).status, 401);
});

test('no máximo 3 códigos a cada 15 minutos; código vencido não entra', async () => {
  let agora = new Date('2026-09-26T10:00:00Z');
  const T = await subir({ agora: () => agora });
  const c = T.cliente();
  for (let i = 0; i < 3; i++) assert.equal((await c.post('/api/login/codigo', { email: 'admin@exemplo.com.br' })).status, 200);
  assert.equal((await c.post('/api/login/codigo', { email: 'admin@exemplo.com.br' })).status, 429);
  agora = new Date('2026-09-26T10:16:00Z');
  assert.equal((await c.post('/api/login/codigo', { email: 'admin@exemplo.com.br' })).status, 200);
  const codigo = /(\d{6})/.exec(T.app.email.enviados.at(-1).assunto)[1];
  agora = new Date('2026-09-26T10:27:00Z');
  assert.equal((await c.post('/api/login/entrar', { email: 'admin@exemplo.com.br', codigo })).status, 401);
  await T.fechar();
});

test('sem sessão: 401; escrita sem token CSRF ou com Origin de fora: 403', async () => {
  assert.equal((await S.cliente().get('/api/eu')).status, 401);
  const c = await S.cliente().entrar('carla@exemplo.com.br');
  const token = c.csrf;
  c.csrf = '';
  assert.equal((await c.post('/api/sair')).status, 403);
  c.csrf = 'token-errado';
  assert.equal((await c.post('/api/sair')).status, 403);
  c.csrf = token;
  assert.equal((await c.post('/api/sair', {}, { origin: 'https://ataque.exemplo' })).status, 403);
  assert.equal((await c.post('/api/sair')).status, 200);
  assert.equal((await c.get('/api/eu')).status, 401);
});

test('páginas saem com cabeçalhos de segurança e sem script de terceiros', async () => {
  for (const p of ['/', '/entrar', '/app', '/politica']) {
    const r = await fetch(S.base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    const html = await r.text();
    assert.ok(!/<script(?![^>]*src="\/)/.test(html), `${p}: só scripts do próprio servidor`);
  }
});
