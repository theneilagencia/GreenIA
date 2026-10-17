import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
let N,c;const erros=[];
before(async()=>{N=await subirComNavegador();c=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');await c.put('/api/admin/modelos-config',{roteamento:{ativo:true,preferencia:'qualidade'}});const k=c.cookie.indexOf('=');await N.contexto.addCookies([{name:c.cookie.slice(0,k),value:c.cookie.slice(k+1),url:N.base}]);});
after(async()=>{await N.fechar();assert.deepEqual(erros,[]);});
async function abrir(hash){const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+'/app'+hash);return p;}
test('configuração: erro preserva ajustes, salvar persiste e desativação exige confirmação',async()=>{
 const p=await abrir('#/modelos/roteamento');await p.waitForSelector('#cfg-rota');
 assert.equal(await p.getByRole('button',{name:'Salvar alterações',exact:true}).isVisible(),false);
 const antes=(await c.get('/api/admin/roteamento')).dados.config;
 await p.getByText('Limites e preferências de consumo',{exact:true}).click();
 const escolha=antes.preferencia==='economia'?'equilibrio':'economia';
 await p.locator(`input[name=rota-pref][value=${escolha}]`).check();
 await p.route('**/api/admin/modelos-config',r=>r.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Falha de teste"}'}));
 await p.getByRole('button',{name:'Salvar alterações',exact:true}).click();
 await p.getByRole('alert').filter({hasText:'Seus ajustes foram mantidos'}).waitFor();
 assert.equal(await p.locator(`input[name=rota-pref][value=${escolha}]`).isChecked(),true);
 assert.deepEqual((await c.get('/api/admin/roteamento')).dados.config,antes);
 await p.unroute('**/api/admin/modelos-config');await p.getByRole('button',{name:'Salvar alterações',exact:true}).click();
 await p.getByText('Alterações salvas. A configuração já está em uso.',{exact:true}).waitFor();
 await p.reload();await p.waitForSelector('#cfg-rota');
 assert.equal((await c.get('/api/admin/roteamento')).dados.config.preferencia,escolha);
 assert.equal(await p.getByRole('button',{name:'Salvar alterações',exact:true}).isVisible(),false);
 if(antes.ativo){
  await p.getByRole('switch',{name:'Escolha automática de recursos'}).click();
  await p.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await p.getByRole('switch').getAttribute('aria-checked'),'true');
  await p.getByRole('switch').press('Space');
  await p.getByRole('dialog').getByRole('button',{name:'Desativar escolha automática',exact:true}).click();
  assert.equal(await p.getByRole('switch').getAttribute('aria-checked'),'false');
  await p.getByRole('button',{name:'Descartar',exact:true}).click();
  assert.equal(await p.getByRole('switch').getAttribute('aria-checked'),'true');
 }
 await p.close();
});
test('escolha automática explica atividades; consumo é opcional e não muda ao apenas navegar',async()=>{
 const antes=(await c.get('/api/admin/roteamento')).dados.config;
 const p=await abrir('#/modelos/roteamento');await p.waitForSelector('#cfg-rota');
 assert.match(await p.textContent('#cfg-rota'),/Escrever e organizar/);
 assert.match(await p.textContent('#cfg-rota'),/Analisar e preparar materiais/);
 assert.match(await p.textContent('#cfg-rota'),/Cruzar informações/);
 assert.equal(await p.locator('input[name=rota-pref]').first().isVisible(),false);
 assert.doesNotMatch(await p.locator('#cfg-rota').innerText(),/Qualidade|Equilíbrio|um nível acima|duas vezes|2 vezes/);
 await p.getByText('Limites e preferências de consumo',{exact:true}).click();
 assert.ok(await p.locator('input[name=rota-pref]').first().isVisible());
 assert.deepEqual((await c.get('/api/admin/roteamento')).dados.config,antes);
 await p.setViewportSize({width:390,height:844});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.close();
});
test('histórico de modelos apresenta campos legíveis e fornecedor em detalhes',async()=>{
 const p=await abrir('#/modelos/historico');await p.waitForSelector('#conteudo tr[data-registro]');await p.locator('#conteudo tr[data-registro]').first().click();await p.waitForSelector('#modal .auditoria-detalhe');assert.match(await p.textContent('#modal'),/Campos alterados|Exigir fornecedor sem treinamento com dados/);assert.doesNotMatch(await p.textContent('#modal'),/\{"campos"/);assert.doesNotMatch(await p.textContent('#conteudo'),/\{"campos"/);await p.close();
});
test('falha de leitura permite tentar novamente sem alteração de configuração',async()=>{
 const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));const antes=(await c.get('/api/admin/roteamento')).dados.config;let chamadas=0;
 await p.route('**/api/admin/roteamento*',r=>{chamadas++;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Serviço temporariamente indisponível'})});});
 await p.goto(N.base+'/app#/modelos/roteamento');await p.waitForSelector('#tentar-carregar');assert.match(await p.textContent('[role=alert]'),/Não foi possível carregar|temporariamente/);assert.equal(chamadas,1);
 await p.unroute('**/api/admin/roteamento*');await p.click('#tentar-carregar');await p.waitForSelector('#cfg-rota');assert.deepEqual((await c.get('/api/admin/roteamento')).dados.config,antes);await p.close();
});
test('falha tardia de leitura não substitui a tela escolhida após navegação',async()=>{
 const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));let liberar;const bloqueio=new Promise(r=>liberar=r);let chegou;const inicio=new Promise(r=>chegou=r);
 await p.route('**/api/admin/roteamento*',async r=>{chegou();await bloqueio;await r.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Falha tardia"}'});});
 await p.goto(N.base+'/app#/modelos/roteamento');await inicio;await p.click('a[href="#/modelos/historico"]');await p.waitForSelector('#conteudo tr[data-registro]');liberar();await p.waitForLoadState('networkidle');assert.equal(await p.locator('#tentar-carregar').count(),0);assert.match(await p.textContent('#conteudo'),/Toda alteração de modelos/);await p.close();
});
