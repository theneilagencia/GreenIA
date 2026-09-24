import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { nfeXml, textPdf, xlsx } from './fixtures.ts';

let db: TestDb;
let app: FastifyInstance;
const objects = new MemoryObjectStore();
const fake = new FakeProvider();
let A: Awaited<ReturnType<typeof seedTenant>>;
let B: Awaited<ReturnType<typeof seedTenant>>;
let P: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString('base64');
const post = async (userId: string, url: string, payload: object) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });
let pdfBytes: Uint8Array;

async function populate(t: Awaited<ReturnType<typeof seedTenant>>, key: string, user: string) {
  const ok = async (r: Promise<{ statusCode: number; body: string }>, code: number) => { const x = await r; assert.equal(x.statusCode, code, x.body); return x; };
  await ok(post(t.userId, '/api/admin/policy', { title: 'Política de Uso de IA', body: 'Use a IA para tarefas do dia a dia, sem dados de clientes.' }), 201);
  for (const u of [t.userId, key, user]) await ok(post(u, '/api/policy/ack', { version: 1 }), 200);
  await ok(post(key, '/api/kb/documents', { title: 'Procedimento fiscal', areaSlug: 'fiscal', contentType: 'application/pdf', contentBase64: b64(pdfBytes) }), 201);
  await ok(post(t.userId, '/api/admin/assistants', { slug: 'conferencia', name: 'Conferência', areaSlug: 'fiscal', status: 'ativo', definition: {
    inputs: { text: { enabled: false }, files: { enabled: true, accept: ['nfe_xml', 'xlsx'] } }, dataClasses: ['verde', 'amarela'],
    pipeline: [{ bloco: 'ler' }, { bloco: 'conferir', params: { esquerda: { de: 'nfe', caminho: 'itens' }, direita: { de: 'tabela' }, chave: { esquerda: 'codigo', direita: 'Código' }, regras: [{ campo: 'Q', esquerda: 'quantidade', direita: 'Quantidade', tipo: 'numero' }] } }],
    output: { files: ['xlsx'] }, metrics: { indicators: [{ key: 'tempo', label: 'Tempo por nota', unit: 'min' }] } } }), 201);
  const run = await ok(post(user, '/api/runs', { assistant: 'conferencia', files: [
    { name: 'nfe.xml', contentBase64: b64(nfeXml({ numero: '7', emissao: '2026-09-01', itens: [{ codigo: 'A', descricao: 'x', qtd: 2, unit: 1 }] })) },
    { name: 'pedido.xlsx', contentBase64: b64(await xlsx({ P: [['Código', 'Quantidade'], ['A', 3]] })) },
  ] }), 202);
  const runId = JSON.parse(run.body).runId;
  await ok(post(key, `/api/runs/${runId}/review`, { decisao: 'aprovado' }), 200);
  await ok(post(key, '/api/metrics/assistants/conferencia/values', { indicador: 'tempo', fase: 'antes', valor: 12, origem: 'informado', informadoPor: 'Coordenação fiscal' }), 201);
  await ok(post(key, '/api/metrics/assistants/conferencia/decisions', { decisao: 'manter', data: '2026-09-24', responsavel: 'Coordenação', justificativa: 'Piloto funcionou bem no fiscal.' }), 201);
  await ok(post(user, '/api/incidents', { tipo: 'resposta_errada', descricao: 'A conferência apontou item que estava certo.' }), 201);
  await ok(post(user, '/api/chat', { messages: [{ role: 'user', content: 'Resuma: reunião na quinta.' }] }), 200);
  return runId;
}

