// Regressão do QA de UX de out/2026, frente Quick Wins: biblioteca, página do Quick Win, configuração, uso do
// formato anterior, criação por modelos, Agendados, Uso e decisão e assistente. Os achados não voltam.
// A12 Agendados explica o motivo real; A13 "Resultados" com nomes estáveis; A14/M19/M23/M24 configurar; A15 modelos
// sem criar no primeiro clique; A21/B5/M41 celular; M6 título e trilha; M8/M9/B8 biblioteca; M10 ordem da página;
// M11/M26 usar e testar no formato anterior; M20/M21/M22 decisão e medições; M25 assistente com Publicar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { um } from '../src/db.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, admin, pessoa, area, qwTeste, qwUso, emp;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  return p;
}
const quantos = () => um(S.P.tenant(emp.id).db, 'select count(*) as n from quick_wins').n;

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa QW', slug: 'empresa-qw', status: 'ativa', admin_email: 'admin@qw.test' })).dados;
  admin = S.navegador(); await admin.get('/empresa-qw'); await admin.entrarEmpresa('admin@qw.test');
  area = (await admin.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@qw.test', name: 'Pessoa QW', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  const pid = (lista.pessoas || lista).find(x => x.email === 'pessoa@qw.test').id;
  await admin.put(`/api/admin/pessoas/${pid}`, { areas: [{ id: area }] });
  // Formato anterior: um em teste (em preparo) e um em uso, com sugestões de início.
  qwTeste = (await admin.post('/api/quick-wins', { modelo_inicial: 0, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qwTeste.id}`, { status: 'em_teste' });
  qwUso = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qwUso.id}`, { status: 'em_uso', sugestoes: ['Confira estes dois documentos e liste as diferenças em detalhe', 'Os valores dos dois documentos batem?', 'Resuma o que muda'] });
  await admin.post(`/api/quick-wins/${qwUso.id}/medicoes`, { indicador: 'minutos por pedido', tipo: 'tempo', unidade: 'minutos', antes_valor: '25', antes_data: '2026-09-01', antes_origem: 'medido', depois_valor: '10', depois_data: '2026-10-01', depois_origem: 'medido' });
  pessoa = S.navegador(); await pessoa.get('/empresa-qw'); await pessoa.entrarEmpresa('pessoa@qw.test');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('A12: Agendados vazio diz por que não dá para agendar e leva à ação que resolve', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/quick-wins/programados`);
  await p.getByText(/formato anterior, que não tem agendamento/).waitFor();
  assert.equal(await p.getByText('clique em “Agendar”, ao lado de “Usar”').count(), 0, 'sem a orientação que não vale para o formato anterior');
  assert.equal(await p.getByRole('link', { name: `Atualizar ${qwUso.nome}` }).getAttribute('href'), `#/qw/${qwUso.id}/atualizar`);
  assert.equal(await p.locator('.cabeca h1').innerText(), 'Quick Wins agendados');
  assert.doesNotMatch(await p.locator('#principal').innerText(), /Programad|programação/);
  assert.deepEqual(p.erros, []);
});

test('M8/M9/B8: quem só usa vê o que está publicado, sem "Em preparo", menus de uma opção nem filtros salvos', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/quick-wins`);
  await p.locator(`.qw-item-link[href="#/qw/${qwUso.id}"]`).waitFor();
  const texto = await p.locator('#principal').innerText();
  assert.doesNotMatch(texto, /Em preparo|Só quem gerencia|Continuar uma preparação/);
  assert.equal(await p.locator(`.qw-item-link[href="#/qw/${qwTeste.id}"]`).count(), 0);
  assert.equal(await p.locator('.qw-item .menu-acoes').count(), 0, 'sem "Mais ações" só com "Abrir"');
  assert.equal(await p.locator('[data-visao-salvar]').count(), 0, 'sem "Salvar filtros" para uma busca só');
  assert.equal(await p.getByRole('link', { name: 'Agendados', exact: true }).count(), 1);
  assert.deepEqual(p.erros, []);
});

test('A21: no celular, as ações da biblioteca ficam inteiras, sem quebrar palavras', async () => {
  const p = await pagina(admin, { width: 320, height: 700 });
  await p.goto(`${S.base}/app#/quick-wins`);
  await p.locator('.qw-item-link').first().waitFor();
  const botoes = await p.locator('.pg-acoes .btn').evaluateAll(els => els.map(e => ({ t: e.innerText, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })));
  assert.ok(botoes.length >= 2, JSON.stringify(botoes));
  for (const b of botoes) assert.ok(b.h < 60 && !/\n/.test(b.t.trim()), `botão em uma linha: ${JSON.stringify(b)}`);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Quem cria tem os caminhos de criação, inclusive por modelo e por processo.
  assert.equal(await p.getByRole('link', { name: /Começar de um modelo/ }).count(), 1);
  assert.equal(await p.getByRole('link', { name: /Começar de um processo pronto/ }).count(), 1);
  assert.deepEqual(p.erros, []);
});

