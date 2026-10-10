import { api, esc, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, irPara, recarregarLateral } from '/app.js';
const $=id=>document.getElementById(id);
const base=id=>`/api/quick-wins/${id}/painel`;
const data=s=>s?new Date(s).toLocaleString('pt-BR'):'Ainda sem registros';
function tela(titulo,html){$('principal').innerHTML=`${cabecalho(titulo)}<div class="pagina"><div class="pg painel-negocio">${html}</div></div>`;ligarCabecalho();}
const voltar=id=>`<a class="link-sutil" href="#/qw/${id}">Voltar ao Quick Win</a>`;
const entrega=`<details class="painel-escopo"><summary>O que este acompanhamento inclui</summary><p><b>Resultado da execução:</b> dados sugeridos para você conferir.</p><p><b>Histórico:</b> somente registros que você confirmou, com indicadores prontos.</p><p><b>Integração contínua:</b> atualização por sistemas externos e painéis personalizados dependem de contratação adicional, com escopo e manutenção definidos.</p></details>`;
export async function escolherProcesso(id=null) {
 const [{modelos,permissoes},q]=await Promise.all([api('/api/paineis-modelos'),id?api(`/api/quick-wins/${id}`):null]);
 const areas=permissoes.areas||[];
 tela('Escolher um processo',`${id?voltar(id):'<a class="link-sutil" href="#/quick-wins">Voltar aos Quick Wins</a>'}<h2>${id?'Preparar o acompanhamento':'Comece com um processo pronto'}</h2><p>Os campos e indicadores já estão definidos. Escolha o trabalho que sua equipe precisa acompanhar.</p>${q?`<p>Quick Win: <b>${esc(q.nome)}</b>. As instruções e a versão publicada continuam sob seu controle.</p>`:''}
 <form id="processo-form"><fieldset><legend>Qual trabalho você quer acompanhar?</legend>${modelos.map((m,i)=>`<label class="painel-escolha"><input type="radio" name="modelo" value="${m.id}" ${i===0?'checked':''}><span><b>${esc(m.nome)}</b><small>${esc(m.descricao)}</small><small>Campos: ${m.campos.map(c=>esc(c.nome)).join(', ')}</small></span></label>`).join('')}</fieldset>
 ${!id?`<label class="legenda" for="processo-area">Quem poderá usar o Quick Win?</label><select class="entrada" id="processo-area" required>${permissoes.todaEmpresa?'<option value="empresa">Toda a empresa</option>':''}${areas.map(a=>`<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select><p class="dica">Ele será criado em preparo. Você vai testar antes de liberar para a equipe. Cada registro começa visível só para quem o criou.</p>`:'<p class="dica">A preparação não copia conversas para o histórico. Cada pessoa confere e confirma seus próprios registros.</p>'}
 <p id="processo-erro" role="alert"></p><button class="btn btn-verde" id="processo-criar" type="submit">${id?'Preparar acompanhamento':'Criar e testar este processo'}</button></form>${entrega}`);
 $('processo-form').onsubmit=async ev=>{
  ev.preventDefault();const b=$('processo-criar');b.disabled=true;
  try{
   const modelo=$('processo-form').elements.modelo.value;
   if(id){await api(base(id),{metodo:'POST',corpo:{modelo}});irPara(`#/qw/${id}/acompanhamento`);}
   else{
    const m=modelos.find(m=>m.id===modelo),area=$('processo-area').value;
    const q=await api('/api/quick-wins',{metodo:'POST',corpo:{assistente:m.ensino,nome:m.ensino.nome,painel_modelo:modelo,toda_empresa:area==='empresa',areas:area==='empresa'?[]:[Number(area)]}});
    await recarregarLateral();irPara(`#/qw/${q.id}/teste`);
   }
  }catch(e){if(b.isConnected){$('processo-erro').textContent=`Não foi possível preparar. Sua escolha foi mantida. ${e.message}`;b.disabled=false;}}
 };
}
export async function painelNegocio(id,pagina=Number(new URLSearchParams(location.hash.split('?')[1]||'').get('pagina'))||1) {
 const d=await api(`${base(id)}?pagina=${pagina}`);
 if(!d.configurado){tela('Resultados',`${voltar(id)}<h2>${esc(d.nome)}</h2><p>Este Quick Win ainda não tem um processo de acompanhamento preparado.</p>${d.podePreparar?`<a class="btn btn-verde" href="#/qw/${id}/acompanhamento/preparar">Escolher um processo</a>`:'<p>Peça a quem prepara este Quick Win para escolher um processo de acompanhamento.</p>'}${entrega}`);return;}
 const m=d.modelo;
 const rows=d.registros.flatMap(r=>r.dados.map(l=>({r,l})));
 tela('Resultados',`${voltar(id)}<div class="painel-titulo"><div><h2>${esc(d.nome)}</h2><p>${esc(m.nome)}</p></div><a class="btn btn-verde" href="#/qw/${id}/usar">Executar em outro caso</a></div>
 <p class="dica">Você vê seus registros e os que foram compartilhados com a equipe autorizada. Conversas de outras pessoas continuam privadas.</p>
 <section aria-label="Indicadores do acompanhamento" class="indicadores"><div class="indicador"><span>${esc(m.unidade)} no histórico</span><b>${d.total}</b></div>${Object.entries(m.estados).map(([k,v])=>`<div class="indicador"><span>${esc(v)}</span><b>${d.situacoes[k]}</b></div>`).join('')}</section>
 <p class="dica">Última alteração: ${esc(data(d.atualizado_em))}. Os números são calculados sobre registros confirmados pelas pessoas. Não certificam autenticidade, compliance ou conclusão de ações externas.</p>
 ${!d.total?`<div class="faixa-aviso info"><h3>Seu histórico começa com o primeiro registro</h3><p>Execute o Quick Win. No resultado, escolha “Conferir dados para o acompanhamento” e confirme os itens.</p><a class="btn btn-linha" href="#/qw/${id}/usar">Executar agora</a></div>`:''}
 ${d.meses.length?`<section><h3>Registros por mês</h3><p class="dica">O mês é o da primeira confirmação, no horário de Brasília. Correções atualizam a situação do registro no mesmo mês. Isto não é uma fotografia histórica das situações.</p><div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Mês</th>${Object.values(m.estados).map(s=>`<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${d.meses.map(x=>`<tr><td data-r="Mês">${esc(x.mes)}</td>${Object.entries(m.estados).map(([k,v])=>`<td data-r="${esc(v)}">${x.situacoes[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`:''}
 ${rows.length?`<section><h3>Registros confirmados</h3><label class="legenda" for="painel-busca">Encontrar um registro nesta página</label><input class="entrada" type="search" id="painel-busca" placeholder="Busque por nome ou documento"><p id="painel-contagem" class="dica" role="status">${rows.length} itens exibidos${d.paginas>1?` · página ${d.pagina} de ${d.paginas}`:''}</p><div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${m.campos.map(c=>`<th>${esc(c.nome)}</th>`).join('')}<th>Registro</th></tr></thead><tbody id="painel-linhas">${rows.map(({r,l})=>`<tr>${m.campos.map(c=>`<td data-r="${esc(c.nome)}">${esc(c.tipo==='estado'?m.estados[l[c.id]]:l[c.id]||'Não informado')}</td>`).join('')}<td data-r="Registro"><span>${r.proprio?'Seu registro':'Compartilhado pela equipe'} · ${esc(data(r.confirmado_em))}</span>${r.proprio?`<a class="link-sutil" href="#/qw/${id}/acompanhamento/registro/${r.id}">Conferir ou corrigir</a><a class="link-sutil" href="#/c/${r.conversa}">Abrir execução de origem</a>`:''}</td></tr>`).join('')}</tbody></table></div></section>`:''}
 ${d.paginas>1?`<nav class="linha-botoes" aria-label="Páginas dos registros">${d.pagina>1?`<a class="btn btn-linha" href="#/qw/${id}/acompanhamento?pagina=${d.pagina-1}">Página anterior</a>`:''}<span>Página ${d.pagina} de ${d.paginas}</span>${d.pagina<d.paginas?`<a class="btn btn-linha" href="#/qw/${id}/acompanhamento?pagina=${d.pagina+1}">Próxima página</a>`:''}</nav>`:''}<details><summary>Como os dados ficam guardados</summary><p>O registro acompanha a retenção da conversa de origem: até ${d.retencaoDias} dias sem uso. Apagar a conversa ou encerrar sua retenção também remove os registros e suas correções deste acompanhamento. Os indicadores serão recalculados.</p><p>Cada execução é contada uma vez. Se você executar o mesmo caso em outra conversa, ele pode ser contado novamente. Corrija o registro existente para atualizar uma situação.</p></details>${entrega}`);
 $('painel-busca')?.addEventListener('input',ev=>{const t=ev.target.value.toLocaleLowerCase('pt-BR');let n=0;document.querySelectorAll('#painel-linhas tr').forEach(r=>{r.hidden=!r.textContent.toLocaleLowerCase('pt-BR').includes(t);if(!r.hidden)n++;});$('painel-contagem').textContent=`${n} itens encontrados`;});
}
const MOTIVOS={sigilo:'A proteção de sigilo impede uma chamada adicional de IA. Confira e preencha os campos abaixo a partir do resultado.',governanca:'As regras da empresa não permitem preparar sugestões agora. Confira os campos a partir do resultado.',falha_preparacao:'Não foi possível preparar os dados automaticamente. Você pode conferir e preencher abaixo.',resultado_extenso:'Este resultado é extenso. Registre até 30 itens de cada execução.',sem_dados:'Não foi possível identificar os itens com segurança. Preencha os campos a partir do resultado.'};
export async function conferirRegistro(id,{registro,mensagem,conversa}={}) {
 let d;
 if(registro)d=await api(`${base(id)}/registros/${registro}`);
 else {
  tela('Conferir dados',`${voltar(id)}<p role="status">Organizando o resultado nos campos deste processo. Nada será incluído no histórico sem sua confirmação.</p>`);
  d=await api(`${base(id)}/preparar`,{metodo:'POST',corpo:{mensagem}});
 }
 const origem=await api(`/api/conversas/${d.conversa}`);
 const resposta=origem.mensagens.find(m=>m.id===d.mensagem);
 const podeGravar=!E.permissoes||E.permissoes.includes('chat.use');
 const m=d.modelo;let dados=structuredClone(d.dados);const editando=d.estado==='confirmado';
 const campo=(c,l,i)=>`<label class="campo"><span>${esc(c.nome)}${c.obrigatorio?' *':''}</span>${c.tipo==='estado'?`<select class="entrada" aria-label="${esc(c.nome)}${c.obrigatorio?' *':''}" data-campo="${c.id}" data-item="${i}">${Object.entries(m.estados).map(([k,v])=>`<option value="${k}" ${l[c.id]===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input class="entrada" ${c.tipo==='data'?'type="date"':'type="text"'} data-campo="${c.id}" data-item="${i}" value="${esc(l[c.id]||'')}" ${c.obrigatorio?'required':''} maxlength="${c.max||40}">`}</label>`;
 tela('Conferir dados',`<a class="link-sutil" href="#/qw/${id}/acompanhamento">Voltar ao acompanhamento</a><h2>${editando?'Corrigir um registro':'Confira antes de registrar'}</h2><p>${esc(m.nome)}. Os campos e indicadores já estão preparados.</p>
 ${d.teste?'<p class="faixa-aviso atencao" role="status">Este é um teste. Você pode conferir o painel do resultado, mas ele não entra no histórico.</p>':''}
 ${d.estado==='cancelado'?'<p class="faixa-aviso atencao">Este registro foi retirado do acompanhamento.</p>':''}
 ${d.motivo&&!editando?`<p class="faixa-aviso info">${esc(MOTIVOS[d.motivo]||MOTIVOS.sem_dados)}</p>`:''}
 ${d.qualidade==='parcial'?'<p class="faixa-aviso atencao">A conferência desta execução foi parcial. Confira as limitações na conversa de origem. Registrar os dados não transforma esse resultado em aprovado.</p>':''}
 <details><summary>Consultar o resultado de origem</summary><pre class="painel-origem">${esc(resposta?.texto||'Resultado indisponível.')}</pre><a class="link-sutil" href="#/c/${d.conversa}">Abrir conversa e conferência</a></details>
 ${d.revisoes?.length?`<details><summary>Ver confirmações e correções anteriores</summary><ul>${d.revisoes.map(r=>`<li>${esc(data(r.em))} · versão ${r.versao}: ${esc(r.motivo)}</li>`).join('')}</ul></details>`:''}${!podeGravar?'<p class="faixa-aviso info">Seu acesso é só de consulta. Você pode conferir os dados; para corrigir, fale com o responsável pelo seu acesso.</p>':''}<form id="registro-form"><div id="registro-itens"></div><button class="btn btn-linha" type="button" id="registro-adicionar">Adicionar um item</button>
 <fieldset class="painel-escopo"><legend>Quem poderá ver os dados confirmados?</legend><label><input type="radio" name="escopo" value="pessoal" ${d.escopo==='pessoal'?'checked':''}> Só eu</label>${d.podeCompartilhar?`<label><input type="radio" name="escopo" value="equipe" ${d.escopo==='equipe'?'checked':''}> Pessoas que têm acesso a este Quick Win</label>`:'<p class="dica">Os dados desta execução têm proteção de sigilo. O registro fica só para você.</p>'}<p class="dica">Compartilhar inclui estes campos no acompanhamento da equipe. O texto da conversa não é compartilhado.</p></fieldset>
 ${editando?'<label class="campo"><span>Por que está corrigindo?</span><input class="entrada" id="registro-motivo" maxlength="300" required></label>':''}
 ${d.qualidade==='parcial'?'<label class="painel-confirmacao"><input type="checkbox" id="registro-parcial" required> Conferi as limitações do resultado parcial e os dados que quero registrar</label>':''}
 <label class="painel-confirmacao"><input type="checkbox" id="registro-conferido" required> Conferi os dados. Eles podem ser usados nos indicadores deste acompanhamento.</label>
 <p class="dica">O registro será removido se a conversa de origem for apagada ou atingir a retenção da empresa.</p><p id="registro-erro" role="alert"></p>
 ${podeGravar&&!d.teste&&d.estado!=='cancelado'?`<button class="btn btn-verde" id="registro-salvar" type="submit">${editando?'Salvar correção':'Confirmar e incluir no histórico'}</button>`:`<a class="btn btn-verde" href="#/qw/${id}/${d.teste?'publicar':'acompanhamento'}">${d.teste?'Voltar à preparação do Quick Win':'Voltar ao acompanhamento'}</a>`}
 <a class="btn btn-texto" href="#/c/${d.conversa}">Voltar à conversa</a></form>
 ${podeGravar&&editando?'<details class="painel-escopo"><summary>Retirar este resultado do acompanhamento</summary><p>Os itens deixam de contar nos indicadores. A execução original permanece na conversa.</p><label class="campo"><span>Por que deseja retirar?</span><input class="entrada" id="registro-retirar-motivo" maxlength="300"></label><button type="button" class="btn btn-linha" id="registro-retirar">Confirmar retirada do histórico</button></details>':''}`);
 function desenhar(){
  $('registro-itens').innerHTML=dados.map((l,i)=>`<fieldset class="painel-item"><legend>Item ${i+1}</legend><div class="painel-campos">${m.campos.map(c=>campo(c,l,i)).join('')}</div>${!editando&&d.evidencias[i]?`<details><summary>Ver trechos usados para sugerir os dados</summary>${Object.entries(d.evidencias[i]).map(([k,v])=>`<p><b>${esc(m.campos.find(c=>c.id===k)?.nome||k)}:</b> ${esc(v)}</p>`).join('')}</details>`:''}${dados.length>1?`<button class="btn btn-texto" type="button" data-remover="${i}">Remover este item</button>`:''}</fieldset>`).join('');
  $('registro-itens').querySelectorAll('[data-campo]').forEach(el=>el.oninput=()=>{dados[Number(el.dataset.item)][el.dataset.campo]=el.value;});
  $('registro-itens').querySelectorAll('[data-remover]').forEach(b=>b.onclick=()=>{dados.splice(Number(b.dataset.remover),1);desenhar();});
  $('registro-adicionar').disabled=dados.length>=30;
 }
 desenhar();$('registro-adicionar').onclick=()=>{dados.push(Object.fromEntries(m.campos.map(c=>[c.id,c.tipo==='estado'?'nao_informado':''])));desenhar();$('registro-itens').lastElementChild.querySelector('input,select')?.focus();};
 $('registro-form').onsubmit=async ev=>{
  ev.preventDefault();const b=$('registro-salvar');if(!b)return;b.disabled=true;
  try{await api(`${base(id)}/registros/${d.id}`,{metodo:'POST',corpo:{dados,versao:d.versao,escopo:$('registro-form').elements.escopo.value,confirmado:$('registro-conferido').checked,cienteParcial:$('registro-parcial')?.checked||false,motivo:$('registro-motivo')?.value||''}});toast(editando?'Correção salva. Indicadores atualizados.':'Registro incluído no acompanhamento.');irPara(`#/qw/${id}/acompanhamento`);}
  catch(e){if(b.isConnected){$('registro-erro').textContent=`Os dados foram mantidos nesta tela. ${e.message}`;b.disabled=false;$('registro-erro').scrollIntoView({block:'nearest'});}}
 };
 $('registro-retirar')?.addEventListener('click',async ev=>{const b=ev.currentTarget;b.disabled=true;try{await api(`${base(id)}/registros/${d.id}/retirar`,{metodo:'POST',corpo:{versao:d.versao,motivo:$('registro-retirar-motivo').value}});toast('Resultado retirado. Indicadores atualizados.');irPara(`#/qw/${id}/acompanhamento`);}catch(e){if(b.isConnected){$('registro-erro').textContent=e.message;b.disabled=false;}}});
}
