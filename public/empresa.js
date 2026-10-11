// Administração da empresa (multiempresa): perfis e permissões (aba Perfis de Pessoas), branding,
// landing page, URL e acessos do suporte. Usuários e convites ficam na aba Pessoas (estrutura.js).
// Tudo dentro do próprio ambiente e do que o operador da plataforma liberou.
import { api, carregandoHtml, esc, ocupado, toast, vazioHtml } from '/comum.js';
import { cabecalho, ligarCabecalho, pode } from '/app.js';
import { renderMarca, ligarMarca, renderLanding, ligarLanding, renderUrl, ligarUrl, mostrarErro } from '/editores.js';
import { confirmar, vigiarAlteracoes } from '/admin-ui.js';

const $ = id => document.getElementById(id);
const falhar = e => toast(e.message, 6000);
const tabela = (cab, linhas, vazio) => (linhas.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${cab.map(c => (c ? `<th>${esc(c)}</th>` : '<th><span class="sr">Ações</span></th>')).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
  : vazioHtml({ icone: 'pessoas', titulo: vazio }));

const TELAS = {
  marca: ['Marca e identidade visual', 'branding.manage', telaMarca],
  landing: ['Página de apresentação', 'landing_page.manage', telaLanding],
  url: ['URL e domínio', 'url.manage', telaUrl],
  acessos: ['Acessos do suporte', 'audit.read', telaAcessos],
};

export async function rotaEmpresa(aba) {
  const t = TELAS[aba];
  if (!t || !pode(t[1])) { location.hash = '#/nova'; return; }
  $('principal').innerHTML = `${cabecalho(t[0])}<div class="pagina"><div class="pagina-dentro"><div id="conteudo">${carregandoHtml()}</div></div></div>`;
  ligarCabecalho();
  try { await t[2](); } catch (e) {
    $('conteudo').innerHTML = `<div class="faixa-aviso erro" role="alert"><h2>Não foi possível abrir esta tela</h2><p>${esc(e.message)}</p><button class="btn btn-verde" id="empresa-tentar">Tentar novamente</button></div>`;
    $('empresa-tentar').onclick = () => rotaEmpresa(aba);
  }
}

// ---------------------------------------------------------------- Perfis e permissões
// Aba Perfis da tela Pessoas (#/pessoas/perfis): desenha em #conteudo, como as outras abas.
export async function telaRoles() {
  const { roles, permissoes, podeCriar } = await api('/api/empresa/roles');
  const desc = Object.fromEntries(permissoes.map(p => [p.key, p.description]));
  $('conteudo').innerHTML = `<p class="lead">Perfis de sistema valem para todas as empresas e não mudam. Perfis próprios combinam as permissões que a empresa precisa.</p>
    ${!podeCriar ? '<div class="faixa-aviso atencao">Perfis próprios não estão liberados para esta empresa. Você pode usar os perfis de sistema.</div>' : ''}
    <div class="adm-perfis">${tabela(['Perfil', 'Permissões', 'Pessoas', ''], roles.map(r => `<tr><td data-r="Perfil"><b>${esc(r.name)}</b>${r.system ? ' <span class="selo selo-cinza">Sistema</span>' : ''}<br><span class="dica">${esc(r.description)}</span></td>
      <td data-r="Permissões"><div class="chips adm-chips">${r.permissoes.map(p => `<span class="chip" title="${esc(desc[p] || p)}">${esc(desc[p] || p)}</span>`).join('') || '<span class="dica">nenhuma</span>'}</div></td>
      <td data-r="Pessoas">${r.usuarios} ${r.usuarios === 1 ? 'pessoa' : 'pessoas'}</td>
      <td data-r="Ações">${!r.system && podeCriar ? `<div class="linha-botoes"><button class="btn-texto btn-pequeno" data-editar="${r.id}">Editar</button><button class="btn btn-perigo btn-pequeno" data-excluir="${r.id}">Remover</button></div>` : '<span class="dica">—</span>'}</td></tr>`), 'Nenhum perfil.')}</div>
    ${podeCriar ? '<div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde" id="nova-role">Novo perfil</button></div>' : ''}
    <div id="editor-role"></div>`;
  const editor = r => {
    $('editor-role').innerHTML = `<form id="f-role" style="margin-top:20px"><h2>${r ? 'Editar perfil' : 'Novo perfil'}</h2>
      <div class="grade-2"><div class="campo"><label for="r-nome">Nome</label><input class="entrada" id="r-nome" value="${esc(r?.name || '')}" maxlength="60"></div>
        <div class="campo"><label for="r-desc">Descrição</label><input class="entrada" id="r-desc" value="${esc(r?.description || '')}" maxlength="200"></div></div>
      <span class="legenda">Permissões</span>
      <div class="checagens">${permissoes.map(p => `<label><input type="checkbox" data-perm="${p.key}" ${r?.permissoes.includes(p.key) ? 'checked' : ''}> <span>${esc(p.description)}<small>${esc(p.key)}</small></span></label>`).join('')}</div>
      <p class="msg-erro oculto" id="r-erro" role="alert"></p>
      <div class="linha-botoes"><button class="btn btn-verde">Salvar perfil</button><button type="button" class="btn-texto" id="r-cancelar">Cancelar</button></div></form>`;
    $('r-nome').focus();
    const vig = vigiarAlteracoes($('f-role'), { barra: $('f-role').querySelector('.linha-botoes') });
    $('r-cancelar').onclick = () => { vig.limpar(); $('editor-role').innerHTML = ''; };
    $('f-role').onsubmit = async ev => {
      ev.preventDefault();
      const corpo = { name: $('r-nome').value, description: $('r-desc').value, permissoes: [...document.querySelectorAll('[data-perm]')].filter(x => x.checked).map(x => x.dataset.perm) };
      if (r && JSON.stringify([...corpo.permissoes].sort()) !== JSON.stringify([...r.permissoes].sort()) && !await confirmar({ titulo: `Alterar as permissões de ${r.name}?`, texto: `A mudança vale para ${r.usuarios} ${r.usuarios === 1 ? 'pessoa vinculada' : 'pessoas vinculadas'}. Confira as permissões marcadas antes de continuar.`, botao: 'Alterar permissões' })) return;
      try { await api(r ? `/api/empresa/roles/${r.id}` : '/api/empresa/roles', { metodo: r ? 'PUT' : 'POST', corpo }); vig.limpar(); toast('Perfil salvo.'); telaRoles(); } catch (e) { mostrarErro('r-erro', e); }
    };
  };
  $('nova-role')?.addEventListener('click', () => editor(null));
  $('conteudo').onclick = async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.editar) editor(roles.find(x => x.id === b.dataset.editar));
    if (b.dataset.excluir) {
      const alvo = roles.find(x => x.id === b.dataset.excluir);
      if (!await confirmar({ titulo: `Remover o perfil ${alvo?.name || ''}?`, texto: 'O perfil deixa de existir. Pessoas com este perfil precisam receber outro antes.', botao: 'Remover perfil', perigo: true })) return;
      try { await api(`/api/empresa/roles/${b.dataset.excluir}`, { metodo: 'DELETE' }); toast('Perfil removido.'); telaRoles(); } catch (e) { falhar(e); }
    }
  };
}

