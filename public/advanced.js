import { trabalhoDoPedido } from '/trabalhos.js';
import { api,esc,toast,fmtCusto,emCreditos as usaCreditos,ICONE } from '/comum.js';
const mostrarConsumo=v=>fmtCusto(v);
const dataCurta=v=>new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
export async function painelAdvancedAdmin(alvo) {
 const d=await api('/api/admin/advanced');
 const el=document.createElement('section');el.className='trabalho-admin';el.id='advanced-admin';alvo.append(el);
 const unidade='créditos',fator=1;
 const estados={pendente:'Aguardando sua decisão',aprovado:'Liberação aprovada',recusado:'Não aprovado'};
 el.innerHTML=`<div class="trabalho-admin-cabeca"><div><h2>Liberações por trabalho</h2><p>Decida quem pode continuar e até qual limite. O GreenIA cuida da escolha dos recursos.</p></div><span class="trabalho-icone">${ICONE.cadeado}</span></div><p class="trabalho-nota">${ICONE.escudo} Conversas e anexos continuam privados.</p>
 ${d.pedidos.map(p=>{const r=p.recomendacao;return `<article class="trabalho-autorizacao" data-pedido="${p.id}"><div class="trabalho-solicitante"><h4>${esc(p.nome||p.email)}</h4><span class="trabalho-status">${p.estado==='pendente'?ICONE.relogio:p.estado==='recusado'?ICONE.fechar:ICONE.check}${esc(estados[p.estado]||p.estado)}</span></div><h3>${esc(p.trabalho?.titulo||'Liberação para este trabalho')}</h3><p>${esc(p.trabalho?.etapas?.join('; ')||p.justificativa)}</p>
 ${p.estado==='pendente'?r?.disponivel?`<dl class="trabalho-concessao"><div><dt>Alcance recomendado</dt><dd>Este trabalho e seus ajustes</dd></div><div><dt>Validade</dt><dd>${r.validadeDias===1?'24 horas':r.validadeDias+' dias'}</dd></div><div><dt>Limite de consumo</dt><dd>${mostrarConsumo(r.limite)}</dd></div></dl><p>Estimativa da etapa principal: ${mostrarConsumo(r.estimativa)}. A pessoa decide quando continuar após a aprovação.</p><div class="linha-botoes"><button class="btn btn-verde" data-aprovar="${p.id}">Aprovar para este trabalho</button><button class="btn btn-linha" data-ajustar="${p.id}">Ajustar autorização</button><button class="btn btn-linha" data-recusar="${p.id}">Não aprovar</button></div>
 <form data-ajuste="${p.id}" hidden><label>Limite para este pedido (${unidade})<input class="entrada" name="limite" type="number" min="${usaCreditos()?1:0.01}" step="${usaCreditos()?1:0.01}" value="${Number((r.limite*fator).toFixed(2))}" required></label><label>Validade em dias<input class="entrada" name="dias" type="number" min="1" max="30" value="${r.validadeDias}" required></label><p>O alcance continua restrito a esta conversa. A proteção dos dados e os limites da empresa permanecem obrigatórios.</p><button class="btn">Ver recomendação atualizada</button></form>`:`<p role="status">${esc(r?.motivo||'A configuração precisa ser revisada antes da liberação.')}</p><div class="linha-botoes"><button class="btn btn-linha" data-revisar="${r?.codigo==='advanced_orcamento'?'orcamento':'protecao'}">${r?.codigo==='advanced_orcamento'?'Revisar limite de consumo':'Ver o que falta liberar'}</button><button class="btn btn-linha" data-recusar="${p.id}">Não aprovar</button></div>`:`<p>${esc(p.motivo||'A pessoa que solicitou pode consultar o resultado na conversa.')}</p>`}
 <div data-resposta="${p.id}" aria-live="polite"></div></article>`;}).join('')||'<p>Nenhum pedido aguardando decisão. Novas solicitações aparecerão aqui.</p>'}
 <details class="trabalho-detalhes" id="advanced-orcamento"><summary><span class="trabalho-icone">${ICONE.grafico}</span><span><strong>Limite de consumo do Advanced</strong><small>${mostrarConsumo(d.config.limiteMensalCreditos||0)} por mês</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><p>É um teto dentro dos limites gerais da empresa. Aumentá-lo não libera novas pessoas nem substitui a aprovação de proteção dos dados.</p><form id="advanced-limite-simples"><label>Limite mensal (${unidade})<input class="entrada" name="limite" type="number" min="0" step="${usaCreditos()?1:0.01}" value="${Number(d.config.limiteMensalCreditos||0)*fator}" required></label><button class="btn">Salvar limite mensal</button></form></div></details>
 <details class="trabalho-detalhes" id="advanced-detalhes"><summary><span class="trabalho-icone">${ICONE.engrenagem}</span><span><strong>Configurações técnicas e autorizações detalhadas</strong><small>Opcional · modelos e proteção dos dados</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><p>Área opcional para quem administra modelos e proteção de dados. As decisões do dia a dia podem seguir as recomendações acima.</p><button class="btn" id="advanced-carregar-tecnico">Abrir configurações técnicas</button><div id="advanced-conteudo-tecnico"></div></div></details>`;
 const recs=new Map(d.pedidos.map(p=>[p.id,p.recomendacao]));
 const executar=async(b,fn)=>{const grupo=b.closest('article,form')||el;if(grupo.getAttribute('aria-busy')==='true')return;grupo.setAttribute('aria-busy','true');grupo.querySelectorAll('button').forEach(x=>x.disabled=true);try{await fn();toast('Decisão registrada.');await painelAdvancedAdmin(alvo);el.remove();}catch(e){const out=grupo.querySelector('[data-resposta]');if(out){out.setAttribute('role','alert');out.textContent=e.message;}toast(e.message,8000);}finally{grupo.removeAttribute('aria-busy');grupo.querySelectorAll('button').forEach(x=>x.disabled=false);}};
 for(const b of el.querySelectorAll('[data-aprovar]'))b.onclick=()=>executar(b,()=>{const id=Number(b.dataset.aprovar),r=recs.get(id);return api(`/api/admin/advanced/pedidos/${id}/decidir`,{metodo:'POST',corpo:{decisao:'aprovar',seguir_recomendacao:true,versao:r.versao,limite_creditos:r.limite,dias:r.validadeDias}});});
 for(const b of el.querySelectorAll('[data-ajustar]'))b.onclick=()=>{const f=el.querySelector(`[data-ajuste="${b.dataset.ajustar}"]`);f.hidden=!f.hidden;if(!f.hidden)f.elements.limite.focus();};
 for(const f of el.querySelectorAll('[data-ajuste]'))f.onsubmit=async e=>{e.preventDefault();try{const id=Number(f.dataset.ajuste),r=await api(`/api/admin/advanced/pedidos/${id}/recomendacao`,{metodo:'POST',corpo:{limite_creditos:Number(f.elements.limite.value)/fator,dias:Number(f.elements.dias.value)}});const out=el.querySelector(`[data-resposta="${id}"]`);out.textContent=r.disponivel?`Nova recomendação: até ${mostrarConsumo(r.limite)}, somente nesta conversa, por ${r.validadeDias} dias. Clique em Aprovar para este trabalho para liberar.`:r.motivo;if(r.disponivel)recs.set(id,r);else recs.set(id,null);const b=el.querySelector(`[data-aprovar="${id}"]`);if(b)b.disabled=!r.disponivel;}catch(e){toast(e.message);}};
 for(const b of el.querySelectorAll('[data-recusar]'))b.onclick=async()=>{const id=b.dataset.recusar;const {confirmar}=await import('/admin-ui.js');if(await confirmar({titulo:'Não aprovar esta liberação?',texto:'O acesso atual da pessoa será mantido. Ela será informada e poderá pedir uma revisão.',botao:'Não aprovar'}))executar(b,()=>api(`/api/admin/advanced/pedidos/${id}/decidir`,{metodo:'POST',corpo:{decisao:'recusar',motivo:'Liberação não aprovada pelo administrador. Peça uma revisão se este trabalho continuar necessário.'}}));};
 for(const b of el.querySelectorAll('[data-revisar]'))b.onclick=()=>{const detalhe=el.querySelector(b.dataset.revisar==='orcamento'?'#advanced-orcamento':'#advanced-detalhes');detalhe.open=true;detalhe.scrollIntoView({block:'center',behavior:'smooth'});};
 el.querySelector('#advanced-limite-simples').onsubmit=e=>{e.preventDefault();const f=e.target;executar(f.querySelector('button'),()=>api('/api/admin/advanced/config',{metodo:'PUT',corpo:{limiteMensalCreditos:Number(f.elements.limite.value)/fator}}));};
 el.querySelector('#advanced-carregar-tecnico').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const {painelAdvancedTecnico}=await import('/advanced-tecnico.js');await painelAdvancedTecnico(el.querySelector('#advanced-conteudo-tecnico'));b.remove();}catch(e){toast(e.message);b.disabled=false;}};
}

