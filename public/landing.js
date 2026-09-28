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
if (dias > 0) $('pp-retencao').textContent = `Histórico de ${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'}`;

// Ambiente em implantação, suspenso ou encerrado: aviso no topo; sem landing publicada, ficam só o essencial e o login.
if (p.aviso) {
  $('ld-aviso').textContent = p.aviso;
  $('ld-aviso').classList.remove('oculto');
  if (p.status === 'suspensa' || p.status === 'cancelada') for (const a of document.querySelectorAll('a[href="/entrar"]')) a.classList.add('oculto');
}
if (p.multiempresa && !p.landing) for (const id of ['sec-chamadas', 'sec-regras', 'sec-tarefas', 'como-usar']) $(id).classList.add('oculto');

// "O que você encontra": cartões com ícone e uma mini tela conforme o assunto (conversa, quick win,
// conhecimento, classes de modelo); assunto desconhecido fica só com o ícone.
const PADRAO_CHAMADAS = [
  { titulo: 'Conversas', texto: 'Para qualquer tarefa do dia: resumir, conferir, reescrever, organizar. A conversa fica salva e dá para continuar depois.' },
  { titulo: 'Quick wins', texto: 'Usos prontos para tarefas que se repetem na sua área, com instruções e arquivos já definidos. Você traz só o caso do dia.' },
  { titulo: 'Conhecimento', texto: 'Procedimentos e documentos das áreas. A resposta mostra de qual documento veio a informação.' },
  { titulo: 'Classes de modelo', texto: 'Você escolhe o tipo de trabalho, não o modelo técnico: Rápido para o dia a dia, Equilibrado para mais contexto, Avançado para análises longas.' },
];
const VISUAIS = [
  [/convers|chat/i, 'i-conversa', '<div class="pp-mini pp-mini-chat"><span class="eu">Resuma este relatório em 5 pontos</span><span class="resp"><i></i><i></i><i></i><em>Fonte: Relatório mensal</em></span><span class="eu">Agora em tabela, por área</span><span class="ia"><i></i><i></i><i></i></span></div>'],
  [/quick|pronto|recorrent/i, 'i-raio', '<div class="pp-mini pp-mini-qw"><span><i style="background:#1B7950"></i>Conferência de nota</span><span><i style="background:#B7791F"></i>Resumo de contrato</span><span><i style="background:#453A78"></i>Resposta a fornecedor</span></div>'],
  [/conhec|document|base|procedim/i, 'i-livro', '<div class="pp-mini pp-mini-docs"><span><b></b>Procedimento de recebimento</span><span><b></b>Política de viagens</span><span class="fonte">Fonte citada</span></div>'],
  [/class|modelo/i, 'i-camadas', '<div class="pp-mini pp-mini-classes"><span class="on">Rápido</span><span>Equilibrado</span><span>Avançado</span></div>'],
];
function desenharChamadas(lista) {
  $('ld-chamadas').innerHTML = lista.map((c, i) => {
    const v = VISUAIS.find(([re]) => re.test(c.titulo));
    return `<article class="pp-card${i === 0 ? ' destaque' : ''}"><span class="pp-card-icone"><svg width="20" height="20"><use href="#${v ? v[1] : 'ok'}"/></svg></span>
      <h3>${esc(c.titulo)}</h3><p>${esc(c.texto)}</p>${v ? v[2] : ''}</article>`;
  }).join('');
}
const tarefaHtml = x => `<a href="/entrar">${x.tipo ? `<span>${esc(x.tipo)}</span>` : ''}${esc(x.texto)}<svg class="pp-tarefa-seta" width="16" height="16" aria-hidden="true"><use href="#i-seta"/></svg></a>`;
desenharChamadas(PADRAO_CHAMADAS);
for (const a of document.querySelectorAll('#ld-tarefas a')) a.insertAdjacentHTML('beforeend', '<svg class="pp-tarefa-seta" width="16" height="16" aria-hidden="true"><use href="#i-seta"/></svg>');

