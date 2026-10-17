// Reestilo entre apresentações da mesma família (um kick-off no design de outro kick-off, com as mesmas seções): cada
// slide vai para a página equivalente do modelo, o pedido é aplicado no texto (renumerar, renomear, enriquecer com os
// documentos) e cada linha vai para o bloco correspondente. QA em produção: as páginas eram escolhidas pelo tipo e o
// texto encaixado pela ordem; slides saíam só com o título, com o conteúdo no lugar errado e sem o enriquecimento pedido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptarModelo, correspondenciaDaFonte, divisoriasRepetidas, encaixarPorCorrespondencia, paginasDoPlano, parecenca, planejarReestilo } from '../src/modelo-pdf.js';

const b = (id, texto, x, y, tam = 14) => ({ id, texto, x, y, largura: 200, tam, linhas: 1, entrelinha: tam * 1.2, fonte: 'Inter', cor: '#000000' });
const pg = blocos => ({ w: 1440, h: 810, blocos });
const MODELO = [
  pg([b('1.1', 'Kick-off Projeto / Empresa Modelo', 90, 300, 60), b('1.2', 'Financeiro · Fiscal', 90, 380), b('1.3', 'Documento de trabalho da gestão', 90, 600)]),
  pg([b('2.1', '01 · MENSAGEM CENTRAL', 90, 90, 18), b('2.2', 'O projeto entende como a operação funciona hoje', 90, 200, 48), b('2.3', 'Hoje', 90, 400), b('2.4', '→ Modelo futuro', 400, 400), b('2.5', 'Projeto · Empresa Modelo', 90, 756, 12), b('2.6', '02', 1330, 756, 12)]),
  pg([b('3.1', 'Como o trabalho acontece', 90, 400, 60)]),
  pg([b('4.1', '04 · MÉTODO DE TRABALHO', 90, 90, 18), b('4.2', 'Como o trabalho acontece', 90, 170, 48), b('4.3', '01', 90, 300), b('4.4', '02', 400, 300),
    b('4.5', 'Evidência', 90, 340), b('4.6', 'Conversa', 400, 340), b('4.7', 'Documentos, dados, relatórios e sistemas', 90, 380), b('4.8', 'Quem executa explica a operação', 400, 380), b('4.9', 'Projeto · Empresa Modelo', 90, 756, 12), b('4.10', '04', 1330, 756, 12)]),
  pg([b('5.1', '09 · ESCOPO', 90, 90, 18), b('5.2', 'O que não está no escopo', 90, 170, 48), b('5.3', 'Substituição de ERP', 90, 300), b('5.4', 'Parecer jurídico', 600, 300), b('5.5', 'Projeto · Empresa Modelo', 90, 756, 12), b('5.6', '05', 1330, 756, 12)]),
];
const FONTE = [
  '## Slide 1', '[a] Kick-off Projeto / Cliente Teste', '[b] Produção · Custeio', '[c] Documento de trabalho da gestão Cliente Teste',
  '## Slide 2', '[a] 06 · MENSAGEM CENTRAL', '[b] O projeto entende como a operação funciona hoje e organiza o que vem depois', '[c] Hoje', '[d] → Modelo futuro', '[e] Projeto · Cliente Teste',
  '## Slide 3', '[a] Como o trabalho acontece',
  '## Slide 4', '[a] 07 · MÉTODO DE TRABALHO', '[b] Como o trabalho acontece', '[c] 01', '[d] 02', '[e] Evidência · Documentos, dados, relatórios e sistemas', '[f] Conversa · Quem executa explica a', '[g] operação', '[h] Projeto · Cliente Teste', '[i] 10',
  '## Slide 5', '[a] 09 · ESCOPO', '[b] O que não está no escopo', '[c] Substituição do ERP Fictício', '[d] Parecer contábil', '[e] Projeto · Cliente Teste',
].join('\n');
const DOCS = 'Proposta: o diagnóstico usa o relatório de custos do ERP Fictício, as planilhas de apontamento e o plano de contas gerencial. Prazo de 30 dias corridos.';

