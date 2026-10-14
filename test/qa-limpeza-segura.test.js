import {test} from 'node:test';
import assert from 'node:assert/strict';
import limpar from '../scripts/qa-modulos/limpeza.mjs';

test('limpeza não escolhe recursos só pelo nome e não desliga integrações da empresa',async()=>{
 const chamadas=[];let resultado;
 const c={estado:{criados:{quick_wins:[1],conectores:['da-missao','renomeado']}},salvar:(_,r)=>resultado=r,log:()=>{},api:async(m,p)=>{
  chamadas.push([m,p]);
  if(p==='/api/quick-wins')return {status:200,dados:{quickWins:[{id:2,nome:'QA - legítimo',podeEditar:true}]}};
  if(p==='/api/quick-wins/1')return {status:200,dados:{nome:'QA - criado pela missão'}};
  if(p==='/api/admin/integracoes')return {status:200,dados:{conectores:[{id:'alheio',nome:'Sandbox da operação',status:'ACTIVE'}]}};
  if(p==='/api/admin/integracoes/da-missao')return {status:200,dados:{nome:'QA - criado pela missão',status:'DRAFT'}};
  if(p==='/api/admin/integracoes/renomeado')return {status:200,dados:{nome:'Integração real',status:'ACTIVE'}};
  if(p==='/api/admin/config')return {status:200,dados:{integracoes:{ativa:true}}};
  return {status:200,dados:{}};
 }};
 await limpar(c);
 assert.deepEqual(chamadas.filter(([m])=>m!=='GET'),[['DELETE','/api/quick-wins/1'],['POST','/api/admin/integracoes/da-missao/revogar']]);
 assert.deepEqual(resultado.candidatos_conectores,['alheio']);assert.equal(resultado.integracoes,true);
 assert.deepEqual(resultado.restantes_qa,[2]);
});
