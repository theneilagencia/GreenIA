import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oracoesDoPedido } from '../src/quickwin-interpretacao.js';
import { construir, conferirContrato, pedidoDeCorrecao } from '../src/quickwin-construtor.js';
import { contratoTabelaRefinamento, orientacaoContratoTabela } from '../public/qw-refinamento.js';
import { pontosDoResultado } from '../public/resultado-orientacao.js';
import { estadoQw } from '../public/qw-estado.js';

test('restrições negativas não criam entregáveis e preservam comandos afirmativos', () => {
  const r = oracoesDoPedido('Entregue somente divergências comprovadas sem inventar totais, impostos e prazos. Não entregue seções sobre impostos ou prazos.');
  assert.doesNotMatch(JSON.stringify(r), /Impostos|Prazos|Totais/i);
  assert.match(JSON.stringify(r), /divergências/i);
  assert.match(JSON.stringify(oracoesDoPedido('Liste as não conformidades.')), /conformidades/);
  assert.match(JSON.stringify(oracoesDoPedido('Liste riscos sem inventar prazos e entregue recomendações.')), /recomendações/);
});

test('feedback real substitui contrato antigo e rejeita seções extras sem remover segurança', () => {
  const contrato = contratoTabelaRefinamento('Quero somente a tabela com Item, Campo, Valor no Pedido e Valor na Nota, com as duas divergências comprovadas. Remova o texto repetindo a tabela.');
  assert.deepEqual(contrato, { exclusivo: true, colunas: ['Item','Campo','Valor no Pedido','Valor na Nota'] });
  const e = construir({ descricao: 'Compare pedido e nota.', formato: 'tabela', colunas: ['Item','Pedido','Nota','Divergência'], colunas_origem: 'pessoa', regras: ['nao_inventar','destacar_ausentes'], formato_descricao: orientacaoContratoTabela(contrato) });
  assert.deepEqual(e.formato_saida.colunas, contrato.colunas);
  assert.deepEqual(e.formato_saida.secoes, []);
  assert.ok(e.regras.includes('nao_inventar'));
  assert.ok(e.regras.includes('destacar_ausentes'));
  const tabela = '| Item | Campo | Valor no Pedido | Valor na Nota |\n|---|---|---|---|\n| Toner | Quantidade | 5 | 4 |';
  assert.deepEqual(conferirContrato(e, tabela).falhas, []);
  assert.ok(conferirContrato(e, tabela + '\n\n## Informações ausentes\nNenhuma.').falhas.includes('formato'));
  assert.match(pedidoDeCorrecao(['conteúdo extra'], e), /somente uma tabela/);
});

test('conferência manda retirar excessos e respeita grupo do critério de processo', () => {
  const detalhe = 'Há conteúdo fora da tabela combinada. Retire títulos, explicações e seções extras; entregue somente uma tabela.';
  const p = pontosDoResultado({ problemas: [detalhe], itens: [{ id: 'processo_confirmado', grupo: 'regras', conferido: true, ok: false, motivos: [detalhe] }] })[0];
  assert.match(p.fazer, /retirar o conteúdo extra/);
  assert.doesNotMatch(p.fazer, /completar|incluir/);
  const r = pontosDoResultado({ problemas: ['Uma orientação não foi seguida.'], itens: [{ id: 'processo_confirmado', grupo: 'regras', conferido: true, ok: false, motivos: ['Uma orientação não foi seguida.'] }] })[0];
  assert.equal(r.titulo, 'Uma orientação não foi seguida');
});

test('estados compartilhados distinguem teste, publicação, rascunho e arquivo', () => {
  assert.equal(estadoQw({ v2: true, status: 'rascunho', ultimo_teste: {} }).id, 'teste');
  assert.equal(estadoQw({ v2: true, status: 'rascunho' }).id, 'rascunho');
  assert.equal(estadoQw({ v2: true, status: 'em_teste', versao: 1 }).id, 'publicado');
  assert.equal(estadoQw({ v2: true, status: 'descartado', versao: 1 }).id, 'arquivado');
  assert.equal(estadoQw({ status: 'em_teste' }).id, 'teste');
});