// ---------------------------------------------------------------- Branding
async function telaMarca() {
  const { marca, pode: podeEditar, motivo } = await api('/api/empresa/marca');
  $('conteudo').innerHTML = `<p class="lead">A identidade visual aparece na página inicial, no login e no app. Itens definidos pelo operador da plataforma ficam travados.</p>${renderMarca(marca, { modo: 'empresa', pode: podeEditar, motivo })}`;
  if (!podeEditar) return;
  const ler = ligarMarca(marca);
  const vig = vigiarAlteracoes($('form-marca'), { barra: $('form-marca').querySelector(':scope > .linha-botoes'), cliques: '[data-remover], [data-exemplo]' });
  $('form-marca').onsubmit = async ev => {
    ev.preventDefault();
    try { const { corpo } = await ler(); await api('/api/empresa/marca', { metodo: 'PUT', corpo }); vig.limpar(); toast('Identidade visual salva. Recarregando…'); setTimeout(() => location.reload(), 900); }
    catch (e) { mostrarErro('mk-erro', e); }
  };
}

// ---------------------------------------------------------------- Landing Page
async function telaLanding() {
  const [{ landing, pode: podeEditar, motivo }, url] = await Promise.all([api('/api/empresa/landing'), api('/api/empresa/url')]);
  $('conteudo').innerHTML = renderLanding(landing, { pode: podeEditar, urlPublica: url.url, motivo });
  if (!podeEditar) return;
  const ler = ligarLanding(landing);
  const vig = vigiarAlteracoes($('form-landing'), { barra: $('form-landing').querySelector('.ld-salvar'), cliques: '[data-vis], #ld-restaurar, #ld-imagem-remover' });
  const salvar = async status => {
    if ((status === 'publicada' || (!status && landing?.status === 'publicada')) && !await confirmar({ titulo: 'Atualizar a página pública agora?', texto: 'As alterações ficam visíveis para quem acessar a página.', botao: status === 'publicada' ? 'Publicar agora' : 'Salvar e atualizar' })) return;
    try { await api('/api/empresa/landing', { metodo: 'PUT', corpo: await ler(status) }); vig.limpar(); toast(status === 'publicada' ? 'Página de apresentação publicada: as seções já aparecem na página.' : status === 'rascunho' ? 'A página de apresentação voltou para rascunho: a página pública mostra só a versão simples.' : landing?.status === 'publicada' ? 'Página de apresentação salva e já no ar.' : 'Salvo como rascunho. Para aparecer na página, clique em Publicar agora.', 7000); telaLanding(); } catch (e) { mostrarErro('ld-erro', e); }
  };
  $('form-landing').onsubmit = ev => { ev.preventDefault(); salvar(); };
  for (const b of document.querySelectorAll('[data-acao="publicar"]')) b.addEventListener('click', () => salvar('publicada'));
  document.querySelector('[data-acao="despublicar"]')?.addEventListener('click', () => salvar('rascunho'));
}

