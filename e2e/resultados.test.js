import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {openRouterFalso,enviarMensagem} from '../test/openrouter-falso.js';
import {salvarConfig} from '../src/config.js';
import {um} from '../src/db.js';
async function ambiente(){const OR=await openRouterFalso();const n=await subirComNavegador({ia:OR.ia,largura:1366,altura:900});salvarConfig(n.app.db,{dominios:['empresa-exemplo.com.br']});const ana=await cliente(n.app,n.base).entrar('ana@empresa-exemplo.com.br');const id=(await ana.post('/api/conversas',{})).dados.conversa.id;const r=await enviarMensagem(ana,id,{texto:'Escreva um email convidando a equipe para reunião.',modelo:'classe:rapido'});assert.ok(r.fim);return {...n,OR,ana,id,async fechar(){await n.fechar();await OR.fechar();}};}
async function pagina(n,c){const ctx=await n.navegador.newContext({viewport:{width:1366,height:900}});const k=c.cookie.indexOf('=');await ctx.addCookies([{name:c.cookie.slice(0,k),value:c.cookie.slice(k+1),url:n.base}]);return ctx.newPage();}
test('Uso e resultados: conferência explícita, persistência, exportação e layout móvel',async()=>{const n=await ambiente();try{
 const p=await pagina(n,n.ana);await p.goto(n.base+'/app#/resultados');await p.locator('[data-trabalho]').waitFor();assert.equal(await p.locator('[name=visao]').count(),0);assert.match(await p.locator('.resultados-metricas').innerText(),/Pendente|Sem trabalhos concluídos/);
 await p.locator('[data-trabalho]').click();await p.getByRole('heading',{name:'Conferir minha entrega'}).waitFor();await p.getByLabel('O pedido e suas instruções foram atendidos').check();await p.getByLabel('Conferi conteúdo e informações da entrega').check();await p.getByRole('button',{name:'Registrar conclusão verificada',exact:true}).click();await p.getByRole('dialog').getByText('Concluído com verificação',{exact:true}).waitFor();
 const db=um(n.app.db,'select estado from trabalhos order by id limit 1');assert.equal(db.estado,'concluido');await p.getByRole('button',{name:'Fechar (Esc)'}).click();await p.reload();await p.locator('[data-trabalho]').waitFor();assert.match(await p.locator('[data-trabalho]').innerText(),/Concluído com verificação/);
 const dl=p.waitForEvent('download');await p.getByRole('link',{name:'Exportar registros'}).click();const download=await dl;const fs=await import('node:fs/promises');const bytes=await fs.readFile(await download.path());assert.match(bytes.toString(),/Créditos por concluído/);assert.doesNotMatch(bytes.toString(),/US\$|custo_reportado|USD/);
 for(const width of [390,320,768]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sem corte horizontal em '+width);}
 await p.locator('[data-trabalho]').focus();await p.keyboard.press('Enter');await p.getByRole('dialog').waitFor();await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),0);
}finally{await n.fechar();}});
test('empresa: gestor acompanha sem ver conteúdo e filtros refletem no histórico e exportação',async()=>{const n=await ambiente();try{
 const admin=await cliente(n.app,n.base).entrar('admin@empresa-exemplo.com.br'),p=await pagina(n,admin);await p.goto(n.base+'/app#/resultados?visao=empresa');await p.locator('[data-trabalho]').waitFor();await p.locator('[data-trabalho]').click();await p.getByText('Conteúdo privado. Este acompanhamento não concede acesso à conversa.').waitFor();assert.equal(await p.getByRole('link',{name:'Ver meu pedido e a entrega'}).count(),0);assert.equal(await p.locator('#resultado-verificar').count(),0);await p.getByRole('button',{name:'Fechar (Esc)'}).click();
 await p.locator('.resultados-filtro-opcoes summary').click();await p.locator('[name=tipo]').selectOption('planilha');await p.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await p.getByRole('heading',{name:'Nenhum trabalho neste recorte'}).waitFor();assert.match(await p.locator('#resultados-exportar').getAttribute('href'),/tipo=planilha/);assert.equal(await p.locator('[data-trabalho]').count(),0);
 assert.doesNotMatch(await p.locator('#resultados').innerText(),/US\$|USD|margem|custo técnico/i);
}finally{await n.fechar();}});
test('falha de leitura permite tentar novamente e não apresenta zero como resultado',async()=>{const n=await ambiente();try{
 const p=await pagina(n,n.ana);let falhar=true;await p.route('**/api/resultados?*',async r=>{if(falhar)await r.abort();else await r.continue();});await p.goto(n.base+'/app#/resultados');await p.getByRole('heading',{name:'Não foi possível consultar os resultados'}).waitFor();assert.equal(await p.locator('.resultados-metricas').count(),0);falhar=false;await p.getByRole('button',{name:'Tentar novamente',exact:true}).click();await p.locator('[data-trabalho]').waitFor();assert.equal(await p.locator('.resultados-metricas').count(),1);
}finally{await n.fechar();}});
