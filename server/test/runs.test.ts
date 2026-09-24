import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, enableReaders, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider, LlmError } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { makeRetentionSweep } from '../src/retention/retention.ts';
import { nfeXml, xlsx } from './fixtures.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
const objects = new MemoryObjectStore();
let T: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString('base64');

const CONFERENCIA = {
  inputs: { text: { enabled: false }, files: { enabled: true, required: true, accept: ['nfe_xml', 'xlsx'], maxFiles: 5 } },
  dataClasses: ['verde', 'amarela'], dataPolicy: { cnpj: 'permitir_com_registro' },
  pipeline: [
    { bloco: 'ler' },
    { bloco: 'conferir', id: 'nota-pedido', params: {
      esquerda: { de: 'nfe', caminho: 'itens' }, direita: { de: 'tabela', arquivo: '*pedido*' }, rotulos: { esquerda: 'Nota', direita: 'Pedido' },
      chave: { esquerda: 'codigo', direita: 'Código' },
      regras: [{ campo: 'Quantidade', esquerda: 'quantidade', direita: 'Quantidade', tipo: 'numero' }] } },
    { bloco: 'exportar', params: { formatos: ['xlsx', 'pdf'] } },
  ],
};
const RESUMO = {
  inputs: { text: { enabled: true }, files: { enabled: true, accept: ['texto', 'pdf'] } },
  dataPolicy: { telefone: 'mascarar' },
  pipeline: [{ bloco: 'ler' }, { bloco: 'resumir', params: { topicos: ['Situação', 'Riscos'] } }],
};

async function nfeFiles(qtdNota = 48) {
  return [
    { name: 'nfe-1234.xml', contentBase64: b64(nfeXml({ numero: '1234', emissao: '2026-09-02', itens: [{ codigo: 'P-001', descricao: 'Caixa', qtd: 100, unit: 12.5 }, { codigo: 'P-002', descricao: 'Tampa', qtd: qtdNota, unit: 3.2 }] })), mime: 'application/xml' },
    { name: 'pedido-4500123.xlsx', contentBase64: b64(await xlsx({ Pedido: [['Código', 'Quantidade'], ['P-001', 100], ['P-002', 50]] })) },
  ];
}
const send = async (userId: string, payload: object) => app.inject({ method: 'POST', url: '/api/runs', headers: (await loginAs(db, userId)).headers, payload });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  await enableReaders(db.owner, T.tenantId);                     // este cliente lida com NF-e
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal'), ($1, 'rh', 'RH'), ($1, 'financeiro', 'Financeiro')`, [T.tenantId]);
  people.keyFiscal = await addPerson(db, T.tenantId, 'key.fiscal@repet.com.br', 'key_user', 'fiscal');
  people.fiscal = await addPerson(db, T.tenantId, 'ana.fiscal@repet.com.br', 'usuario', 'fiscal');
  people.fiscal2 = await addPerson(db, T.tenantId, 'bia.fiscal@repet.com.br', 'usuario', 'fiscal');
  people.rh = await addPerson(db, T.tenantId, 'rh@repet.com.br', 'usuario', 'rh');
  people.fin = await addPerson(db, T.tenantId, 'fin@repet.com.br', 'usuario', 'financeiro');
  app = await buildTestApp(db, { fake, objects });
  const mk = async (slug: string, areaSlug: string, definition: object, status = 'piloto') => {
    const r = await app.inject({ method: 'POST', url: '/api/admin/assistants', headers: (await loginAs(db, T.userId)).headers, payload: { slug, name: slug, areaSlug, status, definition } });
    assert.equal(r.statusCode, 201, r.body);
  };
  await mk('conferencia-nfe', 'fiscal', CONFERENCIA);
  await mk('resumo-fin', 'financeiro', RESUMO);
  await mk('rascunho-fin', 'financeiro', RESUMO, 'rascunho');
  await mk('conversa-fin', 'financeiro', { instructions: 'Converse.' });
});
after(async () => { await app?.close(); await db?.drop(); });

let runId = '';

