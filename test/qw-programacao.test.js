import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subir} from './ajuda.js';
import {exec,um,todos} from '../src/db.js';
import {salvarConfig} from '../src/config.js';
import {construir} from '../src/quickwin-construtor.js';
import {rodadaProgramadas,recuperarProgramadas,proximaOcorrencia,validarAgenda} from '../src/qw-programacao.js';
import {criarWebhook,receberWebhook,assinar} from '../src/integracoes/webhooks.js';
import {creditosDe} from '../src/plano.js';

async function fixture(t,op={}){
 let agora=new Date('2026-10-06T10:00:00Z');const S=await subir({...op,agora:()=>agora});t.after(()=>S.fechar());
 salvarConfig(S.app.db,{dominios:['exemplo.com.br']});const a=await S.cliente().entrar('admin@exemplo.com.br');
 const q=(await a.post('/api/quick-wins',{nome:'Resumo da equipe',toda_empresa:true})).dados;
 const spec=construir({descricao:'Organizar o resumo semanal com as informações fornecidas',formato:'texto'});
 const v=exec(S.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,JSON.stringify(spec),q.nome,agora.toISOString()).lastInsertRowid;
 exec(S.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",JSON.stringify(spec),v,q.id);
 const corpo={nome:'Resumo semanal',tipo:'horario',agenda:{frequencia:'diaria',hora:'08:00',fuso:'America/Sao_Paulo'},entrada:'Organize os seguintes pontos fictícios: equipe concluiu três revisões; próximo passo é conferir as pendências.',limite_creditos:100,max_dia:2};
 const criar=async extra=>{const r=await a.post(`/api/quick-wins/${q.id}/programacoes`,{...corpo,...extra});assert.equal(r.status,200,JSON.stringify(r.dados));return r.dados;};
 const base=s=>`/api/quick-wins/${q.id}/programacoes/${s.id}`;
 const ativar=s=>a.post(base(s)+'/estado',{ativa:true});
 return {...S,a,q,corpo,criar,base,ativar,relogio:d=>{agora=new Date(d);}};
}
test('agenda usa fuso local, semana, mês e ignora horário inexistente',()=>{
 const diaria=validarAgenda({frequencia:'diaria',hora:'08:00',fuso:'America/Sao_Paulo'});
 assert.equal(proximaOcorrencia(diaria,new Date('2026-10-06T10:00:00Z')),'2026-10-06T11:00:00.000Z');
 assert.equal(proximaOcorrencia(diaria,new Date('2026-10-06T11:00:00Z')),'2026-10-07T11:00:00.000Z');
 assert.equal(proximaOcorrencia({...diaria,frequencia:'semanal',dia:1},new Date('2026-10-06T10:00:00Z')),'2026-10-12T11:00:00.000Z');
 assert.equal(proximaOcorrencia({...diaria,frequencia:'mensal',dia:5},new Date('2026-10-06T10:00:00Z')),'2026-11-05T11:00:00.000Z');
 assert.equal(proximaOcorrencia({frequencia:'diaria',hora:'02:30',fuso:'America/New_York'},new Date('2026-03-08T00:00:00Z')),'2026-03-09T06:30:00.000Z');
 assert.throws(()=>validarAgenda({frequencia:'mensal',hora:'08:00',dia:31}));assert.throws(()=>validarAgenda({...diaria,fuso:'invalido'}));
});
test('programação nasce pausada, protege entrada e executa no servidor sem navegador',async t=>{
 const S=await fixture(t),s=await S.criar();assert.equal(s.ativa,false);
 const db=um(S.app.db,'select * from qw_programacoes where id=?',s.id);assert.ok(db.entrada_cifrada);assert.doesNotMatch(db.entrada_cifrada,/três revisões/);assert.equal(s.entrada,undefined);
 S.relogio('2026-10-06T11:01:00Z');await rodadaProgramadas(S.app);assert.equal(todos(S.app.db,'select * from qw_programadas_execucoes').length,0);
 assert.equal((await S.ativar(s)).status,200);S.relogio('2026-10-07T11:01:00Z');await rodadaProgramadas(S.app);
 const e=um(S.app.db,'select * from qw_programadas_execucoes');assert.ok(e.conversa_id,JSON.stringify(e));assert.ok(['concluida','revisar','aguardando_material'].includes(e.status),JSON.stringify(e));
 assert.ok(um(S.app.db,"select 1 from mensagens where conversa_id=? and papel='assistant'",e.conversa_id));
 await rodadaProgramadas(S.app);assert.equal(um(S.app.db,'select count(*) n from qw_programadas_execucoes').n,1);
 const aviso=S.app.email.enviados.find(e=>e.assunto==='Atualização de tarefa programada');assert.ok(aviso);assert.doesNotMatch(JSON.stringify(aviso),/três revisões|Resumo semanal/);
});
test('equipe vê status mas não entrada nem conversa do responsável; usuário comum não programa',async t=>{
 const S=await fixture(t);await S.a.post('/api/admin/pessoas',{email:'usuario@exemplo.com.br',nome:'Usuário',areas:[]});const u=await S.cliente().entrar('usuario@exemplo.com.br');const s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});await rodadaProgramadas(S.app);
 const r=await u.get(`/api/quick-wins/${S.q.id}/programacoes`);assert.equal(r.status,200);assert.equal(r.dados.programacoes[0].execucoes[0].conversa_id,null);assert.doesNotMatch(JSON.stringify(r.dados),/três revisões/);
 assert.equal((await u.post(`/api/quick-wins/${S.q.id}/programacoes`,S.corpo)).status,403);assert.equal((await u.get(S.base(s)+'/configuracao')).status,403);
});
test('mudança de versão e revogação do responsável bloqueiam a fila antes de inferir',async t=>{
 const S=await fixture(t),s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});exec(S.app.db,'update quick_wins set versao_publicada=versao_publicada+1 where id=?',S.q.id);await rodadaProgramadas(S.app);
 let e=um(S.app.db,'select * from qw_programadas_execucoes');assert.equal(e.status,'bloqueada');assert.equal(e.motivo,'versao_alterada');assert.equal(e.conversa_id,null);
 exec(S.app.db,'update quick_wins set versao_publicada=versao_publicada-1 where id=?',S.q.id);const s2=await S.criar();await S.ativar(s2);await S.a.post(S.base(s2)+'/executar',{});S.app.pessoaParaProgramacao=()=>null;await rodadaProgramadas(S.app);e=um(S.app.db,'select * from qw_programadas_execucoes where programacao_id=?',s2.id);assert.equal(e.motivo,'responsavel_inativo');assert.equal(e.conversa_id,null);
});
test('limite persiste após excluir a conversa; rotina não se sobrepõe',async t=>{
 const S=await fixture(t),s=await S.criar({limite_creditos:1});await S.ativar(s);assert.equal((await S.a.post(S.base(s)+'/executar',{})).status,200);assert.equal((await S.a.post(S.base(s)+'/executar',{})).status,409);await rodadaProgramadas(S.app);
 const e=um(S.app.db,'select * from qw_programadas_execucoes');exec(S.app.db,'update qw_programadas_execucoes set custo=2,status=\'concluida\' where id=?',e.id);exec(S.app.db,'delete from conversas where id=?',e.conversa_id);
 const r=await S.a.get(`/api/quick-wins/${S.q.id}/programacoes`);assert.equal(r.dados.programacoes[0].creditos_usados,creditosDe(2));assert.equal((await S.a.post(S.base(s)+'/executar',{})).status,409);
});
test('reinício preserva fila e pausa ação incerta sem repetir efeito externo',async t=>{
 const S=await fixture(t),s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});recuperarProgramadas(S.app);assert.equal(um(S.app.db,'select status from qw_programadas_execucoes').status,'na_fila');
 exec(S.app.db,"update qw_programadas_execucoes set status='executando'");recuperarProgramadas(S.app);assert.equal(um(S.app.db,'select status from qw_programadas_execucoes').status,'interrompida');assert.equal(um(S.app.db,'select ativa from qw_programacoes').ativa,0);await rodadaProgramadas(S.app);assert.equal(um(S.app.db,'select count(*) n from conversas').n,0);
});
test('evento exige assinatura, deduplica entregas e aceita gatilho e fila atomicamente',async t=>{
 const S=await fixture(t);salvarConfig(S.app.db,{integracoes:{ativa:true,pessoas:[]}});await S.a.post('/api/politica/ciencia',{versao:(await S.a.get('/api/politica')).dados.versao});
 const w=criarWebhook(S.app,S.a.pessoa,{evento:'pedido recebido',quickWinId:S.q.id});const s=await S.criar({tipo:'evento',webhook_id:w.id});await S.ativar(s);
 const ts=Math.floor(Date.now()/1000),corpo='{"dado":"CONTEUDO_NAO_PERSISTIDO"}';const entrega=id=>({cabecalhos:{'x-greenia-timestamp':String(ts),'x-greenia-entrega':id,'x-greenia-assinatura':assinar(w.segredo,ts,corpo)},corpoBruto:corpo});
 assert.throws(()=>receberWebhook(S.app,w.id,{...entrega('entrega-invalida'),cabecalhos:{}}));assert.equal(um(S.app.db,'select count(*) n from qw_programadas_execucoes').n,0);
 const callback=S.app.aoReceberEventoProgramado;S.app.aoReceberEventoProgramado=()=>{throw Error('queda simulada');};assert.throws(()=>receberWebhook(S.app,w.id,entrega('entrega-teste01')));assert.equal(um(S.app.db,'select count(*) n from webhook_entregas').n,0);
 S.app.aoReceberEventoProgramado=callback;receberWebhook(S.app,w.id,entrega('entrega-teste01'));assert.equal(um(S.app.db,'select count(*) n from qw_programadas_execucoes').n,1);assert.throws(()=>receberWebhook(S.app,w.id,entrega('entrega-teste01')));assert.doesNotMatch(JSON.stringify(todos(S.app.db,'select * from integ_planos')),/CONTEUDO_NAO_PERSISTIDO/);
});
test('configuração recusa credenciais e horários inválidos sem gravar',async t=>{
 const S=await fixture(t);const r=await S.a.post(`/api/quick-wins/${S.q.id}/programacoes`,{...S.corpo,entrada:'Use api_key=sk-abcdefghijklmnopqrstuvwxyz123456 para consultar'});assert.equal(r.status,422);assert.equal(um(S.app.db,'select count(*) n from qw_programacoes').n,0);
 assert.equal((await S.a.post(`/api/quick-wins/${S.q.id}/programacoes`,{...S.corpo,agenda:{frequencia:'diaria',hora:'99:99'}})).status,400);
});
test('integração programada aguarda aprovação e retoma uma vez com as mesmas entradas',async t=>{
 const {apiFalsa,OPENAPI_FALSA}=await import('./integracoes-fake.js');const API=await apiFalsa();t.after(()=>API.fechar());
 const {descobrir}=await import('../src/integracoes/descoberta.js');const {criarConector,definirCapabilities}=await import('../src/integracoes/conectores.js');const {configurarCredencial,testarConector,publicar}=await import('../src/integracoes/ciclo.js');const {decidir}=await import('../src/integracoes/aprovacoes.js');const {criarPlano,executarPlano}=await import('../src/integracoes/plano.js');
 const S=await fixture(t),app=S.app,p={...S.a.pessoa,admin:true};salvarConfig(app.db,{integracoes:{ativa:true,pessoas:[],rede_privada_autorizada:true}});await S.a.post('/api/politica/ciencia',{versao:(await S.a.get('/api/politica')).dados.versao});
 const d=descobrir(OPENAPI_FALSA(API.base)),c=criarConector(app,p,{nome:'CRM de QA',sistema:'CRM Fictício',base_url:d.base_url,operacoes:d.operacoes,auth_type:'api_key',origem:'generated',config:{rede_privada:true,cabecalho_auth:'X-API-Key',timeout_ms:1500}});definirCapabilities(app,p,c.id,[{operation_id:'criarFatura'}]);configurarCredencial(app,p,c.id,API.chave);const teste=await testarConector(app,p,c.id);assert.ok(teste.passou);decidir(app,p,teste.aprovacao.id,{aprovar:true});publicar(app,p,c.id);
 const s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});const {conversa}=app.criarConversaProgramada(p)(S.q.id);exec(app.db,"update qw_programadas_execucoes set conversa_id=?,status='aguardando_aprovacao'",conversa.id);
 const plano=criarPlano(app,p,{quickWinId:S.q.id,conversaId:conversa.id,controles:{modo:'aprovar',max_acoes:1,max_registros:1},necessidades:[{id:'fatura',acao:'Criar fatura no CRM Fictício',categoria:'create_record',sistema:'CRM Fictício',modo:'write',depende_de:[],entrada:[{de:'resultado.valor',para:'valor'},{de:null,para:'cliente_id',padrao:1}]}]});
 const pendente=await executarPlano(app,p,plano.id,{resultado:{valor:37}});assert.equal(pendente.status,'aguardando_aprovacao');const antes=API.estado.faturas.size;await rodadaProgramadas(app);assert.equal(API.estado.faturas.size,antes);decidir(app,p,pendente.passos[0].aprovacao,{aprovar:true});await rodadaProgramadas(app);
 assert.equal(um(app.db,'select status from qw_programadas_execucoes').status,'concluida');assert.equal(API.estado.faturas.size,antes+1);assert.equal([...API.estado.faturas.values()].at(-1).valor,37);await rodadaProgramadas(app);assert.equal(API.estado.faturas.size,antes+1);
 // Publicação legada sem controles: mesmo com política permissiva, a tarefa automática pede aprovação.
 const {openRouterFalso}=await import('./openrouter-falso.js');const OR=await openRouterFalso({responder:b=>String(b.messages[0].content).includes('conferente de qualidade')?'{"criterios":[],"objetivo_atingido":true}':'## Resumo\nCadastro fictício preparado.\n\n## Pontos de atenção\nNenhum.\n\n## Informações não encontradas\nNenhuma.\n\n```dados_integracao\n{"fatura":{"cliente_id":1,"valor":41}}\n```'});t.after(()=>OR.fechar());app.ia=OR.ia;
 exec(app.db,"update connectors set origem='configured' where id=?",c.id);salvarConfig(app.db,{integracoes:{ativa:true,pessoas:[],rede_privada_autorizada:true,politicas:[{quando:{},decisao:'ALLOW'}]}});await S.a.post('/api/politica/ciencia',{versao:(await S.a.get('/api/politica')).dados.versao});
 const spec=construir({descricao:'Organizar o resumo dos registros',formato:'texto'});spec.operacao.integracoes=[{id:'fatura',acao:'Criar fatura no CRM Fictício',categoria:'create_record',sistema:'CRM Fictício',modo:'write',depende_de:[]}];delete spec.operacao.controles;
 exec(app.db,'update quick_win_versoes set especificacao=? where id=(select versao_publicada from quick_wins where id=?)',JSON.stringify(spec),S.q.id);exec(app.db,'update quick_wins set especificacao=? where id=?',JSON.stringify(spec),S.q.id);
 const s2=await S.criar();await S.ativar(s2);await S.a.post(S.base(s2)+'/executar',{});await rodadaProgramadas(app);const e2=um(app.db,'select * from qw_programadas_execucoes where programacao_id=?',s2.id);assert.equal(e2.status,'aguardando_aprovacao',JSON.stringify(e2));assert.equal(API.estado.faturas.size,antes+1);
 const estado=JSON.parse(um(app.db,'select estado from integ_planos where conversa_id=?',e2.conversa_id).estado);assert.equal(estado.controles.modo,'aprovar');
 const ap=Object.values(estado.passos).find(p=>p.aprovacao).aprovacao;const raw=um(app.db,'select resumo from integration_approvals where id=?',ap);exec(app.db,'update integration_approvals set resumo=? where id=?',JSON.stringify({...JSON.parse(raw.resumo),expira_em:'2000-01-01T00:00:00.000Z'}),ap);await rodadaProgramadas(app);assert.equal(um(app.db,'select status from qw_programadas_execucoes where id=?',e2.id).status,'bloqueada');assert.equal(um(app.db,'select ativa from qw_programacoes where id=?',s2.id).ativa,0);assert.equal(API.estado.faturas.size,antes+1);
});
test('perda de permissão granular e capacidade do plano impedem execução multiempresa',async t=>{
 const {subirPlataforma}=await import('./ajuda-plataforma.js');const S=await subirPlataforma({admins:['ops@operadora.test']});t.after(()=>S.fechar());const ops=await S.navegador().entrarConsole('ops@operadora.test');const plano=(await ops.get('/api/plataforma/planos')).dados.planos.find(p=>p.name.includes('Company'));const c=(await ops.post('/api/plataforma/empresas',{name:'QA programados',slug:'qa-programados',plan_id:plano.id,admin_email:'ana@qa.test',status:'ativa'})).dados;
 const ana=S.navegador();await ana.get('/qa-programados');await ana.entrarEmpresa('ana@qa.test');const P=S.P||S.app;assert.ok(P, Object.keys(S).join(','));const tenant=P.tenants.get(c.id);assert.ok(tenant);const pessoa=(await ana.get('/api/eu')).dados.pessoa;assert.ok(tenant.pessoaParaProgramacao(pessoa.id));exec(P.db,"update company_users set status='inativo' where company_id=?",c.id);assert.equal(tenant.pessoaParaProgramacao(pessoa.id),null);exec(P.db,"update company_users set status='ativo' where company_id=?",c.id);exec(P.db,"update plans set features='{}' where id=?",plano.id);assert.equal(tenant.pessoaParaProgramacao(pessoa.id),null);
});

