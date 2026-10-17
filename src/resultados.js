import { createHash } from 'node:crypto';
import { conteudoParaEdicao } from './edicao-arquivo.js';
import { exec, todos, um, transacao } from './db.js';
import { erro, enviarCsv } from './http.js';
import { registrar } from './eventos.js';
import { ehOperador, liberarPacote } from './plano.js';

export const ESTADOS_TRABALHO = {em_execucao:'Em execução',aguardando_autorizacao:'Aguardando autorização',aguardando_informacao:'Aguardando informação',pendente_verificacao:'Entrega gerada, pendente de verificação',concluido:'Concluído com verificação',falhou:'Falhou',interrompido:'Interrompido pelo usuário',nao_verificavel:'Conclusão não verificável'};
export const CLASSES_TENTATIVA = {inicial:'Primeira execução',etapa:'Etapa planejada',apos_falha:'Nova tentativa após falha',correcao:'Correção de descumprimento',preferencia:'Mudança de preferência',escopo:'Ampliação de escopo',novo:'Novo trabalho',nao_classificado:'Não classificado'};
const agora=app=>app.agora().toISOString();
const round=n=>Math.round(n*10000)/10000;
const cred=n=>n==null?null:round(n/.01); // precisão de cálculo; arredondar só na apresentação
const admin=(app,p)=>app.tenant?(p.permissoes||[]).includes('usage.read'):!!p.admin;
const tipoDo=c=>/apresenta|slides|powerpoint|pptx/i.test(c)?'apresentacao':/xlsx|(?:ger[ea]|crie|criar|monte|montar|prepare|preparar).{0,45}planilha/i.test(c)?'planilha':/analise|análise|compare|comparar/i.test(c)?'analise':/docx|(?:ger[ea]|crie|criar|monte|montar|prepare|preparar).{0,45}(documento|relatório|relatorio)/i.test(c)?'documento':'comunicacao';

