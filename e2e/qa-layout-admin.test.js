// Formatação das telas de administração da empresa, em 1920, 1366 e 390 px: cartões lado a lado (padrão
// .grade-cartoes e indicadores) com o primeiro texto na mesma altura e a mesma altura na linha, nenhum texto cortado
// com reticências quando caberia em duas linhas e nenhuma rolagem horizontal da página.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const LARGURAS = [1920, 1366, 390];
const TELAS = ['visao-geral', 'visao-geral?passos=1', 'pessoas', 'pessoas?revisao=pendente', 'pessoas/areas', 'pessoas/grupos', 'pessoas/perfis', 'pessoas/criacao',
  'atividade/suporte', 'modelos', 'modelos/catalogo', 'modelos/roteamento', 'modelos/historico', 'politicas', 'politicas/texto', 'integracoes', 'uso', 'atividade', 'atividade/problemas',
  'empresa/marca', 'empresa/landing', 'empresa/url', 'configuracoes'];
let S, nav, admin;

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Layout', slug: 'empresa-layout', status: 'ativa', admin_email: 'admin@layout-adm.test' });
  admin = S.navegador(); await admin.get('/empresa-layout'); await admin.entrarEmpresa('admin@layout-adm.test');
  const areas = [];
  for (const nome of ['Atendimento ao cliente e pós-venda', 'Operações', 'Qualidade']) areas.push((await admin.post('/api/admin/areas', { nome })).dados?.id);
  for (const [email, name] of [['marina.costa.de.oliveira@empresa-com-nome-longo.com.br', 'Marina Costa de Oliveira'], ['rafael@layout-adm.test', 'Rafael Nunes']]) {
    await admin.post('/api/empresa/usuarios', { email, name, role_id: 'role_member' });
  }
  const pessoas = (await admin.get('/api/admin/pessoas')).dados?.pessoas || [];
  const marina = pessoas.find(p => p.email.startsWith('marina'));
  if (marina) await admin.put(`/api/admin/pessoas/${marina.id}`, { areas: [{ id: areas[0], responsavel: true }, { id: areas[1] }] });
  await admin.post('/api/admin/grupos', { nome: 'Gestores' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

// Roda na página: devolve a lista de defeitos de formatação encontrados.
function medir() {
  const defeitos = [];
  const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const nome = e => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')}`;
  const primeiroTexto = el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent.trim().length > 1 && visivel(n.parentElement) ? 1 : 3) });
    const n = w.nextNode(); if (!n) return null;
    const rg = document.createRange(); rg.selectNodeContents(n); return rg.getClientRects()[0] || null;
  };
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) defeitos.push(`rolagem horizontal: ${document.documentElement.scrollWidth}px em ${document.documentElement.clientWidth}px`);
  // Cartões irmãos (padrão comum e indicadores), agrupados pela linha em que estão.
  for (const grade of document.querySelectorAll('.pagina :is(.grade-cartoes,.indicadores)')) {
    const itens = [...grade.children].filter(visivel);
    const linhas = new Map();
    for (const f of itens) { const t = Math.round(f.getBoundingClientRect().top); const k = [...linhas.keys()].find(x => Math.abs(x - t) < 3) ?? t; linhas.set(k, [...(linhas.get(k) || []), f]); }
    for (const grupo of linhas.values()) {
      if (grupo.length < 2) continue;
      const alturas = grupo.map(f => f.getBoundingClientRect().height);
      if (Math.max(...alturas) - Math.min(...alturas) > 1.5) defeitos.push(`${nome(grade)}: cartões da mesma linha com alturas ${alturas.map(Math.round).join('/')}`);
      const desloc = grupo.map(f => { const r = primeiroTexto(f); return r ? r.top - f.getBoundingClientRect().top : null; }).filter(v => v !== null);
      if (desloc.length > 1 && Math.max(...desloc) - Math.min(...desloc) > 4) defeitos.push(`${nome(grade)}: primeiro texto em alturas diferentes (${desloc.map(Math.round).join('/')})`);
      // Nos indicadores, o valor também começa na mesma altura.
      const valores = grupo.map(f => f.querySelector(':scope > b')?.getBoundingClientRect().top).filter(v => v !== undefined);
      if (valores.length > 1 && Math.max(...valores) - Math.min(...valores) > 4) defeitos.push(`${nome(grade)}: valores em alturas diferentes (${valores.map(Math.round).join('/')})`);
    }
  }
  // Cabeçalho de seção: o texto da ação ("Ver pendências") na mesma linha visual do título.
  for (const cab of document.querySelectorAll('.pagina .secao-titulo')) {
    const h = cab.querySelector(':scope > h2'), a = cab.querySelector(':scope > a, :scope > button');
    if (!h || !a || !visivel(a)) continue;
    const th = primeiroTexto(h), ta = primeiroTexto(a);
    if (th && ta && Math.abs(th.top - ta.top) <= 30 && Math.abs((th.top + th.bottom) / 2 - (ta.top + ta.bottom) / 2) > 4) defeitos.push(`${h.textContent.trim()}: ação desalinhada do título`);
  }
  // Texto cortado com reticências quando caberia em duas linhas.
  for (const e of document.querySelectorAll('#principal .pagina *, #modal .px *')) {
    const cs = getComputedStyle(e);
    if (cs.textOverflow !== 'ellipsis' || !visivel(e) || !e.textContent.trim()) continue;
    if (e.scrollWidth > e.clientWidth + 1 && e.scrollWidth <= e.clientWidth * 2) defeitos.push(`texto cortado: ${nome(e)} "${e.textContent.trim().slice(0, 40)}"`);
  }
  return defeitos;
}

