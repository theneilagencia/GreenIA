import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {subirComNavegador} from '../scripts/navegador.js';
import {subirPlataforma} from '../test/ajuda-plataforma.js';
import {salvarConfig} from '../src/config.js';

async function tituloLegivel(p,width){
 await p.setViewportSize({width,height:900});await p.locator('.cabeca h1').waitFor();
 const m=await p.locator('.cabeca h1').evaluate(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,line:parseFloat(getComputedStyle(e).lineHeight),scroll:document.documentElement.scrollWidth,viewport:innerWidth};});
 assert.ok(m.w>=width*.48,JSON.stringify(m));assert.ok(m.h<=m.line*4,JSON.stringify(m));assert.ok(m.scroll<=m.viewport+1,JSON.stringify(m));
}
test('QA-G01/G03: título no celular e sigilo operáveis por teclado com área de toque real',async()=>{
 const N=await subirComNavegador();try{
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+'/app#/nova');await p.locator('#entrada').waitFor();
  for(const width of [320,360,390,640,1280]){
   if(width<760)await tituloLegivel(p,width);else await p.setViewportSize({width,height:900});
   if(width<760){const m=await p.locator('#sigilosa').boundingBox();assert.ok(m.width>=44&&m.height>=44,JSON.stringify(m));}
  }
  p.once('dialog',d=>d.accept());await p.locator('#sigilosa').focus();await p.keyboard.press('Space');await p.waitForFunction(()=>document.querySelector('#sigilosa').getAttribute('aria-checked')==='true');assert.equal(await p.locator('#sigilosa').getAttribute('aria-checked'),'true');
 }finally{await N.fechar();}
});
test('QA-G02: editores da empresa e do console têm rótulos únicos persistentes e mantêm dados',async()=>{
 const S=await subirPlataforma({admins:['ops@operadora.test']});let nav;
 try{
  const ops=await S.navegador().entrarConsole('ops@operadora.test');
  const e=(await ops.post('/api/plataforma/empresas',{name:'Empresa QA',slug:'qa-rotulos',status:'ativa',admin_email:'admin@exemplo.test'})).dados;
  salvarConfig(S.P.tenant(e.id).db,{integracoes:{ativa:true,pessoas:[]}});
  const a=S.navegador();await a.get('/qa-rotulos');await a.entrarEmpresa('admin@exemplo.test');
  nav=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  for(const [cliente,base] of [[a,'app#/empresa/'],[ops,`plataforma#/empresas/${e.id}/`]]){
   const ctx=await nav.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});await ctx.addCookies([...cliente.cookies].map(([name,value])=>({name,value,url:S.base})));
   const p=await ctx.newPage();p.on('dialog',d=>d.accept());await p.goto(S.base+'/'+base+'marca');
   await p.getByLabel('Escolher cor principal',{exact:true}).waitFor();await p.getByLabel('Escolher cor secundária',{exact:true}).waitFor();
   await p.goto(S.base+'/'+base+'landing');await p.getByLabel('Estilo do botão 1',{exact:true}).waitFor();
   for(const width of [320,360,390]){if(base.startsWith('app'))await tituloLegivel(p,width);}
   await p.getByLabel('Texto do botão 2',{exact:true}).fill('Acessar ambiente');await p.getByLabel('Estilo do botão 2',{exact:true}).selectOption('secundario');
   for(const summary of await p.locator('#form-landing summary').all())if(await summary.isVisible())await summary.click();
   const semNome=await p.locator('#form-landing input,#form-landing select,#form-landing textarea').evaluateAll(es=>es.filter(e=>!e.labels.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).map(e=>e.outerHTML));assert.deepEqual(semNome,[]);
   const gravado=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/landing'));await p.getByRole('button',{name:/Salvar rascunho|Salvar e atualizar a página/}).click();assert.equal((await gravado).status(),200);
   await p.reload();await p.getByLabel('Texto do botão 2',{exact:true}).waitFor();assert.equal(await p.getByLabel('Texto do botão 2',{exact:true}).inputValue(),'Acessar ambiente');assert.equal(await p.getByLabel('Estilo do botão 2',{exact:true}).inputValue(),'secundario');
   if(base.startsWith('app')){
    await p.goto(S.base+'/app#/integracoes/nova');await p.getByLabel('Nome da integração',{exact:true}).fill('Conexão fictícia');await p.getByLabel('Sistema',{exact:true}).fill('Sistema de teste');await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByText('Prefiro descrever uma ação',{exact:true}).click();
    const metodo=p.getByRole('combobox',{name:/^Ação/});await metodo.selectOption('GET');assert.equal(await metodo.inputValue(),'GET');assert.equal(await metodo.evaluate(e=>e.labels.length),1);
    await tituloLegivel(p,320);
   }
   await ctx.close();
  }
 }finally{await nav?.close();await S.fechar();}
});
