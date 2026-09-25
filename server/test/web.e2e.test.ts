// Frontend em modo backend, de ponta a ponta: servidor real (banco de teste,
// provedor simulado) entregando o .dc.html, e um navegador de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryEmailSender } from '../src/email/sender.ts';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright') as typeof import('playwright');

let db: TestDb;
let app: FastifyInstance;
let base = '';
let browser: import('playwright').Browser;
const fake = new FakeProvider();
const email = new MemoryEmailSender();

before(async () => {
  db = await createTestDb();
  const t = await seedTenant(db.owner, 'repet', { email: 'ana@repet.com.br', domain: 'repet.com.br' });
  await db.owner.query(`update tenants set config = $1 where id = $2`, [{
    branding: { orgName: 'Repet', colors: { primary: '#2E7D5B' } },
    texts: { tagline: 'A IA do dia a dia da Repet' },
    keyUserContact: 'Bruno · bruno@repet.com.br',
  }, t.tenantId]);
  await db.owner.query(`insert into auth_providers (tenant_id, kind, label) values ($1, 'email_code', 'Código por email')`, [t.tenantId]);
  await db.owner.query(`insert into kb_documents (tenant_id, title, current_version) values ($1, 'Reembolso de despesas', 1)`, [t.tenantId]);
  const doc = (await db.owner.query(`select id from kb_documents where tenant_id = $1`, [t.tenantId])).rows[0].id;
  await db.owner.query(`insert into kb_chunks (tenant_id, document_id, version, ord, title, text, search_terms) values ($1, $2, 1, 0, 'Reembolso de despesas', 'O limite de refeição em viagem nacional é de R$ 90 por dia.', 'reembolso despesa limite refeicao viagem nacional 90 dia')`, [t.tenantId, doc]);
  app = await buildTestApp(db, { fake, email }, { COOKIE_SECURE: 'false' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
  (app.deps.config as { PUBLIC_URL: string }).PUBLIC_URL = base; // origem permitida para escrita
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); await app?.close(); await db?.drop(); });

async function openApp() {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // Se o frontend tentasse o fallback do Claude Design, este contador acusaria.
  await page.addInitScript(() => { (window as any).__claudeCalls = 0; (window as any).claude = { complete: async () => { (window as any).__claudeCalls++; return 'NAO DEVIA'; } }; });
  await page.goto(base + '/GreenIA.dc.html?tenant=repet');
  return { page, errors };
}

// Cada email recebe no máximo 3 códigos a cada 15 minutos: os testes usam emails diferentes.
async function login(page: import('playwright').Page, addr = 'ana@repet.com.br') {
  await page.getByRole('button', { name: 'Entrar no chat' }).first().click();
  await page.getByLabel('Email corporativo').fill(addr);
  await page.getByRole('button', { name: 'Receber código por email' }).click();
  await page.getByLabel(/Código de 6 dígitos/).waitFor();
  const code = email.sent.at(-1)!.text.match(/\b(\d{6})\b/)![1];
  await page.getByLabel(/Código de 6 dígitos/).fill(code);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Mensagem').waitFor();
  // Primeiro acesso: roteiro (testado à parte); aqui é pulado.
  const tour = page.getByRole('dialog', { name: 'Boas-vindas à GreenIA' });
  if (await tour.isVisible().catch(() => false) || await tour.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    // O roteiro pode fechar sozinho enquanto a página troca de diálogo (ex.: a Política de Uso entra por cima).
    await page.getByRole('button', { name: 'Pular' }).click({ timeout: 5000 }).catch(async e => { if (await tour.isVisible().catch(() => false)) throw e; });
  }
}

const bubbles = (page: import('playwright').Page) => page.locator('.gia-msgs > div > :not(.gia-sr)');

test('servidor entrega a página com React local, CSP e config do modo backend', async () => {
  const r = await fetch(base + '/GreenIA.dc.html');
  const html = await r.text();
  assert.match(html, /<script src="\/greenia-config.js"><\/script><script src="\/vendor\/react.production.min.js">/);
  assert.match(r.headers.get('content-security-policy') || '', /script-src 'self' 'unsafe-eval'/);
  assert.equal((await fetch(base + '/vendor/react.production.min.js')).status, 200);
  assert.equal((await fetch(base + '/server/src/config.ts')).status, 404);
  assert.equal((await fetch(base + '/..%2Fpackage.json')).status, 404);
});

test('landing com textos e cores do tenant', async () => {
  const { page, errors } = await openApp();
  await page.getByText('A IA do dia a dia da Repet').first().waitFor();
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gia-forest').trim());
  assert.equal(primary, '#2E7D5B');
  assert.deepEqual(errors, []);
  await page.close();
});

test('login por código, chat com streaming e fontes da base', async () => {
  const { page, errors } = await openApp();
  await login(page);
  await page.getByText('ana@repet.com.br').waitFor();
  fake.reply = () => 'O limite é de R$ 90 por dia, conforme a política de reembolso.';
  await page.getByLabel('Mensagem').fill('qual o limite de refeição em viagem?');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText('O limite é de R$ 90 por dia').waitFor({ timeout: 5000 });
  await page.getByText('Reembolso de despesas').waitFor();
  assert.match(fake.requests.at(-1)!.messages[0].content, /R\$ 90 por dia/);
  assert.equal(await page.evaluate(() => (window as any).__claudeCalls), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test('a decisão é do servidor: com o filtro do navegador permissivo, CPF volta bloqueado (422)', async () => {
  const { page } = await openApp();
  // Faz o navegador achar que tudo é permitido: só o servidor pode barrar.
  await page.route(/\/api\/tenant\/config/, async r => {
    const res = await r.fetch();
    const body = await res.json();
    for (const k of Object.keys(body.dataPolicy)) body.dataPolicy[k] = 'permitir';
    await r.fulfill({ response: res, json: body });
  });
  await page.reload();
  await login(page);
  const calls = fake.requests.length;
  await page.getByLabel('Mensagem').fill('Confere o CPF 529.982.247-25');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText(/Parece que o texto tem CPF/).waitFor({ timeout: 5000 });
  assert.equal(fake.requests.length, calls, 'o modelo não pode ser chamado');
  assert.equal(await page.getByLabel('Mensagem').inputValue(), 'Confere o CPF 529.982.247-25', 'texto volta para o campo');
  // Aviso vindo do servidor (409): confirmar reenvia com o tipo confirmado.
  await page.getByLabel('Mensagem').fill('Escreva para bruno@repet.com.br');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText(/Seu texto parece conter email/).waitFor({ timeout: 5000 });
  fake.reply = () => 'Rascunho pronto.';
  await page.getByRole('button', { name: 'Enviar mesmo assim' }).click();
  await bubbles(page).getByText('Rascunho pronto.').waitFor({ timeout: 5000 });
  await page.close();
});

test('chat com assistente de conversa: base vinculada fora do alcance aparece como aviso na resposta', async () => {
  const q = async (sql: string, p: unknown[] = []) => (await db.owner.query(sql, p)).rows;
  const [{ id: tid }] = await q(`select id from tenants where slug = 'repet'`);
  const [{ id: pessoas }] = await q(`insert into areas (tenant_id, slug, name) values ($1, 'pessoas', 'Pessoas') returning id`, [tid]);
  const [{ id: comercial }] = await q(`insert into areas (tenant_id, slug, name) values ($1, 'comercial', 'Comercial') returning id`, [tid]);
  const [{ id: uid }] = await q(`insert into users (tenant_id, email) values ($1, 'vendas@repet.com.br') returning id`, [tid]);
  await q(`insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, 'usuario')`, [tid, uid, comercial]);
  const [{ id: doc }] = await q(`insert into kb_documents (tenant_id, area_id, title, current_version) values ($1, $2, 'Tabela salarial', 1) returning id`, [tid, pessoas]);
  await q(`insert into kb_chunks (tenant_id, document_id, version, ord, title, text, search_terms) values ($1, $2, 1, 0, 'Tabela salarial', 'Analista pleno: R$ 9.800.', 'tabela salarial analista pleno')`, [tid, doc]);
  const [{ id: aid }] = await q(`insert into assistants (tenant_id, slug, name, area_id, status) values ($1, 'duvidas-pessoas', 'Dúvidas de pessoas', $2, 'ativo') returning id`, [tid, pessoas]);
  await q(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, 1, $3, $4)`, [tid, aid, { schemaVersion: 2, inputs: { knowledge: { enabled: true } } }, uid]);
  await q(`insert into assistant_shares (tenant_id, assistant_id, area_id) values ($1, $2, $3)`, [tid, aid, comercial]);
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base + '/GreenIA.dc.html?tenant=repet&assistente=duvidas-pessoas');
  await login(page, 'vendas@repet.com.br');
  fake.reply = () => 'Essa informação não está disponível para você.';
  await page.getByLabel('Mensagem').fill('qual a tabela salarial do analista pleno?');
  await page.getByLabel('Mensagem').press('Enter');
  await page.getByRole('note').getByText('fonte não disponível para você: base de Pessoas').waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('R$ 9.800').count(), 0);
  assert.ok(!JSON.stringify(fake.requests.at(-1)).includes('9.800'));
  assert.equal(await page.getByLabel('Assistente', { exact: true }).inputValue(), 'duvidas-pessoas');   // ?assistente= escolhe no seletor
  assert.deepEqual(errors, []);
  await page.close();
});

test('seletor de assistente no chat: só os de conversa das áreas da pessoa e da empresa; o geral é o padrão', async () => {
  const q = async (sql: string, p: unknown[] = []) => (await db.owner.query(sql, p)).rows;
  const [{ id: tid }] = await q(`select id from tenants where slug = 'repet'`);
  const area = async (slug: string) => (await q(`select id from areas where tenant_id = $1 and slug = $2`, [tid, slug]))[0]?.id ?? (await q(`insert into areas (tenant_id, slug, name) values ($1, $2, $3) returning id`, [tid, slug, slug[0].toUpperCase() + slug.slice(1)]))[0].id;
  const comercial = await area('comercial'), financeiro = await area('financeiro');
  const [{ id: uid }] = await q(`insert into users (tenant_id, email) values ($1, 'vendedor2@repet.com.br') returning id`, [tid]);
  await q(`insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, 'usuario')`, [tid, uid, comercial]);
  const cria = async (slug: string, name: string, areaId: string | null, def: Record<string, unknown>, extra: { status?: string; empresa?: boolean } = {}) => {
    const [{ id }] = await q(`insert into assistants (tenant_id, slug, name, area_id, status, company_wide) values ($1, $2, $3, $4, $5, $6) returning id`, [tid, slug, name, areaId, extra.status ?? 'ativo', !!extra.empresa]);
    await q(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, 1, $3, $4)`, [tid, id, { schemaVersion: 2, ...def }, uid]);
  };
  await cria('propostas', 'Propostas comerciais', comercial, { instructions: 'Você ajuda com propostas comerciais.' });
  await cria('politicas-gerais', 'Políticas da empresa', financeiro, { instructions: 'Você explica as políticas.' }, { empresa: true });
  await cria('custos', 'Custos do financeiro', financeiro, { instructions: 'Financeiro.' });                         // outra área: não aparece
  await cria('rascunho-comercial', 'Rascunho comercial', comercial, {}, { status: 'rascunho' });                        // rascunho: não aparece
  await cria('conferencia-comercial', 'Conferência comercial', comercial, { inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'ler' }] });   // de execução: não aparece
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base + '/GreenIA.dc.html?tenant=repet');
  await login(page, 'vendedor2@repet.com.br');
  const sel = page.getByLabel('Assistente', { exact: true });
  await page.locator('#gia-assistente option', { hasText: 'Propostas comerciais' }).waitFor({ state: 'attached' });
  assert.equal(await sel.inputValue(), '');
  const opcoes = await page.locator('#gia-assistente option').allTextContents();
  // "Dúvidas de pessoas" é de Pessoas, compartilhado com Comercial (teste anterior): vale como da área da pessoa.
  assert.deepEqual(opcoes, ['Assistente geral', 'Dúvidas de pessoas', 'Políticas da empresa', 'Propostas comerciais']);
  // Geral: sem instruções de assistente. Escolhido: as instruções dele vão ao modelo.
  fake.reply = () => 'Resposta do assistente geral.';
  await page.getByLabel('Mensagem').fill('oi');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText('Resposta do assistente geral.').waitFor({ timeout: 5000 });
  assert.ok(!JSON.stringify(fake.requests.at(-1)).includes('propostas comerciais'));
  await sel.selectOption('propostas');
  fake.reply = () => 'Resposta de propostas.';
  await page.getByLabel('Mensagem').fill('como monto uma proposta?');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText('Resposta de propostas.').waitFor({ timeout: 5000 });
  assert.match(JSON.stringify(fake.requests.at(-1)), /Você ajuda com propostas comerciais\./);
  assert.deepEqual(errors, []);
  await page.close();
});