test('parecença ignora espaços quebrados do PDF e reconhece símbolos iguais', () => {
  assert.equal(parecenca('MO BILIZAR', 'MOBILIZAR'), 1);
  assert.equal(parecenca('→', '→'), 1);
});

test('mesma família: cada slide da pessoa encontra a página equivalente do modelo', () => {
  const { familia, corresp } = correspondenciaDaFonte(MODELO, FONTE);
  assert.equal(familia, true);
  assert.deepEqual(corresp.map(c => c.k), [0, 1, 2, 3, 4]);
});

test('encaixe: rótulo e descrição numa linha vão para as duas caixas; frase quebrada volta inteira; números do layout não duplicam', () => {
  const { textos } = encaixarPorCorrespondencia(MODELO[3], ['04 · MÉTODO DE TRABALHO', 'Como o trabalho acontece', '01', '02', 'Evidência · Relatório de custos do ERP Fictício e planilhas de apontamento', 'Conversa · Quem executa explica a', 'operação', 'Projeto · Cliente Teste', '10']);
  assert.equal(textos['4.5'], 'Evidência');
  assert.equal(textos['4.7'], 'Relatório de custos do ERP Fictício e planilhas de apontamento');
  assert.equal(textos['4.6'], 'Conversa');
  assert.equal(textos['4.8'], 'Quem executa explica a operação');
  assert.equal(textos['4.9'], 'Projeto · Cliente Teste');
  assert.equal(textos['4.3'], undefined, 'número do passo fica o do layout');
  assert.ok(!Object.values(textos).some(t => /\b10\b/.test(t)), 'número de página da origem não entra em outro bloco');
});

test('mesma família: o pedido é aplicado (renumerar, enriquecer), número inventado sai, rodapé e página são renumerados', async () => {
  const pedido = 'design o mais próximo possível do PDF; evidências ficou amplo, use a proposta; os capítulos pulam do 7 pro 9';
  let pedidoVisto = '';
  const chamar = async msgs => {
    pedidoVisto = msgs.map(m => m.content).join('\n');
    return { texto: JSON.stringify({ slides: [
      { origem: 1, igual: true },
      { origem: 2, conteudo: '06 · MENSAGEM CENTRAL\nO projeto entende como a operação funciona hoje e organiza o que vem depois\nHoje\n→ Modelo futuro\nProjeto · Cliente Teste' },
      { origem: 3, conteudo: 'Como o trabalho acontece' },
      { origem: 4, conteudo: '07 · MÉTODO DE TRABALHO\nComo o trabalho acontece\nEvidência · Relatório de custos do ERP Fictício, planilhas de apontamento e plano de contas gerencial\nConversa · Quem executa explica a operação\nEconomia garantida de 4.500 horas por ano\nProjeto · Cliente Teste' },
      { origem: 5, conteudo: '08 · ESCOPO\nO que não está no escopo\nSubstituição do ERP Fictício\nParecer contábil\nProjeto · Cliente Teste' },
    ], mudancas: ['Capítulo de escopo renumerado de 09 para 08', 'Evidências detalhadas com os documentos da proposta'] }) };
  };
  const material = `${FONTE}\n${DOCS}\n${pedido}`;
  const pl = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido, contexto: DOCS, material, chamar });
  assert.match(pedidoVisto, /relatório de custos do ERP Fictício/, 'a IA recebe os documentos da conversa');
  assert.deepEqual(pl.slides.map(s => s.pagina), [0, 1, 2, 3, 4]);
  assert.match(pl.slides[3].conteudo, /plano de contas gerencial/, 'enriquecimento que vem da proposta fica');
  assert.doesNotMatch(pl.slides[3].conteudo, /4\.500/, 'número que nenhum documento tem sai');
  assert.match(pl.slides[4].conteudo, /^08 · ESCOPO/);
  assert.ok(pl.mudancas.some(m => /Slide 5: "09 · ESCOPO" → "08 · ESCOPO"/.test(m)), JSON.stringify(pl.mudancas));
  assert.ok(pl.mudancas.some(m => /"Evidência · Documentos, dados, relatórios e sistemas" → "Evidência · Relatório de custos/.test(m)));

  const paginas = paginasDoPlano(MODELO, pl.slides);
  assert.equal(paginas[4].blocos.find(x => x.texto === '05').texto, '05');
  const r = await adaptarModelo({ paginas, contexto: DOCS, pedido, conteudos: pl.slides.map(s => s.conteudo), chamar: async () => ({ texto: '{}' }) });
  const de = (k, n) => r.textos[`${k}.${n}`];
  assert.equal(de(5, 1), '08 · ESCOPO');
  assert.equal(de(5, 3), 'Substituição do ERP Fictício');
  assert.equal(de(5, 4), 'Parecer contábil');
  assert.equal(de(4, 5), 'Evidência');
  assert.match(de(4, 7), /plano de contas gerencial/);
  assert.equal(de(2, 5), 'Projeto · Cliente Teste');
});

