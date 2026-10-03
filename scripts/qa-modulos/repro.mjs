// Reproduz localmente (código desta cópia) o contrato que a produção gravou, com a mesma interpretação.
import { construir } from '../../src/quickwin-construtor.js';
export default async function (c) {
  const descricao = 'Liste os três fornecedores com o preço mensal de cada um, em uma tabela.';
  const it = (await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao })).dados;
  const est = (await c.api('POST', '/api/quick-wins/assistente/estrutura', { descricao })).dados;
  const op = { ...it.operacao, origem: 'pessoa' };
  const assistente = { descricao, como: { modo: 'pronto' }, operacao: op, interpretacao: { chave: it.chave, operacao: it.operacao }, estrutura_objetivo: est.chave ? { chave: est.chave, colunas: est.colunas || [], falhou: !!est.falhou } : null };
  const local = construir(assistente);
  c.log('local', JSON.stringify(local.formato_saida), JSON.stringify(op.entregaveis.map(e => [e.tipo, e.canal, !!e.visual])));
  const q = await c.api('POST', '/api/quick-wins', { nome: 'QA - Repro contrato', ...c.destino, assistente });
  c.estado.criados.quick_wins.push(q.dados.id);
  const g = (await c.api('GET', `/api/quick-wins/${q.dados.id}`)).dados;
  c.log('producao', g.formato_saida, JSON.stringify(g.entregas));
  await c.api('PUT', `/api/quick-wins/${q.dados.id}`, { nome: 'QA - Repro contrato' });
  c.log('depois do PUT nome', (await c.api('GET', `/api/quick-wins/${q.dados.id}`)).dados.formato_saida);
  const conv = (await c.api('POST', '/api/conversas', { quick_win_id: q.dados.id, teste: true })).dados.conversa.id;
  c.log('depois de abrir teste', (await c.api('GET', `/api/quick-wins/${q.dados.id}`)).dados.formato_saida, conv);
}
export async function depois(c) {}