test('backend fora do ar: mostra erro, sem fallback para window.claude.complete', async () => {
  const { page } = await openApp();
  await login(page, 'caio@repet.com.br');
  await page.route(/\/api\/chat/, r => r.abort('connectionrefused'));
  await page.getByLabel('Mensagem').fill('oi');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText('Não consegui falar com o servidor agora. Quer tentar de novo?').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Tentar de novo' }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).__claudeCalls), 0);
  await page.close();
});

test('sair encerra a sessão no servidor', async () => {
  const { page } = await openApp();
  await login(page, 'duda@repet.com.br');
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => (await fetch('/api/session', { credentials: 'include' })).status);
  assert.equal(r, 401);
  await page.close();
});

test('Fase 3 no chat: roteiro no primeiro acesso, link para os assistentes e Reportar incidente', async () => {
  const { page, errors } = await openApp();
  await page.getByRole('button', { name: 'Entrar no chat' }).first().click();
  await page.getByLabel('Email corporativo').fill('eva@repet.com.br');
  await page.getByRole('button', { name: 'Receber código por email' }).click();
  await page.getByLabel(/Código de 6 dígitos/).waitFor();
  await page.getByLabel(/Código de 6 dígitos/).fill(email.sent.at(-1)!.text.match(/\b(\d{6})\b/)![1]);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Boas-vindas à GreenIA' }).waitFor();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('dialog', { name: 'Toda saída de assistente passa por revisão' }).waitFor();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal((await page.evaluate(async () => (await (await fetch('/api/session?tenant=repet', { credentials: 'include' })).json()).onboardingDone)), true);
  assert.match(await page.getByRole('link', { name: 'Assistentes da área' }).getAttribute('href') ?? '', /Assistentes%20GreenIA\.dc\.html\?tenant=repet$/);
  await page.getByRole('button', { name: 'Reportar incidente' }).click();
  await page.getByRole('dialog', { name: 'Reportar incidente' }).getByLabel('Descrição').fill('A resposta citou um prazo que não existe no procedimento.');
  await page.getByRole('dialog', { name: 'Reportar incidente' }).getByRole('button', { name: 'Enviar' }).click();
  await page.getByText(/Incidente [0-9A-F]{8} registrado/).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('Fase 3 no chat: sem ciência da Política de Uso, o envio volta e a política aparece', async () => {
  const t = (await db.owner.query(`select id from tenants where slug = 'repet'`)).rows[0].id;
  const admin = (await db.owner.query(`select id from users where tenant_id = $1 order by created_at limit 1`, [t])).rows[0].id;
  await db.owner.query(`insert into usage_policies (tenant_id, version, title, body, body_sha256, published_by) values ($1, 1, 'Política de Uso de IA da Repet', 'Use a IA para tarefas do dia a dia. Não envie dados de clientes.', 'x', $2)`, [t, admin]);
  const { page, errors } = await openApp();
  await login(page, 'fabi@repet.com.br');
  await page.getByRole('dialog', { name: 'Política de Uso de IA da Repet' }).waitFor();
  await page.getByRole('button', { name: 'Li e estou ciente' }).click();
  fake.reply = () => 'Pronto.';
  await page.getByLabel('Mensagem').fill('Resuma: reunião na quinta.');
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText('Pronto.').waitFor({ timeout: 5000 });
  // Nova versão publicada no meio da sessão: o servidor recusa (428) e a política volta.
  await db.owner.query(`insert into usage_policies (tenant_id, version, title, body, body_sha256, published_by) values ($1, 2, 'Política de Uso de IA da Repet', 'Versão 2: não envie dados de clientes nem de projetos sigilosos.', 'y', $2)`, [t, admin]);
  await page.getByLabel('Mensagem').fill('Outro resumo, por favor.');
  await page.getByLabel('Mensagem').press('Enter');
  await page.getByRole('dialog', { name: 'Política de Uso de IA da Repet' }).waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /Versão 2/);
  assert.equal(await page.getByLabel('Mensagem').inputValue(), 'Outro resumo, por favor.');
  await page.getByRole('button', { name: 'Li e estou ciente' }).click();
  await page.getByLabel('Mensagem').press('Enter');
  await bubbles(page).getByText('Pronto.').nth(1).waitFor({ timeout: 5000 });
  assert.deepEqual(errors, []);
  await page.close();
});
