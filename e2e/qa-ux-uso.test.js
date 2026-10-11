// Regressão do QA de UX de out/2026, frente "Uso e chat": os achados de uso não voltam.
// A4 Nova conversa no topo (celular); A5/M2 "Dados sigilosos" com efeito visível e diálogo próprio; B4 só o lugar
// atual ativo na lateral; B6/M4/M5 menu do celular com Fechar e a conta, ajuda num botão só; M12 ações da conversa
// num menu "⋯"; M13/M14/M18 rodapé da resposta, "Serviu?" ao pé e simulador no formato pedido, com selo fora da
// resposta; M3 "Excluir todas" como perigo; M15 guia; M16 Pendências; M17 Conhecimento; A6 glossário; B2 títulos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { respostaSimulada } from '../src/ia.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, admin, pessoa, qw, livre, conversaQw;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
// Nenhum salto de nível de título (h1 → h3) na tela.
const saltosDeTitulo = p => p.evaluate(() => {
  const nivel = [...document.querySelectorAll('#principal :is(h1,h2,h3,h4)')].filter(h => h.offsetParent).map(h => Number(h.tagName[1]));
  return nivel.filter((n, i) => i && n > nivel[i - 1] + 1).length;
});

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Uso', slug: 'empresa-uso', status: 'ativa', admin_email: 'admin@uso.test' });
  admin = S.navegador(); await admin.get('/empresa-uso'); await admin.entrarEmpresa('admin@uso.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@uso.test', name: 'Pessoa Uso', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  await admin.put(`/api/admin/pessoas/${(lista.pessoas || lista).find(x => x.email === 'pessoa@uso.test').id}`, { areas: [{ id: area }] });
  await admin.post('/api/bases/documentos', { area_id: area, titulo: 'Manual de compras', pasta: 'Manuais', arquivo: { nome: 'compras.txt', base64: Buffer.from('Manual fictício de compras.').toString('base64') } });
  qw = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qw.id}`, { status: 'em_uso' });
  pessoa = S.navegador(); await pessoa.get('/empresa-uso'); await pessoa.entrarEmpresa('pessoa@uso.test');
  livre = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${livre.id}/mensagens`, { texto: 'Escreva um email para a equipe com uma lista dos próximos passos e uma tabela de prazos' });
  conversaQw = (await pessoa.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${conversaQw.id}/mensagens`, { texto: 'Confira estes dois documentos e liste as diferenças' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('M18: o simulador responde no formato pedido, de forma determinística, sem aviso de simulação no corpo', () => {
  const email = respostaSimulada('Escreva um email para a equipe com uma lista dos próximos passos e uma tabela de prazos');
  assert.match(email, /^Assunto: /);
  assert.match(email, /\n- .+\n- /, 'lista');
  assert.match(email, /\| Item \| Valor \| Situação \|/, 'tabela');
  assert.match(email, /Atenciosamente,/);
  assert.equal(respostaSimulada('Escreva um email para a equipe com uma lista dos próximos passos e uma tabela de prazos'), email, 'determinística');
  assert.match(respostaSimulada('Liste os itens principais'), /^Aqui está a lista:\n- /);
  assert.match(respostaSimulada('Resuma em 3 linhas'), /^Resumo em três linhas:\n1\. /);
  assert.match(respostaSimulada('Compare em uma tabela'), /^Aqui está a comparação:/);
  assert.match(respostaSimulada('Tire a coluna de valor'), /^Pronto, sem a coluna pedida:/);
  for (const pedido of ['Oi', 'Escreva um email curto', 'Faça uma tabela']) assert.doesNotMatch(respostaSimulada(pedido), /simulad|modelo real/i, pedido);
});

test('A4/B7: no celular, Nova conversa abre no topo, com o título e "Como começar" à vista', async () => {
  const p = await pagina(pessoa, { width: 390, height: 844 });
  await p.goto(`${S.base}/app#/nova`);
  await p.waitForSelector('#me-ajude-comecar');
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => ({ topo: document.querySelector('#msgs').scrollTop, titulo: document.querySelector('.boas-vindas h2').getBoundingClientRect().top, botao: document.querySelector('#me-ajude-comecar').getBoundingClientRect().bottom, h: innerHeight }));
  assert.equal(m.topo, 0, JSON.stringify(m));
  assert.ok(m.titulo > 0 && m.botao < m.h, JSON.stringify(m));
  assert.equal(await p.locator('#me-ajude-comecar').innerText(), 'Como começar');
  assert.equal(await saltosDeTitulo(p), 0);
  assert.deepEqual(p.erros, []);
});

test('B4: na lateral, só o lugar atual fica ativo', async () => {
  const p = await pagina(pessoa);
  const ativos = () => p.$$eval('#lateral [aria-current="page"]', l => l.map(a => a.dataset.item || a.getAttribute('href')));
  await p.goto(`${S.base}/app#/nova`); await p.waitForSelector('#entrada');
  assert.deepEqual(await ativos(), ['#/nova']);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  assert.deepEqual(await ativos(), [`#/c/${livre.id}`]);
  await p.goto(`${S.base}/app#/conversas`); await p.waitForSelector('.hc-conversa');
  assert.deepEqual(await ativos(), ['conversas']);
  assert.deepEqual(p.erros, []);
});

