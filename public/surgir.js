// Páginas públicas: linha no topo depois de rolar, blocos que surgem ao entrar na tela
// (grades em sequência) e números das telas ilustrativas que contam até o valor.
const topo = document.getElementById('topo');
const marcarTopo = () => topo?.classList.toggle('rolou', scrollY > 8);
addEventListener('scroll', marcarTopo, { passive: true });
marcarTopo();

const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GRADES = '.l-pilares,.l-planos,.l-etapas,.l-inst,.p-passos,.p-recursos,.p-regras,.p-tarefas,.l-contraste';

// Conta de 0 até o número (formato 15.420 ou 82%), mantendo o texto ao redor.
function contar(raiz) {
  for (const el of raiz.querySelectorAll('.num, .l-inst-uso b')) {
    const no = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
    if (!no || el.dataset.contou) continue;
    const m = /(\d{1,3}(?:\.\d{3})*|\d+)(%?)/.exec(no.textContent);
    if (!m) continue;
    const alvo = Number(m[1].replace(/\./g, '')), antes = no.textContent.slice(0, m.index), depois = no.textContent.slice(m.index + m[0].length);
    el.dataset.contou = '1';
    const t0 = performance.now(), dur = 1100;
    const passo = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      no.textContent = antes + Math.round(alvo * e).toLocaleString('pt-BR') + m[2] + depois;
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
}

if (!calmo && 'IntersectionObserver' in window) {
  for (const g of document.querySelectorAll(GRADES)) {
    if (!g.classList.contains('l-surge')) g.classList.add('l-surge');
    g.classList.add('l-cascata');
    [...g.children].forEach((f, i) => f.style.setProperty('--i', i));
  }
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.remove('espera'); contar(e.target); obs.unobserve(e.target);
  }), { rootMargin: '0px 0px -10% 0px' });
  for (const b of document.querySelectorAll('.l-surge')) {
    if (b.getBoundingClientRect().top > innerHeight * 0.9) { b.classList.add('espera'); obs.observe(b); }
    else contar(b);
  }
}
