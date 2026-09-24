// Página de assistentes (Fase 3) num navegador de verdade, servida pelo
// servidor real com o tenant de demonstração: execução, revisão lado a lado,
// resultados, administração, política, roteiro e incidente.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { createTestDb, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { seedDemo } from '../src/demo/seed.ts';
import { fiscalSamples } from '../src/demo/samples.ts';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright') as typeof import('playwright');

let db: TestDb;
let app: FastifyInstance;
let base = '';
let browser: import('playwright').Browser;
let tenantId = '';
const u: Record<string, string> = {};
const PAGE = '/Assistentes%20GreenIA.dc.html?tenant=demo';

before(async () => {
  db = await createTestDb();
  app = await buildTestApp(db, { fake: new FakeProvider(), objects: new MemoryObjectStore() }, { COOKIE_SECURE: 'false' });
  tenantId = (await seedDemo(db.owner, app.deps.objects)).tenantId;
  const id = async (email: string) => (await db.owner.query(`select id from users where tenant_id = $1 and email = $2`, [tenantId, email])).rows[0].id as string;
  u.key = await id('key.fiscal@demonstracao.com.br');
  u.admin = await id('admin@demonstracao.com.br');
  u.user = await addPerson(db, tenantId, 'pessoa.fiscal@demonstracao.com.br', 'usuario', 'fiscal');
  u.sponsor = await addPerson(db, tenantId, 'diretoria.fiscal@demonstracao.com.br', 'patrocinador', 'fiscal');
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  (app.deps.config as { PUBLIC_URL: string }).PUBLIC_URL = base;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); await app?.close(); await db?.drop(); });

