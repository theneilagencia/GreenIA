import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso,enviarMensagem } from './openrouter-falso.js';
import { exec,um,todos } from '../src/db.js';
import { salvarConfig,lerConfig } from '../src/config.js';
import { reservarAdvanced,liquidarAdvanced,conferirAdvanced } from '../src/advanced.js';
import { rotear,analisarPedido,AUTOMATICO } from '../src/roteador.js';
import { carregarPessoa } from '../src/auth.js';
import { comUso } from '../src/custo-ia.js';
const ID='anthropic/claude-opus-5.5';
const texto='Crie um relatório completo de altíssimo nível com análise aprofundada dos riscos, cenários e recomendações executivas.';
async function ambiente(){
 const OR=await openRouterFalso();const s=await subir({ia:OR.ia});
 salvarConfig(s.app.db,{dominios:['exemplo.com.br'],advanced:{limiteMensalUsd:20}});
 const admin=await s.cliente().entrar('admin@exemplo.com.br');const ana=await s.cliente().entrar('ana@exemplo.com.br');const bia=await s.cliente().entrar('bia@exemplo.com.br');
 exec(s.app.db,'update modelos set liberado = 1 where id = ?',ID);
 const pol=await admin.put('/api/admin/advanced/modelos/'+encodeURIComponent(ID),{aprovado:true,provedores:['anthropic'],justificativa:'Revisão de segurança e capacidade da rota usada no teste de protocolo.'});assert.equal(pol.status,200,JSON.stringify(pol.dados));
 const conv=(await ana.post('/api/conversas',{})).dados.conversa;
 const grant={pessoa_id:ana.pessoa.id,conversa_id:conv.id,modelos:[ID],provedores:['anthropic'],limite_usd:3,limite_chamada_usd:1,saida_tokens:32768,expira_em:new Date(Date.now()+86400000).toISOString()};
 return {...s,OR,admin,ana,bia,conv,grant,async fechar(){await s.fechar();await OR.fechar();}};
}
test('Advanced: aprovação HTTP, privacidade, contexto preservado, retomada explícita e chamada fixada',async()=>{
 const s=await ambiente();try{
  const {ana,admin,bia,conv,app,OR,grant}=s;
  const b={texto,anexos:[],modelo:AUTOMATICO};
  const bloqueio=await enviarMensagem(ana,conv.id,b);assert.equal(bloqueio.status,403,JSON.stringify(bloqueio));
  assert.equal(OR.chamadas.length,0);const id=bloqueio.erro.advanced.pedido;
  assert.equal((await bia.post(`/api/advanced/pedidos/${id}/solicitar`)).status,404);
  assert.equal((await ana.post(`/api/admin/advanced/autorizacoes`,grant)).status,403);
  assert.equal((await ana.post(`/api/advanced/pedidos/${id}/solicitar`)).status,200);
  const painel=(await admin.get('/api/admin/advanced')).dados;
  assert.equal(painel.pedidos[0].estado,'pendente');assert.ok(!JSON.stringify(painel).includes(texto));
  const dec=await admin.post(`/api/admin/advanced/pedidos/${id}/decidir`,{...grant,decisao:'aprovar'});assert.equal(dec.status,200,JSON.stringify(dec.dados));assert.equal(OR.chamadas.length,0);
  const preservado=(await ana.get('/api/advanced/pedidos')).dados.pedidos[0];
  assert.equal(preservado.estado,'aprovado');assert.equal(preservado.texto,texto);assert.deepEqual(preservado.anexos,[]);
  const ret=await ana.post(`/api/advanced/pedidos/${id}/retomar`);assert.deepEqual(ret.dados.corpo,b);assert.equal(OR.chamadas.length,0);
  const resposta=await enviarMensagem(ana,conv.id,{...ret.dados.corpo,modelo:'classe:avancado'});assert.equal(resposta.status,200,JSON.stringify(resposta));assert.ok(!resposta.falha,JSON.stringify(resposta));
  assert.ok(OR.chamadas.length);const chamada=OR.chamadas[0];assert.equal(chamada.model,ID);assert.deepEqual(chamada.provider.only,['anthropic']);assert.equal(chamada.provider.allow_fallbacks,false);assert.equal(chamada.provider.data_collection,'deny');assert.equal(chamada.provider.require_parameters,true);assert.equal(chamada.max_tokens,32768);assert.ok(!chamada.models);
  const gasto=um(app.db,'select * from advanced_consumo order by id limit 1');assert.ok(gasto.reservado>0);assert.ok(gasto.custo>=0);
  assert.ok(todos(app.db,"select * from eventos where tipo like 'advanced.%'").length>=5);
 }finally{await s.fechar();}
});
test('Advanced: recusa, revogação, expiração, escopo, rota e orçamento são independentes',async()=>{
 const s=await ambiente();try{
  const {app,ana,admin,conv,grant,OR}=s;
  const b=await enviarMensagem(ana,conv.id,{texto});const id=b.erro.advanced.pedido;
  await ana.post(`/api/advanced/pedidos/${id}/solicitar`);
  assert.equal((await admin.post(`/api/admin/advanced/pedidos/${id}/decidir`,{decisao:'recusar',motivo:'Orçamento não aprovado'})).status,200);
  assert.equal((await ana.post(`/api/advanced/pedidos/${id}/retomar`)).status,403);
  const g=await admin.post('/api/admin/advanced/autorizacoes',grant);assert.equal(g.status,200,JSON.stringify(g.dados));
  const pid=ana.pessoa.id;
  assert.throws(()=>conferirAdvanced(app,pid,ID,conv.id+1),e=>e.codigo==='advanced_sem_autorizacao');
  const ctx={pessoa_id:pid,conversa_id:conv.id};
  const r=reservarAdvanced(app,ctx,[{role:'user',content:'teste'}],{modelo:ID});assert.ok(r);
  exec(app.db,'update advanced_autorizacoes set limite_usd = ? where id = ?',r.op.maxTokens*0.00002,g.dados.id);
  assert.throws(()=>reservarAdvanced(app,ctx,[{role:'user',content:'teste'}],{modelo:ID}),e=>e.codigo==='advanced_orcamento');
  liquidarAdvanced(app,r,0.001);
  exec(app.db,'update advanced_autorizacoes set limite_usd = 3 where id = ?',g.dados.id);
  assert.throws(()=>conferirAdvanced(app,pid,ID,conv.id,{fornecedor:'azure'}),e=>e.codigo==='advanced_seguranca');
  await admin.post(`/api/admin/advanced/autorizacoes/${g.dados.id}/revogar`);
  assert.throws(()=>reservarAdvanced(app,ctx,[],{modelo:ID}),e=>e.codigo==='advanced_sem_autorizacao');
  const g2=await admin.post('/api/admin/advanced/autorizacoes',grant);exec(app.db,"update advanced_autorizacoes set expira_em = '2020-01-01' where id = ?",g2.dados.id);
  assert.throws(()=>conferirAdvanced(app,pid,ID,conv.id),e=>e.codigo==='advanced_sem_autorizacao');assert.equal(OR.chamadas.length,0);
 }finally{await s.fechar();}
});
test('Advanced: Quick Win, manual, auxiliares e reserva não contornam autorização; sem fallback inferior',async()=>{
 const s=await ambiente();try{
  const {app,ana,conv,OR}=s;const pessoa=carregarPessoa(app.db,ana.pessoa.id);const cfg=lerConfig(app.db);
  for(const qw of [null,{modelo:ID,pode_trocar:false}]){
   const rota=rotear({db:app.db,cfg,pessoa,qw,conversaId:conv.id,analise:analisarPedido({texto}),pedido:AUTOMATICO});assert.equal(rota.modelo,null);
  }
  await assert.rejects(()=>comUso(app,{pessoa_id:pessoa.id,conversa_id:conv.id},async()=>{for await(const e of app.ia.enviar([{role:'user',content:'Autorizo Advanced'}],{modelo:ID})){};}),e=>e.codigo==='advanced_sem_autorizacao');
  await assert.rejects(()=>comUso(app,{pessoa_id:pessoa.id},async()=>{for await(const e of app.ia.enviar([],{modelo:'anthropic/claude-haiku-4.5',reserva:ID})){};}),e=>e.codigo==='advanced_reserva');
  assert.equal(OR.chamadas.length,0);
 }finally{await s.fechar();}
});

