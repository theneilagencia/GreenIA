// Medição do quick win (do processo, não da ferramenta): ponto de partida com
// origem, "depois" medido ou automático das execuções vinculadas ao quick win.
// Cada execução pertence a no máximo um quick win: com o assistente em dois
// quick wins ativos, a pessoa escolhe (ou a área de quem executa decide, se for
// inequívoco). Janelas de ponto de partida e de medição, comparação na mesma
// unidade e aviso de janelas não comparáveis. Sem ponto de partida, nada é
// comparado nem estimado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { extractText, getDocumentProxy } from 'unpdf';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const u: Record<string, string> = {};
let qw = '';
let kbOnly = '';
const call = async (userId: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, userId)).headers, payload });
const results = async (id = qw) => (await call(u.key, 'GET', `/api/quick-wins/${id}?de=2026-01-01&ate=2026-12-31`)).json();
const userId = async (email: string) => (await db.owner.query(`select id from users where email = $1`, [email])).rows[0].id as string;

const ASSISTANT = { inputs: { text: { enabled: true, required: true }, files: { enabled: false } }, pipeline: [{ bloco: 'resumir', params: { topicos: ['Assunto'], palavrasMax: 100 } }] };
const INDICATORS = [
  { key: 'tempo_por_guia', label: 'Tempo por guia conferida', unit: 'min', direction: 'menor_melhor', auto: 'tempo_processamento' },
  { key: 'aprovacao', label: 'Aprovação sem edição', unit: '%', direction: 'maior_melhor', auto: 'aprovacao_sem_edicao' },
  { key: 'glosas', label: 'Guias glosadas por mês', unit: 'guias', direction: 'menor_melhor' },
];

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'rede-clinicas', { role: 'admin_cliente' });
  app = await buildTestApp(db);
  for (const name of ['Faturamento de convênios', 'Atendimento ao paciente']) await call(T.userId, 'POST', '/api/admin/areas', { name });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'key.fat@rede-clinicas.com.br', role: 'key_user', areaSlug: 'faturamento-de-convenios' });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'faturista@rede-clinicas.com.br', role: 'usuario', areaSlug: 'faturamento-de-convenios' });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'key.atd@rede-clinicas.com.br', role: 'key_user', areaSlug: 'atendimento-ao-paciente' });
  await call(T.userId, 'POST', '/api/admin/memberships', { email: 'diretoria@rede-clinicas.com.br', role: 'patrocinador' });
  u.key = await userId('key.fat@rede-clinicas.com.br'); u.user = await userId('faturista@rede-clinicas.com.br'); u.keyAtd = await userId('key.atd@rede-clinicas.com.br');
  u.pat = await userId('diretoria@rede-clinicas.com.br');
  for (const slug of ['conferir-guias', 'resumo-de-glosas']) {
    assert.equal((await call(T.userId, 'POST', '/api/admin/assistants', { slug, name: slug, areaSlug: 'faturamento-de-convenios', status: 'ativo', definition: ASSISTANT })).statusCode, 201);
  }
  const doc = (await call(T.userId, 'POST', '/api/kb/documents', { title: 'Manual de faturamento', areaSlug: 'faturamento-de-convenios', contentType: 'text/plain', text: 'Guias sem assinatura do paciente são glosadas.' })).json();
  // Duas oportunidades avaliadas e selecionadas: uma com dois assistentes, outra só com a base.
  const mk = async (titulo: string, recursos: object, indicadores: object[]) => {
    const o = (await call(u.key, 'POST', '/api/opportunities', { areaSlug: 'faturamento-de-convenios', titulo, processo: 'Conferência de guias', problema: 'Retrabalho com glosas', evidencia: 'comprovado' })).json();
    await call(u.key, 'POST', `/api/opportunities/${o.id}/avaliar`, { notas: { valor: 5, complexidade: 2, risco: 2, dependencias: 1 }, nota: 'Avaliada no comitê.' });
    const r = await call(u.pat, 'POST', `/api/opportunities/${o.id}/selecionar`, { objetivo: 'Reduzir glosas', responsavel: 'key.fat@rede-clinicas.com.br', indicadores, recursos, nota: 'Selecionada.' });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().id as string;
  };
  qw = await mk('Conferência de guias antes do envio', { assistentes: ['conferir-guias', 'resumo-de-glosas'] }, INDICATORS);
  kbOnly = await mk('Dúvidas de faturamento pela base', { documentos: [doc.documentId] }, [{ key: 'chamados', label: 'Chamados ao supervisor por semana', unit: 'chamados', direction: 'menor_melhor' }]);
});
after(async () => { await app?.close(); await db?.drop(); });

