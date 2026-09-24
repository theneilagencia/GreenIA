// Áreas definidas pelo cliente: criar, renomear, mover, reordenar, desativar;
// subáreas com permissão herdada e sobrescrevível; assistentes e documentos
// compartilhados com várias áreas ou com a empresa toda. Nenhuma área existe
// antes do teste: o tenant começa vazio e cria as suas pela API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const u: Record<string, string> = {};
const call = async (userId: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: (await loginAs(db, userId)).headers, payload });
const role = (email: string, r: string, areaSlug?: string) => call(T.userId, 'POST', '/api/admin/memberships', { email, role: r, areaSlug });
const userId = async (email: string) => (await db.owner.query(`select id from users where email = $1`, [email])).rows[0].id as string;
const titles = (r: { json(): { title: string }[] }) => r.json().map(d => d.title).sort();

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'clinicas', { role: 'admin_cliente' });
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

test('tenant novo começa sem áreas; o admin cria, com subárea, descrição e slug gerado', async () => {
  assert.deepEqual((await call(T.userId, 'GET', '/api/admin/areas')).json(), []);
  for (const b of [
    { name: 'Operações', description: 'Unidades e manutenção predial.' },
    { name: 'Manutenção', parentSlug: 'operacoes' },
    { name: 'Faturamento de convênios' },
    { name: 'Qualidade' },
  ]) assert.equal((await call(T.userId, 'POST', '/api/admin/areas', b)).statusCode, 201);
  const tree = (await call(T.userId, 'GET', '/api/admin/areas')).json();
  assert.deepEqual(tree.map((a: { caminho: string }) => a.caminho), ['Operações', 'Operações > Manutenção', 'Faturamento de convênios', 'Qualidade']);
  assert.equal(tree.find((a: { slug: string }) => a.slug === 'faturamento-de-convenios').depth, 0);
  assert.equal((await call(T.userId, 'POST', '/api/admin/areas', { name: 'Operações' })).statusCode, 409);
});

