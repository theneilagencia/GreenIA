// Artefatos visuais de uma execução do Quick Win: cartões com miniatura real, visualizador com navegação entre
// páginas (a mesma imagem que vai no arquivo), downloads e edição sem refazer a execução. Quem usa nunca vê plano,
// JSON ou detalhe técnico: vê a peça, o estado dela e as ações.
import { api, esc, toast } from '/comum.js';

const STATUS = {
  aprovado: ['Pronto para usar', 'ok'], corrigido: ['Pronto · ajustado automaticamente', 'ok'],
  parcial: ['Pronto, com ressalvas', 'atencao'], inconsistente: ['Revise antes de usar', 'erro'],
};
const FORMATOS = { a4: 'A4 retrato', a4_paisagem: 'A4 paisagem', '16:9': 'Tela 16:9', '1:1': 'Quadrado 1:1', '4:5': 'Vertical 4:5', '9:16': 'Vertical 9:16', '1.91:1': 'Horizontal 1.91:1' };
const EXP = { pdf: 'PDF', png: 'PNG', jpg: 'JPG', svg: 'SVG' };
const paginasTxt = n => `${n} ${n === 1 ? 'página' : 'páginas'}`;
const baixar = (a, f, pagina = null) => `/api/artefatos/${a.id}/baixar?formato=${f}${pagina ? `&pagina=${pagina}` : ''}`;
const imagem = (a, n, mini = false) => `/api/artefatos/${a.id}/paginas/${n}?${mini ? 'miniatura=1&' : ''}v=${a.id}`;

export function htmlArtefatos(lista = []) {
  if (!lista?.length) return '';
  return `<section class="artefatos" aria-label="Artefatos">
    <div class="artefatos-cabeca"><b>Artefatos</b><span class="dica">${lista.length === 1 ? 'Pronto para baixar' : `${lista.length} peças prontas para baixar`}</span></div>
    ${lista.map(cartao).join('')}</section>`;
}

