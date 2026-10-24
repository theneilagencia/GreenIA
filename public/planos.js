import '/surgir.js';

// Mesma navegação compacta do site público, com devolução de foco no Escape.
const menu = document.querySelector('.l-menu');
if (menu) {
  menu.addEventListener('click', e => { if (e.target.closest('.l-menu-painel a')) menu.open = false; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}

// O salto também leva o foco à comparação para leitores de tela e teclado.
for (const link of document.querySelectorAll('a[href="#comparar-planos"]')) {
  link.addEventListener('click', () => document.getElementById('comparar-planos').focus({ preventScroll: true }));
}
