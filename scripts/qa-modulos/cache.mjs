// §14. Cache da interpretação: mesmo pedido (reaproveita), pedido levemente alterado (novo plano), e o rascunho de
// um Quick Win (quick_win_id) — sem plano antigo reaproveitado errado.
export default async function (c) {
  const p = 'Faça um resumo das reclamações de clientes da semana e sugira três ações.';
  const med = async (d, extra = {}) => { const t0 = Date.now(); const r = await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao: d, ...extra }); return { ms: Date.now() - t0, status: r.status, chave: r.dados?.chave || null, fonte: r.dados?.fonte, entregaveis: (r.dados?.operacao?.entregaveis || []).map(e => e.tipo) }; };
  const a = await med(p), b = await med(p), c2 = await med(p.replace('três', 'cinco')), d = await med(p, { processo: 'Use as reclamações enviadas por e-mail.' });
  const out = { mesmo_pedido: [a, b], alterado: c2, com_processo: d, reaproveitou: a.chave && a.chave === b.chave, alterado_tem_outra_chave: c2.chave !== a.chave };
  c.salvar('06-cache', out); c.log(JSON.stringify(out));
}
