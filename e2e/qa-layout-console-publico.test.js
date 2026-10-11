// Formatação visual do console da plataforma, do console do operador e das páginas públicas, em 1920, 1366 e 390 px:
// cartões irmãos com o primeiro texto na mesma altura (tolerância 4 px) e, na mesma linha, com a mesma altura;
// indicadores lado a lado com os valores na mesma altura; nenhum texto cortado com reticências quando caberia em duas
// linhas; nenhuma rolagem horizontal. As páginas de vendas mostram blocos ao rolar: a medição usa movimento reduzido,
// que mostra tudo de uma vez. Dados fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { subirComNavegador } from '../scripts/navegador.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const LARGURAS = [1920, 1366, 390];
let S, nav, ops, emp, plano;

before(async () => {
  S = await subirPlataforma({ paginaInicial: 'vendas' });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  plano = planos.find(x => x.name === 'GreenIA Team');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Exemplo', slug: 'exemplo', status: 'ativa', plan_id: plano.id, admin_email: 'admin@empresa-exemplo.com.br' })).dados;
  await ops.post('/api/plataforma/empresas', { name: 'Comercial Beta', slug: 'beta', status: 'implantacao', plan_id: planos.find(x => x.name === 'GreenIA Starter').id, admin_email: 'ana@beta.com.br' });
  const enc = (await ops.post('/api/plataforma/empresas', { name: 'Encerrada', slug: 'encerrada', status: 'ativa', admin_email: 'adm@encerrada.com.br' })).dados;
  await ops.post(`/api/plataforma/empresas/${enc.id}/status`, { status: 'cancelada' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

// Mede a tela aberta. Cartão: filho visível, com borda ou fundo próprio, de um contêiner em grade ou flex em linha.
// Em cada linha (cartões com o mesmo topo), o primeiro texto de cada cartão tem de começar na mesma altura e os
// cartões têm de ter a mesma altura. Indicadores: os valores (<b>) da mesma linha começam na mesma altura.
function medir() {
  const visivel = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const nome = e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const primeiroTexto = el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent.trim().length > 1 && visivel(n.parentElement) ? 1 : 3) });
    const n = w.nextNode(); if (!n) return null;
    const rg = document.createRange(); rg.selectNodeContents(n); return rg.getClientRects()[0] || null;
  };
  const porLinha = itens => {
    const linhas = [];
    for (const f of itens) { const t = f.getBoundingClientRect().top; const l = linhas.find(x => Math.abs(x.t - t) < 3); if (l) l.itens.push(f); else linhas.push({ t, itens: [f] }); }
    return linhas.map(l => l.itens).filter(l => l.length > 1);
  };
  const problemas = [];
  for (const c of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(c);
    if (!visivel(c) || c.closest('table, .indicadores, svg, [aria-hidden="true"]')) continue;
    if (!(cs.display.includes('grid') || (cs.display.includes('flex') && !cs.flexDirection.startsWith('column')))) continue;
    // Cartão tem tamanho de cartão: ícones, selos e etiquetas lado a lado não entram.
    const cartoes = [...c.children].filter(visivel).filter(f => { const r = f.getBoundingClientRect(); return r.width >= 120 && r.height >= 40; }).filter(f => { const fs = getComputedStyle(f); return (parseFloat(fs.borderTopWidth) > 0 && fs.borderTopStyle !== 'none' && parseFloat(fs.borderBottomWidth) > 0) || (fs.backgroundColor !== 'rgba(0, 0, 0, 0)' && fs.backgroundColor !== cs.backgroundColor); });
    if (cartoes.length < 2) continue;
    for (const linha of porLinha(cartoes)) {
      const off = linha.map(f => { const r = primeiroTexto(f); return r ? r.top - f.getBoundingClientRect().top : null; }).filter(v => v !== null);
      if (off.length > 1 && Math.max(...off) - Math.min(...off) > 4) problemas.push(`${nome(c)}: primeiro texto em alturas diferentes (${Math.round(Math.max(...off) - Math.min(...off))} px)`);
      const alt = linha.map(f => f.getBoundingClientRect().height);
      if (Math.max(...alt) - Math.min(...alt) > 4) problemas.push(`${nome(c)}: cartões da mesma linha com alturas diferentes (${alt.map(Math.round).join(', ')} px)`);
    }
  }
  for (const g of document.querySelectorAll('.indicadores')) {
    if (!visivel(g)) continue;
    for (const linha of porLinha([...g.children].filter(visivel))) {
      const tops = linha.map(i => i.querySelector(':scope>b')?.getBoundingClientRect().top).filter(v => v !== undefined);
      if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4) problemas.push(`${nome(g)}: valores dos indicadores em alturas diferentes (${Math.round(Math.max(...tops) - Math.min(...tops))} px)`);
    }
  }
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.textOverflow !== 'ellipsis' || !visivel(e) || !e.textContent.trim() || e.scrollWidth <= e.clientWidth + 1) continue;
    if (e.scrollWidth <= e.clientWidth * 2) problemas.push(`${nome(e)}: "${e.textContent.trim().slice(0, 40)}" cortado com reticências, mas cabe em duas linhas`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) problemas.push(`rolagem horizontal (${document.documentElement.scrollWidth} px numa janela de ${innerWidth} px)`);
  return [...new Set(problemas)];
}