// Sessão aberta direto no banco; o fluxo de login tem teste próprio (web.e2e).
async function openAs(userId: string) {
  const s = await loginAs(db, userId);
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addCookies([{ name: 'gia_session', value: s.cookie.split('=')[1], url: base }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base + PAGE);
  return { page, errors, context };
}

// Primeiro acesso: ciência da Política de Uso e roteiro (pulado).
async function firstAccess(page: import('playwright').Page) {
  await page.getByRole('dialog', { name: /Política de Uso de IA/ }).waitFor();
  await page.getByRole('button', { name: 'Li e estou ciente' }).click();
  await page.getByRole('dialog', { name: 'Boas-vindas à GreenIA' }).waitFor();
  await page.getByRole('button', { name: 'Pular' }).click();
}

let runId = '';

test('pessoa da área executa a conferência de NF-e e vê o rascunho com as divergências', async () => {
  const { page, errors, context } = await openAs(u.user);
  await firstAccess(page);
  assert.equal(await page.getByRole('button', { name: 'Administração' }).count(), 0, 'usuário comum não vê administração');
  await page.getByRole('button', { name: /Conferência de NF-e de entrada/ }).click();
  await page.getByRole('heading', { name: 'Conferência de NF-e de entrada × pedido' }).waitFor();
  const files = await fiscalSamples();
  await page.setInputFiles('#gia-run-files', files.map(f => ({ name: f.name, mimeType: f.mime, buffer: Buffer.from(f.bytes) })));
  await page.getByText(/pedido-4500123\.xlsx · \d+ KB/).waitFor();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByText('Rascunho: aguardando revisão').first().waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Itens da nota × itens do pedido' }).waitFor();
  assert.ok(await page.getByRole('cell', { name: 'P-002' }).first().isVisible());
  assert.ok(await page.getByText('diferença de 63,9 (4,04%), acima da tolerância').isVisible());
  runId = (await db.owner.query(`select id from runs where tenant_id = $1 order by created_at desc limit 1`, [tenantId])).rows[0].id;
  // Reportar incidente a partir de qualquer tela.
  await page.getByRole('button', { name: 'Reportar incidente' }).click();
  await page.getByRole('dialog', { name: 'Reportar incidente' }).getByLabel('Descrição').fill('A nota apontou palete sem pedido, mas é retornável.');
  await page.getByRole('dialog', { name: 'Reportar incidente' }).getByRole('button', { name: 'Enviar' }).click();
  await page.getByText(/Incidente [0-9A-F]{8} registrado/).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('key user revisa lado a lado: origem de cada divergência, edição e exportação', async () => {
  const { page, errors, context } = await openAs(u.key);
  await firstAccess(page);
  await page.getByRole('button', { name: 'Revisão' }).click();
  await page.getByRole('button', { name: /Conferência de NF-e de entrada/ }).click();
  await page.getByRole('heading', { name: 'Arquivos enviados' }).waitFor();
  assert.ok(await page.getByRole('link', { name: /nfe-000123\.xml/ }).isVisible());
  // Clique numa divergência: a origem aparece ao lado.
  await page.getByRole('cell', { name: 'P-002' }).first().click();
  await page.getByText('48 (nfe-000123.xml › item 2)').waitFor();
  assert.ok(await page.getByText('50 (pedido-4500123.xlsx › Itens › linha 3)').isVisible());
  // Edição: remove o P-009 (palete retornável) e aprova com edição.
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('row', { name: /P-009/ }).getByRole('button', { name: 'Remover' }).click();
  await page.getByRole('button', { name: 'Salvar edição e aprovar' }).click();
  await page.getByText('Revisão registrada: Aprovada com edição.').waitFor();
  assert.equal(await page.getByRole('row', { name: /P-009/ }).count(), 0);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'XLSX', exact: true }).click()]);
  assert.match(download.suggestedFilename(), /\.xlsx$/);
  const st = (await db.owner.query(`select status, review_diff from runs where id = $1`, [runId])).rows[0];
  assert.equal(st.status, 'aprovado_com_edicao');
  assert.match(st.review_diff, /P-009/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('quick wins: key user registra, avalia e envia ao roadmap; o patrocinador da área seleciona com janelas; sem ponto de partida até registrar o valor "antes"', async () => {
  let { page, errors, context } = await openAs(u.key);
  await page.getByRole('button', { name: 'Quick wins' }).first().click();
  await page.getByRole('button', { name: 'Portfólio de oportunidades' }).waitFor();
  const register = async (titulo: string) => {
    await page.getByLabel('Área da oportunidade').selectOption('fiscal');
    await page.getByLabel('Título da oportunidade').fill(titulo);
    await page.getByLabel('Processo').fill('Entrada de notas de compra');
    await page.getByLabel('Problema observado').fill('Conferência manual, item a item, com retrabalho.');
    await page.getByLabel('Quem executa hoje').fill('Duas pessoas do fiscal');
    await page.getByLabel('Volume', { exact: true }).fill('400 notas por mês');
    await page.getByLabel('Evidência', { exact: true }).selectOption('comprovado');
    await page.getByRole('button', { name: 'Registrar oportunidade' }).click();
    await page.getByText('Oportunidade registrada.').waitFor();
  };
  await register('Conferência de notas contra pedidos');
  await register('Integração fiscal com o ERP');
  await page.getByRole('button', { name: 'Integração fiscal com o ERP' }).click();
  await page.getByLabel('Motivo', { exact: true }).fill('Integração com o ERP é projeto de meses, não quick win.');
  await page.getByRole('button', { name: 'Enviar ao roadmap' }).click();
  await page.getByText('Oportunidade enviada ao roadmap.').waitFor();
  await page.getByText(/Motivo \(enviado ao roadmap\): Integração com o ERP é projeto de meses/).waitFor();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Conferência de notas contra pedidos' }).click();
  for (const [c, n] of [['Valor', '5'], ['Complexidade', '2'], ['Risco', '2'], ['Dependências', '1']]) await page.getByLabel(new RegExp('^' + c + ' \\(peso')).selectOption(n);
  await page.getByLabel('Por que essa avaliação').fill('Volume alto e conferência repetitiva.');
  await page.getByRole('button', { name: 'Avaliar', exact: true }).click();
  await page.getByText(/Oportunidade avaliada\. Nota/).waitFor();
  await page.getByText(/A seleção como quick win é do patrocinador da área ou do admin do cliente/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar quick win' }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();

  // Patrocinador da área: seleciona e decide.
  ({ page, errors, context } = await openAs(u.sponsor));
  await firstAccess(page);
  await page.getByRole('button', { name: 'Quick wins' }).first().click();
  await page.getByRole('button', { name: 'Conferência de notas contra pedidos' }).click();
  await page.getByLabel('Objetivo', { exact: true }).fill('Conferir as notas sem retrabalho');
  await page.getByLabel('Responsável (email)').fill('key.fiscal@demonstracao.com.br');
  await page.getByLabel('Início do ponto de partida').fill('2026-06-01');
  await page.getByLabel('Fim do ponto de partida').fill('2026-06-30');
  await page.getByLabel('Volume no ponto de partida').fill('400');
  await page.getByLabel('Início da medição').fill('2026-09-01');
  await page.getByLabel('Fim da medição').fill('2026-09-30');
  await page.getByLabel('O que é um item', { exact: true }).fill('notas');
  await page.getByRole('button', { name: 'Conferência de NF-e de entrada × pedido' }).click();
  await page.getByRole('button', { name: 'Acrescentar indicador' }).click();
  await page.getByLabel('Nome do indicador 1').fill('Tempo por nota');
  await page.getByLabel('Unidade do indicador 1').fill('min');
  await page.getByLabel('Medição do indicador 1').selectOption('tempo_processamento');
  await page.getByLabel('Por que selecionar').fill('Maior nota do portfólio do fiscal.');
  await page.getByRole('button', { name: 'Criar quick win' }).click();
  await page.getByText(/Quick win criado\./).waitFor();
  await page.getByText(/Sem ponto de partida/).waitFor();
  await page.getByText(/Janela do ponto de partida: 2026-06-01 a 2026-06-30 \(30 dias, 400 notas\)/).waitFor();
  await page.getByLabel('Indicador', { exact: true }).selectOption('tempo_por_nota');
  await page.getByLabel('Valor', { exact: true }).fill('12');
  await page.getByLabel('Quem informou').fill('Coordenação fiscal (Discovery)');
  await page.getByRole('button', { name: 'Registrar valor' }).click();
  await page.getByText('Valor registrado.').waitFor();
  await page.getByText(/informado: informado por Coordenação fiscal/).waitFor();
  // Execuções anteriores ao quick win não contam: ainda não há "depois".
  await page.getByText('sem medição depois').first().waitFor();
  assert.equal(await page.getByText(/h no período/).count(), 0);
  // Na implantação, a volta ao roadmap está disponível; a etapa muda com motivo e aparece no histórico.
  await page.getByRole('button', { name: 'Voltar ao roadmap' }).waitFor();
  await page.getByLabel('Motivo da mudança de etapa').fill('Assistente publicado e equipe treinada.');
  await page.getByRole('button', { name: 'Passar para em medição' }).click();
  await page.getByText('Etapa registrada.').waitFor();
  await page.getByText('Assistente publicado e equipe treinada.').waitFor();
  await page.getByRole('button', { name: 'Registrar decisão' }).waitFor();                 // o patrocinador decide
  assert.ok(await page.getByRole('link', { name: 'Resultados em PDF' }).getAttribute('href'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('administração: editor da definição do assistente e incidente reportado', async () => {
  const { page, errors, context } = await openAs(u.admin);
  await firstAccess(page);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('button', { name: /Conferência de NF-e de entrada/ }).click();
  await page.getByText(/Versão atual: 1\./).waitFor();
  const json = await page.getByLabel(/Definição \(JSON/).inputValue();
  assert.match(json, /"bloco": "conferir"/);
  assert.ok(await page.getByRole('link', { name: 'Pacote portátil (ZIP)' }).isVisible());
  await page.getByRole('button', { name: 'Incidentes' }).click();
  await page.getByRole('cell', { name: 'resposta errada' }).click();
  // O admin vê o incidente, mas a descrição fica com o key user da área.
  await page.getByText('A descrição fica só com o key user da área.').waitFor();
  assert.equal(await page.getByText('A nota apontou palete sem pedido, mas é retornável.').count(), 0);
  // Auditoria: verificação da cadeia e estado das âncoras (desligadas neste ambiente de teste).
  await page.getByRole('button', { name: 'Auditoria' }).click();
  await page.getByText(/Cadeia íntegra: [\d.]+ registros\. A publicação de âncoras não está ligada neste ambiente\./).waitFor();
  assert.ok(await page.getByRole('link', { name: 'Exportar âncoras (CSV)' }).isVisible());
  assert.deepEqual(errors, []);
  await context.close();
});

test('incidente: o key user lê a descrição e escala para a TheNeil', async () => {
  const { page, errors, context } = await openAs(u.key);                // ciência e roteiro já feitos no teste da revisão
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Incidentes' }).click();
  await page.getByRole('cell', { name: 'resposta errada' }).click();
  await page.getByText('A nota apontou palete sem pedido, mas é retornável.').waitFor();
  await page.getByLabel('Motivo para escalar').fill('Pode ser erro no leitor da NF-e.');
  await page.getByRole('button', { name: 'Escalar para a TheNeil' }).click();
  await page.getByText('Incidente escalado. A TheNeil passa a ver a descrição.').waitFor();
  await page.getByText(/Escalado para a TheNeil por key\.fiscal@demonstracao\.com\.br/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Escalar para a TheNeil' }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('áreas: o admin cria área e subárea, renomeia e desativa pelo painel', async () => {
  const { page, errors, context } = await openAs(u.admin);            // ciência e roteiro já feitos
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Áreas', exact: true }).click();
  await page.getByLabel('Nome da nova área').fill('Atendimento ao cliente');
  await page.getByRole('button', { name: 'Criar área' }).click();
  await page.getByText('Área criada.').waitFor();
  await page.getByLabel('Nome da nova área').fill('Ouvidoria');
  await page.getByLabel('Área mãe da nova área').selectOption({ label: 'Atendimento ao cliente' });
  await page.getByRole('button', { name: 'Criar área' }).click();
  await page.getByRole('cell', { name: 'Ouvidoria' }).waitFor();
  await page.getByRole('cell', { name: 'Ouvidoria' }).click();
  await page.getByRole('heading', { name: 'Área Ouvidoria' }).waitFor();
  await page.getByLabel('Nome da área').fill('Ouvidoria e reclamações');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByText('Área salva.').waitFor();
  await page.getByRole('button', { name: 'Desativar' }).click();
  await page.getByText(/Área desativada/).waitFor();
  const row = page.getByRole('row', { name: /Ouvidoria e reclamações/ });
  await row.getByRole('cell', { name: 'desativada' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('tipos de dado e leitores: o admin cadastra um tipo próprio, testa um texto e liga e desliga um leitor', async () => {
  const { page, errors, context } = await openAs(u.admin);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Tipos de dado e leitores' }).click();
  await page.getByLabel('Nome do tipo').fill('placa de veículo');
  await page.getByLabel('Padrão', { exact: true }).fill('\\b[A-Z]{3}-?\\d[A-Z0-9]\\d{2}\\b');
  await page.getByLabel('Ação padrão').selectOption('mascarar');
  await page.getByRole('button', { name: 'Adicionar tipo' }).click();
  await page.getByText('Tipo adicionado.').waitFor();
  await page.getByRole('cell', { name: 'placa de veículo' }).waitFor();
  await page.getByLabel('Testar um texto').fill('Caminhão ABC1D23 na doca 2');
  await page.getByRole('button', { name: 'Testar' }).click();
  await page.getByText(/Como ficaria mascarado: Caminhão \[PLACA DE VEÍCULO\] na doca 2/).waitFor();
  const nfe = page.getByRole('button', { name: 'Ligado' }).first();
  await nfe.click();
  await page.getByText('Leitores atualizados.').waitFor();
  await page.getByRole('button', { name: 'Desligado' }).first().click();
  await page.getByRole('button', { name: 'Desligado' }).waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('catálogo: o admin cria um assistente a partir de um modelo e depois o duplica', async () => {
  const { page, errors, context } = await openAs(u.admin);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Assistentes', exact: true }).last().click();   // aba da Administração
  await page.getByText('Criar a partir de um modelo').click();
  await page.getByRole('button', { name: /Dúvidas sobre procedimentos internos/ }).click();
  await page.getByText(/Modelo do catálogo: Dúvidas sobre procedimentos internos \(versão 1\)/).waitFor();
  await page.getByLabel('Área', { exact: true }).fill('lgpd');
  await page.getByRole('button', { name: 'Criar assistente' }).click();
  await page.getByText('Gravado como versão 1.').waitFor();
  await page.getByText(/Criado do modelo atendimento-procedimentos \(versão 1\)\./).waitFor();
  await page.getByRole('button', { name: 'Duplicar' }).click();
  await page.getByLabel('Identificador').fill('duvidas-conformidade');
  await page.getByRole('button', { name: 'Criar assistente' }).click();
  await page.getByText(/Duplicado de atendimento-procedimentos\./).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('critérios de avaliação: o admin muda peso e acrescenta um critério pelo painel', async () => {
  const { page, errors, context } = await openAs(u.admin);
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Critérios de avaliação' }).click();
  await page.getByLabel('Peso do critério 1').fill('50');
  await page.getByRole('button', { name: 'Acrescentar critério' }).click();
  await page.getByLabel('Nome do critério 5').fill('Alinhamento com a estratégia');
  await page.getByRole('button', { name: 'Salvar critérios' }).click();
  await page.getByText('Critérios salvos.').waitFor();
  const saved = (await db.owner.query(`select config->'qwCriteria' as c from tenants where id = $1`, [tenantId])).rows[0].c;
  assert.deepEqual(saved.criterios.map((c: { key: string; peso: number }) => `${c.key}:${c.peso}`), ['valor:50', 'complexidade:20', 'risco:20', 'dependencias:20', 'alinhamento_com_a_estrategia:10']);
  assert.deepEqual(errors, []);
  await context.close();
});
