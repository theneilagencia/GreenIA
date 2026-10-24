// Formatação das telas de Quick Win (biblioteca, página, usar, testar, editar, modelos, versões, publicar,
// agendamentos, resultados do processo e processos prontos), para quem gerencia e para quem só usa, em 1920, 1366 e
// 390 px: cartões irmãos com o primeiro texto na mesma altura e a mesma altura na linha, nenhum texto cortado com
// reticências numa linha só (inclusive o título do cabeçalho no celular) e nenhuma rolagem horizontal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const LARGURAS = [1920, 1366, 390];
let S, nav, admin, pessoa, legado, teste, v2;

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Layout', slug: 'empresa-layout', status: 'ativa', admin_email: 'admin@layout.test' });
  admin = S.navegador(); await admin.get('/empresa-layout'); await admin.entrarEmpresa('admin@layout.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@layout.test', name: 'Pessoa Layout', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  await admin.put(`/api/admin/pessoas/${(lista.pessoas || lista).find(x => x.email === 'pessoa@layout.test').id}`, { areas: [{ id: area }] });
  // Formato anterior em uso (com resultados do processo preparados) e em teste; formato atual publicado e agendado.
  legado = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${legado.id}`, { nome: 'Conferência de pedido × nota fiscal de entrada do fornecedor', status: 'em_uso', sugestoes: ['Confira estes dois documentos e liste as diferenças', 'Os valores dos dois documentos batem?'] });
  const modelos = (await admin.get('/api/paineis-modelos')).dados.modelos;
  await admin.post(`/api/quick-wins/${legado.id}/painel`, { modelo: modelos[0].id });
  teste = (await admin.post('/api/quick-wins', { modelo_inicial: 4, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${teste.id}`, { status: 'em_teste' });
  v2 = (await admin.post('/api/quick-wins', { assistente: { nome: 'Resumo semanal de atendimento', descricao: 'Resuma as reclamações da semana em uma lista com o assunto, a quantidade e o que precisa de resposta.', operacao: { v: 2, origem: 'pessoa', entregaveis: [{ id: 'e1', tipo: 'texto', rotulo: 'Resumo' }], ferramentas: [] } }, areas: [area] })).dados;
  assert.equal((await admin.post(`/api/quick-wins/${v2.id}/publicar`, {})).status, 200);
  const prog = (await admin.post(`/api/quick-wins/${v2.id}/programacoes`, { nome: 'Resumo de segunda-feira', tipo: 'horario', agenda: { frequencia: 'semanal', hora: '08:00', fuso: 'America/Sao_Paulo', dia: 1 }, entrada: 'Reclamações da semana: atraso (3), cobrança em dobro (1).', limite_creditos: 100, max_dia: 1 })).dados;
  await admin.post(`/api/quick-wins/${v2.id}/programacoes/${prog.id}/estado`, { ativa: true });
  pessoa = S.navegador(); await pessoa.get('/empresa-layout'); await pessoa.entrarEmpresa('pessoa@layout.test');
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

// Mede a tela atual: rolagem horizontal, conjuntos de cartões e textos cortados.
function medir() {
  const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const primeiroTexto = el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent.trim().length > 1 && visivel(n.parentElement) ? 1 : 3) });
    const n = w.nextNode(); if (!n) return null;
    const rg = document.createRange(); rg.selectNodeContents(n); return rg.getClientRects()[0] || null;
  };
  const nome = e => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')} "${e.textContent.trim().slice(0, 40)}"`;
  const falhas = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) falhas.push(`rolagem horizontal: ${document.documentElement.scrollWidth}px em ${vw}px`);
  const raiz = document.querySelector('#principal .pg');
  if (!raiz) return ['sem conteúdo da página (.pg)'];
  // Cartões: os da grade padrão e qualquer conjunto de irmãos com borda ou fundo próprio lado a lado.
  const grupos = [];
  for (const c of [raiz, ...raiz.querySelectorAll('*')]) {
    const cs = getComputedStyle(c);
    if (!(cs.display.includes('grid') || (cs.display.includes('flex') && !cs.flexDirection.startsWith('column')))) continue;
    const cartoes = [...c.children].filter(visivel).filter(f => {
      if (f.classList.contains('cartao')) return true;
      const fs = getComputedStyle(f);
      return (parseFloat(fs.borderTopWidth) > 0 && fs.borderTopStyle !== 'none' && parseFloat(fs.borderLeftWidth) > 0) && f.getBoundingClientRect().height > 60;
    });
    if (cartoes.length < 2) continue;
    const linhas = new Map();
    for (const f of cartoes) { const t = Math.round(f.getBoundingClientRect().top); const k = [...linhas.keys()].find(x => Math.abs(x - t) < 3) ?? t; linhas.set(k, [...(linhas.get(k) || []), f]); }
    for (const g of linhas.values()) if (g.length > 1) grupos.push({ c, g });
  }
  for (const { c, g } of grupos) {
    const off = g.map(f => { const r = primeiroTexto(f); return r ? r.top - f.getBoundingClientRect().top : null; }).filter(v => v !== null);
    if (off.length > 1 && Math.max(...off) - Math.min(...off) > 4) falhas.push(`primeiro texto desalinhado em ${nome(c)}: ${off.map(Math.round).join('/')}`);
    const alt = g.map(f => f.getBoundingClientRect().height);
    if (g.every(f => f.classList.contains('cartao')) && Math.max(...alt) - Math.min(...alt) > 1) falhas.push(`cartões da mesma linha com alturas diferentes em ${nome(c)}: ${alt.map(Math.round).join('/')}`);
  }
  // Texto cortado: reticências numa linha só (cabe em duas linhas) na página e no título do cabeçalho.
  for (const e of [...raiz.querySelectorAll('*'), ...document.querySelectorAll('#principal > .cabeca h1')]) {
    if (!visivel(e) || !e.textContent.trim()) continue;
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap' && e.scrollWidth > e.clientWidth + 1) falhas.push(`texto cortado: ${nome(e)}`);
    if (cs.webkitLineClamp === '1' && e.scrollHeight > e.clientHeight + 1) falhas.push(`texto cortado em uma linha: ${nome(e)}`);
  }
  return falhas;
}

