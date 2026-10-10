// Página de vendas: formulário de contato.
import '/surgir.js';
import '/lp-quickwin-demo.js';
import '/lp-operacoes.js';

const $ = id => document.getElementById(id);
const form = $('form-contato');

form.addEventListener('submit', async ev => {
  ev.preventDefault();
  const erro = $('c-erro'), botao = $('c-enviar');
  erro.classList.add('oculto');
  const dados = Object.fromEntries(new FormData(form));
  if (!form.checkValidity()) { erro.textContent = 'Preencha nome, email e empresa.'; erro.classList.remove('oculto'); return; }
  botao.disabled = true;
  try {
    const r = await fetch('/api/contato', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dados) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.mensagem || 'Não foi possível enviar agora. Tente de novo.');
    for (const el of form.querySelectorAll('.campo, .l-form-grade, #c-enviar')) el.classList.add('oculto');
    $('c-ok').classList.remove('oculto');
  } catch (e) {
    erro.textContent = e.message; erro.classList.remove('oculto'); botao.disabled = false;
  }
});

// Controle e confidencialidade: parallax discreto na foto (até 14 px), só com movimento liberado.
const cena = document.querySelector('.l-cena-foto');
if (cena && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let pedido = 0;
  const mover = () => {
    pedido = 0;
    const r = cena.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;   // -1 (acima) … 1 (abaixo)
    cena.style.setProperty('--par', `${Math.max(-14, Math.min(14, k * 20)).toFixed(1)}px`);
  };
  addEventListener('scroll', () => { if (!pedido) pedido = requestAnimationFrame(mover); }, { passive: true });
  mover();
}

// Modelos de IA: brilho do cartão acompanha o cursor (só com mouse e movimento liberado).
const ecos = document.querySelector('.l-ecos');
if (ecos && matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
  ecos.addEventListener('pointermove', e => {
    const r = ecos.getBoundingClientRect();
    ecos.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ecos.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}
