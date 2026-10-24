// Formatação das telas de quem usa (frente "Uso e chat"): em 1920, 1366 e 390 px, nas telas de nova conversa
// (vazia e de Quick Win), conversa (livre e de Quick Win), histórico, primeiros passos, pendências, conhecimento, ajuda e
// menu do celular:
// - cartões irmãos começam o texto na mesma altura (tolerância de 4 px) e os da mesma linha têm a mesma altura;
// - nenhum texto é cortado com reticências quando caberia em duas linhas (títulos longos quebram, não somem);
// - nenhuma rolagem horizontal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { abrirAjudaTela, abrirConta } from './casca.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
const LARGURAS = [[1920, 1080], [1366, 860], [390, 844]];
const TITULO_LONGO = 'Escreva um email curto avisando a equipe sobre a nova rotina de conferência';
let S, nav, pessoa, livre, conversaQw;
const u = () => new URL(S.base);

before(async () => {
  S = await subirPlataforma();
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  await ops.post('/api/plataforma/empresas', { name: 'Empresa Layout', slug: 'empresa-layout', status: 'ativa', admin_email: 'admin@layout.test' });
  const admin = S.navegador(); await admin.get('/empresa-layout'); await admin.entrarEmpresa('admin@layout.test');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'pessoa@layout.test', name: 'Pessoa Layout', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  await admin.put(`/api/admin/pessoas/${(lista.pessoas || lista).find(x => x.email === 'pessoa@layout.test').id}`, { areas: [{ id: area }] });
  // Documentos com títulos de tamanhos diferentes: os cartões da mesma linha precisam ficar com a mesma altura.
  for (const [titulo, pasta] of [['Manual de compras', 'Manuais'], ['Procedimento de recebimento e conferência de notas fiscais de fornecedores', ''], ['Política de viagens', 'Políticas']]) {
    await admin.post('/api/bases/documentos', { area_id: area, titulo, pasta, arquivo: { nome: 'doc.txt', base64: Buffer.from(`Conteúdo fictício: ${titulo}.`).toString('base64') } });
  }
  const qw = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qw.id}`, { status: 'em_uso' });
  pessoa = S.navegador(); await pessoa.get('/empresa-layout'); await pessoa.entrarEmpresa('pessoa@layout.test');
  conversaQw = (await pessoa.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${conversaQw.id}/mensagens`, { texto: 'Confira estes dois documentos e liste as diferenças' });
  livre = (await pessoa.post('/api/conversas', {})).dados.conversa;
  await pessoa.req('POST', `/api/conversas/${livre.id}/mensagens`, { texto: 'Escreva um email para a equipe com uma lista dos próximos passos e uma tabela de prazos' });
  await pessoa.req('PATCH', `/api/conversas/${livre.id}`, { titulo: TITULO_LONGO });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

