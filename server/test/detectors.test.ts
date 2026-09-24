// Detectores próprios do cliente: matrícula, placa, código de paciente e
// número de contrato cadastrados pelo admin, sem código, com padrão,
// validação opcional, contexto, classe e ação padrão.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { regexProblem } from '../src/policy/detectors.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
let T: Awaited<ReturnType<typeof seedTenant>>;
let O: Awaited<ReturnType<typeof seedTenant>>;
let user = '';
const call = async (userId: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, userId)).headers, payload });
const chat = (userId: string, content: string, extra: object = {}) => call(userId, 'POST', '/api/chat', { messages: [{ role: 'user', content }], ...extra });

const DETECTORS = [
  { key: 'matricula', label: 'matrícula interna', pattern: 'MAT-\\d{6}', action: 'bloquear', class: 'vermelha' },
  { key: 'placa', label: 'placa de veículo', pattern: '\\b[A-Z]{3}-?\\d[A-Z0-9]\\d{2}\\b', ignoreCase: false, action: 'mascarar' },
  { key: 'codigo_paciente', label: 'código de paciente', pattern: '\\b\\d{7}\\b', context: ['paciente', 'prontuário'], action: 'avisar' },
  { key: 'contrato', label: 'número de contrato', pattern: '\\b\\d{5}-\\d\\b', validation: 'mod11', action: 'permitir_com_registro' },
];

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'transportadora', { role: 'admin_cliente' });
  O = await seedTenant(db.owner, 'escritorio', { role: 'admin_cliente' });
  user = await addPerson(db, T.tenantId, 'motorista@transportadora.com.br', 'usuario');
  app = await buildTestApp(db, { fake });
});
after(async () => { await app?.close(); await db?.drop(); });

test('expressão regular perigosa ou inválida é recusada', () => {
  assert.equal(regexProblem('MAT-\\d{6}'), null);
  assert.match(regexProblem('(a+)+b')!, /aninhado/);
  assert.match(regexProblem('(\\w)\\1')!, /para trás/);
  assert.match(regexProblem('[a-')!, /inválida/);
});

test('o admin cadastra detectores próprios; lista mostra os de fábrica e os próprios', async () => {
  assert.equal((await call(user, 'PUT', '/api/admin/detectors', { detectors: DETECTORS })).statusCode, 403);
  let r = await call(T.userId, 'PUT', '/api/admin/detectors', { detectors: [{ key: 'cpf', label: 'x', pattern: '\\d+' }] });
  assert.equal(r.json().error, 'configuracao_invalida');
  r = await call(T.userId, 'PUT', '/api/admin/detectors', { detectors: [{ key: 'ruim', label: 'Ruim', pattern: '(a+)+' }] });
  assert.equal(r.statusCode, 400);
  r = await call(T.userId, 'PUT', '/api/admin/detectors', { detectors: DETECTORS });
  assert.equal(r.statusCode, 200, r.body);
  const list = (await call(T.userId, 'GET', '/api/admin/detectors')).json();
  assert.ok(list.deFabrica.some((d: { key: string }) => d.key === 'cpf'));
  assert.deepEqual(list.proprios.map((d: { key: string; acao: string }) => [d.key, d.acao]), [['matricula', 'bloquear'], ['placa', 'mascarar'], ['codigo_paciente', 'avisar'], ['contrato', 'permitir_com_registro']]);
  const act = (await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'detectores_alterados'`, [T.tenantId])).rows[0];
  assert.deepEqual(act.details.detectors, ['matricula', 'placa', 'codigo_paciente', 'contrato']);
});

test('teste de texto: contexto, validação e máscara', async () => {
  const t = (texto: string) => call(T.userId, 'POST', '/api/admin/detectors/test', { texto }).then(r => r.json());
  assert.deepEqual((await t('Código 1234567 do lote')).tipos, []);                    // sem a palavra de contexto
  assert.deepEqual((await t('Paciente 1234567 retornou')).tipos, ['codigo_paciente']);
  assert.deepEqual((await t('contrato 12345-6')).tipos, []);                         // dígito verificador errado
  assert.deepEqual((await t('contrato 12345-5')).tipos, ['contrato']);
  const m = await t('Caminhão ABC1D23 na doca 2');
  assert.equal(m.mascarado, 'Caminhão [PLACA DE VEÍCULO] na doca 2');
  assert.equal(m.rotulos.placa, 'placa de veículo');
});

test('no chat: bloqueio, máscara e aviso com o rótulo do cliente', async () => {
  let r = await chat(user, 'A matrícula do motorista é MAT-004512.');
  assert.equal(r.statusCode, 422);
  assert.deepEqual([r.json().types, r.json().rotulos], [['matricula'], { matricula: 'matrícula interna' }]);
  r = await chat(user, 'Resuma: o caminhão ABC1D23 chegou atrasado.');
  assert.equal(r.statusCode, 200);
  assert.match(JSON.stringify(fake.requests.at(-1)!.messages), /\[PLACA DE VEÍCULO\]/);
  assert.doesNotMatch(JSON.stringify(fake.requests.at(-1)!.messages), /ABC1D23/);
  r = await chat(user, 'O paciente 7654321 pediu atestado.');
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json().rotulos, { codigo_paciente: 'código de paciente' });
  assert.equal((await chat(user, 'O paciente 7654321 pediu atestado.', { confirmedWarnings: ['codigo_paciente'] })).statusCode, 200);
});

test('assistente respeita a classe do detector e não aceita tipo que o cliente não cadastrou', async () => {
  const base = { inputs: { text: { enabled: true } }, dataClasses: ['verde'] };
  let r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'a1', name: 'A', definition: { ...base, dataPolicy: { matricula: 'permitir' } } });
  assert.equal(r.statusCode, 400);
  assert.match(JSON.stringify(r.json().detalhes), /matricula/);
  r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'a2', name: 'A', definition: { ...base, dataPolicy: { chassi: 'avisar' } } });
  assert.deepEqual([r.json().error, r.json().tipos], ['tipo_de_dado_desconhecido', ['chassi']]);
  r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'a3', name: 'A', definition: { ...base, dataPolicy: { placa: 'bloquear' } } });
  assert.equal(r.statusCode, 201, r.body);
});

test('os detectores de um cliente não valem para outro', async () => {
  assert.deepEqual((await call(O.userId, 'GET', '/api/admin/detectors')).json().proprios, []);
  assert.equal((await chat(O.userId, 'A matrícula é MAT-004512.')).statusCode, 200);
});
