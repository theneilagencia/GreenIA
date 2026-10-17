import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subir} from './ajuda.js';
import {openRouterFalso,enviarMensagem} from './openrouter-falso.js';
import {um} from '../src/db.js';
import {construir,escolhaHumanaPrevista,promptExecucao,MARCADOR_PERGUNTA} from '../src/quickwin-construtor.js';

const processo='Primeiro sugira temas relacionados ao assunto enviado. Espere minha escolha antes de escrever o artigo.';
const ensino={nome:'Pautas de QA',descricao:'Criar um artigo com base no assunto enviado.',como:{modo:'explicar',texto:processo},formato:'outro',formato_descricao:'Texto do artigo',operacao:{v:2,origem:'pessoa',entregaveis:[{id:'e1',tipo:'texto',rotulo:'Artigo'}],etapas:[{texto:processo}],ferramentas:[]}};
test('decisão explicitamente configurada tem precedência; preferência comum continua automática',()=>{
 const e=construir(ensino);
 assert.equal(escolhaHumanaPrevista(e),true);
 assert.match(promptExecucao(e),/Decisão humana prevista.*apresente somente a etapa anterior e pare.*Não produza as etapas seguintes/s);
 assert.equal(escolhaHumanaPrevista({procedimento:['Escolha o tema mais relevante e escreva.']}),false);
 assert.equal(escolhaHumanaPrevista({procedimento:['Não espere minha escolha antes de escrever.']}),false);
 for (const texto of ['Sugira os temas e aguarde eu escolher antes de escrever.', 'Escreva somente depois que eu escolher um tema.', 'Mostre as opções. Aguarde a decisão do usuário.', 'Espere minha seleção para produzir o artigo.', 'Após a pessoa confirmar, escreva o artigo.']) {
  assert.equal(escolhaHumanaPrevista(construir({...ensino,como:{modo:'explicar',texto},operacao:{...ensino.operacao,etapas:[{texto}]}})),true,texto);
 }
 for (const texto of ['Escolha o melhor tema com base no material e escreva.', 'Não aguarde eu escolher. Faça o artigo.', 'Sem esperar minha seleção, escreva.']) {
  assert.equal(escolhaHumanaPrevista({procedimento:[texto]}),false,texto);
 }
});
test('execução aguarda escolha sem reavaliação automática; recarga preserva estado e resposta continua execução',async()=>{
 const O=await openRouterFalso({responder:b=>{
  const s=String(b.messages[0].content);
  if(s.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if(s.includes('Você refina Quick Wins')) return JSON.stringify({sugestoes:[{campo:'processo',depois:processo,motivo:'A pessoa quer escolher antes da redação.'}]});
  const escolha=b.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes('Escolho o tema 2'));
  if(escolha){assert.match(s,/ETAPA DE ENTREGA/);assert.doesNotMatch(s,/ETAPA ATUAL CONFIRMADA/);}
  return escolha?'## Artigo\nArtigo sobre reduzir trabalho repetitivo, segundo o material enviado.':`${MARCADOR_PERGUNTA}\n1. Reduzir tarefas manuais\n2. Conferir resultados\n3. Organizar informações\nQual tema você escolhe?`;
 }});
 const S=await subir({ia:O.ia});try{
 const a=await S.cliente().entrar('admin@exemplo.com.br');
 await a.put('/api/admin/modelos/mistralai%2Fmistral-small',{liberado:true,perfil:'rapido'});
 const q=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
 const c=(await a.post('/api/conversas',{quick_win_id:q.id,teste:true})).dados.conversa;
 const inicio=O.chamadas.length;
 await enviarMensagem(a,c.id,{texto:'Assunto de QA: redução de trabalho manual.',executar_quick_win:true});
 const d=(await a.get(`/api/conversas/${c.id}`)).dados;
 assert.equal(d.mensagens.at(-1).qualidade.status,'pergunta');
 assert.doesNotMatch(d.mensagens.at(-1).texto,/## Artigo/);
 assert.equal(O.chamadas.length-inicio,1,'não escolhe por ela em outra chamada');
 await enviarMensagem(a,c.id,{texto:'Escolho o tema 2: conferir resultados.'});
 const final=(await a.get(`/api/conversas/${c.id}`)).dados;
 assert.notEqual(final.mensagens.at(-1).qualidade.status,'pergunta');
 assert.match(final.mensagens.at(-1).texto,/Artigo/);
 assert.equal(JSON.parse(um(S.app.db,'select qualidade from roteamento where conversa_id=? and resposta_id is not null order by id desc limit 1',c.id).qualidade).escolha_informada,true);
 const novo=(await a.post('/api/conversas',{quick_win_id:q.id,teste:true})).dados.conversa;
 await enviarMensagem(a,novo.id,{repetir_conversa_id:c.id});
 const repetido=(await a.get(`/api/conversas/${novo.id}`)).dados;
 assert.notEqual(repetido.mensagens.at(-1).qualidade.status,'pergunta');
 assert.equal(JSON.parse(um(S.app.db,'select qualidade from roteamento where conversa_id=? and resposta_id is not null order by id desc limit 1',novo.id).qualidade).escolha_informada,true);
 assert.match(repetido.mensagens.at(-1).texto,/Artigo/);
 }finally{await S.fechar();await O.fechar();}
});

test('se o modelo ignora a escolha, não entrega artigo nem executa próxima etapa; tentativa permanece pendente',async()=>{
 const O=await openRouterFalso({responder:()=> '## Artigo\nArtigo que não deveria ser entregue antes da escolha.'});
 const S=await subir({ia:O.ia});try{
 const a=await S.cliente().entrar('admin@exemplo.com.br');
 await a.put('/api/admin/modelos/mistralai%2Fmistral-small',{liberado:true,perfil:'rapido'});
 const q=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
 const c=(await a.post('/api/conversas',{quick_win_id:q.id,teste:true})).dados.conversa;
 for(const texto of ['Assunto: reduzir trabalho manual.','Sugira as opções para eu escolher']){
  await enviarMensagem(a,c.id,{texto});
  const d=(await a.get(`/api/conversas/${c.id}`)).dados;
  assert.equal(d.mensagens.at(-1).qualidade.status,'pergunta');
  assert.doesNotMatch(d.mensagens.at(-1).texto,/Artigo que não deveria/);
  assert.match(d.mensagens.at(-1).texto,/etapa seguinte não foi realizada/);
 }
 assert.equal(O.chamadas.length,4,'uma recuperação automática por envio, sem ciclo ilimitado');
 }finally{await S.fechar();await O.fechar();}
});

test('plataforma explicita etapa atual e recupera opções uma vez; custo inclui tentativa descartada e escolha retoma',async()=>{
 let geracoes=0;
 const O=await openRouterFalso({responder:b=>{
  const s=String(b.messages[0].content);
  if(s.includes('conferente de qualidade'))return '{"criterios":[],"objetivo_atingido":true}';
  if(b.messages.some(m=>m.role==='user'&&String(m.content).includes('Escolho o tema 2'))) {
   assert.doesNotMatch(s,/ETAPA ATUAL CONFIRMADA/);
   return '## Artigo\nArtigo sobre conferir tarefas, segundo o material enviado.';
  }
  assert.match(s,/ETAPA ATUAL CONFIRMADA.*SOMENTE as opções.*nem tente atender agora ao formato da entrega final/s);
  return ++geracoes===1?'## Artigo\nEntrega antecipada que não deve aparecer.':`${MARCADOR_PERGUNTA}\n1. Organizar documentos\n2. Conferir tarefas\nQual tema você escolhe?`;
 }});
 const S=await subir({ia:O.ia});try{
  const a=await S.cliente().entrar('admin@exemplo.com.br');
  await a.put('/api/admin/modelos/mistralai%2Fmistral-small',{liberado:true,perfil:'rapido'});
  const q=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
  const c=(await a.post('/api/conversas',{quick_win_id:q.id,teste:true})).dados.conversa;
  const r=await enviarMensagem(a,c.id,{texto:'Assunto: conferir tarefas administrativas.',executar_quick_win:true});
  assert.equal(geracoes,2);
  assert.equal(r.fim.qualidade.status,'pergunta');
  assert.equal(um(S.app.db,'select custo_real from roteamento where conversa_id=? order by id desc limit 1',c.id).custo_real,0.00246);
  assert.doesNotMatch(r.texto,/Entrega antecipada/);
  assert.match(r.texto,/Conferir tarefas/);
  assert.equal(O.chamadas[0].model,O.chamadas[1].model,'mesma rota autorizada');
  assert.deepEqual(O.chamadas[0].provider,O.chamadas[1].provider,'mesmas regras de fornecedor');
  assert.equal(O.chamadas.some(x=>x.plugins?.some(p=>p.id==='web')),false);
  await enviarMensagem(a,c.id,{texto:'Escolho o tema 2: conferir tarefas.'});
  const d=(await a.get(`/api/conversas/${c.id}`)).dados;
  assert.notEqual(d.mensagens.at(-1).qualidade.status,'pergunta');
  assert.match(d.mensagens.at(-1).texto,/Artigo/);
 }finally{await S.fechar();await O.fechar();}
});

test('falha do provedor na recuperação conserva a espera e o custo da primeira chamada, sem nova rota',async()=>{
 const O=await openRouterFalso({responder:()=> '## Artigo\nEntrega antecipada que não deve aparecer.'});
 let chamadas=0;
 const ia={...O.ia,async *enviar(...args){if(++chamadas===2)throw new Error('Falha fictícia na recuperação');yield* O.ia.enviar(...args);}};
 const S=await subir({ia});try{
  const a=await S.cliente().entrar('admin@exemplo.com.br');
  await a.put('/api/admin/modelos/mistralai%2Fmistral-small',{liberado:true,perfil:'rapido'});
  const q=(await a.post('/api/quick-wins',{assistente:ensino,toda_empresa:true})).dados;
  const c=(await a.post('/api/conversas',{quick_win_id:q.id,teste:true})).dados.conversa;
  const r=await enviarMensagem(a,c.id,{texto:'Assunto: conferir tarefas.',executar_quick_win:true});
  assert.equal(chamadas,2);
  assert.equal(r.fim.qualidade.status,'pergunta');
  assert.doesNotMatch(r.texto,/Entrega antecipada/);
  assert.match(r.texto,/etapa seguinte não foi realizada/);
  assert.equal(um(S.app.db,'select custo_real from roteamento where conversa_id=? order by id desc limit 1',c.id).custo_real,0.00123);
  assert.equal((await a.get(`/api/conversas/${c.id}`)).dados.mensagens.length,2);
 }finally{await S.fechar();await O.fechar();}
});
