// Primeira tela da conversa (padrão dos assistentes de chat): um centro só, com saudação e caixa de mensagem no meio
// da página; sugestões que só preenchem a caixa; até 3 Quick Wins publicados para a pessoa; nível e "Dados
// sigilosos" dentro da caixa, com o aviso de que não dá para desligar no momento de ligar; "Administração" uma vez
// só na lateral. Também no celular, sem rolagem horizontal, no tema claro e no escuro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';

let N, admin, area;
const qws = [], sessoes = new Map();
const erros = [];
before(async () => {
  N = await subirComNavegador();
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'rafael@empresa-exemplo.com.br', nome: 'Rafael Nunes', areas: [{ id: area.id }] });
  await admin.post('/api/admin/pessoas', { email: 'sem.area@empresa-exemplo.com.br', nome: 'Bia', areas: [] });
  // Rafael já teve uma conversa (a dica de primeira vez é só para quem nunca conversou).
  sessoes.set('admin@empresa-exemplo.com.br', admin);
  const rafael = await cliente(N.app, N.base).entrar('rafael@empresa-exemplo.com.br');
  sessoes.set('rafael@empresa-exemplo.com.br', rafael);
  await rafael.post('/api/conversas', {});
  sessoes.set('sem.area@empresa-exemplo.com.br', await cliente(N.app, N.base).entrar('sem.area@empresa-exemplo.com.br'));
  // Quatro publicados na área e um em teste (não aparece para quem usa).
  for (const [nome, status] of [['Ata de reunião', 'em_uso'], ['Checklist de recebimento', 'em_uso'], ['Conferência de pedido', 'em_uso'], ['Resumo de reclamações', 'em_uso'], ['Rascunho em teste', 'em_teste']]) {
    const q = (await admin.post('/api/quick-wins', { modelo_inicial: 0, areas: [area.id] })).dados;
    await admin.put(`/api/quick-wins/${q.id}`, { nome, para_que_serve: `Para ${nome.toLowerCase()}.`, status, problema: 'Problema fictício.', objetivo: 'Objetivo fictício.', processo_atual: 'Processo fictício.' });
    qws.push({ ...q, nome, status });
  }
});
after(async () => { await N?.fechar(); assert.deepEqual(erros, []); });

async function pagina(email, { width = 1366, height = 860, esquema = 'light' } = {}) {
  const ctx = await N.navegador.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: esquema });
  await ctx.route(u => !u.href.startsWith(N.base), r => r.abort());
  // Uma sessão por pessoa (entrar uma vez só; vários códigos seguidos esbarram no limite de envio).
  const sessao = sessoes.get(email).cookie, corte = sessao.indexOf('=');
  await ctx.addCookies([{ name: sessao.slice(0, corte), value: sessao.slice(corte + 1), url: N.base }]);
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push(e.message));
  p.on('dialog', d => { erros.push(`diálogo nativo: ${d.message()}`); d.dismiss().catch(() => {}); });
  return p;
}
const semRolagemLateral = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('conversa vazia: saudação com o primeiro nome e a caixa no centro da página, sem os caminhos antigos', async () => {
  for (const [width, height] of [[1366, 860], [390, 844]]) {
    const p = await pagina('rafael@empresa-exemplo.com.br', { width, height });
    await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#saudacao'); await p.waitForTimeout(250);
    assert.equal(await p.locator('#saudacao').innerText(), 'Olá, Rafael. O que você precisa fazer?');
    assert.deepEqual(await p.locator('#principal h2').allInnerTexts(), ['Olá, Rafael. O que você precisa fazer?'], 'um título só na área');
    const m = await p.evaluate(() => { const c = document.querySelector('#caixa-chat').getBoundingClientRect(), s = document.querySelector('#saudacao').getBoundingClientRect(); return { centro: (c.top + c.height / 2) / innerHeight, saudacaoAcima: s.bottom <= c.top, h: innerHeight }; });
    assert.ok(m.centro > 0.3 && m.centro < 0.7, `caixa na faixa do meio (${width}): ${JSON.stringify(m)}`);
    assert.ok(m.saudacaoAcima, 'saudação logo acima da caixa');
    for (const texto of ['Como começar', 'Usar uma tarefa pronta', 'Fazer um pedido', 'Comece por aqui', 'Começar o guia', 'Ver exemplos de pedidos', 'Não dá para desligar depois'])
      assert.equal(await p.getByText(texto, { exact: true }).count(), 0, `sem "${texto}"`);
    assert.equal(await p.locator('.barra-conversa').count(), 0, 'sem faixa no alto');
    // Quem já conversou não vê a dica de primeira vez.
    assert.equal(await p.locator('.inicio-dica').count(), 0);
    assert.ok(await semRolagemLateral(p), `sem rolagem horizontal (${width})`);
    if (width > 760) assert.equal(await p.evaluate(() => document.activeElement?.id), 'entrada', 'no computador, o cursor já está na caixa');
    await p.context().close();
  }
});

