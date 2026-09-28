// GreenIA: casca da aplicação (lateral com as seções, cabeçalho) e rotas por hash.
//   #/visao-geral                    como a empresa está usando IA (admin)
//   #/conversas, #/nova, #/c/:id     conversas
//   #/quick-wins, #/qw/:id...        quick wins
//   #/conhecimento                   o que a IA pode usar
//   #/uso #/pessoas #/modelos #/politicas #/atividade #/configuracoes   gestão (admin)
import { api, aplicarMarca, definirCsrf, definirUnidade, esc, ICONE, logoEmpresa, marcaHtml, toast, transicao, vazioHtml, versaoHtml } from '/comum.js';
import { vistaConversa, lembreteAoSair } from '/conversa.js';
import { iniciarPaleta, abrirPaleta, teclaPaleta } from '/comando.js';

export const E = { eu: null, publico: {}, conversas: [], quickWins: [], retencaoDias: 90, rotas: {} };
const $ = id => document.getElementById(id);

export const irPara = hash => { if (location.hash === hash) rota(); else location.hash = hash; };
export const ehAdmin = () => !!E.eu?.admin;
// Permissão granular (multiempresa); na instalação única, as telas de gestão são do admin.
export const pode = perm => (E.permissoes ? E.permissoes.includes(perm) : ehAdmin());
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
      ${emAdministracao() ? '<span class="selo-contexto" title="Você está na Administração da empresa">Administração</span>' : ''}${grupo ? `<span class="migalha"><span>${esc(grupo)}</span><span class="sep">/</span></span>` : ''}<h1>${esc(titulo)}</h1>${acoes}
    </div>
    <div class="cabeca-acoes">
      <div class="usuario"><span class="avatar" aria-hidden="true">${esc(iniciais(p))}</span>
        <div class="usuario-meta"><b>${esc(p.nome)}</b><span>${esc(p.email)}</span></div>
        <button class="icone-btn" id="sair" aria-label="Sair" title="Sair">${ICONE.sair}</button></div>
    </div></header>${E.plano?.mensagem ? `<div class="faixa-plano faixa-aviso ${E.plano.fase === 'esgotado' ? 'erro' : 'atencao'}" role="status">${esc(E.plano.mensagem)}</div>` : ''}`;
}

export function ligarCabecalho() {
  $('sair').onclick = async () => { await api('/api/sair', { metodo: 'POST' }); location.href = '/'; };
  $('menu').onclick = () => { const a = $('lateral').classList.toggle('aberta'); $('menu').setAttribute('aria-expanded', String(a)); };
}

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
    { id: 'quick-wins', nome: 'Quick wins', icone: 'raio', ativo: h => h === '#/quick-wins' || h.startsWith('#/qw/') },
    { id: 'conhecimento', nome: 'Conhecimento', icone: 'livro', selo: seloBase },
  ] },
];
const SECOES_ADMIN = () => [
  { itens: [{ id: 'visao-geral', nome: 'Visão geral', icone: 'visao', ver: () => pode('usage.read') }] },
  { titulo: 'Gestão', itens: [
    { id: 'uso', nome: 'Uso e créditos', icone: 'grafico', ver: () => pode('usage.read') }, { id: 'pessoas', nome: E.plataforma ? 'Áreas e grupos' : 'Pessoas e áreas', icone: 'pessoas', ver: () => pode('user.read') },
    { id: 'modelos', nome: 'Modelos', icone: 'cubo', ver: () => pode('models.manage') }, { id: 'politicas', nome: 'Políticas de IA', icone: 'escudo', ver: () => pode('policy.manage') },
    { id: 'atividade', nome: 'Atividade', icone: 'atividade', ver: () => pode('audit.read') },
  ] },
  // Administração da empresa (multiempresa): usuários, roles, marca, landing page, URL e configurações.
  E.plataforma ? { titulo: 'Empresa', itens: [
    { id: 'empresa/usuarios', nome: 'Usuários', icone: 'pessoas', ver: () => pode('user.read') },
    { id: 'empresa/roles', nome: 'Roles e permissões', icone: 'chave', ver: () => pode('role.manage') },
    { id: 'empresa/marca', nome: 'Branding', icone: 'pincel', ver: () => pode('branding.manage') },
    { id: 'empresa/landing', nome: 'Landing Page', icone: 'pagina', ver: () => pode('landing_page.manage') },
    { id: 'empresa/url', nome: 'URL e domínio', icone: 'link', ver: () => pode('url.manage') },
    { id: 'configuracoes', nome: 'Configurações', icone: 'engrenagem', ver: () => pode('settings.manage') },
  ] } : { titulo: 'Organização', itens: [{ id: 'configuracoes', nome: 'Configurações', icone: 'engrenagem', ver: ehAdmin }] },
];
const ROTAS_ADMIN = /^#\/(visao-geral|uso|pessoas|modelos|politicas|atividade|configuracoes|empresa\/)/;
export const emAdministracao = (h = location.hash) => ROTAS_ADMIN.test(h || '');
const itensAdmin = () => SECOES_ADMIN().flatMap(g => g.itens).filter(i => !i.ver || i.ver());
// Tem alguma tela de Administração que pode abrir: vê o alternador "Usar GreenIA | Administração".
export const administra = () => itensAdmin().length > 0;
const SECOES = () => (emAdministracao() ? SECOES_ADMIN() : SECOES_USO());
// Última tela de cada contexto, para a troca voltar exatamente onde a pessoa estava.
const ultima = ctx => { try { return sessionStorage.getItem(`greenia-ultima-${ctx}`); } catch { return null; } };
const guardarUltima = h => { try { sessionStorage.setItem(`greenia-ultima-${emAdministracao(h) ? 'admin' : 'uso'}`, h); } catch {} };
const inicioAdmin = () => ultima('admin') || `#/${itensAdmin()[0]?.id || 'visao-geral'}`;
const inicioUso = () => ultima('uso') || '#/nova';

