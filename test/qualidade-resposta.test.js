import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSOES_RESPOSTA, CASOS_QUALIDADE, trechosDaAvaliacao, verificarRespostaQualitativa, lerJulgamentoQualidade, qualidadeSuficiente, avaliarQualidadeNoServidor } from '../src/qualidade-resposta.js';

const julgar = (t, n = 4) => ({ notas: Object.fromEntries(DIMENSOES_RESPOSTA.map(d => [d, n])), justificativa: 'A resposta atende aos fatos e ao formato pedidos.', evidencias: [t.slice(0, 20)] });
test('qualidade não é inferida de tamanho, presença de palavras ou HTTP concluído', () => {
  const caso = CASOS_QUALIDADE[0];
  const t = 'Marina e Bruno. 28/10 e 30/10. Temos economia garantida e redução de 25% no prazo.';
  assert.ok(verificarRespostaQualitativa(caso, t).some(f => f.startsWith('afirmacao_incorreta:')));
  assert.deepEqual(verificarRespostaQualitativa({ proibidos: ['economia garantida', 'certificada'] }, 'Não há economia garantida e a empresa não está certificada.'), []);
  assert.deepEqual(verificarRespostaQualitativa({ obrigatorios: ['email'] }, 'Pedidos por e-mail.'), []);
  const r = julgar(t, 2);
  assert.equal(qualidadeSuficiente(r), false, 'texto parcialmente útil ainda reprova');
  r.notas.correcao = 4; r.notas.escrita = 4;
  assert.equal(qualidadeSuficiente(r), false, 'notas altas em duas dimensões não compensam falhas nas outras');
});
test('avaliação sem citações reais, notas válidas e justificativa específica é recusada', () => {
  const respostas = { A: 'Texto coerente com as fontes e pronto para uso.', B: 'Outro texto coerente com dados corretos.' };
  const j = { A: julgar(respostas.A), B: julgar(respostas.B) };
  assert.ok(lerJulgamentoQualidade(JSON.stringify(j), respostas));
  assert.equal(lerJulgamentoQualidade('Muito bom, aprovado!', respostas), null);
  j.A.evidencias = ['Citação inventada que não existe no resultado'];
  assert.equal(lerJulgamentoQualidade(JSON.stringify(j), respostas), null);
  j.A = julgar(respostas.A); j.B.notas.correcao = 5;
  assert.equal(lerJulgamentoQualidade(JSON.stringify(j), respostas), null);
});
test('coletor compara com mesmo contexto, oculta identidades e exige controle negativo reprovado', async () => {
  const respostas = [
    'Das 80 solicitações, 20 retornam: 25%. O prazo de aprovação não foi medido. Bruno prepara o formulário até 28/10; Marina escolhe substituto até 30/10. O sistema atual permanece.',
    'Em 6 meses, A e B custam 840 cada. A passa a ser mais barata acima de 6 meses; antes disso B custa menos.',
    'Equipe, há divergência: o comunicado indica 9h e a ata registra 10h. Precisamos confirmar qual horário vale antes de agendar.',
    'Identificamos 22 pedidos, dos quais três estão sem responsável. Se os dados tivessem sido confirmados ontem, teríamos conseguido concluir hoje. O prazo de entrega não foi confirmado. Os responsáveis devem ser definidos até 26/10/2026.',
    'Unificar os pedidos de email e WhatsApp significa colocá-los na mesma fila. Cada área continua decidindo o que lhe cabe; não é preciso concentrar todas as aprovações em uma pessoa.',
    'A Horizonte organiza a passagem dos pedidos entre áreas, com responsáveis e evidências. O Boreal confere as informações.\n\nO Farol registra aprovações e ajuda a acompanhar os encaminhamentos.',
  ];
  const modelos = new Map(['anthropic/claude-haiku-4.5', 'openai/gpt-5.4-mini', 'google/gemini-3.8-flash'].map(id => [id, {}]));
  const recibos = [], logs = []; let indice = -1, entrada;
  const registrar = modelo => recibos.push({ geracao: 'fixture-' + recibos.length, modelo, custoConfirmado: true });
  const app = { db: { prepare: () => ({ all: () => [...modelos.keys()].map(id => ({ id })) }) } };
  const api = async (_, caminho, corpo) => {
    if (caminho === '/api/conversas') { indice++; return { json: async () => ({ conversa: { id: indice + 1 } }) }; }
    entrada = { mensagens: [{ role: 'system', content: 'Instruções iguais para as duas respostas.' }, { role: 'user', content: corpo.texto }] };
    registrar('anthropic/claude-haiku-4.5');
    return { text: async () => [{ t: 'texto', v: respostas[indice] }, { t: 'fim' }].map(e => JSON.stringify(e)).join('\n') };
  };
  const ia = { async *enviar(mensagens, op) {
    registrar(op.modelo);
    if (mensagens[0].content.startsWith('Você avalia')) {
      const d = JSON.parse(mensagens[1].content);
      assert.ok(!JSON.stringify(d).includes('anthropic/'));
      const A = julgar(d.respostas.A, d.respostas.A.startsWith('A empresa está perdendo milhões') ? 1 : 4), B = julgar(d.respostas.B);
      A.evidencias = [d.trechos.A[0].id]; B.evidencias = [d.trechos.B[0].id];
      yield { tipo: 'texto', texto: JSON.stringify({ A, B }) };
    } else {
      assert.deepEqual(mensagens, entrada.mensagens);
      yield { tipo: 'texto', texto: respostas[indice] };
    }
  } };
  const r = await avaliarQualidadeNoServidor({ app, api, ia, modelos, ultimaEntrada: () => entrada, recibos, log: (...v) => logs.push(v) });
  assert.equal(r.casos, 6); assert.equal(r.aprovados, 6); assert.deepEqual(r.falhas, []);
  const casos = logs.filter(l => l[0] === 'GREENIA_QUALIDADE_RESPOSTA_CASO').map(l => JSON.parse(l[1]));
  assert.equal(casos[0].controleNegativo, true);
  assert.deepEqual(casos.map(c => c.chaveCandidato), ['A', 'B', 'A', 'B', 'A', 'B']);
});