test('mesma família sem resposta da IA: a apresentação vai como está, cada slide na sua página equivalente', async () => {
  const pl = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'design do PDF', chamar: async () => ({ texto: 'erro' }) });
  assert.deepEqual(pl.slides.map(s => s.pagina), [0, 1, 2, 3, 4]);
  assert.match(pl.slides[4].conteudo, /^09 · ESCOPO/);
});

test('número de página solto no rodapé passa a ser o do slide novo', () => {
  const p = paginasDoPlano(MODELO, [{ pagina: 4 }, { pagina: 1 }]);
  assert.equal(p[0].blocos.find(x => x.id === '1.6').texto, '01');
  assert.equal(p[1].blocos.find(x => x.id === '2.6').texto, '02');
});

test('trava: a IA não inverte o sentido de um slide nem o esvazia; a renumeração pedida fica', async () => {
  const chamar = async () => ({ texto: JSON.stringify({ slides: [
    { origem: 1, igual: true }, { origem: 2, igual: true }, { origem: 3, igual: true }, { origem: 4, igual: true },
    { origem: 5, conteudo: '08 · ESCOPO\nO que está no escopo\nDRE gerencial\nProjeto · Cliente Teste' },
  ] }) });
  const pl = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'os capítulos pulam do 7 pro 9', contexto: DOCS, material: `${FONTE}\n${DOCS}`, chamar });
  const ultimo = pl.slides[4].conteudo.split('\n');
  assert.equal(ultimo[0], '08 · ESCOPO');
  assert.equal(ultimo[1], 'O que não está no escopo');
  assert.ok(ultimo.includes('Parecer contábil'));
});

test('divisória com o mesmo nome do slide seguinte é apontada para a IA', () => {
  assert.match(divisoriasRepetidas(FONTE), /slide 3 \(divisória\) "Como o trabalho acontece"/);
  assert.doesNotMatch(divisoriasRepetidas(FONTE), /slide 1/);
});

test('trava: linha que some ou não confere volta; slide não repete o nome novo da divisória; capítulos renumerados', async () => {
  const chamar = async () => ({ texto: JSON.stringify({ slides: [
    { origem: 1, igual: true }, { origem: 2, igual: true },
    { origem: 3, conteudo: 'O jeito de trabalhar' },
    { origem: 4, conteudo: '07 · MÉTODO DE TRABALHO\nO jeito de trabalhar\n01\n02\nConversa · Quem executa explica a operação\nProjeto · Cliente Teste\n10' },
    { origem: 5, conteudo: 'O que não está no escopo\nSubstituição do ERP Fictício\nParecer contábil\nProjeto · Cliente Teste' },
  ] }) });
  const pl = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'os capítulos pulam do 7 pro 9; a divisória repete o slide seguinte', contexto: DOCS, material: `${FONTE}\n${DOCS}`, chamar });
  assert.equal(pl.slides[2].conteudo, 'O jeito de trabalhar');
  const metodo = pl.slides[3].conteudo.split('\n');
  assert.equal(metodo[1], 'Como o trabalho acontece', 'título do slide não repete a divisória');
  assert.ok(metodo.some(l => /^Evidência/.test(l)), 'linha que a IA deixou de fora volta');
  assert.match(pl.slides[4].conteudo, /^08 · ESCOPO/, 'rótulo volta, renumerado na sequência dos capítulos');
});

