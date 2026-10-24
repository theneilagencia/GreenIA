// Bloqueadores da homologação final da produção visual (bateria em produção, f86c2f8). Cada teste reproduz a
// forma real do conteúdo e do plano que falhou e confere a peça desenhada (o texto que vira PNG e PDF), não o JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarConteudo } from '../src/visual/conteudo.js';
import { lerPlano, planejar } from '../src/visual/plano.js';
import { limparVisual, tracos } from '../src/visual/contrato.js';
import { resolverIdentidade } from '../src/visual/marca.js';
import { montar, produzir } from '../src/visual/motor.js';
import { conferirVisual } from '../src/visual/qualidade.js';
import { secaoDaPeca } from '../src/visual/producao.js';
import { conferirOperacao } from '../src/quickwin-operacao.js';
import { promptQualidade, VERSAO_ESPEC } from '../src/quickwin-construtor.js';

const ID = resolverIdentidade({});
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const textoDesenhado = paginas => norm(paginas.flatMap(p => p.prims.filter(q => q.t === 'text').map(q => q.linhas.join(' '))).join(' '));
function peca(md, visual, { titulo = 'Peça', planoIa = null } = {}) {
  const conteudo = analisarConteudo(md, { titulo });
  const tr = tracos(limparVisual(visual), { secoes: conteudo.secoes.length });
  const plano = (planoIa && lerPlano(JSON.stringify(planoIa(conteudo)), conteudo, tr, { titulo })) || planejar(conteudo, tr, { titulo });
  return { conteudo, tr, plano, x: produzir({ plano, conteudo, identidade: ID, tr, assets: {}, opcoes: {} }) };
}

// ---- A. Apresentação de 6 slides sem perda de conteúdo ------------------------------------------------------------
const DECK = `### Slide 1: Capa
- Empresa Exemplo QA
- Resultados do 3º Trimestre 2026
- Apresentação Executiva

### Slide 2: Desempenho Financeiro
- Receita: R$ 12,4 milhões
- Meta de receita: R$ 12,0 milhões
- Margem EBITDA: 18%

### Slide 3: Clientes
| Indicador | 2º Trim | 3º Trim |
|---|---|---|
| Clientes ativos | 1.180 | 1.240 |

### Slide 4: Projetos em andamento
- Novo centro de distribuição: 70% concluído
- ERP: em fase de homologação
- Status: projetos críticos dentro do cronograma

### Slide 5: Desafios e Riscos
- Custo de frete: aumento de 9% no trimestre
- Risco de atraso: fornecedor de embalagens
- Exposição: variação cambial

### Slide 6: Próximos Passos
- Renegociar contrato de frete até 30/11/2026
- Concluir o centro de distribuição em dezembro`;
// Plano como a IA devolveu em produção: blocos na capa, vários itens num bloco só, riscos como checklist e status de
// projeto como diagrama de processo.
const planoDeck = c => {
  const ids = c.secoes.map(s => s.itens.map(i => i.id));
  return { paginas: [
    { papel: 'capa', titulo: 'Resultados 3º Tri', subtitulo: 'Resultados do 3º Trimestre 2026', blocos: [{ tipo: 'lista', refs: ids[0] }] },
    { papel: 'conteudo', titulo: 'Desempenho e clientes', blocos: [{ tipo: 'indicadores', refs: [...ids[1], ...ids[2]] }] },
    { papel: 'conteudo', titulo: 'Projetos', blocos: [{ tipo: 'diagrama', refs: ids[3] }] },
    { papel: 'conteudo', titulo: 'Riscos', blocos: [{ tipo: 'checklist', refs: ids[4] }] },
    { papel: 'conteudo', titulo: 'Próximos passos', blocos: [{ tipo: 'linha_tempo', refs: ids[5] }] },
  ] };
};

