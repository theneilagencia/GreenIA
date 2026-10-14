// Editor da página de apresentação (console e administração da empresa) no padrão dos construtores do Claude e do
// ChatGPT: seções fechadas com resumo, uma aberta por vez, prévia ao vivo ao lado sem salvar, "Ver como fica" no
// celular, ações raras em "Mais ações" e o salvar desligado ("Sem alterações") até algo mudar. No console, a empresa
// tem cinco abas (Marca e endereço com subabas, endereços antigos continuam valendo) e as permissões concedidas
// gravam na hora, voltando ao que eram se o servidor recusar. Dados fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, admin, emp;
const u = () => new URL(S.base);

before(async () => {
  S = await subirPlataforma({ paginaInicial: 'vendas' });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Exemplo', slug: 'exemplo', status: 'ativa', plan_id: planos.find(x => x.name === 'GreenIA Team').id, admin_email: 'admin@empresa-exemplo.com.br' })).dados;
  admin = S.navegador(); await admin.get('/exemplo'); await admin.entrarEmpresa('admin@empresa-exemplo.com.br');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

async function pagina(sessao, { width = 1366, height = 768, colorScheme = 'light' } = {}) {
  const movel = width < 700;
  const ctx = await nav.newContext({ viewport: { width, height }, isMobile: movel, hasTouch: movel, reducedMotion: 'reduce', colorScheme });
  await ctx.route(x => !x.href.startsWith(S.base), r => r.abort());
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.nativos = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.nativos.push(d.message()); d.dismiss(); });
  return p;
}
const rotaConsole = (aba = 'marca-e-endereco/landing') => `${S.base}/plataforma#/empresas/${emp.id}/${aba}`;
async function abrirEditor(p, ehConsole) {
  await p.goto(ehConsole ? rotaConsole() : `${S.base}/app#/empresa/landing`);
  await p.locator('#form-landing').waitFor();
  await p.waitForLoadState('networkidle').catch(() => {});
}
const tituloNaPrevia = p => p.evaluate(() => document.getElementById('ld-previa-quadro')?.contentDocument?.getElementById('ld-titulo')?.textContent || null);
const salvoNoServidor = async () => (await admin.get('/api/empresa/landing')).dados.landing;

// A mesma medida da varredura de UX (scratchpad/caminho/varredura.mjs e qa-caminho-*.test.js).
function medir() {
  const main = document.querySelector('#principal');
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden],.oculto,.sr,#lateral,.lateral'); };
  const dobra = e => e.getBoundingClientRect().top < innerHeight;
  const q = s => [...main.querySelectorAll(s)].filter(vis);
  return {
    primariosDobra: q('.btn-verde, .btn-primario, button.cartao, a.btn-verde').filter(dobra).length,
    interativosDobra: q('a[href], button, select, input:not([type=hidden]), textarea, summary').filter(dobra).length,
    avisos: q('.faixa-aviso, .aviso, .callout, .caixa-ajuda, .dica-caixa, .comece').length,
    rolagem: document.documentElement.scrollWidth > innerWidth + 1,
  };
}

