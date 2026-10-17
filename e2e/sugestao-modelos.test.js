// Sugestão da GreenIA para os modelos, na tela, para um admin que não conhece modelos: em Políticas de IA, no lugar do
// aviso técnico, um cartão calmo com dois modelos de fabricantes diferentes, motivos simples e UM botão; "Aprovar a
// sugestão" → confirmação no modal da plataforma → modelos aprovados (API, banco e registro) → o aviso some. Em
// Modelos, a sugestão por nível; na Visão geral, o próximo passo leva ao mesmo fluxo. Quem não administra não chama a
// API. Tema escuro e celular (390 px) sem rolagem lateral. Com CAPTURAS_SUGESTAO=<pasta>, grava as capturas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { json, todos } from '../src/db.js';
import { lerConfig } from '../src/config.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const CAPTURAS = process.env.CAPTURAS_SUGESTAO || '';
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
const GOOGLE = 'google/gemini-3.5-flash-lite', ANTHROPIC = 'anthropic/claude-haiku-4.5', MISTRAL = 'mistralai/mistral-small';
let S, nav, ops, admin, membro, tenant;
const u = () => new URL(S.base);

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Escritório Sugestão', slug: 'escritorio-sugestao', status: 'ativa', admin_email: 'ana@sugestao.test' });
  admin = S.navegador(); await admin.get('/escritorio-sugestao'); await admin.entrarEmpresa('ana@sugestao.test');
  assert.equal((await admin.put('/api/admin/sigilo', { ativo: true })).status, 200);
  // A empresa ajustou um modelo à mão (modo manual): as autorizações da plataforma não são adotadas sozinhas.
  assert.equal((await admin.put(`/api/admin/modelos/${encodeURIComponent(MISTRAL)}`, { liberado: true, perfil: 'rapido' })).status, 200);
  assert.equal((await admin.put('/api/admin/modelos-config', { padroes: { ...(await admin.get('/api/admin/modelos')).dados.config.padroes, rapido: MISTRAL } })).status, 200);
  // A operadora autorizou dois modelos, de fabricantes diferentes, com as garantias conferidas.
  for (const [id, perfil, fornecedor] of [[GOOGLE, 'rapido', 'google-vertex'], [ANTHROPIC, 'equilibrado', 'amazon-bedrock']]) {
    const r = await ops.post('/api/plataforma/homologacoes', { id, perfil, fornecedor, semTreino: true, retencaoZero: true, justificativa: 'Retenção zero e ausência de treino conferidas no contrato.' });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
  }
  await admin.post('/api/empresa/usuarios', { email: 'beto@sugestao.test', name: 'Beto Lima', role_id: 'role_member' });
  membro = S.navegador(); await membro.get('/escritorio-sugestao'); await membro.entrarEmpresa('beto@sugestao.test');
  tenant = [...S.P.tenants.values()].find(t => lerConfig(t.db).empresa === 'Escritório Sugestão') || [...S.P.tenants.values()][0];
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