async function conferir(sessao, telas) {
  const u = new URL(S.base);
  const falhas = [];
  for (const largura of LARGURAS) {
    const ctx = await nav.newContext({ viewport: { width: largura, height: largura >= 1200 ? Math.round(largura * 0.5625) : 844 }, isMobile: largura < 700, hasTouch: largura < 700, deviceScaleFactor: 1 });
    await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
    const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
    for (const [nome, rota] of telas) {
      await p.goto(`${S.base}/app#${rota}`);
      await p.locator('#principal .pg').first().waitFor();
      await p.waitForLoadState('networkidle').catch(() => {});
      await p.waitForTimeout(250);
      for (const f of await p.evaluate(medir)) falhas.push(`${nome} em ${largura}px: ${f}`);
    }
    assert.deepEqual(erros, [], `erros de página em ${largura}px`);
    await ctx.close();
  }
  assert.deepEqual(falhas, []);
}

test('quem gerencia: telas de Quick Win alinhadas em 1920, 1366 e 390 px', async () => {
  await conferir(admin, [
    ['biblioteca', '/quick-wins'], ['página (formato anterior)', `/qw/${legado.id}`], ['página', `/qw/${v2.id}`],
    ['usar', `/qw/${legado.id}/usar`], ['testar (formato anterior)', `/qw/${teste.id}/teste`], ['testar', `/qw/${v2.id}/teste`],
    ['configurar', `/qw/${legado.id}/editar`], ['configurar acesso', `/qw/${v2.id}/editar`], ['editar', `/qw/${v2.id}/ajustar`],
    ['criar', '/qw/nova'], ['modelos', '/qw/nova/modelos'], ['versões', `/qw/${v2.id}/versoes`], ['versões (formato anterior)', `/qw/${legado.id}/versoes`],
    ['publicar', `/qw/${teste.id}/publicar`], ['agendamentos', `/qw/${v2.id}/programacoes`], ['agendamentos (formato anterior)', `/qw/${legado.id}/programacoes`],
    ['agendar', `/qw/${v2.id}/programar`], ['agendar (formato anterior)', `/qw/${legado.id}/programar`], ['agendados', '/quick-wins/programados'],
    ['resultados do processo', `/qw/${legado.id}/acompanhamento`], ['preparar resultados', `/qw/${teste.id}/acompanhamento/preparar`], ['processos prontos', '/quick-wins/processos'],
  ]);
});

test('quem só usa: biblioteca, página, usar e agendamentos alinhados em 1920, 1366 e 390 px', async () => {
  await conferir(pessoa, [['biblioteca', '/quick-wins'], ['página', `/qw/${legado.id}`], ['página (formato atual)', `/qw/${v2.id}`], ['usar', `/qw/${legado.id}/usar`], ['agendamentos', `/qw/${v2.id}/programacoes`], ['agendados', '/quick-wins/programados']]);
});

test('o cabeçalho de Agendamentos cabe no celular e a biblioteca curta não mostra busca', async () => {
  const u = new URL(S.base);
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([...pessoa.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage();
  await p.goto(`${S.base}/app#/qw/${v2.id}/programacoes`);
  await p.locator('#principal .pg').waitFor();
  assert.equal(await p.locator('.cabeca h1').innerText(), 'Agendamentos');
  assert.ok(await p.locator('.cabeca h1').evaluate(h => h.scrollWidth <= h.clientWidth + 1), 'título do cabeçalho inteiro');
  await p.goto(`${S.base}/app#/quick-wins`);
  await p.locator('.qw-item').first().waitFor();
  const n = await p.locator('.qw-item:visible').count();
  // Lista curta não mostra busca nem contagem (a contagem da lista longa é conferida em qa-caminho-quickwins).
  assert.ok(n <= 6, `lista curta: ${n}`);
  assert.equal(await p.locator('#buscar-qw, #contagem-qw').count(), 0);
  await ctx.close();
});
