// Fidelidade da produção visual (missão "100% dos bloqueadores"): comparação materializada, números como dados,
// página única sem corte, estrutura de checklist, fluxo desenhado, capa sem repetição, legibilidade por tipo e
// conferência textual com motivo. Cada teste confere a peça desenhada (as primitivas que viram PNG/PDF).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarConteudo } from '../src/visual/conteudo.js';
import { lerPlano, planejar, textoDeCapa } from '../src/visual/plano.js';
import { limparVisual, tracos, FORMATOS } from '../src/visual/contrato.js';
import { resolverIdentidade } from '../src/visual/marca.js';
import { montar, produzir, produzirSemCorte, corta } from '../src/visual/motor.js';
import { conferirVisual } from '../src/visual/qualidade.js';
import { comComparacao, temComparacao } from '../src/visual/producao.js';
import { lerVeredito, resumoQualidade } from '../src/quickwin-construtor.js';

const ID = resolverIdentidade({});
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const textos = paginas => paginas.flatMap(p => p.prims.filter(q => q.t === 'text').map(q => q.linhas.join(' ')));
const desenhado = paginas => norm(textos(paginas).join(' '));
function peca(md, visual, { titulo = 'Peça', planoIa = null } = {}) {
  const conteudo = analisarConteudo(md, { titulo });
  const tr = tracos(limparVisual(visual), { secoes: conteudo.secoes.length });
  const plano = (planoIa && lerPlano(JSON.stringify(planoIa(conteudo)), conteudo, tr, { titulo })) || planejar(conteudo, tr, { titulo });
  return { conteudo, tr, plano, x: produzir({ plano, conteudo, identidade: ID, tr, assets: {}, opcoes: {} }) };
}

// ---- 1. Comparação --------------------------------------------------------------------------------------------
const FORN = ['Alfa QA', 'Beta QA', 'Gama QA'];
const CRIT = ['Preço mensal', 'Prazo de início', 'Equipe', 'Reposição', 'Materiais'];
const VAL = { 'Alfa QA': ['R$ 48.000', '15 dias', '12 pessoas', '24 h', 'Não inclui'], 'Beta QA': ['R$ 44.500', '30 dias', '10 pessoas', '48 h', 'Não inclui'], 'Gama QA': ['R$ 51.200', '7 dias', '14 pessoas', '12 h', 'Inclui'] };
const listasParalelas = CRIT.map((c, k) => `### ${c}\n${FORN.map(f => `- ${f}: ${VAL[f][k]}`).join('\n')}`).join('\n\n') + '\n\n### Recomendação\n- Gama QA pela reposição mais rápida.';

test('1. comparação (3 fornecedores x 5 critérios em listas paralelas) vira matriz desenhada; nenhum item ou critério some', () => {
  const { x, plano, conteudo } = peca(listasParalelas, { tipo: 'one_page' }, { titulo: 'Comparativo' });
  const tab = conteudo.secoes.flatMap(s => s.itens).find(i => i.comparacao);
  assert.ok(tab, 'estrutura comparativa explícita');
  assert.deepEqual(tab.comparacao.itens, FORN); assert.deepEqual(tab.comparacao.criterios, CRIT);
  assert.ok(plano.paginas.some(p => p.blocos.some(b => b.tipo === 'tabela' && b.refs.includes(tab.id))), 'desenhada como tabela');
  const txt = desenhado(x.paginas);
  for (const t of [...FORN, ...CRIT, ...Object.values(VAL).flat()]) assert.ok(txt.includes(norm(t)), `"${t}" sumiu da comparação`);
  assert.ok(!x.registro.erros.length, JSON.stringify(x.registro));
});

