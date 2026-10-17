import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirPlataforma} from './ajuda-plataforma.js';
import {exec,um} from '../src/db.js';
test('Uso e resultados multiempresa: bancos isolados, permissão granular, convites e finanças só no console geral',async()=>{
 const s=await subirPlataforma();try{
  const ops=await s.navegador().entrarConsole('ops@theneil.com.br');const plano=(await ops.get('/api/plataforma/planos')).dados.planos[0].id;
  const A=(await ops.post('/api/plataforma/empresas',{name:'Empresa Alfa',slug:'alfa',plan_id:plano,admin_email:'ana@alfa.com',status:'ativa'})).dados;
  const B=(await ops.post('/api/plataforma/empresas',{name:'Empresa Beta',slug:'beta',plan_id:plano,admin_email:'bia@beta.com',status:'ativa'})).dados;
  const ana=s.navegador(),bia=s.navegador();await ana.get('/alfa');await ana.entrarEmpresa('ana@alfa.com');await bia.get('/beta');await bia.entrarEmpresa('bia@beta.com');
  const ta=s.P.tenant(A.id),tb=s.P.tenant(B.id),pa=um(ta.db,'select id from pessoas where email=?','ana@alfa.com').id;
  const t=Number(exec(ta.db,"insert into trabalhos(pessoa_id,tipo,aberto_em,atualizado_em) values (?,'analise',?,?)",pa,s.P.agora().toISOString(),s.P.agora().toISOString()).lastInsertRowid);
  assert.equal((await ana.get('/api/resultados?visao=empresa')).status,200);assert.equal((await bia.get('/api/resultados/trabalhos/'+t)).status,404);
  assert.equal((await bia.get('/api/resultados.csv?visao=empresa')).status,200);assert.equal((await bia.get('/api/resultados?visao=empresa')).dados.coorte.iniciados,0);
  const geral=await ops.get(`/api/plataforma/empresas/${A.id}/resultados`);assert.equal(geral.status,200,JSON.stringify(geral.dados));assert.ok(geral.dados.financeiro);assert.equal(geral.dados.uso.coorte.iniciados,1);
  assert.equal((await ana.get(`/api/plataforma/empresas/${A.id}/resultados`)).status,401);assert.equal((await ana.get('/api/operador/resultados')).status,403);
  const uid=um(ta.db,'select user_id from pessoas where id=?',pa).user_id;
  const role=um(s.P.db,"select id from roles where key='member'").id;exec(s.P.db,'update company_users set role_id=? where company_id=? and user_id=?',role,A.id,uid);
  assert.equal((await ana.get('/api/resultados?visao=empresa')).status,403);assert.equal((await ana.get('/api/resultados')).status,200);assert.equal((await ana.put('/api/resultados/contas/'+pa,{categoria:'teste'})).status,403);
 }finally{await s.fechar();}
});
