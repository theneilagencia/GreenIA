// QA 2026-10 (QA-02): o cache da interpretação dos Quick Wins é por empresa. A chave levava `app.tenant.id`, que
// não existe (a empresa é `tenant.companyId`): o prefixo saía vazio e o cache, que é do processo, era um só para
// todas as empresas. A empresa B recebia, sem chamada nem registro próprio, o plano interpretado para a A.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso } from './openrouter-falso.js';
import { todos } from '../src/db.js';
import { limparCacheInterpretacao } from '../src/quickwin-interpretacao.js';

const PEDIDO = 'Revise os relatórios de inspeção e liste as não conformidades com prazo de correção.';
const PLANO = JSON.stringify({ resumo: 'Revisa inspeções.', entradas: [{ tipo: 'documento', rotulo: 'Relatórios de inspeção', obrigatoria: true }],
  etapas: [{ texto: 'Ler os relatórios' }], entregaveis: [{ id: 'e1', tipo: 'tabela', rotulo: 'Não conformidades' }], ferramentas: ['leitura_documento'] });
let S, OR, ana, bia, A, B;

async function empresa(ops, nome, slug, email) {
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company'));
  const c = (await ops.post('/api/plataforma/empresas', { name: nome, slug, plan_id: plano.id, admin_email: email, status: 'ativa' })).dados;
  const n = S.navegador();
  await n.get(`/${slug}`);
  assert.equal((await n.entrarEmpresa(email)).status, 200);
  await n.post('/api/politica/ciencia', { versao: (await n.get('/api/politica')).dados.versao });
  return { c, n };
}

before(async () => {
  limparCacheInterpretacao();
  OR = await openRouterFalso({ responder: () => PLANO });
  S = await subirPlataforma({ ia: OR.ia });
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  ({ c: A, n: ana } = await empresa(ops, 'Alfa Fictícia', 'alfaqa', 'ana@alfaqa.exemplo'));
  ({ c: B, n: bia } = await empresa(ops, 'Beta Fictícia', 'betaqa', 'bia@betaqa.exemplo'));
});
after(async () => { await S?.fechar(); await OR?.fechar(); });

const interpretados = c => todos(S.P.tenant(c.id).db, "select detalhes from eventos where tipo = 'quickwin.interpreted'").length;

test('o mesmo pedido em duas empresas: cada uma interpreta, chama e registra o seu plano', async () => {
  const antes = OR.chamadas.length;
  const ra = await ana.post('/api/quick-wins/assistente/interpretar', { descricao: PEDIDO });
  assert.equal(ra.status, 200, JSON.stringify(ra.dados));
  assert.equal(ra.dados.fonte, 'ia');
  assert.equal(OR.chamadas.length, antes + 1, 'A chamou o modelo');

  const rb = await bia.post('/api/quick-wins/assistente/interpretar', { descricao: PEDIDO });
  assert.equal(rb.status, 200, JSON.stringify(rb.dados));
  assert.equal(OR.chamadas.length, antes + 2, 'B reaproveitou o plano interpretado para A: o cache cruzou empresas');
  assert.notEqual(rb.dados.cache, true);
  assert.equal(interpretados(A), 1);
  assert.equal(interpretados(B), 1, 'a interpretação de B não ficou registrada em B');

  // Dentro da mesma empresa, o reaproveitamento continua.
  const rb2 = await bia.post('/api/quick-wins/assistente/interpretar', { descricao: PEDIDO });
  assert.equal(rb2.dados.cache, true);
  assert.equal(OR.chamadas.length, antes + 2);
});

test('QA-07: a auditoria da interpretação registra o tipo da correção, não o texto do pedido', async () => {
  const r = await ana.post('/api/quick-wins/assistente/interpretar', { descricao: 'Revise as atas e liste as deliberações sigilosas pendentes.' });
  assert.equal(r.status, 200);
  const ev = todos(S.P.tenant(A.id).db, "select detalhes from eventos where tipo = 'quickwin.interpreted' order by id desc limit 1")[0].detalhes;
  assert.match(ev, /"entregavel"/, 'a correção continua registrada pelo tipo');
  assert.doesNotMatch(ev, /sigilosa|delibera/i, 'texto do pedido foi para a auditoria');
});

