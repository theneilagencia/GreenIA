// App da GreenIA: casca (barra lateral, cabeçalho) e rotas por hash.
//   #/nova          nova conversa no chat geral
//   #/c/:id         conversa (chat ou quick win)
//   #/qw/:id        página de um quick win (e #/qw/:id/editar, #/qw/nova)
import { api, definirCsrf, esc, ICONE, marcaHtml } from '/comum.js';
import { vistaConversa, lembreteAoSair } from '/conversa.js';

export const E = { eu: null, publico: {}, conversas: [], quickWins: [], retencaoDias: 90, rotas: {} };
const $ = id => document.getElementById(id);

export const irPara = hash => { if (location.hash === hash) rota(); else location.hash = hash; };

function iniciais(p) {
  const n = (p.nome || p.email).split(/[\s.@_-]+/).filter(Boolean);
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase();
}

export function cabecalho(titulo, acoes = '') {
  const p = E.eu;
  return `<header class="cabeca">
    <div class="cabeca-titulo">
      <button class="icone-btn menu-btn" id="menu" aria-label="Abrir conversas" aria-controls="lateral" aria-expanded="false">${ICONE.menu}</button>
      <h1>${esc(titulo)}</h1>${acoes}
    </div>
    <div class="cabeca-acoes">
      <div class="usuario"><span class="avatar" aria-hidden="true">${esc(iniciais(p))}</span>
        <div class="usuario-meta"><b>${esc(p.nome)}</b><span>${esc(p.email)}</span></div>
        <button class="icone-btn" id="sair" aria-label="Sair" title="Sair">${ICONE.sair}</button></div>
    </div></header>`;
}

export function ligarCabecalho() {
  $('sair').onclick = async () => { await api('/api/sair', { metodo: 'POST' }); location.href = '/'; };
  $('menu').onclick = () => { const a = $('lateral').classList.toggle('aberta'); $('menu').setAttribute('aria-expanded', String(a)); };
}

const itemConversa = c => `<a class="item-lat${location.hash === `#/c/${c.id}` ? ' ativo' : ''}" href="#/c/${c.id}">
  <span class="nome">${esc(c.titulo)}</span>${c.sigilosa ? '<span class="selo-lat" title="Sigilosa · só modelos homologados">Sigilosa</span>' : ''}</a>`;

export function desenharLateral() {
  const qws = E.quickWins;
  $('lateral').innerHTML = `
    <a class="marca" href="/" aria-label="GreenIA, página inicial">${marcaHtml(true)}</a>
    <a class="btn btn-verde nova" href="#/nova">${ICONE.mais} Nova conversa</a>
    <nav class="lateral-rolagem" aria-label="Conversas e quick wins">
      <h2>Conversas</h2>
      ${E.conversas.length ? E.conversas.map(itemConversa).join('') : '<div class="vazio-lat">Suas conversas aparecem aqui.</div>'}
      <h2 style="margin-top:22px">Quick wins</h2>
      ${qws.length ? qws.map(q => `<a class="item-lat${location.hash.startsWith(`#/qw/${q.id}`) ? ' ativo' : ''}" href="#/qw/${q.id}">
        <span class="cor" style="background:${esc(q.cor)}"></span><span class="nome">${esc(q.nome)}</span>${q.status !== 'ativo' ? `<span class="selo-lat" style="background:var(--sage)">${q.status === 'rascunho' ? 'Rascunho' : 'Pausado'}</span>` : ''}</a>`).join('')
        : '<div class="vazio-lat">Os quick wins das suas áreas aparecem aqui.</div>'}
      ${E.podeCriarQw ? '<a class="item-lat" href="#/qw/nova" style="color:var(--spark)">+ Criar quick win</a>' : ''}
    </nav>
    <div class="lateral-pe">
      ${E.eu.admin ? '<a class="btn-lat" href="/admin">Painel do admin</a>' : ''}
      <button class="btn-lat" id="ver-politica">Ver a política</button>
      <p class="nota">${esc(E.publico.privacyNote)}</p>
    </div>`;
  $('ver-politica').onclick = abrirPolitica;
}

export async function recarregarLateral() {
  const [c, q] = await Promise.all([api('/api/conversas'), api('/api/quick-wins').catch(() => ({ quickWins: [] }))]);
  E.conversas = c.conversas;
  E.quickWins = q.quickWins || [];
  desenharLateral();
}

function abrirPolitica() {
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-politica" tabindex="-1">
    <div class="modal-topo"><div class="rotulo">A política, em resumo</div><button class="icone-btn" id="fechar-modal" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="titulo-politica">Como usar a GreenIA com segurança</h2>
    <div class="item"><h3>Conversa normal e conversa sigilosa</h3><p>Dado sigiloso (pessoal, de cliente, financeiro, jurídico ou estratégico) só entra em conversa sigilosa, que usa apenas modelos homologados pela empresa.</p></div>
    <div class="item"><h3>Suas conversas ficam com você</h3><p>${esc(E.publico.privacyNote)}</p></div>
    <div class="item"><h3>Revise antes de usar</h3><p>A IA ajuda, mas pode errar. Confira o resultado antes de enviar ou decidir.</p></div>
    <a href="/politica" class="btn-texto" style="padding-left:0">Abrir a política completa →</a></div></div>`;
  const fechar = () => { $('modal').innerHTML = ''; $('ver-politica')?.focus(); };
  $('fechar-modal').onclick = fechar;
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); } });
  document.querySelector('.modal').focus();
}

async function rota() {
  lembreteAoSair();
  $('lateral').classList.remove('aberta');
  const h = location.hash;
  let m;
  try {
    if ((m = /^#\/c\/(\d+)$/.exec(h))) await vistaConversa({ id: Number(m[1]) });
    else if (h.startsWith('#/qw/') && E.rotas.quickWin) await E.rotas.quickWin(h);
    else await vistaConversa({});
  } catch (e) {
    $('principal').innerHTML = `${cabecalho('GreenIA')}<div class="pagina"><div class="pagina-dentro"><p class="lead">${esc(e.message)}</p><a class="btn btn-verde" href="#/nova">Voltar ao chat</a></div></div>`;
    ligarCabecalho();
  }
  desenharLateral();
}

async function iniciar() {
  const [eu, publico] = await Promise.all([api('/api/eu'), api('/api/publico')]);
  definirCsrf(eu.csrf);
  Object.assign(E, { eu: eu.pessoa, publico, retencaoDias: publico.retencaoDias, podeCriarQw: eu.pessoa.admin || eu.pessoa.areas.some(a => a.responsavel) });
  document.getElementById('fundo-lateral').onclick = () => $('lateral').classList.remove('aberta');
  const qw = await import('/quickwin.js').catch(() => null);
  if (qw) E.rotas.quickWin = qw.rotaQuickWin;
  await recarregarLateral();
  window.addEventListener('hashchange', rota);
  await rota();
}
iniciar();
