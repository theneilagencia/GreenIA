import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subir} from './ajuda.js';
import {openRouterFalso,enviarMensagem} from './openrouter-falso.js';
import {salvarConfig} from '../src/config.js';
import {exec,um,todos} from '../src/db.js';
import {resumoResultados,conciliarResultados,sincronizarContas} from '../src/resultados.js';
const criterios={instrucoes:true,conteudo:true,download:true,abertura:true,estrutura:true,calculos:true,layout:true,referencias:true};
async function ambiente(){const OR=await openRouterFalso();let relogio=new Date('2026-10-01T00:00:00Z');const s=await subir({ia:OR.ia,agora:()=>relogio});salvarConfig(s.app.db,{dominios:['exemplo.com.br']});const admin=await s.cliente().entrar('admin@exemplo.com.br'),ana=await s.cliente().entrar('ana@exemplo.com.br'),bia=await s.cliente().entrar('bia@exemplo.com.br');exec(s.app.db,'update sessoes set expira=?',Date.parse('2027-01-01'));return {...s,OR,admin,ana,bia,hora:t=>relogio=new Date(t),async fechar(){await s.fechar();await OR.fechar();}};}
const pedido=async(s,c,corpo)=>{const id=c||(await s.ana.post('/api/conversas',{})).dados.conversa.id;const r=await enviarMensagem(s.ana,id,{texto:'Escreva um email para combinar a reunião.',modelo:'classe:rapido',...corpo});return {id,r};};
test('trabalho reúne envios e chamadas; conclusão exige evidência humana explícita; preferência não é retrabalho',async()=>{const s=await ambiente();try{
 const {id,r}=await pedido(s);assert.ok(r.fim,JSON.stringify(r));
 let d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.coorte.iniciados,1);assert.equal(d.coorte.concluidos,0);assert.equal(d.coorte.creditosPorConcluido,null);const tid=d.trabalhos[0].id;
 assert.equal((await s.ana.post(`/api/resultados/trabalhos/${tid}/verificar`,{criterios:{instrucoes:true}})).status,400);
 await pedido(s,id,{texto:'Troque o título',acompanhamento:'preferencia'});d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.coorte.iniciados,1);assert.equal(d.trabalhos[0].tentativas,2);assert.equal(d.atencao.correcoes,0);
 const v=await s.ana.post(`/api/resultados/trabalhos/${tid}/verificar`,{criterios});assert.equal(v.status,200,JSON.stringify(v));assert.equal(v.dados.estado,'concluido');assert.ok(v.dados.verificacoes.every(v=>v.categoria==='humana'));
 d=(await s.ana.get('/api/resultados')).dados;const total=um(s.app.db,'select sum(custo) n from uso').n/.01;assert.ok(Math.abs(d.coorte.creditosConsumidos-total)<.0001);assert.equal(d.coorte.concluidos,1);assert.equal(d.coorte.creditosPorConcluido,d.coorte.creditosConsumidos);
 await pedido(s,id);assert.equal((await s.ana.get('/api/resultados')).dados.coorte.iniciados,2);
}finally{await s.fechar();}});
test('isolamento pessoal, conteúdo privado, filtro por pessoa e exportação coerente',async()=>{const s=await ambiente();try{
 const {id}=await pedido(s,null,{texto:'Escreva um email com CLIENTE-SIGILOSO-ZXY'});const d=(await s.ana.get('/api/resultados')).dados,tid=d.trabalhos[0].id;
 assert.equal((await s.bia.get('/api/resultados/trabalhos/'+tid)).status,404);assert.equal((await s.bia.get('/api/resultados?visao=empresa')).status,403);assert.equal((await s.bia.get('/api/resultados?pessoa='+s.ana.pessoa.id)).dados.coorte.iniciados,0);
 const a=(await s.admin.get('/api/resultados?visao=empresa&pessoa='+s.ana.pessoa.id)).dados;assert.equal(a.coorte.iniciados,1);assert.ok(!JSON.stringify(a).includes('CLIENTE-SIGILOSO'));
 const detalhe=(await s.admin.get('/api/resultados/trabalhos/'+tid)).dados;assert.equal(detalhe.continuar,undefined);assert.ok(!JSON.stringify(detalhe).includes('conversa_id'));
 assert.equal((await s.admin.post(`/api/resultados/trabalhos/${tid}/verificar`,{criterios})).status,404);
 const csv=await s.admin.get('/api/resultados.csv?visao=empresa&tipo=planilha');assert.equal(csv.status,200);assert.ok(!csv.dados.includes('CLIENTE-SIGILOSO'));assert.ok(!csv.dados.includes('US$'));assert.match(csv.dados,/0/);
 assert.equal((await s.ana.get('/api/resultados?estado=__proto__')).status,400);assert.equal((await s.ana.get('/api/resultados?desde=2026-02-30')).status,400);
}finally{await s.fechar();}});
test('coorte de início acumula consumo posterior sem misturar consumo ocorrido no período; histórico não vira conclusão',async()=>{const s=await ambiente();try{
 s.hora('2026-10-02T10:00:00Z');const {id}=await pedido(s);const antes=(await s.ana.get('/api/resultados')).dados.coorte.creditosConsumidos;
 s.hora('2026-11-02T10:00:00Z');await pedido(s,id,{acompanhamento:'correcao'});exec(s.app.db,'insert into uso(em,pessoa_id,custo) values (?,?,?)','2026-10-05T00:00:00Z',s.ana.pessoa.id,.2);
 const d=(await s.ana.get('/api/resultados?desde=2026-10-01&ate=2026-10-31')).dados;assert.equal(d.coorte.iniciados,1);assert.ok(d.coorte.creditosConsumidos>antes);assert.equal(d.coorte.concluidos,0);assert.equal(d.consumoPeriodo.semTrabalho,20);assert.ok(d.consumoPeriodo.creditos>d.coorte.creditosConsumidos);
 assert.equal(d.atencao.correcoes,1);assert.ok(d.metodologia.historico.includes('Não é convertido'));
}finally{await s.fechar();}});
test('ampliação e novo trabalho ficam separados; correção, preferência e classificação preservam consumo',async()=>{const s=await ambiente();try{
 const {id}=await pedido(s);await pedido(s,id,{acompanhamento:'escopo'});await pedido(s,id,{acompanhamento:'novo'});await pedido(s,id);let d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.coorte.iniciados,3);assert.equal(d.atencao.naoClassificados,1);const tid=d.trabalhos[0].id;const a=(await s.ana.get('/api/resultados/trabalhos/'+tid)).dados.tentativas.at(-1);
 const antes=d.coorte.creditosConsumidos;assert.equal((await s.ana.post(`/api/resultados/trabalhos/${tid}/classificar`,{tentativa:a.id,classe:'escopo'})).status,200);d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.coorte.iniciados,4);assert.equal(d.coorte.creditosConsumidos,antes);assert.equal(d.atencao.correcoes,0);
}finally{await s.fechar();}});
test('bloqueio anterior à chamada aguarda autorização; não é falha de entrega nem pessoa ativa',async()=>{const s=await ambiente();try{
 const {r}=await pedido(s,null,{texto:'Prepare uma apresentação executiva de altíssimo nível, complexa e com análise aprofundada.',modelo:'classe:avancado'});assert.equal(r.status,403);assert.equal(s.OR.chamadas.length,0);const d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.pessoas.ativos,0);assert.equal(d.atencao.falhas,0);assert.equal(d.atencao.bloqueios,1);assert.equal(d.trabalhos[0].estado,'aguardando_autorizacao');assert.equal(d.trabalhos[0].tentativas,0);
}finally{await s.fechar();}});
test('arquivo inexistente não pode ser verificado como entrega; persistência técnica não basta',async()=>{const s=await ambiente();try{
 const {id}=await pedido(s);const tid=(await s.ana.get('/api/resultados')).dados.trabalhos[0].id;exec(s.app.db,"update trabalhos set tipo='apresentacao' where id=?",tid);assert.equal((await s.ana.post(`/api/resultados/trabalhos/${tid}/verificar`,{criterios})).status,409);assert.equal((await s.ana.get('/api/resultados')).dados.coorte.concluidos,0);
}finally{await s.fechar();}});
test('clientes usam créditos mesmo sem plano; preços e valores financeiros não saem nas APIs, inclusive Advanced técnico',async()=>{const s=await ambiente();try{
 const eu=(await s.admin.get('/api/eu')).dados;assert.equal(eu.unidade,'creditos');await pedido(s);
 const gasto=um(s.app.db,'select sum(custo) n from uso').n;const uso=(await s.admin.get('/api/admin/uso?mes=2026-10')).dados;assert.ok(Math.abs(uso.totais.custo-gasto/.01)<.1);
 for(const url of ['/api/admin/modelos','/api/admin/advanced','/api/admin/config','/api/admin/eventos','/api/resultados']){const r=await s.admin.get(url);assert.equal(r.status,200,url);const text=JSON.stringify(r.dados);assert.doesNotMatch(text,/"(?:precoEntrada|precoSaida|preco_entrada|preco_saida|limite_usd|limiteMensalUsd|estimativa_usd|precoUsd|price_usd|custo_reportado|ai_credit_base_cost)"/,url);}
 assert.equal((await s.admin.get('/api/operador/resultados')).status,403);
 assert.equal((await s.admin.put('/api/admin/advanced/config',{limiteMensalCreditos:50})).status,200);assert.equal((await s.admin.get('/api/admin/advanced')).dados.config.limiteMensalCreditos,50);
}finally{await s.fechar();}});
test('contas técnicas e teste ficam fora da adoção; período sem histórico de habilitação não inventa denominador',async()=>{const s=await ambiente();try{
 sincronizarContas(s.app);s.hora('2026-10-02T00:00:00Z');await pedido(s);let d=(await s.admin.get('/api/resultados?visao=empresa')).dados;assert.equal(d.pessoas.ativos,1);assert.equal(d.pessoas.habilitados,3);assert.ok(Math.abs(d.pessoas.adocao-100/3)<.0001);
 assert.equal((await s.admin.put('/api/resultados/contas/'+s.ana.pessoa.id,{categoria:'teste'})).status,200);d=(await s.admin.get('/api/resultados?visao=empresa')).dados;assert.equal(d.pessoas.ativos,0);assert.equal(d.coorte.iniciados,0);
 d=(await s.admin.get('/api/resultados?visao=empresa&desde=2026-09-01')).dados;assert.equal(d.pessoas.habilitados,null);assert.equal(d.pessoas.adocao,null);
}finally{await s.fechar();}});
test('reconciliação pendente é durável e idempotente; inclui custo de falha sem duplicar',async()=>{const s=await ambiente();try{
 await pedido(s);const a=um(s.app.db,'select * from trabalho_tentativas order by id limit 1');exec(s.app.db,"insert into trabalho_chamadas(tentativa_id,em,modelo,geracao,estado) values (?,?,?,'gen-recuperar','pendente')",a.id,s.app.agora().toISOString(),'m');s.app.ia.custoDaGeracao=async()=>.12;
 const antes=um(s.app.db,'select sum(custo) n from uso').n;const x=await conciliarResultados(s.app);assert.equal(x.conciliadas,1);assert.equal((await conciliarResultados(s.app)).conciliadas,0);assert.ok(Math.abs(um(s.app.db,'select sum(custo) n from uso').n-antes-.12)<1e-9);
}finally{await s.fechar();}});
test('estorno confirmado altera saldo uma única vez e não apaga consumo real',async()=>{const s=await ambiente();try{
 s.app.plano={creditos:1000,reserva:0};await pedido(s);const t=um(s.app.db,'select * from trabalhos limit 1');exec(s.app.db,'update uso set custo=.1 where trabalho_id=?',t.id);s.app.operadores=['admin@exemplo.com.br'];
 const corpo={trabalho:t.id,creditos:2.5,referencia:'estorno-validado-QA-01'};assert.equal((await s.admin.post('/api/operador/resultados/estornos',corpo)).status,200);assert.equal((await s.admin.post('/api/operador/resultados/estornos',corpo)).dados.repetido,true);assert.equal(um(s.app.db,"select sum(creditos) n from pacotes where origem='estorno'").n,2.5);
 const d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.coorte.creditosConsumidos,10);assert.equal(d.coorte.creditosDebitados,10);assert.equal(d.coorte.creditosEstornados,2.5);assert.equal((await s.ana.post('/api/operador/resultados/estornos',corpo)).status,403);
 assert.equal((await s.admin.post('/api/operador/resultados/estornos',{...corpo,referencia:'excesso-estorno',creditos:8})).status,409);
}finally{await s.fechar();}});
test('tempo separa espera de processamento; amostra pequena não inventa percentis',async()=>{const s=await ambiente();try{
 const {id}=await pedido(s,null,{texto:'Faça uma apresentação de altíssimo nível com análise aprofundada.',modelo:'classe:avancado'});s.hora('2026-10-01T00:10:00Z');const tid=(await s.ana.get('/api/resultados')).dados.trabalhos[0].id;const d=(await s.ana.get('/api/resultados/trabalhos/'+tid)).dados;assert.equal(d.tempos.esperaAutorizacaoMs,600000);assert.equal(d.tempos.processamentoMs,0);assert.equal((await s.ana.get('/api/resultados')).dados.tempos.p90Ms,null);
}finally{await s.fechar();}});
test('XLSX real: evidência técnica tem hash e bytes; download e critérios de estrutura/cálculo são exigidos',async()=>{const s=await ambiente();try{
 s.OR.responder=()=>`| Item | Quantidade |\n|---|---|\n| A | 2 |\n| B | 3 |`;
 const {id,r}=await pedido(s,null,{texto:'Gere um arquivo XLSX com uma aba e os itens A=2 e B=3, sem fórmulas.'});assert.ok(r.fim,JSON.stringify(r));const a=r.fim.arquivos.find(a=>a.formato==='xlsx');assert.ok(a);
 const t=(await s.ana.get('/api/resultados')).dados.trabalhos[0];assert.equal(t.tipo,'planilha');assert.equal(t.estado,'pendente_verificacao');
 let d=(await s.ana.get('/api/resultados/trabalhos/'+t.id)).dados;const v=d.verificacoes.find(v=>v.criterio==='pacote_office_legivel');assert.equal(v.resultado,'passou');const evidencia=JSON.parse(v.evidencia);assert.equal(evidencia.arquivo,a.id);assert.equal(evidencia.bytes,a.bytes);assert.match(evidencia.sha256,/^[a-f\d]{64}$/);
 const dl=await s.ana.bin(`/api/conversas/${id}/arquivos/${a.id}`);assert.equal(dl.status,200);assert.equal(dl.dados.length,a.bytes);
 assert.equal((await s.ana.post(`/api/resultados/trabalhos/${t.id}/verificar`,{criterios:{instrucoes:true,conteudo:true}})).status,400);assert.equal((await s.ana.post(`/api/resultados/trabalhos/${t.id}/verificar`,{criterios})).status,200);
 d=(await s.ana.get('/api/resultados/trabalhos/'+t.id)).dados;assert.ok(d.verificacoes.some(v=>v.criterio==='download_http'));assert.equal(d.estado,'concluido');
}finally{await s.fechar();}});
test('custo reportado sem consolidação fica parcial e a recuperação não duplica cobrança',async()=>{const s=await ambiente();try{
 await pedido(s);const t=um(s.app.db,'select id from trabalhos limit 1');exec(s.app.db,'delete from uso where trabalho_id=?',t.id);let d=(await s.ana.get('/api/resultados')).dados;assert.ok(d.coorte.pendenciasConsumo>0);await conciliarResultados(s.app);d=(await s.ana.get('/api/resultados')).dados;assert.equal(d.coorte.pendenciasConsumo,0);assert.ok(d.coorte.creditosConsumidos>0);const c=d.coorte.creditosConsumidos;await conciliarResultados(s.app);assert.equal((await s.ana.get('/api/resultados')).dados.coorte.creditosConsumidos,c);
}finally{await s.fechar();}});
