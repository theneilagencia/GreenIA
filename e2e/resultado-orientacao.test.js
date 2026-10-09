import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec} from '../src/db.js';
import {construir} from '../src/quickwin-construtor.js';
import {criarPlano} from '../src/integracoes/plano.js';
import {salvarConfig} from '../src/config.js';
import {mkdir} from 'node:fs/promises';

test('alerta real → refinar o caso exato; melhoria não envia, não publica e conserva texto após erro',async()=>{
 const N=await subirComNavegador();try{
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 const ensino={nome:'Newsletter de QA',descricao:'Escrever uma newsletter com linguagem natural.',regras:['nao_inventar'],formato:'texto'};
 const q=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
 const spec=JSON.stringify(construir(ensino)),em=new Date().toISOString();
 const v=exec(N.app.db,'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)',q.id,spec,q.nome,em).lastInsertRowid;
 exec(N.app.db,"update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?",spec,v,q.id);
 const c=(await a.post('/api/conversas',{quick_win_id:q.id})).dados.conversa;
 const material='Tema fictício de QA: reduzir trabalho manual no atendimento.';
 exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'user',?,?)",c.id,material,em);
 const msg=Number(exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','Texto fictício que precisa melhorar',?)",c.id,em).lastInsertRowid);
 salvarConfig(N.app.db,{integracoes:{ativa:true,pessoas:[]}});
 const plano=criarPlano(N.app,{id:a.pessoa.id,admin:true},{conversaId:c.id,quickWinId:q.id,necessidades:[{id:'consulta',acao:'Consultar conteúdo da etapa editorial',sistema:'Fase Zero',categoria:'read_data',modo:'read'}]});
 const qualidade={status:'inconsistente',falhas:['completo'],razoes:[{grupo:'completo',motivo:'Falta plano de ação com responsáveis, prazos e KPIs mensuráveis. (critério: Plano de ação)'},{grupo:'completo',motivo:'Tom e construção narrativa contêm marcas de IA: repetição de frases. (critério: Linguagem natural)'}],pesquisa:{feita:false,motivo:'area_reforcada'},integracoes:{plano:plano.id,status:'BLOCKED',motivo:'resultado_nao_conferido',passos:[{id:'consulta',sistema:'Fase Zero',acao:'Consulta editorial',modo:'read',status:'BLOCKED'}]}};
 exec(N.app.db,"insert into roteamento(conversa_id,resposta_id,pessoa_id,qualidade,em,modo,complexidade) values(?,?,?,?,?,'automatico','baixa')",c.id,msg,a.pessoa.id,JSON.stringify(qualidade),em);
 const p=await N.entrar('admin@empresa-exemplo.com.br');const erros=[];p.on('pageerror',e=>erros.push(e.message));
 for(const width of [1280,390,320]){
   await p.setViewportSize({width,height:900});await p.goto(N.base+`/app#/c/${c.id}`);await p.locator('.qc-revisar').waitFor();
   assert.match(await p.locator('.qc-revisar').innerText(),/Como melhorar:.*responsáveis, prazos e indicadores.*simplificar a linguagem/s);
   assert.equal(await p.locator('.qc-diagnostico').getAttribute('open'),null);
   assert.doesNotMatch(await p.locator('.painel-integracoes').innerText(),/Gravações bloqueadas|Alterações no sistema não realizadas/);
   assert.match(await p.locator('.painel-integracoes').innerText(),/dados desta consulta não foram obtidos.*não crie uma conexão para uma etapa editorial/s);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.locator('[data-melhorar-resultado]').click();assert.match(await p.inputValue('#entrada'),/responsáveis, prazos e indicadores/);
   assert.equal(N.app.db.prepare('select count(*) as n from mensagens where conversa_id=?').get(c.id).n,2,'preparar não envia');
   assert.equal(await p.locator('#entrada').evaluate(el=>el===document.activeElement),true);
   await p.fill('#entrada','');
 }
 const capturas=process.env.QW_VISUAL_DIR;if(capturas){await mkdir(capturas,{recursive:true});await p.screenshot({path:`${capturas}/resultado-320.png`,fullPage:true,animations:'disabled'});}
 await p.locator('.qc-revisar').getByRole('link',{name:'Refinar Quick Win',exact:true}).click();
 await p.waitForSelector('#refinamento-texto');assert.equal(new URL(p.url()).hash,`#/qw/${q.id}/refinar/${c.id}/${msg}`);
 assert.equal(await p.locator('#objetivo').count(),0,'não volta ao editor');assert.match(await p.locator('.refinamento-contexto').innerText(),/material deste caso está disponível/);
 await p.getByRole('button',{name:'Usar estes pontos como orientação',exact:true}).click();const feedback=await p.inputValue('#refinamento-texto');assert.match(feedback,/simplificar a linguagem/);
 let recebido;
 await p.route(`**/api/quick-wins/${q.id}/refinamento`,r=>{recebido=r.request().postDataJSON();return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária de QA.'})});});
 await p.getByRole('button',{name:'Preparar ajustes',exact:true}).click();await p.waitForFunction(()=>document.getElementById('refinamento-erro')?.textContent.includes('Falha temporária'));
 assert.equal(recebido.conversa_id,c.id);assert.equal(recebido.mensagem_id,msg);assert.equal(await p.inputValue('#refinamento-texto'),feedback);
 assert.equal(N.app.db.prepare('select versao_publicada from quick_wins where id=?').get(q.id).versao_publicada,v);
 assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});
