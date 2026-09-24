// Quick wins como objeto próprio: oportunidades avaliadas por critérios do
// tenant; roadmap e arquivo com motivo; patrocinador seleciona e decide; ciclo
// auditado; volta ao roadmap na implantação com substituição; ampliação com
// recursos compartilhados ou duplicados; cota do plano; os dois relatórios. A
// migração da medição por assistente tem teste próprio (legacy-reconciliation).
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
const pdfText = async (b: Buffer) => (await extractText(await getDocumentProxy(new Uint8Array(b)), { mergePages: true })).text;

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'construtora', { role: 'admin_cliente' });
  P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  app = await buildTestApp(db);
  await call(T.userId, 'POST', '/api/admin/areas/modelo', { modelo: 'construtora' });
  const people: [string, string, string, string | undefined][] = [
    ['eng', 'key.eng@construtora.com.br', 'key_user', 'engenharia'], ['sup', 'key.sup@construtora.com.br', 'key_user', 'suprimentos'],
    ['mestre', 'mestre@construtora.com.br', 'usuario', 'obras'], ['patEng', 'diretor.eng@construtora.com.br', 'patrocinador', 'engenharia'],
    ['patSup', 'diretor.sup@construtora.com.br', 'patrocinador', 'suprimentos'], ['patGeral', 'presidencia@construtora.com.br', 'patrocinador', undefined],
  ];
  for (const [k, email, role, areaSlug] of people) {
    const r = await call(T.userId, 'POST', '/api/admin/memberships', { email, role, areaSlug });
    assert.ok([200, 201].includes(r.statusCode), r.body);
    u[k] = await userId(email);
  }
  await call(T.userId, 'POST', '/api/admin/assistants', { slug: 'clausulas-obra', name: 'Cláusulas de contratos de obra', areaSlug: 'engenharia', status: 'ativo', modelo: { slug: 'juridico-localizar-clausulas' } });
  await call(T.userId, 'POST', '/api/kb/documents', { title: 'Manual de orçamento', areaSlug: 'engenharia', contentType: 'text/plain', text: 'Composição de custos unitários pela tabela de referência.' });
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
  for (const [k, area, titulo] of [['orc', 'engenharia', 'Orçamento de obra a partir do projeto'], ['diario', 'obras', 'Diário de obra padronizado'],
    ['erp', 'engenharia', 'Integração do orçamento com o ERP'], ['brinde', 'engenharia', 'Catálogo de brindes para clientes'], ['medicao', 'engenharia', 'Medição de empreiteiros']] as const) {
    const r = await call(u.eng, 'POST', '/api/opportunities', { ...OPP, areaSlug: area, titulo });     // Obras: subárea, herdada
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.json().status, 'registrada');
    ids[k] = r.json().id;
  }
});

