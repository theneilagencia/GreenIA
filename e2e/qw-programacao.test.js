import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec,um} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';
import {rodadaProgramadas} from '../src/qw-programacao.js';

test('programação guiada salva pausada, funciona após fechar aba e cabe no celular',async()=>{
 const N=await subirComNavegador();try{
  const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const q=(await a.post('/api/quick-wins',{nome:'Resumo fictício de QA',toda_empresa:true})).dados;
  const spec=JSON.stringify(construir({descricao:'Organizar as atividades informadas da equipe',formato:'texto'}));const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,spec,q.nome,new Date().toISOString()).lastInsertRowid;
  exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,q.id);
  let p=await N.entrar('admin@empresa-exemplo.com.br');const erros=[];p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+`/app#/qw/${q.id}/programar`);await p.waitForSelector('#rotina-form');
  await p.fill('#rotina-nome','Rotina fictícia de QA');await p.fill('#rotina-entrada','Organizar três atividades fictícias: revisão de cadastro, conferência de pedidos e preparação da reunião.');await p.selectOption('#rotina-frequencia','semanal');await p.selectOption('#rotina-dia','1');await p.fill('#rotina-hora','09:00');
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.click('#rotina-salvar');await p.waitForSelector('[data-estado]');
  const s=um(N.app.db,'select * from qw_programacoes');assert.equal(s.ativa,0);await p.click('[data-estado]');await p.waitForSelector('[data-executar]');await p.click('[data-executar]');await p.waitForSelector('.qw-rotina-historico summary');await p.click('.qw-rotina-historico summary');await p.waitForSelector('text=Na fila');await p.close();await rodadaProgramadas(N.app);
  const e=um(N.app.db,'select * from qw_programadas_execucoes');assert.ok(e.conversa_id);assert.notEqual(e.status,'executando');assert.notEqual(e.status,'bloqueada');
  p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+'/app#/quick-wins/programados');await p.waitForSelector('.qw-rotina-card');await p.click('.qw-rotina-historico summary');await p.waitForSelector('text=Abrir resultado');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.getByRole('link',{name:'Abrir resultado'}).click();await p.waitForSelector('.resposta');assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});
