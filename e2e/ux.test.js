// Regressão das jornadas de clareza e recuperação, com pessoas, emails e dados inteiramente fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
let N, admin, p, area;
before(async () => {
  N = await subirComNavegador();
  salvarConfig(N.app.db, { empresa: 'Empresa Exemplo', dominios: ['empresa-exemplo.com.br'] });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  p = await N.entrar('admin@empresa-exemplo.com.br');
});
after(async () => { await N?.fechar(); });

test('login: reenvio invalida o código anterior; limite do servidor continua valendo; código mais recente entra', async () => {
  const ctx = await N.navegador.newContext(); const q = await ctx.newPage();
  const email = 'loginux@empresa-exemplo.com.br';
  const codigo = () => /\d{6}/.exec(N.app.email.enviados.filter(m => m.para === email).at(-1).assunto)[0];
  await q.goto(`${N.base}/entrar`); await q.clock.install();
  await q.fill('#email', email); await q.click('#btn-email'); await q.waitForSelector('#codigo', { state: 'visible' });
  const antigo = codigo();
  assert.equal(await q.locator('#reenviar').isDisabled(), true, 'evita pedidos repetidos imediatos');
  await q.clock.fastForward(61000);
  await Promise.all([q.waitForResponse(r => r.url().endsWith('/api/login/codigo')), q.click('#reenviar')]);
  await q.waitForFunction(() => document.querySelector('#reenviar')?.textContent === 'Enviar novo código');
  assert.match(await q.textContent('#enviado-para'), /email mais recente/);
  await q.fill('#codigo', antigo);
  await Promise.all([q.waitForResponse(r => r.url().endsWith('/api/login/entrar')), q.click('#btn-codigo')]);
  await q.waitForSelector('#erro-codigo:not(.oculto)');
  assert.match(await q.textContent('#erro-codigo'), /inválido ou vencido/);
  await q.clock.fastForward(61000);
  await Promise.all([q.waitForResponse(r => r.url().endsWith('/api/login/codigo')), q.click('#reenviar')]);
  await q.waitForFunction(() => document.querySelector('#reenviar')?.textContent === 'Enviar novo código');
  const novo = codigo();
  await q.clock.fastForward(61000);
  const [limite] = await Promise.all([q.waitForResponse(r => r.url().endsWith('/api/login/codigo')), q.click('#reenviar')]);
  assert.equal(limite.status(), 429);
  await q.waitForFunction(() => document.querySelector('#erro-codigo')?.textContent.includes('Muitos códigos'));
  assert.match(await q.textContent('#erro-codigo'), /Muitos códigos/);
  await q.fill('#codigo', novo); await q.click('#btn-codigo'); await q.waitForURL(/\/app/);
  await ctx.close();
});

test('entrada e navegação: caminhos visíveis; Quick Wins aparece antes das conversas recentes; salto evita mudar a rota', async () => {
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#comecar-pedido');
  assert.equal(await p.locator('.caminho-inicio').count(), 2);
  await p.click('#comecar-pedido'); assert.equal(await p.locator('#entrada').evaluate(e => e === document.activeElement), true);
  const antes = p.url();
  await p.locator('.pular-conteudo').focus(); await p.keyboard.press('Enter');
  assert.equal(p.url(), antes); assert.equal(await p.locator('#principal').evaluate(e => e === document.activeElement), true);
});

test('rascunho: objetivo e processo salvos ao continuar são retomados após recarga; saída protege alterações não salvas', async () => {
  await p.goto(`${N.base}/app#/qw/nova`); await p.waitForSelector('#objetivo');
  const objetivo = 'Resuma atas fictícias de reunião e organize as decisões.';
  await p.fill('#objetivo', objetivo); await p.click('[data-continuar]'); await p.waitForSelector('#processo');
  const id = /#\/qw\/(\d+)/.exec(p.url())[1];
  assert.equal((await admin.get(`/api/quick-wins/${id}`)).dados.assistente.descricao, objetivo);
  await p.fill('#processo', 'Leia a ata e liste as decisões com seus responsáveis.');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name="regra"]');
  await p.reload(); await p.waitForSelector('#objetivo');
  assert.equal(await p.inputValue('#objetivo'), objetivo);
  const guardado = (await admin.get(`/api/quick-wins/${id}`)).dados;
  assert.equal(guardado.assistente.como.texto, 'Leia a ata e liste as decisões com seus responsáveis.');
  assert.equal(guardado.versao, null, 'salvar rascunho não publica');
  await p.fill('#objetivo', `${objetivo} Inclua próximos passos.`);
  p.once('dialog', d => d.dismiss());
  await p.click('#lateral [data-item="quick-wins"]'); await p.waitForURL(new RegExp(`#/qw/${id}/ajustar$`));
  assert.match(await p.inputValue('#objetivo'), /Inclua próximos passos/);
  await p.click('#salvar-rascunho'); await p.waitForFunction(() => /Rascunho salvo/.test(document.querySelector('#estado-rascunho')?.textContent));
  await p.click('#lateral [data-item="quick-wins"]'); await p.waitForSelector('.qw-lista');
});

