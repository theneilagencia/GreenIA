// Resumos por permissão. Nunca lê nem expõe conteúdo das conversas ao gestor.
import { createHash } from 'node:crypto';
import { erro } from './http.js';
import { todos, um, exec, json } from './db.js';
import { lerConfig } from './config.js';
import { podeGerir } from './quickwins.js';
import { metadados } from './governanca-conhecimento.js';
import { pedidosConexao } from './qw-preparacao.js';
import { integracoesLigadas } from './integracoes/rotas.js';
import { resolverNecessidades } from './integracoes/plano.js';
import { registrar } from './eventos.js';
export const permitido=(app,p,perm)=>app.tenant?(p.permissoes||[]).includes(perm):!!p.admin;
const dias=s=>s?(Date.now()-Date.parse(s))/864e5:Infinity;
function vinculos(db,id) {return {areas:todos(db,'select a.nome,ap.area_id,ap.admin_base,ap.responsavel from area_pessoas ap join areas a on a.id = ap.area_id where ap.pessoa_id = ? order by ap.area_id',id),grupos:todos(db,'select g.id,g.nome from grupo_pessoas gp join grupos g on g.id = gp.grupo_id where gp.pessoa_id = ? order by g.id',id)};}
function assinatura(p,v,tenant) {return createHash('sha256').update(JSON.stringify({ativo:p.ativo,...(!tenant?{papel:p.papel}:{}),areas:v.areas,grupos:v.grupos})).digest('hex');}
export function rotasAcompanhamento(app,r) {
 const exigir=(p,perm)=>{if(!permitido(app,p,perm)) throw erro(403,'sem_permissao','Você não tem permissão para esta consulta.');};
 r.get('/api/acompanhamento',({pessoa})=>{
  const passos=[],pendencias=[];
  const passo=(id,titulo,pronto,descricao,href)=>passos.push({id,titulo,pronto:!!pronto,descricao,href});
  if(permitido(app,pessoa,'user.read')) {
   const n=um(app.db,'select count(*) as n from pessoas where ativo = 1').n;
   passo('pessoas','Prepare as pessoas e áreas',n>1,`${n} pessoas ativas no ambiente. Confira os vínculos e acessos.`,app.tenant?'#/empresa/usuarios':'#/pessoas');
   const rs=todos(app.db,'select p.*,r.em,r.assinatura from pessoas p left join revisoes_acesso r on r.pessoa_id = p.id where p.ativo = 1');
   const faltam=rs.filter(p=>dias(p.em)>90||p.assinatura!==assinatura(p,vinculos(app.db,p.id),!!app.tenant)).length;
   if(faltam) pendencias.push({tipo:'acessos',titulo:`${faltam} acessos locais para revisar`,texto:'Confira áreas, grupos e administração das bases. Perfis da plataforma são revisados na tela Usuários.',href:'#/revisao-acessos'});
  }
  if(permitido(app,pessoa,'models.manage')) passo('recursos','Confira os recursos de IA',um(app.db,'select count(*) as n from modelos where liberado = 1').n>0,'Verifique os níveis disponíveis e os recursos autorizados para sigilo.','#/modelos');
  if(permitido(app,pessoa,'policy.manage')) {
   const pol=um(app.db,'select max(versao) as v from politica_versoes');
   passo('politica','Confira a política de uso',!!pol?.v,'Texto disponível não significa que a equipe já registrou ciência.','#/politicas/texto');
  }
  const ds=todos(app.db,'select * from documentos where quick_win_id is null').filter(d=>d.toda_empresa?pessoa.admin:pessoa.admin||pessoa.areas.some(a=>a.id===d.area_id&&a.adminBase)).map(d=>metadados(app.db,d));
  if(pessoa.admin||pessoa.areas.some(a=>a.adminBase)) {
   passo('conhecimento','Prepare as fontes da equipe',ds.some(d=>d.vigente),'Adicione e revise documentos nas bases que você administra.','#/conhecimento');
   const revisar=ds.filter(d=>!d.vigente||dias(d.revisado_em)>180||!d.responsavel_id);
   for(const d of revisar.slice(0,40)) pendencias.push({tipo:'conhecimento',titulo:d.titulo,texto:d.suspenso?'Documento suspenso.':!d.vigente?'Validade encerrada.':!d.responsavel_id?'Defina quem mantém este documento.':'Conteúdo pede revisão.',href:'#/conhecimento'});
  }
  const qs=todos(app.db,'select * from quick_wins where excluido_em is null').filter(q=>podeGerir(app.db,pessoa,q));
  if(qs.length||pessoa.admin||pessoa.areas.some(a=>a.responsavel)) {
   passo('quickwins','Teste e publique uma tarefa',qs.some(q=>q.versao_publicada&&['em_uso','aprovado','em_expansao'].includes(q.status)),'Comece com uma tarefa clara. Publicação não comprova benefício para o negócio.','#/quick-wins');
   for(const q of qs.filter(q=>['em_configuracao','em_teste','em_avaliacao'].includes(q.status)).slice(0,30)) pendencias.push({tipo:'quickwin',titulo:q.nome,texto:q.status==='em_avaliacao'?'Registre uma decisão sobre este Quick Win.':'Conclua a preparação e confira o teste.',href:`#/qw/${q.id}`});
  }
  if(integracoesLigadas(app,pessoa)&&permitido(app,pessoa,'integrations.manage')) {
   for(const p of pedidosConexao(app).filter(p=>p.status==='pendente')) pendencias.push({tipo:'integracao',titulo:`Preparar conexão: ${p.trabalho}`,texto:'A equipe pediu acesso a um sistema para este trabalho. Confira as ações e prepare a conexão autorizada.',href:'#/integracoes'});
   const cs=todos(app.db,'select id,nome,status from connectors where tenant_id = ?',app.tenantId);
   passo('integracoes','Confira as integrações, se necessárias',cs.some(c=>c.status==='ACTIVE'),'Esta etapa é opcional. Qualquer escrita continua exigindo aprovação.','#/integracoes');
   cs.filter(c=>['FAILED','REVIEW_REQUIRED','PAUSED'].includes(c.status)).slice(0,20).forEach(c=>pendencias.push({tipo:'integracao',titulo:c.nome,texto:`Integração ${c.status==='FAILED'?'com falha':c.status==='PAUSED'?'pausada':'aguardando aprovação'}.`,href:`#/integracoes/c/${c.id}`}));
  }
  if(integracoesLigadas(app,pessoa)&&permitido(app,pessoa,'integrations.approve')) {
   const n=um(app.db,"select count(*) as n from integration_approvals where tenant_id = ? and status = 'pendente'",app.tenantId).n;
   if(n) pendencias.push({tipo:'aprovacao',titulo:`${n} aprovações pendentes`,texto:'Revise a ação e seus efeitos antes de autorizar.',href:'#/integracoes'});
  }
  if(permitido(app,pessoa,'audit.read')) {
   const n=um(app.db,'select count(*) as n from problemas where resolvido = 0').n;
   if(n) pendencias.push({tipo:'problema',titulo:`${n} problemas reportados`,texto:'Consulte os relatos e acompanhe a resolução.',href:'#/atividade'});
   const ev=um(app.db,"select em from eventos where tipo = 'governance.blocked' order by id desc limit 1");
   if(ev&&dias(ev.em)<7) pendencias.push({tipo:'governanca',titulo:'Bloqueio de governança registrado recentemente',texto:'Consulte a Atividade para verificar a causa. Este aviso não significa que o bloqueio continua ativo.',href:'#/atividade'});
  }
  return {passos,pendencias,atualizado_em:app.agora().toISOString()};
 });
 r.get('/api/acompanhamento/integracoes/:id',({pessoa,params})=>{
  exigir(pessoa,'integrations.manage');if(!integracoesLigadas(app,pessoa))throw erro(404,'integracao','Integração não encontrada.');
  if(!um(app.db,'select 1 from connectors where id = ? and tenant_id = ?',params.id,app.tenantId))throw erro(404,'integracao','Integração não encontrada.');
  const qs=todos(app.db,'select * from quick_wins where excluido_em is null').filter(q=>podeGerir(app.db,pessoa,q));
  return {quickWins:qs.map(q=>{
    const v=q.versao_publicada?um(app.db,'select especificacao from quick_win_versoes where id = ?',q.versao_publicada):null;
    const e=json(v?.especificacao||q.especificacao,{});
    const vinculado=resolverNecessidades(app,e.operacao?.integracoes||[],{pessoa,quickWinId:q.id}).some(n=>n.connector_id===params.id);
    const historico=!!um(app.db,'select 1 from connector_runs where tenant_id = ? and connector_id = ? and quick_win_id = ? limit 1',app.tenantId,params.id,q.id);
    return {id:q.id,nome:q.nome,vinculado,historico};
  }).filter(q=>q.vinculado||q.historico)};
 });
 r.get('/api/acompanhamento/acessos',({pessoa})=>{
  exigir(pessoa,'user.read');
  return {podeRevisar:permitido(app,pessoa,'user.update'),plataforma:!!app.tenant,pessoas:todos(app.db,'select id,nome,email,ativo,papel from pessoas order by ativo desc,nome').map(p=>{
   const v=vinculos(app.db,p.id),rev=um(app.db,'select r.em,r.observacao,p.nome as por,r.assinatura from revisoes_acesso r left join pessoas p on p.id = r.revisado_por where r.pessoa_id = ?',p.id);
   return {...p,...(app.tenant?{papel:undefined}:{}),...v,revisao:rev?{em:rev.em,por:rev.por,observacao:rev.observacao}:null,pendente:p.ativo===1&&(dias(rev?.em)>90||rev?.assinatura!==assinatura(p,v,!!app.tenant))};
  })};
 });
 r.post('/api/acompanhamento/acessos/:id/revisar',({pessoa,params,corpo})=>{
  exigir(pessoa,'user.update');const p=um(app.db,'select * from pessoas where id = ?',Number(params.id));if(!p) throw erro(404,'pessoa','Pessoa não encontrada.');
  const observacao=String(corpo.observacao||'').trim().slice(0,500);if(!observacao) throw erro(400,'observacao','Registre o que foi conferido.');
  exec(app.db,'insert into revisoes_acesso (pessoa_id,em,revisado_por,assinatura,observacao) values (?,?,?,?,?) on conflict(pessoa_id) do update set em=excluded.em,revisado_por=excluded.revisado_por,assinatura=excluded.assinatura,observacao=excluded.observacao',p.id,app.agora().toISOString(),pessoa.id,assinatura(p,vinculos(app.db,p.id),!!app.tenant),observacao);
  registrar(app,'access.reviewed',pessoa.id,{pessoa:p.id,escopo:'areas_grupos_bases',observacao});return {ok:true};
 });
}