// ---------------------------------------------------------------- URL e domínio
async function telaUrl() {
  const u = await api('/api/empresa/url');
  $('conteudo').innerHTML = renderUrl(u, { pode: u.pode });
  ligarUrl(u);
  const vig = vigiarAlteracoes($('f-url'), { barra: $('f-url').querySelector(':scope > .linha-botoes') });
  $('verificar-dominio')?.addEventListener('click', ev => ocupado(ev.currentTarget, async () => { try { const r = await api('/api/empresa/dominio/verificar', { metodo: 'POST' }); toast(r.status === 'verificado' ? 'Domínio verificado.' : r.mensagem, r.status === 'verificado' ? undefined : 7000); telaUrl(); } catch (e) { falhar(e); } }));
  $('f-url').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = {};
    if (u.pode.url) corpo.slug = $('url-slug').value;
    if (u.pode.domain) corpo.custom_domain = $('url-dom').value;
    try { await api('/api/empresa/url', { metodo: 'PUT', corpo }); vig.limpar(); toast('Endereço salvo.'); telaUrl(); } catch (e) { mostrarErro('url-erro', e); }
  };
}



// ---------------------------------------------------------------- Acessos da equipe de operação
// Quem da equipe de operação da plataforma entrou neste ambiente ou exportou o banco, quando, por quê e por quanto
// tempo. Só os registros desta empresa; nenhum conteúdo de conversa. Texto neutro (marca branca), mas a identidade
// do operador (email) aparece sempre.
const ST_ACESSO = { aberto: ['Em andamento', 'selo-ambar'], encerrado: ['Encerrado', 'selo-cinza'], expirado: ['Expirado', 'selo-cinza'] };
const FIM = { logout: 'saiu', expiracao: 'prazo de 60 minutos', manual_empresa: 'encerrado pela empresa', manual_operador: 'encerrado pelo operador', substituido: 'substituído por novo acesso',
  sessao_encerrada: 'sessão encerrada', sessao_invalida: 'sessão inválida', empresa_suspensa: 'empresa suspensa', empresa_cancelada: 'empresa cancelada', pessoa_desativada: 'acesso desativado', pessoa_removida: 'acesso removido', usuario_bloqueado: 'usuário bloqueado', admin_removido: 'deixou a equipe da plataforma' };
