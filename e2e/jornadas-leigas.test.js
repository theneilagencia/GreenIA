import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec} from '../src/db.js';

test('espera orientada e falha de preparação permitem repetir ou voltar sem perder o objetivo',async()=>{
 const N=await subirComNavegador();try{
 const p=await N.entrar('admin@empresa-exemplo.com.br');
 let liberar,avisar;const espera=new Promise(r=>liberar=r),iniciado=new Promise(r=>avisar=r);
 await p.route('**/api/quick-wins/assistente/sugerir',async r=>{avisar();await espera;await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Serviço temporariamente indisponível.'})});});
 await p.goto(N.base+'/app#/qw/nova');await p.waitForSelector('#objetivo');
 const objetivo='Resumir um relatório fictício e preservar os valores e os riscos.';await p.fill('#objetivo',objetivo);await p.locator('[data-continuar]').click();await iniciado;
 assert.match(await p.locator('#etapa').innerText(),/organizando as etapas.*aproveitando o que você já informou/s);
 assert.equal(await p.locator('#etapa').getAttribute('aria-busy'),'true');liberar();
 await p.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();assert.equal(await p.locator('#etapa').getAttribute('aria-busy'),null);
 await p.getByRole('button',{name:'Voltar à etapa anterior',exact:true}).click();assert.equal(await p.inputValue('#objetivo'),objetivo);
 await p.unroute('**/api/quick-wins/assistente/sugerir');
 await p.route('**/api/quick-wins/assistente/sugerir',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária.'})}));
 await p.locator('[data-continuar]').click();await p.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();await p.unroute('**/api/quick-wins/assistente/sugerir');
 await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await p.waitForSelector('#processo');assert.equal(await p.locator('#etapa').getAttribute('aria-busy'),null);
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');assert.equal((await a.get('/api/quick-wins')).dados.quickWins.length,1,'a recuperação não cria outro rascunho');
 }finally{await N.fechar();}
});

test('erro de tela conserva a rota e tentar novamente abre o mesmo trabalho',async()=>{
 const N=await subirComNavegador();try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const q=(await a.post('/api/quick-wins',{nome:'Trabalho fictício para recuperação',toda_empresa:true})).dados;
 const p=await N.entrar('admin@empresa-exemplo.com.br');const erros=[];p.on('pageerror',e=>erros.push(e.message));
 await p.route(`**/api/quick-wins/${q.id}`,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária'})}));
 await p.goto(N.base+`/app#/qw/${q.id}`);await p.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor();
 assert.equal(new URL(p.url()).hash,`#/qw/${q.id}`);assert.equal(await p.locator('#principal a[href="#/nova"]').count(),0);
 await p.unroute(`**/api/quick-wins/${q.id}`);await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await p.getByRole('heading',{name:'Trabalho fictício para recuperação',exact:true}).waitFor();
 assert.match(await p.textContent('#principal'),/Trabalho fictício para recuperação/);assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});
test('ações visíveis, exemplos recolhidos e configuração com cancelamento preservam controles',async()=>{
 const N=await subirComNavegador();try{
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.setViewportSize({width:320,height:800});await p.waitForSelector('#entrada');
 for(const [id,nome] of [['anexar','Anexar arquivo'],['anexar-link','Adicionar link'],['enviar','Enviar'],['sair','Sair']])assert.match(await p.innerText('#'+id),new RegExp(nome));
 assert.equal(await p.isVisible('#sugestoes button'),false);await p.locator('#sugestoes summary').click();await p.locator('#sugestoes button').first().click();assert.ok((await p.inputValue('#entrada')).length>0);
 await p.waitForFunction(()=>document.getElementById('lateral').getBoundingClientRect().right<=1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.goto(N.base+'/app#/configuracoes');await p.waitForSelector('#form-cfg');const d=p.locator('details.cfg-caixa').filter({has:p.locator('#cfg-integracoes')});assert.equal(await p.isVisible('#cfg-integracoes'),false);await d.locator('summary').click();const antes=await p.isChecked('#cfg-integracoes');await p.setChecked('#cfg-integracoes',!antes);
 p.once('dialog',async dialog=>{assert.match(dialog.message(),/empresa toda/);await dialog.dismiss();});await p.locator('.cfg-salvar button').click();assert.equal(await p.isChecked('#cfg-integracoes'),!antes,'cancelar conserva a edição para revisão');
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');assert.equal((await a.get('/api/admin/config')).dados.integracoes.ativa,antes,'cancelar não grava nem muda o acesso');
 }finally{await N.fechar();}
});
test('registro histórico de bloqueio fica fora da contagem de pendências',async()=>{
 const N=await subirComNavegador();try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const antes=(await a.get('/api/acompanhamento')).dados;
 exec(N.app.db,"insert into eventos(tipo,pessoa_id,detalhes,em) values('governance.blocked',?,?,datetime('now'))",a.pessoa.id,'{}');const depois=(await a.get('/api/acompanhamento')).dados;
 assert.equal(depois.pendencias.length,antes.pendencias.length);assert.equal(depois.avisos.length,1);
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+'/app#/pendencias');await p.waitForSelector('#pend-contagem');assert.doesNotMatch(await p.innerText('#pend-lista'),/Bloqueio de governança/);
 await p.getByText('Registros recentes para consultar (1)',{exact:true}).click();assert.match(await p.innerText('#principal'),/não significa que o bloqueio continua ativo/);
 }finally{await N.fechar();}
});
test('navegar entre biblioteca e detalhe não repete confirmação nem gravação de Quick Win',async()=>{
 const N=await subirComNavegador();try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const q=(await a.post('/api/quick-wins',{nome:'QA fictício navegação',toda_empresa:true})).dados;
 const p=await N.entrar('admin@empresa-exemplo.com.br');let confirmacoes=0,gravacoes=0;
 p.on('dialog',async d=>{confirmacoes++;await d.accept();});p.on('request',r=>{if(r.method()==='PUT'&&r.url()===`${N.base}/api/quick-wins/${q.id}`)gravacoes++;});
 await p.goto(N.base+'/app#/quick-wins');await p.locator(`.qw-item-link[href="#/qw/${q.id}"]`).waitFor();
 assert.match(await p.locator('.menu-acoes summary').first().innerText(),/Mais ações/,'ação identificada por texto visível');
 for(let i=0;i<3;i++){
  await p.locator(`.qw-item-link[href="#/qw/${q.id}"]`).click();await p.getByRole('heading',{name:q.nome,exact:true}).waitFor();
  if(i<2){await p.locator('#principal a[href="#/quick-wins"]').click();await p.locator(`.qw-item-link[href="#/qw/${q.id}"]`).waitFor();}
 }
 await p.locator('summary[aria-label="Mais ações"]').click();await p.getByRole('menuitem',{name:'Arquivar',exact:true}).click();
 await p.locator('[data-acao=restaurar]').waitFor({state:'attached'});
 assert.equal(confirmacoes,1);assert.equal(gravacoes,1);assert.equal((await a.get(`/api/quick-wins/${q.id}`)).dados.status,'descartado');
 assert.match(await p.locator('#principal').innerText(),/QA fictício navegação/);assert.equal(await p.locator('#buscar-qw').count(),0,'a ação mantém o detalhe, sem redesenhar a biblioteca anterior');
 await p.locator('summary[aria-label="Mais ações"]').click();await p.getByRole('menuitem',{name:'Restaurar em preparo',exact:true}).click();
 await p.locator('[data-acao=arquivar]').waitFor({state:'attached'});
 assert.equal(confirmacoes,2);assert.equal(gravacoes,2);assert.equal((await a.get(`/api/quick-wins/${q.id}`)).dados.status,'em_configuracao');
 }finally{await N.fechar();}
});
