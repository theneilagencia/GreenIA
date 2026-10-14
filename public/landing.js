// Página de entrada da empresa: marca, aviso de privacidade, retenção e, no modo multiempresa,
// o conteúdo da landing page editado no painel (título, textos, botões, imagem, chamadas, seções).
import { preencherMarca, logoEmpresa, esc } from '/comum.js';
import { prepararLanding, desenharLanding } from '/landing-render.js';
import '/surgir.js';

const $ = id => document.getElementById(id);
const p = await preencherMarca();
if (p.empresa) document.title = `${p.empresa} · GreenIA`;
if (p.favicon) $('favicon').href = p.favicon;
// Com logo, o logo substitui o nome no topo.
if (p.logo) {
  $('p-logo').innerHTML = logoEmpresa(p);
  document.querySelector('#p-marca .p-nome').classList.add('oculto');
}
const dias = Number(p.retencaoDias);
if (dias > 0) $('p-retencao').textContent = `Conversas sem uso são apagadas depois de ${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'}.`;
if (dias > 0) $('pp-retencao').textContent = `Retenção de ${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'} sem uso`;

// Ambiente em implantação, suspenso ou encerrado: aviso no topo; sem landing publicada, ficam só o essencial e o login.
if (p.aviso) {
  $('ld-aviso').textContent = p.aviso;
  $('ld-aviso').classList.remove('oculto');
  if (p.status === 'suspensa' || p.status === 'cancelada') for (const a of document.querySelectorAll('a[href="/entrar"]')) a.classList.add('oculto');
  // Encerrado: o admin pode pedir uma cópia dos dados ou a exclusão antecipada.
  if (p.status === 'cancelada') $('ld-aviso').insertAdjacentHTML('beforeend', ' <a href="/encerramento">Pedir cópia ou exclusão dos dados</a>');
}
if (p.multiempresa && !p.landing) for (const id of ['sec-chamadas', 'sec-regras', 'sec-tarefas', 'como-usar']) $(id).classList.add('oculto');

prepararLanding(document);

// Prévia do que está em edição (aberta por "Ver prévia" no editor): a página pede o conteúdo à janela que a abriu e
// o confere no servidor (mesmas regras do salvar, sem gravar). Só vale para quem pode ver a prévia; sem resposta,
// fica o que está salvo.
async function conteudoEmEdicao() {
  if (!p.previa || !new URLSearchParams(location.search).has('edicao') || !window.opener) return null;
  const recebido = await new Promise(ok => {
    const fim = setTimeout(() => ok(null), 15000);
    window.addEventListener('message', ev => {
      if (ev.source !== window.opener) return;
      if (ev.data?.tipo === 'greenia-previa-cancelada') { clearTimeout(fim); window.close(); return ok(null); }   // o editor recusou o conteúdo
      if (ev.data?.tipo !== 'greenia-previa') return;
      clearTimeout(fim); ok(ev.data);
    });
    window.opener.postMessage({ tipo: 'greenia-previa-pronta' }, '*');   // só o aviso; nenhum dado vai junto
  });
  if (!recebido) return null;
  try {
    const r = await fetch('/api/publico/previa', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: recebido.content, seo: recebido.seo }) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const emEdicao = await conteudoEmEdicao();
if (emEdicao) { p.landing = emEdicao.landing; p.seo = emEdicao.seo; }
// Prévia: quem pode editar vê a página completa, com uma faixa dizendo se os visitantes já veem esta versão.
if (p.previa) {
  const sair = location.pathname + location.hash;
  document.body.insertAdjacentHTML('afterbegin', `<div class="pp-previa" role="status"><b>Prévia · só você vê</b><span>${p.previa.visivelAoPublico
    ? 'Esta versão já está no ar para os visitantes.'
    : `Os visitantes ainda veem só a versão simples porque ${esc(p.previa.motivo || 'a página não está publicada')}.`} ${emEdicao ? 'A prévia mostra o que está em edição, ainda sem salvar.' : 'A prévia mostra o que está salvo.'}</span><a href="${esc(sair)}">Ver como visitante</a></div>`);
  $('ld-aviso')?.classList.add('oculto');
}
desenharLanding(document, p.landing, p.seo);
