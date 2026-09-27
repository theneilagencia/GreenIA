// Console da plataforma (operador): empresas, usuários, planos, ambientes, uso, auditoria e configurações.
// Separado do admin de cada empresa: outra página, outra sessão, outra cor de navegação.
import { esc, marcaHtml, toast, ICONE } from '/comum.js';
import { renderMarca, ligarMarca, renderLanding, ligarLanding, mostrarErro, ROTULOS_MARCA } from '/editores.js';

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
    catch (e) { mostrarErro('c-erro', e); }
  };
  $('f-codigo').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/plataforma/login/entrar', { metodo: 'POST', corpo: { email: $('c-email').value, codigo: $('c-codigo').value } }); location.reload(); }
    catch (e) { mostrarErro('c-erro2', e); }
  };
}

// ---------------------------------------------------------------- Casca
const SECOES = [['empresas', 'Empresas'], ['usuarios', 'Usuários'], ['planos', 'Planos'], ['ambientes', 'Ambientes'], ['uso', 'Uso'], ['auditoria', 'Auditoria'], ['configuracoes', 'Configurações']];
function lateral() {
  const h = location.hash || '#/empresas';
  $('lateral').innerHTML = `<a class="marca" href="#/empresas">${marcaHtml()}</a><span class="selo-escopo">Plataforma</span>
    <nav class="lateral-rolagem" aria-label="Console">
      ${SECOES.map(([id, nome]) => `<a class="item-lat${h.startsWith(`#/${id}`) ? ' ativo' : ''}" href="#/${id}" ${h.startsWith(`#/${id}`) ? 'aria-current="page"' : ''}><span class="nome">${nome}</span></a>`).join('')}
    </nav>
    <div class="lateral-pe"><span class="btn-lat" style="cursor:default">${esc(C.eu.usuario.email)}</span><button class="btn-lat" id="sair">Sair do console</button></div>`;
  $('sair').onclick = async () => { await api('/api/plataforma/sair', { metodo: 'POST' }).catch(() => {}); location.reload(); };
}
function cab(titulo, acoes = '', voltar = '') {
  return `<header class="cabeca"><div class="cabeca-titulo">
    <button class="icone-btn menu-btn" id="menu" aria-label="Abrir navegação">${ICONE.menu}</button>
    ${voltar ? `<a class="btn-texto btn-pequeno" href="${voltar}" style="padding-left:0">← Voltar</a>` : ''}<h1>${esc(titulo)}</h1></div><div class="cabeca-acoes">${acoes}</div></header>`;
}
function tela(titulo, corpo, acoes = '', voltar = '') {
  $('principal').innerHTML = `${cab(titulo, acoes, voltar)}<div class="pagina"><div class="pagina-dentro">${corpo}</div></div>`;
  $('menu').onclick = () => $('lateral').classList.toggle('aberta');
}
const carregando = titulo => tela(titulo, '<p class="dica">Carregando…</p>');
const tabela = (cab, linhas, vazio) => (linhas.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${cab.map(c => `<th${c.startsWith('#') ? ' class="num"' : ''}>${esc(c.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
  : `<div class="lista"><div class="lista-item"><span class="dica">${vazio}</span></div></div>`);

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
  tela('Empresas', `<p class="lead">Cada empresa é um ambiente independente: dados, usuários, marca e landing page próprios.</p>
    ${tabela(['Empresa', 'Status', 'Plano', 'URL', '#Usuários', '#Créditos no mês'], empresas.map(e => `<tr>
      <td data-r="Empresa"><a href="#/empresas/${e.id}"><b>${esc(e.name)}</b></a><br><span class="dica">${esc(e.admins.join(', ') || 'sem administrador')}</span></td>
      <td data-r="Status">${selo(e.status, e.statusNome)}</td><td data-r="Plano">${esc(e.plano?.name || 'sem plano')}</td>
      <td data-r="URL"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace(/^https?:\/\//, ''))}</a></td>
      <td class="num" data-r="Usuários">${num(e.usuarios)}</td><td class="num" data-r="Créditos">${e.creditosUsados === null ? '–' : `${num(Math.round(e.creditosUsados))} <span class="dica">${e.percentual}%</span>`}</td></tr>`),
    'Nenhuma empresa ainda. Crie a primeira.')}`, '<button class="btn btn-verde btn-pequeno" id="nova-empresa">Nova empresa</button>');
  $('nova-empresa').onclick = novaEmpresa;
}

async function novaEmpresa() {
  const planos = C.planos.filter(p => p.status === 'ativo');
  modal(`<div class="modal-topo"><div class="rotulo">Nova empresa</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2>Criar ambiente</h2>
    <form id="f-nova" novalidate>
      <div class="campo"><label for="n-nome">Nome da empresa</label><input class="entrada" id="n-nome" required maxlength="80"></div>
      <div class="campo"><label for="n-slug">Identificador (slug)</label><input class="entrada" id="n-slug" required maxlength="40" pattern="[a-z0-9-]+"><span class="ajuda" id="n-url">Usado no endereço do ambiente. Letras minúsculas, números e hífens.</span></div>
      <div class="campo"><label for="n-plano">Plano</label><select class="entrada" id="n-plano"><option value="">Sem plano por enquanto</option>${planos.map(p => `<option value="${p.id}">${esc(p.name)} · ${num(p.credits)} créditos</option>`).join('')}</select></div>
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
    <div class="linha-botoes">${botoesStatus.map(([s, n, cls]) => `<button class="btn ${cls}" data-status="${s}">${n}</button>`).join('')}</div>
    <div class="secao-titulo"><h3>Plano</h3></div>
    <form id="f-plano" class="linha-botoes"><select class="entrada" id="s-plano" style="max-width:360px"><option value="">Sem plano</option>${C.planos.map(p => `<option value="${p.id}" ${p.id === e.plano?.id ? 'selected' : ''} ${p.status !== 'ativo' && p.id !== e.plano?.id ? 'disabled' : ''}>${esc(p.name)} · ${num(p.credits)} créditos · ${usd(p.price_usd)}</option>`).join('')}</select>
      <button class="btn btn-linha">Alterar plano</button></form>
    ${u.plano ? `<div class="indicadores"><div class="indicador"><span>Créditos usados no mês</span><b>${num(Math.round(u.plano.usados))}</b><small>${u.plano.percentual}% de ${num(u.plano.creditos)}</small></div>
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
  const ler = ligarLanding();
  const salvar = async status => { try { await api(`/api/plataforma/empresas/${id}/landing`, { metodo: 'PUT', corpo: await ler(status) }); toast(status === 'publicada' ? 'Landing page publicada.' : 'Landing page salva.'); vistaEmpresa(id, 'landing'); } catch (x) { mostrarErro('ld-erro', x); } };
  $('form-landing').onsubmit = ev => { ev.preventDefault(); salvar(); };
  document.querySelector('[data-acao="publicar"]')?.addEventListener('click', () => salvar('publicada'));
  document.querySelector('[data-acao="despublicar"]')?.addEventListener('click', () => salvar('rascunho'));
}

async function abaUrl(d, id) {
  const e = d.empresa;
  $('aba').innerHTML = `<p class="lead">O ID interno da empresa não muda. Ao trocar o identificador, o endereço antigo continua levando ao ambiente.</p>
    <div class="faixa-aviso ok">Endereço atual: <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a></div>
    <form id="f-url" novalidate><div class="grade-2">
      <div class="campo"><label for="url-slug">Identificador (slug)</label><input class="entrada" id="url-slug" value="${esc(e.slug)}" maxlength="40"><span class="ajuda">Endereço pela plataforma: /${esc(e.slug)}</span></div>
      <div class="campo"><label for="url-dom">Domínio próprio (opcional)</label><input class="entrada" id="url-dom" value="${esc(e.custom_domain || '')}" placeholder="app.empresa.com.br"><span class="ajuda">O DNS do domínio precisa apontar para a plataforma (CNAME).</span></div>
    </div><p class="msg-erro oculto" id="url-erro" role="alert"></p><div class="linha-botoes"><button class="btn btn-verde">Salvar URL</button></div></form>`;
  $('f-url').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}/url`, { metodo: 'PUT', corpo: { slug: $('url-slug').value, custom_domain: $('url-dom').value } }); toast('URL salva.'); vistaEmpresa(id, 'url'); } catch (x) { mostrarErro('url-erro', x); } };
}

