// Regressão do QA de UX de out/2026, páginas públicas: A7 404 em HTML com marca e saídas; A8 "Entrar" e menu compacto
// no topo da página de vendas no celular; M47 política com a marca da empresa; M48 Termos e Privacidade com índice,
// contatos clicáveis e rodapé; M49 contraste de 4,5:1 e texto de 12 px ou mais; B2 títulos sem pular nível;
// B16 "a GreenIA"; B17 nada escondido na impressão; B18 exemplo de endereço no formato real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { medirTextos } from './ajuda-contraste.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const CELULAR = { width: 390, height: 844 }, LARGO = { width: 1280, height: 900 };
let S, nav, ops, admin;

async function pagina(viewport = LARGO, sessao = null) {
  const ctx = await nav.newContext({ viewport, reducedMotion: 'reduce' });
  if (sessao) await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: new URL(S.base).hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  return p;
}
// Títulos em ordem: nunca pula nível (h1 → h3).
const niveisPulados = p => p.evaluate(() => {
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.getClientRects().length).map(h => Number(h.tagName[1]));
  return hs.flatMap((n, i) => (i && n > hs[i - 1] + 1 ? [`h${hs[i - 1]}→h${n}`] : []));
});
const problemasDeTexto = async p => (await p.evaluate(medirTextos)).filter(x => (x.razao !== null && x.razao < x.minimo) || x.tam < 12);