async function percorrer(rotas, { sessao = null, antes = null } = {}) {
  const falhas = [];
  const u = new URL(S.base);
  for (const width of LARGURAS) {
    const ctx = await nav.newContext({ viewport: { width, height: width >= 1200 ? Math.round(width * 0.5625) : 844 }, isMobile: width < 700, hasTouch: width < 700, reducedMotion: 'reduce' });
    await ctx.route(x => !x.href.startsWith(S.base), r => r.abort());
    if (sessao) await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', e => erros.push(e.message));
    for (const [tela, caminho] of rotas) {
      if (antes?.[tela]) await p.goto(S.base + antes[tela]);
      await p.goto(S.base + caminho); await p.waitForLoadState('networkidle').catch(() => {});
      await p.waitForFunction(() => !document.querySelector('.esqueleto') && !document.querySelector('#principal[aria-busy="true"]'), null, { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(250);
      for (const x of await p.evaluate(medir)) falhas.push(`${tela} em ${width} px: ${x}`);
    }
    assert.deepEqual(erros, [], `erros de página em ${width} px`);
    await ctx.close();
  }
  return falhas;
}

test('páginas públicas: cartões alinhados, sem texto cortado e sem rolagem horizontal', async () => {
  const falhas = await percorrer([
    ['vendas', '/'], ['encontrar', '/encontrar'], ['termos', '/termos'], ['privacidade', '/privacidade'], ['login do console', '/plataforma'],
    ['página de apresentação', '/exemplo'], ['entrar', '/entrar'], ['política', '/politica'], ['404', '/exemplo/nao-existe'], ['encerramento', '/encerrada/encerramento'],
  ], { antes: { entrar: '/exemplo', 'política': '/exemplo' } });
  assert.deepEqual(falhas, []);
});

test('console da plataforma: cartões e indicadores alinhados, sem texto cortado e sem rolagem horizontal', async () => {
  const abas = ['resumo', 'usuarios', 'marca', 'landing', 'url', 'permissoes', 'auditoria'].map(a => [`empresa/${a}`, `/plataforma#/empresas/${emp.id}/${a}`]);
  const falhas = await percorrer([
    ['empresas', '/plataforma#/empresas'], ...abas, ['encerramentos', '/plataforma#/encerramentos'], ['usuários', '/plataforma#/usuarios'], ['planos', '/plataforma#/planos'],
    ['plano', `/plataforma#/planos/${plano.id}`], ['plano novo', '/plataforma#/planos/novo'], ['ambientes', '/plataforma#/ambientes'], ['uso', '/plataforma#/uso'],
    ['auditoria', '/plataforma#/auditoria'], ['configurações', '/plataforma#/configuracoes'],
  ], { sessao: ops });
  assert.deepEqual(falhas, []);
});

test('console do operador: indicadores alinhados, cabeçalho na coluna do conteúdo e sem rolagem horizontal', async () => {
  const N = await subirComNavegador();
  const resumo = pct => ({
    plano: { creditos: 5000, precoUsd: 399 }, situacao: { fase: pct > 80 ? 'aviso' : 'normal', usados: 50 * pct, percentual: pct, naReserva: 0, reserva: 1000, pacoteDisponivel: 2000, renova: '2026-11-01' },
    financeiro: { receita: 399, margem: 210.5, custoIa: 62.1, custoComTaxa: 65.5, custoInfraUsd: 12, receitaPacotes: 0, margemPct: 53 }, alertas: [],
    status: { ia: true, usaramNoMes: 12, pessoasAtivas: 20, conversasNoMes: 340, ultimoUso: '2026-10-10' },
    classes: { rapido: { nome: 'Modelo fictício', id: 'ficticio/rapido', precoEntrada: 0.1, precoSaida: 0.4, homologado: true } }, variacoes: [], pacotes: [],
  });
  const instancias = [{ id: 'cli-1', nome: 'Cliente Fictício Alfa', ok: true, resumo: resumo(42) }, { id: 'cli-2', nome: 'Cliente Fictício Beta Comércio e Serviços', ok: true, resumo: resumo(86) }];
  try {
    const falhas = [];
    for (const width of LARGURAS) {
      const ctx = await N.navegador.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      await p.route('**/api/eu', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ operador: true, csrf: 'x' }) }));
      await p.route('**/api/operador/leads', r => r.fulfill({ contentType: 'application/json', body: '{"leads":[]}' }));
      await p.route('**/api/operador/instancias', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ instancias, pacotePadrao: { creditos: 2000, precoUsd: 229 } }) }));
      await p.goto(`${N.base}/operador`); await p.waitForSelector('#cliente-cli-1', { state: 'attached' });
      await p.evaluate(() => document.querySelector('#cliente-cli-1').setAttribute('open', ''));
      for (const x of await p.evaluate(medir)) falhas.push(`operador em ${width} px: ${x}`);
      // Cabeçalho alinhado à coluna do conteúdo; o campo de data do Capacity Pack com o botão dentro (sem o campo nativo à vista).
      const m = await p.evaluate(() => ({ topo: document.querySelector('.console-topo .marca').getBoundingClientRect().left, conteudo: document.querySelector('#conteudo').getBoundingClientRect().left, nativo: [...document.querySelectorAll('.data-br-nativo')].some(e => e.getBoundingClientRect().height > 2) }));
      if (width > 860) assert.ok(Math.abs(m.topo - m.conteudo) <= 4, `operador em ${width} px: marca em ${m.topo}, conteúdo em ${m.conteudo}`);
      assert.equal(m.nativo, false, `operador em ${width} px: campo de data nativo à vista`);
      await ctx.close();
    }
    assert.deepEqual(falhas, []);
  } finally { await N.fechar(); }
});

