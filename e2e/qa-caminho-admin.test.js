// "Caminho claro" na Administração da empresa: cada tela responde onde estou, para que serve e o que faço agora.
// Mede, a 1366×768 e 390×844, o mesmo que a varredura de UX: no máximo uma ação principal na primeira vista (zero
// nas telas só de leitura), poucos alvos na primeira vista (12; formulários de configuração, 15), no máximo um aviso
// e nenhum bloco recolhido só de explicação. Confere também os caminhos que mudaram: Preparar o ambiente no alto da
// Visão geral, menu curto, registro aberto no painel lateral, filtros e opções raras recolhidos, catálogo técnico
// numa aba, endereços antigos que redirecionam e as explicações na Ajuda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { itemConta } from './casca.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const TELAS = {
  // rota: [tipo, ações principais na primeira vista]; tipo: tarefa (até 12 alvos), config (até 15), leitura (até 12).
  'visao-geral': ['tarefa', 1], pessoas: ['tarefa', 1], 'pessoas/areas': ['tarefa', 1], 'pessoas/grupos': ['tarefa', 1], 'pessoas/perfis': ['tarefa', 1],
  'pessoas/criacao': ['config', 1], modelos: ['config', 1], 'modelos/catalogo': ['tarefa', 1], 'modelos/roteamento': ['config', 1], 'modelos/historico': ['leitura', 0],
  politicas: ['config', 1], 'politicas/texto': ['config', 1], uso: ['leitura', 0], atividade: ['leitura', 0], 'atividade/problemas': ['leitura', 0], 'atividade/suporte': ['leitura', 0],
  integracoes: ['tarefa', 1], 'empresa/marca': ['config', 1], 'empresa/landing': ['config', 1], 'empresa/url': ['config', 1], configuracoes: ['config', 1],
};
let S, nav, admin;
const u = () => new URL(S.base);

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Caminho', slug: 'empresa-caminho', status: 'ativa', admin_email: 'admin@caminho.test' });
  admin = S.navegador(); await admin.get('/empresa-caminho'); await admin.entrarEmpresa('admin@caminho.test');
  await admin.put('/api/admin/config', { dominios: ['caminho.test'] });
  const areas = [];
  for (const nome of ['Atendimento', 'Operações', 'Qualidade']) areas.push((await admin.post('/api/admin/areas', { nome })).dados.id);
  for (const [email, name] of [['marina@caminho.test', 'Marina Costa'], ['rafael@caminho.test', 'Rafael Nunes']]) await admin.post('/api/empresa/usuarios', { email, name, role_id: 'role_member' });
  await admin.post('/api/admin/grupos', { nome: 'Gestores' });
  // Modo manual (a empresa ajustou um modelo): a aba principal de Modelos mostra o formulário de níveis e acesso.
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  await admin.put('/api/admin/governanca', { modo: 'manual' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

async function pagina({ width, height }) {
  const ctx = await nav.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700 });
  await ctx.addCookies([...admin.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const abrir = async (p, rota) => {
  await p.goto(`${S.base}/app#/${rota}`);
  await p.waitForFunction(() => !document.querySelector('#principal')?.hasAttribute('aria-busy') && !document.querySelector('#conteudo > .esqueleto'));
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(150);
};

// O mesmo critério da varredura de UX (scratchpad/caminho/varredura.mjs, medirCaminho).
const medir = () => {
  const main = document.querySelector('#principal');
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden],.oculto,.sr,#lateral,.lateral'); };
  const dobra = e => e.getBoundingClientRect().top < innerHeight;
  const q = s => [...main.querySelectorAll(s)].filter(vis);
  const primarios = q('.btn-verde, .btn-primario, button.cartao, a.btn-verde');
  // O botão Menu do celular é a lateral recolhida (que a medição já deixa de fora na tela larga).
  const interativos = q('a[href], button, select, input:not([type=hidden]), textarea, summary').filter(e => e.id !== 'menu');
  // Bloco recolhido só de explicação: um details cujo conteúdo não tem nenhum controle, link ou tabela.
  const explicativos = [...main.querySelectorAll('details')].filter(d => !d.querySelector(':scope > :not(summary) :is(a, button, input, select, textarea, table), :scope > :is(a, button, input, select, textarea, table, form)'));
  return { primariosDobra: primarios.filter(dobra).length, rotulos: primarios.filter(dobra).map(b => b.innerText.trim().slice(0, 30)), interativosDobra: interativos.filter(dobra).length,
    lista: interativos.filter(dobra).map(e => (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20)),
    avisos: q('.faixa-aviso, .aviso, .callout, .caixa-ajuda, .dica-caixa, .comece').length, explicativos: explicativos.map(d => d.querySelector('summary')?.innerText.trim()),
    rolagem: document.documentElement.scrollWidth > innerWidth + 1 };
};

for (const [largura, altura] of [[1366, 768], [390, 844]]) {
  test(`caminho claro em ${largura} px: uma ação principal, poucos alvos, no máximo um aviso e nenhuma explicação recolhida`, async () => {
    const p = await pagina({ width: largura, height: altura });
    const falhas = [];
    for (const [rota, [tipo, principais]] of Object.entries(TELAS)) {
      await abrir(p, rota);
      const m = await p.evaluate(medir);
      const limite = tipo === 'config' ? 15 : 12;
      if (m.primariosDobra !== principais) falhas.push(`${rota}: ${m.primariosDobra} ações principais na primeira vista (esperado ${principais}) ${JSON.stringify(m.rotulos)}`);
      if (m.interativosDobra > limite) falhas.push(`${rota}: ${m.interativosDobra} alvos na primeira vista (máximo ${limite}) ${JSON.stringify(m.lista)}`);
      if (m.avisos > 1) falhas.push(`${rota}: ${m.avisos} avisos`);
      if (m.explicativos.length) falhas.push(`${rota}: explicação recolhida na tela ${JSON.stringify(m.explicativos)}`);
      if (m.rolagem) falhas.push(`${rota}: rolagem horizontal`);
    }
    assert.deepEqual(falhas, []);
    assert.deepEqual(p.erros, []);
  });
}

test('menu da Administração curto, sem caixa de explicação, e endereços antigos que levam ao lugar novo com o motivo', async () => {
  const p = await pagina({ width: 1366, height: 768 });
  await abrir(p, 'visao-geral');
  const itens = await p.locator('#lateral .lateral-rolagem a.item-lat .nome').allInnerTexts();
  assert.deepEqual(itens, ['Visão geral', 'Pessoas', 'Modelos', 'Políticas de IA', 'Uso e créditos', 'Atividade', 'Marca e endereço', 'Configurações']);
  assert.deepEqual(await p.locator('#lateral .lateral-rolagem h2').allInnerTexts().then(t => t.map(x => x.toLowerCase())), ['pessoas e ia', 'acompanhar', 'empresa']);
  assert.equal(await p.locator('#lateral .aviso-contexto').count(), 0);
  for (const [antigo, novo, motivo] of [['preparacao', '#/visao-geral?passos=1', 'Preparar o ambiente agora fica no alto da Visão geral'],
    ['empresa/acessos', '#/atividade/suporte', 'Acessos do suporte agora ficam em Atividade'], ['empresa', '#/empresa/marca', '']]) {
    await p.goto(`${S.base}/app#/${antigo}`);
    await p.waitForFunction(h => location.hash === h, novo);
    if (motivo) await p.locator('.toast', { hasText: motivo }).waitFor();
  }
  // A busca (Ctrl K) continua levando ao que saiu do menu.
  await abrir(p, 'visao-geral');
  await p.click('#abrir-busca');
  await p.keyboard.type('Acessos do suporte');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => location.hash === '#/atividade/suporte');
  assert.deepEqual(p.erros, []);
});

test('Visão geral: o próximo passo no alto, com um botão; a lista de passos recolhida até a pessoa pedir', async () => {
  const p = await pagina({ width: 1366, height: 768 });
  await abrir(p, 'visao-geral');
  const prep = (await admin.get('/api/acompanhamento')).dados.passos;
  const falta = prep.find(x => !x.pronto && !x.opcional);
  assert.equal(await p.locator('.adm-proximo h2').innerText(), falta.titulo);
  assert.equal(await p.locator('.adm-proximo a.btn-verde').getAttribute('href'), falta.href);
  assert.equal(await p.locator('#prep-passos').isVisible(), false);
  const ver = p.getByRole('button', { name: 'Ver todos os passos' });
  await ver.click();
  assert.equal(await ver.getAttribute('aria-expanded'), 'true');
  assert.equal(await p.locator('#prep-passos > li').count(), prep.length);
  assert.deepEqual(p.erros, []);
});

test('Atividade: filtros atrás de Filtrar; um registro por vez no painel lateral, por clique ou teclado', async () => {
  const p = await pagina({ width: 1366, height: 768 });
  await abrir(p, 'atividade');
  assert.equal(await p.locator('#filtro-ev').isVisible(), false);
  await p.getByRole('button', { name: 'Filtrar' }).click();
  await p.locator('#ev-tipo').waitFor();
  assert.equal(await p.locator('#conteudo details').count(), 0, 'nenhum "details" por linha');
  // Teclado: uma parada só na lista; setas andam, Enter abre, Esc fecha e devolve o foco à linha.
  const linhas = p.locator('#conteudo tr[data-registro]');
  assert.ok(await linhas.count() >= 2);
  assert.deepEqual(await linhas.evaluateAll(ls => ls.map(l => l.tabIndex).filter(t => t === 0)), [0], 'um ponto de parada');
  await linhas.first().focus();
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.registro), '1');
  await p.keyboard.press('Enter');
  const painel = p.getByRole('dialog');
  await painel.waitFor();
  assert.match(await painel.innerText(), /Autor:/);
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });
  assert.equal(await p.evaluate(() => document.activeElement.dataset.registro), '1', 'o foco volta para a linha');
  await linhas.first().click();
  await painel.waitFor();
  await p.locator('#px-fundo').click({ position: { x: 20, y: 300 } });
  await painel.waitFor({ state: 'detached' });
  assert.deepEqual(p.erros, []);
});

