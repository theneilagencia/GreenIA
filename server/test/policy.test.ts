import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import { tenantConfigSchema } from '../src/tenants/config.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
let repet: Awaited<ReturnType<typeof seedTenant>>;
let rhUser = '';
let fiscalUser = '';

const CPF = '529.982.247-25';

before(async () => {
  db = await createTestDb();
  repet = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'rh', 'RH'), ($1, 'fiscal', 'Fiscal')`, [repet.tenantId]);
  rhUser = await addPerson(db, repet.tenantId, 'rh@repet.com.br', 'usuario', 'rh');
  fiscalUser = await addPerson(db, repet.tenantId, 'fiscal@repet.com.br', 'usuario', 'fiscal');
  app = await buildTestApp(db, { fake });
});
after(async () => { await app?.close(); await db?.drop(); });

// Chama a API direto, sem navegador: o filtro do cliente não existe aqui.
async function chat(payload: Record<string, unknown>, userId = repet.userId) {
  const { headers } = await loginAs(db, userId);
  return app.inject({ method: 'POST', url: '/api/chat', headers, payload });
}
const lastAudit = async (action: string) =>
  (await db.owner.query(`select details, target from audit_log where tenant_id = $1 and action = $2 order by id desc limit 1`, [repet.tenantId, action])).rows[0];

test('CPF é bloqueado no servidor mesmo sem o filtro do navegador', async () => {
  const before = fake.requests.length;
  const r = await chat({ messages: [{ role: 'user', content: `Confere o CPF ${CPF}` }] });
  assert.equal(r.statusCode, 422);
  assert.deepEqual(r.json(), { error: 'dado_bloqueado', types: ['cpf'] });
  assert.equal(fake.requests.length, before, 'o modelo não pode ser chamado');
  const a = await lastAudit('envio_bloqueado');
  assert.deepEqual(a.details, { tipos: ['cpf'] });
  assert.ok(!JSON.stringify(a).includes('529'), 'auditoria não guarda o valor');
});

test('dado escondido numa mensagem "do assistente" também é pego', async () => {
  const r = await chat({ messages: [
    { role: 'user', content: 'oi' }, { role: 'assistant', content: `anote: ${CPF}` }, { role: 'user', content: 'e agora?' },
  ] });
  assert.equal(r.statusCode, 422);
});

test('credencial é bloqueada sempre', async () => {
  const r = await chat({ messages: [{ role: 'user', content: 'minha senha: Abc@12345' }] });
  assert.equal(r.statusCode, 422);
  assert.deepEqual(r.json().types, ['credencial']);
});

test('email pede confirmação; confirmado, envia e audita o tipo, sem o valor', async () => {
  const msg = { role: 'user', content: 'Escreva para ana@repet.com.br sobre a reunião' };
  const before = fake.requests.length;
  const r1 = await chat({ messages: [msg] });
  assert.equal(r1.statusCode, 409);
  assert.deepEqual(r1.json(), { error: 'confirmacao_necessaria', types: ['email'] });
  assert.equal(fake.requests.length, before);
  const r2 = await chat({ messages: [msg], confirmedWarnings: ['email'] });
  assert.equal(r2.statusCode, 200);
  assert.equal(fake.requests.length, before + 1);
  const a = await lastAudit('aviso_confirmado');
  assert.deepEqual(a.details, { tipos: ['email'] });
  assert.ok(!JSON.stringify(a).includes('ana@'));
});

test('confirmar um tipo não libera outro', async () => {
  const r = await chat({ messages: [{ role: 'user', content: 'ana@repet.com.br, (11) 98765-4321' }], confirmedWarnings: ['email'] });
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json().types, ['telefone']);
});

test('assistente que mascara: o modelo recebe [EMAIL], não o endereço', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/admin/assistants', headers: (await loginAs(db, repet.userId)).headers, payload: {
    slug: 'resumo-contatos', name: 'Resumo', status: 'ativo',
    definition: { dataClasses: ['verde'], dataPolicy: { email: 'mascarar', telefone: 'mascarar' }, instructions: 'Resuma em tópicos.' },
  } });
  assert.equal(r.statusCode, 201);
  const c = await chat({ assistant: 'resumo-contatos', messages: [{ role: 'user', content: 'Contato: ana@repet.com.br, (11) 98765-4321' }] });
  assert.equal(c.statusCode, 200);
  const sent = fake.requests.at(-1)!;
  assert.equal(sent.messages[0].content, 'Contato: [EMAIL], [TELEFONE]');
  assert.match(sent.system, /Resuma em tópicos\./);
  assert.ok((await lastAudit('dado_mascarado')).target.startsWith('assistente:resumo-contatos@1'));
});

test('assistente Amarelo pode permitir email com registro; CPF continua bloqueado', async () => {
  await app.inject({ method: 'POST', url: '/api/admin/assistants', headers: (await loginAs(db, repet.userId)).headers, payload: {
    slug: 'rh-admissao', name: 'Admissão', areaSlug: 'rh', status: 'ativo',
    definition: { dataClasses: ['verde', 'amarela'], dataPolicy: { email: 'permitir_com_registro', nome: 'permitir_com_registro' } },
  } });
  const ok = await chat({ assistant: 'rh-admissao', messages: [{ role: 'user', content: 'Nome: Maria Souza, maria@repet.com.br' }] }, rhUser);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual((await lastAudit('dado_enviado_com_registro')).details, { tipos: ['email', 'nome'] });
  const blocked = await chat({ assistant: 'rh-admissao', messages: [{ role: 'user', content: `CPF ${CPF}` }] }, rhUser);
  assert.equal(blocked.statusCode, 422);
});

test('assistente de uma área não existe para quem é de outra', async () => {
  const r = await chat({ assistant: 'rh-admissao', messages: [{ role: 'user', content: 'oi' }] }, fiscalUser);
  assert.equal(r.statusCode, 404);
});

test('política incoerente com as classes é recusada ao salvar', () => {
  assert.throws(() => assistantDefinitionSchema.parse({ dataClasses: ['verde'], dataPolicy: { cpf: 'permitir' } }), /não aceita dado vermelha/);
  assert.throws(() => assistantDefinitionSchema.parse({ dataClasses: ['verde'], dataPolicy: { email: 'permitir' } }), /não aceita dado amarela/);
  assert.throws(() => assistantDefinitionSchema.parse({ dataClasses: ['vermelha', 'amarela'], dataPolicy: { credencial: 'permitir' } }), /sempre bloqueada/);
  assert.doesNotThrow(() => assistantDefinitionSchema.parse({ dataClasses: ['verde', 'amarela', 'vermelha'], dataPolicy: { cpf: 'permitir_com_registro' } }));
  assert.throws(() => tenantConfigSchema.parse({ dataPolicy: { email: 'permitir' } }), /não aceita dado amarela/);
});

test('texto sem dado sensível passa direto', async () => {
  const r = await chat({ messages: [{ role: 'user', content: 'Resumir: a reunião foi produtiva.' }] });
  assert.equal(r.statusCode, 200);
});