test('renomear, reordenar, mover e impedir ciclo', async () => {
  assert.equal((await call(T.userId, 'PATCH', '/api/admin/areas/qualidade', { name: 'Qualidade e segurança do paciente', position: 0 })).statusCode, 200);
  assert.equal((await call(T.userId, 'PATCH', '/api/admin/areas/operacoes', { position: 5 })).statusCode, 200);
  assert.equal((await call(T.userId, 'PATCH', '/api/admin/areas/operacoes', { parentSlug: 'manutencao' })).json().error, 'hierarquia_invalida');
  const names = (await call(T.userId, 'GET', '/api/admin/areas')).json().filter((a: { depth: number }) => a.depth === 0).map((a: { name: string }) => a.name);
  assert.equal(names[0], 'Qualidade e segurança do paciente');
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and action like 'area_%' order by seq`, [T.tenantId])).rows.map(r => r.action);
  assert.deepEqual(acts.slice(0, 4), ['area_criada', 'area_criada', 'area_criada', 'area_criada']);
  assert.ok(acts.includes('area_alterada'));
});

test('permissão herdada na subárea, sobrescrita por papel próprio, e subárea que não herda', async () => {
  assert.equal((await role('gestora@clinicas.com.br', 'key_user', 'operacoes')).statusCode, 201);
  u.gestora = await userId('gestora@clinicas.com.br');
  // Herdada: a key user de Operações administra a base de Manutenção.
  let r = await call(u.gestora, 'POST', '/api/kb/documents', { title: 'Plano de manutenção preventiva', areaSlug: 'manutencao', contentType: 'text/plain', text: 'Manutenção preventiva dos aparelhos de ar condicionado a cada 90 dias.' });
  assert.equal(r.statusCode, 201, r.body);
  // Sobrescrita: papel próprio de usuário em Manutenção tira a administração herdada.
  await role('gestora@clinicas.com.br', 'usuario', 'manutencao');
  r = await call(u.gestora, 'POST', '/api/kb/documents', { title: 'Outro', areaSlug: 'manutencao', contentType: 'text/plain', text: 'Texto qualquer para teste de permissão.' });
  assert.equal(r.statusCode, 403);
  assert.equal((await call(T.userId, 'DELETE', '/api/admin/memberships', { email: 'gestora@clinicas.com.br', role: 'usuario', areaSlug: 'manutencao' })).statusCode, 200);
  // Subárea que não herda: nem leitura sem papel próprio.
  await call(T.userId, 'POST', '/api/admin/areas', { name: 'Compras sigilosas', parentSlug: 'operacoes', inheritPermissions: false });
  await call(T.userId, 'POST', '/api/kb/documents', { title: 'Contrato de exclusividade', areaSlug: 'compras-sigilosas', contentType: 'text/plain', text: 'Cláusula de exclusividade com fornecedor de insumos.' });
  const docs = titles(await call(u.gestora, 'GET', '/api/kb/documents'));
  assert.ok(docs.includes('Plano de manutenção preventiva'));
  assert.ok(!docs.includes('Contrato de exclusividade'));
});

test('área desativada deixa de dar acesso (e as subáreas também); o admin continua vendo', async () => {
  await role('tecnico@clinicas.com.br', 'usuario', 'manutencao');
  u.tecnico = await userId('tecnico@clinicas.com.br');
  assert.ok(titles(await call(u.tecnico, 'GET', '/api/kb/documents')).includes('Plano de manutenção preventiva'));
  assert.equal((await call(T.userId, 'PATCH', '/api/admin/areas/operacoes', { active: false })).statusCode, 200);
  assert.deepEqual(titles(await call(u.tecnico, 'GET', '/api/kb/documents')), []);
  assert.ok(titles(await call(T.userId, 'GET', '/api/kb/documents')).includes('Plano de manutenção preventiva'));
  const tree = (await call(T.userId, 'GET', '/api/admin/areas')).json();
  assert.equal(tree.find((a: { slug: string }) => a.slug === 'manutencao').efetivamenteAtiva, false);
  await call(T.userId, 'PATCH', '/api/admin/areas/operacoes', { active: true });
  assert.ok(titles(await call(u.tecnico, 'GET', '/api/kb/documents')).includes('Plano de manutenção preventiva'));
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and action in ('area_desativada', 'area_reativada') order by seq`, [T.tenantId])).rows.map(r => r.action);
  assert.deepEqual(acts, ['area_desativada', 'area_reativada']);
});

test('documento compartilhado com outra área e documento da empresa; a busca da subárea alcança a área mãe', async () => {
  await role('faturista@clinicas.com.br', 'usuario', 'faturamento-de-convenios');
  u.faturista = await userId('faturista@clinicas.com.br');
  await call(T.userId, 'POST', '/api/kb/documents', { title: 'Tabela de glosas', areaSlug: 'faturamento-de-convenios', contentType: 'text/plain', text: 'Glosa por falta de assinatura do paciente na guia de atendimento.', compartilhar: { areas: ['qualidade'] } });
  await call(T.userId, 'POST', '/api/kb/documents', { title: 'Código de conduta', contentType: 'text/plain', text: 'Conduta ética e sigilo sobre informações de pacientes.', compartilhar: { empresa: true } });
  await role('auditora@clinicas.com.br', 'usuario', 'qualidade');
  u.auditora = await userId('auditora@clinicas.com.br');
  assert.deepEqual(titles(await call(u.auditora, 'GET', '/api/kb/documents')), ['Código de conduta', 'Tabela de glosas']);
  assert.ok(!titles(await call(u.tecnico, 'GET', '/api/kb/documents')).includes('Tabela de glosas'));
  assert.ok(titles(await call(u.tecnico, 'GET', '/api/kb/documents')).includes('Código de conduta'));
  // A permissão desce, não sobe: a busca por Operações alcança a base de Manutenção;
  // quem é só de Manutenção não lê a base de Operações.
  await call(T.userId, 'POST', '/api/kb/documents', { title: 'Horário das unidades', areaSlug: 'operacoes', contentType: 'text/plain', text: 'As unidades abrem às 7h e a manutenção só entra depois das 19h.' });
  const byOps = (await call(u.gestora, 'GET', '/api/kb/search?q=manutencao%20unidades&area=operacoes')).json().map((h: { title: string }) => h.title).sort();
  assert.deepEqual(byOps, ['Horário das unidades', 'Plano de manutenção preventiva']);
  const byTech = (await call(u.tecnico, 'GET', '/api/kb/search?q=manutencao%20unidades&area=manutencao')).json().map((h: { title: string }) => h.title);
  assert.deepEqual(byTech, ['Plano de manutenção preventiva']);
  // Compartilhamento trocado depois: a Qualidade perde a tabela.
  const doc = (await call(T.userId, 'GET', '/api/kb/documents')).json().find((d: { title: string }) => d.title === 'Tabela de glosas');
  assert.deepEqual(doc.compartilhadoCom, ['qualidade']);
  assert.equal((await call(T.userId, 'PUT', `/api/kb/documents/${doc.id}/areas`, { areas: [] })).statusCode, 200);
  assert.ok(!titles(await call(u.auditora, 'GET', '/api/kb/documents')).includes('Tabela de glosas'));
});

