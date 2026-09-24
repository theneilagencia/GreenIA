// Compartilhar um assistente não amplia acesso a conteúdo. O pedido de
// compartilhamento só vale depois da aprovação do key user da área dona (sem
// key user, do admin do cliente); o patrocinador pode pedir. Na execução, as
// bases consultadas são a interseção entre as vinculadas ao assistente e as que
// a pessoa que executa pode ler: quem recebe o assistente compartilhado não
// recebe nenhum trecho da base restrita, e a saída avisa que a fonte não está
// disponível para ela, sem mostrar o conteúdo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const fake = new FakeProvider();
const u: Record<string, string> = {};
const SEGREDO = 'R$ 9.800';
const call = async (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, u[who])).headers, payload });
const userId = async (email: string) => (await db.owner.query(`select id from users where email = $1`, [email])).rows[0].id as string;
const sentToModel = () => fake.completions.map(c => c.system + c.content.map(x => x.type === 'text' ? x.text : '').join('')).join('\n');

async function runAndGet(who: string, text: string) {
  const r = await call(who, 'POST', '/api/runs', { assistant: 'consulta-rh', text });
  assert.equal(r.statusCode, 202, r.body);
  const d = (await call(who, 'GET', `/api/runs/${r.json().runId}`)).json();
  assert.equal(d.status, 'rascunho', d.error);
  return d.result.sections.find((s: { bloco: string }) => s.bloco === 'consultar');
}

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'empresa-a', { role: 'admin_cliente' });
  u.admin = T.userId;
  app = await buildTestApp(db, { fake, objects: new MemoryObjectStore() });
  for (const name of ['Pessoas', 'Comercial', 'Financeiro']) await call('admin', 'POST', '/api/admin/areas', { name });
  for (const [k, email, role, areaSlug] of [['keyRh', 'key.pessoas@empresa-a.com.br', 'key_user', 'pessoas'], ['userRh', 'analista.pessoas@empresa-a.com.br', 'usuario', 'pessoas'],
    ['userCom', 'vendedor@empresa-a.com.br', 'usuario', 'comercial'], ['sponsor', 'diretoria@empresa-a.com.br', 'patrocinador', '']] as const) {
    await call('admin', 'POST', '/api/admin/memberships', { email, role, ...(areaSlug ? { areaSlug } : {}) });
    u[k] = await userId(email);
  }
  await call('keyRh', 'POST', '/api/kb/documents', { title: 'Tabela salarial', areaSlug: 'pessoas', contentType: 'text/plain', text: `Tabela salarial de 2026. Analista pleno: ${SEGREDO} por mês. Analista sênior: R$ 12.400.` });
  const def = { inputs: { text: { enabled: true, required: true }, files: { enabled: false }, knowledge: { enabled: true } }, pipeline: [{ bloco: 'consultar' }] };
  assert.equal((await call('admin', 'POST', '/api/admin/assistants', { slug: 'consulta-rh', name: 'Consulta a procedimentos de pessoas', areaSlug: 'pessoas', status: 'ativo', definition: def })).statusCode, 201);
  fake.completeReply = req => req.content.map(c => c.type === 'text' ? c.text : '').join('').includes(SEGREDO) ? `Analista pleno: ${SEGREDO} [Tabela salarial, v 1].` : 'A base de conhecimento não cobre essa pergunta.';
});
after(async () => { await app?.close(); await db?.drop(); });

test('patrocinador pede o compartilhamento: fica pendente e não vale', async () => {
  const r = await call('sponsor', 'PUT', '/api/admin/assistants/consulta-rh/areas', { areas: ['comercial'] });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual([r.json().aplicados, r.json().pendentes], [[], ['comercial']]);
  assert.equal((await db.owner.query(`select count(*)::int as n from assistant_shares`)).rows[0].n, 0);
  assert.ok(!((await call('userCom', 'GET', '/api/assistants')).json() as { slug: string }[]).some(a => a.slug === 'consulta-rh'));
  assert.equal((await call('userCom', 'POST', '/api/runs', { assistant: 'consulta-rh', text: 'tabela salarial' })).statusCode, 404);
  const audits = (await db.owner.query(`select action, details from audit_log where tenant_id = $1 and action like 'compartilhamento_%'`, [T.tenantId])).rows;
  assert.deepEqual(audits.map(x => [x.action, x.details.destino, x.details.por]), [['compartilhamento_pedido', 'comercial', 'diretoria@empresa-a.com.br']]);
});

