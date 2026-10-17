// §16. Acesso: objetos que não são desta pessoa (ou não existem nesta empresa) não abrem; rotas de plataforma e
// de outra empresa recusadas. Só ids; nenhum conteúdo de terceiros é guardado (só o status HTTP).
export default async function (c) {
  const minhas = Object.values(c.estado.conversas).flat();
  const menor = Math.min(...minhas);
  const out = { conversas_alheias: [], quick_wins: [], artefatos: [], outros: {} };
  for (const id of [1, 2, 3, menor - 1, menor - 2, 999999]) if (id > 0 && !minhas.includes(id)) out.conversas_alheias.push([id, (await c.api('GET', `/api/conversas/${id}`)).status]);
  for (const id of [999999, 1]) out.quick_wins.push([id, (await c.api('GET', `/api/quick-wins/${id}`)).status]);
  for (const id of [1, 2, 999999]) out.artefatos.push([id, (await c.binario(`/api/artefatos/${id}`)).status, (await c.binario(`/api/artefatos/${id}/baixar?formato=pdf`)).status]);
  out.outros.plataforma_empresas = (await c.api('GET', '/api/plataforma/empresas')).status;
  out.outros.integracao_alheia = (await c.api('GET', '/api/admin/integracoes/con_00000000000000000000')).status;
  out.outros.plano_alheio = (await c.api('GET', '/api/integracoes/planos/pln_00000000000000000000')).status;
  out.outros.mensagem_em_conversa_alheia = (await c.pedir('POST', `/api/conversas/${menor - 1}/mensagens`, { texto: 'oi' })).status;
  c.salvar('07-idor', out); c.log(JSON.stringify(out));
}
