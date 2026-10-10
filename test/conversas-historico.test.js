import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulada } from '../src/ia.js';
import { subir } from './ajuda.js';
import { exec, um } from '../src/db.js';

test('resposta aparece uma vez com a rota atual; histórico de auditoria e outras conversas não duplicam conteúdo', async()=>{
 const S=await subir();try{
  const a=await S.cliente().entrar('admin@exemplo.com.br');
  const c=(await a.post('/api/conversas',{})).dados.conversa;
  const outra=(await a.post('/api/conversas',{})).dados.conversa;
  const em=S.app.agora().toISOString();
  const m=Number(exec(S.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','Escolha um tema.',?)",c.id,em).lastInsertRowid);
  const rota=(cid,exp,q)=>exec(S.app.db,"insert into roteamento(em,pessoa_id,conversa_id,resposta_id,modo,complexidade,explicacao,qualidade) values(?,?,?,?,'automatico','baixa',?,?)",em,a.pessoa.id,cid,m,exp,JSON.stringify(q));
  rota(c.id,'Histórico antigo',{status:'inconsistente',falhas:['completo']});
  rota(c.id,'Rota atual',{status:'pergunta',falhas:[],verificados:[]});
  rota(outra.id,'Não pertence a esta conversa',{status:'aprovado',falhas:[]});
  const d=(await a.get(`/api/conversas/${c.id}`)).dados;
  assert.equal(d.mensagens.length,1);
  assert.equal(d.mensagens[0].id,m);
  assert.equal(d.mensagens[0].rota_explicacao,'Rota atual');
  assert.equal(d.mensagens[0].qualidade.status,'pergunta');
  assert.equal(um(S.app.db,'select count(*) as n from roteamento where resposta_id=?',m).n,3,'a auditoria é preservada');
 }finally{await S.fechar();}
});

test('histórico paginado pesquisa e filtra só conversas da pessoa; excluir todas passa de 200 e preserva novas',async()=>{
 const S=await subir();try{
  const c=await S.cliente().entrar('admin@exemplo.com.br'),outra=await S.cliente().entrar('outra@exemplo.com.br');
  const protegida=(await outra.post('/api/conversas',{})).dados.conversa;
  for(let i=0;i<205;i++)exec(S.app.db,'insert into conversas(pessoa_id,titulo,criado_em,atualizado_em,sigilosa,teste) values(?,?,?,?,?,?)',c.pessoa.id,`Proposta ${i}`,S.app.agora().toISOString(),S.app.agora().toISOString(),i===4?1:0,i===204?1:0);
  let r=(await c.get('/api/conversas?todas=1&pagina=0')).dados;assert.equal(r.total,204);assert.equal(r.conversas.length,50);assert.equal(r.mais,true);
  assert.equal((await c.get('/api/conversas?todas=1&pagina=4')).dados.conversas.length,4);
  assert.equal((await c.get('/api/conversas?todas=1&pagina=0&tipo=sigilosas')).dados.total,1);
  assert.equal((await c.get('/api/conversas?todas=1&pagina=0&busca=Proposta%20100')).dados.total,1);
  assert.equal((await c.get('/api/conversas?todas=1&busca=%25')).dados.total,0);
  assert.equal((await c.req('DELETE','/api/conversas',{ate_id:999})).status,400);
  assert.equal((await c.del(`/api/conversas/${protegida.id}`)).status,404);
  const resumo=(await c.get('/api/conversas/resumo-exclusao')).dados;assert.equal(resumo.total,205);assert.equal(resumo.testes,1);
  const nova=(await c.post('/api/conversas',{})).dados.conversa;
  r=await c.req('DELETE','/api/conversas',{confirmacao:'EXCLUIR_TODAS',ate_id:resumo.ate_id});assert.equal(r.status,200);assert.equal(r.dados.excluidas,205);
  assert.equal((await c.get('/api/conversas?todas=1')).dados.total,1);assert.equal((await c.get(`/api/conversas/${nova.id}`)).status,200);
  assert.equal((await outra.get(`/api/conversas/${protegida.id}`)).status,200);
  assert.equal(S.app.db.prepare('pragma integrity_check').get().integrity_check,'ok');
 }finally{await S.fechar();}
});

test('excluir conversa limpa mensagens e anexos, invalida aprovação e remove material de integração',async()=>{
 const S=await subir();try{
  const c=await S.cliente().entrar('admin@exemplo.com.br');const id=(await c.post('/api/conversas',{})).dados.conversa.id,t=S.app.agora().toISOString();
  exec(S.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'user','Segredo do teste',?)",id,t);
  exec(S.app.db,"insert into anexos(conversa_id,nome,texto) values(?,'arquivo.txt','Anexo do teste')",id);
  exec(S.app.db,"insert into integ_planos(id,tenant_id,conversa_id,pessoa_id,passos,estado,status,criado_em,atualizado_em) values('pln_del','teste',?,?,'[]','{\"saida\":\"Segredo do teste\"}','aguardando_aprovacao',?,?)",id,c.pessoa.id,t,t);
  exec(S.app.db,"insert into integration_approvals(id,tenant_id,tipo,plano_id,resumo,status,criado_em) values('apr_del','teste','execucao','pln_del','{\"entrada\":\"Segredo do teste\"}','pendente',?)",t);
  assert.equal((await c.del(`/api/conversas/${id}`)).status,200);
  for(const tabela of ['mensagens','anexos','integ_planos'])assert.equal(um(S.app.db,`select count(*) as n from ${tabela} where conversa_id=?`,id).n,0);
  const a=um(S.app.db,"select * from integration_approvals where id='apr_del'");assert.equal(a.status,'negada');assert.equal(a.resumo,'{}');
  assert.equal((await c.get(`/api/conversas/${id}`)).status,404);
 }finally{await S.fechar();}
});

test('exclusão é recusada durante resposta em andamento e funciona após a conclusão',async()=>{
 let liberar,chegou;const pronto=new Promise(r=>chegou=r),espera=new Promise(r=>liberar=r);
 const ia=criarSimulada(), original=ia.enviar.bind(ia);
 const S=await subir({ia:{...ia,enviar:async function*(...args){chegou();await espera;yield* original(...args);}}});try{
  const c=await S.cliente().entrar('admin@exemplo.com.br');const id=(await c.post('/api/conversas',{})).dados.conversa.id;
  const enviando=c.post(`/api/conversas/${id}/mensagens`,{texto:'Escreva uma mensagem de teste.'});await pronto;
  assert.equal((await c.del(`/api/conversas/${id}`)).status,409);
  const r=(await c.get('/api/conversas/resumo-exclusao')).dados;assert.equal((await c.req('DELETE','/api/conversas',{confirmacao:'EXCLUIR_TODAS',ate_id:r.ate_id})).status,409);
  liberar();await enviando;assert.equal((await c.del(`/api/conversas/${id}`)).status,200);
 }finally{liberar?.();await S.fechar();}
});
