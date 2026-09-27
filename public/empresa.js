// Administração da empresa (multiempresa): usuários e convites, roles e permissões, branding,
// landing page e URL. Tudo dentro do próprio ambiente e do que o operador da plataforma liberou.
import { api, carregandoHtml, esc, ocupado, toast, vazioHtml } from '/comum.js';
import { E, cabecalho, ligarCabecalho, pode } from '/app.js';
import { renderMarca, ligarMarca, renderLanding, ligarLanding, renderUrl, ligarUrl, mostrarErro } from '/editores.js';

const $ = id => document.getElementById(id);
const falhar = e => toast(e.message, 6000);
const STATUS = { convidado: ['Convidado', 'selo-ambar'], ativo: ['Ativo', 'selo-verde'], inativo: ['Inativo', 'selo-cinza'] };
const tabela = (cab, linhas, vazio) => (linhas.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
  : vazioHtml({ icone: 'pessoas', titulo: vazio }));

const TELAS = {
  usuarios: ['Usuários', 'user.read', telaUsuarios],
  roles: ['Roles e permissões', 'role.manage', telaRoles],
  marca: ['Branding', 'branding.manage', telaMarca],
  landing: ['Landing Page', 'landing_page.manage', telaLanding],
  url: ['URL e domínio', 'url.manage', telaUrl],
};

