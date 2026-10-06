// GreenIA: casca da aplicação (lateral com as seções, cabeçalho) e rotas por hash.
//   #/visao-geral                    como a empresa está usando IA (admin)
//   #/conversas, #/nova, #/c/:id     conversas
//   #/quick-wins, #/qw/:id...        quick wins
//   #/conhecimento                   o que a IA pode usar
//   #/uso #/pessoas #/modelos #/politicas #/atividade #/configuracoes   gestão (admin)
import { api, aplicarMarca, definirCsrf, definirMarcaPropria, definirUnidade, esc, ICONE, logoEmpresa, MARCA, marcaHtml, rodapePlataformaHtml, toast, transicao, vazioHtml } from '/comum.js';
import { ligarAcoesConversas } from '/historico-conversas.js';
import { vistaConversa, lembreteAoSair } from '/conversa.js';
import { iniciarPaleta, abrirPaleta, teclaPaleta } from '/comando.js';
import { iniciarAcessibilidade, conterFoco, fecharComEscape } from '/acessibilidade.js';

export const E = { eu: null, publico: {}, conversas: [], quickWins: [], retencaoDias: 90, rotas: {} };
const $ = id => document.getElementById(id);

// O histórico pode restaurar o DOM privado pelo back/forward cache sem consultar a sessão.
// Esvazia a página antes de congelar e exige uma leitura nova ao restaurá-la.
window.addEventListener('pagehide', ev => { if (ev.persisted) document.body.replaceChildren(); });
window.addEventListener('pageshow', ev => {
  if (ev.persisted) { document.body.replaceChildren(); location.reload(); }
});

export const irPara = hash => { if (location.hash === hash) rota(); else location.hash = hash; };
export const ehAdmin = () => !!E.eu?.admin;
// Permissão granular (multiempresa); na instalação única, as telas de gestão são do admin.
export const pode = perm => (E.permissoes ? E.permissoes.includes(perm) : ehAdmin());
window.__greeniaPode = pode;   // telas que não importam este módulo (avisos com ação) consultam a permissão
export const ehGestor = () => ehAdmin() || E.eu?.areas.some(a => a.responsavel) || !!E.podeCriarQw;

function iniciais(p) {
  const n = (p.nome || p.email).split(/[\s.@_-]+/).filter(Boolean);
  return ((n[0]?.[0] || '') + (n[1]?.[0] || '')).toUpperCase();
}

// Onde estou: grupo da seção atual (Trabalho, Gestão, Empresa) antes do título.
function grupoAtual() {
  const h = location.hash || '';
  for (const g of [...SECOES_USO(), ...SECOES_ADMIN()]) for (const i of g.itens) if (i.ativo ? i.ativo(h) : h === `#/${i.id}` || h.startsWith(`#/${i.id}/`)) return g.titulo || '';
  return '';
}

export function cabecalho(titulo, acoes = '') {
  const p = E.eu;
  const grupo = grupoAtual();
  return `<header class="cabeca">
    <div class="cabeca-titulo">
      <button class="icone-btn menu-btn" id="menu" aria-label="Abrir navegação" aria-controls="lateral" aria-expanded="false">${ICONE.menu}</button>
      ${emAdministracao() ? '<span class="selo-contexto" title="Você está na Administração da empresa">Administração</span>' : ''}${grupo ? `<span class="migalha"><span>${esc(grupo)}</span><span class="sep">/</span></span>` : ''}<h1 tabindex="-1" title="${esc(titulo)}">${esc(titulo)}</h1>${acoes}
    </div>
    <div class="cabeca-acoes">
      <button type="button" class="icone-btn ajuda-tela" id="ajuda-tela" aria-label="Ajuda desta tela" title="Ajuda desta tela">i</button><a class="icone-btn ajuda-guia" href="#/primeiros-passos" aria-label="Ajuda e primeiros passos" title="Ajuda e primeiros passos">?</a>
      <div class="usuario"><span class="avatar" aria-hidden="true">${esc(iniciais(p))}</span>
        <div class="usuario-meta"><b>${esc(p.nome)}</b><span>${esc(p.email)}</span></div>
        <button class="icone-btn" id="sair" aria-label="Sair" title="Sair">${ICONE.sair}</button></div>
    </div></header>${E.plano?.mensagem ? `<div class="faixa-plano faixa-aviso ${E.plano.fase === 'esgotado' ? 'erro' : 'atencao'}" role="status">${esc(E.plano.mensagem)}</div>` : ''}`;
}

