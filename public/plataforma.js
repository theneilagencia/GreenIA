// Console da plataforma (operador): empresas, usuários, planos, ambientes, uso, auditoria e configurações.
// Separado do admin de cada empresa: outra página, outra sessão, outra cor de navegação.
import { carregandoHtml, esc, marcaHtml, ocupado, toast, transicao, vazioHtml, ICONE, rodapePlataformaHtml } from '/comum.js';
import { iniciarPaleta, abrirPaleta, teclaPaleta } from '/comando.js';
import { contaHtml, itemMenu, ligarConta, separadorMenu, temaMenuHtml } from '/menu-conta.js';
import { campoData, lerData } from '/data-br.js';
import { renderMarca, ligarMarca, renderLanding, ligarLanding, renderUrl, ligarUrl, mostrarErro, ROTULOS_MARCA } from '/editores.js';

const $ = id => document.getElementById(id);
const C = { eu: null, csrf: '', catalogo: null, planos: [] };
const num = v => Number(v || 0).toLocaleString('pt-BR');
const usd = v => (v === null || v === undefined ? '–' : `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const data = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '–');
const dataHora = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const SELO_STATUS = { ativa: 'selo-verde', em_implantacao: 'selo-ambar', suspensa: 'selo-vermelho', cancelada: 'selo-cinza' };
const selo = (s, nome) => `<span class="selo ${SELO_STATUS[s] || 'selo-cinza'}">${esc(nome || C.catalogo?.status[s] || s)}</span>`;
// Estado da IA do ambiente pela chave efetiva (o servidor manda iaEstado; `ia` sozinho é das versões anteriores).
const IA_ESTADO = { ligada: 'Ligada', simulada: 'Sem chave (simulada)', desligada: 'Desligada' };
const iaTexto = a => IA_ESTADO[a.iaEstado] || (a.ia ? 'Ligada' : 'Desligada');
const mb = v => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
// Acesso de uma pessoa numa empresa (company_users.status) e perfis de sistema, para não mostrar o valor cru.
const ACESSO = { convidado: 'Convidado', ativo: 'Ativo', inativo: 'Inativo' };
const PERFIS = { company_admin: 'Admin da empresa', manager: 'Gestor', member: 'Membro', viewer: 'Leitor' };
const DEVOLUCAO = { solicitada: 'Aguardando a cópia', gerada: 'Link enviado', entregue: 'Entregue', expirada: 'Link vencido', cancelada: 'Encerrado' };
const diasTexto = n => `${num(n)} ${n === 1 ? 'dia' : 'dias'}`;

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
    <p class="dica login-saidas">Não é da equipe da plataforma? <a href="/encontrar">Encontre o ambiente da sua empresa</a></p>
    <p class="dica login-saidas"><a href="/">Voltar ao site</a></p>
  </div></main>`;
  $('f-email').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/plataforma/login/codigo', { metodo: 'POST', corpo: { email: $('c-email').value } }); $('f-email').classList.add('oculto'); $('f-codigo').classList.remove('oculto'); $('c-codigo').focus(); }
    catch (e) {
      mostrarErro('c-erro', e);
      // Sem email configurado o código foi gerado mesmo assim (está no log do servidor): deixa digitar.
      if (e.codigo === 'email_nao_configurado') { $('f-codigo').classList.remove('oculto'); $('c-codigo').focus(); }
    }
  };
  $('f-codigo').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/plataforma/login/entrar', { metodo: 'POST', corpo: { email: $('c-email').value, codigo: $('c-codigo').value } }); location.reload(); }
    catch (e) { mostrarErro('c-erro2', e); }
  };
}

// ---------------------------------------------------------------- Casca
const SECOES = [['empresas', 'Empresas', 'predio'], ['encerramentos', 'Encerramentos', 'lixo'], ['usuarios', 'Usuários', 'pessoas'], ['planos', 'Planos', 'pacote'], ['ambientes', 'Ambientes', 'servidor'], ['uso', 'Uso', 'grafico'], ['auditoria', 'Auditoria', 'atividade'], ['configuracoes', 'Configurações', 'engrenagem']];
function lateral() {
  const h = location.hash || '#/empresas';
  const email = C.eu.usuario.email;
  // Mesmo esqueleto do app (padrão assistente): marca, Buscar, seções e a conta no pé, com Aparência e Sair no menu.
  $('lateral').innerHTML = `<div class="lat-topo"><a class="marca" href="#/empresas">${marcaHtml()}</a><button type="button" class="icone-btn fechar-lateral" id="fechar-lateral" aria-label="Fechar menu">${ICONE.fechar}</button></div><span class="selo-escopo">Plataforma</span>
    <div class="lat-acoes"><button type="button" class="item-lat busca-lat" id="abrir-busca">${ICONE.busca}<span class="nome">Buscar</span><span class="kbd">${teclaPaleta()}</span></button></div>
    <nav class="lateral-rolagem" aria-label="Console">
      ${SECOES.map(([id, nome, ic]) => `<a class="item-lat${h.startsWith(`#/${id}`) ? ' ativo' : ''}" href="#/${id}" ${h.startsWith(`#/${id}`) ? 'aria-current="page"' : ''}>${ICONE[ic]}<span class="nome">${nome}</span></a>`).join('')}
    </nav>
    <div class="lateral-pe">${contaHtml({ nome: C.eu.usuario.name || email, email, sub: 'Console da plataforma', itens: `${temaMenuHtml('Aparência')}${separadorMenu}${itemMenu('id="sair"', ICONE.sair, 'Sair do console')}` })}${rodapePlataformaHtml({ powered: false })}</div>`;
  $('abrir-busca').onclick = () => abrirPaleta();
  $('fechar-lateral').onclick = () => { $('lateral').classList.remove('aberta'); $('menu')?.focus(); };
  ligarConta({ sair: async () => { await api('/api/plataforma/sair', { metodo: 'POST' }).catch(() => {}); location.reload(); } });
}
// Topo mínimo: o título da tela e a ação principal à direita; nas telas de detalhe, a trilha de volta à seção.
function cab(titulo, acoes = '', voltar = '') {
  const secao = voltar ? SECOES.find(x => voltar.startsWith(`#/${x[0]}`))?.[1] || 'Voltar' : '';
  return `<header class="cabeca"><div class="cabeca-titulo">
    <button class="icone-btn menu-btn" id="menu" aria-label="Abrir navegação" aria-controls="lateral" aria-expanded="false">${ICONE.menu}</button>
    ${voltar ? `<span class="migalha"><a href="${voltar}">${esc(secao)}</a><span class="sep" aria-hidden="true">/</span></span>` : ''}<h1>${esc(titulo)}</h1></div><div class="cabeca-acoes">${acoes}</div></header>`;
}
function tela(titulo, corpo, acoes = '', voltar = '') {
  C.mais = {};   // ações do "Mais ações" da tela aberta
  $('principal').innerHTML = `${cab(titulo, acoes, voltar)}<div class="pagina"><div class="pagina-dentro">${faixaTopo()}${corpo}</div></div>`;
  $('menu').onclick = () => { const aberta = $('lateral').classList.toggle('aberta'); $('menu').setAttribute('aria-expanded', String(aberta)); if (aberta) $('lateral').querySelector('a,button')?.focus(); };
}
// Avisos da plataforma no topo de todas as telas, num aviso só (no máximo um por tela), cada um com a ação que pede:
// envio de email falhando (os códigos de acesso das empresas não chegam; motivo real, sem segredos) e vencimento ou
// rotação da chave do OpenRouter (em Uso, o cartão da chave já mostra).
const NIVEL_FAIXA = { atencao: 'atencao', critico: 'erro', erro: 'erro' };
function faixaTopo() {
  const e = C.eu?.alertaEmail, k = C.eu?.alertaChave;
  const chave = k && NIVEL_FAIXA[k.nivel] && !location.hash.startsWith('#/uso') ? k : null;
  if (!e && !chave) return '';
  const partes = [
    e ? `<b>Envio de email falhando:</b> os códigos de acesso podem não estar chegando. Última falha em ${esc(dataHora(e.em))} (${esc(e.origem)}): <code>${esc(e.detalhe)}</code> <a href="#/configuracoes">Ver email da plataforma</a>` : '',
    chave ? `<b>Chave do OpenRouter · ${esc(chave.rotulo || '')}:</b> ${esc(chave.texto)} <a href="#/uso" data-trocar-chave>Trocar a chave</a>` : '',
  ].filter(Boolean);
  const nivel = e || NIVEL_FAIXA[chave.nivel] === 'erro' ? 'erro' : 'atencao';
  return `<div class="faixa-aviso ${nivel} faixa-chave" role="${nivel === 'erro' ? 'alert' : 'status'}">${partes.join('<br>')}</div>`;
}

