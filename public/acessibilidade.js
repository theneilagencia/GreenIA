// Comportamento comum de teclado. Não altera permissões nem permite dispensar a ciência da política.
const controles = raiz => [...raiz.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
  .filter(el => el.getClientRects().length && !el.closest('[inert]'));
export function conterFoco(ev, raiz) {
  if (ev.key !== 'Tab' || ev.defaultPrevented || !raiz) return;
  const lista = controles(raiz), primeiro = lista[0], ultimo = lista.at(-1);
  if (!primeiro) { ev.preventDefault(); raiz.focus(); return; }
  if (!raiz.contains(document.activeElement) || document.activeElement === raiz) { ev.preventDefault(); (ev.shiftKey ? ultimo : primeiro).focus(); }
  else if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
  else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
}
export function iniciarAcessibilidade() {
  document.querySelector('.pular-conteudo')?.addEventListener('click', ev => {
    ev.preventDefault();
    const main = document.getElementById('principal');
    main.setAttribute('tabindex', '-1'); main.focus();
  });
  document.addEventListener('keydown', ev => {
    const dialogos = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(el => el.getClientRects().length);
    conterFoco(ev, dialogos.at(-1));
  });
}
export function fecharComEscape(raiz, fechar) {
  const tecla = ev => { if (ev.key === 'Escape' && raiz.isConnected) { ev.preventDefault(); fechar(); } };
  document.addEventListener('keydown', tecla);
  return () => document.removeEventListener('keydown', tecla);
}
