// Prova de generalidade (Fase 3B, item 7): um segundo tenant de demonstração,
// uma construtora, montado só pela API, como o admin faria pelo painel. Áreas
// com subárea, key users e patrocinador, tipo de dado próprio, quatro
// assistentes (três do catálogo e um do zero), duas bases de conhecimento,
// critérios próprios, seis oportunidades em áreas diferentes (uma enviada ao
// roadmap, uma arquivada) e três quick wins: um com dois assistentes, um só com
// a base e um ampliado para outra área. Um assistente fica em dois quick wins
// ativos ao mesmo tempo, e nenhuma execução é contada duas vezes. No fim, os
// dois relatórios do tenant. Nada aqui é código
// novo da plataforma: se um passo exigisse código, seria falha de generalização.
//   GREENIA_RELATORIOS_DIR=... grava os quatro arquivos dos relatórios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { extractText, getDocumentProxy } from 'unpdf';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';
import { docx } from './fixtures.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';

let db: TestDb;
let app: FastifyInstance;
const fake = new FakeProvider();
const u: Record<string, string> = {};
const qw: Record<string, string> = {};
const opp: Record<string, string> = {};
const doc: Record<string, string> = {};
let tenantId = '';
const DOM = 'horizonte.com.br';

const call = async (who: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) =>
  app.inject({ method, url, headers: (await loginAs(db, u[who])).headers, payload });
