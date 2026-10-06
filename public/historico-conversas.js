import { api, esc, ICONE, toast, vazioHtml } from '/comum.js';
import { E, cabecalho, ligarCabecalho, recarregarLateral, irPara, cartaoBase } from '/app.js';
import { fecharComEscape } from '/acessibilidade.js';
let fecharMenuAtual = null;
let dialogoAtual = false;

// Um diálogo para cada decisão, com cancelamento em foco e erro recuperável.
function dialogo({ titulo, texto, conteudo = '', acao, perigosa = false, executar }) {
  if (dialogoAtual) return;
  dialogoAtual = true; fecharMenuAtual?.();
  const anterior = document.activeElement;
  const fundo = document.createElement('div'); fundo.className = 'hc-modal-fundo';
  fundo.innerHTML = `<section class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="hc-titulo" aria-describedby="hc-descricao" tabindex="-1"><span class="hc-modal-icone">${ICONE[perigosa ? 'lixo' : 'lapis']}</span><h2 id="hc-titulo">${esc(titulo)}</h2><p id="hc-descricao">${esc(texto)}</p>${conteudo}<p class="hc-erro" role="alert" hidden></p><div class="hc-modal-acoes"><button type="button" class="btn btn-linha" data-cancelar>Cancelar</button><button type="button" class="btn ${perigosa ? 'hc-perigo' : 'btn-verde'}" data-confirmar>${esc(acao)}</button></div></section>`;
  document.body.append(fundo);
  let ocupado = false;
  const cancelar = fundo.querySelector('[data-cancelar]'), confirmar = fundo.querySelector('[data-confirmar]');
  const fechar = () => { if (ocupado) return; limparEscape(); removeEventListener('hashchange', fechar); fundo.remove(); dialogoAtual = false; if (anterior?.isConnected) anterior.focus(); };
  const limparEscape = fecharComEscape(fundo, fechar);
  addEventListener('hashchange', fechar);
  cancelar.onclick = fechar;
  fundo.onclick = e => { if (e.target === fundo) fechar(); };
  const aceitar = fundo.querySelector('[data-aceitar]');
  if (aceitar) { confirmar.disabled = true; aceitar.onchange = () => { confirmar.disabled = !aceitar.checked; }; }
  confirmar.onclick = async () => {
    ocupado = true; confirmar.disabled = cancelar.disabled = true; const erro = fundo.querySelector('.hc-erro'); erro.hidden = true;
    try { await executar(fundo); ocupado = false; fechar(); }
    catch (e) { ocupado = false; confirmar.disabled = aceitar ? !aceitar.checked : false; cancelar.disabled = false; erro.textContent = e.message; erro.hidden = false; }
  };
  cancelar.focus();
}
export function renomearConversa(c, depois = async () => {}) {
  dialogo({ titulo: 'Renomear conversa', texto: 'Escolha um nome que ajude a encontrar este trabalho depois.', conteudo: `<label class="hc-campo">Nome da conversa<input class="entrada" data-nome value="${esc(c.titulo)}" maxlength="120"></label>`, acao:'Salvar nome', executar: async fundo => {
    const titulo = fundo.querySelector('[data-nome]').value.trim(); if (!titulo) throw Error('Informe um nome para a conversa.');
    const d = await api(`/api/conversas/${c.id}`, {metodo:'PATCH',corpo:{titulo}}); await recarregarLateral(); await depois(d.conversa); toast('Nome atualizado.');
  }});
}
export function excluirConversa(c, depois = async () => {}) {
  dialogo({ titulo:'Excluir esta conversa?', texto:`“${c.titulo}” e seus anexos serão removidos. Esta ação não pode ser desfeita.`, conteudo:'<p class="hc-modal-nota">A exclusão não desfaz alterações já realizadas em outros sistemas. Registros de uso e cópias de segurança seguem a política de retenção.</p>', acao:'Excluir conversa', perigosa:true, executar:async () => {
    await api(`/api/conversas/${c.id}`,{metodo:'DELETE'}); await recarregarLateral();
    if (location.hash === `#/c/${c.id}`) irPara('#/conversas'); else await depois();
    toast('Conversa excluída.');
  }});
}
export function ligarAcoesConversas(raiz, conversas, depois) {
  raiz.querySelectorAll('[data-hc-acoes]').forEach(b => { b.onclick = e => {
    e.preventDefault(); const c = conversas.find(c => String(c.id) === b.dataset.hcAcoes); if (!c) return;
    fecharMenuAtual?.(); const menu = document.createElement('div'); menu.className = 'hc-menu'; menu.setAttribute('role','menu'); menu.setAttribute('aria-label',`Ações de ${c.titulo}`);
    menu.innerHTML = `<button role="menuitem" data-renomear>${ICONE.lapis} Renomear</button><button role="menuitem" class="hc-menu-perigo" data-excluir>${ICONE.lixo} Excluir conversa</button>`;
    const r=b.getBoundingClientRect(); menu.style.left=`${Math.max(8, Math.min(innerWidth-208,r.right-200))}px`; menu.style.top=`${Math.min(innerHeight-108,r.bottom+5)}px`;
    document.body.append(menu); b.setAttribute('aria-expanded','true');
    const fora = e => { if (!menu.contains(e.target) && e.target !== b) fechar(); };
    const tecla = e => { if (e.key === 'Escape') {e.preventDefault(); fechar();} else if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { e.preventDefault(); const itens=[...menu.querySelectorAll('button')],i=itens.indexOf(document.activeElement); itens[e.key==='Home'?0:e.key==='End'?1:(i+(e.key==='ArrowDown'?1:-1)+2)%2].focus(); }};
    const fechar = () => {menu.remove(); document.removeEventListener('pointerdown',fora);menu.removeEventListener('keydown',tecla);b.setAttribute('aria-expanded','false');if(b.isConnected)b.focus();fecharMenuAtual=null;};
    fecharMenuAtual=fechar; document.addEventListener('pointerdown',fora);menu.addEventListener('keydown',tecla);
    menu.querySelector('[data-renomear]').onclick=()=>{fechar();renomearConversa(c,depois);};
    menu.querySelector('[data-excluir]').onclick=()=>{fechar();excluirConversa(c,depois);}; menu.querySelector('button').focus();
  }; });
}
function grupoData(iso) {
  const d=new Date(iso), agora=new Date(), inicio=new Date(agora.getFullYear(),agora.getMonth(),agora.getDate());
  const ontem=new Date(inicio);ontem.setDate(ontem.getDate()-1);const semana=new Date(inicio);semana.setDate(semana.getDate()-7);
  return d>=inicio?'Hoje':d>=ontem?'Ontem':d>=semana?'Últimos 7 dias':d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}