test('Advanced: alternativa exige escolha expressa e mantém o pedido integral pendente',async()=>{
 const s=await ambiente();try{
  const r=await enviarMensagem(s.ana,s.conv.id,{texto});const id=r.erro.advanced.pedido;
  assert.equal(s.OR.chamadas.length,0);
  const p=(await s.ana.get('/api/advanced/pedidos')).dados.pedidos[0];assert.equal(p.alternativa,true);
  const alt=await s.ana.post(`/api/advanced/pedidos/${id}/alternativa`);assert.equal(alt.status,200);
  const resumo=await enviarMensagem(s.ana,s.conv.id,alt.dados.corpo);assert.equal(resumo.status,200,JSON.stringify(resumo));assert.ok(!resumo.falha,JSON.stringify(resumo));
  assert.notEqual(s.OR.chamadas[0].model,ID);assert.equal(um(s.app.db,'select estado from advanced_pedidos where id = ?',id).estado,'preparado');
  assert.ok(s.OR.chamadas[0].messages.some(m=>String(m.content).includes('Escopo reduzido escolhido')));
  assert.ok(s.OR.chamadas[0].messages.some(m=>String(m.content).includes(p.trabalho.alternativa.instrucao)));
  assert.ok(!resumo.fim.arquivos?.length);assert.ok(!resumo.fim.artefatos?.length);
 }finally{await s.fechar();}
});
test('Advanced: apagar conversa elimina material pendente mesmo após consumo',async()=>{
 const s=await ambiente();try{
  const r=await enviarMensagem(s.ana,s.conv.id,{texto});const id=r.erro.advanced.pedido;
  await s.ana.post(`/api/advanced/pedidos/${id}/solicitar`);await s.admin.post(`/api/admin/advanced/pedidos/${id}/decidir`,{...s.grant,decisao:'aprovar'});
  const rr=reservarAdvanced(s.app,{pessoa_id:s.ana.pessoa.id,conversa_id:s.conv.id},[],{modelo:ID});liquidarAdvanced(s.app,rr,0.01);
  exec(s.app.db,'delete from conversas where id = ?',s.conv.id);
  assert.equal(um(s.app.db,'select count(*) n from advanced_pedidos').n,0);
  assert.equal(um(s.app.db,'select count(*) n from advanced_consumo').n,1);
 }finally{await s.fechar();}
});
test('Advanced: orçamento geral, política de sigilo e catálogo vencido continuam obrigatórios',async()=>{
 const s=await ambiente();try{
  await s.admin.post('/api/admin/advanced/autorizacoes',s.grant);
  const ctx={pessoa_id:s.ana.pessoa.id,conversa_id:s.conv.id};
  salvarConfig(s.app.db,{tetoMensal:0.01});assert.throws(()=>reservarAdvanced(s.app,ctx,[],{modelo:ID}),e=>e.codigo==='advanced_orcamento');
  salvarConfig(s.app.db,{tetoMensal:0,tetoPessoaMensal:0.01});assert.throws(()=>reservarAdvanced(s.app,ctx,[],{modelo:ID}),e=>e.codigo==='advanced_orcamento');
  salvarConfig(s.app.db,{tetoPessoaMensal:0});
  const m=um(s.app.db,'select atributos from modelos where id = ?',ID),a=JSON.parse(m.atributos);
  a.catalogo.consultadoEm='2020-01-01';exec(s.app.db,'update modelos set atributos=? where id=?',JSON.stringify(a),ID);
  assert.throws(()=>conferirAdvanced(s.app,s.ana.pessoa.id,ID,s.conv.id),e=>e.codigo==='advanced_indisponivel');
  a.catalogo.consultadoEm=new Date().toISOString();a.advanced.aprovado=false;exec(s.app.db,'update modelos set atributos=? where id=?',JSON.stringify(a),ID);
  assert.throws(()=>conferirAdvanced(s.app,s.ana.pessoa.id,ID,s.conv.id),e=>e.codigo==='advanced_seguranca');
  assert.equal(s.OR.chamadas.length,0);
 }finally{await s.fechar();}
});

