// GreenIA: casca da aplicação (lateral com as seções, cabeçalho) e rotas por hash.
//   #/visao-geral                    como a empresa está usando IA (admin)
//   #/conversas, #/nova, #/c/:id     conversas
//   #/quick-wins, #/qw/:id...        quick wins
//   #/conhecimento                   o que a IA pode usar
//   #/uso #/pessoas #/modelos #/politicas #/atividade #/configuracoes   gestão (admin)
import { api, aplicarMarca, definirCsrf, definirMarcaPropria, definirUnidade, esc, ICONE, logoEmpresa, MARCA, marcaHtml, rodapePlataformaHtml, toast, transicao, vazioHtml } from '/comum.js';
import { ligarAcoesConversas, grupoData } from '/historico-conversas.js';
import { vistaConversa, lembreteAoSair } from '/conversa.js';
import { iniciarPaleta, abrirPaleta, teclaPaleta } from '/comando.js';
import { iniciarAcessibilidade, conterFoco, fecharComEscape } from '/acessibilidade.js';
import { contaHtml, fecharMenuConta, ICONE_CONTA, itemMenu, ligarConta, separadorMenu, temaMenuHtml } from '/menu-conta.js';

export const E = { eu: null, publico: {}, conversas: [], quickWins: [], retencaoDias: 90, rotas: {} };
const $ = id => document.getElementById(id);

// O histórico pode restaurar o DOM privado pelo back/forward cache sem consultar a sessão.
// Esvazia a página antes de congelar e exige uma leitura nova ao restaurá-la.
window.addEventListener('pagehide', ev => { if (ev.persisted) document.body.replaceChildren(); });
window.addEventListener('pageshow', ev => {
  if (ev.persisted) { document.body.replaceChildren(); location.reload(); }
});

export const irPara = hash => { if (location.hash === hash) rota(); else location.hash = hash; };
// Redirecionamento: substitui o endereço atual, para o Voltar não cair de novo no endereço que redireciona.
export const trocarPara = hash => { if (location.hash === hash) rota(); else location.replace(hash); };
export const ehAdmin = () => !!E.eu?.admin;
// Permissão granular (multiempresa); na instalação única, as telas de gestão são do admin.
export const pode = perm => (E.permissoes ? E.permissoes.includes(perm) : ehAdmin());
window.__greeniaPode = pode;   // telas que não importam este módulo (avisos com ação) consultam a permissão
export const ehGestor = () => ehAdmin() || E.eu?.areas.some(a => a.responsavel) || !!E.podeCriarQw;


// Topo mínimo (padrão assistente): só o título da tela (o h1 da página) e, numa conversa, o menu "…" dela. Ajuda,
// tema, política, relato de problema, troca para a Administração e Sair ficam no menu da conta, no pé da lateral.
export function cabecalho(titulo, acoes = '') {
  return `<header class="cabeca">
    <div class="cabeca-titulo">
      <button class="icone-btn menu-btn" id="menu" aria-label="Abrir navegação" aria-controls="lateral" aria-expanded="false">${ICONE.menu}<span>Menu</span></button>
      <h1 tabindex="-1" title="${esc(titulo)}">${esc(titulo)}</h1>${acoes}
    </div>
    <div class="cabeca-acoes">${emAdministracao() ? '' : `<a class="icone-btn nova-topo" href="#/nova" aria-label="Nova conversa" title="Nova conversa">${ICONE.mais}</a>`}</div></header>${E.plano?.mensagem ? `<div class="faixa-plano faixa-aviso ${E.plano.fase === 'esgotado' ? 'erro' : 'atencao'}" role="status">${esc(E.plano.mensagem)}</div>` : ''}`;
}