export async function vistaHistorico() {
  const raiz=document.getElementById('principal');
  raiz.innerHTML=`${cabecalho('Conversas')}<div class="pagina"><div class="pagina-dentro hc-pagina">${cartaoBase()}<div class="hc-intro"><div><span class="hc-eyebrow">Seu histórico</span><h2>Retome de onde parou</h2><p>Encontre uma conversa ou comece um novo trabalho.</p></div><div class="hc-intro-acoes"><a class="btn btn-verde btn-pequeno" href="#/nova">${ICONE.mais} Nova conversa</a><button class="btn btn-linha btn-pequeno" data-hc-todas>${ICONE.lixo} Excluir todas</button></div></div><div class="hc-barra"><label class="hc-busca">${ICONE.busca}<span class="sr">Buscar conversas</span><input type="search" id="hc-busca" placeholder="Buscar por nome ou Quick Win" autocomplete="off"></label><label class="hc-filtro"><span>Mostrar</span><select id="hc-tipo"><option value="">Todas as conversas</option><option value="livres">Conversas livres</option><option value="quickwins">Quick Wins</option><option value="sigilosas">Sigilosas</option></select></label></div><div class="hc-resumo" role="status" aria-live="polite"></div><div class="hc-lista" aria-label="Histórico de conversas"></div><button class="btn btn-linha hc-mais" hidden>Carregar mais conversas</button><p class="hc-retencao">Conversas sem uso são excluídas após ${Number(E.retencaoDias)} dias, conforme a configuração da empresa.</p></div></div>`;
  ligarCabecalho();
  const lista=raiz.querySelector('.hc-lista'),resumo=raiz.querySelector('.hc-resumo'),mais=raiz.querySelector('.hc-mais');
  let dados=[], pagina=0, versao=0, timer=0;
  async function carregar(adicionar=false) {
    if (!lista.isConnected) return;
    const v=++versao;const proxima=adicionar?pagina+1:0;mais.disabled=true;lista.setAttribute('aria-busy','true');
    const busca=raiz.querySelector('#hc-busca').value.trim(),tipo=raiz.querySelector('#hc-tipo').value;
    try {
      const d=await api(`/api/conversas?${new URLSearchParams({todas:'1',pagina:proxima,busca,tipo})}`);
      if(v!==versao||!lista.isConnected)return;
      dados=adicionar?[...dados,...d.conversas]:d.conversas;pagina=proxima;mais.hidden=!d.mais;
      resumo.textContent=`${d.total} ${d.total===1?'conversa':'conversas'}${busca||tipo?' encontradas':''}`;
      const grupos=new Map();for(const c of dados){const g=grupoData(c.atualizado_em);if(!grupos.has(g))grupos.set(g,[]);grupos.get(g).push(c);}
      lista.innerHTML=dados.length?[...grupos].map(([g,cs])=>`<section class="hc-grupo"><h3>${esc(g)}</h3><ul>${cs.map(c=>`<li class="hc-linha"><a href="#/c/${c.id}" class="hc-conversa"><span class="hc-marca">${ICONE[c.quick_win_id?'raio':'conversa']||ICONE.conversa}</span><span class="hc-texto"><b>${esc(c.titulo)}</b><small>${esc(c.quick_win || 'Conversa livre')}</small></span>${c.sigilosa?'<span class="hc-sigilo">Sigilosa</span>':''}<time datetime="${esc(c.atualizado_em)}">${esc(new Date(c.atualizado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}))}</time></a><button type="button" class="hc-acoes" data-hc-acoes="${c.id}" aria-label="Ações de ${esc(c.titulo)}" aria-haspopup="menu" aria-expanded="false">···</button></li>`).join('')}</ul></section>`).join(''):vazioHtml({icone:'conversa',titulo:busca||tipo?'Nenhuma conversa encontrada':'Seu histórico começa aqui',texto:busca||tipo?'Tente outro nome ou altere o filtro.':'As conversas e execuções de Quick Wins aparecem aqui para você retomar.',acao:busca||tipo?'':'<a class="btn btn-verde" href="#/nova">Nova conversa</a>'});
      ligarAcoesConversas(lista,dados,()=>carregar());
    } catch(e){if(v===versao&&lista.isConnected){resumo.innerHTML=`${esc(e.message)} <button class="btn-texto" data-repetir>Tentar novamente</button>`;resumo.querySelector('[data-repetir]').onclick=()=>carregar(adicionar);}}
    finally{if(v===versao&&lista.isConnected){mais.disabled=false;lista.removeAttribute('aria-busy');}}
  }
  raiz.querySelector('#hc-busca').oninput=()=>{clearTimeout(timer);versao++;mais.disabled=true;timer=setTimeout(()=>carregar(),220);};
  raiz.querySelector('#hc-tipo').onchange=()=>{clearTimeout(timer);carregar();};mais.onclick=()=>carregar(true);
  raiz.querySelector('[data-hc-todas]').onclick=async e=>{
    const b=e.currentTarget;b.disabled=true;
    try{const r=await api('/api/conversas/resumo-exclusao');if(!r.total){toast('Você não tem conversas para excluir.');return;}
      dialogo({titulo:'Excluir todas as suas conversas?',texto:`Serão excluídas ${r.total} ${r.total===1?'conversa':'conversas'} da sua conta neste ambiente${r.testes?', incluindo testes de Quick Wins':''}. As mensagens e os anexos serão removidos.`,conteudo:'<p class="hc-modal-nota">Esta ação não pode ser desfeita e não exclui conversas de outras pessoas. Alterações já realizadas em outros sistemas não são desfeitas. Registros de uso e cópias de segurança seguem a política de retenção.</p><label class="hc-aceitar"><input type="checkbox" data-aceitar>Entendo que não poderei recuperar estas conversas pela plataforma.</label>',acao:'Excluir todas',perigosa:true,executar:async()=>{const d=await api('/api/conversas',{metodo:'DELETE',corpo:{confirmacao:'EXCLUIR_TODAS',ate_id:r.ate_id}});await recarregarLateral();await carregar();toast(`${d.excluidas} ${d.excluidas===1?'conversa excluída':'conversas excluídas'}.`);}});
    }catch(e){toast(e.message);}finally{if(b.isConnected)b.disabled=false;}
  };
  await carregar();
}
