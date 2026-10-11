// Regressão do QA de UX de out/2026: os achados críticos e os da lateral não voltam.
// C1 estado vazio de Encerramentos; C2 encerrar ambiente com confirmação própria; C3 conversa no celular com área
// de leitura; C4/C5 Quick Win do formato anterior (publicar, agendar, redirecionar sem beco); A1/A2 lateral e foco.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { um } from '../src/db.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, emp, admin, pessoa, qwAntigo, qwPublicado, conversa;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  return p;
}

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa UX', slug: 'empresa-ux', status: 'ativa', admin_email: 'admin@ux.test' })).dados;
  admin = S.navegador(); await admin.get('/empresa-ux'); await admin.entrarEmpresa('admin@ux.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@ux.test', name: 'Pessoa UX', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  const pid = (lista.pessoas || lista).find(x => x.email === 'pessoa@ux.test').id;
  await admin.put(`/api/admin/pessoas/${pid}`, { areas: [{ id: area }] });
  // Dois Quick Wins do formato anterior (criados pelos modelos): um em teste e um já em uso.
  const modelos = (await admin.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
  qwAntigo = (await admin.post('/api/quick-wins', { modelo_inicial: 0, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qwAntigo.id}`, { status: 'em_teste' });
  qwPublicado = (await admin.post('/api/quick-wins', { modelo_inicial: Math.min(1, modelos.length - 1), areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qwPublicado.id}`, { status: 'em_uso' });
  pessoa = S.navegador(); await pessoa.get('/empresa-ux'); await pessoa.entrarEmpresa('pessoa@ux.test');
  conversa = (await pessoa.post('/api/conversas', { quick_win_id: qwPublicado.id })).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${conversa.id}/mensagens`, { texto: 'Confira estes dois documentos e liste as diferenças' });
  await pessoa.req('PATCH', `/api/conversas/${conversa.id}`, { titulo: 'Pedido 4471 da papelaria do centro' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('C1: Encerramentos sem ambientes mostra a mensagem, não o HTML do componente', async () => {
  const p = await pagina(ops);
  await p.goto(`${S.base}/plataforma#/encerramentos`);
  await p.waitForSelector('text=Nenhum ambiente cancelado');
  assert.doesNotMatch(await p.locator('main, body').first().innerText(), /<div|<svg|class=/);
  assert.deepEqual(p.erros, []);
});

test('C2: encerrar ambiente é ação de perigo, separada, com data da exclusão e confirmação pelo identificador', async () => {
  const p = await pagina(ops);
  await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/resumo`);
  const botao = p.getByRole('button', { name: 'Encerrar ambiente…' });
  await botao.waitFor();
  assert.match(await botao.getAttribute('class'), /btn-perigo/);
  assert.equal(await p.getByRole('button', { name: 'Cancelar', exact: true }).count(), 0, 'nenhum botão ambíguo "Cancelar"');
  await botao.click();
  const dialogo = p.getByRole('dialog');
  await dialogo.waitFor();
  assert.match(await dialogo.innerText(), /excluídos definitivamente em \d{2} de \w+ de \d{4}/);
  const confirmar = dialogo.getByRole('button', { name: 'Encerrar ambiente', exact: true });
  assert.equal(await confirmar.isDisabled(), true, 'só libera depois de digitar o identificador');
  await dialogo.getByRole('textbox').fill('outro');
  assert.equal(await confirmar.isDisabled(), true);
  await dialogo.getByRole('button', { name: 'Voltar sem alterar' }).click();
  assert.equal(um(S.P.db, 'select status from companies where id = ?', emp.id).status, 'ativa', 'voltar não altera nada');
  assert.deepEqual(p.erros, []);
});

test('A1/A2: lateral com ações compactas, título com a largura e foco visível na lista de conversas', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/conversas`);
  await p.waitForSelector('.hc-conversa');
  const m = await p.evaluate(() => { const r = document.querySelector('#lateral .hc-recente'); const a = r.querySelector('a').getBoundingClientRect(), b = r.querySelector('.hc-acoes').getBoundingClientRect(); return { link: a.width, acoes: b.width, texto: r.querySelector('.hc-acoes').innerText.trim() }; });
  assert.ok(m.acoes <= 32 && m.link >= 150, JSON.stringify(m));
  assert.equal(m.texto, '', 'o botão é um ícone; o nome fica no aria-label');
  assert.match(await p.locator('#lateral .hc-recente .hc-acoes').first().getAttribute('aria-label'), /^Ações de /);
  await p.locator('.hc-conversa').first().focus();
  await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
  const foco = await p.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { el: document.activeElement.className, estilo: cs.outlineStyle, largura: parseFloat(cs.outlineWidth) }; });
  assert.ok(foco.estilo !== 'none' && foco.largura >= 2, JSON.stringify(foco));
});

