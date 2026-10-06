import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
let N,c;const erros=[];
before(async()=>{N=await subirComNavegador();c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');await c.put('/api/admin/modelos-config',{roteamento:{ativo:true,preferencia:'qualidade'}});const k=c.cookie.indexOf('=');await N.contexto.addCookies([{name:c.cookie.slice(0,k),value:c.cookie.slice(k+1),url:N.base}]);});
after(async()=>{await N.fechar();assert.deepEqual(erros,[]);});
async function abrir(hash){const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+'/app'+hash);return p;}
test('histórico de modelos apresenta campos legíveis e fornecedor em detalhes',async()=>{
 const p=await abrir('#/modelos/historico');await p.waitForSelector('.auditoria-detalhe');await p.locator('.auditoria-detalhe summary').first().click();assert.match(await p.textContent('#conteudo'),/Campos alterados|Exigir fornecedor sem treinamento com dados/);assert.doesNotMatch(await p.textContent('#conteudo'),/\{"campos"/);await p.close();
});
test('falha de leitura permite tentar novamente sem alteração de configuração',async()=>{
 const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));const antes=(await c.get('/api/admin/roteamento')).dados.config;let chamadas=0;
 await p.route('**/api/admin/roteamento',r=>{chamadas++;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Serviço temporariamente indisponível'})});});
 await p.goto(N.base+'/app#/modelos/roteamento');await p.waitForSelector('#tentar-carregar');assert.match(await p.textContent('[role=alert]'),/Não foi possível carregar|temporariamente/);assert.equal(chamadas,1);
 await p.unroute('**/api/admin/roteamento');await p.click('#tentar-carregar');await p.waitForSelector('#cfg-rota');assert.deepEqual((await c.get('/api/admin/roteamento')).dados.config,antes);await p.close();
});
test('falha tardia de leitura não substitui a tela escolhida após navegação',async()=>{
 const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));let liberar;const bloqueio=new Promise(r=>liberar=r);let chegou;const inicio=new Promise(r=>chegou=r);
 await p.route('**/api/admin/roteamento',async r=>{chegou();await bloqueio;await r.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Falha tardia"}'});});
 await p.goto(N.base+'/app#/modelos/roteamento');await inicio;await p.click('a[href="#/modelos/historico"]');await p.waitForSelector('.auditoria-detalhe');liberar();await p.waitForLoadState('networkidle');assert.equal(await p.locator('#tentar-carregar').count(),0);assert.match(await p.textContent('#conteudo'),/Toda alteração de modelos/);await p.close();
});
