// Paleta de comandos: Ctrl+K (ou ⌘K) abre uma busca que leva a qualquer tela, conversa, quick win
// ou ação. Setas navegam, Enter executa, Esc fecha. Quem usa a página fornece os itens.
import { esc, ICONE } from '/comum.js';

let fonte = () => [];
let aberto = null;

const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Busca simples por palavras: todas as palavras digitadas precisam aparecer no nome ou no grupo.
const combina = (item, q) => { const alvo = normal(`${item.nome} ${item.grupo} ${item.dica || ''} ${item.chaves || ''}`); return normal(q).split(/\s+/).filter(Boolean).every(p => alvo.includes(p)); };

export function iniciarPaleta(f, { atalhos = {} } = {}) {
  fonte = f;
  addEventListener('keydown', ev => {
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); aberto ? fechar() : abrirPaleta(); return; }
    if (aberto || digitando || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === '/' ) { ev.preventDefault(); abrirPaleta(); return; }
    const acao = atalhos[ev.key];
    if (acao) { ev.preventDefault(); acao(); }
  });
}

function fechar() {
  aberto?.remove();
  aberto = null;
  document.removeEventListener('keydown', teclas, true);
}

let itens = [], sel = 0, anteriorFoco = null;
function teclas(ev) {
  if (!aberto) return;
  if (ev.key === 'Escape') { ev.preventDefault(); fechar(); anteriorFoco?.focus?.(); }
  else if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(itens.length - 1, sel + 1); marcar(); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(0, sel - 1); marcar(); }
  else if (ev.key === 'Enter') { ev.preventDefault(); executar(itens[sel]); }
}

function marcar() {
  aberto.querySelectorAll('.paleta-item').forEach((b, i) => { b.setAttribute('aria-selected', String(i === sel)); if (i === sel) b.scrollIntoView({ block: 'nearest' }); });
  const b = aberto.querySelector('.paleta-item[aria-selected="true"]');
  aberto.querySelector('input').setAttribute('aria-activedescendant', b?.id || '');
}

function executar(item) {
  if (!item) return;
  fechar();
  if (item.acao) item.acao();
  else if (item.href) { if (item.href.startsWith('#')) location.hash = item.href; else location.href = item.href; }
}

function desenhar(q) {
  const todos = fonte();
  itens = (q ? todos.filter(i => combina(i, q)) : todos.filter(i => !i.soNaBusca)).slice(0, 60);
  sel = 0;
  const lista = aberto.querySelector('.paleta-lista');
  if (!itens.length) { lista.innerHTML = `<div class="paleta-vazio">Nada encontrado para “${esc(q)}”.</div>`; return; }
  let grupo = '';
  lista.innerHTML = itens.map((i, n) => {
    const cab = i.grupo !== grupo ? `<div class="paleta-grupo">${esc((grupo = i.grupo))}</div>` : '';
    return `${cab}<button type="button" class="paleta-item" role="option" id="pal-${n}" data-n="${n}" aria-selected="${n === 0}">${ICONE[i.icone] || ICONE.seta}<span>${esc(i.nome)}</span>${i.dica ? `<span class="dica">${esc(i.dica)}</span>` : ''}</button>`;
  }).join('');
  marcar();
}

export function abrirPaleta(inicial = '') {
  if (aberto) return;
  anteriorFoco = document.activeElement;
  aberto = document.createElement('div');
  aberto.className = 'paleta-fundo';
  aberto.innerHTML = `<div class="paleta" role="dialog" aria-modal="true" aria-label="Buscar ou ir para">
    <div class="paleta-busca">${ICONE.busca}<input type="text" placeholder="Buscar telas, conversas, quick wins ou ações" role="combobox" aria-expanded="true" aria-controls="paleta-lista" aria-autocomplete="list" value="${esc(inicial)}"></div>
    <div class="paleta-lista" id="paleta-lista" role="listbox"></div>
    <div class="paleta-pe"><span><span class="kbd">↑</span><span class="kbd">↓</span> navegar</span><span><span class="kbd">Enter</span> abrir</span><span><span class="kbd">Esc</span> fechar</span></div></div>`;
  document.body.append(aberto);
  const input = aberto.querySelector('input');
  input.addEventListener('input', () => desenhar(input.value));
  aberto.addEventListener('mousedown', ev => { if (ev.target === aberto) fechar(); });
  aberto.querySelector('.paleta-lista').addEventListener('click', ev => { const b = ev.target.closest('.paleta-item'); if (b) executar(itens[Number(b.dataset.n)]); });
  aberto.querySelector('.paleta-lista').addEventListener('mousemove', ev => { const b = ev.target.closest('.paleta-item'); if (b && Number(b.dataset.n) !== sel) { sel = Number(b.dataset.n); marcar(); } });
  document.addEventListener('keydown', teclas, true);
  desenhar(inicial);
  input.focus();
}

export const teclaPaleta = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K');
