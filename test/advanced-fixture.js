// Catálogo fictício confirmado exclusivamente para testes de protocolo, nunca evidência de IA real.
import assert from 'node:assert/strict';
import {exec,um} from '../src/db.js';
import {salvarConfig} from '../src/config.js';
export function catalogoAdvancedFalso(app, modelos, provedores=['anthropic']) {
  for(const id of modelos){
    const m=um(app.db,'select * from modelos where id=?',id);assert.ok(m,id);
    const parametros=['max_tokens','reasoning'];
    const contexto=Math.max(m.contexto||0,1000000),maxSaida=65536;
    const rota={contexto,maxSaida,entrada:m.preco_entrada||0.000002,saida:m.preco_saida||0.00001,parametros};
    const atributos={...JSON.parse(m.atributos||'{}'),catalogo:{...rota,consultadoEm:app.agora().toISOString(),rotas:provedores.map(id=>({...rota,id}))}};
    exec(app.db,'update modelos set atributos=? where id=?',JSON.stringify(atributos),id);
  }
}
export async function autorizarAdvancedFalso(s,admin,pessoa,modelos,provedores=['anthropic']){
  catalogoAdvancedFalso(s.app,modelos,provedores);
  salvarConfig(s.app.db,{advanced:{limiteMensalUsd:1000}});
  for(const id of modelos){const r=await admin.put('/api/admin/advanced/modelos/'+encodeURIComponent(id),{aprovado:true,provedores,justificativa:'Rota fictícia revisada para teste local, sem inferência real.'});assert.equal(r.status,200,JSON.stringify(r.dados));}
  const r=await admin.post('/api/admin/advanced/autorizacoes',{pessoa_id:pessoa.id,modelos,provedores,limite_usd:100,limite_chamada_usd:10,saida_tokens:32768,pesquisa_web:true,expira_em:new Date(s.app.agora().getTime()+86400000).toISOString()});
  assert.equal(r.status,200,JSON.stringify(r.dados));return r.dados.id;
}