test('Modelos: decisões na aba principal, catálogo técnico em aba própria com o modelo no painel, que salva na hora', async () => {
  const p = await pagina({ width: 1366, height: 768 });
  await abrir(p, 'modelos');
  assert.deepEqual(await p.locator('[role=tab]').allInnerTexts(), ['Níveis e acesso', 'Catálogo técnico', 'Escolha automática', 'Histórico']);
  assert.equal(await p.locator('#conteudo details').count(), 0);
  assert.equal(await p.locator('#pd-chat').isVisible(), false, 'modelo de cada nível em Mais opções');
  await p.getByRole('button', { name: 'Mais opções' }).click();
  assert.equal(await p.locator('#pd-chat').isVisible(), true);
  await abrir(p, 'modelos/catalogo');
  const i = (await admin.get('/api/admin/modelos')).dados.modelos.findIndex(x => x.id === 'mistralai/mistral-small');
  assert.ok(i >= 0);
  await p.locator(`#conteudo tr[data-registro="${i}"]`).click();
  const painel = p.getByRole('dialog');
  await painel.waitFor();
  const nivel = painel.locator('select[data-perfil]');
  // Salva na hora e o painel volta com a lista recarregada.
  await Promise.all([p.waitForResponse(r => r.url().endsWith('/api/admin/governanca') && r.request().method() === 'GET'), nivel.selectOption('equilibrado')]);
  await p.waitForLoadState('networkidle');
  await p.waitForFunction(() => document.querySelector('#modal select[data-perfil]')?.value === 'equilibrado');
  assert.equal((await admin.get('/api/admin/modelos')).dados.modelos.find(x => x.id === 'mistralai/mistral-small').perfil, 'equilibrado');
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { perfil: 'rapido' });
  // Adicionar modelo: recolhido até a pessoa pedir.
  assert.equal(await p.locator('#add-modelo').isVisible(), false);
  await p.getByRole('button', { name: 'Adicionar modelo' }).click();
  await p.locator('#q-modelo').waitFor();
  assert.deepEqual(p.erros, []);
});