test('M4/M5/B6: ajuda num botão só (com o guia dentro); menu do celular com Fechar, nome, email e Sair', async () => {
  const p = await pagina(pessoa, { width: 390, height: 844 });
  await p.goto(`${S.base}/app#/nova`); await p.waitForSelector('#entrada');
  assert.equal(await p.locator('.cabeca a[href="#/primeiros-passos"]').count(), 0, 'sem botão "Guia" separado');
  assert.equal(await p.innerText('#sair'), 'Sair', '"Sair" continua escrito');
  await p.click('#ajuda-tela'); await p.waitForSelector('#ajuda-guia');
  await p.click('#ajuda-guia'); await p.waitForSelector('#guia-seguir');
  await p.click('#menu'); await p.waitForSelector('#lateral.aberta'); await p.waitForTimeout(350);
  const conta = p.locator('#lateral .conta-lateral');
  assert.ok(await conta.isVisible());
  assert.match(await conta.innerText(), /Pessoa Uso[\s\S]*pessoa@uso\.test[\s\S]*Sair/);
  const fechar = await p.locator('#fechar-lateral').boundingBox();
  assert.ok(fechar.width >= 44 && fechar.height >= 44, JSON.stringify(fechar));
  assert.equal(await p.getAttribute('#fechar-lateral', 'aria-label'), 'Fechar menu');
  await p.click('#fechar-lateral');
  await p.waitForFunction(() => !document.querySelector('#lateral').classList.contains('aberta'));
  assert.equal(await p.evaluate(() => document.activeElement.id), 'menu');
  // No computador, a conta segue no cabeçalho e o menu não tem botão de fechar.
  await p.setViewportSize({ width: 1280, height: 860 });
  assert.equal(await p.locator('#fechar-lateral').isVisible(), false);
  assert.equal(await p.locator('#lateral .conta-lateral').isVisible(), false);
  assert.deepEqual(p.erros, []);
});

test('A5/M2: "Dados sigilosos" mostra o efeito, explica em diálogo próprio e trava com explicação', async () => {
  const conv = (await pessoa.post('/api/conversas', {})).dados.conversa;
  for (const width of [390, 1280]) {
    const p = await pagina(pessoa, { width, height: 844 });
    await p.goto(`${S.base}/app#/c/${conv.id}`); await p.waitForSelector('#sigilosa');
    assert.equal(await p.locator('#efeito-sigilo').innerText(), 'Não dá para desligar depois');
    const rotulo = await p.locator('label[for="sigilosa"]').boundingBox();
    assert.ok(rotulo.height >= 44, `rótulo clicável com 44 px (${width}): ${JSON.stringify(rotulo)}`);
    if (width === 1280) {
      await p.click('#saiba-sigilo');
      const d = p.getByRole('dialog');
      assert.match(await d.innerText(), /definitivo/i);
      await d.getByRole('button', { name: 'Cancelar' }).click();
      assert.equal(await p.getAttribute('#sigilosa', 'aria-checked'), 'false', 'cancelar não muda nada');
      await p.click('label[for="sigilosa"]');
      await p.getByRole('dialog').getByRole('button', { name: 'Marcar como sigilosa' }).click();
      await p.waitForFunction(() => document.querySelector('#sigilosa')?.getAttribute('aria-checked') === 'true');
      assert.equal(await p.locator('#efeito-sigilo').innerText(), 'Ligado até a conversa ser apagada');
      assert.equal((await pessoa.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa, true);
      await p.click('#saiba-sigilo');
      assert.match(await p.getByRole('dialog').innerText(), /Não dá para desligar/);
      await p.getByRole('dialog').getByRole('button', { name: 'Entendi' }).click();
    }
    assert.deepEqual(p.erros, []);
  }
});

test('M12/M13/M14/M18: ações num "⋯", rodapé com ações maiores, informação técnica no "i", "Serviu?" ao pé e selo de simulação fora da resposta', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  // M12: um único menu de ações, com o nome igual ao rótulo.
  assert.equal(await p.locator('#renomear, #apagar').count(), 0);
  await p.click('#acoes-conversa');
  assert.deepEqual(await p.getByRole('menuitem').allInnerTexts(), ['Renomear', 'Excluir conversa']);
  await p.keyboard.press('Escape');
  // M18: corpo no formato pedido, sem aviso de simulação; o selo fica no rodapé.
  const corpo = await p.locator('.bolha-ia').last().innerText();
  assert.match(corpo, /^Assunto: /);
  assert.doesNotMatch(corpo, /simulad|modelo real/i);
  assert.equal(await p.locator('.rodape-resposta .selo-simulada').innerText(), 'Resposta simulada');
  assert.equal(await p.locator('.resposta').last().getByRole('button', { name: 'Baixar planilha' }).count() + await p.locator('.resposta').last().getByRole('link', { name: 'Baixar planilha' }).count(), 1);
  // M13: "Copiar" com área de clique real; nível e motivo recolhidos no "i".
  const copiar = await p.locator('[data-copiar]').last().boundingBox();
  assert.ok(copiar.width >= 60 && copiar.height >= 36, JSON.stringify(copiar));
  const info = p.locator('.info-resposta').last();
  assert.equal(await info.locator('.info-resposta-texto').isVisible(), false);
  await info.locator('summary').click();
  assert.match(await info.locator('.info-resposta-texto').innerText(), /Nível|escolha automática/);
  // M14: "Serviu?" na conversa livre, ao pé da última resposta; "Não serviu" pergunta o motivo num diálogo próprio.
  assert.equal(await p.locator('.barra-conversa [data-fb]').count(), 0);
  assert.equal(await p.locator('.resposta').last().locator('[data-fb]').count(), 3);
  await p.click('[data-fb="nao_serviu"]');
  const d = p.getByRole('dialog');
  await d.getByLabel('Motivo (opcional)').fill('Faltou o prazo');
  await d.getByRole('button', { name: 'Enviar avaliação' }).click();
  await p.waitForSelector('[data-fb="nao_serviu"][aria-pressed="true"]');
  const c = (await pessoa.get(`/api/conversas/${livre.id}`)).dados.conversa;
  assert.equal(c.feedback, 'nao_serviu'); assert.equal(c.feedback_motivo, 'Faltou o prazo');
  assert.equal(await saltosDeTitulo(p), 0);
  assert.deepEqual(p.erros, []);
});