test('fila sobrevive ao fechamento e reabertura do banco em disco',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {criarApp}=await import('../src/servidor.js');const pasta=mkdtempSync(join(tmpdir(),'greenia-programadas-'));t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const S=await fixture(t,{banco:join(pasta,'empresa.sqlite')});const s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});await S.fechar();S.app.db.close();const app=criarApp({banco:join(pasta,'empresa.sqlite'),log:()=>{},agora:()=>new Date('2026-10-06T10:00:00Z')});t.after(()=>app.db.close());recuperarProgramadas(app);assert.equal(um(app.db,'select status from qw_programadas_execucoes').status,'na_fila');await rodadaProgramadas(app);const e=um(app.db,'select * from qw_programadas_execucoes');assert.ok(e.conversa_id);assert.notEqual(e.status,'bloqueada');
});
test('outro gestor pode pausar mas não executar como o responsável',async t=>{
 const S=await fixture(t),s=await S.criar();await S.a.post('/api/admin/pessoas',{email:'gestor@exemplo.com.br',nome:'Gestor',papel:'admin',areas:[]});const g=await S.cliente().entrar('gestor@exemplo.com.br');assert.equal((await g.post(S.base(s)+'/estado',{ativa:true})).status,403);assert.equal((await g.post(S.base(s)+'/executar',{})).status,403);await S.ativar(s);assert.equal((await g.post(S.base(s)+'/estado',{ativa:false})).status,200);assert.equal((await g.get(S.base(s)+'/configuracao')).status,404);
});

