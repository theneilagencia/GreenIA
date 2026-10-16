// Produção: operações de código com o admin da empresa de homologação (perfil com code.*).
//  - Executar: pede função + testes em Python no chat; abre a conversa na tela real (navegador) e clica "Rodar os
//    testes"; a área isolada carrega o Pyodide e a saída real volta para a conversa.
//  - Publicar: pede um site e a publicação; confere o endereço público SEM login (sandbox, noindex); despublica e
//    confere que saiu do ar.
// Uso: rodar aud-codigo
import { chromium } from 'playwright-core';
export default async function (c) {
  const out = {};
  // ---------- executar ----------
  const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa;
  const r = await c.enviar(conv.id, { texto: 'Crie uma função soma(a, b) em Python, com testes unitários em test_calc.py, e rode os testes.' });
  const fim = r.linhas.find(l => l.t === 'fim');
  out.executar = { conversa: conv.id, status: r.status, executar: fim?.executar || null, arquivos: (fim?.arquivos || []).map(a => a.tipo), acesso: fim?.acesso || null };
  c.log('  executar: resposta', r.status, JSON.stringify(out.executar));
  if (fim?.executar) {
    const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--ignore-certificate-errors'] });
    try {
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
      await ctx.addCookies(c.cookiesNavegador());
      const p = await ctx.newPage();
      await p.goto(`${c.BASE}/app#/c/${conv.id}`);
      const botao = p.getByRole('button', { name: fim.executar.modo === 'testes' ? 'Rodar os testes' : 'Executar' }).first();
      await botao.waitFor({ timeout: 30000 });
      const t0 = Date.now();
      await botao.click();
      const saida = p.locator('.linha-aviso.execucao-saida').last();
      await saida.waitFor({ timeout: 150000 });
      out.executar.saida = (await saida.innerText()).slice(0, 2000);
      out.executar.ms_tela = Date.now() - t0;
      await p.screenshot({ path: `${c.pasta('codigo')}/execucao.png`, fullPage: false });
      c.log('  executar: saída', JSON.stringify(out.executar.saida.slice(0, 400)));
    } catch (e) { out.executar.erro = String(e.message).slice(0, 300); c.log('  executar: ERRO', out.executar.erro); }
    finally { await nav.close(); }
  }
  // ---------- publicar ----------
  const conv2 = (await c.api('POST', '/api/conversas', {})).dados.conversa;
  const s1 = await c.enviar(conv2.id, { texto: 'Crie um site institucional completo de uma página para a Consultoria Exemplo (fictícia), com prévia e arquivos do projeto.' });
  c.log('  site', s1.status, JSON.stringify((s1.linhas.find(l => l.t === 'fim')?.arquivos || []).map(a => a.tipo)));
  const s2 = await c.enviar(conv2.id, { texto: 'Agora publique o site na internet.' });
  const pub = s2.linhas.find(l => l.t === 'fim')?.arquivos?.find(a => a.tipo === 'site_publicado');
  out.publicar = { conversa: conv2.id, url: pub?.url || null };
  c.log('  publicar', s2.status, pub?.url || 'SEM PUBLICAÇÃO');
  if (pub) {
    const v = await fetch(pub.url, { redirect: 'manual' });
    const corpo = await v.text();
    out.publicar.visitante = { status: v.status, csp: v.headers.get('content-security-policy')?.slice(0, 80), robots: v.headers.get('x-robots-tag'), html: /<html/i.test(corpo) };
    c.log('  visitante sem login', JSON.stringify(out.publicar.visitante));
    const d = await c.api('POST', `/api/sites/${pub.token}/despublicar`, {});
    const v2 = await fetch(pub.url, { redirect: 'manual' });
    out.publicar.despublicado = { status: d.status, depois: v2.status };
    c.log('  despublicado', JSON.stringify(out.publicar.despublicado));
  }
  c.salvar('aud-codigo', out);
}