test('A6: quem usa um Quick Win não vê o estado interno; textos sem "caso"', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/c/${conversaQw.id}`); await p.waitForSelector('.rodape-resposta');
  assert.doesNotMatch(await p.locator('.barra-conversa').innerText(), /Em uso|Em teste|Identificado/);
  assert.match(await p.locator('.rodape-resposta').last().innerText(), /Revise antes de usar\./);
  assert.equal(await p.locator('.resposta').last().locator('[data-fb]').count(), 3);
  assert.deepEqual(p.erros, []);
});

test('M3: "Excluir todas" é ação de perigo, longe de "Nova conversa"', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/conversas`); await p.waitForSelector('.hc-conversa');
  const b = p.getByRole('button', { name: 'Excluir todas', exact: true });
  assert.match(await b.getAttribute('class'), /btn-perigo/);
  assert.equal(await p.locator('.hc-intro-acoes [data-hc-todas]').count(), 0);
  assert.equal(await saltosDeTitulo(p), 0);
  assert.deepEqual(p.erros, []);
});

test('M15: guia com passos nomeados, "Voltar" desabilitado visível e o caminho de volta ao guia', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/primeiros-passos`); await p.waitForSelector('#guia-seguir');
  assert.deepEqual((await p.locator('[data-guia-passo]').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').split(' · ')[0].trim()), ['1 Escolher', '2 Enviar', '3 Conferir', '4 Conhecimento']);
  assert.equal(await p.locator('#guia-voltar').isDisabled(), true);
  assert.ok(Number(await p.locator('#guia-voltar').evaluate(e => getComputedStyle(e).opacity)) <= 0.5);
  assert.match(await p.locator('.guia-saida').innerText(), /botão Ajuda/);
  assert.deepEqual(p.erros, []);
});

test('M16: Pendências vazia sem aba única nem filtros; hora sem segundos', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/pendencias`); await p.waitForSelector('#pend-lista');
  assert.equal(await p.locator('.conhecimento-vistas').count(), 0, 'sem a aba única');
  assert.equal(await p.locator('#pend-busca').isVisible(), false, 'sem filtros sobre lista vazia');
  assert.match(await p.innerText('#pend-lista'), /Nenhuma pendência/);
  const texto = await p.innerText('#principal');
  assert.match(texto, /Atualizado em \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}\./);
  assert.doesNotMatch(texto, /\d{2}:\d{2}:\d{2}|nenhuma execução/);
  assert.deepEqual(p.erros, []);
});

test('M17: Conhecimento para quem só consulta: seletor sem corte e sem informação de gestão', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/conhecimento`); await p.waitForSelector('[data-documento]');
  assert.deepEqual(await p.locator('#conhecimento-status option').allTextContents(), ['Todos', 'Sigilosos']);
  assert.equal(await p.locator('#conhecimento-pasta option').first().textContent(), 'Todas');
  assert.equal(await p.locator('[data-filtrar-revisao]').count(), 0);
  assert.doesNotMatch(await p.innerText('#conhecimento-lista'), /Responsável|Revisão recomendada|Conteúdo revisado/);
  const corte = await p.evaluate(() => [...document.querySelectorAll('.filtros-biblioteca select')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.id));
  assert.deepEqual(corte, []);
  assert.deepEqual(p.erros, []);
});
