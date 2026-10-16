// Auditoria de paridade em produção: dirige a interface real (navegador) como um usuário final. Cada teste abre uma
// conversa nova, anexa os arquivos pelo botão de anexo, digita o pedido e envia; refinamentos seguem na MESMA
// conversa. Grava capturas, eventos do stream (sem conteúdo de segredo), tempos e os arquivos que a tela oferece.
// Uso: rodar aud-teste <plano.json> <ID> [inicio-do-turno]   (plano: { "T01": { "turnos": [{ "texto", "anexos": [] }] } })
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { chromium } from 'playwright-core';

const LIMITE_TURNO = 20 * 60e3;

async function navegador(base) {
  let spki = null;
  try { const { X509Certificate, createHash } = await import('node:crypto');
    spki = createHash('sha256').update(new X509Certificate(readFileSync('/root/.ccr/agent-proxy-ca.crt')).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'); } catch { /* sem proxy */ }
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: process.env.HTTPS_PROXY && base.startsWith('https:') ? { server: process.env.HTTPS_PROXY } : undefined, args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] });
}

export default async function (c, planoArq, id, inicio = '0') {
  const plano = JSON.parse(readFileSync(planoArq, 'utf8'))[id];
  if (!plano) { c.log('TESTE_INEXISTENTE', id); return; }
  const pasta = c.pasta(id);
  const reg = existsSync(join(pasta, 'registro.json')) ? JSON.parse(readFileSync(join(pasta, 'registro.json'), 'utf8')) : { id, turnos: [] };
  const credito = async () => { const e = (await c.api('GET', '/api/eu')).dados; return e?.plano ? { percentual: e.plano.percentual ?? null, estado: e.plano.estado ?? e.plano.situacao ?? null } : null; };
  reg.credito_antes ??= await credito();
  const nav = await navegador(c.BASE);
  try {
    const ctx = await nav.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
    await ctx.addCookies(c.cookiesNavegador());
    const p = await ctx.newPage();
    const errosPagina = []; p.on('pageerror', e => errosPagina.push(e.message.slice(0, 200)));
    p.on('console', m => { if (m.type() === 'error') errosPagina.push('console: ' + m.text().slice(0, 200)); });
    // Conversa: nova no primeiro turno; nos seguintes, a mesma (como o usuário voltaria a ela).
    if (Number(inicio) === 0 || !reg.conversa) await p.goto(`${c.BASE}/app#/nova`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    else await p.goto(`${c.BASE}/app#/c/${reg.conversa}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    try { await p.waitForSelector('#entrada', { timeout: 60000 }); }
    catch (e) { await p.screenshot({ path: join(pasta, 'sem-entrada.png') }); writeFileSync(join(pasta, 'sem-entrada.txt'), (await p.textContent('body').catch(() => '')).slice(0, 3000)); throw e; }
    for (let k = Number(inicio); k < plano.turnos.length; k++) {
      const t = plano.turnos[k], n = k + 1, cliques = [];
      const linha = { turno: n, texto: t.texto, anexos: (t.anexos || []).map(a => basename(a)), inicio: new Date().toISOString() };
      c.log(`  ${id} turno ${n}: ${t.texto.slice(0, 90)}…`);
      if (t.anexos?.length) {
        const anexos = t.anexos.map(a => a.replace(/^@(\w+):/, (_, de) => { const r = JSON.parse(readFileSync(join(c.RAIZ, de, 'registro.json'), 'utf8')); return r.saida_para_anexo; })).filter(Boolean);
        await p.click('#mais-anexos'); cliques.push('mais-anexos');
        const [escolha] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.click('#anexar')]); cliques.push('anexar');
        await escolha.setFiles(anexos);
        await p.waitForTimeout(1500);
        linha.anexos_na_tela = await p.$$eval('#anexos > *', l => l.map(e => e.textContent.trim().slice(0, 80)));
        linha.aviso_anexo = await p.$$eval('.toast, [role="alert"]', l => l.map(e => e.textContent.trim().slice(0, 200)).filter(Boolean)).catch(() => []);
      }
      await p.fill('#entrada', t.texto);
      await p.waitForFunction(() => !document.querySelector('#enviar').disabled, null, { timeout: 30000 }).catch(() => {});
      const t0 = Date.now();
      const resp = p.waitForResponse(r => /\/api\/conversas\/\d+\/mensagens$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 120000 });
      await p.click('#enviar'); cliques.push('enviar');
      let corpo = '', status = null;
      try {
        const r = await resp; status = r.status();
        corpo = await Promise.race([r.text(), new Promise((_, n2) => setTimeout(() => n2(new Error('LIMITE_TURNO')), LIMITE_TURNO))]);
      } catch (e) { linha.falha = String(e.message).slice(0, 200); }
      linha.ms = Date.now() - t0; linha.status = status;
      const eventos = corpo.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const fim = eventos.find(e => e.t === 'fim'), erro = eventos.find(e => e.t === 'erro');
      const texto = eventos.filter(e => e.t === 'texto').map(e => e.v).join('');
      const final = eventos.filter(e => e.t === 'substituir').map(e => e.v).at(-1) ?? texto;
      if (!corpo && status && status >= 400) linha.erro_http = (await p.$$eval('.bolha-ia, .erro', l => l.map(e => e.textContent).join(' ')).catch(() => '')).slice(0, 400);
      Object.assign(linha, {
        etapas: eventos.filter(e => e.t === 'etapa').map(e => e.v),
        inicio_evento: eventos.find(e => e.t === 'inicio') || null,
        erro: erro ? String(erro.mensagem).slice(0, 400) : null,
        msg_id: fim?.id ?? null, modelo: fim?.modelo ?? null, classe: fim?.classe ?? null, fornecedor: fim?.fornecedor ?? null, rota: fim?.rota ?? null,
        fontes: fim?.fontes ?? null, qualidade: fim?.qualidade ? { status: fim.qualidade.status } : null,
        artefatos: (fim?.artefatos || []).map(a => ({ id: a.id, tipo: a.tipo, titulo: a.titulo, paginas: a.paginas, formatos: a.formatos })),
        arquivos: (fim?.arquivos || []).map(a => ({ id: a.id, nome: a.nome, slides: a.slides })),
        caracteres: final.length,
      });
      writeFileSync(join(pasta, `turno${n}-resposta.md`), final);
      writeFileSync(join(pasta, `turno${n}-eventos.json`), JSON.stringify(eventos.filter(e => e.t !== 'texto'), null, 1));
      // Espera a tela terminar de reler a conversa e captura o que o usuário vê.
      await p.waitForFunction(() => /Pronto\.|Resposta pronta\.|.+/.test(document.querySelector('#ao-vivo')?.textContent || '') && !document.querySelector('.cursor'), null, { timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const conv = (p.url().match(/#\/c\/(\d+)/) || [])[1]; if (conv) reg.conversa = Number(conv);
      await p.screenshot({ path: join(pasta, `turno${n}-tela.png`) });
      const alvo = fim?.id ? p.locator(`[data-msg="${fim.id}"]`) : p.locator('.resposta').last();
      if (await alvo.count()) await alvo.first().screenshot({ path: join(pasta, `turno${n}-resposta.png`) }).catch(() => {});
      // O que a tela oferece para baixar nesta resposta (cartões, artefatos, "baixar como").
      const links = await (await alvo.count() ? alvo.first() : p.locator('body')).evaluate(el => [...el.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), texto: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 120), cartao: a.classList.contains('anexo-resposta'), menu: !!a.closest('.baixar-como-menu'), download: a.hasAttribute('download') })).filter(a => a.href.startsWith('/api/') || /^https?:/.test(a.href)));
      linha.links = links;
      linha.imagens_na_resposta = await (await alvo.count() ? alvo.first() : p.locator('body')).evaluate(el => [...el.querySelectorAll('img')].map(i => ({ src: i.getAttribute('src')?.slice(0, 160), w: i.naturalWidth, h: i.naturalHeight }))).catch(() => []);
      const baixados = [];
      let j = 0;
      const vistos = new Set();
      for (const l of links.filter(l => l.href.startsWith('/api/') && (l.cartao || /\/artefatos\//.test(l.href) || (l.menu && t.formatos?.some(f => l.href.endsWith('/' + f))))).filter(l => !vistos.has(l.href) && vistos.add(l.href))) {
        const b = await c.binario(l.href);
        const nome = ((b.disposicao || '').match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i) || [])[1];
        const arq = `turno${n}-${++j}-${decodeURIComponent(nome || basename(l.href.split('?')[0]))}`.replace(/[^\w.\-]+/g, '_');
        if (b.status === 200) writeFileSync(join(pasta, arq), b.dados);
        baixados.push({ href: l.href, status: b.status, tipo: b.tipo, bytes: b.dados.length, arquivo: b.status === 200 ? arq : null, ms: b.ms });
      }
      linha.baixados = baixados;
      linha.cliques = cliques.length; linha.erros_pagina = errosPagina.splice(0);
      const img = baixados.find(x => /image\/(png|jpe?g|webp)/.test(x.tipo || ''));
      if (img) reg.saida_para_anexo = join(pasta, img.arquivo);
      reg.turnos[k] = linha;
      c.log(`  ${id} turno ${n}: ${linha.status} ${Math.round(linha.ms / 1000)}s classe=${linha.classe} modelo=${linha.modelo} arquivos=${linha.arquivos.length} artefatos=${linha.artefatos.length} baixados=${baixados.filter(b => b.arquivo).length}${linha.erro ? ' ERRO=' + linha.erro.slice(0, 120) : ''}${linha.falha ? ' FALHA=' + linha.falha : ''}`);
      writeFileSync(join(pasta, 'registro.json'), JSON.stringify(reg, null, 1));
      if (t.parar_se_falhar && !fim) break;
    }
    // Celular: a mesma conversa a 390 px (a última resposta).
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(800);
    await p.screenshot({ path: join(pasta, 'celular.png') });
    await ctx.close();
  } finally { await nav.close(); }
  reg.credito_depois = await credito();
  writeFileSync(join(pasta, 'registro.json'), JSON.stringify(reg, null, 1));
  c.log(`  ${id} FIM conversa=${reg.conversa} crédito ${reg.credito_antes?.percentual}→${reg.credito_depois?.percentual}`);
}
