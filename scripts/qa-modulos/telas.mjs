// §18. Telas em 320, 390, 768 e 1280: catálogo, criação, execução/conversa com conferência, peça visual e
// integrações. Navegador local (Chromium) com a sessão em memória. Mede rolagem horizontal, elementos fora da tela,
// botões fora do alcance, texto minúsculo; guarda capturas.
import { chromium } from 'playwright-core';
export default async function (c) {
  const convTexto = c.estado.casos[19]?.convUso, convVisual = c.estado.casos[9]?.convUso;
  const pasta = c.pasta('telas');
  // Atrás do proxy desta máquina, o navegador confia só na chave pública da CA do proxy (a mesma que as demais
  // ferramentas confiam pelo bundle); nenhuma outra verificação de certificado é afrouxada.
  let spki = null;
  try { const { X509Certificate, createHash } = await import('node:crypto'); const { readFileSync } = await import('node:fs');
    spki = createHash('sha256').update(new X509Certificate(readFileSync('/root/.ccr/agent-proxy-ca.crt')).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'); } catch { /* sem proxy */ }
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] });
  const out = [];
  try {
    for (const w of [320, 390, 768, 1280]) {
      const ctx = await nav.newContext({ viewport: { width: w, height: w < 800 ? 780 : 860 } });
      await ctx.addCookies(c.cookiesNavegador());
      const p = await ctx.newPage();
      const erros = []; p.on('pageerror', e => erros.push(String(e.message).slice(0, 120)));
      for (const [nome, hash] of [['catalogo', '#/quick-wins'], ['criacao', '#/qw/nova'], ['conversa', `#/c/${convTexto}`], ['visual', `#/c/${convVisual}`], ['integracoes', '#/integracoes']]) {
        await p.goto(`${c.BASE}/app${hash}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await p.waitForTimeout(1500);
        const m = await p.evaluate(() => {
          const W = window.innerWidth;
          const fora = [...document.querySelectorAll('button, a.btn, input, select, textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).length;
          const peq = [...document.querySelectorAll('body *')].filter(e => e.childElementCount === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11 && e.getBoundingClientRect().width).length;
          return { rolagem: document.documentElement.scrollWidth > W + 1, scrollWidth: document.documentElement.scrollWidth, fora, peq, url: location.hash, titulo: document.querySelector('h1')?.textContent || null };
        });
        await p.screenshot({ path: `${pasta}/${nome}-${w}.png`, fullPage: false });
        out.push({ w, nome, ...m, erros: [...erros] });
        erros.length = 0;
      }
      await ctx.close();
    }
  } finally { await nav.close(); }
  c.salvar('10-telas', out);
  for (const x of out) c.log(`${x.w} ${x.nome}: rolagem=${x.rolagem}(${x.scrollWidth}) fora=${x.fora} peq=${x.peq} h1=${x.titulo} url=${x.url} erros=${x.erros.length}`);
}
