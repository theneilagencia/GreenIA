// Console da plataforma, planos: lista com margem total no pior caso e status, Capacity Pack, premissas; editor com
// prévia ao vivo e trava do piso no salvamento; liberação de Capacity Pack por quantidade na empresa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { todos } from '../src/db.js';
import { mkdirSync } from 'node:fs';
mkdirSync('capturas/tmp', { recursive: true });

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ctx, p, empresa;
before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const team = (await ops.get('/api/plataforma/planos')).dados.planos.find(x => x.name === 'GreenIA Team');
  empresa = (await ops.post('/api/plataforma/empresas', { name: 'Beta', slug: 'beta-planos', status: 'ativa', plan_id: team.id, admin_email: 'admin@beta-planos.com' })).dados;
  nav = await chromium.launch({ executablePath: CHROMIUM });
  ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const u = new URL(S.base);
  await ctx.addCookies([...ops.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  p = await ctx.newPage();
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('planos: margem total no pior caso com status, preço mínimo, Capacity Pack e premissas; editor com prévia e trava do piso', async () => {
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${S.base}/plataforma#/planos`);
  await p.waitForSelector('text=GreenIA Starter');
  const texto = await p.locator('main, #conteudo, body').first().innerText();
  for (const n of ['GreenIA Starter', 'GreenIA Team', 'GreenIA Business', 'GreenIA Company', 'Capacity Pack', 'Premissas econômicas', 'Margem total']) assert.match(texto, new RegExp(n));
  assert.doesNotMatch(texto, /Abaixo da meta|Abaixo do piso/, 'os quatro planos na meta');
  assert.equal((texto.match(/Saudável/g) || []).length >= 5, true, 'quatro planos + Capacity Pack saudáveis');
  assert.match(texto, /Sem teto de custo/, 'Liberado sinalizado');
  await p.waitForTimeout(900); await p.screenshot({ path: 'capturas/tmp/planos-console.png', fullPage: true });
  // Editor: a prévia muda ao digitar e o preço abaixo do piso não é salvo.
  await p.click('text=GreenIA Business');
  await p.waitForSelector('#pl-previa .indicador');
  assert.match(await p.locator('#pl-previa').innerText(), /Margem total no pior caso/);
  await p.waitForTimeout(900); await p.screenshot({ path: 'capturas/tmp/plano-editor.png', fullPage: true });
  await p.fill('#pl-preco', '600');
  await p.waitForFunction(() => /Abaixo do piso/.test(document.getElementById('pl-previa').innerText));
  await p.click('#f-plano .btn-verde');
  await p.waitForFunction(() => /margem total no pior caso/i.test(document.getElementById('pl-erro')?.innerText || ''));
  const preco = todos(S.P.db, "select price_usd from plans where name = 'GreenIA Business'")[0].price_usd;
  assert.equal(preco, 749, 'nada foi gravado');
  assert.deepEqual(erros, []);
});

test('empresa: libera Capacity Packs por quantidade; créditos e valor calculados no servidor', async () => {
  await p.goto(`${S.base}/plataforma#/empresas/${empresa.id}`);
  await p.waitForSelector('text=Liberar Capacity Pack');
  await p.click('text=Liberar Capacity Pack');
  await p.fill('#p-qtd', '3');
  await p.waitForFunction(() => /6\.000 créditos/.test(document.getElementById('p-resumo').innerText));
  p.once('dialog', d => d.accept());
  await p.click('#f-pacote button');
  await p.waitForFunction(() => document.querySelector('#f-pacote') && /Capacity Pack disponível/.test(document.body.innerText));
  const linhas = todos(S.P.tenant(empresa.id).db, 'select creditos, produto, preco_usd from pacotes').map(x => ({ ...x }));
  assert.deepEqual(linhas, [{ creditos: 6000, produto: 'capacity_pack', preco_usd: 687 }]);
});