test('avaliação; roadmap e arquivo só com motivo; reabrir volta ao portfólio', async () => {
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/avaliar`, { notas: NOTAS, nota: 'Falta segurança.' })).json().error, 'avaliacao_invalida');
  for (const k of ['orc', 'diario', 'medicao']) {
    const r = await call(u.eng, 'POST', `/api/opportunities/${ids[k]}/avaliar`, { notas: { ...NOTAS, seguranca: k === 'orc' ? 3 : 4 }, nota: 'Avaliada na reunião de engenharia.' });
    assert.equal(r.statusCode, 200, r.body);
  }
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.erp}/roadmap`, {})).json().detalhe, 'o motivo é obrigatório');
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.erp}/roadmap`, { motivo: 'Integração com o ERP leva meses: projeto, não quick win.' })).statusCode, 200);
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.brinde}/arquivar`, { motivo: 'Fora do escopo de processos da empresa.' })).statusCode, 200);
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.brinde}/roadmap`, { motivo: 'Tentativa.' })).json().error, 'situacao_nao_permite');
  const list = (await call(u.eng, 'GET', '/api/opportunities')).json() as { id: string; status: string; motivo: string | null }[];
  const find = (k: string) => list.find(o => o.id === ids[k])!;
  assert.deepEqual([find('erp').status, find('erp').motivo], ['roadmap', 'Integração com o ERP leva meses: projeto, não quick win.']);
  assert.deepEqual([find('brinde').status, find('brinde').motivo], ['arquivada', 'Fora do escopo de processos da empresa.']);
  assert.deepEqual((await call(u.eng, 'GET', '/api/opportunities?status=roadmap')).json().map((o: { id: string }) => o.id), [ids.erp]);
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.brinde}/reabrir`, { motivo: 'Comercial pediu de novo.' })).json().status, 'registrada');
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.brinde}/arquivar`, { motivo: 'Continua fora do escopo.' })).statusCode, 200);
});

test('patrocinador: key user propõe, só patrocinador ou admin seleciona e decide; etapas auditadas com quem e por quê', async () => {
  const sel = { objetivo: 'Montar o orçamento em metade do tempo', responsavel: 'key.eng@construtora.com.br', prazo: '2026-12-15',
    indicadores: [{ key: 'tempo_orcamento', label: 'Tempo para montar um orçamento', unit: 'h' }, { key: 'volume', label: 'Consultas ao assistente', unit: 'execuções', direction: 'maior_melhor', auto: 'volume' }],
    janelas: { pontoDePartida: { inicio: '2026-06-01', fim: '2026-06-30', volume: 12 }, medicao: { inicio: '2026-09-01', fim: '2026-09-30' }, unidadeVolume: 'orçamentos' },
    recursos: { assistentes: ['clausulas-obra'] }, revisores: ['key.eng@construtora.com.br'], nota: 'Maior nota do portfólio de engenharia.' };
  assert.equal((await call(u.eng, 'POST', `/api/opportunities/${ids.orc}/selecionar`, sel)).json().error, 'so_patrocinador_ou_admin');
  assert.equal((await call(u.patSup, 'POST', `/api/opportunities/${ids.orc}/selecionar`, sel)).statusCode, 404);     // não enxerga engenharia
  const opps = (await call(u.patEng, 'GET', '/api/opportunities')).json() as { id: string; podeDecidir: boolean }[];
  assert.equal(opps.find(o => o.id === ids.orc)!.podeDecidir, true);
  let r = await call(u.patEng, 'POST', `/api/opportunities/${ids.orc}/selecionar`, sel);
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().etapa, 'em_implantacao');
  ids.qw = r.json().id;
  const d = (await call(u.eng, 'GET', `/api/quick-wins/${ids.qw}`)).json();
  assert.deepEqual([d.podeGerenciar, d.podeDecidir, d.janelas.pontoDePartida.dias, d.janelas.medicao.dias, d.janelas.unidadeVolume], [true, false, 30, 30, 'orçamentos']);
  const st = (who: string, etapa: string, nota: string) => call(who, 'POST', `/api/quick-wins/${ids.qw}/etapa`, { etapa, nota });
  assert.equal((await st(u.eng, 'encerrada', 'Pulando etapas.')).json().error, 'etapa_invalida');
  assert.equal((await call(u.patEng, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'manter', justificativa: 'Cedo demais para decidir.' })).json().error, 'decisao_so_depois_da_medicao');
  assert.equal((await st(u.eng, 'em_medicao', 'Duas semanas de uso.')).statusCode, 200);
  assert.equal((await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'ampliar', justificativa: 'Key user não decide sozinho.' })).json().error, 'so_patrocinador_ou_admin');
  assert.equal((await call(u.mestre, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'ampliar', justificativa: 'Sem permissão.' })).statusCode, 404);   // Obras não enxerga Engenharia
  r = await call(u.patEng, 'POST', `/api/quick-wins/${ids.qw}/decisao`, { decisao: 'ampliar', justificativa: 'Tempo por orçamento caiu; levar para suprimentos.' });
  assert.equal(r.statusCode, 200);
  const acts = (await db.owner.query(`select action, details from audit_log where target = $1 order by seq`, [`quick_win:${ids.qw}`])).rows;
  assert.deepEqual(acts.map(a => a.action), ['quick_win_criado', 'quick_win_etapa', 'quick_win_decidido']);
  assert.deepEqual([acts[0].details.por, acts[1].details.de, acts[1].details.para, acts[1].details.motivo, acts[2].details.por],
    ['diretor.eng@construtora.com.br', 'em_implantacao', 'em_medicao', 'Duas semanas de uso.', 'diretor.eng@construtora.com.br']);
  const oppActs = (await db.owner.query(`select action, details from audit_log where target = $1 order by seq`, [`oportunidade:${ids.erp}`])).rows;
  assert.deepEqual(oppActs.map(a => a.action), ['oportunidade_registrada', 'oportunidade_enviada_ao_roadmap']);
});

test('na implantação, complexo demais: volta ao roadmap com motivo, e outra oportunidade entra no lugar', async () => {
  let r = await call(u.patEng, 'POST', `/api/opportunities/${ids.medicao}/selecionar`, { objetivo: 'Conferir boletins de medição', responsavel: 'key.eng@construtora.com.br', nota: 'Selecionada pelo diretor.' });
  assert.equal(r.statusCode, 201, r.body);
  const q = r.json().id;
  assert.equal((await call(u.eng, 'POST', `/api/quick-wins/${q}/roadmap`, {})).statusCode, 400);
  r = await call(u.eng, 'POST', `/api/quick-wins/${q}/roadmap`, { motivo: 'Precisa de integração com o sistema dos empreiteiros.' });
  assert.equal(r.statusCode, 200, r.body);
  const opp = (await call(u.eng, 'GET', '/api/opportunities')).json().find((o: { id: string }) => o.id === ids.medicao);
  assert.deepEqual([opp.status, opp.motivo], ['roadmap', 'Precisa de integração com o sistema dos empreiteiros.']);
  assert.equal((await call(u.eng, 'GET', `/api/quick-wins/${q}`)).json().quickWin.etapa, 'roadmap');
  r = await call(u.patEng, 'POST', `/api/opportunities/${ids.diario}/selecionar`, { objetivo: 'Padronizar o diário', responsavel: 'key.eng@construtora.com.br', substitui: q, nota: 'Entra no lugar da medição de empreiteiros.' });
  assert.equal(r.statusCode, 201, r.body);
  ids.diarioQw = r.json().id;
  assert.equal((await db.owner.query(`select replaces_id from quick_wins where id = $1`, [ids.diarioQw])).rows[0].replaces_id, q);
  assert.equal((await db.owner.query(`select count(*)::int as n from quick_wins where stage not in ('encerrada', 'roadmap') and tenant_id = $1`, [T.tenantId])).rows[0].n, 2);
});

test('ampliar: patrocinador da área nova; recursos compartilhados ou duplicados; baseline próprio; trajetória nos dois sentidos', async () => {
  // Ponto de partida depois de iniciada a medição: só com motivo, e fica registrado.
  const base = { indicador: 'tempo_orcamento', fase: 'antes', valor: 16, origem: 'informado', informadoPor: 'Coordenação de engenharia' };
  assert.equal((await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/valores`, base)).json().error, 'motivo_obrigatorio');
  assert.equal((await call(u.eng, 'POST', `/api/quick-wins/${ids.qw}/valores`, { ...base, motivo: 'O levantamento do Discovery chegou depois do início da medição.' })).statusCode, 201);
  const body = { titulo: 'Orçamento de compras de suprimentos', objetivo: 'Mesmo ganho nas compras', responsavel: 'key.sup@construtora.com.br', areas: ['suprimentos'], nota: 'Decisão de ampliar do comitê.' };
  assert.equal((await call(u.patEng, 'POST', `/api/quick-wins/${ids.qw}/ampliar`, body)).json().error, 'so_patrocinador_ou_admin');
  let r = await call(u.patGeral, 'POST', `/api/quick-wins/${ids.qw}/ampliar`, body);
  assert.equal(r.statusCode, 201, r.body);
  ids.amp = r.json().id;
  assert.equal(r.json().recursos, 'compartilhados');
  const d = (await call(u.sup, 'GET', `/api/quick-wins/${ids.amp}`)).json();
  assert.deepEqual(d.quickWin.areas, ['Suprimentos']);
  assert.deepEqual(d.quickWin.recursos.map((x: { slug: string }) => x.slug), ['clausulas-obra']);
  assert.deepEqual(d.indicadoresDefinidos.map((i: { key: string }) => i.key), ['tempo_orcamento', 'volume']);
  assert.equal(d.valores.length, 0);                                              // baseline próprio
  assert.equal(d.semPontoDePartida, true);
  assert.deepEqual(d.trajetoria.origem.map((o: { titulo: string }) => o.titulo), ['Orçamento de obra a partir do projeto']);
  // Duplicado: cópia independente do assistente na área nova.
  r = await call(u.patGeral, 'POST', `/api/quick-wins/${ids.qw}/ampliar`, { ...body, titulo: 'Orçamento de reformas', areas: ['obras'], recursos: 'duplicar' });
  assert.equal(r.statusCode, 201, r.body);
  const dup = (await call(u.eng, 'GET', `/api/quick-wins/${r.json().id}`)).json();
  assert.deepEqual(dup.quickWin.recursos.map((x: { slug: string }) => x.slug), ['clausulas-obra-obras']);
  const copy = (await db.owner.query(`select a.duplicated_from, ar.slug from assistants a join areas ar on ar.id = a.area_id where a.slug = 'clausulas-obra-obras'`)).rows[0];
  assert.deepEqual([copy.duplicated_from, copy.slug], ['clausulas-obra', 'obras']);
  const orig = (await call(u.eng, 'GET', `/api/quick-wins/${ids.qw}`)).json();
  assert.deepEqual(orig.trajetoria.ampliacoes.map((o: { titulo: string; areas: string }) => [o.titulo, o.areas]).sort(), [['Orçamento de compras de suprimentos', 'Suprimentos'], ['Orçamento de reformas', 'Obras']]);
  assert.equal((await call(u.eng, 'GET', `/api/quick-wins/${ids.amp}`)).statusCode, 404);   // engenharia não enxerga suprimentos
});