const l = p.landing;
if (l) {
  if (l.rotulo) $('ld-rotulo').textContent = l.rotulo;
  $('ld-titulo').textContent = l.titulo;
  $('ld-sub').textContent = l.subtitulo || '';
  if (l.descricao) { $('ld-desc').textContent = l.descricao; $('ld-desc').classList.remove('oculto'); }
  if (l.botoes?.length) $('ld-botoes').innerHTML = l.botoes.map(b => `<a class="btn ${b.estilo === 'secundario' ? 'btn-linha' : 'btn-verde'} btn-grande" href="${esc(b.link)}"${/^https?:/.test(b.link) ? ' target="_blank" rel="noopener"' : ''}>${esc(b.texto)}</a>`).join('');
  $('ld-destaques').innerHTML = (l.destaques || []).map(d => `<li><svg width="16" height="16"><use href="#ok"/></svg>${esc(d)}</li>`).join('');
  if (l.imagem) $('ld-figura').innerHTML = `<div class="pp-imagem"><img src="${esc(l.imagem)}" alt=""></div>`;
  if (l.chamadas?.length) desenharChamadas(l.chamadas);
  else $('sec-chamadas').classList.add('oculto');
  const t = l.textos || {}, txt = (id, v) => { if (v) $(id).textContent = v; };
  txt('cu-rotulo', t.como_usar_rotulo); txt('cu-titulo', t.como_usar_titulo); txt('ch-rotulo', t.chamadas_rotulo); txt('ch-titulo', t.chamadas_titulo);
  txt('rg-rotulo', t.regras_rotulo); txt('rg-titulo', t.regras_titulo); txt('rg-sub', t.regras_sub);
  txt('tf-rotulo', t.tarefas_rotulo); txt('tf-titulo', t.tarefas_titulo); txt('tf-sub', t.tarefas_sub);
  txt('fim-titulo', t.fim_titulo); txt('fim-texto', t.fim_texto); txt('fim-botao', t.fim_botao);
  if (l.passos?.length) $('ld-passos').innerHTML = l.passos.map(x => `<li><b>${esc(x.titulo)}</b><span>${esc(x.texto)}</span></li>`).join('');
  for (const k of ['pode', 'sigilo', 'nunca']) if (l.regras?.[k]?.length) $(`rg-${k}`).innerHTML = l.regras[k].map(x => `<li>${esc(x)}</li>`).join('');
  if (l.tarefas?.length) $('ld-tarefas').innerHTML = l.tarefas.map(tarefaHtml).join('');
  const SECAO = { como_usar: 'como-usar', chamadas: 'sec-chamadas', regras: 'sec-regras', tarefas: 'sec-tarefas' };
  for (const [k, id] of Object.entries(SECAO)) if (l.secoes?.[k] === false) $(id).classList.add('oculto');
  const inst = l.institucional || {};
  if (l.secoes?.institucional !== false && (inst.titulo || inst.texto || inst.links?.length)) {
    $('inst-titulo').textContent = inst.titulo || '';
    $('inst-texto').textContent = inst.texto || '';
    $('inst-links').innerHTML = (inst.links || []).map(x => `<a class="pp-inst-link" href="${esc(x.link)}"${/^https?:/.test(x.link) ? ' target="_blank" rel="noopener"' : ''}>${esc(x.texto)}<svg width="16" height="16" aria-hidden="true"><use href="#i-seta"/></svg></a>`).join('');
    $('sec-inst').classList.remove('oculto');
  }
}
// Seção escondida (no editor ou por falta de conteúdo): some também o que aponta para ela,
// como o menu do topo e botões "Como usar", para nenhum link ficar sem destino.
for (const a of document.querySelectorAll('a[href^="#"]')) {
  const alvo = a.getAttribute('href').length > 1 && document.getElementById(a.getAttribute('href').slice(1));
  if (alvo?.classList.contains('oculto') || (alvo && alvo.closest('.oculto'))) a.classList.add('oculto');
}
if (p.seo?.title) document.title = p.seo.title;
if (p.seo?.description) $('meta-desc').content = p.seo.description;
