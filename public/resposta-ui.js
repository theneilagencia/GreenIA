// Peças da área de mensagens no padrão dos assistentes de chat: ícones das ações da resposta, copiar com
// confirmação (ícone de "ok" por um instante e anúncio para o leitor de tela) e o painel "Detalhes" (popover).

const svg = (d, w = 1.7) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const ICONE_RESPOSTA = {
  copiar: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>'),
  ok: svg('<path d="M20 6L9 17l-5-5"/>', 2),
  regerar: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  gostei: svg('<path d="M7 10v11H4V10z"/><path d="M7 10l4-7a2.5 2.5 0 0 1 3 2.6L13.5 9H19a2 2 0 0 1 2 2.3l-1.3 7.6A2.5 2.5 0 0 1 17.2 21H7"/>'),
  naoGostei: svg('<path d="M17 14V3h3v11z"/><path d="M17 14l-4 7a2.5 2.5 0 0 1-3-2.6l.5-3.4H5a2 2 0 0 1-2-2.3l1.3-7.6A2.5 2.5 0 0 1 6.8 3H17"/>'),
  detalhes: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5v.01"/>', 1.8),
  simulada: svg('<path d="M9 3h6"/><path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>', 1.6),
  planilha: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>', 1.6),
  baixar: svg('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>', 1.8),
  documento: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>', 1.6),
  imagem: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>', 1.6),
  slides: svg('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v3M8 21h8"/><path d="M7 9h6M7 12h10"/>', 1.6),
};

// Anuncia para leitor de tela sem mudar o foco (região "ao-vivo" da conversa ou uma própria, criada uma vez).
export function anunciar(texto) {
  let r = document.getElementById('ao-vivo') || document.getElementById('ao-vivo-resposta');
  if (!r) { r = Object.assign(document.createElement('div'), { id: 'ao-vivo-resposta', className: 'sr' }); r.setAttribute('aria-live', 'polite'); document.body.append(r); }
  r.textContent = '';
  setTimeout(() => { r.textContent = texto; }, 30);
}

// Copia o texto e mostra o "ok" no próprio botão por 2 s (rótulo e dica acompanham), como nos assistentes de chat.
export async function copiarTexto(texto, botao, aviso = 'Copiado.') {
  try { await navigator.clipboard.writeText(texto); }
  catch { anunciar('Não foi possível copiar. Selecione o texto e use Ctrl+C.'); return false; }
  if (botao) {
    if (!botao.dataset.rotuloOriginal) { botao.dataset.rotuloOriginal = botao.getAttribute('aria-label') || ''; botao.dataset.iconeOriginal = botao.innerHTML; }
    botao.innerHTML = ICONE_RESPOSTA.ok; botao.classList.add('copiado');
    botao.setAttribute('aria-label', 'Copiado'); botao.title = 'Copiado';
    clearTimeout(botao._copiado);
    botao._copiado = setTimeout(() => {
      botao.innerHTML = botao.dataset.iconeOriginal; botao.classList.remove('copiado');
      botao.setAttribute('aria-label', botao.dataset.rotuloOriginal); botao.title = botao.dataset.rotuloOriginal;
    }, 2000);
  }
  anunciar(aviso);
  return true;
}

// "Copiar código" dos blocos de código (qualquer tela que mostre Markdown renderizado).
if (typeof document !== 'undefined' && !window.__greeniaCopiarCodigo) {
  window.__greeniaCopiarCodigo = true;
  document.addEventListener('click', ev => {
    const b = ev.target.closest?.('[data-copiar-codigo]');
    if (!b) return;
    const codigo = b.closest('.bloco-codigo')?.querySelector('code');
    if (codigo) copiarTexto(codigo.textContent, b, 'Código copiado.');
  });
}

// Popover "Detalhes": abre acima do botão quando há espaço (a última resposta fica junto da caixa de mensagem),
// fecha com Esc (devolvendo o foco), clique fora ou ao abrir outro.
let aberto = null;
export function alternarDetalhes(botao) {
  const painel = document.getElementById(botao.getAttribute('aria-controls'));
  if (!painel) return;
  const abrir = painel.hidden;
  fecharDetalhes(false);
  if (!abrir) return;
  painel.hidden = false; botao.setAttribute('aria-expanded', 'true');
  painel.classList.remove('para-baixo');
  const area = botao.closest('.mensagens')?.getBoundingClientRect() || { top: 0 };
  if (botao.getBoundingClientRect().top - area.top < painel.offsetHeight + 12) painel.classList.add('para-baixo');
  aberto = { botao, painel };
  document.addEventListener('pointerdown', fora, true);
  document.addEventListener('keydown', tecla, true);
}
export function fecharDetalhes(focar = true) {
  if (!aberto) return;
  const { botao, painel } = aberto;
  aberto = null;
  painel.hidden = true; botao.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', fora, true);
  document.removeEventListener('keydown', tecla, true);
  if (focar && botao.isConnected) botao.focus();
}
function fora(ev) { if (aberto && !aberto.painel.contains(ev.target) && !aberto.botao.contains(ev.target)) fecharDetalhes(false); }
function tecla(ev) { if (ev.key === 'Escape' && aberto) { ev.preventDefault(); ev.stopPropagation(); fecharDetalhes(true); } }
