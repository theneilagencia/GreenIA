import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {salvarConfig} from '../src/config.js';
let N,p;const erros=[];
before(async()=>{N=await subirComNavegador();salvarConfig(N.app.db,{dominios:['empresa-exemplo.com.br']});p=await N.entrar('admin@empresa-exemplo.com.br');p.on('pageerror',e=>erros.push(e.message));});
after(async()=>{await N?.fechar();assert.deepEqual(erros,[]);});
async function abrir(){await p.goto(N.base+'/app#/nova');await p.reload();await p.waitForSelector('#me-ajude-comecar');await p.click('#me-ajude-comecar');}
test('cinco caminhos preparam pedidos editáveis sem enviar ou criar conversa',async()=>{
 for(let i=0;i<4;i++){
  await abrir();assert.equal(await p.locator('[data-comecar]').count(),5);assert.equal(await p.locator('#comecar-pedido').isVisible(),false);assert.equal(await p.locator('#comecar-titulo').evaluate(e=>e===document.activeElement),true);
  let escritas=0;const monitor=r=>{if(r.method()==='POST')escritas++;};p.on('request',monitor);
  await p.click(`[data-comecar="${i}"]`);await p.fill('#comecar-objetivo','Caso fictício: <script>alert(1)</script>');await p.click('#comecar-form button[type=submit]');
  assert.match(await p.inputValue('#entrada'),/Caso fictício: <script>/);assert.equal(await p.locator('#entrada').evaluate(e=>e===document.activeElement),true);assert.equal(await p.locator('#enviar').isDisabled(),false);assert.equal(escritas,0);p.off('request',monitor);
  assert.equal(await p.locator('.bolha-eu').count(),0);await p.fill('#entrada','Pedido revisado por uma pessoa');assert.equal(await p.inputValue('#entrada'),'Pedido revisado por uma pessoa');
 }
});
test('voltar, fechar e redesenhar conservam contexto; pedido anterior exige confirmação; anexos mantidos',async()=>{
 await abrir();await p.fill('#entrada','Pedido anterior');await p.locator('#arquivo').setInputFiles({name:'caso.txt',mimeType:'text/plain',buffer:Buffer.from('Informação fictícia')});await p.waitForSelector('.anexo-chip');
 await p.click('[data-comecar="0"]');await p.fill('#comecar-objetivo','Contexto fictício');await p.click('#comecar-voltar');await p.click('[data-comecar="0"]');assert.equal(await p.inputValue('#comecar-objetivo'),'Contexto fictício');
 p.once('dialog',d=>d.dismiss());await p.click('#comecar-form button[type=submit]');assert.equal(await p.inputValue('#entrada'),'Pedido anterior');
 await p.click('#comecar-fechar');assert.equal(await p.locator('#me-ajude-comecar').evaluate(e=>e===document.activeElement),true);await p.click('#me-ajude-comecar');assert.equal(await p.inputValue('#comecar-objetivo'),'Contexto fictício');
 // A seleção de nível redesenha a conversa e deve preservar a ajuda e o material.
 const modelo=p.locator('#modelo');if(await modelo.count()){const v=await modelo.locator('option:not([disabled])').last().getAttribute('value');await modelo.selectOption(v);assert.equal(await p.inputValue('#comecar-objetivo'),'Contexto fictício');}
 p.once('dialog',d=>d.accept());await p.click('#comecar-form button[type=submit]');assert.match(await p.inputValue('#entrada'),/Contexto fictício/);assert.equal(await p.locator('#anexos .anexo-chip').count(),1);
});
test('Conhecimento e processos encaminham aos recursos existentes sem executar ações externas',async()=>{
 await abrir();await p.click('[data-comecar="3"]');assert.match(await p.textContent('#comecar-material'),/autorizados.*fontes/);await p.getByRole('link',{name:'Ver conhecimento disponível',exact:true}).click();await p.waitForURL(/#\/conhecimento$/);
 await abrir();await p.click('[data-comecar="4"]');assert.equal(await p.locator('#comecar-form').count(),0);assert.match(await p.textContent('#ajude-comecar'),/permissões e aprovações/);await p.getByRole('link',{name:'Escolher um Quick Win',exact:true}).click();await p.waitForURL(/#\/quick-wins$/);await p.waitForFunction(()=>document.querySelector('#principal h1')?.textContent==='Quick Wins');
});
test('teclado, validação e layout mobile não deixam enviar ajuda vazia ou transbordar',async()=>{
 for(const width of [320,390,768,1280]){
  await p.setViewportSize({width,height:850});await abrir();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.locator('[data-comecar="2"]').focus();await p.keyboard.press('Enter');await p.click('#comecar-form button[type=submit]');assert.equal(await p.inputValue('#entrada'),'');
  await p.fill('#comecar-objetivo','   ');await p.click('#comecar-form button[type=submit]');assert.equal(await p.inputValue('#entrada'),'');await p.fill('#comecar-objetivo','Planejar reunião fictícia');await p.click('#comecar-form button[type=submit]');assert.match(await p.inputValue('#entrada'),/Planejar reunião/);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
});

test('pedido preparado só executa após envio explícito e recebe resposta pelo fluxo existente',async()=>{
 await abrir();await p.click('[data-comecar="0"]');await p.fill('#comecar-objetivo','Criar uma mensagem fictícia para convidar a equipe para reunião');await p.click('#comecar-form button[type=submit]');
 const pedido=await p.inputValue('#entrada');await p.click('#enviar');await p.waitForSelector('.bolha-eu');await p.waitForSelector('.rodape-resposta');assert.equal((await p.textContent('.bolha-eu')).trim(),pedido);assert.match(p.url(),/#\/c\/\d+/);assert.equal(await p.locator('#me-ajude-comecar').count(),0);
});

test('pessoa comum recebe a mesma orientação e mantém o catálogo limitado ao seu acesso',async()=>{
 const q=await N.entrar('iniciante@empresa-exemplo.com.br');await q.goto(N.base+'/app#/nova');await q.waitForSelector('#me-ajude-comecar');await q.click('#me-ajude-comecar');assert.equal(await q.locator('[data-comecar]').count(),5);
 await q.screenshot({path:'/workspace/scratch/304260aee8ba/evidencias-qa/greenia-ajude-comecar-desktop.png',fullPage:true});
 await q.setViewportSize({width:390,height:850});await q.waitForFunction(()=>document.getElementById('lateral').getBoundingClientRect().right<=1);await q.screenshot({path:'/workspace/scratch/304260aee8ba/evidencias-qa/greenia-ajude-comecar-mobile.png',fullPage:true});
 await q.click('[data-comecar="4"]');await q.getByRole('link',{name:'Escolher um Quick Win',exact:true}).click();await q.waitForFunction(()=>document.querySelector('#principal')?.textContent.includes('Ainda não há Quick Wins disponíveis para você.'));assert.equal(await q.getByRole('link',{name:'Criar meu primeiro Quick Win',exact:true}).count(),0);await q.close();
});
