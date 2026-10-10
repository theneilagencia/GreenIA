import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';
import {salvarConfig} from '../src/config.js';

test('conversa comum explica bloqueio atual, abre a área exata, confirma alcance e preserva o pedido',async()=>{
 const N=await subirComNavegador();try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 const area=(await a.post('/api/admin/areas',{nome:'Editorial QA'})).dados.id;
 await a.put(`/api/admin/areas/${area}`,{sigilosa:true});
 salvarConfig(N.app.db,{pesquisaWeb:{ativa:true}});
 const ensino={nome:'Pautas de QA',descricao:'Pesquise na internet temas atuais sobre automação.',operacao:{v:2,entregaveis:[{id:'e1',tipo:'resumo',rotulo:'Temas'}],ferramentas:['pesquisa_web'],origem:'pessoa'}};
 const qw=(await a.post('/api/quick-wins',{assistente:ensino,areas:[area]})).dados;
 const spec=JSON.stringify(construir(ensino)),em=new Date().toISOString();
 const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',qw.id,spec,qw.nome,em).lastInsertRowid;
 exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,qw.id);
 const c=(await a.post('/api/conversas',{quick_win_id:qw.id})).dados.conversa;
 exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','Não consigo habilitar pesquisa pela conversa.',?)",c.id,em);
 const p=await N.entrar('admin@empresa-exemplo.com.br');const erros=[];p.on('pageerror',e=>erros.push(e.message));
 for(const width of [1280,390,320]){
  await p.setViewportSize({width,height:900});await p.goto(N.base+`/app#/c/${c.id}`);await p.waitForSelector('#resolver-pesquisa');
  await p.getByRole('button',{name:'Ver como liberar a pesquisa',exact:true}).click();
  assert.match(await p.locator('.pesquisa-resolucao').innerText(),/Editorial QA.*Não existe liberação apenas para este Quick Win/s);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.getByRole('button',{name:'Fechar',exact:true}).click();
 }
 await p.fill('#entrada','deixe a pesquisa internet habilitada no quick win');
 await p.getByRole('button',{name:'Enviar',exact:true}).click();await p.waitForSelector('.pesquisa-resolucao');
 assert.equal(N.app.db.prepare('select count(*) as n from mensagens where conversa_id=?').get(c.id).n,1,'pedido de liberação não gasta IA nem vira resposta confusa');
 await p.getByRole('button',{name:'Conferir novamente',exact:true}).click();await p.waitForFunction(()=>document.getElementById('pesquisa-verificacao')?.textContent.includes('continua bloqueada'));
 await p.getByRole('link',{name:'Revisar a pesquisa em Editorial QA',exact:true}).click();await p.waitForSelector('.px #protecao-area');
 assert.equal(await p.inputValue('#px-titulo'),'Editorial QA');
 assert.match(await p.locator('#protecao-area').innerText(),/afeta todos/);
 p.once('dialog',d=>d.dismiss());await p.locator('#protecao-area').getByRole('radio',{name:'Padrão',exact:true}).click();
 assert.equal(N.app.db.prepare('select sigilosa from areas where id=?').get(area).sigilosa,1,'cancelar mantém a regra');
 p.once('dialog',d=>d.accept());await p.locator('#protecao-area').getByRole('radio',{name:'Padrão',exact:true}).click();
 await p.waitForFunction(()=>document.getElementById('px-estado')?.textContent==='Salvo');
 assert.equal(N.app.db.prepare('select sigilosa from areas where id=?').get(area).sigilosa,0);
 await p.getByRole('link',{name:'Voltar e conferir a pesquisa',exact:true}).click();await p.waitForSelector('#entrada');
 assert.equal(await p.locator('#resolver-pesquisa').count(),0);
 assert.equal(await p.inputValue('#entrada'),'deixe a pesquisa internet habilitada no quick win','texto retomado após revisar configuração');
 assert.equal(N.app.db.prepare('select count(*) as n from mensagens where conversa_id=?').get(c.id).n,1);
 await a.put(`/api/admin/areas/${area}`,{sigilosa:true});
 await a.post('/api/admin/pessoas',{email:'leiga@empresa-exemplo.com.br',nome:'Leiga',areas:[{id:area}]});
 const l=await cliente(N.app,N.base).entrar('leiga@empresa-exemplo.com.br');
 const lc=(await l.post('/api/conversas',{quick_win_id:qw.id})).dados.conversa;
 const lp=await N.entrar('leiga@empresa-exemplo.com.br');await lp.goto(N.base+`/app#/c/${lc.id}`);await lp.waitForSelector('#resolver-pesquisa');
 await lp.getByRole('button',{name:'Ver como liberar a pesquisa',exact:true}).click();
 assert.equal(await lp.getByRole('link',{name:'Revisar a pesquisa em Editorial QA',exact:true}).count(),0);
 await lp.getByRole('button',{name:'Solicitar revisão ao administrador',exact:true}).click();await lp.waitForSelector('#descricao-problema');
 assert.match(await lp.inputValue('#descricao-problema'),/Pesquisa na internet bloqueada/);
 await lp.getByRole('button',{name:'Cancelar',exact:true}).click();
 assert.equal((await l.put(`/api/admin/areas/${area}`,{sigilosa:false})).status,403);
 assert.equal(N.app.db.prepare('select sigilosa from areas where id=?').get(area).sigilosa,1);
 assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});