test('sem ponto de partida: nenhuma comparação nem ganho, também no relatório em PDF', async () => {
  const r = await results();
  assert.equal(r.semPontoDePartida, true);
  assert.match(r.aviso, /Sem ponto de partida/);
  assert.ok(r.indicadores.every((i: { lacuna: string; comparacao: unknown; acumuladoNoPeriodo: unknown }) => i.lacuna === 'sem ponto de partida' && i.comparacao === null && i.acumuladoNoPeriodo === null));
  const pdf = await call(u.key, 'GET', '/api/quick-wins/relatorios/resultados?format=pdf&de=2026-01-01&ate=2026-12-31');
  assert.equal(pdf.statusCode, 200);
  const text = (await extractText(await getDocumentProxy(new Uint8Array(pdf.rawPayload)), { mergePages: true })).text;
  assert.match(text, /Sem ponto de partida/);
  assert.match(text, /Antes: — — sem ponto de partida/);
});

test('valor sem origem completa é recusado; indicador fora do quick win também; usuário comum não registra', async () => {
  const bad = async (x: object) => (await call(u.key, 'POST', `/api/quick-wins/${qw}/valores`, { indicador: 'tempo_por_guia', fase: 'antes', valor: 12, ...x })).json();
  assert.ok((await bad({ origem: 'medido', metodo: 'cronômetro' })).detalhes.some((d: string) => /período/.test(d)));
  assert.ok((await bad({ origem: 'medido', periodoInicio: '2026-06-01', periodoFim: '2026-06-30' })).detalhes.some((d: string) => /método/.test(d)));
  assert.ok((await bad({ origem: 'informado' })).detalhes.some((d: string) => /quem informou/.test(d)));
  assert.equal((await bad({ origem: 'informado', informadoPor: 'x', indicador: 'inventado' })).error, 'indicador_nao_definido');
  assert.equal((await call(u.user, 'POST', `/api/quick-wins/${qw}/valores`, { indicador: 'glosas', fase: 'antes', valor: 1, origem: 'informado', informadoPor: 'x' })).statusCode, 403);
});