test('depois de iniciada a medição, mudar indicador ou janela exige motivo e fica no quick win', async () => {
  const d = (await call(u.eng, 'GET', `/api/quick-wins/${ids.qw}`)).json();
  const inds = d.indicadoresDefinidos.map((i: { key: string; label: string; unit: string; direction: string; auto: string | null; comparison: string }) =>
    ({ key: i.key, label: i.label, unit: i.unit, direction: i.direction, auto: i.auto, comparacao: i.comparison }));
  const changed = [...inds, { key: 'retrabalho', label: 'Revisões do orçamento por projeto', unit: 'revisões', direction: 'menor_melhor' }];
  let r = await call(u.eng, 'PATCH', `/api/quick-wins/${ids.qw}`, { indicadores: changed });
  assert.deepEqual([r.statusCode, r.json().error, r.json().mudancas], [400, 'motivo_obrigatorio', ['indicadores; incluído: Revisões do orçamento por projeto']]);
  assert.equal((await call(u.eng, 'PATCH', `/api/quick-wins/${ids.qw}`, { revisores: ['key.eng@construtora.com.br'] })).statusCode, 200);   // revisor muda sem motivo
  r = await call(u.eng, 'PATCH', `/api/quick-wins/${ids.qw}`, { indicadores: changed, motivo: 'O comitê pediu para acompanhar também as revisões.' });
  assert.equal(r.statusCode, 200, r.body);
  const x = (await call(u.eng, 'GET', `/api/quick-wins/${ids.qw}`)).json();
  assert.deepEqual(x.alteracoes.map((a: { oQue: string; motivo: string }) => [a.oQue, a.motivo]), [
    ['ponto de partida de Tempo para montar um orçamento: 16 h', 'O levantamento do Discovery chegou depois do início da medição.'],
    ['indicadores; incluído: Revisões do orçamento por projeto', 'O comitê pediu para acompanhar também as revisões.'],
  ]);
  const acts = (await db.owner.query(`select details from audit_log where action = 'quick_win_alterado_na_medicao' and target = $1 order by seq`, [`quick_win:${ids.qw}`])).rows;
  assert.deepEqual(acts.map(a => [a.details.motivo, a.details.por]), [['O levantamento do Discovery chegou depois do início da medição.', 'key.eng@construtora.com.br'], ['O comitê pediu para acompanhar também as revisões.', 'key.eng@construtora.com.br']]);
  // Na implantação, ajuste de indicador não pede motivo.
  const impl = (await call(u.eng, 'GET', `/api/quick-wins/${ids.diarioQw}`)).json();
  assert.equal(impl.quickWin.etapa, 'em_implantacao');
  assert.equal((await call(u.eng, 'PATCH', `/api/quick-wins/${ids.diarioQw}`, { indicadores: [{ key: 'tempo_diario', label: 'Tempo por diário', unit: 'min' }] })).statusCode, 200);
});

