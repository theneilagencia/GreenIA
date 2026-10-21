import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criarApp} from '../src/servidor.js';
import {iaTrocavel} from '../src/plataforma/servidor.js';
import {atualizarCatalogo,acharModelo} from '../src/modelos.js';
import {lerConfig} from '../src/config.js';
const id='anthropic/claude-opus-5.5';
function provedor(tag){return {
 async listarModelos(){return [{id,nome:id,fornecedor:'anthropic',precoEntrada:0.000004,precoSaida:0.00002,contexto:1000000,maxSaida:128000,parametros:['max_tokens','reasoning','tools'],modalidades:['text']}];},
 async listarRotas(modelo){assert.equal(modelo,id);return [{id:tag,contexto:1000000,maxSaida:128000,parametros:['max_tokens','reasoning','tools'],entrada:0.000004,saida:0.00002}];}
};}
test('multiempresa: atualização chega às rotas do provedor ativo e acompanha rotação de chave',async()=>{
 const ia=iaTrocavel(provedor('anthropic'));
 const app=criarApp({ia,log:()=>{}});
 try{
  await atualizarCatalogo(app);
  assert.deepEqual(acharModelo(app.db,lerConfig(app.db),id).atributos.catalogo.rotas.map(r=>r.id),['anthropic']);
  ia.trocar(provedor('azure/global'));
  await atualizarCatalogo(app);
  assert.deepEqual(acharModelo(app.db,lerConfig(app.db),id).atributos.catalogo.rotas.map(r=>r.id),['azure/global']);
 }finally{app.db.close();}
});
test('multiempresa: provedor sem consulta de rotas falha fechado',()=>{
 const ia=iaTrocavel({listarModelos:async()=>[]});
 assert.throws(()=>ia.listarRotas(id),/consulta de rotas não está disponível/);
});
