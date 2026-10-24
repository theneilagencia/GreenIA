// Padrão "caminho claro" nas telas de Quick Win (biblioteca, página, usar, testar, criar, modelos, processos,
// configurar, publicar, versões, resultados e agendamentos), para quem gerencia e para quem só usa, a 1366 e 390 px:
// uma ação principal na primeira vista, poucos controles à vista, no máximo um aviso, nenhuma explicação recolhida
// na tela (ela fica na Ajuda). E os caminhos principais continuam funcionando: criar, testar, publicar, usar e agendar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { itemConta } from './casca.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const VIEWPORTS = { 1366: { width: 1366, height: 768 }, 390: { width: 390, height: 844, isMobile: true, hasTouch: true } };
let S, nav, admin, pessoa, area, legado, legadoTeste, v2, v2Rascunho, v2Preparo;

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const team = (await ops.get('/api/plataforma/planos')).dados.planos.find(x => x.name === 'GreenIA Team');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Caminho', slug: 'empresa-caminho', status: 'ativa', plan_id: team?.id, admin_email: 'admin@caminho.test' });
  admin = S.navegador(); await admin.get('/empresa-caminho'); await admin.entrarEmpresa('admin@caminho.test');
  area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@caminho.test', name: 'Pessoa Caminho', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  await admin.put(`/api/admin/pessoas/${(lista.pessoas || lista).find(x => x.email === 'pessoa@caminho.test').id}`, { areas: [{ id: area }] });
  // Formato anterior: um publicado (com sugestões e medição) e um em teste.
  legado = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${legado.id}`, { status: 'em_uso', sugestoes: ['Confira estes dois documentos e liste as diferenças', 'Os valores dos dois documentos batem?'] });
  legadoTeste = (await admin.post('/api/quick-wins', { modelo_inicial: 4, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${legadoTeste.id}`, { status: 'em_teste' });
  // Formato atual: publicado, publicado com alterações em rascunho e em preparo.
  const novo = async (nome, descricao) => (await admin.post('/api/quick-wins', { assistente: { nome, descricao, formato: 'lista' }, areas: [area] })).dados;
  v2 = await novo('Resumo de reunião', 'Resumir a reunião enviada em decisões, responsáveis e prazos.');
  assert.equal((await admin.post(`/api/quick-wins/${v2.id}/publicar`, { para_que_serve: 'Resume a reunião em decisões, responsáveis e prazos.' })).status, 200);
  v2Rascunho = await novo('Resposta a cliente', 'Preparar uma resposta cordial ao cliente a partir da mensagem enviada.');
  await admin.post(`/api/quick-wins/${v2Rascunho.id}/publicar`, { para_que_serve: 'Prepara uma resposta cordial ao cliente.' });
  await admin.put(`/api/quick-wins/${v2Rascunho.id}`, { assistente: { nome: 'Resposta a cliente', descricao: 'Preparar uma resposta cordial e curta ao cliente a partir da mensagem enviada.', formato: 'resumo' } });
  v2Preparo = await novo('Checklist de viagem', 'Montar um checklist de viagem a partir do roteiro enviado.');
  pessoa = S.navegador(); await pessoa.get('/empresa-caminho'); await pessoa.entrarEmpresa('pessoa@caminho.test');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

async function pagina(sessao, largura = 1366) {
  const u = new URL(S.base);
  const ctx = await nav.newContext({ viewport: { width: VIEWPORTS[largura].width, height: VIEWPORTS[largura].height }, isMobile: !!VIEWPORTS[largura].isMobile, hasTouch: !!VIEWPORTS[largura].hasTouch, locale: 'pt-BR' });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message));
  return p;
}

// O que a primeira vista oferece (mesma medida da varredura de UX, com avisos em linha e explicações recolhidas).
function medir() {
  const main = document.querySelector('#principal');
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden],.oculto,.sr,#lateral'); };
  const dobra = e => e.getBoundingClientRect().top < innerHeight;
  const q = s => [...main.querySelectorAll(s)].filter(vis);
  const primarios = q('.btn-verde, .btn-primario, button.cartao, a.btn-verde').filter(dobra);
  return {
    primarios: primarios.length, rotulos: primarios.map(b => b.innerText.trim()),
    interativos: q('a[href], button, select, input:not([type=hidden]), textarea, summary').filter(dobra).length,
    quais: q('a[href], button, select, input:not([type=hidden]), textarea, summary').filter(dobra).map(e => (e.innerText || e.getAttribute('aria-label') || e.id || e.tagName).trim().slice(0, 24)),
    avisos: q('.faixa-aviso, .aviso, .aviso-linha, .callout, .caixa-ajuda, .dica-caixa, .comece').length,
    explicacoes: q('details > summary').map(s => s.innerText.trim()).filter(t => /^(Como (os|as|o|a|funciona)\b|O que .*inclu|Por que|Saiba|Entenda)/i.test(t)),
    rolagem: document.documentElement.scrollWidth > innerWidth + 1,
  };
}

