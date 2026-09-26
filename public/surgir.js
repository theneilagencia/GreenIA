// Páginas públicas: linha no topo depois de rolar e entrada suave dos blocos abaixo da dobra.
const topo = document.getElementById('topo');
const marcarTopo = () => topo?.classList.toggle('rolou', scrollY > 8);
addEventListener('scroll', marcarTopo, { passive: true });
marcarTopo();
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('espera'); obs.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  for (const b of document.querySelectorAll('.l-surge')) {
    if (b.getBoundingClientRect().top > innerHeight) { b.classList.add('espera'); obs.observe(b); }
  }
}
