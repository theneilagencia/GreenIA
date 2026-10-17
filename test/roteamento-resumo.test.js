import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subir} from './ajuda.js';
import {exec} from '../src/db.js';
test('resumo conta respostas e consumo no mesmo escopo; bloqueios, escolhas e alternativas separados',async()=>{
 const s=await subir();try{
  const admin=await s.cliente().entrar('admin@exemplo.com.br'),em=s.app.agora().toISOString();
  for(const [modo,resultado,teste,custo,fallback] of [['automatico','respondido',0,.1,null],['manual','respondido',0,.2,'{"tipo":"abaixo_do_necessario_por_escolha"}'],['bloqueado_pela_politica','bloqueado',0,.9,null],['externo','respondido',0,.7,null],['automatico','respondido',1,.8,null],['automatico','enviado',0,.3,null]])
   exec(s.app.db,'insert into roteamento(em,modo,complexidade,resultado,teste,custo_real,fallback) values (?,?,?,?,?,?,?)',em,modo,'simples',resultado,teste,custo,fallback);
  exec(s.app.db,"insert into eventos(em,tipo) values (?,'advanced.alternative_started')",em);
  const r=await admin.get('/api/admin/roteamento?limite=2');assert.equal(r.status,200);const d=r.dados;
  assert.equal(d.resumo.decisoes,2);assert.ok(Math.abs(d.resumo.consumo.realizado.custo-30)<1e-8);
  assert.deepEqual(d.resumo.atencao,{respostasAbaixo:1,bloqueios:1,manuais:1,roteamentoExterno:1,alternativasIniciadas:1});
  assert.equal(d.paginacao.total,5);assert.equal(d.paginacao.paginas,3);assert.equal(d.decisoes.length,2);
  const filtrado=(await admin.get('/api/admin/roteamento?situacao=bloqueado')).dados;assert.equal(filtrado.decisoes.length,1);assert.equal(filtrado.decisoes[0].resultado,'bloqueado');
  assert.equal((await admin.get('/api/admin/roteamento?pagina=Infinity&situacao=__proto__')).status,200);
 }finally{await s.fechar();}
});