test('antes × depois: automático das execuções vinculadas ao quick win, dos dois assistentes', async () => {
  let r = await call(u.key, 'POST', `/api/quick-wins/${qw}/valores`, { indicador: 'tempo_por_guia', fase: 'antes', valor: 12, origem: 'medido', periodoInicio: '2026-06-01', periodoFim: '2026-06-30', metodo: 'cronometragem de 40 guias pela equipe' });
  assert.equal(r.statusCode, 201, r.body);
  await call(u.key, 'POST', `/api/quick-wins/${qw}/valores`, { indicador: 'glosas', fase: 'antes', valor: 18, origem: 'informado', informadoPor: 'Coordenação de faturamento' });
  const ins = (slug: string, area: string, status: string, reviewedMin: number | null, quickWin: string | null) => db.owner.query(
    `insert into runs (tenant_id, assistant_id, assistant_version, area_id, user_id, status, input_sha256, processing_ms, created_at, finished_at, reviewed_at, divergences, cost_brl, pages, expires_at, quick_win_id)
     select $1, a.id, 1, ar.id, $2, $3, 'x', 30000, '2026-09-10 10:00', '2026-09-10 10:01', case when $4::int is null then null else '2026-09-10 10:01'::timestamp + make_interval(mins => $4::int) end, 2, 0.05, 3, now() + interval '90 days', $7
     from assistants a, areas ar where a.slug = $5 and ar.slug = $6 and a.tenant_id = $1 and ar.tenant_id = $1`, [T.tenantId, u.user, status, reviewedMin, slug, area, quickWin]);
  await ins('conferir-guias', 'faturamento-de-convenios', 'aprovado', 20, qw);
  await ins('conferir-guias', 'faturamento-de-convenios', 'aprovado', 40, qw);
  await ins('resumo-de-glosas', 'faturamento-de-convenios', 'aprovado_com_edicao', 60, qw);
  await ins('resumo-de-glosas', 'faturamento-de-convenios', 'rascunho', null, qw);
  await ins('conferir-guias', 'atendimento-ao-paciente', 'aprovado', 5, null);      // execução fora do quick win: não conta
  const res = await results();
  assert.equal(res.semPontoDePartida, false);
  const t = res.indicadores.find((i: { key: string }) => i.key === 'tempo_por_guia');
  assert.deepEqual([t.antes.valor, t.antes.origem.tipo], [12, 'medido']);
  assert.match(t.antes.origem.detalhe, /medido de 2026-06-01 a 2026-06-30; método: cronometragem/);
  assert.deepEqual([t.depois.valor, t.depois.origem.tipo], [0.5, 'automatico']);
  assert.deepEqual(t.comparacao, { diferenca: -11.5, percentual: -95.8, melhorou: true, parcial: true });
  assert.equal(t.acumuladoNoPeriodo, null);
  const ap = res.indicadores.find((i: { key: string }) => i.key === 'aprovacao');
  assert.deepEqual([ap.lacuna, ap.automatico], ['sem ponto de partida', 66.7]);
  assert.equal(res.indicadores.find((i: { key: string }) => i.key === 'glosas').lacuna, 'sem medição depois');
  assert.deepEqual([res.execucoes.execucoes, res.execucoes.tempoAteRevisaoMin, res.execucoes.divergenciasTotal, res.execucoes.taxaRevisaoPct], [4, 40, 8, 33.3]);
  await call(u.key, 'POST', `/api/quick-wins/${qw}/valores`, { indicador: 'tempo_por_guia', fase: 'depois', valor: 3, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-20', metodo: 'cronometragem de 20 guias com revisão' });
  const t2 = (await results()).indicadores.find((i: { key: string }) => i.key === 'tempo_por_guia');
  assert.deepEqual([t2.depois.valor, t2.depois.origem.tipo, t2.automatico, t2.lacuna], [3, 'medido', 0.5, null]);
  assert.deepEqual(t2.acumuladoNoPeriodo, { valor: 0.6, unidade: 'h', calculo: '(12 − 3) min × 4 execuções concluídas no período' });
});

test('quick win só com base de conhecimento: sem execuções, indicador lançado à mão', async () => {
  await call(u.key, 'POST', `/api/quick-wins/${kbOnly}/valores`, { indicador: 'chamados', fase: 'antes', valor: 25, origem: 'informado', informadoPor: 'Supervisão de faturamento' });
  await call(u.key, 'POST', `/api/quick-wins/${kbOnly}/valores`, { indicador: 'chamados', fase: 'depois', valor: 9, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-21', metodo: 'contagem dos chamados registrados' });
  const r = await results(kbOnly);
  assert.equal(r.execucoes, null);
  assert.deepEqual(r.quickWin.recursos.map((x: { tipo: string }) => x.tipo), ['documento']);
  assert.deepEqual(r.indicadores[0].comparacao, { diferenca: -16, percentual: -64, melhorou: true, parcial: false });
});

test('quem enxerga: key user e admin; key user de outra área, não', async () => {
  assert.equal((await call(T.userId, 'GET', `/api/quick-wins/${qw}`)).statusCode, 200);
  assert.equal((await call(u.keyAtd, 'GET', `/api/quick-wins/${qw}`)).statusCode, 404);
});

test('execução com assistente em dois quick wins ativos: a pessoa escolhe; sem escolha e sem área inequívoca, recusa; nenhuma conta duas vezes', async () => {
  // Terceiro quick win usa o mesmo assistente "conferir-guias", na mesma área.
  const o = (await call(u.key, 'POST', '/api/opportunities', { areaSlug: 'faturamento-de-convenios', titulo: 'Guias de internação', processo: 'Autorização de internação', problema: 'Guia sem laudo volta', evidencia: 'hipotese' })).json();
  await call(u.key, 'POST', `/api/opportunities/${o.id}/avaliar`, { notas: { valor: 4, complexidade: 2, risco: 2, dependencias: 1 }, nota: 'Avaliada no comitê.' });
  const third = (await call(u.pat, 'POST', `/api/opportunities/${o.id}/selecionar`, { objetivo: 'Guia completa na primeira vez', responsavel: 'key.fat@rede-clinicas.com.br', recursos: { assistentes: ['conferir-guias'] }, nota: 'Selecionada.' })).json().id;
  await call(u.user, 'POST', '/api/policy/ack', { version: 1 });
  const detail = (await call(u.user, 'GET', '/api/assistants/conferir-guias')).json();
  assert.deepEqual(detail.quickWins.map((q: { id: string }) => q.id).sort(), [qw, third].sort());
  const send = (extra: object) => call(u.user, 'POST', '/api/runs', { assistant: 'conferir-guias', text: 'Guia 123: paciente sem assinatura.', ...extra });
  let r = await send({});
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().error, 'escolha_o_quick_win');
  assert.equal(r.json().opcoes.length, 2);
  assert.equal((await send({ quickWinId: kbOnly })).json().error, 'quick_win_nao_serve');       // quick win sem esse assistente
  r = await send({ quickWinId: third });
  assert.equal(r.statusCode, 202, r.body);
  assert.equal(r.json().quickWinId, third);
  const runs = (await db.owner.query(`select quick_win_id, count(*)::int as n from runs where tenant_id = $1 and quick_win_id is not null group by 1`, [T.tenantId])).rows;
  const total = runs.reduce((s: number, x: { n: number }) => s + x.n, 0);
  const t = (await call(u.key, 'GET', `/api/quick-wins/${third}?de=2020-01-01&ate=2030-12-31`)).json();
  const q1 = (await call(u.key, 'GET', `/api/quick-wins/${qw}?de=2020-01-01&ate=2030-12-31`)).json();
  assert.equal(t.execucoes.execucoes, 1);
  assert.equal(q1.execucoes.execucoes, 4);
  assert.equal(t.execucoes.execucoes + q1.execucoes.execucoes, total);                        // soma = execuções vinculadas: nenhuma contada duas vezes
});

test('janelas: comparação por mês e por item, e aviso quando as janelas não são comparáveis', async () => {
  let r = await call(u.key, 'PATCH', `/api/quick-wins/${kbOnly}`, {
    indicadores: [{ key: 'chamados', label: 'Chamados ao supervisor por semana', unit: 'chamados', direction: 'menor_melhor' },
                  { key: 'glosas_total', label: 'Glosas no período', unit: 'glosas', direction: 'menor_melhor', comparacao: 'por_item' },
                  { key: 'retrabalho', label: 'Horas de retrabalho no período', unit: 'h', direction: 'menor_melhor', comparacao: 'por_mes' }],
    janelas: { pontoDePartida: { inicio: '2026-03-01', fim: '2026-05-31', volume: 900 }, medicao: { inicio: '2026-09-01', fim: '2026-09-30', volume: 200 }, unidadeVolume: 'guias' },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual((await results(kbOnly)).quickWin.recursos.map((x: { tipo: string }) => x.tipo), ['documento']);   // PATCH sem "recursos" não mexe neles
  assert.ok(r.json().avisosDasJanelas.some((w: string) => /duração muito diferente: 92 dias no ponto de partida e 30 dias/.test(w)));
  assert.ok(r.json().avisosDasJanelas.some((w: string) => /Volume muito diferente: 900 guias no ponto de partida e 200 guias/.test(w)));
  await call(u.key, 'POST', `/api/quick-wins/${kbOnly}/valores`, { indicador: 'glosas_total', fase: 'antes', valor: 90, origem: 'informado', informadoPor: 'Faturamento' });
  await call(u.key, 'POST', `/api/quick-wins/${kbOnly}/valores`, { indicador: 'glosas_total', fase: 'depois', valor: 10, origem: 'informado', informadoPor: 'Faturamento' });
  await call(u.key, 'POST', `/api/quick-wins/${kbOnly}/valores`, { indicador: 'retrabalho', fase: 'antes', valor: 60, origem: 'informado', informadoPor: 'Faturamento' });
  await call(u.key, 'POST', `/api/quick-wins/${kbOnly}/valores`, { indicador: 'retrabalho', fase: 'depois', valor: 10, origem: 'informado', informadoPor: 'Faturamento' });
  const d = (await results(kbOnly)).indicadores;
  const g = d.find((i: { key: string }) => i.key === 'glosas_total');
  assert.deepEqual([g.antes.comparavel, g.depois.comparavel, g.comparacaoPor], [0.1, 0.05, 'glosas por guias']);   // 90/900 × 10/200
  assert.deepEqual(g.comparacao, { diferenca: -0.05, percentual: -50, melhorou: true, parcial: false });
  const h = d.find((i: { key: string }) => i.key === 'retrabalho');
  assert.deepEqual([h.antes.comparavel, h.depois.comparavel, h.comparacaoPor], [19.85, 10.15, 'h por mês']);          // 60 h em 92 dias × 10 h em 30 dias
  const full = await results(kbOnly);
  assert.equal(full.janelas.avisos.length, 2);
  assert.deepEqual([full.janelas.pontoDePartida.dias, full.janelas.medicao.dias, full.janelas.medicao.volumeOrigem], [92, 30, 'informado']);
});