for (const [onde, ehConsole] of [['console', true], ['administração', false]]) {
  test(`${onde}: prévia ao lado atualiza enquanto a pessoa digita, sem salvar; salvar desligado até mudar algo`, async () => {
    const p = await pagina(ehConsole ? ops : admin);
    await abrirEditor(p, ehConsole);
    const antes = await salvoNoServidor();
    // Tela larga: editor e prévia lado a lado, com o cabeçalho "Prévia — não salva" e o "Abrir em nova aba".
    assert.equal(await p.locator('.ld-split').evaluate(e => e.classList.contains('dividido')), true);
    assert.equal(await p.locator('#ld-previa-titulo').innerText(), 'Prévia — não salva');
    assert.equal(await p.locator('#ld-previa-quadro').getAttribute('title'), 'Prévia da página de apresentação');
    await p.getByRole('button', { name: 'Abrir a prévia em nova aba' }).waitFor();
    await p.waitForFunction(t => document.getElementById('ld-previa-quadro')?.contentDocument?.getElementById('ld-titulo')?.textContent === t, antes.content.titulo);
    // Sem alterações: o salvar está desligado e diz por quê; "Ver como fica" não aparece em tela larga.
    const salvar = p.locator('[data-acao="salvar"][form="form-landing"]');
    assert.equal(await salvar.isDisabled(), true);
    assert.equal(await salvar.innerText(), 'Sem alterações');
    assert.equal(await p.locator('[data-acao="ver-previa"]').isVisible(), false);
    // Digitar muda a prévia (com a mesma validação do servidor) e liga o salvar, sem gravar nada.
    await p.locator('#ld-cab-topo').click();
    const novo = `Nosso assistente de IA (${onde})`;
    await p.fill('#ld-titulo', novo);
    await p.waitForFunction(t => document.getElementById('ld-previa-quadro')?.contentDocument?.getElementById('ld-titulo')?.textContent === t, novo);
    assert.equal(await salvar.isEnabled(), true);
    assert.equal(await salvar.innerText(), 'Salvar e atualizar a página');
    assert.equal((await salvoNoServidor()).content.titulo, antes.content.titulo, 'a prévia não grava');
    // Resumo da seção acompanha o que foi digitado.
    await p.locator('#ld-cab-topo').click();
    assert.equal(await p.locator('[data-resumo="topo"]').innerText(), `Título: ${novo}`);
    // Os links da prévia não saem dela.
    const url = await p.evaluate(() => { const d = document.getElementById('ld-previa-quadro').contentDocument; d.querySelector('a[href="/entrar"]').click(); return document.getElementById('ld-previa-quadro').contentWindow.location.href; });
    assert.equal(url, 'about:srcdoc');
    // Salvar grava, avisa e volta para "Sem alterações".
    await salvar.click();
    if (!ehConsole) await p.getByRole('dialog').getByRole('button', { name: 'Salvar e atualizar', exact: true }).click();
    await p.locator('.toast', { hasText: 'Página de apresentação salva e já no ar.' }).waitFor();
    await p.locator('[data-acao="salvar"][form="form-landing"]', { hasText: 'Sem alterações' }).waitFor();
    assert.equal((await salvoNoServidor()).content.titulo, novo);
    await admin.put('/api/empresa/landing', { content: { titulo: antes.content.titulo } });
    assert.deepEqual(p.nativos, []);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });
}

