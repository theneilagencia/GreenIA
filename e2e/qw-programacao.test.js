import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec,um} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';
import {rodadaProgramadas} from '../src/qw-programacao.js';

test('agendar parte da lista em um clique e o menu não fica sob outras linhas',async()=>{
 const N=await subirComNavegador();try{
  const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const qs=[];
  for(const nome of ['A - Resumo fictício','B - Outro trabalho fictício','C - Terceiro trabalho fictício']){
   const q=(await a.post('/api/quick-wins',{nome,toda_empresa:true})).dados;qs.push(q);
   const spec=JSON.stringify(construir({descricao:'Organizar atividades informadas',formato:'texto'}));const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,spec,nome,new Date().toISOString()).lastInsertRowid;
   exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,q.id);
  }
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+'/app#/quick-wins');
  const linha=p.locator('.qw-item').filter({has:p.locator(`a.qw-item-link[href="#/qw/${qs[0].id}"]`)});
  await linha.getByRole('link',{name:`Agendar ${qs[0].nome}`,exact:true}).waitFor();
  await linha.locator('.menu-acoes summary').click();const menu=linha.getByRole('menuitem',{name:'Ver agendamentos',exact:true});await menu.waitFor();
  assert.ok(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.right-8,r.top+r.height/2));}),'o lado direito do menu deve receber o clique, sem botões de outras linhas por cima');
  const box=await menu.boundingBox();await menu.click({position:{x:box.width-8,y:box.height/2}});
  await p.getByRole('heading',{name:'Este Quick Win ainda não tem agendamento',exact:true}).waitFor();
  assert.equal(await p.getByRole('link',{name:'Escolher um Quick Win',exact:true}).count(),0,'não manda escolher novamente o trabalho selecionado');
  assert.equal(await p.getByRole('link',{name:'Agendar este Quick Win',exact:true}).getAttribute('href'),`#/qw/${qs[0].id}/programar`);
  await p.getByRole('link',{name:'Agendar este Quick Win',exact:true}).click();await p.waitForSelector('#rotina-form');
  await p.goto(N.base+'/app#/quick-wins');await linha.getByRole('link',{name:`Agendar ${qs[0].nome}`,exact:true}).click();await p.waitForSelector('#rotina-form');
  assert.equal(new URL(p.url()).hash,`#/qw/${qs[0].id}/programar`);
  await p.goto(N.base+`/app#/qw/${qs[0].id}`);await p.getByRole('link',{name:'Agendar',exact:true}).click();await p.waitForSelector('#rotina-form');
  await p.setViewportSize({width:390,height:844});await p.goto(N.base+'/app#/quick-wins');await linha.getByRole('link',{name:`Agendar ${qs[0].nome}`,exact:true}).waitFor();await p.waitForFunction(()=>document.getElementById('lateral').getBoundingClientRect().right<=1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await linha.locator('.menu-acoes summary').click();await menu.waitFor();
  assert.ok(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.right-8,r.top+r.height/2));}));
  await p.screenshot({path:'/tmp/greenia-menu-agendamento-mobile.png',fullPage:true});await menu.click();await p.getByRole('heading',{name:'Este Quick Win ainda não tem agendamento',exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await N.fechar();}
});

test('programação simples confere e ativa, funciona após fechar aba e cabe no celular',async()=>{
 const N=await subirComNavegador();try{
  const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');const q=(await a.post('/api/quick-wins',{nome:'Resumo fictício de QA',toda_empresa:true})).dados;
  const spec=JSON.stringify(construir({descricao:'Organizar as atividades informadas da equipe',formato:'texto'}));const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,spec,q.nome,new Date().toISOString()).lastInsertRowid;
  exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,q.id);
  let p=await N.entrar('admin@empresa-exemplo.com.br');const erros=[];p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+`/app#/qw/${q.id}/programar`);await p.waitForSelector('#rotina-form');await p.setViewportSize({width:390,height:844});assert.equal(await p.isVisible('#rotina-creditos'),false,'opções adicionais não interrompem a jornada');await p.waitForFunction(()=>document.getElementById('lateral').getBoundingClientRect().right<=1);await p.screenshot({path:'/tmp/greenia-agendamento-simples-mobile.png',fullPage:true});
  await p.click('#rotina-opcoes summary');await p.fill('#rotina-nome','Rotina fictícia de QA');await p.fill('#rotina-entrada','Organizar três atividades fictícias: revisão de cadastro, conferência de pedidos e preparação da reunião.');await p.selectOption('#rotina-frequencia','semanal');await p.selectOption('#rotina-dia','1');await p.fill('#rotina-hora','09:00');
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.click('#rotina-salvar');await p.waitForSelector('#rotina-revisao:not([hidden])');assert.equal(await p.isVisible('#rotina-entrada'),false,'conferência mostra só o resumo');await p.screenshot({path:'/tmp/greenia-agendamento-resumo-mobile.png',fullPage:true});assert.equal(um(N.app.db,'select * from qw_programacoes'),undefined,'conferir ainda não cria nem ativa');assert.match(await p.textContent('#rotina-resumo'),/Segunda-feira.*09:00/);const bloquearAtivacao=r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária de ativação.'})});await p.route(/\/programacoes\/[^/]+\/estado$/,bloquearAtivacao);await p.click('#rotina-ativar');await p.waitForSelector('#rotina-erro:not(.oculto)');assert.match(await p.textContent('#rotina-erro'),/ainda está pausada/);assert.equal(um(N.app.db,'select count(*) as n from qw_programacoes').n,1);assert.equal(um(N.app.db,'select ativa from qw_programacoes').ativa,0);await p.unroute(/\/programacoes\/[^/]+\/estado$/,bloquearAtivacao);await p.click('#rotina-ativar');await p.waitForSelector('[data-executar]');assert.equal(um(N.app.db,'select count(*) as n from qw_programacoes').n,1,'tentar novamente não duplica a programação');
  const s=um(N.app.db,'select * from qw_programacoes');assert.equal(s.ativa,1);await p.click('[data-executar]');await p.waitForSelector('.qw-rotina-historico summary');await p.click('.qw-rotina-historico summary');await p.waitForSelector('text=Na fila');await p.close();await rodadaProgramadas(N.app);
  const e=um(N.app.db,'select * from qw_programadas_execucoes');assert.ok(e.conversa_id);assert.notEqual(e.status,'executando');assert.notEqual(e.status,'bloqueada');
  p=await N.contexto.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto(N.base+'/app#/quick-wins/programados');await p.waitForSelector('.qw-rotina-card');await p.click('.qw-rotina-historico summary');await p.waitForSelector('text=Abrir resultado');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.getByRole('link',{name:'Abrir resultado'}).click();await p.waitForSelector('.resposta');assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});

