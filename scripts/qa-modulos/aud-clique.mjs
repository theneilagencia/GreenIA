// Diagnóstico: o que está por cima do botão de anexos na tela real.
import { chromium } from 'playwright-core';
export default async function (c) {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  try {
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await nav.newContext({ viewport: vp, ignoreHTTPSErrors: true });
      await ctx.addCookies(c.cookiesNavegador());
      const p = await ctx.newPage();
      await p.goto(`${c.BASE}/app#/nova`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await p.waitForSelector('#entrada', { timeout: 60000 });
      await p.waitForTimeout(2000);
      const info = await p.evaluate(() => {
        const b = document.querySelector('#mais-anexos').getBoundingClientRect();
        const x = b.x + b.width / 2, y = b.y + b.height / 2, e = document.elementFromPoint(x, y);
        const d = el => el ? `${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')}` : null;
        const cadeia = []; for (let el = e; el && cadeia.length < 6; el = el.parentElement) cadeia.push(d(el));
        return { caixa: [b.x, b.y, b.width, b.height], noPonto: cadeia };
      });
      c.log('  ', vp.width, JSON.stringify(info));
      await p.screenshot({ path: `${c.pasta('clique')}/tela-${vp.width}.png` });
      try { await p.click('#mais-anexos', { timeout: 8000 }); c.log('   clique ok', await p.$eval('#menu-anexos', m => !m.hidden).catch(() => 'sem menu')); }
      catch (e) { c.log('   clique FALHOU', String(e.message).split('\n').filter(l => /intercept|retry/i.test(l)).slice(0, 3).join(' | ')); }
      await ctx.close();
    }
  } finally { await nav.close(); }
}
