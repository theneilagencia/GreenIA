// Limpeza do que esta sessão de QA criou: Quick Wins "QA - " (exclusão lógica, a mesma da tela), conectores de teste
// revogados e a configuração de integrações de volta a desligada. Nada que a sessão não criou é tocado.
export default async function (c) {
  const out = { quick_wins: [], conectores: [], integracoes: null, restantes_qa: [] };
  for (const id of [...new Set(c.estado.criados.quick_wins)]) {
    const g = await c.api('GET', `/api/quick-wins/${id}`);
    if (g.status === 404) { out.quick_wins.push([id, 'ja_excluido']); continue; }
    if (!/^QA - /.test(g.dados?.nome || '')) { out.quick_wins.push([id, 'nao_e_qa', g.dados?.nome]); continue; }
    const r = await c.api('DELETE', `/api/quick-wins/${id}`);
    out.quick_wins.push([id, r.status]);
  }
  for (const id of [...new Set(c.estado.criados.conectores)]) {
    const r = await c.api('POST', `/api/admin/integracoes/${id}/revogar`, {});
    out.conectores.push([id, r.status]);
  }
  const cfg = (await c.api('GET', '/api/admin/config')).dados?.integracoes;
  if (cfg?.ativa) await c.api('PUT', '/api/admin/config', { integracoes: { ...cfg, ativa: false, pessoas: [] } });
  out.integracoes = (await c.api('GET', '/api/admin/config')).dados?.integracoes?.ativa ?? null;
  const lista = (await c.api('GET', '/api/quick-wins')).dados;
  out.restantes_qa = (lista?.quickWins || lista?.quick_wins || lista || []).filter?.(q => /^QA - /.test(q.nome)).map(q => [q.id, q.nome]) || [];
  c.salvar('99-limpeza', out);
  c.log(`QWs: ${out.quick_wins.length} (${out.quick_wins.filter(x => x[1] === 200).length} excluídos) conectores: ${JSON.stringify(out.conectores)} integracoes.ativa=${out.integracoes} restantes QA: ${out.restantes_qa.length}`);
}