test('execução de ponta a ponta: entradas guardadas, pipeline na fila, saída em rascunho com a versão e os hashes', async () => {
  const r = await send(people.fiscal, { assistant: 'conferencia-nfe', files: await nfeFiles() });
  assert.equal(r.statusCode, 202, r.body);
  runId = r.json().runId;
  const d = (await get(people.fiscal, `/api/runs/${runId}`)).json();
  assert.equal(d.status, 'rascunho');
  assert.equal(d.version, 1);
  assert.equal(d.divergences, 1);
  assert.equal(d.result.sections.length, 3);
  assert.equal(d.result.sections[1].data.divergencias[0].motivo, 'diferença de -2 (-4,00%)');
  assert.deepEqual(d.files.map((f: { name: string; kind: string; pages: number }) => [f.name, f.kind, f.pages]), [['nfe-1234.xml', 'nfe_xml', 1], ['pedido-4500123.xlsx', 'xlsx', 1]]);
  assert.deepEqual(d.exportFormats, ['xlsx', 'pdf']);
  assert.equal(d.pages, 2);
  assert.equal(d.canReview, false);                                   // quem executou não revisa (revisão obrigatória)
  // Arquivos no prefixo do tenant; nada foi ao modelo (conferência é em código).
  assert.equal((await objects.list(`tenants/${T.tenantId}/runs/${runId}/`)).length, 2);
  assert.equal(fake.completions.length, 0);
  const acts = (await db.owner.query(`select action, details from audit_log where tenant_id = $1 and target = $2 order by seq`, [T.tenantId, `execucao:${runId}`])).rows;
  assert.deepEqual(acts.map(x => x.action), ['execucao_iniciada', 'execucao_concluida']);
  const done = acts[1].details;
  assert.equal(done.versao, 1);
  assert.equal(done.entradas.length, 2);
  assert.match(done.saida, /^[a-f0-9]{64}$/);
  // Consumo: sem tokens, mas com páginas processadas.
  const u = (await db.owner.query(`select pages, input_tokens from usage_events where run_id = $1`, [runId])).rows[0];
  assert.deepEqual([u.pages, u.input_tokens], [2, 0]);
});

test('entradas fora da definição são recusadas antes de aceitar', async () => {
  const files = await nfeFiles();
  assert.equal((await send(people.fiscal, { assistant: 'conferencia-nfe', files: [] })).json().error, 'arquivo_obrigatorio');
  assert.equal((await send(people.fiscal, { assistant: 'conferencia-nfe', files, text: 'oi' })).json().error, 'texto_nao_aceito');
  const pdf = { name: 'x.pdf', contentBase64: b64('%PDF-1.4 x') };
  const r = await send(people.fiscal, { assistant: 'conferencia-nfe', files: [pdf] });
  assert.equal(r.statusCode, 415);
  assert.equal((await send(people.fiscal, { assistant: 'conferencia-nfe', files: Array(6).fill(files[0]) })).json().error, 'arquivos_demais');
  assert.equal((await send(people.fiscal, { assistant: 'conferencia-nfe', files: [files[0], files[0]] })).json().error, 'nomes_repetidos');
  assert.equal((await send(people.fin, { assistant: 'rascunho-fin', text: 'x' })).statusCode, 404);       // ainda em rascunho
  assert.equal((await send(people.fin, { assistant: 'conversa-fin', text: 'x' })).statusCode, 409);      // assistente de conversa
  assert.equal((await send(people.rh, { assistant: 'conferencia-nfe', files })).statusCode, 404);        // outra área
});

test('assistente de execução não roda pelo chat', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/chat', headers: (await loginAs(db, people.fiscal)).headers, payload: { assistant: 'conferencia-nfe', messages: [{ role: 'user', content: 'oi' }] } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().error, 'assistente_de_execucao');
});