export function ligarCabecalho() {
  $('ajuda-tela').onclick = ev => { const b=ev.currentTarget;import('/ajuda-contextual.js').then(m=>m.abrirAjuda(b)); };
  $('sair').onclick = async e => {
    e.currentTarget.disabled = true;
    try { await api('/api/sair', { metodo: 'POST' }); document.body.replaceChildren(); location.replace('/'); }
    catch (err) { toast(`Não foi possível sair. ${err.message}`, 6000); $('sair').disabled = false; }
  };
  $('menu').onclick = () => {
    if ($('lateral').classList.contains('aberta')) return fecharNavegacao(true);
    $('lateral').classList.add('aberta'); $('menu').setAttribute('aria-expanded', 'true');
    $('lateral').querySelector('a,button')?.focus();
  };
}
function fecharNavegacao(devolverFoco = false) {
  $('lateral').classList.remove('aberta');
  $('menu')?.setAttribute('aria-expanded', 'false');
  if (devolverFoco) $('menu')?.focus();
}
document.addEventListener('keydown', ev => {
  if (!$('lateral')?.classList.contains('aberta') || !matchMedia('(max-width:900px)').matches || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  if (ev.key === 'Escape') { ev.preventDefault(); fecharNavegacao(true); }
  else conterFoco(ev, $('lateral'));
});

// Quem administra a base de uma área vê isso no menu: quantos documentos pedem revisão, ou "Admin da base".
const seloBase = () => {
  const b = E.bases;
  if (!b?.areas.length) return null;
  const nomes = b.areas.map(a => a.nome).join(', ');
  return b.paraRevisar ? { texto: String(b.paraRevisar), alerta: true, dica: `${b.paraRevisar} ${b.paraRevisar === 1 ? 'documento' : 'documentos'} da base de ${nomes} para revisar (nunca revisados ou há mais de ${b.diasRevisao} dias)` }
    : { texto: 'Admin', dica: `Você administra a base de conhecimento de ${nomes}` };
};

// Cartão no início (nova conversa e lista de conversas) para quem administra a base de alguma área.
export function cartaoBase() {
  const b = E.bases;
  if (!b?.areas.length) return '';
  const lista = b.areas.map(a => a.nome), nomes = lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`;
  const docs = b.areas.reduce((t, a) => t + a.documentos, 0);
  const sub = b.paraRevisar ? `${b.paraRevisar} ${b.paraRevisar === 1 ? 'documento pede' : 'documentos pedem'} revisão.`
    : docs ? 'Tudo revisado. Adicione ou atualize os conteúdos quando algo mudar.' : 'A base ainda está vazia: adicione procedimentos, políticas e manuais da área.';
  return `<a class="cartao-base${b.paraRevisar ? ' alerta' : ''}" href="#/conhecimento">${ICONE.livro}<span><b>Você administra a base de ${esc(nomes)}</b><small>${sub}</small></span><span class="cartao-base-ir">${b.paraRevisar ? 'Revisar' : 'Abrir'} ${ICONE.seta || '→'}</span></a>`;
}
export async function recarregarBases() {
  try { E.bases = await api('/api/bases/resumo'); desenharLateral(); } catch { /* segue com o que tinha */ }
}

// Dois contextos, uma sessão: USO (o trabalho de todos, inclusive de quem administra) e ADMINISTRAÇÃO
// (quem tem permissão). Admin é permissão, não outra conta: a troca é só de tela, e cada tela da
// Administração continua protegida no servidor pela permissão dela.
const SECOES_USO = () => [
  { titulo: 'Trabalho', itens: [
    { id: 'conversas', nome: 'Conversas', icone: 'conversa', ativo: h => h === '#/conversas' || h === '#/nova' || h.startsWith('#/c/') },
    { id: 'quick-wins', nome: 'Quick Wins', icone: 'raio', ativo: h => h === '#/quick-wins' || h.startsWith('#/quick-wins/') || h.startsWith('#/qw/') },
    { id: 'pendencias', nome: 'Pendências', icone: 'atividade', ver: () => ehGestor() || !!E.bases?.areas?.length || pode('audit.read') || pode('integrations.approve') || pode('user.read') },
    { id: 'conhecimento', nome: 'Conhecimento', icone: 'livro', selo: seloBase },
    // Administração no primeiro nível de Trabalho, só para quem já tem permissão (a mesma regra do alternador).
    { id: 'administracao', nome: 'Administração', icone: 'engrenagem', ver: () => administra(), href: () => inicioAdmin(), ativo: () => false },
  ] },
];
// Conversas recentes na lateral: no máximo RECENTES_LATERAL, subordinadas a "Conversas"; o histórico completo é a
// tela de Conversas (#/conversas). A lista é a mesma de sempre (E.conversas), sem cópia paralela.
export const RECENTES_LATERAL = 5;
const SECOES_ADMIN = () => [
  { itens: [{ id: 'visao-geral', nome: 'Visão geral', icone: 'visao', ver: () => pode('usage.read') }] },
  { titulo: 'Gestão', itens: [
    { id: 'preparacao', nome: 'Preparar o ambiente', icone: 'visao', ver: () => ['company.manage','usage.read','models.manage','user.read','policy.manage','settings.manage','integrations.manage','integrations.approve'].some(pode) },
    { id: 'revisao-acessos', nome: 'Revisar acessos', icone: 'escudo', ver: () => pode('user.read') },
    { id: 'uso', nome: 'Uso e créditos', icone: 'grafico', ver: () => pode('usage.read') }, { id: 'pessoas', nome: E.plataforma ? 'Áreas e grupos' : 'Pessoas e áreas', icone: 'pessoas', ver: () => pode('user.read') },
    { id: 'modelos', nome: 'Modelos', icone: 'cubo', ver: () => pode('models.manage') }, { id: 'politicas', nome: 'Políticas de IA', icone: 'escudo', ver: () => pode('policy.manage') },
    { id: 'atividade', nome: 'Atividade', icone: 'atividade', ver: () => pode('audit.read') },
    { id: 'integracoes', nome: 'Integrações', icone: 'link', ver: () => !!E.integracoes && (pode('integrations.manage') || pode('integrations.approve')) },
  ] },
  // Administração da empresa (multiempresa): usuários, roles, marca, landing page, URL e configurações.
  E.plataforma ? { titulo: 'Empresa', itens: [
    { id: 'empresa/usuarios', nome: 'Usuários', icone: 'pessoas', ver: () => pode('user.read') },
    { id: 'empresa/roles', nome: 'Perfis e permissões', icone: 'chave', ver: () => pode('role.manage') },
    { id: 'empresa/marca', nome: 'Marca e identidade visual', icone: 'pincel', ver: () => pode('branding.manage') },
    { id: 'empresa/landing', nome: 'Página de apresentação', icone: 'pagina', ver: () => pode('landing_page.manage') },
    { id: 'empresa/url', nome: 'URL e domínio', icone: 'link', ver: () => pode('url.manage') },
    { id: 'empresa/acessos', nome: 'Acessos da equipe de operação', icone: 'escudo', ver: () => pode('audit.read') },
    { id: 'configuracoes', nome: 'Configurações', icone: 'engrenagem', ver: () => pode('settings.manage') },
  ] } : { titulo: 'Organização', itens: [{ id: 'configuracoes', nome: 'Configurações', icone: 'engrenagem', ver: ehAdmin }] },
];
const ROTAS_ADMIN = /^#\/(preparacao|revisao-acessos|visao-geral|uso|pessoas|modelos|politicas|atividade|configuracoes|integracoes|empresa\/)/;
// Contexto da tela. Quem não administra nunca está na Administração, nem digitando o endereço.
export const emAdministracao = (h = location.hash) => ROTAS_ADMIN.test(h || '') && administra();
const itensAdmin = () => SECOES_ADMIN().flatMap(g => g.itens).filter(i => !i.ver || i.ver());
// Tem alguma tela de Administração que pode abrir: vê o alternador "Usar GreenIA | Administração".
export const administra = () => itensAdmin().length > 0;
const SECOES = () => (emAdministracao() ? SECOES_ADMIN() : SECOES_USO());
// Última tela de cada contexto, para a troca voltar exatamente onde a pessoa estava.
const ultima = ctx => { try { return sessionStorage.getItem(`greenia-ultima-${ctx}`); } catch { return null; } };
const guardarUltima = h => { try { sessionStorage.setItem(`greenia-ultima-${emAdministracao(h) ? 'admin' : 'uso'}`, h); } catch {} };
const inicioAdmin = () => ultima('admin') || `#/${itensAdmin()[0]?.id || 'visao-geral'}`;
const inicioUso = () => ultima('uso') || '#/nova';

// Rota da API que cada tela da administração lê. A resposta do servidor decide; a tela só reage.
const API_DA_TELA = { 'visao-geral': 'visao-geral', uso: 'uso', pessoas: 'pessoas', modelos: 'modelos', politicas: 'politica/versoes', atividade: 'eventos', configuracoes: 'config', empresa: 'config', integracoes: 'integracoes' };
const recusado = () => { toast('Esta área é da administração da empresa.'); irPara('#/nova'); };
async function conferirNoServidor(h) {
  const tela = /^#\/([\w-]+)/.exec(h)?.[1];
  try { await api(`/api/admin/${API_DA_TELA[tela] || 'config'}`); }
  catch (e) { if (e.status !== 403) recusado(); return; }   // o 403 dispara greenia:admin-recusado
  location.reload();   // o servidor aceitou: as permissões mudaram desde que a página abriu
}
addEventListener('greenia:admin-recusado', () => { if (ROTAS_ADMIN.test(location.hash)) recusado(); });

export function desenharLateral() {
  const h = location.hash || '';
  const item = i => {
    const ativo = i.ativo ? i.ativo(h) : h === `#/${i.id}` || h.startsWith(`#/${i.id}/`);
    const selo = i.selo?.();
    return `<a class="item-lat item-principal${ativo ? ' ativo' : ''}" href="${esc(i.href ? i.href() : `#/${i.id}`)}" data-item="${esc(i.id)}" ${ativo ? 'aria-current="page"' : ''}>${ICONE[i.icone] || ''}<span class="nome">${i.nome}</span>${selo ? `<span class="selo-lat${selo.alerta ? ' alerta' : ''}" title="${esc(selo.dica)}"><span aria-hidden="true">${esc(selo.texto)}</span><span class="sr">${esc(selo.dica)}</span></span>` : ''}</a>`;
  };
  const lista = E.conversas || [];
  const recentes = lista.length ? `<div class="recentes-lat" role="group" aria-label="Conversas recentes">${lista.slice(0, RECENTES_LATERAL).map(c => `<div class="hc-recente"><a class="item-lat sub${h === `#/c/${c.id}` ? ' ativo' : ''}" href="#/c/${c.id}" title="${esc(c.titulo)}" ${h === `#/c/${c.id}` ? 'aria-current="page"' : ''}><span class="nome">${esc(c.titulo)}</span>${c.sigilosa ? '<span class="selo-lat">Sigilosa</span>' : ''}</a><button type="button" class="hc-acoes" data-hc-acoes="${c.id}" aria-label="Ações de ${esc(c.titulo)}" aria-haspopup="menu" aria-expanded="false">···</button></div>`).join('')}
    ${(E.totalConversas || lista.length) > RECENTES_LATERAL ? `<a class="item-lat sub ver-todas" href="#/conversas">Ver todas (${E.totalConversas || lista.length})</a>` : ''}</div>` : '';
  const adm = emAdministracao(h);
  $('lateral').classList.toggle('modo-admin', adm);
  document.body.dataset.contexto = adm ? 'admin' : 'uso';
  const alternador = administra() ? `<nav class="troca-contexto" aria-label="Contexto">
      <a href="${esc(adm ? inicioUso() : h || '#/nova')}" class="${adm ? '' : 'ativo'}" ${adm ? '' : 'aria-current="page"'}>Usar GreenIA</a>
      <a href="${esc(adm ? h : inicioAdmin())}" class="${adm ? 'ativo' : ''}" ${adm ? 'aria-current="page"' : ''}>Administração</a></nav>` : '';
  $('lateral').innerHTML = `
    <a class="marca" href="${adm ? esc(`#/${itensAdmin()[0]?.id || 'visao-geral'}`) : '#/nova'}" aria-label="${MARCA.propria ? esc(E.publico.empresa || 'Início') : 'GreenIA'}, início">${marcaHtml(E.publico)}</a>${MARCA.propria ? '' : logoEmpresa(E.publico)}
    ${E.plataforma?.adminPlataforma ? `<span class="selo-escopo" title="Você está neste ambiente como administrador da plataforma">Operador · ${esc(E.plataforma.empresa.name)}</span>` : ''}
    ${E.plataforma?.acessoOperador ? `<div class="faixa-aviso atencao acesso-operador" role="status"><b>Acesso da equipe de operação</b><br>Registrado e visível para a empresa. Vale até ${esc(new Date(E.plataforma.acessoOperador.expira).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}.
      <button type="button" class="btn-texto btn-pequeno" id="encerrar-acesso">Encerrar acesso</button></div>` : ''}
    ${alternador}
    ${adm ? `<div class="aviso-contexto">${ICONE.engrenagem || ''}<span><b>Administração da empresa</b><small>Mudanças aqui valem para todas as pessoas.</small></span></div>`
      : `<a class="btn btn-verde nova" href="#/nova" title="Nova conversa (C)">${ICONE.mais} Nova conversa</a>`}
    <button type="button" class="busca-lat" id="abrir-busca">${ICONE.busca}<span>Buscar ou ir para</span><span class="kbd">${teclaPaleta()}</span></button>
    <nav class="lateral-rolagem" aria-label="Navegação">
      ${SECOES().map(s => ({ ...s, itens: s.itens.filter(i => !i.ver || i.ver()) })).filter(s => s.itens.length).map(s => `${s.titulo ? `<h2>${s.titulo}</h2>` : ''}${s.itens.map(item).join('')}`).join('')}
      ${!adm && recentes ? `<section class="recentes-grupo" aria-label="Conversas recentes"><h2>Conversas recentes</h2>${recentes}</section>` : ''}
    </nav>
    <div class="lateral-pe">
      <button class="btn-lat" id="ver-politica">Política de uso de IA</button>
      <button class="btn-lat" id="reportar">Reportar problema</button>
      ${E.plataforma?.adminPlataforma ? '<a class="btn-lat" href="/plataforma">Console da plataforma</a>' : E.operador ? '<a class="btn-lat" href="/operador">Console do operador</a>' : ''}
      ${rodapePlataformaHtml()}
    </div>`;
  if ($('encerrar-acesso')) $('encerrar-acesso').onclick = async () => { try { await api('/api/sair', { metodo: 'POST' }); } catch { /* a sessão já pode ter caído */ } location.href = '/plataforma'; };
  $('ver-politica').onclick = abrirPolitica;
  $('abrir-busca').onclick = () => abrirPaleta();
  $('reportar').onclick = reportarProblema;
  ligarAcoesConversas($('lateral'), lista, async () => { if (location.hash === '#/conversas' || location.hash.startsWith('#/c/')) irPara(location.hash); });
}

export async function recarregarLateral() {
  const [c, q] = await Promise.all([api('/api/conversas?todas=1'), api('/api/quick-wins').catch(() => ({ quickWins: [] }))]);
  E.conversas = c.conversas; E.totalConversas = c.total;
  E.quickWins = q.quickWins || [];
  desenharLateral();
}

async function vistaConversas() { await (await import('/historico-conversas.js')).vistaHistorico(); }


function abrirPolitica() {
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-politica" tabindex="-1">
    <div class="modal-topo"><div class="rotulo">Política de uso de IA</div><button class="icone-btn" id="fechar-modal" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="titulo-politica">Como a empresa usa IA</h2>
    <div class="item"><h3>Conversa normal e conversa sigilosa</h3><p>Dado pessoal, de cliente, financeiro, jurídico ou estratégico só entra em conversa sigilosa, em que a GreenIA usa apenas os recursos de IA autorizados para esse tipo de informação.</p></div>
    <div class="item"><h3>Privacidade das suas conversas</h3><p>${esc(E.publico.privacyNote)}</p></div>
    <div class="item"><h3>Revise antes de usar</h3><p>A IA ajuda, mas pode errar. Confira o resultado antes de enviar ou decidir.</p></div>
    <a href="/politica" class="btn-texto" style="padding-left:0">Abrir a política completa</a></div></div>`;
  const fechar = () => { limparEscape(); $('modal').innerHTML = ''; $('ver-politica')?.focus(); };
  const limparEscape = fecharComEscape(document.querySelector('.modal'), fechar);
  $('fechar-modal').onclick = fechar;
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  document.querySelector('.modal').focus();
}

// Problema reportado: vai para o admin por email. Sem dado sigiloso na descrição.
async function reportarProblema() {
  const { tipos } = await api('/api/problemas/tipos');
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-problema" tabindex="-1" id="form-problema" novalidate>
    <div class="modal-topo"><div class="rotulo">Reportar problema</div><button type="button" class="icone-btn" id="fechar-modal" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="titulo-problema">O que aconteceu?</h2>
    <div class="campo"><span class="legenda">Tipo</span><div class="opcoes">${Object.entries(tipos).map(([v, r], i) => `<label><input type="radio" name="tipo" value="${v}" ${i === 0 ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div></div>
    <div class="campo"><label for="descricao-problema">Descrição</label><textarea class="entrada" id="descricao-problema" rows="5" maxlength="4000"></textarea>
      <span class="ajuda">Conte o que aconteceu e onde. Não cole dados sigilosos aqui: descreva sem eles. O admin recebe por email.</span></div>
    <p class="msg-erro oculto" id="erro-problema" role="alert"></p>
    <div class="linha-botoes"><button class="btn btn-verde">Enviar</button><button type="button" class="btn btn-texto" id="cancelar-problema">Cancelar</button></div></form></div>`;
  const fechar = () => { limparEscape(); $('modal').innerHTML = ''; $('reportar')?.focus(); };
  const limparEscape = fecharComEscape(document.querySelector('.modal'), fechar);
  $('fechar-modal').onclick = fechar;
  $('cancelar-problema').onclick = fechar;
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  $('descricao-problema').focus();
  $('form-problema').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/problemas', { metodo: 'POST', corpo: { tipo: $('form-problema').querySelector('[name=tipo]:checked').value, descricao: $('descricao-problema').value } });
      fechar(); toast('Obrigado. O admin foi avisado.');
    } catch (e) { $('erro-problema').textContent = e.message; $('erro-problema').classList.remove('oculto'); }
  };
}

const GESTAO = ['uso', 'pessoas', 'modelos', 'politicas', 'atividade', 'configuracoes', 'conhecimento'];

async function rota() {
  const antes = new CustomEvent('greenia:antes-navegar', { cancelable: true });
  if (!document.dispatchEvent(antes)) return;
  lembreteAoSair();
  const fimTransicao = transicao();
  fecharNavegacao();
  // Link direto para um campo ("?foco=<id>", vindo de um aviso com ação): a tela abre e o campo fica em destaque.
  const [h, consulta = ''] = location.hash.split('?');
  const foco = /^foco=([a-z0-9-]+)$/.exec(consulta)?.[1] || null;
  // Administração: quem autoriza é o servidor. Quem não administra pergunta a ele (e recebe 403) antes de
  // qualquer tela da administração ser desenhada; a recusa leva de volta ao uso normal.
  if (ROTAS_ADMIN.test(h)) {
    if (!administra()) return conferirNoServidor(h);
    const it = SECOES_ADMIN().flatMap(g => g.itens).find(i => h === `#/${i.id}` || h.startsWith(`#/${i.id}/`));
    if (it?.ver && !it.ver()) return irPara(inicioAdmin() === h ? `#/${itensAdmin()[0].id}` : inicioAdmin());
  }
  if (h) guardarUltima(h);
  // O item ativo da lateral acompanha a rota já no clique, sem esperar a tela carregar os dados.
  if (E.eu) desenharLateral();
  let m;
  try {
    if ((m = /^#\/c\/(\d+)$/.exec(h))) await vistaConversa({ id: Number(m[1]) });
    else if (h === '#/nova') await vistaConversa({});
    else if (h === '#/pendencias' || h === '#/preparacao') await (await import('/acompanhamento.js')).vistaAcompanhamento(h === '#/preparacao');
    else if (h === '#/revisao-acessos') await (await import('/acompanhamento.js')).vistaRevisaoAcessos();
    else if (h === '#/primeiros-passos') (await import('/onboarding.js')).vistaOnboarding();
    else if (h === '#/conversas') await vistaConversas();
    else if (h === '#/quick-wins' || h === '#/quick-wins/programados' || h.startsWith('#/qw/')) await (await import('/quickwin.js')).rotaQuickWin(h);
    else if ((h === '#/integracoes' || h.startsWith('#/integracoes/')) && E.integracoes) await (await import('/integracoes.js')).rotaIntegracoes(h);
    else if (h === '#/visao-geral' && pode('usage.read')) await (await import('/visao.js')).vistaGeral();
    else if ((m = /^#\/empresa\/([a-z]+)$/.exec(h)) && E.plataforma) await (await import('/empresa.js')).rotaEmpresa(m[1]);
    else if ((m = /^#\/([a-z-]+)(?:\/([a-z-]+))?$/.exec(h)) && GESTAO.includes(m[1])) await (await import('/admin.js')).rotaGestao(m[1], m[2]);
    else return irPara('#/nova');   // o início de todos, inclusive de quem administra, é o uso normal
  } catch (e) {
    $('principal').innerHTML = `${cabecalho('GreenIA')}<div class="pagina"><div class="pagina-dentro"><p class="lead">${esc(e.message)}</p><a class="btn btn-verde" href="#/nova">Nova conversa</a></div></div>`;
    ligarCabecalho();
  }
  desenharLateral();
  fimTransicao();
  if (foco) destacarCampo(foco);
  else if (document.activeElement === document.body || $('lateral').contains(document.activeElement)) $('principal').querySelector('h1')?.focus({ preventScroll: true });
}
// O campo pode ser desenhado depois (telas que carregam dados): tenta por alguns segundos.
function destacarCampo(id, tentativas = 30) {
  const el = document.getElementById(id);
  if (!el) { if (tentativas > 0) setTimeout(() => destacarCampo(id, tentativas - 1), 200); return; }
  const alvo = el.closest('label, .campo, section, .grupo-form') || el;
  alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
  alvo.classList.add('campo-destacado');
  setTimeout(() => alvo.classList.remove('campo-destacado'), 4000);
  (el.matches('input, select, textarea, button, a') ? el : el.querySelector('input, select, textarea, button, a'))?.focus({ preventScroll: true });
}

// Itens da paleta de comandos: telas que a pessoa pode abrir, ações, conversas e quick wins.
function itensPaleta() {
  const telas = [...SECOES_USO().map(g => [g, 'Ir para']), ...SECOES_ADMIN().map(g => [g, 'Administração'])]
    .flatMap(([g, grupo]) => g.itens.filter(i => !i.ver || i.ver()).map(i => ({ grupo, nome: i.nome, dica: g.titulo || '', icone: i.icone, href: i.href ? i.href() : `#/${i.id}` })));
  return [
    { grupo: 'Ações', nome: 'Nova conversa', dica: 'C', icone: 'mais', href: '#/nova' },
    { grupo: 'Ajuda', nome: 'Primeiros passos', icone: 'livro', href: '#/primeiros-passos' },
    ...(E.podeCriarQw ? [{ grupo: 'Ações', nome: 'Novo quick win', icone: 'raio', href: '#/qw/nova' }] : []),
    { grupo: 'Ações', nome: 'Política de uso de IA', icone: 'escudo', acao: abrirPolitica },
    ...telas,
    ...E.quickWins.map(q => ({ grupo: 'Quick Wins', nome: q.nome, icone: 'raio', href: `#/qw/${q.id}`, soNaBusca: E.quickWins.length > 5 })),
    ...E.conversas.slice(0, 40).map((c, i) => ({ grupo: 'Conversas', nome: c.titulo, dica: c.quick_win || '', icone: 'conversa', href: `#/c/${c.id}`, soNaBusca: i >= 5 })),
    ...(E.plataforma?.adminPlataforma ? [{ grupo: 'Plataforma', nome: 'Console da plataforma', icone: 'predio', href: '/plataforma' }] : []),
  ];
}

async function iniciar() {
  const [eu, publico] = await Promise.all([api('/api/eu'), api('/api/publico')]);
  definirCsrf(eu.csrf);
  Object.assign(E, { eu: eu.pessoa, publico, retencaoDias: publico.retencaoDias, permQw: eu.quickWins, podeCriarQw: eu.quickWins.criar,
    plano: eu.plano, operador: eu.operador, unidade: eu.unidade, iaConfigurada: eu.iaConfigurada,
    permissoes: eu.permissoes || null, integracoes: !!eu.integracoes, plataforma: eu.plataforma || null, bases: eu.bases || { areas: [], paraRevisar: 0 } });
  definirUnidade(eu.unidade);
  aplicarMarca(publico);
  await definirMarcaPropria(publico);
  if (publico.favicon) document.querySelector('link[rel="icon"]').href = publico.favicon;
  if (publico.empresa) document.title = MARCA.propria ? publico.empresa : `GreenIA · ${publico.empresa}`;
  document.getElementById('fundo-lateral').onclick = () => fecharNavegacao(true);
  iniciarAcessibilidade();
  await recarregarLateral();
  window.addEventListener('hashchange', rota);
  iniciarPaleta(itensPaleta, { atalhos: { c: () => irPara('#/nova') } });
  await rota();
  await pedirCiencia();
}

// Primeiro acesso e cada nova versão da política: a pessoa registra ciência.
export async function pedirCiencia() {
  const pol = await api('/api/politica');
  if (!pol.cienciaPendente) return;
  const { renderizar } = await import('/md.js');
  $('modal').innerHTML = `<div class="modal-fundo"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-ciencia" tabindex="-1">
    <div class="rotulo">Política de uso de IA · versão ${pol.versao}</div>
    <h2 id="titulo-ciencia">${E.eu.ciencia_versao ? 'A política mudou' : 'Antes de começar'}</h2>
    <p class="dica" style="margin:-8px 0 16px">Leia a política. Para usar a GreenIA, registre que você está ciente.</p>
    <div class="bolha-ia" style="max-height:46vh;overflow-y:auto">${renderizar(pol.texto + '\n\n' + pol.secao).html}</div>
    <div class="linha-botoes" style="margin-top:18px"><button class="btn btn-verde" id="dar-ciencia">Li e estou ciente</button><a class="btn-texto" href="/politica" target="_blank">Abrir em outra aba</a></div></div></div>`;
  document.querySelector('.modal').focus();
  $('dar-ciencia').onclick = async () => {
    await api('/api/politica/ciencia', { metodo: 'POST', corpo: { versao: pol.versao } });
    E.eu.ciencia_versao = pol.versao;
    $('modal').innerHTML = '';
    $('principal').querySelector('h1')?.focus({ preventScroll: true });
  };
}
iniciar().catch(e => {
  if (e.status === 401) return; // a API já encaminhou para a entrada
  $('principal').innerHTML = `<div class="pagina"><div class="pagina-dentro"><div class="faixa-aviso erro" role="alert"><strong>Não foi possível abrir o ambiente.</strong><p>${esc(e.message || 'Verifique sua conexão.')}</p><button class="btn" id="reabrir-ambiente">Tentar novamente</button></div></div></div>`;
  $('reabrir-ambiente').onclick = () => location.reload();
});
