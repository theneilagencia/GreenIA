import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { createTestDb, seedTenant, enableReaders, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { nfeXml, xlsx } from './fixtures.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString('base64');

const def = (review: object) => ({
  inputs: { text: { enabled: false }, files: { enabled: true, required: true, accept: ['nfe_xml', 'xlsx'] } },
  dataClasses: ['verde', 'amarela'],
  pipeline: [
    { bloco: 'ler' },
    { bloco: 'conferir', id: 'nota-pedido', titulo: 'Nota × pedido', params: {
      esquerda: { de: 'nfe', caminho: 'itens' }, direita: { de: 'tabela', arquivo: '*pedido*' }, rotulos: { esquerda: 'Nota', direita: 'Pedido' },
      chave: { esquerda: 'codigo', direita: 'Código' }, regras: [{ campo: 'Quantidade', esquerda: 'quantidade', direita: 'Quantidade', tipo: 'numero' }] } },
  ],
  output: { format: 'tabela', files: ['xlsx', 'csv'] },
  review,
});

async function newRun(userId: string, assistant = 'conferencia-nfe') {
  const files = [
    { name: 'nfe-1.xml', contentBase64: b64(nfeXml({ numero: '1', emissao: '2026-09-02', itens: [{ codigo: 'P-001', descricao: 'Caixa', qtd: 48, unit: 1 }, { codigo: 'P-002', descricao: 'Tampa', qtd: 5, unit: 1 }] })) },
    { name: 'pedido.xlsx', contentBase64: b64(await xlsx({ P: [['Código', 'Quantidade'], ['P-001', 50], ['P-002', 6]] })) },
  ];
  const r = await app.inject({ method: 'POST', url: '/api/runs', headers: (await loginAs(db, userId)).headers, payload: { assistant, files } });
  assert.equal(r.statusCode, 202, r.body);
  return r.json().runId as string;
}
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });
const review = async (userId: string, id: string, payload: object) =>
  app.inject({ method: 'POST', url: `/api/runs/${id}/review`, headers: (await loginAs(db, userId)).headers, payload });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  await enableReaders(db.owner, T.tenantId);                     // este cliente lida com NF-e
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal')`, [T.tenantId]);
  people.user = await addPerson(db, T.tenantId, 'ana@repet.com.br', 'usuario', 'fiscal');
  people.revisor = await addPerson(db, T.tenantId, 'rev@repet.com.br', 'revisor', 'fiscal');
  people.key = await addPerson(db, T.tenantId, 'key@repet.com.br', 'key_user', 'fiscal');
  app = await buildTestApp(db, { objects: new MemoryObjectStore() });
  for (const [slug, review] of [['conferencia-nfe', { reviewers: ['key_user'] }], ['conferencia-livre', { required: false }]] as const) {
    const r = await app.inject({ method: 'POST', url: '/api/admin/assistants', headers: (await loginAs(db, T.userId)).headers, payload: { slug, name: 'Conferência de NF-e', areaSlug: 'fiscal', status: 'ativo', definition: def(review) } });
    assert.equal(r.statusCode, 201, r.body);
  }
});
after(async () => { await app?.close(); await db?.drop(); });

test('rascunho não é exportado; autor não revisa; papel fora da lista de revisores também não', async () => {
  const id = await newRun(people.user);
  assert.equal((await get(people.user, `/api/runs/${id}/export?format=xlsx`)).json().error, 'saida_nao_aprovada');
  assert.equal((await review(people.user, id, { decisao: 'aprovado' })).json().error, 'autor_nao_revisa');
  assert.equal((await review(people.revisor, id, { decisao: 'aprovado' })).json().error, 'sem_permissao_de_revisao');   // o assistente só aceita key user
  assert.equal((await get(people.revisor, `/api/runs/${id}`)).json().canReview, false);
  assert.equal((await get(people.key, `/api/runs/${id}`)).json().canReview, true);
});

