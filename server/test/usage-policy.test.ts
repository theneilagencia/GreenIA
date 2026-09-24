import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { MemoryEmailSender } from '../src/email/sender.ts';
import { FakeProvider } from '../src/llm/provider.ts';

let db: TestDb;
let app: FastifyInstance;
const email = new MemoryEmailSender();
const fake = new FakeProvider();
let T: Awaited<ReturnType<typeof seedTenant>>;
let P: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};

const POLICY = `# Política de Uso de IA da Empresa Exemplo\n\nUse a GreenIA para tarefas do dia a dia. Não envie dados de clientes nem informações de projetos sigilosos.`;
const post = async (userId: string, url: string, payload: object) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });
const chat = (userId: string, content: string, assistant?: string) => post(userId, '/api/chat', { assistant, messages: [{ role: 'user', content }] });
const publish = (rules: object = {}) => post(T.userId, '/api/admin/policy', { title: 'Política de Uso de IA', body: POLICY, rules });
const ack = async (userId: string) => { const v = (await get(userId, '/api/policy')).json().policy.version; return post(userId, '/api/policy/ack', { version: v }); };

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal'), ($1, 'rh', 'RH')`, [T.tenantId]);
  people.user = await addPerson(db, T.tenantId, 'ana@repet.com.br', 'usuario', 'fiscal');
  people.key = await addPerson(db, T.tenantId, 'key.fiscal@repet.com.br', 'key_user', 'fiscal');
  people.keyRh = await addPerson(db, T.tenantId, 'key.rh@repet.com.br', 'key_user', 'rh');
  app = await buildTestApp(db, { email, fake }, { PLATFORM_SUPPORT_EMAIL: 'suporte@theneil.com.br' });
  const r = await post(T.userId, '/api/admin/assistants', { slug: 'contatos', name: 'Contatos', areaSlug: 'fiscal', status: 'ativo',
    definition: { instructions: 'Organize contatos.', dataClasses: ['verde', 'amarela'], dataPolicy: { email: 'permitir' } } });
  assert.equal(r.statusCode, 201, r.body);
});
after(async () => { await app?.close(); await db?.drop(); });

test('sem política publicada, nada é exigido', async () => {
  assert.deepEqual((await get(people.user, '/api/policy')).json(), { policy: null, acked: true });
  assert.equal((await chat(people.user, 'Resuma: reunião na quinta.')).statusCode, 200);
});

test('política publicada: ciência obrigatória antes de usar, e de novo a cada versão', async () => {
  let r = await publish();
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().version, 1);
  r = await chat(people.user, 'Resuma: reunião na quinta.');
  assert.equal(r.statusCode, 428);
  assert.deepEqual(r.json(), { error: 'ciencia_da_politica_pendente', version: 1 });
  const g = (await get(people.user, '/api/policy')).json();
  assert.equal(g.acked, false);
  assert.match(g.policy.body, /Não envie dados de clientes/);
  assert.equal((await post(people.user, '/api/policy/ack', { version: 7 })).json().error, 'versao_nao_vigente');
  assert.equal((await ack(people.user)).statusCode, 200);
  assert.equal((await chat(people.user, 'Resuma: reunião na quinta.')).statusCode, 200);
  const acks = (await get(T.userId, '/api/admin/policy/acks')).json();
  assert.equal(acks.version, 1);
  assert.ok(acks.pessoas.find((x: { email: string; acked_at: string | null }) => x.email === 'ana@repet.com.br').acked_at);
  assert.equal((await post(people.user, '/api/admin/policy', { title: 'x', body: POLICY })).statusCode, 403);
});