// [nome, rota, { primarios: [mín, máx], interativos: máx }]: telas de tarefa têm exatamente uma ação principal.
const TAREFA = { primarios: [1, 1], interativos: 12 }, EDITOR = { primarios: [1, 1], interativos: 15 }, LEITURA = { primarios: [0, 1], interativos: 12 };
const telasGestor = () => [
  ['biblioteca', '/quick-wins', TAREFA], ['página', `/qw/${v2.id}`, TAREFA], ['página com rascunho', `/qw/${v2Rascunho.id}`, TAREFA],
  ['página em preparo', `/qw/${v2Preparo.id}`, TAREFA], ['página (formato anterior)', `/qw/${legado.id}`, TAREFA],
  ['usar', `/qw/${v2.id}/usar`, TAREFA], ['testar (formato anterior)', `/qw/${legadoTeste.id}/teste`, EDITOR], ['testar', `/qw/${v2Preparo.id}/teste`, EDITOR],
  ['criar', '/qw/nova', TAREFA], ['editar', `/qw/${v2.id}/ajustar`, EDITOR], ['modelos', '/qw/nova/modelos', LEITURA], ['processos prontos', '/quick-wins/processos', TAREFA],
  ['configurar', `/qw/${legado.id}/editar`, EDITOR], ['configurar acesso', `/qw/${v2.id}/editar`, EDITOR],
  ['publicar (formato anterior)', `/qw/${legadoTeste.id}/publicar`, TAREFA], ['publicar', `/qw/${v2Rascunho.id}/publicar`, EDITOR],
  ['versões', `/qw/${v2Rascunho.id}/versoes`, LEITURA], ['resultados', `/qw/${legado.id}/acompanhamento`, TAREFA], ['preparar resultados', `/qw/${legado.id}/acompanhamento/preparar`, TAREFA],
  ['agendar', `/qw/${v2.id}/programar`, EDITOR], ['agendamentos', `/qw/${v2.id}/programacoes`, TAREFA], ['agendados', '/quick-wins/programados', LEITURA],
];
const telasPessoa = () => [['biblioteca', '/quick-wins', LEITURA], ['página', `/qw/${v2.id}`, TAREFA], ['página (formato anterior)', `/qw/${legado.id}`, TAREFA], ['usar', `/qw/${legado.id}/usar`, TAREFA], ['agendamentos', `/qw/${v2.id}/programacoes`, LEITURA]];

async function conferir(sessao, telas) {
  const falhas = [];
  for (const largura of [1366, 390]) {
    const p = await pagina(sessao, largura);
    for (const [nome, rota, meta] of telas) {
      await p.goto(`${S.base}/app#${rota}`);
      await p.locator('#principal .pg').first().waitFor();
      await p.waitForLoadState('networkidle').catch(() => {});
      await p.waitForTimeout(300);
      const m = await p.evaluate(medir);
      const onde = `${nome} (${rota}) em ${largura}px`;
      if (m.primarios < meta.primarios[0] || m.primarios > meta.primarios[1]) falhas.push(`${onde}: ${m.primarios} ações principais na primeira vista ${JSON.stringify(m.rotulos)}`);
      if (m.interativos > meta.interativos) falhas.push(`${onde}: ${m.interativos} controles na primeira vista (máximo ${meta.interativos}) ${JSON.stringify(m.quais)}`);
      if (m.avisos > 1) falhas.push(`${onde}: ${m.avisos} avisos`);
      if (m.explicacoes.length) falhas.push(`${onde}: explicação na tela ${JSON.stringify(m.explicacoes)}`);
      if (m.rolagem) falhas.push(`${onde}: rolagem horizontal`);
    }
    assert.deepEqual(p.erros, [], `erros de página em ${largura}px`);
    await p.context().close();
  }
  assert.deepEqual(falhas, []);
}

test('quem gerencia: cada tela de Quick Win tem um caminho claro, a 1366 e 390 px', async () => {
  await conferir(admin, telasGestor());
});

test('quem só usa: biblioteca, página, usar e agendamentos com um caminho claro, a 1366 e 390 px', async () => {
  await conferir(pessoa, telasPessoa());
});