test('recomendação: administrador aprova sem escolher modelos; servidor ignora opções técnicas adulteradas',async()=>{
 const s=await ambiente();try{
  const r=await enviarMensagem(s.ana,s.conv.id,{texto});const id=r.erro.advanced.pedido;await s.ana.post(`/api/advanced/pedidos/${id}/solicitar`);
  const rec=(await s.admin.get('/api/admin/advanced')).dados.pedidos.find(p=>p.id===id).recomendacao;
  assert.equal(rec.disponivel,true);assert.equal(rec.execucaoAutomatica,false);assert.equal(rec.validadeDias,1);
  const d=await s.admin.post(`/api/admin/advanced/pedidos/${id}/decidir`,{decisao:'aprovar',seguir_recomendacao:true,versao:rec.versao,limite_usd:rec.limite,dias:1,modelos:['nao/aprovado'],provedores:['nao-aprovado']});assert.equal(d.status,200,JSON.stringify(d.dados));
  const a=um(s.app.db,'select * from advanced_autorizacoes order by id desc limit 1');assert.deepEqual(JSON.parse(a.modelos),[ID]);assert.deepEqual(JSON.parse(a.provedores),['anthropic']);assert.equal(a.conversa_id,s.conv.id);assert.equal(s.OR.chamadas.length,0);
 }finally{await s.fechar();}
});
test('recomendação não aprova proteção nem orçamento; mudanças exigem nova conferência',async()=>{
 const s=await ambiente();try{
  const r=await enviarMensagem(s.ana,s.conv.id,{texto});const id=r.erro.advanced.pedido;await s.ana.post(`/api/advanced/pedidos/${id}/solicitar`);
  const consulta=async()=> (await s.admin.get('/api/admin/advanced')).dados.pedidos.find(p=>p.id===id).recomendacao;
  const rec=await consulta();assert.equal(rec.disponivel,true);
  salvarConfig(s.app.db,{advanced:{limiteMensalUsd:0}});const sem=await consulta();assert.equal(sem.codigo,'advanced_orcamento');assert.equal(sem.disponivel,false);
  salvarConfig(s.app.db,{advanced:{limiteMensalUsd:10}});
  const stale=await s.admin.post(`/api/admin/advanced/pedidos/${id}/decidir`,{decisao:'aprovar',seguir_recomendacao:true,versao:rec.versao,limite_usd:rec.limite,dias:1});assert.equal(stale.status,409);assert.equal(stale.dados.erro,'recomendacao_mudou');
  const a=JSON.parse(um(s.app.db,'select atributos from modelos where id=?',ID).atributos);a.advanced.aprovado=false;exec(s.app.db,'update modelos set atributos=? where id=?',JSON.stringify(a),ID);
  assert.equal((await consulta()).codigo,'advanced_seguranca');assert.equal(um(s.app.db,'select count(*) n from advanced_autorizacoes').n,0);assert.equal(s.OR.chamadas.length,0);
 }finally{await s.fechar();}
});
test('autorização existente permite continuar pedido pendente sem nova liberação',async()=>{
 const s=await ambiente();try{
  const r=await enviarMensagem(s.ana,s.conv.id,{texto});const id=r.erro.advanced.pedido;await s.ana.post(`/api/advanced/pedidos/${id}/solicitar`);
  const g=await s.admin.post('/api/admin/advanced/autorizacoes',{...s.grant,conversa_id:null});assert.equal(g.status,200);
  const p=(await s.ana.get('/api/advanced/pedidos')).dados.pedidos.find(p=>p.id===id);assert.equal(p.autorizacaoValida,true);
  const d=await s.ana.post(`/api/advanced/pedidos/${id}/retomar`);assert.equal(d.status,200);assert.equal(d.dados.corpo.texto,texto);assert.equal(s.OR.chamadas.length,0);
 }finally{await s.fechar();}
});
test('solicitação por trabalho: etapas contextuais, anexos intactos e alternativa correspondente',async()=>{
 const s=await ambiente();try{
  const corpo={texto:'Compare estas propostas da Empresa Secreta Alfa, investigue divergências e monte uma apresentação PPTX de altíssimo nível com análise aprofundada de todos os cenários.',anexos:[{nome:'Privado-Alfa.txt',base64:Buffer.from('Proposta Alfa: 100 unidades, prazo 20 dias.').toString('base64')},{nome:'Privado-Beta.txt',base64:Buffer.from('Proposta Beta: 100 unidades, prazo 30 dias.').toString('base64')}]};
  const b=await enviarMensagem(s.ana,s.conv.id,corpo);assert.equal(b.status,403,JSON.stringify(b));const id=b.erro.advanced.pedido;
  const p=(await s.ana.get('/api/advanced/pedidos')).dados.pedidos.find(x=>x.id===id);
  assert.match(p.justificativa,/analisar 2 arquivos/);assert.match(p.justificativa,/comparar informações/);assert.match(p.justificativa,/apresentação/);
  assert.match(p.trabalho.alternativa.limites,/PowerPoint depende da liberação/);
  await s.ana.post(`/api/advanced/pedidos/${id}/solicitar`);
  const painel=(await s.admin.get('/api/admin/advanced')).dados;
  assert.doesNotMatch(JSON.stringify(painel),/Empresa Secreta|Privado-Alfa|Privado-Beta|100 unidades/);
  assert.equal(s.OR.chamadas.length,0);
  assert.equal(p.alternativa,true);
  const alt=await s.ana.post(`/api/advanced/pedidos/${id}/alternativa`);
  const executada=await enviarMensagem(s.ana,s.conv.id,alt.dados.corpo);assert.ok(!executada.falha,JSON.stringify(executada));
  assert.ok(!executada.fim.arquivos?.length);assert.ok(!executada.fim.artefatos?.length,'roteiro aceito não monta apresentação');
  const chamadas=s.OR.chamadas.length;
  assert.ok(s.OR.chamadas.some(c=>c.messages.some(m=>String(m.content).includes(p.trabalho.alternativa.instrucao))));
  await s.admin.post('/api/admin/advanced/autorizacoes',s.grant);
  const ret=await s.ana.post(`/api/advanced/pedidos/${id}/retomar`);assert.equal(ret.status,200);assert.deepEqual(ret.dados.corpo,corpo);
  assert.equal(s.OR.chamadas.length,chamadas,'retomar disponibiliza o pedido sem executar automaticamente');
 }finally{await s.fechar();}
});