import {openRouterFalso} from '../test/openrouter-falso.js';
import {MARCADOR_PERGUNTA} from '../src/quickwin-construtor.js';
test('pessoa muda o comportamento pelo refinamento: sugerir → esperar escolha → escrever, sem editar campos técnicos',async()=>{
 const processo='Primeiro sugira temas relacionados ao assunto enviado. Espere minha escolha antes de escrever o artigo.';
 const O=await openRouterFalso({responder:b=>{
  const s=String(b.messages[0].content);
  if(s.includes('Você refina Quick Wins')) return JSON.stringify({sugestoes:[{campo:'processo',depois:processo,motivo:'A pessoa quer escolher o tema antes de escrever.'}]});
  if(s.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  const escolha=b.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('Escolho o tema 2'));
  return escolha?'## Artigo\nArtigo de QA sobre conferir os resultados, usando o material enviado.':`${MARCADOR_PERGUNTA}\n1. Reduzir trabalho manual\n2. Conferir resultados\n3. Organizar informações\nQual tema você escolhe?`;
 }});
 const N=await subirComNavegador({ia:O.ia});try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 await a.put('/api/admin/modelos/mistralai%2Fmistral-small',{liberado:true,perfil:'rapido'});
 const ensino={nome:'Artigo de QA',descricao:'Criar artigo sobre o assunto enviado.',formato:'outro',formato_descricao:'Texto do artigo',operacao:{v:2,origem:'pessoa',entregaveis:[{id:'e1',tipo:'texto',rotulo:'Artigo'}],ferramentas:[]}};
 const qw=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
 const spec=JSON.stringify(construir(ensino)),em=new Date().toISOString();
 const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',qw.id,spec,qw.nome,em).lastInsertRowid;
 exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,qw.id);
 const c=(await a.post('/api/conversas',{quick_win_id:qw.id})).dados.conversa;
 exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'user','Assunto de QA: reduzir trabalho manual.',?)",c.id,em);
 const msg=Number(exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','Artigo de QA escrito sem pedir a escolha.',?)",c.id,em).lastInsertRowid);
 exec(N.app.db,"insert into roteamento(conversa_id,resposta_id,pessoa_id,qualidade,em,modo,complexidade) values(?,?,?,?,?,'automatico','baixa')",c.id,msg,a.pessoa.id,JSON.stringify({status:'aprovado',falhas:[],verificados:[]}),em);
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+`/app#/qw/${qw.id}/refinar/${c.id}/${msg}`);await p.waitForSelector('#refinamento-texto');
 await p.fill('#refinamento-texto',processo);await p.getByRole('button',{name:'Preparar ajustes',exact:true}).click();await p.waitForSelector('#aprovar-refinamento');
 assert.match(await p.locator('#refinamento-sugestoes').innerText(),/Espere minha escolha/);
 await p.getByRole('button',{name:'Aplicar ajustes e testar',exact:true}).click();
 await p.waitForFunction(()=>document.body.innerText.includes('Alterações aplicadas ao rascunho'));
 await p.waitForFunction(()=>document.body.innerText.includes('Qual tema você escolhe?'));
 const salvo=N.app.db.prepare('select especificacao,versao_publicada from quick_wins where id=?').get(qw.id);
 assert.match(JSON.parse(salvo.especificacao).origem.como.texto,/Espere minha escolha/);
 assert.equal(salvo.versao_publicada,v);
 const novo=N.app.db.prepare('select id from conversas where quick_win_id=? and teste=1 order by id desc limit 1').get(qw.id).id;
 const d=(await a.get(`/api/conversas/${novo}`)).dados;assert.equal(d.mensagens.at(-1).qualidade.status,'pergunta');
 const msgAtual=d.mensagens.at(-1).id;
 exec(N.app.db,"insert into roteamento(conversa_id,resposta_id,pessoa_id,qualidade,em,modo,complexidade) values(?,?,?,?,?,'automatico','baixa')",novo,msgAtual,a.pessoa.id,JSON.stringify({status:'pergunta',falhas:[],verificados:[]}),em);
 await p.goto(N.base+`/app#/c/${novo}`);await p.waitForSelector('#entrada');await p.fill('#entrada','Escolho o tema 2: conferir resultados.');await p.getByRole('button',{name:'Enviar',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('#coluna')?.textContent.includes('Artigo de QA sobre conferir os resultados'));
 assert.notEqual((await a.get(`/api/conversas/${novo}`)).dados.mensagens.at(-1).qualidade.status,'pergunta');
 assert.equal(await p.locator(`#resultado-${msgAtual}`).count(),1,'a pergunta aparece uma única vez mesmo com mais de um registro de rota');
 }finally{await N.fechar();await O.fechar();}
});

