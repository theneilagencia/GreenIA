// Padrão "caminho claro" nas telas de quem usa (Conversas, conversa aberta, Pendências, Conhecimento nas duas visões,
// Primeiros passos, Ajuda e lateral), a 1366 e a 390 px: uma ação principal na primeira vista (zero nas telas de
// leitura), poucos controles à vista, no máximo um aviso, nenhuma explicação recolhida na tela e as explicações
// disponíveis na Ajuda. Os fluxos principais continuam funcionando (enviar documento, filtrar, guia, busca).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { exec } from '../src/db.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const LARGURAS = [{ width: 1366, height: 768 }, { width: 390, height: 844, isMobile: true, hasTouch: true }];
let S, nav, admin, gestora, pessoa, db, area, documento;
const u = () => new URL(S.base);
const b64 = t => Buffer.from(t).toString('base64');

async function pagina(sessao, vp = LARGURAS[0]) {
  const ctx = await nav.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  await p.emulateMedia({ reducedMotion: 'reduce' });
  return p;
}
async function abrir(p, hash, pronto) {
  await p.goto(`${S.base}/app${hash}`);
  await p.waitForFunction(() => document.querySelector('#principal h1') && !document.querySelector('#principal').hasAttribute('aria-busy'));
  if (pronto) await p.waitForSelector(pronto);
  await p.waitForTimeout(150);
}
// A mesma medida da varredura (scratchpad/caminho/varredura.mjs): o que está no conteúdo, à vista, até a dobra.
const medir = p => p.evaluate(() => {
  const main = document.querySelector('#principal');
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden],.oculto,.sr,#lateral,.lateral'); };
  const dobra = e => e.getBoundingClientRect().top < innerHeight;
  const q = s => [...main.querySelectorAll(s)].filter(vis);
  const primarios = q('.btn-verde, .btn-primario, button.cartao, a.btn-verde').filter(dobra);
  const interativos = q('a[href], button, select, input:not([type=hidden]), textarea, summary').filter(dobra);
  return {
    primarios: primarios.map(b => b.innerText.trim()), interativos: interativos.length,
    avisos: q('.faixa-aviso, .aviso, .callout, .caixa-ajuda, .dica-caixa, .comece').length,
    detalhes: q('details').map(d => d.className || 'details'),
    cromo: interativos.filter(e => !e.closest('#coluna')).length,
  };
});
const ajuda = async p => {
  await p.click('#ajuda-tela'); await p.waitForSelector('#ajuda-titulo');
  const texto = await p.locator('.ajuda-contextual').innerText();
  await p.keyboard.press('Escape'); await p.waitForSelector('#ajuda-titulo', { state: 'detached' });
  return texto;
};
const tag = vp => `${vp.width}px`;

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Caminho', slug: 'caminho', status: 'ativa', admin_email: 'admin@caminho.test' })).dados;
  db = S.P.tenant(emp.id).db;
  admin = S.navegador(); await admin.get('/caminho'); await admin.entrarEmpresa('admin@caminho.test');
  area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  for (const [email, name] of [['gestora@caminho.test', 'Gestora Base'], ['pessoa@caminho.test', 'Pessoa Uso']]) await admin.post('/api/empresa/usuarios', { email, name, role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  const id = email => (lista.pessoas || lista).find(x => x.email === email).id;
  await admin.put(`/api/admin/pessoas/${id('gestora@caminho.test')}`, { areas: [{ id: area, responsavel: true, adminBase: true }] });
  await admin.put(`/api/admin/pessoas/${id('pessoa@caminho.test')}`, { areas: [{ id: area }] });
  gestora = S.navegador(); await gestora.get('/caminho'); await gestora.entrarEmpresa('gestora@caminho.test');
  pessoa = S.navegador(); await pessoa.get('/caminho'); await pessoa.entrarEmpresa('pessoa@caminho.test');
  documento = (await gestora.post('/api/bases/documentos', { area_id: area, titulo: 'Procedimento de recebimento', pasta: 'Procedimentos', arquivo: { nome: 'recebimento.txt', base64: b64('Todo pedido recebido é conferido em até 2 dias úteis.') } })).dados;
  await gestora.post('/api/bases/documentos', { area_id: area, titulo: 'Manual de compras', pasta: 'Manuais', arquivo: { nome: 'compras.txt', base64: b64('Manual fictício de compras.') } });
  // Um documento para revisar: a gestora tem uma pendência e um aviso que pede ação no Conhecimento.
  exec(db, "update documentos set revisado_em = datetime('now','-200 days') where id = ?", documento.id);
  for (const titulo of ['Pedido 4471 da papelaria', 'Nota de insumos de agosto']) {
    const c = (await pessoa.post('/api/conversas', {})).dados.conversa;
    await pessoa.req('POST', `/api/conversas/${c.id}/mensagens`, { texto: 'Escreva um email curto avisando a equipe sobre a nova rotina' });
    await pessoa.req('PATCH', `/api/conversas/${c.id}`, { titulo });
  }
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

for (const vp of LARGURAS) {
  test(`Conversas (${tag(vp)}): "Nova conversa" é a única ação principal; lista curta sem busca; retenção na Ajuda`, async () => {
    const p = await pagina(pessoa, vp);
    await abrir(p, '#/conversas', '.hc-conversa');
    const m = await medir(p);
    assert.deepEqual(m.primarios.map(t => t.replace(/\s+/g, ' ')), ['Nova conversa']);
    assert.ok(m.interativos <= 12, `interativos ${m.interativos}`);
    assert.ok(m.avisos <= 1); assert.deepEqual(m.detalhes, []);
    assert.equal(await p.locator('#hc-busca').isVisible(), false, 'duas conversas: sem busca nem filtro');
    assert.doesNotMatch(await p.locator('#principal').innerText(), /excluídas após|Seu histórico|Retome de onde parou/);
    assert.match(await ajuda(p), /excluídas após \d+ dias/);
    assert.equal(await p.locator('#lateral .btn-verde').count(), 0, 'a lateral não compete com a ação da tela');
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });

  test(`Conversa aberta (${tag(vp)}): tela de leitura, sem ação principal nem explicação; política e guarda na Ajuda`, async () => {
    const p = await pagina(pessoa, vp);
    const id = (await pessoa.get('/api/conversas?todas=1')).dados.conversas[0].id;
    await abrir(p, `#/c/${id}`, '.rodape-resposta');
    const m = await medir(p);
    assert.deepEqual(m.primarios, []);
    assert.ok(m.cromo <= 10, `controles fora das mensagens: ${m.cromo}`);
    assert.ok(m.avisos <= 1);
    assert.deepEqual(m.detalhes.filter(c => !/info-resposta/.test(c)), [], 'só o "i" técnico da resposta fica recolhido');
    assert.doesNotMatch(await p.locator('.nota-compositor').innerText(), /dias|política/i);
    const texto = await ajuda(p);
    assert.match(texto, /salvas por até \d+ dias/); assert.match(texto, /Dado bloqueado pela política não é enviado/);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });

  test(`Conhecimento, quem consulta (${tag(vp)}): busca à vista, filtros fechados, nada recolhido; explicações na Ajuda`, async () => {
    const p = await pagina(pessoa, vp);
    await abrir(p, '#/conhecimento', '[data-documento]');
    const m = await medir(p);
    assert.ok(m.primarios.length <= 1, JSON.stringify(m.primarios));
    assert.ok(m.interativos <= 12, `interativos ${m.interativos}`);
    assert.ok(m.avisos <= 1); assert.deepEqual(m.detalhes, []);
    assert.ok(await p.locator('#conhecimento-busca').isVisible());
    assert.equal(await p.locator('.conhecimento-vistas').count(), 0);
    assert.equal(await p.locator('#conhecimento-filtros').isVisible(), false);
    assert.doesNotMatch(await p.locator('#principal').innerText(), /O que a IA pode consultar|Como este conteúdo é usado|Como usar/);
    // Filtrar revela base, pasta e ordem; o filtro funciona e "Limpar filtros" aparece.
    await p.click('#conhecimento-filtrar'); await p.waitForSelector('#conhecimento-filtros:not([hidden])');
    await p.selectOption('#conhecimento-pasta', { label: 'Manuais' });
    assert.equal(await p.locator('[data-documento]').count(), 1);
    await p.click('[data-limpar-conhecimento]'); assert.equal(await p.locator('[data-documento]').count(), 2);
    const texto = await ajuda(p);
    assert.match(texto, /O que a IA pode consultar\?/); assert.match(texto, /Como este conteúdo é usado\?/); assert.match(texto, /Mudar a pasta|só organizam os arquivos/);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });

  test(`Conhecimento, quem gerencia (${tag(vp)}): "Enviar documento" é a ação principal nas duas visões; troca discreta; um aviso`, async () => {
    const p = await pagina(gestora, vp);
    await abrir(p, '#/conhecimento', '[data-documento]');
    for (const vista of ['usar', 'gerir']) {
      if (vista === 'gerir') { await p.click('[data-conhecimento-vista="gerir"]'); await p.waitForSelector('[data-editar-conhecimento]'); }
      const m = await medir(p);
      assert.deepEqual(m.primarios.map(t => t.replace(/\s+/g, ' ')), ['Enviar documento'], vista);
      assert.ok(m.interativos <= 12, `${vista}: interativos ${m.interativos}`);
      assert.ok(m.avisos <= 1); assert.deepEqual(m.detalhes, [], vista);
      assert.equal(await p.locator('.conhecimento-vistas .btn-verde').count(), 0, 'a troca de visão não parece ação principal');
    }
    // O único aviso pede ação: "Ver qual" aplica o filtro de revisão.
    await p.click('[data-filtrar-revisao]');
    assert.equal(await p.inputValue('#conhecimento-status'), 'revisar');
    assert.equal(await p.locator('[data-documento]').count(), 1);
    await p.click('[data-limpar-conhecimento]');
    // Enviar: o painel abre com foco no título e a ação do topo sai de cena (uma ação principal por vez).
    await p.click('#conhecimento-enviar');
    await p.waitForSelector('#envio-conhecimento:not([hidden])');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'envio-titulo');
    assert.equal(await p.locator('#conhecimento-enviar').isVisible(), false);
    assert.deepEqual(await p.locator('#principal .btn-verde').evaluateAll(bs => bs.filter(b => b.getBoundingClientRect().width > 0).map(b => b.innerText.trim())), ['Revisar envio']);
    await p.click('#doc-fechar'); await p.waitForSelector('#envio-conhecimento', { state: 'hidden' });
    assert.equal(await p.evaluate(() => document.activeElement.id), 'conhecimento-enviar');
    assert.match(await ajuda(p), /Como enviar um documento\?/);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });

  test(`Pendências (${tag(vp)}): a primeira pendência é a ação principal; filtros atrás de "Filtrar"`, async () => {
    const p = await pagina(gestora, vp);
    await abrir(p, '#/pendencias', '#pend-lista li');
    const m = await medir(p);
    assert.deepEqual(m.primarios, ['Ver e resolver']);
    assert.ok(m.interativos <= 12, `interativos ${m.interativos}`);
    assert.ok(m.avisos <= 1); assert.deepEqual(m.detalhes, []);
    assert.equal(await p.locator('#pend-filtros').isVisible(), false);
    await p.click('#pend-filtrar'); assert.ok(await p.locator('#pend-tipo').isVisible());
    assert.match(await ajuda(p), /Ver e resolver/);
    // Quem não tem pendências: uma frase e uma ação.
    const q = await pagina(pessoa, vp);
    await abrir(q, '#/pendencias', '#pend-lista li');
    assert.equal(await q.locator('#pend-lista .btn').count(), 1);
    assert.deepEqual(p.erros, []); assert.deepEqual(q.erros, []);
    await p.context().close(); await q.context().close();
  });

  test(`Primeiros passos (${tag(vp)}): "Próximo passo" à vista como única ação principal; o guia avança`, async () => {
    const p = await pagina(pessoa, vp);
    await abrir(p, '#/primeiros-passos', '#guia-seguir');
    const m = await medir(p);
    assert.deepEqual(m.primarios, ['Próximo passo']);
    assert.ok(m.interativos <= 12, `interativos ${m.interativos}`);
    assert.equal(m.avisos, 0); assert.deepEqual(m.detalhes, []);
    await p.click('#guia-seguir'); assert.match(await p.textContent('#guia-titulo'), /contexto/);
    assert.match(await ajuda(p), /não envia arquivos nem executa tarefas/);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });
}

test('Conversas: com a lista longa, busca e filtro aparecem e funcionam', async () => {
  for (let i = 0; i < 6; i++) await pessoa.post('/api/conversas', {}).then(r => pessoa.req('PATCH', `/api/conversas/${r.dados.conversa.id}`, { titulo: `Análise ${i}` }));
  const p = await pagina(pessoa);
  await abrir(p, '#/conversas', '.hc-conversa');
  assert.ok(await p.locator('#hc-busca').isVisible());
  await p.fill('#hc-busca', 'papelaria');
  await p.waitForFunction(() => document.querySelectorAll('.hc-conversa').length === 1);
  assert.deepEqual(p.erros, []);
  await p.context().close();
});

test('Lateral de quem usa: "Nova conversa" discreta, destacada só quando é o lugar atual; selo só com revisão pendente', async () => {
  const p = await pagina(gestora);
  await abrir(p, '#/nova', '#entrada');
  assert.equal(await p.getAttribute('#lateral a.nova', 'aria-current'), 'page');
  assert.equal(await p.locator('#lateral .btn-verde').count(), 0);
  assert.match(await p.locator('#lateral [data-item="conhecimento"] .selo-lat.alerta').innerText(), /^1\b/);
  exec(db, "update documentos set revisado_em = datetime('now') where id = ?", documento.id);
  const q = await pagina(gestora);
  await abrir(q, '#/conversas', '.hc-pagina');
  assert.equal(await q.locator('#lateral [data-item="conhecimento"] .selo-lat').count(), 0, 'sem selo informativo quando não há o que fazer');
  assert.equal(await q.locator('.cartao-base').count(), 0, 'sem cartão informativo da base no histórico');
  assert.deepEqual([...p.erros, ...q.erros], []);
  await p.context().close(); await q.context().close();
});
