// Produção: a tela enquanto o arquivo é montado. Envia o pedido pela interface real, fotografa durante a montagem
// (cartão "Preparando o arquivo…", sem "pronto para download" no texto) e depois o cartão do arquivo pronto.
import { chromium } from 'playwright-core';
export default async function (c, planoArq, id) {
  const { readFileSync } = await import('node:fs');
  const t = JSON.parse(readFileSync(planoArq, 'utf8'))[id].turnos.at(-1);
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
  const out = { id };
  try {
    const ctx = await nav.newContext({ viewport: { width: 1366, height: 860 }, ignoreHTTPSErrors: true });
    await ctx.addCookies(c.cookiesNavegador());
    const p = await ctx.newPage();
    await p.goto(`${c.BASE}/app#/nova`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await p.waitForSelector('#entrada', { timeout: 60000 });
    await p.click('#mais-anexos');
    const [escolha] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.click('#anexar')]);
    await escolha.setFiles(t.anexos);
    await p.waitForFunction(n => document.querySelectorAll('#anexos .anexo-chip').length === n, t.anexos.length, { timeout: 60000 });
    await p.fill('#entrada', t.texto);
    await p.click('#enviar');
    const pasta = c.pasta(`montagem-${id}`);
    await p.waitForSelector('.arquivo-montando', { timeout: 240000 });
    await p.waitForTimeout(1500);
    out.durante = { cartao: await p.locator('.arquivo-montando').innerText(), promete: /pronto para (download|baixar)/i.test(await p.locator('.resposta').last().innerText()) };
    await p.screenshot({ path: `${pasta}/durante.png` });
    c.log('  durante', JSON.stringify(out.durante));
    await p.waitForSelector('.rodape-resposta', { timeout: 600000 });
    await p.waitForTimeout(1500);
    out.depois = { cartoes: await p.locator('.resposta').last().locator('.anexo-resposta').allInnerTexts(), promete: /pronto para (download|baixar)/i.test(await p.locator('.resposta').last().innerText()) };
    await p.locator('.resposta').last().screenshot({ path: `${pasta}/depois.png` });
    c.log('  depois', JSON.stringify(out.depois));
    out.conversa = /#\/c\/(\d+)/.exec(p.url())?.[1];
  } catch (e) { out.erro = String(e.message).slice(0, 300); c.log('  ERRO', out.erro); }
  finally { await nav.close(); }
  c.salvar(`montagem-${id}`, out);
}
