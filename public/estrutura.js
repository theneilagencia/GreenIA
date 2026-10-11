// Estrutura da empresa: pessoas, áreas e grupos de permissão (abas da tela Pessoas). Lista densa + painel lateral:
// a lista fica sempre à vista, o painel abre o detalhe e cada mudança é salva na hora.
// Aba Pessoas: uma lista única de quem tem acesso. Na multiempresa, junta Usuários (perfil, situação, convite) com
// áreas e grupos do banco da empresa (pelo email) e a revisão de acessos; cada parte usa a rota que já existia.
// Teclado: / busca, C cria, J/K ou setas andam na lista, Enter abre, Esc fecha o painel.
import { api, esc, toast, ICONE } from '/comum.js';
import { E, pode } from '/app.js';
import { confirmar } from '/admin-ui.js';

const $ = id => document.getElementById(id);
const falhar = e => toast(e.message || 'Algo deu errado.', 6000);
const S = { aba: '', areas: [], pessoas: [], grupos: [], aberto: null, filtro: {}, q: '', usuarios: null, roles: [], revisoes: {}, podeRevisar: false, qw: null };
const SITUACAO = { ativo: ['Ativo', 'tag-verde'], convidado: ['Convidado', 'tag-ambar'], inativo: ['Inativo', ''] };
const dataBr = s => (s ? new Date(s).toLocaleDateString('pt-BR') : '');

// Avatares e marcas em tons da paleta (texto com contraste de 4,5:1 ou mais sobre o fundo).
const TONS = [['#DDEBE1', '#1B5E3F'], ['#F2E6D0', '#6E4C15'], ['#E6E3F2', '#453A78'], ['#E0ECF0', '#1F5566'], ['#F2E0DA', '#8A3B26'], ['#EAE8E1', '#4A4740']];
const tom = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONS[h % TONS.length]; };
const iniciais = (nome, email) => { const p = String(nome || email || '?').trim().split(/[\s.@_-]+/).filter(Boolean); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[1][0] : '')).toUpperCase(); };
const avatar = (nome, email, cls = '') => { const [f, t] = tom(email || nome); return `<span class="av ${cls}" style="background:${f};color:${t}" title="${esc(nome || email)}">${esc(iniciais(nome, email))}</span>`; };
const pilha = (lista, max = 4) => (lista.length ? `<span class="pilha">${lista.slice(0, max).map(p => avatar(p.nome, p.email)).join('')}${lista.length > max ? `<span class="av mais">+${lista.length - max}</span>` : ''}</span>` : '');
const marca = (nome, cls = '') => { const [f, t] = tom(`x${nome}`); return `<span class="marca-q ${cls}" style="background:${f};color:${t}" aria-hidden="true">${esc((nome || '?')[0].toUpperCase())}</span>`; };
const seg = (opcoes, valor, attrs, rotulo, desab = false) => `<div class="seg" role="radiogroup" aria-label="${esc(rotulo)}" ${attrs}>${opcoes.map(([v, t]) =>
  `<button type="button" role="radio" aria-checked="${v === valor}" data-v="${v}" ${desab ? 'disabled' : ''}>${t}</button>`).join('')}</div>`;
const interruptor = (ligado, attrs, rotulo, desab = false) => `<button type="button" class="switch" role="switch" aria-checked="${!!ligado}" aria-label="${esc(rotulo)}" ${attrs} ${desab ? 'disabled' : ''}><span></span></button>`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------- dados
async function carregar() {
  // Aba Pessoas: lê também quem tem acesso e o perfil (multiempresa), a revisão de acessos e quem cria Quick Wins,
  // cada um na rota de sempre e só com a permissão que ela já exige.
  const naAba = S.aba === 'pessoas';
  const usuarios = naAba && E.plataforma && pode('user.read') ? api('/api/empresa/usuarios') : null;
  const revisoes = naAba && pode('user.read') ? api('/api/acompanhamento/acessos').catch(() => null) : null;
  const qw = naAba && pode('company.manage') ? api('/api/admin/quick-wins-permissoes').catch(() => null) : null;
  const [a, p, g, u, r, q] = await Promise.all([api('/api/admin/areas'), api('/api/admin/pessoas'), api('/api/admin/grupos'), usuarios, revisoes, qw]);
  S.areas = a.areas; S.pessoas = p.pessoas; S.grupos = g.grupos;
  S.usuarios = u?.usuarios || null; S.roles = u?.roles || [];
  S.revisoes = Object.fromEntries((r?.pessoas || []).map(x => [x.id, x])); S.podeRevisar = !!r?.podeRevisar;
  S.qw = q || null;
}
// Lista única de quem tem acesso. Multiempresa: cada usuário da empresa com a pessoa do banco da empresa (mesmo email);
// instalação única: as pessoas cadastradas. O id da linha é o da pessoa; sem ela ainda, o do usuário (u-…).
function gente() {
  if (!S.usuarios) return S.pessoas.map(p => ({ id: p.id, nome: p.nome, email: p.email, status: p.ativo ? 'ativo' : 'inativo', perfil: p.papel === 'admin' ? 'Admin da empresa' : 'Membro', local: p, rev: S.revisoes[p.id], proprio: p.id === E.eu?.id }));
  const porEmail = new Map(S.pessoas.map(p => [String(p.email).toLowerCase(), p]));
  return S.usuarios.map(u => {
    const local = porEmail.get(String(u.email).toLowerCase()) || null;
    return { id: local ? local.id : `u-${u.id}`, uid: u.id, roleId: u.role_id, nome: u.name || local?.nome || '', email: u.email, status: u.status, perfil: u.role, local, rev: local && S.revisoes[local.id], proprio: u.id === E.eu?.userId };
  });
}
const umaPessoa = id => gente().find(r => r.id === id);
const idDe = v => (/^\d+$/.test(String(v)) ? Number(v) : v);
const ativas = () => S.areas.filter(a => a.ativa);
const pessoa = id => S.pessoas.find(p => p.id === id);
const salvando = t => { const el = $('px-estado'); if (el) { el.textContent = t; el.classList.toggle('ok', t === 'Salvo'); } };
async function salvar(fn) {
  salvando('Salvando…');
  try { await fn(); await carregar(); desenharLista(); desenharPainel(); salvando('Salvo'); return true; }
  catch (e) { falhar(e); salvando(''); await carregar(); desenharLista(); desenharPainel(); return false; }
}

// ---------------------------------------------------------------- casca comum
const EXPLICA = {
  areas: 'Áreas são os departamentos da empresa. Cada uma tem a sua <b>base de conhecimento</b>: quem é membro usa; quem administra a base cuida dos documentos.',
  pessoas: 'Todas as pessoas com acesso. Abra uma pessoa para ver e mudar tudo dela: perfil, situação, áreas, grupos e a revisão de acesso.',
  grupos: 'Grupos de permissão juntam pessoas de <b>qualquer área</b> para liberar um recurso a mais: um nível de IA mais forte ou criar Quick Wins. <b>Não têm base de conhecimento.</b>',
};
const CONCEITOS = atual => `<div class="conceitos grade-cartoes" role="note">
  <a class="conceito cartao${atual === 'areas' ? ' atual' : ''}" href="#/pessoas/areas"><b class="cartao-titulo">Área</b><span class="cartao-texto">Um departamento. Tem <b>base de conhecimento própria</b> e Quick Wins. Na área, cada pessoa é membro ou administra a base.</span></a>
  <a class="conceito cartao${atual === 'pessoas' ? ' atual' : ''}" href="#/pessoas"><b class="cartao-titulo">Pessoa</b><span class="cartao-texto">Quem usa a GreenIA. Faz parte de áreas e pode estar em grupos de permissão.</span></a>
  <a class="conceito cartao${atual === 'grupos' ? ' atual' : ''}" href="#/pessoas/grupos"><b class="cartao-titulo">Grupo de permissão</b><span class="cartao-texto">Pessoas de <b>qualquer área</b> com um recurso a mais: nível de IA ou criar Quick Wins. <b>Sem base de conhecimento.</b></span></a></div>`;
