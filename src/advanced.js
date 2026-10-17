import { trabalhoDoPedido } from '../public/trabalhos.js';
import { recomendarAdvanced } from './advanced-recomendacao.js';
import CATALOGO from './advanced-catalogo.json' with { type: 'json' };
import { exec, um, todos, json, transacao } from './db.js';
import { lerConfig, salvarConfig } from './config.js';
import { erro } from './http.js';
import { registrar } from './eventos.js';

export const CRITERIOS_ADVANCED = 'Curadoria por raciocínio complexo, código e análise multimodal; contexto >= 200 mil, saída >= 32 mil e ferramentas. Preço não determina capacidade. Exige revisão administrativa de cada rota.';
export const CURADORIA_ADVANCED = [
 { id: 'anthropic/claude-opus-5.5', tarefas: ['raciocinio','programacao','analise'], justificativa: 'Flagship: raciocínio exigente, alterações em bases grandes e trabalho em várias etapas.' },
 { id: 'openai/gpt-5.6-sol', tarefas: ['raciocinio','programacao','analise'], justificativa: 'Flagship Sol: raciocínio complexo, programação e execução em várias etapas.' },
 { id: 'anthropic/claude-sonnet-5.5', tarefas: ['programacao','redacao'], justificativa: 'Implementação de funcionalidades, correções e produção estruturada com menor custo que Opus.' },
 { id: 'google/gemini-3.1-pro-preview', tarefas: ['analise','extracao'], justificativa: 'Raciocínio de fronteira, análise multimodal e contexto longo. Preview exige acompanhamento.' },
];
export function semearAdvanced(db) {
 for (const m of CATALOGO) {
  const atual=um(db,'select atributos from modelos where id = ?',m.id);
  const atributos=json(atual?.atributos,{});
  if (atributos.catalogo) continue;
  if (!atual) exec(db,"insert into modelos(id,nome,fornecedor,perfil,liberado,no_catalogo,contexto,preco_entrada,preco_saida) values (?,?,?,'avancado',0,1,?,?,?)",m.id,m.nome,m.fornecedor,m.contexto,m.entrada,m.saida);
  exec(db,'update modelos set atributos = ? where id = ?',JSON.stringify({...atributos,catalogo:m,curadoria:CURADORIA_ADVANCED.find(c=>c.id===m.id)}),m.id);
 }
}
const agora = app => app.agora().toISOString();
export function autorizacoesAdvanced(db, pessoaId, conversaId = null, em = new Date().toISOString()) {
 return todos(db, `select a.* from advanced_autorizacoes a join pessoas p on p.id = ? and p.ativo = 1
 where a.revogada = 0 and a.expira_em > ? and (a.conversa_id is null or a.conversa_id = ?)
 and (a.pessoa_id = p.id or a.papel = p.papel or a.grupo_id in (select grupo_id from grupo_pessoas where pessoa_id = p.id)) order by a.expira_em,a.id`, pessoaId, em, conversaId);
}
export function acessoAdvanced(db, pessoaId, modelo = null, conversaId = null, em) {
 return autorizacoesAdvanced(db, pessoaId, conversaId, em).find(a => !modelo || json(a.modelos, []).includes(modelo)) || null;
}
export function politicaModeloAdvanced(db, id) {
 const m = um(db, 'select perfil,atributos,liberado,no_catalogo,vetado_plataforma from modelos where id = ?', id);
 return m && { ...m, perfil:CURADORIA_ADVANCED.some(c=>c.id===id)?'avancado':m.perfil, atributos: json(m.atributos, {}) };
}
export function conferirAdvanced(app, pessoaId, modelo, conversaId, op = {}) {
 const m = politicaModeloAdvanced(app.db, modelo);
 if (m?.perfil !== 'avancado') return null;
 const a = acessoAdvanced(app.db, pessoaId, modelo, conversaId, agora(app));
 if (!a) throw erro(403, 'advanced_sem_autorizacao', 'Advanced depende de autorização administrativa válida para este modelo e trabalho.');
 if (!m.liberado || !m.no_catalogo) throw erro(503, 'advanced_indisponivel', 'O modelo Advanced está indisponível. O administrador pode habilitar uma alternativa de capacidade adequada.');
 const pol = m.atributos.advanced;
 if (m.vetado_plataforma || !pol?.aprovado || !pol.provedores?.length) throw erro(409, 'advanced_seguranca', 'Esta rota ainda não foi aprovada para o tratamento dos dados. Liberar acesso não remove a restrição de segurança.');
 const provedores = json(a.provedores, []).filter(p => pol.provedores.includes(p));
 if (op.fornecedor && !provedores.includes(op.fornecedor)) throw erro(409, 'advanced_seguranca', 'O provedor exigido pelo sigilo não pertence às rotas Advanced autorizadas.');
 if (!provedores.length) throw erro(409, 'advanced_seguranca', 'Não há rota de provedor aprovada nesta autorização.');
 const met = m.atributos.catalogo;
 if (!met?.maxSaida || !met.parametros?.includes('max_tokens')) throw erro(409, 'advanced_ferramenta', 'Os limites de saída deste modelo não foram confirmados no catálogo. Atualize o catálogo antes de executar.');
 if (!met.consultadoEm || Date.parse(agora(app))-Date.parse(met.consultadoEm)>48*3600e3) throw erro(503,'advanced_indisponivel','O catálogo Advanced precisa ser atualizado para confirmar disponibilidade e preços.');
 const provedor=op.fornecedor || provedores[0];
 const rota=met.rotas?.find(r=>r.id===provedor);
 if (!rota) throw erro(503,'advanced_indisponivel','A rota aprovada não consta do catálogo atual do modelo. Atualize o catálogo ou revise a rota.');
 return { a, m, met:{...met,contexto:Math.min(met.contexto,rota.contexto),maxSaida:Math.min(met.maxSaida,rota.maxSaida||0),entrada:Math.max(met.entrada,rota.entrada),saida:Math.max(met.saida,rota.saida),parametros:rota.parametros}, provedor };
}
// Defesa final antes de TODA inferência, inclusive auxiliares, novas tentativas e modelos alternativos.
export function reservarAdvanced(app, ctx, mensagens, op) {
 if (op.modelo === 'openrouter/auto' || op.reserva === 'openrouter/auto') throw erro(409, 'rota_nao_controlada', 'A escolha externa automática não permite garantir o acesso aos modelos. Use o automático da GreenIA.');
 const c = conferirAdvanced(app, ctx?.pessoa_id, op.modelo, ctx?.conversa_id, op);
 if (!c) {
  if (op.reserva && politicaModeloAdvanced(app.db, op.reserva)?.perfil === 'avancado') throw erro(403, 'advanced_reserva', 'A alternativa Advanced deve passar por uma execução autorizada separada.');
  return null;
 }
 const { a, met, provedor } = c;
 // Bytes são um teto conservador para tokens; inclui mensagens estruturadas e imagens inline.
 let entrada = Buffer.byteLength(JSON.stringify(mensagens)) + mensagens.length * 16;
 const saida = Math.min(op.maxTokens || a.saida_tokens, a.saida_tokens, met.maxSaida);
 if (entrada + saida > met.contexto) throw erro(413, 'advanced_contexto', 'O contexto completo e a saída necessária excedem o modelo. Divida o trabalho explicitamente ou autorize outro modelo.');
 if (!(saida >= 1024)) throw erro(409, 'advanced_ferramenta', 'O limite de saída autorizado é insuficiente.');
 if(op.pesquisaWeb){
  if(op.sigilosa||!lerConfig(app.db).pesquisaWeb?.ativa||!json(a.ferramentas,{}).pesquisa_web)throw erro(409,'advanced_ferramenta','A pesquisa externa não foi autorizada para esta execução. A liberação do modelo não libera ferramentas ou o envio de dados sigilosos à pesquisa.');
  // O plugin acrescenta resultados ao prompt. Reserva o limite inteiro de entrada, em vez de presumir o tamanho.
  entrada=met.contexto-saida;
 }
 const maxEntrada = Math.max(...[met.entrada, ...(met.precosAlternativos || []).map(p => Number(p.prompt))]);
 const maxSaida = Math.max(...[met.saida, ...(met.precosAlternativos || []).map(p => Number(p.completion))]);
 const estimativa = entrada * maxEntrada + saida * maxSaida + (op.pesquisaWeb ? 0.007 : 0);
 if (!Number.isFinite(estimativa) || !(estimativa > 0)) throw erro(409, 'advanced_orcamento', 'O preço desta rota não foi confirmado.');
 let id;
 transacao(app.db, () => {
  const global = lerConfig(app.db), cfg = global.advanced || {};
  const gasto = um(app.db, 'select coalesce(sum(coalesce(custo,reservado)),0) n from advanced_consumo where autorizacao_id = ?', a.id).n;
  const mensal = um(app.db, 'select coalesce(sum(coalesce(custo,reservado)),0) n from advanced_consumo where em >= ?', agora(app).slice(0,7)+'-01').n;
  const inicio=agora(app).slice(0,7)+'-01';
  const pessoaMes=um(app.db,'select coalesce(sum(coalesce(custo,reservado)),0) n from advanced_consumo where pessoa_id = ? and em >= ?',ctx.pessoa_id,inicio).n;
  const outros=um(app.db,"select coalesce(sum(u.custo),0) n from uso u where u.em >= ? and not exists(select 1 from modelos m where m.id=u.modelo_usado and m.perfil='avancado')",inicio).n;
  const pessoaOutros=um(app.db,"select coalesce(sum(u.custo),0) n from uso u where u.pessoa_id = ? and u.em >= ? and not exists(select 1 from modelos m where m.id=u.modelo_usado and m.perfil='avancado')",ctx.pessoa_id,inicio).n;
  if((global.tetoMensal>0 && mensal+outros+estimativa>global.tetoMensal)||(global.tetoPessoaMensal>0&&pessoaMes+pessoaOutros+estimativa>global.tetoPessoaMensal))throw erro(402,'advanced_orcamento','A reserva excede o teto geral de consumo da empresa ou da pessoa. Advanced não suspende esses limites.');
  if (estimativa > a.limite_chamada_usd || gasto + estimativa > a.limite_usd || !(cfg.limiteMensalUsd > 0) || mensal + estimativa > cfg.limiteMensalUsd) throw erro(402, 'advanced_orcamento', 'Orçamento Advanced insuficiente para reservar esta execução completa. Peça ao administrador a revisão dos limites. Nenhuma redução de capacidade foi aplicada.');
  id = Number(exec(app.db, 'insert into advanced_consumo (autorizacao_id,pessoa_id,conversa_id,modelo,provedor,reservado,em) values (?,?,?,?,?,?,?)', a.id,ctx.pessoa_id,ctx.conversa_id,op.modelo,provedor,estimativa,agora(app)).lastInsertRowid);
 });
 registrar(app, 'advanced.reserved', ctx.pessoa_id, { autorizacao:a.id, consumo:id, modelo:op.modelo, provedor, estimativa });
 return { id, op: { ...op, reserva:null, fornecedor:provedor, advanced:true, maxTokens:saida, advancedMaxPrice:{prompt:maxEntrada*1e6,completion:maxSaida*1e6}, raciocinio:met.parametros.includes('reasoning') ? 'high' : null } };
}
export function liquidarAdvanced(app, reserva, custo, geracao = null) {
 if (!reserva) return;
 exec(app.db, 'update advanced_consumo set custo = ?, geracao = coalesce(?,geracao) where id = ?', Number.isFinite(custo) && custo >= 0 ? custo : null,geracao,reserva.id);
}
export function prepararPedidoAdvanced(app, pessoa, conv, corpo, requisitos, estimativa, guardar = true, alternativa = false) {
 const trabalho=trabalhoDoPedido(corpo,requisitos),justificativa=trabalho.justificativa;
 if (!guardar) throw erro(409,'advanced_retencao','Este conteúdo não pode ser armazenado pela política da empresa. Solicite a autorização antes e reenvie o material.');
 // Substitui apenas um rascunho idêntico. Não duplica anexos por reenvio.
 let p = um(app.db, "select id from advanced_pedidos where pessoa_id = ? and conversa_id = ? and estado = 'preparado' and corpo = ?",pessoa.id,conv.id,JSON.stringify(corpo));
 if (!p) p = {id:Number(exec(app.db,"insert into advanced_pedidos(pessoa_id,conversa_id,estado,corpo,justificativa,estimativa_usd,em) values (?,?,'preparado',?,?,?,?)",pessoa.id,conv.id,JSON.stringify(corpo),justificativa,estimativa,agora(app)).lastInsertRowid)};
 exec(app.db,'update advanced_pedidos set alternativa = ?, requisitos = ? where id = ?',Number(alternativa),JSON.stringify({capacidade:requisitos.capacidade,janelaMinima:requisitos.janelaMinima,janelaDesejada:requisitos.janelaDesejada,trabalho}),p.id);
 registrar(app,'advanced.required',pessoa.id,{pedido:p.id,conversa:conv.id,dimensoes:Object.keys(requisitos.dimensoes||{})});
 throw erro(403,'advanced_necessario',justificativa,{advanced:{pedido:p.id,justificativa}});
}
const publico = p => {const trabalho=json(p.requisitos,{}).trabalho;return {id:p.id,conversa_id:p.conversa_id,estado:p.estado,alternativa:!!p.alternativa,trabalho,justificativa:trabalho?.justificativa||'Este pedido envolve etapas que precisam de uma liberação de acesso. O pedido está guardado para revisão.',estimativa_usd:p.estimativa_usd,em:p.em,decisao_em:p.decisao_em,motivo:p.motivo};};
export function rotasAdvanced(app,r) {
 // Atualiza apenas a descrição pública derivada; a justificativa histórica permanece no banco.
 for(const p of todos(app.db,"select id,requisitos,json_extract(corpo,'$.texto') texto,json_array_length(corpo,'$.anexos') quantidadeAnexos from advanced_pedidos where coalesce(json_extract(requisitos,'$.trabalho.versao'),0) < 3")){
  const req=json(p.requisitos,{});req.trabalho=trabalhoDoPedido(p,req);
  exec(app.db,'update advanced_pedidos set requisitos = ? where id = ?',JSON.stringify(req),p.id);
 }

 const proprio = (pessoa,id) => {const p=um(app.db,'select * from advanced_pedidos where id = ? and pessoa_id = ?',Number(id),pessoa.id);if(!p)throw erro(404,'pedido','Solicitação não encontrada.');return p;};
 r.get('/api/advanced/pedidos',({pessoa})=>({pedidos:todos(app.db,`select id,conversa_id,estado,alternativa,justificativa,requisitos,estimativa_usd,em,decisao_em,motivo,autorizacao_id,json_extract(corpo,'$.texto') texto,
 (select json_group_array(json_extract(value,'$.nome')) from json_each(a.corpo,'$.anexos')) anexos_nomes,
 (select json_group_array(json_object('nome',json_extract(value,'$.nome'),'disponivel',length(json_extract(value,'$.base64'))>0)) from json_each(a.corpo,'$.anexos')) materiais
 from advanced_pedidos a where pessoa_id = ? order by id desc limit 100`,pessoa.id).map(p=>({...publico(p),texto:p.texto,anexos:json(p.anexos_nomes,[]),materiais:json(p.materiais,[]),estadoAcesso:(()=>{const a=p.autorizacao_id&&um(app.db,'select expira_em,revogada from advanced_autorizacoes where id = ?',p.autorizacao_id);return a?.revogada?'revogado':a?.expira_em&&a.expira_em<=agora(app)?'expirado':null;})(),autorizacaoValida:!!acessoAdvanced(app.db,pessoa.id,null,p.conversa_id,agora(app))}))}));
 r.post('/api/advanced/pedidos/:id/solicitar',({pessoa,params})=>{const p=proprio(pessoa,params.id);if(p.estado==='preparado'||p.estado==='recusado'||p.estado==='aprovado'&&!acessoAdvanced(app.db,pessoa.id,null,p.conversa_id,agora(app))){exec(app.db,"update advanced_pedidos set estado = 'pendente',motivo=null,decisao_em=null,decisao_por=null,autorizacao_id=null where id = ?",p.id);registrar(app,'advanced.requested',pessoa.id,{pedido:p.id});}return {pedido:publico(proprio(pessoa,p.id))};});
 r.post('/api/advanced/pedidos/:id/alternativa',({pessoa,params})=>{const p=proprio(pessoa,params.id);if(!p.alternativa)throw erro(409,'alternativa','Não há uma alternativa reduzida confirmada para este pedido.');registrar(app,'advanced.alternative_consented',pessoa.id,{pedido:p.id,escopo:'alternativa_em_texto_sem_execucao'});return {corpo:{texto:publico(p).trabalho?.alternativa?.titulo||'Organizar um roteiro do trabalho',anexos:[],advanced_alternativa:p.id}};});
 r.post('/api/advanced/pedidos/:id/retomar' ,({pessoa,params})=>{const p=proprio(pessoa,params.id);if(!acessoAdvanced(app.db,pessoa.id,null,p.conversa_id,agora(app)))throw erro(403,'advanced_sem_autorizacao','A autorização não está válida. Solicite revisão ao administrador.');return {conversa_id:p.conversa_id,corpo:json(p.corpo,{})};});
 r.get('/api/admin/advanced',()=>({criterios:CRITERIOS_ADVANCED,curadoria:CURADORIA_ADVANCED,config:lerConfig(app.db).advanced||{},autorizacoes:todos(app.db,'select * from advanced_autorizacoes order by id desc'),pedidos:todos(app.db,`select a.id,a.pessoa_id,a.conversa_id,a.estado,a.alternativa,a.justificativa,a.requisitos,a.estimativa_usd,a.em,a.decisao_em,a.motivo,p.nome,p.email from advanced_pedidos a join pessoas p on p.id=a.pessoa_id where estado != 'preparado' order by a.id desc limit 200`).map(p=>({...publico(p),pessoa_id:p.pessoa_id,nome:p.nome,email:p.email,recomendacao:p.estado==='pendente'?recomendarAdvanced(app,p):null})),consumo:todos(app.db,'select * from advanced_consumo order by id desc limit 100')}),{admin:true});
 r.put('/api/admin/advanced/config',({pessoa,corpo})=>{const n=Number(corpo.limiteMensalUsd);if(!Number.isFinite(n)||n<0)throw erro(400,'limite','Informe o teto mensal em USD.');salvarConfig(app.db,{advanced:{limiteMensalUsd:n}});registrar(app,'advanced.budget_changed',pessoa.id,{limiteMensalUsd:n});return {ok:true};},{admin:true});
 r.post('/api/admin/advanced/autorizacoes',({pessoa,corpo})=>({id:concederAdvanced(app,pessoa,corpo)}),{admin:true});
 r.post('/api/admin/advanced/autorizacoes/:id/revogar',({pessoa,params})=>{exec(app.db,'update advanced_autorizacoes set revogada = 1 where id = ?',Number(params.id));registrar(app,'advanced.revoked',pessoa.id,{autorizacao:Number(params.id)});return {ok:true};},{admin:true});
 r.post('/api/admin/advanced/pedidos/:id/recomendacao',({params,corpo})=>{const p=um(app.db,"select * from advanced_pedidos where id = ? and estado = 'pendente'",Number(params.id));if(!p)throw erro(404,'pedido','Solicitação não encontrada.');return recomendarAdvanced(app,p,corpo);},{admin:true});
 r.post('/api/admin/advanced/pedidos/:id/decidir',({pessoa,params,corpo})=>{
  const p=um(app.db,"select * from advanced_pedidos where id = ? and estado = 'pendente'",Number(params.id));if(!p)throw erro(409,'pedido','Solicitação já decidida ou inexistente.');
  if(!['aprovar','recusar'].includes(corpo.decisao))throw erro(400,'decisao','Escolha aprovar ou recusar.');
  let liberacao=corpo;
  if(corpo.decisao==='aprovar'&&corpo.seguir_recomendacao===true){const rec=recomendarAdvanced(app,p,{limite_usd:corpo.limite_usd,dias:corpo.dias});if(!rec.disponivel)throw erro(409,rec.codigo,rec.motivo);if(rec.versao!==corpo.versao)throw erro(409,'recomendacao_mudou','A recomendação mudou. Confira os novos limites antes de aprovar.');liberacao=rec.configuracao;}
  transacao(app.db,()=>{const id=corpo.decisao==='aprovar'?concederAdvanced(app,pessoa,{...liberacao,pessoa_id:p.pessoa_id,grupo_id:null,papel:null,conversa_id:p.conversa_id}):null;
   exec(app.db,'update advanced_pedidos set estado = ?,decisao_em = ?,decisao_por = ?,motivo = ?,autorizacao_id = ? where id = ?',id?'aprovado':'recusado',agora(app),pessoa.id,String(corpo.motivo||'').slice(0,500),id,p.id);
   registrar(app,'advanced.decided',pessoa.id,{pedido:p.id,estado:id?'aprovado':'recusado',destinatario:p.pessoa_id});
  });return {ok:true};
 },{admin:true});
 r.put('/api/admin/advanced/modelos/:id',({pessoa,params,corpo})=>{
  const m=politicaModeloAdvanced(app.db,params.id);if(!m||m.perfil!=='avancado')throw erro(400,'modelo','Cadastre o modelo no nível Advanced primeiro.');
  const provedores=lista(corpo.provedores);
  if (provedores.some(p=>!m.atributos.catalogo?.rotas?.some(r=>r.id===p))) throw erro(400,'rota','Informe apenas rotas presentes no catálogo atualizado deste modelo.');if(corpo.aprovado&&(!provedores.length||!String(corpo.justificativa||'').trim()))throw erro(400,'seguranca','Informe as rotas verificadas e a justificativa de segurança.');
  const advanced={aprovado:corpo.aprovado===true,provedores,justificativa:String(corpo.justificativa||'').slice(0,1000),por:pessoa.id,em:agora(app)};
  exec(app.db,'update modelos set atributos = ? where id = ?',JSON.stringify({...m.atributos,advanced}),params.id);registrar(app,'advanced.route_reviewed',pessoa.id,{modelo:params.id,...advanced});return {ok:true};
 },{admin:true});
}
const lista = v => Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&x.length>0&&x.length<200))]:[];
export function concederAdvanced(app,pessoa,b) {
 if (!pessoa?.admin) throw erro(403,'admin','Somente o administrador pode conceder acesso.');
 if ([!!b.pessoa_id,!!b.grupo_id,!!b.papel].filter(Boolean).length!==1||b.papel&&!['admin','usuario'].includes(b.papel))throw erro(400,'escopo','Escolha uma pessoa, grupo ou perfil.');
 const modelos=lista(b.modelos),provedores=lista(b.provedores),total=Number(b.limite_usd),chamada=Number(b.limite_chamada_usd),saida=Number(b.saida_tokens);
 if(!modelos.length||!provedores.length||!Number.isFinite(total)||!Number.isFinite(chamada)||!(total>0)||!(chamada>0)||chamada>total||!Number.isInteger(saida)||saida<1024||saida>128000||!Number.isFinite(Date.parse(b.expira_em))||Date.parse(b.expira_em)<=Date.parse(agora(app)))throw erro(400,'autorizacao','Informe modelos, rotas, limites positivos, saída e validade futura.');
 for(const id of modelos){const m=politicaModeloAdvanced(app.db,id);if(m?.perfil!=='avancado'||!m.atributos.advanced?.aprovado||!provedores.some(p=>m.atributos.advanced.provedores.includes(p)))throw erro(409,'advanced_seguranca','Cada modelo deve ter uma rota aprovada antes da autorização.');}
 const id=Number(exec(app.db,'insert into advanced_autorizacoes(pessoa_id,grupo_id,papel,conversa_id,modelos,provedores,ferramentas,limite_usd,limite_chamada_usd,saida_tokens,expira_em,por,em) values (?,?,?,?,?,?,?,?,?,?,?,?,?)',b.pessoa_id||null,b.grupo_id||null,b.papel||null,b.conversa_id||null,JSON.stringify(modelos),JSON.stringify(provedores),JSON.stringify({pesquisa_web:b.pesquisa_web===true}),total,chamada,saida,new Date(b.expira_em).toISOString(),pessoa.id,agora(app)).lastInsertRowid);
 registrar(app,'advanced.granted',pessoa.id,{autorizacao:id,modelos,provedores,limite_usd:total,expira_em:b.expira_em});return id;
}