test('Políticas e Configurações: o raro em "Mais opções", link direto abre o caminho até o campo, um bloco aberto por vez', async () => {
  const p = await pagina({ width: 1366, height: 768 });
  await abrir(p, 'politicas');
  assert.equal(await p.locator('#pesquisa-web').isVisible(), false);
  await abrir(p, 'politicas?foco=pesquisa-web');
  await p.waitForFunction(() => document.activeElement?.id === 'pesquisa-web');
  assert.equal(await p.getByRole('button', { name: 'Mais opções' }).getAttribute('aria-expanded'), 'true');
  await abrir(p, 'configuracoes');
  assert.equal(await p.locator('details.cfg-caixa[open]').count(), 0, 'blocos fechados');
  assert.equal(await p.locator('#conteudo .faixa-aviso').count(), 0, 'sem aviso informativo');
  const bloco = n => p.locator('details.cfg-caixa').nth(n).locator(':scope > summary');
  await bloco(0).click();
  await bloco(2).click();
  assert.deepEqual(await p.locator('details.cfg-caixa').evaluateAll(ds => ds.map(d => d.open)).then(a => a.slice(0, 3)), [false, false, true], 'abrir outro bloco fecha o que não foi mexido');
  await p.locator('label.chip-opcao', { hasText: '30 dias' }).click();
  await bloco(3).click();
  assert.deepEqual(await p.locator('details.cfg-caixa').evaluateAll(ds => ds.map(d => d.open)).then(a => a.slice(2, 4)), [true, true], 'o bloco alterado continua aberto');
  // Integrações desligadas: uma frase e uma ação, que abre o bloco certo de Configurações.
  await p.evaluate(() => { location.hash = '#/integracoes'; });
  await p.getByRole('dialog').getByRole('button', { name: 'Sair sem salvar' }).click();
  await p.getByRole('link', { name: 'Abrir Configurações' }).click();
  await p.waitForFunction(() => document.querySelector('#cfg-bloco-integracoes')?.open && document.activeElement?.id === 'cfg-integracoes');
  assert.deepEqual(p.erros, []);
});