// ---------------------------------------------------------------- Caminho claro
// Cada tela: título, uma linha de propósito e uma ação principal à direita do cabeçalho. Ações raras vão para
// "Mais ações"; explicações longas ficam na ajuda da tela, aberta pelo "Saiba mais" da linha de propósito.
C.ajuda = {};
function proposito(texto, ajuda) {
  if (ajuda) C.ajuda.tela = ajuda;
  return `<p class="lead plat-proposito">${texto}${ajuda ? ` <button type="button" class="btn-texto plat-saiba" data-ajuda aria-haspopup="dialog">Saiba mais</button>` : ''}</p>`;
}
function abrirAjuda() {
  const a = C.ajuda.tela;
  if (!a) return;
  modal(`<div class="modal-topo"><div class="rotulo">Ajuda</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="aj-titulo" tabindex="-1">${esc(a.titulo)}</h2><div class="plat-ajuda">${a.textos.map(t => `<p>${t}</p>`).join('')}</div>`, fechar => { $('fechar').onclick = fechar; $('aj-titulo').focus(); });
}
// "Mais ações": botão que abre uma lista de ações (role=menu). Cada item chama C.mais[acao](botão).
// itens: [{ acao, rotulo, perigo, href, id }]; rotulo: nome acessível do botão (o texto visível é sempre "Mais ações").
let menuSeq = 0;
function menuMais(itens, { rotulo = 'Mais ações', classe = 'btn btn-linha btn-pequeno' } = {}) {
  if (!itens.length) return '';
  const id = `menu-mais-${++menuSeq}`;
  return `<div class="plat-menu"><button type="button" class="${classe}" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}"${rotulo !== 'Mais ações' ? ` aria-label="${esc(rotulo)}"` : ''}>Mais ações</button>
    <div class="menu-lista" role="menu" id="${id}" hidden>${itens.map(i => (i.href ? `<a role="menuitem" href="${esc(i.href)}"${i.externo ? ' target="_blank" rel="noopener"' : ''}>${esc(i.rotulo)}</a>`
      : `<button type="button" role="menuitem" data-mais="${esc(i.acao)}"${i.id !== undefined ? ` data-id="${esc(i.id)}"` : ''}${i.perigo ? ' class="perigo"' : ''}>${esc(i.rotulo)}</button>`)).join('')}</div></div>`;
}
function fecharMenus(exceto) {
  for (const l of document.querySelectorAll('.plat-menu .menu-lista:not([hidden])')) {
    if (l === exceto) continue;
    l.hidden = true; l.previousElementSibling.setAttribute('aria-expanded', 'false');
  }
}
function ligarMenusConsole() {
  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-ajuda]')) return abrirAjuda();
    const botao = ev.target.closest('.plat-menu > button');
    if (botao) {
      const lista = botao.nextElementSibling, abrir = lista.hidden;
      fecharMenus(lista);
      lista.hidden = !abrir; botao.setAttribute('aria-expanded', String(abrir));
      // Dentro de uma tabela com rolagem própria, a lista sairia cortada: abre presa à janela, sob o botão.
      if (abrir && botao.closest('.tabela-rolagem')) {
        const r = botao.getBoundingClientRect();
        Object.assign(lista.style, { position: 'fixed', top: `${r.bottom + 6}px`, right: `${Math.max(8, innerWidth - r.right)}px`, left: 'auto' });
      }
      // No celular, a lista não sai da tela: desloca para dentro, com 8 px de margem.
      if (abrir) {
        lista.style.transform = '';
        const r = lista.getBoundingClientRect(), dx = r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0;
        if (dx) lista.style.transform = `translateX(${Math.round(dx)}px)`;
        lista.querySelector('[role=menuitem]')?.focus({ preventScroll: true });
      }
      return;
    }
    const item = ev.target.closest('.plat-menu [data-mais]');
    fecharMenus();
    if (item) { C.mais?.[item.dataset.mais]?.(item); item.closest('.plat-menu').querySelector(':scope>button').focus({ preventScroll: true }); }
  });
  document.addEventListener('scroll', ev => { if (!ev.target.closest?.('.menu-lista')) fecharMenus(); }, true);
  document.addEventListener('keydown', ev => {
    const lista = ev.target.closest?.('.plat-menu .menu-lista');
    if (!lista) return;
    const itens = [...lista.querySelectorAll('[role=menuitem]')], i = itens.indexOf(ev.target);
    if (ev.key === 'Escape' || ev.key === 'Tab') { fecharMenus(); if (ev.key === 'Escape') lista.previousElementSibling.focus(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); itens[(i + (ev.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus(); }
  });
}
// Área que abre e fecha (filtros, opções avançadas): botão com aria-expanded e a região com hidden.
const revelar = (id, rotulo, aberto = false) => `<button type="button" class="btn-texto plat-revelar" aria-expanded="${aberto}" aria-controls="${id}" data-revelar="${id}">${esc(rotulo)}</button>`;
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-revelar]');
  if (!b) return;
  const alvo = $(b.dataset.revelar), abrir = alvo.hidden;
  alvo.hidden = !abrir; b.setAttribute('aria-expanded', String(abrir));
});
// Data dd/mm/aaaa do campo pt-BR em ISO (vazio → null); data inválida interrompe com a explicação.
const dataOuErro = el => { const v = lerData(el); if (v === null) throw new Error(el.validationMessage || 'Use uma data válida no formato dd/mm/aaaa.'); return v || null; };
const carregando = titulo => tela(titulo, carregandoHtml());
// Coluna sem título (a dos botões) ganha o nome "Ações" para leitores de tela.
const tabela = (cab, linhas, vazio) => (linhas.length ? `<div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${cab.map(c => `<th${c.startsWith('#') ? ' class="num"' : ''}>${c ? esc(c.replace(/^#/, '')) : '<span class="sr">Ações</span>'}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
  : vazio ? (vazio.startsWith('<') ? vazio : vazioHtml({ titulo: vazio })) : '');   // aceita o estado vazio já pronto

function modal(html, aoAbrir) {
  // O foco volta para quem abriu (um modal aberto de dentro de outro devolve ao que abriu o primeiro).
  const origem = $('modal').contains(document.activeElement) ? C.origemModal : document.activeElement;
  C.origemModal = origem;
  $('modal').innerHTML = `<div class="modal-fundo" id="fundo-modal"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  const fechar = () => { $('modal').innerHTML = ''; if (origem?.isConnected) origem.focus({ preventScroll: true }); };
  $('fundo-modal').onclick = ev => { if (ev.target.id === 'fundo-modal') fechar(); };
  $('fundo-modal').onkeydown = ev => { if (ev.key === 'Escape') fechar(); };
  document.querySelector('.modal').focus();
  aoAbrir?.(fechar);
}

// Acesso da equipe GreenIA a uma empresa (entrar ou exportar): tipo e justificativa obrigatórios.
const TIPOS_ACESSO = { suporte: 'Suporte', solicitacao_cliente: 'Solicitação do cliente', incidente: 'Incidente', outro: 'Outro' };
// Exportar o banco: só pedido do cliente, incidente de segurança ou obrigação legal (suporte não exporta).
const FINALIDADES_EXPORTACAO = { solicitacao_cliente: 'Pedido do cliente', incidente: 'Incidente de segurança', obrigacao_legal: 'Obrigação legal' };
const TIPOS_HOLD = { legal: 'Obrigação legal', incidente: 'Investigação de incidente' };
// Os mesmos tipos aceitos pelo servidor (src/plataforma/contatos.js).
const TIPOS_INTERACAO = { resposta: 'Resposta ao contato', reuniao: 'Reunião ou apresentação', proposta: 'Proposta', contato: 'Novo contato comercial', outro: 'Outra interação comercial' };
function pedirMotivo({ titulo, explica, botao, enviar, tipos = TIPOS_ACESSO, rotuloTipo = 'Tipo' }) {
  modal(`<div class="modal-topo"><div class="rotulo">Acesso da equipe GreenIA</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2>${esc(titulo)}</h2><p class="dica">${esc(explica)}</p>
    <form id="f-motivo" novalidate>
      <div class="campo"><label for="m-tipo">${esc(rotuloTipo)}</label><select class="entrada" id="m-tipo" required><option value="">Escolha</option>${Object.entries(tipos).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="m-just">Justificativa</label><textarea class="entrada" id="m-just" rows="3" minlength="10" maxlength="500" required placeholder="Por que este acesso é necessário"></textarea><span class="ajuda">Fica registrada e visível para a empresa. Pelo menos 10 caracteres.</span></div>
      <p class="msg-erro oculto" id="m-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">${esc(botao)}</button></div>
    </form>`, fechar => {
    $('fechar').onclick = fechar;
    $('f-motivo').onsubmit = async ev => {
      ev.preventDefault();
      const corpo = { tipo: $('m-tipo').value, justificativa: $('m-just').value.trim() };
      const erroEl = $('m-erro');
      if (!corpo.tipo || corpo.justificativa.length < 10) { erroEl.textContent = `Escolha ${rotuloTipo.toLowerCase() === 'tipo' ? 'o tipo' : 'a finalidade'} e escreva a justificativa (pelo menos 10 caracteres).`; erroEl.classList.remove('oculto'); return; }
      try { await enviar(corpo); fechar(); } catch (x) { erroEl.textContent = x.message; erroEl.classList.remove('oculto'); }
    };
  });
}

// Confirmação no modal da plataforma, para toda ação sensível do console (o diálogo nativo do navegador tem "OK/Cancelar",
// que confunde com "Cancelar o ambiente", e não diz a consequência). Com `confirmacao`, a pessoa digita o identificador da
// empresa para liberar o botão. `campos` acrescenta campos ao formulário; `validar` devolve o erro a mostrar, se houver.
function confirmarStatus({ titulo, texto, botao, aplicar, perigo = false, confirmacao = '', rotulo = 'Status do ambiente', campos = '', validar }) {
  modal(`<div class="modal-topo"><div class="rotulo">${esc(rotulo)}</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="st-titulo" tabindex="-1">${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}
    <form id="f-status" novalidate>${campos}
      ${confirmacao ? `<div class="campo"><label for="st-conf">Para confirmar, digite o identificador <b>${esc(confirmacao)}</b></label><input class="entrada" id="st-conf" autocomplete="off" spellcheck="false"></div>` : ''}
      <p class="msg-erro oculto" id="st-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn ${perigo ? 'btn-perigo' : 'btn-verde'}" id="st-ok" ${confirmacao ? 'disabled' : ''}>${esc(botao)}</button><button type="button" class="btn btn-linha" id="st-voltar">Voltar sem alterar</button></div>
    </form>`, fechar => {
    $('fechar').onclick = fechar; $('st-voltar').onclick = fechar;
    $('st-titulo').focus();
    if (confirmacao) $('st-conf').oninput = () => { $('st-ok').disabled = $('st-conf').value.trim() !== confirmacao; };
    const erro = m => { $('st-erro').textContent = m; $('st-erro').classList.remove('oculto'); };
    $('f-status').onsubmit = async ev => {
      ev.preventDefault();
      if (confirmacao && $('st-conf').value.trim() !== confirmacao) return;
      const problema = validar?.();
      if (problema) return erro(problema);
      try { await aplicar(); fechar(); } catch (x) { erro(x.message); }
    };
  });
}

// Bloqueio legal (hold: obrigação legal ou incidente): motivo obrigatório, registrado.
function pedirHold({ titulo, tipos = TIPOS_HOLD, enviar }) {
  modal(`<div class="modal-topo"><div class="rotulo">Bloqueio legal</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2>${esc(titulo)}</h2><p class="dica">O bloqueio legal suspende o prazo de eliminação até ser liberado. Fica registrado com o motivo e quem o aplicou.</p>
    <form id="f-hold" novalidate>
      <div class="campo"><label for="h-tipo">Motivo do bloqueio</label><select class="entrada" id="h-tipo"><option value="">Escolha</option>${Object.entries(tipos).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="h-motivo">Descrição</label><textarea class="entrada" id="h-motivo" rows="3" maxlength="500" aria-describedby="h-motivo-ajuda"></textarea><span class="ajuda" id="h-motivo-ajuda">Por exemplo: a referência do processo, do ofício ou do incidente.</span></div>
      <p class="msg-erro oculto" id="h-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Aplicar bloqueio legal</button></div>
    </form>`, fechar => {
    $('fechar').onclick = fechar;
    $('f-hold').onsubmit = async ev => {
      ev.preventDefault();
      try { await enviar({ tipo: $('h-tipo').value, motivo: $('h-motivo').value.trim() }); fechar(); } catch (x) { $('h-erro').textContent = x.message; $('h-erro').classList.remove('oculto'); }
    };
  });
}
async function baixar(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.mensagem || 'O download falhou.'); }
  const nome = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'copia.sqlite.gz';
  const u = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = u; a.download = nome; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}

// ---------------------------------------------------------------- Empresas
async function vistaEmpresas() {
  carregando('Empresas');
  const { empresas } = await api('/api/plataforma/empresas');
  C.empresas = empresas;
  // Sem empresas, o estado vazio traz a única ação da tela (o cabeçalho fica sem botão).
  tela('Empresas', `${proposito('Cada empresa é um ambiente independente, com dados, pessoas e marca próprios.')}
    ${tabela(['Empresa', 'Status', 'Plano', 'URL', '#Usuários', '#Créditos no mês'], empresas.map(e => `<tr>
      <td data-r="Empresa"><a href="#/empresas/${e.id}"><b>${esc(e.name)}</b></a><br><span class="dica">${esc(e.admins.join(', ') || 'sem administrador')}</span></td>
      <td data-r="Status">${selo(e.status, e.statusNome)}</td><td data-r="Plano">${esc(e.plano?.name || 'sem plano')}</td>
      <td data-r="URL"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace(/^https?:\/\//, ''))}</a></td>
      <td class="num" data-r="Usuários">${num(e.usuarios)}</td><td class="num" data-r="Créditos no mês">${e.creditosUsados === null ? '–' : `${num(Math.round(e.creditosUsados))} <span class="dica">· ${num(e.percentual)}% do plano</span>`}</td></tr>`),
    '')}${empresas.length ? '' : vazioHtml({ icone: 'predio', titulo: 'Nenhuma empresa ainda', texto: 'Crie a primeira empresa; ela nasce em implantação e você publica quando estiver pronta.', acao: '<button class="btn btn-verde" id="nova-empresa-vazio">Criar empresa</button>' })}`,
  empresas.length ? '<button class="btn btn-verde btn-pequeno" id="nova-empresa" title="Nova empresa (N)">Nova empresa</button>' : '');
  $('nova-empresa-vazio')?.addEventListener('click', novaEmpresa);
  $('nova-empresa')?.addEventListener('click', novaEmpresa);
}

async function novaEmpresa() {
  const planos = C.planos.filter(p => p.status === 'ativo');
  modal(`<div class="modal-topo"><div class="rotulo">Nova empresa</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2>Criar ambiente</h2>
    <form id="f-nova" novalidate>
      <div class="campo"><label for="n-nome">Nome da empresa</label><input class="entrada" id="n-nome" required maxlength="80"></div>
      <div class="campo"><label for="n-slug">Identificador</label><input class="entrada" id="n-slug" required maxlength="40" pattern="[a-z0-9-]+"><span class="ajuda" id="n-url">Usado no endereço do ambiente. Letras minúsculas, números e hífens.</span></div>
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

const ABAS = [['resumo', 'Resumo'], ['usuarios', 'Usuários'], ['marca', 'Marca'], ['landing', 'Página de apresentação'], ['url', 'URL e domínio'], ['permissoes', 'Permissões concedidas'], ['auditoria', 'Auditoria']];
async function vistaEmpresa(id, aba = 'resumo') {
  carregando('Empresa');
  const d = await api(`/api/plataforma/empresas/${id}`);
  const e = d.empresa;
  const sub = `<nav class="subnav" aria-label="Seções da empresa">${ABAS.map(([k, n]) => `<a href="#/empresas/${id}/${k}" ${k === aba ? 'aria-current="page"' : ''}>${n}</a>`).join('')}</nav>`;
  const corpo = { resumo: abaResumo, usuarios: abaUsuarios, marca: abaMarca, landing: abaLanding, url: abaUrl, permissoes: abaPermissoes, auditoria: abaAuditoriaEmpresa }[aba] || abaResumo;
  // Cabeçalho: o status e, à direita, as ações da aba aberta (a principal por último).
  tela(e.name, `${sub}<div id="aba"></div>`, `${selo(e.status, e.statusNome)}<span class="acoes-aba" id="acoes-aba"></span>`, '#/empresas');
  await corpo(d, id);
}
const acoesAba = html => { $('acoes-aba').innerHTML = html; };
const erroForm = (id, e) => { mostrarErro(id, e); if (!document.activeElement?.classList.contains('invalida')) $(id)?.scrollIntoView({ block: 'center' }); };

// Créditos e preço de um plano, para mostrar o que muda antes de trocar.
const resumoPlano = id => {
  const p = C.planos.find(x => x.id === id);
  if (!p) return 'sem cota de créditos';
  return `${p.credits ? `${num(p.credits)} créditos + ${num(p.reserve)} de reserva por mês` : 'Créditos ilimitados'} · ${p.price_usd ? `${usd(p.price_usd)} por mês` : 'sem preço'}`;
};
const STATUS_FAIXA = {
  em_implantacao: ['atencao', 'Em implantação: só administradores da empresa entram, e a página de apresentação pública ainda não aparece.'],
  suspensa: ['erro', 'Suspensa: ninguém da empresa entra, e as sessões foram encerradas.'],
  cancelada: ['erro', 'Cancelada: ninguém usa o ambiente, nem a equipe de operação. A exclusão definitiva acontece sozinha 30 dias depois do cancelamento, salvo bloqueio legal.'],
};
const valorOuTraco = v => (v ? esc(v) : '—');

// Resumo: visão da empresa (plano, consumo, ambiente, dados) e uma ação principal; o resto em "Mais ações".
// Encerrar é irreversível depois do prazo: ação de perigo separada, no fim da tela, com confirmação própria.
async function abaResumo(d, id) {
  const e = d.empresa, u = d.uso, a = d.ambiente;
  const principal = { em_implantacao: ['ativa', 'Publicar ambiente'], suspensa: ['ativa', 'Reativar ambiente'] }[e.status];
  const entrarPrincipal = !principal && e.status === 'ativa';
  acoesAba(`${menuMais([
    ...(!entrarPrincipal && e.status !== 'cancelada' ? [{ acao: 'entrar', rotulo: 'Entrar no ambiente…' }] : []),
    { acao: 'plano', rotulo: 'Alterar plano…' },
    ...(u.plano ? [{ acao: 'pacote', rotulo: 'Liberar Capacity Pack…' }] : []),
    { acao: 'dados', rotulo: 'Editar dados cadastrais…' },
    { acao: 'exportar', rotulo: 'Exportar dados…' },
    ...(e.status === 'ativa' ? [{ acao: 'suspender', rotulo: 'Suspender ambiente…' }] : []),
    ...(e.status === 'cancelada' ? [{ acao: 'reabrir', rotulo: 'Reabrir em implantação' }] : []),
  ])}${principal ? `<button class="btn btn-verde btn-pequeno" data-status="${principal[0]}">${principal[1]}</button>` : entrarPrincipal ? '<button class="btn btn-verde btn-pequeno" id="entrar-amb">Entrar no ambiente</button>' : ''}`);
  const faixa = STATUS_FAIXA[e.status];
  $('aba').innerHTML = `${proposito('Situação, plano e consumo da empresa.')}
    ${faixa ? `<div class="faixa-aviso ${faixa[0]}">${faixa[1]}</div>` : ''}
    <div id="encerramento-empresa"></div>
    <div class="secao-titulo" style="margin-top:0"><h2 class="h-secao">Plano e consumo</h2></div>
    <div class="indicadores"><div class="indicador"><span>Plano</span><b class="valor-texto">${esc(e.plano?.name || 'Sem plano')}</b><small>${esc(resumoPlano(e.plano?.id))}</small></div>
      ${u.plano ? `<div class="indicador"><span>Créditos usados no mês</span><b>${num(Math.round(u.plano.usados))}</b><small>${u.plano.ilimitado ? 'plano ilimitado' : `${num(u.plano.percentual)}% de ${num(u.plano.creditos)}`}</small></div>
      <div class="indicador" id="ind-pacote"><span>Capacity Pack disponível</span><b>${num(Math.round(u.plano.pacoteDisponivel))}</b><small>usado depois da franquia</small></div>` : ''}
      <div class="indicador"><span>Custo de IA no mês</span><b>${usd(u.custoUsd)}</b>${u.plano ? '' : '<small>sem cota: a empresa vê o custo em dólar</small>'}</div>
      <div class="indicador"><span>Pessoas ativas no mês</span><b>${num(u.pessoasAtivas)}</b><small>${num(u.pessoas)} cadastradas</small></div></div>
    <div class="secao-titulo"><h2 class="h-secao">Ambiente</h2></div>
    <div class="indicadores"><div class="indicador"><span>Endereço</span><b style="font-size:14px"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url.replace(/^https?:\/\//, ''))}</a></b></div>
      <div class="indicador"><span>Banco</span><b style="font-size:14px"><code class="valor-tecnico">${esc(a.banco)}</code></b><small>${mb(a.tamanhoMb)}</small></div>
      <div class="indicador"><span>IA</span><b style="font-size:14px">${iaTexto(a)}</b></div><div class="indicador"><span>Email próprio</span><b style="font-size:14px">${a.smtp ? 'Configurado' : 'Usa o da plataforma'}</b></div>
      <div class="indicador"><span>Conteúdo</span><b style="font-size:14px">${num(u.quickWins)} Quick Wins</b><small>${num(u.documentos)} documentos, ${num(u.conversas)} conversas no mês</small></div></div>
    <div class="secao-titulo"><h2 class="h-secao">Dados cadastrais</h2></div>
    <dl class="plat-dados"><div><dt>Status</dt><dd>${selo(e.status, e.statusNome)}</dd></div><div><dt>Razão social</dt><dd>${valorOuTraco(e.legal_name)}</dd></div><div><dt>Documento</dt><dd>${valorOuTraco(e.document)}</dd></div>
      <div><dt>Email de contato</dt><dd>${valorOuTraco(e.contact_email)}</dd></div><div><dt>Criada em</dt><dd>${data(e.created_at)}</dd></div>
      ${e.notes ? `<div class="plat-dados-largo"><dt>Notas internas</dt><dd>${esc(e.notes)}</dd></div>` : ''}</dl>
    <div id="exportacoes-empresa"></div>
    ${e.status === 'cancelada'
    ? `<section class="plat-perigo" aria-labelledby="perigo-t"><h2 class="h-secao" id="perigo-t">Exclusão definitiva</h2><p class="dica">Apaga o ambiente e o banco da empresa. Só vale depois do prazo de 30 dias do cancelamento.</p>
        <button class="btn btn-perigo" id="excluir-empresa">Excluir definitivamente…</button></section>`
    : `<section class="plat-perigo" aria-labelledby="perigo-t"><h2 class="h-secao" id="perigo-t">Encerrar o ambiente</h2><p class="dica">As pessoas perdem o acesso na hora, e os dados são excluídos 30 dias depois, salvo bloqueio legal.</p>
        <button class="btn btn-perigo" data-status="cancelada">Encerrar ambiente…</button></section>`}`;
  const mudarStatus = async s => {
    const aplicar = async () => { await api(`/api/plataforma/empresas/${id}/status`, { metodo: 'POST', corpo: { status: s } }); toast(s === 'cancelada' ? 'Ambiente encerrado.' : 'Status alterado.'); vistaEmpresa(id, 'resumo'); };
    if (s === 'suspensa') return confirmarStatus({ titulo: `Suspender o ambiente de ${e.name}?`, texto: 'Ninguém da empresa consegue entrar até a reativação, e as sessões abertas são encerradas na hora. Os dados ficam guardados.', botao: 'Suspender ambiente', aplicar });
    if (s === 'cancelada') {
      const exclusao = new Date(Date.now() + 30 * 864e5).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      return confirmarStatus({ titulo: `Encerrar o ambiente de ${e.name}?`, perigo: true, confirmacao: e.slug, botao: 'Encerrar ambiente', aplicar,
        texto: `As pessoas da empresa perdem o acesso na hora, inclusive a equipe de operação. O ambiente e todos os dados são excluídos definitivamente em ${exclusao} (30 dias), salvo bloqueio legal. Até lá, é possível reabrir o ambiente ou exportar os dados.` });
    }
    try { await aplicar(); } catch (x) { falhar(x); }
  };
  for (const b of document.querySelectorAll('#principal [data-status]')) b.onclick = () => mudarStatus(b.dataset.status);
  const entrar = () => pedirMotivo({ titulo: `Entrar no ambiente da ${e.name}`, botao: 'Entrar no ambiente',
    explica: 'O acesso vale por 60 minutos, aparece na hora para a empresa em "Acessos da equipe de operação" e os admins dela recebem um aviso por email. Um admin da empresa pode encerrar o acesso.',
    async enviar(motivo) { const r = await api(`/api/plataforma/empresas/${id}/entrar`, { metodo: 'POST', corpo: motivo }); window.open(r.url, '_blank'); toast('Ambiente aberto em outra aba. O acesso foi registrado e está visível para a empresa.'); } });
  $('entrar-amb')?.addEventListener('click', entrar);
  Object.assign(C.mais, {
    entrar, suspender: () => mudarStatus('suspensa'), reabrir: () => mudarStatus('em_implantacao'),
    plano: () => alterarPlano(e, id), pacote: () => liberarPacote(e, id), dados: () => editarDados(e, id),
    exportar: () => pedirMotivo({ titulo: `Exportar os dados da ${e.name}`, botao: 'Exportar', tipos: FINALIDADES_EXPORTACAO, rotuloTipo: 'Finalidade',
      explica: 'A exportação é uma cópia completa do banco da empresa, conversas incluídas, e só vale por pedido do cliente, incidente de segurança ou obrigação legal. A cópia fica no servidor e é eliminada 7 dias depois de encerrada a necessidade, salvo bloqueio legal. O registro aparece para a empresa, e os admins dela recebem um aviso por email.',
      async enviar(motivo) {
        const r = await api(`/api/plataforma/empresas/${id}/exportar`, { metodo: 'POST', corpo: motivo });
        await baixar(r.download);
        toast('Exportação feita e registrada. Quando a cópia não for mais necessária, marque "Necessidade encerrada".', 7000); vistaEmpresa(id, 'resumo');
      } }),
  });
  $('excluir-empresa')?.addEventListener('click', () => confirmarStatus({ rotulo: 'Exclusão definitiva', titulo: `Excluir definitivamente a ${e.name}?`, perigo: true, confirmacao: e.slug, botao: 'Excluir definitivamente',
    texto: 'A exclusão definitiva só vale depois do prazo de 30 dias do cancelamento (ou antes, a pedido verificado do cliente pela página de encerramento). Ela apaga o ambiente e o banco da empresa; uma cópia de recuperação fica 30 dias no servidor.',
    async aplicar() { const r = await api(`/api/plataforma/empresas/${id}/excluir`, { metodo: 'POST', corpo: { confirmacao: e.slug } }); toast(r.copia ? `Empresa excluída. A cópia de recuperação fica guardada por ${r.expiraEmDias} dias e depois é eliminada.` : 'Empresa excluída.', 7000); location.hash = '#/empresas'; } }));
  secaoExportacoes(id);
  if (e.status === 'cancelada') secaoEncerramento(id);
}
// Troca de plano: mostra o de → para (créditos e preço) e só aplica depois da confirmação.
function alterarPlano(e, id) {
  modal(`<div class="modal-topo"><div class="rotulo">Plano</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="pl-t" tabindex="-1">Alterar o plano da ${esc(e.name)}</h2>
    <form id="f-plano-empresa" novalidate>
      <div class="campo"><label for="s-plano">Plano</label><select class="entrada" id="s-plano" aria-describedby="s-plano-info"><option value="">Sem plano</option>${C.planos.map(p => `<option value="${p.id}" ${p.id === e.plano?.id ? 'selected' : ''} ${p.status !== 'ativo' && p.id !== e.plano?.id ? 'disabled' : ''}>${esc(p.name)}${p.status !== 'ativo' ? ' (inativo)' : ''}</option>`).join('')}</select>
        <span class="ajuda" id="s-plano-info" aria-live="polite">${esc(resumoPlano(e.plano?.id))}</span></div>
      <p class="msg-erro oculto" id="s-plano-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Continuar</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('pl-t').focus();
    $('s-plano').onchange = () => { $('s-plano-info').textContent = resumoPlano($('s-plano').value); };
    $('f-plano-empresa').onsubmit = ev => {
      ev.preventDefault();
      const novo = $('s-plano').value || null, nome = x => C.planos.find(p => p.id === x)?.name || 'Sem plano';
      if (novo === (e.plano?.id || null)) return mostrarErro('s-plano-erro', new Error('Esse já é o plano da empresa.'));
      confirmarStatus({ rotulo: 'Plano', titulo: `Trocar o plano da ${e.name}?`, botao: `Trocar para ${nome(novo)}`,
        texto: `De ${nome(e.plano?.id)} (${resumoPlano(e.plano?.id)}) para ${nome(novo)} (${resumoPlano(novo)}). A troca vale a partir de agora.`,
        async aplicar() { await api(`/api/plataforma/empresas/${id}/plano`, { metodo: 'POST', corpo: { plan_id: novo } }); toast('Plano alterado. Vale a partir de agora.'); vistaEmpresa(id, 'resumo'); } });
    };
  });
}

// Capacity Pack ou cortesia: créditos e valor saem das regras do plano no servidor; aqui só a quantidade (ou os
// créditos de cortesia). Mostra o que vai ser liberado e confirma antes.
function liberarPacote(e, id) {
  const pk = C.planos.find(x => x.id === e.plano?.id)?.rules || {};
  modal(`<div class="modal-topo"><div class="rotulo">Capacity Pack</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="pk-t" tabindex="-1">Liberar créditos para a ${esc(e.name)}</h2>
    <form id="f-pacote" novalidate>
      <div class="grade-2"><div class="campo"><label for="p-tipo">Tipo</label><select class="entrada" id="p-tipo"><option value="packs">Capacity Pack</option><option value="cortesia">Cortesia (créditos sem receita)</option></select></div>
        <div class="campo" id="p-qtd-campo"><label for="p-qtd">Quantidade de Capacity Packs</label><input class="entrada" id="p-qtd" type="number" min="1" max="50" value="1"></div>
        <div class="campo oculto" id="p-creditos-campo"><label for="p-creditos">Créditos de cortesia</label><input class="entrada" id="p-creditos" type="number" min="1" value="500"></div></div>
      <div class="grade-2"><div class="campo"><label for="p-validade">Validade (opcional)</label>${campoData({ id: 'p-validade', min: new Date().toISOString().slice(0, 10), rotulo: 'a validade' })}</div>
        <div class="campo"><label for="p-obs">Observação</label><input class="entrada" id="p-obs" maxlength="300"></div></div>
      <p class="dica" id="p-resumo" aria-live="polite"></p>
      <p class="msg-erro oculto" id="p-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde" id="p-continuar">Continuar</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('pk-t').focus();
    const resumo = () => {
      const packs = $('p-tipo').value === 'packs';
      $('p-qtd-campo').classList.toggle('oculto', !packs); $('p-creditos-campo').classList.toggle('oculto', packs);
      const n = Number($('p-qtd').value) || 0;
      $('p-resumo').textContent = packs ? (pk.pack_credits ? `${num(n * pk.pack_credits)} créditos · ${usd(n * pk.pack_price_usd)} de receita · acumulam, sem reserva nova` : 'O plano desta empresa não tem Capacity Pack.')
        : 'Cortesia: créditos sem receita, registrados como tal.';
    };
    ['p-tipo', 'p-qtd'].forEach(x => $(x).addEventListener('input', resumo)); resumo();
    $('f-pacote').onsubmit = ev => {
      ev.preventDefault();
      const packs = $('p-tipo').value === 'packs';
      let validade;
      try { validade = dataOuErro($('p-validade')); } catch (x) { return mostrarErro('p-erro', x); }
      const corpo = { ...(packs ? { packs: Number($('p-qtd').value) } : { creditos: Number($('p-creditos').value) }), validade, observacao: $('p-obs').value };
      const oque = packs ? `${num(corpo.packs)} ${corpo.packs === 1 ? 'Capacity Pack' : 'Capacity Packs'}` : `${num(corpo.creditos)} créditos de cortesia`;
      confirmarStatus({ rotulo: 'Capacity Pack', titulo: `Liberar ${oque} para a ${e.name}?`, botao: `Liberar ${oque}`, texto: `${$('p-resumo').textContent.replace(/\.?$/, '.')} Os admins da empresa recebem um email.`,
        async aplicar() { await api(`/api/plataforma/empresas/${id}/pacotes`, { metodo: 'POST', corpo }); toast('Créditos liberados.'); vistaEmpresa(id, 'resumo'); } });
    };
  });
}

function editarDados(e, id) {
  modal(`<div class="modal-topo"><div class="rotulo">Dados cadastrais</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="dd-t" tabindex="-1">Dados da ${esc(e.name)}</h2>
    <form id="f-dados" novalidate><div class="grade-2">
      <div class="campo"><label for="d-nome">Nome</label><input class="entrada" id="d-nome" value="${esc(e.name)}" maxlength="80"></div>
      <div class="campo"><label for="d-razao">Razão social</label><input class="entrada" id="d-razao" value="${esc(e.legal_name)}" maxlength="160"></div>
      <div class="campo"><label for="d-doc">Documento</label><input class="entrada" id="d-doc" value="${esc(e.document)}" maxlength="40"></div>
      <div class="campo"><label for="d-contato">Email de contato</label><input class="entrada" id="d-contato" type="email" value="${esc(e.contact_email)}"></div></div>
      <div class="campo"><label for="d-notas">Notas internas</label><textarea class="entrada" id="d-notas" rows="3" maxlength="1000">${esc(e.notes)}</textarea></div>
      <p class="msg-erro oculto" id="d-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Salvar dados</button><span class="dica">Identificador interno (para o suporte): <code>${esc(e.id)}</code></span></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('dd-t').focus();
    $('f-dados').onsubmit = async ev => {
      ev.preventDefault();
      try { await api(`/api/plataforma/empresas/${id}`, { metodo: 'PUT', corpo: { name: $('d-nome').value, legal_name: $('d-razao').value, document: $('d-doc').value, contact_email: $('d-contato').value, notes: $('d-notas').value } }); fechar(); toast('Dados salvos.'); vistaEmpresa(id, 'resumo'); }
      catch (x) { mostrarErro('d-erro', x); }
    };
  });
}

// Exportações da empresa: finalidade, cópia no servidor, prazo, bloqueio legal, download e eliminação. Em cada linha,
// uma ação à vista (baixar, quando a cópia ainda está no servidor) e as outras em "Mais ações".
async function secaoExportacoes(id) {
  const { exportacoes } = await api(`/api/plataforma/empresas/${id}/acessos`);
  if (!exportacoes.length) return;
  const estado = x => x.eliminadoEm ? `Eliminada do servidor em ${dataHora(x.eliminadoEm)}` : x.controle === 'anterior' ? 'Entregue direto (antes deste controle)' : x.hold ? `Em bloqueio legal: ${esc(x.hold.tipoNome)}` : x.expiraEm ? `Elimina em ${dataHora(x.expiraEm)}` : 'Necessidade em aberto';
  const acoes = x => [
    ...(x.noServidor && !x.necessidadeEncerradaEm ? [{ acao: 'exp-necessidade', id: x.id, rotulo: 'Necessidade encerrada' }] : []),
    ...(x.noServidor && !x.hold ? [{ acao: 'exp-hold', id: x.id, rotulo: 'Bloqueio legal…' }] : []), ...(x.hold ? [{ acao: 'exp-liberar', id: x.id, rotulo: 'Liberar bloqueio legal' }] : []),
    ...(x.baixadoEm && !x.declaracao ? [{ acao: 'exp-declarar', id: x.id, rotulo: 'Declarar eliminação…' }] : []),
  ];
  $('exportacoes-empresa').innerHTML = `<div class="secao-titulo"><h2 class="h-secao">Exportações</h2></div>
    ${tabela(['Quando', 'Finalidade', 'Situação', 'Downloads', ''], exportacoes.map(x => `<tr><td data-r="Quando">${dataHora(x.em)}<br><span class="dica">${esc(x.operador)}</span></td>
      <td data-r="Finalidade">${esc(x.tipoNome)}<br><span class="dica">${esc(x.justificativa)}</span></td><td data-r="Situação">${estado(x)}${x.declaracao ? `<br><span class="dica">Declaração: ${esc(x.declaracao.texto)}</span>` : ''}</td>
      <td data-r="Downloads" class="num">${num(x.downloads)}${x.baixadoPor ? `<br><span class="dica">${esc(x.baixadoPor)}</span>` : ''}</td>
      <td data-r=""><span class="plat-linha-acoes">${x.noServidor ? `<button class="btn-texto" data-exp="baixar" data-id="${x.id}">Baixar</button>` : ''}
        ${menuMais(acoes(x), { rotulo: `Mais ações da exportação de ${dataHora(x.em)}`, classe: 'btn-texto' })}</span></td></tr>`), '')}`;
  const recarregar = () => secaoExportacoes(id);
  const tratar = fn => async b => { try { await fn(b.dataset.id); } catch (e) { falhar(e); } };
  Object.assign(C.mais, {
    'exp-necessidade': tratar(x => confirmarStatus({ rotulo: 'Exportação', titulo: 'Encerrar a necessidade desta cópia?', botao: 'Encerrar a necessidade',
      texto: 'A cópia é eliminada do servidor em 7 dias, salvo bloqueio legal.', async aplicar() { await api(`/api/plataforma/exportacoes/${x}/encerrar-necessidade`, { metodo: 'POST' }); recarregar(); } })),
    'exp-hold': tratar(x => pedirHold({ titulo: 'Bloqueio legal da cópia exportada', enviar: async c => { await api(`/api/plataforma/exportacoes/${x}/hold`, { metodo: 'POST', corpo: c }); recarregar(); } })),
    'exp-liberar': tratar(async x => { await api(`/api/plataforma/exportacoes/${x}/liberar`, { metodo: 'POST' }); recarregar(); }),
    'exp-declarar': tratar(x => confirmarStatus({ rotulo: 'Exportação', titulo: 'Declarar a eliminação da cópia baixada', botao: 'Registrar declaração',
      campos: '<div class="campo"><label for="dc-texto">O que foi feito com a cópia baixada?</label><textarea class="entrada" id="dc-texto" rows="3" maxlength="500" aria-describedby="dc-ajuda"></textarea><span class="ajuda" id="dc-ajuda">Por exemplo: arquivo apagado do notebook e da lixeira em 05/10.</span></div>',
      validar: () => (!$('dc-texto').value.trim() ? 'Descreva o que foi feito com a cópia.' : ''),
      async aplicar() { await api(`/api/plataforma/exportacoes/${x}/declarar-eliminacao`, { metodo: 'POST', corpo: { texto: $('dc-texto').value.trim() } }); recarregar(); } })),
  });
  for (const b of document.querySelectorAll('[data-exp="baixar"]')) b.onclick = async () => { try { await baixar(`/api/plataforma/exportacoes/${b.dataset.id}/arquivo`); recarregar(); } catch (e) { falhar(e); } };
}

// Ambiente cancelado: data da exclusão automática, bloqueio legal e pedidos de devolução.
async function secaoEncerramento(id) {
  const { exclusoes } = await api('/api/plataforma/exclusoes');
  const l = exclusoes.find(x => x.companyId === id && x.status === 'pendente');
  if (!l) return;
  $('encerramento-empresa').innerHTML = `<div class="indicadores"><div class="indicador"><span>Cancelada em</span><b style="font-size:14px">${dataHora(l.canceladaEm)}</b>${l.estimado ? '<small>data estimada</small>' : ''}</div>
      <div class="indicador"><span>Exclusão definitiva</span><b style="font-size:14px">${l.hold ? 'Suspensa (bloqueio legal)' : dataHora(l.excluirApos)}</b><small>${l.hold ? esc(l.hold.tipoNome) : diasTexto(l.diasRestantes)}</small></div></div>
    ${l.estimado ? '<p class="dica">A data de cancelamento foi estimada na migração. A exclusão automática fica parada até a data ser confirmada.</p>' : ''}
    <div class="linha-botoes">${l.estimado ? '<button class="btn btn-linha" id="confirmar-data-exc">Confirmar a data</button>' : ''}${l.hold ? '<button class="btn btn-linha" id="liberar-hold-exc">Liberar bloqueio legal</button>' : '<button class="btn btn-linha" id="hold-exc">Bloqueio legal da exclusão</button>'}</div>
    ${l.devolucoes.length ? tabela(['Pedido de devolução', 'Situação', ''], l.devolucoes.map(d => `<tr><td data-r="Pedido">${esc(d.solicitante_email)}<br><span class="dica">${dataHora(d.solicitado_em)}</span></td>
      <td data-r="Situação">${{ solicitada: 'Aguardando a cópia', gerada: `Link enviado; vale até ${dataHora(d.link_expira)}`, entregue: `Entregue em ${dataHora(d.entregue_em)}`, expirada: 'Link vencido sem download', cancelada: 'Encerrado' }[d.status]}</td>
      <td data-r="">${d.status === 'solicitada' ? `<button class="btn-texto" data-dev="${d.id}">Gerar cópia e enviar link</button>` : ''}</td></tr>`), '') : ''}`;
  $('hold-exc')?.addEventListener('click', () => pedirHold({ titulo: 'Bloqueio legal da exclusão definitiva', enviar: async c => { await api(`/api/plataforma/empresas/${id}/exclusao/hold`, { metodo: 'POST', corpo: c }); vistaEmpresa(id, 'resumo'); } }));
  $('confirmar-data-exc')?.addEventListener('click', () => confirmarStatus({ rotulo: 'Encerramento', titulo: `Confirmar o cancelamento em ${dataHora(l.canceladaEm)}?`, botao: 'Confirmar a data',
    texto: `A exclusão automática passa a valer a partir de ${dataHora(l.excluirApos)}.`, async aplicar() { await api(`/api/plataforma/empresas/${id}/exclusao/confirmar-data`, { metodo: 'POST' }); vistaEmpresa(id, 'resumo'); } }));
  $('liberar-hold-exc')?.addEventListener('click', async () => { try { await api(`/api/plataforma/empresas/${id}/exclusao/liberar`, { metodo: 'POST' }); vistaEmpresa(id, 'resumo'); } catch (x) { falhar(x); } });
  for (const b of document.querySelectorAll('[data-dev]')) b.onclick = () => confirmarStatus({ rotulo: 'Devolução dos dados', titulo: 'Gerar a cópia e enviar o link?', botao: 'Gerar cópia e enviar link',
    texto: 'A cópia completa do banco é gerada e quem pediu recebe por email um link de uso único, válido por 7 dias. A geração fica registrada como exportação por pedido do cliente.',
    async aplicar() { await api(`/api/plataforma/devolucoes/${b.dataset.dev}/gerar`, { metodo: 'POST' }); toast('Cópia gerada e link enviado. A geração ficou registrada como exportação por pedido do cliente.', 7000); vistaEmpresa(id, 'resumo'); } });
}

// Encerramentos: ambientes cancelados aguardando a exclusão automática (e os excluídos nos últimos 90 dias).
async function vistaEncerramentos() {
  carregando('Encerramentos');
  const { exclusoes, prazoDias, aplicar } = await api('/api/plataforma/exclusoes');
  tela('Encerramentos', `${proposito('Ambientes cancelados aguardando a exclusão definitiva.', { titulo: 'Encerramentos', textos: [
    `Ambientes cancelados são excluídos definitivamente ${num(prazoDias)} dias depois do cancelamento, salvo bloqueio legal.`,
    'Antes disso, um admin da empresa pode pedir uma cópia dos dados ou a exclusão antecipada, com código enviado ao email cadastrado.',
    'Para aplicar um bloqueio legal ou gerar a cópia de um pedido de devolução, abra a empresa.',
  ] })}
    ${aplicar ? '' : '<div class="faixa-aviso atencao">A exclusão automática está em modo simulação: a rotina só registra o que faria, sem excluir nada.</div>'}
    ${tabela(['Empresa', 'Cancelada em', 'Exclusão', 'Devolução'], exclusoes.map(l => `<tr><td data-r="Empresa">${l.status === 'pendente' ? `<a href="#/empresas/${l.companyId}"><b>${esc(l.nome)}</b></a>` : `<b>${esc(l.nome)}</b>`}<br><span class="dica">${esc(l.slug)}</span></td>
      <td data-r="Cancelada em">${dataHora(l.canceladaEm)}${l.estimado ? '<br><span class="dica">estimada</span>' : ''}</td>
      <td data-r="Exclusão">${l.status === 'excluida' ? `Excluída em ${dataHora(l.excluidaEm)} (${esc({ rotina: 'automática', cliente: 'a pedido do cliente', console: 'pelo console' }[l.via] || l.via)})` : l.status === 'revertida' ? 'Ambiente reaberto' : l.hold ? `Bloqueio legal: ${esc(l.hold.tipoNome)}` : `${dataHora(l.excluirApos)} · ${diasTexto(l.diasRestantes)}`}</td>
      <td data-r="Devolução">${l.devolucoes.map(d => esc(DEVOLUCAO[d.status] || d.status)).join(', ') || '–'}</td></tr>`), vazioHtml({ icone: 'predio', titulo: 'Nenhum ambiente cancelado', texto: 'Quando uma empresa for cancelada, a data da exclusão aparece aqui.' }))}`);
}

// Usuários da empresa: uma ação por linha ("Alterar", que abre perfil, acesso e remoção); adicionar fica no cabeçalho.
async function abaUsuarios(d, id) {
  const roles = d.roles;
  const opcoes = sel => roles.map(r => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}${r.system ? '' : ' (da empresa)'}</option>`).join('');
  const nomePerfil = rid => esc(roles.find(r => r.id === rid)?.name || PERFIS[String(rid).replace(/^role_/, '')] || '—');
  acoesAba('<button class="btn btn-verde btn-pequeno" id="add-usuario">Adicionar pessoa</button>');
  $('aba').innerHTML = `${proposito('Pessoas com acesso a este ambiente e o perfil de cada uma.')}
    ${tabela(['Pessoa', 'Perfil', 'Acesso nesta empresa', ''], d.usuarios.map(u => `<tr><td data-r="Pessoa"><b>${esc(u.name || u.email)}</b><br><span class="dica">${esc(u.email)}</span></td>
      <td data-r="Perfil">${nomePerfil(u.role_id)}</td><td data-r="Acesso">${esc(ACESSO[u.status] || u.status)}</td>
      <td data-r=""><button class="btn-texto" data-alterar="${u.id}" aria-label="Alterar o acesso de ${esc(u.name || u.email)}">Alterar</button></td></tr>`), 'Nenhum usuário. Adicione o administrador da empresa.')}`;
  $('add-usuario').onclick = () => modal(`<div class="modal-topo"><div class="rotulo">Usuários</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="u-t" tabindex="-1">Adicionar pessoa à ${esc(d.empresa.name)}</h2>
    <form id="f-usuario" novalidate>
      <div class="campo"><label for="u-email">Email</label><input class="entrada" id="u-email" type="email" autocomplete="off"></div>
      <div class="campo"><label for="u-nome">Nome</label><input class="entrada" id="u-nome" maxlength="120"></div>
      <div class="campo"><label for="u-role">Perfil</label><select class="entrada" id="u-role">${opcoes('role_company_admin')}</select><span class="ajuda">A pessoa recebe um convite por email.</span></div>
      <p class="msg-erro oculto" id="u-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Adicionar e convidar</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('u-email').focus();
    $('f-usuario').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}/usuarios`, { metodo: 'POST', corpo: { email: $('u-email').value, name: $('u-nome').value, role_id: $('u-role').value } }); fechar(); toast('Usuário adicionado e convidado.'); vistaEmpresa(id, 'usuarios'); } catch (x) { mostrarErro('u-erro', x); } };
  });
  for (const b of document.querySelectorAll('[data-alterar]')) b.onclick = () => {
    const u = d.usuarios.find(x => x.id === b.dataset.alterar), nome = u.name || u.email;
    modal(`<div class="modal-topo"><div class="rotulo">Usuários</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
      <h2 id="ua-t" tabindex="-1">${esc(nome)}</h2><p class="dica">${esc(u.email)}</p>
      <form id="f-alterar-usuario" novalidate>
        <div class="campo"><label for="ua-role">Perfil</label><select class="entrada" id="ua-role" data-role="${u.id}">${opcoes(u.role_id)}</select></div>
        <div class="campo"><label for="ua-st">Acesso nesta empresa</label><select class="entrada" id="ua-st" data-st="${u.id}">${Object.entries(ACESSO).map(([s, n]) => `<option value="${s}" ${s === u.status ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <p class="msg-erro oculto" id="ua-erro" role="alert"></p>
        <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Salvar alterações</button><button type="button" class="btn-texto link-perigo" id="ua-remover" style="margin-left:auto">Remover da empresa…</button></div></form>`, fechar => {
      $('fechar').onclick = fechar; $('ua-t').focus();
      $('f-alterar-usuario').onsubmit = async ev => {
        ev.preventDefault();
        const corpo = { ...($('ua-role').value !== u.role_id ? { role_id: $('ua-role').value } : {}), ...($('ua-st').value !== u.status ? { status: $('ua-st').value } : {}) };
        if (!Object.keys(corpo).length) return fechar();
        try { await api(`/api/plataforma/empresas/${id}/usuarios/${u.id}`, { metodo: 'PUT', corpo }); fechar(); toast('Alterado.'); vistaEmpresa(id, 'usuarios'); } catch (x) { mostrarErro('ua-erro', x); }
      };
      $('ua-remover').onclick = () => confirmarStatus({ rotulo: 'Usuários', titulo: `Remover ${nome} da ${d.empresa.name}?`, perigo: true, botao: `Remover ${nome}`,
        texto: 'A pessoa perde o acesso a este ambiente na hora. O histórico dela continua no ambiente.',
        async aplicar() { await api(`/api/plataforma/empresas/${id}/usuarios/${u.id}`, { metodo: 'DELETE' }); toast('Pessoa removida.'); vistaEmpresa(id, 'usuarios'); } });
    });
  };
}

// Editores compartilhados com o admin da empresa (editores.js): no console, o salvar sai do fim do formulário e vai
// para o cabeçalho (sempre à vista, a ação principal da aba); o resto do formulário fica igual.
const salvarNoCabecalho = (form, rotulo) => {
  const f = $(form);
  const fim = [...f.querySelectorAll(':scope > .linha-botoes')].filter(x => x.querySelector('.btn-verde')).at(-1);
  if (fim?.children.length === 1) fim.remove(); else fim?.querySelector('.btn-verde')?.remove();
  acoesAba(`<button type="submit" form="${form}" class="btn btn-verde btn-pequeno">${esc(rotulo)}</button>`);
};

async function abaMarca(d, id) {
  $('aba').innerHTML = `${proposito('Logo, cores e textos do login, da página de apresentação e do app.')}${renderMarca(d.marca, { modo: 'plataforma' })}`;
  salvarNoCabecalho('form-marca', 'Salvar identidade visual');
  // Bloquear itens para a empresa é raro: as caixas ficam fechadas; no fim do formulário, o estado e o botão para alterar.
  const travas = [...document.querySelectorAll('#form-marca [data-bloqueio]')];
  travas.forEach(x => x.parentElement.classList.add('trava-marca'));
  const bloqueados = () => travas.filter(x => x.checked).map(x => ROTULOS_BLOQUEIO[x.dataset.bloqueio] || x.dataset.bloqueio);
  $('mk-erro').insertAdjacentHTML('beforebegin', `<p class="dica plat-bloqueios"><span id="mk-bloq-estado"></span> <button type="button" class="btn-texto" id="mk-travas" aria-expanded="false">Escolher itens bloqueados</button></p>`);
  const estado = () => { const b = bloqueados(); $('mk-bloq-estado').textContent = b.length ? `Bloqueados para a empresa: ${b.join(', ')}.` : 'A empresa pode alterar todos os itens liberados.'; };
  estado(); travas.forEach(x => x.addEventListener('change', estado));
  // Fechadas, as caixas "bloquear para a empresa" somem; abertas, aparecem ao lado de cada item.
  $('mk-travas').onclick = ev => { const aberto = $('form-marca').classList.toggle('com-travas'); ev.currentTarget.setAttribute('aria-expanded', String(aberto)); };
  const ler = ligarMarca(d.marca);
  $('form-marca').onsubmit = async ev => {
    ev.preventDefault();
    try {
      const { corpo, bloqueados: travados } = await ler();
      await api(`/api/plataforma/empresas/${id}/marca`, { metodo: 'PUT', corpo });
      await api(`/api/plataforma/empresas/${id}/concessoes`, { metodo: 'PUT', corpo: { locked: travados } });
      toast('Identidade visual salva.'); vistaEmpresa(id, 'marca');
    } catch (x) { erroForm('mk-erro', x); }
  };
}

async function abaLanding(d, id) {
  $('aba').innerHTML = `${proposito('A página pública do ambiente, com o botão de entrar.')}${renderLanding(d.landing, { urlPublica: d.empresa.url, rotaPrevia: `/api/plataforma/empresas/${id}/landing/previa` })}`;
  // Uma ação principal no cabeçalho: publicar (rascunho) ou salvar e atualizar (publicada). As repetidas saem.
  const publicada = d.landing?.status === 'publicada';
  const situacao = document.querySelector('.ld-situacao > span:first-child');
  if (situacao && !publicada) situacao.innerHTML = '<b>Rascunho:</b> a página pública mostra só o título e o botão de entrar até você publicar.';
  else if (situacao && /fora do ar/.test(situacao.textContent)) situacao.innerHTML = '<b>Publicada, mas fora do ar:</b> os visitantes veem só a versão simples até o ambiente ser ativado.';
  else if (situacao) situacao.innerHTML = '<b>Publicada e no ar.</b>';
  document.querySelectorAll('#form-landing [data-acao="publicar"]').forEach(b => b.remove());
  const salvarFim = document.querySelector('#form-landing .ld-salvar [data-acao="salvar"]');
  if (publicada) { salvarFim?.remove(); acoesAba('<button type="submit" form="form-landing" class="btn btn-verde btn-pequeno">Salvar e atualizar a página</button>'); }
  else { salvarFim?.classList.replace('btn-verde', 'btn-linha'); acoesAba('<button type="button" class="btn btn-verde btn-pequeno" data-acao="publicar">Publicar agora</button>'); }
  const ler = ligarLanding(d.landing, { pedir: api });
  const salvar = async status => { try { await api(`/api/plataforma/empresas/${id}/landing`, { metodo: 'PUT', corpo: await ler(status) }); toast(status === 'publicada' ? 'Página de apresentação publicada: as seções já aparecem na página.' : status === 'rascunho' ? 'A página de apresentação voltou para rascunho: a página pública mostra só a versão simples.' : publicada ? 'Página de apresentação salva e já no ar.' : 'Salvo como rascunho. Para aparecer na página, clique em Publicar agora.', 7000); vistaEmpresa(id, 'landing'); } catch (x) { erroForm('ld-erro', x); } };
  $('form-landing').onsubmit = ev => { ev.preventDefault(); salvar(); };
  for (const b of document.querySelectorAll('#principal [data-acao="publicar"]')) b.addEventListener('click', () => salvar('publicada'));
  document.querySelector('[data-acao="despublicar"]')?.addEventListener('click', () => salvar('rascunho'));
}

async function abaUrl(d, id) {
  const e = d.empresa;
  const u = { slug: e.slug, custom_domain: e.custom_domain, url: e.url, dominio: { status: e.domain_status, mensagem: e.domain_message, verificadoEm: e.domain_checked_at }, dns: d.dns };
  $('aba').innerHTML = renderUrl(u, { plataforma: true });
  const lead = document.querySelector('#aba > .lead');
  if (lead) { lead.classList.add('plat-proposito'); lead.textContent = 'Como as pessoas da empresa chegam ao ambiente.'; }
  salvarNoCabecalho('f-url', 'Salvar endereço');
  // Domínio próprio é opcional: sem domínio, os passos ficam fechados até a pessoa pedir.
  const passos = document.querySelector('#f-url .url-lista');
  if (passos && !e.custom_domain) { passos.id = 'url-passos-dominio'; passos.hidden = true; passos.insertAdjacentHTML('beforebegin', `<p>${revelar('url-passos-dominio', 'Configurar um domínio próprio')}</p>`); }
  ligarUrl(u);
  $('verificar-dominio')?.addEventListener('click', ev => ocupado(ev.currentTarget, async () => { try { const r = await api(`/api/plataforma/empresas/${id}/dominio/verificar`, { metodo: 'POST' }); toast(r.status === 'verificado' ? 'Domínio verificado.' : r.mensagem, r.status === 'verificado' ? undefined : 7000); vistaEmpresa(id, 'url'); } catch (x) { falhar(x); } }));
  $('f-url').onsubmit = async ev => { ev.preventDefault(); try { await api(`/api/plataforma/empresas/${id}/url`, { metodo: 'PUT', corpo: { slug: $('url-slug').value, custom_domain: $('url-dom').value } }); toast('Endereço salvo.'); vistaEmpresa(id, 'url'); } catch (x) { erroForm('url-erro', x); } };
}

export function statusDominio(dominio, status, mensagem, em) {
  if (!dominio) return '';
  const ok = status === 'verificado';
  return `<div class="faixa-aviso ${ok ? 'ok' : 'atencao'}"><b>${esc(dominio)}</b>: ${ok ? 'verificado' : 'aguardando o DNS'}${em ? ` (conferido em ${dataHora(em)})` : ''}. ${esc(mensagem || '')}
    <button type="button" class="btn-texto btn-pequeno" id="verificar-dominio">Verificar agora</button></div>`;
}

// Os bloqueios de itens da marca se alteram só na aba Marca (junto do item); aqui aparece apenas o estado.
const ROTULOS_BLOQUEIO = { ...ROTULOS_MARCA, favicon: 'Ícone da aba' };
async function abaPermissoes(d, id) {
  const g = d.concessoes, p = d.podeEditar, b = d.marca.locked || [];
  acoesAba('<button type="submit" form="f-conc" class="btn btn-verde btn-pequeno">Salvar permissões</button>');
  $('aba').innerHTML = `${proposito('O que o administrador da empresa pode personalizar. Vale o que estiver liberado aqui e incluído no plano.')}
    <form id="f-conc">
      <h2 class="h-secao">Itens liberados para a empresa</h2>
      <div class="checagens">${Object.entries(C.catalogo.concessoes).map(([k, n]) => `<label><input type="checkbox" data-g="${k}" ${g[k] ? 'checked' : ''}> <span>${esc(n)}<small>${p[k] ? (k === 'domain' ? 'Liberado (vale em todos os planos)' : 'Liberado e incluído no plano') : g[k] ? 'Liberado, mas fora do plano atual' : 'Não liberado'}</small></span></label>`).join('')}</div>
      <h2 class="h-secao">Itens da marca bloqueados</h2>
      <p class="dica" id="bloqueios-marca">${b.length ? `Bloqueados para a empresa: ${b.map(k => esc(ROTULOS_BLOQUEIO[k] || k)).join(', ')}.` : 'Nenhum item da marca bloqueado: a empresa pode alterar todos os que estiverem liberados.'}
        <a href="#/empresas/${id}/marca">Alterar na aba Marca</a></p></form>`;
  $('f-conc').onsubmit = async ev => {
    ev.preventDefault();
    const grants = Object.fromEntries([...document.querySelectorAll('[data-g]')].map(x => [x.dataset.g, x.checked]));
    try { await api(`/api/plataforma/empresas/${id}/concessoes`, { metodo: 'PUT', corpo: { grants } }); toast('Permissões salvas.'); vistaEmpresa(id, 'permissoes'); } catch (x) { falhar(x); }
  };
}

async function abaAuditoriaEmpresa(d, id) {
  const a = await api(`/api/plataforma/auditoria?empresa=${encodeURIComponent(id)}`);
  $('aba').innerHTML = `${proposito('Ações administrativas nesta empresa: quem fez, o antes e o depois.')}${listaAuditoria(a.itens, false)}`;
}

// ---------------------------------------------------------------- Usuários
async function vistaUsuarios() {
  carregando('Usuários');
  const [{ usuarios }, cfg] = await Promise.all([api('/api/plataforma/usuarios'), api('/api/plataforma/configuracoes')]);
  tela('Usuários', `${proposito('Todas as pessoas da plataforma, com as empresas de que fazem parte.', { titulo: 'Usuários da plataforma', textos: [
    'Administradores da plataforma entram neste console. Os acessos deles às empresas continuam separados.',
    'Bloquear um usuário encerra o acesso dele em todas as empresas e as sessões abertas. Dá para desbloquear depois.',
    'Para mudar o perfil ou o acesso de alguém numa empresa, abra a empresa pelo nome dela na lista.',
  ] })}
    <div class="secao-titulo" style="margin-top:0"><h2 class="h-secao">Administradores da plataforma</h2></div>
    ${tabela(['Administrador', ''], cfg.admins.map(a => `<tr><td data-r="Administrador">${esc(a.email)}</td><td data-r="">${a.id === C.eu.usuario.id ? '<span class="dica">você</span>' : `<button class="btn-texto link-perigo" data-rmadm="${a.id}" data-email="${esc(a.email)}">Remover</button>`}</td></tr>`), '')}
    <div class="secao-titulo"><h2 class="h-secao">Todas as pessoas</h2></div>
    ${tabela(['Pessoa', 'Empresas (perfil e acesso)', 'Conta', ''], usuarios.map(u => `<tr><td data-r="Pessoa"><b>${esc(u.name || u.email)}</b><br><span class="dica">${esc(u.email)}</span>${u.adminPlataforma ? ' <span class="selo-escopo" style="margin:0 0 0 6px">Plataforma</span>' : ''}</td>
      <td data-r="Empresas">${u.empresas.map(e => `<span class="valor-bloco"><a href="#/empresas/${e.id}/usuarios">${esc(e.name)}</a> <span class="dica">${esc(e.role)} · acesso ${esc((ACESSO[e.status] || e.status).toLowerCase())}</span></span>`).join('') || '<span class="dica">Nenhuma empresa</span>'}</td>
      <td data-r="Conta">${u.status === 'ativo' ? '<span class="selo selo-verde">Ativa</span>' : '<span class="selo selo-vermelho">Bloqueada</span>'}</td>
      <td data-r="">${u.id === C.eu.usuario.id ? '' : `<button class="btn-texto${u.status === 'ativo' ? ' link-perigo' : ''}" data-bloq="${u.id}" data-email="${esc(u.email)}" data-st="${u.status === 'ativo' ? 'bloqueado' : 'ativo'}">${u.status === 'ativo' ? 'Bloquear' : 'Desbloquear'}</button>`}</td></tr>`), 'Nenhum usuário.')}`,
  '<button class="btn btn-verde btn-pequeno" id="add-admin">Adicionar administrador</button>');
  $('add-admin').onclick = () => modal(`<div class="modal-topo"><div class="rotulo">Administradores da plataforma</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="adm-t" tabindex="-1">Adicionar administrador da plataforma</h2>
    <form id="f-admin" novalidate><div class="campo"><label for="a-email">Email do novo administrador</label><input class="entrada" id="a-email" type="email" autocomplete="off"><span class="ajuda">A pessoa passa a entrar neste console, com código enviado ao email.</span></div>
      <p class="msg-erro oculto" id="a-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Adicionar administrador</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('a-email').focus();
    $('f-admin').onsubmit = async ev => { ev.preventDefault(); try { await api('/api/plataforma/admins', { metodo: 'POST', corpo: { email: $('a-email').value } }); fechar(); toast('Administrador adicionado.'); vistaUsuarios(); } catch (x) { mostrarErro('a-erro', x); } };
  });
  for (const b of document.querySelectorAll('[data-rmadm]')) b.onclick = () => confirmarStatus({ rotulo: 'Administradores da plataforma', titulo: `Tirar o acesso de ${b.dataset.email} ao console?`, perigo: true, botao: 'Remover administrador',
    texto: 'A pessoa deixa de entrar no console da plataforma. Os acessos dela às empresas continuam como estão.',
    async aplicar() { await api(`/api/plataforma/admins/${b.dataset.rmadm}`, { metodo: 'DELETE' }); toast('Administrador removido.'); vistaUsuarios(); } });
  const mudarConta = async b => { await api(`/api/plataforma/usuarios/${b.dataset.bloq}`, { metodo: 'PUT', corpo: { status: b.dataset.st } }); vistaUsuarios(); };
  for (const b of document.querySelectorAll('[data-bloq]')) b.onclick = async () => {
    if (b.dataset.st === 'bloqueado') return confirmarStatus({ rotulo: 'Usuários', titulo: `Bloquear ${b.dataset.email}?`, perigo: true, botao: 'Bloquear em todas as empresas',
      texto: 'A pessoa perde o acesso a todas as empresas de que faz parte, e as sessões abertas são encerradas. Dá para desbloquear depois.', aplicar: () => mudarConta(b) });
    try { await mudarConta(b); } catch (x) { falhar(x); }
  };
}

// ---------------------------------------------------------------- Planos
// Margem TOTAL no pior caso (franquia + reserva inteiras): receita − impostos − pagamento/câmbio − suporte/operação −
// IA com a taxa do intermediário − parte da infraestrutura. Tudo vem calculado do servidor, a partir das premissas.
const pctM = v => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const SELO_MARGEM = { critico: ['selo-vermelho', 'Abaixo do piso'], alerta: ['selo-ambar', 'Abaixo da meta'], saudavel: ['selo-verde', 'Saudável'] };
const seloMargem = st => st ? `<span class="selo ${SELO_MARGEM[st][0]}">${SELO_MARGEM[st][1]}</span>` : '';
const margemPlano = e => !e ? '–' : e.semTeto ? '<span class="selo selo-ambar">Sem teto de custo (interno)</span>' : e.semReceita ? `<span class="selo selo-ambar">Sem receita · até ${usd(e.custoPiorCaso)}/mês</span>`
  : `<b>${pctM(e.margem)}</b> ${seloMargem(e.status)}`;
const PREMISSAS_EDITAVEIS = ['tax_rate', 'payment_fx_rate', 'support_operation_rate', 'ai_provider_fee_rate', 'min_total_margin_rate', 'target_total_margin_rate'];
async function vistaPlanos() {
  carregando('Planos');
  const [rp, pm] = await Promise.all([api('/api/plataforma/planos'), api('/api/plataforma/premissas')]);
  C.planos = rp.planos;
  const pk = rp.planos.find(p => p.economia?.pacote)?.economia.pacote;
  tela('Planos', `${proposito('Créditos, preço e margem de cada plano. Mudanças valem na hora para as empresas.', { titulo: 'Planos e margem', textos: [
    `Margem total no pior caso: a empresa usa toda a franquia e toda a reserva. Desconta impostos, pagamento/câmbio, suporte/operação, a IA (US$ ${esc(pm.premissas.ai_credit_base_cost.toLocaleString('pt-BR'))} por crédito + ${pctM(pm.premissas.ai_provider_fee_rate)} do intermediário) e a parte de cada empresa na infraestrutura (${usd(rp.infraPorEmpresa)} hoje).`,
    `Piso ${pctM(rp.margemMinima)}: abaixo disso o plano não é salvo. Meta ${pctM(rp.metaMargem)}.`,
    'O Capacity Pack usa a infraestrutura que a empresa já tem, sem reserva nova; os créditos acumulam.',
    'As premissas econômicas valem para todas as margens e travas. São percentuais da receita, exceto a taxa do intermediário (sobre o custo de IA). O custo-base do crédito é a definição do crédito no consumo e não muda aqui.',
  ] })}
    ${tabela(['Plano', 'Status', '#Créditos + reserva', '#Preço', '#Margem total', '#Preço mínimo (piso)', '#Empresas'], C.planos.map(p => `<tr><td data-r="Plano"><a href="#/planos/${p.id}"><b>${esc(p.name)}</b></a><br><span class="dica">${esc(p.description)}</span></td>
      <td data-r="Status">${p.status === 'ativo' ? '<span class="selo selo-verde">Ativo</span>' : '<span class="selo selo-cinza">Inativo</span>'}</td>
      <td class="num" data-r="Créditos + reserva">${p.credits ? `${num(p.credits)} + ${num(p.reserve)}` : 'Ilimitado'}</td><td class="num" data-r="Preço">${usd(p.price_usd)}</td>
      <td class="num" data-r="Margem total">${margemPlano(p.economia)}</td><td class="num" data-r="Preço mínimo">${p.economia?.precoMinimo ? usd(p.economia.precoMinimo) : '–'}</td><td class="num" data-r="Empresas">${num(p.empresas)}</td></tr>`), 'Nenhum plano.')}
    ${pk ? `<p class="dica"><b>${esc(pk.nome || 'Capacity Pack')}</b>: +${num(pk.creditos)} créditos por ${usd(pk.preco)} · margem total ${pctM(pk.margem)} ${seloMargem(pk.status)}</p>` : ''}
    <div class="secao-titulo"><h2 class="h-secao">Premissas econômicas</h2>${revelar('f-premissas', 'Ver e alterar')}</div>
    <form id="f-premissas" class="grade-2" hidden>${PREMISSAS_EDITAVEIS.map(k => `<div class="campo"><label for="pm-${k}">${esc(pm.nomes[k])} (%)</label><input class="entrada" id="pm-${k}" type="number" min="0" max="99" step="0.1" value="${Math.round(pm.premissas[k] * 1000) / 10}"></div>`).join('')}
      <div class="linha-botoes"><button class="btn btn-linha btn-pequeno">Salvar premissas</button></div></form>`,
  '<a class="btn btn-verde btn-pequeno" href="#/planos/novo">Novo plano</a>');
  $('f-premissas').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/api/plataforma/premissas', { metodo: 'PUT', corpo: Object.fromEntries(PREMISSAS_EDITAVEIS.map(k => [k, Number($(`pm-${k}`).value) / 100])) }); toast('Premissas salvas.'); vistaPlanos(); } catch (x) { falhar(x); }
  };
}

// Prévia da economia do plano em edição: a mesma conta do salvamento (a trava é sempre o pior caso). Os três números
// ficam à vista; a conta completa (custos e uso parcial) abre sob pedido e continua aberta enquanto se digita.
const linhaEco = (r, v) => `<tr><td>${r}</td><td class="num">${v}</td></tr>`;
function previaHtml(e) {
  if (!e) return '';
  if (e.semTeto) return '<p class="dica">Créditos ilimitados: plano interno, sem teto de custo e sem margem.</p>';
  if (e.semReceita) return `<p class="dica">Sem preço: plano sem receita (piloto ou cortesia). Custo máximo no mês: ${usd(e.custoPiorCaso)}.</p>`;
  const sim = e.simulacao.map(x => `<td class="num">${pctM(x.margem)}</td>`).join('');
  return `<div class="indicadores"><div class="indicador"><span>Margem total no pior caso</span><b>${pctM(e.margem)}</b><small>${seloMargem(e.status)}</small></div>
      <div class="indicador"><span>Preço mínimo para o piso</span><b>${usd(e.precoMinimo)}</b><small>folga de ${pctM(e.folga)} sobre o piso</small></div>
      <div class="indicador"><span>Contribuição no pior caso</span><b>${usd(e.contribuicao)}</b><small>de ${usd(e.preco)}</small></div></div>
    ${revelar('pl-conta', 'Ver a conta completa', !!C.contaAberta)}
    <div id="pl-conta" ${C.contaAberta ? '' : 'hidden'}><div class="tabela-rolagem"><table class="tabela"><tbody>
      ${linhaEco(`Capacidade máxima (créditos + reserva)`, num(e.capacidadePiorCaso))}${linhaEco('Custo máximo de IA (com a taxa)', usd(e.custoIaPiorCaso))}
      ${linhaEco('Impostos', usd(e.impostos))}${linhaEco('Pagamento e câmbio', usd(e.pagamento))}${linhaEco('Suporte e operação', usd(e.suporte))}
      ${linhaEco('Infraestrutura alocada', usd(e.infra))}${linhaEco('<b>Custo total</b>', `<b>${usd(e.custoPiorCaso)}</b>`)}
      ${linhaEco('Margem de IA (diagnóstico, não é a trava)', pctM(e.margemIa))}</tbody></table></div>
    <p class="dica">Margem total com uso parcial da franquia (a trava considera sempre o pior caso):</p>
    <div class="tabela-rolagem"><table class="tabela"><thead><tr><th class="num">25%</th><th class="num">50%</th><th class="num">75%</th><th class="num">100%</th><th class="num">100% + reserva</th></tr></thead><tbody><tr>${sim}</tr></tbody></table></div>
    ${e.pacote ? `<p class="dica">${esc(e.pacote.nome || 'Capacity Pack')}: margem total ${pctM(e.pacote.margem)} ${seloMargem(e.pacote.status)} · preço mínimo ${usd(e.pacote.precoMinimo)}.</p>` : ''}</div>`;
}

async function vistaPlano(id) {
  if (!C.planos.length) C.planos = (await api('/api/plataforma/planos')).planos;
  const p = id === 'novo' ? { name: '', description: '', status: 'ativo', credits: 2000, reserve: 400, price_usd: '', limits: { max_users: 0, messages_per_minute: 12, max_quick_wins: 0 }, features: Object.fromEntries(Object.keys(C.catalogo.recursos).map(k => [k, true])), rules: { reserve_fast_only: true, pack_name: 'Capacity Pack', pack_credits: 2000, pack_price_usd: 229 }, settings: {} } : C.planos.find(x => x.id === id);
  if (!p) return tela('Plano', '<p>Plano não encontrado.</p>', '', '#/planos');
  C.contaAberta = false;
  const ajuda = { titulo: 'Plano', textos: [
    'Créditos por mês: 0 deixa o plano ilimitado (sem teto de créditos, sem reserva e sem avisos de consumo).',
    'Reserva de continuidade: usada depois dos créditos e dos Capacity Packs, só no nível Rápido. Padrão: 20% da franquia.',
    'O preço só aparece para a operação; a empresa nunca vê valores em dólar.',
    'A margem total é conferida no pior caso (toda a franquia e toda a reserva usadas). Abaixo do piso, o plano não é salvo.',
    'O Capacity Pack não traz reserva nova e usa a infraestrutura que a empresa já tem; os créditos acumulam.',
    id === 'novo' ? 'O plano novo aparece para novas empresas quando está ativo.' : 'Salvar vale na hora para todas as empresas vinculadas.',
  ] };
  tela(id === 'novo' ? 'Novo plano' : p.name, `${proposito(id === 'novo' ? 'Créditos, preço, limites e recursos do novo plano.' : 'Créditos, preço, limites e recursos; vale na hora para as empresas.', ajuda)}<form id="f-plano" novalidate>
    <div class="grade-2"><div class="campo"><label for="pl-nome">Nome</label><input class="entrada" id="pl-nome" value="${esc(p.name)}" maxlength="60"></div>
      <div class="campo"><label for="pl-status">Status</label><select class="entrada" id="pl-status"><option value="ativo" ${p.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${p.status !== 'ativo' ? 'selected' : ''}>Inativo (não aparece para novas empresas)</option></select></div></div>
    <div class="campo"><label for="pl-desc">Descrição</label><input class="entrada" id="pl-desc" value="${esc(p.description)}" maxlength="300"></div>
    <div class="grade-2"><div class="campo"><label for="pl-cred">Créditos por mês</label><input class="entrada" id="pl-cred" type="number" min="0" value="${p.credits}"><span class="ajuda">0 = ilimitado.</span></div>
      <div class="campo"><label for="pl-res">Reserva de continuidade</label><input class="entrada" id="pl-res" type="number" min="0" value="${p.reserve}"><span class="ajuda">Só no nível Rápido. Padrão: 20% da franquia.</span></div>
      <div class="campo"><label for="pl-preco">Preço mensal (US$)</label><input class="entrada" id="pl-preco" type="number" min="0" step="0.01" value="${p.price_usd ?? ''}"><span class="ajuda">A empresa nunca vê valores em dólar.</span></div></div>
    <h2 class="h-secao">Economia no pior caso</h2><div id="pl-previa" aria-live="polite">${previaHtml(p.economia)}</div>
    <h2 class="h-secao">Limites</h2><div class="grade-2">${Object.entries(C.catalogo.limites).map(([k, n]) => `<div class="campo"><label for="pl-l-${k}">${esc(n)}</label><input class="entrada" id="pl-l-${k}" type="number" min="0" value="${p.limits[k] ?? 0}"></div>`).join('')}</div>
    <h2 class="h-secao">Recursos</h2><div class="checagens">${Object.entries(C.catalogo.recursos).map(([k, n]) => `<label><input type="checkbox" data-f="${k}" ${p.features[k] ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
    <h2 class="h-secao">Regras de consumo</h2><div class="grade-2">
      <div class="campo"><label for="pl-pc">Créditos do Capacity Pack</label><input class="entrada" id="pl-pc" type="number" min="0" value="${p.rules.pack_credits ?? 0}"></div>
      <div class="campo"><label for="pl-pp">Preço do Capacity Pack (US$)</label><input class="entrada" id="pl-pp" type="number" min="0" step="0.01" value="${p.rules.pack_price_usd ?? 0}"></div></div>
    <label class="dica" style="display:flex;gap:8px;margin-bottom:12px"><input type="checkbox" id="pl-rr" ${p.rules.reserve_fast_only !== false ? 'checked' : ''}> Na reserva, só o nível Rápido</label>
    <p>${revelar('pl-avancado', 'Opções avançadas')}</p>
    <div id="pl-avancado" hidden><div class="campo"><label for="pl-set">Configurações específicas (JSON)</label><textarea class="entrada" id="pl-set" rows="3" style="font-family:monospace">${esc(JSON.stringify(p.settings || {}, null, 2))}</textarea></div></div>
    <p class="msg-erro oculto" id="pl-erro" role="alert"></p></form>`, '<button type="submit" form="f-plano" class="btn btn-verde btn-pequeno">Salvar plano</button>', '#/planos');
  // A conta completa da prévia continua aberta (ou fechada) quando a prévia é refeita ao digitar.
  $('pl-previa').addEventListener('click', ev => { if (ev.target.closest('[data-revelar="pl-conta"]')) setTimeout(() => { C.contaAberta = !$('pl-conta').hidden; }); });
  // Prévia ao digitar (sem gravar): mesma conta e mesma trava do servidor.
  let tPrevia;
  const atualizarPrevia = () => { clearTimeout(tPrevia); tPrevia = setTimeout(async () => {
    try { const r = await api('/api/plataforma/planos/previa', { metodo: 'POST', corpo: { credits: Number($('pl-cred').value), reserve: Number($('pl-res').value), price_usd: $('pl-preco').value, rules: { pack_credits: Number($('pl-pc').value), pack_price_usd: Number($('pl-pp').value) } } });
      $('pl-previa').innerHTML = previaHtml(r.economia); } catch { /* a prévia é só informativa */ }
  }, 250); };
  ['pl-cred', 'pl-res', 'pl-preco', 'pl-pc', 'pl-pp'].forEach(x => $(x).addEventListener('input', atualizarPrevia));
  if (id === 'novo') atualizarPrevia();
  $('f-plano').onsubmit = async ev => {
    ev.preventDefault();
    try {
      let settings = {};
      try { settings = JSON.parse($('pl-set').value || '{}'); } catch { $('pl-avancado').hidden = false; throw new Error('As configurações específicas precisam ser um JSON válido.'); }
      const corpo = { name: $('pl-nome').value, status: $('pl-status').value, description: $('pl-desc').value, credits: Number($('pl-cred').value), reserve: Number($('pl-res').value), price_usd: $('pl-preco').value,
        limits: Object.fromEntries(Object.keys(C.catalogo.limites).map(k => [k, Number($(`pl-l-${k}`).value)])), features: Object.fromEntries([...document.querySelectorAll('[data-f]')].map(x => [x.dataset.f, x.checked])),
        rules: { reserve_fast_only: $('pl-rr').checked, pack_name: p.rules.pack_name || 'Capacity Pack', pack_credits: Number($('pl-pc').value), pack_price_usd: Number($('pl-pp').value) }, settings };
      await api(id === 'novo' ? '/api/plataforma/planos' : `/api/plataforma/planos/${id}`, { metodo: id === 'novo' ? 'POST' : 'PUT', corpo });
      C.planos = []; toast('Plano salvo.'); location.hash = '#/planos';
    } catch (x) { erroForm('pl-erro', x); }
  };
}

// ---------------------------------------------------------------- Ambientes, uso, auditoria, configurações
async function vistaAmbientes() {
  carregando('Ambientes');
  const { ambientes } = await api('/api/plataforma/ambientes');
  tela('Ambientes', `${proposito('Um banco por empresa, na mesma instalação; nenhuma empresa acessa o banco de outra.')}
    ${tabela(['Empresa', 'Status', 'Endereço', 'Banco', 'IA', 'Último uso'], ambientes.map(a => `<tr><td data-r="Empresa"><a href="#/empresas/${a.id}">${esc(a.name)}</a></td><td data-r="Status">${selo(a.status, a.statusNome)}</td>
      <td data-r="Endereço"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url.replace(/^https?:\/\//, ''))}</a></td><td data-r="Banco"><span class="valor-bloco"><code class="valor-tecnico">${esc(a.banco)}</code> <span class="dica">${mb(a.tamanhoMb)}</span></span></td>
      <td data-r="IA">${iaTexto(a)}</td><td data-r="Último uso">${dataHora(a.ultimoUso)}</td></tr>`), 'Nenhum ambiente.')}`);
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
let grafSeq = 0;
function grafBarras(serie, rotulo) {
  const id = ++grafSeq;
  const topo = topoBonito(Math.max(...serie.map(x => x.v), 0));
  const meio = Math.floor(serie.length / 2);
  return `<figure class="gb" aria-label="${esc(rotulo)}">
    <div class="gb-corpo"><div class="gb-eixo" aria-hidden="true"><span>${usd4(topo)}</span><span>${usd4(topo / 2)}</span><span>US$ 0</span></div>
      <div class="gb-area"><div class="gb-grade" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="gb-barras" aria-hidden="true">${serie.map((x, i) => `<span class="gb-col${i === serie.length - 1 ? ' hoje' : ''}" data-tip="${esc(diaCurto(x.d))}${i === serie.length - 1 ? ' (hoje)' : ''} · ${esc(usd4(x.v))}${x.extra ? ` · ${esc(x.extra)}` : ''}"><i style="height:${x.v > 0 ? Math.max(2, x.v / topo * 100) : 0}%"></i></span>`).join('')}</div></div></div>
    <div class="gb-x" aria-hidden="true"><span>${diaCurto(serie[0].d)}</span><span>${diaCurto(serie[meio].d)}</span><span>hoje</span></div>
    <div class="gb-tabela">${revelar(`gbt-${id}`, 'Ver em tabela')}<div id="gbt-${id}" hidden>${tabela(['Dia', '#Custo'], serie.slice().reverse().map(x => `<tr><td data-r="Dia">${esc(diaCurto(x.d))}</td><td class="num" data-r="Custo">${usd4(x.v)}</td></tr>`), '')}</div></div></figure>`;
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
const barraPlano = e => (e.ilimitado ? '<span class="dica">ilimitado</span>' : e.creditos ? `<span class="bp" title="${num(Math.round(e.usados))} de ${num(e.creditos)} créditos"><span class="bp-trilho"><i class="${e.percentual >= 90 ? 'alto' : e.percentual >= 75 ? 'medio' : ''}" style="width:${Math.min(100, e.percentual)}%"></i></span><b>${num(e.percentual)}%</b></span>` : '<span class="dica">–</span>');

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
  const aberto = ['atencao', 'critico', 'erro'].includes(v.nivel);
  // O estado fica à vista; o detalhe (datas, troca preventiva, vencimento informado) abre sob pedido, ou já aberto
  // quando a chave pede atenção.
  return `<div class="or-validade"><p class="or-validade-estado"><span class="tag ${TAG_VALIDADE[v.nivel] || ''}"><i></i>${esc(v.rotulo)}</span> ${esc(v.texto)} ${revelar('or-validade-detalhe', 'Detalhes e troca preventiva', aberto)}</p>
    <div id="or-validade-detalhe" ${aberto ? '' : 'hidden'}><dl class="or-validade-lista">
      <dt>Origem</dt><dd>${v.origem === 'console' ? 'informada no console' : 'variável OPENROUTER_API_KEY'}</dd>
      <dt>Início da contagem</dt><dd>${noFuso(t.inicio, f)} (${t.emUsoDias} ${t.emUsoDias === 1 ? 'dia' : 'dias'} em uso)</dd>
      <dt>Vencimento no provedor</dt><dd>${vencProvedor}</dd>
      <dt>Última validação</dt><dd>${noFuso(p.validadoEm, f)}</dd>
      <dt>Próxima troca preventiva</dt><dd>${noFuso(t.proximaTroca, f)} (${duracao(t.restanteMs)}) · política da plataforma: início + ${t.rotacaoDias} × 24 h</dd>
      <dt>Fuso dos horários</dt><dd>${esc(f)} (o cálculo é em UTC)</dd>
    </dl>
      <form class="or-validade-form" id="f-validade" novalidate>
        <div class="campo"><label for="val-rotacao">Trocar a chave a cada</label>
          <span class="or-alerta-campo"><input class="entrada" id="val-rotacao" type="number" min="7" max="730" step="1" value="${esc(t.rotacaoDias)}" inputmode="numeric"><span>dias</span></span>
          <span class="dica">De 7 a 730. Mudar o prazo não reinicia a contagem: vale a partir do início (${noFuso(t.inicio, f)}).</span></div>
        ${podeInformar ? `<div class="campo"><label for="val-expira">Vencimento real da chave (opcional)</label>
          ${campoData({ id: 'val-expira', valor: p.fonte === 'informada' ? p.dataInformada || '' : '', rotulo: 'o vencimento', extra: 'aria-describedby="val-expira-dica"' })}
          <span class="dica" id="val-expira-dica">Só se você souber a data por outra fonte. Vale até 23:59 desse dia (${esc(f)}). Vale só para esta chave; se o OpenRouter informar a dele, a do OpenRouter prevalece.</span></div>` : ''}
        <button class="btn btn-linha btn-pequeno">Salvar</button>
      </form></div></div>`;
}
async function vistaUso(forcar = false) {
  carregando('Uso');
  const u = await api(`/api/plataforma/consumo${forcar ? '?forcar=1' : ''}`);
  const c = u.conta, k = c.chave, pl = u.plataforma;
  const saldo = c.saldo ?? k?.restante ?? null;
  const comAlerta = u.empresas.filter(e => e.alerta).length;
  // Filtro só quando a lista é longa (ou já está filtrada); com poucas empresas, todas aparecem.
  const comFiltro = u.empresas.length > 6;
  const filtro = comFiltro ? (sessionStorage.getItem('uso.filtro') || 'todas') : 'todas';
  const contaHtml = !c.disponivel ? `<div class="faixa-aviso atencao"><b>Conta do OpenRouter indisponível.</b> ${esc(c.motivo || '')}</div>` : `
    <div class="or-grade">
      <div class="or-card destaque${u.alerta.abaixo ? ' baixo' : ''}"><span class="or-rotulo">Saldo disponível no OpenRouter</span>
        <b class="or-numero">${usd(saldo)}</b>
        <span class="or-sub">${u.alerta.abaixo ? `<span class="tag tag-vermelha"><i></i>Abaixo do alerta de ${usd(u.alerta.limiarUsd)}</span>` : `<span class="tag tag-verde"><i></i>Acima do alerta de ${usd(u.alerta.limiarUsd)}</span>`}</span>
        <span class="or-sub">${u.alerta.diasRestantes !== null ? `No ritmo dos últimos 7 dias (${usd4(u.media7)} por dia), dura cerca de <b>${num(u.alerta.diasRestantes)} ${u.alerta.diasRestantes === 1 ? 'dia' : 'dias'}</b>.` : 'Sem consumo nos últimos 7 dias para estimar a duração.'}</span>
        ${c.saldo === null && c.creditosIndisponivel ? `<span class="or-sub dica">${esc(c.creditosIndisponivel)} ${k?.restante !== null && k?.restante !== undefined ? 'Mostrando o que resta do limite da chave.' : ''}</span>` : ''}</div>
      <div class="or-card"><span class="or-rotulo">Créditos da conta</span>
        <dl class="or-lista"><dt>Comprados</dt><dd>${usd(c.comprado)}</dd><dt>Gastos</dt><dd>${usd(c.gasto)}</dd></dl></div>
      <div class="or-card"><span class="or-rotulo">Consumo cobrado pelo OpenRouter</span>
        <dl class="or-lista"><dt>Hoje</dt><dd>${usd4(k?.hoje)}</dd><dt>Nesta semana</dt><dd>${usd4(k?.semana)}</dd><dt>Neste mês</dt><dd>${usd4(k?.mes)}</dd></dl></div>
      <div class="or-card"><span class="or-rotulo">Chave da plataforma${k?.nome ? ` · ${esc(k.nome)}` : ''}</span>
        <dl class="or-lista"><dt>Limite</dt><dd>${k?.limite !== null && k?.limite !== undefined ? usd(k.limite) : 'sem limite'}</dd><dt>Resta do limite</dt><dd>${k?.restante !== null && k?.restante !== undefined ? usd(k.restante) : '–'}</dd><dt>Uso total</dt><dd>${usd(k?.usoTotal)}</dd></dl>
        ${k?.gratuita ? '<span class="tag tag-ambar">Chave gratuita: limites baixos</span>' : ''}</div>
    </div>`;
  const conc = c.disponivel && k?.mes !== null && k?.mes !== undefined ? (() => { const dif = k.mes - pl.custoMes, rel = pl.custoMes ? Math.abs(dif) / pl.custoMes : (k.mes > 0 ? 1 : 0);
    return `<p class="or-conc${rel > 0.1 && Math.abs(dif) > 0.5 ? ' dif' : ''}">Registrado pela GreenIA no mês: <b>${usd4(pl.custoMes)}</b> · Cobrado pelo OpenRouter no mês: <b>${usd4(k.mes)}</b>${rel > 0.1 && Math.abs(dif) > 0.5 ? ` · diferença de ${usd4(dif)}: pode haver uso da mesma chave fora da plataforma, ou respostas interrompidas antes de registrar o custo.` : ' · em linha.'}</p>`; })() : '';
  // Conciliação com o crédito registrado nas empresas: aviso só quando há custo que não virou crédito.
  const cc = u.conciliacao;
  const conciliacao = cc?.disponivel ? `Gasto da chave no mês: ${usd4(cc.openrouterMes)} · registrado como crédito nas empresas: ${usd4(cc.registradoMes)} · diferença: ${usd4(cc.diferenca)}${cc.percentual !== null ? ` (${cc.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : ''}.` : '';
  const empresas = u.empresas.filter(e => filtro !== 'alerta' || e.alerta).sort((a, b) => b.custoMes - a.custoMes);
  const kc = u.chaveConfig || {};
  const semChave = !kc.origem;
  const chaveHtml = `<section class="or-chave${semChave ? ' vazia' : ''}" aria-labelledby="or-chave-t">
    <div class="or-chave-topo"><span class="or-chave-icone">${ICONE.chave || ''}</span>
      <div class="or-chave-texto"><b id="or-chave-t">Chave do OpenRouter</b>
        <span>${semChave ? 'Nenhuma chave configurada: a IA das empresas está desligada (ou simulada) até você informar a chave.'
          : `<code>${esc(kc.mascara)}</code>${kc.nome ? ` · ${esc(kc.nome)}` : ''} · ${kc.origem === 'console' ? `salva no console${kc.em ? ` em ${dataHora(kc.em)}` : ''}${kc.por ? ` por ${esc(kc.por)}` : ''}${kc.variavelTambem ? ' (vale no lugar da variável OPENROUTER_API_KEY)' : ''}` : 'vinda da variável OPENROUTER_API_KEY do servidor'}`}</span></div>
      <div class="or-chave-acoes">${semChave ? '' : `<button type="button" class="btn btn-linha btn-pequeno" id="or-trocar">${kc.origem === 'console' ? 'Trocar chave' : 'Informar outra chave'}</button>`}${kc.origem === 'console' ? '<button type="button" class="btn-texto btn-pequeno link-perigo" id="or-remover">Remover</button>' : ''}</div></div>
    ${semChave ? '' : validadeHtml(u.validadeChave)}
    <form class="or-chave-form${semChave ? '' : ' oculto'}" id="f-chave" novalidate autocomplete="off">
      <label for="or-chave-in">Cole a chave da API do OpenRouter</label>
      <div class="or-chave-linha"><input class="entrada" id="or-chave-in" aria-label="Chave de acesso ao provedor" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…" aria-describedby="or-chave-ajuda">
        <button type="button" class="btn-texto btn-pequeno" id="or-ver" aria-pressed="false">Mostrar</button><button class="btn btn-verde btn-pequeno" id="or-salvar">Testar e salvar</button></div>
      <p class="dica" id="or-chave-ajuda">A chave é testada antes de salvar e vale na hora para todas as empresas. <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">Criar uma chave no OpenRouter ↗</a></p>
      <p class="msg-erro oculto" id="or-chave-erro" role="alert"></p></form></section>`;
  C.eu.alertaChave = u.validadeChave && NIVEL_FAIXA[u.validadeChave.nivel] ? u.validadeChave : null;   // o topo acompanha a leitura mais recente
  const atualizada = c.atualizadoEm ? `Conta atualizada às ${new Date(c.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.` : '';
  tela('Uso', `${proposito(`Consumo de IA da plataforma e de cada empresa, em dólar, só para a operação. ${atualizada}`, { titulo: 'Uso e consumo de IA', textos: [
    'A chave do OpenRouter é testada antes de salvar, fica guardada cifrada e vale na hora para todas as empresas, sem reiniciar. Depois de salva, só aparecem o início e os 4 últimos caracteres.',
    'Os admins da plataforma recebem um email por estágio da chave: faltando 30 dias, 7 dias, 48 horas e 24 horas, quando vence ou a troca atrasa, e quando a chave é recusada.',
    'O consumo cobrado pelo OpenRouter conta os dias em UTC, pela chave usada na plataforma. O alerta de saldo manda no máximo um email por dia.',
    `Receita de tabela: preço do plano de cada empresa${pl.receitaPacotes ? ` e ${usd(pl.receitaPacotes)} em Capacity Packs liberados no mês` : ' e os Capacity Packs liberados no mês'}, não o valor faturado; planos internos e sem preço não entram.`,
    `Margem total: receita − impostos, pagamento/câmbio e suporte/operação (${usd(pl.custosProporcionais || 0)}) − IA com a taxa do intermediário − servidor. Servidor: ${pl.custoServidor ? `${usd(pl.custoServidor)} por mês, dividido entre as empresas ativas` : 'não informado'}.`,
    'O gráfico mostra o custo real de cada resposta, registrado pela GreenIA (sem a taxa do intermediário, que entra na margem).',
    'Projeção: quanto do plano estará usado no fim do mês, no ritmo do mês até hoje. Situação acima de 90%, na reserva ou esgotada pede atenção (a empresa também recebe os avisos do plano).',
  ] })}
    ${chaveHtml}${semChave ? '' : contaHtml}${conc}
    ${cc?.disponivel ? (cc.alerta ? `<div class="faixa-aviso atencao" role="status"><b>Conciliação com o OpenRouter (mês):</b> ${conciliacao} Há custo cobrado que não virou crédito: a margem está saindo sem aparecer no consumo das empresas.</div>` : `<p class="dica">${conciliacao} O que o OpenRouter cobrou está virando crédito.</p>`) : ''}
    <div class="secao-titulo"><h2 class="h-secao">Consumo da plataforma · últimos 30 dias</h2></div>
    <div class="indicadores"><div class="indicador"><span>Hoje</span><b>${usd4(pl.custoHoje)}</b></div><div class="indicador"><span>Últimos 7 dias</span><b>${usd4(pl.custo7)}</b></div>
      <div class="indicador"><span>Mês até hoje</span><b>${usd4(pl.custoMes)}</b></div><div class="indicador"><span>Projeção do mês</span><b>${usd4(pl.projecaoMes)}</b></div>
      <div class="indicador"><span>Receita de tabela do mês (planos + Capacity Packs)</span><b>${usd(pl.receitaMes)}</b></div><div class="indicador"><span>Margem total do mês</span><b>${usd(pl.margemMes)}</b><small>${pl.margemMesPct !== null && pl.margemMesPct !== undefined ? pctM(pl.margemMesPct) + ' da receita' : 'sem receita no mês'}</small></div></div>
    ${pl.custoServidor ? '' : '<p class="dica">Custo do servidor não informado: a margem ainda não desconta o servidor. <button type="button" class="btn-texto" id="informar-servidor">Informar o custo do servidor</button></p>'}
    ${grafBarras(u.serie.map(x => ({ d: x.dia, v: x.custo })), 'Custo diário de IA da plataforma nos últimos 30 dias')}

    <div class="secao-titulo"><h2 class="h-secao">Consumo por empresa</h2>
      ${comFiltro ? `<div class="pilulas" role="group" aria-label="Filtro"><button type="button" class="pilula" data-filtro="todas" aria-pressed="${filtro === 'todas'}">Todas<span>${u.empresas.length}</span></button><button type="button" class="pilula" data-filtro="alerta" aria-pressed="${filtro === 'alerta'}">Com alerta<span>${comAlerta}</span></button></div>` : ''}</div>
    ${tabela(['Empresa', 'Créditos do plano', '#Hoje', '#7 dias', '#Mês', 'Tendência 30 dias', '#Projeção', 'Situação', ''], empresas.map(e => `<tr class="uso-linha" data-empresa="${e.id}">
      <td data-r="Empresa"><a href="#/empresas/${e.id}"><b>${esc(e.name)}</b></a><br><span class="dica">${esc(e.plano || 'sem plano')} · ${num(e.pessoasAtivas)} ${e.pessoasAtivas === 1 ? 'pessoa ativa' : 'pessoas ativas'}</span></td>
      <td data-r="Créditos">${barraPlano(e)}</td>
      <td class="num" data-r="Hoje">${usd4(e.custoHoje)}</td><td class="num" data-r="7 dias">${usd4(e.custo7)}</td><td class="num" data-r="Mês"><b>${usd4(e.custoMes)}</b></td>
      <td data-r="Tendência">${sparkline(e.serie)}</td>
      <td class="num" data-r="Projeção">${e.projecao !== null ? `${num(e.projecao)}%` : '–'}</td>
      <td data-r="Situação">${estadoTag(e)}</td>
      <td data-r=""><button class="btn-texto btn-pequeno" data-detalhe="${e.id}" aria-expanded="false">Detalhes</button></td></tr>
      <tr class="oculto uso-detalhe" id="det-${e.id}"><td colspan="9"><div class="editor" id="det-corpo-${e.id}">${carregandoHtml()}</div></td></tr>`), filtro === 'alerta' ? 'Nenhuma empresa com alerta.' : 'Nenhuma empresa.')}`,
  `<button type="button" class="btn btn-linha btn-pequeno" id="uso-atualizar">Atualizar agora</button>${menuMais([
    { acao: 'alerta', rotulo: 'Alerta de saldo…' }, { acao: 'servidor', rotulo: 'Custo do servidor…' },
    { href: 'https://openrouter.ai/settings/credits', externo: true, rotulo: 'Comprar créditos no OpenRouter ↗' },
  ])}`);
  ligarDicas($('principal'));
  $('uso-atualizar').onclick = () => vistaUso(true);
  $('or-trocar')?.addEventListener('click', () => { $('f-chave').classList.toggle('oculto'); $('or-chave-in').focus(); });
  // Veio do aviso do topo ("Trocar a chave"): abre o formulário de troca direto.
  if (C.abrirTroca) { C.abrirTroca = false; $('f-chave').classList.remove('oculto'); $('or-chave-in').focus(); }
  if ($('f-validade')) $('f-validade').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = { rotacaoDias: $('val-rotacao').value === '' ? null : Number($('val-rotacao').value) };
    if ($('val-expira')) corpo.expiraEm = dataOuErro($('val-expira'));
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
  $('or-remover')?.addEventListener('click', () => confirmarStatus({ rotulo: 'Chave do OpenRouter', titulo: 'Remover a chave salva no console?', perigo: !kc.variavelTambem, botao: 'Remover chave',
    texto: kc.variavelTambem ? 'A plataforma volta a usar a chave da variável OPENROUTER_API_KEY do servidor.' : 'Sem outra chave, a IA das empresas para de responder até você informar uma chave nova.',
    async aplicar() { await api('/api/plataforma/openrouter/chave', { metodo: 'DELETE' }); toast('Chave removida.'); vistaUso(true); } }));
  // Ajustes raros, em "Mais ações": alerta de saldo e custo mensal do servidor.
  const ajuste = ({ rotulo, titulo, id, campo, valor, passo, botao, ajuda, salvar }) => modal(`<div class="modal-topo"><div class="rotulo">${esc(rotulo)}</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="aj-t" tabindex="-1">${esc(titulo)}</h2>
    <form id="${id}" novalidate><div class="campo"><label for="${campo}">Valor em dólares (US$)</label><input class="entrada" id="${campo}" type="number" min="0" step="${passo}" value="${esc(valor)}" aria-describedby="${campo}-ajuda"><span class="ajuda" id="${campo}-ajuda">${esc(ajuda)}</span></div>
      <p class="msg-erro oculto" id="${campo}-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">${esc(botao)}</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('aj-t').focus();
    $(id).onsubmit = async ev => { ev.preventDefault(); try { await salvar(Number($(campo).value)); fechar(); vistaUso(); } catch (x) { mostrarErro(`${campo}-erro`, x); } };
  });
  C.mais.alerta = () => ajuste({ rotulo: 'Alerta de saldo', titulo: 'Avisar quando o saldo ficar baixo', id: 'f-alerta', campo: 'al-usd', valor: u.alerta.limiarUsd, passo: 1, botao: 'Salvar alerta',
    ajuda: 'Os admins da plataforma recebem um email quando o saldo do OpenRouter ficar abaixo deste valor; no máximo um por dia.',
    salvar: async v => { await api('/api/plataforma/consumo/alerta', { metodo: 'PUT', corpo: { limiarUsd: v } }); toast('Alerta salvo.'); } });
  C.mais.servidor = () => ajuste({ rotulo: 'Custo do servidor', titulo: 'Custo mensal do servidor', id: 'f-servidor', campo: 'srv-usd', valor: pl.custoServidor || 0, passo: 0.01, botao: 'Salvar custo do servidor',
    ajuda: 'A fatura mensal da hospedagem (Render). Entra na margem total, dividida entre as empresas ativas.',
    salvar: async v => { await api('/api/plataforma/consumo/servidor', { metodo: 'PUT', corpo: { custoUsd: v } }); toast('Custo do servidor salvo.'); } });
  $('informar-servidor')?.addEventListener('click', () => C.mais.servidor());
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
        <div><span class="or-rotulo">Por Quick Win · ${esc(d.mes)}</span>${barrasH(d.porQw, 'nome')}</div></div>`;
      linha.dataset.carregado = '1';
    } catch (x) { $(`det-corpo-${id}`).innerHTML = `<span class="msg-erro">${esc(x.message)}</span>`; }
  };
}

// Auditoria em português: o código da ação e as chaves gravadas viram texto; o detalhe mostra antes → depois.
const ACOES_AUDITORIA = {
  'platform.login': 'Entrou no console', 'platform.admin_added': 'Administrador da plataforma adicionado', 'platform.admin_removed': 'Administrador da plataforma removido',
  'platform.settings_changed': 'Configurações da plataforma alteradas', 'platform.economics_changed': 'Premissas econômicas alteradas', 'platform.server_cost_changed': 'Custo do servidor alterado',
  'platform.balance_alert_changed': 'Alerta de saldo alterado', 'platform.openrouter_key_set': 'Chave do OpenRouter salva', 'platform.openrouter_key_removed': 'Chave do OpenRouter removida',
  'platform.openrouter_key_policy': 'Troca preventiva da chave alterada', 'platform.model_certified': 'Modelo autorizado para dados sigilosos', 'platform.model_uncertified': 'Autorização de modelo retirada',
  'platform.model_vetoed': 'Modelo proibido para dados sigilosos', 'platform.model_unvetoed': 'Proibição de modelo retirada',
  'company.created': 'Empresa criada', 'company.updated': 'Dados da empresa alterados', 'company.published': 'Ambiente publicado', 'company.suspended': 'Ambiente suspenso',
  'company.cancelled': 'Ambiente encerrado', 'company.status_changed': 'Status do ambiente alterado', 'company.plan_changed': 'Plano alterado', 'company.grants_changed': 'Permissões alteradas',
  'company.url_changed': 'Endereço alterado', 'company.domain_checked': 'Domínio próprio verificado', 'company.domain_provider_added': 'Domínio próprio registrado no provedor',
  'company.domain_provider_failed': 'Falha ao registrar o domínio próprio', 'company.accessed': 'Equipe de operação entrou no ambiente', 'company.access_ended': 'Acesso da equipe de operação encerrado',
  'company.exported': 'Dados exportados', 'company.export_failed': 'Exportação falhou', 'company.deleted': 'Empresa excluída definitivamente', 'company.deletion_scheduled': 'Exclusão definitiva agendada',
  'company.deletion_cancelled': 'Exclusão definitiva cancelada', 'company.deletion_date_confirmed': 'Data do cancelamento confirmada', 'company.deletion_hold': 'Bloqueio legal da exclusão aplicado',
  'company.deletion_hold_released': 'Bloqueio legal da exclusão liberado', 'company.early_deletion_requested': 'Exclusão antecipada pedida', 'company.early_deletion_blocked': 'Exclusão antecipada impedida',
  'company.data_return_requested': 'Devolução dos dados pedida', 'company.data_return_generated': 'Cópia de devolução gerada', 'company.data_return_delivered': 'Cópia de devolução entregue',
  'company.data_return_expired': 'Link de devolução vencido', 'branding.updated': 'Marca alterada', 'landing_page.published': 'Página de apresentação publicada',
  'landing_page.unpublished': 'Página de apresentação voltou para rascunho', 'landing_page.updated': 'Página de apresentação alterada',
  'user.created': 'Pessoa adicionada', 'user.updated': 'Pessoa alterada', 'user.deleted': 'Pessoa removida', 'user.role_changed': 'Perfil alterado', 'user.activated': 'Acesso ativado',
  'user.deactivated': 'Acesso desativado', 'user.blocked': 'Conta bloqueada', 'user.unblocked': 'Conta desbloqueada', 'user.invite_resent': 'Convite reenviado', 'user.joined_by_domain': 'Entrou pelo domínio da empresa',
  'role.created': 'Perfil criado', 'role.updated': 'Perfil alterado', 'role.deleted': 'Perfil excluído', 'plan.created': 'Plano criado', 'plan.updated': 'Plano alterado', 'plan.migrated': 'Plano atualizado pelo catálogo',
  'creditpack.added': 'Créditos liberados', 'export.downloaded': 'Cópia exportada baixada', 'export.need_ended': 'Necessidade da cópia encerrada', 'export.hold': 'Bloqueio legal da cópia aplicado',
  'export.hold_released': 'Bloqueio legal da cópia liberado', 'export.elimination_declared': 'Eliminação da cópia declarada', 'export.deleted': 'Cópia eliminada do servidor',
  'contact.created': 'Contato recebido pela página de vendas', 'contact.interaction': 'Interação com contato registrada', 'contact.hold': 'Bloqueio legal do contato aplicado',
  'contact.hold_released': 'Bloqueio legal do contato liberado', 'contact.deleted': 'Contato eliminado', 'contacts.migrated': 'Contatos migrados', 'retention.run': 'Rotina de retenção executada', 'retention.deleted': 'Arquivo eliminado pela retenção',
};
const GRUPO_ACAO = { platform: 'Plataforma', company: 'Empresa', user: 'Pessoa', role: 'Perfil', plan: 'Plano', export: 'Exportação', contact: 'Contato', branding: 'Marca', landing_page: 'Página de apresentação' };
const nomeAcao = a => ACOES_AUDITORIA[a] || `${GRUPO_ACAO[String(a).split('.')[0]] || 'Registro'}: outra ação`;
const CAMPOS_AUDITORIA = {
  email: 'Email', name: 'Nome', nome: 'Nome', role: 'Perfil', role_id: 'Perfil', status: 'Situação', slug: 'Identificador', custom_domain: 'Domínio próprio', dominio: 'Domínio próprio',
  plano: 'Plano', price_usd: 'Preço', credits: 'Créditos', reserve: 'Reserva', rules: 'Regras de consumo', grants: 'Itens liberados', locked: 'Itens da marca bloqueados', content: 'Conteúdo da página',
  seo: 'Título e descrição para buscadores', permissoes: 'Permissões', tipo: 'Tipo', justificativa: 'Justificativa', motivo: 'Motivo', expira: 'Vale até', expira_em: 'Vale até', por: 'Por',
  finalidade: 'Finalidade', formato: 'Formato', bytes: 'Tamanho', modelo: 'Modelo', perfil: 'Nível', fornecedor: 'Fornecedor', chave: 'Chave', custoUsd: 'Custo do servidor', limiarUsd: 'Alerta de saldo',
  produto: 'Produto', packs: 'Capacity Packs', creditos: 'Créditos', preco_usd: 'Valor', validade: 'Validade', observacao: 'Observação', cancelled_at: 'Cancelada em', delete_after: 'Exclusão em',
  estimado: 'Data estimada', declaracao: 'Declaração', para: 'Para', link_expira: 'Link vale até', responsabilidade: 'Responsabilidade', metodo: 'Método', verificacao: 'Verificação',
  copia: 'Cópia de recuperação', via: 'Via', em: 'Data', duracao_s: 'Duração', mensagem: 'Mensagem', erro: 'Erro', erros: 'Erros', hold_tipo: 'Bloqueio legal', legal_name: 'Razão social',
  document: 'Documento', contact_email: 'Email de contato', notes: 'Notas internas', display_name: 'Nome exibido', primary_color: 'Cor principal', secondary_color: 'Cor secundária',
};
const OCULTOS_AUDITORIA = new Set(['id', 'sha256', 'export_id', 'devolucao', 'plan_id', 'agente', 'ip']);
const VALORES_AUDITORIA = { ...PERFIS, ...ACESSO, ativa: 'Ativa', em_implantacao: 'Em implantação', suspensa: 'Suspensa', cancelada: 'Cancelada', bloqueado: 'Bloqueado', publicada: 'Publicada',
  rascunho: 'Rascunho', verificado: 'Verificado', pendente: 'Pendente', expirado: 'Expirado', capacity_pack: 'Capacity Pack', cortesia: 'Cortesia', rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado',
  banco_completo: 'Banco completo', ...TIPOS_ACESSO, ...FINALIDADES_EXPORTACAO, ...TIPOS_HOLD, ...TIPOS_INTERACAO, rotina: 'Rotina automática', cliente: 'Cliente', console: 'Console', formulario: 'Formulário da página de vendas' };
function valorAuditoria(k, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (k === 'role_id') return PERFIS[String(v).replace(/^role_/, '')] || 'Perfil próprio da empresa';
  if (k === 'bytes') return mb(v / 1048576);
  if (k === 'duracao_s') return `${num(Math.round(v / 60))} min`;
  if (/usd$/i.test(k)) return usd(v);
  if (typeof v === 'number') return num(v);
  if (k === 'locked' && Array.isArray(v)) return v.map(x => ROTULOS_BLOQUEIO[x] || x).join(', ') || 'Nenhum';
  if (k === 'grants' && typeof v === 'object') return Object.entries(v).filter(([, on]) => on).map(([x]) => C.catalogo?.concessoes?.[x] || x).join(', ') || 'Nenhum';
  if (Array.isArray(v)) return v.map(x => (typeof x === 'object' ? '…' : VALORES_AUDITORIA[x] || String(x))).join(', ');
  if (typeof v === 'object') return 'alterado';
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return dataHora(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return data(`${v}T12:00:00`);
  return VALORES_AUDITORIA[v] || String(v);
}
// Uma linha por campo: "Campo: antes → depois" quando mudou, "Campo: valor" quando só há um lado. Vazios e campos
// que não mudaram ficam de fora (menos nome e email, que dizem de quem é o registro).
function mudancasAuditoria(x) {
  // O antes da troca de plano só guarda o id: vira o nome, para mostrar "plano antigo → plano novo".
  const comPlano = o => (o && 'plan_id' in o && !('plano' in o) ? { ...o, plano: C.planos.find(p => p.id === o.plan_id)?.name ?? null } : o || {});
  const a = comPlano(x.before), d = comPlano(x.after);
  return [...new Set([...Object.keys(a), ...Object.keys(d)])].filter(k => !OCULTOS_AUDITORIA.has(k)).map(k => {
    const va = valorAuditoria(k, a[k]), vd = valorAuditoria(k, d[k]), campo = CAMPOS_AUDITORIA[k] || k.replace(/_/g, ' ');
    if (!va && !vd) return null;
    if (!(k in a) || !(k in d)) return { campo, texto: vd || va };
    if (JSON.stringify(a[k]) === JSON.stringify(d[k])) return k === 'name' || k === 'email' ? { campo, texto: vd } : null;
    return { campo, texto: va === vd ? vd : `${va || '—'} → ${vd || '—'}` };   // objetos (conteúdo, regras) só dizem "alterado"
  }).filter(Boolean);
}
const ORIGEM_AUDITORIA = { plataforma: 'Console da plataforma', empresa: 'Administração da empresa', retencao: 'Rotina de retenção', migracao: 'Migração', importacao: 'Importação', devolucao: 'Página de devolução', vendas: 'Página de vendas', sistema: 'Sistema', dashboard: 'Painel' };
function listaAuditoria(itens, comEmpresa = true) {
  const detalhes = x => {
    const m = mudancasAuditoria(x);
    if (!m.length) return '<span class="dica">—</span>';
    const linha = c => `<b>${esc(c.campo)}:</b> ${esc(c.texto)}`;
    if (m.length <= 2) return `<span class="aud-detalhe">${m.map(linha).join(' · ')}</span>`;
    return `<details class="aud-detalhe"><summary><span>${m.slice(0, 2).map(linha).join(' · ')}</span> <span class="aud-abrir">Ver tudo (${m.length})</span></summary>
      <ul class="aud-lista">${m.map(c => `<li>${linha(c)}</li>`).join('')}</ul></details>`;
  };
  return tabela(['Quando', ...(comEmpresa ? ['Empresa'] : []), 'Quem', 'Ação', 'Detalhes', 'Origem'], itens.map(x => `<tr><td data-r="Quando" style="white-space:nowrap">${dataHora(x.at)}</td>${comEmpresa ? `<td data-r="Empresa">${esc(x.empresa || 'Plataforma')}</td>` : ''}
    <td data-r="Quem">${esc(x.usuario || 'Sistema')}</td><td data-r="Ação">${esc(nomeAcao(x.action))}</td>
    <td data-r="Detalhes">${detalhes(x)}</td>
    <td data-r="Origem">${esc(ORIGEM_AUDITORIA[x.origin?.painel] || x.origin?.painel || '—')}${x.origin?.ip ? `<br><span class="dica">${esc(x.origin.ip)}</span>` : ''}</td></tr>`), 'Nada registrado ainda.');
}

async function vistaAuditoria(pagina = 0) {
  carregando('Auditoria');
  const a = await api(`/api/plataforma/auditoria?pagina=${pagina}`);
  tela('Auditoria', `${proposito('Toda ação administrativa, com quem fez, em qual empresa, o antes, o depois e a origem.')}${listaAuditoria(a.itens)}
    <div class="linha-botoes" style="margin-top:12px">${pagina > 0 ? '<button class="btn btn-linha btn-pequeno" id="ant">Anteriores</button>' : ''}${(pagina + 1) * 50 < a.total ? '<button class="btn btn-linha btn-pequeno" id="prox">Mais antigos</button>' : ''}<span class="dica">${num(a.total)} registros</span></div>`);
  $('ant')?.addEventListener('click', () => vistaAuditoria(pagina - 1));
  $('prox')?.addEventListener('click', () => vistaAuditoria(pagina + 1));
}

// Configurações em três abas, cada uma com uma ação principal: Geral (nome, endereços, email e plano padrão),
// Dados sigilosos (modelos autorizados e proibidos para todas as empresas) e Contatos da página de vendas.
const ABAS_CFG = [['geral', 'Geral'], ['sigilo', 'Dados sigilosos'], ['contatos', 'Contatos']];
const NIVEIS = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
async function vistaConfiguracoes(aba = 'geral') {
  if (!ABAS_CFG.some(([k]) => k === aba)) aba = 'geral';
  carregando('Configurações');
  const [c, hm] = await Promise.all([api('/api/plataforma/configuracoes'), aba === 'sigilo' ? api('/api/plataforma/homologacoes').catch(() => ({ homologacoes: [], vetos: [] })) : null]);
  const sub = `<nav class="subnav" aria-label="Seções das configurações">${ABAS_CFG.map(([k, n]) => `<a href="#/configuracoes${k === 'geral' ? '' : `/${k}`}" ${k === aba ? 'aria-current="page"' : ''}>${n}</a>`).join('')}</nav>`;
  if (aba === 'sigilo') return cfgSigilo(sub, hm);
  if (aba === 'contatos') return cfgContatos(sub, c);
  tela('Configurações', `${sub}${proposito('Nome, endereços, email e plano padrão da plataforma.', { titulo: 'Configurações gerais', textos: [
    `Base de subdomínios: com um DNS que aceite qualquer subdomínio dessa base, cada empresa ganha o próprio endereço (empresa.ia.suaplataforma.com.br). Sem isso, o endereço é ${esc(c.url_base || '')}/empresa.`,
    'Identificadores reservados: nenhuma empresa pode usar estes identificadores no endereço, além dos reservados pelo sistema.',
    'Email da plataforma: usado para códigos de acesso e convites das empresas que não têm email próprio. Sem ele, os códigos aparecem só no log do servidor. O motivo das falhas vem do servidor de email; senhas e chaves ficam ocultas.',
  ] })}<form id="f-cfg" novalidate>
    <div class="grade-2"><div class="campo"><label for="cf-nome">Nome da plataforma</label><input class="entrada" id="cf-nome" value="${esc(c.nome)}" maxlength="60"></div>
      <div class="campo"><label for="cf-plano">Plano padrão para novas empresas</label><select class="entrada" id="cf-plano"><option value="">Nenhum</option>${C.planos.map(p => `<option value="${p.id}" ${p.id === c.plano_padrao ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="campo"><label for="cf-sub">Base de subdomínios (opcional)</label><input class="entrada" id="cf-sub" value="${esc(c.subdominio_base || '')}" aria-describedby="cf-sub-ajuda">
      <span class="ajuda" id="cf-sub-ajuda">Por exemplo, ia.suaplataforma.com.br. Sem base, o endereço é ${esc(c.url_base || '')}/empresa.</span></div>
    <div class="campo"><label for="cf-res">Identificadores reservados (além dos do sistema)</label><input class="entrada" id="cf-res" value="${esc(c.slugs_reservados.join(', '))}" aria-describedby="cf-res-ajuda"><span class="ajuda" id="cf-res-ajuda">Separe por vírgula.</span></div>
    <h2 class="h-secao">Email da plataforma</h2><p class="dica">${c.smtp.configurado ? 'Configurado.' : 'Não configurado: os códigos de acesso aparecem só no log do servidor.'}</p>
    ${(c.smtp.falhas || []).length ? `<div class="faixa-aviso atencao"><b>Últimas falhas de envio:</b> confira a URL do SMTP e envie um email de teste.
      <ul class="dica" style="margin:6px 0 0">${c.smtp.falhas.map(f => `<li>${esc(dataHora(f.em))} · ${esc(f.origem)} · <code>${esc(f.detalhe)}</code></li>`).join('')}</ul></div>` : ''}
    <div class="grade-2"><div class="campo"><label for="cf-smtp">URL do SMTP</label><input class="entrada" id="cf-smtp" autocomplete="off" aria-describedby="cf-smtp-ajuda"><span class="ajuda" id="cf-smtp-ajuda">${c.smtp.configurado ? 'Já configurada: deixe em branco para manter. ' : ''}Formato: smtps://usuario:senha@smtp.exemplo.com:465</span></div>
      <div class="campo"><label for="cf-rem">Remetente</label><input class="entrada" id="cf-rem" value="${esc(c.smtp.remetente || '')}" aria-describedby="cf-rem-ajuda"><span class="ajuda" id="cf-rem-ajuda">Por exemplo: GreenIA &lt;nao-responda@exemplo.com&gt;</span></div></div>
    <div class="linha-botoes"><button type="button" class="btn btn-linha" id="cf-teste">Enviar email de teste</button></div></form>`,
  '<button type="submit" form="f-cfg" class="btn btn-verde btn-pequeno">Salvar configurações</button>');
  $('f-cfg').onsubmit = async ev => {
    ev.preventDefault();
    const corpo = { nome: $('cf-nome').value, plano_padrao: $('cf-plano').value || null, subdominio_base: $('cf-sub').value, slugs_reservados: $('cf-res').value, smtp: { remetente: $('cf-rem').value, ...($('cf-smtp').value ? { url: $('cf-smtp').value } : {}) } };
    try { await api('/api/plataforma/configuracoes', { metodo: 'PUT', corpo }); toast('Configurações salvas.'); vistaConfiguracoes(); } catch (x) { falhar(x); }
  };
  $('cf-teste').onclick = async () => { try { const r = await api('/api/plataforma/smtp/teste', { metodo: 'POST' }); toast(`Email de teste enviado para ${r.para}.`); } catch (x) { falhar(x); } };
}

function cfgSigilo(sub, hm) {
  tela('Configurações', `${sub}${proposito('Modelos que valem para todas as empresas em conversas com dados sigilosos.', { titulo: 'Dados sigilosos', textos: [
    'Com pelo menos um modelo autorizado aqui, conversas com informação sigilosa funcionam em todas as empresas sem que o admin de cada uma precise aprovar um modelo para dados sigilosos (homologar). A empresa não consegue retirar esta autorização; ela pode homologar outros modelos além destes.',
    'Sem nenhum modelo autorizado, em empresas cujo admin ainda não homologou um modelo, conversas sigilosas são bloqueadas com segurança (nada é enviado) e o admin é avisado.',
    'Nenhuma empresa consegue homologar um modelo proibido, e homologações já feitas deixam de valer para dados sigilosos. Para conversas comuns, a empresa continua decidindo.',
    'Ao autorizar, use um nível que todas as pessoas acessam (normalmente Rápido) e informe o fornecedor fixado com o nome que aparece no OpenRouter.',
  ] })}
    <div class="secao-titulo" style="margin-top:0"><h2 class="h-secao">Modelos autorizados</h2></div>
    ${hm.homologacoes.length ? tabela(['Modelo', 'Nível', 'Fornecedor fixado', 'Autorizado por', ''], hm.homologacoes.map(h => `<tr><td data-r="Modelo"><b>${esc(h.nome)}</b><br><span class="dica">${esc(h.id)}</span></td><td data-r="Nível">${esc(NIVEIS[h.perfil] || h.perfil)}</td><td data-r="Fornecedor">${esc(h.fornecedor)}</td><td data-r="Autorizado por">${esc(h.por || '')}<br><span class="dica">${esc(dataHora(h.em))} · ${esc(h.justificativa)}</span></td><td data-r=""><button type="button" class="btn-texto btn-pequeno link-perigo" data-hm-retirar="${esc(h.id)}" data-nome="${esc(h.nome)}">Retirar</button></td></tr>`), '')
      : '<div class="faixa-aviso atencao">Nenhum modelo autorizado: em empresas sem modelo aprovado, conversas sigilosas ficam bloqueadas. Autorize um modelo para liberar.</div>'}
    <div class="secao-titulo"><h2 class="h-secao">Modelos proibidos</h2><button type="button" class="btn btn-linha btn-pequeno" id="proibir">Proibir modelo…</button></div>
    ${(hm.vetos || []).length ? tabela(['Modelo', 'Motivo', 'Por', ''], hm.vetos.map(v => `<tr><td data-r="Modelo"><b>${esc(v.id)}</b></td><td data-r="Motivo">${esc(v.motivo)}</td><td data-r="Por">${esc(v.por || '')}<br><span class="dica">${esc(dataHora(v.em))}</span></td><td data-r=""><button type="button" class="btn-texto btn-pequeno" data-veto-retirar="${esc(v.id)}">Retirar</button></td></tr>`), '') : '<p class="dica">Nenhum modelo proibido.</p>'}`,
  '<button type="button" class="btn btn-verde btn-pequeno" id="autorizar">Autorizar modelo</button>');
  const campoModelo = id => `<div class="campo"><label for="${id}">Modelo no OpenRouter</label><input class="entrada" id="${id}" aria-describedby="${id}-ajuda"><span class="ajuda" id="${id}-ajuda">No formato fornecedor/modelo, como aparece no OpenRouter.</span></div>`;
  $('autorizar').onclick = () => modal(`<div class="modal-topo"><div class="rotulo">Dados sigilosos</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="hm-t" tabindex="-1">Autorizar modelo para todas as empresas</h2>
    <form id="f-hm" novalidate>
      <div class="grade-2">${campoModelo('hm-id')}<div class="campo"><label for="hm-nome">Nome para exibir</label><input class="entrada" id="hm-nome" maxlength="120"></div></div>
      <div class="grade-2"><div class="campo"><label for="hm-perfil">Nível</label><select class="entrada" id="hm-perfil">${Object.entries(NIVEIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span class="ajuda">Use um nível que todas as pessoas acessam (normalmente Rápido).</span></div>
        <div class="campo"><label for="hm-forn">Fornecedor fixado</label><input class="entrada" id="hm-forn" aria-describedby="hm-forn-ajuda"><span class="ajuda" id="hm-forn-ajuda">O nome do fornecedor no OpenRouter.</span></div></div>
      <label class="opcoes"><span><input type="checkbox" id="hm-treino"> Conferi que o fornecedor não treina com os dados</span></label>
      <label class="opcoes"><span><input type="checkbox" id="hm-zdr"> Conferi que o fornecedor tem retenção zero (não guarda os dados)</span></label>
      <div class="campo"><label for="hm-just">Justificativa</label><textarea class="entrada" id="hm-just" rows="2"></textarea></div>
      <p class="msg-erro oculto" id="hm-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Autorizar para todas as empresas</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('hm-t').focus();
    $('f-hm').onsubmit = async ev => {
      ev.preventDefault();
      const corpo = { id: $('hm-id').value.trim(), nome: $('hm-nome').value.trim(), perfil: $('hm-perfil').value, fornecedor: $('hm-forn').value.trim(), semTreino: $('hm-treino').checked, retencaoZero: $('hm-zdr').checked, justificativa: $('hm-just').value };
      try { await api('/api/plataforma/homologacoes', { metodo: 'POST', corpo }); fechar(); toast('Modelo autorizado em todas as empresas.'); vistaConfiguracoes('sigilo'); } catch (x) { mostrarErro('hm-erro', x); }
    };
  });
  $('proibir').onclick = () => modal(`<div class="modal-topo"><div class="rotulo">Dados sigilosos</div><button class="icone-btn" id="fechar" aria-label="Fechar">${ICONE.fechar}</button></div>
    <h2 id="vt-t" tabindex="-1">Proibir modelo para dados sigilosos</h2>
    <form id="f-veto" novalidate>${campoModelo('vt-id')}<div class="campo"><label for="vt-motivo">Motivo</label><input class="entrada" id="vt-motivo" maxlength="500"></div>
      <p class="msg-erro oculto" id="vt-erro" role="alert"></p>
      <div class="linha-botoes" style="margin-top:14px"><button class="btn btn-verde">Proibir para dados sigilosos</button></div></form>`, fechar => {
    $('fechar').onclick = fechar; $('vt-t').focus();
    $('f-veto').onsubmit = async ev => {
      ev.preventDefault();
      try { await api('/api/plataforma/vetos-sigilo', { metodo: 'POST', corpo: { id: $('vt-id').value.trim(), motivo: $('vt-motivo').value } }); fechar(); toast('Modelo proibido para dados sigilosos em todas as empresas.'); vistaConfiguracoes('sigilo'); } catch (x) { mostrarErro('vt-erro', x); }
    };
  });
  document.querySelectorAll('[data-veto-retirar]').forEach(b => { b.onclick = () => confirmarStatus({ rotulo: 'Dados sigilosos', titulo: `Retirar a proibição de ${b.dataset.vetoRetirar}?`, botao: 'Retirar a proibição',
    texto: 'As empresas voltam a poder aprovar este modelo para dados sigilosos (homologar).',
    async aplicar() { await api(`/api/plataforma/vetos-sigilo/${encodeURIComponent(b.dataset.vetoRetirar)}`, { metodo: 'DELETE' }); toast('Proibição retirada.'); vistaConfiguracoes('sigilo'); } }); });
  document.querySelectorAll('[data-hm-retirar]').forEach(b => { b.onclick = () => confirmarStatus({ rotulo: 'Dados sigilosos', titulo: `Retirar a autorização de ${b.dataset.nome} em todas as empresas?`, perigo: true, botao: 'Retirar a autorização',
    texto: 'Empresas sem outro modelo aprovado para dados sigilosos passam a bloquear as conversas sigilosas.',
    async aplicar() { await api(`/api/plataforma/homologacoes/${encodeURIComponent(b.dataset.hmRetirar)}`, { metodo: 'DELETE' }); toast('Autorização retirada.'); vistaConfiguracoes('sigilo'); } }); });
}

// Contatos da página de vendas: registrar interação à vista em cada linha; o bloqueio legal em "Mais ações".
function cfgContatos(sub, c) {
  tela('Configurações', `${sub}${proposito('Contatos recebidos pela página de vendas e o prazo de eliminação de cada um.', { titulo: 'Contatos da página de vendas', textos: [
    `Cada contato é eliminado ${num(c.contatos.prazoMeses)} meses depois da última interação comercial registrada, salvo bloqueio legal.`,
    'Registre aqui respostas, reuniões e propostas feitas fora do sistema: só elas e um novo formulário renovam o prazo.',
  ] })}
    ${tabela(['Última interação', 'Empresa', 'Pessoa', 'Mensagem', ''], c.contatos.itens.map(l => `<tr><td data-r="Última interação">${data(l.ultimaInteracao)}<br><span class="dica">${l.hold ? 'em bloqueio legal' : `elimina em ${data(l.eliminarApos)}`}</span></td><td data-r="Empresa"><b>${esc(l.empresa)}</b><br><span class="dica">${esc(l.pessoas || '')}</span></td><td data-r="Pessoa">${esc(l.nome)}<br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td><td data-r="Mensagem">${esc(l.mensagem || '–')}</td>
      <td data-r=""><span class="plat-linha-acoes"><button class="btn-texto" data-ct="interacao" data-id="${l.id}" data-nome="${esc(l.nome || l.email)}">Registrar interação</button>
        ${menuMais([l.hold ? { acao: 'ct-liberar', id: l.id, rotulo: 'Liberar bloqueio legal' } : { acao: 'ct-hold', id: l.id, rotulo: 'Bloqueio legal…' }], { rotulo: `Mais ações do contato ${l.nome || l.email}`, classe: 'btn-texto' })}</span></td></tr>`),
    vazioHtml({ icone: 'pessoas', titulo: 'Nenhum contato ainda', texto: 'Os contatos enviados pela página de vendas aparecem aqui.' }))}
    ${c.contatos.total > c.contatos.itens.length ? `<p class="dica">Mostrando os ${c.contatos.itens.length} mais recentes de ${num(c.contatos.total)}.</p>` : ''}`);
  const recarregar = () => vistaConfiguracoes('contatos');
  for (const b of document.querySelectorAll('[data-ct="interacao"]')) b.onclick = () => confirmarStatus({ rotulo: 'Contato comercial', titulo: `Registrar interação com ${b.dataset.nome}`, botao: 'Registrar interação',
    texto: 'A interação renova o prazo de eliminação do contato.',
    campos: `<div class="campo"><label for="ct-tipo">Tipo da interação</label><select class="entrada" id="ct-tipo"><option value="">Escolha</option>${Object.entries(TIPOS_INTERACAO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="ct-em">Data da interação</label>${campoData({ id: 'ct-em', max: new Date().toISOString().slice(0, 10), rotulo: 'a data da interação', extra: 'aria-describedby="ct-em-ajuda"' })}<span class="ajuda" id="ct-em-ajuda">Deixe em branco para hoje.</span></div>`,
    validar: () => (!$('ct-tipo').value ? 'Escolha o tipo da interação.' : ''),
    async aplicar() { await api(`/api/plataforma/contatos/${b.dataset.id}/interacao`, { metodo: 'POST', corpo: { tipo: $('ct-tipo').value, em: dataOuErro($('ct-em')) ? `${dataOuErro($('ct-em'))}T12:00:00Z` : null } }); toast('Contato atualizado.'); recarregar(); } });
  C.mais['ct-hold'] = b => pedirHold({ titulo: 'Bloqueio legal do contato comercial', tipos: { legal: 'Obrigação legal', contrato: 'Contrato', litigio: 'Litígio' }, enviar: async corpo => { await api(`/api/plataforma/contatos/${b.dataset.id}/hold`, { metodo: 'POST', corpo }); toast('Contato atualizado.'); recarregar(); } });
  C.mais['ct-liberar'] = async b => { try { await api(`/api/plataforma/contatos/${b.dataset.id}/liberar`, { metodo: 'POST' }); toast('Contato atualizado.'); recarregar(); } catch (e) { falhar(e); } };
}

// ---------------------------------------------------------------- Rotas
async function rota() {
  const h = location.hash || '#/empresas';
  const fimTransicao = transicao();
  lateral();
  $('lateral').classList.remove('aberta');
  C.ajuda.tela = null;
  $('modal').innerHTML = '';   // modal aberto não sobrevive à troca de tela
  try {
    let m;
    if ((m = /^#\/empresas\/([\w-]+)(?:\/(\w+))?$/.exec(h))) await vistaEmpresa(m[1], m[2]);
    else if (h.startsWith('#/usuarios')) await vistaUsuarios();
    else if ((m = /^#\/planos\/([\w-]+)$/.exec(h))) await vistaPlano(m[1]);
    else if (h.startsWith('#/planos')) await vistaPlanos();
    else if (h.startsWith('#/ambientes')) await vistaAmbientes();
    else if (h.startsWith('#/uso')) await vistaUso();
    else if (h.startsWith('#/auditoria')) await vistaAuditoria();
    else if (h.startsWith('#/configuracoes')) await vistaConfiguracoes(h.split('/')[2]);
    else if (h.startsWith('#/encerramentos')) await vistaEncerramentos();
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
  ligarMenusConsole();
  api('/api/plataforma/empresas').then(d => { C.empresas = d.empresas; }).catch(() => {});
  iniciarPaleta(itensPaleta, { atalhos: { n: novaEmpresa } });
  rota();
}
iniciar();
