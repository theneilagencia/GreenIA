// Tema escuro (achado B3): o padrão segue o sistema; a escolha Claro/Escuro/Automático fica no navegador e vale
// ao recarregar; no escuro, as telas principais do app e do console têm contraste AA e nenhuma rolagem lateral.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { medirTextos } from './ajuda-contraste.js';
import { itemConta, abrirConta } from './casca.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const CELULAR = { width: 390, height: 844 }, LARGO = { width: 1280, height: 860 };
let S, nav, ops, admin, marina, conversa, qw;
const u = () => new URL(S.base);

async function pagina(sessao, { esquema = 'dark', viewport = LARGO } = {}) {
  const ctx = await nav.newContext({ viewport, colorScheme: esquema });
  if (sessao) await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  return p;
}
// Luminância do fundo da página: escuro abaixo de 0,1, claro acima de 0,8.
const fundo = p => p.evaluate(() => {
  const n = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
});
const tema = p => p.evaluate(() => document.documentElement.getAttribute('data-tema'));
const contrasteRuim = async p => (await p.evaluate(medirTextos)).filter(x => x.razao !== null && x.razao < x.minimo);
const rolagemLateral = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Tema', slug: 'empresa-tema', status: 'ativa', admin_email: 'admin@tema.test' });
  admin = S.navegador(); await admin.get('/empresa-tema'); await admin.entrarEmpresa('admin@tema.test');
  // Cor de marca da empresa (white label): roxo escuro, que precisa virar um tom legível no escuro.
  { const r = await admin.put('/api/empresa/marca', { primary_color: '#5B2A86' }); assert.equal(r.status, 200, JSON.stringify(r.dados)); }
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'marina@tema.test', name: 'Marina Tema', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  const pid = (lista.pessoas || lista).find(x => x.email === 'marina@tema.test').id;
  await admin.put(`/api/admin/pessoas/${pid}`, { areas: [{ id: area, responsavel: true }] });
  marina = S.navegador(); await marina.get('/empresa-tema'); await marina.entrarEmpresa('marina@tema.test');
  qw = (await marina.post('/api/quick-wins', { modelo_inicial: 0, areas: [area] })).dados;
  await marina.put(`/api/quick-wins/${qw.id}`, { status: 'em_uso' });
  conversa = (await marina.post('/api/conversas', {})).dados.conversa;
  await marina.req('POST', `/api/conversas/${conversa.id}/mensagens`, { texto: 'Escreva um email curto com uma lista de 3 passos e uma tabela simples.' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('padrão Automático: segue o esquema do sistema, sem data-tema', async () => {
  for (const [esquema, escuro] of [['dark', true], ['light', false]]) {
    const p = await pagina(marina, { esquema });
    await p.goto(`${S.base}/app#/nova`);
    await p.waitForSelector('#conta');
    assert.equal(await tema(p), null);
    const l = await fundo(p);
    assert.ok(escuro ? l < 0.1 : l > 0.8, `${esquema}: luminância do fundo ${l}`);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  }
});

test('escolher Escuro e Claro na Ajuda vale ao recarregar; Automático volta a seguir o sistema', async () => {
  const p = await pagina(marina, { esquema: 'light' });
  await p.goto(`${S.base}/app#/nova`);
  await itemConta(p, '#ajuda-tela');
  const seletor = p.getByRole('dialog').getByLabel('Aparência');
  assert.equal(await seletor.inputValue(), 'auto');
  await seletor.selectOption('escuro');
  assert.equal(await tema(p), 'escuro');
  assert.ok(await fundo(p) < 0.1, 'escureceu na hora');
  await p.reload(); await p.waitForSelector('#conta');
  assert.equal(await tema(p), 'escuro', 'a escolha persiste');
  assert.ok(await fundo(p) < 0.1);
  // No sistema escuro, escolher Claro também persiste.
  await p.emulateMedia({ colorScheme: 'dark' });
  await itemConta(p, '#ajuda-tela');
  await p.getByRole('dialog').getByLabel('Aparência').selectOption('claro');
  await p.reload(); await p.waitForSelector('#conta');
  assert.equal(await tema(p), 'claro');
  assert.ok(await fundo(p) > 0.8, 'claro mesmo com o sistema escuro');
  await itemConta(p, '#ajuda-tela');
  await p.getByRole('dialog').getByLabel('Aparência').selectOption('auto');
  await p.reload(); await p.waitForSelector('#conta');
  assert.equal(await tema(p), null);
  assert.equal(await p.evaluate(() => localStorage.getItem('greenia-tema')), null);
  assert.ok(await fundo(p) < 0.1, 'Automático segue o sistema escuro');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('console: Aparência no menu da conta (pé da lateral), com a mesma escolha guardada', async () => {
  const p = await pagina(ops, { esquema: 'light' });
  await p.goto(`${S.base}/plataforma#/empresas`);
  await p.waitForSelector('#conta');
  await abrirConta(p);
  assert.equal(await p.locator('#menu-conta').getByRole('group', { name: 'Aparência' }).count(), 1);
  assert.equal(await p.locator('#menu-conta [data-tema-opcao="auto"]').getAttribute('aria-checked'), 'true');
  await p.click('#menu-conta [data-tema-opcao="escuro"]');
  await p.reload(); await p.waitForSelector('#conta');
  assert.equal(await tema(p), 'escuro');
  assert.equal(await p.locator('#menu-conta [data-tema-opcao="escuro"]').getAttribute('aria-checked'), 'true');
  assert.ok(await fundo(p) < 0.1);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('tema escuro: telas principais sem contraste insuficiente e sem rolagem horizontal (desktop e celular)', async () => {
  const TELAS = [
    [marina, '/app#/nova', '#conta'],
    [marina, `/app#/c/${conversa.id}`, '.bolha-ia'],
    [marina, '/app#/quick-wins', '.pagina .qw-marca'],
    [admin, '/app#/pessoas', 'text=Marina Tema'],
    [admin, '/app#/visao-geral', '.indicadores'],
    [ops, '/plataforma#/empresas', 'text=Empresa Tema'],
  ];
  const falhas = [];
  for (const viewport of [LARGO, CELULAR]) {
    for (const [sessao, rota, espera] of TELAS) {
      const p = await pagina(sessao, { viewport });
      await p.goto(S.base + rota);
      await p.locator(espera).first().waitFor();
      await p.waitForTimeout(300);
      assert.ok(await fundo(p) < 0.1, `${rota}: fundo escuro`);
      const ruins = await contrasteRuim(p);
      if (ruins.length) falhas.push(`${rota} ${viewport.width}px: ${JSON.stringify(ruins.slice(0, 4))}`);
      if (await rolagemLateral(p)) falhas.push(`${rota} ${viewport.width}px: rolagem horizontal`);
      assert.deepEqual(p.erros, [], rota);
      await p.context().close();
    }
  }
  assert.deepEqual(falhas, []);
});

test('tema escuro com a cor da empresa: botão e links legíveis e a Ajuda aberta também passa', async () => {
  const p = await pagina(marina);
  await p.goto(`${S.base}/app#/nova`);
  await p.waitForSelector('#conta');
  await p.waitForSelector('style#cores-marca', { state: 'attached' });
  const cores = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { botao: cs.getPropertyValue('--forest-strong').trim(), texto: cs.getPropertyValue('--forest-text').trim() }; });
  assert.equal(cores.botao.toLowerCase(), '#5b2a86', 'o botão continua na cor da empresa');
  assert.notEqual(cores.texto.toLowerCase(), '#5b2a86', 'o texto usa o mesmo tom clareado');
  await itemConta(p, '#ajuda-tela');
  await p.getByRole('dialog').waitFor();
  assert.deepEqual(await contrasteRuim(p), []);
  await p.context().close();
});
