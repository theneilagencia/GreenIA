// Prova de generalidade (Fase 3B, itens 6 e 8g): um segundo tenant de
// demonstração, uma construtora, montado só pela API, como o admin faria pelo
// painel. Áreas com subárea, key users, tipo de dado próprio, quatro
// assistentes (três do catálogo e um do zero), duas bases de conhecimento,
// critérios de avaliação próprios, seis oportunidades em áreas diferentes e
// três quick wins: um com dois assistentes, um só com a base e um ampliado
// para outra área. No fim, os dois relatórios do tenant. Nada aqui é código
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

const call = async (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({ method, url, headers: (await loginAs(db, u[who])).headers, payload });
const ok = async (who: string, method: 'POST' | 'PUT', url: string, payload: object, code = [200, 201]) => {
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
  ];
  for (const [k, email, role, areaSlug] of people) { await ok('admin', 'POST', '/api/admin/memberships', { email, role, areaSlug }); u[k] = await userId(email); }
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
  // Suprimentos passa a usar o assistente do Jurídico nas compras com contrato.
  await ok('admin', 'PUT', '/api/admin/assistants/clausulas-fornecedores/areas', { areas: ['suprimentos'] });
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

test('seis oportunidades em áreas diferentes, avaliadas; uma volta ao portfólio com motivo', async () => {
  for (const [k, who, areaSlug, o, evidencia, evidenciaNota, notas] of OPPS) {
    opp[k] = (await ok(who, 'POST', '/api/opportunities', { areaSlug, ...o, evidencia, evidenciaNota })).id;
    await ok(who, 'POST', `/api/opportunities/${opp[k]}/avaliar`, { notas, nota: 'Avaliada no comitê de melhoria com o patrocinador.' });
  }
  await ok('keyEng', 'POST', `/api/opportunities/${opp.eng}/devolver`, { motivo: 'Depende do novo padrão de medição, que sai em dezembro.' });
  const all = (await call('admin', 'GET', '/api/opportunities')).json() as { area: string; status: string }[];
  assert.equal(new Set(all.map(o => o.area)).size, 6);
  assert.equal(all.filter(o => o.status === 'avaliada').length, 5);
  const seguras = (await call('admin', 'GET', '/api/opportunities?criterio=impacto_seguranca&min=3')).json() as { titulo: string }[];
  assert.deepEqual(seguras.map(o => o.titulo).sort(), ['Dúvidas de trabalho em altura sem esperar o técnico', 'Resumo semanal do diário de obra']);
});

test('três quick wins: dois assistentes, só a base, e um que será ampliado', async () => {
  qw.sup = (await ok('keySup', 'POST', `/api/opportunities/${opp.sup}/selecionar`, {
    objetivo: 'Nenhuma compra refeita por cotação fora da especificação.', responsavel: `key.suprimentos@${DOM}`, prazo: '2026-12-15',
    recursos: { assistentes: ['cotacoes', 'clausulas-fornecedores'] }, revisores: [`key.juridico@${DOM}`],
    indicadores: [
      { key: 'compras_refeitas', label: 'Compras refeitas por mês', unit: 'compras', direction: 'menor_melhor' },
      { key: 'tempo_por_cotacao', label: 'Tempo por cotação conferida', unit: 'min', direction: 'menor_melhor', auto: 'tempo_ate_revisao' },
    ], nota: 'Maior nota do portfólio e evidência comprovada.' })).id;
  qw.seg = (await ok('keySeg', 'POST', `/api/opportunities/${opp.seg}/selecionar`, {
    objetivo: 'Mestre de obras encontra a regra na base sem ligar para o técnico.', responsavel: `key.seguranca@${DOM}`,
    recursos: { documentos: [doc.altura] },
    indicadores: [{ key: 'ligacoes_tecnico', label: 'Ligações ao técnico por semana', unit: 'ligações', direction: 'menor_melhor' }],
    nota: 'Só precisa da base de conhecimento; nenhum assistente.' })).id;
  qw.obra = (await ok('keyEng', 'POST', `/api/opportunities/${opp.obra}/selecionar`, {
    objetivo: 'Engenheiro fecha a semana de cada canteiro em menos de uma hora.', responsavel: `key.engenharia@${DOM}`,
    recursos: { assistentes: ['diario-de-obra'], documentos: [doc.medicao] },
    indicadores: [
      { key: 'horas_leitura', label: 'Horas de leitura do diário por semana', unit: 'h', direction: 'menor_melhor' },
      { key: 'aprovacao', label: 'Resumos aprovados sem edição', unit: '%', direction: 'maior_melhor', auto: 'aprovacao_sem_edicao' },
    ], nota: 'Rápido de implantar e com impacto na segurança do canteiro.' })).id;
  const list = (await call('admin', 'GET', '/api/quick-wins')).json() as { titulo: string; assistentes: number; documentos: number }[];
  assert.deepEqual(list.map(q => [q.assistentes, q.documentos]).sort(), [[0, 1], [1, 1], [2, 0]]);
});

test('ciclo com medição: execuções reais do assistente, ponto de partida e depois, decisão de ampliar', async () => {
  for (const s of ['em_implantacao', 'em_medicao']) {
    for (const k of ['sup', 'obra']) await ok(k === 'sup' ? 'keySup' : 'keyEng', 'POST', `/api/quick-wins/${qw[k]}/etapa`, { etapa: s, nota: s === 'em_implantacao' ? 'Recursos publicados para a equipe.' : 'Duas semanas de uso; começa a medição.' });
  }
  await ok('keySeg', 'POST', `/api/quick-wins/${qw.seg}/etapa`, { etapa: 'em_implantacao', nota: 'Procedimento publicado e divulgado no DDS.' });
  // Execuções do assistente do diário, revisadas pelo key user: viram medição automática do quick win.
  for (const [i, dec] of (['aprovado', 'aprovado', 'aprovado_com_edicao'] as const).entries()) {
    const r = await ok('engObra', 'POST', '/api/runs', { assistant: 'diario-de-obra', text: `Semana ${i + 1}: concretagem da laje do 3º pavimento; chuva na quarta; falta de aço CA-50 para a próxima semana.` }, [202]);
    const body = dec === 'aprovado' ? { decisao: dec } : { decisao: dec, resultadoEditado: editFirstText((await call('keyEng', 'GET', `/api/runs/${r.runId}`)).json().result), motivo: 'Ajuste no texto das pendências.' };
    await ok('keyEng', 'POST', `/api/runs/${r.runId}/review`, body);
  }
  const values: [string, string, object][] = [
    ['sup', 'keySup', { indicador: 'compras_refeitas', fase: 'antes', valor: 1.3, origem: 'medido', periodoInicio: '2026-06-01', periodoFim: '2026-08-31', metodo: 'contagem das compras refeitas no ERP' }],
    ['sup', 'keySup', { indicador: 'compras_refeitas', fase: 'depois', valor: 0, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-23', metodo: 'contagem das compras refeitas no ERP' }],
    ['sup', 'keySup', { indicador: 'tempo_por_cotacao', fase: 'antes', valor: 25, origem: 'informado', informadoPor: 'Coordenação de suprimentos' }],
    ['seg', 'keySeg', { indicador: 'ligacoes_tecnico', fase: 'antes', valor: 25, origem: 'medido', periodoInicio: '2026-09-01', periodoFim: '2026-09-07', metodo: 'registro de chamados do técnico' }],
    ['obra', 'keyEng', { indicador: 'horas_leitura', fase: 'antes', valor: 4, origem: 'medido', periodoInicio: '2026-08-01', periodoFim: '2026-08-15', metodo: 'cronometragem de dois engenheiros' }],
    ['obra', 'keyEng', { indicador: 'horas_leitura', fase: 'depois', valor: 0.8, origem: 'medido', periodoInicio: '2026-09-08', periodoFim: '2026-09-22', metodo: 'cronometragem de dois engenheiros, com revisão' }],
  ];
  for (const [k, who, v] of values) await ok(who, 'POST', `/api/quick-wins/${qw[k]}/valores`, v);
  const r = (await call('keyEng', 'GET', `/api/quick-wins/${qw.obra}?de=2026-01-01&ate=2026-12-31`)).json();
  assert.equal(r.semPontoDePartida, false);
  assert.equal(r.execucoes.execucoes, 3);
  assert.equal(r.indicadores.find((i: { key: string }) => i.key === 'aprovacao').automatico, 66.7);
  assert.deepEqual(r.indicadores.find((i: { key: string }) => i.key === 'horas_leitura').comparacao, { diferenca: -3.2, percentual: -80, melhorou: true, parcial: false });
  await ok('keyEng', 'POST', `/api/quick-wins/${qw.obra}/decisao`, { decisao: 'ampliar', justificativa: 'Leitura caiu de 4 h para menos de 1 h por semana; a Segurança do trabalho quer o mesmo para as inspeções.' });
  await ok('keySup', 'POST', `/api/quick-wins/${qw.sup}/decisao`, { decisao: 'manter', justificativa: 'Nenhuma compra refeita no período medido.' });
});

test('ampliação para outra área: mesmo assistente, baseline próprio, vínculo registrado', async () => {
  qw.amp = (await ok('admin', 'POST', `/api/quick-wins/${qw.obra}/ampliar`, {
    titulo: 'Resumo semanal das inspeções de segurança', objetivo: 'Técnico fecha a semana das inspeções em menos de uma hora.',
    responsavel: `key.seguranca@${DOM}`, areas: ['seguranca-do-trabalho'], nota: 'Mesmo formato de registro semanal do diário.' })).id;
  const r = (await call('keySeg', 'GET', `/api/quick-wins/${qw.amp}`)).json();
  assert.equal(r.semPontoDePartida, true);                                  // baseline próprio: ainda não registrado
  assert.deepEqual(r.quickWin.recursos.filter((x: { tipo: string }) => x.tipo === 'assistente').map((x: { slug: string }) => x.slug), ['diario-de-obra']);
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
  assert.match(pPdf, /quick win: em implantação/);
  assert.match(pPdf, /Último registro: Devolvida ao portfólio: Depende do novo padrão de medição/);
  const pX = new ExcelJS.Workbook();
  await pX.xlsx.load(await get('/api/quick-wins/relatorios/portfolio?format=xlsx', 'portfolio-oportunidades.xlsx') as unknown as ArrayBuffer);
  assert.equal(pX.getWorksheet('Portfólio')!.rowCount, 7);                  // cabeçalho + 6 oportunidades
  const rPdf = await pdfText(await get('/api/quick-wins/relatorios/resultados?format=pdf&de=2026-01-01&ate=2026-12-31', 'resultados-quick-wins.pdf'));
  assert.match(rPdf, /ampliado de: Resumo semanal do diário de obra/);
  assert.match(rPdf, /AMPLIAR/);
  assert.match(rPdf, /MANTER/);
  assert.match(rPdf, /Sem ponto de partida/);
  assert.match(rPdf, /automático: média das execuções/);
  const rX = new ExcelJS.Workbook();
  await rX.xlsx.load(await get('/api/quick-wins/relatorios/resultados?format=xlsx&de=2026-01-01&ate=2026-12-31', 'resultados-quick-wins.xlsx') as unknown as ArrayBuffer);
  assert.equal(rX.getWorksheet('Quick wins')!.rowCount, 5);                  // cabeçalho + 4 quick wins
});