test('só o key user da área dona aprova (o admin, não, porque a área tem key user); a aprovação fica na auditoria', async () => {
  const pend = (await call('keyRh', 'GET', '/api/admin/share-requests')).json();
  assert.equal(pend.length, 1);
  assert.deepEqual([pend[0].recurso, pend[0].destino, pend[0].podeAprovar, pend[0].pedidoPor], ['Consulta a procedimentos de pessoas', 'Comercial', true, 'diretoria@empresa-a.com.br']);
  assert.equal((await call('admin', 'POST', `/api/admin/share-requests/${pend[0].id}/aprovar`, {})).json().error, 'so_key_user_da_area_dona');
  assert.equal((await call('sponsor', 'POST', `/api/admin/share-requests/${pend[0].id}/aprovar`, {})).statusCode, 403);
  assert.equal((await call('keyRh', 'POST', `/api/admin/share-requests/${pend[0].id}/aprovar`, { nota: 'Pode usar para dúvidas gerais.' })).statusCode, 200);
  assert.equal((await call('keyRh', 'POST', `/api/admin/share-requests/${pend[0].id}/aprovar`, {})).json().error, 'pedido_ja_decidido');
  const ok = (await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'compartilhamento_aprovado'`, [T.tenantId])).rows;
  assert.deepEqual([ok.length, ok[0].details.por, ok[0].details.nota], [1, 'key.pessoas@empresa-a.com.br', 'Pode usar para dúvidas gerais.']);
});

test('usuário da área de destino executa: nenhum trecho da base restrita, e o aviso de fonte indisponível', async () => {
  fake.completions.length = 0;
  const s = await runAndGet('userCom', 'Qual a tabela salarial do analista pleno?');
  assert.deepEqual(s.data.fontes, []);
  assert.equal(s.data.coberto, false);
  assert.ok(!JSON.stringify(s).includes(SEGREDO) && !JSON.stringify(s).includes('12.400'));
  assert.ok(!sentToModel().includes(SEGREDO));                                     // nada da base restrita foi ao modelo
  assert.ok(s.flags.some((f: { reason: string }) => /fonte não disponível para você: base de Pessoas/.test(f.reason)));
  assert.ok(!s.flags.some((f: { reason: string }) => f.reason.includes('Tabela salarial')));   // o aviso não mostra nem o título
  const gap = (await db.owner.query(`select count(*)::int as n from audit_log where tenant_id = $1 and action = 'fonte_indisponivel_para_a_pessoa'`, [T.tenantId])).rows[0].n;
  assert.equal(gap, 1);
  // Controle: quem é da área dona recebe a base.
  const own = await runAndGet('userRh', 'Qual a tabela salarial do analista pleno?');
  assert.deepEqual(own.data.fontes.map((f: { title: string }) => f.title), ['Tabela salarial']);
  assert.ok(sentToModel().includes(SEGREDO));
});

test('chat com assistente de conversa: base vinculada fora do alcance vira aviso na resposta, sem conteúdo', async () => {
  const def = { inputs: { text: { enabled: true }, files: { enabled: false }, knowledge: { enabled: true } }, instructions: 'Responda dúvidas de pessoas.' };
  assert.equal((await call('admin', 'POST', '/api/admin/assistants', { slug: 'duvidas-pessoas', name: 'Dúvidas de pessoas', areaSlug: 'pessoas', status: 'ativo', definition: def })).statusCode, 201);
  assert.deepEqual((await call('keyRh', 'PUT', '/api/admin/assistants/duvidas-pessoas/areas', { areas: ['comercial'] })).json().aplicados, ['comercial']);
  const chat = (who: string) => call(who, 'POST', '/api/chat', { assistant: 'duvidas-pessoas', messages: [{ role: 'user', content: 'Qual a tabela salarial do analista pleno?' }] });
  const before = fake.requests.length;
  const r = await chat('userCom');
  assert.equal(r.statusCode, 200, r.body);
  assert.match(r.body, /event: meta\ndata: \{"avisos":\["fonte não disponível para você: base de Pessoas"\]\}/);
  assert.ok(!r.body.includes(SEGREDO) && !r.body.includes('Tabela salarial'));
  const req = fake.requests.slice(before).map(x => JSON.stringify(x)).join('\n');
  assert.ok(!req.includes(SEGREDO), 'nada da base restrita foi ao modelo');
  assert.match(req, /base de Pessoas/);                                            // o modelo sabe que a fonte ficou de fora
  const gaps = (await db.owner.query(`select details from audit_log where tenant_id = $1 and action = 'fonte_indisponivel_para_a_pessoa' and target like 'assistente:duvidas-pessoas%'`, [T.tenantId])).rows;
  assert.deepEqual(gaps.map(g => g.details), [{ area: 'Pessoas', canal: 'chat' }]);
  // Controle: quem é da área dona recebe a base e nenhum aviso.
  const own = await chat('userRh');
  assert.ok(!own.body.includes('avisos'));
  assert.match(own.body, /"sources":\[\{"title":"Tabela salarial"/);
});

test('key user da área dona compartilha direto; retirar vale na hora; documento pedido pelo patrocinador fica pendente', async () => {
  let r = await call('keyRh', 'PUT', '/api/admin/assistants/consulta-rh/areas', { areas: ['comercial', 'financeiro'] });
  assert.deepEqual([r.json().aplicados, r.json().pendentes], [['financeiro'], []]);
  assert.equal((await call('sponsor', 'PUT', '/api/admin/assistants/consulta-rh/areas', { areas: ['financeiro'] })).json().error, 'so_quem_administra_a_area_dona_retira');
  r = await call('keyRh', 'PUT', '/api/admin/assistants/consulta-rh/areas', { areas: ['financeiro'] });
  assert.deepEqual(r.json().removidos, ['comercial']);
  assert.equal((await call('userCom', 'POST', '/api/runs', { assistant: 'consulta-rh', text: 'tabela' })).statusCode, 404);
  const doc = (await call('keyRh', 'GET', '/api/kb/documents')).json()[0].id;
  r = await call('sponsor', 'PUT', `/api/kb/documents/${doc}/areas`, { areas: ['comercial'] });
  assert.deepEqual([r.statusCode, r.json().pendentes], [200, ['comercial']]);
  assert.equal((await db.owner.query(`select count(*)::int as n from kb_document_shares`)).rows[0].n, 0);
  const pend = (await call('keyRh', 'GET', '/api/admin/share-requests')).json();
  assert.equal((await call('keyRh', 'POST', `/api/admin/share-requests/${pend[0].id}/recusar`, {})).statusCode, 400);   // recusa sem motivo
  assert.equal((await call('keyRh', 'POST', `/api/admin/share-requests/${pend[0].id}/recusar`, { nota: 'Tabela salarial fica só com Pessoas.' })).statusCode, 200);
  assert.equal((await db.owner.query(`select count(*)::int as n from kb_document_shares`)).rows[0].n, 0);
});

test('área sem key user: o admin do cliente aprova', async () => {
  const c = await call('admin', 'POST', '/api/admin/assistants', { slug: 'propostas', name: 'Propostas', areaSlug: 'comercial', status: 'ativo',
    definition: { inputs: { text: { enabled: true, required: true }, files: { enabled: false } }, pipeline: [{ bloco: 'resumir', params: { topicos: ['Assunto'], palavrasMax: 100 } }] } });
  assert.equal(c.statusCode, 201, c.body);
  const r = await call('sponsor', 'PUT', '/api/admin/assistants/propostas/areas', { areas: ['financeiro'] });
  assert.deepEqual(r.json().pendentes, ['financeiro']);
  const pend = (await call('admin', 'GET', '/api/admin/share-requests')).json().find((p: { recurso: string }) => p.recurso === 'Propostas');
  assert.equal(pend.podeAprovar, true);
  assert.equal((await call('admin', 'POST', `/api/admin/share-requests/${pend.id}/aprovar`, {})).statusCode, 200);
});