test('1. comparação: plano que desenha a matriz como texto é corrigido para tabela; sem tabela, a conferência reprova', () => {
  const planoIa = c => ({ paginas: [{ papel: 'conteudo', titulo: 'Comparação', blocos: c.secoes.flatMap(s => s.itens).map(i => ({ tipo: 'texto', refs: [i.id] })) }] });
  const { plano, conteudo, tr } = peca(listasParalelas, { tipo: 'one_page' }, { titulo: 'C', planoIa });
  const tab = conteudo.secoes.flatMap(s => s.itens).find(i => i.comparacao);
  assert.ok(plano.paginas.some(p => p.blocos.some(b => b.tipo === 'tabela' && b.refs.includes(tab.id))));
  const semTabela = structuredClone(plano); semTabela.paginas.forEach(p => { p.blocos = p.blocos.filter(b => !b.refs.includes(tab.id)); });
  const r = montar({ plano: semTabela, conteudo, identidade: ID, assets: {}, opcoes: {} });
  assert.ok(conferirVisual({ paginas: r.paginas, plano: semTabela, conteudo, tr }).erros.some(e => e.codigo === 'comparacao'));
  const x = produzir({ plano: semTabela, conteudo, identidade: ID, tr, assets: {}, opcoes: {} });
  assert.ok(x.registro.tentativas.some(t => t.acao === 'materializar_comparacao') && !x.registro.erros.includes('comparacao'), JSON.stringify(x.registro.tentativas));
});

test('1. pedido comparativo cuja peça não tem matriz: a matriz do resultado entra na peça', () => {
  const resposta = `## Comparativo\n| Fornecedor | ${CRIT.join(' | ')} |\n|${'---|'.repeat(6)}\n${FORN.map(f => `| ${f} | ${VAL[f].join(' | ')} |`).join('\n')}\n\n## One-page\nTítulo: Decisão\n\n### Decisão\n- Escolhido: Gama QA`;
  const conteudo = analisarConteudo('### Decisão\n- Escolhido: Gama QA', { titulo: 'Decisão' });
  assert.ok(!temComparacao(conteudo));
  const com = comComparacao(conteudo, { resposta, visual: { tipo: 'one_page' }, espec: { objetivo: 'Compare as três propostas de fornecedores' } });
  assert.ok(temComparacao(com));
  const sem = comComparacao(conteudo, { resposta, visual: { tipo: 'one_page' }, espec: { objetivo: 'Resuma o contrato' } });
  assert.ok(!temComparacao(sem), 'pedido que não compara não ganha tabela de fora');
});

// ---- 2-4. Números como dados ---------------------------------------------------------------------------------
const NUMEROS = [['Superávit', '+3,3%', 'acima da meta'], ['Satisfação', '4,3 de 5', '86% de aprovação'], ['Total', '1.234,56'], ['Receita', 'R$ 12.345,67'], ['Tempo médio', '3 h 40 min'],
  ['Variação', '-2,5 pp', 'no mês'], ['Score', '4.3 out of 5'], ['Growth', '+3.3%'], ['Total US', '1,234.56'], ['Revenue', '$12,345.67']];
test('2-4. números pt-BR e en-US: entrada -> parser -> renderer mantém o valor exato (nunca "+3" por "+3,3%")', () => {
  const md = '### Indicadores\n' + NUMEROS.map(([r, v, d]) => `- ${r}: ${v}${d ? ` ${d.startsWith('86') ? `(${d})` : d}` : ''}`).join('\n');
  const { conteudo, x } = peca(md, { tipo: 'dashboard' }, { titulo: 'Números' });
  const kpis = conteudo.secoes[0].itens[0].itens;
  NUMEROS.forEach(([r, v], k) => { assert.equal(kpis[k].rotulo, r); assert.equal(kpis[k].valor, v, `valor de ${r}`); });
  assert.equal(kpis[0].numero, 3.3); assert.equal(kpis[2].numero, 1234.56); assert.equal(kpis[3].numero, 12345.67); assert.equal(kpis[8].numero, 1234.56); assert.equal(kpis[9].numero, 12345.67);
  const t = textos(x.paginas);
  for (const [, v] of NUMEROS) assert.ok(t.some(l => l.includes(v)), `"${v}" não aparece exatamente na peça`);
  for (const errado of ['+3', '4']) assert.ok(!t.some(l => l.trim() === errado), `valor truncado "${errado}" na peça`);
});

