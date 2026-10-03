// Navegação lateral em produção (só leitura): hierarquia, recentes limitadas, "Ver todas", estados ativos e celular.
// Uso: rodar lateral
import { chromium } from 'playwright-core';

export default async function (c) {
  let spki = null;
  try { const { X509Certificate, createHash } = await import('node:crypto'); const { readFileSync } = await import('node:fs');
    spki = createHash('sha256').update(new X509Certificate(readFileSync('/root/.ccr/agent-proxy-ca.crt')).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'); } catch { /* sem proxy */ }
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] });
  const pasta = c.pasta('lateral'), out = { telas: [] };
  const visivel = (p, sel) => p.$eval(sel, el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; }).catch(() => false);
  const ler = p => p.evaluate(() => ({
    principais: [...document.querySelectorAll('#lateral .item-lat.item-principal')].map(a => a.dataset.item),
    ativo: [...document.querySelectorAll('#lateral .item-lat.item-principal[aria-current="page"]')].map(a => a.dataset.item),
    recentes: document.querySelectorAll('#lateral .recentes-lat .item-lat.sub:not(.ver-todas)').length,
    verTodas: document.querySelector('#lateral .ver-todas')?.textContent.trim() || null,
    semRolagemH: document.documentElement.scrollWidth <= window.innerWidth + 1,
    truncadas: [...document.querySelectorAll('#lateral .recentes-lat .item-lat.sub:not(.ver-todas)')].every(a => a.title && a.getBoundingClientRect().height < 60),
  }));
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(c.cookiesNavegador());
    const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message.slice(0, 200)));
    for (const [largura, altura] of [[1280, 800], [1440, 900]]) {
      await p.setViewportSize({ width: largura, height: altura });
      await p.goto(`${c.BASE}/app#/nova`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await p.waitForSelector('#lateral .item-lat.item-principal', { timeout: 30000 });
      const r = await ler(p);
      r.qwVisivel = await visivel(p, '#lateral [data-item="quick-wins"]'); r.conhecimentoVisivel = await visivel(p, '#lateral [data-item="conhecimento"]');
      out.telas.push({ largura, ...r }); await p.screenshot({ path: `${pasta}/lateral-${largura}.png` });
    }
    // Estados ativos nas rotas (sem criar nada).
    out.ativos = {};
    const qw = (await c.api('GET', '/api/quick-wins')).dados;
    const umQw = (qw?.quick_wins || qw?.itens || qw || [])[0]?.id;
    const hashes = ['#/quick-wins', '#/qw/nova', ...(umQw ? [`#/qw/${umQw}`, `#/qw/${umQw}/ajustar`] : []), '#/conhecimento', '#/conversas'];
    for (const h of hashes) { await p.goto(`${c.BASE}/app${h}`); await p.waitForTimeout(1500); out.ativos[h] = (await ler(p)).ativo; }
    // "Ver todas" → lista existente.
    await p.goto(`${c.BASE}/app#/nova`); await p.waitForTimeout(1500);
    if (await p.locator('#lateral .ver-todas').count()) {
      await p.click('#lateral .ver-todas'); await p.waitForURL(/#\/conversas$/, { timeout: 15000 });
      await p.waitForSelector('.lista .lista-item', { timeout: 20000 }).catch(() => {});
      out.verTodas = { url: p.url().replace(/^.*#/, '#'), itens: await p.locator('.lista .lista-item').count() };
      await p.screenshot({ path: `${pasta}/ver-todas.png` });
    }
    // Clique em Quick Wins a partir da conversa.
    await p.goto(`${c.BASE}/app#/nova`); await p.waitForTimeout(1200);
    await p.click('#lateral [data-item="quick-wins"]'); await p.waitForURL(/#\/quick-wins$/, { timeout: 15000 });
    out.cliqueQuickWins = p.url().replace(/^.*#/, '#');
    // Celular e tablet: menu aberto.
    for (const largura of [320, 390, 768]) {
      await p.setViewportSize({ width: largura, height: 740 });
      await p.goto(`${c.BASE}/app#/nova`); await p.waitForTimeout(1500);
      if (await p.locator('#menu').isVisible() && !(await p.locator('#lateral.aberta').count())) { await p.click('#menu'); await p.waitForSelector('#lateral.aberta'); await p.waitForTimeout(400); }
      const r = await ler(p);
      r.qwVisivel = await visivel(p, '#lateral [data-item="quick-wins"]'); r.conhecimentoVisivel = await visivel(p, '#lateral [data-item="conhecimento"]');
      r.alvosMin = Math.min(...await p.$$eval('#lateral .item-lat.item-principal, #lateral .recentes-lat .item-lat.sub', l => l.map(a => Math.round(a.getBoundingClientRect().height))));
      out.telas.push({ largura, ...r }); await p.screenshot({ path: `${pasta}/lateral-${largura}.png` });
    }
    // Teclado: foco visível.
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.goto(`${c.BASE}/app#/nova`); await p.waitForTimeout(1200);
    await p.focus('#lateral [data-item="quick-wins"]'); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
    out.focoVisivel = await p.evaluate(() => { const a = document.activeElement; return { item: a?.dataset?.item, outline: getComputedStyle(a).outlineStyle, focusVisible: a.matches(':focus-visible') }; });
    out.erros = erros;
    await ctx.close();
  } finally { await nav.close(); }
  c.salvar('40-lateral', out);
  c.log(JSON.stringify(out));
}