// Cada mudança de modelos aprovados gera nova versão da Política de Uso: a pessoa registra ciência antes de abrir a tela.
const ciencia = async sessao => { const v = (await sessao.get('/api/politica')).dados.versao; await sessao.post('/api/politica/ciencia', { versao: v }); };
async function pagina(sessao = admin, { width = 1366, height = 860, tema = 'light' } = {}) {
  await ciencia(sessao);
  const ctx = await nav.newContext({ viewport: { width, height }, colorScheme: tema, isMobile: width < 700, hasTouch: width < 700 });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const abrir = async (p, rota) => {
  await p.goto(`${S.base}/app#/${rota}`);
  await p.waitForFunction(() => !document.querySelector('#principal')?.hasAttribute('aria-busy') && !document.querySelector('#conteudo > .esqueleto, #conteudo > .carregando'));
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(150);
};
const capturar = async (p, nome) => {
  if (!CAPTURAS) return;
  await p.waitForTimeout(400);   // o modal entra com animação
  await p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: false });
};
const primariosNaDobra = p => p.evaluate(() => [...document.querySelectorAll('#principal .btn-verde')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight && !e.closest('[hidden]'); }).map(e => e.innerText.trim()));
const semRolagemLateral = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('Visão geral: o próximo passo é aprovar os modelos sugeridos e leva ao cartão de Políticas, não ao catálogo técnico', async () => {
  const prep = (await admin.get('/api/acompanhamento')).dados.passos;
  const passo = prep.find(x => x.id === 'recursos');
  assert.equal(passo.titulo, 'Aprovar os modelos sugeridos');
  assert.equal(passo.href, '#/politicas?sugestao=1');
  const atencao = (await admin.get('/api/admin/visao-geral')).dados.atencao.find(x => x.sugestao);
  assert.ok(atencao, 'item de atenção com a sugestão');
  assert.equal(atencao.botao, 'Aprovar os modelos sugeridos');
  assert.equal(atencao.link, '#/politicas?sugestao=1');
  const p = await pagina();
  await abrir(p, 'visao-geral');
  // Passos antes deste (pessoas) podem vir primeiro: o cartão mostra o primeiro que falta; o da sugestão está na lista.
  const botao = p.locator('a.btn', { hasText: 'Aprovar os modelos sugeridos' }).first();
  if (!await botao.isVisible()) await p.getByRole('button', { name: /Ver todos os passos/ }).click();
  await capturar(p, 'visao-geral-1366-claro');
  assert.equal(await botao.getAttribute('href'), '#/politicas?sugestao=1');
  assert.ok(!(await p.locator('#principal').innerText()).includes('Catálogo técnico'));
  await botao.click();
  await p.locator('#sugestao-modelos').waitFor();
  await p.waitForFunction(() => document.activeElement?.id === 'sug-aprovar');
  assert.deepEqual(p.erros, []);
});

test('Políticas: cartão calmo com 2 modelos de fabricantes diferentes, motivos simples e um botão principal; detalhes técnicos no painel', async () => {
  const p = await pagina();
  await abrir(p, 'politicas');
  const cartao = p.locator('#sugestao-modelos');
  await cartao.waitFor();
  assert.equal(await p.locator('#conteudo .faixa-aviso').count(), 0, 'o aviso antigo saiu');
  assert.doesNotMatch(await p.locator('#conteudo').innerText(), /Aprovar um modelo\b/);
  // No ambiente da empresa, a marca da plataforma vira "a plataforma" (marca branca).
  assert.match(await cartao.locator('.adm-sugestao-rotulo').innerText(), /Sugestão da (GreenIA|plataforma)/i);
  assert.match(await cartao.locator('.adm-sugestao-porque').innerText(), /^Escolhidos para .*política de dados \(dados sigilosos ligados/);
  const modelos = cartao.locator('.adm-sug-modelo');
  assert.equal(await modelos.count(), 2);
  const textos = await modelos.allInnerTexts();
  assert.ok(textos.some(t => /Google/.test(t)) && textos.some(t => /Anthropic/.test(t)), 'fabricantes diferentes');
  for (const t of textos) {
    assert.match(t, /Bom para |Atende bem|Rápido para|Para as tarefas/);
    assert.match(t, /Não guarda nem usa seus dados para treinar/);
    assert.match(t, /Custo (econômico|médio|alto)/);
    assert.doesNotMatch(t, /US\$|token|endpoint|homolog|google-vertex|amazon-bedrock/i, 'nada técnico no cartão');
  }
  assert.deepEqual(await primariosNaDobra(p), ['Aprovar a sugestão'], 'uma ação principal na primeira vista');
  assert.equal(await cartao.getByRole('link', { name: 'Escolher outro modelo' }).getAttribute('href'), '#/modelos/catalogo');
  await capturar(p, 'politicas-1366-claro');
  await cartao.getByRole('button', { name: 'Ver detalhes' }).click();
  const painel = p.locator('#modal .px');
  await painel.waitFor();
  const det = await painel.innerText();
  for (const r of [/Fornecedor fixado/, /google-vertex/, /amazon-bedrock/, /Retenção zero\s*comprovada/, /Sem uso para treino\s*comprovada/, /Rota autorizada pela plataforma/, /Fica registrado quem aprovou/, /continua no modo manual/]) assert.match(det, r);
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });
  assert.deepEqual(p.erros, []);
});