function cartao(a) {
  const [rotulo, tom] = STATUS[a.status] || STATUS.aprovado;
  // Imagem final: PNG e JPG (a peça é uma imagem); os demais tipos sempre com PDF.
  const formatos = a.tipo === 'image' ? [...new Set([...(a.exportacoes || []), 'png', 'jpg'])].filter(f => EXP[f] && f !== 'pdf') : [...new Set(['pdf', ...(a.exportacoes || []), 'png'])].filter(f => EXP[f]);
  const fin = a.imagem_final;
  return `<article class="artefato" data-artefato="${a.id}">
    <button type="button" class="artefato-miniatura" data-ver="${a.id}" aria-label="Visualizar ${esc(a.rotulo)}">
      <img src="${imagem(a, 1, true)}" alt="Primeira página de ${esc(a.titulo)}" loading="lazy"></button>
    <div class="artefato-info">
      <div class="artefato-titulo"><b>${esc(a.rotulo)}</b><span class="artefato-selo ${tom}">${rotulo}</span></div>
      <span class="artefato-nome">${esc(a.titulo)}</span>
      <span class="dica">${paginasTxt(a.paginas)} · ${esc(FORMATOS[a.formato] || a.formato)}${a.versao > 1 ? ` · versão ${a.versao}` : ''}</span>
      ${a.avisos?.length ? `<ul class="artefato-avisos">${a.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${fin && !fin.gerada && fin.briefing ? `<details class="artefato-briefing"><summary>Briefing da imagem</summary><p>${esc(fin.briefing)}</p></details>` : ''}
      <div class="artefato-acoes">
        <button type="button" class="btn btn-verde btn-pequeno" data-ver="${a.id}">Visualizar</button>
        ${formatos.map(f => `<a class="btn btn-linha btn-pequeno" href="${baixar(a, f)}" download data-baixar="${f}">Baixar ${EXP[f]}${f !== 'pdf' && a.paginas > 1 ? ' (zip)' : ''}</a>`).join('')}
        <button type="button" class="btn btn-texto btn-pequeno" data-editar="${a.id}">Editar</button>
        ${fin ? `<button type="button" class="btn btn-texto btn-pequeno" data-gerar-imagem="${a.id}">${fin.gerada ? 'Gerar outra imagem' : 'Tentar gerar a imagem'}</button>${fin.gerada ? `<button type="button" class="btn btn-texto btn-pequeno" data-variacao="${a.id}">Variação</button>` : ''}` : ''}
      </div>
    </div></article>`;
}

// Liga os cartões dentro de `raiz`. `aoMudar(novo)`: chamado quando uma edição cria uma nova versão.
export function ligarArtefatos(raiz, { aoMudar = () => {} } = {}) {
  raiz.querySelectorAll('[data-ver]').forEach(b => { b.onclick = () => abrirVisualizador(Number(b.dataset.ver), { aoMudar }); });
  raiz.querySelectorAll('[data-editar]').forEach(b => { b.onclick = () => abrirEditor(Number(b.dataset.editar), { aoMudar }); });
  // Imagem final: nova imagem ou variação (governada no servidor); cada uma vira uma versão nova da peça.
  raiz.querySelectorAll('[data-gerar-imagem], [data-variacao]').forEach(b => { b.onclick = async () => {
    const id = Number(b.dataset.gerarImagem || b.dataset.variacao);
    b.disabled = true; const antes = b.textContent; b.textContent = 'Gerando…';
    try { const r = await api(`/api/artefatos/${id}/gerar-imagem`, { metodo: 'POST', corpo: { variacao: !!b.dataset.variacao } }); toast('Nova versão com a imagem gerada.'); aoMudar(r.artefato); }
    catch (e) { toast(e.message, 7000); b.disabled = false; b.textContent = antes; }
  }; });
}

// ---- Modal (foco preso, Esc fecha) -----------------------------------------------------------------------------
function modal(html, { classe = '', rotulo = 'Artefato' } = {}) {
  const anterior = document.activeElement;
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal ${classe}" role="dialog" aria-modal="true" aria-label="${esc(rotulo)}">${html}</div>`;
  document.body.appendChild(fundo);
  const tecla = ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); fechar(); }
    if (ev.key === 'Tab') {
      const f = [...fundo.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f.at(-1).focus(); }
      else if (!ev.shiftKey && document.activeElement === f.at(-1)) { ev.preventDefault(); f[0].focus(); }
    }
    fundo.dispatchEvent(new CustomEvent('tecla', { detail: ev }));
  };
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla, true); anterior?.focus?.(); };
  document.addEventListener('keydown', tecla, true);
  fundo.onclick = ev => { if (ev.target === fundo) fechar(); };
  return { fundo, fechar, el: fundo.querySelector('.modal') };
}

