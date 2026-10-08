import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {salvarConfig} from '../src/config.js';
import {exec,um} from '../src/db.js';
import {arquivo} from '../test/arquivos.js';
let N,admin,gestor,usuario,A,doc,q;const erros=[];
before(async()=>{
 N=await subirComNavegador();salvarConfig(N.app.db,{dominios:['empresa-exemplo.com.br']});admin=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 A=(await admin.post('/api/admin/areas',{nome:'Operações'})).dados;
 for(const [nome,areas] of [['gestor',[{id:A.id,responsavel:true,adminBase:true}]],['usuario',[{id:A.id}]]])await admin.post('/api/admin/pessoas',{nome,email:nome+'@empresa-exemplo.com.br',areas});
 gestor=await cliente(N.app,N.base).entrar('gestor@empresa-exemplo.com.br');usuario=await cliente(N.app,N.base).entrar('usuario@empresa-exemplo.com.br');
 doc=(await gestor.post('/api/bases/documentos',{titulo:'Manual de operação',area_id:A.id,arquivo:arquivo('manual.txt','Procedimento fictício para operação interna.')})).dados;
 q=(await gestor.post('/api/quick-wins',{nome:'Resumo da operação',areas:[A.id],bases:{modo:'escolhidas',ids:[doc.id]}})).dados;
 const espec={v:1,objetivo:'Preparar resumo',regras:[],formato_saida:{tipo:'resumo',descricao:'Resumo curto'},criterios_qualidade:[],origem:{},arquetipo:'analisar_documentos'};
 let vid;for(let n=1;n<=2;n++)vid=Number(exec(N.app.db,'insert into quick_win_versoes (quick_win_id,numero,especificacao,nome,publicada_em) values (?,?,?,?,?)',q.id,n,JSON.stringify({...espec,objetivo:'Preparar resumo '+n}),q.nome,new Date().toISOString()).lastInsertRowid);
 exec(N.app.db,"update quick_wins set especificacao = ?,versao_publicada = ?,status = 'em_uso' where id = ?",JSON.stringify({...espec,objetivo:'Preparar resumo 2'}),vid,q.id);
});
after(async()=>{await N.fechar();assert.deepEqual(erros,[]);});
async function abrir(c,hash) {
 const cookie=c.cookie,k=cookie.indexOf('=');await N.contexto.addCookies([{name:cookie.slice(0,k),value:cookie.slice(k+1),url:N.base}]);
 const p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));await p.emulateMedia({reducedMotion:'reduce'});await p.goto(N.base+'/app'+hash);return p;
}
test('checklist real e pendências por perfil; usuário comum sem ações administrativas',async()=>{
 const p=await abrir(admin,'#/preparacao');await p.waitForSelector('.acomp-passos');assert.match(await p.textContent('#principal'),/Situação calculada/);await p.click('a[href="#/pendencias"]');await p.waitForSelector('#pend-busca');
 const g=await abrir(gestor,'#/pendencias');await g.waitForSelector('#pend-busca');assert.doesNotMatch(await g.textContent('#pend-lista'),/acessos locais/);
 const u=await abrir(usuario,'#/pendencias');await u.waitForSelector('#pend-lista');assert.match(await u.textContent('#pend-lista'),/Nenhuma pendência/);assert.equal(await u.locator('a[href="#/revisao-acessos"]').count(),0);
 await p.close();await g.close();await u.close();
});
test('conhecimento: responsável, validade, suspensão e histórico; falha preserva edição',async()=>{
 const p=await abrir(gestor,'#/conhecimento');await p.waitForSelector('[data-conhecimento-vista="gerir"]');await p.click('[data-conhecimento-vista="gerir"]');await p.click(`[data-editar-conhecimento="${doc.id}"]`);await p.waitForSelector('#conhecimento-ed-validade');
 await p.fill('#conhecimento-ed-validade','2099-12-31');await p.selectOption('#conhecimento-ed-responsavel',String(gestor.pessoa.id));
 await p.route('**/api/bases/documentos/'+doc.id,r=>r.request().method()==='PUT'?r.abort():r.continue());await p.click('#conhecimento-ed-salvar');await p.waitForSelector('#conhecimento-ed-erro:not([hidden])');assert.equal(await p.inputValue('#conhecimento-ed-validade'),'2099-12-31');await p.unroute('**/api/bases/documentos/'+doc.id);
 await p.click('#conhecimento-ed-salvar');await p.waitForSelector('#conhecimento-ed-form',{state:'detached'});await p.waitForFunction(()=>document.querySelector('[data-documento]')?.textContent.includes('2099'));assert.match(await p.textContent('[data-documento]'),/2099/);
 await p.click(`[data-editar-conhecimento="${doc.id}"]`);await p.waitForSelector('#conhecimento-ed-suspenso');await p.check('#conhecimento-ed-suspenso');p.once('dialog',d=>d.accept());await p.click('#conhecimento-ed-salvar');await p.waitForSelector('#conhecimento-ed-form',{state:'detached'});await p.waitForFunction(()=>document.querySelector('[data-documento]')?.textContent.includes('Suspenso'));assert.match(await p.textContent('[data-documento]'),/Suspenso/);
 await p.selectOption('#conhecimento-status','suspenso');assert.equal(await p.locator('[data-documento]').count(),1);
 await p.click(`[data-editar-conhecimento="${doc.id}"]`);await p.waitForSelector('#conhecimento-ed-form');assert.match(await p.textContent('.conhecimento-editor'),/Resumo da operação|Histórico de alterações/);await p.uncheck('#conhecimento-ed-suspenso');await p.click('#conhecimento-ed-salvar');await p.waitForSelector('#conhecimento-ed-form',{state:'detached'});await p.close();
});
test('filtros salvos retornam à consulta e ajuda fecha com Escape e devolve foco',async()=>{
 const p=await abrir(gestor,'#/conhecimento');await p.waitForSelector('#conhecimento-busca');await p.fill('#conhecimento-busca','Manual');await p.click('[data-visao-salvar]');await p.fill('#conhecimento-busca','inexistente');await p.click('[data-visao-aplicar]');assert.equal(await p.inputValue('#conhecimento-busca'),'Manual');
 await p.click('#ajuda-tela');await p.waitForSelector('#ajuda-titulo');assert.match(await p.textContent('.ajuda-contextual'),/documento suspenso ou vencido/);await p.keyboard.press('Escape');assert.equal(await p.locator('#ajuda-titulo').count(),0);assert.equal(await p.evaluate(()=>document.activeElement.id),'ajuda-tela');await p.close();
});
test('revisão de acesso exige conferência e registra sem mudar papel',async()=>{
 const p=await abrir(admin,'#/revisao-acessos');await p.waitForSelector('#acesso-lista');await p.fill('#acesso-busca','usuario');const li=p.locator(`[data-acesso="${usuario.pessoa.id}"]`);await li.locator('summary').click();await li.locator('textarea').fill('Conferi área e base autorizada');await li.locator('input[type=checkbox]').check();await li.locator('button').click();await p.waitForFunction(()=>!document.querySelector('textarea')?.value);assert.equal(um(N.app.db,'select papel from pessoas where id = ?',usuario.pessoa.id).papel,'usuario');assert.ok(um(N.app.db,'select em from revisoes_acesso where pessoa_id = ?',usuario.pessoa.id));await p.close();
});
test('comparação apresenta diferença de objetivo sem restaurar automaticamente; resultados acessíveis ao gestor',async()=>{
 const p=await abrir(gestor,`#/qw/${q.id}/versoes`);await p.waitForSelector('#comparar-versoes',{state:'attached'});await p.locator('details:has(#comparar-versoes)>summary').click();await p.click('#comparar-versoes button');await p.waitForSelector('.comparacao-campo');assert.match(await p.textContent('#versoes-diferencas'),/Preparar resumo 1|Preparar resumo 2/);assert.equal(um(N.app.db,'select numero from quick_win_versoes where id = (select versao_publicada from quick_wins where id = ?)',q.id).numero,2);
 await p.goto(N.base+`/app#/qw/${q.id}`);await p.waitForSelector('#medicao-qw');await p.waitForSelector('#nova-med');assert.match(await p.textContent('#medicao-qw'),/não é benefício verificado/);await p.close();
});
test('auditoria apresenta autor e detalhe legível e permite salvar filtros',async()=>{
 const p=await abrir(admin,'#/atividade');await p.waitForSelector('.auditoria-detalhe');await p.locator('.auditoria-detalhe summary').first().click();assert.match(await p.locator('.auditoria-detalhe').first().textContent(),/Autor:|Registro só de inclusão/);await p.click('[data-visao-salvar]');await p.close();
});
test('layout e navegação em 320, 390, 768 e 1280 px, inclusive ajuda e revisão',async()=>{
 const p=await abrir(admin,'#/pendencias');for(const width of [320,390,768,1280]){
  await p.setViewportSize({width,height:850});for(const hash of ['#/pendencias','#/preparacao','#/revisao-acessos']){
   await p.goto(N.base+'/app'+hash);await p.waitForSelector('.acompanhamento');await p.waitForFunction(titulo=>document.querySelector('.cabeca h1')?.textContent.trim()===titulo,({'#/pendencias':'Pendências','#/preparacao':'Preparar o ambiente','#/revisao-acessos':'Revisar acessos'})[hash]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,hash+' '+width);
   const titulos=await p.locator('.acomp-lista h2,.acomp-passos h2').evaluateAll(els=>els.map(el=>({size:getComputedStyle(el).fontSize,family:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight})));
   for(const t of titulos){assert.equal(t.size,'16px',hash+' '+width);assert.match(t.family,/Inter/);assert.equal(t.weight,'600');}
   if(hash==='#/preparacao'&&width===1280)await p.screenshot({path:'/tmp/greenia-preparacao-tipografia.png'});
   if(hash==='#/pendencias'&&width===1280)await p.screenshot({path:'/tmp/greenia-pendencias-tipografia.png'});
   assert.equal(await p.locator('#ajuda-tela').isVisible(),true);if(width===390&&hash==='#/pendencias')await p.screenshot({path:'capturas/tmp/pendencias-mobile.png',fullPage:true});
  }
 }await p.screenshot({path:'capturas/tmp/acompanhamento-mobile.png',fullPage:true});await p.close();
});
test('detalhe da execução pertence à conversa privada e distingue conferência de ação externa',async()=>{
 const d=(await usuario.post('/api/conversas',{quick_win_id:q.id})).dados.conversa;
 const msg=Number(exec(N.app.db,"insert into mensagens (conversa_id,papel,texto,fontes,criado_em) values (?,'assistant','Resultado fictício de QA',?,?)",d.id,JSON.stringify(['Manual de operação']),new Date().toISOString()).lastInsertRowid);
 // Registro da conferência histórica, sem execução externa simulada como real.
 exec(N.app.db,"insert into roteamento(conversa_id,resposta_id,pessoa_id,qualidade,em,modo,complexidade) values (?,?,?,?,?,'automatico','baixa')",d.id,msg,usuario.pessoa.id,JSON.stringify({status:'parcial',criterios:[],motivo:'Conferência fictícia incompleta'}),new Date().toISOString());
 const p=await abrir(usuario,`#/c/${d.id}`);await p.waitForSelector('.execucao-detalhe');await p.locator('.execucao-detalhe summary').click();assert.match(await p.textContent('.execucao-detalhe'),/Conferência incompleta|Nenhuma ação externa registrada/);assert.equal((await admin.get(`/api/conversas/${d.id}`)).status,404);await p.close();
});
test('pendência de integração abre o detalhe correto em vez da lista geral',async()=>{
 const {criarConector}=await import('../src/integracoes/conectores.js');
 salvarConfig(N.app.db,{integracoes:{ativa:true,pessoas:[]}});
 const c=criarConector(N.app,{id:admin.pessoa.id,admin:true},{nome:'QA integração com falha',sistema:'Sistema fictício',base_url:'https://api.exemplo.test',auth_type:'none',operacoes:[{operation_id:'consultar',metodo:'GET',caminho:'/itens',resumo:'Consultar itens',classe:'SAFE_READ',categoria:'read_data'}]});
 exec(N.app.db,"update connectors set status = 'FAILED' where id = ?",c.id);
 const p=await abrir(admin,'#/pendencias');await p.waitForSelector('#pend-lista');await p.selectOption('#pend-tipo','integracao');const link=p.locator(`#pend-lista a[href="#/integracoes/c/${c.id}"]`);assert.equal(await link.count(),1);await link.click();await p.waitForSelector('h1');await p.waitForFunction(()=>document.querySelector('#principal')?.textContent.includes('QA integração com falha'));assert.equal(new URL(p.url()).hash,`#/integracoes/c/${c.id}`);assert.match(await p.textContent('#principal'),/Falhou no teste|QA integração com falha/);await p.close();
});
