import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirPlataforma} from './ajuda-plataforma.js';
import {um} from '../src/db.js';

test('aviso comercial alcança destinatário configurado com origem, sem duplicar admin nem conceder acesso',async()=>{
 const S=await subirPlataforma({paginaInicial:'vendas',contatosVendasEmails:['comercial@example.test','comercial@example.test','ops@theneil.com.br']});
 try{
  const r=await S.navegador().post('/api/contato',{nome:'TESTE Fictício',email:'teste@example.test',empresa:'Empresa Fictícia',utm_source:'google',utm_medium:'cpc',utm_campaign:'greenia_direto',gclid:'TESTE'});
  assert.equal(r.status,200);assert.equal(r.dados.recebido,true);
  assert.equal(S.P.email.enviados.filter(m=>m.para==='comercial@example.test').length,1);
  assert.equal(S.P.email.enviados.filter(m=>m.para==='ops@theneil.com.br').length,1);
  const aviso=S.P.email.enviados.find(m=>m.para==='comercial@example.test');
  assert.match(aviso.texto,/Origem: google \/ cpc \/ greenia_direto \/ gclid: sim/);
  assert.doesNotMatch(aviso.texto,/teste@example.test|TESTE Fictício/);
  assert.equal(um(S.P.db,"select count(*) as n from users where email='comercial@example.test'").n,0);
 }finally{await S.fechar();}
});