test('patrocinador do tenant enxerga oportunidades e quick wins de todas as áreas, mas não a base das áreas', async () => {
  const titles = ((await call(u.patGeral, 'GET', '/api/opportunities')).json() as { titulo: string }[]).map(o => o.titulo);
  assert.ok(titles.includes('Orçamento de obra a partir do projeto'));
  assert.equal((await call(u.patGeral, 'GET', `/api/quick-wins/${ids.amp}`)).statusCode, 200);
  const docs = (await call(u.patGeral, 'GET', '/api/kb/documents')).json() as { title: string }[];
  assert.ok(!docs.some(x => x.title === 'Manual de orçamento'));
});

test('cota do plano: definida pela TheNeil, aviso ao atingir e bloqueio acima', async () => {
  assert.equal((await call(T.userId, 'PUT', '/api/platform/tenants/construtora/quick-wins-quota', { maximo: 5 })).statusCode, 403);
  assert.equal((await call(P.userId, 'PUT', '/api/platform/tenants/construtora/quick-wins-quota', { maximo: 5 })).statusCode, 200);
  const mk = async (titulo: string) => {
    const o = (await call(u.sup, 'POST', '/api/opportunities', { ...OPP, areaSlug: 'suprimentos', titulo })).json();
    await call(u.sup, 'POST', `/api/opportunities/${o.id}/avaliar`, { notas: { ...NOTAS, seguranca: 2 }, nota: 'Avaliada.' });
    return call(u.patSup, 'POST', `/api/opportunities/${o.id}/selecionar`, { objetivo: 'Cotar mais rápido', responsavel: 'key.sup@construtora.com.br', nota: 'Selecionada.' });
  };
  let r = await mk('Cotação de aço');
  assert.equal(r.statusCode, 201, r.body);
  assert.match(r.json().aviso, /Cota do plano atingida: 5 quick wins/);
  r = await mk('Cotação de concreto');
  assert.deepEqual([r.statusCode, r.json().error, r.json().maximo], [409, 'cota_de_quick_wins', 5]);
  assert.deepEqual((await call(u.sup, 'GET', '/api/quick-wins/criterios')).json().cota, { emAndamento: 5, maximo: 5 });
});

