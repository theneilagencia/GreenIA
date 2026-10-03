// Regressões da bateria final em produção (QA profundo): pesquisa citada como material, duração entre datas como
// cálculo derivado, contagem de slides de peça visual conferida pela produção visual (não pelo texto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as OP from '../src/quickwin-operacao.js';
import { construir, lerVeredito, promptQualidade } from '../src/quickwin-construtor.js';

test('"se houver pesquisa de clima, use-a": pesquisa é material, não busca na internet', () => {
  for (const t of ['Sugira 5 ideias de ações de engajamento; se houver pesquisa de clima, use-a.', 'Resuma a pesquisa de satisfação do trimestre', 'Analise a pesquisa de opinião interna'])
    assert.equal(OP.pedePesquisaWeb(t), false, t);
  for (const t of ['Pesquise tendências de engajamento de equipes', 'Pesquise concorrentes do setor']) assert.equal(OP.pedePesquisaWeb(t), true, t);
});

test('conferente: duração entre datas do material e campo derivado não são invenção', () => {
  const espec = construir({ descricao: 'Monte o cronograma do projeto a partir das datas enviadas' });
  assert.match(promptQualidade(espec), /duração em dias ou semanas entre duas datas do material/);
  assert.match(promptQualidade(espec), /datas sem ano: o ano corrente/);
});

test('conferente: contagem de slides/páginas de peça visual vira observação; o mesmo critério sem peça visual reprova', () => {
  const veredito = '{"criterios":[{"id":"op_slides","ok":false,"motivo":"não está dividido em exatamente 5 slides"}]}';
  const comCriterio = e => ({ ...e, criterios_qualidade: [...e.criterios_qualidade, { id: 'op_slides', grupo: 'completo', texto: 'A apresentação contém exatamente 5 slides.' }] });
  const comVisual = comCriterio(construir({ descricao: 'Transforme o relatório em uma apresentação de 5 slides', operacao: { canais: [], ferramentas: [], entregaveis: [{ id: 'e1', tipo: 'apresentacao', visual: { tipo: 'presentation', paginas: 5 } }], origem: 'pessoa' } }));
  const r1 = lerVeredito(comVisual, veredito);
  assert.deepEqual(r1.falhas, []);
  assert.equal(r1.leves.length, 1);
  const semVisual = comCriterio(construir({ descricao: 'Escreva o roteiro de uma apresentação de 5 slides', operacao: { canais: [], ferramentas: [], entregaveis: [{ id: 'e1', tipo: 'texto', rotulo: 'Roteiro' }], origem: 'pessoa' } }));
  assert.deepEqual(lerVeredito(semVisual, veredito).falhas, ['completo']);
});
