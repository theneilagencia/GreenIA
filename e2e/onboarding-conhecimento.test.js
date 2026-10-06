// Jornadas com arquivos, pessoas e empresas fictícias. Nenhuma alteração em produção.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
let N, admin, A, B, comum, antigo;
const clientes = new Map();
const arquivo = (nome, texto) => ({ nome, base64: Buffer.from(texto).toString('base64') });
before(async () => {
  N = await subirComNavegador(); salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  clientes.set('admin', admin);
  A = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados;
  B = (await admin.post('/api/admin/areas', { nome: 'Financeiro reservado' })).dados;
  for (const [email, areas] of [['leitora', [{ id: A.id }]], ['gestora', [{ id: A.id, adminBase: true }]], ['outra', [{ id: B.id }]]]) await admin.post('/api/admin/pessoas', { email: `${email}@empresa-exemplo.com.br`, nome: email, areas });
  antigo = (await admin.post('/api/bases/documentos', { area_id: A.id, titulo: 'Política de viagens', pasta: 'Políticas', arquivo: arquivo('viagens.txt', 'Política fictícia de viagens. Prazo: 30 dias.') })).dados;
  exec(N.app.db, "update documentos set revisado_em = datetime('now','-200 days') where id = ?", antigo.id);
  await admin.post('/api/bases/documentos', { area_id: B.id, titulo: 'Segredo da área Beta', pasta: 'Reservado', arquivo: arquivo('beta.txt', 'Documento fictício da área Beta.') });
  comum = (await admin.post('/api/bases/documentos', { toda_empresa: true, titulo: 'Manual comum', pasta: 'Manuais', arquivo: arquivo('manual.txt', 'Manual fictício para a empresa toda.') })).dados;
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N?.fechar(); });
const abrir = async (email, rota = '#/conhecimento') => {
  if (!clientes.has(email)) clientes.set(email, await cliente(N.app, N.base).entrar(`${email}@empresa-exemplo.com.br`));
  const sessao = clientes.get(email).cookie, corte = sessao.indexOf('=');
  await N.contexto.addCookies([{ name: sessao.slice(0, corte), value: sessao.slice(corte + 1), url: N.base }]);
  const p = await N.contexto.newPage(); await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(`${N.base}/app${rota}`); await p.waitForSelector(rota === '#/primeiros-passos' ? '#guia-seguir' : rota === '#/nova' ? '#entrada' : '#conhecimento-busca'); return p;
};

test('guia: quatro passos para usuário, progresso retomável, conclusão e ajuda reaberta; conta diferente não herda conclusão', async () => {
  const p = await abrir('leitora', '#/primeiros-passos');
  assert.equal(await p.locator('[data-guia-passo]').count(), 4);
  await p.click('#guia-seguir'); assert.match(await p.textContent('#guia-titulo'), /contexto/);
  await p.reload(); await p.waitForSelector('#guia-titulo'); assert.match(await p.textContent('#guia-titulo'), /contexto/);
  await p.click('a[href="#/nova"]'); await p.waitForSelector('#entrada');
  assert.equal(await p.locator('#modal [role="dialog"]').count(), 0, 'guia não bloqueia o trabalho');
  await p.click('[aria-label="Ajuda e primeiros passos"]'); await p.waitForSelector('#guia-titulo'); assert.match(await p.textContent('#guia-titulo'), /contexto/);
  await p.click('[data-guia-passo="3"]'); await p.click('#guia-seguir'); await p.waitForSelector('#entrada');
  assert.equal(await p.locator('.guia-convite').count(), 0);
  await p.click('[aria-label="Ajuda e primeiros passos"]'); await p.waitForSelector('#guia-seguir'); assert.match(await p.textContent('.guia-pagina'), /Guia concluído/);
  const q = await abrir('outra', '#/nova'); assert.equal(await q.locator('.guia-convite').count(), 1);
  await p.close(); await q.close();
});

