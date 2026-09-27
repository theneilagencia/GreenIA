// Página de entrada da empresa: marca, aviso de privacidade, retenção e, no modo multiempresa,
// o conteúdo da landing page editado no painel (título, textos, botões, imagem, chamadas, seções).
import { preencherMarca, logoEmpresa, esc } from '/comum.js';
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

// Ambiente em implantação, suspenso ou encerrado: aviso no topo; sem landing publicada, ficam só o essencial e o login.
if (p.aviso) {
  $('ld-aviso').textContent = p.aviso;
  $('ld-aviso').classList.remove('oculto');
  if (p.status === 'suspensa' || p.status === 'cancelada') for (const a of document.querySelectorAll('a[href="/entrar"]')) a.classList.add('oculto');
}
if (p.multiempresa && !p.landing) for (const id of ['sec-chamadas', 'sec-regras', 'sec-tarefas', 'como-usar']) $(id).classList.add('oculto');

const l = p.landing;
if (l) {
  if (l.rotulo) $('ld-rotulo').textContent = l.rotulo;
  $('ld-titulo').textContent = l.titulo;
  $('ld-sub').textContent = l.subtitulo || '';
  if (l.descricao) { $('ld-desc').textContent = l.descricao; $('ld-desc').classList.remove('oculto'); }
  if (l.botoes?.length) $('ld-botoes').innerHTML = l.botoes.map(b => `<a class="btn ${b.estilo === 'secundario' ? 'btn-linha' : 'btn-verde'} btn-grande" href="${esc(b.link)}"${/^https?:/.test(b.link) ? ' target="_blank" rel="noopener"' : ''}>${esc(b.texto)}</a>`).join('');
  $('ld-destaques').innerHTML = (l.destaques || []).map(d => `<li><svg width="16" height="16"><use href="#ok"/></svg>${esc(d)}</li>`).join('');
  if (l.imagem) $('ld-figura').innerHTML = `<img src="${esc(l.imagem)}" alt="" style="width:100%;border-radius:14px;border:1px solid var(--line)">`;
  if (l.chamadas?.length) $('ld-chamadas').innerHTML = l.chamadas.map(c => `<div><b>${esc(c.titulo)}</b><p>${esc(c.texto)}</p></div>`).join('');
  else $('sec-chamadas').classList.add('oculto');
  if (l.secoes?.como_usar === false) $('como-usar').classList.add('oculto');
  if (l.secoes?.regras === false) $('sec-regras').classList.add('oculto');
  if (l.secoes?.tarefas === false) $('sec-tarefas').classList.add('oculto');
  const inst = l.institucional || {};
  if (inst.titulo || inst.texto || inst.links?.length) {
    $('inst-titulo').textContent = inst.titulo || '';
    $('inst-texto').textContent = inst.texto || '';
    $('inst-links').innerHTML = (inst.links || []).map(x => `<a class="btn btn-linha" href="${esc(x.link)}"${/^https?:/.test(x.link) ? ' target="_blank" rel="noopener"' : ''}>${esc(x.texto)}</a>`).join('');
    $('sec-inst').classList.remove('oculto');
  }
}
if (p.seo?.title) document.title = p.seo.title;
if (p.seo?.description) $('meta-desc').content = p.seo.description;
