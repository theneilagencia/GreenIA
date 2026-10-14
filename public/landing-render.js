// Desenho da página de apresentação a partir do conteúdo (o mesmo que o editor salva). Usado pela página pública
// (landing.js, no próprio documento) e pela prévia ao vivo do editor (editores.js, num iframe sem scripts): as duas
// mostram exatamente o mesmo resultado. `doc` é o documento a desenhar, com a estrutura de index.html.
import { esc } from '/comum.js';

// "O que você encontra": cartões com ícone e uma mini tela conforme o assunto (conversa, quick win,
// conhecimento, classes de modelo); assunto desconhecido fica só com o ícone.
const PADRAO_CHAMADAS = [
  { titulo: 'Conversas', texto: 'Para qualquer tarefa do dia: resumir, conferir, reescrever, organizar. A conversa fica salva e dá para continuar depois, dentro do prazo de retenção da empresa.' },
  { titulo: 'Quick wins', texto: 'Usos prontos para tarefas que se repetem na sua área, com instruções já definidas. Você traz só o caso do dia. Nos quick wins criados pela jornada guiada, o resultado é conferido contra as regras antes de aparecer.' },
  { titulo: 'Conhecimento', texto: 'Procedimentos e documentos das áreas. Quando a busca encontra documentos da área, a resposta lista os documentos consultados.' },
  { titulo: 'Classes de modelo', texto: 'A GreenIA escolhe o nível de cada pedido entre Rápido, Equilibrado e Avançado, dentro do que a empresa libera. Nas conversas, cada resposta explica por que aquele nível foi usado. Se preferir, você escolhe.' },
];
const VISUAIS = [
  [/convers|chat/i, 'i-conversa', '<div class="pp-mini pp-mini-chat"><span class="eu">Resuma este relatório em 5 pontos</span><span class="resp"><i></i><i></i><i></i></span><span class="eu">Agora em tabela, por área</span><span class="ia"><i></i><i></i><i></i></span></div>'],
  [/quick|pronto|recorrent/i, 'i-raio', '<div class="pp-mini pp-mini-qw"><span><i style="background:#1B7950"></i>Conferência de nota</span><span><i style="background:#B7791F"></i>Resumo de contrato</span><span><i style="background:#453A78"></i>Resposta a fornecedor</span></div>'],
  [/conhec|document|base|procedim/i, 'i-livro', '<div class="pp-mini pp-mini-docs"><span><b></b>Procedimento de recebimento</span><span><b></b>Política de viagens</span><span class="fonte">Documentos consultados</span></div>'],
  [/class|modelo/i, 'i-camadas', '<div class="pp-mini pp-mini-classes"><span class="on">Rápido</span><span>Equilibrado</span><span>Avançado</span></div>'],
];
function desenharChamadas(doc, lista) {
  doc.getElementById('ld-chamadas').innerHTML = lista.map((c, i) => {
    const v = VISUAIS.find(([re]) => re.test(c.titulo));
    return `<article class="pp-card${i === 0 ? ' destaque' : ''}"><span class="pp-card-icone"><svg width="20" height="20"><use href="#${v ? v[1] : 'ok'}"/></svg></span>
      <h3>${esc(c.titulo)}</h3><p>${esc(c.texto)}</p>${v ? v[2] : ''}</article>`;
  }).join('');
}
const SETA = '<svg class="pp-tarefa-seta" width="16" height="16" aria-hidden="true"><use href="#i-seta"/></svg>';
const tarefaHtml = x => `<a href="/entrar">${x.tipo ? `<span>${esc(x.tipo)}</span>` : ''}${esc(x.texto)}${SETA}</a>`;

// Estado inicial da página, antes do conteúdo da empresa: os cartões padrão e as setas das tarefas de exemplo.
export function prepararLanding(doc) {
  desenharChamadas(doc, PADRAO_CHAMADAS);
  for (const a of doc.querySelectorAll('#ld-tarefas a')) a.insertAdjacentHTML('beforeend', SETA);
}

// Conteúdo da empresa (l) e textos de busca (seo). Sem conteúdo, fica a página padrão.
export function desenharLanding(doc, l, seo = null) {
  const $ = id => doc.getElementById(id);
  if (l) {
    if (l.rotulo) $('ld-rotulo').textContent = l.rotulo;
    $('ld-titulo').textContent = l.titulo;
    $('ld-sub').textContent = l.subtitulo || '';
    if (l.descricao) { $('ld-desc').textContent = l.descricao; $('ld-desc').classList.remove('oculto'); }
    if (l.botoes?.length) $('ld-botoes').innerHTML = l.botoes.map(b => `<a class="btn ${b.estilo === 'secundario' ? 'btn-linha' : 'btn-verde'} btn-grande" href="${esc(b.link)}"${/^https?:/.test(b.link) ? ' target="_blank" rel="noopener"' : ''}>${esc(b.texto)}</a>`).join('');
    $('ld-destaques').innerHTML = (l.destaques || []).map(d => `<li><svg width="16" height="16"><use href="#ok"/></svg>${esc(d)}</li>`).join('');
    if (l.imagem) $('ld-figura').innerHTML = `<div class="pp-imagem"><img src="${esc(l.imagem)}" alt=""></div>`;
    if (l.chamadas?.length) desenharChamadas(doc, l.chamadas);
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
  for (const a of doc.querySelectorAll('a[href^="#"]')) {
    const alvo = a.getAttribute('href').length > 1 && doc.getElementById(a.getAttribute('href').slice(1));
    if (alvo?.classList.contains('oculto') || (alvo && alvo.closest('.oculto'))) a.classList.add('oculto');
  }
  if (seo?.title) doc.title = seo.title;
  if (seo?.description) $('meta-desc')?.setAttribute('content', seo.description);
}