const quando = s => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const duracao = s => (s == null ? '—' : s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
async function telaAcessos() {
  const d = await api('/api/empresa/acessos-greenia');
  const podeEncerrar = pode('company.manage');
  const raiz = $('conteudo');
  raiz.innerHTML = `<p class="lead">Cada vez que alguém da equipe de operação da plataforma entra neste ambiente (para suporte, a pedido da empresa ou em incidente) ou exporta o banco de dados, o registro aparece aqui na hora, com o motivo. O acesso vale por até ${d.duracaoMinutos} minutos e não mostra o conteúdo das conversas. Os admins também recebem um aviso por email quando o envio está disponível.</p>
    <div class="secao-titulo" style="margin-top:0"><h2>Acessos da equipe de operação ao ambiente</h2></div>
    ${d.acessos.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Quem</th><th>Tipo e justificativa</th><th>Início</th><th>Fim</th><th>Duração</th><th>Situação</th><th><span class="sr">Ações</span></th></tr></thead><tbody>
      ${d.acessos.map(a => `<tr><td data-r="Quem">${esc(a.operador)}</td><td data-r="Tipo e justificativa"><b>${esc(a.tipoNome)}</b><br><span class="dica">${esc(a.justificativa)}</span></td>
        <td data-r="Início">${quando(a.inicio)}</td><td data-r="Fim">${a.fim ? `${quando(a.fim)}<br><span class="dica">${esc(FIM[a.motivo_fim] || a.motivo_fim || '')}</span>` : `até ${quando(a.expira)}`}</td>
        <td data-r="Duração">${duracao(a.duracao_s)}</td><td data-r="Situação"><span class="selo ${ST_ACESSO[a.status][1]}">${ST_ACESSO[a.status][0]}</span></td>
        <td data-r="Ações">${a.status === 'aberto' && podeEncerrar ? `<button class="btn btn-perigo btn-pequeno" data-encerrar="${esc(a.id)}">Encerrar acesso</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : vazioHtml({ icone: 'escudo', titulo: 'Nenhum acesso da equipe de operação até agora.' })}
    <div class="secao-titulo"><h2>Exportações do banco de dados</h2></div>
    ${d.exportacoes.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Quem</th><th>Finalidade e justificativa</th><th>Quando</th><th>O que</th><th>Resultado</th><th>Cópia</th></tr></thead><tbody>
      ${d.exportacoes.map(x => `<tr><td data-r="Quem">${esc(x.operador)}</td><td data-r="Tipo e justificativa"><b>${esc(x.tipoNome)}</b><br><span class="dica">${esc(x.justificativa)}</span></td>
        <td data-r="Quando">${quando(x.em)}</td><td data-r="O que">Cópia completa do banco, conversas incluídas</td>
        <td data-r="Resultado"><span class="selo ${x.sucesso ? 'selo-ambar' : 'selo-cinza'}">${x.sucesso ? 'Exportado' : 'Falhou'}</span></td>
        <td data-r="Cópia">${!x.sucesso ? '–' : x.eliminadoEm ? `Eliminada do servidor em ${quando(x.eliminadoEm)}` : x.controle === 'anterior' ? 'Entregue direto à equipe' : x.hold ? 'Guardada por bloqueio legal ou incidente' : x.expiraEm ? `Eliminada do servidor até ${quando(x.expiraEm)}` : 'Em uso pela equipe'}${x.baixadoEm ? `<br><span class="dica">Baixada por ${esc(x.baixadoPor || '')}: essa cópia sai do controle da plataforma</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : vazioHtml({ icone: 'escudo', titulo: 'Nenhuma exportação feita pela equipe de operação.' })}`;
  raiz.querySelectorAll('[data-encerrar]').forEach(b => b.onclick = () => ocupado(b, async () => {
    try { await api(`/api/empresa/acessos-greenia/${encodeURIComponent(b.dataset.encerrar)}/encerrar`, { metodo: 'POST' }); toast('Acesso encerrado.'); telaAcessos(); } catch (e) { falhar(e); }
  }));
}
