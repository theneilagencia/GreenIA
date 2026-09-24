import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp } from './app-helpers.ts';
import { MemoryEmailSender } from '../src/email/sender.ts';
import { startMockIdp, type MockIdp } from './mock-oidc.ts';

let db: TestDb;
let app: FastifyInstance;
let idp: MockIdp;
const email = new MemoryEmailSender();
const ORIGIN = 'https://greenia.test';
let entraId = '';
let googleId = '';
let tenantId = '';

before(async () => {
  db = await createTestDb();
  idp = await startMockIdp();
  process.env.OIDC_TESTE_SECRET = idp.clientSecret;
  const t = await seedTenant(db.owner, 'repet', { email: 'ana@repet.com.br', domain: 'repet.com.br' });
  tenantId = t.tenantId;
  await seedTenant(db.owner, 'outro', { email: 'bia@outro.com.br', domain: 'outro.com.br' });
  await db.owner.query(`insert into auth_providers (tenant_id, kind, label) values ($1, 'email_code', 'Código por email')`, [t.tenantId]);
  entraId = (await db.owner.query(`insert into auth_providers (tenant_id, kind, label, config) values ($1, 'entra', 'Microsoft', $2) returning id`,
    [t.tenantId, { issuer: idp.issuer, clientId: idp.clientId, clientSecretEnv: 'OIDC_TESTE_SECRET', tenantId: 'tid-repet', allowInsecure: true }])).rows[0].id;
  googleId = (await db.owner.query(`insert into auth_providers (tenant_id, kind, label, config) values ($1, 'google', 'Google', $2) returning id`,
    [t.tenantId, { issuer: idp.issuer, clientId: idp.clientId, clientSecretEnv: 'OIDC_TESTE_SECRET', hostedDomain: 'repet.com.br', allowInsecure: true }])).rows[0].id;
  app = await buildTestApp(db, { email });
});
after(async () => { await app?.close(); await idp?.close(); await db?.drop(); });

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: { origin: ORIGIN, ...headers } });
const cookieFrom = (r: { headers: Record<string, unknown> }) => String([r.headers['set-cookie']].flat()[0] || '');
const cookiePair = (setCookie: string) => setCookie.split(';')[0];
const lastCode = () => email.sent.at(-1)?.text.match(/\b(\d{6})\b/)?.[1] || '';

async function emailLogin(addr: string) {
  await post('/api/auth/email/start?tenant=repet', { email: addr });
  const r = await post('/api/auth/email/verify?tenant=repet', { email: addr, code: lastCode() });
  return { r, cookie: cookiePair(cookieFrom(r)), csrf: r.json().csrfToken as string };
}

// ---- Código por email ----------------------------------------------------------------

test('código por email: envia, confere e cria sessão com cookie seguro', async () => {
  const s = await post('/api/auth/email/start?tenant=repet', { email: 'Ana@Repet.com.br' });
  assert.equal(s.statusCode, 202);
  assert.equal(email.sent.at(-1)?.to, 'ana@repet.com.br');
  const code = lastCode();
  assert.match(code, /^\d{6}$/);
  const v = await post('/api/auth/email/verify?tenant=repet', { email: 'ana@repet.com.br', code });
  assert.equal(v.statusCode, 200);
  const sc = cookieFrom(v);
  assert.match(sc, /^__Host-gia_session=/);
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(sc.includes(attr), `cookie sem ${attr}: ${sc}`);
  const me = await app.inject({ url: '/api/session', headers: { cookie: cookiePair(sc) } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, 'ana@repet.com.br');
  assert.ok(me.json().csrfToken);
});

test('código errado não entra; após 5 tentativas nem o certo entra', async () => {
  await post('/api/auth/email/start?tenant=repet', { email: 'caio@repet.com.br' });
  const code = lastCode();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    assert.equal((await post('/api/auth/email/verify?tenant=repet', { email: 'caio@repet.com.br', code: wrong })).statusCode, 401);
  }
  assert.equal((await post('/api/auth/email/verify?tenant=repet', { email: 'caio@repet.com.br', code })).statusCode, 401);
});

test('domínio fora do tenant: resposta igual (202), mas nenhum email sai', async () => {
  const before = email.sent.length;
  const r = await post('/api/auth/email/start?tenant=repet', { email: 'alguem@gmail.com' });
  assert.equal(r.statusCode, 202);
  assert.equal(email.sent.length, before);
});

test('código de um tenant não entra em outro tenant', async () => {
  await post('/api/auth/email/start?tenant=repet', { email: 'duda@repet.com.br' });
  const r = await post('/api/auth/email/verify?tenant=outro', { email: 'duda@repet.com.br', code: lastCode() });
  assert.equal(r.statusCode, 401);
});

test('no máximo 3 códigos a cada 15 minutos por email', async () => {
  const before = email.sent.length;
  for (let i = 0; i < 5; i++) await post('/api/auth/email/start?tenant=repet', { email: 'eva@repet.com.br' });
  assert.equal(email.sent.length - before, 3);
});

// ---- Proteção de escrita ------------------------------------------------------------------

test('escrita sem Origin ou com Origin de fora é recusada', async () => {
  const none = await app.inject({ method: 'POST', url: '/api/auth/email/start?tenant=repet', payload: { email: 'ana@repet.com.br' } });
  assert.equal(none.statusCode, 403);
  const evil = await post('/api/auth/email/start?tenant=repet', { email: 'ana@repet.com.br' }, { origin: 'https://site-malicioso.example' });
  assert.equal(evil.statusCode, 403);
});

