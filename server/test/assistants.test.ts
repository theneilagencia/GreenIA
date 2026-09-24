import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};

// Conferência de NF-e contra pedido: o exemplo do contrato.
const CONFERENCIA = {
  description: 'Confere a NF-e de entrada contra o pedido de compra.',
  objective: 'Apontar divergências entre a nota e o pedido antes do lançamento.',
  inputs: { files: { enabled: true, required: true, accept: ['nfe_xml', 'xlsx'] } },
  pipeline: [
    { bloco: 'ler' },
    { bloco: 'conferir', id: 'nota-pedido', params: {
      esquerda: { de: 'nfe', caminho: 'itens' }, direita: { de: 'tabela', arquivo: '*pedido*' },
      rotulos: { esquerda: 'Nota', direita: 'Pedido' },
      chave: { esquerda: 'codigo', direita: 'Código' },
      regras: [
        { campo: 'Quantidade', esquerda: 'quantidade', direita: 'Quantidade', tipo: 'numero' },
        { campo: 'Valor unitário', esquerda: 'valorUnitario', direita: 'Preço', tipo: 'numero', tolerancia: { percentual: 1 } },
      ] } },
    { bloco: 'exportar', params: { formatos: ['xlsx', 'pdf'] } },
  ],
  output: { format: 'tabela', files: ['xlsx', 'pdf'] },
  review: { checklist: ['Confira os itens sem par no pedido.'] },
  metrics: { indicators: [{ key: 'tempo_por_nota', label: 'Tempo por nota', unit: 'min', auto: 'tempo_processamento' }] },
};

const post = async (userId: string, url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload: payload as object });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal'), ($1, 'rh', 'RH')`, [T.tenantId]);
  people.keyFiscal = await addPerson(db, T.tenantId, 'key.fiscal@repet.com.br', 'key_user', 'fiscal');
  people.keyRh = await addPerson(db, T.tenantId, 'key.rh@repet.com.br', 'key_user', 'rh');
  app = await buildTestApp(db);
});
after(async () => { await app?.close(); await db?.drop(); });

test('definição da Fase 2 (v1) continua aceita e vira v2 com os padrões', () => {
  const d = assistantDefinitionSchema.parse({ instructions: 'Resuma.', dataClasses: ['verde'] });
  assert.equal(d.schemaVersion, 2);
  assert.equal(d.instructions, 'Resuma.');
  assert.deepEqual(d.pipeline, []);
  assert.equal(d.review.required, true);
  assert.deepEqual(d.review.reviewers, ['revisor', 'key_user']);
  assert.equal(assistantDefinitionSchema.parse({ schemaVersion: 1 }).schemaVersion, 2);
});

test('definição inválida é recusada com o caminho do problema', async () => {
  const bad = (def: unknown) => post(people.keyFiscal, '/api/admin/assistants', { slug: 'x-' + Math.random().toString(36).slice(2, 8), name: 'X', areaSlug: 'fiscal', definition: def });
  let r = await bad({ ...CONFERENCIA, pipeline: [{ bloco: 'conferir', params: { esquerda: { de: 'nfe' }, direita: { de: 'tabela' }, regras: [] } }] });
  assert.equal(r.statusCode, 400);
  assert.ok(r.json().detalhes.some((d: string) => d.startsWith('pipeline.0.params.regras')), r.body);
  r = await bad({ ...CONFERENCIA, pipeline: [{ bloco: 'inventado' }] });
  assert.equal(r.statusCode, 400);
  r = await bad({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'extrair', params: { schema: { type: 'object', properties: { a: { type: 'banana' } } } } }] });
  assert.ok(r.json().detalhes.some((d: string) => d.startsWith('pipeline.0.params.schema')), r.body);
  r = await bad({ output: { format: 'json' } });
  assert.ok(r.json().detalhes.some((d: string) => d.startsWith('output.schema')), r.body);
  r = await bad({ pipeline: [{ bloco: 'ler' }] });
  assert.ok(r.json().detalhes.some((d: string) => d.startsWith('inputs.files.enabled')), r.body);
  r = await bad({ pipeline: [{ bloco: 'ler' }, { bloco: 'ler' }], inputs: { files: { enabled: true } } });
  assert.ok(r.json().detalhes.some((d: string) => /id repetido/.test(d)), r.body);
});