// ---- Visualizador ------------------------------------------------------------------------------------------------
export async function abrirVisualizador(id, { aoMudar = () => {}, pagina = 1 } = {}) {
  let d;
  try { d = await api(`/api/artefatos/${id}`); } catch (e) { toast(e.message || 'Não foi possível abrir o artefato.'); return; }
  const a = d.artefato;
  let n = Math.min(Math.max(1, pagina), a.paginas);
  const m = modal(`<div class="visualizador">
      <div class="visualizador-topo"><div><b>${esc(a.rotulo)}</b><span class="dica">${esc(a.titulo)}</span></div>
        <button type="button" class="icone-btn" data-fechar aria-label="Fechar">×</button></div>
      <div class="visualizador-palco"><img id="vis-img" alt=""></div>
      <div class="visualizador-nav" ${a.paginas === 1 ? 'hidden' : ''}>
        <button type="button" class="btn btn-linha btn-pequeno" data-ant aria-label="Página anterior">‹ Anterior</button>
        <span id="vis-pag" aria-live="polite"></span>
        <button type="button" class="btn btn-linha btn-pequeno" data-prox aria-label="Próxima página">Próxima ›</button></div>
      ${a.paginas > 1 ? `<div class="visualizador-miniaturas" role="group" aria-label="Páginas">${Array.from({ length: a.paginas }, (_, i) => `<button type="button" data-pag="${i + 1}" aria-label="Página ${i + 1}"><img src="${imagem(a, i + 1, true)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
      <div class="visualizador-acoes">
        <a class="btn btn-verde btn-pequeno" href="${baixar(a, 'pdf')}" download>Baixar PDF</a>
        <a class="btn btn-linha btn-pequeno" data-pagina-png download>Baixar esta página (PNG)</a>
        ${a.paginas > 1 ? `<a class="btn btn-linha btn-pequeno" href="${baixar(a, 'png')}" download>Todas em PNG (zip)</a>` : ''}
        <a class="btn btn-linha btn-pequeno" data-pagina-jpg download>JPG</a>
        <a class="btn btn-linha btn-pequeno" data-pagina-svg download>SVG</a>
        <button type="button" class="btn btn-texto btn-pequeno" data-editar>Editar</button></div>
    </div>`, { classe: 'modal-visual', rotulo: `Visualizar ${a.rotulo}` });
  const img = m.el.querySelector('#vis-img');
  const mostrar = () => {
    img.src = imagem(a, n); img.alt = `Página ${n} de ${a.paginas}: ${a.titulo}`;
    m.el.querySelector('#vis-pag').textContent = `Página ${n} de ${a.paginas}`;
    m.el.querySelector('[data-ant]').disabled = n === 1; m.el.querySelector('[data-prox]').disabled = n === a.paginas;
    m.el.querySelector('[data-pagina-png]').href = baixar(a, 'png', a.paginas > 1 ? n : null);
    m.el.querySelector('[data-pagina-jpg]').href = baixar(a, 'jpg', a.paginas > 1 ? n : null);
    m.el.querySelector('[data-pagina-svg]').href = baixar(a, 'svg', a.paginas > 1 ? n : null);
    m.el.querySelectorAll('[data-pag]').forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.pag) === n)));
  };
  m.el.querySelector('[data-fechar]').onclick = m.fechar;
  m.el.querySelector('[data-ant]').onclick = () => { if (n > 1) { n--; mostrar(); } };
  m.el.querySelector('[data-prox]').onclick = () => { if (n < a.paginas) { n++; mostrar(); } };
  m.el.querySelectorAll('[data-pag]').forEach(b => { b.onclick = () => { n = Number(b.dataset.pag); mostrar(); }; });
  m.el.querySelector('[data-editar]').onclick = () => { m.fechar(); abrirEditor(id, { aoMudar }); };
  m.fundo.addEventListener('tecla', ({ detail: ev }) => {
    if (ev.target?.tagName === 'INPUT') return;
    if (ev.key === 'ArrowRight' && n < a.paginas) { n++; mostrar(); }
    if (ev.key === 'ArrowLeft' && n > 1) { n--; mostrar(); }
  });
  mostrar();
  m.el.querySelector('[data-fechar]').focus();
}

// ---- Editor --------------------------------------------------------------------------------------------------------
// Edita texto, títulos, ordem e páginas, tipo de bloco, formato, cores desta peça e imagem; cria outro artefato com o
// mesmo conteúdo; restaura versões. Cada salvamento é uma nova versão, conferida de novo.
const TIPOS_BLOCO = { texto: 'Texto', citacao: 'Destaque', cta: 'Chamada', nota: 'Nota', lista: 'Lista', checklist: 'Checklist', cartoes: 'Cartões', linha_tempo: 'Linha do tempo',
  diagrama: 'Diagrama', tabela: 'Tabela', grafico: 'Gráfico', indicadores: 'Indicadores', subtitulo: 'Subtítulo', imagem: 'Imagem' };
