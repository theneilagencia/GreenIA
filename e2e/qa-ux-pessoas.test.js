// Gestão de pessoas unificada: um item "Pessoas" com abas (Pessoas, Áreas, Grupos, Perfis, Quem cria Quick Wins).
// A aba Pessoas é a lista única de quem tem acesso; o painel de cada pessoa junta perfil, situação, áreas, grupos,
// Quick Wins que pode criar e a revisão de acesso. Cada aba só para quem tem a permissão dela; os endereços antigos
// redirecionam sem rastro no histórico; celular sem rolagem lateral; nenhum diálogo nativo do navegador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, admin, gestor, leitor, area, grupo, marina;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const abrir = async (p, rota) => { await p.goto(`${S.base}/app#/${rota}`); await p.waitForSelector('#conteudo > :not(.carregando), .pagina-dentro > :not(#conteudo)'); await p.waitForLoadState('networkidle'); };
const abas = p => p.locator('[role=tablist] [role=tab]').allInnerTexts();
const usuarioPorEmail = async email => (await admin.get('/api/empresa/usuarios')).dados.usuarios.find(x => x.email === email);

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Pessoas UX', slug: 'empresa-pessoas-ux', status: 'ativa', admin_email: 'admin@pes.test' });
  admin = S.navegador(); await admin.get('/empresa-pessoas-ux'); await admin.entrarEmpresa('admin@pes.test');
  area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados;
  grupo = (await admin.post('/api/admin/grupos', { nome: 'Analistas' })).dados;
  for (const [email, name, role_id] of [['marina@pes.test', 'Marina Souza', 'role_member'], ['gestor@pes.test', 'Gil Gestor', 'role_manager'], ['leitor@pes.test', 'Lia Leitora', 'role_viewer']])
    assert.equal((await admin.post('/api/empresa/usuarios', { email, name, role_id })).status, 200);
  marina = (await admin.get('/api/admin/pessoas')).dados.pessoas.find(p => p.email === 'marina@pes.test');
  await admin.put(`/api/admin/pessoas/${marina.id}`, { areas: [{ id: area.id, responsavel: true, adminBase: true }], grupos: [grupo.id] });
  gestor = S.navegador(); await gestor.get('/empresa-pessoas-ux'); await gestor.entrarEmpresa('gestor@pes.test');
  leitor = S.navegador(); await leitor.get('/empresa-pessoas-ux'); await leitor.entrarEmpresa('leitor@pes.test');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('menu com "Pessoas" e "Acessos do suporte"; abas com tablist e teclado; lista única com perfil, áreas, grupos e revisão', async () => {
  const p = await pagina(admin);
  await abrir(p, 'pessoas');
  const menu = await p.locator('#lateral .lateral-rolagem a.item-lat .nome').allInnerTexts();
  assert.ok(menu.includes('Pessoas') && menu.includes('Acessos do suporte'), JSON.stringify(menu));
  for (const antigo of ['Usuários', 'Áreas e grupos', 'Pessoas e áreas', 'Perfis e permissões', 'Revisar acessos']) assert.ok(!menu.includes(antigo), antigo);
  assert.equal(await p.locator('.cabeca h1').innerText(), 'Pessoas');
  assert.deepEqual(await abas(p), ['Pessoas', 'Áreas', 'Grupos', 'Perfis', 'Quem cria Quick Wins']);
  const ativa = p.locator('[role=tab][aria-selected=true]');
  assert.equal(await ativa.innerText(), 'Pessoas');
  assert.equal(await p.locator('[role=tabpanel]').getAttribute('aria-labelledby'), await ativa.getAttribute('id'));
  assert.equal(await p.getByRole('heading', { level: 2, name: 'Pessoas com acesso' }).count(), 1);
  const linha = p.locator('.lx-linha', { hasText: 'Marina Souza' });
  const texto = await linha.innerText();
  for (const t of ['Membro', 'Operações', 'Analistas', 'Convidado', 'Revisão pendente']) assert.match(texto, new RegExp(t));
  // Filtros: perfil, situação, área e revisão pendente.
  await p.selectOption('#lx-perfil', 'Gestor');
  assert.deepEqual(await p.locator('.lx-linha .lx-nome b').allInnerTexts(), ['Gil Gestor']);
  await p.selectOption('#lx-perfil', '');
  await p.selectOption('#lx-area', String(area.id));
  assert.deepEqual(await p.locator('.lx-linha .lx-nome b').allInnerTexts(), ['Marina Souza']);
  await p.selectOption('#lx-area', 'todas');
  await p.selectOption('#lx-status', 'inativo');
  assert.equal(await p.locator('.lx-linha').count(), 0);
  await p.selectOption('#lx-status', '');
  // Teclado nas abas: seta para a direita vai para Áreas e o foco fica na aba.
  await ativa.focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => location.hash === '#/pessoas/areas');
  await p.waitForFunction(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.textContent === 'Áreas');
  await p.keyboard.press('ArrowLeft');
  await p.waitForFunction(() => location.hash === '#/pessoas');
  assert.deepEqual(p.erros, []);
});