test('Aprovar a sugestão: confirmação no modal da plataforma → 2 modelos aprovados (API, banco, registro) → pronto, e o aviso some', async () => {
  const p = await pagina();
  await abrir(p, 'politicas');
  await p.getByRole('button', { name: 'Aprovar a sugestão' }).click();
  const modal = p.locator('.adm-confirmar [role=dialog]');
  await modal.waitFor();
  assert.match(await modal.locator('h2').innerText(), /Aprovar os 2 modelos sugeridos\?/);
  assert.match(await modal.innerText(), /passam a receber conversas sigilosas, sempre pela rota conferida pela plataforma, que não guarda nem usa os dados para treinar/);
  await capturar(p, 'confirmacao-1366-claro');
  await modal.getByRole('button', { name: 'Aprovar a sugestão' }).click();
  await p.locator('.adm-sugestao-pronto').waitFor();
  assert.equal(await p.locator('.adm-sugestao-pronto').innerText(), 'Pronto: 2 modelos aprovados para dados sigilosos.');
  assert.equal(await p.locator('.adm-sugestao').count(), 0);
  await capturar(p, 'sucesso-1366-claro');
  // API e banco: aprovados pela rota da autorização; o registro é o de uma aprovação manual, com origem "sugestão".
  const m = (await admin.get('/api/admin/modelos')).dados.modelos.filter(x => x.homologado);
  assert.deepEqual(m.map(x => x.id).sort(), [ANTHROPIC, GOOGLE].sort());
  for (const x of m) { assert.equal(x.homologacaoEmpresa.origem, 'sugestao'); assert.equal(x.homologacaoEmpresa.quem, 'ana@sugestao.test'); assert.equal(x.homologacaoEmpresa.endpoint, x.autorizacaoPlataforma.endpoint); }
  const cert = todos(tenant.db, "select * from eventos where tipo = 'model.certified'").map(e => json(e.detalhes, {}));
  assert.deepEqual(cert.filter(d => d.origem === 'sugestao').map(d => d.modelo).sort(), [ANTHROPIC, GOOGLE].sort());
  assert.equal(lerConfig(tenant.db).governanca.modo, 'manual', 'o modo não muda');
  // Recarregada a tela, nem cartão nem aviso.
  await p.reload(); await abrir(p, 'politicas');
  assert.equal(await p.locator('#sugestao-modelos, #conteudo .faixa-aviso').count(), 0, await p.locator('#sugestao-modelos, #conteudo .faixa-aviso').first().evaluate(e => e.outerHTML).catch(() => ''));
  // O registro aparece no Histórico de modelos, legível.
  await abrir(p, 'modelos/historico');
  assert.match(await p.locator('#conteudo').innerText(), /Sugestão de modelos aplicada/);
  assert.match(await p.locator('#conteudo').innerText(), /Modelo homologado/);
  // A Visão geral não pede mais a aprovação.
  assert.ok(!(await admin.get('/api/admin/visao-geral')).dados.atencao.some(x => x.sugestao));
  assert.equal((await admin.get('/api/acompanhamento')).dados.passos.find(x => x.id === 'recursos').titulo, 'Confira os recursos de IA');
  assert.deepEqual(p.erros, []);
});