const ok = async (who: string, method: 'POST' | 'PUT' | 'PATCH', url: string, payload: object, code = [200, 201]) => {
  const r = await call(who, method, url, payload);
  assert.ok(code.includes(r.statusCode), `${method} ${url}: ${r.statusCode} ${r.body}`);
  return r.json();
};
const userId = async (email: string) => (await db.owner.query(`select id from users where tenant_id = $1 and email = $2`, [tenantId, email])).rows[0].id as string;
// Revisão com edição de verdade: muda o primeiro texto dos dados da última seção.
function editFirstText(result: { sections: { data: unknown }[] }) {
  let done = false;
  const walk = (x: unknown): unknown => {
    if (done) return x;
    if (typeof x === 'string' && x.trim()) { done = true; return x + ' (revisado)'; }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  const sections = result.sections.map((sec, i) => i === result.sections.length - 1 ? { ...sec, data: walk(sec.data) } : sec);
  return { sections };
}
const pdfText = async (b: Buffer) => (await extractText(await getDocumentProxy(new Uint8Array(b)), { mergePages: true })).text;
const out = process.env.GREENIA_RELATORIOS_DIR;

before(async () => {
  db = await createTestDb();
  app = await buildTestApp(db, { fake, objects: new MemoryObjectStore() });
  const P = await seedTenant(db.owner, 'theneil', { role: 'admin_theneil', domain: 'theneil.com.br' });
  await db.owner.query(`update tenants set is_platform = true where id = $1`, [P.tenantId]);
  u.theneil = P.userId;
});
after(async () => { await app?.close(); await db?.drop(); });

test('a TheNeil cria o tenant vazio: sem áreas, sem assistentes', async () => {
  const t = await ok('theneil', 'POST', '/api/platform/tenants', {
    slug: 'construtora-horizonte', name: 'Construtora Horizonte (demonstração)', domains: [DOM],
    providers: [{ kind: 'email_code', label: 'Código por email' }], admins: [`admin@${DOM}`],
    config: { branding: { orgName: 'Construtora Horizonte' }, texts: { tagline: 'A IA do dia a dia da Horizonte' } },
  });
  tenantId = t.id;
  u.admin = await userId(`admin@${DOM}`);
  assert.deepEqual((await call('admin', 'GET', '/api/admin/areas')).json(), []);
});

test('o admin cria as áreas, com Obras como subárea de Engenharia, e as pessoas de cada uma', async () => {
  for (const a of [
    { name: 'Engenharia', description: 'Projetos, orçamento e medição.' },
    { name: 'Obras', description: 'Canteiros em andamento.', parentSlug: 'engenharia', inheritPermissions: true },
    { name: 'Suprimentos', description: 'Cotação e compra de materiais.' },
    { name: 'Jurídico', description: 'Contratos com clientes e fornecedores.' },
    { name: 'Segurança do trabalho', description: 'Normas, inspeções e treinamentos.' },
    { name: 'Comercial', description: 'Propostas e editais.' },
  ]) await ok('admin', 'POST', '/api/admin/areas', a);
  const people: [string, string, string, string][] = [
    ['keyEng', `key.engenharia@${DOM}`, 'key_user', 'engenharia'], ['keySup', `key.suprimentos@${DOM}`, 'key_user', 'suprimentos'],
    ['keyJur', `key.juridico@${DOM}`, 'key_user', 'juridico'], ['keySeg', `key.seguranca@${DOM}`, 'key_user', 'seguranca-do-trabalho'],
    ['keyCom', `key.comercial@${DOM}`, 'key_user', 'comercial'], ['engObra', `eng.obra@${DOM}`, 'usuario', 'obras'],
    ['comprador', `comprador@${DOM}`, 'usuario', 'suprimentos'], ['diretoria', `diretoria@${DOM}`, 'patrocinador', ''],
  ];
  for (const [k, email, role, areaSlug] of people) { await ok('admin', 'POST', '/api/admin/memberships', { email, role, ...(areaSlug ? { areaSlug } : {}) }); u[k] = await userId(email); }
  const tree = (await call('admin', 'GET', '/api/admin/areas')).json();
  assert.ok(tree.some((a: { caminho: string }) => a.caminho === 'Engenharia > Obras'));
  // Key user de Engenharia enxerga Obras por herança; o de Suprimentos, não.
  assert.equal((await call('keyEng', 'GET', '/api/opportunities?area=obras')).statusCode, 200);
});

test('tipo de dado próprio: registro no CREA, testado antes de salvar', async () => {
  const det = { key: 'registro_crea', label: 'Registro no CREA', pattern: 'CREA[- ]?[A-Z]{2}[- ]?\\d{6,10}', class: 'amarela', action: 'avisar' };
  await ok('admin', 'PUT', '/api/admin/detectors', { detectors: [det] });
  const t = await ok('admin', 'POST', '/api/admin/detectors/test', { texto: 'Responsável técnico: CREA-SP 5061234567.' });
  assert.ok(JSON.stringify(t).includes('registro_crea'), JSON.stringify(t));
});

test('quatro assistentes: três do catálogo da TheNeil e um do zero; um compartilhado com outra área', async () => {
  await ok('admin', 'POST', '/api/admin/assistants', { slug: 'cotacoes', name: 'Cotações de materiais × especificação', areaSlug: 'suprimentos', status: 'ativo', modelo: { slug: 'suprimentos-cotacoes-especificacao' } });
  await ok('admin', 'POST', '/api/admin/assistants', { slug: 'clausulas-fornecedores', name: 'Cláusulas de contratos de fornecedores', areaSlug: 'juridico', status: 'ativo', modelo: { slug: 'juridico-localizar-clausulas' } });
  await ok('admin', 'POST', '/api/admin/assistants', { slug: 'requisitos-edital', name: 'Requisitos de edital', areaSlug: 'comercial', status: 'piloto', modelo: { slug: 'comercial-proposta-requisitos' } });
  await ok('admin', 'POST', '/api/admin/assistants', { slug: 'diario-de-obra', name: 'Resumo semanal do diário de obra', areaSlug: 'obras', status: 'ativo', definition: {
    description: 'Resume os registros do diário de obra da semana.', objective: 'Dar ao engenheiro a visão da semana sem ler todo o diário.',
    inputs: { text: { enabled: true, required: true }, files: { enabled: true, accept: ['pdf', 'docx', 'texto'] } },
    pipeline: [{ bloco: 'ler' }, { bloco: 'resumir', params: { topicos: ['Avanço físico', 'Ocorrências', 'Pendências para a semana'], palavrasMax: 300 } }],
    review: { required: true },
  } });
  // Suprimentos e Obras passam a usar o assistente do Jurídico (compras com contrato e contratos de empreitada).
  // Quem compartilha é o key user da área dona: vale na hora (pedido e aprovado por ele, na auditoria).
  const sh = await ok('keyJur', 'PUT', '/api/admin/assistants/clausulas-fornecedores/areas', { areas: ['suprimentos', 'obras'] });
  assert.deepEqual(sh.aplicados.sort(), ['obras', 'suprimentos']);
  const list = (await call('keySup', 'GET', '/api/assistants')).json() as { slug: string }[];
  assert.deepEqual(list.map(a => a.slug).sort(), ['clausulas-fornecedores', 'cotacoes']);
});

test('duas bases de conhecimento: Segurança do trabalho (para a empresa toda) e Engenharia', async () => {
  const altura = await ok('keySeg', 'POST', '/api/kb/documents', { title: 'Procedimento de trabalho em altura', areaSlug: 'seguranca-do-trabalho', contentType: 'text/plain',
    text: 'Acima de 2 metros, cinto tipo paraquedista com talabarte duplo. Permissão de trabalho assinada pelo técnico antes de subir. Ancoragem inspecionada no início do turno.' });
  doc.altura = altura.documentId;
  await ok('keySeg', 'PUT', `/api/kb/documents/${doc.altura}/areas`, { empresa: true });
  const medicao = await ok('keyEng', 'POST', '/api/kb/documents', { title: 'Padrão de medição de serviços', areaSlug: 'engenharia', contentType: 'text/plain',
    text: 'Alvenaria medida em metro quadrado, descontando vãos acima de 2 metros quadrados. Concreto medido em metro cúbico pelo projeto, não pela nota.' });
  doc.medicao = medicao.documentId;
  const found = (await call('engObra', 'GET', '/api/kb/search?q=cinto%20talabarte')).json();
  assert.ok(JSON.stringify(found).includes('trabalho em altura'), 'quem está em Obras encontra o procedimento da empresa toda');
});

test('critérios próprios: o admin acrescenta Impacto em segurança', async () => {
  const crit = (await call('admin', 'GET', '/api/quick-wins/criterios')).json();
  await ok('admin', 'PUT', '/api/admin/quick-wins/criterios', { escala: crit.escala, criterios: [...crit.criterios,
    { key: 'impacto_seguranca', label: 'Impacto em segurança', descricao: 'Reduz exposição a risco no canteiro.', peso: 20, sentido: 'maior_melhor' }] });
});

const OPPS: [string, string, string, object, string, string, Record<string, number>][] = [
  ['sup', 'keySup', 'suprimentos', { titulo: 'Comparar cotações com a especificação', processo: 'Cotação de materiais', problema: 'Cotação com unidade ou quantidade diferente passa e vira compra refeita.', executorAtual: 'Dois compradores', volume: '120 cotações por mês' }, 'comprovado', 'Quatro compras refeitas no último trimestre.', { valor: 5, complexidade: 2, risco: 2, dependencias: 2, impacto_seguranca: 1 }],
  ['jur', 'keyJur', 'juridico', { titulo: 'Localizar multa e reajuste nos contratos de fornecedores', processo: 'Análise de contratos', problema: 'Leitura integral de cada contrato para achar três cláusulas.', executorAtual: 'Advogada interna', volume: '30 contratos por mês' }, 'hipotese', '', { valor: 4, complexidade: 2, risco: 3, dependencias: 1, impacto_seguranca: 1 }],
  ['seg', 'keySeg', 'seguranca-do-trabalho', { titulo: 'Dúvidas de trabalho em altura sem esperar o técnico', processo: 'Orientação no canteiro', problema: 'Mestre de obras liga para o técnico para confirmar regra escrita no procedimento.', executorAtual: 'Técnico de segurança', volume: '25 ligações por semana' }, 'comprovado', 'Registro de chamados de setembro.', { valor: 4, complexidade: 1, risco: 2, dependencias: 1, impacto_seguranca: 5 }],
  ['obra', 'keyEng', 'obras', { titulo: 'Resumo semanal do diário de obra', processo: 'Acompanhamento de obra', problema: 'Engenheiro lê o diário inteiro de cada canteiro na sexta.', executorAtual: 'Engenheiros de obra', volume: '6 canteiros' }, 'comprovado', 'Cronometrado em duas semanas.', { valor: 4, complexidade: 2, risco: 1, dependencias: 1, impacto_seguranca: 3 }],
  ['com', 'keyCom', 'comercial', { titulo: 'Checar requisitos de edital antes da proposta', processo: 'Propostas para licitação', problema: 'Documento exigido esquecido desclassifica a proposta.', executorAtual: 'Analista comercial', volume: '8 editais por mês' }, 'hipotese', '', { valor: 5, complexidade: 3, risco: 3, dependencias: 2, impacto_seguranca: 1 }],
  ['eng', 'keyEng', 'engenharia', { titulo: 'Conferir boletins de medição de empreiteiros', processo: 'Medição de serviços', problema: 'Boletim medido fora do padrão da empresa.', executorAtual: 'Engenheiro de planejamento', volume: '40 boletins por mês' }, 'hipotese', '', { valor: 3, complexidade: 4, risco: 3, dependencias: 4, impacto_seguranca: 1 }],
];

test('seis oportunidades em áreas diferentes, avaliadas; uma enviada ao roadmap e outra arquivada, com motivo', async () => {
  for (const [k, who, areaSlug, o, evidencia, evidenciaNota, notas] of OPPS) {
    opp[k] = (await ok(who, 'POST', '/api/opportunities', { areaSlug, ...o, evidencia, evidenciaNota })).id;
    await ok(who, 'POST', `/api/opportunities/${opp[k]}/avaliar`, { notas, nota: 'Avaliada no comitê de melhoria com o patrocinador.' });
  }
  await ok('keyEng', 'POST', `/api/opportunities/${opp.eng}/roadmap`, { motivo: 'Depende do novo padrão de medição e de integração com o sistema dos empreiteiros: projeto, não quick win.' });
  await ok('keyCom', 'POST', `/api/opportunities/${opp.com}/arquivar`, { motivo: 'As licitações passam a ser feitas por uma assessoria externa.' });
  const all = (await call('diretoria', 'GET', '/api/opportunities')).json() as { area: string; status: string; motivo: string | null }[];
  assert.equal(new Set(all.map(o => o.area)).size, 6);                       // o patrocinador do tenant vê todas as áreas
  assert.deepEqual(all.map(o => o.status).sort(), ['arquivada', 'avaliada', 'avaliada', 'avaliada', 'avaliada', 'roadmap']);
  const seguras = (await call('admin', 'GET', '/api/opportunities?criterio=impacto_seguranca&min=3')).json() as { titulo: string }[];
  assert.deepEqual(seguras.map(o => o.titulo).sort(), ['Dúvidas de trabalho em altura sem esperar o técnico', 'Resumo semanal do diário de obra']);
});

// Janela de medição dos últimos 20 dias: as execuções do teste acontecem hoje.
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const TODAY = day(0), MED_START = day(-19);
const JANELAS = (base: [string, string, number], med: [string, string, number | null], unidadeVolume: string) =>
  ({ pontoDePartida: { inicio: base[0], fim: base[1], volume: base[2] }, medicao: { inicio: med[0], fim: med[1], volume: med[2] }, unidadeVolume });

test('três quick wins, selecionados pelo patrocinador: dois assistentes, só a base, e um que será ampliado', async () => {
  const sup = {
    objetivo: 'Nenhuma compra refeita por cotação fora da especificação.', responsavel: `key.suprimentos@${DOM}`, prazo: '2026-12-15',
    recursos: { assistentes: ['cotacoes', 'clausulas-fornecedores'] }, revisores: [`key.juridico@${DOM}`],
    indicadores: [
      { key: 'compras_refeitas', label: 'Compras refeitas', unit: 'compras', direction: 'menor_melhor', comparacao: 'por_mes' },
      { key: 'tempo_por_cotacao', label: 'Tempo por cotação conferida', unit: 'min', direction: 'menor_melhor', auto: 'tempo_ate_revisao' },
    ], janelas: JANELAS(['2026-06-01', '2026-08-31', 360], [MED_START, TODAY, 80], 'cotações'), nota: 'Maior nota do portfólio e evidência comprovada.' };
  assert.equal((await call('keySup', 'POST', `/api/opportunities/${opp.sup}/selecionar`, sup)).json().error, 'so_patrocinador_ou_admin');   // key user propõe
  qw.sup = (await ok('diretoria', 'POST', `/api/opportunities/${opp.sup}/selecionar`, sup)).id;
  qw.seg = (await ok('diretoria', 'POST', `/api/opportunities/${opp.seg}/selecionar`, {
    objetivo: 'Mestre de obras encontra a regra na base sem ligar para o técnico.', responsavel: `key.seguranca@${DOM}`,
    recursos: { documentos: [doc.altura] },
    indicadores: [{ key: 'ligacoes_tecnico', label: 'Ligações ao técnico por semana', unit: 'ligações', direction: 'menor_melhor' }],
    janelas: JANELAS(['2026-09-01', '2026-09-07', 25], ['2026-10-01', '2026-10-07', null], 'ligações'), nota: 'Só precisa da base de conhecimento; nenhum assistente.' })).id;
  qw.obra = (await ok('diretoria', 'POST', `/api/opportunities/${opp.obra}/selecionar`, {
    objetivo: 'Engenheiro fecha a semana de cada canteiro em menos de uma hora.', responsavel: `key.engenharia@${DOM}`,
    recursos: { assistentes: ['diario-de-obra', 'clausulas-fornecedores'], documentos: [doc.medicao] },
    indicadores: [
      { key: 'horas_leitura', label: 'Horas de leitura do diário por semana', unit: 'h', direction: 'menor_melhor' },
      { key: 'aprovacao', label: 'Resumos aprovados sem edição', unit: '%', direction: 'maior_melhor', auto: 'aprovacao_sem_edicao' },
    ], janelas: JANELAS(['2026-08-01', '2026-08-15', 12], [MED_START, TODAY, 18], 'semanas de canteiro'), /* item não é execução: volume informado */ nota: 'Rápido de implantar e com impacto na segurança do canteiro.' })).id;
  const list = (await call('admin', 'GET', '/api/quick-wins')).json() as { titulo: string; etapa: string; assistentes: number; documentos: number }[];
  assert.deepEqual(list.map(q => [q.assistentes, q.documentos]).sort(), [[0, 1], [2, 0], [2, 1]]);
  assert.ok(list.every(q => q.etapa === 'em_implantacao'));
});

test('assistente em dois quick wins ativos: a área de quem executa decide; sem área, a pessoa escolhe; nenhuma execução contada duas vezes', async () => {
  // Ponto de partida registrado na implantação, antes de começar a medição.
  const baselines: [string, string, object][] = [
    ['sup', 'keySup', { indicador: 'compras_refeitas', fase: 'antes', valor: 4, origem: 'medido', periodoInicio: '2026-06-01', periodoFim: '2026-08-31', metodo: 'contagem das compras refeitas no ERP' }],
    ['sup', 'keySup', { indicador: 'tempo_por_cotacao', fase: 'antes', valor: 25, origem: 'informado', informadoPor: 'Coordenação de suprimentos' }],
    ['obra', 'keyEng', { indicador: 'horas_leitura', fase: 'antes', valor: 4, origem: 'medido', periodoInicio: '2026-08-01', periodoFim: '2026-08-15', metodo: 'cronometragem de dois engenheiros' }],
  ];
  for (const [k, who, v] of baselines) await ok(who, 'POST', `/api/quick-wins/${qw[k]}/valores`, v);
  for (const k of ['sup', 'obra']) await ok(k === 'sup' ? 'keySup' : 'keyEng', 'POST', `/api/quick-wins/${qw[k]}/etapa`, { etapa: 'em_medicao', nota: 'Duas semanas de uso; começa a medição.' });
  const contrato = Buffer.from(await docx(['Contrato de fornecimento de aço CA-50.', 'Cláusula 7: multa de 2% por atraso.', 'Cláusula 9: reajuste anual pelo INCC.'])).toString('base64');
  const run = (who: string, extra: object = {}) => call(who, 'POST', '/api/runs', { assistant: 'clausulas-fornecedores', files: [{ name: 'contrato.docx', contentBase64: contrato }], ...extra });
  const opcoes = (await call('admin', 'GET', '/api/assistants/clausulas-fornecedores')).json().quickWins;
  assert.equal(opcoes.length, 2);
  assert.equal((await run('comprador')).json().quickWinId, qw.sup);          // Suprimentos: só um quick win na área
  assert.equal((await run('engObra')).json().quickWinId, qw.obra);           // Obras: o outro
  const r = await run('admin');                                               // admin sem área: precisa escolher
  assert.deepEqual([r.statusCode, r.json().error], [409, 'escolha_o_quick_win']);
  assert.equal((await run('admin', { quickWinId: qw.sup })).json().quickWinId, qw.sup);
  const linked = (await db.owner.query(`select r.quick_win_id, count(*)::int as n from runs r join assistants a on a.id = r.assistant_id where a.slug = 'clausulas-fornecedores' and r.tenant_id = $1 group by 1`, [tenantId])).rows;
  assert.deepEqual(linked.map(x => [x.quick_win_id, x.n]).sort(), [[qw.obra, 1], [qw.sup, 2]].sort());
  const sup = (await call('keySup', 'GET', `/api/quick-wins/${qw.sup}`)).json();
  const obra = (await call('keyEng', 'GET', `/api/quick-wins/${qw.obra}`)).json();
  assert.equal(sup.execucoes.execucoes + obra.execucoes.execucoes, 3);       // 3 execuções, 3 contagens: nenhuma em dobro
});

test('ciclo com medição: execuções reais do assistente, ponto de partida e depois, janelas, decisão do patrocinador', async () => {
  // Na implantação, o procedimento de altura estava desatualizado: o quick win volta ao roadmap, com motivo.
  await ok('keySeg', 'POST', `/api/quick-wins/${qw.seg}/roadmap`, { motivo: 'O procedimento de trabalho em altura precisa ser revisado pela engenharia de segurança antes.' });
  assert.equal((await call('keySeg', 'GET', `/api/quick-wins/${qw.seg}`)).json().quickWin.etapa, 'roadmap');
  // Volta ao roadmap na implantação: a oportunidade é reaberta, avaliada e selecionada de novo, no lugar.
  await ok('keySeg', 'POST', `/api/opportunities/${opp.seg}/reabrir`, { motivo: 'Procedimento revisado; volta a ser quick win.' });
  await ok('keySeg', 'POST', `/api/opportunities/${opp.seg}/avaliar`, { notas: { valor: 4, complexidade: 1, risco: 2, dependencias: 1, impacto_seguranca: 5 }, nota: 'Reavaliada depois da revisão.' });
  const old = qw.seg;
  qw.seg = (await ok('diretoria', 'POST', `/api/opportunities/${opp.seg}/selecionar`, {
    objetivo: 'Mestre de obras encontra a regra na base sem ligar para o técnico.', responsavel: `key.seguranca@${DOM}`, substitui: old,
    recursos: { documentos: [doc.altura] }, indicadores: [{ key: 'ligacoes_tecnico', label: 'Ligações ao técnico por semana', unit: 'ligações', direction: 'menor_melhor' }],
    janelas: JANELAS(['2026-09-01', '2026-09-07', 25], ['2026-10-01', '2026-10-07', null], 'ligações'), nota: 'Selecionada de novo, com o procedimento revisado.' })).id;
  // Execuções do assistente do diário, revisadas pelo key user: viram medição automática do quick win.
  for (const [i, dec] of (['aprovado', 'aprovado', 'aprovado_com_edicao'] as const).entries()) {
    const r = await ok('engObra', 'POST', '/api/runs', { assistant: 'diario-de-obra', text: `Semana ${i + 1}: concretagem da laje do 3º pavimento; chuva na quarta; falta de aço CA-50 para a próxima semana.` }, [202]);
    assert.equal(r.quickWinId, qw.obra);
    const body = dec === 'aprovado' ? { decisao: dec } : { decisao: dec, resultadoEditado: editFirstText((await call('keyEng', 'GET', `/api/runs/${r.runId}`)).json().result), motivo: 'Ajuste no texto das pendências.' };
    await ok('keyEng', 'POST', `/api/runs/${r.runId}/review`, body);
  }
  const values: [string, string, object][] = [
    ['sup', 'keySup', { indicador: 'compras_refeitas', fase: 'depois', valor: 0, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-30', metodo: 'contagem das compras refeitas no ERP' }],
    // Correção do ponto de partida durante a medição: só com motivo, e aparece no relatório de resultados.
    ['sup', 'keySup', { indicador: 'tempo_por_cotacao', fase: 'antes', valor: 32, origem: 'medido', periodoInicio: '2026-08-01', periodoFim: '2026-08-31', metodo: 'cronometragem de 30 cotações', motivo: 'O valor informado não contava a conferência da unidade; foi medido de novo.' }],
    ['seg', 'keySeg', { indicador: 'ligacoes_tecnico', fase: 'antes', valor: 25, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-07', metodo: 'registro de chamados do técnico' }],
    ['obra', 'keyEng', { indicador: 'horas_leitura', fase: 'depois', valor: 0.8, origem: 'medido', periodoInicio: '2026-09-08', periodoFim: '2026-09-22', metodo: 'cronometragem de dois engenheiros, com revisão' }],
  ];
  for (const [k, who, v] of values) await ok(who, 'POST', `/api/quick-wins/${qw[k]}/valores`, v);
  const r = (await call('keyEng', 'GET', `/api/quick-wins/${qw.obra}`)).json();
  assert.equal(r.semPontoDePartida, false);
  assert.equal(r.execucoes.execucoes, 4);                                     // 3 do diário + 1 das cláusulas
  assert.equal(r.indicadores.find((i: { key: string }) => i.key === 'aprovacao').automatico, 66.7);
  assert.deepEqual(r.indicadores.find((i: { key: string }) => i.key === 'horas_leitura').comparacao, { diferenca: -3.2, percentual: -80, melhorou: true, parcial: false });
  const s = (await call('keySup', 'GET', `/api/quick-wins/${qw.sup}`)).json();
  const c = s.indicadores.find((i: { key: string }) => i.key === 'compras_refeitas');
  assert.deepEqual([c.comparacaoPor, c.antes.comparavel, c.depois.comparavel], ['compras por mês', 1.32, 0]);   // 4 em 92 dias × 0 no mês de setembro
  assert.ok(s.janelas.avisos.some((w: string) => /duração muito diferente: 92 dias no ponto de partida e 20 dias/.test(w)));
  assert.equal((await call('keyEng', 'POST', `/api/quick-wins/${qw.obra}/decisao`, { decisao: 'ampliar', justificativa: 'Key user não decide.' })).json().error, 'so_patrocinador_ou_admin');
  await ok('diretoria', 'POST', `/api/quick-wins/${qw.obra}/decisao`, { decisao: 'ampliar', justificativa: 'Leitura caiu de 4 h para menos de 1 h por semana; a Segurança do trabalho quer o mesmo para as inspeções.' });
  await ok('diretoria', 'POST', `/api/quick-wins/${qw.sup}/decisao`, { decisao: 'manter', justificativa: 'Nenhuma compra refeita no período medido.' });
});

test('ampliação para outra área: mesmo assistente, baseline próprio, vínculo registrado', async () => {
  qw.amp = (await ok('diretoria', 'POST', `/api/quick-wins/${qw.obra}/ampliar`, {
    titulo: 'Resumo semanal das inspeções de segurança', objetivo: 'Técnico fecha a semana das inspeções em menos de uma hora.',
    responsavel: `key.seguranca@${DOM}`, areas: ['seguranca-do-trabalho'], recursos: 'compartilhar', nota: 'Mesmo formato de registro semanal do diário.',
    janelas: { pontoDePartida: { inicio: '2026-09-01', fim: '2026-09-30', volume: 4 }, medicao: { inicio: '2026-10-01', fim: '2026-10-31' } } })).id;
  // Compartilhar com a Segurança do trabalho depende dos key users das áreas donas: fica pendente até eles aprovarem.
  assert.equal(((await call('keySeg', 'GET', '/api/assistants')).json() as { slug: string }[]).some(a => a.slug === 'diario-de-obra'), false);
  for (const who of ['keyEng', 'keyJur']) {
    const pend = (await call(who, 'GET', '/api/admin/share-requests')).json() as { id: string; podeAprovar: boolean; recurso: string }[];
    assert.ok(pend.length >= 1, who);
    for (const p of pend.filter(x => x.podeAprovar)) await ok(who, 'POST', `/api/admin/share-requests/${p.id}/aprovar`, { nota: 'Aprovado para a ampliação.' });
  }
  const r = (await call('keySeg', 'GET', `/api/quick-wins/${qw.amp}`)).json();
  assert.equal(r.semPontoDePartida, true);                                  // baseline próprio: ainda não registrado
  assert.deepEqual(r.quickWin.recursos.filter((x: { tipo: string }) => x.tipo === 'assistente').map((x: { slug: string }) => x.slug).sort(), ['clausulas-fornecedores', 'diario-de-obra']);
  assert.equal(r.trajetoria.origem[0].titulo, 'Resumo semanal do diário de obra');
  // O assistente passa a ser usado pela Segurança do trabalho.
  assert.ok(((await call('keySeg', 'GET', '/api/assistants')).json() as { slug: string }[]).some(a => a.slug === 'diario-de-obra'));
});

test('os dois relatórios do tenant, em PDF e XLSX, com as áreas criadas pelo cliente', async () => {
  if (out) mkdirSync(out, { recursive: true });
  const get = async (url: string, name: string) => {
    const r = await call('admin', 'GET', url);
    assert.equal(r.statusCode, 200, `${url}: ${r.body.slice(0, 200)}`);
    if (out) writeFileSync(join(out, name), r.rawPayload);
    return r.rawPayload;
  };
  const pPdf = await pdfText(await get('/api/quick-wins/relatorios/portfolio?format=pdf', 'portfolio-oportunidades.pdf'));
  for (const area of ['Engenharia', 'Obras', 'Suprimentos', 'Jurídico', 'Segurança do trabalho', 'Comercial']) assert.match(pPdf, new RegExp(area));
  assert.match(pPdf, /Impacto em segurança/);
  assert.match(pPdf, /Motivo \(enviada ao roadmap\): Depende do novo padrão de medição/);
  assert.match(pPdf, /Motivo \(arquivada\): As licitações passam a ser feitas por uma assessoria externa/);
  const pX = new ExcelJS.Workbook();
  await pX.xlsx.load(await get('/api/quick-wins/relatorios/portfolio?format=xlsx', 'portfolio-oportunidades.xlsx') as unknown as ArrayBuffer);
  assert.equal(pX.getWorksheet('Portfólio')!.rowCount, 7);                  // cabeçalho + 6 oportunidades
  const rPdf = await pdfText(await get('/api/quick-wins/relatorios/resultados?format=pdf&de=2026-01-01&ate=2026-12-31', 'resultados-quick-wins.pdf'));
  assert.match(rPdf, /ampliado de: Resumo semanal do diário de obra/);
  assert.match(rPdf, /AMPLIAR/);
  assert.match(rPdf, /MANTER/);
  assert.match(rPdf, /Sem ponto de partida/);
  assert.match(rPdf, /automático: média das execuções/);
  assert.match(rPdf, /Janela do ponto de partida: 2026-06-01 a 2026-08-31 \(92 dias, 360 cotações\)/);
  assert.match(rPdf, /Aviso: Janelas com duração muito diferente/);
  assert.match(rPdf, /enviado ao roadmap/);
  assert.match(rPdf, /Houve alteração depois do início da medição \(1\)/);
  const rX = new ExcelJS.Workbook();
  await rX.xlsx.load(await get('/api/quick-wins/relatorios/resultados?format=xlsx&de=2026-01-01&ate=2026-12-31', 'resultados-quick-wins.xlsx') as unknown as ArrayBuffer);
  assert.equal(rX.getWorksheet('Quick wins')!.rowCount, 6);                  // cabeçalho + 5 quick wins (um deles voltou ao roadmap)
});