test('Ajuda: as explicações que saíram das telas ficam na Ajuda de cada tela, com "Saiba mais"', async () => {
  const p = await pagina({ width: 390, height: 844 });
  for (const [rota, texto] of [['configuracoes', /senha de app|Nome, logomarca, cores e aviso de privacidade ficam em Marca e endereço/], ['pessoas', /Grupo de permissão: pessoas de qualquer área/],
    ['modelos/catalogo', /Capacidades: por padrão/], ['politicas', /Pesquisa na internet/], ['visao-geral', /Preparar o ambiente/], ['atividade/suporte', /equipe de operação/]]) {
    await abrir(p, rota);
    await itemConta(p, '#ajuda-tela');
    const ajuda = p.locator('.ajuda-contextual');
    await ajuda.waitFor();
    assert.match(await ajuda.innerText(), texto, rota);
    await p.keyboard.press('Escape');
    await ajuda.waitFor({ state: 'detached' });
  }
  assert.deepEqual(p.erros, []);
});

test('Pessoas: filtros e busca recolhidos em lista curta; com "Revisão pendente", registrar a revisão é a ação principal', async () => {
  const p = await pagina({ width: 1366, height: 768 });
  await abrir(p, 'pessoas');
  assert.equal(await p.locator('#lx-perfil').isVisible(), false);
  assert.equal(await p.locator('#lx-q').isVisible(), false);
  assert.equal(await p.locator('.lx-explica, #lx-entenda, .lx-atalhos-ajuda').count(), 0);
  await p.keyboard.press('/');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'lx-q', '/ abre o painel e põe o foco na busca');
  await abrir(p, 'pessoas?revisao=pendente');
  await p.locator('#lx-lote-abrir').waitFor();
  assert.equal(await p.locator('#lx-novo').isVisible(), false, 'Convidar sai enquanto a tarefa é revisar');
  assert.match(await p.locator('#lx-filtrar').innerText(), /1/, 'o botão Filtrar mostra o filtro aplicado');
  await p.locator('#lx-lote-abrir').click();
  await p.locator('#lx-lote-nota').waitFor();
  await p.locator('#lx-filtrar').click();
  await p.locator('#lx-revisao').uncheck();
  assert.equal(await p.locator('#lx-novo').isVisible(), true, 'sem o filtro, Convidar volta');
  assert.deepEqual(p.erros, []);
});