export async function rotaEmpresa(aba) {
  const t = TELAS[aba];
  if (!t || !pode(t[1])) { location.hash = '#/nova'; return; }
  $('principal').innerHTML = `${cabecalho(t[0])}<div class="pagina"><div class="pagina-dentro"><div id="conteudo">${carregandoHtml()}</div></div></div>`;
  ligarCabecalho();
  try { await t[2](); } catch (e) { $('conteudo').innerHTML = `<div class="faixa-aviso erro">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- Usuários e convites
async function telaUsuarios() {
  const { usuarios, roles } = await api('/api/empresa/usuarios');
  const eu = E.eu.userId;
  const opcoes = sel => roles.map(r => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const podeCriar = pode('user.create'), podeEditar = pode('user.update'), podeRoles = pode('role.manage'), podeRemover = pode('user.delete');
  $('conteudo').innerHTML = `<p class="lead">Pessoas com acesso ao ambiente da ${esc(E.plataforma.empresa.name)}. O convite chega por email; no primeiro acesso, a pessoa fica ativa.</p>
    ${podeCriar ? `<form id="f-convite" class="filtros">
      <div class="campo"><label for="cv-email">Email</label><input class="entrada" id="cv-email" type="email" required></div>
      <div class="campo"><label for="cv-nome">Nome</label><input class="entrada" id="cv-nome" maxlength="120"></div>
      <div class="campo"><label for="cv-role">Role</label><select class="entrada" id="cv-role">${opcoes(roles.find(r => r.key === 'member')?.id)}</select></div>
      <button class="btn btn-verde btn-pequeno">Convidar</button></form>` : ''}
    <div class="filtros"><div class="campo"><label for="u-busca">Buscar</label><input class="entrada" id="u-busca" placeholder="nome ou email"></div>
      <div class="campo"><label for="u-status">Status</label><select class="entrada" id="u-status"><option value="">Todos</option><option value="ativo">Ativos</option><option value="convidado">Convidados</option><option value="inativo">Inativos</option></select></div></div>
    <div id="u-lista"></div>`;
  const desenhar = () => {
    const q = $('u-busca').value.toLowerCase(), st = $('u-status').value;
    const lista = usuarios.filter(u => (!q || u.email.includes(q) || (u.name || '').toLowerCase().includes(q)) && (!st || u.status === st));
    $('u-lista').innerHTML = tabela(['Pessoa', 'Role', 'Status', ''], lista.map(u => {
      const proprio = u.id === eu;
      return `<tr><td data-r="Pessoa"><b>${esc(u.name || u.email)}</b>${proprio ? ' <span class="dica">(você)</span>' : ''}<br><span class="dica">${esc(u.email)}</span></td>
        <td data-r="Role">${podeRoles && !proprio ? `<select class="entrada" data-role="${u.id}" aria-label="Role de ${esc(u.email)}">${opcoes(u.role_id)}</select>` : esc(u.role)}</td>
        <td data-r="Status"><span class="selo ${STATUS[u.status][1]}">${STATUS[u.status][0]}</span></td>
        <td><div class="linha-botoes">${u.status === 'convidado' && podeCriar ? `<button class="btn-texto btn-pequeno" data-reenviar="${u.id}">Reenviar convite</button>` : ''}
          ${podeEditar && !proprio ? `<button class="btn-texto btn-pequeno" data-status="${u.id}" data-novo="${u.status === 'inativo' ? 'ativo' : 'inativo'}">${u.status === 'inativo' ? 'Reativar' : 'Desativar'}</button>` : ''}
          ${podeRemover && !proprio ? `<button class="btn-texto btn-pequeno" data-remover="${u.id}">Remover</button>` : ''}</div></td></tr>`;
    }), usuarios.length ? 'Ninguém encontrado com esse filtro.' : 'Nenhum usuário ainda. Convide as primeiras pessoas.');
  };
  desenhar();
  $('u-busca').oninput = desenhar; $('u-status').onchange = desenhar;
  if (podeCriar) $('f-convite').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/empresa/usuarios', { metodo: 'POST', corpo: { email: $('cv-email').value, name: $('cv-nome').value, role_id: $('cv-role').value } }); toast('Convite enviado.'); telaUsuarios(); } catch (e) { falhar(e); }
  };
  $('u-lista').onchange = async ev => {
    const s = ev.target.closest('[data-role]');
    if (!s) return;
    try { await api(`/api/empresa/usuarios/${s.dataset.role}`, { metodo: 'PUT', corpo: { role_id: s.value } }); toast('Role alterada.'); } catch (e) { falhar(e); telaUsuarios(); }
  };
  $('u-lista').onclick = async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.reenviar) { await api(`/api/empresa/usuarios/${b.dataset.reenviar}/reenviar`, { metodo: 'POST' }); toast('Convite reenviado.'); }
      else if (b.dataset.status) {
        if (b.dataset.novo === 'inativo' && !confirm('Desativar esta pessoa? Ela perde o acesso na hora; o histórico continua.')) return;
        await api(`/api/empresa/usuarios/${b.dataset.status}`, { metodo: 'PUT', corpo: { status: b.dataset.novo } }); toast('Status alterado.'); telaUsuarios();
      } else if (b.dataset.remover) {
        if (!confirm('Remover esta pessoa da empresa? O histórico dela continua no ambiente.')) return;
        await api(`/api/empresa/usuarios/${b.dataset.remover}`, { metodo: 'DELETE' }); toast('Pessoa removida.'); telaUsuarios();
      }
    } catch (e) { falhar(e); }
  };
}

// ---------------------------------------------------------------- Roles e permissões
async function telaRoles() {
  const { roles, permissoes, podeCriar } = await api('/api/empresa/roles');
  const desc = Object.fromEntries(permissoes.map(p => [p.key, p.description]));
  $('conteudo').innerHTML = `<p class="lead">Roles de sistema valem para todas as empresas e não mudam. Roles próprias combinam as permissões que a empresa precisa.</p>
    ${!podeCriar ? '<div class="faixa-aviso atencao">Roles próprias não estão liberadas para esta empresa. Você pode usar as roles de sistema.</div>' : ''}
    ${tabela(['Role', 'Permissões', 'Usuários', ''], roles.map(r => `<tr><td data-r="Role"><b>${esc(r.name)}</b>${r.system ? ' <span class="selo selo-cinza">Sistema</span>' : ''}<br><span class="dica">${esc(r.description)}</span></td>
      <td data-r="Permissões"><div class="chips">${r.permissoes.map(p => `<span class="chip" title="${esc(desc[p] || p)}">${esc(desc[p] || p)}</span>`).join('') || '<span class="dica">nenhuma</span>'}</div></td>
      <td data-r="Usuários">${r.usuarios}</td>
      <td>${!r.system && podeCriar ? `<div class="linha-botoes"><button class="btn-texto btn-pequeno" data-editar="${r.id}">Editar</button><button class="btn-texto btn-pequeno" data-excluir="${r.id}">Remover</button></div>` : ''}</td></tr>`), 'Nenhuma role.')}
    ${podeCriar ? '<div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde" id="nova-role">Nova role</button></div>' : ''}
    <div id="editor-role"></div>`;
  const editor = r => {
    $('editor-role').innerHTML = `<form id="f-role" style="margin-top:20px"><h3>${r ? 'Editar role' : 'Nova role'}</h3>
      <div class="grade-2"><div class="campo"><label for="r-nome">Nome</label><input class="entrada" id="r-nome" value="${esc(r?.name || '')}" maxlength="60"></div>
        <div class="campo"><label for="r-desc">Descrição</label><input class="entrada" id="r-desc" value="${esc(r?.description || '')}" maxlength="200"></div></div>
      <span class="legenda">Permissões</span>
      <div class="checagens">${permissoes.map(p => `<label><input type="checkbox" data-perm="${p.key}" ${r?.permissoes.includes(p.key) ? 'checked' : ''}> <span>${esc(p.description)}<small>${esc(p.key)}</small></span></label>`).join('')}</div>
      <p class="msg-erro oculto" id="r-erro" role="alert"></p>
      <div class="linha-botoes"><button class="btn btn-verde">Salvar role</button><button type="button" class="btn-texto" id="r-cancelar">Cancelar</button></div></form>`;
    $('r-nome').focus();
    $('r-cancelar').onclick = () => { $('editor-role').innerHTML = ''; };
    $('f-role').onsubmit = async ev => {
      ev.preventDefault();
      const corpo = { name: $('r-nome').value, description: $('r-desc').value, permissoes: [...document.querySelectorAll('[data-perm]')].filter(x => x.checked).map(x => x.dataset.perm) };
      try { await api(r ? `/api/empresa/roles/${r.id}` : '/api/empresa/roles', { metodo: r ? 'PUT' : 'POST', corpo }); toast('Role salva.'); telaRoles(); } catch (e) { mostrarErro('r-erro', e); }
    };
  };
  $('nova-role')?.addEventListener('click', () => editor(null));
  $('conteudo').onclick = async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.editar) editor(roles.find(x => x.id === b.dataset.editar));
    if (b.dataset.excluir) {
      if (!confirm('Remover esta role?')) return;
      try { await api(`/api/empresa/roles/${b.dataset.excluir}`, { metodo: 'DELETE' }); toast('Role removida.'); telaRoles(); } catch (e) { falhar(e); }
    }
  };
}

// ---------------------------------------------------------------- Branding
async function telaMarca() {
  const { marca, pode: podeEditar } = await api('/api/empresa/marca');
  $('conteudo').innerHTML = `<p class="lead">A identidade visual aparece na página inicial, no login e no app. Itens definidos pelo operador da plataforma ficam travados.</p>${renderMarca(marca, { modo: 'empresa', pode: podeEditar })}`;
  if (!podeEditar) return;
  const ler = ligarMarca(marca);
  $('form-marca').onsubmit = async ev => {
    ev.preventDefault();
    try { const { corpo } = await ler(); await api('/api/empresa/marca', { metodo: 'PUT', corpo }); toast('Identidade visual salva. Recarregando…'); setTimeout(() => location.reload(), 900); }
    catch (e) { mostrarErro('mk-erro', e); }
  };
}

// ---------------------------------------------------------------- Landing Page
async function telaLanding() {
  const [{ landing, pode: podeEditar }, url] = await Promise.all([api('/api/empresa/landing'), api('/api/empresa/url')]);
  $('conteudo').innerHTML = renderLanding(landing, { pode: podeEditar, urlPublica: url.url });
  if (!podeEditar) return;
  const ler = ligarLanding();
  const salvar = async status => { try { await api('/api/empresa/landing', { metodo: 'PUT', corpo: await ler(status) }); toast(status === 'publicada' ? 'Landing page publicada.' : 'Landing page salva.'); telaLanding(); } catch (e) { mostrarErro('ld-erro', e); } };
  $('form-landing').onsubmit = ev => { ev.preventDefault(); salvar(); };
  document.querySelector('[data-acao="publicar"]')?.addEventListener('click', () => salvar('publicada'));
  document.querySelector('[data-acao="despublicar"]')?.addEventListener('click', () => salvar('rascunho'));
}

// ---------------------------------------------------------------- URL e domínio
async function telaUrl() {
  const u = await api('/api/empresa/url');
  $('conteudo').innerHTML = renderUrl(u, { pode: u.pode });
  ligarUrl(u);
  $('verificar-dominio')?.addEventListener('click', ev => ocupado(ev.currentTarget, async () => { try { const r = await api('/api/empresa/dominio/verificar', { metodo: 'POST' }); toast(r.status === 'verificado' ? 'Domínio verificado.' : r.mensagem, r.status === 'verificado' ? undefined : 7000); telaUrl(); } catch (e) { falhar(e); } }));
  $('f-url').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = {};
    if (u.pode.url) corpo.slug = $('url-slug').value;
    if (u.pode.domain) corpo.custom_domain = $('url-dom').value;
    try { await api('/api/empresa/url', { metodo: 'PUT', corpo }); toast('Endereço salvo.'); telaUrl(); } catch (e) { mostrarErro('url-erro', e); }
  };
}