test('biblioteca: a lista vem primeiro; criar é um botão que abre os caminhos; busca só em lista longa', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/quick-wins`);
  await p.locator('.qw-item').first().waitFor();
  // A lista começa logo abaixo do cabeçalho: nada de caixa de criação permanente.
  const ordem = await p.evaluate(() => ({ cabeca: document.querySelector('.pg-cabeca').getBoundingClientRect().bottom, lista: document.querySelector('.qw-lista').getBoundingClientRect().top }));
  assert.ok(ordem.lista - ordem.cabeca < 120, JSON.stringify(ordem));
  assert.equal(await p.locator('#buscar-qw').count(), 0, 'lista curta sem busca');
  // Uma ação visível por linha; o resto no "…".
  for (const linha of await p.locator('.qw-item').all()) assert.ok(await linha.locator('.qw-item-acoes > a.btn').count() <= 1);
  const criar = p.getByRole('button', { name: /Criar Quick Win/ });
  await criar.click();
  const escolha = p.getByRole('dialog', { name: 'Como você quer começar?' });
  await escolha.waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), 'qw-criar-titulo', 'o foco vai para o título do modal');
  assert.deepEqual(await escolha.locator('.cartao-titulo').allInnerTexts(), ['Descrever com suas palavras', 'Começar de um modelo', 'Começar de um processo pronto', 'Continuar uma preparação']);
  await p.keyboard.press('Escape');
  await escolha.waitFor({ state: 'detached' });
  assert.equal(await criar.evaluate(el => el === document.activeElement), true, 'Esc fecha e devolve o foco');
  // "Continuar uma preparação" leva às preparações em andamento.
  await criar.click();
  await escolha.getByRole('button', { name: /Continuar uma preparação/ }).click();
  await escolha.waitFor({ state: 'detached' });
  assert.equal(await p.evaluate(() => document.activeElement.id), 'qw-preparacoes');
  // Lista longa: a busca aparece e a contagem é a da lista visível.
  const extras = [];
  for (let i = 1; i <= 4; i++) extras.push((await admin.post('/api/quick-wins', { assistente: { nome: `Rascunho de lista ${i}`, descricao: 'Organizar anotações fictícias.' }, areas: [area] })).dados.id);
  await p.reload();
  await p.locator('#buscar-qw').waitFor();
  // A contagem é a das tarefas da lista (publicadas e em preparo, mesmo com o grupo recolhido; sem as arquivadas).
  const n = await p.evaluate(() => [...document.querySelectorAll('.qw-item')].filter(li => !li.closest('.qw-arquivados')).length);
  assert.equal(await p.locator('#contagem-qw').innerText(), `${n} ${n === 1 ? 'tarefa disponível na lista' : 'tarefas na lista'}`);
  // Buscar abre "Em preparo" quando o que se procura está lá.
  await p.fill('#buscar-qw', 'rascunho de lista 3');
  assert.equal(await p.locator('#qw-preparacoes').getAttribute('open'), '');
  assert.equal(await p.locator('.qw-item:visible').count(), 1);
  for (const id of extras) await admin.req('DELETE', `/api/quick-wins/${id}`);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('página do Quick Win: o que saiu da primeira vista continua alcançável (Mais ações, Detalhes, Ajuda)', async () => {
  const p = await pagina(admin);
  await p.goto(`${S.base}/app#/qw/${v2.id}`);
  await p.getByRole('heading', { name: v2.nome, exact: true }).waitFor();
  assert.match(await p.locator('.pg-cabeca .pg-desc').innerText(), /Resume a reunião/, 'o que ele faz é a linha do cabeçalho');
  await p.locator('.pg-acoes summary[aria-label="Mais ações"]').click();
  const itens = await p.locator('.pg-acoes [role=menuitem]').allInnerTexts();
  for (const item of ['Agendar', 'Ver agendamentos', 'Refinar Quick Win', 'Testar', 'Duplicar', 'Ver versões', 'Acesso e dados', 'Arquivar', 'Excluir Quick Win']) assert.ok(itens.includes(item), `${item} em ${JSON.stringify(itens)}`);
  await p.keyboard.press('Escape');
  assert.equal(await p.getByRole('link', { name: 'Editar instruções', exact: true }).count(), 1);
  assert.equal(await p.locator('summary', { hasText: 'Uso e decisão' }).count(), 1);
  assert.equal(await p.getByRole('link', { name: 'Preparar resultados do processo', exact: true }).count(), 1);
  // A explicação que saiu da tela está na Ajuda.
  await itemConta(p, '#ajuda-tela');
  await p.getByRole('dialog').getByText(/Suas execuções: só você vê/).waitFor();
  await p.keyboard.press('Escape');
  // Quick Win do formato anterior: atualizar fica em Mais ações (sem aviso fixo na página).
  await p.goto(`${S.base}/app#/qw/${legado.id}`);
  await p.getByRole('heading', { name: legado.nome, exact: true }).waitFor();
  assert.equal(await p.locator('.aviso-linha').count(), 0);
  await p.locator('.pg-acoes summary[aria-label="Mais ações"]').click();
  assert.equal(await p.getByRole('menuitem', { name: 'Atualizar para Quick Win inteligente' }).getAttribute('href'), `#/qw/${legado.id}/atualizar`);
  // Com alterações em rascunho: um aviso só, com a ação que resolve.
  await p.goto(`${S.base}/app#/qw/${v2Rascunho.id}`);
  await p.locator('.aviso-linha').waitFor();
  assert.equal(await p.locator('.aviso-linha').count(), 1);
  assert.equal(await p.locator('.aviso-linha').getByRole('link', { name: 'Testar e publicar' }).getAttribute('href'), `#/qw/${v2Rascunho.id}/teste`);
  // Em preparo: a ação principal é testar e publicar.
  await p.goto(`${S.base}/app#/qw/${v2Preparo.id}`);
  await p.getByText('Ainda não está disponível para a equipe.').waitFor();
  assert.deepEqual(await p.locator('#principal .btn-verde:visible').allInnerTexts(), ['Testar e publicar']);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('fluxos: criar, testar, publicar, usar e agendar continuam funcionando', async () => {
  const p = await pagina(admin);
  // Criar: pela escolha de como começar.
  await p.goto(`${S.base}/app#/quick-wins`);
  await p.getByRole('button', { name: /Criar Quick Win/ }).click();
  await p.getByRole('dialog').getByRole('link', { name: /Descrever com suas palavras/ }).click();
  await p.locator('#objetivo').waitFor();
  assert.equal(await p.locator('[data-exemplo]:visible').count(), 3, 'três exemplos à vista');
  await p.getByRole('button', { name: 'Mais exemplos' }).click();
  assert.equal(await p.locator('[data-exemplo]:visible').count(), 8, 'os outros aparecem quando a pessoa pede');
  await p.fill('#nome-inicial', 'Resumo de visitas de campo');
  await p.fill('#objetivo', 'Resumir as anotações de visitas de campo em pontos de atenção e próximos passos.');
  await p.locator('[data-continuar]').click();
  await p.waitForURL(/#\/qw\/\d+\/ajustar$/);
  const criado = (await admin.get('/api/quick-wins')).dados.quickWins.find(q => q.nome === 'Resumo de visitas de campo');
  assert.ok(criado, 'rascunho criado ao continuar');
  // Testar (formato anterior): Executar é a ação principal e abre o resultado.
  await p.goto(`${S.base}/app#/qw/${legadoTeste.id}/teste`);
  await p.fill('#entrada-qw', 'Reunião de segunda: Ana confere o estoque até quarta; João liga para o fornecedor.');
  await p.click('#executar-btn');
  await p.locator('.rodape-resposta').first().waitFor();
  // Publicar (formato anterior).
  await p.goto(`${S.base}/app#/qw/${legadoTeste.id}/publicar`);
  await p.getByRole('button', { name: 'Publicar para a equipe' }).click();
  await p.waitForURL(new RegExp(`#/qw/${legadoTeste.id}$`));
  assert.equal((await admin.get(`/api/quick-wins/${legadoTeste.id}`)).dados.status, 'em_uso');
  // Agendar: pelo "Mais ações" da página, conferir e ativar.
  await p.goto(`${S.base}/app#/qw/${v2.id}`);
  await p.locator('.pg-acoes summary[aria-label="Mais ações"]').click();
  await p.getByRole('menuitem', { name: 'Agendar', exact: true }).click();
  await p.locator('#rotina-form').waitFor();
  await p.fill('#rotina-entrada', 'Anotações da reunião de segunda-feira.');
  await p.click('#rotina-salvar');
  await p.locator('#rotina-ativar').click();
  await p.waitForFunction(id => location.hash === `#/qw/${id}/programacoes` || !document.getElementById('rotina-erro')?.classList.contains('oculto'), v2.id);
  assert.equal(await p.evaluate(() => location.hash), `#/qw/${v2.id}/programacoes`, await p.locator('#rotina-erro').innerText().catch(() => ''));
  await p.locator('.qw-rotina-card').first().waitFor();
  assert.equal((await admin.get(`/api/quick-wins/${v2.id}/programacoes`)).dados.programacoes.length, 1);
  assert.deepEqual(p.erros, []);
  await p.context().close();
  // Usar: quem só usa abre a página, usa e recebe o resultado.
  const u = await pagina(pessoa, 390);
  await u.goto(`${S.base}/app#/qw/${legado.id}`);
  await u.locator('.pg-acoes a', { hasText: 'Usar' }).click();
  await u.locator('[data-sug-usar]').first().click();
  await u.click('#executar-btn');
  await u.locator('.rodape-resposta').first().waitFor();
  assert.deepEqual(u.erros, []);
  await u.context().close();
});