test('sugestões preenchem a caixa sem enviar; texto já escrito pede confirmação e os anexos ficam', async () => {
  const p = await pagina('rafael@empresa-exemplo.com.br', { width: 390, height: 844 });
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#sugestoes');
  const chips = p.locator('#sugestoes button');
  assert.deepEqual(await chips.allInnerTexts(), ['Resumir um documento', 'Escrever um email', 'Comparar dois arquivos', 'Organizar em tabela']);
  for (const b of await chips.all()) { const r = await b.boundingBox(); assert.ok(r.height >= 44, `toque de 44 px: ${JSON.stringify(r)}`); }
  const conversas = () => um(N.app.db, "select count(*) as n from conversas c join pessoas p on p.id = c.pessoa_id where p.email = 'rafael@empresa-exemplo.com.br'").n, antes = conversas();
  let escritas = 0; const contar = r => { if (r.method() !== 'GET') escritas++; }; p.on('request', contar);
  await chips.filter({ hasText: 'Escrever um email' }).click();
  assert.match(await p.inputValue('#entrada'), /^Rascunhe um email curto e cordial/);
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'entrada', 'foco na caixa');
  assert.equal(await p.locator('#enviar').isDisabled(), false);
  // Texto da pessoa: só troca depois de confirmar no modal da plataforma; o anexo continua.
  await p.fill('#entrada', 'Meu pedido');
  await p.locator('#arquivo').setInputFiles({ name: 'caso.txt', mimeType: 'text/plain', buffer: Buffer.from('Informação fictícia') }); await p.waitForSelector('#anexos .anexo-chip');
  await chips.filter({ hasText: 'Comparar dois arquivos' }).click();
  await p.getByRole('dialog', { name: /Substituir o pedido/ }).getByRole('button', { name: 'Manter meu texto', exact: true }).click();
  assert.equal(await p.inputValue('#entrada'), 'Meu pedido');
  await chips.filter({ hasText: 'Comparar dois arquivos' }).click();
  await p.getByRole('dialog', { name: /Substituir o pedido/ }).getByRole('button', { name: 'Substituir pedido', exact: true }).click();
  await p.waitForFunction(() => /^Compare os dois arquivos/.test(document.querySelector('#entrada').value));
  assert.equal(await p.locator('#anexos .anexo-chip').count(), 1, 'o anexo continua');
  // Trocar o nível redesenha a tela sem perder o pedido nem o anexo.
  const nivel = p.getByRole('combobox', { name: 'Nível' });
  await nivel.selectOption(await nivel.locator('option:not([disabled])').last().getAttribute('value'));
  assert.match(await p.inputValue('#entrada'), /^Compare os dois arquivos/);
  assert.equal(await p.locator('#anexos .anexo-chip').count(), 1);
  p.off('request', contar);
  assert.equal(escritas, 0, 'preparar o pedido não grava nem envia nada');
  assert.equal(await p.locator('.bolha-eu').count(), 0);
  assert.equal(conversas(), antes, 'nenhuma conversa criada');
  // O envio continua explícito; com mensagens, a caixa volta para o pé e os atalhos somem.
  await p.click('#enviar'); await p.waitForSelector('.rodape-resposta');
  assert.match(p.url(), /#\/c\/\d+/);
  assert.equal(await p.locator('#sugestoes, #tarefas-prontas, #saudacao').count(), 0);
  const fim = await p.evaluate(() => document.querySelector('#caixa-chat').getBoundingClientRect().bottom / innerHeight);
  assert.ok(fim > 0.85, `caixa no pé: ${fim}`);
  await p.context().close();
});

