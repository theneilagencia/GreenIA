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

test('resultados: sem ponto de partida até registrar o valor "antes", com a origem visível', async () => {
  const { page, errors, context } = await openAs(u.key);
  await page.getByRole('button', { name: 'Resultados' }).click();
  await page.getByLabel('Assistente').selectOption('conferencia-nfe');
  await page.getByText(/Sem ponto de partida/).waitFor();
  await page.getByLabel('Indicador').selectOption('tempo_por_nota');
  await page.getByLabel('Valor', { exact: true }).fill('12');
  await page.getByLabel('Quem informou').fill('Coordenação fiscal (Discovery)');
  await page.getByRole('button', { name: 'Registrar valor' }).click();
  await page.getByText('Valor registrado.').waitFor();
  await page.getByText(/informado: informado por Coordenação fiscal/).waitFor();
  // O automático mede só o processamento: a comparação de tempo aparece como parcial, sem ganho acumulado.
  await page.getByText(/comparação parcial/).first().waitFor();
  assert.equal(await page.getByText(/h no período/).count(), 0);
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