async function abaPermissoes(d, id) {
  const g = d.concessoes, p = d.podeEditar, b = d.marca.locked || [];
  $('aba').innerHTML = `<p class="lead">O que o administrador da empresa pode personalizar. Vale o que estiver liberado aqui e incluído no plano; o operador da plataforma continua podendo alterar tudo.</p>
    <form id="f-conc">
      <h3>Itens liberados para a empresa</h3>
      <div class="checagens">${Object.entries(C.catalogo.concessoes).map(([k, n]) => `<label><input type="checkbox" data-g="${k}" ${g[k] ? 'checked' : ''}> <span>${esc(n)}<small>${p[k] ? 'Liberado e incluído no plano' : g[k] ? 'Liberado, mas fora do plano atual' : 'Não liberado'}</small></span></label>`).join('')}</div>
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
      <td class="num" data-r="Créditos">${num(p.credits)}</td><td class="num" data-r="Reserva">${num(p.reserve)}</td><td class="num" data-r="Preço">${usd(p.price_usd)}</td><td class="num" data-r="Empresas">${num(p.empresas)}</td></tr>`), 'Nenhum plano.')}`,
  '<a class="btn btn-verde btn-pequeno" href="#/planos/novo">Novo plano</a>');
}

async function vistaPlano(id) {
  if (!C.planos.length) C.planos = (await api('/api/plataforma/planos')).planos;
  const p = id === 'novo' ? { name: '', description: '', status: 'ativo', credits: 10000, reserve: 2000, price_usd: '', limits: { max_users: 0, messages_per_minute: 12, max_quick_wins: 0 }, features: Object.fromEntries(Object.keys(C.catalogo.recursos).map(k => [k, k !== 'custom_domain'])), rules: { reserve_fast_only: true, pack_credits: 10000, pack_price_usd: 250 }, settings: {} } : C.planos.find(x => x.id === id);
  if (!p) return tela('Plano', '<p>Plano não encontrado.</p>', '', '#/planos');
  tela(id === 'novo' ? 'Novo plano' : p.name, `<form id="f-plano" novalidate>
    <div class="grade-2"><div class="campo"><label for="pl-nome">Nome</label><input class="entrada" id="pl-nome" value="${esc(p.name)}" maxlength="60"></div>
      <div class="campo"><label for="pl-status">Status</label><select class="entrada" id="pl-status"><option value="ativo" ${p.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${p.status !== 'ativo' ? 'selected' : ''}>Inativo (não aparece para novas empresas)</option></select></div></div>
    <div class="campo"><label for="pl-desc">Descrição</label><input class="entrada" id="pl-desc" value="${esc(p.description)}" maxlength="300"></div>
    <div class="grade-2"><div class="campo"><label for="pl-cred">Créditos por mês</label><input class="entrada" id="pl-cred" type="number" min="0" value="${p.credits}"></div>
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

async function vistaUso() {
  carregando('Uso');
  const u = await api('/api/plataforma/uso');
  const receita = u.empresas.reduce((t, e) => t + (e.receitaUsd || 0), 0), custo = u.empresas.reduce((t, e) => t + e.custoUsd * 1.055, 0);
  tela('Uso', `<p class="lead">Mês ${esc(u.mes)}. Custo real de IA com a taxa do intermediário; receita pelo preço do plano.</p>
    <div class="indicadores"><div class="indicador"><span>Empresas</span><b>${num(u.empresas.length)}</b></div><div class="indicador"><span>Receita do mês</span><b>${usd(receita)}</b></div>
      <div class="indicador"><span>Custo de IA</span><b>${usd(custo)}</b></div><div class="indicador"><span>Margem</span><b>${usd(receita - custo)}</b></div></div>
    ${tabela(['Empresa', 'Plano', '#Créditos usados', '#Pessoas ativas', '#Conversas', '#Custo', '#Receita', '#Margem'], u.empresas.map(e => `<tr><td data-r="Empresa"><a href="#/empresas/${e.id}">${esc(e.name)}</a></td><td data-r="Plano">${esc(e.plano || '–')}</td>
      <td class="num" data-r="Créditos">${e.usados === null ? '–' : `${num(Math.round(e.usados))} <span class="dica">${e.percentual}%</span>`}</td><td class="num" data-r="Pessoas">${num(e.pessoasAtivas)}</td><td class="num" data-r="Conversas">${num(e.conversas)}</td>
      <td class="num" data-r="Custo">${usd(e.custoUsd * 1.055)}</td><td class="num" data-r="Receita">${usd(e.receitaUsd)}</td><td class="num" data-r="Margem">${usd(e.margemUsd)}</td></tr>`), 'Nenhuma empresa.')}`);
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
  const c = await api('/api/plataforma/configuracoes');
  tela('Configurações', `<form id="f-cfg" novalidate>
    <div class="grade-2"><div class="campo"><label for="cf-nome">Nome da plataforma</label><input class="entrada" id="cf-nome" value="${esc(c.nome)}" maxlength="60"></div>
      <div class="campo"><label for="cf-plano">Plano padrão para novas empresas</label><select class="entrada" id="cf-plano"><option value="">Nenhum</option>${C.planos.map(p => `<option value="${p.id}" ${p.id === c.plano_padrao ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="campo"><label for="cf-sub">Base de subdomínios (opcional)</label><input class="entrada" id="cf-sub" value="${esc(c.subdominio_base || '')}" placeholder="ia.suaplataforma.com.br">
      <span class="ajuda">Com DNS curinga (*.base), cada empresa ganha empresa.base. Sem isso, o endereço é ${esc(c.url_base || '')}/empresa.</span></div>
    <div class="campo"><label for="cf-res">Identificadores reservados (além dos do sistema)</label><input class="entrada" id="cf-res" value="${esc(c.slugs_reservados.join(', '))}"></div>
    <h3>Email da plataforma</h3><p class="dica">Usado para códigos de acesso e convites das empresas que não têm email próprio. ${c.smtp.configurado ? 'Configurado.' : 'Não configurado: os códigos aparecem só no log do servidor.'}</p>
    <div class="grade-2"><div class="campo"><label for="cf-smtp">URL do SMTP</label><input class="entrada" id="cf-smtp" placeholder="${c.smtp.configurado ? '(mantida; preencha para trocar)' : 'smtps://usuario:senha@smtp.exemplo.com:465'}"></div>
      <div class="campo"><label for="cf-rem">Remetente</label><input class="entrada" id="cf-rem" value="${esc(c.smtp.remetente || '')}" placeholder="GreenIA <nao-responda@exemplo.com>"></div></div>
    <div class="linha-botoes"><button class="btn btn-verde">Salvar configurações</button><button type="button" class="btn btn-linha" id="cf-teste">Enviar email de teste</button></div></form>
    ${c.leads.length ? `<div class="secao-titulo"><h3>Contatos da página de vendas</h3></div>${tabela(['Data', 'Empresa', 'Pessoa', 'Mensagem'], c.leads.map(l => `<tr><td data-r="Data">${data(l.em)}</td><td data-r="Empresa"><b>${esc(l.empresa)}</b><br><span class="dica">${esc(l.pessoas || '')}</span></td><td data-r="Pessoa">${esc(l.nome)}<br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td><td data-r="Mensagem">${esc(l.mensagem || '–')}</td></tr>`), '')}` : ''}`);
  $('f-cfg').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = { nome: $('cf-nome').value, plano_padrao: $('cf-plano').value || null, subdominio_base: $('cf-sub').value, slugs_reservados: $('cf-res').value, smtp: { remetente: $('cf-rem').value, ...($('cf-smtp').value ? { url: $('cf-smtp').value } : {}) } };
    try { await api('/api/plataforma/configuracoes', { metodo: 'PUT', corpo }); toast('Configurações salvas.'); vistaConfiguracoes(); } catch (x) { falhar(x); }
  };
  $('cf-teste').onclick = async () => { try { const r = await api('/api/plataforma/smtp/teste', { metodo: 'POST' }); toast(`Email de teste enviado para ${r.para}.`); } catch (x) { falhar(x); } };
}

// ---------------------------------------------------------------- Rotas
async function rota() {
  const h = location.hash || '#/empresas';
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
}

async function iniciar() {
  const r = await fetch('/api/plataforma/eu', { credentials: 'same-origin' });
  if (r.status !== 200) return telaLogin();
  const eu = await r.json();
  Object.assign(C, { eu, csrf: eu.csrf, catalogo: eu.catalogo });
  C.planos = (await api('/api/plataforma/planos')).planos;
  $('fundo-lateral').onclick = () => $('lateral').classList.remove('aberta');
  addEventListener('hashchange', rota);
  rota();
}
iniciar();