test('relatórios: portfólio com motivos de roadmap e arquivo; resultados com janelas; PDF e XLSX', async () => {
  const j = (await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio')).json();
  assert.ok(j.oportunidades.length >= 5);
  const filtered = (await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?criterio=seguranca&min=4')).json().oportunidades.map((o: { titulo: string }) => o.titulo).sort();
  assert.deepEqual(filtered, ['Diário de obra padronizado', 'Medição de empreiteiros']);
  const byArea = (await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?area=engenharia')).json().oportunidades.map((o: { area: string }) => o.area);
  assert.deepEqual([...new Set(byArea)].sort(), ['Engenharia', 'Obras']);                 // a área e as subáreas
  const x = await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?format=xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Portfólio', 'Critérios']);
  const header = wb.getWorksheet('Portfólio')!.getRow(1).values as string[];
  assert.ok(header.includes('Segurança do trabalho') && header.includes('Motivo'));
  const text = await pdfText((await call(T.userId, 'GET', '/api/quick-wins/relatorios/portfolio?format=pdf')).rawPayload);
  assert.match(text, /Motivo \(enviada ao roadmap\): Integração com o ERP leva meses/);
  assert.match(text, /Motivo \(arquivada\): Continua fora do escopo/);
  assert.match(text, /no roadmap: 2 · arquivadas: 1/);
  const rx = await call(T.userId, 'GET', '/api/quick-wins/relatorios/resultados?format=xlsx');
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(rx.rawPayload as unknown as ArrayBuffer);
  assert.deepEqual(wb2.worksheets.map(w => w.name), ['Quick wins', 'Antes × depois', 'Alterações na medição', 'Valores registrados', 'Sobre']);
  assert.equal(wb2.getWorksheet('Alterações na medição')!.rowCount, 3);          // cabeçalho + ponto de partida + indicador
  const rows = wb2.getWorksheet('Quick wins')!.getSheetValues().slice(2).map(v => (v as string[])[1]);
  assert.ok(rows.includes('Orçamento de compras de suprimentos'));
  const rtext = await pdfText((await call(T.userId, 'GET', '/api/quick-wins/relatorios/resultados?format=pdf')).rawPayload);
  assert.match(rtext, /Janela do ponto de partida: 2026-06-01 a 2026-06-30 \(30 dias, 12 orçamentos\)/);
  assert.match(rtext, /ampliado para: /);
  assert.match(rtext, /AMPLIAR — Tempo por orçamento caiu/);
  assert.match(rtext, /Houve alteração depois do início da medição \(2\)/);
  assert.match(rtext, /ponto de partida de Tempo para montar um orçamento: 16 h · key\.eng@construtora\.com\.br/);
  assert.match(rtext.replace(/\s+/g, ' '), /motivo: O levantamento do Discovery/);
  assert.equal((await call(u.mestre, 'GET', '/api/quick-wins/relatorios/portfolio')).statusCode, 403);
});