const lerPref = k => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

function casca({ titulo, busca, acao, filtros }) {
  const aberto = lerPref('greenia.conceitos') !== '0' && !(S.areas.length && S.grupos.length);
  $('conteudo').innerHTML = `<div class="lx">
    <div class="lx-explica"><p>${EXPLICA[S.aba]}</p><button type="button" class="lx-entenda" id="lx-entenda" aria-expanded="${aberto}">Área, pessoa ou grupo?</button></div>
    <div id="lx-conceitos" ${aberto ? '' : 'hidden'}>${CONCEITOS(S.aba)}</div>
    <div class="lx-barra">
      <div class="lx-titulo"><h2>${titulo}</h2><span class="lx-conta" id="lx-conta"></span></div>
      <div class="lx-ferramentas">${filtros || ''}
        <label class="lx-busca">${ICONE.busca}<input id="lx-q" placeholder="${busca}" autocomplete="off" value="${esc(S.q)}" aria-label="${busca}"><kbd>/</kbd></label>
        ${acao ? `<button class="btn btn-verde btn-pequeno" id="lx-novo">${ICONE.mais}${acao}<kbd class="kbd-claro">C</kbd></button>` : ''}</div></div>
    <div id="lx-extra"></div>
    <div class="lx-lista" id="lx-lista"></div>
    <details class="lx-atalhos-ajuda"><summary><span aria-hidden="true">?</span> Atalhos de teclado</summary>
      <p class="lx-atalhos"><kbd>/</kbd> buscar <kbd>C</kbd> criar <kbd>J</kbd><kbd>K</kbd> navegar <kbd>Enter</kbd> abrir <kbd>Esc</kbd> fechar</p></details></div>`;
  $('lx-entenda').onclick = ev => { const b = ev.currentTarget, v = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', v); $('lx-conceitos').hidden = !v; gravarPref('greenia.conceitos', v ? '1' : '0'); };
  $('lx-q').oninput = ev => { S.q = ev.target.value; desenharLista(); };
  $('conteudo').onclick = ev => {
    const f = ev.target.closest('[data-filtro]');
    if (f) { S.filtro[S.aba] = f.dataset.filtro; for (const x of document.querySelectorAll('[data-filtro]')) x.setAttribute('aria-pressed', x === f); desenharLista(); return; }
    const l = ev.target.closest('[data-abrir]');
    if (l) abrirPainel(l.dataset.tipo, idDe(l.dataset.abrir));
    if (ev.target.closest('button#lx-novo')) novo();
  };
  $('conteudo').onchange = null;
  ligarTeclas();
}
const pilulas = (opcoes, atual) => `<div class="pilulas" role="group" aria-label="Filtro">${opcoes.map(([v, t, n]) =>
  `<button type="button" class="pilula" data-filtro="${v}" aria-pressed="${v === atual}">${t}${n !== undefined ? `<span>${n}</span>` : ''}</button>`).join('')}</div>`;
const buscaOk = (...campos) => !S.q || campos.some(c => String(c || '').toLowerCase().includes(S.q.toLowerCase()));

// ---------------------------------------------------------------- listas
function desenharLista() {
  const el = $('lx-lista');
  if (!el) return;
  const foco = document.activeElement?.closest?.('.lx-linha')?.dataset.abrir;
  el.innerHTML = { areas: listaAreas, pessoas: listaPessoas, grupos: listaGrupos }[S.aba]();
  if (S.aberto) el.querySelector(`[data-abrir="${S.aberto.id}"]`)?.classList.add('aberta');
  if (foco) el.querySelector(`[data-abrir="${foco}"]`)?.focus({ preventScroll: true });
}

function listaAreas() {
  const f = S.filtro.areas || 'ativas';
  const lista = S.areas.filter(a => (f === 'todas' || (f === 'ativas') === a.ativa) && buscaOk(a.nome, a.descricao));
  $('lx-conta').textContent = lista.length;
  if (!S.areas.length) return vazio('Nenhuma área ainda', 'Crie a primeira área com o nome que a empresa usa para o departamento.', 'Nova área');
  if (!lista.length) return vazio('Nada encontrado', 'Mude a busca ou o filtro.');
  return `<div class="lx-cab lx-g-area" aria-hidden="true"><span>Área</span><span>Pessoas</span><span>Administram a base</span><span class="num">Documentos</span><span>Situação</span></div>
    ${lista.map(a => { const adm = a.pessoas.filter(m => m.adminBase); return `<button type="button" class="lx-linha lx-g-area${a.ativa ? '' : ' inativa'}" data-tipo="area" data-abrir="${a.id}">
      <span class="lx-principal">${marca(a.nome)}<span class="lx-nome"><b>${esc(a.nome)}</b><small>${esc(a.descricao) || 'Sem descrição'}</small></span></span>
      <span class="lx-c" data-r="Pessoas">${pilha(a.pessoas)}<span class="lx-num">${plural(a.pessoas.length, 'pessoa', 'pessoas')}</span></span>
      <span class="lx-c" data-r="Administram">${adm.length ? `${pilha(adm, 3)}<span class="lx-texto">${esc(adm.map(m => (m.nome || m.email).split(' ')[0]).join(', '))}</span>` : `<span class="tag tag-ambar">${a.ativa ? 'ninguém administra a base' : '—'}</span>`}</span>
      <span class="lx-c num" data-r="Documentos"><span class="lx-num">${plural(a.documentos, 'documento', 'documentos')}</span></span>
      <span class="lx-c" data-r="Situação">${a.ativa ? '<span class="tag tag-verde"><i></i>Ativa</span>' : '<span class="tag"><i></i>Desativada</span>'}${a.sigilosa ? '<span class="tag tag-escura">Proteção reforçada</span>' : ''}</span></button>`; }).join('')}`;
}

function listaPessoas() {
  const f = S.filtro.pessoas || 'todas', fp = S.filtro.perfil || '', fs = S.filtro.status || '', fr = !!S.filtro.revisao;
  const areasDe = r => r.local?.areas || [];
  const naArea = r => f === 'todas' || (f === 'sem' ? !areasDe(r).some(m => ativas().some(a => a.id === m.id)) : areasDe(r).some(m => m.id === Number(f)));
  const todas = gente();
  const lista = todas.filter(r => naArea(r) && (!fp || r.perfil === fp) && (!fs || r.status === fs) && (!fr || r.rev?.pendente) && buscaOk(r.nome, r.email));
  $('lx-conta').textContent = lista.length;
  loteRevisao(fr && S.podeRevisar ? lista.filter(r => r.local && r.rev?.pendente) : []);
  if (!todas.length) return vazio('Ninguém com acesso ainda', 'Convide as primeiras pessoas.', $('lx-novo') ? (E.plataforma ? 'Convidar pessoa' : 'Nova pessoa') : '');
  if (!lista.length) return vazio('Ninguém encontrado', 'Mude a busca ou os filtros.');
  const nomeArea = id => ativas().find(a => a.id === id);
  return `<div class="lx-cab lx-g-pessoa" aria-hidden="true"><span>Pessoa</span><span>Áreas</span><span>Grupos de permissão</span><span>Perfil</span><span>Situação</span></div>
    ${lista.map(r => { const as = areasDe(r).filter(m => nomeArea(m.id)), gs = r.local?.grupos || []; return `<button type="button" class="lx-linha lx-g-pessoa${r.status === 'inativo' ? ' inativa' : ''}" data-tipo="pessoa" data-abrir="${esc(r.id)}">
      <span class="lx-principal">${avatar(r.nome, r.email, 'av-m')}<span class="lx-nome"><b>${esc(r.nome || r.email)}${r.proprio ? ' <span class="lx-voce">(você)</span>' : ''}</b><small>${esc(r.email)}</small></span></span>
      <span class="lx-c lx-tags" data-r="Áreas">${as.slice(0, 3).map(m => `<span class="tag${m.adminBase ? ' tag-verde' : ''}">${esc(nomeArea(m.id).nome)}${m.adminBase ? ' · admin da base' : ''}${m.responsavel ? ' · responsável' : ''}</span>`).join('')}${as.length > 3 ? `<span class="tag">+${as.length - 3}</span>` : ''}${!as.length ? '<span class="lx-vazio">Sem área</span>' : ''}</span>
      <span class="lx-c lx-tags" data-r="Grupos">${gs.map(g => `<span class="tag tag-roxa">${esc(S.grupos.find(x => x.id === g)?.nome || '—')}</span>`).join('') || '<span class="lx-vazio">Sem grupos</span>'}</span>
      <span class="lx-c" data-r="Perfil"><span class="lx-texto">${esc(r.perfil || '—')}</span></span>
      <span class="lx-c lx-tags" data-r="Situação"><span class="tag ${SITUACAO[r.status]?.[1] || ''}"><i></i>${SITUACAO[r.status]?.[0] || '—'}</span>${r.rev?.pendente ? '<span class="tag tag-ambar">Revisão pendente</span>' : ''}</span></button>`; }).join('')}`;
}

// Com o filtro "Revisão pendente", registra a mesma conferência para todas as pessoas da lista, uma a uma
// (a mesma rota da revisão individual).
function loteRevisao(alvo) {
  const host = $('lx-extra');
  if (!host) return;
  if (!alvo.length) { host.innerHTML = ''; return; }
  if (!$('lx-lote')) {
    host.innerHTML = `<details class="lx-lote" id="lx-lote"><summary>Registrar a revisão de <span id="lx-lote-n"></span></summary>
      <form id="lx-lote-form"><label class="legenda" for="lx-lote-nota">O que você conferiu?</label>
        <textarea class="entrada" id="lx-lote-nota" required maxlength="500" rows="2" placeholder="Ex.: confirmei as áreas e os administradores das bases"></textarea>
        <label class="px-marca"><input type="checkbox" required> <span>Conferi os vínculos de cada pessoa</span></label>
        <button class="btn btn-verde btn-pequeno" id="lx-lote-enviar">Registrar revisão</button></form></details>`;
    $('lx-lote-form').onsubmit = async ev => {
      ev.preventDefault();
      const b = $('lx-lote-enviar'), ids = $('lx-lote-form').dataset.ids.split(',').map(Number);
      b.disabled = true;
      try {
        for (const id of ids) await api(`/api/acompanhamento/acessos/${id}/revisar`, { metodo: 'POST', corpo: { observacao: $('lx-lote-nota').value } });
        toast(ids.length === 1 ? 'Revisão registrada.' : `${ids.length} revisões registradas.`);
      } catch (e) { falhar(e); }
      await carregar(); desenharLista();
      if ($('lx-lote-enviar')) $('lx-lote-enviar').disabled = false;
    };
  }
  $('lx-lote-n').textContent = plural(alvo.length, 'pessoa da lista', 'pessoas da lista');
  $('lx-lote-form').dataset.ids = alvo.map(r => r.local.id).join(',');
}

function listaGrupos() {
  const lista = S.grupos.filter(g => buscaOk(g.nome));
  $('lx-conta').textContent = lista.length;
  if (!S.grupos.length) return vazio('Nenhum grupo ainda', 'Crie um grupo só quando precisar liberar um recurso para pessoas de áreas diferentes.', 'Novo grupo');
  if (!lista.length) return vazio('Nada encontrado', 'Mude a busca.');
  return `<div class="lx-cab lx-g-grupo" aria-hidden="true"><span>Grupo</span><span>Pessoas</span><span>Libera</span></div>
    ${lista.map(g => { const ps = g.pessoas.map(pessoa).filter(Boolean); return `<button type="button" class="lx-linha lx-g-grupo" data-tipo="grupo" data-abrir="${g.id}">
      <span class="lx-principal">${marca(g.nome)}<span class="lx-nome"><b>${esc(g.nome)}</b><small>${plural(ps.length, 'pessoa', 'pessoas')}</small></span></span>
      <span class="lx-c" data-r="Pessoas">${pilha(ps)}<span class="lx-num">${ps.length}</span></span>
      <span class="lx-c lx-tags" data-r="Libera">${g.usos.map(u => `<span class="tag tag-roxa">${esc(u.texto)}</span>`).join('') || '<span class="tag tag-ambar">ainda não libera nada</span>'}</span></button>`; }).join('')}`;
}

const vazio = (t, x, acao) => `<div class="lx-vazio-bloco"><b>${t}</b><p>${x}</p>${acao ? `<button class="btn btn-verde btn-pequeno" onclick="document.getElementById('lx-novo').click()">${ICONE.mais}${acao}</button>` : ''}</div>`;

// ---------------------------------------------------------------- painel lateral
function abrirPainel(tipo, id) { S.aberto = { tipo, id }; desenharPainel(true); desenharLista(); }
function fecharPainel() {
  const volta = S.aberto?.id;
  S.aberto = null;
  const px = document.querySelector('#modal .px');
  if (px) { px.classList.add('sai'); document.querySelector('#modal .px-fundo')?.classList.add('sai'); setTimeout(() => { if (!S.aberto) $('modal').innerHTML = ''; }, 160); }
  desenharLista();
  document.querySelector(`[data-abrir="${volta}"]`)?.focus({ preventScroll: true });
}

function desenharPainel(novo = false) {
  const m = $('modal');
  if (!S.aberto) return;
  const { tipo, id } = S.aberto;
  const corpo = tipo === 'nova-area' ? painelNovaArea() : tipo === 'novo-grupo' ? painelNovoGrupo() : tipo === 'nova-pessoa' ? painelNovaPessoa()
    : tipo === 'area' ? painelArea(S.areas.find(a => a.id === id)) : tipo === 'pessoa' ? painelPessoa(umaPessoa(id)) : painelGrupo(S.grupos.find(g => g.id === id));
  if (!corpo) { fecharPainel(); return; }
  const rolagem = m.querySelector('.px-corpo')?.scrollTop || 0, estado = $('px-estado')?.textContent || '';
  m.innerHTML = `<div class="px-fundo${novo ? ' entra' : ''}" id="px-fundo"><aside class="px${novo ? ' entra' : ''}" role="dialog" aria-modal="true" aria-labelledby="px-titulo" tabindex="-1">${corpo}</aside></div>`;
  m.querySelector('.px-corpo').scrollTop = rolagem;
  if (estado) salvando(estado);
  $('px-fundo').onclick = ev => { if (ev.target.id === 'px-fundo') fecharPainel(); };
  m.querySelector('[data-fechar]').onclick = fecharPainel;
  ({ 'nova-area': ligarNovaArea, 'novo-grupo': ligarNovoGrupo, 'nova-pessoa': ligarNovaPessoa, area: ligarArea, pessoa: ligarPessoa, grupo: ligarGrupo })[tipo](id);
  if (novo) (m.querySelector('[autofocus]') || m.querySelector('.px')).focus();
}
const topo = (migalha, nome) => `<header class="px-topo"><span class="px-migalha">${migalha}<span aria-hidden="true">›</span><b>${esc(nome)}</b></span>
  <span class="px-estado" id="px-estado" aria-live="polite"></span><button type="button" class="icone-btn px-fechar" data-fechar aria-label="Fechar (Esc)" title="Fechar (Esc)">${ICONE.fechar}<span class="px-fechar-texto" aria-hidden="true">Fechar</span></button></header>`;

// Combobox para adicionar pessoas (área e grupo).
const combo = (rotulo = 'Adicionar pessoa…') => `<div class="combo"><span class="combo-icone">${ICONE.mais}</span><input id="px-add" placeholder="${rotulo}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="px-add-lista" aria-label="${rotulo}">
  <div class="combo-lista" id="px-add-lista" role="listbox" hidden></div></div>`;
function ligarCombo(candidatos, escolher) {
  const inp = $('px-add'), lista = $('px-add-lista');
  if (!inp) return;
  let itens = [], i = 0;
  const mostrar = () => {
    const q = inp.value.toLowerCase();
    itens = candidatos().filter(p => !q || (p.nome + ' ' + p.email).toLowerCase().includes(q)).slice(0, 8);
    i = Math.min(i, Math.max(0, itens.length - 1));
    lista.innerHTML = itens.length ? itens.map((p, k) => `<div class="combo-item${k === i ? ' ativo' : ''}" role="option" aria-selected="${k === i}" data-k="${k}">${avatar(p.nome, p.email)}<b>${esc(p.nome || p.email)}</b><small>${esc(p.email)}</small></div>`).join('')
      : '<div class="combo-nada">Ninguém para adicionar</div>';
    lista.hidden = false; inp.setAttribute('aria-expanded', 'true');
  };
  const fechar = () => { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  inp.onfocus = mostrar; inp.oninput = () => { i = 0; mostrar(); };
  inp.onblur = () => setTimeout(fechar, 150);
  inp.onkeydown = ev => {
    if (ev.key === 'ArrowDown') { i = Math.min(i + 1, itens.length - 1); mostrar(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { i = Math.max(i - 1, 0); mostrar(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { if (itens[i]) escolher(itens[i]); ev.preventDefault(); }
    else if (ev.key === 'Escape') { if (!lista.hidden) { fechar(); ev.stopPropagation(); ev.preventDefault(); } }
  };
  lista.onmousedown = ev => { const it = ev.target.closest('[data-k]'); if (it) { ev.preventDefault(); escolher(itens[Number(it.dataset.k)]); } };
}
// Clique num controle segmentado ou interruptor dentro do painel.
function ligarControles(px, acoes) {
  px.onclick = ev => {
    const b = ev.target.closest('.seg [data-v]:not([disabled])');
    if (b) { const g = b.closest('.seg'); if (b.getAttribute('aria-checked') !== 'true') acoes.seg?.(g.dataset, b.dataset.v); return; }
    const s = ev.target.closest('.switch:not([disabled])');
    if (s) { acoes.switch?.(s.dataset, s.getAttribute('aria-checked') !== 'true'); return; }
    const t = ev.target.closest('[data-acao]');
    if (t) acoes.acao?.(t.dataset.acao, t.dataset);
  };
}
// Campo de texto salvo ao sair (ou Enter, no de uma linha).
function salvarAoSair(el, atual, fn) {
  if (!el) return;
  const ir = () => { const v = el.value.trim(); if (v !== (atual || '')) salvar(() => fn(v)); };
  el.onblur = ir;
  el.onkeydown = ev => { if (ev.key === 'Enter' && el.tagName === 'INPUT') { ev.preventDefault(); el.blur(); } if (ev.key === 'Escape') { el.value = atual || ''; el.blur(); ev.stopPropagation(); } };
}

// Área
const PERM = [['membro', 'Membro'], ['admin', 'Admin da base']];
function painelArea(a) {
  if (!a) return null;
  const consulta = new URLSearchParams(location.hash.split('?')[1] || '');
  const voltar = consulta.get('voltar');
  const orientacao = Number(consulta.get('area')) === a.id && /^\d+$/.test(voltar || '') ? `<p class="px-ajuda"><b>Pesquisa na internet</b><br>Revise a proteção abaixo. Depois, volte à conversa para conferir se ainda há outro bloqueio.<br><a class="btn btn-linha btn-pequeno" href="#/c/${voltar}">Voltar e conferir a pesquisa</a></p>` : '';
  const adm = a.pessoas.filter(m => m.adminBase).length;
  return `${topo('Áreas', a.nome)}<div class="px-corpo">${orientacao}
    <div class="px-cabeca">${marca(a.nome, 'marca-g')}<input class="px-titulo" id="px-titulo" value="${esc(a.nome)}" maxlength="80" aria-label="Nome da área"></div>
    <textarea class="px-desc" id="px-desc" rows="2" maxlength="400" placeholder="Adicionar descrição: o que a área faz e o que a base dela tem…" aria-label="Descrição da área">${esc(a.descricao)}</textarea>
    <dl class="px-props">
      <dt>Situação</dt><dd>${seg([['1', 'Ativa'], ['0', 'Desativada']], a.ativa ? '1' : '0', 'data-campo="ativa"', 'Situação da área')}</dd>
      <dt>Proteção</dt><dd id="protecao-area" tabindex="-1">${seg([['0', 'Padrão'], ['1', 'Reforçada']], a.sigilosa ? '1' : '0', 'data-campo="sigilosa"', 'Proteção das conversas da área')}<small>Reforçada: bloqueia pesquisas na internet para os Quick Wins vinculados a esta área e avalia o conteúdo com mais rigor. Mudar para Padrão afeta todos esses trabalhos; não é uma liberação individual.</small></dd>
      <dt>Base de conhecimento</dt><dd><span>${plural(a.documentos, 'documento', 'documentos')}</span> · <a href="#/conhecimento">abrir a base</a></dd>
    </dl>
    ${a.ativa ? '' : '<div class="px-aviso">Desativada: ninguém vê a base desta área e a IA não usa os documentos dela. Pessoas e documentos continuam guardados.</div>'}
    <section class="px-secao"><div class="px-secao-topo"><h3>Pessoas</h3><span class="lx-conta">${a.pessoas.length}</span><span class="px-resumo">${plural(adm, 'administra', 'administram')} a base</span></div>
      <p class="px-ajuda"><b>Membro</b> usa a base da área. <b>Admin da base</b> também adiciona, edita, organiza e remove os documentos desta área, e só desta.</p>
      ${combo()}
      ${a.pessoas.length ? `<div class="px-lista"><div class="px-lista-cab" aria-hidden="true"><span>Pessoa</span><span>Permissão</span><span>Responsável</span><span></span></div>
        ${a.pessoas.map(m => `<div class="px-linha px-g-membro">
          <span class="lx-principal">${avatar(m.nome, m.email)}<span class="lx-nome"><b>${esc(m.nome || m.email)}</b><small>${esc(m.email)}</small></span></span>
          ${seg(PERM, m.adminBase ? 'admin' : 'membro', `data-perm="${m.pessoa_id}"`, `Permissão de ${m.nome || m.email}`)}
          <span class="px-resp">${interruptor(m.responsavel, `data-resp="${m.pessoa_id}"`, `${m.nome || m.email} é responsável pela área`)}</span>
          <button type="button" class="icone-btn px-tirar" data-acao="tirar" data-id="${m.pessoa_id}" aria-label="Remover ${esc(m.nome || m.email)} da área" title="Remover da área">${ICONE.fechar}</button></div>`).join('')}</div>`
        : '<p class="px-vazio">Ninguém nesta área ainda. Busque acima para adicionar.</p>'}
      <p class="px-ajuda" style="margin-top:10px"><b>Responsável</b> gere os Quick Wins da área e é indicado pela IA como contato.</p></section>
    ${a.ativa ? '' : `<section class="px-secao px-perigo"><h3>Excluir de vez</h3><p class="px-ajuda">Apaga a área e ${plural(a.documentos, 'documento', 'documentos')} da base. Não dá para desfazer.</p>
      <button type="button" class="btn btn-perigo btn-pequeno" data-acao="excluir">Excluir área</button></section>`}</div>`;
}
function ligarArea(id) {
  const a = S.areas.find(x => x.id === id), url = `/api/admin/areas/${id}`;
  salvarAoSair($('px-titulo'), a.nome, v => api(url, { metodo: 'PUT', corpo: { nome: v } }));
  salvarAoSair($('px-desc'), a.descricao, v => api(url, { metodo: 'PUT', corpo: { descricao: v } }));
  ligarCombo(() => S.pessoas.filter(p => p.ativo && !a.pessoas.some(m => m.pessoa_id === p.id)),
    p => salvar(() => api(`${url}/pessoas`, { metodo: 'POST', corpo: { pessoas: [p.id] } })).then(() => $('px-add')?.focus()));
  ligarControles(document.querySelector('.px'), {
    seg: async (d, v) => {
      if (d.campo === 'ativa' && v === '0' && !await confirmar({ titulo: `Desativar ${a.nome}?`, texto: 'As pessoas deixam de ver a base e a IA para de usar os documentos. Nada é apagado.', botao: `Desativar ${a.nome}`, perigo: true })) return;
      if (d.campo === 'sigilosa' && !await confirmar(v === '1'
        ? { titulo: 'Ligar a proteção reforçada?', texto: 'A pesquisa na internet fica bloqueada para os Quick Wins desta área, e o conteúdo é avaliado com mais rigor.', botao: 'Ligar a proteção reforçada' }
        : { titulo: `Mudar a proteção de ${a.nome} para Padrão?`, texto: ['Esta mudança vale para todos os Quick Wins desta área. A pesquisa só acontece se a empresa permitir e o conteúdo não exigir sigilo.', 'Confirme só se a política da empresa autoriza reduzir esta proteção.'], botao: 'Mudar para Padrão', perigo: true })) return;
      if (d.campo) salvar(() => api(url, { metodo: 'PUT', corpo: { [d.campo]: v === '1' } }));
      if (d.perm) salvar(() => api(`${url}/pessoas/${d.perm}`, { metodo: 'PUT', corpo: { adminBase: v === 'admin' } }));
    },
    switch: (d, v) => salvar(() => api(`${url}/pessoas/${d.resp}`, { metodo: 'PUT', corpo: { responsavel: v } })),
    acao: async (k, d) => {
      if (k === 'tirar') salvar(() => api(`${url}/pessoas/${d.id}`, { metodo: 'DELETE' }));
      if (k === 'excluir') {
        if (!await confirmar({ titulo: `Excluir ${a.nome} de vez?`, texto: `Apaga a área e ${plural(a.documentos, 'documento', 'documentos')} da base. Não dá para desfazer.`, botao: 'Excluir área', perigo: true, digitar: a.nome })) return;
        try { await api(url, { metodo: 'DELETE' }); toast('Área excluída.'); S.aberto = null; $('modal').innerHTML = ''; await carregar(); desenharLista(); } catch (e) { falhar(e); }
      }
    },
  });
}

// Pessoa: tudo dela num painel só (perfil, situação, áreas, grupos, Quick Wins, revisão de acesso e remover).
const NIVEL = [['fora', 'Não faz parte'], ['membro', 'Membro'], ['admin', 'Admin da base']];
// O que a pessoa pode criar, pela mesma regra do servidor (permissoesQw em src/quickwins.js).
function quickWinsDe(p) {
  const c = S.qw, naLista = (l = {}) => (l.pessoas || []).includes(p.id) || (l.grupos || []).some(g => p.grupos.includes(g));
  if (p.papel === 'admin') return ['Em todas as áreas e para a empresa toda (administra a empresa)'];
  const minhas = p.areas.filter(m => ativas().some(a => a.id === m.id));
  const areas = naLista(c) ? minhas : c.responsaveis ? minhas.filter(m => m.responsavel) : [];
  return [...(areas.length ? [`Nas áreas: ${areas.map(m => ativas().find(a => a.id === m.id).nome).join(', ')}`] : []), ...(naLista(c.todaEmpresa) ? ['Para a empresa toda'] : [])];
}
function painelPessoa(r) {
  if (!r) return null;
  const p = r.local, multi = !!S.usuarios, altera = pode('user.update'), editavel = !multi && altera;
  const trocaPerfil = multi && altera && pode('role.manage') && !r.proprio;
  const situacao = SITUACAO[r.status] || ['—', ''];
  const rev = r.rev?.revisao;
  const qws = S.qw && p ? quickWinsDe(p) : null;
  return `${topo('Pessoas', r.nome || r.email)}<div class="px-corpo">
    <div class="px-cabeca">${avatar(r.nome, r.email, 'av-g')}<div style="flex:1;min-width:0">${editavel && p ? `<input class="px-titulo" id="px-titulo" value="${esc(p.nome)}" maxlength="120" aria-label="Nome">` : `<h2 class="px-titulo" id="px-titulo">${esc(r.nome || r.email)}</h2>`}<div class="px-sub">${esc(r.email)}${r.proprio ? ' · você' : ''}</div></div></div>
    <dl class="px-props">
      <dt>Perfil</dt><dd>${trocaPerfil ? `<select class="entrada entrada-pequena" id="px-perfil" aria-label="Perfil de ${esc(r.nome || r.email)}">${S.roles.map(x => `<option value="${esc(x.id)}" ${x.id === r.roleId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
        : editavel && p ? seg([['usuario', 'Membro'], ['admin', 'Admin da empresa']], p.papel, 'data-campo="papel"', 'Perfil') : `<span>${esc(r.perfil || '—')}</span>${r.proprio && multi ? '<small>Peça a outro administrador para mudar o seu perfil.</small>' : ''}`}</dd>
      <dt>Situação</dt><dd>${multi ? `<span class="tag ${situacao[1]}"><i></i>${situacao[0]}</span>
          ${r.status === 'convidado' && pode('user.create') ? '<button type="button" class="btn-texto btn-pequeno" data-acao="reenviar">Reenviar convite</button>' : ''}
          ${altera && !r.proprio ? (r.status === 'inativo' ? '<button type="button" class="btn btn-linha btn-pequeno" data-acao="reativar">Reativar</button>' : '<button type="button" class="btn btn-linha btn-pequeno" data-acao="desativar">Desativar</button>') : ''}
          ${r.status === 'convidado' ? '<small>O convite chega por email. No primeiro acesso, a pessoa fica ativa.</small>' : ''}`
        : p ? `${interruptor(p.ativo, 'data-campo="ativo"', 'Pode entrar', !editavel)}<span>${p.ativo ? 'Pode entrar' : 'Não pode entrar'}</span>` : '—'}</dd>
    </dl>
    ${p ? `<section class="px-secao"><div class="px-secao-topo"><h3>Áreas</h3><span class="lx-conta">${p.areas.filter(m => ativas().some(a => a.id === m.id)).length}</span></div>
      <p class="px-ajuda">Em cada área: faz parte? Administra a base de conhecimento? É <b>responsável</b> (gere os Quick Wins da área e é indicado pela IA como contato)?</p>
      ${ativas().length ? `<div class="px-lista">${ativas().map(a => { const m = p.areas.find(x => x.id === a.id); return `<div class="px-linha px-g-area">
        <span class="lx-principal">${marca(a.nome)}<span class="lx-nome"><b>${esc(a.nome)}</b></span></span>
        <span class="px-resp" title="Gere os Quick Wins da área e é indicado pela IA como contato">${interruptor(m?.responsavel, `data-resp="${a.id}"`, `Responsável por ${a.nome}`, !m || !altera)}<small>Responsável</small></span>
        ${seg(NIVEL, !m ? 'fora' : m.adminBase ? 'admin' : 'membro', `data-area="${a.id}"`, `${p.nome || p.email} em ${a.nome}`, !altera)}</div>`; }).join('')}</div>`
        : '<p class="px-vazio">Nenhuma área criada ainda. <a href="#/pessoas/areas">Criar áreas</a>.</p>'}</section>
    <section class="px-secao"><div class="px-secao-topo"><h3>Grupos de permissão</h3><span class="lx-conta">${p.grupos.length}</span></div>
      <p class="px-ajuda">Recursos a mais, que valem em qualquer área.</p>
      ${S.grupos.length ? `<div class="px-lista">${S.grupos.map(g => `<div class="px-linha px-g-grupo">${interruptor(p.grupos.includes(g.id), `data-grupo="${g.id}"`, `No grupo ${g.nome}`, !altera)}
        <span class="lx-nome"><b>${esc(g.nome)}</b><small>${g.usos.length ? `Libera: ${esc(g.usos.map(u => u.texto).join(' · '))}` : 'Ainda não libera nenhum recurso'}</small></span></div>`).join('')}</div>`
        : '<p class="px-vazio">Nenhum grupo criado. <a href="#/pessoas/grupos">Criar grupos</a>.</p>'}</section>`
      : '<section class="px-secao"><h3>Áreas e grupos</h3><p class="px-vazio">As áreas e os grupos ficam disponíveis depois que a pessoa entra pela primeira vez.</p></section>'}
    ${qws ? `<section class="px-secao"><div class="px-secao-topo"><h3>Quick Wins que pode criar</h3></div>
      ${qws.length ? `<ul class="px-itens">${qws.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="px-ajuda">Não cria Quick Wins. Usa os que a empresa publicou.</p>'}
      <p class="px-ajuda"><a href="#/pessoas/criacao">Alterar em Quem cria Quick Wins</a></p></section>` : ''}
    ${p && r.rev ? `<section class="px-secao" id="px-revisao"><div class="px-secao-topo"><h3>Revisão de acesso</h3>${r.rev.pendente ? '<span class="tag tag-ambar">Revisão pendente</span>' : '<span class="tag tag-verde"><i></i>Em dia</span>'}</div>
      <p class="px-ajuda" id="px-rev-ultima">${rev ? `Última revisão em ${esc(dataBr(rev.em))}${rev.por ? ` por ${esc(rev.por)}` : ''}.${rev.observacao ? ` Conferido: ${esc(rev.observacao)}` : ''}` : 'Ainda não revisado.'}</p>
      <p class="px-ajuda">A revisão registra a sua conferência das áreas, dos grupos e de quem administra as bases. Ela não muda o acesso.</p>
      ${S.podeRevisar ? `<form id="px-revisar" class="px-revisar"><label class="legenda" for="px-rev-nota">O que você conferiu?</label>
        <textarea class="entrada" id="px-rev-nota" required maxlength="500" rows="2" placeholder="Ex.: confirmei as áreas e os administradores das bases"></textarea>
        <label class="px-marca"><input type="checkbox" id="px-rev-ok" required> <span>Conferi os vínculos apresentados</span></label>
        <button class="btn btn-verde btn-pequeno">Registrar revisão</button></form>` : ''}</section>` : ''}
    ${multi && pode('user.delete') && !r.proprio ? `<section class="px-secao px-perigo"><h3>Remover da empresa</h3><p class="px-ajuda">A pessoa deixa de ter acesso ao ambiente. O histórico dela continua.</p>
      <button type="button" class="btn btn-perigo btn-pequeno" data-acao="remover">Remover ${esc(r.nome || r.email)}</button></section>` : ''}</div>`;
}
function ligarPessoa(id) {
  const r = umaPessoa(id), p = r.local, url = p && `/api/admin/pessoas/${p.id}`, nome = r.nome || r.email;
  const usuario = r.uid && `/api/empresa/usuarios/${encodeURIComponent(r.uid)}`;
  // O servidor recebe as áreas e os grupos inteiros; áreas desativadas ficam como estavam.
  const enviar = (mudar = {}) => {
    let areas = p.areas.map(m => ({ ...m })), grupos = [...p.grupos];
    if (mudar.area) {
      const { id: aid, nivel, resp } = mudar.area, m = areas.find(x => x.id === aid);
      if (nivel === 'fora') areas = areas.filter(x => x.id !== aid);
      else if (nivel) { if (m) m.adminBase = nivel === 'admin'; else areas.push({ id: aid, adminBase: nivel === 'admin', responsavel: false }); }
      if (resp !== undefined && m) m.responsavel = resp;
    }
    if (mudar.grupo) grupos = mudar.grupo.v ? [...new Set([...grupos, mudar.grupo.id])] : grupos.filter(g => g !== mudar.grupo.id);
    return salvar(() => api(url, { metodo: 'PUT', corpo: { areas, grupos, ...(mudar.dados || {}) } }));
  };
  if (!S.usuarios && p) salvarAoSair($('px-titulo'), p.nome, v => api(url, { metodo: 'PUT', corpo: { nome: v } }));
  const perfil = $('px-perfil');
  if (perfil) perfil.onchange = async () => {
    const novo = S.roles.find(x => x.id === perfil.value);
    if (!await confirmar({ titulo: `Mudar o perfil de ${nome} para ${novo?.name}?`, texto: 'Isso muda o que essa pessoa pode acessar e fazer.', botao: `Mudar para ${novo?.name}` })) { perfil.value = r.roleId; return; }
    if (await salvar(() => api(usuario, { metodo: 'PUT', corpo: { role_id: perfil.value } }))) toast('Perfil alterado.');
  };
  const form = $('px-revisar');
  if (form) form.onsubmit = async ev => {
    ev.preventDefault();
    const nota = $('px-rev-nota').value;
    if (await salvar(() => api(`/api/acompanhamento/acessos/${p.id}/revisar`, { metodo: 'POST', corpo: { observacao: nota } }))) toast('Revisão registrada.');
  };
  ligarControles(document.querySelector('.px'), {
    seg: (d, v) => { if (d.area) enviar({ area: { id: Number(d.area), nivel: v } }); if (d.campo === 'papel') enviar({ dados: { papel: v } }); },
    switch: (d, v) => {
      if (d.resp) enviar({ area: { id: Number(d.resp), resp: v } });
      if (d.grupo) enviar({ grupo: { id: Number(d.grupo), v } });
      if (d.campo === 'ativo') enviar({ dados: { ativo: v } });
    },
    acao: async k => {
      if (k === 'reenviar') { try { await api(`${usuario}/reenviar`, { metodo: 'POST' }); toast('Convite reenviado.'); } catch (e) { falhar(e); } }
      if (k === 'reativar' && await salvar(() => api(usuario, { metodo: 'PUT', corpo: { status: 'ativo' } }))) toast('Acesso reativado.');
      if (k === 'desativar') {
        if (!await confirmar({ titulo: `Desativar ${nome}?`, texto: 'A pessoa perde o acesso na hora. O histórico continua no ambiente.', botao: `Desativar ${nome}`, perigo: true })) return;
        if (await salvar(() => api(usuario, { metodo: 'PUT', corpo: { status: 'inativo' } }))) toast('Acesso desativado.');
      }
      if (k === 'remover') {
        if (!await confirmar({ titulo: `Remover ${nome} da empresa?`, texto: 'A pessoa deixa de ter acesso ao ambiente. O histórico dela continua.', botao: `Remover ${nome}`, perigo: true })) return;
        try { await api(usuario, { metodo: 'DELETE' }); toast('Pessoa removida.'); S.aberto = null; $('modal').innerHTML = ''; await carregar(); desenharLista(); $('lx-q')?.focus(); } catch (e) { falhar(e); }
      }
    },
  });
}

// Grupo
function painelGrupo(g) {
  if (!g) return null;
  const ps = g.pessoas.map(pessoa).filter(Boolean);
  return `${topo('Grupos de permissão', g.nome)}<div class="px-corpo">
    <div class="px-cabeca">${marca(g.nome, 'marca-g')}<input class="px-titulo" id="px-titulo" value="${esc(g.nome)}" maxlength="80" aria-label="Nome do grupo"></div>
    <section class="px-secao"><div class="px-secao-topo"><h3>Libera</h3></div>
      ${g.usos.length ? `<div class="px-lista">${g.usos.map(u => `<div class="px-linha px-g-uso"><span class="tag tag-roxa">${esc(u.texto)}</span><a href="${u.onde}">alterar</a></div>`).join('')}</div>`
        : '<div class="px-aviso">Este grupo ainda não libera nada. Escolha o que ele libera em <a href="#/modelos">Modelos</a> (nível Equilibrado ou Avançado) ou em <a href="#/pessoas/criacao">Quem cria Quick Wins</a>.</div>'}
      <p class="px-ajuda">Grupo não dá acesso a conhecimento. Para isso, use as <a href="#/pessoas/areas">áreas</a>.</p></section>
    <section class="px-secao"><div class="px-secao-topo"><h3>Pessoas</h3><span class="lx-conta">${ps.length}</span></div>
      ${combo()}
      ${ps.length ? `<div class="px-lista">${ps.map(p => `<div class="px-linha px-g-pessoa">
        <span class="lx-principal">${avatar(p.nome, p.email)}<span class="lx-nome"><b>${esc(p.nome || p.email)}</b><small>${esc(p.email)}</small></span></span>
        <button type="button" class="icone-btn px-tirar" data-acao="tirar" data-id="${p.id}" aria-label="Tirar ${esc(p.nome || p.email)} do grupo" title="Tirar do grupo">${ICONE.fechar}</button></div>`).join('')}</div>`
        : '<p class="px-vazio">Ninguém no grupo ainda. Busque acima para adicionar.</p>'}</section>
    <section class="px-secao px-perigo"><h3>Excluir grupo</h3><p class="px-ajuda">Quem tinha um recurso só por este grupo perde o recurso.</p>
      <button type="button" class="btn btn-perigo btn-pequeno" data-acao="excluir">Excluir grupo</button></section></div>`;
}
function ligarGrupo(id) {
  const g = S.grupos.find(x => x.id === id), url = `/api/admin/grupos/${id}`;
  salvarAoSair($('px-titulo'), g.nome, v => api(url, { metodo: 'PUT', corpo: { nome: v } }));
  ligarCombo(() => S.pessoas.filter(p => p.ativo && !g.pessoas.includes(p.id)),
    p => salvar(() => api(url, { metodo: 'PUT', corpo: { pessoas: [...g.pessoas, p.id] } })).then(() => $('px-add')?.focus()));
  ligarControles(document.querySelector('.px'), {
    acao: async (k, d) => {
      if (k === 'tirar') salvar(() => api(url, { metodo: 'PUT', corpo: { pessoas: g.pessoas.filter(x => x !== Number(d.id)) } }));
      if (k === 'excluir' && await confirmar({ titulo: `Excluir o grupo ${g.nome}?`, texto: 'Quem tinha um recurso só por este grupo perde o recurso.', botao: 'Excluir grupo', perigo: true })) {
        try { await api(url, { metodo: 'DELETE' }); toast('Grupo excluído.'); S.aberto = null; $('modal').innerHTML = ''; await carregar(); desenharLista(); } catch (e) { falhar(e); }
      }
    },
  });
}

// Criação: painel curto com o essencial; ao criar, abre o painel do item novo.
const formNovo = (migalha, titulo, campos, botao) => `${topo(migalha, titulo)}<form class="px-corpo" id="px-form" novalidate>${campos}
  <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde btn-pequeno">${botao}</button><button type="button" class="btn-texto btn-pequeno" data-fechar-form>Cancelar</button></div></form>`;
function painelNovaArea() {
  return formNovo('Áreas', 'Nova área', `<input class="px-titulo" id="n-nome" maxlength="80" placeholder="Nome da área" aria-label="Nome da área" autofocus required>
    <textarea class="px-desc" id="n-desc" rows="3" maxlength="400" placeholder="Descrição (opcional): o que a área faz e o que a base dela terá…" aria-label="Descrição"></textarea>`, 'Criar área');
}
function painelNovoGrupo() {
  return formNovo('Grupos de permissão', 'Novo grupo', `<input class="px-titulo" id="n-nome" maxlength="80" placeholder="Nome do grupo, como Gestores" aria-label="Nome do grupo" autofocus required>
    <p class="px-ajuda">Depois de criar, adicione as pessoas e escolha o que o grupo libera em Modelos ou em Quem cria Quick Wins.</p>`, 'Criar grupo');
}
function painelNovaPessoa() {
  // Multiempresa: o convite (email, nome e perfil) é o mesmo da antiga tela Usuários.
  if (E.plataforma) return formNovo('Pessoas', 'Convidar pessoa', `<p class="px-ajuda">O convite chega por email. No primeiro acesso, a pessoa fica ativa.</p>
    <div class="campo"><label for="cv-email">Email</label><input class="entrada" id="cv-email" type="email" required autofocus></div>
    <div class="campo"><label for="cv-nome">Nome</label><input class="entrada" id="cv-nome" maxlength="120"></div>
    <div class="campo"><label for="cv-role">Perfil</label><select class="entrada" id="cv-role">${S.roles.map(r => `<option value="${esc(r.id)}" ${r.key === 'member' ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>`, 'Enviar convite');
  return formNovo('Pessoas', 'Nova pessoa', `<input class="px-titulo" id="n-nome" maxlength="120" placeholder="Nome" aria-label="Nome" autofocus>
    <div class="campo" style="margin-top:10px"><label for="n-email">Email</label><input class="entrada" id="n-email" type="email" required></div>
    <p class="px-ajuda">Quem tem email de um domínio permitido também entra sozinho. Depois de criar, escolha as áreas da pessoa.</p>`, 'Adicionar pessoa');
}
const ligarForm = (fn) => {
  $('px-form').onsubmit = async ev => { ev.preventDefault(); try { const id = await fn(); await carregar(); desenharLista(); abrirPainel(S.aba === 'areas' ? 'area' : S.aba === 'grupos' ? 'grupo' : 'pessoa', typeof id === 'function' ? id() : id); } catch (e) { falhar(e); } };
  document.querySelector('[data-fechar-form]').onclick = fecharPainel;
};
function ligarNovaArea() { ligarForm(async () => (await api('/api/admin/areas', { metodo: 'POST', corpo: { nome: $('n-nome').value, descricao: $('n-desc').value } })).id); }
function ligarNovoGrupo() { ligarForm(async () => (await api('/api/admin/grupos', { metodo: 'POST', corpo: { nome: $('n-nome').value } })).id); }
function ligarNovaPessoa() {
  if (E.plataforma) return ligarForm(async () => {
    const u = await api('/api/empresa/usuarios', { metodo: 'POST', corpo: { email: $('cv-email').value, name: $('cv-nome').value, role_id: $('cv-role').value } });
    toast('Convite enviado.');
    return () => gente().find(r => r.uid === u.id)?.id;
  });
  ligarForm(async () => (await api('/api/admin/pessoas', { metodo: 'POST', corpo: { email: $('n-email').value, nome: $('n-nome').value } })).id);
}
function novo() {
  S.aberto = { tipo: { areas: 'nova-area', grupos: 'novo-grupo', pessoas: 'nova-pessoa' }[S.aba] };
  desenharPainel(true);
}

// ---------------------------------------------------------------- teclado
function teclas(ev) {
  if (!location.hash.startsWith('#/pessoas') || !$('lx-lista')) { document.removeEventListener('keydown', teclas); return; }
  if (ev.key === 'Escape' && S.aberto) { ev.preventDefault(); ev.stopPropagation(); fecharPainel(); return; }
  const campo = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
  if (campo || ev.metaKey || ev.ctrlKey || ev.altKey || S.aberto) return;
  const linhas = [...document.querySelectorAll('.lx-linha')];
  // Nesta tela, / busca na lista e C cria aqui (e não abre a paleta nem uma conversa nova).
  const meu = () => { ev.preventDefault(); ev.stopPropagation(); };
  if (ev.key === '/') { meu(); $('lx-q').focus(); }
  else if (ev.key === 'c' || ev.key === 'C') { meu(); $('lx-novo')?.click(); }
  else if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(ev.key) && linhas.length) {
    meu();
    const i = linhas.indexOf(document.activeElement), d = ev.key === 'j' || ev.key === 'ArrowDown' ? 1 : -1;
    linhas[i < 0 ? 0 : Math.max(0, Math.min(linhas.length - 1, i + d))].focus();
  }
}
function ligarTeclas() { document.removeEventListener('keydown', teclas); document.addEventListener('keydown', teclas); }
window.addEventListener('hashchange', () => { if (S.aberto) { S.aberto = null; if (document.querySelector('#modal .px')) $('modal').innerHTML = ''; } });

// ---------------------------------------------------------------- abas
async function abrir(aba, opcoes) {
  S.aba = aba; S.aberto = null; S.q = '';
  if (document.querySelector('#modal .px')) $('modal').innerHTML = '';
  await carregar();
  casca(opcoes());
  desenharLista();
}
export const abaAreas = () => abrir('areas', () => ({
  titulo: 'Áreas', busca: 'Buscar área', acao: 'Nova área',
  filtros: pilulas([['ativas', 'Ativas', ativas().length], ['desativadas', 'Desativadas', S.areas.length - ativas().length], ['todas', 'Todas', S.areas.length]], S.filtro.areas || 'ativas'),
})).then(() => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const id = Number(q.get('area'));
  if (id && S.areas.some(a => a.id === id)) {
    abrirPainel('area', id);
    if (q.get('foco') === 'protecao-area') $('protecao-area')?.focus();
  }
});
export const abaPessoas = () => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  S.filtro.revisao = q.get('revisao') === 'pendente';   // vindo de Pendências ou do antigo Revisar acessos
  return abrir('pessoas', () => {
    const f = S.filtro.pessoas || 'todas', pendentes = gente().filter(r => r.rev?.pendente).length;
    const perfis = S.usuarios ? S.roles.map(r => r.name) : ['Membro', 'Admin da empresa'];
    const sel = (id, rotulo, opcoes, atual) => `<label class="lx-seletor"><span class="sr">${rotulo}</span><select class="entrada entrada-pequena" id="${id}">${opcoes.map(([v, t]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    return { titulo: 'Pessoas com acesso', busca: 'Buscar pessoa', acao: E.plataforma ? (pode('user.create') ? 'Convidar pessoa' : '') : 'Nova pessoa',
      filtros: sel('lx-perfil', 'Perfil', [['', 'Perfil: todos'], ...perfis.map(n => [n, n])], S.filtro.perfil || '')
        + sel('lx-status', 'Situação', [['', 'Situação: todas'], ['ativo', 'Ativos'], ...(S.usuarios ? [['convidado', 'Convidados']] : []), ['inativo', 'Inativos']], S.filtro.status || '')
        + sel('lx-area', 'Área', [['todas', 'Área: todas'], ['sem', 'Sem área'], ...ativas().map(a => [String(a.id), a.nome])], f)
        + `<label class="lx-marca"><input type="checkbox" id="lx-revisao" ${S.filtro.revisao ? 'checked' : ''}> <span>Revisão pendente</span> <span class="lx-conta">${pendentes}</span></label>` };
  }).then(() => {
    $('lx-area').onchange = ev => { S.filtro.pessoas = ev.target.value; desenharLista(); };
    $('lx-perfil').onchange = ev => { S.filtro.perfil = ev.target.value; desenharLista(); };
    $('lx-status').onchange = ev => { S.filtro.status = ev.target.value; desenharLista(); };
    $('lx-revisao').onchange = ev => { S.filtro.revisao = ev.target.checked; desenharLista(); };
    if (q.get('convidar') === '1' && $('lx-novo')) novo();
    const abrirId = q.get('pessoa');
    if (abrirId && umaPessoa(idDe(abrirId))) abrirPainel('pessoa', idDe(abrirId));
  });
};
export const abaGrupos = () => abrir('grupos', () => ({ titulo: 'Grupos de permissão', busca: 'Buscar grupo', acao: 'Novo grupo' }));