export function ligarCabecalho() {
  $('menu').onclick = () => {
    if ($('lateral').classList.contains('aberta')) return fecharNavegacao(true);
    $('lateral').classList.add('aberta'); $('menu').setAttribute('aria-expanded', 'true');
    $('lateral').querySelector('a,button')?.focus();
  };
}
async function sair(e) {
  const b = e?.currentTarget || $('sair'); fecharMenuConta();
  if (b) b.disabled = true;
  $('conta')?.setAttribute('aria-busy', 'true');
  try { await api('/api/sair', { metodo: 'POST' }); document.body.replaceChildren(); location.replace('/'); }
  catch (err) { toast(`Não foi possível sair. ${err.message}`, 6000); if (b) b.disabled = false; $('conta')?.removeAttribute('aria-busy'); $('conta')?.focus(); }
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

// Quem administra a base de uma área vê no menu quantos documentos pedem revisão (só quando há o que fazer).
const seloBase = () => {
  const b = E.bases;
  if (!b?.areas.length || !b.paraRevisar) return null;
  const nomes = b.areas.map(a => a.nome).join(', ');
  return { texto: String(b.paraRevisar), alerta: true, dica: `${b.paraRevisar} ${b.paraRevisar === 1 ? 'documento' : 'documentos'} da base de ${nomes} para revisar (nunca revisados ou há mais de ${b.diasRevisao} dias)` };
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
  { titulo: 'Atalhos', itens: [
    // "Conversas" (a tela com busca, filtro e "Excluir todas") não é atalho: a lateral já mostra o histórico, e o
    // "Ver todas" do histórico leva a ela. Continua na busca (Ctrl K).
    { id: 'conversas', nome: 'Conversas', icone: 'conversa', naLateral: () => false },
    { id: 'quick-wins', nome: 'Quick Wins', icone: 'raio', ativo: h => h === '#/quick-wins' || h.startsWith('#/quick-wins/') || h.startsWith('#/qw/') },
    { id: 'conhecimento', nome: 'Conhecimento', icone: 'livro', selo: seloBase },
    // Pendências: atalho só quando há o que resolver (com a contagem) ou quando a tela está aberta; o endereço e a
    // busca continuam valendo sempre para quem pode acompanhar.
    { id: 'pendencias', nome: 'Pendências', icone: 'atividade', ver: podeAcompanhar,
      naLateral: h => E.pendencias > 0 || h === '#/pendencias',
      selo: () => (E.pendencias > 0 ? { texto: String(E.pendencias), alerta: true, dica: `${E.pendencias} ${E.pendencias === 1 ? 'pendência' : 'pendências'} para resolver` } : null) },
  ] },
];
const podeAcompanhar = () => ehGestor() || !!E.bases?.areas?.length || pode('audit.read') || pode('integrations.approve') || pode('user.read');
// Agrupada por tema, com um ícone diferente por item e rótulos curtos (o mesmo texto do título de cada tela).
// Poucos itens (no máximo nove): o que é raro vive em abas da tela do mesmo assunto. Preparar o ambiente fica no alto
// da Visão geral; Acessos do suporte é uma aba de Atividade; Marca, Página de apresentação e URL e domínio são abas
// de "Marca e endereço".
export const podePreparar = () => ['company.manage', 'usage.read', 'models.manage', 'user.read', 'policy.manage', 'settings.manage', 'integrations.manage', 'integrations.approve'].some(pode);
export const ABAS_EMPRESA = () => [['marca', 'Marca', 'branding.manage'], ['landing', 'Página de apresentação', 'landing_page.manage'], ['url', 'URL e domínio', 'url.manage']].filter(([, , perm]) => pode(perm));
const SECOES_ADMIN = () => [
  { itens: [
    { id: 'visao-geral', nome: 'Visão geral', icone: 'visao', ver: podePreparar },
  ] },
  { titulo: 'Pessoas e IA', itens: [
    // Uma tela só para pessoas, com abas (Pessoas, Áreas, Grupos, Perfis, Quem cria Quick Wins): cada aba aparece
    // para quem tem a permissão dela (TELAS.pessoas em admin.js).
    { id: 'pessoas', nome: 'Pessoas', icone: 'pessoas', ver: () => pode('user.read') || (!!E.plataforma && pode('role.manage')) },
    { id: 'modelos', nome: 'Modelos', icone: 'cubo', ver: () => pode('models.manage') },
    { id: 'politicas', nome: 'Políticas de IA', icone: 'escudo', ver: () => pode('policy.manage') },
    { id: 'integracoes', nome: 'Integrações', icone: 'servidor', ver: () => !!E.integracoes && (pode('integrations.manage') || pode('integrations.approve')) },
  ] },
  { titulo: 'Acompanhar', itens: [
    { id: 'uso', nome: 'Uso e créditos', icone: 'grafico', ver: () => pode('usage.read') },
    { id: 'atividade', nome: 'Atividade', icone: 'atividade', ver: () => pode('audit.read') },
  ] },
  { titulo: 'Empresa', itens: [
    ...(E.plataforma ? [{ id: 'empresa', nome: 'Marca e endereço', icone: 'pincel', href: () => `#/empresa/${ABAS_EMPRESA()[0]?.[0] || 'marca'}`, ver: () => ABAS_EMPRESA().length > 0 }] : []),
    { id: 'configuracoes', nome: 'Configurações', icone: 'engrenagem', ver: () => (E.plataforma ? pode('settings.manage') : ehAdmin()) },
  ] },
];
// Telas da Administração que não têm item próprio no menu: a busca (Ctrl K) continua levando direto a elas.
const ATALHOS_ADMIN = () => [
  ...(podePreparar() ? [{ nome: 'Preparar o ambiente', icone: 'lista', href: '#/visao-geral?passos=1' }] : []),
  ...(E.plataforma ? ABAS_EMPRESA().map(([id, nome]) => ({ nome: id === 'marca' ? 'Marca e identidade visual' : nome, icone: { marca: 'pincel', landing: 'pagina', url: 'link' }[id], href: `#/empresa/${id}` })) : []),
  ...(E.plataforma && pode('audit.read') ? [{ nome: 'Acessos do suporte', icone: 'cadeado', href: '#/atividade/suporte' }] : []),
];
const hrefItem = i => (i.href ? i.href() : `#/${i.id}`);
const ROTAS_ADMIN = /^#\/(preparacao|revisao-acessos|visao-geral|uso|pessoas|modelos|politicas|atividade|configuracoes|integracoes|empresa(?:\/|$|\?))/;
// Contexto da tela. Quem não administra nunca está na Administração, nem digitando o endereço.
export const emAdministracao = (h = location.hash) => ROTAS_ADMIN.test(h || '') && administra();
const itensAdmin = () => SECOES_ADMIN().flatMap(g => g.itens).filter(i => !i.ver || i.ver());
// Tem alguma tela de Administração que pode abrir: vê o alternador "Usar GreenIA | Administração".
export const administra = () => itensAdmin().length > 0;
const SECOES = () => (emAdministracao() ? SECOES_ADMIN() : SECOES_USO());
// Última tela de cada contexto, para a troca voltar exatamente onde a pessoa estava.
const ultima = ctx => { try { return sessionStorage.getItem(`greenia-ultima-${ctx}`); } catch { return null; } };
const guardarUltima = h => { try { sessionStorage.setItem(`greenia-ultima-${emAdministracao(h) ? 'admin' : 'uso'}`, h); } catch {} };
const primeiraAdmin = () => (itensAdmin()[0] ? hrefItem(itensAdmin()[0]) : '#/visao-geral');
const inicioAdmin = () => ultima('admin') || primeiraAdmin();
const inicioUso = () => ultima('uso') || '#/nova';

// Rota da API que cada tela da administração lê. A resposta do servidor decide; a tela só reage.
const API_DA_TELA = { 'visao-geral': 'visao-geral', uso: 'uso', pessoas: 'pessoas', modelos: 'modelos', politicas: 'politica/versoes', atividade: 'eventos', configuracoes: 'config', empresa: 'config', integracoes: 'integracoes' };
const recusado = () => { toast('Esta tela é da administração da empresa. Se precisar dela, peça acesso a quem administra a IA na sua empresa.', 'info'); trocarPara('#/nova'); };
async function conferirNoServidor(h) {
  const tela = /^#\/([\w-]+)/.exec(h)?.[1];
  try { await api(`/api/admin/${API_DA_TELA[tela] || 'config'}`); }
  catch (e) { if (e.status !== 403) recusado(); return; }   // o 403 dispara greenia:admin-recusado
  location.reload();   // o servidor aceitou: as permissões mudaram desde que a página abriu
}
addEventListener('greenia:admin-recusado', () => { if (ROTAS_ADMIN.test(location.hash)) recusado(); });

// Lateral recolhida (só no computador): fica lembrada neste navegador.
const CHAVE_RECOLHIDA = 'greenia-lateral-recolhida';
const lerRecolhida = () => { try { return localStorage.getItem(CHAVE_RECOLHIDA) === '1'; } catch { return false; } };
const recolhida = () => document.body.classList.contains('lateral-recolhida');
function alternarRecolhida() {
  const v = !recolhida();
  try { if (v) localStorage.setItem(CHAVE_RECOLHIDA, '1'); else localStorage.removeItem(CHAVE_RECOLHIDA); } catch { /* sem armazenamento: vale nesta aba */ }
  document.body.classList.toggle('lateral-recolhida', v);
  desenharLateral();
  $('recolher-lateral')?.focus();
}

// Histórico na lateral, agrupado por data (Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, mês/ano). Mostra de 50 em
// 50: ao chegar no fim, desenha os próximos já carregados e, quando acabam, busca a próxima página no servidor.
const PASSO_HISTORICO = 50;
let limiteHistorico = PASSO_HISTORICO, buscandoHistorico = false, observadorHistorico = null, ultimoMais = 0;
async function maisHistorico(porRolagem = false) {
  // O clique e a rolagem até o fim podem pedir juntos: a rolagem não repete um pedido recém-feito.
  if (porRolagem && Date.now() - ultimoMais < 400) return;
  ultimoMais = Date.now();
  const lista = E.conversas || [];
  if (limiteHistorico < lista.length) { limiteHistorico += PASSO_HISTORICO; return desenharLateral(); }
  if (buscandoHistorico || lista.length >= (E.totalConversas || 0) || lista.length % PASSO_HISTORICO) return;
  buscandoHistorico = true;
  try {
    const d = await api(`/api/conversas?todas=1&pagina=${lista.length / PASSO_HISTORICO}`, { independenteDaRota: true });
    const ids = new Set(lista.map(c => c.id));
    E.conversas = [...lista, ...d.conversas.filter(c => !ids.has(c.id))]; E.totalConversas = d.total;
    limiteHistorico += PASSO_HISTORICO;
  } catch (e) { toast(`Não foi possível carregar mais conversas. ${e.message}`); }
  finally { buscandoHistorico = false; }
  desenharLateral();
}
function historicoHtml(lista, h) {
  if (!lista.length) return `<section class="historico-lat" aria-labelledby="hist-titulo"><div class="hist-cab"><h2 id="hist-titulo">Conversas</h2></div><p class="hist-vazio">Suas conversas aparecem aqui.</p></section>`;
  const visiveis = lista.slice(0, limiteHistorico), grupos = new Map();
  for (const c of visiveis) { const g = grupoData(c.atualizado_em); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(c); }
  const total = Math.max(E.totalConversas || 0, lista.length);
  const linha = c => { const atual = h === `#/c/${c.id}`; return `<div class="hc-recente"><a class="item-lat sub hist-item${atual ? ' ativo' : ''}" href="#/c/${c.id}" title="${esc(c.titulo)}" ${atual ? 'aria-current="page"' : ''}><span class="nome">${esc(c.titulo)}</span>${c.sigilosa ? `<span class="hist-sigilo" title="Conversa sigilosa">${ICONE.cadeado}<span class="sr">Sigilosa</span></span>` : ''}</a><button type="button" class="hc-acoes" data-hc-acoes="${c.id}" aria-label="Ações de ${esc(c.titulo)}" aria-haspopup="menu" aria-expanded="false">${ICONE.opcoes}</button></div>`; };
  let n = 0;
  return `<section class="historico-lat" aria-labelledby="hist-titulo">
    <div class="hist-cab"><h2 id="hist-titulo">Conversas</h2><a class="ver-todas" href="#/conversas" title="Buscar, filtrar e organizar todas as conversas" ${h === '#/conversas' ? 'aria-current="page"' : ''}>Ver todas</a></div>
    ${[...grupos].map(([g, cs]) => { const id = `hist-g${n++}`; return `<div class="hist-grupo" role="group" aria-labelledby="${id}"><h3 id="${id}">${esc(g)}</h3>${cs.map(linha).join('')}</div>`; }).join('')}
    ${visiveis.length < total ? '<button type="button" class="hist-mais" id="hist-mais">Mostrar mais conversas</button>' : ''}
  </section>`;
}

// Conta no pé da lateral (padrão assistente): avatar e nome abrem um menu com Ajuda, Tema, Política de uso de IA,
// Reportar problema, a troca para a Administração (só para quem administra) e Sair. É o único lugar da troca de
// contexto: "Administração" no uso; "Usar a GreenIA" na Administração.
function contaLateralHtml(adm) {
  const p = E.eu;
  const troca = !administra() ? '' : adm
    ? itemMenu(`href="${esc(inicioUso())}" data-contexto="uso"`, ICONE.conversa, MARCA.propria ? 'Usar a IA' : 'Usar a GreenIA')
    : itemMenu(`href="${esc(inicioAdmin())}" data-contexto="admin"`, ICONE.engrenagem, 'Administração');
  const consoles = E.plataforma?.adminPlataforma ? itemMenu('href="/plataforma"', ICONE.predio, 'Console da plataforma') : E.operador ? itemMenu('href="/operador"', ICONE.servidor, 'Console do operador') : '';
  return contaHtml({ nome: p.nome || p.email, email: p.email, sub: E.publico?.empresa || '', dica: recolhida(), itens: `
    ${itemMenu('id="ajuda-tela" aria-haspopup="dialog"', ICONE_CONTA.ajuda, 'Ajuda')}
    ${temaMenuHtml()}
    ${itemMenu('id="ver-politica" aria-haspopup="dialog"', ICONE.escudo, 'Política de uso de IA')}
    ${itemMenu('id="reportar" aria-haspopup="dialog"', ICONE_CONTA.alerta, 'Reportar problema')}
    ${troca || consoles ? `${separadorMenu}${troca}${consoles}` : ''}
    ${separadorMenu}
    ${itemMenu('id="sair"', ICONE.sair, 'Sair')}` });
}
// Ao fechar o diálogo aberto pelo menu, o foco volta ao botão da conta.
const ACOES_CONTA = {
  'ajuda-tela': () => import('/ajuda-contextual.js').then(x => x.abrirAjuda($('conta'))),
  'ver-politica': () => abrirPolitica($('conta')),
  reportar: () => reportarProblema('', $('conta')),
  sair,
};

export function desenharLateral() {
  const h = location.hash || '';
  fecharMenuConta();
  observadorHistorico?.disconnect();
  const rail = recolhida();
  const dica = nome => (rail ? ` title="${esc(nome)}"` : '');
  const item = i => {
    const ativo = i.ativo ? i.ativo(h) : h === `#/${i.id}` || h.startsWith(`#/${i.id}/`);
    const selo = i.selo?.();
    return `<a class="item-lat item-principal${ativo ? ' ativo' : ''}" href="${esc(hrefItem(i))}" data-item="${esc(i.id)}" ${ativo ? 'aria-current="page"' : ''}${dica(i.nome)}>${ICONE[i.icone] || ''}<span class="nome">${i.nome}</span>${selo ? `<span class="selo-lat${selo.alerta ? ' alerta' : ''}" title="${esc(selo.dica)}"><span aria-hidden="true">${esc(selo.texto)}</span><span class="sr">${esc(selo.dica)}</span></span>` : ''}</a>`;
  };
  const lista = E.conversas || [];
  const adm = emAdministracao(h);
  $('lateral').classList.toggle('modo-admin', adm);
  document.body.dataset.contexto = adm ? 'admin' : 'uso';
  // Mantém a posição da rolagem do histórico quando a lateral é redesenhada (a cada troca de tela).
  const rolagem = $('lateral').querySelector('.lateral-rolagem')?.scrollTop || 0;
  const secoes = SECOES().map(s => ({ ...s, itens: s.itens.filter(i => (!i.ver || i.ver()) && (!i.naLateral || i.naLateral(h))) })).filter(s => s.itens.length);
  const operador = E.plataforma?.acessoOperador;
  $('lateral').innerHTML = `
    <div class="lat-topo">
      <a class="marca" href="${adm ? esc(primeiraAdmin()) : '#/nova'}" aria-label="${MARCA.propria ? esc(E.publico.empresa || 'Início') : 'GreenIA'}, início">${marcaHtml(E.publico)}</a>
      ${operador ? '' : `<button type="button" class="icone-btn lat-recolher" id="recolher-lateral" aria-controls="lateral" aria-expanded="${!rail}" aria-label="${rail ? 'Expandir a barra lateral' : 'Recolher a barra lateral'}" title="${rail ? 'Expandir a barra lateral' : 'Recolher a barra lateral'}">${ICONE_CONTA.painel}</button>`}
      <button type="button" class="icone-btn fechar-lateral" id="fechar-lateral" aria-label="Fechar menu">${ICONE.fechar}</button>
    </div>
    ${MARCA.propria ? '' : logoEmpresa(E.publico)}
    ${E.plataforma?.adminPlataforma ? `<span class="selo-escopo" title="Você está neste ambiente como administrador da plataforma">Operador · ${esc(E.plataforma.empresa.name)}</span>` : ''}
    ${operador ? `<div class="faixa-aviso atencao acesso-operador" role="status"><b>Acesso da equipe de operação</b><br>Registrado e visível para a empresa. Vale até ${esc(new Date(operador.expira).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}.
      <button type="button" class="btn-texto btn-pequeno" id="encerrar-acesso">Encerrar acesso</button></div>` : ''}
    ${adm ? `<p class="selo-contexto lat-contexto"${dica('Administração da empresa')}>${ICONE.engrenagem}<span class="nome">Administração</span></p>` : ''}
    <div class="lat-acoes">
      ${adm ? '' : `<a class="item-lat nova" href="#/nova" ${h === '#/nova' ? 'aria-current="page"' : ''}${dica('Nova conversa (C)')}>${ICONE.mais}<span class="nome">Nova conversa</span></a>`}
      <button type="button" class="item-lat busca-lat" id="abrir-busca"${dica(`Buscar (${teclaPaleta()})`)}>${ICONE.busca}<span class="nome">Buscar</span><span class="kbd">${teclaPaleta()}</span></button>
    </div>
    <nav class="lateral-rolagem" aria-label="Navegação">
      ${secoes.map(s => `${adm && s.titulo ? `<h2>${s.titulo}</h2>` : ''}<div class="lat-grupo">${s.itens.map(item).join('')}</div>`).join('')}
      ${adm ? '' : historicoHtml(lista, h)}
    </nav>
    <div class="lateral-pe">
      ${E.eu ? contaLateralHtml(adm) : ''}
      ${rodapePlataformaHtml()}
    </div>`;
  const nav = $('lateral').querySelector('.lateral-rolagem');
  nav.scrollTop = rolagem;
  if ($('encerrar-acesso')) $('encerrar-acesso').onclick = async () => { try { await api('/api/sair', { metodo: 'POST' }); } catch { /* a sessão já pode ter caído */ } location.href = '/plataforma'; };
  $('fechar-lateral').onclick = () => fecharNavegacao(true);
  if ($('recolher-lateral')) $('recolher-lateral').onclick = alternarRecolhida;
  $('abrir-busca').onclick = () => abrirPaleta();
  ligarConta(ACOES_CONTA);
  if ($('hist-mais')) {
    $('hist-mais').onclick = () => maisHistorico();
    // Rolagem infinita: ao rolar até o fim do histórico, carrega os próximos sem precisar clicar.
    if ('IntersectionObserver' in window && !rail) {
      observadorHistorico = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && nav.scrollTop > 0) maisHistorico(true); }, { root: nav });
      observadorHistorico.observe($('hist-mais'));
    }
  }
  ligarAcoesConversas($('lateral'), lista, async () => { if (location.hash === '#/conversas' || location.hash.startsWith('#/c/')) irPara(location.hash); });
}