// ---- 5. Página única sem corte --------------------------------------------------------------------------------
const dentro = pg => pg.prims.every(p => {
  if (['decoracao', 'fundo', 'fundo_capa', 'faixa'].includes(p.papel)) return true;
  const b = p.t === 'text' ? { x: p.x, y: p.y, w: p.w, h: p.lh * p.linhas.length } : p.t === 'circle' ? { x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r } : p.t === 'line' ? { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1), h: Math.abs(p.y2 - p.y1) } : { x: p.x ?? 0, y: p.y ?? 0, w: p.w ?? 0, h: p.h ?? 0 };
  return b.x >= -1 && b.y >= -1 && b.x + b.w <= pg.w + 1 && b.y + b.h <= pg.h + 1;
});
test('5. cartaz: uma página e todos os elementos dentro do canvas; conteúdo que não cabe no formato pequeno vai para o maior da família', () => {
  const md = '### Semana de Segurança\n- 13 a 17 de outubro\n- Palestras diárias às 9h no refeitório\n- Gincana de segurança\n- Campanha de vacinação\n\nChamada: Participe';
  const { x } = peca(md, { tipo: 'poster' }, { titulo: 'Semana de Segurança' });
  assert.equal(x.paginas.length, 1); assert.ok(dentro(x.paginas[0])); assert.ok(!corta(x), JSON.stringify(x.registro));
  const longo = Array.from({ length: 9 }, (_, k) => `### Bloco ${k + 1}\n- ${'Texto do bloco com várias palavras para ocupar espaço. '.repeat(2)}`).join('\n\n');
  const conteudo = analisarConteudo(longo, { titulo: 'Post' });
  const tr = tracos(limparVisual({ tipo: 'social_post', formato: '1:1' }), { secoes: conteudo.secoes.length });
  const entrada = { plano: planejar(conteudo, tr, { titulo: 'Post' }), conteudo, identidade: ID, tr, assets: {}, opcoes: {} };
  assert.ok(corta(produzir(entrada)), 'o conteúdo corta em 1:1');
  const r = produzirSemCorte(entrada);
  assert.equal(r.paginas.length, 1);
  if (!corta(r)) { assert.ok(dentro(r.paginas[0])); assert.notEqual(r.plano.formato, '1:1', 'não cabia em 1:1: subiu de formato'); }
  else assert.ok(r.explicacoes.some(e => /não coube/.test(e)));
  assert.equal(produzirSemCorte(entrada, { formatoPedido: true }).plano.formato, '1:1', 'formato pedido não muda');
});

test('5. a conferência acusa qualquer elemento fora do canvas (não só texto)', () => {
  const { x, plano, conteudo, tr } = peca('### A\n- um item', { tipo: 'one_page' });
  const pg = structuredClone(x.paginas[0]); pg.prims.push({ t: 'rect', x: pg.w - 10, y: 100, w: 80, h: 20, fill: '#000', papel: 'painel' });
  assert.ok(conferirVisual({ paginas: [pg], plano, conteudo, tr }).erros.some(e => e.codigo === 'corte'));
});

// ---- 6-7. Checklist: "Título:" e introdução de lista -----------------------------------------------------------
test('6-7. checklist: "Título:" depois de cabeçalho não vaza; introdução de lista não vira caixa; caixa só em item real', () => {
  const md = '### Página 1\n\nTítulo: Checklist diário de segurança\n\n- Data: não informado\n\n- Categorias de verificação:\n- [ ] Extintores no lugar\n- [ ] Saídas desobstruídas\n- Observação geral do turno';
  const { x, conteudo } = peca(md, { tipo: 'checklist' }, { titulo: '' });
  const txt = desenhado(x.paginas);
  assert.ok(!txt.includes('titulo:'), 'linha "Título:" fora do corpo');
  assert.equal(conteudo.titulo, 'Checklist diário de segurança');
  const itens = conteudo.secoes.flatMap(s => s.itens);
  assert.ok(itens.some(i => i.tipo === 'subtitulo' && i.texto === 'Categorias de verificação'));
  const lista = itens.find(i => i.tipo === 'lista');
  assert.deepEqual(lista.itens.map(i => [i.texto, i.marcado]), [['Extintores no lugar', false], ['Saídas desobstruídas', false], ['Observação geral do turno', undefined]]);
  const caixas = x.paginas[0].prims.filter(p => p.t === 'rect' && p.papel === 'marcador').length;
  assert.equal(caixas, 2, 'duas caixas de marcar: só os itens marcáveis');
  assert.ok(!txt.includes('nao informado'));
});