test('tarefas prontas: até 3 Quick Wins publicados para a pessoa, com "Ver todos"; some quando não há nenhum', async () => {
  const p = await pagina('rafael@empresa-exemplo.com.br');
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#tarefas-prontas');
  const linha = p.locator('#tarefas-prontas');
  assert.match(await linha.innerText(), /^Ou use uma tarefa pronta:/);
  const links = linha.locator('a.chip-tarefa');
  assert.equal(await links.count(), 3, 'no máximo 3');
  const publicados = qws.filter(q => q.status === 'em_uso').map(q => `#/qw/${q.id}`);
  for (const href of await links.evaluateAll(l => l.map(a => a.getAttribute('href')))) assert.ok(publicados.includes(href), `só publicados: ${href}`);
  assert.equal(await linha.getByText('Rascunho em teste').count(), 0, 'Quick Win em teste não aparece');
  assert.equal(await linha.getByRole('link', { name: 'Ver todos', exact: true }).getAttribute('href'), '#/quick-wins');
  const primeiro = await links.first().getAttribute('href');
  await links.first().click(); await p.waitForURL(u => u.hash === primeiro);
  await p.context().close();
  // Sem área: nenhum Quick Win disponível, a linha não aparece. Primeira vez: uma linha só, com o guia.
  const q = await pagina('sem.area@empresa-exemplo.com.br', { width: 390, height: 844 });
  await q.goto(`${N.base}/app#/nova`); await q.waitForSelector('#saudacao'); await q.waitForTimeout(250);
  assert.equal(await q.locator('#tarefas-prontas').count(), 0);
  assert.equal(await q.locator('#sugestoes button').count(), 4, 'as sugestões continuam');
  assert.equal(await q.locator('.inicio-dica').innerText(), 'Primeira vez aqui? Veja o guia de primeiros passos.');
  assert.equal(await q.locator('.inicio-dica').evaluate(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))), 1, 'uma linha só');
  assert.ok(await semRolagemLateral(q));
  await q.context().close();
});