test('guia por perfil: gestora de base vê orientação de gestão; admin vê configuração; adiar não altera ciência ou acesso', async () => {
  const p = await abrir('gestora', '#/primeiros-passos'); assert.equal(await p.locator('[data-guia-passo]').count(), 5);
  const q = await abrir('admin', '#/primeiros-passos'); assert.equal(await q.locator('[data-guia-passo]').count(), 6);
  await q.goto(`${N.base}/app#/nova`); await q.waitForSelector('[data-adiar-guia]'); await q.click('[data-adiar-guia]'); await q.reload(); await q.waitForSelector('#entrada');
  assert.equal(await q.locator('.guia-convite').count(), 0); assert.equal(await q.locator('[aria-label="Ajuda e primeiros passos"]').count(), 1);
  assert.equal((await admin.get('/api/eu')).dados.pessoa.admin, true);
  await p.close(); await q.close();
});

test('biblioteca: usuário só vê sua área e documentos comuns; filtros sem acentos e revisão não revelam bases alheias', async () => {
  const p = await abrir('leitora');
  assert.equal(await p.locator('[data-documento]').count(), 2);
  assert.doesNotMatch(await p.textContent('#conteudo'), /Segredo da área Beta|Financeiro reservado|Gerenciar bases/);
  assert.equal(await p.locator('#doc-arquivo').count(), 0);
  await p.fill('#conhecimento-busca', 'politica'); assert.equal(await p.locator('[data-documento]').count(), 1);
  await p.click('[data-limpar-conhecimento]'); await p.selectOption('#conhecimento-pasta', { label: 'Manuais' }); assert.match(await p.textContent('#conhecimento-lista'), /Manual comum/);
  await p.click('[data-limpar-conhecimento]'); await p.click('[data-filtrar-revisao]'); assert.equal(await p.locator('[data-documento]').count(), 1); assert.match(await p.textContent('#conhecimento-lista'), /Política de viagens/);
  await p.close();
});

test('gestão restrita: bases autorizadas, confirmação do envio, rede falha preserva arquivo, repetição grava uma vez', async () => {
  const p = await abrir('gestora'); await p.click('[data-conhecimento-vista="gerir"]');
  assert.deepEqual(await p.locator('#doc-destino option').allTextContents(), ['Operações']);
  assert.doesNotMatch(await p.textContent('#conteudo'), /Segredo da área Beta|Financeiro reservado|Manual comum/);
  await p.click('#envio-conhecimento>summary');
  await p.setInputFiles('#doc-arquivo', { name: 'roteiro.txt', mimeType: 'text/plain', buffer: Buffer.from('Roteiro fictício de operação.') });
  await p.fill('#doc-titulo', 'Roteiro de operação'); await p.fill('#doc-pasta', 'Procedimentos'); await p.check('#doc-sigiloso');
  await p.click('#btn-doc'); assert.match(await p.textContent('#doc-confirmacao'), /Operações.*pessoas desta área/s);
  assert.equal(um(N.app.db, "select count(*) as n from documentos where titulo = 'Roteiro de operação'").n, 0, 'revisar ainda não disponibiliza');
  const falhar = r => r.request().method() === 'POST' ? r.abort() : r.continue(); await p.route('**/api/bases/documentos', falhar);
  await p.click('#btn-doc'); await p.waitForSelector('#doc-erro:not([hidden])');
  assert.equal(await p.locator('#doc-arquivo').evaluate(e => e.files.length), 1);
  await p.unroute('**/api/bases/documentos', falhar);
  await p.click('#btn-doc'); await p.waitForSelector('[data-documento]:has-text("Roteiro de operação")');
  const d = um(N.app.db, "select * from documentos where titulo = 'Roteiro de operação'"); assert.equal(d.area_id, A.id); assert.equal(d.sigiloso, 1);
  assert.equal(um(N.app.db, "select count(*) as n from documentos where titulo = 'Roteiro de operação'").n, 1);
  await p.close();
});

