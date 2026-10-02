// QA 2026-10 — universalidade do motor. Regressões dos achados da auditoria:
// QA-01: sem IA (plano heurístico), pedidos fora de conteúdo por canal saíam SEM entregáveis — só o pedido de
//        LinkedIn/Instagram ganhava plano estruturado. As invariantes do pedido passam a valer também sem IA.
// QA-03: item pedido explicitamente ("relatório com fatos, riscos e decisões") que só aparecia numa etapa ou na
//        descrição de um entregável não virava seção conferível.
// QA-05: "em cinco pontos" virava "5 textos" na entrada; a quantidade só conta o MATERIAL.
// Nenhum caso aqui depende de setor: os pedidos são de áreas diferentes e o mesmo motor responde a todos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';
import { garantirInvariantes, lerInterpretacao } from '../src/quickwin-interpretacao.js';
import { rotuloEntregavel } from '../src/quickwin-operacao.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
let S, qa;
before(async () => {
  S = await subir();   // sem IA: a interpretação cai no plano heurístico
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  const A = (await admin.post('/api/admin/areas', { nome: 'QA' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'qa@exemplo.com.br', nome: 'QA', areas: [{ id: A.id, responsavel: true }] });
  qa = await S.cliente().entrar('qa@exemplo.com.br');
});
after(() => S.fechar());

const CASOS = [
  ['contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', ['risco', 'obriga', 'prazo', 'multa']],
  ['planilha', 'Analise esta planilha mensal e identifique desvios relevantes, maiores gastos e itens fora do padrão.', ['desvio', 'gasto', 'fora do padr']],
  ['reunião', 'Transforme esta reunião em ata, decisões, responsáveis e próximos passos.', ['ata', 'decis', 'respons', 'proximos passos']],
  ['atendimento', 'Analise estas reclamações e agrupe os principais motivos, frequência e prioridade.', ['motivo', 'frequen', 'priorid']],
  ['compliance', 'Confira estes documentos e identifique requisitos ausentes, inconsistências e evidências pendentes.', ['requisit', 'inconsist', 'evid']],
  ['apresentação', 'Estruture uma apresentação executiva com problema, análise, recomendação e próximos passos.', ['problema', 'analise', 'recomend', 'proximos passos']],
];

for (const [area, pedido, itens] of CASOS) test(`QA-01 sem IA, ${area}: os entregáveis pedidos estão no plano, sem canal`, async () => {
  const r = await qa.post('/api/quick-wins/assistente/interpretar', { descricao: pedido });
  assert.equal(r.status, 200);
  assert.equal(r.dados.fonte, 'heuristica');
  const ents = r.dados.operacao.entregaveis;
  const texto = norm(ents.map(rotuloEntregavel).join(' | '));
  for (const it of itens) assert.match(texto, new RegExp(it), `${area}: faltou "${it}" em [${texto}]`);
  assert.ok(ents.every(e => !e.canal), 'canal em pedido sem canal');
});

test('QA-01 sem IA: contexto da empresa pela linguagem do pedido, não só para conteúdo de canal', async () => {
  const r = await qa.post('/api/quick-wins/assistente/interpretar', { descricao: 'Pesquise mudanças recentes neste mercado e explique quais podem impactar a empresa.' });
  assert.equal(r.dados.operacao.contexto_empresa, true);
  assert.ok(r.dados.operacao.ferramentas.includes('pesquisa_web'));
});

test('QA-03: componente pedido que só estava na descrição vira seção conferível', () => {
  const ia = JSON.stringify({ entradas: [{ tipo: 'dados', rotulo: 'Dados do período', obrigatoria: true }], etapas: [{ texto: 'Redigir com fatos, riscos e decisões.' }],
    entregaveis: [{ id: 'e1', tipo: 'relatorio', rotulo: 'Relatório executivo mensal', descricao: 'Relatório com fatos, riscos e decisões necessárias.' }] });
  const op = lerInterpretacao(ia, 'Prepare um relatório executivo mensal com principais fatos, riscos e decisões necessárias.');
  const rotulos = norm(op.entregaveis.map(rotuloEntregavel).join(' | '));
  for (const it of ['relatorio executivo', 'fatos', 'risco', 'decis']) assert.match(rotulos, new RegExp(it), rotulos);
});

test('QA-05: a quantidade do pedido conta o material, não o resultado', () => {
  const base = rotulo => ({ entregaveis: [{ id: 'e1', tipo: 'lista', rotulo: 'Resultado' }], entradas: [{ id: 'i1', tipo: 'texto', rotulo, obrigatoria: true }], ferramentas: [], etapas: [] });
  assert.notEqual(garantirInvariantes(base('Texto para resumo'), 'Resuma este texto em cinco pontos.', { soEntregaveis: true }).op.entradas[0].quantidade, 5);
  assert.equal(garantirInvariantes(base('Propostas de fornecedores'), 'Compare três propostas de fornecedores considerando preço.', { soEntregaveis: true }).op.entradas[0].quantidade, 3);
  assert.equal(garantirInvariantes(base('Material'), 'Compare os três fornecedores.', { soEntregaveis: true }).op.entradas[0].quantidade, 3);
});

test('QA-08: "pesquisa" como material interno não liga a pesquisa na internet; pedido de pesquisar continua ligando', async () => {
  const ia = JSON.stringify({ entradas: [{ tipo: 'planilha', rotulo: 'Respostas da pesquisa', obrigatoria: true }], etapas: [{ texto: 'Ler as respostas.' }],
    entregaveis: [{ id: 'e1', tipo: 'lista', rotulo: 'Pontos de insatisfação' }], ferramentas: ['analise_planilha'] });
  const interna = lerInterpretacao(ia, 'Avalie as respostas da pesquisa de clima e resuma os pontos de insatisfação mais citados.');
  assert.ok(!interna.ferramentas.includes('pesquisa_web'), 'o assunto interno iria para a busca externa');
  const externa = lerInterpretacao(ia, 'Analise as respostas da pesquisa de satisfação e pesquise na internet referências do setor.');
  assert.ok(externa.ferramentas.includes('pesquisa_web'));
  const sem = await qa.post('/api/quick-wins/assistente/interpretar', { descricao: 'Avalie as respostas da pesquisa de clima e resuma os pontos de insatisfação mais citados.' });
  assert.ok(!sem.dados.operacao.ferramentas.includes('pesquisa_web'), 'sem IA, o mesmo');
});

test('QA-09: provedor que aceita a conexão e não responde não pendura a interpretação', async () => {
  const { createServer } = await import('node:http');
  const { criarOpenRouter } = await import('../src/ia.js');
  const srv = createServer(req => { req.resume(); });   // nunca responde
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const T = await subir({ ia: criarOpenRouter({ chave: 'teste', base: `http://127.0.0.1:${srv.address().port}` }) });
  T.app.prazoChamadaCurtaMs = 800;
  try {
    salvarConfig(T.app.db, { dominios: ['exemplo.com.br'] });
    const admin = await T.cliente().entrar('admin@exemplo.com.br');
    await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
    const t0 = Date.now();
    const r = await admin.post('/api/quick-wins/assistente/interpretar', { descricao: 'Organize as pendências da obra e gere uma lista de itens priorizados.' });
    assert.equal(r.status, 200);
    assert.equal(r.dados.fonte, 'heuristica');
    assert.ok(r.dados.operacao.entregaveis.length > 0, 'o plano sem IA veio');
    assert.ok(Date.now() - t0 < 10e3, `demorou ${Date.now() - t0}ms`);
  } finally { await T.fechar(); srv.closeAllConnections?.(); srv.close(); }
});

// ---- Fechamento dos achados (QA-05, QA-06, QA-08, QA-10, QA-12) ----------------------------------------------
import * as OP from '../src/quickwin-operacao.js';
import * as C from '../src/quickwin-construtor.js';
import { invariantesDoPedido } from '../src/quickwin-interpretacao.js';

test('QA-05: mais ambiguidade numérica — conta o material, nunca o formato, o período ou o resultado', () => {
  const casos = [['Resuma em 3 parágrafos os 2 relatórios do mês.', 'Relatórios do mês', 2], ['Revise os dois contratos e aponte 3 diferenças.', 'Contratos', 2],
    ['Compare 4 currículos considerando experiência e inglês.', 'Currículos', 4], ['Gere 5 ideias de post a partir deste texto.', 'Texto', 1],
    ['Analise as vendas dos últimos 6 meses.', 'Vendas', 1], ['Liste os 3 principais riscos deste contrato.', 'Contrato', 1], ['Resuma este texto em cinco pontos.', 'Texto', 1]];
  for (const [pedido, rotulo, n] of casos) {
    const base = { entregaveis: [{ id: 'e1', tipo: 'lista', rotulo: 'Resultado' }], entradas: [{ id: 'i1', tipo: 'documento', rotulo, obrigatoria: true }], ferramentas: [], etapas: [] };
    assert.equal(garantirInvariantes(base, pedido, { soEntregaveis: true }).op.entradas[0].quantidade ?? 1, n, pedido);
  }
});

test('QA-08: "revise esta pesquisa" é material, não busca; "faça uma pesquisa na internet" continua sendo busca', async () => {
  for (const p of ['Revise esta pesquisa e corrija o texto.', 'Resuma a pesquisa anexada em cinco pontos.', 'Melhore a pesquisa interna de satisfação.']) {
    assert.equal(OP.pedePesquisaWeb(p), false, p);
    const r = await qa.post('/api/quick-wins/assistente/interpretar', { descricao: p });
    assert.ok(!r.dados.operacao.ferramentas.includes('pesquisa_web'), `sem IA: ${p}`);
  }
  for (const p of ['Faça uma pesquisa de preços na internet.', 'Pesquise concorrentes de software de RH.', 'Revise esta pesquisa e pesquise na web dados mais recentes.']) assert.equal(OP.pedePesquisaWeb(p), true, p);
});

test('QA-10: sem IA, os três pedidos da missão saem com a estrutura que pedem (não um relatório genérico)', async () => {
  const plano = async p => (await qa.post('/api/quick-wins/assistente/interpretar', { descricao: p })).dados.operacao;
  const cmp = await plano('Compare três propostas considerando preço, prazo, escopo e risco.');
  assert.equal(cmp.entradas[0].quantidade, 3);
  const m = cmp.entregaveis.find(e => ['tabela', 'matriz'].includes(e.tipo));
  assert.ok(m, 'comparação estruturada');
  for (const c of ['Preço', 'Prazo', 'Escopo', 'Risco']) assert.ok(m.config.colunas.includes(c), `critério ${c} na comparação`);
  assert.match(norm(cmp.etapas.map(x => x.texto).join(' ')), /compare tres propostas/, 'as etapas são o pedido, não um procedimento de modelo');
  const ata = await plano('Transforme esta reunião em ata, decisões e próximos passos.');
  assert.equal(ata.entradas[0].tipo, 'transcricao');
  assert.deepEqual(ata.entregaveis.map(rotuloEntregavel).map(norm), ['ata', 'decisoes', 'proximos passos']);
  const pl = await plano('Analise esta planilha e identifique desvios e anomalias.');
  assert.equal(pl.entradas[0].tipo, 'planilha');
  assert.deepEqual(pl.entregaveis.map(rotuloEntregavel).map(norm), ['desvios', 'anomalias']);
});

test('QA-10: sem IA, pedido sem objeto pergunta o mínimo (obrigatório); pedido sem lista sai com o trabalho literal', async () => {
  for (const p of ['Melhore isso.', 'Analise isso para mim.']) {
    const r = await qa.post('/api/quick-wins/assistente/interpretar', { descricao: p });
    assert.ok(r.dados.lacunas.some(l => l.obrigatoria && /o que exatamente deve ser feito/i.test(l.pergunta)), p);
  }
  const r = await qa.post('/api/quick-wins/assistente/interpretar', { descricao: 'Avalie o histórico de manutenção das bombas.' });
  assert.deepEqual(r.dados.operacao.entregaveis.map(e => [e.tipo, e.rotulo, e.descricao]), [['analise', 'Avaliação', 'Avalie o histórico de manutenção das bombas.']]);
  const nada = garantirInvariantes(OP.limparOperacao({ v: 2, entradas: [{ tipo: 'texto', rotulo: 'Material' }] }) || { canais: [], entregaveis: [], ferramentas: [], entradas: [{ tipo: 'texto', rotulo: 'Material', obrigatoria: true }] }, 'Quero algo sobre o tema do evento.');
  assert.equal(nada.op.entregaveis[0].tipo, 'outro');
  assert.equal(nada.op.entregaveis[0].config.detalhe, 'Quero algo sobre o tema do evento.', 'objetivo literal, nada inventado');
});

test('QA-06: o que o Quick Win produz nunca é material obrigatório; vídeo final vira pacote de produção, parcial', () => {
  const ia = JSON.stringify({ entradas: [{ tipo: 'texto', rotulo: 'Briefing da campanha', obrigatoria: true }], etapas: [{ texto: 'Entender a campanha' }],
    entregaveis: [{ id: 'e1', tipo: 'video', rotulo: 'Vídeo final' }], ferramentas: ['base_empresa'] });
  const op = lerInterpretacao(ia, 'Crie o vídeo final desta campanha.');
  assert.equal(op.entradas[0].obrigatoria, false, 'o briefing é o que o Quick Win produz');
  assert.ok(op.ferramentas.includes('geracao_video'));
  const rotulos = op.entregaveis.map(rotuloEntregavel);
  for (const r of ['Conceito', 'Roteiro', 'Storyboard e cenas', 'Locução', 'Briefing de produção', 'Prompt para ferramenta de vídeo']) assert.ok(rotulos.includes(r), `${r} em [${rotulos}]`);
  // Material que o pedido diz que vem pronto continua obrigatório.
  assert.equal(lerInterpretacao(ia, 'Crie o vídeo final a partir do briefing enviado pela agência.').entradas[0].obrigatoria, true);
  const espec = C.construir({ descricao: 'Crie o vídeo final desta campanha.', operacao: { ...op, origem: 'ia' } });
  const p = C.promptExecucao(espec, { nome: 'x' });
  assert.match(p, /nunca os peça como material\. Só pergunte se o tema ou a campanha não estiverem em lugar nenhum/);
  assert.match(p, /Ferramenta indisponível: "Geração de vídeo" não existe nesta execução/);
});

test('QA-06: A (campanha no contexto) entrega o pacote e fica parcial; C (sem ferramenta) não aceita arquivo simulado', async () => {
  const op = lerInterpretacao(JSON.stringify({ entregaveis: [{ id: 'e1', tipo: 'video', rotulo: 'Vídeo final' }], entradas: [] }), 'Crie o vídeo final desta campanha.');
  const espec = C.construir({ descricao: 'Crie o vídeo final desta campanha.', operacao: { ...op, origem: 'ia' } });
  const pacote = op.entregaveis.map(e => `## ${rotuloEntregavel(e)}\n${OP.ehVisual(e) ? `${OP.MARCA_BRIEFING}\n` : ''}Conteúdo sobre a campanha Verão Fictício.`).join('\n\n') + '\n\n## Informações não encontradas\nNenhuma';
  const chamar = async () => ({ texto: '{"criterios":[],"objetivo_atingido":true}' });
  const a = await C.conferirComCorrecao({ espec, resposta: pacote, entrada: 'Campanha Verão Fictício: lançamento do filtro solar.', mensagens: [], chamar });
  assert.equal(a.registro.status, 'parcial', 'sem a peça final, nunca aprovado');
  assert.deepEqual(a.registro.objetivo, { atingido: false, motivo: 'ferramenta_indisponivel' });
  assert.match(C.resumoQualidade(a.registro).avisos[0], /a peça final \(vídeo ou imagem\) não é gerada aqui/);
  const simulado = await C.conferirComCorrecao({ espec, resposta: `${pacote}\n\nBaixe aqui: campanha_final.mp4`, entrada: 'Campanha Verão Fictício.', mensagens: [], chamar, usarIA: false });
  assert.ok(simulado.registro.falhas.includes('invencao'), 'arquivo de vídeo simulado');
  // B: sem tema nem campanha em lugar nenhum, a pergunta da execução é o resultado (status pergunta), nunca o pacote inventado.
  const b = await C.conferirComCorrecao({ espec, resposta: `${C.MARCADOR_PERGUNTA} qual é a campanha (tema e mensagem) do vídeo?`, mensagens: [], chamar });
  assert.equal(b.registro.status, 'pergunta');
});

test('QA-12: dependência inválida é normalizada quando dá, removida quando não dá, e a validação sabe', () => {
  const ia = JSON.stringify({ entradas: [{ tipo: 'documento', rotulo: 'Contrato', obrigatoria: true }], etapas: [{ texto: 'Ler' }],
    entregaveis: [{ id: 'a', tipo: 'resumo', rotulo: 'Resumo' }, { id: 'b', tipo: 'riscos', rotulo: 'Riscos', depende_de: ['1', 'Resumo', 'zz', 'b', 'c'] }, { id: 'c', tipo: 'lista', rotulo: 'Ações' }] });
  const op = lerInterpretacao(ia, 'Analise o contrato e destaque riscos e ações.');
  assert.deepEqual(op.entregaveis.find(e => rotuloEntregavel(e) === 'Riscos').depende_de, ['e1'], 'posição e rótulo apontam para o mesmo, sem ambiguidade');
  assert.deepEqual(op.ajustes.map(a => `${a.acao}:${a.motivo}`), ['normalizada:posicao', 'normalizada:rotulo', 'removida:inexistente', 'removida:propria', 'removida:ciclo']);
  assert.ok(op.corrigidas.includes('estrutura:removida_inexistente'));
  assert.doesNotMatch(JSON.stringify(op.ajustes), /Resumo|Riscos|zz/, 'metadado técnico, sem texto do plano');
  // Plano válido não registra correção estrutural.
  assert.equal(lerInterpretacao(JSON.stringify({ entregaveis: [{ id: 'a', tipo: 'resumo' }, { id: 'b', tipo: 'lista', rotulo: 'Ações', depende_de: ['a'] }] }), 'Resuma e liste ações.').ajustes, undefined);
});