for (const largura of LARGURAS) {
  test(`administração em ${largura} px: cartões alinhados, sem texto cortado e sem rolagem horizontal`, async () => {
    const u = new URL(S.base);
    const ctx = await nav.newContext({ viewport: { width: largura, height: largura < 700 ? 844 : 900 }, isMobile: largura < 700, hasTouch: largura < 700 });
    await ctx.addCookies([...admin.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', e => erros.push(e.message));
    const achados = [];
    for (const tela of TELAS) {
      await p.goto(`${S.base}/app#/${tela}`);
      await p.waitForSelector('#conteudo > :not(.carregando), .pagina-dentro > :not(#conteudo)');
      await p.waitForLoadState('networkidle');
      // Abre o que fica recolhido (blocos de configurações, Filtrar, Mais opções, Ajustar manualmente) para medir também.
      await p.evaluate(() => { for (const d of document.querySelectorAll('details.cfg-caixa')) d.open = true; for (const b of document.querySelectorAll('#principal .adm-revelar[aria-expanded="false"]')) b.click(); });
      await p.waitForTimeout(150);
      for (const d of await p.evaluate(medir)) achados.push(`#/${tela}: ${d}`);
    }
    // Painel de uma pessoa aberto.
    await p.goto(`${S.base}/app#/pessoas`); await p.waitForSelector('.lx-linha');
    await p.locator('.lx-linha[data-tipo="pessoa"]').first().click(); await p.waitForSelector('#modal .px');
    for (const d of await p.evaluate(medir)) achados.push(`painel da pessoa: ${d}`);
    // Painéis de registro (Atividade) e de modelo (Catálogo técnico), um detalhe por vez.
    for (const [tela, nome] of [['atividade', 'registro'], ['modelos/catalogo', 'modelo']]) {
      await p.goto(`${S.base}/app#/${tela}`); await p.locator('#conteudo tr[data-registro]').first().click(); await p.waitForSelector('#modal .px');
      for (const d of await p.evaluate(medir)) achados.push(`painel do ${nome}: ${d}`);
    }
    await ctx.close();
    assert.deepEqual(achados, []);
    assert.deepEqual(erros, []);
  });
}