test('seções: todas fechadas ao entrar, uma aberta por vez, resumo de uma linha e selo "Oculta" quando a seção some', async () => {
  const p = await pagina(admin);
  await abrirEditor(p, false);
  const botoes = p.locator('.ld-bloco-botao');
  assert.equal(await botoes.count(), 7);
  assert.deepEqual(await p.locator('.ld-bloco-nome').allInnerTexts(), ['Topo', 'Como usar', 'O que você encontra', 'Regras de dados', 'Boas tarefas', 'Institucional', 'Fechamento']);
  assert.deepEqual([...new Set(await botoes.evaluateAll(bs => bs.map(b => b.getAttribute('aria-expanded'))))], ['false']);
  assert.equal(await p.locator('.ld-corpo:not([hidden])').count(), 0);
  // Cada linha fechada diz o que tem.
  assert.equal(await p.locator('[data-resumo="topo"]').innerText(), 'Título: IA para o trabalho, com as regras da casa');
  assert.match(await p.locator('[data-resumo="como_usar"]').innerText(), /^Três passos para começar · 3 passos$/);
  assert.match(await p.locator('[data-resumo="regras"]').innerText(), /^\d+ pode usar · \d+ com sigilo · \d+ bloqueados$/);
  // Uma por vez: abrir outra fecha a anterior; a região aberta tem nome.
  await p.locator('#ld-cab-topo').click();
  assert.equal(await p.locator('#ld-cab-topo').getAttribute('aria-expanded'), 'true');
  assert.equal(await p.getByRole('region', { name: /^Topo/ }).count(), 1);
  // Botões do topo: lista compacta; os campos só ao pedir.
  assert.equal(await p.locator('#ld-botoes-lista').innerText(), 'Entrar com o email da empresa · Como usar');
  assert.equal(await p.locator('[data-botao-texto="0"]').isVisible(), false);
  await p.getByRole('button', { name: 'Editar botões' }).click();
  assert.equal(await p.locator('[data-botao-texto="0"]').isVisible(), true);
  await p.locator('#ld-cab-regras').click();
  assert.equal(await p.locator('#ld-cab-topo').getAttribute('aria-expanded'), 'false');
  assert.equal(await p.locator('#ld-corpo-topo').isVisible(), false);
  assert.equal(await p.locator('.ld-corpo:not([hidden])').count(), 1);
  // Clicar no título aberto fecha.
  await p.locator('#ld-cab-regras').click();
  assert.equal(await p.locator('.ld-corpo:not([hidden])').count(), 0);
  // Interruptor dentro da seção: ocultar mostra o selo na linha e some da prévia.
  await p.locator('#ld-cab-tarefas').click();
  const chave = p.getByRole('switch', { name: 'Mostrar a seção Boas tarefas na página' });
  assert.equal(await chave.getAttribute('aria-checked'), 'true');
  assert.equal(await p.locator('[data-bloco="tarefas"] .ld-selo-oculta').isVisible(), false);
  await chave.click();
  assert.equal(await chave.getAttribute('aria-checked'), 'false');
  assert.equal(await p.locator('[data-bloco="tarefas"] .ld-selo-oculta').innerText(), 'Oculta');
  await p.waitForFunction(() => document.getElementById('ld-previa-quadro')?.contentDocument?.getElementById('sec-tarefas')?.classList.contains('oculto'));
  // Teclado: Enter no título abre a seção.
  await p.locator('#ld-cab-fim').focus();
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#ld-cab-fim').getAttribute('aria-expanded'), 'true');
  assert.equal(await p.locator('#ld-cab-tarefas').getAttribute('aria-expanded'), 'false');
  assert.equal(await p.locator('[data-bloco="tarefas"] .ld-selo-oculta').isVisible(), true, 'o selo fica na linha fechada');
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('"Mais ações": página no ar, busca e compartilhamento, voltar para rascunho e restaurar o modelo, com confirmação', async () => {
  const p = await pagina(ops);
  await abrirEditor(p, true);
  const mais = p.locator('#ld-mais');
  assert.equal(await mais.getAttribute('aria-haspopup'), 'menu');
  await mais.click();
  assert.equal(await mais.getAttribute('aria-expanded'), 'true');
  assert.deepEqual((await p.locator('#ld-mais-lista [role=menuitem]').allInnerTexts()).map(t => t.trim()), ['Ver a página no ar', 'Busca e compartilhamento…', 'Voltar para rascunho…', 'Restaurar o modelo…']);
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Ver a página no ar');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Busca e compartilhamento…');
  await p.keyboard.press('Escape');
  assert.equal(await mais.getAttribute('aria-expanded'), 'false');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ld-mais');
  // Busca e compartilhamento: diálogo com os dois campos raros; muda o formulário (liga o salvar).
  await mais.click();
  await p.getByRole('menuitem', { name: 'Busca e compartilhamento…' }).click();
  const seo = p.getByRole('dialog', { name: 'Busca e compartilhamento' });
  await seo.getByLabel('Título da página').fill('IA da Empresa Exemplo');
  await seo.getByRole('button', { name: 'Pronto' }).click();
  await seo.waitFor({ state: 'hidden' });
  assert.equal(await p.locator('[data-acao="salvar"][form="form-landing"]').innerText(), 'Salvar e atualizar a página');
  // Restaurar o modelo (perigo): confirmação no modal; cancelar não muda nada.
  await mais.click();
  const restaurar = p.getByRole('menuitem', { name: 'Restaurar o modelo…' });
  assert.match(await restaurar.getAttribute('class'), /perigo/);
  await restaurar.click();
  await p.getByRole('dialog').getByRole('heading', { name: 'Restaurar os textos do modelo?' }).waitFor();
  assert.match(await p.getByRole('dialog').getByRole('button', { name: 'Restaurar o modelo' }).getAttribute('class'), /btn-perigo/);
  await p.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  // Voltar para rascunho: confirma antes; depois a ação principal vira "Publicar" e o selo, "Rascunho".
  await mais.click();
  await p.getByRole('menuitem', { name: 'Voltar para rascunho…' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Voltar para rascunho' }).click();
  await p.locator('.toast', { hasText: 'voltou para rascunho' }).waitFor();
  await p.locator('.cabeca-acoes [data-acao="publicar"]').waitFor();
  assert.equal((await salvoNoServidor()).status, 'rascunho');
  assert.match(await p.locator('.ld-estado').innerText(), /Rascunho/);
  assert.deepEqual(await p.locator('#principal .btn-verde:visible').allInnerTexts(), ['Publicar']);
  // Rascunho com alteração: "Salvar rascunho" aparece ao lado (sem ser a ação principal).
  assert.equal(await p.locator('[data-acao="salvar"][form="form-landing"]').isVisible(), false);
  await p.locator('#ld-cab-fim').click();
  await p.fill('#lt-fim_titulo', 'Comece agora');
  const rascunho = p.locator('[data-acao="salvar"][form="form-landing"]');
  assert.equal(await rascunho.innerText(), 'Salvar rascunho');
  assert.match(await rascunho.getAttribute('class'), /btn-linha/);
  // Publicar de novo.
  await p.locator('.cabeca-acoes [data-acao="publicar"]').click();
  await p.locator('.toast', { hasText: 'publicada' }).waitFor();
  const final = await salvoNoServidor();
  assert.equal(final.status, 'publicada');
  assert.equal(final.content.textos.fim_titulo, 'Comece agora');
  assert.equal(final.seo.title, 'IA da Empresa Exemplo');
  assert.deepEqual(p.nativos, []);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('celular: "Ver como fica" abre a prévia na tela inteira, Esc fecha e o foco volta', async () => {
  for (const [sessao, ehConsole] of [[admin, false], [ops, true]]) {
    const p = await pagina(sessao, { width: 390, height: 844 });
    await abrirEditor(p, ehConsole);
    assert.equal(await p.locator('.ld-split').evaluate(e => e.classList.contains('dividido')), false);
    assert.equal(await p.locator('#ld-previa').isVisible(), false);
    const ver = p.getByRole('button', { name: 'Ver como fica' });
    assert.ok((await ver.boundingBox()).height >= 44, 'alvo de toque de 44 px');
    await p.locator('#ld-cab-topo').click();
    await p.fill('#ld-titulo', 'Título visto no celular');
    await ver.click();
    const dialogo = p.getByRole('dialog', { name: /Prévia — não salva/ });
    await dialogo.waitFor();
    assert.equal(await p.locator('#ld-previa').evaluate(e => e.getAttribute('aria-modal')), 'true');
    const caixa = await p.locator('#ld-previa').boundingBox();
    assert.deepEqual([caixa.x, caixa.y, caixa.width], [0, 0, 390]);
    await p.waitForFunction(() => document.getElementById('ld-previa-quadro')?.contentDocument?.getElementById('ld-titulo')?.textContent === 'Título visto no celular');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'ld-previa-titulo');
    for (const b of ['Voltar ao editor', 'Abrir a prévia em nova aba']) assert.ok((await dialogo.getByRole('button', { name: b }).boundingBox()).height >= 44, b);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#ld-previa').isVisible(), false);
    assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Ver como fica');
    // Fechar pelo botão também.
    await ver.click();
    await dialogo.getByRole('button', { name: 'Voltar ao editor' }).click();
    assert.equal(await p.locator('#ld-previa').isVisible(), false);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  }
});

test('console: cinco abas, Marca e endereço com três subabas e os endereços antigos levando à subaba certa sem rastro', async () => {
  const p = await pagina(ops);
  await p.goto(rotaConsole('resumo'));
  await p.locator('.subnav a').first().waitFor();
  assert.deepEqual(await p.locator('nav.subnav:not(.subnav-2) a').allInnerTexts(), ['Resumo', 'Usuários', 'Marca e endereço', 'Permissões', 'Auditoria']);
  assert.equal(await p.locator('.subnav-2').count(), 0);
  await p.getByRole('link', { name: 'Marca e endereço' }).click();
  await p.locator('#form-marca').waitFor();
  assert.equal(new URL(p.url()).hash, `#/empresas/${emp.id}/marca-e-endereco/marca`);
  assert.deepEqual(await p.locator('.subnav-2 a').allInnerTexts(), ['Marca', 'Página de apresentação', 'URL e domínio']);
  assert.equal(await p.locator('.subnav-2 a[aria-current="page"]').innerText(), 'Marca');
  assert.equal(await p.locator('nav.subnav:not(.subnav-2) a[aria-current="page"]').innerText(), 'Marca e endereço');
  await p.getByRole('link', { name: 'URL e domínio' }).click();
  await p.locator('#f-url').waitFor();
  // Endereços antigos: trocam pelo novo sem criar entrada no histórico.
  for (const [antiga, nova, seletor] of [['marca', 'marca-e-endereco/marca', '#form-marca'], ['landing', 'marca-e-endereco/landing', '#form-landing'], ['url', 'marca-e-endereco/url', '#f-url'], ['marca-e-endereco', 'marca-e-endereco/marca', '#form-marca']]) {
    const tamanho = await p.evaluate(() => history.length);
    await p.evaluate(h => { location.hash = h; }, `#/empresas/${emp.id}/${antiga}`);
    await p.waitForFunction(h => location.hash === h, `#/empresas/${emp.id}/${nova}`);
    await p.locator(seletor).waitFor();
    assert.equal(await p.evaluate(() => history.length), tamanho + 1, `${antiga}: só uma entrada nova (a do clique), sem a do endereço antigo`);
  }
  // Permissões continua no mesmo endereço; o link dos bloqueios leva à subaba Marca.
  await p.goto(rotaConsole('permissoes'));
  await p.getByRole('link', { name: 'Alterar na aba Marca' }).click();
  await p.locator('#form-marca').waitFor();
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('console: permissões concedidas gravam ao ligar ou desligar, com "Salvo" e volta ao que era se o servidor recusar', async () => {
  const p = await pagina(ops);
  await p.goto(rotaConsole('permissoes'));
  const sw = p.getByRole('switch', { name: 'Perfis e permissões' });
  await sw.waitFor();
  assert.equal(await p.getByRole('button', { name: 'Salvar permissões' }).count(), 0, 'sem botão de salvar');
  assert.equal(await sw.getAttribute('aria-checked'), 'true');
  assert.equal(await p.locator('#conc-plano-roles').innerText(), 'Liberado e incluído no plano');
  // Desligar grava na hora (mesma API de antes) e avisa.
  const [req] = await Promise.all([p.waitForRequest(r => r.method() === 'PUT' && r.url().endsWith(`/empresas/${emp.id}/concessoes`)), sw.click()]);
  assert.equal(req.postDataJSON().grants.roles, false);
  await p.locator('.toast[role=status]', { hasText: 'Salvo' }).waitFor();
  await p.locator('#conc-plano-roles', { hasText: 'Não liberado' }).waitFor();
  assert.equal((await ops.get(`/api/plataforma/empresas/${emp.id}`)).dados.concessoes.roles, false);
  // A linha inteira também liga (alvo maior).
  await p.locator('.conc-item', { has: p.locator('#conc-nome-roles') }).locator('.conc-nome').click();
  await p.locator('#conc-plano-roles', { hasText: 'Liberado e incluído no plano' }).waitFor();
  assert.equal((await ops.get(`/api/plataforma/empresas/${emp.id}`)).dados.concessoes.roles, true);
  // Servidor recusa: o interruptor volta ao que era e o erro aparece.
  await p.route(`**/api/plataforma/empresas/${emp.id}/concessoes`, r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ erro: 'falha', mensagem: 'Falha simulada.' }) }));
  const dominio = p.getByRole('switch', { name: 'Domínio próprio' });
  const antes = await dominio.getAttribute('aria-checked');
  await dominio.click();
  await p.locator('.toast[role=alert]', { hasText: 'Não foi possível salvar Domínio próprio' }).waitFor();
  assert.equal(await dominio.getAttribute('aria-checked'), antes);
  assert.equal((await ops.get(`/api/plataforma/empresas/${emp.id}`)).dados.concessoes.domain, antes === 'true');
  // Textos do plano e o link dos bloqueios da marca continuam.
  assert.equal(await p.locator('#conc-plano-domain').innerText(), 'Liberado (vale em todos os planos)');
  await p.getByRole('link', { name: 'Alterar na aba Marca' }).waitFor();
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('administração sem a página liberada: editor travado, sem ações, prévia do que está salvo', async () => {
  const g = (await ops.get(`/api/plataforma/empresas/${emp.id}`)).dados.concessoes;
  await ops.put(`/api/plataforma/empresas/${emp.id}/concessoes`, { grants: { ...g, landing_page: false } });
  try {
    const p = await pagina(admin);
    await abrirEditor(p, false);
    await p.locator('.aviso-trava', { hasText: 'Edição travada.' }).waitFor();
    assert.equal(await p.locator('#ld-mais').count(), 0);
    assert.equal(await p.locator('#principal .btn-verde:visible').count(), 0);
    assert.equal(await p.locator('#ld-previa-titulo').innerText(), 'Prévia do que está salvo');
    assert.match(await p.getByRole('link', { name: 'Abrir a prévia em nova aba' }).getAttribute('href'), /previa=1/);
    await p.waitForFunction(() => !!document.getElementById('ld-previa-quadro')?.contentDocument?.getElementById('ld-titulo')?.textContent);
    await p.locator('#ld-cab-topo').click();
    assert.equal(await p.locator('#ld-titulo').isDisabled(), true);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  } finally { await ops.put(`/api/plataforma/empresas/${emp.id}/concessoes`, { grants: g }); }
});

// Metas do caminho claro nas três telas desta mudança: [ações principais, controles na primeira vista]. Permissões
// ficam em 12. Página de apresentação: no console, trilha + 5 abas + 3 subabas + "Mais ações" + salvar + "Abrir em
// nova aba" já somam 12 antes das sete seções (fechadas, uma linha cada); na administração, 3 abas + "Mais ações" +
// salvar + a prévia (ou "Ver como fica" e o menu no celular) + sete seções.
const METAS = {
  1366: { 'console/página de apresentação': [1, 19], 'console/permissões': [0, 12], 'admin/página de apresentação': [1, 13] },
  390: { 'console/página de apresentação': [1, 19], 'console/permissões': [0, 12], 'admin/página de apresentação': [1, 14] },
};
for (const [width, height] of [[1366, 768], [390, 844]]) {
  test(`metas em ${width} px: uma ação principal (nenhuma nas permissões), controles na primeira vista, um aviso no máximo`, async () => {
    const falhas = [];
    for (const [nome, sessao, rota] of [['console/página de apresentação', ops, rotaConsole()], ['console/permissões', ops, rotaConsole('permissoes')], ['admin/página de apresentação', admin, `${S.base}/app#/empresa/landing`]]) {
      for (const colorScheme of ['light', 'dark']) {
        const p = await pagina(sessao, { width, height, colorScheme });
        await p.goto(rota);
        await p.locator('#form-landing, .conc-lista').first().waitFor();
        await p.waitForLoadState('networkidle').catch(() => {});
        await p.waitForTimeout(300);
        const m = await p.evaluate(medir), [prim, max] = METAS[width][nome];
        if (m.primariosDobra !== prim) falhas.push(`${nome} ${colorScheme}: ${m.primariosDobra} ações principais (esperado ${prim})`);
        if (m.interativosDobra > max) falhas.push(`${nome} ${colorScheme}: ${m.interativosDobra} controles na primeira vista (máximo ${max})`);
        if (m.avisos > 1) falhas.push(`${nome} ${colorScheme}: ${m.avisos} avisos`);
        if (m.rolagem) falhas.push(`${nome} ${colorScheme}: rolagem horizontal`);
        if (p.erros.length) falhas.push(`${nome} ${colorScheme}: ${p.erros.join(' | ')}`);
        await p.context().close();
      }
    }
    assert.deepEqual(falhas, []);
  });
}