test('assistente compartilhado: aparece para a outra área, e a execução fica na área de quem usa', async () => {
  const def = { inputs: { text: { enabled: true, required: true }, files: { enabled: false } }, pipeline: [{ bloco: 'resumir', params: { topicos: ['Assunto'], palavrasMax: 100 } }] };
  let r = await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'resumo-de-ocorrencia', name: 'Resumo de ocorrência', areaSlug: 'qualidade', status: 'ativo', definition: def, compartilhar: { areas: ['manutencao'] } });
  assert.equal(r.statusCode, 201, r.body);
  const list = (await call(u.tecnico, 'GET', '/api/assistants')).json();
  assert.deepEqual(list.map((a: { slug: string; compartilhadoCom: string[] }) => [a.slug, a.compartilhadoCom]), [['resumo-de-ocorrencia', ['manutencao']]]);
  assert.deepEqual((await call(u.faturista, 'GET', '/api/assistants')).json(), []);
  r = await call(u.tecnico, 'POST', '/api/runs', { assistant: 'resumo-de-ocorrencia', contentType: 'text/plain', text: 'Vazamento no teto da sala 3, sem feridos.' });
  assert.equal(r.statusCode, 202, r.body);
  const run = (await db.owner.query(`select a.slug from runs r join areas a on a.id = r.area_id where r.id = $1`, [r.json().runId])).rows[0];
  assert.equal(run.slug, 'manutencao');
  assert.equal((await call(u.tecnico, 'POST', '/api/runs', { assistant: 'resumo-de-ocorrencia', contentType: 'text/plain', text: 'x', areaSlug: 'qualidade' })).json().error, 'area_nao_serve');
});

test('detalhe da área: pessoas por papel, base e assistentes (próprios e compartilhados)', async () => {
  await role('revisora@clinicas.com.br', 'revisor', 'qualidade');
  const d = (await call(T.userId, 'GET', '/api/admin/areas/qualidade')).json();
  assert.deepEqual(d.revisores.map((p: { email: string }) => p.email), ['revisora@clinicas.com.br']);
  assert.deepEqual(d.assistentes.map((s: { slug: string; daArea: boolean }) => [s.slug, s.daArea]), [['resumo-de-ocorrencia', true]]);
  const m = (await call(T.userId, 'GET', '/api/admin/areas/manutencao')).json();
  assert.deepEqual(m.areaMae, { slug: 'operacoes', name: 'Operações' });
  assert.deepEqual(m.assistentes.map((s: { slug: string; daArea: boolean }) => [s.slug, s.daArea]), [['resumo-de-ocorrencia', false]]);
  assert.equal((await call(u.tecnico, 'GET', '/api/admin/areas/qualidade')).statusCode, 403);
});
