// Console da plataforma (operador): empresas, usuários, planos, ambientes, uso, auditoria e configurações.
// Separado do admin de cada empresa: outra página, outra sessão, outra cor de navegação.
import { carregandoHtml, esc, marcaHtml, ocupado, toast, transicao, vazioHtml, ICONE } from '/comum.js';
import { iniciarPaleta, abrirPaleta, teclaPaleta } from '/comando.js';
import { renderMarca, ligarMarca, renderLanding, ligarLanding, renderUrl, ligarUrl, mostrarErro, ROTULOS_MARCA } from '/editores.js';

const $ = id => document.getElementById(id);
const C = { eu: null, csrf: '', catalogo: null, planos: [] };
const num = v => Number(v || 0).toLocaleString('pt-BR');
const usd = v => (v === null || v === undefined ? '–' : `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const data = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '–');
const dataHora = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const SELO_STATUS = { ativa: 'selo-verde', em_implantacao: 'selo-ambar', suspensa: 'selo-vermelho', cancelada: 'selo-cinza' };
const selo = (s, nome) => `<span class="selo ${SELO_STATUS[s] || 'selo-cinza'}">${esc(nome || C.catalogo?.status[s] || s)}</span>`;

async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(caminho, { method: metodo, credentials: 'same-origin',
    headers: { ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' ? { 'x-csrf': C.csrf } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !caminho.includes('/login/')) { telaLogin(); throw new Error('Entre de novo.'); }
  if (!r.ok) { const e = new Error(d.mensagem || 'Algo deu errado.'); e.status = r.status; e.codigo = d.erro; throw e; }
  return d;
}
const falhar = e => toast(e.message, 6000);

// ---------------------------------------------------------------- Login do console
function telaLogin() {
  document.body.innerHTML = `<main class="entrar-console"><div class="login-cartao">
    <div class="marca">${marcaHtml()}</div><span class="selo-escopo" style="margin-left:0">Console da plataforma</span>
    <h1>Acesso do operador da plataforma</h1>
    <p class="texto">Área de administração global. Só administradores da plataforma recebem o código.</p>
    <form id="f-email" novalidate><div class="campo"><label for="c-email">Email</label><input class="entrada" id="c-email" type="email" autocomplete="email" required></div>
      <p class="msg-erro oculto" id="c-erro" role="alert"></p><button class="btn btn-verde" style="width:100%">Receber código</button></form>
    <form id="f-codigo" class="oculto" novalidate><div class="campo"><label for="c-codigo">Código</label><input class="entrada" id="c-codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
      <p class="msg-erro oculto" id="c-erro2" role="alert"></p><button class="btn btn-verde" style="width:100%">Entrar</button></form>
  </div></main>`;
  $('f-email').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/plataforma/login/codigo', { metodo: 'POST', corpo: { email: $('c-email').value } }); $('f-email').classList.add('oculto'); $('f-codigo').classList.remove('oculto'); $('c-codigo').focus(); }
    catch (e) {
      mostrarErro('c-erro', e);
      // Sem email configurado o código foi gerado mesmo assim (está no log do servidor): deixa digitar.
      if (e.erro === 'email_nao_configurado') { $('f-codigo').classList.remove('oculto'); $('c-codigo').focus(); }
    }
  };
  $('f-codigo').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/plataforma/login/entrar', { metodo: 'POST', corpo: { email: $('c-email').value, codigo: $('c-codigo').value } }); location.reload(); }
    catch (e) { mostrarErro('c-erro2', e); }
  };
}

// ---------------------------------------------------------------- Casca
const SECOES = [['empresas', 'Empresas', 'predio'], ['usuarios', 'Usuários', 'pessoas'], ['planos', 'Planos', 'pacote'], ['ambientes', 'Ambientes', 'servidor'], ['uso', 'Uso', 'grafico'], ['auditoria', 'Auditoria', 'atividade'], ['configuracoes', 'Configurações', 'engrenagem']];
function lateral() {
  const h = location.hash || '#/empresas';
  $('lateral').innerHTML = `<a class="marca" href="#/empresas">${marcaHtml()}</a><span class="selo-escopo">Plataforma</span>
    <button type="button" class="busca-lat" id="abrir-busca" style="margin-top:12px">${ICONE.busca}<span>Buscar ou ir para</span><span class="kbd">${teclaPaleta()}</span></button>
    <nav class="lateral-rolagem" aria-label="Console">
      ${SECOES.map(([id, nome, ic]) => `<a class="item-lat${h.startsWith(`#/${id}`) ? ' ativo' : ''}" href="#/${id}" ${h.startsWith(`#/${id}`) ? 'aria-current="page"' : ''}>${ICONE[ic]}<span class="nome">${nome}</span></a>`).join('')}
    </nav>
    <div class="lateral-pe"><span class="btn-lat" style="cursor:default">${esc(C.eu.usuario.email)}</span><button class="btn-lat" id="sair">Sair do console</button></div>`;
  $('abrir-busca').onclick = () => abrirPaleta();
  $('sair').onclick = async () => { await api('/api/plataforma/sair', { metodo: 'POST' }).catch(() => {}); location.reload(); };
}
function cab(titulo, acoes = '', voltar = '') {
  return `<header class="cabeca"><div class="cabeca-titulo">
    <button class="icone-btn menu-btn" id="menu" aria-label="Abrir navegação">${ICONE.menu}</button>
    <span class="migalha"><span>Plataforma</span><span class="sep">/</span>${voltar ? `<a href="${voltar}">${esc(SECOES.find(x => voltar.startsWith(`#/${x[0]}`))?.[1] || 'Voltar')}</a><span class="sep">/</span>` : ''}</span><h1>${esc(titulo)}</h1></div><div class="cabeca-acoes">${acoes}</div></header>`;
}
function tela(titulo, corpo, acoes = '', voltar = '') {
  $('principal').innerHTML = `${cab(titulo, acoes, voltar)}<div class="pagina"><div class="pagina-dentro">${faixaEmail()}${faixaChave()}${corpo}</div></div>`;
  $('menu').onclick = () => $('lateral').classList.toggle('aberta');
}
// Envio de email falhando: os códigos de acesso das empresas não chegam. Motivo real, sem segredos.
function faixaEmail() {
  const a = C.eu?.alertaEmail;
  if (!a) return '';
  return `<div class="faixa-aviso erro faixa-chave" role="alert"><b>Envio de email falhando:</b> os códigos de acesso podem não estar chegando. Última falha em ${esc(dataHora(a.em))} (${esc(a.origem)}): <code>${esc(a.detalhe)}</code> <a href="#/configuracoes">Ver email da plataforma</a></div>`;
}
// Aviso de vencimento ou rotação da chave do OpenRouter, no topo de todas as telas do console.
const NIVEL_FAIXA = { atencao: 'atencao', critico: 'erro', erro: 'erro' };
function faixaChave() {
  const a = C.eu?.alertaChave;
  if (!a || !NIVEL_FAIXA[a.nivel] || location.hash.startsWith('#/uso')) return '';   // em Uso, o card da chave já mostra
  return `<div class="faixa-aviso ${NIVEL_FAIXA[a.nivel]} faixa-chave" role="${a.nivel === 'atencao' ? 'status' : 'alert'}"><b>Chave do OpenRouter · ${esc(a.rotulo || '')}:</b> ${esc(a.texto)} <a href="#/uso" data-trocar-chave>Trocar a chave</a></div>`;
}
const carregando = titulo => tela(titulo, carregandoHtml());
const tabela = (cab, linhas, vazio) => (linhas.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${cab.map(c => `<th${c.startsWith('#') ? ' class="num"' : ''}>${esc(c.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
  : vazio ? vazioHtml({ titulo: vazio }) : '');

function modal(html, aoAbrir) {
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  const fechar = () => { $('modal').innerHTML = ''; };
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  document.querySelector('.modal').focus();
  aoAbrir?.(fechar);
}

// ---------------------------------------------------------------- Empresas
async function vistaEmpresas() {
  carregando('Empresas');
  const { empresas } = await api('/api/plataforma/empresas');
  C.empresas = empresas;
  tela('Empresas', `<p class="lead">Cada empresa é um ambiente independente: dados, usuários, marca e landing page próprios.</p>
    ${tabela(['Empresa', 'Status', 'Plano', 'URL', '#Usuários', '#Créditos no mês'], empresas.map(e => `<tr>
      <td data-r="Empresa"><a href="#/empresas/${e.id}"><b>${esc(e.name)}</b></a><br><span class="dica">${esc(e.admins.join(', ') || 'sem administrador')}</span></td>
      <td data-r="Status">${selo(e.status, e.statusNome)}</td><td data-r="Plano">${esc(e.plano?.name || 'sem plano')}</td>
      <td data-r="URL"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace(/^https?:\/\//, ''))}</a></td>
      <td class="num" data-r="Usuários">${num(e.usuarios)}</td><td class="num" data-r="Créditos">${e.creditosUsados === null ? '–' : `${num(Math.round(e.creditosUsados))} <span class="dica">${e.percentual}%</span>`}</td></tr>`),
    '')}${empresas.length ? '' : vazioHtml({ icone: 'predio', titulo: 'Nenhuma empresa ainda', texto: 'Crie a primeira empresa: nome, identificador, plano e administrador. Ela nasce em implantação, e você publica quando estiver pronta.', acao: '<button class="btn btn-verde" id="nova-empresa-vazio">Criar empresa</button>' })}`,
  '<button class="btn btn-verde btn-pequeno" id="nova-empresa" title="Nova empresa (N)">Nova empresa</button>');
  $('nova-empresa-vazio')?.addEventListener('click', novaEmpresa);
  $('nova-empresa').onclick = novaEmpresa;
}

async function novaEmpresa() {
  const planos = C.planos.filter(p => p.status === 'ativo');
  modal(`<div class="modal-topo"><div class="rotulo">Nova empresa</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2>Criar ambiente</h2>
    <form id="f-nova" novalidate>
      <div class="campo"><label for="n-nome">Nome da empresa</label><input class="entrada" id="n-nome" required maxlength="80"></div>
      <div class="campo"><label for="n-slug">Identificador (slug)</label><input class="entrada" id="n-slug" required maxlength="40" pattern="[a-z0-9-]+"><span class="ajuda" id="n-url">Usado no endereço do ambiente. Letras minúsculas, números e hífens.</span></div>
      <div class="campo"><label for="n-plano">Plano</label><select class="entrada" id="n-plano"><option value="">Sem plano por enquanto</option>${planos.map(p => `<option value="${p.id}">${esc(p.name)} · ${p.credits ? `${num(p.credits)} créditos` : 'ilimitado'}</option>`).join('')}</select></div>
      <h3>Primeiro administrador</h3>
      <div class="grade-2"><div class="campo"><label for="n-admin">Email</label><input class="entrada" id="n-admin" type="email"></div>
        <div class="campo"><label for="n-admin-nome">Nome</label><input class="entrada" id="n-admin-nome" maxlength="120"></div></div>
      <label class="dica" style="display:flex;gap:8px"><input type="checkbox" id="n-convidar" checked> Enviar convite por email</label>
      <p class="msg-erro oculto" id="n-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Criar empresa</button></div>
    </form>`, fechar => {
    $('fechar').onclick = fechar;
    let slugEditado = false;
    const slugDe = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    $('n-nome').oninput = () => { if (!slugEditado) $('n-slug').value = slugDe($('n-nome').value); };
    $('n-slug').oninput = () => { slugEditado = true; };
    $('n-nome').focus();
    $('f-nova').onsubmit = async ev => {
      ev.preventDefault();
      try {
        const e = await api('/api/plataforma/empresas', { metodo: 'POST', corpo: { name: $('n-nome').value, slug: $('n-slug').value, plan_id: $('n-plano').value || null, admin_email: $('n-admin').value || undefined, admin_name: $('n-admin-nome').value, convidar: $('n-convidar').checked } });
        fechar(); toast('Empresa criada em implantação. Configure e publique quando estiver pronta.'); location.hash = `#/empresas/${e.id}`;
      } catch (e) { mostrarErro('n-erro', e); }
    };
  });
}

const ABAS = [['resumo', 'Resumo'], ['usuarios', 'Usuários'], ['marca', 'Marca'], ['landing', 'Landing Page'], ['url', 'URL e domínio'], ['permissoes', 'Permissões concedidas'], ['auditoria', 'Auditoria']];
async function vistaEmpresa(id, aba = 'resumo') {
  carregando('Empresa');
  const d = await api(`/api/plataforma/empresas/${id}`);
  const e = d.empresa;
  const sub = `<nav class="subnav" aria-label="Seções da empresa">${ABAS.map(([k, n]) => `<a href="#/empresas/${id}/${k}" ${k === aba ? 'aria-current="page"' : ''}>${n}</a>`).join('')}</nav>`;
  const titulo = `${e.name}`;
  const acoes = `${selo(e.status, e.statusNome)} <button class="btn btn-linha btn-pequeno" id="entrar-amb">Entrar no ambiente</button>`;
  const corpo = { resumo: abaResumo, usuarios: abaUsuarios, marca: abaMarca, landing: abaLanding, url: abaUrl, permissoes: abaPermissoes, auditoria: abaAuditoriaEmpresa }[aba] || abaResumo;
  tela(titulo, `${sub}<div id="aba"></div>`, acoes, '#/empresas');
  $('entrar-amb').onclick = async () => {
    try { const r = await api(`/api/plataforma/empresas/${id}/entrar`, { metodo: 'POST' }); window.open(r.url, '_blank'); toast('Ambiente aberto em outra aba. O acesso foi registrado na auditoria.'); } catch (x) { falhar(x); }
  };
  await corpo(d, id);
}

async function abaResumo(d, id) {
  const e = d.empresa, u = d.uso, a = d.ambiente;
  const botoesStatus = { em_implantacao: [['ativa', 'Publicar ambiente', 'btn-verde'], ['cancelada', 'Cancelar', 'btn-texto']], ativa: [['suspensa', 'Suspender', 'btn-linha'], ['cancelada', 'Cancelar', 'btn-texto']],
    suspensa: [['ativa', 'Reativar', 'btn-verde'], ['cancelada', 'Cancelar', 'btn-texto']], cancelada: [['em_implantacao', 'Reabrir em implantação', 'btn-linha']] }[e.status];
  $('aba').innerHTML = `
    <div class="secao-titulo" style="margin-top:0"><h3>Status</h3></div>
    <div class="faixa-aviso ${e.status === 'ativa' ? 'ok' : e.status === 'em_implantacao' ? 'atencao' : 'erro'}">${{ em_implantacao: 'Em implantação: só administradores da empresa entram, e a landing pública ainda não aparece.', ativa: 'Ativa: o ambiente está disponível para as pessoas da empresa.', suspensa: 'Suspensa: ninguém da empresa entra, e as sessões foram encerradas.', cancelada: 'Cancelada: o ambiente está encerrado. Os dados ficam guardados.' }[e.status]}</div>
    <div class="linha-botoes">${botoesStatus.map(([s, n, cls]) => `<button class="btn ${cls}" data-status="${s}">${n}</button>`).join('')}
      <a class="btn btn-linha" href="/api/plataforma/empresas/${encodeURIComponent(id)}/exportar" download>Exportar dados</a>
      ${e.status === 'cancelada' ? '<button class="btn btn-texto" id="excluir-empresa" style="color:var(--red-text)">Excluir definitivamente</button>' : ''}</div>
    <div class="secao-titulo"><h3>Plano</h3></div>
    <form id="f-plano" class="linha-botoes"><select class="entrada" id="s-plano" style="max-width:360px"><option value="">Sem plano</option>${C.planos.map(p => `<option value="${p.id}" ${p.id === e.plano?.id ? 'selected' : ''} ${p.status !== 'ativo' && p.id !== e.plano?.id ? 'disabled' : ''}>${esc(p.name)} · ${p.credits ? `${num(p.credits)} créditos` : 'créditos ilimitados'} · ${usd(p.price_usd)}</option>`).join('')}</select>
      <button class="btn btn-linha">Alterar plano</button></form>
    ${u.plano ? `<div class="indicadores"><div class="indicador"><span>Créditos usados no mês</span><b>${num(Math.round(u.plano.usados))}</b><small>${u.plano.ilimitado ? 'plano ilimitado' : `${u.plano.percentual}% de ${num(u.plano.creditos)}`}</small></div>
      <div class="indicador"><span>Pacote disponível</span><b>${num(Math.round(u.plano.pacoteDisponivel))}</b></div><div class="indicador"><span>Custo de IA no mês</span><b>${usd(u.custoUsd)}</b></div>
      <div class="indicador"><span>Pessoas ativas no mês</span><b>${num(u.pessoasAtivas)}</b><small>${num(u.pessoas)} cadastradas</small></div></div>
      <details><summary class="btn-texto" style="padding-left:0">Liberar pacote de créditos</summary>
        <form id="f-pacote" class="linha-botoes" style="margin-top:10px"><input class="entrada" id="p-creditos" type="number" min="1" value="10000" style="max-width:140px" aria-label="Créditos">
        <input class="entrada" id="p-validade" type="date" style="max-width:170px" aria-label="Validade"><input class="entrada" id="p-obs" placeholder="Observação" maxlength="300" style="max-width:260px" aria-label="Observação">
        <button class="btn btn-linha">Liberar</button></form></details>` : '<p class="dica">Sem plano vinculado: a empresa usa sem cota e vê o custo em dólar.</p>'}
    <div class="secao-titulo"><h3>Dados cadastrais</h3></div>
    <form id="f-dados" novalidate><div class="grade-2">
      <div class="campo"><label for="d-nome">Nome</label><input class="entrada" id="d-nome" value="${esc(e.name)}" maxlength="80"></div>
      <div class="campo"><label for="d-razao">Razão social</label><input class="entrada" id="d-razao" value="${esc(e.legal_name)}" maxlength="160"></div>
      <div class="campo"><label for="d-doc">Documento</label><input class="entrada" id="d-doc" value="${esc(e.document)}" maxlength="40"></div>
      <div class="campo"><label for="d-contato">Email de contato</label><input class="entrada" id="d-contato" type="email" value="${esc(e.contact_email)}"></div></div>
      <div class="campo"><label for="d-notas">Notas internas</label><textarea class="entrada" id="d-notas" rows="2" maxlength="1000">${esc(e.notes)}</textarea></div>
      <div class="linha-botoes"><button class="btn btn-linha">Salvar dados</button><span class="dica">ID interno: <code>${esc(e.id)}</code> · criada em ${data(e.created_at)}</span></div></form>
    <div class="secao-titulo"><h3>Ambiente</h3></div>
    <div class="indicadores"><div class="indicador"><span>Endereço</span><b style="font-size:14px"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url.replace(/^https?:\/\//, ''))}</a></b></div>
      <div class="indicador"><span>Banco</span><b style="font-size:14px">${esc(a.banco)}</b><small>${a.tamanhoMb} MB</small></div>
      <div class="indicador"><span>IA</span><b style="font-size:14px">${a.ia ? 'Ligada' : 'Desligada'}</b></div><div class="indicador"><span>Email próprio</span><b style="font-size:14px">${a.smtp ? 'Configurado' : 'Usa o da plataforma'}</b></div>
      <div class="indicador"><span>Conteúdo</span><b style="font-size:14px">${num(u.quickWins)} quick wins</b><small>${num(u.documentos)} documentos, ${num(u.conversas)} conversas no mês</small></div></div>`;
  for (const b of document.querySelectorAll('[data-status]')) b.onclick = async () => {
    const s = b.dataset.status;
    if ((s === 'suspensa' || s === 'cancelada') && !confirm(`${s === 'suspensa' ? 'Suspender' : 'Cancelar'} o ambiente? As pessoas da empresa perdem o acesso na hora.`)) return;
    try { await api(`/api/plataforma/empresas/${id}/status`, { metodo: 'POST', corpo: { status: s } }); toast('Status alterado.'); vistaEmpresa(id, 'resumo'); } catch (x) { falhar(x); }
  };
  $('excluir-empresa')?.addEventListener('click', async () => {
    const conf = prompt(`A exclusão apaga o ambiente e o banco da empresa. Uma cópia fica guardada no servidor.\n\nPara confirmar, digite o identificador: ${e.slug}`);
    if (conf === null) return;
    try { await api(`/api/plataforma/empresas/${id}/excluir`, { metodo: 'POST', corpo: { confirmacao: conf } }); toast('Empresa excluída. A cópia do banco ficou guardada em dados/excluidas.'); location.hash = '#/empresas'; } catch (x) { falhar(x); }
  });
  $('f-plano').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}/plano`, { metodo: 'POST', corpo: { plan_id: $('s-plano').value || null } }); toast('Plano alterado. Vale a partir de agora.'); vistaEmpresa(id, 'resumo'); } catch (x) { falhar(x); } };
  if ($('f-pacote')) $('f-pacote').onsubmit = async ev => { ev.preventDefault(); if (!confirm(`Liberar ${num($('p-creditos').value)} créditos? Os admins da empresa recebem um email.`)) return; try { await api(`/api/plataforma/empresas/${id}/pacotes`, { metodo: 'POST', corpo: { creditos: Number($('p-creditos').value), validade: $('p-validade').value || null, observacao: $('p-obs').value } }); toast('Pacote liberado.'); vistaEmpresa(id, 'resumo'); } catch (x) { falhar(x); } };
  $('f-dados').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}`, { metodo: 'PUT', corpo: { name: $('d-nome').value, legal_name: $('d-razao').value, document: $('d-doc').value, contact_email: $('d-contato').value, notes: $('d-notas').value } }); toast('Dados salvos.'); } catch (x) { falhar(x); } };
}