export async function abrirEditor(id, { aoMudar = () => {} } = {}) {
  let d;
  try { d = await api(`/api/artefatos/${id}`); } catch (e) { toast(e.message || 'Não foi possível abrir o artefato.'); return; }
  const a = d.artefato, ed = d.editavel;
  const ordem = ed.paginas.map(p => p.id), removidas = new Set();
  const campoItem = it => {
    if (it.tipo === 'lista') return it.itens.map((t, k) => `<input class="entrada" data-txt="${it.id}" data-indice="${k}" value="${esc(t)}" aria-label="Item ${k + 1}">`).join('');
    if (it.tipo === 'indicadores') return it.indicadores.map((x, k) => `<div class="editor-par"><input class="entrada" data-txt="${it.id}" data-indice="${k}" data-campo="valor" value="${esc(x.valor)}" aria-label="Valor ${k + 1}">
      <input class="entrada" data-txt="${it.id}" data-indice="${k}" data-campo="rotulo" value="${esc(x.rotulo)}" aria-label="Rótulo ${k + 1}"></div>`).join('');
    if (it.tipo === 'fluxo') return it.nos.map((t, k) => `<input class="entrada" data-txt="${it.id}" data-indice="${k}" value="${esc(t)}" aria-label="Etapa ${k + 1}">`).join('');
    if (it.tipo === 'tabela') return `<div class="editor-tabela" role="group" aria-label="Tabela"><table><tr>${it.cabecalho.map((c, k) => `<th><input class="entrada" data-txt="${it.id}" data-linha="-1" data-coluna="${k}" value="${esc(c)}" aria-label="Cabeçalho ${k + 1}"></th>`).join('')}</tr>
      ${it.linhas.slice(0, 30).map((l, i) => `<tr>${l.map((c, k) => `<td><input class="entrada" data-txt="${it.id}" data-linha="${i}" data-coluna="${k}" value="${esc(c)}" aria-label="Linha ${i + 1}, coluna ${k + 1}"></td>`).join('')}</tr>`).join('')}</table></div>`;
    return `<textarea class="campo-amplo menor" data-txt="${it.id}" rows="2" aria-label="Texto">${esc(it.texto || '')}</textarea>`;
  };
  const paginaHtml = p => `<li class="editor-pagina" data-pagina="${p.id}">
    <div class="editor-pagina-topo"><b>Página <span data-num></span></b>${p.papel === 'capa' ? '<span class="tag">Capa</span>' : ''}
      <span class="editor-mover"><button type="button" class="btn btn-texto btn-pequeno" data-subir aria-label="Mover para cima">↑</button><button type="button" class="btn btn-texto btn-pequeno" data-descer aria-label="Mover para baixo">↓</button>
      <button type="button" class="btn btn-texto btn-pequeno" data-remover>Remover</button></span></div>
    <label class="legenda">Título <input class="entrada" data-ptitulo="${p.id}" value="${esc(p.titulo)}"></label>
    ${p.papel === 'capa' || p.subtitulo ? `<label class="legenda">Subtítulo <input class="entrada" data-psub="${p.id}" value="${esc(p.subtitulo)}"></label>` : ''}
    ${p.blocos.map(b => `<div class="editor-bloco"><div class="editor-bloco-topo"><span class="dica">${esc(TIPOS_BLOCO[b.tipo] || b.tipo)}</span>
      ${b.tipos.length > 1 ? `<label class="legenda">Mostrar como <select data-bloco="${b.id}">${b.tipos.map(t => `<option value="${t}" ${t === b.tipo ? 'selected' : ''}>${esc(TIPOS_BLOCO[t] || t)}</option>`).join('')}</select></label>` : ''}</div>
      ${b.itens.map(campoItem).join('')}</div>`).join('')}</li>`;
  const coresLivres = ['primaria', 'secundaria', 'destaque'].filter(k => ed.origem[`cores.${k}`] !== 'empresa');
  const m = modal(`<div class="editor-artefato">
    <div class="modal-topo"><h2>Editar ${esc(a.rotulo)}</h2><button type="button" class="icone-btn" data-fechar aria-label="Fechar">×</button></div>
    <p class="dica">Cada alteração cria uma nova versão, conferida de novo. A versão anterior continua no histórico.</p>
    <label class="legenda">Título da peça <input class="entrada" id="ed-titulo" value="${esc(ed.titulo)}"></label>
    <label class="legenda">Formato <select id="ed-formato">${ed.formatos.map(f => `<option value="${f.id}" ${f.id === a.formato ? 'selected' : ''}>${esc(f.rotulo)}</option>`).join('')}</select></label>
    <h3 class="modal-secao">Páginas e conteúdo</h3>
    <ol class="editor-paginas" id="ed-paginas">${ed.paginas.map(paginaHtml).join('')}</ol>
    ${coresLivres.length ? `<h3 class="modal-secao">Cores desta peça</h3><p class="dica">Valem só para esta peça. As cores definidas pela empresa não mudam aqui.</p>
      <div class="editor-cores">${coresLivres.map(k => `<label class="legenda">${{ primaria: 'Principal', secundaria: 'Secundária', destaque: 'Destaque' }[k]} <input type="color" data-cor="${k}" value="${esc(ed.cores[k] || '#1F3A5F')}"></label>`).join('')}</div>` : ''}
    <h3 class="modal-secao">Imagem</h3>
    <p class="dica">Uma foto ou imagem sua (PNG, JPG ou WEBP, até 5 MB) entra na capa ou no espaço da imagem.</p>
    <input type="file" id="ed-imagem" accept="image/png,image/jpeg,image/webp">
    <h3 class="modal-secao">Outro artefato com o mesmo conteúdo</h3>
    <div class="editor-derivar"><select id="ed-derivar" aria-label="Tipo do novo artefato">${ed.tipos.map(t => `<option value="${t.id}">${esc(t.rotulo)}</option>`).join('')}</select>
      <button type="button" class="btn btn-linha btn-pequeno" id="ed-criar">Criar</button></div>
    ${d.versoes.length > 1 ? `<h3 class="modal-secao">Versões</h3><ul class="editor-versoes">${d.versoes.map(v => `<li>Versão ${v.versao} · ${new Date(v.criado_em).toLocaleString('pt-BR')}${v.atual ? ' <span class="tag">Atual</span>' : ` <button type="button" class="btn btn-texto btn-pequeno" data-restaurar="${v.id}">Restaurar</button>`}</li>`).join('')}</ul>` : ''}
    <div class="modal-acoes"><button type="button" class="btn btn-texto" data-fechar>Cancelar</button><button type="button" class="btn btn-verde" id="ed-salvar">Salvar nova versão</button></div>
  </div>`, { classe: 'modal-largo', rotulo: `Editar ${a.rotulo}` });
  const lista = m.el.querySelector('#ed-paginas');
  const numerar = () => [...lista.children].forEach((li, i) => { li.querySelector('[data-num]').textContent = i + 1; });
  numerar();
  lista.onclick = ev => {
    const li = ev.target.closest('[data-pagina]'); if (!li) return;
    if (ev.target.closest('[data-subir]') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
    if (ev.target.closest('[data-descer]') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
    if (ev.target.closest('[data-remover]')) { if (lista.children.length <= 1) return toast('A peça precisa de pelo menos uma página.'); removidas.add(li.dataset.pagina); li.remove(); }
    numerar();
  };
  m.el.querySelectorAll('[data-fechar]').forEach(b => { b.onclick = m.fechar; });
  const concluir = async (r, msg) => { m.fechar(); toast(msg); aoMudar(r.artefato); };
  const salvar = async () => {
    const corpo = {};
    const t = m.el.querySelector('#ed-titulo').value.trim(); if (t && t !== ed.titulo) corpo.titulo = t;
    const f = m.el.querySelector('#ed-formato').value; if (f !== a.formato) corpo.formato = f;
    const novaOrdem = [...lista.children].map(li => li.dataset.pagina);
    if (removidas.size) corpo.remover = [...removidas];
    if (novaOrdem.join() !== ordem.filter(x => !removidas.has(x)).join()) corpo.ordem = novaOrdem;
    const paginas = [];
    for (const p of ed.paginas) {
      if (removidas.has(p.id)) continue;
      const ti = m.el.querySelector(`[data-ptitulo="${p.id}"]`)?.value.trim(), su = m.el.querySelector(`[data-psub="${p.id}"]`)?.value.trim();
      const e = { id: p.id };
      if (ti !== undefined && ti !== p.titulo) e.titulo = ti;
      if (su !== undefined && su !== p.subtitulo) e.subtitulo = su;
      if (Object.keys(e).length > 1) paginas.push(e);
    }
    if (paginas.length) corpo.paginas = paginas;
    const blocos = [...m.el.querySelectorAll('[data-bloco]')].filter(s => s.value !== ed.paginas.flatMap(p => p.blocos).find(b => b.id === s.dataset.bloco)?.tipo).map(s => ({ id: s.dataset.bloco, tipo: s.value }));
    if (blocos.length) corpo.blocos = blocos;
    const textos = [];
    m.el.querySelectorAll('[data-txt]').forEach(c => {
      if (c.value === c.defaultValue && c.tagName !== 'TEXTAREA') return;
      if (c.tagName === 'TEXTAREA' && c.value === c.textContent) return;
      const e = { item: c.dataset.txt, texto: c.value };
      for (const k of ['indice', 'linha', 'coluna']) if (c.dataset[k] !== undefined) e[k] = Number(c.dataset[k]);
      if (c.dataset.campo) e.campo = c.dataset.campo;
      textos.push(e);
    });
    if (textos.length) corpo.textos = textos;
    const cores = {};
    m.el.querySelectorAll('[data-cor]').forEach(c => { if (c.value.toUpperCase() !== String(ed.cores[c.dataset.cor] || '').toUpperCase()) cores[c.dataset.cor] = c.value.toUpperCase(); });
    if (Object.keys(cores).length) corpo.cores = cores;
    const arquivo = m.el.querySelector('#ed-imagem').files[0];
    const b = m.el.querySelector('#ed-salvar');
    b.setAttribute('aria-busy', 'true'); b.disabled = true;
    try {
      let r = null;
      if (Object.keys(corpo).length) r = await api(`/api/artefatos/${id}`, { metodo: 'PATCH', corpo });
      if (arquivo) {
        if (arquivo.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB.');
        const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(arquivo); });
        r = await api(`/api/artefatos/${r?.artefato.id || id}/imagem`, { metodo: 'POST', corpo: { imagem: dataUrl } });
      }
      if (!r) { toast('Nada foi alterado.'); b.removeAttribute('aria-busy'); b.disabled = false; return; }
      await concluir(r, `Nova versão salva${r.artefato.status === 'inconsistente' ? ': revise os pontos indicados' : ''}.`);
    } catch (e) { toast(e.message || 'Não foi possível salvar.'); b.removeAttribute('aria-busy'); b.disabled = false; }
  };
  m.el.querySelector('#ed-salvar').onclick = salvar;
  m.el.querySelector('#ed-criar').onclick = async ev => {
    ev.target.setAttribute('aria-busy', 'true');
    try { const r = await api(`/api/artefatos/${id}/derivar`, { metodo: 'POST', corpo: { tipo: m.el.querySelector('#ed-derivar').value } }); await concluir(r, 'Novo artefato criado com o mesmo conteúdo.'); }
    catch (e) { toast(e.message || 'Não foi possível criar.'); ev.target.removeAttribute('aria-busy'); }
  };
  m.el.querySelectorAll('[data-restaurar]').forEach(b => { b.onclick = async () => {
    try { const r = await api(`/api/artefatos/${b.dataset.restaurar}/restaurar`, { metodo: 'POST' }); await concluir(r, 'Versão restaurada.'); } catch (e) { toast(e.message || 'Não foi possível restaurar.'); }
  }; });
  m.el.querySelector('#ed-titulo').focus();
}
