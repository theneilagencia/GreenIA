// Rotinas persistentes por empresa. A fila nunca depende de uma sessão do navegador.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { exec, um, todos, json, transacao } from './db.js';
import { carregarPessoa } from './auth.js';
import { erro } from './http.js';
import { lerConfig } from './config.js';
import { detectar, decidir, contemCredencial } from './filtro.js';
import { cifrar, decifrar } from './plataforma/segredo.js';
import { podeGerir } from './quickwins.js';
import { registrar } from './eventos.js';
import { cienciaPendente } from './politica.js';
import { executarPlano, lerPlano } from './integracoes/plano.js';
import { integracoesLigadas } from './integracoes/rotas.js';
import { creditosDe } from './plano.js';

const AGORA = app => app.agora().toISOString();
const ATIVOS = "('na_fila','executando','aguardando_aprovacao')";
const ESTADOS = new Set(['concluida','revisar','aguardando_material','aguardando_aprovacao','falhou','bloqueada','interrompida','cancelada']);
export function instalarProgramacao(app) {
  app.aoExcluirQuickWin = id => {
    transacao(app.db,()=>{
      exec(app.db,'update qw_programacoes set ativa=0 where quick_win_id=?',id);
      exec(app.db,"update qw_programadas_execucoes set status='cancelada',motivo='quick_win_indisponivel',finalizada_em=? where status='na_fila' and programacao_id in (select id from qw_programacoes where quick_win_id=?)",AGORA(app),id);
    });
  };
  // Revalidar antes de cada etapa externa, inclusive se o acesso mudou durante a resposta da IA.
  app.pessoaDaProgramacao = (conversaId,pessoa) => {
    const e=conversaId && um(app.db,`select programacao_id from qw_programadas_execucoes where conversa_id=? and status in ${ATIVOS}`,conversaId);
    if(!e)return pessoa;
    const s=porId(app,e.programacao_id);
    if(s.pessoa_id!==pessoa?.id)throw erro(403,'responsavel_inativo','A tarefa pertence a outro responsável.');
    return conferirRotina(app,s,{orcamento:false}).p;
  };
  app.aoReceberEventoProgramado = (webhook, entrega) => receberEventoProgramado(app, webhook, entrega);
}
const porId = (app, id) => um(app.db, 'select * from qw_programacoes where id = ?', String(id));
function pessoaAtual(app, id) { return app.pessoaParaProgramacao ? app.pessoaParaProgramacao(id) : carregarPessoa(app.db, id); }
function conferirPessoa(app, id) {
  const p = pessoaAtual(app, id);
  if (!p || (p.permissoes && !p.permissoes.includes('chat.use'))) throw erro(403,'responsavel_inativo','O responsável não tem acesso ativo para executar.');
  return p;
}
function qwAtual(app, pessoa, id) {
  const q = app.quickWins.paraUso(pessoa, id, false);
  if (!q || !q.versao_publicada || q.excluido_em || !['em_uso','em_avaliacao','aprovado','em_expansao'].includes(q.status)) throw erro(409,'quick_win_indisponivel','Teste e publique este Quick Win antes de programar.');
  return q;
}
function gerir(app, pessoa, id) {
  const q = um(app.db,'select * from quick_wins where id = ? and excluido_em is null', Number(id));
  if (!q || !podeGerir(app.db,pessoa,q) || (pessoa.permissoes && !pessoa.permissoes.includes('quickwin.manage'))) throw erro(403,'programacao','Só quem gerencia este Quick Win pode programar.');
  return q;
}
function validarEntrada(app,texto) {
  if (typeof texto !== 'string' || texto.length > 6000) throw erro(400,'entrada','Use até 6.000 caracteres para descrever o caso recorrente.');
  const cfg=lerConfig(app.db), tipos=detectar(texto);
  if (contemCredencial(texto) || decidir(tipos,cfg.acoesChat).bloqueados.length) throw erro(422,'entrada_bloqueada','O caso contém dados que não podem ser guardados ou enviados. Remova esses dados.');
  if (tipos.some(t => cfg.naoArmazenar.includes(t))) throw erro(422,'retencao','A política não permite guardar esses dados numa programação. Use uma fonte autorizada consultada na execução.');
  return texto.trim();
}
const formatadores=new Map();
function partes(d,fuso) {
  let f=formatadores.get(fuso); if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:fuso,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatadores.set(fuso,f);}
  return Object.fromEntries(f.formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
export function validarAgenda(a) {
  if (!a || !['diaria','semanal','mensal'].includes(a.frequencia) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.hora||'')) throw erro(400,'agenda','Escolha a frequência e um horário válido.');
  const fuso=String(a.fuso||'America/Sao_Paulo'); try{partes(new Date(),fuso);}catch{throw erro(400,'fuso','Escolha um fuso horário válido.');}
  const dia=Number(a.dia);
  if(a.frequencia==='semanal' && (!Number.isInteger(dia)||dia<0||dia>6)) throw erro(400,'agenda','Escolha o dia da semana.');
  if(a.frequencia==='mensal' && (!Number.isInteger(dia)||dia<1||dia>28)) throw erro(400,'agenda','Escolha um dia entre 1 e 28.');
  return {frequencia:a.frequencia,hora:a.hora,fuso,dia:a.frequencia==='diaria'?null:dia};
}
export function proximaOcorrencia(a,depois) {
  const p=partes(depois,a.fuso), [hora,minuto]=a.hora.split(':').map(Number);
  for(let i=0;i<370;i++){
    const dia=new Date(Date.UTC(p.year,p.month-1,p.day+i));
    if(a.frequencia==='semanal'&&dia.getUTCDay()!==a.dia || a.frequencia==='mensal'&&dia.getUTCDate()!==a.dia)continue;
    const alvo=Date.UTC(dia.getUTCFullYear(),dia.getUTCMonth(),dia.getUTCDate(),hora,minuto);let t=alvo;
    for(let n=0;n<4;n++){const l=partes(new Date(t),a.fuso);const local=Date.UTC(l.year,l.month-1,l.day,l.hour,l.minute);const delta=alvo-local;if(!delta)break;t+=delta;}
    const local=partes(new Date(t),a.fuso);
    if(t>depois.getTime()&&local.year===dia.getUTCFullYear()&&local.month===dia.getUTCMonth()+1&&local.day===dia.getUTCDate()&&local.hour===hora&&local.minute===minuto)return new Date(t).toISOString();
  }
  throw erro(400,'agenda','Não foi possível calcular a próxima execução.');
}
// O custo consolidado sobrevive à exclusão da conversa. Custos recuperados do provedor
// ainda associados à conversa também entram no limite, sem duplicar a contabilização.
const consumo = (app,s) => creditosDe(um(app.db,`select coalesce(sum(max(e.custo,coalesce((select sum(u.custo) from uso u where u.conversa_id=e.conversa_id),0))),0) as n from qw_programadas_execucoes e where e.programacao_id=? and substr(e.criada_em,1,7)=?`,s.id,AGORA(app).slice(0,7)).n);
function publico(app,p,s) {
  return {id:s.id,nome:s.nome,tipo:s.tipo,agenda:json(s.agenda,{}),webhook_id:s.webhook_id,ativa:!!s.ativa,proxima_em:s.proxima_em,versao_id:s.versao_id,
    responsavel:um(app.db,'select nome from pessoas where id=?',s.pessoa_id)?.nome||'Responsável',minha:s.pessoa_id===p.id,
    podeEditar:podeGerir(app.db,p,um(app.db,'select * from quick_wins where id=?',s.quick_win_id))&&(!p.permissoes||p.permissoes.includes('quickwin.manage')),
    limite_creditos:s.limite_creditos,creditos_usados:consumo(app,s),max_dia:s.max_dia,
    execucoes:todos(app.db,'select id,status,prevista_em,criada_em,finalizada_em,conversa_id,motivo from qw_programadas_execucoes where programacao_id=? order by criada_em desc,id desc limit 20',s.id).map(e=>({...e,conversa_id:s.pessoa_id===p.id?e.conversa_id:null}))};
}
function conferirRotina(app,s,{orcamento=true}={}) {
  const p=conferirPessoa(app,s.pessoa_id),q=qwAtual(app,p,s.quick_win_id);
  if(q.versao_publicada!==s.versao_id)throw erro(409,'versao_alterada','Uma nova versão foi publicada. Revise a programação antes de ativar novamente.');
  if(cienciaPendente(app,p))throw erro(409,'politica_alterada','O responsável precisa registrar ciência da política atual.');
  if(orcamento && consumo(app,s)>=s.limite_creditos)throw erro(409,'limite_programacao','O limite mensal desta programação foi atingido.');
  if(json(q.especificacao,{}).operacao?.integracoes?.length && !integracoesLigadas(app,p))throw erro(409,'evento_indisponivel','As integrações deste trabalho não estão disponíveis.');
  validarEntrada(app,decifrar(app.mestra(),json(s.entrada_cifrada,null)));
  if(s.tipo==='evento'){
    const w=um(app.db,'select * from webhook_configs where id=? and tenant_id=? and ativo=1',s.webhook_id,app.tenantId);
    if(!w||w.quick_win_id!==s.quick_win_id||!integracoesLigadas(app,p))throw erro(409,'evento_indisponivel','O evento autorizado não está disponível.');
  }
  return {p,q};
}
function enfileirar(app,s,chave,prevista) {
  // Uma rotina não se sobrepõe, nem acumula milhares de ocorrências durante indisponibilidade.
  if(um(app.db,`select 1 from qw_programadas_execucoes where programacao_id=? and status in ${ATIVOS}`,s.id))return null;
  const fuso=json(s.agenda,{}).fuso||'America/Sao_Paulo';
  const hoje=partes(app.agora(),fuso), mesmoDia=d=>{const p=partes(new Date(d),fuso);return p.year===hoje.year&&p.month===hoje.month&&p.day===hoje.day;};
  if(todos(app.db,'select criada_em from qw_programadas_execucoes where programacao_id=? and criada_em>=?',s.id,new Date(app.agora().getTime()-48*3600e3).toISOString()).filter(e=>mesmoDia(e.criada_em)).length>=s.max_dia)return null;
  const id=randomUUID();const r=exec(app.db,"insert or ignore into qw_programadas_execucoes(id,programacao_id,revisao,chave,status,prevista_em,criada_em) values(?,?,?,?,'na_fila',?,?)",id,s.id,s.revisao,chave,prevista,AGORA(app));
  return r.changes?id:null;
}
export function receberEventoProgramado(app,webhook,entrega) {
  for(const s of todos(app.db,"select * from qw_programacoes where ativa=1 and tipo='evento' and webhook_id=?",webhook))
    enfileirar(app,s,`evento:${s.id}:${webhook}:${entrega}`,AGORA(app));
}
function terminar(app,e,status,motivo=null) {
  if(!ESTADOS.has(status))throw new Error('estado inválido');
  exec(app.db,'update qw_programadas_execucoes set status=?,motivo=?,finalizada_em=?,notificada=0,custo=max(custo,coalesce((select sum(custo) from uso where conversa_id=?),0)) where id=?',status,motivo,AGORA(app),e.conversa_id,e.id);
  registrar(app,'quickwin.scheduled_finished',null,{execucao:e.id,programacao:e.programacao_id,status,motivo});
}
export function recuperarProgramadas(app) {
  // Efeito externo pode ter ocorrido antes da queda. Nunca repetir uma ação de resultado incerto.
  for(const e of todos(app.db,"select * from qw_programadas_execucoes where status='executando'")){
    const respondeu=e.conversa_id && um(app.db,"select 1 from mensagens where conversa_id=? and papel='assistant'",e.conversa_id);
    const plano=e.conversa_id && um(app.db,"select status from integ_planos where conversa_id=? order by criado_em desc limit 1",e.conversa_id);
    if(respondeu && (!plano||plano.status==='concluido'))terminar(app,e,'revisar','recuperada_apos_reinicio');
    else {terminar(app,e,'interrompida','reinicio_durante_execucao');exec(app.db,'update qw_programacoes set ativa=0 where id=?',e.programacao_id);}
  }
}
class SaidaServidor extends EventEmitter {
  writableEnded=false; fim=null; falhou=false;
  writeHead() {}
  write(linha) {const v=JSON.parse(String(linha));if(v.t==='fim')this.fim=v;if(v.t==='erro')this.falhou=true;return true;}
  end(){this.writableEnded=true;this.emit('finish');}
}
async function avisar(app,e,s) {
  if(e.notificada)return;
  const p=pessoaAtual(app,s.pessoa_id);
  // Nenhum conteúdo, nome do trabalho ou dado do sistema sai na notificação.
  exec(app.db,'update qw_programadas_execucoes set notificada=1 where id=?',e.id);
  if(!p)return;
  try{await app.email.enviar(p.email,'Atualização de tarefa programada','Uma tarefa programada foi atualizada. Entre no ambiente da sua empresa e abra Quick Wins para consultar o status e as pendências. O conteúdo fica na plataforma.');}
  catch{registrar(app,'quickwin.scheduled_notification_failed',p.id,{execucao:e.id});}
}
export async function rodadaProgramadas(app) {
  if(app._programadasRodando)return;
  app._programadasRodando=true;
  try{
    // Prazo e nova agenda são gravados na mesma transação da inclusão na fila.
    transacao(app.db,()=>{for(const s of todos(app.db,"select * from qw_programacoes where ativa=1 and tipo='horario' and proxima_em<=? order by proxima_em limit 20",AGORA(app))){enfileirar(app,s,`horario:${s.id}:${s.revisao}:${s.proxima_em}`,s.proxima_em);exec(app.db,'update qw_programacoes set proxima_em=? where id=?',proximaOcorrencia(json(s.agenda,{}),app.agora()),s.id);}});
    const e=um(app.db,"select * from qw_programadas_execucoes where status='na_fila' order by criada_em,id limit 1");
    if(e){const s=porId(app,e.programacao_id);let release=null;
      try{
        if(!s?.ativa||s.revisao!==e.revisao) {terminar(app,e,'cancelada','programacao_pausada_ou_alterada');return;}
        const {p}=conferirRotina(app,s);
        release=app.reservarProgramacao?.();
        if(release===false)return;
        if(!exec(app.db,"update qw_programadas_execucoes set status='executando',iniciada_em=? where id=? and status='na_fila'",AGORA(app),e.id).changes)return;
        const {conversa:conv}=app.criarConversaProgramada(p)(s.quick_win_id);
        exec(app.db,'update qw_programadas_execucoes set conversa_id=? where id=?',conv.id,e.id);e.conversa_id=conv.id;
        const res=new SaidaServidor();
        await app.executarConversaProgramada({pessoa:p,params:{id:String(conv.id)},corpo:{texto:decifrar(app.mestra(),json(s.entrada_cifrada,null)),executar_quick_win:true},res});
        const st=res.falhou||!res.fim?'falhou':res.fim.qualidade?.status==='pergunta'?'aguardando_material':res.fim.integracoes?.status==='aguardando_aprovacao'?'aguardando_aprovacao':(res.fim.integracoes||res.fim.qualidade?.integracoes) && (res.fim.integracoes||res.fim.qualidade.integracoes).status!=='concluido'?'revisar':res.fim.qualidade?.status && !['aprovado','corrigido'].includes(res.fim.qualidade.status)?'revisar':'concluida';
        terminar(app,e,st,st==='falhou'?'execucao_falhou':null);
        if(['aguardando_material','falhou'].includes(st) || ['FAILED','BLOCKED','falhou','bloqueado','parcial'].includes((res.fim?.integracoes||res.fim?.qualidade?.integracoes)?.status))exec(app.db,'update qw_programacoes set ativa=0 where id=?',s.id);
      }catch(x){terminar(app,e,'bloqueada',['responsavel_inativo','quick_win_indisponivel','versao_alterada','politica_alterada','limite_programacao','entrada_bloqueada','retencao','evento_indisponivel','plano','sem_creditos','empresa_indisponivel'].includes(x.codigo)?x.codigo:'execucao_bloqueada');if(s)exec(app.db,'update qw_programacoes set ativa=0 where id=?',s.id);}
      finally{if(typeof release==='function')release();}
    }
    // Retoma somente etapas aprovadas do MESMO plano, com as mesmas entradas e políticas atuais.
    for(const pendente of todos(app.db,"select * from qw_programadas_execucoes where status='aguardando_aprovacao' order by criada_em limit 10")){
      const s=porId(app,pendente.programacao_id);if(!s?.ativa)continue;
      try{
        const {p}=conferirRotina(app,s,{orcamento:false});
        const row=um(app.db,'select id from integ_planos where conversa_id=? and tenant_id=? order by criado_em desc limit 1',pendente.conversa_id,app.tenantId);if(!row){terminar(app,pendente,'interrompida','plano_indisponivel');exec(app.db,'update qw_programacoes set ativa=0 where id=?',s.id);continue;}
        const plano=lerPlano(app,row.id);const aps=Object.values(plano.estado.passos).map(v=>v.aprovacao).filter(Boolean);
        if(!aps.length)continue;
        const decisoes=aps.map(id=>{const a=um(app.db,'select status,resumo from integration_approvals where id=? and tenant_id=?',id,app.tenantId);const expira=json(a?.resumo,{}).expira_em;return expira&&Date.parse(expira)<=app.agora().getTime()?'invalidada':a?.status;});
        if(decisoes.some(d=>!d||d==='invalidada')){terminar(app,pendente,'bloqueada','aprovacao_expirada_ou_invalidada');exec(app.db,'update qw_programacoes set ativa=0 where id=?',s.id);continue;}
        if(decisoes.some(d=>d==='negada')){terminar(app,pendente,'bloqueada','aprovacao_negada');exec(app.db,'update qw_programacoes set ativa=0 where id=?',s.id);continue;}
        if(decisoes.some(d=>d!=='aprovada'))continue;
        exec(app.db,"update qw_programadas_execucoes set status='executando' where id=?",pendente.id);
        const r=await executarPlano(app,p,row.id,{}, {lookup:app.dnsLookup});
        if(r.status==='aguardando_aprovacao')exec(app.db,"update qw_programadas_execucoes set status='aguardando_aprovacao' where id=?",pendente.id);
        if(r.status!=='aguardando_aprovacao')terminar(app,pendente,r.status==='concluido'?'concluida':'revisar');
      }catch{terminar(app,pendente,'bloqueada','retomada_bloqueada');exec(app.db,'update qw_programacoes set ativa=0 where id=?',s.id);}
    }
    for(const e of todos(app.db,"select * from qw_programadas_execucoes where status not in ('na_fila','executando') and notificada=0 order by criada_em limit 10")){const s=porId(app,e.programacao_id);if(s)await avisar(app,e,s);}
  }finally{app._programadasRodando=false;}
}
export function iniciarProgramadas(app){recuperarProgramadas(app);const t=setInterval(()=>rodadaProgramadas(app).catch(()=>app.log?.('programações','falha na rodada')),30000);t.unref();return ()=>clearInterval(t);}