test('C3: no celular, a conversa deixa área de leitura, também com o teclado aberto', async () => {
  for (const [width, height, minimo] of [[390, 844, 0.55], [390, 500, 0.4]]) {
    const p = await pagina(pessoa, { width, height });
    await p.goto(`${S.base}/app#/c/${conversa.id}`);
    await p.waitForSelector('#entrada');
    await p.focus('#entrada');
    const m = await p.evaluate(() => ({ msgs: document.querySelector('#msgs').getBoundingClientRect().height, h: innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth, titulo: document.querySelector('.cabeca h1').getBoundingClientRect().width }));
    assert.ok(m.msgs / m.h >= minimo, `${width}×${height}: ${JSON.stringify(m)}`);
    assert.equal(m.hscroll, false);
    assert.ok(m.titulo >= width * 0.6, `título legível: ${JSON.stringify(m)}`);
    assert.deepEqual(p.erros, []);
  }
});

test('C4/C5: Quick Win do formato anterior tem caminho para publicar e as telas explicam o que falta', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/qw/${qwAntigo.id}`);
  await p.getByText('Ainda não está disponível para a equipe.').waitFor();
  // Agendar: estado explicado com a ação que resolve (sem tela de erro).
  await p.goto(`${S.base}/app#/qw/${qwPublicado.id}/programar`);
  await p.getByText('Este Quick Win usa o formato anterior, que não tem agendamento.').waitFor();
  assert.equal(await p.getByText('Não foi possível abrir esta tela').count(), 0);
  assert.equal(await p.getByRole('link', { name: 'Atualizar formato' }).count(), 1);
  // Ajustar leva ao editor do formato anterior e não deixa o endereço que redireciona no histórico.
  await p.goto(`${S.base}/app#/qw/${qwAntigo.id}`);
  await p.goto(`${S.base}/app#/qw/${qwAntigo.id}/ajustar`);
  await p.waitForURL(new RegExp(`#/qw/${qwAntigo.id}/editar$`));
  await p.goBack({ waitUntil: 'commit' }); await p.waitForURL(new RegExp(`#/qw/${qwAntigo.id}$`));
  // Publicar: diz quem passa a ver e publica.
  await p.goto(`${S.base}/app#/qw/${qwAntigo.id}/publicar`);
  await p.getByText(/da área Operações passam a ver e usar/).waitFor();
  await p.getByRole('button', { name: 'Publicar para a equipe' }).click();
  await p.waitForURL(new RegExp(`#/qw/${qwAntigo.id}$`));
  assert.equal((await admin.get(`/api/quick-wins/${qwAntigo.id}`)).dados.status, 'em_uso');
  assert.deepEqual(p.erros, []);
});

test('Recusa de tela da administração explica o próximo passo e não prende o Voltar', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/conversas`);
  await p.waitForSelector('.hc-conversa, .vazio');
  await p.goto(`${S.base}/app#/modelos`);
  await p.waitForFunction(() => location.hash === '#/nova', null, { timeout: 8000 }).catch(async e => { console.log('HASH', await p.evaluate(() => location.hash + ' | ' + document.querySelector('#principal')?.innerText.slice(0, 200) + ' | toast=' + document.querySelector('.toast')?.innerText)); throw e; });
  await p.locator('.toast', { hasText: 'peça acesso a quem administra' }).waitFor();
  await p.goBack({ waitUntil: 'commit' }); await p.waitForURL(/#\/conversas$/);
});
