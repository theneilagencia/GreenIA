// Página de vendas: formulário de contato e plano escolhido nos botões.
const $ = id => document.getElementById(id);
const form = $('form-contato');

// Topo com linha só depois de rolar.
const topo = $('topo');
const marcarTopo = () => topo.classList.toggle('rolou', scrollY > 8);
addEventListener('scroll', marcarTopo, { passive: true });
marcarTopo();

for (const a of document.querySelectorAll('[data-plano]')) a.addEventListener('click', () => {
  if (!$('c-msg').value) $('c-msg').value = `Tenho interesse no plano GreenIA ${a.dataset.plano}.`;
});

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