export async function recarregarLateral() {
  const [c, q] = await Promise.all([api('/api/conversas?todas=1', { independenteDaRota: true }), api('/api/quick-wins', { independenteDaRota: true }).catch(() => ({ quickWins: [] }))]);
  E.conversas = c.conversas; E.totalConversas = c.total;
  E.quickWins = q.quickWins || [];
  desenharLateral();
}
// Pendências: só a contagem, para o atalho da lateral aparecer quando há o que resolver.
export async function recarregarPendencias() {
  if (!podeAcompanhar()) { E.pendencias = 0; return; }
  try { E.pendencias = (await api('/api/acompanhamento', { independenteDaRota: true })).pendencias.length; desenharLateral(); }
  catch { /* sem a contagem, o atalho fica oculto; a tela continua no endereço e na busca */ }
}

async function vistaConversas() { await (await import('/historico-conversas.js')).vistaHistorico(); }


// Ao fechar, o foco volta a quem abriu; se quem abriu era um item do menu da conta (já fechado), ao botão da conta.
const voltarFoco = origem => () => ((origem?.isConnected && origem.offsetParent !== null) ? origem : $('conta'))?.focus();
function abrirPolitica(origem = document.activeElement) {
  const devolver = voltarFoco(origem);
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-politica" tabindex="-1">
    <div class="modal-topo"><div class="rotulo">Política de uso de IA</div><button class="icone-btn" id="fechar-modal" aria-label="Fechar">${ICONE.fechar}<span>Fechar</span></button></div>
    <h2 id="titulo-politica">Como a empresa usa IA</h2>
    <div class="item"><h3>Conversa normal e conversa sigilosa</h3><p>Dado pessoal, de cliente, financeiro, jurídico ou estratégico só entra em conversa sigilosa, em que a GreenIA usa apenas a IA aprovada para dados sigilosos.</p></div>
    <div class="item"><h3>Privacidade das suas conversas</h3><p>${esc(E.publico.privacyNote)}</p></div>
    <div class="item"><h3>Revise antes de usar</h3><p>A IA ajuda, mas pode errar. Confira o resultado antes de enviar ou decidir.</p></div>
    <a href="/politica" class="btn-texto" style="padding-left:0">Abrir a política completa</a></div></div>`;
  const fechar = () => { limparEscape(); $('modal').innerHTML = ''; devolver(); };
  const limparEscape = fecharComEscape(document.querySelector('.modal'), fechar);
  $('fechar-modal').onclick = fechar;
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  document.querySelector('.modal').focus();
}

// Problema reportado: vai para o admin por email. Sem dado sigiloso na descrição.
async function reportarProblema(contexto = '', origem = document.activeElement) {
  const devolver = voltarFoco(origem);
  const { tipos } = await api('/api/problemas/tipos');
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-problema" tabindex="-1" id="form-problema" novalidate>
    <div class="modal-topo"><div class="rotulo">Reportar problema</div><button type="button" class="icone-btn" id="fechar-modal" aria-label="Fechar">${ICONE.fechar}<span>Fechar</span></button></div>
    <h2 id="titulo-problema">O que aconteceu?</h2>
    <div class="campo"><span class="legenda">Tipo</span><div class="opcoes">${Object.entries(tipos).map(([v, r], i) => `<label><input type="radio" name="tipo" value="${v}" ${i === 0 ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div></div>
    <div class="campo"><label for="descricao-problema">Descrição</label><textarea class="entrada" id="descricao-problema" rows="5" maxlength="4000"></textarea>
      <span class="ajuda">Conte o que aconteceu e onde. Não cole dados sigilosos aqui: descreva sem eles. O admin recebe por email.</span></div>
    <p class="msg-erro oculto" id="erro-problema" role="alert"></p>
    <div class="linha-botoes"><button class="btn btn-verde">Enviar</button><button type="button" class="btn btn-texto" id="cancelar-problema">Cancelar</button></div></form></div>`;
  const fechar = () => { limparEscape(); $('modal').innerHTML = ''; devolver(); };
  const limparEscape = fecharComEscape(document.querySelector('.modal'), fechar);
  $('fechar-modal').onclick = fechar;
  $('cancelar-problema').onclick = fechar;
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  if (typeof contexto === 'string') $('descricao-problema').value = contexto;
  $('descricao-problema').focus();
  $('form-problema').onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api('/api/problemas', { metodo: 'POST', corpo: { tipo: $('form-problema').querySelector('[name=tipo]:checked').value, descricao: $('descricao-problema').value } });
      fechar(); toast('Obrigado. O admin foi avisado.');
    } catch (e) { $('erro-problema').textContent = e.message; $('erro-problema').classList.remove('oculto'); }
  };
}

document.addEventListener('click', ev => {
  const b = ev.target.closest?.('[data-relatar-limitacao]');
  if (!b) return;
  reportarProblema(`Peço uma revisão de configuração: ${b.dataset.relatarLimitacao}.\nOnde revisar: ${b.dataset.localLimitacao || 'Integrações'}.\nAvalie a necessidade e a proteção dos dados antes de alterar. Não incluí o conteúdo da conversa neste relato.`).catch(e => toast(`Não foi possível abrir a solicitação. Tente novamente. ${e.message}`));
});

const GESTAO = ['uso', 'pessoas', 'modelos', 'politicas', 'atividade', 'configuracoes', 'conhecimento'];

// A resposta de uma navegação antiga não substitui a tela atual.
let versaoNavegacao = 0;
function telaIntegracoesDesligadas() {
  if (E.eu) desenharLateral();
  // Estado vazio: uma frase e uma ação (o que as integrações fazem fica na Ajuda da tela).
  $('principal').innerHTML = `${cabecalho('Integrações')}<div class="pagina"><div class="pagina-dentro">
    <div class="vazio adm-vazio" role="status">${ICONE.servidor || ''}<h2>As integrações estão desligadas nesta empresa</h2>
      <p>${pode('settings.manage') ? 'Ligue em Configurações, no bloco Integrações.' : 'Quem administra a empresa liga esse recurso em Configurações.'}</p>
      ${pode('settings.manage') ? '<a class="btn btn-verde" href="#/configuracoes?foco=cfg-integracoes">Abrir Configurações</a>' : ''}</div></div></div>`;
  ligarCabecalho();
}

async function rota() {
  const antes = new CustomEvent('greenia:antes-navegar', { cancelable: true });
  if (!document.dispatchEvent(antes)) return;
  const versao = ++versaoNavegacao;
  const importarTela = async nome => {
    const modulo = await import(nome);
    if (versao !== versaoNavegacao) throw Object.assign(new Error('Navegação substituída'), { name: 'AbortError' });
    return modulo;
  };
  lembreteAoSair();
  const fimTransicao = transicao();
  fecharNavegacao();
  // Link direto para um campo ("?foco=<id>", vindo de um aviso com ação): a tela abre e o campo fica em destaque.
  const [h, consulta = ''] = location.hash.split('?');
  const focoPedido = new URLSearchParams(consulta).get('foco');
  const foco = /^[a-z0-9-]+$/.test(focoPedido || '') ? focoPedido : null;
  // Endereços antigos de pessoas (Usuários, Perfis e permissões, Revisar acessos, abas antigas): a tela agora é
  // Pessoas, com abas. Troca o endereço sem deixar rastro no histórico e diz o motivo.
  const novo = enderecoNovo(h, consulta);
  if (novo) { toast(motivoEndereco(h), 'info'); return trocarPara(novo); }
  // Administração: quem autoriza é o servidor. Quem não administra pergunta a ele (e recebe 403) antes de
  // qualquer tela da administração ser desenhada; a recusa leva de volta ao uso normal.
  if (ROTAS_ADMIN.test(h)) {
    if (!administra()) return conferirNoServidor(h);
    const it = SECOES_ADMIN().flatMap(g => g.itens).find(i => h === `#/${i.id}` || h.startsWith(`#/${i.id}/`));
    // Integrações desligadas: a tela explica onde ligar, em vez de levar a outra tela sem dizer por quê.
    if (/^#\/integracoes/.test(h) && !E.integracoes) return telaIntegracoesDesligadas();
    if (it?.ver && !it.ver()) return trocarPara(inicioAdmin() === h ? `#/${itensAdmin()[0].id}` : inicioAdmin());
  }
  if (h) guardarUltima(h);
  // O item ativo da lateral acompanha a rota já no clique, sem esperar a tela carregar os dados.
  if (E.eu) desenharLateral();
  // A tela anterior deixa de oferecer ações enquanto o próximo destino está sendo aberto.
  // Isso impede usar um seletor ou resultado antigo como se pertencesse à nova conversa.
  $('principal').setAttribute('aria-busy', 'true');
  $('principal').innerHTML = '<div class="pagina" role="status"><p>Abrindo a tela escolhida…</p></div>';
  let m;
  try {
    if ((m = /^#\/c\/(\d+)$/.exec(h))) await vistaConversa({ id: Number(m[1]) });
    else if (h === '#/nova') await vistaConversa({});
    else if (h === '#/pendencias') await (await importarTela('/acompanhamento.js')).vistaAcompanhamento();
    else if (h === '#/primeiros-passos') (await importarTela('/onboarding.js')).vistaOnboarding();
    else if (h === '#/conversas') await vistaConversas();
    else if (h === '#/quick-wins' || h.startsWith('#/quick-wins/') || h.startsWith('#/qw/')) await (await importarTela('/quickwin.js')).rotaQuickWin(h);
    else if ((h === '#/integracoes' || h.startsWith('#/integracoes?') || h.startsWith('#/integracoes/')) && E.integracoes) await (await importarTela('/integracoes.js')).rotaIntegracoes(h);
    else if (h === '#/visao-geral' && podePreparar()) await (await importarTela('/visao.js')).vistaGeral();
    else if ((m = /^#\/empresa(?:\/([a-z]+))?$/.exec(h)) && E.plataforma) await (await importarTela('/admin.js')).rotaGestao('empresa', m[1] || '');
    else if ((m = /^#\/([a-z-]+)(?:\/([a-z-]+))?$/.exec(h)) && GESTAO.includes(m[1])) await (await importarTela('/admin.js')).rotaGestao(m[1], m[2]);
    else return irPara('#/nova');   // o início de todos, inclusive de quem administra, é o uso normal
  } catch (e) {
    if (versao !== versaoNavegacao || e.name === 'AbortError') return;
    $('principal').innerHTML = `${cabecalho('GreenIA')}<div class="pagina"><div class="pagina-dentro"><div class="faixa-aviso erro" role="alert"><h2>Não foi possível abrir esta tela</h2><p>A tarefa não foi concluída. Tente novamente para continuar no mesmo lugar.</p><details><summary>Ver o motivo</summary><p>${esc(e.message)}</p></details></div><button type="button" class="btn btn-verde" id="tentar-tela">Tentar novamente</button><a class="btn btn-linha" href="${/^#\/qw\/(\d+)/.test(h) ? `#/qw/${h.match(/^#\/qw\/(\d+)/)[1]}` : emAdministracao() ? inicioAdmin() : '#/conversas'}">Voltar</a></div></div>`;
    ligarCabecalho();
    $('tentar-tela').onclick = () => rota();
  } finally {
    if (versao === versaoNavegacao) $('principal').removeAttribute('aria-busy');
  }
  if (versao !== versaoNavegacao) return;
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

// Endereço antigo → aba equivalente de Pessoas (a consulta, como ?convidar=1 ou ?foco=, vai junto).
export function enderecoNovo(h, consulta = '') {
  const q = new URLSearchParams(consulta);
  const com = (destino, extra = {}) => { for (const [k, v] of Object.entries(extra)) q.set(k, v); const s = q.toString(); return s ? `${destino}?${s}` : destino; };
  if (h === '#/empresa/usuarios' || h === '#/pessoas/pessoas') return com('#/pessoas');
  if (h === '#/empresa/roles') return com('#/pessoas/perfis');
  if (h === '#/revisao-acessos') return com('#/pessoas', { revisao: 'pendente' });
  // Antes, #/pessoas abria Áreas: o link para uma área (?area=) segue para a aba Áreas.
  if (h === '#/pessoas' && q.has('area')) return com('#/pessoas/areas');
  // Preparar o ambiente agora é o bloco do alto da Visão geral (com a lista de passos aberta).
  if (h === '#/preparacao') return com('#/visao-geral', { passos: '1' });
  // Acessos do suporte agora é uma aba de Atividade.
  if (h === '#/empresa/acessos') return com('#/atividade/suporte');
  return null;
}
const motivoEndereco = h => (h === '#/preparacao' ? 'Preparar o ambiente agora fica no alto da Visão geral.'
  : h === '#/empresa/acessos' ? 'Acessos do suporte agora ficam em Atividade, na aba Acessos do suporte.'
    : 'Este endereço mudou: usuários, áreas, grupos, perfis e revisão de acessos agora ficam em Pessoas, com abas.');

// Itens da paleta de comandos: telas que a pessoa pode abrir, ações, conversas e quick wins.
function itensPaleta() {
  const telas = [...SECOES_USO().map(g => [g, 'Ir para']), ...SECOES_ADMIN().map(g => [g, 'Administração'])]
    .flatMap(([g, grupo]) => g.itens.filter(i => !i.ver || i.ver()).map(i => ({ grupo, nome: i.nome, dica: g.titulo || '', icone: i.icone, href: hrefItem(i) })))
    .concat(ATALHOS_ADMIN().map(a => ({ grupo: 'Administração', ...a })));
  return [
    { grupo: 'Ações', nome: 'Nova conversa', dica: 'C', icone: 'mais', href: '#/nova' },
    { grupo: 'Ajuda', nome: 'Primeiros passos', icone: 'livro', href: '#/primeiros-passos' },
    { grupo: 'Ajuda', nome: 'Ajuda desta tela', icone: 'livro', chaves: 'ajuda como usar', acao: () => import('/ajuda-contextual.js').then(x => x.abrirAjuda($('conta'))) },
    { grupo: 'Ações', nome: 'Reportar problema', icone: 'atividade', acao: () => reportarProblema('', $('conta')) },
    ...(E.podeCriarQw ? [{ grupo: 'Ações', nome: 'Novo Quick Win', icone: 'raio', href: '#/qw/nova' }] : []),
    { grupo: 'Ações', nome: 'Política de uso de IA', icone: 'escudo', acao: abrirPolitica },
    ...telas,
    ...E.quickWins.map(q => ({ grupo: 'Quick Wins', nome: q.nome, icone: 'raio', href: `#/qw/${q.id}`, soNaBusca: E.quickWins.length > 5 })),
    ...E.conversas.map((c, i) => ({ grupo: 'Conversas', nome: c.titulo, dica: c.quick_win || '', icone: 'conversa', href: `#/c/${c.id}`, soNaBusca: i >= 5 })),
    ...(E.plataforma?.adminPlataforma ? [{ grupo: 'Plataforma', nome: 'Console da plataforma', icone: 'predio', href: '/plataforma' }] : []),
  ];
}

async function iniciar() {
  const [eu, publico] = await Promise.all([api('/api/eu'), api('/api/publico')]);
  definirCsrf(eu.csrf);
  Object.assign(E, { eu: eu.pessoa, publico, retencaoDias: publico.retencaoDias, permQw: eu.quickWins, podeCriarQw: eu.quickWins.criar,
    plano: eu.plano, operador: eu.operador, unidade: eu.unidade, iaConfigurada: eu.iaConfigurada, iaSimulada: !!eu.iaSimulada,
    permissoes: eu.permissoes || null, integracoes: !!eu.integracoes, plataforma: eu.plataforma || null, bases: eu.bases || { areas: [], paraRevisar: 0 } });
  definirUnidade(eu.unidade);
  aplicarMarca(publico);
  await definirMarcaPropria(publico);
  if (publico.favicon) document.querySelector('link[rel="icon"]').href = publico.favicon;
  if (publico.empresa) document.title = MARCA.propria ? publico.empresa : `GreenIA · ${publico.empresa}`;
  document.getElementById('fundo-lateral').onclick = () => fecharNavegacao(true);
  iniciarAcessibilidade();
  if (lerRecolhida() && !E.plataforma?.acessoOperador) document.body.classList.add('lateral-recolhida');
  await recarregarLateral();
  recarregarPendencias();
  window.addEventListener('hashchange', rota);
  // Buscar (Ctrl K): telas, ações, Quick Wins e conversas carregadas; para conversas mais antigas, pergunta ao servidor.
  iniciarPaleta(itensPaleta, { atalhos: { c: () => irPara('#/nova') }, buscar: async q => (await api(`/api/conversas?${new URLSearchParams({ todas: '1', pagina: '0', busca: q })}`, { independenteDaRota: true })).conversas
    .map(c => ({ grupo: 'Conversas', nome: c.titulo, dica: c.quick_win || '', icone: 'conversa', href: `#/c/${c.id}` })) });
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