const detalhePedido=p=>p.trabalho?.versao>=3?p.trabalho:trabalhoDoPedido({texto:p.texto||'',quantidadeAnexos:p.anexos?.length||0});
function cartaoPedido(p){
 const t=detalhePedido(p),liberado=p.autorizacaoValida,pendente=p.estado==='pendente'&&!liberado,recusado=p.estado==='recusado'&&!liberado,expirado=!liberado&&p.estado==='aprovado';
 const estado=liberado?'Acesso liberado':pendente?'Aguardando aprovação':recusado?'Não aprovado':expirado?p.estadoAcesso==='revogado'?'Acesso revogado':'Autorização encerrada':'Liberação necessária';
 const icone=liberado?ICONE.check:pendente?ICONE.relogio:ICONE.cadeado;
 const materiais=p.materiais||p.anexos?.map(nome=>({nome,disponivel:null}))||[],salvos=materiais.every(a=>a.disponivel===1||a.disponivel===true);
 const etapas=(t.etapas||['realizar as etapas do pedido']).map(x=>x.replace('arquivos enviados','arquivos').replace('arquivo enviado','arquivo').replace('comparar informações e conferir diferenças','conferir diferenças').replace('organizar o conteúdo e montar uma apresentação em slides','montar a apresentação'));
 const contexto='Para '+(etapas.length>1?etapas.slice(0,-1).join(', ')+' e '+etapas.at(-1):etapas[0])+', este pedido precisa de acesso ao Advanced.';
 const descricao=pendente?'Sua solicitação aguarda a aprovação do administrador.':liberado?'O acesso está liberado. Continue quando quiser; o consumo começa após seu clique.':recusado?(p.motivo||'O administrador não aprovou este acesso. Você pode pedir uma revisão.'):expirado?'A autorização anterior não está mais válida. Peça uma revisão para continuar com o pedido salvo.':'Este trabalho precisa de acesso ao Advanced. A solicitação já está preparada para o administrador.';
 return `<article class="trabalho-acompanhamento" data-acompanhar="${p.id}" aria-labelledby="pedido-titulo-${p.id}">
  <div class="trabalho-acompanhamento-topo"><span class="trabalho-status ${liberado?'trabalho-status-liberado':''}">${icone}${esc(estado)}</span>${pendente?'<span class="trabalho-envio">Solicitação enviada</span>':''}</div>
  <h2 id="pedido-titulo-${p.id}">${esc(t.titulo)}</h2><p class="trabalho-contexto">${esc(contexto)}</p>
  <p class="trabalho-orientacao">${esc(descricao)}</p>
  <div class="trabalho-preservado">${ICONE.check}<span>${materiais.length&&salvos?'Pedido e anexos salvos':materiais.length?'Pedido salvo · confira a disponibilidade dos anexos':'Pedido salvo'}</span></div>
  ${pendente?'<p class="trabalho-proximo">Próximo passo: a decisão aparecerá aqui. Você pode sair e voltar sem reenviar o pedido.</p>':''}
  <div class="trabalho-acoes">${liberado?`<button class="btn btn-verde" data-retomar="${p.id}">${esc(t.continuar)} ${ICONE.seta}</button>`:pendente?'':`<button class="btn btn-verde" data-solicitar="${p.id}">${recusado||expirado?'Pedir revisão':'Pedir liberação'} ${ICONE.seta}</button>`}</div>
  <div class="trabalho-erro" data-erro-pedido="${p.id}" role="alert" hidden></div>
  ${p.alternativa&&!liberado?`<details class="trabalho-detalhes trabalho-secundario"><summary><span class="trabalho-icone">${ICONE.lapis}</span><span><strong>O que você pode fazer enquanto aguarda</strong><small>Uma etapa útil, sem substituir o pedido completo</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><h3>${esc(t.alternativa.titulo)}</h3><p>${esc(t.alternativa.descricao)}</p><p class="trabalho-limite">${esc(t.alternativa.limites)}</p><button class="btn btn-linha" data-alternativa="${p.id}">${esc(t.acaoAlternativa)}</button></div></details>`:''}
  <details class="trabalho-detalhes trabalho-secundario"><summary><span class="trabalho-icone">${ICONE.clipe}</span><span><strong>Ver pedido e anexos</strong><small>${materiais.length?`${materiais.length} ${materiais.length===1?'arquivo preservado':'arquivos preservados'}`:'Pedido original preservado'}</small></span><span class="trabalho-chevron">${ICONE.chevron}</span></summary><div class="trabalho-detalhes-corpo"><p class="trabalho-pedido-texto">${esc(p.texto||'O pedido está guardado para retomada.')}</p>${materiais.length?`<ul class="trabalho-materiais">${materiais.map(a=>`<li>${ICONE.doc}<span>${esc(a.nome)}</span><small>${a.disponivel?'Salvo para retomada':a.disponivel===null?'Conferir na retomada':'Indisponível · reenvio necessário'}</small></li>`).join('')}</ul>`:'<p class="trabalho-nota">Nenhum arquivo anexado neste pedido.</p>'}</div></details>
 </article>`;
}
export async function painelAdvancedChat(conversaId,continuar,{ocupado=false}={}){
 if(!conversaId)return;
 const container=document.getElementById('advanced-chat');if(!container)return;
 clearTimeout(container._advancedTimer);
 clearTimeout(container._advancedLoader);
 const turno=container._advancedTurno=(container._advancedTurno||0)+1;
 let pedidos;
 if(!container._advancedAssinatura)container._advancedLoader=setTimeout(()=>{if(document.getElementById('advanced-chat')===container&&turno===container._advancedTurno&&!container.querySelector('article'))container.innerHTML='<p class="trabalho-carregando" role="status">Consultando solicitações…</p>';},200);
 try{({pedidos}=await api('/api/advanced/pedidos'));}catch(e){
  clearTimeout(container._advancedLoader);
  if(document.getElementById('advanced-chat')!==container||turno!==container._advancedTurno||e.name==='AbortError')return;
  container.querySelector('.trabalho-carregando')?.remove();
  let erro=container.querySelector('.trabalho-sincronizacao');if(!erro){erro=document.createElement('div');erro.className='trabalho-sincronizacao';container.append(erro);}
  erro.innerHTML=`<p role="alert">Não foi possível atualizar suas liberações. Seu pedido continua preservado.</p><button class="btn btn-linha">Tentar novamente</button>`;
  erro.querySelector('button').onclick=()=>painelAdvancedChat(conversaId,continuar,{ocupado});
  return;
 }
 clearTimeout(container._advancedLoader);
 if(document.getElementById('advanced-chat')!==container||turno!==container._advancedTurno)return;
 container.querySelector('.trabalho-carregando')?.remove();
 container.querySelector('.trabalho-sincronizacao')?.remove();
 const lista=pedidos.filter(p=>p.conversa_id===conversaId),assinatura=JSON.stringify({lista,ocupado});
 if(container._advancedAssinatura!==assinatura){
  const anteriores=container._advancedEstados||new Map();
  for(const p of lista)if(anteriores.get(p.id)==='pendente'&&p.estado!=='pendente')toast(p.estado==='aprovado'?'Acesso liberado. Você já pode continuar seu trabalho.':'Solicitação não aprovada. Veja a orientação na conversa.',8000);
  container._advancedEstados=new Map(lista.map(p=>[p.id,p.estado]));container._advancedAssinatura=assinatura;
  container.innerHTML=lista.map(cartaoPedido).join('');
  container.querySelectorAll('article button').forEach(b=>b.disabled=ocupado);
  const executar=async(b,acao)=>{const artigo=b.closest('article'),erro=artigo.querySelector('[data-erro-pedido]');if(ocupado)return;if(artigo.getAttribute('aria-busy')==='true')return;artigo.setAttribute('aria-busy','true');const nome=b.innerHTML;artigo.querySelectorAll('button').forEach(x=>x.disabled=true);b.textContent='Aguarde…';erro.hidden=true;
   try{await acao();}catch(e){erro.textContent=`${e.message} O pedido e os anexos continuam guardados.`;erro.hidden=false;}finally{if(artigo.isConnected){artigo.removeAttribute('aria-busy');artigo.querySelectorAll('button').forEach(x=>x.disabled=false);b.innerHTML=nome;}}
  };
  for(const b of container.querySelectorAll('[data-solicitar]'))b.onclick=()=>executar(b,async()=>{await api(`/api/advanced/pedidos/${b.dataset.solicitar}/solicitar`,{metodo:'POST'});await painelAdvancedChat(conversaId,continuar,{ocupado});const titulo=container.querySelector(`[data-acompanhar="${b.dataset.solicitar}"] h2`);if(titulo){titulo.tabIndex=-1;titulo.focus({preventScroll:true});}});
  for(const b of container.querySelectorAll('[data-alternativa]'))b.onclick=()=>executar(b,async()=>{const d=await api(`/api/advanced/pedidos/${b.dataset.alternativa}/alternativa`,{metodo:'POST'});await continuar(d.corpo);});
  for(const b of container.querySelectorAll('[data-retomar]'))b.onclick=()=>executar(b,async()=>{const d=await api(`/api/advanced/pedidos/${b.dataset.retomar}/retomar`,{metodo:'POST'});await continuar(d.corpo);});
 }
 if(lista.some(p=>p.estado==='pendente'||p.autorizacaoValida))container._advancedTimer=setTimeout(()=>{if(document.getElementById('advanced-chat')===container)painelAdvancedChat(conversaId,continuar,{ocupado}).catch(()=>{});},10000);
}
