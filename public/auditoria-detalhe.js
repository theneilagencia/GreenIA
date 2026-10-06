import { esc } from '/comum.js';
const nomes={documento:'Documento',pessoa:'Pessoa',area:'Área',quick_win:'Quick Win',versao:'Versão',conversa:'Conversa',substituido:'Arquivo substituído',sigiloso:'Sigilo',pasta:'Pasta',revisado:'Revisão confirmada',connector:'Integração',aprovacao:'Aprovação',status:'Estado',causa:'Causa',escopo:'Escopo',observacao:'Justificativa',antes:'Anterior',depois:'Novo',titulo:'Título',validade:'Validade',suspenso:'Suspenso',responsavel_id:'Responsável (identificador)'};
const rotulo=k=>esc(nomes[k]||k.replaceAll('_',' '));
function valor(v,nivel=0){
 if(v===null||v===undefined||v==='')return 'Não informado';
 if(typeof v==='boolean')return v?'Sim':'Não';
 if(typeof v!=='object')return esc(String(v));
 if(nivel>=6)return 'Detalhe estruturado adicional';
 if(Array.isArray(v))return v.length?`<ul>${v.map(x=>`<li>${valor(x,nivel+1)}</li>`).join('')}</ul>`:'Nenhum item';
 return `<dl>${Object.entries(v).map(([k,x])=>`<dt>${rotulo(k)}</dt><dd>${valor(x,nivel+1)}</dd>`).join('')}</dl>`;
}
export function detalheAuditoria(e) {
 let d;try{d=JSON.parse(e.detalhes);}catch{return `<span class="dica">Registro sem detalhe estruturado.</span>`;}
 return `<details class="auditoria-detalhe"><summary>Ver registro ${e.id}</summary><dl>${Object.entries(d||{}).map(([k,v])=>`<dt>${rotulo(k)}</dt><dd>${valor(v)}</dd>`).join('')||'<dt>Informação</dt><dd>Evento sem campos adicionais.</dd>'}</dl><p class="dica">Autor: ${esc(e.pessoa||'sistema')}. Evento ${esc(e.tipo)}. Registro só de inclusão; detalhes dependem do evento.</p></details>`;
}
