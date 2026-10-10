// §8. Links de resolução em produção. A: pesquisa não liberada → "Liberar a pesquisa na internet" (Políticas, campo
// em destaque). B: "Liberar a geração de imagens" (Configurações) — a geração está ligada na empresa, então só o destino
// é conferido (não se desliga configuração para testar). C: conhecimento da empresa obrigatório sem trecho → "Abrir o
// conhecimento da empresa" e "Ajustar as fontes do Quick Win". E: bloqueio de proteção (área reforçada) nunca traz
// "liberar". D (sem permissão) exige outra conta: coberto pelo E2E. Tela real com a sessão em memória.
import { chromium } from 'playwright-core';
export default async function (c, rodada = 'links') {
  const { criarQw, executar } = await import(`./bateria.mjs?v=${Date.now()}`);
  const ids = new Set((c.eu.quickWins?.areas || []).map(a => a.id));
  const minhas = ((await c.api('GET', '/api/areas')).dados?.areas || []).filter(a => ids.has(a.id));
  const livre = minhas.find(a => !a.sigilosa), reforcada = minhas.find(a => a.sigilosa);
  const out = {};
  const fimDe = e => e.bruto?.linhas?.find(l => l.t === 'fim') || {};
  // A
  c.destino = livre ? { areas: [livre.id] } : { toda_empresa: true };
  const a = await criarQw(c, { nome: `Links pesquisa ${rodada}`, descricao: 'Pesquise na internet as tendências de treinamento corporativo e liste as 5 principais.' });
  const ea = a.qw ? await executar(c, a.qw.id, 'Público fictício: equipe de vendas de 30 pessoas.', { teste: true }) : null;
  const qa = ea ? fimDe(ea).qualidade || {} : {};
  out.A = { qw: a.qw?.id, conv: ea?.conv, status: qa.status, avisos: qa.avisos, acoes: qa.acoes || [] };
  // C
  const cq = await criarQw(c, { nome: `Links conhecimento ${rodada}`, descricao: 'Responda dúvidas da equipe usando o conhecimento da empresa.' });
  if (cq.qw) await c.api('PUT', `/api/quick-wins/${cq.qw.id}/fontes/base`, { papel: 'REQUIRED_SOURCE' });
  const ec = cq.qw ? await executar(c, cq.qw.id, 'Qual é o procedimento interno para pedir reembolso de quilometragem?', { teste: true }) : null;
  const qc = ec ? fimDe(ec).qualidade || {} : {};
  out.C = { qw: cq.qw?.id, status: qc.status, avisos: qc.avisos, acoes: qc.acoes || [] };
  // E: imagem final em área com proteção reforçada (governança): sem "liberar".
  if (reforcada) {
    c.destino = { areas: [reforcada.id] };
    const e = await criarQw(c, { nome: `Links protecao ${rodada}`, descricao: 'Gere a imagem final de um post quadrado anunciando o novo horário de atendimento.' });
    const ee = e.qw ? await executar(c, e.qw.id, 'Novo horário fictício: segunda a sábado, das 8h às 20h.', { teste: true }) : null;
    const qe = ee ? fimDe(ee).qualidade || {} : {};
    out.E = { qw: e.qw?.id, status: qe.status, avisos: qe.avisos, acoes: qe.acoes || [], artefato: (fimDe(ee || {}).artefatos || [])[0]?.imagem_final || null };
  }
  // Tela real: os destinos abrem com o campo em destaque e focado; o link aparece no resultado.
  let spki = null;
  try { const { X509Certificate, createHash } = await import('node:crypto'); const { readFileSync } = await import('node:fs');
    spki = createHash('sha256').update(new X509Certificate(readFileSync('/root/.ccr/agent-proxy-ca.crt')).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'); } catch { /* sem proxy */ }
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] });
  const pasta = c.pasta('links');
  out.tela = [];
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addCookies(c.cookiesNavegador());
    const p = await ctx.newPage();
    if (out.A.conv) {
      await p.goto(`${c.BASE}/app#/c/${out.A.conv}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const links = await p.$$eval('.qc-acoes a', l => l.map(x => ({ texto: x.textContent.trim(), href: x.getAttribute('href') })));
      out.tela.push({ onde: 'resultado A', links });
      await p.screenshot({ path: `${pasta}/resultado-A.png` });
    }
    for (const href of ['#/politicas?foco=pesquisa-web', '#/configuracoes?foco=iv-imagens', '#/conhecimento', ...(out.C.qw ? [`#/qw/${out.C.qw}/editar?foco=fontes-qw`] : [])]) {
      await p.goto(`${c.BASE}/app${href}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const m = await p.evaluate(id => ({ destacado: !!document.querySelector('.campo-destacado'), focado: document.activeElement?.id || null, existe: id ? !!document.getElementById(id) : null, h: location.hash, titulo: document.querySelector('h1, .pg-cabeca h1')?.textContent?.trim() || null }), (/foco=([a-z0-9-]+)/.exec(href) || [])[1] || null);
      out.tela.push({ href, ...m });
      await p.screenshot({ path: `${pasta}/${href.replace(/[^a-z0-9]+/gi, '-')}.png` });
    }
    await ctx.close();
  } finally { await nav.close(); }
  c.salvar(`32-${rodada}`, out);
  c.log('A', out.A.status, JSON.stringify(out.A.acoes));
  c.log('C', out.C.status, JSON.stringify(out.C.acoes));
  if (out.E) c.log('E', out.E.status, 'acoes', JSON.stringify(out.E.acoes), 'imagem', JSON.stringify(out.E.artefato));
  for (const t of out.tela) c.log('tela', JSON.stringify(t));
}