export function rotasProgramacao(app,r) {
  instalarProgramacao(app);
  r.get('/api/quick-wins-programados',({pessoa})=>({programacoes:todos(app.db,'select s.*,q.nome as quick_win from qw_programacoes s join quick_wins q on q.id=s.quick_win_id where q.excluido_em is null order by s.criado_em desc').filter(s=>!!app.quickWins.paraUso(pessoa,s.quick_win_id,false)).map(s=>({...publico(app,pessoa,s),quick_win_id:s.quick_win_id,quick_win:s.quick_win}))}));
  r.get('/api/quick-wins/:id/programacoes/:programacao/configuracao',({pessoa,params})=>{
    gerir(app,pessoa,params.id);const s=porId(app,params.programacao);if(!s||s.quick_win_id!==Number(params.id)||s.pessoa_id!==pessoa.id)throw erro(404,'programacao','Só o responsável pode editar o caso recorrente.');
    return {...publico(app,pessoa,s),entrada:decifrar(app.mestra(),json(s.entrada_cifrada,null))};
  });
  r.patch('/api/quick-wins/:id/programacoes/:programacao',({pessoa,params,corpo})=>{
    gerir(app,pessoa,params.id);const s=porId(app,params.programacao);if(!s||s.quick_win_id!==Number(params.id)||s.pessoa_id!==pessoa.id)throw erro(404,'programacao','Só o responsável pode editar esta programação.');
    if(um(app.db,`select 1 from qw_programadas_execucoes where programacao_id=? and status in ('executando','aguardando_aprovacao')`,s.id))throw erro(409,'ocupada','Pause e conclua a execução pendente antes de editar.');
    const q=qwAtual(app,pessoa,s.quick_win_id),agenda=s.tipo==='horario'?validarAgenda(corpo.agenda):{};
    const limite=Number(corpo.limite_creditos),max=Number(corpo.max_dia||1);
    if(!Number.isFinite(limite)||limite<1||limite>100000||!Number.isInteger(max)||max<1||max>24)throw erro(400,'limite','Defina limites válidos.');
    const entrada=JSON.stringify(cifrar(app.mestra(),validarEntrada(app,corpo.entrada||'')));
    transacao(app.db,()=>{exec(app.db,'update qw_programacoes set nome=?,agenda=?,entrada_cifrada=?,limite_creditos=?,max_dia=?,versao_id=?,revisao=revisao+1,ativa=0,proxima_em=?,atualizado_em=? where id=?',String(corpo.nome||s.nome).trim().slice(0,80),JSON.stringify(agenda),entrada,limite,max,q.versao_publicada,s.tipo==='horario'?proximaOcorrencia(agenda,app.agora()):null,AGORA(app),s.id);exec(app.db,"update qw_programadas_execucoes set status='cancelada',motivo='programacao_alterada',finalizada_em=? where programacao_id=? and status='na_fila'",AGORA(app),s.id);});
    registrar(app,'quickwin.schedule_updated',pessoa.id,{programacao:s.id,versao:q.versao_publicada});return publico(app,pessoa,porId(app,s.id));
  });
  r.get('/api/quick-wins/:id/programacoes',({pessoa,params})=>{
    const q=app.quickWins.paraUso(pessoa,Number(params.id),false);if(!q)throw erro(404,'quick_win','Quick Win não encontrado.');
    const podeEditar=podeGerir(app.db,pessoa,q)&&(!pessoa.permissoes||pessoa.permissoes.includes('quickwin.manage'));
    return {podeEditar,programacoes:todos(app.db,'select * from qw_programacoes where quick_win_id=? order by criado_em desc',q.id).map(s=>publico(app,pessoa,s)),
      eventos:podeEditar&&integracoesLigadas(app,pessoa)?todos(app.db,'select id,evento from webhook_configs where quick_win_id=? and tenant_id=? and ativo=1',q.id,app.tenantId):[]};
  });
  r.post('/api/quick-wins/:id/programacoes',({pessoa,params,corpo})=>{
    gerir(app,pessoa,params.id);const q=qwAtual(app,pessoa,Number(params.id));
    if(pessoa.adminPlataforma)throw erro(403,'responsavel','Use uma pessoa da empresa como responsável, fora do acesso temporário de suporte.');
    if(cienciaPendente(app,pessoa))throw erro(409,'politica_alterada','Registre ciência da política atual antes de programar.');
    if(um(app.db,'select count(*) as n from qw_programacoes where quick_win_id=?',q.id).n>=10)throw erro(409,'limite','Este Quick Win já tem 10 programações.');
    const tipo=corpo.tipo;if(!['horario','evento'].includes(tipo))throw erro(400,'tipo','Escolha horário ou evento.');
    const agenda=tipo==='horario'?validarAgenda(corpo.agenda):{};
    const creditos=Number(corpo.limite_creditos),maxDia=Number(corpo.max_dia||1);
    if(!Number.isFinite(creditos)||creditos<1||creditos>100000||!Number.isInteger(maxDia)||maxDia<1||maxDia>24)throw erro(400,'limite','Defina um limite mensal de créditos e até 24 execuções por dia.');
    const s={id:randomUUID(),quick_win_id:q.id,versao_id:q.versao_publicada,pessoa_id:pessoa.id,nome:String(corpo.nome||'Rotina da equipe').trim().slice(0,80)||'Rotina da equipe',tipo,agenda:JSON.stringify(agenda),webhook_id:tipo==='evento'?String(corpo.webhook_id||''):null,entrada_cifrada:JSON.stringify(cifrar(app.mestra(),validarEntrada(app,corpo.entrada||''))),limite_creditos:creditos,max_dia:maxDia};
    conferirRotina(app,s);
    exec(app.db,'insert into qw_programacoes(id,quick_win_id,versao_id,pessoa_id,nome,tipo,agenda,webhook_id,entrada_cifrada,ativa,proxima_em,limite_creditos,max_dia,criado_em,atualizado_em) values(?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)',s.id,s.quick_win_id,s.versao_id,s.pessoa_id,s.nome,s.tipo,s.agenda,s.webhook_id,s.entrada_cifrada,tipo==='horario'?proximaOcorrencia(agenda,app.agora()):null,creditos,maxDia,AGORA(app),AGORA(app));
    registrar(app,'quickwin.schedule_created',pessoa.id,{programacao:s.id,quick_win:q.id,tipo,versao:s.versao_id});return publico(app,pessoa,porId(app,s.id));
  });
  r.post('/api/quick-wins/:id/programacoes/:programacao/estado',({pessoa,params,corpo})=>{
    gerir(app,pessoa,params.id);const s=porId(app,params.programacao);if(!s||s.quick_win_id!==Number(params.id))throw erro(404,'programacao','Programação não encontrada.');
    if(typeof corpo.ativa!=='boolean')throw erro(400,'estado','Informe se deseja ativar ou pausar.');
    if(corpo.ativa){if(s.pessoa_id!==pessoa.id)throw erro(403,'responsavel','Só o responsável pode ativar esta programação.');conferirRotina(app,s);}
    transacao(app.db,()=>{exec(app.db,'update qw_programacoes set ativa=?,proxima_em=?,atualizado_em=? where id=?',Number(corpo.ativa),s.tipo==='horario'?proximaOcorrencia(json(s.agenda,{}),app.agora()):null,AGORA(app),s.id);
      if(!corpo.ativa)exec(app.db,"update qw_programadas_execucoes set status='cancelada',motivo='programacao_pausada',finalizada_em=? where programacao_id=? and status='na_fila'",AGORA(app),s.id);});
    registrar(app,'quickwin.schedule_state_changed',pessoa.id,{programacao:s.id,ativa:corpo.ativa});return publico(app,pessoa,porId(app,s.id));
  });
  r.post('/api/quick-wins/:id/programacoes/:programacao/executar',({pessoa,params})=>{
    gerir(app,pessoa,params.id);const s=porId(app,params.programacao);if(!s||s.quick_win_id!==Number(params.id))throw erro(404,'programacao','Programação não encontrada.');
    if(s.pessoa_id!==pessoa.id)throw erro(403,'responsavel','Só o responsável pode iniciar esta programação.');
    conferirRotina(app,s);if(!s.ativa)throw erro(409,'pausada','Ative a programação antes de executar.');
    const id=enfileirar(app,s,`manual:${s.id}:${randomUUID()}`,AGORA(app));if(!id)throw erro(409,'ocupada','Já há uma execução pendente ou o limite diário foi atingido.');return {id,status:'na_fila'};
  });
}