test('QA-12: correção estrutural do plano chega na resposta e na auditoria só como contagem', async () => {
  OR.responder = () => JSON.stringify({ entradas: [{ tipo: 'documento', rotulo: 'Relatórios', obrigatoria: true }], etapas: [{ texto: 'Ler' }],
    entregaveis: [{ id: 'e1', tipo: 'lista', rotulo: 'Pendências sigilosas' }, { id: 'e2', tipo: 'tabela', rotulo: 'Prazos', depende_de: ['e9', 'e2', '1'] }] });
  try {
    const r = await ana.post('/api/quick-wins/assistente/interpretar', { descricao: 'Revise os relatórios e liste pendências e prazos de cada área.' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.dados.ajustes_estruturais, { normalizadas: 1, removidas: 2 });
    assert.deepEqual(r.dados.operacao.entregaveis[1].depende_de, ['e1']);
    const ev = JSON.parse(todos(S.P.tenant(A.id).db, "select detalhes from eventos where tipo = 'quickwin.interpreted' order by id desc limit 1")[0].detalhes);
    assert.deepEqual(ev.estrutura, { normalizadas: 1, removidas: 2 });
    assert.ok(ev.invariantes.includes('estrutura'));
    assert.doesNotMatch(JSON.stringify(ev), /sigilosas|Prazos|e9/);
  } finally { OR.responder = () => PLANO; }
});

test('QA-02 (revalidação): a mesma frase em empresas e contextos diferentes — caches, planos e eventos independentes', async () => {
  const FRASE = 'Analise as reclamações do mês e agrupe por motivo, frequência e prioridade.';
  const planoDe = rotulo => JSON.stringify({ entradas: [{ tipo: 'texto', rotulo, obrigatoria: true }], etapas: [{ texto: 'Ler' }], entregaveis: [{ id: 'e1', tipo: 'tabela', rotulo: 'Motivos' }] });
  OR.responder = b => planoDe(JSON.stringify(b).includes('Como a pessoa faz hoje') ? 'Exportação do CRM' : 'Reclamações coladas');
  try {
    const antes = OR.chamadas.length;
    const ra = await ana.post('/api/quick-wins/assistente/interpretar', { descricao: FRASE });
    const rb = await bia.post('/api/quick-wins/assistente/interpretar', { descricao: FRASE, processo: 'Hoje exporto do CRM toda segunda.' });
    const rb2 = await bia.post('/api/quick-wins/assistente/interpretar', { descricao: FRASE });
    assert.equal(OR.chamadas.length, antes + 3, 'cada empresa e cada contexto interpretam por si');
    assert.equal(ra.dados.operacao.entradas[0].rotulo, 'Reclamações coladas');
    assert.equal(rb.dados.operacao.entradas[0].rotulo, 'Exportação do CRM');
    assert.equal(rb2.dados.operacao.entradas[0].rotulo, 'Reclamações coladas');
    assert.notEqual(ra.dados.chave, rb.dados.chave, 'outro contexto, outra chave');
    assert.equal(ra.dados.chave, rb2.dados.chave, 'mesma frase, mesma chave...');
    assert.notEqual(rb2.dados.cache, true, '...mas o cache de A não serve a B');
    const n = c => todos(S.P.tenant(c.id).db, "select 1 from eventos where tipo = 'quickwin.interpreted'").length;
    const [na, nb] = [n(A), n(B)];
    await ana.post('/api/quick-wins/assistente/interpretar', { descricao: FRASE });
    assert.equal(n(A), na, 'na mesma empresa, reaproveita sem novo evento');
    assert.equal(n(B), nb, 'nada de A aparece em B');
  } finally { OR.responder = () => PLANO; }
});
