// "Caminho claro" no console da plataforma, em 1366 e 390 px: em cada tela, uma ação principal na primeira vista
// (nenhuma nas telas só de leitura), poucos controles na primeira vista (12; 15 nos formulários), no máximo um aviso e
// nenhum <details> de explicação. E o que saiu da primeira vista continua alcançável: "Mais ações", "Saiba mais",
// formulários em modal, áreas que abrem sob pedido e as abas das Configurações. Dados fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, emp, team;
const u = () => new URL(S.base);

before(async () => {
  S = await subirPlataforma({ paginaInicial: 'vendas' });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  team = planos.find(x => x.name === 'GreenIA Team');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Exemplo', slug: 'exemplo', status: 'ativa', plan_id: team.id, admin_email: 'admin@empresa-exemplo.com.br' })).dados;
  await ops.post('/api/plataforma/empresas', { name: 'Comercial Beta', slug: 'beta', status: 'implantacao', plan_id: planos.find(x => x.name === 'GreenIA Starter').id, admin_email: 'ana@beta.com.br' });
  for (const [email, name] of [['marina@empresa-exemplo.com.br', 'Marina Costa'], ['rafael@empresa-exemplo.com.br', 'Rafael Nunes']]) await ops.post(`/api/plataforma/empresas/${emp.id}/usuarios`, { email, name, role_id: 'role_member' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

async function pagina({ width = 1366, height = 768 } = {}) {
  const movel = width < 700;
  const ctx = await nav.newContext({ viewport: { width, height }, isMobile: movel, hasTouch: movel, reducedMotion: 'reduce' });
  await ctx.route(x => !x.href.startsWith(S.base), r => r.abort());
  await ctx.addCookies([...ops.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.nativos = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.nativos.push(d.message()); d.dismiss(); });
  return p;
}
async function abrir(p, rota) {
  await p.goto(`${S.base}/plataforma#/${rota}`);
  await p.waitForFunction(() => document.querySelector('.pagina-dentro') && !document.querySelector('.pagina-dentro > .esqueleto, #aba > .esqueleto'));
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(250);
}

// A mesma medida da varredura de UX: dentro do conteúdo principal (sem a lateral), o que está visível e começa acima
// da dobra. Ação principal = botão verde. Aviso = faixa de aviso. <details> de conteúdo (blocos do editor da página de
// apresentação e o detalhe de cada registro da auditoria) são listados à parte; os outros contam como explicação.
function medir() {
  const main = document.querySelector('#principal');
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden],.oculto,.sr,#lateral,.lateral'); };
  const dobra = e => e.getBoundingClientRect().top < innerHeight;
  const q = s => [...main.querySelectorAll(s)].filter(vis);
  const primarios = q('.btn-verde, .btn-primario, button.cartao, a.btn-verde');
  return {
    primariosDobra: primarios.filter(dobra).length, rotulos: primarios.filter(dobra).map(b => b.innerText.trim()),
    interativosDobra: q('a[href], button, select, input:not([type=hidden]), textarea, summary').filter(dobra).length,
    avisos: q('.faixa-aviso, .aviso, .callout, .caixa-ajuda, .dica-caixa, .comece').length,
    detalhesExplicacao: q('details').filter(d => !d.matches('.ld-bloco, .aud-detalhe')).length,
    rolagem: document.documentElement.scrollWidth > innerWidth + 1,
    // No celular: ação principal, "Mais ações" e "Saiba mais" com alvo de toque de 44 px.
    alvosPequenos: innerWidth < 700 ? q('.cabeca-acoes .btn, .plat-menu > button').filter(b => b.getBoundingClientRect().height < 44).map(b => b.innerText.trim()) : [],
  };
}

const FORM = 15, TELA = 12;
// [tela, rota, ações principais na primeira vista, controles na primeira vista]
const telas = () => [
  ['empresas', 'empresas', 1, TELA],
  ['empresa/resumo', `empresas/${emp.id}/resumo`, 1, TELA],
  ['empresa/usuários', `empresas/${emp.id}/usuarios`, 1, TELA],
  ['empresa/marca', `empresas/${emp.id}/marca`, 1, FORM],
  // Editor compartilhado com o admin da empresa: sete abas, as duas prévias e o primeiro bloco aberto somam 16.
  ['empresa/página de apresentação', `empresas/${emp.id}/landing`, 1, FORM + 1],
  ['empresa/url', `empresas/${emp.id}/url`, 1, FORM],
  ['empresa/permissões', `empresas/${emp.id}/permissoes`, 1, FORM],
  ['empresa/auditoria', `empresas/${emp.id}/auditoria`, 0, TELA],
  ['encerramentos', 'encerramentos', 0, TELA],
  ['usuários', 'usuarios', 1, TELA],
  ['planos', 'planos', 1, TELA],
  ['plano', `planos/${team.id}`, 1, FORM],
  ['plano novo', 'planos/novo', 1, FORM],
  ['ambientes', 'ambientes', 0, TELA],
  ['uso', 'uso', 1, TELA],
  ['auditoria', 'auditoria', 0, TELA],
  ['configurações', 'configuracoes', 1, FORM],
  ['configurações/dados sigilosos', 'configuracoes/sigilo', 1, TELA],
  ['configurações/contatos', 'configuracoes/contatos', 0, TELA],
];

for (const [width, height] of [[1366, 768], [390, 844]]) {
  test(`metas do caminho claro em ${width} px: uma ação principal, poucos controles, um aviso no máximo`, async () => {
    const p = await pagina({ width, height });
    const falhas = [];
    for (const [nome, rota, primarios, limite] of telas()) {
      await abrir(p, rota);
      const m = await p.evaluate(medir);
      if (m.primariosDobra !== primarios) falhas.push(`${nome}: ${m.primariosDobra} ações principais na primeira vista (${m.rotulos.join(' | ')}), esperado ${primarios}`);
      if (m.interativosDobra > limite) falhas.push(`${nome}: ${m.interativosDobra} controles na primeira vista (máximo ${limite})`);
      if (m.avisos > 1) falhas.push(`${nome}: ${m.avisos} avisos`);
      if (m.detalhesExplicacao) falhas.push(`${nome}: ${m.detalhesExplicacao} <details> de explicação`);
      if (m.rolagem) falhas.push(`${nome}: rolagem horizontal`);
      if (m.alvosPequenos.length) falhas.push(`${nome}: alvos de toque abaixo de 44 px (${m.alvosPequenos.join(', ')})`);
    }
    assert.deepEqual(falhas, []);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });
}

test('Resumo: ações raras em "Mais ações" (teclado e Esc), dados cadastrais em modal e encerrar à parte', async () => {
  const p = await pagina();
  await abrir(p, `empresas/${emp.id}/resumo`);
  const mais = p.getByRole('button', { name: 'Mais ações' });
  await mais.click();
  assert.equal(await mais.getAttribute('aria-expanded'), 'true');
  const itens = await p.getByRole('menuitem').allInnerTexts();
  assert.deepEqual(itens.map(t => t.trim()), ['Alterar plano…', 'Liberar Capacity Pack…', 'Editar dados cadastrais…', 'Exportar dados…', 'Suspender ambiente…']);
  // O foco vai para o primeiro item; seta para baixo anda; Esc fecha e devolve o foco ao botão.
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Alterar plano…');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Liberar Capacity Pack…');
  await p.keyboard.press('Escape');
  assert.equal(await mais.getAttribute('aria-expanded'), 'false');
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Mais ações');
  // Dados cadastrais: lidos na tela, alterados no modal.
  await mais.click();
  await p.getByRole('menuitem', { name: 'Editar dados cadastrais…' }).click();
  const dialogo = p.getByRole('dialog');
  await dialogo.getByLabel('Razão social').fill('Empresa Exemplo Ltda.');
  await dialogo.getByRole('button', { name: 'Salvar dados' }).click();
  await dialogo.waitFor({ state: 'detached' });
  await p.locator('.plat-dados', { hasText: 'Empresa Exemplo Ltda.' }).waitFor();
  assert.equal((await ops.get(`/api/plataforma/empresas/${emp.id}`)).dados.empresa.legal_name, 'Empresa Exemplo Ltda.');
  // Uma ação principal no cabeçalho (ambiente ativo: entrar) e o encerrar como ação de perigo, separada, no fim.
  assert.deepEqual(await p.locator('.cabeca-acoes .btn-verde').allInnerTexts(), ['Entrar no ambiente']);
  const encerrar = p.getByRole('button', { name: 'Encerrar ambiente…' });
  assert.match(await encerrar.getAttribute('class'), /btn-perigo/);
  assert.equal(await p.locator('.plat-perigo').getByRole('button', { name: 'Encerrar ambiente…' }).count(), 1);
  // Ambiente em implantação: a ação principal é publicar.
  const beta = (await ops.get('/api/plataforma/empresas')).dados.empresas.find(e => e.slug === 'beta');
  await abrir(p, `empresas/${beta.id}/resumo`);
  assert.deepEqual(await p.locator('.cabeca-acoes .btn-verde').allInnerTexts(), ['Publicar ambiente']);
  assert.deepEqual(p.nativos, []);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('"Saiba mais" abre a ajuda da tela com a explicação que saiu da primeira vista', async () => {
  const p = await pagina();
  await abrir(p, 'planos');
  assert.doesNotMatch(await p.locator('#principal').innerText(), /Margem total no pior caso: a empresa usa toda a franquia/);
  await p.getByRole('button', { name: 'Saiba mais' }).click();
  const ajuda = p.getByRole('dialog');
  await ajuda.getByRole('heading', { name: 'Planos e margem' }).waitFor();
  assert.match(await ajuda.innerText(), /Margem total no pior caso: a empresa usa toda a franquia e toda a reserva/);
  assert.match(await ajuda.innerText(), /Piso \d+,\d%: abaixo disso o plano não é salvo/);
  await p.keyboard.press('Escape');
  await ajuda.waitFor({ state: 'detached' });
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Saiba mais', 'o foco volta ao link');
  // Premissas econômicas: fechadas até a pessoa pedir.
  const premissas = p.locator('#f-premissas');
  assert.equal(await premissas.isVisible(), false);
  await p.getByRole('button', { name: 'Ver e alterar' }).click();
  assert.equal(await premissas.isVisible(), true);
  assert.equal(await p.getByRole('button', { name: 'Ver e alterar' }).getAttribute('aria-expanded'), 'true');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('Uso, Marca e Configurações: ajustes raros em modal, bloqueios da marca sob pedido e três abas', async () => {
  const p = await pagina();
  // Uso: alerta de saldo em "Mais ações", num modal com rótulo visível.
  await abrir(p, 'uso');
  await p.getByRole('button', { name: 'Mais ações' }).click();
  await p.getByRole('menuitem', { name: 'Alerta de saldo…' }).click();
  await p.getByRole('dialog').getByLabel('Valor em dólares (US$)').fill('35');
  await p.getByRole('dialog').getByRole('button', { name: 'Salvar alerta' }).click();
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal((await ops.get('/api/plataforma/consumo')).dados.alerta.limiarUsd, 35);
  // Marca: "bloquear para a empresa" só aparece ao pedir; o salvar do cabeçalho grava o bloqueio.
  await abrir(p, `empresas/${emp.id}/marca`);
  const trava = p.locator('[data-bloqueio="logo"]');
  assert.equal(await trava.isVisible(), false);
  await p.getByRole('button', { name: 'Escolher itens bloqueados' }).click();
  await trava.check();
  await p.locator('.cabeca-acoes').getByRole('button', { name: 'Salvar identidade visual' }).click();
  await p.locator('.toast', { hasText: 'Identidade visual salva.' }).waitFor();
  await p.waitForFunction(() => /Bloqueados para a empresa: Logomarca/.test(document.querySelector('#mk-bloq-estado')?.textContent || ''));
  assert.deepEqual((await ops.get(`/api/plataforma/empresas/${emp.id}`)).dados.marca.locked, ['logo']);
  // Configurações: Geral, Dados sigilosos e Contatos; uma ação verde por aba.
  await abrir(p, 'configuracoes');
  assert.deepEqual(await p.locator('.subnav a').allInnerTexts(), ['Geral', 'Dados sigilosos', 'Contatos']);
  assert.deepEqual(await p.locator('#principal .btn-verde').allInnerTexts(), ['Salvar configurações']);
  await p.getByRole('link', { name: 'Dados sigilosos' }).click();
  await p.getByRole('heading', { name: 'Modelos autorizados' }).waitFor();
  assert.deepEqual(await p.locator('#principal .btn-verde').allInnerTexts(), ['Autorizar modelo']);
  await p.getByRole('button', { name: 'Autorizar modelo' }).click();
  await p.getByRole('dialog').getByLabel('Modelo no OpenRouter').waitFor();
  await p.keyboard.press('Escape');
  await p.getByRole('link', { name: 'Contatos' }).click();
  await p.getByText('Nenhum contato ainda').waitFor();
  assert.deepEqual(p.nativos, []);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('Usuários da empresa: adicionar pela ação principal, alterar perfil numa só ação por linha', async () => {
  const p = await pagina({ width: 390, height: 844 });
  await abrir(p, `empresas/${emp.id}/usuarios`);
  await p.getByRole('button', { name: 'Adicionar pessoa' }).click();
  const d = p.getByRole('dialog');
  await d.getByLabel('Email').fill('caio@empresa-exemplo.com.br');
  await d.getByLabel('Nome').fill('Caio Prado');
  await d.getByLabel('Perfil').selectOption('role_member');
  await d.getByRole('button', { name: 'Adicionar e convidar' }).click();
  await p.locator('tr', { hasText: 'Caio Prado' }).waitFor();
  // Uma ação por linha.
  assert.equal(await p.locator('tr', { hasText: 'Caio Prado' }).getByRole('button').count(), 1);
  await p.getByRole('button', { name: 'Alterar o acesso de Caio Prado' }).click();
  await p.getByRole('dialog').getByLabel('Perfil').selectOption('role_manager');
  await p.getByRole('dialog').getByRole('button', { name: 'Salvar alterações' }).click();
  await p.locator('tr', { hasText: 'Caio Prado' }).getByText('Gestor').waitFor();
  assert.deepEqual(p.erros, []);
  await p.context().close();
});
