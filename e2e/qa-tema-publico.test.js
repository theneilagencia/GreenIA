// Tema escuro nas páginas públicas: a página de vendas e a página de apresentação de cada empresa (/<slug>) seguem o
// sistema (Automático) e a escolha guardada pelo tema.js. No escuro: fundo escuro, contraste AA em todos os textos,
// nenhuma rolagem lateral (1366 e 390 px) e o botão na cor da empresa com texto branco. No claro, nada muda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { medirTextos } from './ajuda-contraste.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const LARGURAS = [{ width: 1366, height: 900 }, { width: 390, height: 844 }];
const MARCA = '#5B2A86';   // roxo escuro: no escuro, textos e ícones precisam do tom clareado
let S, nav;
const PAGINAS = [['vendas', '/', '#contato'], ['empresa', '/empresa-roxa', '#ld-titulo'], ['empresa sem cor', '/empresa-verde', '#ld-titulo']];

async function abrir(rota, espera, { esquema = 'dark', viewport = LARGURAS[0], tema = null } = {}) {
  const ctx = await nav.newContext({ viewport, colorScheme: esquema, reducedMotion: 'reduce' });
  if (tema) await ctx.addInitScript(v => { try { localStorage.setItem('greenia-tema', v); } catch { /* sem armazenamento */ } }, tema);
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  await p.goto(S.base + rota);
  await p.locator(espera).first().waitFor({ state: 'attached' });
  // Percorre a página (imagens com loading=lazy e blocos que surgem ao rolar) e volta ao topo.
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 20)); }
    scrollTo(0, 0);
    document.querySelectorAll('.espera').forEach(e => e.classList.remove('espera'));
  });
  await p.waitForTimeout(250);
  return p;
}
// Luminância do fundo da página: escuro abaixo de 0,1, claro acima de 0,8.
const fundo = p => p.evaluate(() => {
  const n = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
});
const contrasteRuim = async p => (await p.evaluate(medirTextos)).filter(x => x.razao !== null && x.razao < x.minimo);
const rolagemLateral = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

before(async () => {
  S = await subirPlataforma({ paginaInicial: 'vendas' });
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const roxa = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Roxa', slug: 'empresa-roxa', status: 'ativa', admin_email: 'admin@roxa.test' })).dados;
  const r = await ops.put(`/api/plataforma/empresas/${roxa.id}/marca`, { primary_color: MARCA });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Verde', slug: 'empresa-verde', status: 'ativa', admin_email: 'admin@verde.test' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('CSS: os dois blocos do escuro (Automático e Escuro escolhido) têm os mesmos valores; as páginas seguem o tema', () => {
  const css = readFileSync(new URL('../public/lp.css', import.meta.url), 'utf8');
  const bloco = sel => { const i = css.indexOf(sel); assert.ok(i >= 0, `bloco ausente: ${sel}`); const a = css.indexOf('{', i) + 1; return css.slice(a, css.indexOf('}', a)).replace(/\s+/g, ' ').trim(); };
  const auto = bloco(':root:not([data-tema="claro"]) .l{'), escolhido = bloco(':root[data-tema="escuro"] .l{');
  assert.ok(auto.length > 500);
  assert.equal(auto, escolhido);
  for (const f of ['vendas.html', 'index.html']) {
    const h = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(h, /data-tema=/, `${f}: sem tema fixo`);
    assert.match(h, /<script src="\/tema\.js"><\/script>\s*<link rel="stylesheet"/, `${f}: tema.js antes do CSS`);
  }
});

test('escuro do sistema: fundo escuro, contraste AA e sem rolagem lateral (1366 e 390 px)', async () => {
  const falhas = [];
  for (const viewport of LARGURAS) {
    for (const [nome, rota, espera] of PAGINAS) {
      const p = await abrir(rota, espera, { viewport });
      const l = await fundo(p);
      if (!(l < 0.1)) falhas.push(`${nome} ${viewport.width}px: fundo claro (${l.toFixed(3)})`);
      const ruins = await contrasteRuim(p);
      if (ruins.length) falhas.push(`${nome} ${viewport.width}px: ${JSON.stringify(ruins.slice(0, 5))}`);
      if (await rolagemLateral(p)) falhas.push(`${nome} ${viewport.width}px: rolagem horizontal`);
      assert.deepEqual(p.erros, [], `${nome} ${viewport.width}px`);
      await p.context().close();
    }
  }
  assert.deepEqual(falhas, []);
});

test('claro continua claro, com contraste AA e sem rolagem lateral', async () => {
  const falhas = [];
  for (const viewport of LARGURAS) {
    for (const [nome, rota, espera] of PAGINAS) {
      const p = await abrir(rota, espera, { esquema: 'light', viewport });
      assert.equal(await p.evaluate(() => document.documentElement.getAttribute('data-tema')), null, 'Automático');
      const l = await fundo(p);
      if (!(l > 0.8)) falhas.push(`${nome} ${viewport.width}px: fundo escuro (${l.toFixed(3)})`);
      const ruins = await contrasteRuim(p);
      if (ruins.length) falhas.push(`${nome} ${viewport.width}px: ${JSON.stringify(ruins.slice(0, 5))}`);
      if (await rolagemLateral(p)) falhas.push(`${nome} ${viewport.width}px: rolagem horizontal`);
      await p.context().close();
    }
  }
  assert.deepEqual(falhas, []);
});

test('a escolha guardada no app vale nas páginas públicas: Escuro no sistema claro e Claro no sistema escuro', async () => {
  for (const [nome, rota, espera] of PAGINAS.slice(0, 2)) {
    const e = await abrir(rota, espera, { esquema: 'light', tema: 'escuro' });
    assert.equal(await e.evaluate(() => document.documentElement.getAttribute('data-tema')), 'escuro');
    assert.ok(await fundo(e) < 0.1, `${nome}: Escuro escolhido`);
    assert.deepEqual(await contrasteRuim(e), [], `${nome}: contraste no Escuro escolhido`);
    await e.context().close();
    const c = await abrir(rota, espera, { esquema: 'dark', tema: 'claro' });
    assert.ok(await fundo(c) > 0.8, `${nome}: Claro escolhido`);
    await c.context().close();
  }
});

test('página da empresa no escuro: botões na cor da empresa com texto branco; destaques no tom clareado', async () => {
  const p = await abrir('/empresa-roxa', '#ld-titulo');
  await p.waitForSelector('style#cores-marca', { state: 'attached' });
  const hex = s => '#' + s.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  const cores = await p.evaluate(() => {
    const cs = s => getComputedStyle(document.querySelector(s));
    return {
      botao: cs('#ld-botoes .btn-verde').backgroundColor, textoBotao: cs('#ld-botoes .btn-verde').color,
      topo: cs('.pp-topo .btn-verde').backgroundColor, passo: getComputedStyle(document.querySelector('#ld-passos li'), '::before').backgroundColor,
      rotulo: cs('#cu-rotulo').color,
    };
  });
  assert.equal(hex(cores.botao), MARCA, 'botão principal na cor da empresa');
  assert.equal(hex(cores.topo), MARCA, 'botão Entrar do topo na cor da empresa');
  assert.equal(hex(cores.passo), MARCA, 'número dos passos na cor da empresa');
  assert.equal(hex(cores.textoBotao), '#FFFFFF');
  assert.notEqual(hex(cores.rotulo), MARCA, 'rótulos no tom clareado, legível no fundo escuro');
  await p.context().close();
});