async function pagina(width, height) {
  const ctx = await nav.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: width < 1200 });
  await ctx.addCookies([...pessoa.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  return p;
}

// Medição na página: grupos de cartões, textos cortados e rolagem horizontal.
const medir = () => {
  const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const primeiroTexto = el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim().length > 1 && visivel(n.parentElement) && !n.parentElement.closest('.sr') ? 1 : 3 });
    const n = w.nextNode(); if (!n) return null;
    const rg = document.createRange(); rg.selectNodeContents(n); return rg.getClientRects()[0] || null;
  };
  const nome = e => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`;
  const problemas = [];
  const raizes = [document.querySelector('#principal'), document.querySelector('#modal'), document.querySelector('#lateral')].filter(Boolean);
  // Cartões: filhos (com borda ou fundo próprio e altura de cartão) de grades e linhas flexíveis.
  for (const raiz of raizes) for (const c of [raiz, ...raiz.querySelectorAll('*')]) {
    const cs = getComputedStyle(c);
    const grade = c.classList.contains('grade-cartoes');
    if (!grade && !(cs.display.includes('grid') || (cs.display.includes('flex') && !cs.flexDirection.startsWith('column')))) continue;
    const filhos = [...c.children].filter(visivel);
    const cartoes = grade ? filhos : filhos.filter(f => {
      const fs = getComputedStyle(f), r = f.getBoundingClientRect();
      return r.height >= 60 && ((parseFloat(fs.borderTopWidth) > 0 && fs.borderTopStyle !== 'none') || (fs.backgroundColor !== 'rgba(0, 0, 0, 0)' && fs.backgroundColor !== cs.backgroundColor));
    });
    if (cartoes.length < 2) continue;
    const linhas = [];
    for (const f of cartoes) { const t = f.getBoundingClientRect().top; const l = linhas.find(x => Math.abs(x.t - t) < 3); if (l) l.itens.push(f); else linhas.push({ t, itens: [f] }); }
    for (const { itens } of linhas) {
      if (itens.length < 2) continue;
      const alturas = itens.map(f => f.getBoundingClientRect().height);
      if (Math.max(...alturas) - Math.min(...alturas) > 1) problemas.push(`alturas diferentes na mesma linha em ${nome(c)}: ${alturas.map(Math.round)}`);
      const off = itens.map(f => { const r = primeiroTexto(f); return r ? r.top - f.getBoundingClientRect().top : null; }).filter(v => v !== null);
      if (off.length > 1 && Math.max(...off) - Math.min(...off) > 4) problemas.push(`primeiro texto desalinhado em ${nome(c)}: ${off.map(Math.round)}`);
      // Partes do padrão (descrição e ações) na mesma altura entre cartões da linha.
      for (const parte of ['.cartao-texto', '.cartao-acoes']) {
        const tops = itens.map(f => f.querySelector(`:scope > ${parte}`)).filter(x => x && visivel(x)).map(x => x.getBoundingClientRect().top);
        if (tops.length === itens.length && Math.max(...tops) - Math.min(...tops) > 4) problemas.push(`${parte} desalinhado em ${nome(c)}: ${tops.map(Math.round)}`);
      }
    }
    // Nenhum cartão órfão esticado: todos os cartões da grade com a mesma largura.
    const larguras = cartoes.map(f => f.getBoundingClientRect().width);
    if (getComputedStyle(c).display.includes('grid') && Math.max(...larguras) - Math.min(...larguras) > 2) problemas.push(`cartões de larguras diferentes em ${nome(c)}: ${larguras.map(Math.round)}`);
  }
  // Reticências: só valem quando o texto não caberia em duas linhas.
  for (const raiz of raizes) for (const e of raiz.querySelectorAll('*')) {
    if (!visivel(e) || !e.textContent.trim()) continue;
    const cs = getComputedStyle(e);
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    const cortadoNaLinha = cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1;
    const cortadoNoClamp = clamp && e.scrollHeight > e.clientHeight + 1;
    if (!cortadoNaLinha && !cortadoNoClamp) continue;
    const copia = e.cloneNode(true);
    Object.assign(copia.style, { position: 'absolute', visibility: 'hidden', left: '0', top: '0', width: `${e.clientWidth}px`, whiteSpace: 'normal', display: 'block', webkitLineClamp: 'none', overflow: 'visible', height: 'auto', maxHeight: 'none' });
    e.parentElement.appendChild(copia);
    const linhasNecessarias = Math.round(copia.getBoundingClientRect().height / (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2));
    copia.remove();
    if (linhasNecessarias <= 2) problemas.push(`texto cortado que cabe em 2 linhas: ${nome(e)} "${e.textContent.trim().slice(0, 40)}"`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) problemas.push(`rolagem horizontal: ${document.documentElement.scrollWidth} > ${innerWidth}`);
  return problemas;
};

const TELAS = [
  ['nova conversa', () => '#/nova', '#entrada'],
  ['nova conversa de Quick Win', () => `#/qw/${conversaQw.quick_win_id}/nova`, '#entrada'],
  ['conversa livre (título longo)', () => `#/c/${livre.id}`, '.rodape-resposta'],
  ['conversa de Quick Win', () => `#/c/${conversaQw.id}`, '.rodape-resposta'],
  ['histórico de conversas', () => '#/conversas', '.hc-conversa'],
  ['primeiros passos', () => '#/primeiros-passos', '#guia-seguir'],
  ['pendências', () => '#/pendencias', '#pend-lista'],
  ['conhecimento', () => '#/conhecimento', '[data-abrir-conhecimento]'],
  ['ajuda da tela', () => '#/conversas', '.hc-conversa', abrirAjudaTela],
  ['menu do celular', () => '#/nova', '#entrada', async p => { if (await p.locator('#menu').isVisible()) { await p.click('#menu'); await p.waitForSelector('#lateral.aberta'); await p.waitForTimeout(350); } }],
  // Por último: deixa a gaveta (no celular) e o menu da conta abertos.
  ['menu da conta', () => '#/conversas', '.hc-conversa', async p => { await abrirConta(p); }],
];

for (const [width, height] of LARGURAS) {
  test(`telas de uso em ${width} px: cartões alinhados e da mesma altura, sem texto cortado, sem rolagem horizontal`, async () => {
    const p = await pagina(width, height);
    const falhas = [];
    for (const [tela, hash, pronto, acao] of TELAS) {
      await p.goto(`${S.base}/app${hash()}`);
      await p.waitForSelector(pronto);
      await p.waitForLoadState('networkidle').catch(() => {});
      if (acao) await acao(p);
      await p.waitForTimeout(150);
      for (const x of await p.evaluate(medir)) falhas.push(`${tela}: ${x}`);
    }
    assert.deepEqual(falhas, [], `${width} px`);
    assert.deepEqual(p.erros, []);
    await p.context().close();
  });
}

test('o título longo da conversa aparece inteiro (até 2 linhas) no cabeçalho e na lateral, com o título completo no title', async () => {
  const p = await pagina(1366, 860);
  await p.goto(`${S.base}/app#/c/${livre.id}`); await p.waitForSelector('.rodape-resposta');
  const h1 = await p.locator('.cabeca h1').evaluate(e => ({ cortado: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1, title: e.title }));
  assert.equal(h1.cortado, false, 'o h1 cabe em 2 linhas');
  assert.equal(h1.title, TITULO_LONGO);
  const item = p.locator(`#lateral .historico-lat a[href="#/c/${livre.id}"]`);
  assert.equal(await item.getAttribute('title'), TITULO_LONGO);
  const nomeLat = await item.locator('.nome').evaluate(e => ({ linhas: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)), clamp: getComputedStyle(e).webkitLineClamp }));
  assert.equal(nomeLat.linhas, 2, 'o título ocupa as 2 linhas antes de cortar');
  assert.equal(nomeLat.clamp, '2');
  await p.context().close();
});
