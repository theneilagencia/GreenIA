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

test('somente divergências vale na conferência, inclusive para especificações anteriores', async () => {
  const C = await import('../src/quickwin-construtor.js');
  const e = C.construir({ descricao: 'Compare pedido e nota e aponte somente divergências comprovadas.', formato: 'tabela', formato_descricao: 'Somente uma tabela, com as colunas: Item | Campo | Pedido | Nota.', regras: ['nao_inventar'] });
  delete e.formato_saida.somente_divergencias;
  assert.match(C.promptQualidade(e), /pares de valores iguais não devem virar linhas/);
  const texto = '| Item | Campo | Pedido | Nota |\n|---|---|---|---|\n| Toner | Quantidade | 5 | 4 |';
  const v = C.lerVeredito(e, JSON.stringify({ criterios: [], objetivo_atingido: false, motivo_objetivo: 'Falta linha do preço do toner, igual em ambos.' }));
  assert.equal(v.achados.at(-1).id, 'objetivo_central');
  assert.match(C.mensagensRevisao({ espec: C.normalizar(e), entrada: 'Toner: pedido 5 a 100; nota 4 a 100.', resultado: texto, achados: v.achados })[0].content, /Recorte confirmado/);
  assert.equal(C.aplicarRevisao(v, JSON.stringify({ achados: [] }), texto).objetivo, false, 'omitir o achado não aprova');
  assert.equal(C.aplicarRevisao(v, JSON.stringify({ achados: [{ id: 'objetivo_central', confirmado: false }] }), texto).objetivo, false, 'sem prova não aprova');
  const revista = C.aplicarRevisao(v, JSON.stringify({ achados: [{ id: 'objetivo_central', confirmado: false, prova: 'O contrato pede apenas divergências; o preço igual não é uma linha devida.' }] }), texto);
  assert.equal(revista.objetivo, true);
  assert.deepEqual(revista.falhas, []);
  const mantida = C.aplicarRevisao(v, JSON.stringify({ achados: [{ id: 'objetivo_central', confirmado: true, trecho: '', prova: 'A entrada tem divergência real de preço que falta.' }] }), texto);
  assert.equal(mantida.objetivo, false);
  assert.deepEqual(mantida.falhas, [], 'limitação do objetivo continua parcial, não vira inconsistência');
});

test('fluxo de conferência revê falso parcial do objetivo e conserva limitações quando revisão falha', async () => {
  const C = await import('../src/quickwin-construtor.js');
  const e = C.construir({ descricao: 'Liste somente divergências de quantidade e preço.', formato: 'tabela', formato_descricao: 'Somente uma tabela, com as colunas: Item | Campo | Pedido | Nota.', regras: ['nao_inventar'] });
  const resposta = '| Item | Campo | Pedido | Nota |\n|---|---|---|---|\n| Toner | Quantidade | 5 | 4 |';
  const base = { espec: e, resposta, entrada: 'Toner: pedido 5 unidades a 100; nota 4 unidades a 100.', mensagens: [{ role: 'system', content: C.promptExecucao(e) }] };
  const chamar = revisao => async msgs => ({ texto: msgs[0].content.includes('revisor da conferência') ? revisao : JSON.stringify({ criterios: [], objetivo_atingido: false, motivo_objetivo: 'Faltou listar preço igual do toner.' }) });
  const rev = JSON.stringify({ achados: [{ id: 'objetivo_central', confirmado: false, prova: 'Preço igual não é divergência e não deve constar na tabela restrita.' }] });
  assert.equal((await C.conferirComCorrecao({ ...base, chamar: chamar(rev) })).registro.status, 'aprovado');
  assert.equal((await C.conferirComCorrecao({ ...base, chamar: chamar('falha técnica') })).registro.status, 'parcial');
});