test('regras da política valem sobre as dos assistentes: piso, informação restrita e classes', async () => {
  const r = await publish({ dataPolicy: { email: 'bloquear' }, restrictedTerms: ['Projeto Aurora'], allowedClasses: ['verde'] });
  assert.equal(r.json().version, 2);
  assert.deepEqual(r.json().conflitos, [{ slug: 'contatos', status: 'ativo', classes: ['amarela'] }]);
  for (const u of [people.user, people.key, people.keyRh, T.userId]) assert.equal((await ack(u)).statusCode, 200);
  // Piso: o assistente permitia email; a política bloqueia.
  let c = await chat(people.user, 'Anote: ana@fornecedor.com.br', 'contatos');
  assert.equal(c.statusCode, 422);
  assert.deepEqual(c.json().types, ['email']);
  // Informação restrita: não vai ao modelo, sem acento ou maiúscula que salve.
  const before = fake.requests.length;
  c = await chat(people.user, 'Me ajude com o cronograma do projeto aurora');
  assert.equal(c.statusCode, 422);
  assert.deepEqual(c.json().types, ['restrito']);
  assert.equal(fake.requests.length, before);
  const last = (await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'envio_bloqueado' order by seq desc limit 1`, [T.tenantId])).rows[0];
  assert.deepEqual(last.details, { tipos: ['restrito'], termos: 1 });                // o termo em si não vai para a auditoria
  // Classes: assistente com classe amarela não entra em piloto nem fica ativo.
  const mk = await post(T.userId, '/api/admin/assistants', { slug: 'novo', name: 'Novo', areaSlug: 'fiscal', status: 'piloto', definition: { dataClasses: ['verde', 'amarela'] } });
  assert.equal(mk.statusCode, 409);
  assert.deepEqual(mk.json(), { error: 'classe_nao_permitida_pela_politica', classes: ['amarela'] });
  assert.equal((await post(T.userId, '/api/admin/assistants', { slug: 'novo', name: 'Novo', areaSlug: 'fiscal', status: 'rascunho', definition: { dataClasses: ['verde', 'amarela'] } })).statusCode, 201);
  assert.equal((await post(T.userId, '/api/admin/assistants/novo/status', { status: 'ativo' })).statusCode, 409);
  assert.equal((await post(T.userId, '/api/admin/policy', { title: 'x', body: POLICY, rules: { dataPolicy: { credencial: 'permitir' } } })).statusCode, 400);
});

test('execução também exige ciência e respeita a informação restrita', async () => {
  await post(T.userId, '/api/admin/assistants', { slug: 'resumo', name: 'Resumo', areaSlug: 'fiscal', status: 'rascunho',
    definition: { inputs: { text: { enabled: true }, files: { enabled: true, accept: ['texto'] } }, pipeline: [{ bloco: 'ler' }, { bloco: 'resumir', params: { topicos: ['Situação'] } }] } });
  await post(T.userId, '/api/admin/assistants/resumo/status', { status: 'ativo' });
  const files = [{ name: 'ata.txt', contentBase64: Buffer.from('Ata: prazos do Projeto Aurora.').toString('base64') }];
  let r = await post(people.user, '/api/runs', { assistant: 'resumo', text: 'Resuma.', files });
  assert.equal(r.statusCode, 422);
  assert.deepEqual(r.json().types, ['restrito']);
  await publish({ restrictedTerms: ['Projeto Aurora'] });                             // versão 3: ciência de novo
  r = await post(people.user, '/api/runs', { assistant: 'resumo', text: 'Resuma.', files: [] });
  assert.equal(r.statusCode, 428);
});

let incidentId = '';

test('reportar incidente: key user da área e suporte da TheNeil avisados, sem a descrição; só o key user lê a descrição', async () => {
  await ack(people.user); await ack(people.key); await ack(people.keyRh);
  email.sent.length = 0;
  const r = await post(people.user, '/api/incidents', { tipo: 'dado_indevido', descricao: 'Enviei sem querer a planilha com salários da equipe.', tela: 'chat' });
  assert.equal(r.statusCode, 201, r.body);
  incidentId = r.json().id;
  assert.equal(r.json().codigo, incidentId.slice(0, 8).toUpperCase());
  const to = email.sent.map(m => m.to).sort();
  assert.deepEqual(to, ['key.fiscal@repet.com.br', 'suporte@theneil.com.br'].sort());   // o admin não recebe: a área tem key user
  assert.ok(email.sent.every(m => !m.text.includes('salários')), 'descrição não vai por email');
  const support = email.sent.find(m => m.to === 'suporte@theneil.com.br')!;
  assert.match(support.text, /dado enviado indevidamente, aberto em \d{4}-\d{2}-\d{2}T.*sem execução ou saída indicada\.\nA descrição fica com o key user da área/);
  // Descrição: quem reportou e o key user da área leem; o admin do cliente vê o incidente, mas não a descrição.
  const byKey = (await get(people.key, `/api/incidents/${incidentId}`)).json();
  assert.match(byKey.descricao, /salários/);
  const byAdmin = (await get(T.userId, `/api/incidents/${incidentId}`)).json();
  assert.deepEqual([byAdmin.descricao, byAdmin.descricaoRestrita, byAdmin.possoTratar], [null, true, true]);
  const lidas = (await db.owner.query(`select details->>'por' as por from audit_log where action = 'incidente_descricao_lida' and target = $1 order by seq`, [`incidente:${incidentId}`])).rows.map(r => r.por);
  assert.deepEqual(lidas, ['key.fiscal@repet.com.br']);
  assert.match(email.sent[0].subject, /incidente [0-9A-F]{8} \(dado enviado indevidamente\)/);
  // Quem vê: quem reportou e quem trata a área; key user de outra área, não.
  assert.equal((await get(people.user, `/api/incidents/${incidentId}`)).json().possoTratar, false);
  assert.equal((await get(people.key, '/api/incidents')).json()[0].possoTratar, true);
  assert.equal((await get(people.keyRh, `/api/incidents/${incidentId}`)).statusCode, 404);
  assert.deepEqual((await get(people.keyRh, '/api/incidents')).json(), []);
});

test('incidente segue com status até o encerramento, com histórico e auditoria', async () => {
  const st = (u: string, status: string, nota?: string) => post(u, `/api/incidents/${incidentId}/status`, { status, nota });
  assert.equal((await st(people.user, 'em_analise')).statusCode, 403);
  assert.equal((await st(people.key, 'em_analise')).statusCode, 200);
  assert.equal((await st(people.key, 'resolvido')).json().error, 'nota_obrigatoria');
  assert.equal((await st(people.key, 'resolvido', 'Arquivo apagado do histórico; equipe orientada.')).statusCode, 200);
  assert.equal((await st(people.key, 'aberto')).json().error, 'transicao_invalida');
  const d = (await get(people.user, `/api/incidents/${incidentId}`)).json();
  assert.equal(d.status, 'resolvido');
  assert.deepEqual(d.historico.map((e: { status_to: string }) => e.status_to), ['aberto', 'em_analise', 'resolvido']);
  assert.equal(d.historico[2].note, 'Arquivo apagado do histórico; equipe orientada.');
  const acts = (await db.owner.query(`select action from audit_log where target = $1 and action <> 'incidente_descricao_lida' order by seq`, [`incidente:${incidentId}`])).rows.map(a => a.action);
  assert.deepEqual(acts, ['incidente_aberto', 'incidente_status', 'incidente_status']);
});

test('TheNeil acompanha os incidentes de todos os clientes e encerra, com registro no tenant do cliente', async () => {
  assert.equal((await get(T.userId, '/api/platform/incidents')).statusCode, 403);
  const list = (await get(P.userId, '/api/platform/incidents')).json();
  const mine = list.find((x: { id: string }) => x.id === incidentId);
  assert.deepEqual([mine.tenant, mine.status, mine.descricaoDisponivel, mine.escalado], ['repet', 'resolvido', false, false]);
  assert.equal('descricao' in mine, false);
  // Sem escalonamento: nem a descrição, nem as notas do cliente.
  let det = (await get(P.userId, `/api/platform/incidents/${incidentId}`)).json();
  assert.deepEqual([det.descricao, det.descricaoRestrita], [null, true]);
  assert.ok(det.historico.every((e: { note: string | null }) => e.note === null));
  // Só o key user escala; depois disso a TheNeil lê, com registro de quem leu.
  assert.equal((await post(people.user, `/api/incidents/${incidentId}/escalar`, { nota: 'Quero ajuda.' })).json().error, 'so_o_key_user_escala');
  assert.equal((await post(T.userId, `/api/incidents/${incidentId}/escalar`, { nota: 'Quero ajuda.' })).json().error, 'so_o_key_user_escala');
  email.sent.length = 0;
  const esc = await post(people.key, `/api/incidents/${incidentId}/escalar`, { nota: 'Preciso confirmar se o provedor reteve o arquivo.' });
  assert.equal(esc.statusCode, 200, esc.body);
  assert.deepEqual(email.sent.map(m => m.to), ['suporte@theneil.com.br']);
  assert.ok(!email.sent[0].text.includes('salários'));
  assert.equal((await post(people.key, `/api/incidents/${incidentId}/escalar`, { nota: 'De novo.' })).json().error, 'ja_disponivel_para_a_theneil');
  det = (await get(P.userId, `/api/platform/incidents/${incidentId}`)).json();
  assert.match(det.descricao, /salários/);
  assert.equal(det.escalado.por, 'key.fiscal@repet.com.br');
  const lida = (await db.owner.query(`select details->>'por' as por from audit_log where tenant_id = $1 and action = 'incidente_descricao_lida' order by seq desc limit 1`, [T.tenantId])).rows[0];
  assert.equal(lida.por, 'TheNeil (pessoa@theneil.com.br)');
  const r = await post(P.userId, `/api/platform/incidents/${incidentId}/status`, { status: 'encerrado', nota: 'Sem dado exposto a terceiros.' });
  assert.equal(r.statusCode, 200, r.body);
  const d = (await get(people.key, `/api/incidents/${incidentId}`)).json();
  assert.equal(d.status, 'encerrado');
  assert.equal(d.historico.at(-1).actor, 'TheNeil (pessoa@theneil.com.br)');
  assert.deepEqual(d.proximos, []);
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and action like 'incidente%' order by seq`, [T.tenantId])).rows.map(a => a.action);
  assert.ok(acts.includes('incidentes_consultados_pela_theneil'));
  assert.equal((await get(people.key, '/api/audit/verify')).json().ok, true);          // a cadeia continua íntegra
});

test('problema técnico: a descrição chega à TheNeil sem escalonamento; sem key user na área, o admin lê', async () => {
  email.sent.length = 0;
  const r = await post(people.key, '/api/incidents', { tipo: 'problema_tecnico', descricao: 'A exportação em PDF trava depois de 30 segundos.', tela: 'assistentes' });
  assert.equal(r.statusCode, 201, r.body);
  assert.match(email.sent.find(m => m.to === 'suporte@theneil.com.br')!.text, /Problema técnico: a descrição está disponível no painel/);
  const item = (await get(P.userId, '/api/platform/incidents')).json().find((x: { id: string }) => x.id === r.json().id);
  assert.equal(item.descricaoDisponivel, true);
  assert.match((await get(P.userId, `/api/platform/incidents/${r.json().id}`)).json().descricao, /trava depois de 30 segundos/);
  // Incidente sem área (aberto pelo admin): quem lê é o administrador do cliente.
  const semArea = await post(T.userId, '/api/incidents', { tipo: 'outro', descricao: 'Texto de boas-vindas com erro de digitação.' });
  const d = (await get(T.userId, `/api/incidents/${semArea.json().id}`)).json();
  assert.match(d.descricao, /boas-vindas/);
  assert.equal(d.podeEscalar, true);
});