test('slide esquecido pela IA volta; bloco editado que a conferência tira volta ao texto original', async () => {
  const chamar = async msgs => {
    const sistema = msgs[0].content;
    if (/Você confere uma apresentação/.test(sistema)) return { texto: JSON.stringify({ remover: ['4.7'] }) };
    return { texto: JSON.stringify({ slides: [
      { origem: 1, igual: true }, { origem: 2, igual: true },
      { origem: 4, conteudo: '04 · MÉTODO DE TRABALHO\nComo o trabalho acontece\n01\n02\nEvidência · Relatório de custos do ERP Fictício e planilhas de apontamento\nConversa · Quem executa explica a operação\nProjeto · Cliente Teste\n10' },
      { origem: 5, igual: true },
    ] }) };
  };
  const material = `${FONTE}\n${DOCS}`;
  const pl = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'use a proposta para enriquecer as evidências', contexto: DOCS, material, chamar });
  assert.equal(pl.slides.length, 5, 'a divisória esquecida volta');
  assert.equal(pl.slides[2].conteudo, 'Como o trabalho acontece');
  const paginas = paginasDoPlano(MODELO, pl.slides);
  const r = await adaptarModelo({ paginas, contexto: DOCS, pedido: 'x', conteudos: pl.slides.map(s => s.conteudo), material, chamar });
  assert.equal(r.textos['4.7'], 'Documentos, dados, relatórios e sistemas');
});

test('linha enriquecida não duplica a original; frase quebrada em duas caixas não duplica; rótulo renumerado não volta', async () => {
  const fonte = FONTE.replace('[f] Conversa · Quem executa explica a', '[f] Conversa · Quem executa explica a');
  const chamar = async msgs => {
    if (/Você confere uma apresentação/.test(msgs[0].content)) return { texto: JSON.stringify({ remover: ['5.1'] }) };
    return { texto: JSON.stringify({ slides: [
      { origem: 1, igual: true }, { origem: 2, igual: true }, { origem: 3, igual: true },
      { origem: 4, conteudo: '07 · MÉTODO DE TRABALHO\nComo o trabalho acontece\n01\n02\nEvidência · Documentos, dados, relatórios e sistemas\nEvidência · Relatório de custos do ERP Fictício e planilhas de apontamento\nConversa · Quem executa explica a operação\nProjeto · Cliente Teste\n10' },
      { origem: 5, conteudo: '08 · ESCOPO\nO que não está no escopo\nSubstituição do ERP Fictício\nParecer contábil\nProjeto · Cliente Teste' },
    ] }) };
  };
  const material = `${fonte}\n${DOCS}`;
  const pl = await planejarReestilo({ paginas: MODELO, fonte, pedido: 'os capítulos pulam do 7 pro 9; enriqueça as evidências', contexto: DOCS, material, chamar });
  const metodo = pl.slides[3].conteudo.split('\n');
  assert.deepEqual(metodo.filter(l => /^Evidência/.test(l)), ['Evidência · Relatório de custos do ERP Fictício e planilhas de apontamento']);
  assert.equal(metodo.filter(l => /^Conversa/.test(l)).length, 1);
  assert.ok(!metodo.includes('operação'), 'a continuação da frase quebrada não volta sozinha');
  const paginas = paginasDoPlano(MODELO, pl.slides);
  const r = await adaptarModelo({ paginas, contexto: DOCS, pedido: 'x', conteudos: pl.slides.map(s => s.conteudo), material, chamar });
  assert.equal(r.textos['5.1'], '08 · ESCOPO');
  assert.deepEqual(pl.mudancas.filter(m => /Slide 5/.test(m)), ['Slide 5: "09 · ESCOPO" → "08 · ESCOPO"']);
});
