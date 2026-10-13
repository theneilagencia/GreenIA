// Conta no pé da lateral (padrão assistente, como no Claude e no ChatGPT): avatar e nome abrem um menu com as
// ações da pessoa (Ajuda, Tema, Política, Sair...). Usado pelo app e pelo console da plataforma.
// Teclado: Enter, Espaço ou setas abrem; setas, Home e End percorrem; Esc fecha e devolve o foco ao botão.
import { esc } from '/comum.js';

const svg = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONE_CONTA = {
  painel: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/>'),
  ajuda: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17h.01"/>'),
  tema: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
  alerta: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
  acima: svg('<path d="M8 10l4-4 4 4"/><path d="M8 14l4 4 4-4"/>'),
};

export function iniciais(nome) {
  const n = String(nome || '').split(/[\s.@_-]+/).filter(Boolean);
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase();
}

// Um item do menu: link (atrib começa com href) ou botão.
export function itemMenu(atrib, icone, texto) {
  const tag = atrib.startsWith('href') ? 'a' : 'button';
  return `<${tag} ${tag === 'button' ? 'type="button" ' : ''}role="menuitem" tabindex="-1" ${atrib}>${icone}<span>${texto}</span></${tag}>`;
}
export const separadorMenu = '<div class="menu-conta-sep" role="separator"></div>';

// Tema (Automático, Claro, Escuro) como escolha única dentro do menu; a escolha é a do tema.js (este navegador).
const TEMAS = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];
export function temaMenuHtml(rotulo = 'Tema') {
  const atual = window.temaGreenIA?.ler() || 'auto';
  return `<div class="menu-conta-tema" role="group" aria-labelledby="menu-tema-rotulo"><span class="menu-conta-rotulo" id="menu-tema-rotulo">${ICONE_CONTA.tema}<span>${esc(rotulo)}</span></span><span class="menu-conta-opcoes">${TEMAS.map(([v, n]) => `<button type="button" role="menuitemradio" tabindex="-1" aria-checked="${atual === v}" data-tema-opcao="${v}">${n}</button>`).join('')}</span></div>`;
}

// Botão da conta + menu (fechado). `itens` é o HTML dos itens, na ordem.
export function contaHtml({ nome, email, sub = '', itens, dica = false }) {
  return `<div class="conta">
    <button type="button" class="conta-btn" id="conta" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-conta" aria-label="Conta de ${esc(nome || email)}"${dica ? ` title="${esc(nome || email)}"` : ''}><span class="avatar" aria-hidden="true">${esc(iniciais(nome || email))}</span><span class="conta-nome" aria-hidden="true"><b>${esc(nome || email)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="conta-seta">${ICONE_CONTA.acima}</span></button>
    <div class="menu-conta" id="menu-conta" role="menu" aria-label="Conta" hidden>
      <div class="menu-conta-quem" role="none"><b>${esc(nome || email)}</b>${nome && email && nome !== email ? `<span>${esc(email)}</span>` : ''}</div>
      ${itens}
    </div></div>`;
}

const $ = id => document.getElementById(id);
const itens = () => [...($('menu-conta')?.querySelectorAll('[role^="menuitem"]') || [])].filter(el => !el.disabled);
function fora(ev) { if (!ev.target.closest?.('#menu-conta, #conta')) fecharMenuConta(); }

export function abrirMenuConta(qual = 0) {
  const b = $('conta'), m = $('menu-conta');
  if (!b || !m) return;
  m.hidden = false; b.setAttribute('aria-expanded', 'true');
  // Abre acima do botão, presa à janela: a lateral recolhida é estreita e cortaria o menu.
  const r = b.getBoundingClientRect(), largura = Math.min(280, innerWidth - 16);
  m.style.width = `${largura}px`;
  m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - largura - 8))}px`;
  m.style.bottom = `${Math.max(8, innerHeight - r.top + 6)}px`;
  const lista = itens();
  (qual === 'ultimo' ? lista.at(-1) : lista[0])?.focus();
  document.addEventListener('pointerdown', fora, true);
}

export function fecharMenuConta(devolverFoco = false) {
  document.removeEventListener('pointerdown', fora, true);
  const m = $('menu-conta');
  if (!m || m.hidden) return;
  m.hidden = true; $('conta')?.setAttribute('aria-expanded', 'false');
  if (devolverFoco) $('conta')?.focus();
}

// Liga o botão e o menu. `acoes`: { id do item: função }; o menu fecha antes de cada ação.
export function ligarConta(acoes = {}) {
  const b = $('conta'), m = $('menu-conta');
  if (!b || !m) return;
  b.onclick = () => (m.hidden ? abrirMenuConta() : fecharMenuConta());
  b.onkeydown = ev => { if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); abrirMenuConta(ev.key === 'ArrowUp' ? 'ultimo' : 0); } };
  m.onkeydown = ev => {
    const lista = itens(), i = lista.indexOf(document.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fecharMenuConta(true); }
    else if (ev.key === 'Tab') fecharMenuConta();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault();
      const n = lista.length, j = ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : (i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n;
      lista[j]?.focus();
    }
  };
  for (const [id, fn] of Object.entries(acoes)) { const el = $(id); if (el) el.onclick = ev => { fecharMenuConta(); fn(ev); }; }
  m.querySelectorAll('a[role="menuitem"]').forEach(a => a.addEventListener('click', () => fecharMenuConta()));
  m.querySelectorAll('[data-tema-opcao]').forEach(t => { t.onclick = () => {
    window.temaGreenIA?.escolher(t.dataset.temaOpcao);
    m.querySelectorAll('[data-tema-opcao]').forEach(x => x.setAttribute('aria-checked', String(x === t)));
  }; });
}
