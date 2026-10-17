import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {openRouterFalso} from '../test/openrouter-falso.js';
import {salvarConfig} from '../src/config.js';
import {exec,um} from '../src/db.js';
const ID='anthropic/claude-opus-5.5';
test('envio falha sem confirmar registro; tentativa segura, recusa e expiração preservam o pedido',async()=>{
 const OR=await openRouterFalso(),N=await subirComNavegador({ia:OR.ia});try{
  salvarConfig(N.app.db,{dominios:['empresa-exemplo.com.br'],advanced:{limiteMensalUsd:10}});
  const admin=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br'),ana=await cliente(N.app,N.base).entrar('ana@empresa-exemplo.com.br');
  exec(N.app.db,'update modelos set liberado=1 where id=?',ID);
  await admin.put('/api/admin/advanced/modelos/'+encodeURIComponent(ID),{aprovado:true,provedores:['anthropic'],justificativa:'Rota de teste'});
  const k=ana.cookie.indexOf('=');await N.contexto.addCookies([{name:ana.cookie.slice(0,k),value:ana.cookie.slice(k+1),url:N.base}]);
  const p=await N.contexto.newPage();await p.goto(N.base+'/app#/nova');await p.fill('#entrada','Crie uma apresentação PPTX de altíssimo nível sobre um projeto fictício.');await p.click('#enviar');
  const b=p.getByRole('button',{name:'Pedir liberação',exact:true});await b.waitFor();let tentativas=0;
  await p.route('**/api/advanced/pedidos/*/solicitar',async r=>{tentativas++;await r.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Não foi possível registrar a solicitação."}'});});
  await b.click();await p.getByRole('alert').filter({hasText:'Não foi possível registrar'}).waitFor();
  assert.equal(await p.getByText('Solicitação enviada',{exact:true}).count(),0);assert.equal(tentativas,1);
  await p.unroute('**/api/advanced/pedidos/*/solicitar');await b.click();await p.getByText('Aguardando aprovação',{exact:true}).waitFor();
  const pedido=um(N.app.db,'select * from advanced_pedidos');assert.equal(um(N.app.db,'select count(*) n from advanced_pedidos').n,1);
  await admin.post(`/api/admin/advanced/pedidos/${pedido.id}/decidir`,{decisao:'recusar',motivo:'Limite não aprovado para este teste.'});await p.reload();
  await p.getByText('Não aprovado',{exact:true}).waitFor();await p.getByRole('button',{name:'Pedir revisão',exact:true}).click();await p.getByText('Aguardando aprovação',{exact:true}).waitFor();
  const rec=(await admin.get('/api/admin/advanced')).dados.pedidos[0].recomendacao;
  await admin.post(`/api/admin/advanced/pedidos/${pedido.id}/decidir`,{decisao:'aprovar',seguir_recomendacao:true,versao:rec.versao,limite_usd:rec.limite,dias:1});
  exec(N.app.db,"update advanced_autorizacoes set expira_em='2020-01-01'");await p.reload();
  await p.getByText('Autorização encerrada',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Continuar apresentação',exact:true}).count(),0);
  await p.getByText('Ver pedido e anexos',{exact:true}).click();await p.getByText('Crie uma apresentação PPTX de altíssimo nível sobre um projeto fictício.',{exact:true}).waitFor();
  assert.equal(OR.chamadas.length,0);
 }finally{await N.fechar();await OR.fechar();}
});
test('UI + servidor: pedido → solicitação → aprovação → notificação → retomada explícita',async()=>{
 const OR=await openRouterFalso();const N=await subirComNavegador({ia:OR.ia});const erros=[];
 try{
  salvarConfig(N.app.db,{dominios:['empresa-exemplo.com.br'],advanced:{limiteMensalUsd:10}});
  const admin=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const ana=await cliente(N.app,N.base).entrar('ana@empresa-exemplo.com.br');
  exec(N.app.db,'update modelos set liberado=1 where id=?',ID);
  await admin.put('/api/admin/advanced/modelos/'+encodeURIComponent(ID),{aprovado:true,provedores:['anthropic'],justificativa:'Rota de teste aprovada'});
  const k=ana.cookie.indexOf('=');await N.contexto.addCookies([{name:ana.cookie.slice(0,k),value:ana.cookie.slice(k+1),url:N.base}]);
  const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+'/app#/nova');
  assert.equal(await p.getByRole('combobox',{name:'Como responder'}).isVisible(),false);
  await p.getByText('Preferências',{exact:true}).click();
  assert.equal(await p.locator('#modelo option:checked').textContent(),'Seguir a recomendação do GreenIA');
  await p.getByText('Preferências',{exact:true}).click();
  await p.fill('#entrada','Crie um relatório completo de altíssimo nível com análise aprofundada de cenários e recomendações.');await p.click('#enviar');
  assert.equal(await p.getByRole('button',{name:'Preparar roteiro',exact:true}).isVisible(),false);
  await p.getByText('O que você pode fazer enquanto aguarda',{exact:true}).click();
  await p.getByText('Não inclui executar essas etapas, fazer cálculos, gerar arquivos finais ou agir em outros sistemas.',{exact:true}).waitFor();
  assert.equal(OR.chamadas.length,0,'ver alternativa não aceita redução nem inicia consumo');
  await p.setViewportSize({width:390,height:844});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.getByRole('button',{name:'Pedir liberação',exact:true}).click();
  await p.getByText('Sua solicitação aguarda a aprovação do administrador.',{exact:true}).waitFor();assert.equal(OR.chamadas.length,0);
  const ac=await N.navegador.newContext();const ka=admin.cookie.indexOf('=');await ac.addCookies([{name:admin.cookie.slice(0,ka),value:admin.cookie.slice(ka+1),url:N.base}]);
  const ap=await ac.newPage();ap.on('pageerror',e=>erros.push(e.message));await ap.goto(N.base+'/app#/modelos');await ap.waitForSelector('#advanced-admin');
  assert.equal(await ap.locator('#advanced-detalhes').getAttribute('open'),null);
  assert.equal(await ap.locator('#advanced-admin select').count(),0,'aprovar não exige escolher modelos ou provedores');
  await ap.getByRole('button',{name:'Aprovar para este trabalho',exact:true}).click();
  await ap.getByText('Decisão registrada.',{exact:true}).waitFor();assert.equal(OR.chamadas.length,0);
  await p.getByRole('button',{name:'Continuar documento',exact:true}).waitFor({timeout:16000});
  assert.equal(OR.chamadas.length,0);await p.getByRole('button',{name:'Continuar documento',exact:true}).click();
  await p.getByText(`Resposta de ${ID}`,{exact:false}).waitFor();
  assert.ok(OR.chamadas.length>0);assert.equal(OR.chamadas[0].model,ID);assert.deepEqual(erros,[]);
  const d=um(N.app.db,'select estado from advanced_pedidos order by id desc limit 1');assert.equal(d.estado,'aprovado');
  await ac.close();
 }finally{await N.fechar();await OR.fechar();}
});
test('alternativa de apresentação fica em texto e mantém a liberação pendente após executar e reabrir',async()=>{
 const OR=await openRouterFalso({responder:()=> '## Roteiro de slides\n\n'+('Tópicos para a apresentação, ainda sem arquivo final. '.repeat(30))});
 const N=await subirComNavegador({ia:OR.ia});try{
  salvarConfig(N.app.db,{dominios:['empresa-exemplo.com.br']});
  const ana=await cliente(N.app,N.base).entrar('ana@empresa-exemplo.com.br');const k=ana.cookie.indexOf('=');
  await N.contexto.addCookies([{name:ana.cookie.slice(0,k),value:ana.cookie.slice(k+1),url:N.base}]);
  const p=await N.contexto.newPage();await p.goto(N.base+'/app#/nova');
  await p.fill('#entrada','Crie uma apresentação PPTX de altíssimo nível sobre um projeto fictício.');await p.click('#enviar');
  await p.getByRole('button',{name:'Pedir liberação',exact:true}).click();
  await p.getByText('Aguardando aprovação',{exact:true}).waitFor();
  await p.getByText('O que você pode fazer enquanto aguarda',{exact:true}).click();
  await p.getByText('Esta opção entrega o roteiro. O arquivo PowerPoint depende da liberação.',{exact:true}).waitFor();
  assert.equal(OR.chamadas.length,0);
  await p.getByRole('button',{name:'Preparar roteiro',exact:true}).click();
  await p.getByRole('heading',{name:'Roteiro de slides',exact:true}).waitFor();
  await p.getByText('Aguardando aprovação',{exact:true}).waitFor();
  assert.equal(await p.locator('#coluna .arquivo-previa, #coluna .arquivos-resposta').count(),0);
  assert.equal(um(N.app.db,'select count(*) n from arquivos_gerados').n,0);
  await p.reload();await p.getByRole('heading',{name:'Roteiro de slides',exact:true}).waitFor();
  await p.getByText('Aguardando aprovação',{exact:true}).waitFor();
  assert.equal(await p.locator('#coluna .arquivo-previa, #coluna .arquivos-resposta').count(),0);
 }finally{await N.fechar();await OR.fechar();}
});
