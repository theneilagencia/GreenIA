import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';

test('histórico: busca, menu, renomear, cancelamento e exclusão individual e total no celular',async()=>{
 const N=await subirComNavegador();try{
 const c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 for(let i=0;i<53;i++){const q=(await c.post('/api/conversas',{})).dados.conversa;await c.patch(`/api/conversas/${q.id}`,{titulo:i===0?'Proposta Aurora':`Análise ${i}`});}
 const p=await N.entrar('admin@empresa-exemplo.com.br'),erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.goto(N.base+'/app#/conversas');await p.waitForSelector('.hc-conversa');assert.equal(await p.locator('.hc-conversa').count(),50);
 await p.getByRole('button',{name:'Carregar mais conversas'}).click();await p.waitForFunction(()=>document.querySelectorAll('.hc-conversa').length===53);
 await p.fill('#hc-busca','Aurora');await p.waitForFunction(()=>document.querySelectorAll('.hc-conversa').length===1);
 assert.equal(await p.locator('.hc-resumo').textContent(),'1 conversa encontrada');
 await p.locator('.hc-lista .hc-acoes').click();await p.getByRole('menuitem',{name:'Renomear',exact:true}).click();
 await p.getByRole('dialog').getByRole('textbox',{name:'Nome da conversa'}).fill('Proposta Aurora revisada');await p.getByRole('button',{name:'Salvar nome',exact:true}).click();await p.waitForSelector('.hc-modal-fundo',{state:'detached'});
 assert.ok(await p.locator('.hc-conversa').filter({hasText:'Proposta Aurora revisada'}).count());
 await p.locator('.hc-lista .hc-acoes').click();await p.getByRole('menuitem',{name:'Excluir conversa',exact:true}).click();
 await p.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal((await c.get('/api/conversas?todas=1')).dados.total,53);
 await p.locator('.hc-lista .hc-acoes').click();await p.getByRole('menuitem',{name:'Excluir conversa',exact:true}).click();
 await p.getByRole('dialog').getByRole('button',{name:'Excluir conversa',exact:true}).click();await p.waitForSelector('.hc-modal-fundo',{state:'detached'});assert.equal((await c.get('/api/conversas?todas=1')).dados.total,52);
 await p.fill('#hc-busca','');await p.waitForSelector('.hc-conversa');
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.getByRole('button',{name:'Excluir todas',exact:true}).click();await p.waitForSelector('[data-aceitar]');assert.ok(await p.getByRole('dialog').isVisible());assert.equal(await p.getByRole('dialog').getByRole('button',{name:'Excluir todas',exact:true}).isEnabled(),false);
 await p.getByRole('dialog').press('Escape');assert.equal((await c.get('/api/conversas?todas=1')).dados.total,52);
 await p.getByRole('button',{name:'Excluir todas',exact:true}).click();await p.locator('[data-aceitar]').check();await p.getByRole('dialog').getByRole('button',{name:'Excluir todas',exact:true}).click();await p.waitForSelector('.hc-modal-fundo',{state:'detached'});
 assert.equal((await c.get('/api/conversas?todas=1')).dados.total,0);assert.equal(await p.locator('#lateral .hc-recente').count(),0);assert.ok(await p.getByText('Seu histórico começa aqui',{exact:true}).isVisible());assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});

test('histórico: falha de exclusão preserva a conversa; ação da conversa aberta e acesso pela lateral',async()=>{
 const N=await subirComNavegador();try{
 const c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const ids=[];
 for(const titulo of ['Proposta Aurora · revisão comercial','Comparação de fornecedores','Plano de implantação','Análise do documento de compras','Preparar reunião de amanhã','Organizar as atividades da equipe']){const q=(await c.post('/api/conversas',{})).dados.conversa;ids.push(q.id);await c.patch(`/api/conversas/${q.id}`,{titulo});}
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+'/app#/conversas');await p.waitForSelector('.hc-conversa');
 await p.setViewportSize({width:1280,height:900});await p.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'));await p.screenshot({path:'/tmp/greenia-historico-desktop.png'});
 for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'));await p.screenshot({path:'/tmp/greenia-historico-mobile.png'});
 await p.goto(N.base+`/app#/c/${ids[0]}`);await p.waitForSelector('#apagar');await p.click('#apagar');await p.waitForSelector('.hc-modal');
 await p.route(`**/api/conversas/${ids[0]}`,route=>route.request().method()==='DELETE'?route.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Não foi possível excluir agora."}'}):route.continue());
 await p.getByRole('dialog').getByRole('button',{name:'Excluir conversa',exact:true}).click();await p.waitForSelector('.hc-erro:not([hidden])');assert.ok(await p.getByText('Não foi possível excluir agora.',{exact:true}).isVisible());assert.equal((await c.get(`/api/conversas/${ids[0]}`)).status,200);
 await p.unroute(`**/api/conversas/${ids[0]}`);await p.getByRole('dialog').getByRole('button',{name:'Excluir conversa',exact:true}).click();await p.waitForURL(/#\/conversas$/);await p.waitForSelector('.hc-conversa');assert.equal((await c.get(`/api/conversas/${ids[0]}`)).status,404);
 await p.setViewportSize({width:1280,height:900});await p.locator('#lateral .hc-recente .hc-acoes').first().click();assert.ok(await p.getByRole('menuitem',{name:'Excluir conversa',exact:true}).isVisible());await p.getByRole('menuitem',{name:'Renomear',exact:true}).press('Escape');assert.equal(await p.getByRole('menu').count(),0);
 }finally{await N.fechar();}
});
