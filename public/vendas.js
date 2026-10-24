// Página de vendas: formulário de contato.
import '/surgir.js';
import '/lp-quickwin-demo.js';
import '/lp-operacoes.js';

const $ = id => document.getElementById(id);
const form = $('form-contato');
let enviando = false;

// Interesses vindos da página de planos: somente nomes conhecidos, sem envio automático.
const planosDeInteresse = { starter: 'GreenIA Starter', team: 'GreenIA Team', business: 'GreenIA Business', company: 'GreenIA Company', capacity_pack: 'Capacity Pack' };
const chaveInteresse = new URLSearchParams(location.search).get('plano');
const interesse = Object.hasOwn(planosDeInteresse, chaveInteresse) ? planosDeInteresse[chaveInteresse] : null;
if (interesse && !$('c-msg').value) $('c-msg').value = `Quero conversar sobre o ${interesse} e a capacidade para a minha empresa.`;

form.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (enviando) return;
  const erro = $('c-erro'), botao = $('c-enviar');
  erro.classList.add('oculto');
  const dados = Object.fromEntries(new FormData(form));
  if (!form.checkValidity()) { erro.textContent = 'Preencha nome, email e empresa.'; erro.classList.remove('oculto'); return; }
  enviando = true;
  botao.disabled = true;
  try {
    const r = await fetch('/api/contato', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dados) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.mensagem || 'Não foi possível enviar agora. Tente de novo.');
    for (const el of form.querySelectorAll('.campo, .l-form-grade, #c-enviar')) el.classList.add('oculto');
    $('c-ok').classList.remove('oculto');
    if (d.recebido === true && typeof d.conversao_id === 'string') document.dispatchEvent(new CustomEvent('greenia:contato-recebido', { detail: { id: d.conversao_id } }));
  } catch (e) {
    erro.textContent = e.message; erro.classList.remove('oculto'); botao.disabled = false;
  } finally { enviando = false; }
});

// Menu compacto do topo (celular e tablet): fecha ao escolher uma seção, com Esc (foco volta ao botão) e ao tocar fora.
const menu = document.querySelector('.l-menu');
if (menu) {
  menu.addEventListener('click', e => { if (e.target.closest('.l-menu-painel a')) menu.open = false; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}

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