before(async () => {
  S = await subirPlataforma({ paginaInicial: 'vendas' });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Pública', slug: 'empresa-publica', status: 'ativa', admin_email: 'admin@publica.test' });
  admin = S.navegador(); await admin.get('/empresa-publica'); await admin.entrarEmpresa('admin@publica.test');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('A7: endereço inexistente mostra página em pt-BR, legível no celular, com marca e caminhos de saída', async () => {
  const p = await pagina(CELULAR);
  const r = await p.goto(`${S.base}/isto/nao/existe`);
  assert.equal(r.status(), 404);
  assert.equal(await p.getAttribute('html', 'lang'), 'pt-BR');
  assert.equal(await p.title(), 'Página não encontrada · GreenIA');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem layout de 980 px');
  await p.getByRole('heading', { level: 1, name: 'Página não encontrada' }).waitFor();
  assert.equal(await p.getByRole('link', { name: 'Ir para o início' }).getAttribute('href'), '/');
  await p.getByRole('link', { name: 'Encontrar meu ambiente' }).click();
  await p.waitForURL(/\/encontrar$/);
  // Dentro de uma empresa: marca dela, sem GreenIA.
  const e = await pagina(CELULAR, admin);
  assert.equal((await e.goto(`${S.base}/pagina/que/nao/existe`)).status(), 404);
  assert.doesNotMatch(await e.content(), /GreenIA/);
  assert.equal(await e.getByRole('link', { name: 'Ir para o início' }).getAttribute('href'), '/empresa-publica');
  assert.equal(await e.getByRole('link', { name: 'Entrar' }).getAttribute('href'), '/empresa-publica/entrar');
});

test('A8: no celular, "Entrar" fica no topo e o menu compacto leva às seções (fecha ao escolher e com Esc)', async () => {
  const p = await pagina(CELULAR);
  await p.goto(`${S.base}/`);
  const topo = p.locator('#topo');
  const entrar = topo.getByRole('link', { name: 'Entrar' });
  assert.ok(await entrar.isVisible(), '"Entrar" visível no topo');
  assert.equal(await entrar.getAttribute('href'), '/encontrar');
  assert.ok((await entrar.boundingBox()).height >= 44, 'alvo de toque de 44 px');
  const menu = topo.locator('.l-menu summary');
  assert.ok((await menu.boundingBox()).height >= 44);
  await menu.click();
  const painel = topo.getByRole('navigation', { name: 'Menu' });
  for (const n of ['Como funciona', 'Quick Wins', 'Controle', 'Planos', 'Perguntas', 'Solicitar demonstração']) assert.ok(await painel.getByRole('link', { name: n }).isVisible(), n);
  await p.keyboard.press('Escape');
  assert.equal(await painel.isVisible(), false);
  await menu.click();
  await painel.getByRole('link', { name: 'Perguntas' }).click();
  await p.waitForURL(/#perguntas$/);
  assert.equal(await painel.isVisible(), false, 'fecha ao escolher a seção');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Na tela larga, a navegação completa no lugar do menu.
  const l = await pagina(LARGO);
  await l.goto(`${S.base}/`);
  assert.equal(await l.locator('#topo .l-menu').isVisible(), false);
  assert.ok(await l.locator('#topo .l-nav').isVisible());
  assert.ok(await l.locator('#topo').getByRole('link', { name: 'Entrar' }).isVisible());
  assert.deepEqual([...p.erros, ...l.erros], []);
});

test('B16/B17: "a GreenIA" na página de vendas; na impressão nenhum bloco fica esperando a rolagem', async () => {
  const ctx = await nav.newContext({ viewport: CELULAR });   // com movimento: os blocos abaixo da dobra esperam a rolagem
  const q = await ctx.newPage();
  await q.goto(`${S.base}/`);
  assert.doesNotMatch(await q.locator('body').innerText(), /\b(?:O|o|no|ao|do|pelo) GreenIA\b|cartões ao lado/);
  assert.ok(await q.locator('.espera').count() > 0, 'há blocos esperando a rolagem na tela');
  await q.emulateMedia({ media: 'print' });
  const escondidos = await q.evaluate(() => [...document.querySelectorAll('.espera, .espera *')].filter(e => getComputedStyle(e).opacity === '0').length);
  assert.equal(escondidos, 0);
  await ctx.close();
});

test('B18: "Encontrar ambiente" mostra o exemplo de endereço no formato real da plataforma', async () => {
  const p = await pagina(CELULAR);
  await p.goto(`${S.base}/encontrar`);
  assert.equal(await p.locator('#exemplo-endereco').innerText(), `${new URL(S.base).host}/suaempresa`);
  assert.doesNotMatch(await p.locator('body').innerText(), /ia\.suaempresa\.com\.br/);
});

test('M47: política no ambiente da empresa, com texto próprio e título da aba sem número solto', async () => {
  const p = await pagina(LARGO, admin);
  await p.goto(`${S.base}/politica`);
  await p.locator('#texto h2').first().waitFor();
  const texto = await p.locator('main').innerText();
  assert.doesNotMatch(texto, /A IA é a assistente de IA|ninguém|A IA aplica controles|GreenIA/);
  assert.match(texto, /A IA da empresa ajuda nas tarefas do dia a dia/);
  assert.equal(await p.title(), 'Política de Uso de IA · Empresa Pública');
  assert.deepEqual(p.erros, []);
});

test('M48: Termos e Privacidade com índice de âncoras, contato clicável e rodapé', async () => {
  for (const [caminho, outro] of [['/termos', 'Política de Privacidade'], ['/privacidade', 'Termos de Uso']]) {
    const p = await pagina(CELULAR);
    await p.goto(`${S.base}${caminho}`);
    const indice = p.getByRole('navigation', { name: 'Índice' });
    await indice.locator('summary').click();
    const links = indice.getByRole('link');
    assert.ok(await links.count() >= 20, caminho);
    for (const href of await links.evaluateAll(as => as.map(a => a.getAttribute('href')))) assert.equal(await p.locator(href).count(), 1, `${caminho}: âncora ${href}`);
    await links.nth(6).click();
    await p.waitForURL(/#secao-7$/);
    assert.ok(await p.locator('main a[href="mailto:hello@theneil.com.br"]').count() >= 1, `${caminho}: email clicável`);
    const rodape = p.locator('footer.legal-rodape');
    assert.ok(await rodape.getByRole('link', { name: outro }).isVisible());
    assert.ok(await rodape.getByRole('link', { name: 'Voltar ao site' }).isVisible());
  }
});

test('M49/B2: páginas públicas com contraste de 4,5:1, texto de 12 px ou mais e títulos sem pular nível', async () => {
  for (const viewport of [LARGO, CELULAR]) {
    for (const [caminho, sessao] of [['/', null], ['/termos', null], ['/privacidade', null], ['/encontrar', null], ['/empresa-publica', null], ['/politica', admin]]) {
      const p = await pagina(viewport, sessao);
      await p.goto(`${S.base}${caminho}`);
      await p.waitForLoadState('networkidle');
      const ruins = await problemasDeTexto(p);
      assert.deepEqual(ruins, [], `${caminho} em ${viewport.width}px: ${JSON.stringify(ruins.slice(0, 5))}`);
      assert.deepEqual(await niveisPulados(p), [], `${caminho} em ${viewport.width}px`);
      await p.context().close();
    }
  }
});