export function iniciarResultados(app){
 exec(app.db,"insert or ignore into resultado_meta values ('inicio',?)",agora(app));
 // Uma reinicialização não transforma execução perdida em sucesso nem culpa o usuário.
 exec(app.db,"update trabalho_tentativas set estado='nao_verificavel', fim=? where fim is null",agora(app));
 exec(app.db,"update trabalhos set estado='nao_verificavel', atualizado_em=? where estado='em_execucao'",agora(app));
 exec(app.db,"update trabalho_chamadas set estado='pendente',fim=coalesce(fim,?) where estado='em_execucao'",agora(app));
 sincronizarContas(app);
}
export function sincronizarContas(app){
 const lista=app.pessoasResultados?.()||todos(app.db,'select id,nome,email,ativo from pessoas').map(p=>({...p,situacao:p.ativo?'ativo':'inativo'}));
 const presentes=new Set();
 for(const p of lista){presentes.add(p.id);const categoria=um(app.db,'select categoria from resultado_contas where pessoa_id=?',p.id)?.categoria||(ehOperador(app,p)?'tecnica':'pessoa');
  const habilitada=Number(p.situacao==='ativo'&&p.ativo!==0&&categoria==='pessoa');
  const ult=um(app.db,'select * from resultado_habilitacao where pessoa_id=? order by id desc limit 1',p.id);
  if(!ult||ult.habilitada!==habilitada||ult.categoria!==categoria||ult.nome!==p.nome||ult.situacao!==p.situacao)exec(app.db,'insert into resultado_habilitacao(pessoa_id,em,habilitada,categoria,nome,situacao) values (?,?,?,?,?,?)',p.id,agora(app),habilitada,categoria,p.nome||'Pessoa',p.situacao);
 }
 for(const p of todos(app.db,'select * from resultado_habilitacao where id in(select max(id) from resultado_habilitacao group by pessoa_id)'))if(!presentes.has(p.pessoa_id)&&p.situacao!=='removido')exec(app.db,"insert into resultado_habilitacao(pessoa_id,em,habilitada,categoria,nome,situacao) values (?,?,0,?,?,'removido')",p.pessoa_id,agora(app),p.categoria,p.nome);
}
export function abrirTentativa(app,pessoa,conv,corpo={}){
 const vinculo=corpo.acompanhamento||'nao_classificado';
 if(!Object.hasOwn(CLASSES_TENTATIVA,vinculo))throw erro(400,'vinculo','Escolha como este pedido se relaciona ao trabalho.');
 let t=um(app.db,'select * from trabalhos where conversa_id=? and pessoa_id=? order by id desc limit 1',conv.id,pessoa.id);
 const novo=!t||['novo','escopo'].includes(vinculo)||t.estado==='concluido';
 return transacao(app.db,()=>{
  if(novo){const id=Number(exec(app.db,'insert into trabalhos(pessoa_id,conversa_id,tipo,aberto_em,atualizado_em,teste,anterior_id) values (?,?,?,?,?,?,?)',pessoa.id,conv.id,tipoDo(String(corpo.texto||'')),agora(app),agora(app),conv.teste,t?.id??null).lastInsertRowid);t=um(app.db,'select * from trabalhos where id=?',id);}
  const anterior=um(app.db,'select estado from trabalho_tentativas where trabalho_id=? order by id desc limit 1',t.id);
  const classe=novo?'inicial':vinculo==='nao_classificado'&&anterior?.estado==='falhou'?'apos_falha':vinculo;
  const id=Number(exec(app.db,'insert into trabalho_tentativas(trabalho_id,pessoa_id,inicio,classe) values (?,?,?,?)',t.id,pessoa.id,agora(app),classe).lastInsertRowid);
  exec(app.db,"update trabalhos set estado='em_execucao',atualizado_em=?,concluido_em=null where id=?",agora(app),t.id);
  exec(app.db,"insert into trabalho_eventos(trabalho_id,tentativa_id,em,tipo,estado,pessoa_id) values (?,?,?,'inicio','em_execucao',?)",t.id,id,agora(app),pessoa.id);
  return {trabalho_id:t.id,tentativa_id:id};
 });
}
export function finalizarTentativa(app,ids,{erro:falha,interrompido=false}={}){
 if(!ids)return;
 const a=um(app.db,'select * from trabalho_tentativas where id=?',ids.tentativa_id);if(!a)return;
 const t=um(app.db,'select * from trabalhos where id=?',ids.trabalho_id);
 const r=um(app.db,'select id,resposta_id,resultado,qualidade from roteamento where conversa_id=? and em>=? order by id desc limit 1',t.conversa_id,a.inicio);
 const executada=!!um(app.db,'select 1 from trabalho_chamadas where tentativa_id=?',a.id);
 const bloqueado=!!falha&&([401,402,403,422,429].includes(falha.status)||/advanced|sigilo|permiss|limite|teto|bloque|plano/.test(falha.codigo||''));
 let estado=r?.resultado==='falha_na_execucao'?'falhou':interrompido?'interrompido':falha?(bloqueado?'aguardando_autorizacao':'falhou'):r?.resposta_id?'pendente_verificacao':'nao_verificavel';
 try{if(JSON.parse(r?.qualidade||'{}').status==='pergunta')estado='aguardando_informacao';}catch{}
 const fim=agora(app);
 exec(app.db,'update trabalho_tentativas set fim=?,estado=?,executada=?,resposta_id=?,rota_id=?,motivo=? where id=?',fim,estado,executada,r?.resposta_id,r?.id,falha?.codigo||null,a.id);
 exec(app.db,'update trabalhos set estado=?,atualizado_em=? where id=?',estado,fim,t.id);
 exec(app.db,"insert into trabalho_eventos(trabalho_id,tentativa_id,em,tipo,estado,pessoa_id) values (?,?,?,'fim',?,?)",t.id,a.id,fim,estado,a.pessoa_id);
 if(r?.resposta_id){
  const arquivos=todos(app.db,'select id,mime,dados,length(dados) bytes from arquivos_gerados where mensagem_id=? and conversa_id=?',r.resposta_id,t.conversa_id);
  if(t.tipo==='comunicacao'&&arquivos.length){const tipo=arquivos.some(a=>a.mime.includes('presentationml'))?'apresentacao':arquivos.some(a=>a.mime.includes('spreadsheetml'))?'planilha':arquivos.some(a=>a.mime.includes('wordprocessingml'))?'documento':null;if(tipo)exec(app.db,'update trabalhos set tipo=? where id=?',tipo,t.id);}
  for(const f of arquivos) exec(app.db,'insert into trabalho_verificacoes(trabalho_id,tentativa_id,em,categoria,criterio,resultado,limite) values (?,?,?,?,?,?,?)',t.id,a.id,fim,'tecnica','arquivo_persistido',f.bytes>0?'passou':'falhou','Somente persistência e bytes. Não comprova abertura, conteúdo, cálculos nem layout.');
  for(const f of arquivos){const tipo=f.mime.includes('spreadsheetml')?'xlsx':f.mime.includes('presentationml')?'pptx':f.mime.includes('wordprocessingml')?'docx':null;if(!tipo)continue;let passou=false;try{passou=conteudoParaEdicao(tipo,Buffer.from(f.dados)).trim().length>0;}catch{}exec(app.db,'insert into trabalho_verificacoes(trabalho_id,tentativa_id,em,categoria,criterio,resultado,limite,evidencia) values (?,?,?,?,?,?,?,?)',t.id,a.id,fim,'tecnica','pacote_office_legivel',passou?'passou':'falhou','Pacote e conteúdo Office lidos pelo parser. Não comprova abertura em todos os aplicativos, adequação ao pedido, cálculos ou layout.',JSON.stringify({arquivo:f.id,bytes:f.bytes,sha256:createHash('sha256').update(Buffer.from(f.dados)).digest('hex')}));}

 }
 registrar(app,'work.attempt_finished',a.pessoa_id,{trabalho:t.id,tentativa:a.id,estado});
}