// ---- 8. Fluxo desenhado -------------------------------------------------------------------------------------
test('8. fluxo com setas (com "Fluxo:" antes ou na mesma linha) vira diagrama de nós e ligações', () => {
  for (const md of ['### Processo\nFluxo:\nPedido -> Aprovação -> Cotação -> Compra', '### Processo\nFluxo: Pedido -> Aprovação -> Cotação -> Compra']) {
    const { conteudo, plano, x } = peca(md, { tipo: 'infographic' }, { titulo: 'Compras' });
    const fluxo = conteudo.secoes.flatMap(s => s.itens).find(i => i.tipo === 'fluxo');
    assert.ok(fluxo && fluxo.nos.length === 4, md);
    assert.ok(plano.paginas.some(p => p.blocos.some(b => b.tipo === 'diagrama')));
    assert.ok(!desenhado(x.paginas).includes('->'), 'nada de frase com setas');
  }
});

// ---- 9. Capa sem repetição ----------------------------------------------------------------------------------
test('9. capa: título único e subtítulo sem repetir partes nem o título', () => {
  assert.equal(textoDeCapa('Situação de Manutenção — Setembro de 2026', ['Resumo mensal de indicadores', 'Relatório de Manutenção', 'Setembro de 2026', 'Resumo mensal de indicadores']), 'Resumo mensal de indicadores · Relatório de Manutenção');
  const md = '### Capa\n- Relatório de Manutenção\n- Setembro de 2026\n- Resumo mensal\n\n### Indicadores\n- Ordens: 128\n- Backlog: 14';
  const planoIa = c => ({ paginas: [{ papel: 'capa', titulo: 'Manutenção — Setembro de 2026', subtitulo: 'Resumo mensal', blocos: [{ tipo: 'lista', refs: [c.secoes[0].itens[0].id] }] }, { papel: 'conteudo', titulo: 'Indicadores', blocos: [{ tipo: 'indicadores', refs: [c.secoes[1].itens[0].id] }] }] });
  const { plano } = peca(md, { tipo: 'report' }, { titulo: 'Manutenção — Setembro de 2026', planoIa });
  const capa = plano.paginas.find(p => p.papel === 'capa');
  const partes = capa.subtitulo.split(' · ').map(norm);
  assert.equal(new Set(partes).size, partes.length, capa.subtitulo);
  assert.ok(!partes.some(p => norm(capa.titulo).includes(p)), capa.subtitulo);
});

// ---- 10. Fonte pequena com espaço livre ----------------------------------------------------------------------
test('10. texto pequeno com espaço sobrando é reprovado, com limite por tipo de página; a correção aumenta o texto', () => {
  const conteudo = analisarConteudo('### Texto\nUm parágrafo curto de leitura.\n\n### Mais\nOutro parágrafo curto.', { titulo: 'L' });
  const tr = tracos(limparVisual({ tipo: 'one_page' }), { secoes: 2 });
  const plano = planejar(conteudo, tr, { titulo: 'L' });
  // Sem o preenchimento do layout (texto no tamanho reduzido), a página fica quase vazia com texto pequeno: reprovada.
  const r = montar({ plano, conteudo, identidade: ID, assets: {}, opcoes: { escala: 0.8, preencher: false } });
  const c = conferirVisual({ paginas: r.paginas, plano, conteudo, tr });
  assert.ok(c.erros.some(e => e.codigo === 'legibilidade') && c.erros.some(e => e.codigo === 'espaco_vazio'), JSON.stringify(c.erros.map(e => e.codigo)));
  // Com texto grande (página editorial curta), pouca ocupação é aviso, não erro.
  const grande = montar({ plano, conteudo, identidade: ID, assets: {}, opcoes: { escala: 1.4, preencher: false } });
  assert.ok(!conferirVisual({ paginas: grande.paginas, plano, conteudo, tr }).erros.some(e => ['legibilidade', 'espaco_vazio'].includes(e.codigo)));
  const x = produzir({ plano, conteudo, identidade: ID, tr, assets: {}, opcoes: { escala: 0.8, preencher: false } });
  assert.ok(!x.registro.erros.length && x.opcoes.escala > 0.8, JSON.stringify(x.registro));
  const corpos = x.paginas[0].prims.filter(p => p.t === 'text' && p.papel === 'corpo').map(p => p.tam);
  assert.ok(Math.min(...corpos) >= FORMATOS.a4.corpo * 0.85);
});

