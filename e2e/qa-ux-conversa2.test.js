// QA de UX, rodada 2, frente "Conversa e conhecimento".
// M13: "Gerar de novo" na última resposta (conversa livre), com carregamento, erro explicado e alvo de 44 px no celular.
// M17: "Abrir" no cartão do documento para quem só consulta, num painel acessível com o texto extraído.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, admin, pessoa, livre, docFora;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const respostas = async id => (await pessoa.get(`/api/conversas/${id}`)).dados.mensagens.filter(m => m.papel === 'assistant');

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Conversa', slug: 'empresa-conversa', status: 'ativa', admin_email: 'admin@conversa.test' });
  admin = S.navegador(); await admin.get('/empresa-conversa'); await admin.entrarEmpresa('admin@conversa.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  const outra = (await admin.post('/api/admin/areas', { nome: 'Diretoria', sigilosa: true })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@conversa.test', name: 'Pessoa Conversa', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  await admin.put(`/api/admin/pessoas/${(lista.pessoas || lista).find(x => x.email === 'pessoa@conversa.test').id}`, { areas: [{ id: area }] });
  await admin.post('/api/bases/documentos', { area_id: area, titulo: 'Manual de compras', pasta: 'Manuais', arquivo: { nome: 'compras.txt', base64: Buffer.from('Manual fictício de compras.\n\nPedidos acima de 5 mil reais pedem três orçamentos.').toString('base64') } });
  docFora = (await admin.post('/api/bases/documentos', { area_id: outra, titulo: 'Plano da diretoria', arquivo: { nome: 'plano.txt', base64: Buffer.from('Conteúdo restrito da diretoria.').toString('base64') } })).dados.id;
  pessoa = S.navegador(); await pessoa.get('/empresa-conversa'); await pessoa.entrarEmpresa('pessoa@conversa.test');
  livre = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${livre.id}/mensagens`, { texto: 'Liste os itens principais do processo de compras' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('M13: "Gerar de novo" na última resposta troca a resposta, sem duplicar o pedido', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const [antes] = await respostas(livre.id);
  const botao = p.locator('.resposta').last().getByRole('button', { name: 'Gerar de novo' });
  assert.equal(await botao.count(), 1);
  assert.equal(await p.locator('[data-regerar]').count(), 1, 'só na última resposta');
  await botao.click();
  await p.waitForFunction(id => { const b = document.querySelector('[data-regerar]'); return b && b.dataset.regerar !== String(id); }, antes.id);
  const depois = await respostas(livre.id);
  assert.equal(depois.length, 1);
  assert.ok(depois[0].id > antes.id);
  assert.equal(await p.locator('.bolha-eu').count(), 1, 'o pedido não é duplicado');
  assert.equal(await p.locator('.resposta .bolha-ia').count(), 1);
  assert.equal(await p.locator('[data-regerar]:not([disabled])').count(), 1, 'pronto para outra tentativa');
  assert.deepEqual(p.erros, []);
});

test('M13: erro ao gerar de novo é explicado e a resposta anterior volta', async () => {
  const p = await pagina(pessoa);
  await p.route('**/regenerar', r => r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ erro: 'plano_esgotado', mensagem: 'Os créditos deste mês acabaram. Fale com o administrador da empresa.' }) }));
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('[data-regerar]');
  const texto = await p.locator('.resposta .bolha-ia').first().innerText();
  await p.click('[data-regerar]');
  await p.waitForSelector('.aviso-bolha');
  assert.match(await p.locator('.aviso-bolha').innerText(), /créditos deste mês acabaram/);
  assert.equal(await p.locator('.resposta .bolha-ia:not(.aviso-bolha)').first().innerText(), texto, 'a resposta anterior continua');
  assert.equal(await p.locator('[data-regerar]:not([disabled])').count(), 1, 'dá para tentar de novo');
  assert.deepEqual(p.erros, []);
});

test('M13: no celular, "Gerar de novo" tem 44 px de altura', async () => {
  const p = await pagina(pessoa, { width: 390, height: 844 });
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('[data-regerar]');
  const caixa = await p.locator('[data-regerar]').boundingBox();
  assert.ok(caixa.height >= 43.5, JSON.stringify(caixa));
  assert.deepEqual(p.erros, []);
});

test('M17: quem só consulta abre o documento num painel acessível; Esc fecha e devolve o foco', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/conhecimento`); await p.waitForSelector('[data-documento]');
  assert.equal(await p.locator('[data-documento]').count(), 1, 'documento de área sigilosa sem participação não aparece');
  const abrir = p.locator('[data-abrir-conhecimento]');
  assert.equal(await p.getByRole('button', { name: 'Abrir Manual de compras' }).count(), 1, 'nome acessível com o título');
  await abrir.click();
  const d = p.getByRole('dialog', { name: 'Manual de compras' });
  await d.waitFor();
  await p.waitForSelector('#conhecimento-ler-texto[aria-busy="false"]');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'conhecimento-ler-titulo');
  assert.match(await d.innerText(), /Operações · Atualizado em \d{2}\/\d{2}\/\d{4}/);
  assert.match(await p.locator('#conhecimento-ler-texto').innerText(), /Manual fictício de compras\.\s+Pedidos acima de 5 mil reais/);
  assert.equal(await p.locator('#conhecimento-ler-mais').isVisible(), false);
  await p.keyboard.press('Escape');
  assert.equal(await p.getByRole('dialog').count(), 0);
  assert.equal(await p.evaluate(() => document.activeElement?.dataset.abrirConhecimento != null), true);
  // Fora do alcance: o servidor responde 404, igual a um documento que não existe.
  assert.equal((await pessoa.get(`/api/bases/documentos/${docFora}/conteudo`)).status, 404);
  assert.deepEqual(p.erros, []);
});

test('M17: no celular, "Abrir" tem 44 px e o painel cabe na tela', async () => {
  const p = await pagina(pessoa, { width: 390, height: 844 });
  await p.goto(`${S.base}/app#/conhecimento`); await p.waitForSelector('[data-abrir-conhecimento]');
  assert.ok((await p.locator('[data-abrir-conhecimento]').boundingBox()).height >= 43.5);
  await p.click('[data-abrir-conhecimento]');
  await p.waitForSelector('#conhecimento-ler-texto[aria-busy="false"]');
  const largura = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 390, `rolagem horizontal: ${largura}`);
  await p.getByRole('button', { name: 'Fechar' }).last().click();
  assert.equal(await p.getByRole('dialog').count(), 0);
  assert.deepEqual(p.erros, []);
});