export const METODOLOGIA_RESULTADOS = {
 unidade:'Trabalho é um objetivo acompanhado por identificador estável. A conversa permanece no mesmo trabalho até conclusão ou escolha explícita de Novo trabalho/Ampliação de escopo. Ligações ambíguas ficam Não classificado e podem ser confirmadas. Não há inferência de sucesso para o histórico anterior.',
 tentativas:'Uma tentativa é um envio autorizado a iniciar uma execução, com uma ou várias chamadas internas e ferramentas. Bloqueios sem chamada não contam como tentativa executada nem pessoa ativa. Etapas planejadas, correções e preferências dependem de classificação explícita; chamadas internas não são retrabalho.',
 creditos:'Créditos por trabalho concluído = consumo acumulado dos trabalhos iniciados no período ÷ trabalhos desse conjunto concluídos com verificação. Inclui falhas e correções registradas em uso; não soma novamente chamadas de provedor nem eventos de cobrança. Sem conclusões ou com consumo pendente, não há média definitiva.',
 contabilizacao:'Consumo usa o registro uso. Com plano, o débito segue esse registro; sem plano, o débito do cliente não é medido neste controle. Estornos confirmados são registrados separadamente pela Administração Geral, com referência única; não há segunda cobrança neste painel. Ausência de informação do provedor fica pendente. Itens externos sem integração de cobrança não são estimados.',
 verificacao:'Resposta encerrada e arquivo existente não concluem trabalho. Persistência é uma verificação técnica limitada. Conclusão exige checklist humano explícito dos requisitos, conteúdo e, quando aplicável, abertura, download, cálculos, referências e layout. Essa aprovação é informada pela pessoa, não uma certificação independente da plataforma.',
 pessoas:'Ativo realizou ao menos uma chamada de execução no período, inclusive falhas, fora de testes e contas técnicas. Login não conta. Adoção = ativos ÷ pessoas habilitadas em algum momento do período. Convites pendentes e contas técnicas/teste ficam fora; desativados que estiveram habilitados no período permanecem no denominador. Períodos anteriores à instrumentação têm denominador não medido. Alterações de cadastro são observadas em snapshots; cobertura do período é exibida.',
 tempo:'Duração observada por eventos: execução, espera por autorização, espera por informação, correções e novas tentativas. Não mede tempo humano nem horas economizadas. A espera pela conferência humana não entra no prazo até disponibilizar a entrega. Mediana e p90 só com ao menos 10 trabalhos verificados e cronologia completa.',
 comparacao:'Comparação ainda não realizada. Créditos são uma unidade interna, sem equivalência com tokens ou mensalidades de outras plataformas.',
 historico:'Uso anterior sem identificador de trabalho continua em consumo no período, separado da coorte. Não é convertido retroativamente em trabalho concluído.'
};
function filtros(app,p,query){
 const empresa=query.visao==='empresa';if(empresa&&!admin(app,p))throw erro(403,'usage_read','Você pode consultar apenas seus próprios resultados.');
 const hoje=agora(app).slice(0,10),desde=query.desde||hoje.slice(0,7)+'-01',ate=query.ate||hoje;
 const data=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 if(!data(desde)||!data(ate)||desde>ate||ate>hoje||Date.parse(ate)-Date.parse(desde)>366*864e5)throw erro(400,'periodo','Escolha um período válido de até 366 dias, sem datas futuras.');
 const pessoa=empresa&&query.pessoa?Number(query.pessoa):empresa?null:p.id;
 if(pessoa!==null&&(!Number.isSafeInteger(pessoa)||pessoa<=0))throw erro(400,'pessoa','Pessoa inválida.');
 const tipo=query.tipo||'',estado=query.estado||'';
 if(tipo&&!['comunicacao','documento','planilha','apresentacao','analise'].includes(tipo))throw erro(400,'tipo','Tipo inválido.');
 if(estado&&!Object.hasOwn(ESTADOS_TRABALHO,estado))throw erro(400,'estado','Estado inválido.');
 return {empresa,pessoa,tipo,estado,desde,ate,inicio:desde+'T00:00:00.000Z',fim:new Date(Date.parse(ate)+864e5).toISOString()};
}
const permitido=(app,p,t)=>t&&(t.pessoa_id===p.id||admin(app,p));
function detalheTrabalho(app,p,id){
 const t=um(app.db,'select * from trabalhos where id=?',Number(id));if(!permitido(app,p,t))throw erro(404,'trabalho','Trabalho não encontrado.');
 // Whitelist; não há conversa_id, nomes de arquivos, prompts ou títulos privados para o gestor.
 const tentativas=todos(app.db,'select id,inicio,fim,classe,estado,executada,motivo from trabalho_tentativas where trabalho_id=? order by id',t.id).map(a=>({...a,causa:a.estado==='interrompido'?'Interrupção pelo usuário':a.estado==='aguardando_autorizacao'?'Bloqueio por autorização, segurança ou consumo':a.classe==='correcao'?'Correção de descumprimento confirmada':a.classe==='preferencia'?'Mudança de preferência confirmada':a.classe==='escopo'?'Ampliação de escopo confirmada':'Não classificado',creditos:cred(um(app.db,'select sum(custo) n from uso where tentativa_id=?',a.id).n),chamadas:um(app.db,'select count(*) n from trabalho_chamadas where tentativa_id=?',a.id).n}));
 const verificacoes=todos(app.db,'select id,tentativa_id,em,por,categoria,criterio,resultado,limite,evidencia from trabalho_verificacoes where trabalho_id=? order by id',t.id);
 const etapas=todos(app.db,'select em,tipo,estado,tentativa_id from trabalho_eventos where trabalho_id=? order by id',t.id);
 const tempos={processamentoMs:0,esperaAutorizacaoMs:0,esperaInformacaoMs:0,correcoesMs:0};
 for(let i=0;i<etapas.length;i++){const e=etapas[i],a=tentativas.find(a=>a.id===e.tentativa_id),fim=etapas[i+1]?.em||(['aguardando_autorizacao','aguardando_informacao'].includes(e.estado)?agora(app):e.em),ms=Math.max(0,Date.parse(fim)-Date.parse(e.em));if(e.estado==='em_execucao')tempos[a?.classe==='correcao'||a?.classe==='apos_falha'?'correcoesMs':'processamentoMs']+=ms;else if(e.estado==='aguardando_autorizacao')tempos.esperaAutorizacaoMs+=ms;else if(e.estado==='aguardando_informacao')tempos.esperaInformacaoMs+=ms;}
 return {tempos,id:t.id,pessoa_id:t.pessoa_id,tipo:t.tipo,estado:t.estado,aberto_em:t.aberto_em,atualizado_em:t.atualizado_em,concluido_em:t.concluido_em,meu:t.pessoa_id===p.id,tentativas,verificacoes,etapas:todos(app.db,'select em,tipo,estado,tentativa_id from trabalho_eventos where trabalho_id=? order by id',t.id),...(t.pessoa_id===p.id&&um(app.db,'select 1 from conversas where id=? and pessoa_id=?',t.conversa_id,p.id)?{continuar:'#/c/'+t.conversa_id}:{})};
}
export function resumoResultados(app,p,query={}){
 sincronizarContas(app);const f=filtros(app,p,query),atualizado=agora(app);
 const inicioInstrumentacao=um(app.db,"select valor from resultado_meta where chave='inicio'").valor;
 const args=[f.inicio,f.fim],where=['t.aberto_em>=?','t.aberto_em<?','t.teste=0'];
 if(f.pessoa!==null){where.push('t.pessoa_id=?');args.push(f.pessoa);}
 if(f.tipo){where.push('t.tipo=?');args.push(f.tipo);}if(f.estado){where.push('t.estado=?');args.push(f.estado);}
 where.push("not exists(select 1 from resultado_contas rc where rc.pessoa_id=t.pessoa_id and rc.categoria!='pessoa')");
 const trabalhos=todos(app.db,`select t.id,t.pessoa_id,t.tipo,t.estado,t.aberto_em,t.atualizado_em,t.concluido_em from trabalhos t where ${where.join(' and ')} order by t.id desc`,...args);
 const linhas=trabalhos.map(t=>{const us=um(app.db,'select sum(custo) n,count(*) registros from uso where trabalho_id=?',t.id);const pend=um(app.db,"select count(*) n from trabalho_chamadas c join trabalho_tentativas a on a.id=c.tentativa_id where a.trabalho_id=? and c.estado in('pendente','em_execucao')",t.id).n;const cobrado=um(app.db,'select sum(coalesce(c.custo_conciliado,c.custo_reportado,0)) n from trabalho_chamadas c join trabalho_tentativas a on a.id=c.tentativa_id where a.trabalho_id=?',t.id).n||0;const falta=cobrado>(us.n||0)+1e-8?1:0;return {...t,creditos:us.registros?cred(us.n):pend?null:0,titulo:t.pessoa_id===p.id?um(app.db,'select c.titulo from conversas c join trabalhos t on t.conversa_id=c.id where t.id=? and c.pessoa_id=?',t.id,p.id)?.titulo:null,pendenciasConsumo:pend+falta,tentativas:um(app.db,'select count(*) n from trabalho_tentativas where trabalho_id=? and executada=1',t.id).n};});
 const usadosWhere="teste=0 and em>=? and em<?"+(f.pessoa!==null?' and pessoa_id=?':'')+" and not exists(select 1 from resultado_contas rc where rc.pessoa_id=uso.pessoa_id and rc.categoria!='pessoa')";
 const par=[f.inicio,f.fim,...(f.pessoa!==null?[f.pessoa]:[])];
 const usoPeriodo=todos(app.db,`select id,pessoa_id,trabalho_id,tentativa_id,em,custo from uso where ${usadosWhere}`,...par);
 const execucoesPeriodo=todos(app.db,`select a.pessoa_id,a.inicio from trabalho_tentativas a join trabalhos t on t.id=a.trabalho_id where a.executada=1 and t.teste=0 and a.inicio>=? and a.inicio<? ${f.pessoa!==null?'and a.pessoa_id=?':''} and not exists(select 1 from resultado_contas rc where rc.pessoa_id=a.pessoa_id and rc.categoria!='pessoa')`,...par);
 const ativos=new Set([...usoPeriodo.map(u=>u.pessoa_id),...execucoesPeriodo.map(a=>a.pessoa_id)].filter(Boolean));
 const diasDaPessoa=id=>new Set([...usoPeriodo.filter(u=>id==null||u.pessoa_id===id).map(u=>u.em.slice(0,10)),...execucoesPeriodo.filter(a=>id==null||a.pessoa_id===id).map(a=>a.inicio.slice(0,10))]).size;
 const usoTotalPeriodo=todos(app.db,`select u.custo,u.trabalho_id,u.teste,coalesce(rc.categoria,'pessoa') categoria from uso u left join resultado_contas rc on rc.pessoa_id=u.pessoa_id where u.em>=? and u.em<? ${f.pessoa!==null?'and u.pessoa_id=?':''}`,...par);
 const todasHabilitacoes=todos(app.db,'select * from resultado_habilitacao where em<? order by em,id',f.fim);const habilitacoes=todasHabilitacoes.filter(h=>f.pessoa===null||h.pessoa_id===f.pessoa);const pessoas=new Map();for(const h of habilitacoes)pessoas.set(h.pessoa_id,h);
 let habilitados=0;for(const id of pessoas.keys()){if(um(app.db,'select categoria from resultado_contas where pessoa_id=?',id)?.categoria&&um(app.db,'select categoria from resultado_contas where pessoa_id=?',id).categoria!=='pessoa')continue;const hs=habilitacoes.filter(h=>h.pessoa_id===id);const anterior=hs.filter(h=>h.em<f.inicio).at(-1);if(anterior?.habilitada||hs.some(h=>h.em>=f.inicio&&h.habilitada))habilitados++;}
 const cobertura=f.inicio>=inicioInstrumentacao;
 const concluidos=linhas.filter(t=>t.estado==='concluido').length,consumo=round(linhas.reduce((n,t)=>n+(t.creditos||0),0)),pendentes=linhas.reduce((n,t)=>n+t.pendenciasConsumo,0);
 const ids=new Set(linhas.map(t=>t.id));const tentativas=todos(app.db,'select a.* from trabalho_tentativas a join trabalhos t on t.id=a.trabalho_id where t.teste=0').filter(a=>ids.has(a.trabalho_id));
 const estornos=todos(app.db,`select creditos,trabalho_id from resultado_ajustes_creditos where natureza='estorno'`).filter(a=>ids.has(a.trabalho_id));
 const tempos=linhas.filter(t=>t.estado==='concluido').map(t=>{const e=um(app.db,"select max(fim) em from trabalho_tentativas where trabalho_id=? and estado='pendente_verificacao' and resposta_id is not null",t.id)?.em;return e?Date.parse(e)-Date.parse(t.aberto_em):null;}).filter(ms=>ms!==null&&ms>=0).sort((a,b)=>a-b);
 const porTipo=[...new Set(linhas.map(t=>t.tipo))].map(tipo=>{const l=linhas.filter(t=>t.tipo===tipo);return {tipo,iniciados:l.length,concluidos:l.filter(t=>t.estado==='concluido').length,creditos:round(l.reduce((s,t)=>s+(t.creditos||0),0))};});
 const porPessoa=f.empresa?[...pessoas.values()].filter(x=>x.situacao!=='removido').map(x=>{const l=linhas.filter(t=>t.pessoa_id===x.pessoa_id);return {id:x.pessoa_id,nome:x.nome,categoria:x.categoria,situacao:x.situacao,ativo:ativos.has(x.pessoa_id),dias:diasDaPessoa(x.pessoa_id),iniciados:l.length,concluidos:l.filter(t=>t.estado==='concluido').length,tipos:[...new Set(l.map(t=>t.tipo))]};}):[];
 const opcoesPessoas=new Map();for(const h of todasHabilitacoes)opcoesPessoas.set(h.pessoa_id,{id:h.pessoa_id,nome:h.nome});
 return {pessoasOpcoes:f.empresa?[...opcoesPessoas.values()]:[],ambienteSimulado:!!app.ia.simulada,visao:f.empresa?'empresa':'pessoal',podeEmpresa:admin(app,p),filtros:f,atualizado,inicioInstrumentacao,cobertura:cobertura?'desde a instrumentação':'Parcial: período inclui registros anteriores à instrumentação',
 pessoas:{cadastrados:f.empresa?[...pessoas.values()].filter(x=>x.situacao!=='removido').length:null,habilitados:cobertura&&f.empresa?habilitados:null,ativos:ativos.size,adocao:cobertura&&habilitados&&f.empresa?round(ativos.size/habilitados*100):null,dias:diasDaPessoa(null)},
 coorte:{iniciados:linhas.length,concluidos,emAndamento:linhas.filter(t=>['em_execucao','aguardando_informacao','aguardando_autorizacao','pendente_verificacao'].includes(t.estado)).length,creditosConsumidos:consumo,creditosDebitados:app.plano?consumo:null,creditosEstornados:round(estornos.reduce((s,a)=>s+a.creditos,0)),pendenciasConsumo:pendentes,vinculosPendentes:tentativas.filter(a=>a.classe==='nao_classificado').length,creditosPorConcluido:concluidos&&!pendentes?round(consumo/concluidos):null,motivoMedia:!concluidos?'Sem trabalhos concluídos':pendentes?'Consumo pendente de apuração':null,taxaConclusao:linhas.length?round(concluidos/linhas.length*100):null},
 consumoPeriodo:{creditos:cred(usoTotalPeriodo.reduce((s,u)=>s+u.custo,0)),testesETecnicas:cred(usoTotalPeriodo.filter(u=>u.teste||u.categoria!=='pessoa').reduce((s,u)=>s+u.custo,0)),semTrabalho:cred(usoTotalPeriodo.filter(u=>!u.trabalho_id).reduce((s,u)=>s+u.custo,0)),escopo:'Todas as execuções registradas no período, inclusive testes e contas técnicas, discriminadas separadamente. Tipo e estado se aplicam somente à coorte; registros antigos não têm esses vínculos.'},
 atencao:{falhas:linhas.filter(t=>t.estado==='falhou').length,interrompidos:linhas.filter(t=>t.estado==='interrompido').length,bloqueios:tentativas.filter(a=>a.estado==='aguardando_autorizacao'&&!a.executada).length,correcoes:tentativas.filter(a=>a.classe==='correcao').length,naoClassificados:tentativas.filter(a=>a.classe==='nao_classificado').length,pendentesVerificacao:linhas.filter(t=>t.estado==='pendente_verificacao').length},
 tempos:{amostra:tempos.length,medianaMs:tempos.length>=10?tempos[Math.floor((tempos.length-1)/2)]:null,p90Ms:tempos.length>=10?tempos[Math.ceil(tempos.length*.9)-1]:null},porTipo,porPessoa,trabalhos:linhas,metodologia:METODOLOGIA_RESULTADOS,comparacao:'Comparação ainda não realizada'};
}
function checkTrabalho(app,p,id){const t=um(app.db,'select * from trabalhos where id=? and pessoa_id=?',Number(id),p.id);if(!t)throw erro(404,'trabalho','Trabalho não encontrado.');return t;}
export function rotasResultados(app,r){
 r.get('/api/resultados',({pessoa,query})=>resumoResultados(app,pessoa,query));
 r.get('/api/resultados.csv',({pessoa,query,res})=>{const d=resumoResultados(app,pessoa,query);enviarCsv(res,'uso-e-resultados.csv',[
 ['Período',d.filtros.desde,d.filtros.ate,'Atualizado',d.atualizado],['Cobertura',d.cobertura],['Coorte: créditos consumidos',d.coorte.creditosConsumidos],['Concluídos com verificação',d.coorte.concluidos],['Créditos por concluído',d.coorte.creditosPorConcluido??d.coorte.motivoMedia],['Consumo ocorrido no período',d.consumoPeriodo.creditos],['Histórico sem trabalho identificado',d.consumoPeriodo.semTrabalho],[],['Trabalho','Pessoa (id)','Tipo','Estado','Iniciado','Atualizado','Tentativas executadas','Créditos','Pendências'],...d.trabalhos.map(t=>[t.id,t.pessoa_id,t.tipo,ESTADOS_TRABALHO[t.estado],t.aberto_em,t.atualizado_em,t.tentativas,t.creditos??'Pendente',t.pendenciasConsumo]),[],['Metodologia'],...Object.entries(d.metodologia)]);});
 r.get('/api/resultados/trabalhos/:id',({pessoa,params})=>detalheTrabalho(app,pessoa,params.id));
 r.post('/api/resultados/trabalhos/:id/verificar',({pessoa,params,corpo})=>{
  const t=checkTrabalho(app,pessoa,params.id);if(t.estado==='concluido')return detalheTrabalho(app,pessoa,t.id);if(t.estado==='em_execucao')throw erro(409,'em_execucao','Aguarde a execução terminar.');
  const a=um(app.db,'select * from trabalho_tentativas where trabalho_id=? and resposta_id is not null order by id desc limit 1',t.id);if(!a)throw erro(409,'sem_entrega','Ainda não há entrega para conferir.');
  if(um(app.db,"select 1 from trabalho_tentativas where trabalho_id=? and classe='nao_classificado'",t.id))throw erro(409,'vinculo_pendente','Confirme a relação dos envios com este trabalho antes de registrar sua conclusão. Etapas, correções, preferências e novos trabalhos ficam separados.');
  const criterios=['instrucoes','conteudo',...(['documento','planilha','apresentacao'].includes(t.tipo)?['download','abertura']:[]),...(t.tipo==='planilha'?['estrutura','calculos']:[]),...(t.tipo==='apresentacao'?['layout']:[]),...(t.tipo==='analise'?['referencias']:[])];
  if(!criterios.every(k=>corpo.criterios?.[k]===true))throw erro(400,'verificacao','Confira todos os critérios. Se algum não se aplica, confirme que verificou essa condição.');
  // Confere disponibilidade atual independentemente da declaração humana.
  if(criterios.includes('download')&&!um(app.db,'select 1 from arquivos_gerados where conversa_id=? and mensagem_id=? and length(dados)>0',t.conversa_id,a.resposta_id))throw erro(409,'arquivo_ausente','Não há arquivo disponível nesta entrega. A conclusão continua pendente.');
  if(um(app.db,"select 1 from trabalho_verificacoes where tentativa_id=? and categoria='tecnica' and resultado='falhou'",a.id))throw erro(409,'verificacao_tecnica','O arquivo não passou na verificação técnica. Corrija a entrega antes de concluir.');
  transacao(app.db,()=>{for(const c of criterios)exec(app.db,'insert into trabalho_verificacoes(trabalho_id,tentativa_id,em,por,categoria,criterio,resultado,limite) values (?,?,?,?,?,?,?,?)',t.id,a.id,agora(app),pessoa.id,'humana',c,'passou','Conferência declarada pelo responsável. Não é certificação independente.');exec(app.db,"update trabalhos set estado='concluido',concluido_em=?,atualizado_em=? where id=?",agora(app),agora(app),t.id);exec(app.db,"insert into trabalho_eventos(trabalho_id,tentativa_id,em,tipo,estado,pessoa_id) values (?,?,?,'verificacao','concluido',?)",t.id,a.id,agora(app),pessoa.id);});
  registrar(app,'work.verified',pessoa.id,{trabalho:t.id,tentativa:a.id,criterios});return detalheTrabalho(app,pessoa,t.id);
 });
 r.post('/api/resultados/trabalhos/:id/classificar',({pessoa,params,corpo})=>{
  const t=checkTrabalho(app,pessoa,params.id),classe=corpo.classe;
  if(!Object.hasOwn(CLASSES_TENTATIVA,classe)||classe==='inicial')throw erro(400,'classe','Escolha o motivo do ajuste.');
  const a=um(app.db,'select * from trabalho_tentativas where id=? and trabalho_id=?',Number(corpo.tentativa),t.id);if(!a||!a.fim)throw erro(409,'tentativa','Escolha uma execução encerrada.');if(a.classe==='inicial')throw erro(409,'primeira_execucao','Este é o primeiro envio do trabalho; a classificação se aplica aos envios seguintes.');
  transacao(app.db,()=>{if(['novo','escopo'].includes(classe)){
   const id=Number(exec(app.db,'insert into trabalhos(pessoa_id,conversa_id,tipo,estado,aberto_em,atualizado_em,teste,anterior_id) values (?,?,?,?,?,?,?,?)',pessoa.id,t.conversa_id,t.tipo,a.estado,a.inicio,agora(app),t.teste,t.id).lastInsertRowid);
   exec(app.db,'update trabalho_tentativas set trabalho_id=?,classe=? where id=?',id,classe,a.id);exec(app.db,'update uso set trabalho_id=? where tentativa_id=?',id,a.id);exec(app.db,'update trabalho_verificacoes set trabalho_id=? where tentativa_id=?',id,a.id);exec(app.db,'update trabalho_eventos set trabalho_id=? where tentativa_id=?',id,a.id);
   exec(app.db,"update trabalhos set estado='nao_verificavel',concluido_em=null,atualizado_em=? where id=?",agora(app),t.id);
  }else{exec(app.db,'update trabalho_tentativas set classe=? where id=?',classe,a.id);if(classe==='correcao')exec(app.db,"update trabalhos set estado='pendente_verificacao',concluido_em=null where id=?",t.id);}});
  registrar(app,'work.classified',pessoa.id,{trabalho:t.id,tentativa:a.id,classe});return {ok:true};
 });
 r.put('/api/resultados/contas/:id',({pessoa,params,corpo})=>{if(app.tenant?!(pessoa.permissoes||[]).includes('user.update'):!pessoa.admin)throw erro(403,'user_update','É preciso permissão para administrar pessoas.');if(!['pessoa','tecnica','teste'].includes(corpo.categoria)||!um(app.db,'select 1 from pessoas where id=?',Number(params.id)))throw erro(400,'categoria','Conta ou categoria inválida.');exec(app.db,'insert into resultado_contas(pessoa_id,categoria) values (?,?) on conflict(pessoa_id) do update set categoria=excluded.categoria',Number(params.id),corpo.categoria);sincronizarContas(app);registrar(app,'usage.account_classified',pessoa.id,{pessoa:Number(params.id),categoria:corpo.categoria});return {ok:true};});
 r.get('/api/operador/resultados',({pessoa,query})=>{if(!ehOperador(app,pessoa))throw erro(403,'so_operador','Somente a Administração Geral.');return financeiroResultados(app);});
 r.post('/api/operador/resultados/estornos',({pessoa,corpo})=>{if(!ehOperador(app,pessoa))throw erro(403,'so_operador','Somente a Administração Geral.');return estornarResultado(app,pessoa,corpo);});
}