test('A. apresentação: nada do conteúdo some (blocos na capa, vários itens num bloco); riscos não viram checklist nem status vira processo', () => {
  const { x, plano } = peca(DECK, { tipo: 'presentation', paginas: 6 }, { titulo: 'Resultados do 3º Trimestre', planoIa: planoDeck });
  const txt = textoDesenhado(x.paginas);
  for (const t of ['Apresentação Executiva', 'R$ 12,4 milhões', '18%', '1.240', '1.180', 'em fase de homologação', 'projetos críticos dentro do cronograma',
    'fornecedor de embalagens', 'variação cambial', 'Renegociar contrato de frete', 'Concluir o centro de distribuição']) assert.ok(txt.includes(norm(t)), `"${t}" sumiu da apresentação`);
  assert.ok(!x.registro.erros.includes('conteudo_faltando'), JSON.stringify(x.registro));
  const blocos = plano.paginas.flatMap(p => p.blocos);
  const doItem = id => blocos.find(b => b.refs.includes(id));
  assert.notEqual(doItem('s5.i1')?.tipo, 'checklist', 'riscos não são caixas de marcar');
  assert.notEqual(doItem('s4.i1')?.tipo, 'diagrama', 'status de projeto não é processo');
  assert.ok(blocos.every(b => b.tipo === 'texto' || b.refs.length === 1), 'um bloco desenha um item');
});

test('A. a capa não desenha blocos: o que a IA pôs nela vira subtítulo ou segue para a próxima página', () => {
  const md = '### Capa\n- Relatório anual\n- Unidade Sul\n\n### Números\n- Vendas: 120 unidades\n- Clientes: 40';
  const planoIa = c => ({ paginas: [{ papel: 'capa', titulo: 'Relatório', blocos: [{ tipo: 'lista', refs: [c.secoes[0].itens[0].id] }] }, { papel: 'conteudo', titulo: 'Números', blocos: [{ tipo: 'indicadores', refs: [c.secoes[1].itens[0].id] }] }] });
  const { x } = peca(md, { tipo: 'presentation' }, { titulo: 'Relatório', planoIa });
  const txt = textoDesenhado(x.paginas);
  assert.ok(txt.includes('unidade sul') && txt.includes('120'), txt.slice(0, 300));
});

// ---- B. Timeline com todas as fases ---------------------------------------------------------------------------
const fases = n => Array.from({ length: n }, (_, k) => `### Fase ${k + 1} - Etapa ${String.fromCharCode(65 + k)}\n\n- Período: mês ${k + 1} de 2027\n- Descrição: Não informado`).join('\n\n');
for (const n of [3, 10]) {
  test(`B. cronograma com ${n} fases (uma seção por fase): todas aparecem, em ordem, sem "não informado"`, () => {
    const { x, conteudo } = peca(fases(n), { tipo: 'timeline' }, { titulo: 'Cronograma' });
    const txt = textoDesenhado(x.paginas);
    let pos = -1;
    for (let k = 0; k < n; k++) {
      const i = txt.indexOf(norm(`Etapa ${String.fromCharCode(65 + k)}`));
      assert.ok(i >= 0, `fase ${k + 1} sumiu`); assert.ok(i > pos, `fase ${k + 1} fora de ordem`); pos = i;
      assert.ok(txt.includes(norm(`mês ${k + 1} de 2027`)), `período da fase ${k + 1} sumiu`);
    }
    assert.ok(!txt.includes('nao informado'), 'lacuna opcional não vai para a peça');
    assert.equal(conteudo.secoes.length, 1, 'fases paralelas viram um item só, em ordem');
    assert.notEqual(x.registro.status, 'inconsistente', JSON.stringify(x.registro));
  });
}

// ---- C. Comparação com a tabela presente ------------------------------------------------------------------------
const RESULTADO_COMPARACAO = `## Comparativo
| Fornecedor | Preço |
|---|---|
| Alfa QA | R$ 48.000/mês |

## Recomendação
Recomendamos o Gama QA pela reposição mais rápida.

## Página visual

Título: Análise de fornecedores

### Tabela comparativa
| Fornecedor | Equipe | Materiais | Prazo início | Reposição | Preço/mês |
|---|---|---|---|---|---|
| Alfa QA | 12 pessoas | Não informado | 15 dias | 24 h | R$ 48.000/mês |
| Beta QA | 10 pessoas | Não informado | 30 dias | 48 h | R$ 44.500/mês |
| Gama QA | 14 pessoas | Incluso | 7 dias | 12 h | R$ 51.200/mês |

### Recomendação: Gama QA
- Reposição em 12 h e início em 7 dias.`;