test('M6/M10/A13/B5: página do Quick Win com o nome no h1, uma trilha, uso antes da gestão e Resultados agrupados', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await p.goto(`${S.base}/app#/qw/${qwUso.id}`);
  await p.getByRole('heading', { name: qwUso.nome, exact: true }).waitFor();
  assert.equal(await p.locator('.cabeca h1').innerText(), qwUso.nome);
  assert.equal(await p.getByRole('heading', { name: qwUso.nome, exact: true }).count(), 1, 'o nome não se repete como título');
  assert.equal(await p.locator('.cabeca .migalha:visible').count(), 0, 'uma trilha só');
  const ordem = await p.evaluate(() => ['t-faz', 't-sug', 't-exec', 't-resultados'].map(id => document.getElementById(id)?.getBoundingClientRect().top ?? -1));
  assert.ok(ordem.every(v => v >= 0) && ordem.every((v, i) => !i || v > ordem[i - 1]), `ordem: ${ordem}`);
  assert.equal(await p.locator('details.qw-detalhes').getAttribute('open'), null, 'detalhes recolhidos');
  const texto = await p.locator('#principal').innerText();
  assert.doesNotMatch(texto, /Acompanhar dados de negócio|Acompanhar uso, medições e decisões/);
  assert.match(texto, /Resultados do processo/);
  assert.equal(await p.locator('summary', { hasText: 'Uso e decisão' }).count(), 1);
  // Sugestões quebram em linhas: nenhuma fica cortada na lateral.
  const sug = await p.locator('.qw-detalhe .sugestoes').evaluate(el => ({ rola: el.scrollWidth > el.clientWidth + 1, fora: [...el.children].some(b => b.getBoundingClientRect().right > innerWidth) }));
  assert.deepEqual(sug, { rola: false, fora: false });
  // Seções em h2 logo após o h1.
  const niveis = await p.locator('#principal').evaluate(el => [...el.querySelectorAll('h1,h2,h3,h4')].filter(h => h.getAttribute('role') !== 'none').map(h => Number(h.tagName[1])));
  assert.ok(niveis.every((n, i) => !i || n <= niveis[i - 1] + 1), `hierarquia: ${niveis}`);
  assert.deepEqual(p.erros, []);
});

test('M20/M21: decisão sem opção marcada, motivo obrigatório, descarte confirmado; variação com sentido em pt-BR', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/qw/${qwUso.id}`);
  await p.locator('summary', { hasText: 'Uso e decisão' }).click();
  await p.locator('#form-dec').waitFor();
  assert.match(await p.locator('#medicoes').innerText(), /Redução de 60% no tempo · melhorou/);
  assert.equal(await p.locator('input[name=decisao]:checked').count(), 0, 'nenhuma decisão vem marcada');
  await p.getByRole('button', { name: 'Registrar decisão' }).click();
  await p.getByText('Escolha o que fazer com este Quick Win.').waitFor();
  await p.check('input[name=decisao][value=descartar]');
  await p.getByRole('button', { name: 'Registrar decisão' }).click();
  await p.getByText('Explique o motivo.', { exact: false }).waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), 'motivo', 'o foco vai para o campo com erro');
  await p.fill('#motivo', 'Teste de descarte');
  await p.getByRole('button', { name: 'Registrar decisão' }).click();
  const dialogo = p.getByRole('dialog');
  await dialogo.waitFor();
  await dialogo.getByRole('button', { name: 'Voltar sem alterar' }).click();
  assert.equal((await admin.get(`/api/quick-wins/${qwUso.id}`)).dados.status, 'em_uso', 'cancelar não descarta');
  assert.deepEqual(p.erros, []);
});

test('A14/M19/M23/M24/M41: configurar em seções, estado informado, erro no campo, cor acessível e barra curta no celular', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await p.goto(`${S.base}/app#/qw/${qwTeste.id}/editar`);
  await p.locator('#form-qw').waitFor();
  assert.equal(await p.locator('input[name=status]').count(), 0, 'o estado não é um rádio manual');
  assert.match(await p.locator('.aviso-linha').first().innerText(), /Estado: Em teste/);
  assert.equal(await p.locator('.aviso-linha').first().getByRole('link', { name: 'Publicar para a equipe' }).count(), 1);
  // Barra fixa: só Salvar e Salvar e testar, numa linha; Excluir no fim da página, como ação de perigo.
  const barra = await p.locator('.qw-config-barra').evaluate(el => ({ h: el.getBoundingClientRect().height, texto: el.innerText }));
  assert.ok(barra.h <= 80 && !/Excluir|Voltar/.test(barra.texto), JSON.stringify(barra));
  assert.match(await p.locator('#excluir').getAttribute('class'), /btn-perigo/);
  assert.equal(await p.locator('.qw-config-barra #excluir').count(), 0);
  // Cor: a amostra é o controle, com nome e 44 px.
  const verde = p.getByRole('radio', { name: 'Verde', exact: true });
  assert.equal(await verde.count(), 1);
  const caixa = await p.locator('.qw-cor').first().boundingBox();
  assert.ok(caixa.width >= 44 && caixa.height >= 44, JSON.stringify(caixa));
  const area = await p.locator('.qw-opcoes-toque > label').first().boundingBox();
  assert.ok(area.height >= 44, `rótulo da área com 44 px: ${JSON.stringify(area)}`);
  // Erro junto do campo, com foco nele.
  await p.fill('#nome', '');
  await p.getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.locator('#erro-nome:not(.oculto)').waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nome');
  assert.equal(await p.locator('#nome').getAttribute('aria-invalid'), 'true');
  assert.equal((await admin.get(`/api/quick-wins/${qwTeste.id}`)).dados.nome, qwTeste.nome, 'nada é gravado');
  // Salvar não muda o estado.
  await p.fill('#nome', qwTeste.nome);
  await p.getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.locator('.toast', { hasText: 'Quick Win salvo.' }).waitFor();
  assert.equal((await admin.get(`/api/quick-wins/${qwTeste.id}`)).dados.status, 'em_teste');
  assert.deepEqual(p.erros, []);
});