test('salvar processo sem avançar atualiza etapas e pesquisa; falha conserva orientação e não salva plano antigo',async()=>{
 const processo='Sugira temas atuais sobre mineração. Aguarde eu escolher antes de escrever o artigo.';
 const O=await openRouterFalso({responder:b=>{
  const s=String(b.messages[0].content);
  if(s.includes('PLANO DE TRABALHO')) {
   const novo=JSON.stringify(b.messages).includes('Aguarde eu escolher');
   return JSON.stringify({resumo:novo?'Pesquisar temas e esperar escolha':'Escrever artigo',entradas:[],etapas:[{texto:novo?processo:'Escrever o artigo.'}],entregaveis:[{id:'e1',tipo:'texto',rotulo:'Artigo'}],ferramentas:novo?['pesquisa_web']:[],contexto_empresa:false});
  }
  return 'Certo.';
 }});
 const N=await subirComNavegador({ia:O.ia});try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 await a.put('/api/admin/modelos/mistralai%2Fmistral-small',{liberado:true,perfil:'rapido'});
 const qw=(await a.post('/api/quick-wins',{assistente:{nome:'QA salvar orientação',descricao:'Escrever artigo sobre o assunto enviado.',operacao:{v:2,origem:'ia',entregaveis:[{id:'e1',tipo:'texto',rotulo:'Artigo'}],ferramentas:[]}},toda_empresa:true})).dados;
 const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(N.base+`/app#/qw/${qw.id}/ajustar`);await p.getByRole('button',{name:'Voltar para Processo',exact:true}).click();await p.waitForSelector('#processo');
 await p.fill('#processo',processo);
 await p.route('**/api/quick-wins/assistente/interpretar',route=>route.fulfill({status:503,contentType:'application/json',body:'{"mensagem":"Indisponível no QA"}'}));
 await p.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await p.waitForFunction(()=>document.body.innerText.includes('Não foi possível organizar esta orientação'));
 assert.equal(await p.inputValue('#processo'),processo);
 assert.deepEqual(JSON.parse(N.app.db.prepare('select especificacao from quick_wins where id=?').get(qw.id).especificacao).operacao.ferramentas,[],'erro não salva plano obsoleto como sucesso');
 await p.unroute('**/api/quick-wins/assistente/interpretar');
 await p.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await p.waitForFunction(()=>document.getElementById('estado-rascunho')?.textContent.includes('Rascunho salvo'));
 const salvo=JSON.parse(N.app.db.prepare('select especificacao from quick_wins where id=?').get(qw.id).especificacao);
 assert.match(salvo.origem.como.texto,/Aguarde eu escolher/);assert.ok(salvo.operacao.ferramentas.includes('pesquisa_web'));
 await p.waitForSelector('#processo');assert.match(await p.locator('#plano').innerText(),/Aguarde eu escolher/,'resumo mostrado já reflete o processo salvo');
 await p.reload();await p.getByRole('button',{name:'Voltar para Processo',exact:true}).click();await p.waitForSelector('#processo');assert.equal(await p.inputValue('#processo'),processo);
 }finally{await N.fechar();await O.fechar();}
});