test('detalhe da pessoa: perfil, situação, áreas (responsável e base), grupos, Quick Wins e revisão; Esc fecha e devolve o foco', async () => {
  const p = await pagina(admin);
  await abrir(p, 'pessoas');
  await p.locator('.lx-linha', { hasText: 'Marina Souza' }).click();
  const painel = p.getByRole('dialog');
  await painel.waitFor();
  assert.equal(await painel.getAttribute('aria-modal'), 'true');
  assert.ok(await p.evaluate(() => !!document.activeElement.closest('[role=dialog]')), 'foco dentro do painel');
  assert.equal(await painel.locator('h2#px-titulo').innerText(), 'Marina Souza');
  assert.equal(await p.locator('#px-perfil option:checked').innerText(), 'Membro');
  assert.match(await painel.innerText(), /Convidado/);
  assert.equal(await painel.locator(`[data-area="${area.id}"] [data-v="admin"]`).getAttribute('aria-checked'), 'true');
  assert.equal(await painel.locator(`[data-resp="${area.id}"]`).getAttribute('aria-checked'), 'true');
  assert.equal(await painel.locator(`[data-grupo="${grupo.id}"]`).getAttribute('aria-checked'), 'true');
  assert.match(await painel.locator('.px-itens').innerText(), /Nas áreas: Operações/);
  assert.match(await painel.locator('#px-revisao').innerText(), /Ainda não revisado[\s\S]*Registrar revisão|Revisão pendente/);
  const remover = painel.getByRole('button', { name: 'Remover Marina Souza' });
  assert.match(await remover.getAttribute('class'), /btn-perigo/);
  assert.equal(await p.locator('h1, h2, h3').evaluateAll(hs => hs.filter(h => h.closest('[role=dialog]')).map(h => h.tagName).join(' ')).then(t => /^H2( H3)+$/.test(t)), true, 'títulos do painel: h2 e depois h3');
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });
  assert.equal(await p.evaluate(() => document.activeElement.closest('.lx-linha')?.innerText.includes('Marina Souza')), true);
  assert.deepEqual(p.erros, []);
});