test('IDs resolvem somente citações reais da resposta correspondente, sem tolerar evidência inventada', () => {
  const respostas = { A: 'A afirmação precisa vem desta fonte.', B: 'Outro texto com dados verificáveis.' }, trechos = trechosDaAvaliacao(respostas);
  const j = { A: { ...julgar(respostas.A), evidencias: ['A1'] }, B: { ...julgar(respostas.B), evidencias: ['B1'] } };
  assert.equal(lerJulgamentoQualidade(JSON.stringify(j), respostas, trechos).A.evidencias[0], respostas.A);
  j.A.evidencias = ['B1']; assert.equal(lerJulgamentoQualidade(JSON.stringify(j), respostas, trechos), null);
  j.A.evidencias = ['A999']; assert.equal(lerJulgamentoQualidade(JSON.stringify(j), respostas, trechos), null);
});

test('variação de agrupamento no JSON não altera notas nem cria evidências', () => {
  const respostas = { A: 'Dado verificável da resposta A.', B: 'Dado verificável da resposta B.' }, trechos = trechosDaAvaliacao(respostas);
  const plano = { A: { ...julgar(respostas.A).notas, justificativa: 'Justificativa específica do resultado A.', evidencias: 'A1' }, B: { ...julgar(respostas.B, 1).notas, justificativa: 'Justificativa específica do resultado B.', evidencias: 'B1' } };
  const j = lerJulgamentoQualidade(JSON.stringify(plano), respostas, trechos);
  assert.equal(qualidadeSuficiente(j.A), true); assert.equal(qualidadeSuficiente(j.B), false);
  plano.A.correcao = 5; assert.equal(lerJulgamentoQualidade(JSON.stringify(plano), respostas, trechos), null);
});