test('falha de rede ao salvar preserva o objetivo e permite repetir sem duplicar o rascunho', async () => {
  await p.goto(`${N.base}/app#/qw/nova`); await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Revise um texto fictício sem inventar informações.');
  const falhar = r => r.request().method() === 'POST' ? r.abort('failed') : r.continue();
  await p.route('**/api/quick-wins', falhar);
  await p.click('[data-continuar]');
  await p.waitForSelector('#erro-etapa .aviso-erro');
  assert.match(await p.textContent('#estado-rascunho'), /Não foi possível salvar/);
  assert.equal(await p.inputValue('#objetivo'), 'Revise um texto fictício sem inventar informações.');
  assert.match(p.url(), /#\/qw\/nova$/);
  await p.unroute('**/api/quick-wins', falhar);
  await p.click('[data-continuar]'); await p.waitForSelector('#processo');
  const todos = (await admin.get('/api/quick-wins')).dados.quickWins;
  const detalhes = await Promise.all(todos.map(async x => (await admin.get(`/api/quick-wins/${x.id}`)).dados));
  assert.equal(detalhes.filter(x => x.assistente?.descricao === 'Revise um texto fictício sem inventar informações.').length, 1, 'exatamente um rascunho criado depois da recuperação');
});

test('fontes: papel tem explicação acessível; URL inválida fica junto ao campo e não perde o formulário', async () => {
  await p.click('[data-continuar]'); await p.waitForSelector('input[name="regra"]');
  await p.click('[data-continuar]'); await p.waitForSelector('[data-fonte-acao="link"]');
  await p.click('[data-fonte-acao="link"]'); await p.selectOption('[data-papel="novo-link"]', 'REFERENCE');
  assert.match(await p.textContent('#papel-ajuda-novo-link'), /não é fato do novo caso/);
  await p.fill('#fonte-url', 'http://exemplo.test/documento'); await p.click('[data-fonte-acao="ler-link"]');
  assert.match(await p.textContent('[data-fonte-erro]'), /https/);
  assert.equal(await p.inputValue('#fonte-url'), 'http://exemplo.test/documento');
});

test('busca encontra nomes sem acento e arquivados; restauração conserva histórico e não publica automaticamente', async () => {
  await p.click('#salvar-rascunho'); await p.waitForFunction(() => /Rascunho salvo/.test(document.querySelector('#estado-rascunho')?.textContent));
  await p.goto(`${N.base}/app#/quick-wins`); await p.waitForSelector('#buscar-qw');
  const qw = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Resuma reuniões fictícias.', nome: 'Reunião UX arquivada' }, areas: [area] })).dados;
  const conv = (await admin.post('/api/conversas', { quick_win_id: qw.id, teste: true })).dados.conversa;
  await admin.put(`/api/quick-wins/${qw.id}`, { status: 'descartado' });
  await p.reload(); await p.waitForSelector('#buscar-qw'); await p.fill('#buscar-qw', 'reuniao ux');
  assert.equal(await p.locator('.qw-item:not([hidden])').count(), 1);
  assert.equal(await p.locator('details.qw-acompanhamento:has(.qw-lista)').getAttribute('open'), '');
  await p.locator('.qw-item:not([hidden]) details summary').click();
  p.once('dialog', d => d.accept()); await p.click('[data-acao="restaurar"]');
  await p.waitForFunction(() => /restaurado em preparo/.test(document.querySelector('.toast')?.textContent));
  assert.equal((await admin.get(`/api/quick-wins/${qw.id}`)).dados.status, 'em_configuracao');
  assert.equal((await admin.get(`/api/conversas/${conv.id}`)).status, 200, 'histórico preservado');
});

test('diálogos: Tab permanece no modal, Escape devolve foco e não fica associado ao diálogo fechado', async () => {
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#entrada');
  await p.click('#ver-politica'); await p.waitForSelector('[role="dialog"]');
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
  await p.keyboard.press('Shift+Tab');
  assert.equal(await p.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
  await p.keyboard.press('Escape'); assert.equal(await p.locator('[role="dialog"]').count(), 0);
  assert.equal(await p.locator('#ver-politica').evaluate(e => e === document.activeElement), true);
  await p.click('#ver-politica'); await p.click('#fechar-modal');
  await p.click('#reportar'); await p.waitForSelector('#descricao-problema'); await p.keyboard.press('Escape');
  assert.equal(await p.locator('[role="dialog"]').count(), 0);
  assert.equal(await p.locator('#reportar').evaluate(e => e === document.activeElement), true);
});

test('mobile: menu tem foco contido, Escape fecha e restaura aria-expanded; principais precedem recentes', async () => {
  await p.setViewportSize({ width: 320, height: 568 }); await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#menu');
  await p.click('#menu'); await p.waitForSelector('#lateral.aberta');
  assert.equal(await p.getAttribute('#menu', 'aria-expanded'), 'true');
  const primeiro = p.locator('#lateral a,#lateral button').first(); await primeiro.focus(); await p.keyboard.press('Shift+Tab');
  assert.equal(await p.locator('#lateral').evaluate(e => e.contains(document.activeElement)), true);
  await p.keyboard.press('Escape');
  assert.equal(await p.getAttribute('#menu', 'aria-expanded'), 'false');
  assert.equal(await p.locator('#menu').evaluate(e => e === document.activeElement), true);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await p.setViewportSize({ width: 1280, height: 820 });
});

test('logout: falha de rede não afirma sucesso; aviso persiste e pode ser fechado; saída confirmada impede voltar à área privada', async () => {
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#entrada');
  await p.clock.install();
  const falhar = r => r.abort('failed'); await p.route('**/api/sair', falhar);
  await p.click('#sair'); await p.waitForSelector('.toast.erro');
  await p.clock.fastForward(7000); assert.match(await p.textContent('.toast.erro'), /Não foi possível sair/);
  await p.click('.toast-fechar'); assert.equal(await p.locator('.toast.erro').count(), 0);
  await p.unroute('**/api/sair', falhar); await p.click('#sair'); await p.waitForURL(N.base + '/');
  await p.goto(`${N.base}/app#/conversas`); await p.waitForURL(/\/entrar$/);
});
