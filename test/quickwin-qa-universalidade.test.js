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
