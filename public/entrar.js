import { api, preencherMarca } from '/comum.js';

preencherMarca();
const $ = id => document.getElementById(id);
let email = '';
const mostrarErro = (el, msg) => { el.textContent = msg; el.classList.toggle('oculto', !msg); };

$('form-email').addEventListener('submit', async ev => {
  ev.preventDefault();
  email = $('email').value.trim();
  mostrarErro($('erro-email'), '');
  $('btn-email').disabled = true;
  try {
    await api('/api/login/codigo', { metodo: 'POST', corpo: { email } });
    $('form-email').classList.add('oculto');
    $('form-codigo').classList.remove('oculto');
    $('enviado-para').textContent = `Enviamos o código para ${email}. Ele vale por 10 minutos.`;
    $('codigo').focus();
  } catch (e) { mostrarErro($('erro-email'), e.message); }
  $('btn-email').disabled = false;
});

$('form-codigo').addEventListener('submit', async ev => {
  ev.preventDefault();
  mostrarErro($('erro-codigo'), '');
  $('btn-codigo').disabled = true;
  try {
    await api('/api/login/entrar', { metodo: 'POST', corpo: { email, codigo: $('codigo').value.trim() } });
    location.href = '/app';
  } catch (e) { mostrarErro($('erro-codigo'), e.message); $('btn-codigo').disabled = false; }
});

$('trocar').addEventListener('click', () => {
  $('form-codigo').classList.add('oculto');
  $('form-email').classList.remove('oculto');
  $('email').focus();
});
