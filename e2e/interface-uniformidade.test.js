import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {subirPlataforma} from '../test/ajuda-plataforma.js';
import {salvarConfig} from '../src/config.js';
import {mkdirSync,writeFileSync} from 'node:fs';

let S,nav,ctx,p;const erros=[],medicoes=[];
const telas=['nova','conversas','quick-wins','quick-wins/programados','qw/nova','qw/nova/modelos','conhecimento','pendencias','preparacao','revisao-acessos','primeiros-passos','visao-geral','uso','pessoas','modelos','modelos/roteamento','modelos/historico','politicas','politicas/texto','atividade','integracoes','integracoes/nova','configuracoes','empresa/usuarios','empresa/roles','empresa/marca','empresa/landing','empresa/url','empresa/acessos'];
before(async()=>{
 S=await subirPlataforma();const ops=await S.navegador().entrarConsole('ops@theneil.com.br');
 const empresa=(await ops.post('/api/plataforma/empresas',{name:'Empresa Exemplo',slug:'ux-exemplo',status:'ativa',admin_email:'admin@empresa-exemplo.com.br'})).dados;
 salvarConfig(S.P.tenant(empresa.id).db,{integracoes:{ativa:true,pessoas:[]}});
 nav=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});ctx=await nav.newContext({viewport:{width:1280,height:900}});p=await ctx.newPage();
 p.on('pageerror',e=>erros.push(e.message));await p.emulateMedia({reducedMotion:'reduce'});
 await p.goto(S.base+'/ux-exemplo');await p.goto(S.base+'/entrar');await p.fill('#email','admin@empresa-exemplo.com.br');await p.click('#btn-email');await p.waitForSelector('#codigo',{state:'visible'});
 await p.fill('#codigo',S.navegador().ultimoCodigo('admin@empresa-exemplo.com.br'));await p.click('#btn-codigo');await p.waitForURL(/\/app/);
 const ciencia=await p.waitForSelector('#dar-ciencia',{timeout:3000}).catch(()=>null);if(ciencia)await ciencia.click();await p.waitForSelector('#entrada');
 mkdirSync('/tmp/greenia-ux',{recursive:true});
});
after(async()=>{writeFileSync('/tmp/greenia-ux/medicoes.json',JSON.stringify(medicoes,null,2));await nav?.close();await S?.fechar();assert.deepEqual(erros,[]);});
for(const width of [1280,390,320])test(`interface privada: 29 telas em ${width}px, hierarquia, controles e conteúdo contido`,async()=>{
 await p.setViewportSize({width,height:900});
 const falhas=[];
 for(const tela of telas){
  await p.goto(S.base+'/app#/'+tela);await p.reload();await p.waitForLoadState('networkidle');await p.waitForFunction(()=>document.querySelector('#principal')&&!document.querySelector('#principal').hasAttribute('aria-busy'));
  const m=await p.evaluate(()=>{
   const visivel=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
   const titulos=[...document.querySelectorAll('.pagina h2,.pagina h3')].filter(visivel).map(e=>({texto:e.textContent.slice(0,60),font:getComputedStyle(e).fontFamily,tamanho:parseFloat(getComputedStyle(e).fontSize)}));
   const controles=[...document.querySelectorAll('.pagina .btn,.pagina .entrada')].filter(visivel).map(e=>({texto:(e.textContent||e.id).slice(0,40),altura:e.getBoundingClientRect().height,fonte:parseFloat(getComputedStyle(e).fontSize)}));
   const fora=[...document.querySelectorAll('.pagina *')].filter(e=>visivel(e)&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.tabela-rolagem,.subnav')).slice(0,8).map(e=>e.className||e.tagName);
   return {titulo:document.querySelector('.cabeca h1')?.textContent,titulos,controles,fora,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });medicoes.push({tela,width,...m});
  if(!m.titulo||m.titulo==='GreenIA')falhas.push(tela+': tela não abriu');
  if(m.overflow||m.fora.length)falhas.push(tela+': conteúdo fora da tela '+m.fora.join(','));
  for(const h of m.titulos)if(!h.font.includes('Inter')||h.tamanho>24)falhas.push(tela+': título fora da escala '+JSON.stringify(h));
  for(const c of m.controles)if(c.altura<(width<=760?43:39))falhas.push(tela+': controle sem área de interação '+JSON.stringify(c));
  if(['quick-wins','integracoes','conhecimento','preparacao','empresa/marca','qw/nova'].includes(tela)&&width!==320)await p.screenshot({path:`/tmp/greenia-ux/${tela.replaceAll('/','-')}-${width}.png`});
 }
 writeFileSync('/tmp/greenia-ux/medicoes.json',JSON.stringify(medicoes,null,2));assert.deepEqual(falhas,[]);
});
test('estado de erro e diálogo: mensagem legível, recuperação e foco por teclado',async()=>{
 await p.setViewportSize({width:390,height:844});await p.route('**/api/acompanhamento',r=>r.abort());await p.goto(S.base+'/app#/pendencias');await p.reload();await p.waitForSelector('.cabeca h1');await p.waitForFunction(()=>!document.querySelector('#principal').hasAttribute('aria-busy'));assert.match(await p.locator('#principal').innerText(),/Nova conversa/);
 await p.unroute('**/api/acompanhamento');await p.goto(S.base+'/app#/pendencias');await p.reload();await p.waitForSelector('#pend-lista');await p.click('#ajuda-tela');await p.waitForSelector('[role=dialog]');
 assert.equal(await p.locator('#ajuda-tela').innerText(),'Ajuda');
 assert.ok(await p.locator('.modal-fundo').evaluate(el=>{const r=el.getBoundingClientRect();return getComputedStyle(el).position==='fixed'&&r.top===0&&r.bottom<=innerHeight+1;}));
 assert.ok(await p.locator('[role=dialog]').evaluate(el=>{const r=el.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight+1;}));await p.screenshot({path:'/tmp/greenia-ux/ajuda-390.png'});
 await p.keyboard.press('Tab');assert.ok(await p.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),'ajuda-tela');
 await p.goto(S.base+'/app#/conversas');await p.waitForSelector('.hc-pagina');await p.click('#ajuda-tela');await p.waitForSelector('#ajuda-titulo');assert.match(await p.locator('#ajuda-titulo').innerText(),/Retome suas conversas/);await p.keyboard.press('Escape');
});
test('troca rápida de telas: resposta lenta não deixa conteúdo de outra rota',async()=>{
 await p.goto(S.base+'/app#/nova');await p.reload();await p.waitForSelector('#entrada');
 let liberar,avisar;const iniciado=new Promise(r=>avisar=r),espera=new Promise(r=>liberar=r);
 await p.route('**/api/acompanhamento',async r=>{avisar();await espera;await r.continue();});
 await p.evaluate(()=>location.hash='#/pendencias');await iniciado;
 await p.evaluate(()=>location.hash='#/integracoes');liberar();
 await p.waitForFunction(()=>document.querySelector('.cabeca h1')?.textContent==='Integrações'&&!document.querySelector('#principal').hasAttribute('aria-busy'));
 assert.equal(await p.locator('#pend-lista').count(),0);assert.match(await p.locator('#principal').innerText(),/Integrações da empresa/);assert.match(p.url(),/#\/integracoes$/);
 await p.unroute('**/api/acompanhamento');
});
test('console da operadora: nove telas com a mesma escala em desktop e celular',async()=>{
 const ops=await S.navegador().entrarConsole('ops@theneil.com.br');const c=await nav.newContext();
 await c.addCookies([...ops.cookies].map(([name,value])=>({name,value,url:S.base})));const q=await c.newPage();q.on('pageerror',e=>erros.push(e.message));await q.emulateMedia({reducedMotion:'reduce'});
 try{for(const width of [1280,390,320]){
  await q.setViewportSize({width,height:900});
  for(const tela of ['empresas','usuarios','planos','planos/novo','ambientes','uso','auditoria','configuracoes','encerramentos']){
   await q.goto(S.base+'/plataforma#/'+tela);await q.reload();await q.waitForLoadState('networkidle');
   const m=await q.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,titulos:[...document.querySelectorAll('.pagina h2')].filter(e=>e.getBoundingClientRect().height).map(e=>({font:getComputedStyle(e).fontFamily,tamanho:parseFloat(getComputedStyle(e).fontSize)}))}));
   medicoes.push({tela:'console/'+tela,width,...m});assert.equal(m.overflow,false,tela+' '+width);for(const h of m.titulos){assert.ok(h.font.includes('Inter'),tela);assert.ok(h.tamanho<=24,tela);}
  }
 }}finally{await c.close();}
});