export function desenharLateral() {
  const h = location.hash || '';
  const item = i => {
    const ativo = i.ativo ? i.ativo(h) : h === `#/${i.id}` || h.startsWith(`#/${i.id}/`);
    const selo = i.selo?.();
    return `<a class="item-lat${ativo ? ' ativo' : ''}" href="#/${i.id}" ${ativo ? 'aria-current="page"' : ''}>${ICONE[i.icone] || ''}<span class="nome">${i.nome}</span>${selo ? `<span class="selo-lat${selo.alerta ? ' alerta' : ''}" title="${esc(selo.dica)}"><span aria-hidden="true">${esc(selo.texto)}</span><span class="sr">${esc(selo.dica)}</span></span>` : ''}</a>`;
  };
  const recentes = E.conversas.slice(0, 6).map(c => `<a class="item-lat sub${h === `#/c/${c.id}` ? ' ativo' : ''}" href="#/c/${c.id}"><span class="nome">${esc(c.titulo)}</span>${c.sigilosa ? '<span class="selo-lat" title="Conversa sigilosa: a GreenIA usa só recursos autorizados para informação confidencial">Sigilosa</span>' : ''}</a>`).join('');
  const adm = emAdministracao(h);
  $('lateral').classList.toggle('modo-admin', adm);
  document.body.dataset.contexto = adm ? 'admin' : 'uso';
  const alternador = administra() ? `<nav class="troca-contexto" aria-label="Contexto">
      <a href="${esc(adm ? inicioUso() : h || '#/nova')}" class="${adm ? '' : 'ativo'}" ${adm ? '' : 'aria-current="page"'}>Usar GreenIA</a>
      <a href="${esc(adm ? h : inicioAdmin())}" class="${adm ? 'ativo' : ''}" ${adm ? 'aria-current="page"' : ''}>Administração</a></nav>` : '';
  $('lateral').innerHTML = `
    <a class="marca" href="${adm ? esc(`#/${itensAdmin()[0]?.id || 'visao-geral'}`) : '#/nova'}" aria-label="GreenIA, início">${marcaHtml()}</a>${logoEmpresa(E.publico)}
    ${E.plataforma?.adminPlataforma ? `<span class="selo-escopo" title="Você está neste ambiente como administrador da plataforma">Operador · ${esc(E.plataforma.empresa.name)}</span>` : ''}
    ${alternador}
    ${adm ? `<div class="aviso-contexto">${ICONE.engrenagem || ''}<span><b>Administração da empresa</b><small>Mudanças aqui valem para todas as pessoas.</small></span></div>`
      : `<a class="btn btn-verde nova" href="#/nova" title="Nova conversa (C)">${ICONE.mais} Nova conversa</a>`}
    <button type="button" class="busca-lat" id="abrir-busca">${ICONE.busca}<span>Buscar ou ir para</span><span class="kbd">${teclaPaleta()}</span></button>
    <nav class="lateral-rolagem" aria-label="Navegação">
      ${SECOES().map(s => ({ ...s, itens: s.itens.filter(i => !i.ver || i.ver()) })).filter(s => s.itens.length).map(s => `${s.titulo ? `<h2>${s.titulo}</h2>` : ''}${s.itens.map(i => item(i) + (i.id === 'conversas' && !adm ? recentes : '')).join('')}`).join('')}
    </nav>
    <div class="lateral-pe">
      <button class="btn-lat" id="ver-politica">Política de uso de IA</button>
      <button class="btn-lat" id="reportar">Reportar problema</button>
      ${E.plataforma?.adminPlataforma ? '<a class="btn-lat" href="/plataforma">Console da plataforma</a>' : E.operador ? '<a class="btn-lat" href="/operador">Console do operador</a>' : ''}
      ${versaoHtml()}
    </div>`;
  $('ver-politica').onclick = abrirPolitica;
  $('abrir-busca').onclick = () => abrirPaleta();
  $('reportar').onclick = reportarProblema;
}

export async function recarregarLateral() {
  const [c, q] = await Promise.all([api('/api/conversas?todas=1'), api('/api/quick-wins').catch(() => ({ quickWins: [] }))]);
  E.conversas = c.conversas;
  E.quickWins = q.quickWins || [];
  desenharLateral();
}

// Lista de conversas, com convite para organizar o uso recorrente em quick wins.
async function vistaConversas() {
  const { conversas } = await api('/api/conversas?todas=1');
  const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  $('principal').innerHTML = `${cabecalho('Conversas', `<a class="btn btn-verde btn-pequeno" href="#/nova">${ICONE.mais} Nova conversa</a>`)}
    <div class="pagina"><div class="pagina-dentro estreita">
      ${cartaoBase()}
      <p class="lead">Suas conversas ficam salvas só para você por até ${E.retencaoDias} dias sem uso. Tarefas que se repetem funcionam melhor como quick win: instruções, arquivos e conhecimento já configurados, com uso e resultado medidos.</p>
      ${conversas.length ? `<div class="lista">${conversas.map(c => `<a class="lista-item" href="#/c/${c.id}"><span class="principal-texto"><b>${esc(c.titulo)}</b>
        <span>${dataCurta(c.atualizado_em)}${c.quick_win ? ` · ${esc(c.quick_win)}` : ' · conversa livre'}</span></span>${c.sigilosa ? '<span class="selo selo-sigilosa">Sigilosa</span>' : ''}</a>`).join('')}</div>`
        : vazioHtml({ icone: 'conversa', titulo: 'Nenhuma conversa ainda', texto: 'Comece uma conversa para qualquer tarefa, ou abra um quick win para um trabalho que se repete.', acao: '<a class="btn btn-verde" href="#/nova">Nova conversa</a>' })}
      <div class="linha-botoes" style="margin-top:16px"><a class="btn btn-linha" href="#/quick-wins">Ver quick wins</a></div>
    </div></div>`;
  ligarCabecalho();
}

function abrirPolitica() {
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-politica" tabindex="-1">
    <div class="modal-topo"><div class="rotulo">Política de uso de IA</div><button class="icone-btn" id="fechar-modal" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="titulo-politica">Como a empresa usa IA</h2>
    <div class="item"><h3>Conversa normal e conversa sigilosa</h3><p>Dado pessoal, de cliente, financeiro, jurídico ou estratégico só entra em conversa sigilosa, em que a GreenIA usa apenas os recursos de IA autorizados para esse tipo de informação.</p></div>
    <div class="item"><h3>Suas conversas ficam com você</h3><p>${esc(E.publico.privacyNote)}</p></div>
    <div class="item"><h3>Revise antes de usar</h3><p>A IA ajuda, mas pode errar. Confira o resultado antes de enviar ou decidir.</p></div>
    <a href="/politica" class="btn-texto" style="padding-left:0">Abrir a política completa</a></div></div>`;
  const fechar = () => { $('modal').innerHTML = ''; $('ver-politica')?.focus(); };
  $('fechar-modal').onclick = fechar;
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); } });
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
  const fechar = () => { $('modal').innerHTML = ''; $('reportar')?.focus(); };
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
  lembreteAoSair();
  const fimTransicao = transicao();
  $('lateral').classList.remove('aberta');
  const h = location.hash;
  // Administração: só para quem tem a permissão da tela (o servidor recusa de qualquer forma; aqui é para
  // não abrir uma tela vazia). Sem permissão, volta ao uso normal.
  if (emAdministracao(h)) {
    const it = SECOES_ADMIN().flatMap(g => g.itens).find(i => h === `#/${i.id}` || h.startsWith(`#/${i.id}/`));
    if (!administra()) return irPara('#/nova');
    if (it?.ver && !it.ver()) return irPara(inicioAdmin() === h ? `#/${itensAdmin()[0].id}` : inicioAdmin());
  }
  if (h) guardarUltima(h);
  let m;
  try {
    if ((m = /^#\/c\/(\d+)$/.exec(h))) await vistaConversa({ id: Number(m[1]) });
    else if (h === '#/nova') await vistaConversa({});
    else if (h === '#/conversas') await vistaConversas();
    else if (h === '#/quick-wins' || h.startsWith('#/qw/')) await (await import('/quickwin.js')).rotaQuickWin(h);
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
}

// Itens da paleta de comandos: telas que a pessoa pode abrir, ações, conversas e quick wins.
function itensPaleta() {
  const telas = [...SECOES_USO().map(g => [g, 'Ir para']), ...SECOES_ADMIN().map(g => [g, 'Administração'])]
    .flatMap(([g, grupo]) => g.itens.filter(i => !i.ver || i.ver()).map(i => ({ grupo, nome: i.nome, dica: g.titulo || '', icone: i.icone, href: `#/${i.id}` })));
  return [
    { grupo: 'Ações', nome: 'Nova conversa', dica: 'C', icone: 'mais', href: '#/nova' },
    ...(E.podeCriarQw ? [{ grupo: 'Ações', nome: 'Novo quick win', icone: 'raio', href: '#/qw/nova' }] : []),
    { grupo: 'Ações', nome: 'Política de uso de IA', icone: 'escudo', acao: abrirPolitica },
    ...telas,
    ...E.quickWins.map(q => ({ grupo: 'Quick wins', nome: q.nome, icone: 'raio', href: `#/qw/${q.id}`, soNaBusca: E.quickWins.length > 5 })),
    ...E.conversas.slice(0, 40).map((c, i) => ({ grupo: 'Conversas', nome: c.titulo, dica: c.quick_win || '', icone: 'conversa', href: `#/c/${c.id}`, soNaBusca: i >= 5 })),
    ...(E.plataforma?.adminPlataforma ? [{ grupo: 'Plataforma', nome: 'Console da plataforma', icone: 'predio', href: '/plataforma' }] : []),
  ];
}

async function iniciar() {
  const [eu, publico] = await Promise.all([api('/api/eu'), api('/api/publico')]);
  definirCsrf(eu.csrf);
  Object.assign(E, { eu: eu.pessoa, publico, retencaoDias: publico.retencaoDias, permQw: eu.quickWins, podeCriarQw: eu.quickWins.criar,
    plano: eu.plano, operador: eu.operador, unidade: eu.unidade, iaConfigurada: eu.iaConfigurada,
    permissoes: eu.permissoes || null, plataforma: eu.plataforma || null, bases: eu.bases || { areas: [], paraRevisar: 0 } });
  definirUnidade(eu.unidade);
  aplicarMarca(publico);
  if (publico.favicon) document.querySelector('link[rel="icon"]').href = publico.favicon;
  if (publico.empresa) document.title = `GreenIA · ${publico.empresa}`;
  document.getElementById('fundo-lateral').onclick = () => $('lateral').classList.remove('aberta');
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
  };
}
iniciar();
