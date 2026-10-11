import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subirComNavegador} from '../scripts/navegador.js';
import {cliente} from '../scripts/cliente.js';
import {exec} from '../src/db.js';
import {mkdir} from 'node:fs/promises';
async function fixture(N){
 const a=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
 const q=(await a.post('/api/quick-wins',{nome:'Conferência de fornecedores',toda_empresa:true,painel_modelo:'fornecedores'})).dados;
 exec(N.app.db,"update quick_wins set status='em_uso' where id=?",q.id);
 const em=new Date().toISOString();const c=Number(exec(N.app.db,'insert into conversas(pessoa_id,quick_win_id,criado_em,atualizado_em) values(?,?,?,?)',a.pessoa.id,q.id,em,em).lastInsertRowid);
 const m=Number(exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant',?,?)",c,'Fornecedor Exemplo | Certidão | Documento vencido',em).lastInsertRowid);
 exec(N.app.db,"insert into roteamento(em,pessoa_id,conversa_id,resposta_id,quick_win_id,modo,complexidade,resultado,versao,qualidade) values(?,?,?,?,?,'auto','baixa','respondido','teste',?)",em,a.pessoa.id,c,m,q.id,JSON.stringify({status:'parcial'}));return {a,q,c,m};
}
test('leigo: resultado → conferir → erro recuperável → confirmar → histórico → corrigir → recarregar',async()=>{
 const N=await subirComNavegador();try{
  const {q,c,m}=await fixture(N);const p=await N.entrar('admin@empresa-exemplo.com.br');const erros=[];p.on('pageerror',e=>erros.push(e.message));
  await p.goto(`${N.base}/app#/c/${c}`);await p.getByRole('link',{name:'Conferir dados para o acompanhamento'}).click();
  await p.getByRole('heading',{name:'Confira antes de registrar'}).waitFor();
  await p.getByLabel('Fornecedor *',{exact:true}).fill('Fornecedor <Exemplo>');await p.getByLabel('Documento *',{exact:true}).fill('Certidão');await p.getByLabel('Situação *',{exact:true}).selectOption('pendente');await p.getByLabel('O que precisa resolver',{exact:true}).fill('Documento vencido');
  await p.getByLabel('Conferi as limitações do resultado parcial e os dados que quero registrar').check();await p.getByLabel('Conferi os dados. Eles podem ser usados nos indicadores deste acompanhamento.').check();
  await p.route(`**/api/quick-wins/${q.id}/painel/registros/*`,r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mensagem:'Falha temporária de QA.'})}):r.continue());
  await p.getByRole('button',{name:'Confirmar e incluir no histórico'}).click();await p.getByText('Os dados foram mantidos nesta tela.',{exact:false}).waitFor();assert.equal(await p.getByLabel('Fornecedor *',{exact:true}).inputValue(),'Fornecedor <Exemplo>');
  await p.unroute(`**/api/quick-wins/${q.id}/painel/registros/*`);await p.getByRole('button',{name:'Confirmar e incluir no histórico'}).click();await p.getByRole('heading',{name:'Registros confirmados'}).waitFor();assert.equal(await p.locator('#painel-linhas tr').count(),1);assert.match(await p.locator('#painel-linhas').innerText(),/Fornecedor <Exemplo>/);
  await p.getByRole('link',{name:'Conferir ou corrigir'}).click();await p.getByRole('heading',{name:'Corrigir um registro'}).waitFor();await p.getByLabel('Situação *',{exact:true}).selectOption('conferido');await p.getByLabel('O que precisa resolver',{exact:true}).fill('');await p.getByLabel('Por que está corrigindo?').fill('Documento renovado');await p.getByLabel('Conferi as limitações do resultado parcial e os dados que quero registrar').check();await p.getByLabel('Conferi os dados. Eles podem ser usados nos indicadores deste acompanhamento.').check();await p.getByRole('button',{name:'Salvar correção'}).click();await p.getByRole('heading',{name:'Registros confirmados'}).waitFor();await p.reload();await p.getByRole('heading',{name:'Registros confirmados'}).waitFor();assert.match(await p.locator('#painel-linhas').innerText(),/Conferido/);assert.deepEqual(erros,[]);
 }finally{await N.fechar();}
});
test('processo pronto cria rascunho com campos definidos e obriga teste/publicação',async()=>{
 const N=await subirComNavegador();try{
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(`${N.base}/app#/quick-wins`);await p.getByRole('link',{name:'Escolher processo com acompanhamento',exact:true}).click();await p.getByRole('heading',{name:'Comece com um processo pronto'}).waitFor();
  await p.getByRole('radio',{name:/Acompanhar ações e prazos/}).check();await p.getByRole('button',{name:'Criar e testar este processo'}).click();await p.waitForURL(/#\/qw\/\d+\/teste/);await p.locator('#principal').getByText('Acompanhamento de ações',{exact:false}).first().waitFor();
  const q=N.app.db.prepare('select * from quick_wins order by id desc limit 1').get();assert.equal(q.versao_publicada,null);assert.equal(N.app.db.prepare('select modelo from qw_paineis where quick_win_id=?').get(q.id).modelo,'acoes');
 }finally{await N.fechar();}
});
test('320/390/768/1280px: acompanhamento e conferência legíveis, foco, busca, escopo e retirada',async()=>{
 const N=await subirComNavegador();try{
  const {q,a,m}=await fixture(N);const d=(await a.post(`/api/quick-wins/${q.id}/painel/preparar`,{mensagem:m})).dados;
  await a.post(`/api/quick-wins/${q.id}/painel/registros/${d.id}`,{dados:[{fornecedor:'Fornecedor Exemplo',documento:'Certidão',situacao:'pendente',pendencia:'Documento vencido'}],versao:d.versao,escopo:'pessoal',confirmado:true,cienteParcial:true});
  const p=await N.entrar('admin@empresa-exemplo.com.br');await mkdir('/workspace/scratch/debf43e0be2e/qa-paineis',{recursive:true});
  for(const width of [320,390,768,1280]){
   await p.setViewportSize({width,height:900});await p.goto(`${N.base}/app#/qw/${q.id}/acompanhamento`);await p.getByRole('heading',{name:'Registros confirmados'}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`painel ${width}`);
   await p.getByLabel('Encontrar um registro nesta página').fill('inexistente');assert.equal(await p.locator('#painel-linhas tr:visible').count(),0);await p.getByLabel('Encontrar um registro nesta página').fill('');
   await p.evaluate(()=>{document.querySelector('.pagina')?.scrollTo(0,0);});
   if([390,1280].includes(width))await p.screenshot({path:`/workspace/scratch/debf43e0be2e/qa-paineis/painel-${width}.png`,fullPage:true,animations:'disabled'});
   await p.getByRole('link',{name:'Conferir ou corrigir'}).click();await p.getByRole('heading',{name:'Corrigir um registro'}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`conferência ${width}`);assert.equal(await p.getByRole('radio',{name:'Só eu',exact:true}).isChecked(),true);
   await p.evaluate(()=>{document.querySelector('.pagina')?.scrollTo(0,0);});
   if([390,1280].includes(width))await p.screenshot({path:`/workspace/scratch/debf43e0be2e/qa-paineis/conferencia-${width}.png`,fullPage:true,animations:'disabled'});
  }
  await p.getByText('Retirar este resultado do acompanhamento',{exact:true}).click();await p.getByLabel('Por que deseja retirar?').fill('Registro duplicado');await p.getByRole('button',{name:'Confirmar retirada do histórico'}).click();await p.getByRole('heading',{name:'Seu histórico começa com o primeiro registro'}).waitFor();
 }finally{await N.fechar();}
});
test('paginação pelo link persiste após recarga e ajuda explica o acompanhamento',async()=>{
 const N=await subirComNavegador();try{
  const {q,a,m}=await fixture(N);const d=(await a.post(`/api/quick-wins/${q.id}/painel/preparar`,{mensagem:m})).dados;
  await a.post(`/api/quick-wins/${q.id}/painel/registros/${d.id}`,{dados:[{fornecedor:'Fornecedor inicial',documento:'Certidão',situacao:'pendente',pendencia:'Documento vencido'}],versao:d.versao,escopo:'pessoal',confirmado:true,cienteParcial:true});
  const row=N.app.db.prepare('select * from qw_painel_registros where id=?').get(d.id);
  for(let i=0;i<50;i++){
   const em=new Date().toISOString(),c=Number(exec(N.app.db,'insert into conversas(pessoa_id,quick_win_id,criado_em,atualizado_em) values(?,?,?,?)',a.pessoa.id,q.id,em,em).lastInsertRowid);
   const msg=Number(exec(N.app.db,"insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','QA',?)",c,em).lastInsertRowid);
   exec(N.app.db,"insert into qw_painel_registros(quick_win_id,conversa_id,mensagem_id,pessoa_id,estado,dados,confirmado_em,criado_em,atualizado_em) values(?,?,?,?,'confirmado',?,?,?,?)",q.id,c,msg,a.pessoa.id,row.dados,row.confirmado_em,row.criado_em,row.atualizado_em);
  }
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(`${N.base}/app#/qw/${q.id}/acompanhamento`);await p.getByRole('link',{name:'Próxima página'}).click();await p.getByText('Página 2 de 2',{exact:true}).waitFor();assert.equal(await p.locator('#painel-linhas tr').count(),1);await p.reload();await p.getByText('Página 2 de 2',{exact:true}).waitFor();assert.equal(await p.locator('#painel-linhas tr').count(),1);await p.getByRole('button',{name:'Ajuda desta tela'}).click();await p.getByRole('heading',{name:'Confira e acompanhe os registros'}).waitFor();
 }finally{await N.fechar();}
});

test('QA profundo UX: conflito real entre abas conserva preenchimento e impede sobrescrever correção',async()=>{
 const N=await subirComNavegador();try{
  const {q,a,m}=await fixture(N),b=`/api/quick-wins/${q.id}/painel`,d=(await a.post(`${b}/preparar`,{mensagem:m})).dados;
  const dados=[{fornecedor:'Fornecedor Exemplo',documento:'Certidão',situacao:'pendente',pendencia:'Documento vencido'}];
  await a.post(`${b}/registros/${d.id}`,{dados,versao:d.versao,escopo:'pessoal',confirmado:true,cienteParcial:true});
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.setViewportSize({width:390,height:900});await p.goto(`${N.base}/app#/qw/${q.id}/acompanhamento/registro/${d.id}`);
  await p.getByRole('heading',{name:'Corrigir um registro'}).waitFor();
  await p.getByLabel('Fornecedor *',{exact:true}).fill('Edição na tela');await p.getByLabel('Por que está corrigindo?').fill('Correção da tela');
  const atual=(await a.get(`${b}/registros/${d.id}`)).dados;
  assert.equal((await a.post(`${b}/registros/${d.id}`,{dados:[{...dados[0],fornecedor:'Correção salva em outra aba'}],versao:atual.versao,escopo:'pessoal',confirmado:true,cienteParcial:true,motivo:'Outra aba'})).status,200);
  await p.getByLabel('Conferi as limitações do resultado parcial e os dados que quero registrar').check();await p.getByLabel('Conferi os dados. Eles podem ser usados nos indicadores deste acompanhamento.').check();
  await p.getByRole('button',{name:'Salvar correção'}).click();await p.locator('#registro-erro').getByText(/Este registro mudou/).waitFor();
  assert.equal(await p.getByLabel('Fornecedor *',{exact:true}).inputValue(),'Edição na tela');assert.equal(await p.getByRole('button',{name:'Salvar correção'}).isEnabled(),true);
  assert.equal((await a.get(b)).dados.registros[0].dados[0].fornecedor,'Correção salva em outra aba');
 }finally{await N.fechar();}
});
test('QA profundo UX: acrescentar e remover itens conserva dados, foco e confirmação humana',async()=>{
 const N=await subirComNavegador();try{
  const {q,a,c,m}=await fixture(N),p=await N.entrar('admin@empresa-exemplo.com.br');await p.setViewportSize({width:320,height:900});
  await p.goto(`${N.base}/app#/c/${c}`);await p.getByRole('link',{name:'Conferir dados para o acompanhamento'}).click();await p.getByRole('heading',{name:'Confira antes de registrar'}).waitFor();
  await p.getByLabel('Fornecedor *',{exact:true}).fill('Primeiro item');await p.getByLabel('Documento *',{exact:true}).fill('Certidão');
  await p.getByRole('button',{name:'Adicionar um item'}).click();assert.equal(await p.locator('[data-item="1"][data-campo="fornecedor"]').evaluate(e=>e===document.activeElement),true);
  await p.locator('[data-item="1"][data-campo="fornecedor"]').fill('Segundo item');await p.locator('[data-item="1"][data-campo="documento"]').fill('Contrato');
  await p.getByRole('button',{name:'Remover este item'}).last().click();assert.equal(await p.getByLabel('Fornecedor *',{exact:true}).inputValue(),'Primeiro item');assert.equal(await p.locator('.painel-item').count(),1);
  assert.equal((await a.get(`/api/quick-wins/${q.id}/painel`)).dados.total,0);assert.equal(await p.getByRole('radio',{name:'Só eu',exact:true}).isChecked(),true);
  assert.equal(await p.getByLabel('Conferi os dados. Eles podem ser usados nos indicadores deste acompanhamento.').isChecked(),false);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await N.fechar();}
});
test('QA profundo UX: busca local conserva indicadores e explica contratação da integração contínua',async()=>{
 const N=await subirComNavegador();try{
  const {q,a,m}=await fixture(N),b=`/api/quick-wins/${q.id}/painel`,d=(await a.post(`${b}/preparar`,{mensagem:m})).dados;
  await a.post(`${b}/registros/${d.id}`,{dados:[{fornecedor:'Fornecedor Exemplo',documento:'Certidão',situacao:'pendente',pendencia:'Documento vencido'}],versao:d.versao,escopo:'pessoal',confirmado:true,cienteParcial:true});
  const p=await N.entrar('admin@empresa-exemplo.com.br');await p.goto(`${N.base}/app#/qw/${q.id}/acompanhamento`);await p.getByRole('heading',{name:'Registros confirmados'}).waitFor();
  const antes=await p.getByRole('region',{name:'Indicadores do acompanhamento'}).innerText();await p.getByLabel('Encontrar um registro nesta página').fill('Nenhuma correspondência');
  assert.equal(await p.locator('#painel-linhas tr:visible').count(),0);assert.equal(await p.getByRole('region',{name:'Indicadores do acompanhamento'}).innerText(),antes);
  await p.getByText('O que este acompanhamento inclui',{exact:true}).click();await p.getByText(/atualização por sistemas externos e painéis personalizados dependem de contratação adicional/).waitFor();
  await p.getByLabel('Encontrar um registro nesta página').fill('');assert.equal(await p.locator('#painel-linhas tr:visible').count(),1);
 }finally{await N.fechar();}
});