test('console da plataforma: título e ação do cabeçalho alinhados à coluna do conteúdo em tela larga', async () => {
  const u = new URL(S.base);
  for (const width of [1920, 1366]) {
    const ctx = await nav.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addCookies([...ops.cookies].map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
    const p = await ctx.newPage();
    for (const rota of ['empresas', `empresas/${emp.id}/resumo`, 'ambientes']) {
      await p.goto(`${S.base}/plataforma#/${rota}`); await p.waitForSelector('.pagina-dentro'); await p.waitForTimeout(200);
      const m = await p.evaluate(() => {
        const d = document.querySelector('.pagina-dentro').getBoundingClientRect(), c = document.querySelector('.cabeca');
        return { esq: c.querySelector('.cabeca-titulo').getBoundingClientRect().left - d.left, dir: [...c.querySelectorAll('.cabeca-acoes>*')].filter(e => e.getBoundingClientRect().width).map(e => d.right - e.getBoundingClientRect().right), altura: c.getBoundingClientRect().height };
      });
      assert.ok(Math.abs(m.esq) <= 4, `${rota} em ${width} px: título ${m.esq} px fora da coluna`);
      for (const d of m.dir.slice(-1)) assert.ok(Math.abs(d) <= 4, `${rota} em ${width} px: ação ${d} px fora da coluna`);
      assert.ok(m.altura >= 60 && m.altura <= 62, `${rota} em ${width} px: cabeçalho com ${m.altura} px`);
    }
    await ctx.close();
  }
});