test('nível e "Dados sigilosos" ficam na barra da caixa; ligar pede confirmação e cancelar mantém desligado', async () => {
  for (const [width, height] of [[1366, 860], [390, 844]]) {
    const p = await pagina('rafael@empresa-exemplo.com.br', { width, height });
    await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#entrada');
    const nivel = p.getByRole('combobox', { name: 'Nível' }), chave = p.getByRole('switch', { name: 'Dados sigilosos' });
    assert.equal(await p.locator('#caixa-chat .caixa-barra').locator('#modelo, #sigilosa').count(), 2, 'dentro da barra da caixa');
    assert.equal(await nivel.locator('option:checked').innerText(), 'Automático');
    const barra = await p.locator('.caixa-barra').boundingBox();
    for (const sel of ['#mais-anexos', '#modelo', '#sigilosa', '#enviar']) {
      const r = await p.locator(sel).boundingBox();
      assert.ok(r.y >= barra.y - 1 && r.y + r.height <= barra.y + barra.height + 1, `${sel} na mesma barra (${width})`);
      if (width < 760) assert.ok(r.height >= 44, `${sel}: toque de 44 px (${JSON.stringify(r)})`);
    }
    // Foco visível no teclado.
    await chave.focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
    assert.notEqual(await chave.evaluate(e => getComputedStyle(e).boxShadow), 'none', 'foco visível');
    if (width === 1366) {
      let escritas = 0; const contar = r => { if (r.method() !== 'GET') escritas++; }; p.on('request', contar);
      await chave.click();
      const d = p.getByRole('dialog');
      assert.match(await d.innerText(), /não dá para desligar depois/i);
      await d.getByRole('button', { name: 'Cancelar' }).click();
      assert.equal(await chave.getAttribute('aria-checked'), 'false');
      p.off('request', contar); assert.equal(escritas, 0, 'cancelar não grava');
      await p.keyboard.press('Space');   // o foco voltou para o interruptor
      await p.getByRole('dialog').getByRole('button', { name: 'Marcar como sigilosa' }).click();
      await p.waitForFunction(() => document.querySelector('#sigilosa')?.getAttribute('aria-checked') === 'true');
      assert.match(p.url(), /#\/c\/\d+/);
      const id = Number(/#\/c\/(\d+)/.exec(p.url())[1]);
      assert.equal(um(N.app.db, 'select sigilosa from conversas where id = ?', id).sigilosa, 1);
      assert.equal(await p.locator('#caixa-chat .caixa-barra #sigilosa').count(), 1, 'continua na barra');
    }
    assert.ok(await semRolagemLateral(p));
    await p.context().close();
  }
});

test('Quick Win: a conversa vazia mostra o Quick Win e a caixa no centro, sem a linha de tarefas prontas', async () => {
  const p = await pagina('rafael@empresa-exemplo.com.br');
  const q = qws[0];
  await p.goto(`${N.base}/app#/qw/${q.id}/nova`); await p.waitForSelector('#entrada');
  assert.equal(await p.locator('.boas-vindas h2').innerText(), 'Ata de reunião');
  assert.equal(await p.locator('#tarefas-prontas').count(), 0);
  assert.equal(await p.locator('.barra-conversa .qw-contexto').count(), 1, 'o Quick Win continua indicado no alto');
  const centro = await p.evaluate(() => { const c = document.querySelector('#caixa-chat').getBoundingClientRect(); return (c.top + c.height / 2) / innerHeight; });
  assert.ok(centro > 0.3 && centro < 0.75, String(centro));
  await p.context().close();
});

test('lateral do admin: "Administração" aparece uma vez só (no alternador)', async () => {
  const p = await pagina('admin@empresa-exemplo.com.br');
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#lateral .troca-contexto');
  assert.equal(await p.locator('#lateral').getByText('Administração', { exact: true }).count(), 1);
  assert.equal(await p.locator('#lateral [data-item="administracao"]').count(), 0);
  await p.click('#lateral [data-contexto="admin"]'); await p.waitForFunction(() => document.body.dataset.contexto === 'admin');
  await p.context().close();
});

test('tema claro e escuro: a primeira tela usa as cores do tema, com texto legível e sem rolagem horizontal', async () => {
  const luz = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const esquema of ['light', 'dark']) for (const [width, height] of [[1366, 860], [390, 844]]) {
    const p = await pagina('rafael@empresa-exemplo.com.br', { width, height, esquema });
    await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#tarefas-prontas');
    const c = await p.evaluate(() => {
      const fundo = getComputedStyle(document.querySelector('#principal')).backgroundColor;
      const cor = sel => getComputedStyle(document.querySelector(sel)).color, bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
      return { fundo, saudacao: cor('#saudacao'), chip: cor('#sugestoes button'), chipFundo: bg('#sugestoes button'), rotulo: cor('.inicio-tarefas-rotulo'), verTodos: cor('.inicio-ver-todos') };
    });
    assert.equal(luz(c.fundo) < 0.1, esquema === 'dark', `fundo do tema ${esquema}: ${c.fundo}`);
    assert.ok(contraste(c.saudacao, c.fundo) >= 7, `saudação ${esquema}: ${JSON.stringify(c)}`);
    assert.ok(contraste(c.chip, c.chipFundo) >= 4.5, `chip ${esquema}: ${JSON.stringify(c)}`);
    assert.ok(contraste(c.rotulo, c.fundo) >= 4.5 && contraste(c.verTodos, c.fundo) >= 4.5, `textos menores ${esquema}: ${JSON.stringify(c)}`);
    assert.ok(await semRolagemLateral(p), `${esquema} ${width}`);
    await p.context().close();
  }
});
