import { api,esc,toast } from '/comum.js';
import { E,cabecalho,ligarCabecalho,pode } from '/app.js';
import { ligarVisao } from '/preferencias.js';
const data=s=>s?new Date(s).toLocaleDateString('pt-BR'):'Ainda não revisado';
const tipos={conhecimento:'Conhecimento',acessos:'Acessos',quickwin:'Quick Wins',integracao:'Integrações',aprovacao:'Aprovações',problema:'Relatos',governanca:'Governança'};
const pagina=(titulo,html)=>{document.getElementById('principal').innerHTML=`${cabecalho(titulo)}<div class="pagina"><div class="pagina-dentro acompanhamento">${html}</div></div>`;ligarCabecalho();};
export async function vistaAcompanhamento(preparacao=false) {
 const d=await api('/api/acompanhamento');
 const pronto=d.passos.filter(p=>p.pronto).length;
 const podePreparar=['company.manage','usage.read','models.manage','user.read','policy.manage','settings.manage','integrations.manage','integrations.approve'].some(pode);
 const links=`<nav class="conhecimento-vistas" aria-label="Acompanhamento"><a class="btn ${preparacao?'btn-linha':'btn-verde'}" href="#/pendencias">Pendências</a>${podePreparar?`<a class="btn ${preparacao?'btn-verde':'btn-linha'}" href="#/preparacao">Preparar o ambiente</a>`:''}</nav>`;
 if(preparacao) {
  pagina('Preparar o ambiente',`<p class="lead">Um passo de cada vez para orientar a equipe com segurança.</p>${links}<div class="acomp-resumo"><b>${pronto} de ${d.passos.length} ${pronto===1?'pronto':'prontos'}</b><p class="dica">Situação calculada pelas configurações atuais. Confira de novo quando algo mudar.</p></div><ol class="acomp-passos">${d.passos.map((p,i)=>`<li><span class="passo${p.pronto?' feito':''}" aria-hidden="true">${i+1}</span><div><h2>${esc(p.titulo)}</h2><p>${esc(p.descricao)}</p><span class="selo${p.pronto?' selo-verde':''}">${p.pronto?'Pronto':p.opcional?'Opcional, se o trabalho precisar':'Falta fazer'}</span></div><a class="btn ${p.pronto?'btn-linha':'btn-verde'}" href="${esc(p.href)}">${p.pronto?'Conferir':'Fazer agora'}</a></li>`).join('')}</ol>${!d.passos.length?'<p>Seu perfil não possui configurações de implantação. Use o guia de primeiros passos.</p>':''}<a class="btn-texto" href="#/primeiros-passos">Aprender a usar a GreenIA</a>`);return;
 }
 // Pendências: a aba só aparece quando há outra para escolher, e os filtros só quando há o que filtrar.
 const vazia=!d.pendencias.length;
 pagina('Pendências',`<p class="lead">Veja o que pede atenção dentro das suas permissões.</p>${podePreparar?links:''}<div class="filtros-biblioteca"${vazia?' hidden':''}><div class="campo"><label for="pend-busca">Encontrar pendência</label><input class="entrada" type="search" id="pend-busca" placeholder="Nome do documento ou da tarefa"></div><div class="campo"><label for="pend-tipo">Assunto</label><select class="entrada" id="pend-tipo"><option value="">Todos</option>${Object.entries(tipos).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><button class="btn btn-linha" type="button" id="pend-atualizar">Atualizar</button></div><div id="pend-visoes"${vazia?' hidden':''}></div><p class="dica" id="pend-contagem" role="status"></p><ul class="acomp-lista" id="pend-lista"></ul>${d.avisos?.length ? `<details class="bloco-extra"><summary>Registros recentes para consultar (${d.avisos.length})</summary>${d.avisos.map(a=>`<p>${esc(a.texto)} <a href="${esc(a.href)}">Consultar atividade</a></p>`).join('')}</details>` : ''}<p class="dica">Atualizado em ${new Date(d.atualizado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}. Cada pendência abre a tela onde ela se resolve.</p>`);
 const $=id=>document.getElementById(id),normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();let limite=20;
 const desenhar=()=>{const filtro=d.pendencias.filter(p=>(!$('pend-tipo').value||p.tipo===$('pend-tipo').value)&&normal(p.titulo+' '+p.texto).includes(normal($('pend-busca').value)));
 $('pend-contagem').textContent=vazia?'':`${filtro.length} ${filtro.length===1?'pendência':'pendências'} nesta consulta`;
 $('pend-lista').innerHTML=vazia?'<li><div><h2>Nenhuma pendência no momento</h2><p>Quando algo pedir sua atenção, aparece aqui.</p></div></li>':filtro.length?filtro.slice(0,limite).map(p=>`<li><div><span class="dica">${esc(tipos[p.tipo]||p.tipo)}</span><h2>${esc(p.titulo)}</h2><p>${esc(p.texto)}</p></div><a class="btn btn-linha" href="${esc(p.href)}">Ver e resolver</a></li>`).join('')+(filtro.length>limite?'<li><button class="btn btn-linha" id="pend-mais">Mostrar mais</button></li>':''):'<li><div><h2>Nenhuma pendência nesta consulta</h2><p>Confira outro assunto ou atualize depois de uma mudança.</p></div></li>';
 if($('pend-mais'))$('pend-mais').onclick=()=>{limite+=20;desenhar();};};
 $('pend-busca').oninput=$('pend-tipo').onchange=()=>{limite=20;desenhar();};$('pend-atualizar').onclick=()=>vistaAcompanhamento();
 ligarVisao('pendencias',$('pend-visoes'),()=>({busca:$('pend-busca').value,tipo:$('pend-tipo').value}),v=>{$('pend-busca').value=String(v.busca||'');$('pend-tipo').value=String(v.tipo||'');desenhar();});desenhar();
}
export async function vistaRevisaoAcessos() {
 const d=await api('/api/acompanhamento/acessos');
 const pendentes=d.pessoas.filter(p=>p.pendente).length;
 pagina('Revisar acessos',`<p class="lead">Confira quem participa das áreas e administra suas bases.</p><p class="dica">A revisão só registra a sua conferência dos vínculos locais: permissões e sessões continuam como estão.${d.plataforma?' O perfil de cada pessoa é conferido em Usuários.':''}</p><a class="btn btn-linha" href="${d.plataforma?'#/empresa/usuarios':'#/pessoas'}">Abrir cadastro e permissões</a>
 <div class="filtros-biblioteca adm-revisao-filtros"><div class="campo"><label for="acesso-busca">Buscar pessoa</label><input class="entrada" type="search" id="acesso-busca" placeholder="Nome ou email"></div><label class="adm-marca"><input type="checkbox" id="acesso-pendentes"> <span>Só com conferência recomendada (${pendentes})</span></label></div>
 <div id="acesso-lote-host"></div>
 <p class="dica" id="acesso-contagem" role="status"></p><ul class="acomp-lista" id="acesso-lista"></ul>`);
 const host=document.getElementById('acesso-lista'),$=id=>document.getElementById(id);
 const vinculo=a=>{const f=[a.admin_base&&'administra a base',a.responsavel&&'responsável'].filter(Boolean);return esc(a.nome)+(f.length?` (${f.join(', ')})`:'');};
 const desenhar=()=>{const busca=$('acesso-busca').value.toLowerCase(),so=$('acesso-pendentes').checked;const lista=d.pessoas.filter(p=>(p.nome+' '+p.email).toLowerCase().includes(busca)&&(!so||p.pendente));
 $('acesso-contagem').textContent=`${lista.length} ${lista.length===1?'pessoa':'pessoas'} nesta consulta`;
 host.innerHTML=lista.map(p=>`<li data-acesso="${p.id}">${d.podeRevisar?`<label class="adm-marca acesso-marcar"><input type="checkbox" data-lote="${p.id}"><span class="sr">Marcar ${esc(p.nome||p.email)} para registrar em lote</span></label>`:''}<div><h2>${esc(p.nome||p.email)}</h2><p>${esc(p.email)} · ${p.ativo?'Ativo':'Inativo'}${p.papel==='admin'?' · Admin da empresa':''}</p><p>Áreas: ${p.areas.map(vinculo).join(', ')||'nenhuma'}<br>Grupos: ${p.grupos.map(g=>esc(g.nome)).join(', ')||'nenhum'}</p><p class="dica">${data(p.revisao?.em)}${p.revisao?.por?' · '+esc(p.revisao.por):''}</p><span class="selo${p.pendente?' selo-ambar':''}">${p.pendente?'Conferência recomendada':'Sem revisão pendente'}</span>${d.podeRevisar?`<details><summary>Registrar revisão</summary><form data-revisar-acesso="${p.id}"><label for="acesso-nota-${p.id}">O que você conferiu?</label><textarea class="entrada" id="acesso-nota-${p.id}" required maxlength="500" placeholder="Ex.: confirmei as áreas e os administradores das bases"></textarea><label class="adm-marca"><input type="checkbox" required> Conferi os vínculos apresentados</label><p role="alert" class="msg-erro" data-erro></p><button class="btn btn-verde">Registrar conferência</button></form></details>`:''}</div></li>`).join('')||'<li>Nenhuma pessoa encontrada.</li>';lote();};
 // Marcação em lote: a mesma observação registrada para cada pessoa marcada, uma a uma.
 const marcadas=()=>[...host.querySelectorAll('[data-lote]:checked')].map(c=>c.dataset.lote);
 const lote=()=>{if(!d.podeRevisar)return;const n=marcadas().length,host2=$('acesso-lote-host');
  if(!n){host2.innerHTML='';return;}
  if(!$('acesso-lote')){host2.innerHTML=`<form class="adm-lote" id="acesso-lote"><h2 id="acesso-lote-titulo">Registrar conferência das pessoas marcadas</h2><label for="acesso-lote-nota">O que você conferiu?</label><textarea class="entrada" id="acesso-lote-nota" required maxlength="500" placeholder="Ex.: confirmei as áreas e os administradores das bases"></textarea><p role="alert" class="msg-erro" id="acesso-lote-erro"></p><button class="btn btn-verde" id="acesso-lote-enviar"></button></form>`;$('acesso-lote').onsubmit=enviarLote;}
  $('acesso-lote-enviar').textContent=`Registrar conferência de ${n} ${n===1?'pessoa':'pessoas'}`;};
 $('acesso-busca').oninput=desenhar;$('acesso-pendentes').onchange=desenhar;
 host.onchange=ev=>{if(ev.target.matches('[data-lote]'))lote();};
 async function enviarLote(ev){ev.preventDefault();const b=$('acesso-lote-enviar');b.disabled=true;$('acesso-lote-erro').textContent='';
  try{for(const id of marcadas())await api(`/api/acompanhamento/acessos/${id}/revisar`,{metodo:'POST',corpo:{observacao:$('acesso-lote-nota').value}});toast('Conferências registradas.');await vistaRevisaoAcessos();}catch(e){$('acesso-lote-erro').textContent=e.message;b.disabled=false;}}
 host.onsubmit=async ev=>{ev.preventDefault();const f=ev.target;if(!f.dataset.revisarAcesso)return;const b=f.querySelector('button');b.disabled=true;
 try{await api(`/api/acompanhamento/acessos/${f.dataset.revisarAcesso}/revisar`,{metodo:'POST',corpo:{observacao:f.querySelector('textarea').value}});toast('Conferência registrada.');await vistaRevisaoAcessos();}catch(e){f.querySelector('[data-erro]').textContent=e.message;b.disabled=false;}};desenhar();
}
