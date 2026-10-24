// Caixa de mensagem no padrão dos assistentes de chat: uma caixa só, com "+" (anexar arquivo ou link) e enviar
// redondo na barra interna; arquivos também entram colando no campo ou arrastando para a caixa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, admin;
const u = () => new URL(S.base);
async function pagina({ width = 1366, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...admin.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  await p.goto(`${S.base}/app#/nova`); await p.waitForSelector('#entrada');
  return p;
}

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Caixa', slug: 'empresa-caixa', status: 'ativa', admin_email: 'admin@caixa.test' });
  admin = S.navegador(); await admin.get('/empresa-caixa'); await admin.entrarEmpresa('admin@caixa.test');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('uma caixa só: "+" e enviar dentro dela, sem botões de anexo soltos acima', async () => {
  for (const width of [1366, 390]) {
    const p = await pagina({ width, height: 844 });
    const r = await p.evaluate(() => {
      const caixa = document.querySelector('#caixa-chat').getBoundingClientRect();
      const dentro = s => { const b = document.querySelector(s).getBoundingClientRect(); return b.left >= caixa.left && b.right <= caixa.right && b.top >= caixa.top && b.bottom <= caixa.bottom; };
      const env = document.querySelector('#enviar').getBoundingClientRect();
      return { mais: dentro('#mais-anexos'), enviar: dentro('#enviar'), texto: dentro('#entrada'), redondo: getComputedStyle(document.querySelector('#enviar')).borderRadius, quadrado: Math.abs(env.width - env.height) < 1, menuOculto: document.querySelector('#menu-anexos').hidden };
    });
    assert.deepEqual({ ...r, redondo: undefined }, { mais: true, enviar: true, texto: true, redondo: undefined, quadrado: true, menuOculto: true }, `${width}px`);
    assert.match(r.redondo, /999px|50%/);
    assert.equal(await p.getByRole('button', { name: 'Enviar' }).count(), 1);
    assert.deepEqual(p.erros, []);
  }
});

test('menu "+": abre, navega pelo teclado, Esc fecha e devolve o foco; link entra como anexo', async () => {
  const p = await pagina();
  await p.click('#mais-anexos');
  assert.equal(await p.getAttribute('#mais-anexos', 'aria-expanded'), 'true');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'anexar');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'anexar-link');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#menu-anexos').isHidden(), true);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'mais-anexos');
  // Clique fora fecha.
  await p.click('#mais-anexos'); await p.mouse.click(5, 5);
  assert.equal(await p.locator('#menu-anexos').isHidden(), true);
  // Link: aparece dentro da caixa, vira um anexo e some.
  await p.click('#mais-anexos'); await p.click('#anexar-link');
  await p.fill('#link-url', 'https://exemplo.test/politica');
  await p.keyboard.press('Enter');
  await p.locator('#anexos .anexo-chip', { hasText: 'exemplo.test/politica' }).waitFor();
  assert.equal(await p.locator('#link-novo').isHidden(), true);
  assert.equal(await p.isEnabled('#enviar'), true, 'com um anexo, enviar fica disponível');
  assert.deepEqual(p.erros, []);
});

test('colar um arquivo no campo anexa, como nos assistentes de chat', async () => {
  const p = await pagina();
  await p.focus('#entrada');
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['conteúdo de teste'], 'notas.txt', { type: 'text/plain' }));
    document.querySelector('#entrada').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.locator('#anexos .anexo-chip', { hasText: 'notas.txt' }).waitFor();
  assert.equal(await p.inputValue('#entrada'), '', 'o arquivo não vira texto no campo');
  assert.deepEqual(p.erros, []);
});
