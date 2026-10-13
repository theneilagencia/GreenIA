// Peças comuns das telas de administração: confirmação no modal próprio (nunca confirm()/prompt() do
// navegador) e aviso de alterações não salvas nos formulários de gestão.
import { esc, ICONE } from '/comum.js';

// Confirmação acessível: título com foco, consequência em texto simples e botão com o nome da ação.
// Com `digitar`, o botão só libera depois de a pessoa digitar exatamente aquele texto.
export function confirmar({ titulo, texto = '', botao = 'Confirmar', cancelar = 'Cancelar', perigo = false, digitar = '' } = {}) {
  return new Promise(resolve => {
    const anterior = document.activeElement;
    const paragrafos = (Array.isArray(texto) ? texto : [texto]).filter(Boolean).map(t => `<p>${esc(t)}</p>`).join('');
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo adm-confirmar';
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="adm-conf-titulo" aria-describedby="adm-conf-texto">
      <h2 id="adm-conf-titulo" tabindex="-1">${esc(titulo)}</h2>
      <div id="adm-conf-texto">${paragrafos}</div>
      ${digitar ? `<label class="legenda" for="adm-conf-campo">Para confirmar, digite: <b>${esc(digitar)}</b></label><input class="entrada" id="adm-conf-campo" autocomplete="off" spellcheck="false">` : ''}
      <div class="modal-acoes"><button type="button" class="btn btn-texto" data-cancelar>${esc(cancelar)}</button>
        <button type="button" class="btn ${perigo ? 'btn-perigo' : 'btn-verde'}" data-confirmar ${digitar ? 'disabled' : ''}>${esc(botao)}</button></div></div>`;
    document.body.appendChild(fundo);
    const campo = fundo.querySelector('#adm-conf-campo'), ok = fundo.querySelector('[data-confirmar]');
    const fechar = v => { fundo.remove(); document.removeEventListener('keydown', tecla, true); if (anterior?.isConnected) anterior.focus?.({ preventScroll: true }); resolve(v); };
    // Esc fecha só este modal (o painel lateral que estiver por baixo continua aberto).
    const tecla = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(false); } };
    document.addEventListener('keydown', tecla, true);
    if (campo) {
      campo.oninput = () => { ok.disabled = campo.value.trim() !== String(digitar).trim(); };
      campo.onkeydown = ev => { if (ev.key === 'Enter' && !ok.disabled) { ev.preventDefault(); fechar(true); } };
    }
    fundo.querySelector('[data-cancelar]').onclick = () => fechar(false);
    ok.onclick = () => fechar(true);
    fundo.onclick = ev => { if (ev.target === fundo) fechar(false); };
    (campo || fundo.querySelector('#adm-conf-titulo')).focus();
  });
}

// ---------------------------------------------------------------- caminho claro
// Topo de cada tela da Administração: uma linha de propósito à esquerda e, à direita, a ação principal (uma só).
// A explicação longa fica na Ajuda da tela (ajuda-contextual.js).
export const topoTela = (proposito, acao = '') => `<div class="adm-topo"><p class="adm-proposito">${proposito}</p>${acao ? `<div class="adm-topo-acao">${acao}</div>` : ''}</div>`;

// Revelação progressiva: um botão "Filtrar" (ou "Mais opções") que mostra e esconde um bloco. O bloco começa
// escondido, a não ser que já haja filtro aplicado (aberto = true).
export const botaoRevelar = (alvo, rotulo, aberto = false, extra = '') => `<button type="button" class="btn btn-linha btn-pequeno adm-revelar" aria-expanded="${aberto}" aria-controls="${alvo}" ${extra}>${esc(rotulo)}</button>`;
document.addEventListener('click', ev => {
  const b = ev.target.closest?.('.adm-revelar');
  if (!b) return;
  const alvo = document.getElementById(b.getAttribute('aria-controls'));
  if (!alvo) return;
  const abrir = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', abrir); alvo.hidden = !abrir;
  if (abrir) alvo.querySelector('input, select, textarea, button')?.focus();
});

// Link direto para um campo que está recolhido ("?foco=", "Mais opções", bloco fechado): mostra o caminho até ele.
export function revelarAte(el) {
  for (let a = el?.parentElement; a; a = a.parentElement) {
    if (a.hidden) { a.hidden = false; if (a.id) document.querySelector(`[aria-controls="${CSS.escape(a.id)}"]`)?.setAttribute('aria-expanded', 'true'); }
    if (a.tagName === 'DETAILS') a.open = true;
  }
}

// Painel lateral de leitura (um detalhe por vez): abre à direita, Esc ou o fundo fecha, o foco volta para quem abriu.
// Reabrir (depois de salvar algo no painel) troca o conteúdo e mantém para onde o foco volta ao fechar.
let painelAberto = null;
export function painelLateral({ migalha = '', titulo, corpo }) {
  const host = document.getElementById('modal');
  const anterior = painelAberto ? painelAberto.anterior : document.activeElement;
  painelAberto?.soltar();
  host.innerHTML = `<div class="px-fundo entra" id="px-fundo"><aside class="px entra" role="dialog" aria-modal="true" aria-labelledby="px-titulo" tabindex="-1">
    <header class="px-topo"><span class="px-migalha">${esc(migalha)}<span aria-hidden="true">›</span><b>${esc(titulo)}</b></span><span class="px-estado"></span>
      <button type="button" class="icone-btn px-fechar" data-fechar aria-label="Fechar (Esc)" title="Fechar (Esc)">${ICONE.fechar}<span class="px-fechar-texto" aria-hidden="true">Fechar</span></button></header>
    <div class="px-corpo"><h2 class="px-titulo" id="px-titulo">${esc(titulo)}</h2>${corpo}</div></aside></div>`;
  const soltar = () => { document.removeEventListener('keydown', tecla, true); removeEventListener('hashchange', fechar); painelAberto = null; };
  const fechar = () => { soltar(); host.innerHTML = ''; if (anterior?.isConnected) anterior.focus({ preventScroll: true }); };
  // Uma confirmação ou um formulário aberto por cima do painel cuida das próprias teclas.
  const tecla = ev => { if (document.querySelector('.adm-confirmar, #modal .modal-fundo')) return; if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(); } else if (ev.key === 'Tab') { const f = [...host.querySelectorAll('button, a[href], [tabindex="0"]')]; if (!f.length) return; const i = f.indexOf(document.activeElement); if (ev.shiftKey && i <= 0) { ev.preventDefault(); f.at(-1).focus(); } else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); } } };
  document.addEventListener('keydown', tecla, true);
  addEventListener('hashchange', fechar);
  host.querySelector('#px-fundo').onclick = ev => { if (ev.target.id === 'px-fundo') fechar(); };
  host.querySelector('[data-fechar]').onclick = fechar;
  host.querySelector('.px').focus();
  painelAberto = { anterior, soltar };
  return fechar;
}

// Lista de leitura com um só ponto de parada no teclado (setas andam, Enter abre): uma tabela longa de registros
// não vira dezenas de botões. Cada linha <tr data-registro="i"> abre o detalhe no painel lateral.
export function ligarLinhas(tabela, abrir) {
  if (!tabela) return;
  const linhas = () => [...tabela.querySelectorAll('tr[data-registro]')];
  linhas().forEach((tr, i) => { tr.tabIndex = i === 0 ? 0 : -1; });
  tabela.addEventListener('click', ev => { const tr = ev.target.closest('tr[data-registro]'); if (tr && !ev.target.closest('a, button, input, label')) abrir(tr.dataset.registro, tr); });
  tabela.addEventListener('keydown', ev => {
    const tr = ev.target.closest?.('tr[data-registro]');
    if (!tr) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(tr.dataset.registro, tr); return; }
    const ls = linhas(), i = ls.indexOf(tr);
    const alvo = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: ls.length - 1 }[ev.key];
    if (alvo === undefined || !ls[alvo]) return;
    ev.preventDefault();
    tr.tabIndex = -1; ls[alvo].tabIndex = 0; ls[alvo].focus();
  });
}

// ---------------------------------------------------------------- alterações não salvas
// Um formulário de gestão por vez: marcado como alterado na primeira edição, com "Alterações não salvas"
// na barra de salvar (fixa no rodapé da tela) e aviso antes de sair por outro item do menu ou ao fechar a aba.
let vigiado = null;
const pendente = () => !!vigiado?.sujo && vigiado.form.isConnected;

export function vigiarAlteracoes(form, { barra = null, cliques = '' } = {}) {
  if (!form) return { marcar() {}, limpar() {} };
  const estado = { form, rota: location.hash, sujo: false };
  let aviso = null;
  if (barra) {
    barra.classList.add('adm-salvar');
    aviso = barra.querySelector('.adm-sujo') || Object.assign(document.createElement('span'), { className: 'adm-sujo dica' });
    aviso.setAttribute('role', 'status');
    if (!aviso.isConnected) barra.prepend(aviso);
  }
  const mostrar = () => { if (aviso) aviso.textContent = estado.sujo ? 'Alterações não salvas' : ''; form.classList.toggle('alterado', estado.sujo); };
  const marcar = () => { if (!estado.sujo) { estado.sujo = true; mostrar(); } };
  // Buscar ou filtrar dentro do formulário não é alterar.
  const editar = ev => { if (!ev.target.closest?.('input[type=search], [data-sem-alteracao]')) marcar(); };
  form.addEventListener('input', editar);
  form.addEventListener('change', editar);
  // Botões que mudam o formulário sem disparar input (remover imagem, mostrar seção, restaurar…).
  if (cliques) form.addEventListener('click', ev => { if (ev.target.closest?.(cliques)) marcar(); });
  vigiado = estado;
  return { marcar, limpar: () => { estado.sujo = false; mostrar(); } };
}

window.addEventListener('beforeunload', ev => { if (pendente()) { ev.preventDefault(); ev.returnValue = ''; } });
document.addEventListener('greenia:antes-navegar', ev => {
  if (!pendente()) return;
  const estado = vigiado, destino = location.hash;
  // A rota fica onde está enquanto a pessoa decide; confirmando, segue para o destino escolhido.
  ev.preventDefault();
  history.replaceState(null, '', estado.rota);
  confirmar({ titulo: 'Sair sem salvar?', texto: 'As alterações desta tela ainda não foram salvas. Se sair agora, elas se perdem.', botao: 'Sair sem salvar', cancelar: 'Continuar editando', perigo: true })
    .then(sair => {
      if (!sair) return;
      estado.sujo = false;
      if (destino === estado.rota) window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = destino;
    });
});