test('política de dados: bloqueio e confirmação antes de aceitar; mascaramento no envio ao modelo', async () => {
  fake.completeReply = () => '## Situação\nOk.\n## Riscos\nNenhum.';
  let r = await send(people.fin, { assistant: 'resumo-fin', text: 'Cliente CPF 529.982.247-25 atrasou.' });
  assert.equal(r.statusCode, 422);
  assert.deepEqual(r.json().types, ['cpf']);
  // Email: "avisar" na política padrão; também dentro dos arquivos.
  const files = [{ name: 'contatos.txt', contentBase64: b64('Falar com ana@fornecedor.com.br') }];
  r = await send(people.fin, { assistant: 'resumo-fin', text: 'Resuma.', files });
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.json().types, ['email']);
  const before = fake.completions.length;
  r = await send(people.fin, { assistant: 'resumo-fin', text: 'Resuma. Telefone do gerente: (11) 98765-4321.', files, confirmedWarnings: ['email'] });
  assert.equal(r.statusCode, 202, r.body);
  const sent = fake.completions.slice(before).map(c => c.content.map(p => p.type === 'text' ? p.text : '').join()).join();
  assert.ok(!sent.includes('98765-4321'), 'telefone deveria ir mascarado');
  assert.ok(sent.includes('ana@fornecedor.com.br'), 'email confirmado segue');
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and target = $2 order by seq`, [T.tenantId, `execucao:${r.json().runId}`])).rows.map(x => x.action);
  assert.deepEqual(acts, ['execucao_iniciada', 'dado_mascarado', 'dado_enviado_com_registro', 'execucao_concluida']);
  const d = (await get(people.fin, `/api/runs/${r.json().runId}`)).json();
  assert.equal(d.status, 'rascunho');
  assert.ok(d.costBrl > 0);
});

test('quem vê a execução: quem executou, key user e revisores da área, admin; outros não', async () => {
  assert.equal((await get(people.keyFiscal, `/api/runs/${runId}`)).json().canReview, true);
  assert.equal((await get(T.userId, `/api/runs/${runId}`)).statusCode, 200);
  assert.equal((await get(people.fiscal2, `/api/runs/${runId}`)).statusCode, 404);   // colega da área sem papel de revisão
  assert.equal((await get(people.rh, `/api/runs/${runId}`)).statusCode, 404);
  const mine = (await get(people.fiscal, '/api/runs')).json();
  assert.deepEqual(mine.map((x: { id: string }) => x.id), [runId]);
  const toReview = (await get(people.keyFiscal, '/api/runs?escopo=revisar')).json();
  assert.ok(toReview.some((x: { id: string }) => x.id === runId));
  assert.equal((await get(people.fiscal2, '/api/runs?escopo=revisar')).json().length, 0);
});

test('arquivo original disponível para a revisão; histórico do arquivo pelo hash', async () => {
  const d = (await get(people.keyFiscal, `/api/runs/${runId}`)).json();
  const f = d.files[0];
  const r = await get(people.keyFiscal, `/api/runs/${runId}/files/${f.id}`);
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /<nNF>1234<\/nNF>/);
  assert.equal((await get(people.rh, `/api/runs/${runId}/files/${f.id}`)).statusCode, 404);
  const h = (await get(people.keyFiscal, `/api/audit/history?sha256=${f.sha256}`)).json();
  assert.deepEqual(h.map((x: { action: string }) => x.action), ['execucao_iniciada', 'execucao_concluida']);
  const byRun = (await get(people.keyFiscal, `/api/audit/history?execucao=${runId}`)).json();
  assert.equal(byRun.length, 2);
});

test('falha do modelo numa etapa: execução em erro, com o motivo e a auditoria', async () => {
  fake.failWith = new LlmError('requisição recusada pelo provedor', false, 400);
  try {
    const r = await send(people.fin, { assistant: 'resumo-fin', text: 'Resuma o mês.' });
    const d = (await get(people.fin, `/api/runs/${r.json().runId}`)).json();
    assert.equal(d.status, 'erro');
    assert.match(d.error, /etapa resumir: requisição recusada/);
    const last = (await db.owner.query(`select action from audit_log where target = $1 order by seq desc limit 1`, [`execucao:${d.id}`])).rows[0];
    assert.equal(last.action, 'execucao_com_erro');
  } finally { fake.failWith = null; }
});

test('retenção: execução vencida some do banco e do armazenamento', async () => {
  const r = await send(people.fiscal, { assistant: 'conferencia-nfe', files: await nfeFiles(50) });
  const id = r.json().runId;
  await db.owner.query(`update runs set expires_at = now() - interval '1 minute' where id = $1`, [id]);
  const n = await makeRetentionSweep(db.app, objects)();
  assert.ok(n >= 1);
  assert.equal((await db.owner.query(`select 1 from runs where id = $1`, [id])).rowCount, 0);
  assert.equal((await db.owner.query(`select 1 from run_files where run_id = $1`, [id])).rowCount, 0);
  assert.equal((await objects.list(`tenants/${T.tenantId}/runs/${id}/`)).length, 0);
  assert.equal((await objects.list(`tenants/${T.tenantId}/runs/${runId}/`)).length, 2);   // as outras continuam
});