test('Modelos: sugestão por nível em palavras simples; "Usar a sugestão" quando difere e "já segue" depois', async () => {
  const p = await pagina();
  await abrir(p, 'modelos');
  const bloco = p.locator('#sugestao-niveis');
  await bloco.waitFor();
  assert.match(await bloco.innerText(), /Sugestão para a sua empresa/);
  assert.equal(await bloco.locator('li[data-nivel]').count(), 3);
  assert.match(await bloco.locator('li[data-nivel="rapido"]').innerText(), /Trocar .*mistral.* por Gemini .*: bom para /i);
  await capturar(p, 'modelos-1366-claro');
  await bloco.getByRole('button', { name: 'Usar a sugestão' }).click();
  const modal = p.locator('.adm-confirmar [role=dialog]');
  await modal.waitFor();
  assert.match(await modal.innerText(), /continua no modo manual/);
  await modal.getByRole('button', { name: 'Usar a sugestão' }).click();
  await p.locator('#sugestao-niveis .selo', { hasText: 'Sua configuração já segue a sugestão' }).waitFor();
  assert.equal(await p.locator('#sug-niveis-usar').count(), 0);
  const cfg = (await admin.get('/api/admin/modelos')).dados.config;
  assert.equal(cfg.padroes.rapido, GOOGLE);
  assert.equal(lerConfig(tenant.db).governanca.modo, 'manual');
  assert.ok((await admin.get('/api/admin/modelos')).dados.modelos.find(x => x.id === MISTRAL).liberado, 'o ajuste manual continua');
  assert.deepEqual(p.erros, []);
});

test('quem não administra modelos não chama a API da sugestão', async () => {
  assert.equal((await membro.get('/api/admin/modelos/sugestao')).status, 403);
  assert.equal((await membro.post('/api/admin/modelos/sugestao/aplicar', { parte: 'tudo' })).status, 403);
  const anonimo = S.navegador(); await anonimo.get('/escritorio-sugestao');
  assert.equal((await anonimo.get('/api/admin/modelos/sugestao')).status, 401);
});

test('tema escuro e celular (390 px): o cartão cabe, sem rolagem lateral, com contraste e botão de 44 px', async () => {
  // Outra empresa, ainda sem aprovação, para ver o cartão.
  await ops.post('/api/plataforma/empresas', { name: 'Escritório Dois', slug: 'escritorio-dois', status: 'ativa', admin_email: 'gil@dois.test' });
  const gil = S.navegador(); await gil.get('/escritorio-dois'); await gil.entrarEmpresa('gil@dois.test');
  await gil.put('/api/admin/sigilo', { ativo: true });
  await gil.put(`/api/admin/modelos/${encodeURIComponent(MISTRAL)}`, { liberado: true, perfil: 'rapido' });
  for (const [width, height, tema] of [[390, 844, 'light'], [390, 844, 'dark'], [1366, 860, 'dark']]) {
    const p = await pagina(gil, { width, height, tema });
    await abrir(p, 'politicas');
    const cartao = p.locator('#sugestao-modelos');
    await cartao.waitFor();
    assert.equal(await cartao.locator('.adm-sug-modelo').count(), 2, `${width} ${tema}`);
    assert.ok(await semRolagemLateral(p), `sem rolagem lateral em ${width} ${tema}`);
    const botao = p.getByRole('button', { name: 'Aprovar a sugestão' });
    assert.ok((await botao.boundingBox()).height >= 44, 'alvo de toque');
    // Contraste: o texto do cartão não some no fundo.
    const [fundo, texto] = await cartao.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('h2')).color]);
    assert.notEqual(fundo, texto);
    if (tema === 'dark') assert.ok(await p.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] + c[1] + c[2] < 200; }), 'fundo escuro');
    const sufixo = `${width}-${tema === 'dark' ? 'escuro' : 'claro'}`;
    await capturar(p, `politicas-${sufixo}`);
    await abrir(p, 'modelos');
    await p.locator('#sugestao-niveis').waitFor();
    assert.ok(await semRolagemLateral(p), `Modelos sem rolagem lateral em ${width} ${tema}`);
    await p.locator('#sugestao-niveis').scrollIntoViewIfNeeded();
    await capturar(p, `modelos-${sufixo}`);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  }
});
