import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { extractText, getDocumentProxy } from 'unpdf';
import { createTestDb, seedTenant, enableReaders, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
let assistantId = '';

const DEF = {
  inputs: { files: { enabled: true, accept: ['nfe_xml', 'xlsx'] } },
  pipeline: [{ bloco: 'ler' }],
  metrics: { indicators: [
    { key: 'tempo_por_nota', label: 'Tempo por nota', unit: 'min', direction: 'menor_melhor', auto: 'tempo_processamento' },
    { key: 'aprovacao', label: 'Aprovação sem edição', unit: '%', direction: 'maior_melhor', auto: 'aprovacao_sem_edicao' },
    { key: 'retrabalho', label: 'Notas com retrabalho por mês', unit: 'notas', direction: 'menor_melhor' },
  ] },
};

const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });
const post = async (userId: string, url: string, payload: object) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });
const results = async (userId = people.key) => (await get(userId, '/api/metrics/assistants/conferencia-nfe?de=2026-01-01&ate=2026-12-31')).json();

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  await enableReaders(db.owner, T.tenantId);                     // este cliente lida com NF-e
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'fiscal', 'Fiscal'), ($1, 'rh', 'RH')`, [T.tenantId]);
  people.key = await addPerson(db, T.tenantId, 'key@repet.com.br', 'key_user', 'fiscal');
  people.user = await addPerson(db, T.tenantId, 'ana@repet.com.br', 'usuario', 'fiscal');
  people.keyRh = await addPerson(db, T.tenantId, 'key.rh@repet.com.br', 'key_user', 'rh');
  app = await buildTestApp(db);
  const r = await post(T.userId, '/api/admin/assistants', { slug: 'conferencia-nfe', name: 'Conferência de NF-e', areaSlug: 'fiscal', status: 'piloto', definition: DEF });
  assert.equal(r.statusCode, 201, r.body);
  assistantId = (await db.owner.query(`select id from assistants where slug = 'conferencia-nfe'`)).rows[0].id;
});
after(async () => { await app?.close(); await db?.drop(); });

test('sem baseline: painel mostra "sem ponto de partida" e não calcula comparação nem ganho', async () => {
  const r = await results();
  assert.equal(r.semPontoDePartida, true);
  assert.match(r.aviso, /Sem ponto de partida/);
  assert.ok(r.indicadores.every((i: { lacuna: string; comparacao: unknown; acumuladoNoPeriodo: unknown }) => i.lacuna === 'sem ponto de partida' && i.comparacao === null && i.acumuladoNoPeriodo === null));
  const pdf = await get(people.key, '/api/metrics/assistants/conferencia-nfe/report?format=pdf&de=2026-01-01&ate=2026-12-31');
  assert.equal(pdf.statusCode, 200);
  const text = (await extractText(await getDocumentProxy(new Uint8Array(pdf.rawPayload)), { mergePages: true })).text;
  assert.match(text, /Sem ponto de partida/);
  assert.match(text, /Antes: — — sem ponto de partida/);
});

test('valor sem origem completa é recusado; indicador fora da definição também', async () => {
  const bad = async (x: object) => (await post(people.key, '/api/metrics/assistants/conferencia-nfe/values', { indicador: 'tempo_por_nota', fase: 'antes', valor: 12, ...x })).json();
  assert.ok((await bad({ origem: 'medido', metodo: 'cronômetro' })).detalhes.some((d: string) => /período/.test(d)));
  assert.ok((await bad({ origem: 'medido', periodoInicio: '2026-06-01', periodoFim: '2026-06-30' })).detalhes.some((d: string) => /método/.test(d)));
  assert.ok((await bad({ origem: 'informado' })).detalhes.some((d: string) => /quem informou/.test(d)));
  assert.equal((await bad({ origem: 'informado', informadoPor: 'x', indicador: 'inventado' })).error, 'indicador_nao_definido');
  assert.equal((await post(people.user, '/api/metrics/assistants/conferencia-nfe/values', { indicador: 'retrabalho', fase: 'antes', valor: 1, origem: 'informado', informadoPor: 'x' })).statusCode, 403);
});

test('antes × depois com origem visível; automático das execuções; diferença acumulada só com os dois lados', async () => {
  // Ponto de partida levantado no Discovery.
  let r = await post(people.key, '/api/metrics/assistants/conferencia-nfe/values', { indicador: 'tempo_por_nota', fase: 'antes', valor: 12, origem: 'medido', periodoInicio: '2026-06-01', periodoFim: '2026-06-30', metodo: 'cronometragem de 40 notas pela equipe fiscal' });
  assert.equal(r.statusCode, 201, r.body);
  await post(people.key, '/api/metrics/assistants/conferencia-nfe/values', { indicador: 'retrabalho', fase: 'antes', valor: 18, origem: 'informado', informadoPor: 'Coordenação fiscal (Discovery)' });
  // Execuções: 4 concluídas (3 revisadas: 2 sem edição, 1 com edição), 30 s de processamento cada.
  const ins = (status: string, reviewedMin: number | null) => db.owner.query(
    `insert into runs (tenant_id, assistant_id, assistant_version, area_id, user_id, status, input_sha256, processing_ms, created_at, finished_at, reviewed_at, divergences, cost_brl, pages, expires_at)
     select $1, $2, 1, area_id, $3, $4, 'x', 30000, '2026-09-10 10:00', '2026-09-10 10:01', case when $5::int is null then null else '2026-09-10 10:01'::timestamp + make_interval(mins => $5::int) end, 2, 0.05, 3, now() + interval '90 days'
     from assistants where id = $2`, [T.tenantId, assistantId, people.user, status, reviewedMin]);
  await ins('aprovado', 20); await ins('aprovado', 40); await ins('aprovado_com_edicao', 60); await ins('rascunho', null);
  const res = await results();
  assert.equal(res.semPontoDePartida, false);
  assert.equal(res.aviso, null);
  const t = res.indicadores.find((i: { key: string }) => i.key === 'tempo_por_nota');
  assert.deepEqual([t.antes.valor, t.antes.origem.tipo], [12, 'medido']);
  assert.match(t.antes.origem.detalhe, /medido de 2026-06-01 a 2026-06-30; método: cronometragem/);
  assert.deepEqual([t.depois.valor, t.depois.origem.tipo], [0.5, 'automatico']);                       // 30 s em minutos
  assert.match(t.depois.origem.detalhe, /não o tempo de revisão humana/);
  assert.deepEqual(t.comparacao, { diferenca: -11.5, percentual: -95.8, melhorou: true, parcial: true });
  assert.equal(t.acumuladoNoPeriodo, null);                                                             // processamento não é tempo de trabalho
  assert.match(t.lacuna, /^comparação parcial/);
  const ap = res.indicadores.find((i: { key: string }) => i.key === 'aprovacao');
  assert.equal(ap.lacuna, 'sem ponto de partida');                                                     // automático, mas sem "antes"
  assert.equal(ap.automatico, 66.7);
  assert.equal(ap.comparacao, null);
  const rt = res.indicadores.find((i: { key: string }) => i.key === 'retrabalho');
  assert.equal(rt.lacuna, 'sem medição depois');                                                       // informado antes; nada depois
  assert.deepEqual([res.execucoes.execucoes, res.execucoes.tempoAteRevisaoMin, res.execucoes.divergenciasTotal, res.execucoes.consumo.paginas], [4, 40, 8, 12]);
  assert.deepEqual(res.mensal.map((m: { mes: string; execucoes: number }) => [m.mes, m.execucoes]), [['2026-09', 4]]);
  // Medição manual "depois" prevalece sobre a automática.
  await post(people.key, '/api/metrics/assistants/conferencia-nfe/values', { indicador: 'tempo_por_nota', fase: 'depois', valor: 3, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-20', metodo: 'cronometragem de 20 notas com revisão' });
  const t2 = (await results()).indicadores.find((i: { key: string }) => i.key === 'tempo_por_nota');
  assert.deepEqual([t2.depois.valor, t2.depois.origem.tipo, t2.automatico], [3, 'medido', 0.5]);
  assert.equal(t2.lacuna, null);
  assert.deepEqual(t2.acumuladoNoPeriodo, { valor: 0.6, unidade: 'h', calculo: '(12 − 3) min × 4 execuções concluídas no período' });
});

test('decisão (manter, descartar, ampliar) com data, responsável e justificativa; relatório XLSX', async () => {
  assert.equal((await post(people.key, '/api/metrics/assistants/conferencia-nfe/decisions', { decisao: 'ampliar', data: '2026-09-24', responsavel: 'Diretoria financeira', justificativa: 'curta' })).statusCode, 400);
  const r = await post(people.key, '/api/metrics/assistants/conferencia-nfe/decisions', { decisao: 'ampliar', data: '2026-09-24', responsavel: 'Diretoria financeira', justificativa: 'Redução medida do tempo por nota; ampliar para notas de serviço.' });
  assert.equal(r.statusCode, 201);
  const res = await results();
  assert.deepEqual([res.decisoes[0].decisao, res.decisoes[0].responsavel, res.decisoes[0].registradoPor], ['ampliar', 'Diretoria financeira', 'key@repet.com.br']);
  const x = await get(people.key, '/api/metrics/assistants/conferencia-nfe/report?format=xlsx&de=2026-01-01&ate=2026-12-31');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Resumo', 'Antes × depois', 'Mensal', 'Valores registrados', 'Decisões']);
  const row2 = wb.getWorksheet('Antes × depois')!.getRow(2).values as unknown[];
  assert.equal(row2[1], 'Tempo por nota');
  assert.match(String(row2[4]), /^medido: medido de 2026-06-01/);
  const acts = (await db.owner.query(`select action from audit_log where tenant_id = $1 and target = 'assistente:conferencia-nfe' order by seq`, [T.tenantId])).rows.map(a => a.action);
  assert.ok(acts.includes('medicao_registrada') && acts.includes('decisao_registrada') && acts.includes('relatorio_resultados_exportado'));
});

test('quem consulta: key user e admin; usuário comum e outra área, não', async () => {
  assert.equal((await get(T.userId, '/api/metrics/assistants/conferencia-nfe')).statusCode, 200);
  assert.equal((await get(people.user, '/api/metrics/assistants/conferencia-nfe')).statusCode, 403);
  assert.equal((await get(people.keyRh, '/api/metrics/assistants/conferencia-nfe')).statusCode, 404);
});
