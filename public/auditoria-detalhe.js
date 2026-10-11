import { esc } from '/comum.js';
import { nomeEvento } from '/jornadas.js';
const nomes={modelo:'Modelo',fornecedor:'Fornecedor',campos:'Campos alterados',exigirSemTreino:'Exigir fornecedor sem treinamento com dados',padroes:'Modelos por nível',acessoPerfis:'Acesso por nível',perfisQuickWin:'Níveis dos Quick Wins',automatico:'Escolha automática',perfil:'Nível',liberado:'Liberado',reserva:'Reserva',documento:'Documento',pessoa:'Pessoa',area:'Área',quick_win:'Quick Win',versao:'Versão',conversa:'Conversa',substituido:'Arquivo substituído',sigiloso:'Sigilo',pasta:'Pasta',revisado:'Revisão confirmada',connector:'Integração',aprovacao:'Aprovação',status:'Estado',causa:'Causa',escopo:'Escopo',observacao:'Justificativa',antes:'Anterior',depois:'Novo',de:'De',para:'Para',titulo:'Título',validade:'Validade',suspenso:'Suspenso',responsavel_id:'Responsável (identificador)'};
// Códigos internos que aparecem como valor (estado de Quick Win, situação, tipo de evento) viram texto para leitura.
const VALORES={identificado:'Identificado',em_configuracao:'Em configuração',em_teste:'Em teste',em_uso:'Em uso',em_avaliacao:'Em avaliação',aprovado:'Aprovado',em_expansao:'Em expansão',descartado:'Descartado',rascunho:'Rascunho',ativo:'Ativo',ativa:'Ativa',inativo:'Inativo',inativa:'Inativa',suspensa:'Suspensa',cancelada:'Cancelada',pendente:'Pendente',na_fila:'Na fila',executando:'Executando',pronto:'Pronto',aguardando_aprovacao:'Aguardando aprovação'};
const legivel=v=>VALORES[v]||(/^[a-z_]+(\.[a-z_]+)+$/.test(v)&&nomeEvento(v)!=='Registro de atividade'?nomeEvento(v):v);
const rotulo=k=>esc(nomes[k]||k.replaceAll('_',' '));
const campos=['padroes','acessoPerfis','perfisQuickWin','exigirSemTreino','automatico'];
function valor(v,nivel=0){
 if(v===null||v===undefined||v==='')return 'Não informado';
 if(typeof v==='boolean')return v?'Sim':'Não';
 if(typeof v!=='object')return esc(typeof v==='string'?(campos.includes(v)?nomes[v]:legivel(v)):String(v));
 if(nivel>=6)return 'Detalhe estruturado adicional';
 if(Array.isArray(v))return v.length?`<ul>${v.map(x=>`<li>${valor(x,nivel+1)}</li>`).join('')}</ul>`:'Nenhum item';
 return `<dl>${Object.entries(v).map(([k,x])=>`<dt>${rotulo(k)}</dt><dd>${valor(x,nivel+1)}</dd>`).join('')}</dl>`;
}
// Resumo de uma linha: até três campos simples ("Modelo: X · Classe: Rápido"), para a pessoa saber o que mudou sem abrir.
function resumo(d){
 const simples=v=>v!==null&&v!==undefined&&v!==''&&(typeof v!=='object'||Array.isArray(v)&&v.length&&v.every(x=>typeof x!=='object'));
 const texto=v=>Array.isArray(v)?v.map(x=>campos.includes(x)?nomes[x]:legivel(String(x))).join(', '):typeof v==='boolean'?(v?'Sim':'Não'):legivel(String(v));
 return Object.entries(d||{}).filter(([,v])=>simples(v)).slice(0,3).map(([k,v])=>`${rotulo(k)}: ${esc(texto(v).slice(0,80))}`).join(' · ');
}
export function detalheAuditoria(e) {
 let d;try{d=JSON.parse(e.detalhes);}catch{return `<span class="dica">Registro sem detalhe estruturado.</span>`;}
 const r=resumo(d);
 return `${r?`<p class="auditoria-resumo">${r}</p>`:''}<details class="auditoria-detalhe"><summary>Ver todos os detalhes</summary><dl>${Object.entries(d||{}).map(([k,v])=>`<dt>${rotulo(k)}</dt><dd>${valor(v)}</dd>`).join('')||'<dt>Informação</dt><dd>Evento sem campos adicionais.</dd>'}</dl><p class="dica">Autor: ${esc(e.pessoa||'sistema')}. Registro nº ${esc(e.id)}, só de inclusão; os detalhes dependem do tipo de evento.</p></details>`;
}
