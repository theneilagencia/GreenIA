import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
test('histórico real com back/forward cache não restaura conteúdo privado após logout',async()=>{
 const N=await subirComNavegador();let b;
 try{
  const c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
  // O Chromium do Playwright desativa BFCache por padrão; este cenário o mantém ligado.
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,ignoreDefaultArgs:['--disable-back-forward-cache']});
  const ctx=await b.newContext();const k=c.cookie.indexOf('=');await ctx.addCookies([{name:c.cookie.slice(0,k),value:c.cookie.slice(k+1),url:N.base}]);const p=await ctx.newPage();const erros=[];p.on('pageerror',e=>erros.push(e.message));
  await p.goto(N.base+'/app#/nova');await p.waitForSelector('#entrada');
  await p.goto(N.base+'/');await p.goBack();await p.waitForSelector('#entrada');assert.ok(await p.locator('#sair').isEnabled());
  // Uma navegação de documento anterior também deve ser protegida, além da página de saída.
  await p.goto(N.base+'/app#/conversas');await p.waitForSelector('#sair');await p.click('#sair');await p.waitForURL(N.base+'/');
  await p.goBack();await p.waitForURL(/\/entrar$/);assert.equal(await p.locator('#principal').count(),0);assert.equal(await p.locator('#sair').count(),0);assert.deepEqual(erros,[]);
 }finally{await b?.close();await N.fechar();}
});
test('falha ao abrir ambiente apresenta recuperação e preserva mensagem escapada',async()=>{
 const N=await subirComNavegador();
 try{
  const c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const k=c.cookie.indexOf('=');await N.contexto.addCookies([{name:c.cookie.slice(0,k),value:c.cookie.slice(k+1),url:N.base}]);const p=await N.contexto.newPage();const erros=[];p.on('pageerror',e=>erros.push(e.message));
  await p.route('**/api/eu',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Temporariamente indisponível <img src=x onerror="alert(1)">'})}));
  await p.goto(N.base+'/app#/nova');await p.waitForSelector('#reabrir-ambiente');assert.match(await p.textContent('[role=alert]'),/Não foi possível abrir|Temporariamente indisponível/);assert.equal(await p.locator('[role=alert] img').count(),0);
  await p.unroute('**/api/eu');await p.click('#reabrir-ambiente');await p.waitForSelector('#entrada');assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});