test('pelo detalhe: trocar o perfil, registrar a revisão e cancelar a remoção, sempre no modal próprio', async () => {
  const p = await pagina(admin);
  await abrir(p, 'pessoas');
  await p.locator('.lx-linha', { hasText: 'Marina Souza' }).click();
  await p.selectOption('#px-perfil', 'role_manager');
  const conf = p.locator('.adm-confirmar [role=dialog]');
  await conf.waitFor();
  assert.match(await conf.innerText(), /Mudar o perfil de Marina Souza para Gestor\?/);
  await conf.getByRole('button', { name: 'Mudar para Gestor' }).click();
  await p.locator('#px-estado.ok').waitFor();
  assert.equal((await usuarioPorEmail('marina@pes.test')).role_key, 'manager');
  assert.equal(await p.locator('#px-perfil option:checked').innerText(), 'Gestor');
  // Revisão: exige a nota e a conferência marcada; depois some de "Revisão pendente".
  await p.fill('#px-rev-nota', 'Conferi área, base e grupo');
  await p.check('#px-rev-ok');
  await p.getByRole('button', { name: 'Registrar revisão' }).click();
  await p.locator('#px-rev-ultima', { hasText: 'Última revisão em' }).waitFor();
  assert.match(await p.locator('#px-rev-ultima').innerText(), /Conferi área, base e grupo/);
  const rev = (await admin.get('/api/acompanhamento/acessos')).dados.pessoas.find(x => x.id === marina.id);
  assert.equal(rev.pendente, false);
  assert.equal(rev.revisao.observacao, 'Conferi área, base e grupo');
  // Remover: perigo, confirmação com nome e consequência; cancelar não remove.
  await p.getByRole('button', { name: 'Remover Marina Souza' }).click();
  await conf.waitFor();
  assert.match(await conf.innerText(), /Remover Marina Souza da empresa\?[\s\S]*histórico dela continua/);
  await conf.getByRole('button', { name: 'Cancelar' }).click();
  await conf.waitFor({ state: 'detached' });
  assert.ok(await usuarioPorEmail('marina@pes.test'), 'cancelar não remove');
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  await p.check('#lx-revisao');
  assert.equal(await p.locator('.lx-linha', { hasText: 'Marina Souza' }).count(), 0, 'revisada: sai do filtro Revisão pendente');
  // De volta ao perfil de antes, para os outros testes.
  await admin.put(`/api/empresa/usuarios/${(await usuarioPorEmail('marina@pes.test')).id}`, { role_id: 'role_member' });
  assert.deepEqual(p.erros, []);
});

test('abas por permissão: Gestor vê Pessoas, Áreas e Grupos, só para consulta; Leitor não vê a tela', async () => {
  const p = await pagina(gestor);
  await abrir(p, 'pessoas');
  assert.deepEqual(await abas(p), ['Pessoas', 'Áreas', 'Grupos']);
  assert.equal(await p.locator('#lx-novo').count(), 0, 'sem Convidar pessoa (sem user.create)');
  await p.locator('.lx-linha', { hasText: 'Marina Souza' }).click();
  const painel = p.getByRole('dialog');
  await painel.waitFor();
  assert.equal(await p.locator('#px-perfil').count(), 0, 'sem trocar perfil');
  assert.equal(await p.locator('#px-revisar').count(), 0, 'sem registrar revisão');
  assert.equal(await painel.getByRole('button', { name: /Remover|Desativar/ }).count(), 0);
  assert.equal(await painel.locator(`[data-grupo="${grupo.id}"]`).isDisabled(), true, 'vínculos só para consulta');
  assert.match(await painel.innerText(), /Operações[\s\S]*Analistas/);
  await p.keyboard.press('Escape');
  // Aba sem permissão: volta para a primeira que pode ver.
  await p.goto(`${S.base}/app#/pessoas/perfis`);
  await p.waitForFunction(() => location.hash === '#/pessoas');
  await p.goto(`${S.base}/app#/pessoas/criacao`);
  await p.waitForFunction(() => location.hash === '#/pessoas');
  assert.deepEqual(p.erros, []);

  const l = await pagina(leitor);
  await l.goto(`${S.base}/app#/nova`);
  await l.waitForSelector('#lateral .item-lat');
  assert.equal(await l.locator('#lateral a.item-lat', { hasText: 'Pessoas' }).count(), 0);
  await l.goto(`${S.base}/app#/pessoas`);
  await l.waitForFunction(() => location.hash === '#/nova');
  assert.equal(await l.locator('[role=tablist]').count(), 0);
  assert.deepEqual(l.erros, []);
});

