// Área de mensagens no padrão assistente (Claude + ChatGPT): resposta em texto corrido sem ícone nem moldura, ações
// da resposta numa linha de ícones com nome (copiar, gerar de novo, 👍, 👎, detalhes), 👎 num diálogo próprio,
// detalhes num painel, downloads como cartões de anexo, bloco de código com "Copiar código", celular e tema escuro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { exec } from '../src/db.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, pessoa, db, livre, duas, codigo;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1366, height = 860, tema = 'light', toque = false } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height }, colorScheme: tema, isMobile: toque, hasTouch: toque, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: S.base });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const conversa = async id => (await pessoa.get(`/api/conversas/${id}`)).dados;
const ultima = p => p.locator('.resposta').last();

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Assistente', slug: 'empresa-assistente', status: 'ativa', admin_email: 'admin@assistente.test' })).dados;
  db = S.P.tenant(emp.id).db;
  const admin = S.navegador(); await admin.get('/empresa-assistente'); await admin.entrarEmpresa('admin@assistente.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@assistente.test', name: 'Pessoa Assistente', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  await admin.put(`/api/admin/pessoas/${(lista.pessoas || lista).find(x => x.email === 'pessoa@assistente.test').id}`, { areas: [{ id: area }] });
  pessoa = S.navegador(); await pessoa.get('/empresa-assistente'); await pessoa.entrarEmpresa('pessoa@assistente.test');
  livre = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${livre.id}/mensagens`, { texto: 'Escreva um email para a equipe com uma lista dos próximos passos e uma tabela de prazos' });
  duas = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${duas.id}/mensagens`, { texto: 'Liste os itens principais do processo de compras' });
  await pessoa.req('POST', `/api/conversas/${duas.id}/mensagens`, { texto: 'Resuma em 3 linhas' });
  // Resposta com bloco de código (o simulador não gera código): gravada direto no banco da empresa.
  codigo = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${codigo.id}/mensagens`, { texto: 'Liste os itens principais' });
  exec(db, "insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant',?,?)", codigo.id, 'Use a fórmula:\n\n```excel\n=SE(A2>B2;"Revisar";"OK")\n```\n\nDepois copie para as outras linhas.', new Date().toISOString());
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('resposta em texto corrido, sem ícone nem moldura; pedido num balão à direita com quebras de linha', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  assert.equal(await p.locator('.resposta .sim, .resposta img').count(), 0, 'sem ícone ao lado da resposta');
  const estilo = await p.locator('.resposta .bolha-ia').first().evaluate(e => { const c = getComputedStyle(e); return { borda: c.borderTopWidth, fundo: c.backgroundColor, largura: e.getBoundingClientRect().width }; });
  assert.equal(estilo.borda, '0px'); assert.equal(estilo.fundo, 'rgba(0, 0, 0, 0)');
  assert.ok(estilo.largura <= 760 && estilo.largura >= 680, `largura de leitura: ${estilo.largura}`);
  const eu = await p.locator('.msg-eu').first().evaluate(e => { const r = e.getBoundingClientRect(), c = e.parentElement.getBoundingClientRect(); return { direita: Math.round(c.right - r.right), proporcao: r.width / c.width, quebra: getComputedStyle(e.querySelector('.bolha-eu')).whiteSpace }; });
  assert.ok(eu.direita <= 1, 'balão encostado à direita'); assert.ok(eu.proporcao <= 0.81); assert.equal(eu.quebra, 'pre-wrap');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('linha de ações: ícones com nome e dica; selo de simulação na mesma linha; nenhum botão de texto', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const linha = ultima(p).getByRole('group', { name: 'Ações da resposta' });
  const nomes = await linha.getByRole('button').evaluateAll(bs => bs.map(b => [b.getAttribute('aria-label'), b.title, b.innerText.trim(), b.querySelector('svg') ? 1 : 0]));
  assert.deepEqual(nomes.map(n => n[0]), ['Copiar resposta', 'Gerar de novo', 'Serviu', 'Não serviu', 'Detalhes da resposta']);
  for (const [nome, dica, texto, icone] of nomes) { assert.ok(dica, `${nome} tem dica`); assert.equal(texto, '', `${nome} só ícone`); assert.equal(icone, 1); }
  assert.equal(await linha.locator('.selo-simulada').innerText(), 'Resposta simulada');
  assert.equal(await ultima(p).locator('.btn').count(), 0, 'nenhum botão de texto na resposta');
  assert.equal(await linha.isVisible(), true);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('na última resposta as ações ficam à vista; nas anteriores aparecem ao passar o mouse ou com o foco', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${duas.id}`); await p.waitForSelector('.rodape-resposta');
  await p.mouse.move(5, 5);
  const opacidade = l => l.evaluate(e => Number(getComputedStyle(e).opacity));
  const anterior = p.locator('.resposta').first().locator('.acoes-resposta');
  assert.equal(await p.locator('.resposta').count(), 2);
  assert.equal(await opacidade(ultima(p).locator('.acoes-resposta')), 1);
  assert.equal(await opacidade(anterior), 0);
  assert.equal(await anterior.locator('[data-fb], [data-regerar]').count(), 0, 'avaliar e gerar de novo só na última');
  await p.locator('.resposta').first().locator('.bolha-ia').hover();
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.resposta .acoes-resposta')).opacity === '1');
  await p.mouse.move(5, 5);
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.resposta .acoes-resposta')).opacity === '0');
  await anterior.getByRole('button', { name: 'Copiar resposta' }).focus();
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.resposta .acoes-resposta')).opacity === '1');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('copiar: copia o texto da resposta, mostra o "ok" no botão e anuncia', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const texto = (await conversa(livre.id)).mensagens.filter(m => m.papel === 'assistant').at(-1).texto;
  await ultima(p).getByRole('button', { name: 'Copiar resposta' }).click();
  await p.waitForSelector('.resposta-ultima [data-copiar][aria-label="Copiado"]');
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), texto);
  await p.waitForFunction(() => document.querySelector('#ao-vivo').textContent === 'Resposta copiada.');
  await p.waitForSelector('.resposta-ultima [data-copiar][aria-label="Copiar resposta"]', { timeout: 4000 });
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('👍 registra "serviu" e fica marcado; 👎 abre um diálogo com "Serviu com ajustes" e "Não serviu"', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  await ultima(p).getByRole('button', { name: 'Serviu', exact: true }).click();
  await p.waitForSelector('[data-fb="serviu"][aria-pressed="true"]');
  assert.equal((await conversa(livre.id)).conversa.feedback, 'serviu');
  await p.waitForFunction(() => /Avaliação registrada: Serviu\./.test(document.querySelector('#ao-vivo').textContent));
  // 👎: Esc fecha e devolve o foco ao botão, sem mudar nada.
  const negativo = ultima(p).locator('[data-fb-negativo]');
  await negativo.click();
  const d = p.getByRole('dialog', { name: 'Como foi esta resposta?' });
  await d.waitFor();
  assert.equal(await d.getByRole('button', { name: 'Enviar avaliação' }).isDisabled(), true, 'escolha antes de enviar');
  await p.keyboard.press('Escape');
  await d.waitFor({ state: 'detached' });
  assert.equal(await negativo.evaluate(e => e === document.activeElement), true, 'o foco volta ao 👎');
  assert.equal((await conversa(livre.id)).conversa.feedback, 'serviu');
  // "Serviu com ajustes": o campo de observação não aparece (o servidor guarda observação só em "Não serviu").
  await negativo.click(); await d.waitFor();
  await d.getByLabel('Serviu com ajustes').check();
  assert.equal(await d.getByLabel('O que faltou ou veio errado? (opcional)').isVisible(), false);
  await d.getByRole('button', { name: 'Enviar avaliação' }).click();
  await p.waitForSelector('[data-fb-negativo][aria-pressed="true"][aria-label="Serviu com ajustes"]');
  assert.equal(await p.getAttribute('[data-fb="serviu"]', 'aria-pressed'), 'false');
  assert.equal((await conversa(livre.id)).conversa.feedback, 'ajustes');
  // Mudar para "Não serviu", com observação.
  await negativo.click(); await d.waitFor();
  assert.equal(await d.getByLabel('Serviu com ajustes').isChecked(), true, 'a avaliação atual vem marcada');
  await d.getByLabel('Não serviu').check();
  await d.getByLabel('O que faltou ou veio errado? (opcional)').fill('Faltou o prazo de entrega');
  await d.getByRole('button', { name: 'Enviar avaliação' }).click();
  await p.waitForSelector('[data-fb-negativo][aria-pressed="true"][aria-label="Não serviu"]');
  const c = (await conversa(livre.id)).conversa;
  assert.equal(c.feedback, 'nao_serviu'); assert.equal(c.feedback_motivo, 'Faltou o prazo de entrega');
  // Recarregada, a conversa mostra a avaliação escolhida.
  await p.reload(); await p.waitForSelector('.rodape-resposta');
  assert.equal(await p.getAttribute('[data-fb-negativo]', 'aria-pressed'), 'true');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('Detalhes: painel com o nível e a simulação; Esc fecha e devolve o foco', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const botao = ultima(p).getByRole('button', { name: 'Detalhes da resposta' });
  assert.equal(await botao.getAttribute('aria-expanded'), 'false');
  await botao.click();
  const painel = ultima(p).getByRole('region', { name: 'Detalhes da resposta' });
  assert.equal(await painel.isVisible(), true);
  assert.equal(await botao.getAttribute('aria-expanded'), 'true');
  assert.match(await painel.innerText(), /Nível (Rápido|Equilibrado|Avançado)|escolha automática do nível/);
  assert.match(await painel.innerText(), /simulada/);
  const caixa = await painel.boundingBox();
  assert.ok(caixa.y >= 0 && caixa.y + caixa.height <= 860, 'o painel fica à vista');
  await p.keyboard.press('Escape');
  assert.equal(await painel.isVisible(), false);
  assert.equal(await botao.evaluate(e => e === document.activeElement), true);
  // Clique fora também fecha.
  await botao.click(); await p.mouse.click(700, 120);
  assert.equal(await painel.isVisible(), false);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('gerar de novo troca a última resposta pelo servidor (sem duplicar o pedido)', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('[data-regerar]');
  const antes = (await conversa(livre.id)).mensagens.filter(m => m.papel === 'assistant').at(-1).id;
  await ultima(p).getByRole('button', { name: 'Gerar de novo' }).click();
  await p.waitForFunction(id => { const b = document.querySelector('[data-regerar]'); return b && b.dataset.regerar !== String(id) && !b.disabled; }, antes);
  const depois = (await conversa(livre.id)).mensagens.filter(m => m.papel === 'assistant');
  assert.equal(depois.length, 1); assert.ok(depois[0].id > antes);
  assert.equal(await p.locator('.bolha-eu').count(), 1);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('download da tabela como cartão de anexo (ícone, nome e tipo) e bloco de código com "Copiar código"', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const cartao = ultima(p).getByRole('link', { name: /Baixar planilha/ });
  assert.equal(await cartao.count(), 1);
  assert.match(await cartao.innerText(), /Baixar planilha\s+Tabela 1 · \d+ linhas?/);
  assert.equal(await cartao.locator('.anexo-resposta-icone svg').count(), 1);
  const [download] = await Promise.all([p.waitForEvent('download'), cartao.click()]);
  assert.match(readFileSync(await download.path(), 'utf8'), /Item;Valor;Situação|Item,Valor,Situação/);
  await p.goto(`${S.base}/app#/c/${codigo.id}`); await p.waitForSelector('.bloco-codigo');
  assert.equal(await p.locator('.bloco-codigo code').innerText(), '=SE(A2>B2;"Revisar";"OK")');
  assert.match(await p.locator('.bloco-codigo pre').evaluate(e => getComputedStyle(e).fontFamily), /mono|Menlo|Consolas/i);
  await p.getByRole('button', { name: 'Copiar código' }).click();
  await p.waitForSelector('.bloco-codigo [data-copiar-codigo][aria-label="Copiado"]');
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), '=SE(A2>B2;"Revisar";"OK")');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('enquanto a resposta não chega: três pontos discretos, sem ícone', async () => {
  const p = await pagina(pessoa);
  const c = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await p.goto(`${S.base}/app#/c/${c.id}`); await p.waitForSelector('#entrada');
  await p.route('**/mensagens', async r => { await new Promise(ok => setTimeout(ok, 700)); await r.continue(); });
  await p.fill('#entrada', 'Liste os itens principais'); await p.press('#entrada', 'Enter');
  await p.waitForSelector('.resposta-pensando .pensando');
  assert.equal(await p.locator('.resposta-pensando img, .resposta-pensando .sim').count(), 0);
  await p.waitForSelector('.resposta-ultima .rodape-resposta');
  assert.equal(await p.locator('.resposta-pensando').count(), 0);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('celular (390 px): ações da última resposta à vista, alvos de 44 px e sem rolagem horizontal', async () => {
  const p = await pagina(pessoa, { width: 390, height: 844, toque: true });
  await p.goto(`${S.base}/app#/c/${duas.id}`); await p.waitForSelector('.rodape-resposta');
  const linha = ultima(p).locator('.acoes-resposta');
  assert.equal(await linha.isVisible(), true);
  for (const b of await linha.getByRole('button').all()) {
    const caixa = await b.boundingBox();
    assert.ok(caixa.width >= 43.5 && caixa.height >= 43.5, `${await b.getAttribute('aria-label')}: ${JSON.stringify(caixa)}`);
  }
  assert.equal(await p.locator('.resposta').first().locator('.acoes-resposta').evaluate(e => getComputedStyle(e).opacity), '1', 'no toque, sempre à vista');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem horizontal');
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'tabela rola dentro do bloco');
  await ultima(p).getByRole('button', { name: 'Detalhes da resposta' }).click();
  const painel = await ultima(p).locator('.detalhes-resposta-painel').boundingBox();
  assert.ok(painel.x >= 0 && painel.x + painel.width <= 390, JSON.stringify(painel));
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('tema escuro: ícones, selo de simulação, cartão de download e texto com contraste suficiente', async () => {
  const p = await pagina(pessoa, { tema: 'dark' });
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const contrastes = await p.evaluate(() => {
    const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const fundo = e => { for (let x = e; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c); } return [255, 255, 255]; };
    const razao = e => { const a = lum(rgb(getComputedStyle(e).color)), b = lum(fundo(e)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    const sel = s => document.querySelector(s);
    return { icone: razao(sel('.resposta-ultima [data-copiar]')), selo: razao(sel('.resposta-ultima .selo-simulada')), texto: razao(sel('.resposta-ultima .bolha-ia p')), cartao: razao(sel('.resposta-ultima .anexo-resposta-texto small')), fundo: getComputedStyle(document.body).backgroundColor };
  });
  assert.ok(contrastes.icone >= 3, `ícone ${contrastes.icone}`);
  assert.ok(contrastes.selo >= 4.5, `selo ${contrastes.selo}`);
  assert.ok(contrastes.texto >= 7, `texto ${contrastes.texto}`);
  assert.ok(contrastes.cartao >= 4.5, `cartão ${contrastes.cartao}`);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});
