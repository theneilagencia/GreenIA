import { api, esc, toast } from '/comum.js';

export async function painelAdvancedAdmin(alvo) {
 const d=await api('/api/admin/advanced');
 const m=await api('/api/admin/modelos');
 const {pessoas}=await api('/api/admin/pessoas');
 const {grupos}=await api('/api/admin/grupos');
 const el=document.createElement('section');el.className='editor';el.id='advanced-admin';alvo.append(el);
 const modelos=m.modelos.filter(x=>x.perfil==='avancado');
 el.innerHTML=`<h2>Advanced: capacidade, acesso e orçamento</h2><p>${esc(d.criterios)}</p>
 <p>As autorizações abaixo são obrigatórias também para administradores e Quick Wins. O acesso antigo por nível não as substitui. Valores em USD.</p>
 <form id="adv-budget"><label>Teto mensal da empresa (USD)<input class="entrada" name="limite" type="number" min="0" step="0.01" required value="${Number(d.config.limiteMensalUsd||0)}"></label><button class="btn">Salvar teto mensal</button></form>
 <h3>Catálogo e rotas</h3><button class="btn" id="adv-atualizar">Consultar catálogo oficial agora</button><p>Confira o provedor e as políticas de dados antes de aprovar. A inclusão no catálogo não libera o uso. Use o Catálogo técnico para cadastrar novos modelos e atualizar preços e capacidades.</p>
 ${modelos.map(x=>`<form data-adv-model="${esc(x.id)}"><h4>${esc(x.nome)}</h4><p>${esc(d.curadoria.find(c=>c.id===x.id)?.justificativa||'Exige avaliação individual de capacidade pelo administrador.')} Rotas no catálogo: ${esc(x.atributos?.catalogo?.rotas?.map(r=>r.id).join(', ')||'atualização necessária')}. Contexto: ${Number(x.contexto||0).toLocaleString('pt-BR')}; saída confirmada: ${Number(x.atributos?.catalogo?.maxSaida||0).toLocaleString('pt-BR')}. ${x.noCatalogo?'Disponível no catálogo':'Indisponível no catálogo'}.</p><label>Rotas aprovadas (slugs OpenRouter, separados por vírgula)<input class="entrada" name="provedores" required value="${esc(x.atributos?.advanced?.provedores?.join(', ')||'')}"></label><label>Justificativa de capacidade e segurança<input class="entrada" name="justificativa" required value="${esc(x.atributos?.advanced?.justificativa||'')}"></label><label><input type="checkbox" name="aprovado" ${x.atributos?.advanced?.aprovado?'checked':''}> Rota revisada e aprovada</label><button class="btn">Salvar revisão</button></form>`).join('')}
 <h3>Nova autorização / parâmetros para aprovação</h3><form id="adv-grant">
 <label>Destinatário<select class="entrada" name="destinatario">${(pessoas||[]).map(p=>`<option value="pessoa:${p.id}">${esc(p.nome||p.email)}</option>`).join('')}${(grupos||[]).map(g=>`<option value="grupo:${g.id}">Grupo: ${esc(g.nome)}</option>`).join('')}<option value="papel:usuario">Perfil: usuários</option><option value="papel:admin">Perfil: administradores</option></select></label>
 <label>Modelos autorizados<select class="entrada" name="modelos" multiple required>${modelos.map(x=>`<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></label>
 <label>Provedores autorizados<input class="entrada" name="provedores" required placeholder="Slugs revisados, separados por vírgula"></label>
 <label><input name="pesquisa_web" type="checkbox"> Autorizar pesquisa Exa quando a política geral permitir (inclui reserva de contexto completo e taxa de pesquisa)</label>
 <label>Orçamento total (USD)<input class="entrada" name="limite_usd" type="number" min="0.01" step="0.01" required></label>
 <label>Teto por chamada (USD)<input class="entrada" name="limite_chamada_usd" type="number" min="0.01" step="0.01" required></label>
 <label>Máximo de tokens de saída por chamada<input class="entrada" name="saida_tokens" type="number" min="1024" max="128000" value="32768" required></label>
 <label>Validade até<input class="entrada" name="expira_em" type="datetime-local" required></label>
 <label>Conversa específica (vazio = todas)<input class="entrada" name="conversa_id" type="number" min="1"></label><button class="btn btn-verde">Conceder autorização</button></form>
 <h3>Solicitações</h3><p>Conteúdo privado e anexos não são exibidos ao administrador. A aprovação usa os modelos, provedores, orçamento e validade preenchidos acima e fica restrita à conversa solicitada.</p>
 ${d.pedidos.map(p=>`<article><b>${esc(p.nome||p.email)}</b> · ${esc(p.estado)}<p>${esc(p.justificativa)}</p><p>Estimativa: ${p.estimativa_usd==null?'indisponível':`USD ${Number(p.estimativa_usd).toFixed(4)}`} (não inclui todas as etapas auxiliares).</p>${p.estado==='pendente'?`<label>Motivo da decisão<input class="entrada" data-motivo="${p.id}" maxlength="500"></label><button class="btn" data-decidir="${p.id}" data-decisao="aprovar">Aprovar com os parâmetros acima</button> <button class="btn" data-decidir="${p.id}" data-decisao="recusar">Recusar</button>`:''}</article>`).join('')||'<p>Nenhuma solicitação.</p>'}
 <h3>Autorizações</h3>${d.autorizacoes.map(a=>`<p>#${a.id} · ${a.revogada?'Revogada':'Válida até '+esc(a.expira_em)} · USD ${a.limite_usd} ${!a.revogada?`<button class="btn" data-revogar="${a.id}">Revogar</button>`:''}</p>`).join('')}
 <h3>Consumo e reservas</h3><p>Reservas sem custo confirmado continuam comprometendo o orçamento até a conciliação.</p>${d.consumo.slice(0,20).map(c=>`<p>#${c.id} · ${esc(c.modelo)} · ${esc(c.provedor)} · ${c.custo==null?'reservado':'realizado'} USD ${Number(c.custo??c.reservado).toFixed(4)}</p>`).join('')}`;
 const separar=v=>v.split(',').map(s=>s.trim()).filter(Boolean);
 const executar=async(fn)=>{try{await fn();toast('Alteração registrada.');el.remove();await painelAdvancedAdmin(alvo);}catch(e){toast(e.message,8000);}};
 el.querySelector('#adv-atualizar').onclick=()=>executar(()=>api('/api/admin/modelos/atualizar',{metodo:'POST'}));
 el.querySelector('#adv-budget').onsubmit=e=>{e.preventDefault();executar(()=>api('/api/admin/advanced/config',{metodo:'PUT',corpo:{limiteMensalUsd:Number(e.target.elements.limite.value)}}));};
 for(const f of el.querySelectorAll('[data-adv-model]'))f.onsubmit=e=>{e.preventDefault();executar(()=>api(`/api/admin/advanced/modelos/${encodeURIComponent(f.dataset.advModel)}`,{metodo:'PUT',corpo:{aprovado:f.elements.aprovado.checked,provedores:separar(f.elements.provedores.value),justificativa:f.elements.justificativa.value}}));};
 const grant=()=>{const f=el.querySelector('#adv-grant');if(!f.reportValidity())throw new Error('Preencha os parâmetros da autorização acima.');const v=Object.fromEntries(new FormData(f));const [tipo,id]=v.destinatario.split(':');return {...v,pesquisa_web:f.elements.pesquisa_web.checked,pessoa_id:tipo==='pessoa'?Number(id):null,grupo_id:tipo==='grupo'?Number(id):null,papel:tipo==='papel'?id:null,conversa_id:v.conversa_id?Number(v.conversa_id):null,modelos:[...f.elements.modelos.selectedOptions].map(o=>o.value),provedores:separar(v.provedores),expira_em:new Date(v.expira_em).toISOString()};};
 el.querySelector('#adv-grant').onsubmit=e=>{e.preventDefault();executar(()=>api('/api/admin/advanced/autorizacoes',{metodo:'POST',corpo:grant()}));};
 for(const b of el.querySelectorAll('[data-decidir]'))b.onclick=()=>executar(()=>api(`/api/admin/advanced/pedidos/${b.dataset.decidir}/decidir`,{metodo:'POST',corpo:{...(b.dataset.decisao==='aprovar'?grant():{}),decisao:b.dataset.decisao,motivo:el.querySelector(`[data-motivo="${b.dataset.decidir}"]`).value}}));
 for(const b of el.querySelectorAll('[data-revogar]'))b.onclick=()=>executar(()=>api(`/api/admin/advanced/autorizacoes/${b.dataset.revogar}/revogar`,{metodo:'POST'}));
}

export async function painelAdvancedChat(conversaId, retomar) {
 if(!conversaId)return;
 const container=document.getElementById('advanced-chat');if(!container)return;
 const {pedidos}=await api('/api/advanced/pedidos');
 if(document.getElementById('advanced-chat')!==container)return;
 const lista=pedidos.filter(p=>p.conversa_id===conversaId);
 container.innerHTML=lista.map(p=>`<article class="editor"><b>Advanced · ${esc(p.estado)}</b><p>${esc(p.justificativa)}</p>${p.motivo?`<p>${esc(p.motivo)}</p>`:''}${p.alternativa&&['preparado','pendente'].includes(p.estado)?`<p>Alternativa: somente uma síntese preliminar de até 600 palavras, sem arquivos finais, reformulação visual ou análise aprofundada. Esta alternativa não cumpre a entrega integral.</p><button class="btn" data-alternativa="${p.id}">Continuar com o nível disponível</button>`:''}${p.estado==='preparado'?`<button class="btn" data-solicitar="${p.id}">Solicitar acesso ao Advanced</button>`:p.estado==='aprovado'?`<p>A aprovação não executa o pedido automaticamente. O acesso, o modelo e o orçamento serão conferidos novamente.</p><button class="btn btn-verde" data-retomar="${p.id}">Retomar com Advanced</button>`:p.estado==='pendente'?'<p>Solicitação enviada à administração. Aguardando decisão.</p>':'<p>Converse com o administrador para revisar a autorização.</p>'}</article>`).join('');
 for(const b of container.querySelectorAll('[data-solicitar]'))b.onclick=async()=>{try{await api(`/api/advanced/pedidos/${b.dataset.solicitar}/solicitar`,{metodo:'POST'});await painelAdvancedChat(conversaId,retomar);}catch(e){toast(e.message);}};
 for(const b of container.querySelectorAll('[data-alternativa]'))b.onclick=async()=>{try{const d=await api(`/api/advanced/pedidos/${b.dataset.alternativa}/alternativa`,{metodo:'POST'});await retomar(d.corpo);}catch(e){toast(e.message);}};
 for(const b of container.querySelectorAll('[data-retomar]'))b.onclick=async()=>{b.disabled=true;try{const d=await api(`/api/advanced/pedidos/${b.dataset.retomar}/retomar`,{metodo:'POST'});await retomar(d.corpo);}catch(e){toast(e.message);b.disabled=false;}};
 if(lista.some(p=>p.estado==='pendente'))setTimeout(()=>{if(document.getElementById('advanced-chat')===container)painelAdvancedChat(conversaId,retomar).catch(()=>{});},10000);
}