test('M11/M26: usar e testar no formato anterior mostram o que enviar, sugestões à vista e as próximas ações', async () => {
  const p = await pagina(pessoa);
  await p.goto(`${S.base}/app#/qw/${qwUso.id}/usar`);
  await p.locator('#entrada-qw').waitFor();
  assert.equal(await p.locator('label[for=entrada-qw]').innerText(), 'O que enviar');
  const sug = p.getByRole('button', { name: 'Os valores dos dois documentos batem?' });
  assert.ok(await sug.isVisible(), 'sugestões visíveis como botões');
  await sug.click();
  assert.equal(await p.inputValue('#entrada-qw'), 'Os valores dos dois documentos batem?');
  const q = await pagina(admin);
  await q.goto(`${S.base}/app#/qw/${qwTeste.id}/teste`);
  await q.getByText('Teste: não conta nos resultados.').waitFor();
  for (const nome of ['Voltar ao Quick Win', 'Ajustar', 'Publicar para a equipe']) assert.equal(await q.getByRole('link', { name: nome, exact: true }).count(), 1, nome);
  assert.deepEqual([...p.erros, ...q.erros], []);
});

test('A15: escolher um modelo mostra a prévia e não cria nada; o assistente abre preenchido', async () => {
  const p = await pagina(admin);
  const antes = quantos();
  await p.goto(`${S.base}/app#/quick-wins`);
  await p.getByRole('link', { name: /Começar de um modelo/ }).click();
  await p.locator('[data-modelo]').first().waitFor();
  await p.locator('[data-modelo]').first().click();
  await p.locator('#qw-previa:not([hidden])').waitFor();
  assert.equal(quantos(), antes, 'o clique no modelo não cria Quick Win');
  await p.getByRole('link', { name: 'Usar este modelo' }).click();
  await p.locator('#objetivo').waitFor();
  assert.ok((await p.inputValue('#objetivo')).length > 20, 'objetivo preenchido pelo modelo');
  assert.equal(quantos(), antes, 'abrir o assistente também não cria');
  assert.deepEqual(p.erros, []);
});

test('M25: o assistente abre pela pergunta principal e mostra Publicar como etapa', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/qw/nova`);
  await p.locator('#objetivo').waitFor();
  assert.equal(await p.locator('.passos li').count(), 6);
  assert.match(await p.locator('.passos li').last().innerText(), /Publicar/);
  const primeiro = await p.evaluate(() => [...document.querySelectorAll('#etapa h2, #etapa input, #etapa textarea, .rascunho-barra button')].find(e => e.offsetParent)?.id);
  assert.equal(primeiro, 'pergunta', 'a etapa começa pela pergunta');
  assert.equal(await p.locator('#salvar-rascunho').isVisible(), false, '"Salvar rascunho" não vem antes da pergunta');
  assert.deepEqual(p.erros, []);
});
