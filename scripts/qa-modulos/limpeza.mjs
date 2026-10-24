// Limpeza somente dos IDs registrados como criados pela missão. Nome de QA ou Sandbox não prova propriedade.
// Recursos antigos encontrados no catálogo são candidatos para revisão, nunca alvos automáticos.
// A configuração da empresa permanece como está; o módulo que a altera deve restaurar seu próprio estado anterior.
export default async function (c) {
  const out = { quick_wins: [], conectores: [], integracoes: null, restantes_qa: [], candidatos_conectores: [] };
  const lista = async () => ((await c.api('GET', '/api/quick-wins')).dados?.quickWins || []);
  const ids = new Set(c.estado.criados?.quick_wins || []);
  for (const id of ids) {
    const g = await c.api('GET', `/api/quick-wins/${id}`);
    if (g.status === 404) { out.quick_wins.push([id, 'ja_excluido']); continue; }
    if (!/^QA - /.test(g.dados?.nome || '')) { out.quick_wins.push([id, 'nao_e_qa']); continue; }
    out.quick_wins.push([id, (await c.api('DELETE', `/api/quick-wins/${id}`)).status]);
  }
  const integ = (await c.api('GET', '/api/admin/integracoes')).dados;
  const conectores = new Set(c.estado.criados?.conectores || []);
  for (const k of integ?.conectores || []) if (/^QA\b|QA - |Sandbox/i.test(k.nome || '') && !conectores.has(k.id)) out.candidatos_conectores.push(k.id);
  for (const id of conectores) {
    const g = await c.api('GET', `/api/admin/integracoes/${id}`);
    if (g.status === 404) { out.conectores.push([id, 'ja_excluido']); continue; }
    if (g.status !== 200 || !/^QA - /.test(g.dados?.nome || '')) { out.conectores.push([id, 'nao_confirmado_como_qa']); continue; }
    out.conectores.push([id, g.dados.status === 'REVOKED' ? 'ja_revogado' : (await c.api('POST', `/api/admin/integracoes/${id}/revogar`, {})).status]);
  }
  const cfg = (await c.api('GET', '/api/admin/config')).dados?.integracoes;
  out.integracoes = (await c.api('GET', '/api/admin/config')).dados?.integracoes?.ativa ?? null;
  out.restantes_qa = (await lista()).filter(q => /^QA - /.test(q.nome)).map(q => q.id);
  c.salvar('99-limpeza', out);
  c.log(`QWs: ${out.quick_wins.length} (${out.quick_wins.filter(x => x[1] === 200).length} excluídos) conectores: ${JSON.stringify(out.conectores)} integracoes.ativa=${out.integracoes} restantes QA: ${out.restantes_qa.length}`);
}