test('criar, editar e mudar status: cada alteração é uma versão, com auditoria', async () => {
  let r = await post(people.keyFiscal, '/api/admin/assistants', { slug: 'conferencia-nfe', name: 'Conferência de NF-e', areaSlug: 'fiscal', definition: CONFERENCIA });
  assert.equal(r.statusCode, 201, r.body);
  r = await post(people.keyFiscal, '/api/admin/assistants/conferencia-nfe/versions', { definition: { ...CONFERENCIA, objective: 'Novo objetivo.' } });
  assert.equal(r.json().version, 2);
  r = await post(people.keyFiscal, '/api/admin/assistants/conferencia-nfe/status', { status: 'piloto', motivo: 'Início do piloto' });
  assert.deepEqual(r.json(), { slug: 'conferencia-nfe', version: 3, status: 'piloto' });
  // Mesmo status de novo: nada muda.
  r = await post(people.keyFiscal, '/api/admin/assistants/conferencia-nfe/status', { status: 'piloto' });
  assert.equal(r.json().version, 3);
  const d = (await get(people.keyFiscal, '/api/admin/assistants/conferencia-nfe')).json();
  assert.equal(d.status, 'piloto');
  assert.equal(d.definition.objective, 'Novo objetivo.');
  assert.deepEqual(d.versions.map((v: { version: number }) => v.version), [3, 2, 1]);
  assert.equal(d.definition.pipeline[1].id, 'nota-pedido');
  const v1 = (await get(people.keyFiscal, '/api/admin/assistants/conferencia-nfe/versions/1')).json();
  assert.equal(v1.definition.objective, CONFERENCIA.objective);
  const acts = (await db.owner.query(`select action, target, details from audit_log where tenant_id = $1 and target like 'assistente:conferencia-nfe%' order by seq`, [T.tenantId])).rows;
  assert.deepEqual(acts.map(x => x.action), ['assistente_criado', 'assistente_nova_versao', 'assistente_status']);
  assert.deepEqual(acts[2].details, { de: 'rascunho', para: 'piloto', motivo: 'Início do piloto' });
});

test('key user de outra área não vê nem altera o assistente', async () => {
  assert.equal((await get(people.keyRh, '/api/admin/assistants/conferencia-nfe')).statusCode, 404); // RLS: nem aparece
  assert.equal((await post(people.keyRh, '/api/admin/assistants/conferencia-nfe/status', { status: 'ativo' })).statusCode, 404);
});

test('pacote portátil: Markdown e JSON que rodam em outra plataforma', async () => {
  const r = await get(people.keyFiscal, '/api/admin/assistants/conferencia-nfe/package');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'application/zip');
  assert.match(r.headers['content-disposition'] as string, /conferencia-nfe-v3\.zip/);
  const zip = await JSZip.loadAsync(r.rawPayload);
  const names = Object.keys(zip.files).filter(n => !n.endsWith('/')).sort();
  assert.deepEqual(names, ['README.md', 'checklist-revisao.md', 'definicao.json', 'exemplos.md', 'instrucoes.md', 'schema-saida.json'].map(n => 'conferencia-nfe/' + n));
  const instr = await zip.file('conferencia-nfe/instrucoes.md')!.async('string');
  assert.match(instr, /\| Valor unitário \| valorUnitario \| Preço \| numero \(tolerância 1%\) \|/);
  assert.match(instr, /casando os registros por codigo = Código/);
  assert.match(instr, /Na GreenIA esta comparação é feita em código/);
  const check = await zip.file('conferencia-nfe/checklist-revisao.md')!.async('string');
  assert.match(check, /- \[ \] Confira os itens sem par no pedido\./);
  assert.match(check, /- \[ \] Cada divergência listada confere/);
  const def = JSON.parse(await zip.file('conferencia-nfe/definicao.json')!.async('string'));
  assert.equal(def.version, 3);
  assert.equal(def.definition.pipeline.length, 3);
  // A definição exportada volta a ser uma definição válida (reimportável).
  assert.doesNotThrow(() => assistantDefinitionSchema.parse(def.definition));
  const md = await get(people.keyFiscal, '/api/admin/assistants/conferencia-nfe/package?format=md&version=1');
  assert.match(md.headers['content-type'] as string, /text\/markdown/);
  assert.match(md.body, /Apontar divergências entre a nota e o pedido/);
  const last = (await db.owner.query(`select action, details from audit_log where tenant_id = $1 order by seq desc limit 1`, [T.tenantId])).rows[0];
  assert.deepEqual([last.action, last.details.formato], ['assistente_exportado', 'md']);
});
