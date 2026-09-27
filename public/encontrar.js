// Encontre o seu ambiente: envia o email e mostra sempre a mesma confirmação.
import { api, ocupado } from '/comum.js';

const $ = id => document.getElementById(id);
$('form-encontrar').addEventListener('submit', ev => {
  ev.preventDefault();
  const email = $('email').value.trim(), erro = $('erro');
  erro.classList.add('oculto');
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { erro.textContent = 'Informe um email válido.'; erro.classList.remove('oculto'); $('email').focus(); return; }
  ocupado($('enviar'), async () => {
    try {
      const r = await api('/api/encontrar', { metodo: 'POST', corpo: { email, site: $('site').value } });
      $('form-encontrar').classList.add('oculto');
      $('ok').textContent = r.mensagem;
      $('ok').classList.remove('oculto');
      $('ok').focus();
    } catch (e) { erro.textContent = e.message; erro.classList.remove('oculto'); }
  });
});
