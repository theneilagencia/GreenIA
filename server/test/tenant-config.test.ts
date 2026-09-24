import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp } from './app-helpers.ts';
import { parseTenantConfig, deriveTheme, tenantConfigSchema } from '../src/tenants/config.ts';
import { contrast } from '../../lib/contrast.mjs';
import type { FastifyInstance } from 'fastify';

let db: TestDb;
let app: FastifyInstance;

before(async () => {
  db = await createTestDb();
  const t = await seedTenant(db.owner, 'repet');
  await db.owner.query(`update tenants set config = $1 where id = $2`, [
    { branding: { orgName: 'Repet', colors: { primary: '#2E9E6A' } }, texts: { tagline: 'A IA do dia a dia da Repet' }, policyUrl: 'https://repet.example/politica' },
    t.tenantId,
  ]);
  await db.owner.query(`insert into auth_providers (tenant_id, kind, label, config) values ($1, 'entra', 'Entrar com Microsoft', $2)`,
    [t.tenantId, { issuer: 'https://login.microsoftonline.com/x/v2.0', clientId: 'abc', clientSecretEnv: 'OIDC_REPET_SECRET' }]);
  await db.owner.query(`insert into tenant_hosts (host, tenant_id) values ('repet.greenia.local', $1)`, [t.tenantId]);
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

test('configuração vazia recebe os padrões do protótipo', () => {
  const c = tenantConfigSchema.parse({});
  assert.equal(c.texts.tagline, 'A IA do dia a dia do Grupo');
  assert.equal(c.branding.colors.primary, '#1F8A5B');
  assert.equal(c.dataPolicy.cpf, 'bloquear');
  assert.equal(c.dataPolicy.email, 'avisar');
});

test('cor inválida e ação desconhecida são recusadas', () => {
  assert.throws(() => tenantConfigSchema.parse({ branding: { colors: { primary: 'verde' } } }));
  assert.throws(() => tenantConfigSchema.parse({ dataPolicy: { cpf: 'talvez' } }));
});

test('tema das cores padrão gera as mesmas variantes do 1B.4', () => {
  const { theme } = parseTenantConfig({});
  assert.equal(theme.tokens['--gia-forest-text'], '#19704A');
});

test('cor de marca clara demais ganha variante de texto com 4,5:1 ou mais em todos os fundos', () => {
  const colors = tenantConfigSchema.parse({ branding: { colors: { primary: '#5BD18F', onPrimary: '#FFFFFF' } } }).branding.colors;
  const theme = deriveTheme(colors);
  const text = theme.tokens['--gia-forest-text'];
  for (const bg of [colors.background, colors.surface, colors.sand, colors.mint, colors.line, '#FFFFFF']) {
    assert.ok(contrast(text, bg) >= 4.5, `${text} sobre ${bg}`);
  }
  assert.ok(contrast('#FFFFFF', theme.tokens['--gia-forest-strong']) >= 4.5);
  assert.ok(theme.adjustments.length >= 2);
});

test('GET /api/tenant/config devolve marca e textos do tenant, sem segredo', async () => {
  const r = await app.inject({ url: '/api/tenant/config?tenant=repet' });
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.equal(body.texts.tagline, 'A IA do dia a dia da Repet');
  assert.equal(body.branding.orgName, 'Repet');
  assert.equal(body.policyUrl, 'https://repet.example/politica');
  assert.deepEqual(body.providers.map((p: { kind: string }) => p.kind), ['entra']);
  const raw = r.body;
  assert.ok(!raw.includes('clientSecretEnv') && !raw.includes('OIDC_REPET_SECRET') && !raw.includes('clientId'), 'vazou configuração do provedor');
});

test('tenant resolvido pelo host', async () => {
  const r = await app.inject({ url: '/api/tenant/config', headers: { host: 'repet.greenia.local' } });
  assert.equal(r.json().tenant.slug, 'repet');
});

test('tenant desconhecido ou suspenso: 404', async () => {
  assert.equal((await app.inject({ url: '/api/tenant/config?tenant=nao-existe' })).statusCode, 404);
  await db.owner.query(`update tenants set status = 'suspenso' where slug = 'repet'`);
  assert.equal((await app.inject({ url: '/api/tenant/config?tenant=repet' })).statusCode, 404);
  await db.owner.query(`update tenants set status = 'ativo' where slug = 'repet'`);
});
