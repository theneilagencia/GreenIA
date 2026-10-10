import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec,um} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';

test('pessoa define o nome na criação e o rascunho mantém nome e objetivo após recarregar',async()=>{
 const N=await subirComNavegador();try{
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+'/app#/qw/nova');await p.waitForSelector('#nome-inicial');
 assert.equal(await p.locator('#nome-inicial').isVisible(),true);assert.ok(await p.locator('#nome-inicial').evaluate(el=>el.getBoundingClientRect().top<document.getElementById('objetivo').getBoundingClientRect().top),'nome aparece antes do objetivo');
 await p.fill('#nome-inicial','Resumo da reunião semanal');await p.fill('#objetivo','Resumir anotações fictícias de reunião e destacar decisões.');await p.locator('[data-continuar]').click();await p.waitForSelector('#processo');
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const q=(await a.get('/api/quick-wins')).dados.quickWins[0];assert.equal(q.nome,'Resumo da reunião semanal');assert.match(q.para_que_serve,/^Resume anotações fictícias/,'a descrição explica o objetivo, sem repetir o nome escolhido');
 await p.reload();await p.waitForSelector('#nome-inicial');assert.equal(await p.inputValue('#nome-inicial'),q.nome);assert.match(await p.inputValue('#objetivo'),/destacar decisões/);
 }finally{await N.fechar();}
});

test('editar nome tem cancelamento e recuperação, persiste para a equipe e preserva publicação, agenda e histórico',async()=>{
 const N=await subirComNavegador();try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const q=(await a.post('/api/quick-wins',{assistente:{descricao:'Resumir anotações fictícias',nome:'Nome original de QA',formato:'texto',regras:['nao_inventar']},toda_empresa:true})).dados;
 const spec=JSON.stringify(construir({descricao:'Resumir anotações fictícias',nome:q.nome,formato:'texto'}));const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,spec,q.nome,new Date().toISOString()).lastInsertRowid;
 exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,q.id);
 const agenda=(await a.post(`/api/quick-wins/${q.id}/programacoes`,{nome:'Agenda fictícia preservada',tipo:'horario',agenda:{frequencia:'diaria',hora:'09:00',fuso:'America/Sao_Paulo'},entrada:'Anotações fictícias',limite_creditos:100,max_dia:1})).dados;
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.setViewportSize({width:320,height:844});await p.goto(N.base+`/app#/qw/${q.id}`);await p.locator('.pg-nome').getByRole('button',{name:'Editar nome',exact:true}).waitFor();assert.equal(await p.locator('.pg-nome h2').innerText(),q.nome,'editar nome fica ao lado do próprio nome, fora de menus');await p.getByText('Editar nome',{exact:true}).click();await p.fill('#qw-nome','Alteração cancelada');await p.click('#qw-nome-cancelar');assert.equal((await a.get(`/api/quick-wins/${q.id}`)).dados.nome,q.nome);
 await p.getByText('Editar nome',{exact:true}).click();await p.fill('#qw-nome','   ');await p.click('#qw-nome-salvar');assert.match(await p.innerText('#qw-nome-erro'),/Escreva um nome/);
 const novo='Resumo semanal de decisões';await p.fill('#qw-nome',novo);await p.route(`**/api/quick-wins/${q.id}`,async r=>r.request().method()==='PUT'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária.'})}):r.continue());await p.click('#qw-nome-salvar');await p.waitForFunction(()=>document.querySelector('#qw-nome-erro')?.textContent.includes('texto foi mantido'));assert.equal(await p.inputValue('#qw-nome'),novo);await p.unroute(`**/api/quick-wins/${q.id}`);
 await p.click('#qw-nome-salvar');await p.getByRole('heading',{name:novo,exact:true}).waitFor();await p.reload();await p.getByRole('heading',{name:novo,exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const depois=um(N.app.db,'select * from quick_wins where id=?',q.id);assert.equal(depois.versao_publicada,v);assert.equal(depois.especificacao,spec);assert.equal(depois.status,'em_uso');assert.equal(um(N.app.db,'select nome from quick_win_versoes where id=?',v).nome,q.nome);assert.equal((await a.get(`/api/quick-wins/${q.id}/programacoes`)).dados.programacoes[0].id,agenda.id);
 const comum=await cliente(N.app,N.base).entrar('pessoa@empresa-exemplo.com.br');assert.equal((await comum.get(`/api/quick-wins/${q.id}`)).dados.nome,novo);assert.equal((await comum.put(`/api/quick-wins/${q.id}`,{nome:'Sem autorização'})).status,403);
 const u=await N.entrar('pessoa@empresa-exemplo.com.br');await u.goto(N.base+`/app#/qw/${q.id}`);await u.getByRole('heading',{name:novo,exact:true}).waitFor();assert.equal(await u.getByText('Editar nome',{exact:true}).count(),0);
 assert.equal((await a.put(`/api/quick-wins/${q.id}`,{nome:'senha=SegredoNaoReal123!'})).status,422);assert.equal((await a.get(`/api/quick-wins/${q.id}`)).dados.nome,novo);
 }finally{await N.fechar();}
});