test('edição, substituição e revisão preservam a base; falha de rede mantém alterações; acesso à outra base continua recusado', async () => {
  const p = await abrir('gestora'); await p.click('[data-conhecimento-vista="gerir"]');
  await p.click(`[data-editar-conhecimento="${antigo.id}"]`); await p.waitForSelector('#conhecimento-ed-nome');
  await p.fill('#conhecimento-ed-nome', 'Política de viagens revisada'); await p.fill('#conhecimento-ed-pasta', 'Normas');
  await p.setInputFiles('#conhecimento-ed-arquivo', { name: 'nova.txt', mimeType: 'text/plain', buffer: Buffer.from('Prazo fictício atualizado: 40 dias.') });
  const falhar = r => r.abort(); await p.route(`**/api/bases/documentos/${antigo.id}`, falhar);
  await p.click('#conhecimento-ed-salvar'); await p.waitForSelector('#conhecimento-ed-erro:not([hidden])'); assert.equal(await p.inputValue('#conhecimento-ed-nome'), 'Política de viagens revisada');
  await p.unroute(`**/api/bases/documentos/${antigo.id}`, falhar);
  await p.click('#conhecimento-ed-salvar'); await p.waitForSelector('#conhecimento-ed-form', { state: 'detached' });
  await p.waitForSelector(`[data-documento="${antigo.id}"]:has-text("Política de viagens revisada")`);
  const d = um(N.app.db, 'select * from documentos where id = ?', antigo.id); assert.equal(d.area_id, A.id); assert.equal(d.pasta, 'Normas'); assert.match(d.texto, /40 dias/);
  assert.match(await p.locator(`[data-documento="${d.id}"]`).innerText(), /Conteúdo revisado/);
  exec(N.app.db, "update documentos set revisado_em = datetime('now','-200 days') where id = ?", d.id);
  await p.click('[data-atualizar-conhecimento]'); await p.waitForSelector(`[data-documento="${d.id}"]:has-text("Revisão recomendada")`);
  p.once('dialog', d => d.dismiss()); await p.click(`[data-revisar-conhecimento="${d.id}"]`);
  assert.ok(Date.now() - Date.parse(um(N.app.db, 'select revisado_em from documentos where id = ?', d.id).revisado_em.replace(' ', 'T') + 'Z') > 180 * 864e5, 'não registra revisão sem confirmar');
  p.once('dialog', d => d.accept()); await p.click(`[data-revisar-conhecimento="${d.id}"]`); await p.waitForSelector(`[data-documento="${d.id}"]:has-text("Conteúdo revisado")`);
  const c = clientes.get('gestora');
  assert.equal((await c.put(`/api/bases/documentos/${comum.id}`, { pasta: 'Tentativa' })).status, 404);
  assert.equal(um(N.app.db, 'select pasta from documentos where id = ?', comum.id).pasta, 'Manuais');
  await p.close();
});