async function abaUsuarios(d, id) {
  const roles = d.roles;
  const opcoes = sel => roles.map(r => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}${r.system ? '' : ' (da empresa)'}</option>`).join('');
  $('aba').innerHTML = `<p class="lead">Pessoas com acesso a este ambiente. Um mesmo usuário pode estar em várias empresas, com roles diferentes.</p>
    <form id="f-usuario" class="linha-botoes" style="margin-bottom:16px"><input class="entrada" id="u-email" type="email" placeholder="email@empresa.com" style="max-width:260px" aria-label="Email">
      <input class="entrada" id="u-nome" placeholder="Nome" style="max-width:200px" aria-label="Nome"><select class="entrada" id="u-role" style="max-width:220px" aria-label="Role">${opcoes('role_company_admin')}</select>
      <button class="btn btn-verde">Adicionar e convidar</button></form>
    ${tabela(['Pessoa', 'Role', 'Status', ''], d.usuarios.map(u => `<tr><td data-r="Pessoa"><b>${esc(u.name || u.email)}</b><br><span class="dica">${esc(u.email)}</span></td>
      <td data-r="Role"><select class="entrada" data-role="${u.id}" aria-label="Role de ${esc(u.email)}">${opcoes(u.role_id)}</select></td>
      <td data-r="Status"><select class="entrada" data-st="${u.id}" aria-label="Status de ${esc(u.email)}">${['convidado', 'ativo', 'inativo'].map(s => `<option ${s === u.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn-texto" data-rem="${u.id}">Remover</button></td></tr>`), 'Nenhum usuário. Adicione o administrador da empresa.')}`;
  $('f-usuario').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}/usuarios`, { metodo: 'POST', corpo: { email: $('u-email').value, name: $('u-nome').value, role_id: $('u-role').value } }); toast('Usuário adicionado e convidado.'); vistaEmpresa(id, 'usuarios'); } catch (x) { falhar(x); } };
  const mudar = async (uid, corpo) => { try { await api(`/api/plataforma/empresas/${id}/usuarios/${uid}`, { metodo: 'PUT', corpo }); toast('Alterado.'); } catch (x) { falhar(x); vistaEmpresa(id, 'usuarios'); } };
  for (const s of document.querySelectorAll('[data-role]')) s.onchange = () => mudar(s.dataset.role, { role_id: s.value });
  for (const s of document.querySelectorAll('[data-st]')) s.onchange = () => mudar(s.dataset.st, { status: s.value });
  for (const b of document.querySelectorAll('[data-rem]')) b.onclick = async () => { if (!confirm('Remover esta pessoa da empresa? O histórico dela continua no ambiente.')) return; try { await api(`/api/plataforma/empresas/${id}/usuarios/${b.dataset.rem}`, { metodo: 'DELETE' }); toast('Removido.'); vistaEmpresa(id, 'usuarios'); } catch (x) { falhar(x); } };
}

async function abaMarca(d, id) {
  $('aba').innerHTML = `<p class="lead">Identidade visual do ambiente: login, página inicial e app. Marque "bloquear" para a empresa não poder alterar o item.</p>${renderMarca(d.marca, { modo: 'plataforma' })}`;
  const ler = ligarMarca(d.marca);
  $('form-marca').onsubmit = async ev => {
    ev.preventDefault();
    try {
      const { corpo, bloqueados } = await ler();
      await api(`/api/plataforma/empresas/${id}/marca`, { metodo: 'PUT', corpo });
      await api(`/api/plataforma/empresas/${id}/concessoes`, { metodo: 'PUT', corpo: { locked: bloqueados } });
      toast('Identidade visual salva.'); vistaEmpresa(id, 'marca');
    } catch (x) { mostrarErro('mk-erro', x); }
  };
}

async function abaLanding(d, id) {
  $('aba').innerHTML = renderLanding(d.landing, { urlPublica: d.empresa.url });
  const ler = ligarLanding(d.landing);
  const salvar = async status => { try { await api(`/api/plataforma/empresas/${id}/landing`, { metodo: 'PUT', corpo: await ler(status) }); toast(status === 'publicada' ? 'Landing page publicada: as seções já aparecem na página.' : status === 'rascunho' ? 'Landing page voltou para rascunho: a página pública mostra só a versão simples.' : d.landing?.status === 'publicada' ? 'Landing page salva e já no ar.' : 'Salvo como rascunho. Para aparecer na página, clique em Publicar agora.', 7000); vistaEmpresa(id, 'landing'); } catch (x) { mostrarErro('ld-erro', x); } };
  $('form-landing').onsubmit = ev => { ev.preventDefault(); salvar(); };
  for (const b of document.querySelectorAll('[data-acao="publicar"]')) b.addEventListener('click', () => salvar('publicada'));
  document.querySelector('[data-acao="despublicar"]')?.addEventListener('click', () => salvar('rascunho'));
}

async function abaUrl(d, id) {
  const e = d.empresa;
  const u = { slug: e.slug, custom_domain: e.custom_domain, url: e.url, dominio: { status: e.domain_status, mensagem: e.domain_message, verificadoEm: e.domain_checked_at }, dns: d.dns };
  $('aba').innerHTML = renderUrl(u, { plataforma: true });
  ligarUrl(u);
  $('verificar-dominio')?.addEventListener('click', ev => ocupado(ev.currentTarget, async () => { try { const r = await api(`/api/plataforma/empresas/${id}/dominio/verificar`, { metodo: 'POST' }); toast(r.status === 'verificado' ? 'Domínio verificado.' : r.mensagem, r.status === 'verificado' ? undefined : 7000); vistaEmpresa(id, 'url'); } catch (x) { falhar(x); } }));
  $('f-url').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}/url`, { metodo: 'PUT', corpo: { slug: $('url-slug').value, custom_domain: $('url-dom').value } }); toast('Endereço salvo.'); vistaEmpresa(id, 'url'); } catch (x) { mostrarErro('url-erro', x); } };
}