test('endereços antigos levam à aba equivalente, sem rastro no histórico', async () => {
  const p = await pagina(admin);
  const casos = [['empresa/usuarios', '#/pessoas'], ['empresa/roles', '#/pessoas/perfis'], ['revisao-acessos', '#/pessoas?revisao=pendente'], ['pessoas/pessoas', '#/pessoas'], [`pessoas?area=${area.id}`, `#/pessoas/areas?area=${area.id}`]];
  for (const [antigo, novo] of casos) {
    await abrir(p, 'visao-geral');
    await p.evaluate(h => { location.hash = h; }, `#/${antigo}`);
    await p.waitForFunction(h => location.hash === h, novo);
    await p.waitForSelector('[role=tab][aria-selected=true]');
    await p.goBack();
    await p.waitForFunction(() => location.hash === '#/visao-geral' && document.querySelector('.cabeca h1')?.textContent === 'Visão geral' && !document.querySelector('#principal').hasAttribute('aria-busy'));
  }
  await p.goto(`${S.base}/app#/revisao-acessos`);
  await p.waitForFunction(() => location.hash === '#/pessoas?revisao=pendente');
  await p.waitForSelector('#lx-revisao');
  assert.equal(await p.locator('#lx-revisao').isChecked(), true, 'Revisar acessos abre com o filtro Revisão pendente');
  await abrir(p, 'empresa/roles');
  await p.getByRole('heading', { level: 2, name: /Pessoas com acesso/ }).waitFor({ state: 'detached' });
  assert.equal(await p.locator('[role=tab][aria-selected=true]').innerText(), 'Perfis');
  await p.locator('#conteudo .chip').first().waitFor();
  // O convite de antes (?convidar=1) abre o painel de convite, com o foco no email.
  await p.goto(`${S.base}/app#/empresa/usuarios?convidar=1`);
  await p.waitForFunction(() => location.hash === '#/pessoas?convidar=1');
  await p.waitForSelector('#cv-email');
  await p.waitForFunction(() => document.activeElement?.id === 'cv-email');
  await p.fill('#cv-email', 'nova@pes.test'); await p.fill('#cv-nome', 'Nora Nova');
  await p.getByRole('button', { name: 'Enviar convite' }).click();
  await p.getByRole('dialog').locator('h2#px-titulo', { hasText: 'Nora Nova' }).waitFor();
  assert.equal((await usuarioPorEmail('nova@pes.test')).role_key, 'member');
  // Links internos já apontam para os endereços novos.
  const pend = (await admin.get('/api/acompanhamento')).dados;
  assert.equal(pend.passos.find(x => x.id === 'pessoas').href, '#/pessoas');
  assert.ok(pend.pendencias.filter(x => x.tipo === 'acessos').every(x => x.href === '#/pessoas?revisao=pendente'));
  assert.deepEqual(p.erros, []);
});