test('C. comparação: a peça usa a seção que tem a peça ("Título:") e a tabela é desenhada inteira, sem célula cortada', () => {
  const sec = secaoDaPeca(RESULTADO_COMPARACAO, 'Recomendação');
  assert.match(sec, /^Título: Análise de fornecedores/);
  const { x, plano } = peca(sec.replace(/^Título:.*\n/, ''), { tipo: 'one_page' }, { titulo: 'Análise de fornecedores' });
  assert.ok(plano.paginas.some(p => p.blocos.some(b => b.tipo === 'tabela')), 'a comparação tem tabela');
  const txt = textoDesenhado(x.paginas);
  for (const t of ['Alfa QA', 'Beta QA', 'Gama QA', 'Equipe', 'Reposição', 'Preço/mês', 'R$ 48.000/mês', 'R$ 44.500/mês', 'R$ 51.200/mês', '12 h', 'Incluso'])
    assert.ok(txt.includes(norm(t)), `"${t}" não está na peça`);
  assert.ok(!x.registro.erros.includes('texto_cortado') && x.registro.status !== 'inconsistente', JSON.stringify(x.registro));
  assert.equal(x.paginas.length, 1);
});

test('C. comparação sem a tabela desenhada é reprovada pela conferência', () => {
  const conteudo = analisarConteudo('### Tabela\n| Item | Preço |\n|---|---|\n| A | R$ 10 |\n| B | R$ 20 |\n\n### Nota\nTexto.', { titulo: 'C' });
  const tr = tracos(limparVisual({ tipo: 'one_page' }), { secoes: 2 });
  const plano = planejar(conteudo, tr, { titulo: 'C' });
  plano.paginas.forEach(p => { p.blocos = p.blocos.filter(b => b.tipo !== 'tabela'); });
  const r = montar({ plano, conteudo, identidade: ID, assets: {}, opcoes: {} });
  const c = conferirVisual({ paginas: r.paginas, plano, conteudo, tr });
  assert.ok(c.erros.some(e => e.codigo === 'conteudo_faltando'));
});

// ---- D/E. Fonte mínima e espaço vazio (métricas do renderer) ----------------------------------------------------
test('D. texto abaixo do mínimo do formato é reprovado; texto pequeno com espaço sobrando também', () => {
  const conteudo = analisarConteudo('### Itens\n- Um item curto\n- Outro item curto', { titulo: 'L' });
  const tr = tracos(limparVisual({ tipo: 'one_page' }), { secoes: 1 });
  const plano = planejar(conteudo, tr, { titulo: 'L' });
  const pequeno = montar({ plano, conteudo, identidade: ID, assets: {}, opcoes: { escala: 0.5 } });
  const c = conferirVisual({ paginas: pequeno.paginas, plano, conteudo, tr });
  assert.ok(c.erros.some(e => e.codigo === 'legibilidade'), JSON.stringify(c.erros));
  const ok = produzir({ plano, conteudo, identidade: ID, tr, assets: {}, opcoes: {} });
  assert.ok(!ok.registro.erros.includes('legibilidade'));
});

test('E. página de leitura quase vazia com texto no tamanho base é reprovada; a correção preenche (texto maior)', () => {
  const conteudo = analisarConteudo('### Nota\n- Um item\n- Dois itens', { titulo: 'V' });
  const tr = tracos(limparVisual({ tipo: 'infographic', formato: '16:9' }), { secoes: 1 });
  const plano = planejar(conteudo, tr, { titulo: 'V' });
  const r = montar({ plano, conteudo, identidade: ID, assets: {}, opcoes: { escala: 0.7 } });
  const c = conferirVisual({ paginas: r.paginas, plano, conteudo, tr });
  assert.ok(c.erros.some(e => e.codigo === 'espaco_vazio'), JSON.stringify(c.erros.map(e => e.codigo)));
  const x = produzir({ plano, conteudo, identidade: ID, tr, assets: {}, opcoes: { escala: 0.7 } });
  assert.ok(!x.registro.erros.includes('espaco_vazio'), JSON.stringify(x.registro));
  assert.ok(x.opcoes.escala > 0.7);
  // Capa e peça de impacto (minimalistas por intenção) não entram nessa regra.
  const capa = peca('### Capa\n- Relatório anual', { tipo: 'cover' }).x;
  assert.ok(!capa.registro.erros.includes('espaco_vazio'));
});

