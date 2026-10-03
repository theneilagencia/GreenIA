// Limpeza do que a QA criou: Quick Wins "QA - " (exclusão lógica, a mesma da tela), conectores de teste revogados e a
// configuração de integrações de volta a desligada. Nada fora do prefixo "QA - " é tocado.
// Fonte da lista: o estado da sessão; se a sessão foi refeita (estado perdido), o catálogo — no início da missão o
// catálogo tinha só o Quick Win real da empresa e as missões anteriores já tinham excluído os "QA - " delas.
export default async function (c) {
  const out = { quick_wins: [], conectores: [], integracoes: null, restantes_qa: [] };
  const lista = async () => ((await c.api('GET', '/api/quick-wins')).dados?.quickWins || []);
  const ids = new Set(c.estado.criados.quick_wins);
  for (const q of await lista()) if (/^QA - /.test(q.nome) && q.podeEditar) ids.add(q.id);
  for (const id of ids) {
    const g = await c.api('GET', `/api/quick-wins/${id}`);
    if (g.status === 404) { out.quick_wins.push([id, 'ja_excluido']); continue; }
    if (!/^QA - /.test(g.dados?.nome || '')) { out.quick_wins.push([id, 'nao_e_qa']); continue; }
    out.quick_wins.push([id, (await c.api('DELETE', `/api/quick-wins/${id}`)).status]);
  }
  const integ = (await c.api('GET', '/api/admin/integracoes')).dados;
  const conectores = new Set(c.estado.criados.conectores);
  for (const k of integ?.conectores || []) if (/^QA\b|QA - |Sandbox/i.test(k.nome || '') && !/revog/i.test(k.status || '')) conectores.add(k.id);
  for (const id of conectores) out.conectores.push([id, (await c.api('POST', `/api/admin/integracoes/${id}/revogar`, {})).status]);
  const cfg = (await c.api('GET', '/api/admin/config')).dados?.integracoes;
  if (cfg?.ativa) await c.api('PUT', '/api/admin/config', { integracoes: { ...cfg, ativa: false, pessoas: [] } });
  out.integracoes = (await c.api('GET', '/api/admin/config')).dados?.integracoes?.ativa ?? null;
  out.restantes_qa = (await lista()).filter(q => /^QA - /.test(q.nome)).map(q => q.id);
  c.salvar('99-limpeza', out);
  c.log(`QWs: ${out.quick_wins.length} (${out.quick_wins.filter(x => x[1] === 200).length} excluídos) conectores: ${JSON.stringify(out.conectores)} integracoes.ativa=${out.integracoes} restantes QA: ${out.restantes_qa.length}`);
}