test('logout exige o token CSRF da sessão', async () => {
  const { cookie, csrf } = await emailLogin('fabio@repet.com.br');
  assert.equal((await post('/api/auth/logout', {}, { cookie })).statusCode, 403);
  assert.equal((await post('/api/auth/logout', {}, { cookie, 'x-csrf-token': 'errado' })).statusCode, 403);
  const ok = await post('/api/auth/logout', {}, { cookie, 'x-csrf-token': csrf });
  assert.equal(ok.statusCode, 200);
  assert.equal((await app.inject({ url: '/api/session', headers: { cookie } })).statusCode, 401);
});

test('sem cookie ou com cookie inventado: 401', async () => {
  assert.equal((await app.inject({ url: '/api/session' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/session', headers: { cookie: '__Host-gia_session=inventado' } })).statusCode, 401);
});

test('sessão expirada: 401', async () => {
  const { cookie } = await emailLogin('gil@repet.com.br');
  await db.owner.query(`update sessions set expires_at = now() - interval '1 minute' where user_id = (select id from users where email = 'gil@repet.com.br')`);
  assert.equal((await app.inject({ url: '/api/session', headers: { cookie } })).statusCode, 401);
});

// ---- OIDC ---------------------------------------------------------------------------------

async function oidcStart(providerId: string) {
  const r = await app.inject({ url: `/api/auth/oidc/${providerId}/start?tenant=repet&returnTo=/chat`, headers: { host: 'greenia.test' } });
  assert.equal(r.statusCode, 302);
  const loc = new URL(String(r.headers.location));
  assert.ok(loc.href.startsWith(idp.issuer + '/authorize'));
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  return loc.searchParams;
}

const callback = (params: URLSearchParams, code: string, state = params.get('state')!) =>
  app.inject({ url: `/api/auth/oidc/callback?code=${code}&state=${state}`, headers: { host: 'greenia.test' } });

test('Entra ID: diretório certo cria sessão e volta para o returnTo', async () => {
  const p = await oidcStart(entraId);
  const code = idp.issueCode(p, { tid: 'tid-repet', email: 'helena@repet.com.br', name: 'Helena' });
  const r = await callback(p, code);
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/chat');
  const me = await app.inject({ url: '/api/session', headers: { cookie: cookiePair(cookieFrom(r)) } });
  assert.equal(me.json().user.email, 'helena@repet.com.br');
});

test('Entra ID: outro diretório (tid) é negado e auditado', async () => {
  const p = await oidcStart(entraId);
  const r = await callback(p, idp.issueCode(p, { tid: 'tid-de-outra-empresa', email: 'ivo@repet.com.br' }));
  assert.equal(r.statusCode, 403);
  const a = await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'login_negado' order by id desc limit 1`, [tenantId]);
  assert.equal(a.rows[0].details.reason, 'diretorio_ou_dominio_diferente');
});

test('Entra ID: email de domínio não permitido é negado', async () => {
  const p = await oidcStart(entraId);
  const r = await callback(p, idp.issueCode(p, { tid: 'tid-repet', email: 'joao@gmail.com' }));
  assert.equal(r.statusCode, 403);
});

test('token com nonce trocado ou audiência de outro cliente é recusado', async () => {
  let p = await oidcStart(entraId);
  assert.equal((await callback(p, idp.issueCode(p, { tid: 'tid-repet', email: 'kai@repet.com.br' }, { nonce: 'outro' }))).statusCode, 403);
  p = await oidcStart(entraId);
  assert.equal((await callback(p, idp.issueCode(p, { tid: 'tid-repet', email: 'kai@repet.com.br' }, { aud: 'outro-app' }))).statusCode, 403);
});

test('state reaproveitado não funciona (fluxo é de uso único)', async () => {
  const p = await oidcStart(entraId);
  assert.equal((await callback(p, idp.issueCode(p, { tid: 'tid-repet', email: 'lia@repet.com.br' }))).statusCode, 302);
  assert.equal((await callback(p, idp.issueCode(p, { tid: 'tid-repet', email: 'lia@repet.com.br' }))).statusCode, 400);
});

test('Google: domínio (hd) diferente ou email não verificado é negado', async () => {
  let p = await oidcStart(googleId);
  assert.equal((await callback(p, idp.issueCode(p, { hd: 'outro.com.br', email: 'mia@repet.com.br', email_verified: true }))).statusCode, 403);
  p = await oidcStart(googleId);
  assert.equal((await callback(p, idp.issueCode(p, { hd: 'repet.com.br', email: 'mia@repet.com.br', email_verified: false }))).statusCode, 403);
  p = await oidcStart(googleId);
  assert.equal((await callback(p, idp.issueCode(p, { hd: 'repet.com.br', email: 'mia@repet.com.br', email_verified: true }))).statusCode, 302);
});

test('returnTo externo é trocado por "/" (sem redirecionamento aberto)', async () => {
  const r = await app.inject({ url: `/api/auth/oidc/${entraId}/start?tenant=repet&returnTo=//site-malicioso.example`, headers: { host: 'greenia.test' } });
  const p = new URL(String(r.headers.location)).searchParams;
  const cb = await callback(p, idp.issueCode(p, { tid: 'tid-repet', email: 'nina@repet.com.br' }));
  assert.equal(cb.headers.location, '/');
});

test('provedor de outro tenant não é aceito', async () => {
  const r = await app.inject({ url: `/api/auth/oidc/${entraId}/start?tenant=outro`, headers: { host: 'greenia.test' } });
  assert.equal(r.statusCode, 404);
});
