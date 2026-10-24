import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizarTabelas,extrairTabelas} from '../public/tabelas.js';
import {subir} from './ajuda.js';
import {openRouterFalso,enviarMensagem} from './openrouter-falso.js';
import {salvarConfig} from '../src/config.js';
import {deszipar} from './zip-leitor.js';
import {extrairTexto} from '../src/texto.js';
import {arquivo} from './arquivos.js';
const tabela=`#### Tarefas
| Tarefa | Responsável | Status | Prazo |
| Revisar cadastro | Ana | Pendente | 26/10/2026 |
| Conferir relatório | Bruno | Em andamento | 27/10/2026 |
| Apresentar resultado | Carla | Concluído | 28/10/2026 |`;
test('normalizar apenas sintaxe de tabela não muda valores, código ou tabela válida',()=>{
 const normal=normalizarTabelas(tabela);
 assert.equal(extrairTabelas(normal)[0].length,4);
 assert.equal(normalizarTabelas(normal),normal);
 const codigo='```text\n'+tabela+'\n```';assert.equal(normalizarTabelas(codigo),codigo);
 const irregular='| A | B |\n| 1 | 2 | 3 |';assert.equal(normalizarTabelas(irregular),irregular);
});
test('XLSX pedido é materializado antes do fim, baixável só pelo dono e mantém aba, linhas e dados',async()=>{
 const OR=await openRouterFalso({responder:()=>tabela+'\n\n### O que foi feito\nO arquivo para download está disponível logo abaixo desta resposta.'});
 const s=await subir({ia:OR.ia});try{
  salvarConfig(s.app.db,{dominios:['exemplo.com.br']});
  const ana=await s.cliente().entrar('ana@exemplo.com.br'),bia=await s.cliente().entrar('bia@exemplo.com.br');
  const id=(await ana.post('/api/conversas',{})).dados.conversa.id;
  const r=await enviarMensagem(ana,id,{texto:'Gere um arquivo XLSX com uma aba Tarefas, três tarefas, responsáveis, status e prazos.',modelo:'classe:rapido'});
  assert.equal(r.status,200,JSON.stringify(r));assert.ok(!r.falha,JSON.stringify(r));
  const a=r.fim.arquivos.find(a=>a.formato==='xlsx');assert.ok(a);assert.ok(a.bytes>1000);assert.equal(a.tipo,'documento');
  const url=s.base+`/api/conversas/${id}/arquivos/${a.id}`;
  assert.equal((await fetch(url,{headers:{cookie:bia.cookie}})).status,404);
  const d=await fetch(url,{headers:{cookie:ana.cookie}});assert.equal(d.status,200);assert.match(d.headers.get('content-type'),/spreadsheetml/);
  const buf=Buffer.from(await d.arrayBuffer()),z=deszipar(buf);assert.match(z.get('xl/workbook.xml'),/name="Tarefas"/);
  const {texto:leitura}=await extrairTexto(arquivo('tarefas.xlsx',buf));for(const data of ['26/10/2026','27/10/2026','28/10/2026'])assert.ok(leitura.includes(data),data);
  const sheet=z.get('xl/worksheets/sheet1.xml');assert.equal([...sheet.matchAll(/<row /g)].length,4);
  for(const v of ['Tarefa','Responsável','Status','Prazo','Revisar cadastro','Ana','Conferir relatório','Bruno','Apresentar resultado','Carla'])assert.ok(sheet.includes(v),v);
  assert.doesNotMatch(sheet,/<f>/);assert.ok(![...z.keys()].some(n=>/charts\//.test(n)));
  const reopened=await ana.get(`/api/conversas/${id}`);assert.equal(reopened.dados.mensagens.at(-1).arquivos[0].id,a.id);
  OR.responder=()=> 'O arquivo para download está disponível logo abaixo desta resposta.\n\nEste texto não contém uma tabela válida para produzir a planilha solicitada.';
  const outra=(await ana.post('/api/conversas',{})).dados.conversa.id;
  const falha=await enviarMensagem(ana,outra,{texto:'Gere um arquivo XLSX com tarefas.',modelo:'classe:rapido'});
  assert.ok(!falha.falha,JSON.stringify(falha));assert.ok(!falha.fim.arquivos?.length);
  const final=falha.eventos.filter(e=>e.t==='substituir').at(-1).v;
  assert.match(final,/O arquivo XLSX não foi gerado/);assert.doesNotMatch(final,/disponível logo abaixo/);
 }finally{await s.fechar();await OR.fechar();}
});
