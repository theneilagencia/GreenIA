import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { um } from '../src/db.js';
let S, B;
before(async()=>{ S=await subirPlataforma({paginaInicial:'vendas'}); B=await chromium.launch({executablePath:process.env.CHROMIUM_PATH}); });
after(async()=>{await B?.close();await S?.fechar();});
async function abrir({width=1280,storage=true,block=false}={}) {
 const c=await B.newContext({viewport:{width,height:820}});
 if(!storage)await c.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('bloqueado')}});Object.defineProperty(window,'sessionStorage',{get(){throw new Error('bloqueado')}});});
 const google=[],conversoes=[],posts=[],erros=[];
 await c.route(url=>url.hostname==='www.googletagmanager.com',async r=>{
  google.push(r.request().url());
  if(block)return r.abort();
  await r.fulfill({contentType:'application/javascript',body:`(function(){var ud={};function cmd(a){if(a[0]==='set'&&a[1]==='user_data')ud=a[2];if(a[0]==='event'&&a[1]==='conversion')fetch('https://www.googleadservices.com/pagead/conversion/18400941509/?label=dMHzCLDLypwdEMWroMZE',{method:'POST',body:JSON.stringify({evento:a[2],user_data:ud})});}window.dataLayer.forEach(a=>cmd(Array.from(a)));window.gtag=function(){window.dataLayer.push(arguments);cmd(Array.from(arguments));};})();`});
 });
 await c.route(url=>url.hostname==='www.googleadservices.com',async r=>{conversoes.push(JSON.parse(r.request().postData()||'{}'));await r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'ok'});});
 await c.route(url=>!['127.0.0.1','localhost','www.googletagmanager.com','www.googleadservices.com'].includes(url.hostname),r=>r.abort());
 const p=await c.newPage();p.on('pageerror',e=>erros.push(e.message));p.on('request',r=>{if(r.url().endsWith('/api/contato'))posts.push(JSON.parse(r.postData()));});
 await p.goto(S.base+'/?utm_source=google&utm_medium=cpc&utm_campaign=greenia_direto&utm_term=teste&gclid=TESTE&token=NAO_GUARDAR');
 await p.locator('#gia-consent').waitFor({state:'visible'});
 return {c,p,google,conversoes,posts,erros};
}
async function preencher(p,email='qa-publicidade@exemplo.test'){
 await p.fill('#c-nome','TESTE FICTÍCIO TheNeil');await p.fill('#c-email',email);await p.fill('#c-empresa','Empresa Fictícia');
}
async function enviar(p){await p.click('#c-enviar');await p.locator('#c-ok:not(.oculto)').waitFor();}

