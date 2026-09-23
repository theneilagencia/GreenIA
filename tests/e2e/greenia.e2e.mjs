// Testes de ponta a ponta do protótipo, com o support.js de verdade.
//
//   npm run test:e2e
//
// Requer Playwright com Chromium. Se o unpkg.com estiver bloqueado na rede,
// aponte REACT_UMD_DIR para uma pasta com react.production.min.js e
// react-dom.production.min.js da versão 18.3.1 (os mesmos arquivos do pacote
// npm, que batem com o SRI do support.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function loadPlaywright() {
  for (const base of [ROOT, execSync('npm root -g').toString().trim() + '/']) {
    try { return createRequire(base + 'noop.js')('playwright'); } catch {}
  }
  throw new Error('Playwright não encontrado (npm i -D playwright ou instalação global).');
}
const { chromium } = loadPlaywright();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.css': 'text/css' };
let server, base, browser;

before(async () => {
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

// Abre uma página com window.claude.complete simulado (atraso configurável).
async function openPage(file, { width = 1280, height = 860, delay = 50, reply = 'Resposta' } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\./.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (process.env.REACT_UMD_DIR) {
    const dir = process.env.REACT_UMD_DIR;
    const serve = name => r => r.fulfill({ body: readFileSync(join(dir, name)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
    await page.route(/unpkg\.com\/react@/, serve('react.production.min.js'));
    await page.route(/unpkg\.com\/react-dom@/, serve('react-dom.production.min.js'));
  }
  await page.addInitScript(({ delay, reply }) => {
    window.__calls = [];
    window.claude = {
      complete: async (req) => {
        window.__calls.push(req);
        const n = window.__calls.length;
        await new Promise(r => setTimeout(r, delay));
        return `${reply} #${n}`;
      },
    };
  }, { delay, reply });
  await page.goto(base + encodeURIComponent(file));
  await page.waitForSelector('#dc-root > .sc-host');
  return { page, errors };
}

// Texto nas bolhas visíveis (a região aria-live repete a resposta para leitores de tela).
const bubble = (page, text) => page.locator('.gia-msgs > div > :not(.gia-sr)').getByText(text);

async function login(page) {
  await page.getByRole('button', { name: 'Entrar no chat' }).first().click();
  await page.getByRole('button', { name: /Entrar com Microsoft/ }).click();
  await page.getByLabel('Mensagem').waitFor();
}

test('fluxo landing → login → chat', async () => {
  const { page, errors } = await openPage('GreenIA.dc.html');
  await page.getByRole('heading', { name: /IA para todos/ }).waitFor();
  await login(page);
  const box = page.getByLabel('Mensagem');
  await box.fill('Resumir este texto: bom dia');
  await box.press('Enter');
  await bubble(page, 'Resposta #1').waitFor({ timeout: 5000 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('trocar de conversa durante a resposta não muda o destino dela', async () => {
  const { page, errors } = await openPage('GreenIA.dc.html', { delay: 2000 });
  await login(page);
  const box = page.getByLabel('Mensagem');
  await box.fill('Primeira pergunta');
  await box.press('Enter');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await box.fill('Segunda pergunta');
  await box.press('Enter'); // bloqueado: já há uma geração em andamento
  await page.waitForTimeout(3500);

  assert.equal(await bubble(page, 'Resposta #1').count(), 0, 'resposta vazou para a conversa nova');
  assert.equal(await page.evaluate(() => window.__calls.length), 1, 'segundo envio não foi bloqueado');

  await page.getByRole('button', { name: 'Primeira pergunta' }).click();
  await bubble(page, 'Resposta #1').waitFor({ timeout: 3000 });
  assert.deepEqual(errors, []);
  await page.close();
});

test('mensagem com CPF não é enviada', async () => {
  const { page, errors } = await openPage('GreenIA.dc.html');
  await login(page);
  const box = page.getByLabel('Mensagem');
  const text = 'Confere o CPF 529.982.247-25 por favor';
  await box.fill(text);
  await box.press('Enter');
  await bubble(page, /Parece que o texto tem CPF/).waitFor();
  assert.equal(await page.evaluate(() => window.__calls.length), 0);
  assert.equal(await box.inputValue(), text, 'o texto deve ficar no campo para edição');
  assert.equal(await page.locator('aside').getByRole('button', { name: /Confere/ }).count(), 0, 'não deve entrar no histórico');
  assert.deepEqual(errors, []);
  await page.close();
});

for (const width of [360, 768, 1280]) {
  test(`sem rolagem horizontal em ${width} px`, async () => {
    const noOverflow = async (page, where) => {
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(sw <= cw, `${where}: scrollWidth ${sw} > ${cw}`);
    };
    const { page, errors } = await openPage('GreenIA.dc.html', { width, height: 800 });
    await noOverflow(page, 'landing');
    await page.getByRole('button', { name: 'Ver a política' }).click();
    await noOverflow(page, 'modal');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Entrar no chat' }).first().click();
    await noOverflow(page, 'login');
    await page.getByRole('button', { name: /Entrar com Microsoft/ }).click();
    const box = page.getByLabel('Mensagem');
    await box.waitFor();
    await box.fill('Uma pergunta comprida o bastante para ocupar mais de uma linha na tela do celular');
    await box.press('Enter');
    await bubble(page, 'Resposta #1').waitFor({ timeout: 5000 });
    await noOverflow(page, 'chat');
    assert.deepEqual(errors, []);
    await page.close();

    const pol = await openPage('Política GreenIA.dc.html', { width, height: 800 });
    await noOverflow(pol.page, 'política');
    assert.deepEqual(pol.errors, []);
    await pol.page.close();
  });
}

// Regressão da Fase 1: os hovers geravam regras vazias e nada mudava.
test('hover muda o estilo de um botão em cada página', async () => {
  const bg = loc => loc.evaluate(e => getComputedStyle(e).backgroundColor);
  const { page, errors } = await openPage('GreenIA.dc.html');
  const cta = page.getByRole('button', { name: 'Entrar no chat' }).first();
  const before = await bg(cta);
  await cta.hover();
  await page.waitForTimeout(50);
  assert.notEqual(await bg(cta), before, 'hover da landing não mudou o fundo');
  assert.deepEqual(errors, []);
  await page.close();

  const pol = await openPage('Política GreenIA.dc.html');
  const link = pol.page.getByRole('link', { name: 'Entrar no chat' }).first();
  const b2 = await bg(link);
  await link.hover();
  await pol.page.waitForTimeout(50);
  assert.notEqual(await bg(link), b2, 'hover da política não mudou o fundo');
  await pol.page.close();
});

// Regressão da Fase 1: a rolagem automática nunca funcionou (msgRef fora de renderVals()).
test('lista rola para o fim quando chega resposta, e não rola se a pessoa subiu', async () => {
  const { page, errors } = await openPage('GreenIA.dc.html', { delay: 50, reply: 'linha\n'.repeat(60) });
  await login(page);
  const box = page.getByLabel('Mensagem');
  const list = page.locator('.gia-msgs');
  const gap = () => list.evaluate(e => Math.round(e.scrollHeight - e.scrollTop - e.clientHeight));
  // Resposta n chegou e o typewriter terminou (sem cursor piscando).
  const answered = n => page.waitForFunction(
    n => document.querySelector('.gia-msgs').innerText.includes('#' + n) && !document.querySelector('.gia-msgs [style*="giaBlink"]'),
    n, { timeout: 5000 });
  for (const [i, q] of ['pergunta 1', 'pergunta 2'].entries()) {
    await box.fill(q);
    await box.press('Enter');
    await answered(i + 1);
    await page.waitForTimeout(100);
  }
  assert.ok(await list.evaluate(e => e.scrollHeight > e.clientHeight + 200), 'a lista precisa ser rolável para o teste valer');
  assert.ok(await gap() <= 2, `não rolou até o fim (faltam ${await gap()} px)`);

  // A pessoa sobe mais de 80 px enquanto a resposta chega: a posição fica.
  await box.fill('pergunta 3');
  await box.press('Enter');
  await page.waitForTimeout(20);
  await list.evaluate(e => { e.scrollTop = e.scrollHeight - e.clientHeight - 300; e.dispatchEvent(new Event('scroll')); });
  const top = await list.evaluate(e => e.scrollTop);
  await answered(3);
  await page.waitForTimeout(100);
  assert.equal(await list.evaluate(e => e.scrollTop), top, 'rolou mesmo com a pessoa lendo mais acima');
  assert.deepEqual(errors, []);
  await page.close();
});

test('avisar não envia sem confirmação; com confirmação envia', async () => {
  const { page, errors } = await openPage('GreenIA.dc.html');
  await login(page);
  const box = page.getByLabel('Mensagem');
  await box.fill('Escreva um email para ana@grupo.com.br sobre a reunião');
  await box.press('Enter');
  await bubble(page, /Seu texto parece conter email\. Enviar mesmo assim\?/).waitFor();
  assert.equal(await page.evaluate(() => window.__calls.length), 0, 'enviou sem confirmação');
  await page.getByRole('button', { name: 'Enviar mesmo assim' }).click();
  await bubble(page, 'Resposta #1').waitFor({ timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__calls.length), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('bloquear não oferece opção de envio', async () => {
  const { page, errors } = await openPage('GreenIA.dc.html');
  await login(page);
  const box = page.getByLabel('Mensagem');
  await box.fill('Confere o CPF 529.982.247-25 e o email ana@grupo.com.br');
  await box.press('Enter');
  await bubble(page, /Parece que o texto tem CPF/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Enviar mesmo assim' }).count(), 0);
  await box.press('Enter');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__calls.length), 0);
  assert.deepEqual(errors, []);
  await page.close();
});