export function financeiroResultados(app){return {atualizado:agora(app),chamadas:todos(app.db,'select * from trabalho_chamadas order by id desc limit 200'),nota:'Retorno de custo e conciliação por geração são distintos da fatura. Componentes sem identificação de cobrança permanecem pendentes.',custoConfirmadoFatura:null,estimativasPorTentativa:todos(app.db,'select a.id tentativa,r.custo_estimado estimativa from trabalho_tentativas a join roteamento r on r.id=a.rota_id where r.custo_estimado is not null order by a.id desc limit 200'),custoReportado:um(app.db,'select sum(custo_reportado) n from trabalho_chamadas').n,custoConciliadoGeracao:um(app.db,'select sum(custo_conciliado) n from trabalho_chamadas').n,pendentes:um(app.db,"select count(*) n from trabalho_chamadas where estado='pendente'").n};}
export async function conciliarResultados(app){
 if(typeof app.ia.custoDaGeracao!=='function')throw erro(409,'sem_conciliacao','O provedor não disponibiliza consulta por geração.');
 let conciliadas=0;
 for(const c of todos(app.db,"select * from trabalho_chamadas where estado in('pendente','reportado') and geracao is not null limit 100")){
  if(c.tentativa_id&&!um(app.db,'select fim from trabalho_tentativas where id=?',c.tentativa_id)?.fim)continue;
  const custo=await app.ia.custoDaGeracao(c.geracao).catch(()=>null);if(!Number.isFinite(custo)||custo<0)continue;
  transacao(app.db,()=>{const atual=um(app.db,'select * from trabalho_chamadas where id=?',c.id);if(!['pendente','reportado'].includes(atual.estado))return;
   const a=um(app.db,'select a.*,t.conversa_id,t.teste from trabalho_tentativas a join trabalhos t on t.id=a.trabalho_id where a.id=?',c.tentativa_id);
   // Somente custos antes não informados: nunca soma novamente os custos já reportados.
   if(a&&atual.custo_reportado==null&&custo>0){const u=um(app.db,'select id from uso where tentativa_id=? order by id limit 1',a.id);if(u)exec(app.db,'update uso set custo=custo+? where id=?',custo,u.id);else exec(app.db,'insert into uso(em,pessoa_id,conversa_id,modelo_usado,custo,teste,trabalho_id,tentativa_id) values (?,?,?,?,?,?,?,?)',agora(app),a.pessoa_id,a.conversa_id,c.modelo,custo,a.teste,a.trabalho_id,a.id);}
   exec(app.db,"update trabalho_chamadas set custo_conciliado=?,conciliado_em=?,estado='conciliado' where id=?",custo,agora(app),c.id);
   exec(app.db,'update advanced_consumo set custo=? where geracao=? and custo is null',custo,c.geracao);conciliadas++;
  });
 }
 // Recupera a consolidação interrompida depois de o provedor informar o custo. Só tentativas encerradas.
 for(const a of todos(app.db,"select a.*,t.conversa_id,t.teste from trabalho_tentativas a join trabalhos t on t.id=a.trabalho_id where a.fim is not null")){transacao(app.db,()=>{const esperado=um(app.db,'select coalesce(sum(coalesce(custo_conciliado,custo_reportado,0)),0) n from trabalho_chamadas where tentativa_id=?',a.id).n,registrado=um(app.db,'select coalesce(sum(custo),0) n from uso where tentativa_id=?',a.id).n,diferenca=esperado-registrado;if(diferenca>1e-8){const u=um(app.db,'select id from uso where tentativa_id=? order by id limit 1',a.id);if(u)exec(app.db,'update uso set custo=custo+? where id=?',diferenca,u.id);else exec(app.db,'insert into uso(em,pessoa_id,conversa_id,custo,teste,trabalho_id,tentativa_id) values (?,?,?,?,?,?,?)',agora(app),a.pessoa_id,a.conversa_id,diferenca,a.teste,a.trabalho_id,a.id);}});}
 return {conciliadas,...financeiroResultados(app)};
}

