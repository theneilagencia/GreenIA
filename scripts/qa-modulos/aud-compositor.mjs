// Produção: caixa de mensagem com vários anexos e um pedido longo (desktop e celular). Só monta, não envia.
import { chromium } from 'playwright-core';
export default async function (c, ...arquivos) {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  const texto = 'preciso que os seguintes ajustes sejam feitos no documento Apresentacao-Kickoff-AgroSense.pptx: 1) quero o design/layout o mais proximo possivel com a apresentacao Apresentacao-Referencia.pdf 2) Evidências, documentos, dados, relatórios e sistemas, acho que fica muito amplo. Use o contrato anexo como forma de enriquecer estes pontos. 3) os slides de Resultados e Planos podem virar um só. 4) revise a ortografia de todos os slides e mantenha os contatos.';
  try {
    for (const vp of [{ width: 1366, height: 800 }, { width: 390, height: 844 }]) {
      const ctx = await nav.newContext({ viewport: vp, ignoreHTTPSErrors: true });
      await ctx.addCookies(c.cookiesNavegador());
      const p = await ctx.newPage();
      await p.goto(`${c.BASE}/app#/nova`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await p.waitForSelector('#entrada', { timeout: 60000 });
      await p.click('#mais-anexos');
      const [escolha] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.click('#anexar')]);
      await escolha.setFiles(arquivos);
      await p.waitForTimeout(2500);
      await p.fill('#entrada', texto);
      await p.waitForTimeout(800);
      const info = await p.evaluate(() => { const e = document.querySelector('#entrada'); return { altura: e.clientHeight, rolagem: e.scrollHeight, anexos: document.querySelectorAll('#anexos > *').length }; });
      c.log('  ', vp.width, JSON.stringify(info));
      await p.screenshot({ path: `${c.pasta('compositor')}/caixa-${vp.width}.png` });
      await ctx.close();
    }
  } finally { await nav.close(); }
}
