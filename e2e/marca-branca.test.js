// White label no navegador: no ambiente de uma empresa da plataforma, a marca é a da empresa. Nenhuma tela de
// quem usa ou do admin da empresa mostra o nome ou o logo da plataforma. O console da plataforma continua com
// a marca dela.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM].find(p => p && existsSync(p));
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#7A4A12"/></svg>').toString('base64');
let S, nav, ctx, P;

before(async () => {
  S = await subirPlataforma();
  P = S.P;
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Apiário Exemplo', slug: 'apiario', status: 'ativa', admin_email: 'dona@apiario.com.br' })).dados;
  assert.equal((await ops.put(`/api/plataforma/empresas/${c.id}/marca`, { logo: LOGO })).status, 200);
  nav = await chromium.launch({ executablePath: CHROMIUM });
  ctx = await nav.newContext({ viewport: { width: 1280, height: 820 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
});
after(async () => { await nav?.close(); await S.fechar(); });

// Texto visível e atributos que aparecem para a pessoa, fora do conteúdo das conversas.
const marcaVisivel = p => p.evaluate(() => {
  const fora = document.body.cloneNode(true);
  fora.querySelectorAll('.bolha-eu, .bolha-ia:not(.aviso-bolha), script, style').forEach(e => e.remove());
  const attrs = [...fora.querySelectorAll('[title],[aria-label],[alt],[placeholder]')].map(e => ['title', 'aria-label', 'alt', 'placeholder'].map(a => e.getAttribute(a) || '').join(' '));
  const imgs = [...document.querySelectorAll('img')].map(i => i.getAttribute('src') || '').filter(s => /greenia/i.test(s));
  return { texto: (fora.innerText + ' ' + attrs.join(' ') + ' ' + document.title).match(/.{0,40}GreenIA.{0,40}/g) || [], imgs };
});

test('ambiente da empresa: login, uso e administração sem a marca da plataforma', async () => {
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${S.base}/apiario`);
  await p.goto(`${S.base}/entrar`);
  await p.waitForSelector('.marca .logo-marca');
  assert.deepEqual(await marcaVisivel(p), { texto: [], imgs: [] }, 'login');
  await p.fill('#email', 'dona@apiario.com.br');
  await p.click('#btn-email');
  await p.waitForSelector('#codigo', { state: 'visible' });
  await p.fill('#codigo', /(\d{6})/.exec(P.email.enviados.filter(m => m.para === 'dona@apiario.com.br').at(-1).assunto)[1]);
  // O email de acesso também sai sem o nome da plataforma.
  assert.doesNotMatch(JSON.stringify(P.email.enviados.filter(m => m.para === 'dona@apiario.com.br').at(-1)), /GreenIA/);
  await p.click('#btn-codigo');
  await p.waitForURL(/\/app/);
  const ciencia = await p.waitForSelector('#dar-ciencia', { timeout: 4000 }).catch(() => null);
  if (ciencia) {
    assert.deepEqual((await marcaVisivel(p)).texto, [], 'política no primeiro acesso');
    await ciencia.click(); await p.waitForSelector('#dar-ciencia', { state: 'detached' });
  }
  await p.waitForSelector('#entrada');
  // A marca da empresa ocupa o topo da lateral; o título da aba é o da empresa.
  assert.equal(await p.locator('.lateral .marca .logo-marca').count(), 1);
  assert.equal(await p.title(), 'Apiário Exemplo');
  for (const tela of ['nova', 'conversas', 'quick-wins', 'conhecimento', 'visao-geral', 'uso', 'pessoas', 'modelos', 'politicas', 'politicas/texto', 'atividade', 'configuracoes', 'empresa/marca']) {
    await p.goto(`${S.base}/app#/${tela}`);
    await p.waitForFunction(() => { const c = document.getElementById('conteudo') || document.getElementById('principal'); return c && !/Carregando/.test(c.textContent); });
    await p.waitForTimeout(200);
    const v = await marcaVisivel(p);
    assert.deepEqual(v, { texto: [], imgs: [] }, `${tela}: ${JSON.stringify(v)}`);
  }
  // Conversa: o ícone da IA é o da empresa, e as explicações não citam a plataforma.
  await p.goto(`${S.base}/app#/nova`);
  await p.fill('#entrada', 'Resuma em uma linha o que é um quick win.');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.rodape-resposta');
  assert.deepEqual(await marcaVisivel(p), { texto: [], imgs: [] }, 'conversa');
  await p.goto(`${S.base}/politica`);
  await p.waitForFunction(() => document.getElementById('texto')?.textContent.length > 50);
  assert.deepEqual(await marcaVisivel(p), { texto: [], imgs: [] }, 'página da política');
  assert.deepEqual(erros, []);
});

test('o console da plataforma continua com a marca da plataforma', async () => {
  const p = await ctx.newPage();
  await p.goto(`${S.base}/plataforma`);
  await p.waitForSelector('.marca');
  assert.match(await p.locator('.marca').first().innerText(), /GreenIA/);
});
