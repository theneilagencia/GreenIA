// Quick wins como objeto próprio: oportunidades avaliadas por critérios do
// tenant, devolução ao portfólio com motivo, ciclo de etapas auditado,
// decisão, ampliação com trajetória, cota do plano e os dois relatórios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { extractText, getDocumentProxy } from 'unpdf';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';
import { weightedScore, DEFAULT_CRITERIA } from '../src/quickwins/criteria.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
let P: Awaited<ReturnType<typeof seedTenant>>;
const u: Record<string, string> = {};
const ids: Record<string, string> = {};
const call = async (userId: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, userId)).headers, payload });
const userId = async (email: string) => (await db.owner.query(`select id from users where email = $1`, [email])).rows[0].id as string;
const OPP = { processo: 'Montagem do orçamento de obra', problema: 'Planilhas refeitas a cada revisão de projeto', executorAtual: 'Dois orçamentistas', volume: '12 orçamentos por mês', evidencia: 'comprovado' };
const NOTAS = { valor: 5, complexidade: 2, risco: 2, dependencias: 1 };

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'construtora', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  app = await buildTestApp(db);
  await call(T.userId, 'POST', '/api/admin/areas/modelo', { modelo: 'construtora' });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'key.eng@construtora.com.br', role: 'key_user', areaSlug: 'engenharia' });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'key.sup@construtora.com.br', role: 'key_user', areaSlug: 'suprimentos' });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'mestre@construtora.com.br', role: 'usuario', areaSlug: 'obras' });
  u.eng = await userId('key.eng@construtora.com.br'); u.sup = await userId('key.sup@construtora.com.br'); u.mestre = await userId('mestre@construtora.com.br');
  await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'clausulas-obra', name: 'Cláusulas de contratos de obra', areaSlug: 'engenharia', status: 'ativo', modelo: { slug: 'juridico-localizar-clausulas' } });
});
after(async () => { await app?.close(); await db?.drop(); });

test('nota ponderada: normaliza a escala e inverte os critérios em que menor é melhor', () => {
  const crit = { escala: { min: 1, max: 5 }, criterios: DEFAULT_CRITERIA };
  assert.deepEqual(weightedScore(crit, { valor: 5, complexidade: 1, risco: 1, dependencias: 1 }), { score: 100 });
  assert.deepEqual(weightedScore(crit, { valor: 1, complexidade: 5, risco: 5, dependencias: 5 }), { score: 0 });
  assert.deepEqual(weightedScore(crit, NOTAS), { score: 90 });              // 40 + 15 + 15 + 20
  assert.match((weightedScore(crit, { valor: 6, complexidade: 1, risco: 1, dependencias: 1 }) as { error: string }).error, /fora da escala/);
});

test('critérios do tenant: padrão Valor, Complexidade, Risco e Dependências; o admin muda escala e pesos', async () => {
  const c = (await call(u.eng, 'GET', '/api/quick-wins/criterios')).json();
  assert.deepEqual(c.criterios.map((x: { label: string }) => x.label), ['Valor', 'Complexidade', 'Risco', 'Dependências']);
  assert.deepEqual(c.escala, { min: 1, max: 5 });
  assert.equal((await call(u.eng, 'PUT', '/api/admin/quick-wins/criterios', c)).statusCode, 403);
  assert.equal((await call(T.userId, 'PUT', '/api/admin/quick-wins/criterios', { ...c, escala: { min: 5, max: 5 } })).statusCode, 400);
  const next = { escala: { min: 1, max: 5 }, criterios: [...c.criterios.map((x: { key: string; peso: number }) => x.key === 'valor' ? { ...x, peso: 50 } : x), { key: 'seguranca', label: 'Segurança do trabalho', peso: 10, sentido: 'maior_melhor' }] };
  assert.equal((await call(T.userId, 'PUT', '/api/admin/quick-wins/criterios', next)).statusCode, 200);
  assert.equal((await call(u.eng, 'GET', '/api/quick-wins/criterios')).json().criterios.length, 5);
});

test('oportunidade: key user registra na área dele; usuário comum e outra área, não', async () => {
  assert.equal((await call(u.mestre, 'POST', '/api/opportunities', { ...OPP, areaSlug: 'obras', titulo: 'Diário de obra' })).statusCode, 403);
  assert.equal((await call(u.sup, 'POST', '/api/opportunities', { ...OPP, areaSlug: 'engenharia', titulo: 'Orçamento' })).statusCode, 403);
  let r = await call(u.eng, 'POST', '/api/opportunities', { ...OPP, areaSlug: 'engenharia', titulo: 'Orçamento de obra a partir do projeto' });
  assert.equal(r.statusCode, 201, r.body);
  ids.orc = r.json().id;
  r = await call(u.eng, 'POST', '/api/opportunities', { ...OPP, areaSlug: 'obras', titulo: 'Diário de obra padronizado', evidencia: 'hipotese' });   // subárea: herdada
  assert.equal(r.statusCode, 201, r.body);
  ids.diario = r.json().id;
});

