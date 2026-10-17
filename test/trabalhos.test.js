import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trabalhoDoPedido} from '../public/trabalhos.js';
test('explica as etapas reais sem copiar nomes ou conteúdo privado',()=>{
 const a=trabalhoDoPedido({texto:'Compare propostas de Cliente Sigiloso Alfa, confira divergências e prepare um relatório',anexos:[{nome:'Segredo.pdf'},{nome:'Outro.pdf'}]});
 assert.match(a.justificativa,/analisar 2 arquivos/);assert.match(a.justificativa,/comparar informações/);assert.match(a.justificativa,/documento/);
 assert.doesNotMatch(JSON.stringify(a),/Cliente Sigiloso|Segredo|Outro|qualidade|premium|resposta melhor/i);
 const b=trabalhoDoPedido({texto:'Monte uma apresentação PPTX com seis slides'});
 assert.match(b.justificativa,/apresentação em slides/);assert.notEqual(a.justificativa,b.justificativa);
 assert.doesNotMatch(JSON.stringify(b),/600 palavras/);assert.match(b.alternativa.descricao,/sequência e os principais tópicos/);assert.match(b.alternativa.limites,/PowerPoint depende da liberação/);
 const c=trabalhoDoPedido({texto:'Crie uma planilha de projeções e confira fórmulas'});
 assert.match(c.justificativa,/cálculos/);assert.match(c.alternativa.limites,/Não inclui gerar a planilha/);
});
test('volume extenso e número real de arquivos entram sem fixar tipo em um nível',()=>{
 const d=trabalhoDoPedido({texto:'Resuma meu texto',anexos:[]},{janelaMinima:50000});
 assert.match(d.justificativa,/volume extenso/);assert.doesNotMatch(d.justificativa,/\d+ arquivos/);
 // O descritor não concede permissão nem seleciona modelo. Só explica uma decisão já tomada pelo servidor.
 assert.equal(d.modelo,undefined);assert.equal(d.autorizacao,undefined);
});