test('aprovado com edição: guarda a saída original, a editada e o diff; a exportação usa a editada', async () => {
  const id = await newRun(people.user);
  const d = (await get(people.key, `/api/runs/${id}`)).json();
  const sections = structuredClone(d.result.sections);
  // O revisor descarta a divergência do P-002 (tolerância combinada com o fornecedor) e anota o motivo.
  sections[1].data.divergencias = sections[1].data.divergencias.filter((x: { chave: string }) => x.chave !== 'P-002');
  sections[1].data.resumo.divergencias = 1;
  const r = await review(people.key, id, { decisao: 'aprovado_com_edicao', resultadoEditado: { sections }, motivo: 'P-002: diferença aceita pelo comprador.' });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().secoesEditadas, ['nota-pedido']);
  const after = (await get(people.user, `/api/runs/${id}`)).json();
  assert.equal(after.status, 'aprovado_com_edicao');
  assert.equal(after.result.sections[1].data.divergencias.length, 2);            // original intacta
  assert.equal(after.editedResult.sections[1].data.divergencias.length, 1);
  assert.match(after.diff, /--- saida-original\.json/);
  assert.match(after.diff, /^-.*"chave": "P-002"/m);
  assert.deepEqual([after.review.by, after.review.reason], ['key@repet.com.br', 'P-002: diferença aceita pelo comprador.']);
  // Exportação final: só formatos previstos; conteúdo da versão revisada.
  assert.equal((await get(people.user, `/api/runs/${id}/export?format=pdf`)).json().error, 'formato_nao_previsto');
  const x = await get(people.user, `/api/runs/${id}/export?format=xlsx`);
  assert.equal(x.statusCode, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Nota × pedido')!;
  assert.equal(ws.rowCount, 2);                                                    // cabeçalho + 1 divergência
  assert.match(String(wb.getWorksheet('Identificação')!.getCell('A3').value), /aprovada com edição por key@repet\.com\.br/);
  const acts = (await db.owner.query(`select action, details from audit_log where target = $1 order by seq`, [`execucao:${id}`])).rows;
  assert.deepEqual(acts.map(a => a.action), ['execucao_iniciada', 'execucao_concluida', 'revisao_decidida', 'exportacao']);
  assert.notEqual(acts[2].details.saidaRevisada, acts[2].details.saidaOriginal);
  assert.equal(acts[3].details.versaoRevisada, true);
});

test('edição que muda a estrutura é recusada; edição sem mudança vira aprovação simples', async () => {
  const id = await newRun(people.user);
  const d = (await get(people.key, `/api/runs/${id}`)).json();
  let r = await review(people.key, id, { decisao: 'aprovado_com_edicao', resultadoEditado: { sections: d.result.sections.slice(1) } });
  assert.equal(r.json().error, 'saida_editada_invalida');
  r = await review(people.key, id, { decisao: 'aprovado_com_edicao' });
  assert.equal(r.json().error, 'saida_editada_obrigatoria');
  r = await review(people.key, id, { decisao: 'aprovado_com_edicao', resultadoEditado: { sections: d.result.sections } });
  assert.equal(r.json().status, 'aprovado');
  assert.equal((await get(people.user, `/api/runs/${id}`)).json().diff, null);
});

test('rejeição exige motivo; decisão é única; rejeitada não exporta', async () => {
  const id = await newRun(people.user);
  assert.equal((await review(people.key, id, { decisao: 'rejeitado' })).json().error, 'motivo_obrigatorio');
  assert.equal((await review(people.key, id, { decisao: 'rejeitado', motivo: 'Pedido errado anexado.' })).statusCode, 200);
  assert.equal((await review(people.key, id, { decisao: 'aprovado' })).json().error, 'nao_esta_em_revisao');
  assert.equal((await get(people.user, `/api/runs/${id}/export?format=csv`)).json().error, 'saida_nao_aprovada');
  assert.equal((await get(people.user, `/api/runs/${id}`)).json().review.reason, 'Pedido errado anexado.');
});

test('assistente com revisão opcional: o próprio autor pode aprovar', async () => {
  const id = await newRun(people.user, 'conferencia-livre');
  assert.equal((await review(people.user, id, { decisao: 'aprovado' })).statusCode, 200);
  const csv = await get(people.user, `/api/runs/${id}/export?format=csv`);
  assert.equal(csv.statusCode, 200);
  assert.match(csv.body, /^\uFEFFChave;Campo;Divergência/);
});