before(async () => {
  db = await createTestDb();
  pdfBytes = await textPdf(['Procedimento de entrada de notas fiscais: conferir o pedido antes do lançamento.']);
  A = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  B = await seedTenant(db.owner, 'outra', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  for (const t of [A, B]) await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal')`, [t.tenantId]);
  people.keyA = await addPerson(db, A.tenantId, 'key@repet.com.br', 'key_user', 'fiscal');
  people.userA = await addPerson(db, A.tenantId, 'ana@repet.com.br', 'usuario', 'fiscal');
  people.keyB = await addPerson(db, B.tenantId, 'key@outra.com.br', 'key_user', 'fiscal');
  people.userB = await addPerson(db, B.tenantId, 'bruno@outra.com.br', 'usuario', 'fiscal');
  app = await buildTestApp(db, { objects, fake });
  await populate(A, people.keyA, people.userA);
  await populate(B, people.keyB, people.userB);
});
after(async () => { await app?.close(); await db?.drop(); });

const tenantTables = async () => (await db.owner.query(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'`)).rows.map(r => r.table_name as string);
async function rowsOf(tenantId: string) {
  let n = 0;
  for (const t of await tenantTables()) n += Number((await db.owner.query(`select count(*) from "${t}" where tenant_id = $1`, [tenantId])).rows[0].count);
  return n + Number((await db.owner.query(`select count(*) from tenants where id = $1`, [tenantId])).rows[0].count);
}

test('exportação completa em formato aberto: dados em JSON e CSV, originais e auditoria íntegra', async () => {
  assert.equal((await post(people.keyA, '/api/admin/exports', {})).statusCode, 403);
  const r = await post(A.userId, '/api/admin/exports', {});
  assert.equal(r.statusCode, 202);
  const list = (await get(A.userId, '/api/admin/exports')).json();
  assert.equal(list[0].status, 'pronta', JSON.stringify(list[0]));
  const dl = await get(A.userId, `/api/admin/exports/${r.json().id}/download`);
  assert.equal(dl.statusCode, 200);
  const zip = await JSZip.loadAsync(dl.rawPayload);
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  const manifest = JSON.parse(await zip.file('manifesto.json')!.async('string'));
  for (const set of ['pessoas', 'papeis', 'assistentes', 'assistentes-versoes', 'base-documentos', 'execucoes', 'medicoes', 'decisoes', 'consumo', 'politica-de-uso', 'politica-ciencia', 'incidentes', 'auditoria']) {
    assert.ok(names.includes(`dados/${set}.json`) && names.includes(`dados/${set}.csv`), set);
  }
  assert.equal(manifest.cliente.slug, 'repet');
  assert.equal(manifest.registros.execucoes, 1);
  assert.equal(manifest.registros.pessoas, 3);
  // Auditoria: todos os registros, com a cadeia íntegra e o mesmo hash final do banco.
  // O manifesto traz a cadeia no momento da leitura; a própria exportação acrescenta registros depois.
  const atSeq = (await db.owner.query(`select hash from audit_log where tenant_id = $1 and seq = $2`, [A.tenantId, manifest.auditoria.registros])).rows[0];
  assert.equal(manifest.auditoria.cadeiaIntegra, true);
  assert.equal(manifest.auditoria.hashFinal, atSeq.hash);
  assert.equal(manifest.registros.auditoria, manifest.auditoria.registros);
  // Originais: o PDF da base e as entradas da execução, byte a byte.
  const pdfPath = names.find(n => n.startsWith('arquivos/base/') && n.endsWith('/Procedimento fiscal.pdf'))!;
  assert.ok(pdfPath, names.join('\n'));
  assert.equal(createHash('sha256').update(await zip.file(pdfPath)!.async('uint8array')).digest('hex'), createHash('sha256').update(pdfBytes).digest('hex'));
  assert.equal(names.filter(n => n.startsWith('arquivos/execucoes/')).length, 2);
  for (const f of manifest.conteudo.slice(0, 5)) assert.equal(createHash('sha256').update(await zip.file(f.caminho)!.async('uint8array')).digest('hex'), f.sha256);
  // Nada de outro tenant nem de segredo de sessão.
  const all = (await Promise.all(names.filter(n => n.endsWith('.json') || n.endsWith('.csv')).map(n => zip.file(n)!.async('string')))).join('\n');
  assert.ok(!all.includes('outra.com.br'), 'dado de outro tenant na exportação');
  assert.ok(!all.includes('token_hash') && !names.some(n => /sess/.test(n)), 'sessões não são exportadas');
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and action like 'exportacao%' order by seq`, [A.tenantId])).rows.map(x => x.action);
  assert.deepEqual(acts, ['exportacao_completa_solicitada', 'exportacao_completa_gerada', 'exportacao_completa_baixada']);
});

test('exclusão total: só a plataforma, com confirmação; nada do tenant sobra no banco nem no armazenamento', async () => {
  const sessionA = await loginAs(db, people.userA);                            // sessão aberta antes da exclusão
  const bRowsBefore = await rowsOf(B.tenantId);
  const bObjects = (await objects.list(`tenants/${B.tenantId}/`)).length;
  assert.ok(await rowsOf(A.tenantId) > 50);
  assert.ok((await objects.list(`tenants/${A.tenantId}/`)).length >= 4);        // base, execução (2), exportação
  assert.equal((await post(A.userId, '/api/platform/tenants/repet/delete', { confirmacao: 'repet', motivo: 'Fim do contrato em 30/09/2026.' })).statusCode, 403);
  assert.equal((await post(P.userId, '/api/platform/tenants/repet/delete', { confirmacao: 'repe', motivo: 'Fim do contrato em 30/09/2026.' })).json().error, 'confirmacao_nao_confere');
  assert.equal((await post(P.userId, '/api/platform/tenants/theneil/delete', { confirmacao: 'theneil', motivo: 'Tentativa de apagar a plataforma.' })).statusCode, 409);
  const r = await post(P.userId, '/api/platform/tenants/repet/delete', { confirmacao: 'repet', motivo: 'Fim do contrato em 30/09/2026.' });
  assert.equal(r.statusCode, 200, r.body);
  const receipt = r.json();
  assert.equal(receipt.verificacao.ok, true);
  assert.equal(receipt.verificacao.linhasRestantes, 0);
  assert.equal(receipt.verificacao.objetosRestantes, 0);
  assert.ok(receipt.registros.runs === 1 && receipt.registros.audit_log > 10);
  assert.match(receipt.auditoria.hashFinal, /^[a-f0-9]{64}$/);
  // Conferência independente do teste: banco e armazenamento.
  assert.equal(await rowsOf(A.tenantId), 0);
  assert.equal((await objects.list(`tenants/${A.tenantId}/`)).length, 0);
  // O outro cliente segue intacto, com a auditoria íntegra.
  assert.equal(await rowsOf(B.tenantId), bRowsBefore);
  assert.equal((await objects.list(`tenants/${B.tenantId}/`)).length, bObjects);
  assert.equal((await get(people.keyB, '/api/audit/verify')).json().ok, true);
  // Comprovante guardado fora do tenant e registrado na auditoria da plataforma.
  const dels = (await get(P.userId, '/api/platform/deletions')).json();
  assert.deepEqual([dels[0].tenant_slug, dels[0].receipt_sha256], ['repet', receipt.sha256]);
  const last = (await db.owner.query(`select action, details from audit_log where tenant_id = $1 order by seq desc limit 1`, [P.tenantId])).rows[0];
  assert.deepEqual([last.action, last.details.slug, last.details.ok], ['tenant_excluido', 'repet', true]);
  // As sessões de quem era do tenant deixam de valer.
  assert.equal((await app.inject({ url: '/api/session', headers: sessionA.headers })).statusCode, 401);
});
