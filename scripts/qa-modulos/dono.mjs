// Confere se os ids que abriram no teste de acesso são da própria pessoa (conversas e artefatos de sessões
// anteriores de QA) ou de outra pessoa. Só ids e o dono (sim/não); nenhum conteúdo.
export default async function (c) {
  const lista = (await c.api('GET', '/api/conversas')).dados;
  const minhas = new Set((lista?.conversas || lista || []).map(x => x.id));
  const out = {};
  for (const id of [1, 2, 3, 111, 112]) out[`conv_${id}`] = { minha_na_lista: minhas.has(id) };
  for (const id of [1, 2]) { const a = await c.api('GET', `/api/artefatos/${id}`); out[`art_${id}`] = { status: a.status, conversa_minha: minhas.has(a.dados?.artefato?.conversa_id ?? -1) }; }
  out.total_minhas = minhas.size;
  c.salvar('07b-dono', out); c.log(JSON.stringify(out));
}