test('avaliação, devolução ao portfólio com motivo e nova avaliação', async () => {
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/avaliar`, { notas: NOTAS, nota: 'Falta segurança.' })).json().error, 'avaliacao_invalida');
  let r = await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/avaliar`, { notas: { ...NOTAS, seguranca: 1 }, nota: 'Avaliada na reunião de engenharia.' });
  assert.equal(r.statusCode, 200, r.body);
  r = await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/devolver`, { motivo: 'Depende da troca do software de orçamento, prevista para o ano que vem.' });
  assert.equal(r.statusCode, 200);
  const back = (await call(u.eng, 'GET', '/api/opportunities')).json().find((o: { id: string }) => o.id === ids.orc);
  assert.deepEqual([back.status, back.nota], ['identificada', null]);
  const ev = (await db.owner.query(`select note from quick_win_events where opportunity_id = $1 order by id`, [ids.orc])).rows.map(r => r.note);
  assert.match(ev.at(-1), /^Devolvida ao portfólio: Depende da troca do software/);
  r = await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/avaliar`, { notas: { ...NOTAS, seguranca: 3 }, nota: 'Software trocado antes do previsto.' });
  assert.equal(r.statusCode, 200);
});

test('selecionada vira quick win; etapas em ordem; decisão só depois da medição; tudo na auditoria com o motivo', async () => {
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.diario}/selecionar`, { objetivo: 'Padronizar', responsavel: 'key.eng@construtora.com.br', nota: 'Sem avaliação.' })).json().error, 'avalie_antes_de_selecionar');
  let r = await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/selecionar`, {
    objetivo: 'Montar o orçamento em metade do tempo', responsavel: 'key.eng@construtora.com.br', prazo: '2026-12-15',
    indicadores: [{ key: 'tempo_orcamento', label: 'Tempo para montar um orçamento', unit: 'h' }, { key: 'volume', label: 'Consultas ao assistente', unit: 'execuções', direction: 'maior_melhor', auto: 'volume' }],
    recursos: { assistentes: ['clausulas-obra'] }, revisores: ['key.eng@construtora.com.br'], nota: 'Maior nota do portfólio de engenharia.',
  });
  assert.equal(r.statusCode, 201, r.body);
  ids.qw = r.json().id;
  const st = (etapa: string, nota = 'Mudança de etapa registrada.') => call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/etapa`, { etapa, nota });
  assert.equal((await st('em_medicao')).json().error, 'etapa_invalida');
  assert.equal((await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'manter', justificativa: 'Cedo demais para decidir.' })).json().error, 'decisao_so_depois_da_medicao');
  assert.equal((await st('em_implantacao', 'Assistente configurado e equipe treinada.')).statusCode, 200);
  assert.equal((await st('em_medicao', 'Duas semanas de uso.')).statusCode, 200);
  assert.equal((await call(u.mestre, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'ampliar', justificativa: 'Sem permissão.' })).statusCode, 404);
  r = await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'ampliar', justificativa: 'Tempo por orçamento caiu; levar para suprimentos.' });
  assert.equal(r.statusCode, 200);
  const acts = (await db.owner.query(`select action, details from audit_log where target = $1 order by seq`, [`quick_win:${ids.qw}`])).rows;
  assert.deepEqual(acts.map(a => a.action), ['quick_win_criado', 'quick_win_etapa', 'quick_win_etapa', 'quick_win_decidido']);
  assert.deepEqual([acts[1].details.de, acts[1].details.para, acts[1].details.motivo, acts[1].details.por], ['selecionada', 'em_implantacao', 'Assistente configurado e equipe treinada.', 'key.eng@construtora.com.br']);
});

test('ampliar: novo quick win em outra área, com os mesmos recursos, baseline próprio e trajetória nos dois sentidos', async () => {
  await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/valores`, { indicador: 'tempo_orcamento', fase: 'antes', valor: 16, origem: 'informado', informadoPor: 'Coordenação de engenharia' });
  assert.equal((await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/ampliar`, { titulo: 'Cotações', objetivo: 'Levar para compras', responsavel: 'key.sup@construtora.com.br', areas: ['suprimentos'], nota: 'Ampliação.' })).statusCode, 403);
  const r = await call(T.userId, 'POST', `/api/quick-wins/${ids.qw}/ampliar`, { titulo: 'Orçamento de compras de suprimentos', objetivo: 'Mesmo ganho nas compras', responsavel: 'key.sup@construtora.com.br', areas: ['suprimentos'], nota: 'Decisão de ampliar do comitê.' });
  assert.equal(r.statusCode, 201, r.body);
  ids.amp = r.json().id;
  const d = (await call(u.sup, 'GET', `/api/quick-wins/${ids.amp}`)).json();
  assert.deepEqual(d.quickWin.areas, ['Suprimentos']);
  assert.deepEqual(d.quickWin.recursos.map((x: { slug: string }) => x.slug), ['clausulas-obra']);
  assert.deepEqual(d.indicadoresDefinidos.map((i: { key: string }) => i.key), ['tempo_orcamento', 'volume']);
  assert.equal(d.valores.length, 0);                                              // baseline próprio
  assert.equal(d.semPontoDePartida, true);
  assert.deepEqual(d.trajetoria.origem.map((o: { titulo: string }) => o.titulo), ['Orçamento de obra a partir do projeto']);
  const orig = (await call(u.eng, 'GET', `/api/quick-wins/${ids.qw}`)).json();
  assert.deepEqual(orig.trajetoria.ampliacoes.map((o: { titulo: string; areas: string }) => [o.titulo, o.areas]), [['Orçamento de compras de suprimentos', 'Suprimentos']]);
  assert.equal((await call(u.eng, 'GET', `/api/quick-wins/${ids.amp}`)).statusCode, 404);   // engenharia não enxerga suprimentos
});

test('cota do plano: definida pela TheNeil, aviso ao atingir e bloqueio acima', async () => {
  assert.equal((await call(T.userId, 'PUT', '/api/platform/tenants/construtora/quick-wins-quota', { maximo: 3 })).statusCode, 403);
  assert.equal((await call(P.userId, 'PUT', '/api/platform/tenants/construtora/quick-wins-quota', { maximo: 3 })).statusCode, 200);
  await call(u.eng, 'POST', `/api/opportunities/${ids.diario}/avaliar`, { notas: { ...NOTAS, seguranca: 4 }, nota: 'Avaliada.' });
  let r = await call(u.eng, 'POST', `/api/opportunities/${ids.diario}/selecionar`, { objetivo: 'Padronizar o diário', responsavel: 'key.eng@construtora.com.br', nota: 'Selecionada.' });
  assert.equal(r.statusCode, 201, r.body);
  assert.match(r.json().aviso, /Cota do plano atingida: 3 quick wins/);
  const o = (await call(u.sup, 'POST', '/api/opportunities', { ...OPP, areaSlug: 'suprimentos', titulo: 'Cotação de concreto' })).json();
  await call(u.sup, 'POST', `/api/opportunities/${o.id}/avaliar`, { notas: { ...NOTAS, seguranca: 2 }, nota: 'Avaliada.' });
  r = await call(u.sup, 'POST', `/api/opportunities/${o.id}/selecionar`, { objetivo: 'Cotar mais rápido', responsavel: 'key.sup@construtora.com.br', nota: 'Selecionada.' });
  assert.deepEqual([r.statusCode, r.json().error, r.json().maximo], [409, 'cota_de_quick_wins', 3]);
  assert.deepEqual((await call(u.sup, 'GET', '/api/quick-wins/criterios')).json().cota, { emAndamento: 3, maximo: 3 });
});

test('relatórios: portfólio (com filtro por critério) e resultados, em PDF e XLSX, para as áreas criadas pelo cliente', async () => {
  const j = (await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio')).json();
  assert.ok(j.oportunidades.length >= 3);
  const filtered = (await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?criterio=seguranca&min=3')).json().oportunidades.map((o: { titulo: string }) => o.titulo).sort();
  assert.deepEqual(filtered, ['Diário de obra padronizado', 'Orçamento de obra a partir do projeto']);
  const byArea = (await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?area=engenharia')).json().oportunidades.map((o: { area: string }) => o.area);
  assert.deepEqual([...new Set(byArea)].sort(), ['Engenharia', 'Obras']);                 // a área e as subáreas
  const x = await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?format=xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Portfólio', 'Critérios']);
  assert.ok((wb.getWorksheet('Portfólio')!.getRow(1).values as string[]).includes('Segurança do trabalho'));
  const p = await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?format=pdf');
  const text = (await extractText(await getDocumentProxy(new Uint8Array(p.rawPayload)), { mergePages: true })).text;
  assert.match(text, /Portfólio de oportunidades/);
  assert.match(text, /Suprimentos/);
  const rx = await call(T.userId, 'GET', '/api/quick-wins/relatorios/resultados?format=xlsx');
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(rx.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb2.worksheets.map(w => w.name), ['Quick wins', 'Antes × depois', 'Valores registrados', 'Sobre']);
  const rows = wb2.getWorksheet('Quick wins')!.getSheetValues().slice(2).map(v => (v as string[])[1]);
  assert.ok(rows.includes('Orçamento de compras de suprimentos'));
  const rp = await call(T.userId, 'GET', '/api/quick-wins/relatorios/resultados?format=pdf');
  const rtext = (await extractText(await getDocumentProxy(new Uint8Array(rp.rawPayload)), { mergePages: true })).text;
  assert.match(rtext, /Trajetória: ampliado para: Orçamento de compras de suprimentos \(Suprimentos\)/);
  assert.match(rtext, /AMPLIAR — Tempo por orçamento caiu/);
  assert.equal((await call(u.mestre, 'GET', '/api/quick-wins/relatorios/portfolio')).statusCode, 403);
});