test('aceitar: contato real, origem, hash e uma conversão; sucesso visual não dispara duplicata',async()=>{
 const t=await abrir();try{
  assert.equal(t.google.length,0);assert.equal(await t.p.locator('input[name=gclid]').inputValue(),'');
  await t.p.locator('[data-gia=granted]').click();await t.p.waitForFunction(()=>typeof window.gtag==='function');
  await preencher(t.p);const medicao=t.p.waitForResponse(r=>r.url().includes('googleadservices.com'));await enviar(t.p);await t.p.waitForFunction(()=>window.dataLayer?.some(a=>a[0]==='event'&&a[1]==='conversion'));
  await medicao;
  assert.equal(t.conversoes.length,1);assert.equal(t.posts[0].utm_campaign,'greenia_direto');assert.equal(t.posts[0].gclid,'TESTE');assert.doesNotMatch(t.posts[0].pagina_entrada,/NAO_GUARDAR|token=/);
  assert.match(t.conversoes[0].user_data.sha256_email_address,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(t.conversoes),/qa-publicidade@/);
  assert.equal(t.conversoes[0].evento.send_to,'AW-18400941509/dMHzCLDLypwdEMWroMZE');assert.match(t.conversoes[0].evento.transaction_id,/greenia-/);
  assert.equal(await t.p.locator('#form-contato').getAttribute('data-gia-conversao'),t.conversoes[0].evento.transaction_id);
  await t.p.evaluate(id=>{document.getElementById('c-ok').classList.add('oculto');document.getElementById('c-ok').classList.remove('oculto');document.dispatchEvent(new CustomEvent('greenia:contato-recebido',{detail:{id}}));},t.conversoes[0].evento.transaction_id);
  assert.equal(t.conversoes.length,1);assert.deepEqual(t.erros,[]);
 }finally{await t.c.close();}
});
test('recusar no celular: nenhum SDK, clique publicitário ou conversão; formulário funciona e banner fecha',async()=>{
 const t=await abrir({width:390});try{
  await t.p.locator('[data-gia=denied]').click();assert.equal(await t.p.locator('#gia-consent').isVisible(),false);
  await preencher(t.p,'qa-recusa@exemplo.test');await enviar(t.p);
  assert.equal(t.google.length,0);assert.equal(t.conversoes.length,0);assert.equal(t.posts[0].utm_campaign,'greenia_direto');assert.equal(t.posts[0].gclid,'');
  assert.doesNotMatch(await t.p.evaluate(()=>document.cookie),/_gcl_/);
  assert.ok(await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(t.erros,[]);
 }finally{await t.c.close();}
});
test('armadilha recebe sucesso visual sem conversão nem novo contato',async()=>{
 const t=await abrir();try{
  await t.p.locator('[data-gia=granted]').click();await preencher(t.p,'qa-robo@exemplo.test');
  await t.p.locator('input[name=site]').evaluate(e=>e.value='spam');
  const antes=um(S.P.db,'select count(*) as n from commercial_contacts').n;await enviar(t.p);
  assert.equal(um(S.P.db,'select count(*) as n from commercial_contacts').n,antes);assert.equal(t.conversoes.length,0);
  assert.equal(await t.p.evaluate(()=>window.dataLayer?.filter(a=>a[0]==='event'&&a[1]==='conversion').length||0),0);
 }finally{await t.c.close();}
});
test('revogar preserva campos, limpa cookies próprios e impede novos eventos',async()=>{
 const t=await abrir();try{
  await t.p.locator('[data-gia=granted]').click();await preencher(t.p,'qa-revogacao@exemplo.test');
  await t.p.evaluate(()=>document.cookie='_gcl_aw=teste; Path=/');
  await t.p.locator('#preferencias-cookies').click();await t.p.locator('[data-gia=denied]').click();
  assert.equal(await t.p.inputValue('#c-email'),'qa-revogacao@exemplo.test');assert.doesNotMatch(await t.p.evaluate(()=>document.cookie),/_gcl_/);
  await enviar(t.p);assert.equal(t.conversoes.length,0);assert.equal(t.posts[0].gclid,'');
  await t.p.reload();assert.equal(await t.p.locator('#gia-consent').isVisible(),false);assert.equal(t.google.length,1);
  assert.deepEqual(t.erros,[]);
 }finally{await t.c.close();}
});
test('armazenamento indisponível e falha do SDK não impedem o pedido comercial',async()=>{
 for(const op of [{storage:false},{block:true}]){const t=await abrir(op);try{
  await t.p.locator('[data-gia=granted]').click();await preencher(t.p,op.block?'qa-sdk@exemplo.test':'qa-storage@exemplo.test');await enviar(t.p);assert.equal(t.posts.length,1);assert.deepEqual(t.erros,[]);
 }finally{await t.c.close();}}
});
test('erro de servidor não exibe sucesso nem emite evento de conversão',async()=>{
 const t=await abrir();try{
  await t.p.locator('[data-gia=granted]').click();await preencher(t.p);
  await t.p.route('**/api/contato',r=>r.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Tente novamente"}'}));
  await t.p.click('#c-enviar');await t.p.locator('#c-erro:not(.oculto)').waitFor();assert.equal(await t.p.locator('#c-ok').isVisible(),false);assert.equal(t.conversoes.length,0);assert.equal(await t.p.locator('#c-enviar').isEnabled(),true);
 }finally{await t.c.close();}
});