test('excluir Quick Win pausa programações e cancela somente trabalhos na fila',async t=>{
 const S=await fixture(t),s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});assert.equal((await S.a.del(`/api/quick-wins/${S.q.id}`)).status,200);assert.equal(um(S.app.db,'select ativa from qw_programacoes').ativa,0);assert.equal(um(S.app.db,'select status from qw_programadas_execucoes').status,'cancelada');await rodadaProgramadas(S.app);assert.equal(um(S.app.db,'select count(*) n from conversas').n,0);
});


test('conferência de horário é calculada no servidor e não grava agendamento', async t => {
 const S=await fixture(t);
 const r=await S.a.post(`/api/quick-wins/${S.q.id}/programacoes/previa`,{agenda:S.corpo.agenda});
 assert.equal(r.status,200);assert.equal(r.dados.proxima_em,'2026-10-06T11:00:00.000Z');
 assert.equal(um(S.app.db,'select count(*) n from qw_programacoes').n,0);
 assert.equal((await S.a.post(`/api/quick-wins/${S.q.id}/programacoes/previa`,{agenda:{...S.corpo.agenda,fuso:'invalido'}})).status,400);
});
test('repetir pedido de criação preserva uma única rotina e rejeita alteração do pedido', async t => {
 const S=await fixture(t),requisicao_id='79c412ca-a614-4f06-9af3-dd76558fa664';
 const s=await S.criar({requisicao_id});const repetida=await S.criar({requisicao_id});
 assert.equal(s.id,repetida.id);assert.equal(um(S.app.db,'select count(*) n from qw_programacoes').n,1);
 const r=await S.a.post(`/api/quick-wins/${S.q.id}/programacoes`,{...S.corpo,requisicao_id,entrada:'Outro conteúdo fictício.'});
 assert.equal(r.status,409);assert.equal(um(S.app.db,'select count(*) n from qw_programacoes').n,1);
 await S.a.post('/api/admin/pessoas',{email:'gestor@exemplo.com.br',nome:'Gestor',papel:'admin',areas:[]});const g=await S.cliente().entrar('gestor@exemplo.com.br');
 const outro=await g.post(`/api/quick-wins/${S.q.id}/programacoes`,{...S.corpo,requisicao_id});assert.equal(outro.status,409);assert.doesNotMatch(JSON.stringify(outro.dados),/três revisões/);
});
test('contexto usa a versão publicada, não inventa fontes e não é exposto ao usuário comum', async t => {
 const S=await fixture(t);const antes=(await S.a.get(`/api/quick-wins/${S.q.id}/programacoes`)).dados.contexto;
 assert.equal(antes.versao,1);assert.deepEqual(antes.fontes,[]);assert.deepEqual(antes.consultas,[]);
 exec(S.app.db,'update quick_wins set especificacao=? where id=?',JSON.stringify(construir({descricao:'Rascunho diferente que não foi publicado',formato:'texto'})),S.q.id);
 assert.deepEqual((await S.a.get(`/api/quick-wins/${S.q.id}/programacoes`)).dados.contexto,antes);
 await S.a.post('/api/admin/pessoas',{email:'usuario@exemplo.com.br',nome:'Usuário',areas:[]});const u=await S.cliente().entrar('usuario@exemplo.com.br');
 assert.equal((await u.get(`/api/quick-wins/${S.q.id}/programacoes`)).dados.contexto,null);
 assert.equal((await u.post(`/api/quick-wins/${S.q.id}/programacoes/previa`,{agenda:S.corpo.agenda})).status,403);
});

test('QA profundo: execução programada gera resultado e não confirma automaticamente histórico de negócio',async t=>{
 const S=await fixture(t);assert.equal((await S.a.post(`/api/quick-wins/${S.q.id}/painel`,{modelo:'fornecedores'})).status,200);
 const s=await S.criar();await S.ativar(s);await S.a.post(S.base(s)+'/executar',{});await rodadaProgramadas(S.app);
 const e=um(S.app.db,'select * from qw_programadas_execucoes where programacao_id=?',s.id);assert.ok(e.conversa_id,JSON.stringify(e));
 assert.ok(um(S.app.db,"select 1 from mensagens where conversa_id=? and papel='assistant'",e.conversa_id));
 assert.equal(um(S.app.db,'select count(*) n from qw_painel_registros').n,0);
 const p=await S.a.get(`/api/quick-wins/${S.q.id}/painel`);assert.equal(p.status,200);assert.equal(p.dados.total,0);assert.equal(p.dados.totalExecucoes,0);
 await rodadaProgramadas(S.app);assert.equal(um(S.app.db,'select count(*) n from qw_programadas_execucoes').n,1);assert.equal(um(S.app.db,'select count(*) n from qw_painel_registros').n,0);
});
