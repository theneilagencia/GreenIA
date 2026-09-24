import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { parseCsv } from '../src/util/csv.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
let T: Awaited<ReturnType<typeof seedTenant>>;
let P: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
const mes = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const hoje = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);

const post = async (userId: string, url: string, payload: object) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'financeiro', 'Financeiro')`, [T.tenantId]);
  people.user = await addPerson(db, T.tenantId, 'ana@repet.com.br', 'usuario', 'financeiro');
  app = await buildTestApp(db, { fake });
  fake.completeReply = () => '## Situação\nOk.';
  const r = await post(T.userId, '/api/admin/assistants', { slug: 'resumo', name: 'Resumo financeiro', areaSlug: 'financeiro', status: 'ativo',
    definition: { inputs: { text: { enabled: true }, files: { enabled: true, accept: ['texto'] } }, pipeline: [{ bloco: 'ler' }, { bloco: 'resumir', params: { topicos: ['Situação'] } }] } });
  assert.equal(r.statusCode, 201, r.body);
});
after(async () => { await app?.close(); await db?.drop(); });

test('consumo pela tabela de preços vigente, com a linha usada registrada', async () => {
  assert.equal((await post(people.user, '/api/chat', { messages: [{ role: 'user', content: 'Resuma: reunião na quinta.' }] })).statusCode, 200);
  const e = (await db.owner.query(`select e.*, p.model as pmodel, p.usd_brl from usage_events e join price_tables p on p.id = e.price_id where e.tenant_id = $1`, [T.tenantId])).rows[0];
  assert.equal(e.pmodel, 'claude-haiku-4-5');
  const expected = Math.round((e.input_tokens * 1 + e.output_tokens * 5) / 1e6 * Number(e.usd_brl) * 1e6) / 1e6;
  assert.equal(Number(e.cost_brl), expected);
});

test('TheNeil cadastra preço novo com vigência; consumo seguinte usa o novo, inclusive por página', async () => {
  const price = { provider: 'anthropic', model: 'claude-haiku-4-5', inputPerMTokUsd: 1, outputPerMTokUsd: 5, perPageBrl: 0.1, usdBrl: 6, validFrom: hoje, source: 'contrato de processamento de documentos, anexo II' };
  assert.equal((await post(T.userId, '/api/platform/prices', price)).statusCode, 403);
  assert.equal((await post(P.userId, '/api/platform/prices', price)).statusCode, 201);
  assert.equal((await post(P.userId, '/api/platform/prices', price)).json().error, 'ja_existe_preco_nessa_data');
  const files = [{ name: 'dre.txt', contentBase64: Buffer.from('DRE de agosto: receita 1,2 mi.').toString('base64') }];
  const r = await post(people.user, '/api/runs', { assistant: 'resumo', text: 'Resuma.', files });
  assert.equal(r.statusCode, 202, r.body);
  const e = (await db.owner.query(`select e.*, p.usd_brl, p.per_page_brl from usage_events e join price_tables p on p.id = e.price_id where e.run_id = $1`, [r.json().runId])).rows[0];
  assert.deepEqual([Number(e.usd_brl), Number(e.per_page_brl), e.pages], [6, 0.1, 1]);
  const expected = Math.round(((e.input_tokens * 1 + e.output_tokens * 5) / 1e6 * 6 + 1 * 0.1) * 1e6) / 1e6;
  assert.equal(Number(e.cost_brl), expected);
  const prices = (await get(P.userId, '/api/platform/prices')).json();
  assert.equal(prices.filter((x: { model: string }) => x.model === 'claude-haiku-4-5').length, 2);
});

test('relatório mensal do tenant: por assistente, por pessoa e por dia; CSV e XLSX para faturamento', async () => {
  const r = (await get(T.userId, `/api/usage/report?mes=${mes}`)).json();
  assert.equal(r.total.chamadas, 2);
  assert.deepEqual(r.porAssistente.map((x: { assistente: string }) => x.assistente).sort(), ['(chat livre)', 'resumo']);
  assert.deepEqual(r.porPessoa.map((x: { pessoa: string }) => x.pessoa), ['ana@repet.com.br']);
  assert.equal(r.porDia[0].dia, hoje);
  assert.equal(r.total.paginas, 1);
  assert.equal(r.precos.length, 2);                                  // as duas linhas de preço usadas no mês
  const csv = parseCsv((await get(T.userId, `/api/usage/report?mes=${mes}&format=csv`)).body);
  assert.deepEqual(csv[0].slice(0, 3), ['mes', 'assistente', 'nome']);
  const x = await get(T.userId, `/api/usage/report?mes=${mes}&format=xlsx`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Resumo', 'Por assistente', 'Por pessoa', 'Por dia', 'Preços usados']);
  assert.equal((await get(people.user, `/api/usage/report?mes=${mes}`)).statusCode, 403);
  const plat = (await get(P.userId, `/api/platform/usage?mes=${mes}`)).json();
  assert.deepEqual(plat.map((p: { cliente: string; chamadas: number }) => [p.cliente, p.chamadas]), [['repet', 2]]);
});

test('simulador: premissa sem histórico, média medida com histórico, conferência sem modelo e mensalidade', async () => {
  const body = { mensalidadeBrl: 1500, itens: [
    { nome: 'Resumo financeiro', assistente: 'resumo', execucoesPorMes: 200, paginasPorExecucao: 5 },
    { nome: 'Conferência de NF-e', execucoesPorMes: 800, paginasPorExecucao: 2, usaModelo: false },
    { nome: 'Recibos digitalizados', execucoesPorMes: 100, paginasPorExecucao: 1, percentualDigitalizado: 100 },
    { nome: 'Recibos com OCR bom', execucoesPorMes: 100, paginasPorExecucao: 1, percentualDigitalizado: 100, percentualFallbackVisao: 0 },
  ] };
  let s = (await post(T.userId, '/api/usage/simulate', body)).json();
  assert.match(s.itens[0].base, /^premissa/);
  assert.equal(s.itens[0].tokensEntrada, 200 * (1200 + 5 * 750));
  assert.equal(s.itens[1].tokensEntrada, 0);
  assert.equal(s.itens[1].paginasPorMes, 1600);
  // Digitalizada: OCR local (texto) + 10% das páginas no fallback de visão (imagem na entrada, transcrição na saída).
  assert.equal(s.itens[2].tokensEntrada, 100 * (1200 + 750 + 0.1 * 2300));
  assert.equal(s.itens[2].tokensSaida, 100 * (800 + 0.1 * 750));
  assert.equal(s.itens[3].tokensEntrada, 100 * (1200 + 750));
  assert.equal(s.premissas.percentualFallbackVisao, 10);
  assert.equal(s.preco.porPaginaBrl, 0.1);
  assert.equal(s.totalMensalBrl, Math.round((s.consumoMensalBrl + 1500) * 100) / 100);
  assert.match(s.aviso, /Projeção/);
  // Com 5 execuções medidas, o simulador usa as médias reais do assistente.
  const aid = (await db.owner.query(`select id, area_id from assistants where slug = 'resumo'`)).rows[0];
  for (let i = 0; i < 5; i++) {
    await db.owner.query(`insert into runs (tenant_id, assistant_id, assistant_version, area_id, user_id, status, input_sha256, input_tokens, output_tokens, pages, expires_at)
      values ($1, $2, 1, $3, $4, 'aprovado', 'x', 4000, 500, 2, now() + interval '30 days')`, [T.tenantId, aid.id, aid.area_id, people.user]);
  }
  s = (await post(T.userId, '/api/usage/simulate', body)).json();
  assert.match(s.itens[0].base, /^medido: médias de \d+ execuções/);
  const avg = Number((await db.owner.query(`select avg(output_tokens) as a from runs where assistant_id = $1 and status not in ('processando', 'erro')`, [aid.id])).rows[0].a);
  assert.equal(s.itens[0].tokensSaida, Math.round(avg * 200));
  assert.equal((await post(people.user, '/api/usage/simulate', body)).statusCode, 403);
  // Simulador da plataforma (proposta comercial): só premissas, mesmo se o slug existir num cliente.
  const ps = (await post(P.userId, '/api/platform/simulate', body)).json();
  assert.match(ps.itens[0].base, /^premissa/);
});