// ---- 11. Conferência textual com motivo ---------------------------------------------------------------------
test('11. conferência textual: toda falha tem motivo (do conferente ou determinístico), nunca só "faltou parte"', () => {
  const espec = { criterios_qualidade: [{ id: 'c1', grupo: 'completo', texto: 'Traz todas as decisões da reunião.' }, { id: 'c2', grupo: 'invencao', texto: 'Não inventa números.' }] };
  const v = lerVeredito(espec, '{"criterios":[{"id":"c1","ok":false},{"id":"c2","ok":false,"motivo":"cita 30% que não está na entrada"}],"objetivo_atingido":true}');
  assert.deepEqual(v.razoes.map(r => r.grupo), ['completo', 'invencao']);
  assert.match(v.razoes[0].motivo, /Critério não atendido: Traz todas as decisões/);
  assert.match(v.razoes[1].motivo, /cita 30%/);
  const resumo = resumoQualidade({ status: 'inconsistente', falhas: ['completo', 'invencao'], razoes: v.razoes });
  assert.ok(resumo.problemas.every(p => p.length > 'Faltou parte do que foi pedido.'.length), JSON.stringify(resumo.problemas));
  assert.ok(resumo.itens.find(i => i.id === 'completo').motivos?.length);
});

// ---- 12. Apresentação sem perda, slide a slide ---------------------------------------------------------------
test('12. apresentação: o conteúdo esperado de cada slide está desenhado no slide dele', () => {
  const slides = [['Desempenho', ['Receita: R$ 12,4 milhões', 'Superávit: +3,3% acima da meta']], ['Clientes', ['Clientes ativos: 1.240', 'Clientes no 2º trimestre: 1.180']],
    ['Projetos', ['Centro de distribuição 70% concluído', 'ERP em homologação']], ['Riscos', ['Atraso de fornecedor de embalagens', 'Variação cambial']], ['Próximos passos', ['Renegociar frete até 30/11', 'Concluir o CD em dezembro']]];
  const md = '### Capa\n- Resultados do trimestre\n\n' + slides.map(([t, it]) => `### ${t}\n${it.map(x => `- ${x}`).join('\n')}`).join('\n\n');
  const { x } = peca(md, { tipo: 'presentation', paginas: 6 }, { titulo: 'Resultados do 3º trimestre' });
  assert.equal(x.paginas.length, 6);
  for (const [t, it] of slides) {
    const pg = x.paginas.find(p => desenhado([p]).includes(norm(t)));
    assert.ok(pg, `slide "${t}"`);
    for (const linha of it) for (const parte of linha.split(/: | (?=acima)/)) assert.ok(desenhado([pg]).includes(norm(parte)), `"${parte}" fora do slide "${t}"`);
  }
  assert.ok(!x.registro.erros.length, JSON.stringify(x.registro));
});

// ---- 13. Timeline completa ---------------------------------------------------------------------------------
test('13. cronograma: fase, período e descrição de todas as fases, em ordem', () => {
  const fases = [['Planejamento', 'Setembro de 2026', 'Levantamento das necessidades'], ['Obras', 'Outubro e novembro', 'Reforma do andar'], ['Mudança', '5 a 7 de dezembro', 'TI e móveis'],
    ['Inauguração', '8 de dezembro', 'Primeiro dia'], ['Encerramento', 'Até 31 de janeiro de 2027', 'Devolução do prédio antigo']];
  const md = fases.map(([f, p, d], k) => `### Fase ${k + 1} - ${f}\n- Período: ${p}\n- Descrição: ${d}`).join('\n\n');
  const { x } = peca(md, { tipo: 'timeline' }, { titulo: 'Cronograma' });
  const txt = desenhado(x.paginas);
  let pos = -1;
  for (const [f, p, d] of fases) { const i = txt.indexOf(norm(f)); assert.ok(i > pos, `${f} fora de ordem ou ausente`); pos = i; assert.ok(txt.includes(norm(p)) && txt.includes(norm(d)), `${f}: período/descrição`); }
  assert.ok(!x.registro.erros.length, JSON.stringify(x.registro));
});
