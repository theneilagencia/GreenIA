// Peças comuns das telas de administração: confirmação no modal próprio (nunca confirm()/prompt() do
// navegador) e aviso de alterações não salvas nos formulários de gestão.
import { esc } from '/comum.js';

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
