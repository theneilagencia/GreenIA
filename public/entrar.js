import { api, preencherMarca } from '/comum.js';

const $ = id => document.getElementById(id);
// Textos e ícone da tela de login vêm da marca da empresa (multiempresa).
preencherMarca().then(p => {
  if (p.loginTitulo) $('titulo-login').textContent = p.loginTitulo;
  if (p.loginTexto) $('explica').textContent = p.loginTexto;
  if (p.favicon) $('favicon').href = p.favicon;
  if (p.empresa) document.title = `Entrar · ${p.empresa}`;
});
let email = '';
const mostrarErro = (el, msg) => { el.textContent = msg; el.classList.toggle('oculto', !msg); };
let proximoReenvio = 0, timer;
function atualizarReenvio() {
  const segundos = Math.max(0, Math.ceil((proximoReenvio - Date.now()) / 1000));
  $('reenviar').disabled = segundos > 0;
  $('aviso-reenvio').textContent = segundos ? `Você pode pedir outro código em ${segundos} segundos.` : '';
  clearTimeout(timer);
  if (segundos) timer = setTimeout(atualizarReenvio, 1000);
}
function codigoEnviado() {
  $('enviado-para').textContent = `Enviamos o código para ${email}. Ele vale por 10 minutos. Use o código do email mais recente.`;
  $('codigo').value = '';
  proximoReenvio = Date.now() + 60000;
  atualizarReenvio();
  $('codigo').focus();
}

$('form-email').addEventListener('submit', async ev => {
  ev.preventDefault();
  email = $('email').value.trim();
  mostrarErro($('erro-email'), '');
  if (!$('email').checkValidity()) { mostrarErro($('erro-email'), 'Informe um email válido.'); $('email').focus(); return; }
  $('btn-email').disabled = true;
  try {
    await api('/api/login/codigo', { metodo: 'POST', corpo: { email } });
    $('form-email').classList.add('oculto');
    $('form-codigo').classList.remove('oculto');
    codigoEnviado();
  } catch (e) { mostrarErro($('erro-email'), e.message); }
  $('btn-email').disabled = false;
});

$('form-codigo').addEventListener('submit', async ev => {
  ev.preventDefault();
  mostrarErro($('erro-codigo'), '');
  if (!/^\d{6}$/.test($('codigo').value.trim())) { mostrarErro($('erro-codigo'), 'Informe os 6 dígitos recebidos por email.'); $('codigo').focus(); return; }
  $('btn-codigo').disabled = true;
  try {
    await api('/api/login/entrar', { metodo: 'POST', corpo: { email, codigo: $('codigo').value.trim() } });
    location.href = '/app';
  } catch (e) { mostrarErro($('erro-codigo'), e.message); $('btn-codigo').disabled = false; }
});

$('reenviar').addEventListener('click', async () => {
  if (Date.now() < proximoReenvio) return;
  $('reenviar').disabled = true;
  $('reenviar').textContent = 'Enviando…';
  mostrarErro($('erro-codigo'), '');
  try { await api('/api/login/codigo', { metodo: 'POST', corpo: { email } }); codigoEnviado(); }
  catch (e) { mostrarErro($('erro-codigo'), e.message); atualizarReenvio(); }
  finally { $('reenviar').textContent = 'Enviar novo código'; }
});

$('trocar').addEventListener('click', () => {
  $('form-codigo').classList.add('oculto');
  $('form-email').classList.remove('oculto');
  $('email').focus();
});
