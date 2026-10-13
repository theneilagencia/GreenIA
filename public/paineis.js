import { api, esc, toast } from '/comum.js';
import { E, cabecalho, ligarCabecalho, irPara, recarregarLateral } from '/app.js';
import { campoData, brParaIso } from '/data-br.js';
const $=id=>document.getElementById(id);
const base=id=>`/api/quick-wins/${id}/painel`;
const data=s=>s?new Date(s).toLocaleString('pt-BR'):'Ainda sem registros';
function tela(titulo,html){$('principal').innerHTML=`${cabecalho(titulo)}<div class="pagina"><div class="pg larga painel-negocio">${html}</div></div>`;ligarCabecalho();}
// Cabeçalho igual ao das outras telas de Quick Win (trilha, título, descrição e ações à direita), com o título como
// h2 de verdade: os resultados do processo são uma seção do Quick Win.
const cabeca=({trilha=[],titulo,descricao='',lado=''})=>`<div class="pg-cabeca">${trilha.length?`<nav class="pg-trilha" aria-label="Você está em">${trilha.map(([t,h])=>h?`<a href="${h}">${esc(t)}</a>`:`<span aria-current="page">${esc(t)}</span>`).join('<span class="sep" aria-hidden="true">/</span>')}</nav>`:''}<div class="pg-titulo"><div class="pg-titulo-texto"><h2>${esc(titulo)}</h2>${descricao?`<p class="pg-desc">${descricao}</p>`:''}</div>${lado?`<div class="pg-acoes">${lado}</div>`:''}</div></div>`;
const trilhaQw=(id,nome,...resto)=>[['Quick Wins','#/quick-wins'],[nome||'Quick Win',`#/qw/${id}`],...resto];
// As explicações (o que os resultados incluem, como os dados ficam guardados) ficam na Ajuda da tela.
const saibaMais='<button type="button" class="link-sutil qw-saiba-mais" data-abrir-ajuda>Saiba mais</button>';
export async function escolherProcesso(id=null) {
 const [{modelos,permissoes},q]=await Promise.all([api('/api/paineis-modelos'),id?api(`/api/quick-wins/${id}`):null]);
 const areas=permissoes.areas||[];
 tela('Escolher um processo',`${cabeca({trilha:id?trilhaQw(id,q?.nome,['Preparar resultados']):[['Quick Wins','#/quick-wins'],['Processo pronto']],titulo:id?'Preparar os resultados do processo':'Comece com um processo pronto',descricao:`Os campos e indicadores já estão definidos. Escolha o trabalho que sua equipe precisa acompanhar. ${saibaMais}`})}
 <form id="processo-form"><fieldset class="painel-modelos"><legend>Qual trabalho você quer acompanhar?</legend><div class="grade-cartoes titulos-2">${modelos.map((m,i)=>`<label class="painel-escolha cartao clicavel sem-seta"><input type="radio" name="modelo" value="${m.id}" ${i===0?'checked':''}><span class="painel-escolha-texto"><b class="cartao-titulo">${esc(m.nome)}</b><span class="cartao-texto">${esc(m.descricao)}</span><span class="cartao-meta">Campos: ${m.campos.map(c=>esc(c.nome)).join(', ')}</span></span></label>`).join('')}</div></fieldset>
 ${!id?`<label class="legenda" for="processo-area">Quem poderá usar o Quick Win?</label><select class="entrada" id="processo-area" required>${permissoes.todaEmpresa?'<option value="empresa">Toda a empresa</option>':''}${areas.map(a=>`<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select>`:''}
 <p id="processo-erro" role="alert"></p><button class="btn btn-verde" id="processo-criar" type="submit">${id?'Preparar resultados do processo':'Criar e testar este processo'}</button></form>`);
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
 // Sem processo preparado não há resultados do processo. As medições de antes e depois são outra coisa: ficam em
 // "Uso e decisão", na página do Quick Win, e a tela diz onde estão.
 if(!d.configurado){tela('Resultados do processo',`${cabeca({trilha:trilhaQw(id,d.nome,['Resultados do processo']),titulo:d.nome,descricao:`Os resultados do processo ainda não foram preparados para este Quick Win. ${saibaMais}`})}${d.podePreparar?`<a class="btn btn-verde" href="#/qw/${id}/acompanhamento/preparar">Escolher um processo</a>`:'<p>Peça a quem prepara este Quick Win para escolher um processo.</p>'}`);return;}
 const m=d.modelo;
 const rows=d.registros.flatMap(r=>r.dados.map(l=>({r,l})));
 tela('Resultados do processo',`${cabeca({trilha:trilhaQw(id,d.nome,['Resultados do processo']),titulo:d.nome,descricao:`Resultados do processo: ${esc(m.nome)}. ${saibaMais}`,lado:`<a class="btn btn-verde" href="#/qw/${id}/usar">Executar em outro caso</a>`})}
 <section aria-label="Indicadores dos resultados do processo" class="indicadores"><div class="indicador"><span>${esc(m.unidade.charAt(0).toLocaleUpperCase('pt-BR')+m.unidade.slice(1))} no histórico</span><b>${d.total}</b></div>${Object.entries(m.estados).map(([k,v])=>`<div class="indicador"><span>${esc(v)}</span><b>${d.situacoes[k]}</b></div>`).join('')}</section>
 <p class="dica">Última alteração: ${esc(data(d.atualizado_em))}.</p>
 ${!d.total?`<div class="faixa-aviso info"><h3>Seu histórico começa com o primeiro registro</h3><p>Execute o Quick Win. No resultado, escolha “Conferir dados para os resultados” e confirme os itens. Eles entram nos resultados do processo.</p><a class="btn btn-linha" href="#/qw/${id}/usar">Executar agora</a></div>`:''}
 ${d.meses.length?`<section><h3>Registros por mês</h3><div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr><th>Mês</th>${Object.values(m.estados).map(s=>`<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${d.meses.map(x=>`<tr><td data-r="Mês">${esc(x.mes)}</td>${Object.entries(m.estados).map(([k,v])=>`<td data-r="${esc(v)}">${x.situacoes[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`:''}
 ${rows.length?`<section><h3>Registros confirmados</h3><label class="legenda" for="painel-busca">Encontrar um registro nesta página</label><input class="entrada" type="search" id="painel-busca" placeholder="Busque por nome ou documento"><p id="painel-contagem" class="dica" role="status">${rows.length} itens exibidos${d.paginas>1?` · página ${d.pagina} de ${d.paginas}`:''}</p><div class="tabela-rolagem"><table class="tabela tabela-empilha"><thead><tr>${m.campos.map(c=>`<th>${esc(c.nome)}</th>`).join('')}<th>Registro</th></tr></thead><tbody id="painel-linhas">${rows.map(({r,l})=>`<tr>${m.campos.map(c=>`<td data-r="${esc(c.nome)}">${esc(c.tipo==='estado'?m.estados[l[c.id]]:l[c.id]||'Não informado')}</td>`).join('')}<td data-r="Registro"><span>${r.proprio?'Seu registro':'Compartilhado pela equipe'} · ${esc(data(r.confirmado_em))}</span>${r.proprio?`<a class="link-sutil" href="#/qw/${id}/acompanhamento/registro/${r.id}">Conferir ou corrigir</a><a class="link-sutil" href="#/c/${r.conversa}">Abrir execução de origem</a>`:''}</td></tr>`).join('')}</tbody></table></div></section>`:''}
 ${d.paginas>1?`<nav class="linha-botoes" aria-label="Páginas dos registros">${d.pagina>1?`<a class="btn btn-linha" href="#/qw/${id}/acompanhamento?pagina=${d.pagina-1}">Página anterior</a>`:''}<span>Página ${d.pagina} de ${d.paginas}</span>${d.pagina<d.paginas?`<a class="btn btn-linha" href="#/qw/${id}/acompanhamento?pagina=${d.pagina+1}">Próxima página</a>`:''}</nav>`:''}`);
 $('painel-busca')?.addEventListener('input',ev=>{const t=ev.target.value.toLocaleLowerCase('pt-BR');let n=0;document.querySelectorAll('#painel-linhas tr').forEach(r=>{r.hidden=!r.textContent.toLocaleLowerCase('pt-BR').includes(t);if(!r.hidden)n++;});$('painel-contagem').textContent=`${n} itens encontrados`;});
}
const MOTIVOS={sigilo:'A proteção de sigilo impede uma chamada adicional de IA. Confira e preencha os campos abaixo a partir do resultado.',governanca:'As regras da empresa não permitem preparar sugestões agora. Confira os campos a partir do resultado.',falha_preparacao:'Não foi possível preparar os dados automaticamente. Você pode conferir e preencher abaixo.',resultado_extenso:'Este resultado é extenso. Registre até 30 itens de cada execução.',sem_dados:'Não foi possível identificar os itens com segurança. Preencha os campos a partir do resultado.'};
export async function conferirRegistro(id,{registro,mensagem,conversa}={}) {
 let d;
 if(registro)d=await api(`${base(id)}/registros/${registro}`);
 else {
  tela('Conferir dados',`${cabeca({trilha:trilhaQw(id,'',['Resultados do processo',`#/qw/${id}/acompanhamento`],['Conferir dados']),titulo:'Conferir dados'})}<p role="status">Organizando o resultado nos campos deste processo. Nada será incluído no histórico sem sua confirmação.</p>`);
  d=await api(`${base(id)}/preparar`,{metodo:'POST',corpo:{mensagem}});
 }
 const [origem,nomeQw]=await Promise.all([api(`/api/conversas/${d.conversa}`),api(`/api/quick-wins/${id}`).then(x=>x.nome).catch(()=>'')]);
 const resposta=origem.mensagens.find(m=>m.id===d.mensagem);
 const podeGravar=!E.permissoes||E.permissoes.includes('chat.use');
 const m=d.modelo;let dados=structuredClone(d.dados);const editando=d.estado==='confirmado';
 const campo=(c,l,i)=>`<label class="campo"><span>${esc(c.nome)}${c.obrigatorio?' *':''}</span>${c.tipo==='estado'?`<select class="entrada" aria-label="${esc(c.nome)}${c.obrigatorio?' *':''}" data-campo="${c.id}" data-item="${i}">${Object.entries(m.estados).map(([k,v])=>`<option value="${k}" ${l[c.id]===k?'selected':''}>${esc(v)}</option>`).join('')}</select>`:c.tipo==='data'?campoData({id:`campo-${c.id}-${i}`,valor:l[c.id]||'',rotulo:c.nome.toLocaleLowerCase('pt-BR'),extra:`aria-label="${esc(c.nome)}${c.obrigatorio?' *':''}" data-campo="${c.id}" data-item="${i}" ${c.obrigatorio?'required':''}`}):`<input class="entrada" type="text" data-campo="${c.id}" data-item="${i}" value="${esc(l[c.id]||'')}" ${c.obrigatorio?'required':''} maxlength="${c.max||40}">`}</label>`;
 tela('Conferir dados',`${cabeca({trilha:trilhaQw(id,nomeQw,['Resultados do processo',`#/qw/${id}/acompanhamento`],[editando?'Corrigir':'Conferir']),titulo:editando?'Corrigir um registro':'Confira antes de registrar',descricao:`${esc(m.nome)}. Os campos e indicadores já estão preparados.`,lado:`<a class="btn btn-texto" href="#/qw/${id}/acompanhamento">Voltar aos resultados do processo</a>`})}
 ${d.teste?'<p class="faixa-aviso atencao" role="status">Este é um teste. Você pode conferir o painel do resultado, mas ele não entra no histórico.</p>':''}
 ${d.estado==='cancelado'?'<p class="faixa-aviso atencao">Este registro foi retirado dos resultados do processo.</p>':''}
 ${d.motivo&&!editando?`<p class="faixa-aviso info">${esc(MOTIVOS[d.motivo]||MOTIVOS.sem_dados)}</p>`:''}
 ${d.qualidade==='parcial'?'<p class="faixa-aviso atencao">A conferência desta execução foi parcial. Confira as limitações na conversa de origem. Registrar os dados não transforma esse resultado em aprovado.</p>':''}
 <details><summary>Consultar o resultado de origem</summary><pre class="painel-origem">${esc(resposta?.texto||'Resultado indisponível.')}</pre><a class="link-sutil" href="#/c/${d.conversa}">Abrir conversa e conferência</a></details>
 ${d.revisoes?.length?`<details><summary>Ver confirmações e correções anteriores</summary><ul>${d.revisoes.map(r=>`<li>${esc(data(r.em))} · versão ${r.versao}: ${esc(r.motivo)}</li>`).join('')}</ul></details>`:''}${!podeGravar?'<p class="faixa-aviso info">Seu acesso é só de consulta. Você pode conferir os dados; para corrigir, fale com o responsável pelo seu acesso.</p>':''}<form id="registro-form"><div id="registro-itens"></div><button class="btn btn-linha" type="button" id="registro-adicionar">Adicionar um item</button>
 <fieldset class="painel-escopo"><legend>Quem poderá ver os dados confirmados?</legend><label><input type="radio" name="escopo" value="pessoal" ${d.escopo==='pessoal'?'checked':''}> Só eu</label>${d.podeCompartilhar?`<label><input type="radio" name="escopo" value="equipe" ${d.escopo==='equipe'?'checked':''}> Pessoas que têm acesso a este Quick Win</label>`:'<p class="dica">Os dados desta execução têm proteção de sigilo. O registro fica só para você.</p>'}<p class="dica">Compartilhar inclui estes registros nos resultados do processo da equipe. O texto da conversa não é compartilhado.</p></fieldset>
 ${editando?'<label class="campo"><span>Por que está corrigindo?</span><input class="entrada" id="registro-motivo" maxlength="300" required></label>':''}
 ${d.qualidade==='parcial'?'<label class="painel-confirmacao"><input type="checkbox" id="registro-parcial" required> Conferi as limitações do resultado parcial e os dados que quero registrar</label>':''}
 <label class="painel-confirmacao"><input type="checkbox" id="registro-conferido" required> Conferi os dados. Eles podem ser usados nos indicadores dos resultados do processo.</label>
 <p class="dica">O registro será removido se a conversa de origem for apagada ou atingir a retenção da empresa.</p><p id="registro-erro" role="alert"></p>
 ${podeGravar&&!d.teste&&d.estado!=='cancelado'?`<button class="btn btn-verde" id="registro-salvar" type="submit">${editando?'Salvar correção':'Confirmar e incluir no histórico'}</button>`:`<a class="btn btn-verde" href="#/qw/${id}/${d.teste?'publicar':'acompanhamento'}">${d.teste?'Voltar à preparação do Quick Win':'Voltar aos resultados do processo'}</a>`}
 <a class="btn btn-texto" href="#/c/${d.conversa}">Voltar à conversa</a></form>
 ${podeGravar&&editando?'<details class="painel-escopo"><summary>Retirar este registro dos resultados do processo</summary><p>Os itens deixam de contar nos indicadores. A execução original permanece na conversa.</p><label class="campo"><span>Por que deseja retirar?</span><input class="entrada" id="registro-retirar-motivo" maxlength="300"></label><button type="button" class="btn btn-linha" id="registro-retirar">Confirmar retirada do histórico</button></details>':''}`);
 function desenhar(){
  $('registro-itens').innerHTML=dados.map((l,i)=>`<fieldset class="painel-item"><legend>Item ${i+1}</legend><div class="painel-campos">${m.campos.map(c=>campo(c,l,i)).join('')}</div>${!editando&&d.evidencias[i]?`<details><summary>Ver trechos usados para sugerir os dados</summary>${Object.entries(d.evidencias[i]).map(([k,v])=>`<p><b>${esc(m.campos.find(c=>c.id===k)?.nome||k)}:</b> ${esc(v)}</p>`).join('')}</details>`:''}${dados.length>1?`<button class="btn btn-texto" type="button" data-remover="${i}">Remover este item</button>`:''}</fieldset>`).join('');
  $('registro-itens').querySelectorAll('[data-campo]').forEach(el=>el.oninput=()=>{dados[Number(el.dataset.item)][el.dataset.campo]='dataBr' in el.dataset?(brParaIso(el.value)||el.value.trim()):el.value;});
  $('registro-itens').querySelectorAll('[data-remover]').forEach(b=>b.onclick=()=>{dados.splice(Number(b.dataset.remover),1);desenhar();});
  $('registro-adicionar').disabled=dados.length>=30;
 }
 desenhar();$('registro-adicionar').onclick=()=>{dados.push(Object.fromEntries(m.campos.map(c=>[c.id,c.tipo==='estado'?'nao_informado':''])));desenhar();$('registro-itens').lastElementChild.querySelector('input,select')?.focus();};
 $('registro-form').onsubmit=async ev=>{
  ev.preventDefault();const b=$('registro-salvar');if(!b)return;b.disabled=true;
  try{await api(`${base(id)}/registros/${d.id}`,{metodo:'POST',corpo:{dados,versao:d.versao,escopo:$('registro-form').elements.escopo.value,confirmado:$('registro-conferido').checked,cienteParcial:$('registro-parcial')?.checked||false,motivo:$('registro-motivo')?.value||''}});toast(editando?'Correção salva. Indicadores atualizados.':'Registro incluído nos resultados do processo.');irPara(`#/qw/${id}/acompanhamento`);}
  catch(e){if(b.isConnected){$('registro-erro').textContent=`Os dados foram mantidos nesta tela. ${e.message}`;b.disabled=false;$('registro-erro').scrollIntoView({block:'nearest'});}}
 };
 $('registro-retirar')?.addEventListener('click',async ev=>{const b=ev.currentTarget;b.disabled=true;try{await api(`${base(id)}/registros/${d.id}/retirar`,{metodo:'POST',corpo:{versao:d.versao,motivo:$('registro-retirar-motivo').value}});toast('Registro retirado. Indicadores atualizados.');irPara(`#/qw/${id}/acompanhamento`);}catch(e){if(b.isConnected){$('registro-erro').textContent=e.message;b.disabled=false;}}});
}