test('biblioteca: filtros não descartam envio; saída não salva exige confirmação; Escape preserva edição quando descartada a saída', async () => {
  const p = await abrir('gestora'); await p.click('[data-conhecimento-vista="gerir"]'); await p.click('#envio-conhecimento>summary');
  await p.fill('#doc-titulo', 'Título ainda não enviado'); await p.click('[data-limpar-conhecimento]'); assert.equal(await p.inputValue('#doc-titulo'), 'Título ainda não enviado');
  p.once('dialog', d => d.dismiss()); await p.click('[aria-label="Ajuda e primeiros passos"]'); await p.waitForURL(/#\/conhecimento$/); assert.equal(await p.inputValue('#doc-titulo'), 'Título ainda não enviado');
  await p.fill('#doc-titulo', ''); await p.click(`[data-editar-conhecimento="${antigo.id}"]`); await p.fill('#conhecimento-ed-nome', 'Alteração não salva');
  p.once('dialog', d => d.dismiss()); await p.keyboard.press('Escape'); assert.equal(await p.inputValue('#conhecimento-ed-nome'), 'Alteração não salva');
  p.once('dialog', d => d.accept()); await p.click('#conhecimento-ed-cancelar'); await p.waitForSelector('#conhecimento-ed-form', { state: 'detached' });
  assert.equal(await p.locator(`[data-editar-conhecimento="${antigo.id}"]`).evaluate(e => e === document.activeElement), true, 'devolve o foco ao botão de origem');
  assert.notEqual(um(N.app.db, 'select titulo from documentos where id = ?', antigo.id).titulo, 'Alteração não salva'); await p.close();
});

test('biblioteca e guia: 320, 390, 768 e 1280 px sem transbordamento, erros JavaScript ou acesso perdido', async () => {
  const p = await abrir('admin'); const erros = []; p.on('pageerror', e => erros.push(e.message));
  for (const width of [320, 390, 768, 1280]) {
    await p.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    for (const rota of ['#/conhecimento', '#/primeiros-passos']) {
      await p.goto(`${N.base}/app${rota}`); await p.waitForSelector(rota.includes('conhecimento') ? '#conhecimento-busca' : '#guia-seguir');
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${rota} ${width}`);
      assert.ok(await p.locator('[aria-label="Ajuda e primeiros passos"]').isVisible());
      await p.screenshot({ path: `capturas/tmp/${rota.includes('conhecimento') ? 'biblioteca' : 'guia'}-${width}.png` });
    }
  }
  assert.deepEqual(erros, []); await p.close();
});

test('biblioteca grande: paginação preserva contagem e filtro; atualizar após revogar gestão remove ações', async () => {
  for (let i = 0; i < 23; i++) await admin.post('/api/bases/documentos', { area_id: A.id, titulo: `Procedimento fictício ${i}`, pasta: 'Rotinas', arquivo: arquivo(`${i}.txt`, `Procedimento fictício ${i}.`) });
  const p = await abrir('gestora'); await p.click('[data-conhecimento-vista="gerir"]');
  assert.equal(await p.locator('[data-documento]').count(), 20);
  await p.click('[data-mais-conhecimento]'); assert.equal(await p.locator('[data-documento]').count(), 25);
  await p.fill('#conhecimento-busca', 'ficticio'); assert.equal(await p.locator('[data-documento]').count(), 20); assert.match(await p.textContent('#conhecimento-contagem'), /23 documentos/);
  const id = um(N.app.db, "select id from pessoas where email = 'gestora@empresa-exemplo.com.br'").id;
  assert.equal((await admin.put(`/api/admin/pessoas/${id}`, { areas: [{ id: A.id, adminBase: false }] })).status, 200);
  await p.click('[data-atualizar-conhecimento]'); await p.waitForSelector('[data-conhecimento-vista="gerir"]', { state: 'detached' });
  assert.equal(await p.locator('[data-editar-conhecimento],#doc-arquivo').count(), 0);
  assert.doesNotMatch(await p.textContent('#conteudo'), /Segredo da área Beta|Financeiro reservado/);
  assert.equal((await clientes.get('gestora').put(`/api/bases/documentos/${antigo.id}`, { titulo: 'Tentativa sem permissão' })).status, 404);
  await p.close();
});

test('remover documento: cancelar preserva o arquivo; confirmar remove somente o documento escolhido', async () => {
  const d = (await admin.post('/api/bases/documentos', { area_id: A.id, titulo: 'Documento temporário QA', pasta: '__sem', arquivo: arquivo('temporario.txt', 'Conteúdo de teste descartável.') })).dados;
  const p = await abrir('admin'); await p.click('[data-conhecimento-vista="gerir"]'); await p.selectOption('#conhecimento-pasta', { label: '__sem' }); assert.equal(await p.locator('[data-documento]').count(), 1, 'nome de pasta não se confunde com o filtro Sem pasta'); await p.click(`[data-editar-conhecimento="${d.id}"]`);
  await p.click('.conhecimento-remover>summary'); p.once('dialog', d => d.dismiss()); await p.click('#conhecimento-ed-remover');
  assert.ok(um(N.app.db, 'select id from documentos where id = ?', d.id));
  p.once('dialog', d => d.accept()); await p.click('#conhecimento-ed-remover'); await p.waitForSelector('#conhecimento-ed-form', { state: 'detached' });
  assert.equal(um(N.app.db, 'select id from documentos where id = ?', d.id), undefined);
  assert.ok(um(N.app.db, 'select id from documentos where id = ?', comum.id), 'não remove outro documento');
  await p.close();
});