test('agendamento em processamento orienta a espera e só oferece resultado após concluir',async()=>{
 const N=await subirComNavegador();try{
  const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
  const q=(await a.post('/api/quick-wins',{nome:'QA fictício estados da execução',toda_empresa:true})).dados;
  const p=await N.entrar('admin@empresa-exemplo.com.br');let status='na_fila';
  const rotina={id:'qa-estados',nome:q.nome,quick_win_id:q.id,quick_win:q.nome,minha:true,podeEditar:true,ativa:true,responsavel:'Pessoa de teste',tipo:'horario',agenda:{frequencia:'diaria',hora:'09:00',fuso:'America/Sao_Paulo'},proxima_em:'2026-10-10T12:00:00Z',creditos_usados:0,limite_creditos:100,max_dia:1};
  await p.route('**/api/quick-wins-programados',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({programacoes:[{...rotina,execucoes:[{id:'qa-execucao',status,conversa_id:123,criada_em:'2026-10-09T12:00:00Z'}]}]})}));
  await p.goto(N.base+'/app#/quick-wins/programados');
  for(const estado of ['na_fila','executando']){
   status=estado;await p.getByRole('button',{name:'Atualizar status',exact:true}).click();
   await p.getByRole('button',{name:'Execução em andamento',exact:true}).waitFor();
   assert.equal(await p.getByRole('button',{name:'Execução em andamento',exact:true}).isDisabled(),true);
   assert.match(await p.locator('.qw-rotina-card').innerText(),/preparando e conferindo.*atualiza o andamento automaticamente/);
   assert.equal(await p.locator('.qw-rotina-card a[href="#/c/123"]').count(),0,'não abre conversa vazia como resultado');
  }
  await p.locator('.qw-rotina-card .qw-rotina-historico summary').click();
  await p.locator('.qw-rotina-card .qw-rotina-historico summary').focus();
  status='concluida'; // A atualização automática deve disponibilizar o resultado, sem outro clique.
  await p.getByRole('link',{name:'Ver último resultado',exact:true}).waitFor({timeout:12000});assert.equal(await p.getByRole('link',{name:'Ver último resultado',exact:true}).getAttribute('href'),'#/c/123');
  assert.equal(await p.getByRole('button',{name:'Executar agora',exact:true}).isEnabled(),true);
  assert.equal(await p.locator('.qw-rotina-card .qw-rotina-historico').evaluate(e=>e.open),true,'a atualização não fecha o histórico que a pessoa está lendo');
  assert.equal(await p.evaluate(()=>document.activeElement.matches('.qw-rotina-card .qw-rotina-historico summary')),true,'o foco do teclado permanece no histórico');
  assert.equal(await p.getByRole('link',{name:'Abrir resultado',exact:true}).getAttribute('href'),'#/c/123');
  let liberar,avisar;const espera=new Promise(r=>liberar=r),iniciado=new Promise(r=>avisar=r);
  await p.unroute('**/api/quick-wins-programados');
  await p.route('**/api/quick-wins-programados',async r=>{avisar();await espera;await r.fulfill({contentType:'application/json',body:JSON.stringify({programacoes:[]})});});
  await p.getByRole('button',{name:'Atualizar status',exact:true}).click();await iniciado;
  await p.goto(N.base+'/app#/nova');await p.waitForSelector('#entrada');liberar();
  await p.waitForLoadState('networkidle');assert.equal(await p.locator('#entrada').count(),1,'resposta atrasada não substitui a nova conversa por agendamentos');
 }finally{await N.fechar();}
});
