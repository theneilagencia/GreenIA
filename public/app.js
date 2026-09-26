// App da GreenIA: chat, conversas salvas e quick wins.
import { api, definirCsrf, esc, ICONE, marcaHtml } from '/comum.js';

const E = { eu: null, publico: {} };
const $ = id => document.getElementById(id);

function iniciais(p) {
  const n = (p.nome || p.email).split(/[\s.@_-]+/).filter(Boolean);
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase();
}

function desenharLateral() {
  $('lateral').innerHTML = `
    <a class="marca" href="/" aria-label="GreenIA, página inicial">${marcaHtml(true)}</a>
    <button class="btn btn-verde nova" id="nova">${ICONE.mais} Nova conversa</button>
    <div class="lateral-rolagem"><h2>Conversas</h2><div class="vazio-lat">Suas conversas aparecem aqui.</div></div>
    <div class="lateral-pe">
      <a class="btn-lat" href="/politica">Ver a política</a>
      <p class="nota">${esc(E.publico.privacyNote)}</p>
    </div>`;
}

function desenharPrincipal() {
  const p = E.eu;
  $('principal').innerHTML = `
    <header class="cabeca">
      <div class="cabeca-titulo">
        <button class="icone-btn menu-btn" id="menu" aria-label="Abrir conversas" aria-controls="lateral" aria-expanded="false">${ICONE.menu}</button>
        <h1>Nova conversa</h1>
      </div>
      <div class="cabeca-acoes">
        <div class="usuario"><span class="avatar" aria-hidden="true">${esc(iniciais(p))}</span>
          <div class="usuario-meta"><b>${esc(p.nome)}</b><span>${esc(p.email)}</span></div>
          <button class="icone-btn" id="sair" aria-label="Sair" title="Sair">${ICONE.sair}</button></div>
      </div>
    </header>
    <div class="mensagens"><div class="coluna"><div class="boas-vindas">
      <img src="/assets/greenia-symbol-forest.svg" width="56" height="56" alt="" aria-hidden="true">
      <h2>Olá. Sou a GreenIA.</h2><p>Posso resumir, rascunhar, conferir e organizar. Por onde começamos?</p></div></div></div>`;
  $('sair').onclick = async () => { await api('/api/sair', { metodo: 'POST' }); location.href = '/'; };
  $('menu').onclick = () => { const a = $('lateral').classList.toggle('aberta'); $('menu').setAttribute('aria-expanded', String(a)); };
  $('fundo-lateral').onclick = () => { $('lateral').classList.remove('aberta'); $('menu').setAttribute('aria-expanded', 'false'); };
}

async function iniciar() {
  const [eu, publico] = await Promise.all([api('/api/eu'), api('/api/publico')]);
  definirCsrf(eu.csrf);
  Object.assign(E, { eu: eu.pessoa, publico });
  desenharLateral();
  desenharPrincipal();
}
iniciar();