export function estornarResultado(app,pessoa,corpo){if(!app.plano)throw erro(409,'sem_saldo','Esta instalação não tem controle de saldo de plano para confirmar o estorno.');const t=um(app.db,'select * from trabalhos where id=?',Number(corpo.trabalho));const n=Number(corpo.creditos),ref=String(corpo.referencia||'').trim();if(!t||!Number.isFinite(n)||n<=0||ref.length<5)throw erro(400,'estorno','Informe trabalho, créditos positivos e referência verificável.');const anterior=um(app.db,'select trabalho_id,creditos from resultado_ajustes_creditos where referencia=?',ref);if(anterior){if(anterior.trabalho_id!==t.id||anterior.creditos!==n)throw erro(409,'referencia_usada','Esta referência já identifica outro estorno.');return {ok:true,repetido:true};}
 if(Math.abs(n*10-Math.round(n*10))>1e-8)throw erro(400,'estorno','Use a precisão de 0,1 crédito do saldo.');
 const saldo=cred(um(app.db,'select coalesce(sum(custo),0) n from uso where trabalho_id=?',t.id).n)-um(app.db,"select coalesce(sum(creditos),0) n from resultado_ajustes_creditos where trabalho_id=? and natureza='estorno'",t.id).n;if(n>saldo)throw erro(409,'estorno','O estorno excede os créditos debitados ainda não estornados.');
 transacao(app.db,()=>{liberarPacote(app,pessoa,n,{produto:'cortesia',origem:'estorno',observacao:'Estorno de trabalho #'+t.id});exec(app.db,"insert into resultado_ajustes_creditos(pessoa_id,trabalho_id,em,creditos,referencia,natureza,origem) values (?,?,?,?,?,'estorno','pacote_confirmado')",t.pessoa_id,t.id,agora(app),n,ref);});return {ok:true};}

export function registrarDownloadResultado(app,pessoa,conversa,arquivo){
 const a=um(app.db,'select a.id,a.trabalho_id from trabalho_tentativas a join trabalhos t on t.id=a.trabalho_id join arquivos_gerados f on f.mensagem_id=a.resposta_id where t.pessoa_id=? and t.conversa_id=? and f.id=? order by a.id desc limit 1',pessoa.id,conversa,arquivo);
 if(a&&!um(app.db,"select 1 from trabalho_verificacoes where tentativa_id=? and criterio='download_http' and evidencia=?",a.id,JSON.stringify({arquivo})))exec(app.db,'insert into trabalho_verificacoes(trabalho_id,tentativa_id,em,categoria,criterio,resultado,limite,evidencia) values (?,?,?,?,?,?,?,?)',a.trabalho_id,a.id,agora(app),'tecnica','download_http','passou','Resposta HTTP do arquivo concluída pelo servidor. Não comprova abertura ou julgamento do conteúdo.',JSON.stringify({arquivo}));
}
