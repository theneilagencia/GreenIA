// Página de encerramento do ambiente (no endereço da empresa): pedido de cópia dos dados ou exclusão antecipada,
// com código enviado ao email de um admin cadastrado. O servidor confere tudo de novo (encerramento.js).
import { api, preencherMarca } from '/comum.js';

const $ = id => document.getElementById(id);
const erro = (el, msg) => { el.textContent = msg; el.classList.toggle('oculto', !msg); };
preencherMarca().then(p => { if (p.favicon) $('favicon').href = p.favicon; if (p.empresa) document.title = `Encerramento · ${p.empresa}`; });

let email = '';
const situacao = await api('/api/encerramento').catch(() => ({ encerrado: false }));
if (!situacao.encerrado) $('nao-encerrado').classList.remove('oculto');
else {
  $('encerrado').classList.remove('oculto');
  $('slug').textContent = situacao.identificador;
  $('prazo').textContent = situacao.excluirApos
    ? `Este ambiente foi cancelado. Os dados serão excluídos definitivamente a partir de ${new Date(situacao.excluirApos).toLocaleDateString('pt-BR')}, salvo impedimento legal.`
    : 'Este ambiente foi cancelado.';
}
for (const r of document.querySelectorAll('input[name="acao"]')) r.onchange = () => $('confirma-exclusao').classList.toggle('oculto', r.value !== 'excluir' || !r.checked);

$('form-email').addEventListener('submit', async ev => {
  ev.preventDefault();
  email = $('email').value.trim();
  erro($('erro-email'), '');
  $('btn-email').disabled = true;
  try {
    await api('/api/encerramento/codigo', { metodo: 'POST', corpo: { email } });
    $('form-email').classList.add('oculto');
    $('form-pedido').classList.remove('oculto');
    $('enviado-para').textContent = `Enviamos o código para ${email}. Ele vale por 10 minutos e serve para um pedido.`;
    $('codigo').focus();
  } catch (e) { erro($('erro-email'), e.message); }
  $('btn-email').disabled = false;
});

$('form-pedido').addEventListener('submit', async ev => {
  ev.preventDefault();
  erro($('erro-pedido'), '');
  const acao = document.querySelector('input[name="acao"]:checked').value;
  const codigo = $('codigo').value.trim();
  $('btn-pedido').disabled = true;
  try {
    if (acao === 'excluir') {
      await api('/api/encerramento/excluir', { metodo: 'POST', corpo: { email, codigo, confirmacao: $('identificador').value.trim(), irreversivel: $('irreversivel').checked } });
      $('feito').textContent = 'O ambiente e os dados dele foram excluídos. As cópias de segurança seguem os prazos de retenção e depois são eliminadas.';
    } else {
      const r = await api('/api/encerramento/devolucao', { metodo: 'POST', corpo: { email, codigo } });
      $('feito').textContent = r.jaExistia ? 'Já existe um pedido de cópia em andamento. Você recebe o link por email.' : 'Pedido registrado. Você recebe por email um link de uso único para baixar a cópia, válido por até 7 dias.';
    }
    $('form-pedido').classList.add('oculto');
    $('feito').classList.remove('oculto');
  } catch (e) { erro($('erro-pedido'), e.message); $('btn-pedido').disabled = false; }
});