test('E. cronograma longo num painel largo corre em colunas (sem fio estreito com o resto da página vazio)', () => {
  const md = '### Etapas\n' + Array.from({ length: 9 }, (_, k) => `- Etapa ${k + 1}: passo número ${k + 1} do processo`).join('\n');
  const conteudo = analisarConteudo(md, { titulo: 'P' });
  const tr = tracos(limparVisual({ tipo: 'infographic', formato: '16:9' }), { secoes: 1 });
  const plano = lerPlano(JSON.stringify({ paginas: [{ papel: 'conteudo', layout: 'painel', titulo: 'Etapas', blocos: [{ tipo: 'linha_tempo', refs: ['s1.i1'] }] }] }), conteudo, tr, { titulo: 'P' });
  const x = produzir({ plano, conteudo, identidade: ID, tr, assets: {}, opcoes: {} });
  const marcadores = x.paginas[0].prims.filter(p => p.papel === 'marcador').map(p => Math.round(p.cx));
  assert.ok(new Set(marcadores).size >= 2, 'mais de uma coluna');
  assert.ok(!x.registro.erros.length, JSON.stringify(x.registro));
});

// ---- F. Peça de página única continua com uma página ---------------------------------------------------------
test('F. cartaz com conteúdo demais não ganha segunda página: diz o que não coube', () => {
  const md = Array.from({ length: 14 }, (_, k) => `### Bloco ${k + 1}\n- ${'Texto longo do bloco que ocupa bastante espaço na peça. '.repeat(3)}`).join('\n\n');
  const { x } = peca(md, { tipo: 'poster' }, { titulo: 'Cartaz' });
  assert.equal(x.paginas.length, 1, 'cartaz tem uma página');
  if (x.registro.status === 'inconsistente') assert.ok(x.explicacoes.some(e => /não coube em uma página/.test(e)), JSON.stringify(x.explicacoes));
  for (const tipo of ['one_page', 'social_post', 'cover']) assert.equal(peca(md, { tipo }).x.paginas.length, 1, tipo);
});

// ---- G. "Não informado" não vai para a peça -------------------------------------------------------------------
test('G. lacunas opcionais saem da peça (linha, célula, coluna e campos com |); o resto fica', () => {
  const md = `### Itens de verificação
- Data: não informado | Inspetor: não informado | Setor: Expedição
- [ ] Extintores no lugar
- Observações: não disponível

### Tabela
| Item | Responsável | Prazo |
|---|---|---|
| Revisar | Não informado | 10/10 |
| Comprar | Não informado | Não informado |`;
  const { x, conteudo } = peca(md, { tipo: 'checklist' }, { titulo: 'Checklist' });
  const txt = textoDesenhado(x.paginas);
  assert.ok(!/nao (informado|disponivel)/.test(txt), txt);
  assert.ok(txt.includes('setor: expedicao') && txt.includes('extintores no lugar') && txt.includes('10/10'));
  const tab = conteudo.secoes.flatMap(s => s.itens).find(i => i.tipo === 'tabela');
  assert.deepEqual(tab.cabecalho, ['Item', 'Prazo'], 'coluna só de lacunas sai');
  assert.deepEqual(tab.linhas[1], ['Comprar', '—']);
});

// ---- H. Conferência textual x visual --------------------------------------------------------------------------
test('H. conferência textual julga o conteúdo da peça visual, não a aparência; invenção continua reprovada', () => {
  const op = { entregaveis: [{ id: 'e1', tipo: 'tabela', rotulo: 'Comparativo', canal: null, config: {} }, { id: 'e2', tipo: 'resumo', rotulo: 'Recomendação', canal: null, config: {}, visual: { tipo: 'one_page' } }], etapas: [], entradas: [], ferramentas: [] };
  const r = conferirOperacao(op, '## Comparativo\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## Página visual\n\nTítulo: Análise\n\n### Itens\n- Fornecedor Alfa: R$ 10', { entrada: 'Fornecedor Alfa: R$ 10' });
  assert.ok(!r.falhas.includes('completo'), JSON.stringify(r));
  const inventado = conferirOperacao(op, '## Comparativo\n- Concorrente A é melhor\n\n## Recomendação\nTítulo: X', { entrada: 'nada' });
  assert.ok(inventado.falhas.includes('invencao'), 'invenção continua reprovada');
  const semPeca = conferirOperacao(op, '## Comparativo\n- algo', { entrada: '' });
  assert.ok(semPeca.falhas.includes('completo'), 'peça ausente continua reprovada');
  const p = promptQualidade({ v: VERSAO_ESPEC, objetivo: 'Comparar', operacao: { ...op, v: 2 }, criterios_qualidade: [] });
  assert.match(p, /Confira o conteúdo dessas peças/);
  assert.doesNotMatch(promptQualidade({ v: VERSAO_ESPEC, objetivo: 'Resumir', criterios_qualidade: [] }), /Peças visuais/);
});
