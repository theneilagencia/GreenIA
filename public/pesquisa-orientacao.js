import { esc } from '/comum.js';

export function pedeLiberacaoPesquisa(texto) {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return /^(deixe|habilite|libere|ative|permita|quero|como|preciso)\b/.test(t)
    && /pesquis|internet/.test(t) && /habilit|liber|ativar|ative|permit/.test(t);
}
export function avisoPesquisa(p) {
  if (!p?.bloqueada) return '';
  return '<section class="pesquisa-pendente" aria-label="Pesquisa na internet"><div><b>A pesquisa na internet está bloqueada</b><p>A plataforma identificou o que precisa ser revisado.</p></div><button type="button" class="btn btn-linha btn-pequeno" id="resolver-pesquisa">Ver como liberar a pesquisa</button></section>';
}
export function abrirOrientacaoPesquisa(p, conversa, origem = null) {
  const pode = perm => !!window.__greeniaPode?.(perm);
  const solicitar = '<button type="button" class="btn btn-linha" data-relatar-limitacao="Pesquisa na internet bloqueada" data-local-limitacao="Pesquisa do Quick Win">Solicitar revisão ao administrador</button>';
  const areas = (p.areas || []).map(a => `<li><b>Área ${esc(a.nome)}</b><p>A proteção reforçada desta área bloqueia a pesquisa. Não existe liberação apenas para este Quick Win.</p>${pode('user.update') ? `<a class="btn btn-linha" href="#/pessoas?area=${Number(a.id)}&foco=protecao-area&voltar=${Number(conversa)}">Revisar a pesquisa em ${esc(a.nome)}</a>` : '<p>Quem administra pessoas e áreas precisa avaliar esta regra.</p>'}</li>`).join('');
  const empresa = p.empresa_liberou ? '' : `<li><b>A empresa ainda não permite pesquisa</b><p>Esta liberação vale para os Quick Wins autorizados. Ela não remove bloqueios de sigilo ou da área.</p>${pode('policy.manage') ? '<a class="btn btn-linha" href="#/politicas?foco=pesquisa-web">Abrir a permissão de pesquisa</a>' : '<p>Quem administra as políticas de IA pode avaliar a liberação.</p>'}</li>`;
  const sigilo = p.sigilosa ? '<li><b>Este trabalho tem conteúdo sigiloso</b><p>Não é possível pesquisar na internet com este conteúdo. Use somente fontes autorizadas; a marcação de sigilo não deve ser removida para contornar a proteção.</p></li>' : '';
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="modal-fundo"><section class="modal pesquisa-resolucao" role="dialog" aria-modal="true" aria-labelledby="pesquisa-titulo" tabindex="-1"><div class="modal-topo"><h2 id="pesquisa-titulo">O que impede a pesquisa</h2><button type="button" class="btn btn-texto" id="fechar-pesquisa">Fechar</button></div><p>Sem pesquisa, a GreenIA não consegue confirmar os temas atuais. Revise os pontos abaixo antes de executar novamente.</p><ul class="qc-orientacoes">${empresa}${areas}${sigilo}</ul><p class="dica">A GreenIA não muda regras de segurança pela conversa. Uma mudança na proteção da área afeta todos os Quick Wins vinculados a ela e exige avaliação de quem administra os acessos.</p>${(!pode('user.update') && p.areas?.length || !pode('policy.manage') && !p.empresa_liberou) ? solicitar : ''}<button type="button" class="btn btn-verde" id="conferir-pesquisa">Conferir novamente</button><p id="pesquisa-verificacao" role="status"></p></section></div>`;
  const fechar = () => { document.removeEventListener('keydown', teclado); m.innerHTML = ''; (origem?.isConnected ? origem : document.getElementById('resolver-pesquisa'))?.focus(); };
  const teclado = e => {
    if(e.key === 'Escape') fechar();
    if(e.key === 'Tab') {
      const controles = [...m.querySelectorAll('a,button:not(:disabled)')];
      const primeiro = controles[0], ultimo = controles.at(-1);
      if(e.shiftKey && (document.activeElement === primeiro || document.activeElement === m.querySelector('.modal'))) { e.preventDefault(); ultimo?.focus(); }
      else if(!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
    }
  };
  document.addEventListener('keydown', teclado);
  document.getElementById('fechar-pesquisa').onclick = fechar;
  m.querySelectorAll('a, [data-relatar-limitacao]').forEach(a => a.addEventListener('click', () => { document.removeEventListener('keydown', teclado); m.innerHTML = ''; }));
  m.querySelector('.modal').focus();
  return { fechar };
}