export function statusDominio(dominio, status, mensagem, em) {
  if (!dominio) return '';
  const ok = status === 'verificado';
  return `<div class="faixa-aviso ${ok ? 'ok' : 'atencao'}"><b>${esc(dominio)}</b>: ${ok ? 'verificado' : 'aguardando o DNS'}${em ? ` (conferido em ${dataHora(em)})` : ''}. ${esc(mensagem || '')}
    <button type="button" class="btn-texto btn-pequeno" id="verificar-dominio">Verificar agora</button></div>`;
}

async function abaPermissoes(d, id) {
  const g = d.concessoes, p = d.podeEditar, b = d.marca.locked || [];
  $('aba').innerHTML = `<p class="lead">O que o administrador da empresa pode personalizar. Vale o que estiver liberado aqui e incluído no plano; o operador da plataforma continua podendo alterar tudo.</p>
    <form id="f-conc">
      <h3>Itens liberados para a empresa</h3>
      <div class="checagens">${Object.entries(C.catalogo.concessoes).map(([k, n]) => `<label><input type="checkbox" data-g="${k}" ${g[k] ? 'checked' : ''}> <span>${esc(n)}<small>${p[k] ? (k === 'domain' ? 'Liberado (vale em todos os planos)' : 'Liberado e incluído no plano') : g[k] ? 'Liberado, mas fora do plano atual' : 'Não liberado'}</small></span></label>`).join('')}</div>
      <h3>Itens da marca bloqueados</h3>
      <div class="checagens">${Object.entries(ROTULOS_MARCA).map(([k, n]) => `<label><input type="checkbox" data-l="${k}" ${b.includes(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
      <div class="linha-botoes"><button class="btn btn-verde">Salvar permissões</button></div></form>`;
  $('f-conc').onsubmit = async ev => {
    ev.preventDefault();
    const grants = Object.fromEntries([...document.querySelectorAll('[data-g]')].map(x => [x.dataset.g, x.checked]));
    const locked = [...document.querySelectorAll('[data-l]')].filter(x => x.checked).map(x => x.dataset.l);
    try { await api(`/api/plataforma/empresas/${id}/concessoes`, { metodo: 'PUT', corpo: { grants, locked } }); toast('Permissões salvas.'); vistaEmpresa(id, 'permissoes'); } catch (x) { falhar(x); }
  };
}

async function abaAuditoriaEmpresa(d, id) {
  const a = await api(`/api/plataforma/auditoria?empresa=${encodeURIComponent(id)}`);
  $('aba').innerHTML = listaAuditoria(a.itens, false);
}

// ---------------------------------------------------------------- Usuários
async function vistaUsuarios() {
  carregando('Usuários');
  const [{ usuarios }, cfg] = await Promise.all([api('/api/plataforma/usuarios'), api('/api/plataforma/configuracoes')]);
  tela('Usuários', `<p class="lead">Todas as pessoas da plataforma, com as empresas de que fazem parte. Bloquear um usuário encerra o acesso dele em todas as empresas.</p>
    <div class="secao-titulo" style="margin-top:0"><h3>Administradores da plataforma</h3></div>
    <form id="f-admin" class="linha-botoes" style="margin-bottom:10px"><input class="entrada" id="a-email" type="email" placeholder="email" style="max-width:280px" aria-label="Email"><button class="btn btn-linha">Adicionar administrador</button></form>
    ${tabela(['Administrador', ''], cfg.admins.map(a => `<tr><td data-r="Administrador">${esc(a.email)}</td><td>${a.id === C.eu.usuario.id ? '<span class="dica">você</span>' : `<button class="btn-texto" data-rmadm="${a.id}">Remover</button>`}</td></tr>`), '')}
    <div class="secao-titulo"><h3>Todas as pessoas</h3></div>
    ${tabela(['Pessoa', 'Empresas', 'Status', ''], usuarios.map(u => `<tr><td data-r="Pessoa"><b>${esc(u.name || u.email)}</b><br><span class="dica">${esc(u.email)}</span>${u.adminPlataforma ? ' <span class="selo-escopo" style="margin:0 0 0 6px">Plataforma</span>' : ''}</td>
      <td data-r="Empresas">${u.empresas.map(e => `<a href="#/empresas/${e.id}/usuarios">${esc(e.name)}</a> <span class="dica">${esc(e.role)} · ${esc(e.status)}</span>`).join('<br>') || '<span class="dica">nenhuma</span>'}</td>
      <td data-r="Status">${u.status === 'ativo' ? '<span class="selo selo-verde">Ativo</span>' : '<span class="selo selo-vermelho">Bloqueado</span>'}</td>
      <td>${u.id === C.eu.usuario.id ? '' : `<button class="btn-texto" data-bloq="${u.id}" data-st="${u.status === 'ativo' ? 'bloqueado' : 'ativo'}">${u.status === 'ativo' ? 'Bloquear' : 'Desbloquear'}</button>`}</td></tr>`), 'Nenhum usuário.')}`);
  $('f-admin').onsubmit = async ev => { ev.preventDefault(); try { await api('/api/plataforma/admins', { metodo: 'POST', corpo: { email: $('a-email').value } }); toast('Administrador adicionado.'); vistaUsuarios(); } catch (x) { falhar(x); } };
  for (const b of document.querySelectorAll('[data-rmadm]')) b.onclick = async () => { if (!confirm('Tirar o acesso ao console?')) return; try { await api(`/api/plataforma/admins/${b.dataset.rmadm}`, { metodo: 'DELETE' }); vistaUsuarios(); } catch (x) { falhar(x); } };
  for (const b of document.querySelectorAll('[data-bloq]')) b.onclick = async () => { if (b.dataset.st === 'bloqueado' && !confirm('Bloquear este usuário em todas as empresas?')) return; try { await api(`/api/plataforma/usuarios/${b.dataset.bloq}`, { metodo: 'PUT', corpo: { status: b.dataset.st } }); vistaUsuarios(); } catch (x) { falhar(x); } };
}

// ---------------------------------------------------------------- Planos
async function vistaPlanos() {
  carregando('Planos');
  C.planos = (await api('/api/plataforma/planos')).planos;
  tela('Planos', `<p class="lead">Créditos, limites e recursos de cada plano. Alterar um plano vale na hora para todas as empresas vinculadas.</p>
    ${tabela(['Plano', 'Status', '#Créditos', '#Reserva', '#Preço', '#Empresas'], C.planos.map(p => `<tr><td data-r="Plano"><a href="#/planos/${p.id}"><b>${esc(p.name)}</b></a><br><span class="dica">${esc(p.description)}</span></td>
      <td data-r="Status">${p.status === 'ativo' ? '<span class="selo selo-verde">Ativo</span>' : '<span class="selo selo-cinza">Inativo</span>'}</td>
      <td class="num" data-r="Créditos">${p.credits ? num(p.credits) : 'Ilimitado'}</td><td class="num" data-r="Reserva">${num(p.reserve)}</td><td class="num" data-r="Preço">${usd(p.price_usd)}</td><td class="num" data-r="Empresas">${num(p.empresas)}</td></tr>`), 'Nenhum plano.')}`,
  '<a class="btn btn-verde btn-pequeno" href="#/planos/novo">Novo plano</a>');
}

async function vistaPlano(id) {
  if (!C.planos.length) C.planos = (await api('/api/plataforma/planos')).planos;
  const p = id === 'novo' ? { name: '', description: '', status: 'ativo', credits: 10000, reserve: 2000, price_usd: '', limits: { max_users: 0, messages_per_minute: 12, max_quick_wins: 0 }, features: Object.fromEntries(Object.keys(C.catalogo.recursos).map(k => [k, true])), rules: { reserve_fast_only: true, pack_credits: 10000, pack_price_usd: 250 }, settings: {} } : C.planos.find(x => x.id === id);
  if (!p) return tela('Plano', '<p>Plano não encontrado.</p>', '', '#/planos');
  tela(id === 'novo' ? 'Novo plano' : p.name, `<form id="f-plano" novalidate>
    <div class="grade-2"><div class="campo"><label for="pl-nome">Nome</label><input class="entrada" id="pl-nome" value="${esc(p.name)}" maxlength="60"></div>
      <div class="campo"><label for="pl-status">Status</label><select class="entrada" id="pl-status"><option value="ativo" ${p.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${p.status !== 'ativo' ? 'selected' : ''}>Inativo (não aparece para novas empresas)</option></select></div></div>
    <div class="campo"><label for="pl-desc">Descrição</label><input class="entrada" id="pl-desc" value="${esc(p.description)}" maxlength="300"></div>
    <div class="grade-2"><div class="campo"><label for="pl-cred">Créditos por mês</label><input class="entrada" id="pl-cred" type="number" min="0" value="${p.credits}"><span class="ajuda">0 = ilimitado (sem teto de créditos, sem reserva e sem avisos de consumo).</span></div>
      <div class="campo"><label for="pl-res">Reserva de continuidade</label><input class="entrada" id="pl-res" type="number" min="0" value="${p.reserve}"><span class="ajuda">Usada depois dos créditos, só na classe Rápido.</span></div>
      <div class="campo"><label for="pl-preco">Preço mensal (US$)</label><input class="entrada" id="pl-preco" type="number" min="0" step="0.01" value="${p.price_usd ?? ''}"><span class="ajuda">Só o operador vê. A empresa nunca vê valores em dólar.</span></div></div>
    <h3>Limites</h3><div class="grade-2">${Object.entries(C.catalogo.limites).map(([k, n]) => `<div class="campo"><label for="pl-l-${k}">${esc(n)}</label><input class="entrada" id="pl-l-${k}" type="number" min="0" value="${p.limits[k] ?? 0}"></div>`).join('')}</div>
    <h3>Recursos</h3><div class="checagens">${Object.entries(C.catalogo.recursos).map(([k, n]) => `<label><input type="checkbox" data-f="${k}" ${p.features[k] ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
    <h3>Regras de consumo</h3><div class="grade-2">
      <div class="campo"><label for="pl-pc">Créditos do pacote adicional</label><input class="entrada" id="pl-pc" type="number" min="0" value="${p.rules.pack_credits ?? 0}"></div>
      <div class="campo"><label for="pl-pp">Preço do pacote (US$)</label><input class="entrada" id="pl-pp" type="number" min="0" step="0.01" value="${p.rules.pack_price_usd ?? 0}"></div></div>
    <label class="dica" style="display:flex;gap:8px;margin-bottom:12px"><input type="checkbox" id="pl-rr" ${p.rules.reserve_fast_only !== false ? 'checked' : ''}> Na reserva, só a classe Rápido</label>
    <div class="campo"><label for="pl-set">Configurações específicas (JSON)</label><textarea class="entrada" id="pl-set" rows="3" style="font-family:monospace">${esc(JSON.stringify(p.settings || {}, null, 2))}</textarea></div>
    <p class="msg-erro oculto" id="pl-erro" role="alert"></p><div class="linha-botoes"><button class="btn btn-verde">Salvar plano</button></div></form>`, '', '#/planos');
  $('f-plano').onsubmit = async ev => {
    ev.preventDefault();
    try {
      let settings = {};
      try { settings = JSON.parse($('pl-set').value || '{}'); } catch { throw new Error('As configurações específicas precisam ser um JSON válido.'); }
      const corpo = { name: $('pl-nome').value, status: $('pl-status').value, description: $('pl-desc').value, credits: Number($('pl-cred').value), reserve: Number($('pl-res').value), price_usd: $('pl-preco').value,
        limits: Object.fromEntries(Object.keys(C.catalogo.limites).map(k => [k, Number($(`pl-l-${k}`).value)])), features: Object.fromEntries([...document.querySelectorAll('[data-f]')].map(x => [x.dataset.f, x.checked])),
        rules: { reserve_fast_only: $('pl-rr').checked, pack_credits: Number($('pl-pc').value), pack_price_usd: Number($('pl-pp').value) }, settings };
      await api(id === 'novo' ? '/api/plataforma/planos' : `/api/plataforma/planos/${id}`, { metodo: id === 'novo' ? 'POST' : 'PUT', corpo });
      C.planos = []; toast('Plano salvo.'); location.hash = '#/planos';
    } catch (x) { mostrarErro('pl-erro', x); }
  };
}

// ---------------------------------------------------------------- Ambientes, uso, auditoria, configurações
async function vistaAmbientes() {
  carregando('Ambientes');
  const { ambientes } = await api('/api/plataforma/ambientes');
  tela('Ambientes', `<p class="lead">Um banco por empresa, na mesma instalação. Nenhuma empresa acessa o banco de outra.</p>
    ${tabela(['Empresa', 'Status', 'Endereço', 'Banco', 'IA', 'Último uso'], ambientes.map(a => `<tr><td data-r="Empresa"><a href="#/empresas/${a.id}">${esc(a.name)}</a></td><td data-r="Status">${selo(a.status, a.statusNome)}</td>
      <td data-r="Endereço"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url.replace(/^https?:\/\//, ''))}</a></td><td data-r="Banco">${esc(a.banco)} <span class="dica">${a.tamanhoMb} MB</span></td>
      <td data-r="IA">${a.ia ? 'Ligada' : 'Desligada'}</td><td data-r="Último uso">${dataHora(a.ultimoUso)}</td></tr>`), 'Nenhum ambiente.')}`);
}

// ---------------------------------------------------------------- Uso e consumo de IA
// Conta no OpenRouter (saldo, limite da chave, uso por período), consumo diário da plataforma e de
// cada empresa, com projeção do mês e alertas. Uma cor por gráfico (série única); estados com texto.
const usd4 = v => (v === null || v === undefined ? '–' : `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: v > 0 && v < 1 ? 3 : 2, maximumFractionDigits: v > 0 && v < 1 ? 3 : 2 })}`);
const diaCurto = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const topoBonito = m => { if (m <= 0) return 1; const e = 10 ** Math.floor(Math.log10(m)), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
const ESTADO = {
  esgotado: ['tag-vermelha', 'Créditos esgotados'], reserva: ['tag-vermelha', 'Na reserva'], critico: ['tag-ambar', 'Acima de 90%'],
  atencao: ['tag-ambar', 'Pode estourar no mês'],
};
const estadoTag = e => (e.alerta ? `<span class="tag ${ESTADO[e.alerta][0]}"><i></i>${ESTADO[e.alerta][1]}</span>` : e.ilimitado ? '<span class="tag">Ilimitado</span>' : e.plano ? '<span class="tag tag-verde"><i></i>No ritmo</span>' : '<span class="tag">Sem plano</span>');

// Barras diárias: marcas finas, topo arredondado, 2px entre barras, eixo recessivo, dica ao passar.
function grafBarras(serie, rotulo) {
  const topo = topoBonito(Math.max(...serie.map(x => x.v), 0));
  const meio = Math.floor(serie.length / 2);
  return `<figure class="gb" aria-label="${esc(rotulo)}">
    <div class="gb-corpo"><div class="gb-eixo" aria-hidden="true"><span>${usd4(topo)}</span><span>${usd4(topo / 2)}</span><span>US$ 0</span></div>
      <div class="gb-area"><div class="gb-grade" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="gb-barras">${serie.map((x, i) => `<button type="button" class="gb-col${i === serie.length - 1 ? ' hoje' : ''}" data-tip="${esc(diaCurto(x.d))}${i === serie.length - 1 ? ' (hoje)' : ''} · ${esc(usd4(x.v))}${x.extra ? ` · ${esc(x.extra)}` : ''}" aria-label="${esc(diaCurto(x.d))}: ${esc(usd4(x.v))}"><i style="height:${x.v > 0 ? Math.max(2, x.v / topo * 100) : 0}%"></i></button>`).join('')}</div></div></div>
    <div class="gb-x" aria-hidden="true"><span>${diaCurto(serie[0].d)}</span><span>${diaCurto(serie[meio].d)}</span><span>hoje</span></div>
    <details class="gb-tabela"><summary>Ver em tabela</summary>${tabela(['Dia', '#Custo'], serie.slice().reverse().map(x => `<tr><td data-r="Dia">${esc(diaCurto(x.d))}</td><td class="num" data-r="Custo">${usd4(x.v)}</td></tr>`), '')}</details></figure>`;
}
// Linha de tendência (30 dias) para a tabela: 2px, ponto no último dia.
function sparkline(v) {
  const w = 96, h = 26, max = Math.max(...v, 0);
  if (!max) return '<span class="dica">sem uso</span>';
  const pts = v.map((y, i) => `${(i / (v.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - y / max * (h - 6)).toFixed(1)}`);
  const [lx, ly] = pts.at(-1).split(',');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--forest)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx}" cy="${ly}" r="3" fill="var(--forest)" stroke="var(--paper)" stroke-width="1.5"/></svg>`;
}
// Barras horizontais (por modelo, por quick win): uma cor, rótulo e valor em texto.
const barrasH = (lista, chave) => { const max = Math.max(...lista.map(x => x.custo), 0) || 1; return lista.length ? `<div class="bh">${lista.map(x => `<div class="bh-linha"><span class="bh-nome" title="${esc(x[chave])}">${esc(chave === 'modelo' ? String(x[chave]).split('/').pop() : x[chave])}${chave === 'modelo' && String(x[chave]).includes('/') ? ` <small>${esc(String(x[chave]).split('/')[0])}</small>` : ''}</span><span class="bh-trilho"><i style="width:${Math.max(1, x.custo / max * 100)}%"></i></span><span class="bh-valor">${usd4(x.custo)}<small>${num(x.respostas)} resp.</small></span></div>`).join('')}</div>` : '<p class="dica">Sem uso no mês.</p>'; };
const barraPlano = e => (e.ilimitado ? '<span class="dica">ilimitado</span>' : e.creditos ? `<span class="bp" title="${num(Math.round(e.usados))} de ${num(e.creditos)} créditos"><span class="bp-trilho"><i class="${e.percentual >= 90 ? 'alto' : e.percentual >= 75 ? 'medio' : ''}" style="width:${Math.min(100, e.percentual)}%"></i></span><b>${e.percentual}%</b></span>` : '<span class="dica">–</span>');

function ligarDicas(raiz) {
  let dica = document.getElementById('gb-dica');
  if (!dica) { dica = document.createElement('div'); dica.id = 'gb-dica'; dica.className = 'gb-dica'; dica.setAttribute('role', 'status'); document.body.append(dica); }
  const mostrar = el => { const r = el.getBoundingClientRect(); dica.textContent = el.dataset.tip; dica.style.display = 'block'; const w = dica.offsetWidth; dica.style.left = `${Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`; dica.style.top = `${r.top + scrollY - dica.offsetHeight - 8}px`; };
  raiz.addEventListener('mouseover', ev => { const c = ev.target.closest('.gb-col'); if (c) mostrar(c); });
  raiz.addEventListener('focusin', ev => { const c = ev.target.closest('.gb-col'); if (c) mostrar(c); });
  raiz.addEventListener('mouseout', ev => { if (ev.target.closest('.gb-col')) dica.style.display = 'none'; });
  raiz.addEventListener('focusout', () => { dica.style.display = 'none'; });
}

// Estado da chave: validade externa (OpenRouter) e troca preventiva (política da plataforma), sempre separadas.
const TAG_VALIDADE = { ok: 'tag-verde', info: '', atencao: 'tag-ambar', critico: 'tag-vermelha', erro: 'tag-vermelha' };
// A API manda instantes UTC e durações; aqui só se formata, no fuso da plataforma (v.fuso).
const noFuso = (iso, fuso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' }) : '–');
function duracao(ms) {
  const a = Math.abs(ms), h = 36e5, d = 24 * h;
  const t = a >= 2 * d ? `${Math.floor(a / d)} dias` : `${Math.max(1, Math.floor(a / h))} ${Math.floor(a / h) === 1 ? 'hora' : 'horas'}`;
  return ms > 0 ? `em ${t}` : `há ${t}`;
}
function validadeHtml(v) {
  if (!v || v.nivel === 'sem_chave') return '';
  const p = v.provedor, t = v.troca, f = v.fuso;
  const vencProvedor = p.codigo === 'recusada' ? '<b>Recusada pelo OpenRouter</b>' + (p.recusadaEm ? ` desde ${noFuso(p.recusadaEm, f)}` : '')
    : p.expiraEm ? `${noFuso(p.expiraEm, f)} (${duracao(p.restanteMs)})${p.fonte === 'informada' ? ' · data informada no console' : ' · informado pelo OpenRouter'}`
      : p.semData === 'nao_definido' ? 'não definido no OpenRouter (sem validade conhecida)' : 'não informado (o OpenRouter ainda não respondeu)';
  const podeInformar = p.fonte !== 'openrouter';
  return `<div class="or-validade"><p class="or-validade-estado"><span class="tag ${TAG_VALIDADE[v.nivel] || ''}"><i></i>${esc(v.rotulo)}</span> ${esc(v.texto)}</p>
    <dl class="or-validade-lista">
      <dt>Origem</dt><dd>${v.origem === 'console' ? 'informada no console' : 'variável OPENROUTER_API_KEY'}</dd>
      <dt>Início da contagem</dt><dd>${noFuso(t.inicio, f)} (${t.emUsoDias} ${t.emUsoDias === 1 ? 'dia' : 'dias'} em uso)</dd>
      <dt>Vencimento no provedor</dt><dd>${vencProvedor}</dd>
      <dt>Última validação</dt><dd>${noFuso(p.validadoEm, f)}</dd>
      <dt>Próxima troca preventiva</dt><dd>${noFuso(t.proximaTroca, f)} (${duracao(t.restanteMs)}) · política da plataforma: início + ${t.rotacaoDias} × 24 h</dd>
      <dt>Fuso dos horários</dt><dd>${esc(f)} (o cálculo é em UTC)</dd>
    </dl>
    <details${['atencao', 'critico', 'erro'].includes(v.nivel) ? ' open' : ''}><summary class="dica">Troca preventiva e vencimento informado</summary>
      <form class="or-validade-form" id="f-validade" novalidate>
        <div class="campo"><label for="val-rotacao">Trocar a chave a cada</label>
          <span class="or-alerta-campo"><input class="entrada" id="val-rotacao" type="number" min="7" max="730" step="1" value="${esc(t.rotacaoDias)}" inputmode="numeric"><span>dias</span></span>
          <span class="dica">De 7 a 730. Mudar o prazo não reinicia a contagem: vale a partir do início (${noFuso(t.inicio, f)}).</span></div>
        ${podeInformar ? `<div class="campo"><label for="val-expira">Vencimento real da chave (opcional)</label>
          <input class="entrada" id="val-expira" type="date" value="${esc(p.fonte === 'informada' ? p.dataInformada || '' : '')}" aria-describedby="val-expira-dica">
          <span class="dica" id="val-expira-dica">Só se você souber a data por outra fonte. Vale até 23:59 desse dia (${esc(f)}). Vale só para esta chave; se o OpenRouter informar a dele, a do OpenRouter prevalece.</span></div>` : ''}
        <button class="btn btn-linha btn-pequeno">Salvar</button>
      </form></details>
    <p class="dica">Os admins da plataforma recebem um email por estágio: faltando 30 dias, 7 dias, 48 horas e 24 horas, quando vence ou a troca atrasa, e quando a chave é recusada.</p></div>`;
}
async function vistaUso(forcar = false) {
  carregando('Uso');
  const u = await api(`/api/plataforma/consumo${forcar ? '?forcar=1' : ''}`);
  const c = u.conta, k = c.chave, pl = u.plataforma;
  const saldo = c.saldo ?? k?.restante ?? null;
  const filtro = sessionStorage.getItem('uso.filtro') || 'todas';
  const comAlerta = u.empresas.filter(e => e.alerta).length;
  const contaHtml = !c.disponivel ? `<div class="faixa-aviso atencao"><b>Conta do OpenRouter indisponível.</b> ${esc(c.motivo || '')}</div>` : `
    <div class="or-grade">
      <div class="or-card destaque${u.alerta.abaixo ? ' baixo' : ''}"><span class="or-rotulo">Saldo disponível no OpenRouter</span>
        <b class="or-numero">${usd(saldo)}</b>
        <span class="or-sub">${u.alerta.abaixo ? `<span class="tag tag-vermelha"><i></i>Abaixo do alerta de ${usd(u.alerta.limiarUsd)}</span>` : `<span class="tag tag-verde"><i></i>Acima do alerta de ${usd(u.alerta.limiarUsd)}</span>`}</span>
        <span class="or-sub">${u.alerta.diasRestantes !== null ? `No ritmo dos últimos 7 dias (${usd4(u.media7)} por dia), dura cerca de <b>${num(u.alerta.diasRestantes)} ${u.alerta.diasRestantes === 1 ? 'dia' : 'dias'}</b>.` : 'Sem consumo nos últimos 7 dias para estimar a duração.'}</span>
        ${c.saldo === null && c.creditosIndisponivel ? `<span class="or-sub dica">${esc(c.creditosIndisponivel)} ${k?.restante !== null && k?.restante !== undefined ? 'Mostrando o que resta do limite da chave.' : ''}</span>` : ''}</div>
      <div class="or-card"><span class="or-rotulo">Créditos da conta</span>
        <dl class="or-lista"><dt>Comprados</dt><dd>${usd(c.comprado)}</dd><dt>Gastos</dt><dd>${usd(c.gasto)}</dd></dl>
        <a class="dica" href="https://openrouter.ai/settings/credits" target="_blank" rel="noopener">Comprar créditos no OpenRouter ↗</a></div>
      <div class="or-card"><span class="or-rotulo">Consumo cobrado pelo OpenRouter</span>
        <dl class="or-lista"><dt>Hoje</dt><dd>${usd4(k?.hoje)}</dd><dt>Nesta semana</dt><dd>${usd4(k?.semana)}</dd><dt>Neste mês</dt><dd>${usd4(k?.mes)}</dd></dl>
        <span class="dica">Dias em UTC, pela chave usada na plataforma.</span></div>
      <div class="or-card"><span class="or-rotulo">Chave da plataforma${k?.nome ? ` · ${esc(k.nome)}` : ''}</span>
        <dl class="or-lista"><dt>Limite</dt><dd>${k?.limite !== null && k?.limite !== undefined ? usd(k.limite) : 'sem limite'}</dd><dt>Resta do limite</dt><dd>${k?.restante !== null && k?.restante !== undefined ? usd(k.restante) : '–'}</dd><dt>Uso total</dt><dd>${usd(k?.usoTotal)}</dd></dl>
        ${k?.gratuita ? '<span class="tag tag-ambar">Chave gratuita: limites baixos</span>' : ''}</div>
    </div>`;
  const conc = c.disponivel && k?.mes !== null && k?.mes !== undefined ? (() => { const dif = k.mes - pl.custoMes, rel = pl.custoMes ? Math.abs(dif) / pl.custoMes : (k.mes > 0 ? 1 : 0);
    return `<p class="or-conc${rel > 0.1 && Math.abs(dif) > 0.5 ? ' dif' : ''}">Registrado pela GreenIA no mês: <b>${usd4(pl.custoMes)}</b> · Cobrado pelo OpenRouter no mês: <b>${usd4(k.mes)}</b>${rel > 0.1 && Math.abs(dif) > 0.5 ? ` · diferença de ${usd4(dif)}: pode haver uso da mesma chave fora da plataforma, ou respostas interrompidas antes de registrar o custo.` : ' · em linha.'}</p>`; })() : '';
  const empresas = u.empresas.filter(e => filtro !== 'alerta' || e.alerta).sort((a, b) => b.custoMes - a.custoMes);
  const kc = u.chaveConfig || {};
  const semChave = !kc.origem;
  const chaveHtml = `<section class="or-chave${semChave ? ' vazia' : ''}" aria-labelledby="or-chave-t">
    <div class="or-chave-topo"><span class="or-chave-icone">${ICONE.chave || ''}</span>
      <div class="or-chave-texto"><b id="or-chave-t">Chave do OpenRouter</b>
        <span>${semChave ? 'Nenhuma chave configurada: a IA das empresas está desligada (ou simulada) até você informar a chave.'
          : `<code>${esc(kc.mascara)}</code>${kc.nome ? ` · ${esc(kc.nome)}` : ''} · ${kc.origem === 'console' ? `salva no console${kc.em ? ` em ${dataHora(kc.em)}` : ''}${kc.por ? ` por ${esc(kc.por)}` : ''}${kc.variavelTambem ? ' (vale no lugar da variável OPENROUTER_API_KEY)' : ''}` : 'vinda da variável OPENROUTER_API_KEY do servidor'}`}</span></div>
      <div class="or-chave-acoes">${semChave ? '' : `<button type="button" class="btn btn-linha btn-pequeno" id="or-trocar">${kc.origem === 'console' ? 'Trocar chave' : 'Informar outra chave'}</button>`}${kc.origem === 'console' ? '<button type="button" class="btn-texto btn-pequeno" id="or-remover">Remover</button>' : ''}</div></div>
    ${semChave ? '' : validadeHtml(u.validadeChave)}
    <form class="or-chave-form${semChave ? '' : ' oculto'}" id="f-chave" novalidate autocomplete="off">
      <label for="or-chave-in">Cole a chave da API do OpenRouter</label>
      <div class="or-chave-linha"><input class="entrada" id="or-chave-in" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…" aria-describedby="or-chave-ajuda">
        <button type="button" class="btn-texto btn-pequeno" id="or-ver" aria-pressed="false">Mostrar</button><button class="btn btn-verde btn-pequeno" id="or-salvar">Testar e salvar</button></div>
      <p class="dica" id="or-chave-ajuda">A chave é testada no OpenRouter antes de salvar, fica guardada cifrada e vale na hora para todas as empresas, sem reiniciar. Depois de salva, só aparecem o início e os 4 últimos caracteres. <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">Criar uma chave no OpenRouter ↗</a></p>
      <p class="msg-erro oculto" id="or-chave-erro" role="alert"></p></form></section>`;
  C.eu.alertaChave = u.validadeChave && NIVEL_FAIXA[u.validadeChave.nivel] ? u.validadeChave : null;   // o topo acompanha a leitura mais recente
  tela('Uso', `<div class="uso-topo"><p class="lead">Consumo de IA da plataforma e de cada empresa. Valores em dólar, só para a operação.</p>
      <span class="dica">Conta atualizada ${c.atualizadoEm ? `às ${new Date(c.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '–'} <button class="btn-texto btn-pequeno" id="uso-atualizar">Atualizar agora</button></span></div>
    ${chaveHtml}${semChave ? '' : contaHtml}${conc}
    <form class="or-alerta" id="f-alerta"><label for="al-usd">Avisar os admins da plataforma por email quando o saldo ficar abaixo de</label>
      <span class="or-alerta-campo"><span>US$</span><input class="entrada" id="al-usd" type="number" min="0" step="1" value="${esc(u.alerta.limiarUsd)}"></span><button class="btn btn-linha btn-pequeno">Salvar alerta</button><span class="dica">No máximo um email por dia.</span></form>

    <div class="secao-titulo"><h3>Consumo da plataforma · últimos 30 dias</h3></div>
    <div class="indicadores"><div class="indicador"><span>Hoje</span><b>${usd4(pl.custoHoje)}</b></div><div class="indicador"><span>Últimos 7 dias</span><b>${usd4(pl.custo7)}</b></div>
      <div class="indicador"><span>Mês até hoje</span><b>${usd4(pl.custoMes)}</b></div><div class="indicador"><span>Projeção do mês</span><b>${usd4(pl.projecaoMes)}</b></div>
      <div class="indicador"><span>Receita do mês (planos)</span><b>${usd(pl.receitaMes)}</b></div><div class="indicador"><span>Margem estimada</span><b>${usd(pl.receitaMes - pl.custoMesComTaxa)}</b></div></div>
    ${grafBarras(u.serie.map(x => ({ d: x.dia, v: x.custo })), 'Custo diário de IA da plataforma nos últimos 30 dias')}
    <p class="dica">Custo real de cada resposta, registrado pela GreenIA. A margem desconta a taxa de 5,5% do OpenRouter na compra de créditos.</p>

    <div class="secao-titulo"><h3>Consumo por empresa</h3>
      <div class="pilulas" role="group" aria-label="Filtro"><button type="button" class="pilula" data-filtro="todas" aria-pressed="${filtro === 'todas'}">Todas<span>${u.empresas.length}</span></button><button type="button" class="pilula" data-filtro="alerta" aria-pressed="${filtro === 'alerta'}">Com alerta<span>${comAlerta}</span></button></div></div>
    ${tabela(['Empresa', 'Créditos do plano', '#Hoje', '#7 dias', '#Mês', 'Tendência 30 dias', '#Projeção', 'Situação', ''], empresas.map(e => `<tr class="uso-linha" data-empresa="${e.id}">
      <td data-r="Empresa"><a href="#/empresas/${e.id}"><b>${esc(e.name)}</b></a><br><span class="dica">${esc(e.plano || 'sem plano')} · ${num(e.pessoasAtivas)} ${e.pessoasAtivas === 1 ? 'pessoa ativa' : 'pessoas ativas'}</span></td>
      <td data-r="Créditos">${barraPlano(e)}</td>
      <td class="num" data-r="Hoje">${usd4(e.custoHoje)}</td><td class="num" data-r="7 dias">${usd4(e.custo7)}</td><td class="num" data-r="Mês"><b>${usd4(e.custoMes)}</b></td>
      <td data-r="Tendência">${sparkline(e.serie)}</td>
      <td class="num" data-r="Projeção">${e.projecao !== null ? `${num(e.projecao)}%` : '–'}</td>
      <td data-r="Situação">${estadoTag(e)}</td>
      <td data-r=""><button class="btn-texto btn-pequeno" data-detalhe="${e.id}" aria-expanded="false">Detalhes</button></td></tr>
      <tr class="oculto uso-detalhe" id="det-${e.id}"><td colspan="9"><div class="editor" id="det-corpo-${e.id}">${carregandoHtml()}</div></td></tr>`), filtro === 'alerta' ? 'Nenhuma empresa com alerta.' : 'Nenhuma empresa.')}
    <p class="dica">Projeção: quanto do plano estará usado no fim do mês, no ritmo do mês até hoje. Situação acima de 90%, na reserva ou esgotada pede atenção (a empresa também recebe os avisos do plano).</p>`);
  ligarDicas($('principal'));
  $('uso-atualizar').onclick = () => vistaUso(true);
  $('or-trocar')?.addEventListener('click', () => { $('f-chave').classList.toggle('oculto'); $('or-chave-in').focus(); });
  // Veio do aviso do topo ("Trocar a chave"): abre o formulário de troca direto.
  if (C.abrirTroca) { C.abrirTroca = false; $('f-chave').classList.remove('oculto'); $('or-chave-in').focus(); }
  if ($('f-validade')) $('f-validade').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = { rotacaoDias: $('val-rotacao').value === '' ? null : Number($('val-rotacao').value) };
    if ($('val-expira')) corpo.expiraEm = $('val-expira').value || null;
    try { await api('/api/plataforma/openrouter/chave/validade', { metodo: 'PUT', corpo }); toast('Vencimento e rotação salvos.'); vistaUso(); } catch (x) { falhar(x); }
  };
  $('or-ver').onclick = ev => { const i = $('or-chave-in'), ver = i.type === 'password'; i.type = ver ? 'text' : 'password'; ev.currentTarget.textContent = ver ? 'Ocultar' : 'Mostrar'; ev.currentTarget.setAttribute('aria-pressed', ver); };
  $('f-chave').onsubmit = async ev => {
    ev.preventDefault();
    const erroEl = $('or-chave-erro'); erroEl.classList.add('oculto');
    await ocupado($('or-salvar'), async () => {
      try {
        const r = await api('/api/plataforma/openrouter/chave', { metodo: 'PUT', corpo: { chave: $('or-chave-in').value } });
        $('or-chave-in').value = '';
        // O servidor só responde depois de validar a chave nova no OpenRouter e recalcular o estado.
        C.eu.alertaChave = r.validadeChave && NIVEL_FAIXA[r.validadeChave.nivel] ? r.validadeChave : null;
        toast('Chave testada e salva. A IA já usa a chave nova.'); vistaUso(true);
      }
      catch (x) { erroEl.textContent = x.message; erroEl.classList.remove('oculto'); $('or-chave-in').focus(); }
    });
  };
  $('or-remover')?.addEventListener('click', async () => {
    if (!confirm(kc.variavelTambem ? 'Remover a chave salva no console? A plataforma volta a usar a chave da variável OPENROUTER_API_KEY.' : 'Remover a chave salva no console? Sem outra chave, a IA das empresas para de responder.')) return;
    try { await api('/api/plataforma/openrouter/chave', { metodo: 'DELETE' }); toast('Chave removida.'); vistaUso(true); } catch (x) { falhar(x); }
  });
  $('f-alerta').onsubmit = async ev => { ev.preventDefault(); try { await api('/api/plataforma/consumo/alerta', { metodo: 'PUT', corpo: { limiarUsd: Number($('al-usd').value) } }); toast('Alerta salvo.'); vistaUso(); } catch (x) { falhar(x); } };
  $('principal').onclick = async ev => {
    const f = ev.target.closest('[data-filtro]');
    if (f) { try { sessionStorage.setItem('uso.filtro', f.dataset.filtro); } catch { /* sem armazenamento */ } vistaUso(); return; }
    const b = ev.target.closest('[data-detalhe]');
    if (!b) return;
    const id = b.dataset.detalhe, linha = $(`det-${id}`), aberto = !linha.classList.toggle('oculto');
    b.setAttribute('aria-expanded', aberto); b.textContent = aberto ? 'Fechar' : 'Detalhes';
    if (!aberto || linha.dataset.carregado) return;
    try {
      const d = await api(`/api/plataforma/empresas/${id}/consumo`);
      $(`det-corpo-${id}`).innerHTML = `<div class="uso-det">
        <div><span class="or-rotulo">${esc(d.empresa.name)} · custo por dia</span>${grafBarras(d.dias.map((dia, i) => ({ d: dia, v: d.empresa.serie[i] })), `Custo diário de ${d.empresa.name}`)}</div>
        <div><span class="or-rotulo">Por modelo · ${esc(d.mes)}</span>${barrasH(d.porModelo, 'modelo')}</div>
        <div><span class="or-rotulo">Por quick win · ${esc(d.mes)}</span>${barrasH(d.porQw, 'nome')}</div></div>`;
      linha.dataset.carregado = '1';
    } catch (x) { $(`det-corpo-${id}`).innerHTML = `<span class="msg-erro">${esc(x.message)}</span>`; }
  };
}

function listaAuditoria(itens, comEmpresa = true) {
  const resumo = x => { const a = x.after || {}; const chaves = Object.keys(a).slice(0, 4); return chaves.map(k => `${esc(k)}: ${esc(typeof a[k] === 'object' ? JSON.stringify(a[k]).slice(0, 60) : String(a[k]).slice(0, 60))}`).join(' · '); };
  return tabela(['Quando', ...(comEmpresa ? ['Empresa'] : []), 'Quem', 'Ação', 'Detalhes', 'Origem'], itens.map(x => `<tr><td data-r="Quando" style="white-space:nowrap">${dataHora(x.at)}</td>${comEmpresa ? `<td data-r="Empresa">${esc(x.empresa || 'plataforma')}</td>` : ''}
    <td data-r="Quem">${esc(x.usuario || 'sistema')}</td><td data-r="Ação"><code>${esc(x.action)}</code></td>
    <td data-r="Detalhes"><details><summary class="dica">${resumo(x) || 'ver'}</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify({ antes: x.before, depois: x.after }, null, 2))}</pre></details></td>
    <td data-r="Origem">${esc(x.origin?.painel || '')}<br><span class="dica">${esc(x.origin?.ip || '')}</span></td></tr>`), 'Nada registrado ainda.');
}

async function vistaAuditoria(pagina = 0) {
  carregando('Auditoria');
  const a = await api(`/api/plataforma/auditoria?pagina=${pagina}`);
  tela('Auditoria', `<p class="lead">Toda ação administrativa, com quem fez, em qual empresa, o antes, o depois e a origem.</p>${listaAuditoria(a.itens)}
    <div class="linha-botoes" style="margin-top:12px">${pagina > 0 ? '<button class="btn btn-linha btn-pequeno" id="ant">Anteriores</button>' : ''}${(pagina + 1) * 50 < a.total ? '<button class="btn btn-linha btn-pequeno" id="prox">Mais antigos</button>' : ''}<span class="dica">${num(a.total)} registros</span></div>`);
  $('ant')?.addEventListener('click', () => vistaAuditoria(pagina - 1));
  $('prox')?.addEventListener('click', () => vistaAuditoria(pagina + 1));
}

async function vistaConfiguracoes() {
  carregando('Configurações');
  const [c, hm] = await Promise.all([api('/api/plataforma/configuracoes'), api('/api/plataforma/homologacoes').catch(() => ({ homologacoes: [] }))]);
  const CLASSES = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
  tela('Configurações', `<form id="f-cfg" novalidate>
    <div class="grade-2"><div class="campo"><label for="cf-nome">Nome da plataforma</label><input class="entrada" id="cf-nome" value="${esc(c.nome)}" maxlength="60"></div>
      <div class="campo"><label for="cf-plano">Plano padrão para novas empresas</label><select class="entrada" id="cf-plano"><option value="">Nenhum</option>${C.planos.map(p => `<option value="${p.id}" ${p.id === c.plano_padrao ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="campo"><label for="cf-sub">Base de subdomínios (opcional)</label><input class="entrada" id="cf-sub" value="${esc(c.subdominio_base || '')}" placeholder="ia.suaplataforma.com.br">
      <span class="ajuda">Com DNS curinga (*.base), cada empresa ganha empresa.base. Sem isso, o endereço é ${esc(c.url_base || '')}/empresa.</span></div>
    <div class="campo"><label for="cf-res">Identificadores reservados (além dos do sistema)</label><input class="entrada" id="cf-res" value="${esc(c.slugs_reservados.join(', '))}"></div>
    <h3>Email da plataforma</h3><p class="dica">Usado para códigos de acesso e convites das empresas que não têm email próprio. ${c.smtp.configurado ? 'Configurado.' : 'Não configurado: os códigos aparecem só no log do servidor.'}</p>
    ${(c.smtp.falhas || []).length ? `<div class="faixa-aviso atencao"><b>Últimas falhas de envio</b> (o motivo vem do servidor de email; senhas e chaves ficam ocultas):
      <ul class="dica" style="margin:6px 0 0">${c.smtp.falhas.map(f => `<li>${esc(dataHora(f.em))} · ${esc(f.origem)} · <code>${esc(f.detalhe)}</code></li>`).join('')}</ul></div>` : ''}
    <div class="grade-2"><div class="campo"><label for="cf-smtp">URL do SMTP</label><input class="entrada" id="cf-smtp" placeholder="${c.smtp.configurado ? '(mantida; preencha para trocar)' : 'smtps://usuario:senha@smtp.exemplo.com:465'}"></div>
      <div class="campo"><label for="cf-rem">Remetente</label><input class="entrada" id="cf-rem" value="${esc(c.smtp.remetente || '')}" placeholder="GreenIA <nao-responda@exemplo.com>"></div></div>
    <div class="linha-botoes"><button class="btn btn-verde">Salvar configurações</button><button type="button" class="btn btn-linha" id="cf-teste">Enviar email de teste</button></div></form>
    <div class="secao-titulo"><h3>Modelos autorizados para dados sigilosos (valem para todas as empresas)</h3></div>
    <p class="dica">Com pelo menos um modelo aqui, conversas com informação sigilosa funcionam em todas as empresas sem que o admin de cada uma precise homologar nada. A empresa não consegue retirar esta autorização; ela pode homologar outros modelos além destes.</p>
    ${hm.homologacoes.length ? tabela(['Modelo', 'Classe', 'Fornecedor fixado', 'Autorizado por', ''], hm.homologacoes.map(h => `<tr><td data-r="Modelo"><b>${esc(h.nome)}</b><br><span class="dica">${esc(h.id)}</span></td><td data-r="Classe">${esc(CLASSES[h.perfil] || h.perfil)}</td><td data-r="Fornecedor">${esc(h.fornecedor)}</td><td data-r="Autorizado por">${esc(h.por || '')}<br><span class="dica">${esc(dataHora(h.em))} · ${esc(h.justificativa)}</span></td><td><button type="button" class="btn-texto btn-pequeno" data-hm-retirar="${esc(h.id)}">Retirar</button></td></tr>`), '')
      : '<div class="faixa-aviso atencao">Nenhum modelo autorizado pela plataforma. Em empresas cujo admin ainda não homologou um modelo, conversas sigilosas são bloqueadas com segurança (nada é enviado) e o admin é avisado.</div>'}
    <form id="f-hm" novalidate style="margin-top:12px">
      <div class="grade-2"><div class="campo"><label for="hm-id">Modelo no OpenRouter</label><input class="entrada" id="hm-id" placeholder="fornecedor/modelo"></div>
        <div class="campo"><label for="hm-nome">Nome para exibir</label><input class="entrada" id="hm-nome" maxlength="120"></div></div>
      <div class="grade-2"><div class="campo"><label for="hm-perfil">Classe</label><select class="entrada" id="hm-perfil">${Object.entries(CLASSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span class="ajuda">Use uma classe que todas as pessoas acessam (normalmente Rápido).</span></div>
        <div class="campo"><label for="hm-forn">Fornecedor fixado</label><input class="entrada" id="hm-forn" placeholder="Nome do fornecedor no OpenRouter"></div></div>
      <label class="opcoes"><span><input type="checkbox" id="hm-treino"> Conferi que o fornecedor não treina com os dados</span></label>
      <label class="opcoes"><span><input type="checkbox" id="hm-zdr"> Conferi que o fornecedor tem retenção zero (não guarda os dados)</span></label>
      <div class="campo"><label for="hm-just">Justificativa</label><textarea class="entrada" id="hm-just" rows="2"></textarea></div>
      <div class="linha-botoes"><button class="btn btn-verde">Autorizar para todas as empresas</button></div></form>
    ${c.leads.length ? `<div class="secao-titulo"><h3>Contatos da página de vendas</h3></div>${tabela(['Data', 'Empresa', 'Pessoa', 'Mensagem'], c.leads.map(l => `<tr><td data-r="Data">${data(l.em)}</td><td data-r="Empresa"><b>${esc(l.empresa)}</b><br><span class="dica">${esc(l.pessoas || '')}</span></td><td data-r="Pessoa">${esc(l.nome)}<br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td><td data-r="Mensagem">${esc(l.mensagem || '–')}</td></tr>`), '')}` : ''}`);
  $('f-cfg').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = { nome: $('cf-nome').value, plano_padrao: $('cf-plano').value || null, subdominio_base: $('cf-sub').value, slugs_reservados: $('cf-res').value, smtp: { remetente: $('cf-rem').value, ...($('cf-smtp').value ? { url: $('cf-smtp').value } : {}) } };
    try { await api('/api/plataforma/configuracoes', { metodo: 'PUT', corpo }); toast('Configurações salvas.'); vistaConfiguracoes(); } catch (x) { falhar(x); }
  };
  $('f-hm').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = { id: $('hm-id').value.trim(), nome: $('hm-nome').value.trim(), perfil: $('hm-perfil').value, fornecedor: $('hm-forn').value.trim(), semTreino: $('hm-treino').checked, retencaoZero: $('hm-zdr').checked, justificativa: $('hm-just').value };
    try { await api('/api/plataforma/homologacoes', { metodo: 'POST', corpo }); toast('Modelo autorizado em todas as empresas.'); vistaConfiguracoes(); } catch (x) { falhar(x); }
  };
  document.querySelectorAll('[data-hm-retirar]').forEach(b => { b.onclick = async () => {
    if (!confirm('Retirar a autorização em todas as empresas? Empresas sem outro modelo homologado passam a bloquear conversas sigilosas.')) return;
    try { await api(`/api/plataforma/homologacoes/${encodeURIComponent(b.dataset.hmRetirar)}`, { metodo: 'DELETE' }); toast('Autorização retirada.'); vistaConfiguracoes(); } catch (x) { falhar(x); }
  }; });
  $('cf-teste').onclick = async () => { try { const r = await api('/api/plataforma/smtp/teste', { metodo: 'POST' }); toast(`Email de teste enviado para ${r.para}.`); } catch (x) { falhar(x); } };
}

// ---------------------------------------------------------------- Rotas
async function rota() {
  const h = location.hash || '#/empresas';
  const fimTransicao = transicao();
  lateral();
  $('lateral').classList.remove('aberta');
  try {
    let m;
    if ((m = /^#\/empresas\/([\w-]+)(?:\/(\w+))?$/.exec(h))) await vistaEmpresa(m[1], m[2]);
    else if (h.startsWith('#/usuarios')) await vistaUsuarios();
    else if ((m = /^#\/planos\/([\w-]+)$/.exec(h))) await vistaPlano(m[1]);
    else if (h.startsWith('#/planos')) await vistaPlanos();
    else if (h.startsWith('#/ambientes')) await vistaAmbientes();
    else if (h.startsWith('#/uso')) await vistaUso();
    else if (h.startsWith('#/auditoria')) await vistaAuditoria();
    else if (h.startsWith('#/configuracoes')) await vistaConfiguracoes();
    else await vistaEmpresas();
  } catch (e) { if (e.status !== 401) tela('Algo deu errado', `<div class="faixa-aviso erro">${esc(e.message)}</div>`); }
  fimTransicao();
}

function itensPaleta() {
  return [
    { grupo: 'Ações', nome: 'Nova empresa', dica: 'N', icone: 'mais', acao: novaEmpresa },
    { grupo: 'Ações', nome: 'Novo plano', icone: 'pacote', href: '#/planos/novo' },
    ...SECOES.map(([id, nome, ic]) => ({ grupo: 'Ir para', nome, icone: ic, href: `#/${id}` })),
    ...(C.empresas || []).map((e, i) => ({ grupo: 'Empresas', nome: e.name, dica: e.statusNome, icone: 'predio', href: `#/empresas/${e.id}`, chaves: e.slug, soNaBusca: i >= 6 })),
    ...C.planos.map(p => ({ grupo: 'Planos', nome: p.name, icone: 'pacote', href: `#/planos/${p.id}`, soNaBusca: true })),
  ];
}

async function iniciar() {
  const r = await fetch('/api/plataforma/eu', { credentials: 'same-origin' });
  if (r.status !== 200) return telaLogin();
  const eu = await r.json();
  Object.assign(C, { eu, csrf: eu.csrf, catalogo: eu.catalogo });
  C.planos = (await api('/api/plataforma/planos')).planos;
  $('fundo-lateral').onclick = () => $('lateral').classList.remove('aberta');
  document.addEventListener('click', ev => { if (ev.target.closest('[data-trocar-chave]')) C.abrirTroca = true; });   // aviso do topo → formulário de troca
  addEventListener('hashchange', rota);
  api('/api/plataforma/empresas').then(d => { C.empresas = d.empresas; }).catch(() => {});
  iniciarPaleta(itensPaleta, { atalhos: { n: novaEmpresa } });
  rota();
}
iniciar();