test('celular: abas cabem e quebram linha, painel em tela cheia com Fechar, alvos de 44 px e sem rolagem lateral', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await abrir(p, 'pessoas');
  const m = await p.evaluate(() => ({
    hs: document.documentElement.scrollWidth > innerWidth,
    abas: [...document.querySelectorAll('[role=tab]')].map(a => { const r = a.getBoundingClientRect(); return { dentro: r.left >= 0 && r.right <= innerWidth, altura: r.height }; }),
    novo: document.getElementById('lx-novo').getBoundingClientRect().height,
    filtros: [...document.querySelectorAll('.lx-ferramentas select, #lx-q')].map(e => e.getBoundingClientRect().height),
    revisao: document.querySelector('.lx-marca').getBoundingClientRect().height,
  }));
  assert.equal(m.hs, false, 'sem rolagem horizontal');
  assert.ok(m.abas.every(a => a.dentro && a.altura >= 44), JSON.stringify(m.abas));
  assert.ok(m.novo >= 44 && m.revisao >= 44 && m.filtros.every(h => h >= 44), JSON.stringify(m));
  await p.locator('.lx-linha', { hasText: 'Marina Souza' }).click();
  const painel = p.getByRole('dialog');
  await painel.waitFor();
  await p.waitForFunction(() => document.querySelector('.px').getAnimations().every(a => a.playState === 'finished'));
  const caixa = await p.locator('.px').boundingBox();
  assert.ok(caixa.x <= 0.5 && Math.abs(caixa.width - 390) < 1, JSON.stringify(caixa));
  const fechar = painel.getByRole('button', { name: /Fechar/ });
  assert.equal(await fechar.innerText(), 'Fechar');
  assert.ok((await fechar.boundingBox()).height >= 44);
  assert.equal(await p.evaluate(() => document.querySelector('.px-corpo').scrollWidth <= document.querySelector('.px-corpo').clientWidth + 1), true);
  await fechar.click();
  await painel.waitFor({ state: 'detached' });
  for (const rota of ['pessoas/areas', 'pessoas/grupos', 'pessoas/perfis', 'pessoas/criacao']) {
    await abrir(p, rota);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, rota);
  }
  assert.deepEqual(p.erros, []);
});

test('instalação única: a tela Pessoas funciona com as pessoas da instalação e as abas que existem lá', async () => {
  const N = await subirComNavegador();
  try {
    const a = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
    const ar = (await a.post('/api/admin/areas', { nome: 'Financeiro' })).dados;
    const pid = (await a.post('/api/admin/pessoas', { nome: 'Rui Local', email: 'rui@empresa-exemplo.com.br', areas: [{ id: ar.id, adminBase: true }] })).dados.id;
    const k = a.cookie.indexOf('=');
    await N.contexto.addCookies([{ name: a.cookie.slice(0, k), value: a.cookie.slice(k + 1), url: N.base }]);
    const p = await N.contexto.newPage(); const erros = [];
    p.on('pageerror', e => erros.push(e.message)); p.on('dialog', d => { erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
    await p.goto(`${N.base}/app#/pessoas`);
    await p.waitForSelector('.lx-linha');
    assert.deepEqual(await p.locator('[role=tab]').allInnerTexts(), ['Pessoas', 'Áreas', 'Grupos', 'Quem cria Quick Wins']);
    assert.equal(await p.locator('#lx-novo').innerText().then(t => t.replace(/C$/, '').trim()), 'Nova pessoa');
    await p.locator('.lx-linha', { hasText: 'Rui Local' }).click();
    const painel = p.getByRole('dialog');
    await painel.waitFor();
    assert.equal(await painel.locator('[data-campo="papel"] [data-v="usuario"]').getAttribute('aria-checked'), 'true');
    assert.equal(await painel.locator(`[data-area="${ar.id}"] [data-v="admin"]`).getAttribute('aria-checked'), 'true');
    await p.fill('#px-rev-nota', 'Conferi a base do Financeiro');
    await p.check('#px-rev-ok');
    await painel.getByRole('button', { name: 'Registrar revisão' }).click();
    await p.locator('#px-rev-ultima', { hasText: 'Última revisão em' }).waitFor();
    assert.equal((await a.get('/api/acompanhamento/acessos')).dados.pessoas.find(x => x.id === pid).pendente, false);
    await p.keyboard.press('Escape');
    await p.goto(`${N.base}/app#/pessoas?area=${ar.id}`);
    await p.waitForFunction(id => location.hash === `#/pessoas/areas?area=${id}`, ar.id);
    await p.getByRole('dialog').locator('#px-titulo').waitFor();
    assert.equal(await p.locator('#px-titulo').inputValue(), 'Financeiro');
    assert.deepEqual(erros, []);
  } finally { await N.fechar(); }
});
