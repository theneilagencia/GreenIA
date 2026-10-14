// Homologação (Etapa 6): casos da programação em produção, sem esperar o horário.
//   versao   → publica nova versão do Quick Win e tenta executar: deve recusar (versao_alterada), sem execução nova;
//   pausar   → pausa a programação de teste (estado final do teste);
//   duplicar → tenta executar duas vezes seguidas: no máximo uma na fila (max_dia=1 já usado hoje → recusa).
export default async function (c, caso, letra = 'A') {
  const h = c.estado.homolog?.[letra] || {}, qw = h.quick_win, p = h.programacao;
  const base = `/api/quick-wins/${qw}/programacoes/${p}`;
  const estado = async () => { const r = await c.api('GET', `/api/quick-wins/${qw}/programacoes`); const s = (r.dados?.programacoes || []).find(x => x.id === p) || {}; return { ativa: s.ativa, versao_id: s.versao_id, proxima_em: s.proxima_em, execucoes: (s.execucoes || []).map(e => [e.status, e.motivo]) }; };
  const out = { caso, antes: await estado() };
  if (caso === 'duplicar') { out.primeira = (await c.api('POST', `${base}/executar`, {})).status; out.segunda = (await c.api('POST', `${base}/executar`, {})); out.segunda = [out.segunda.status, out.segunda.dados?.erro]; }
  if (caso === 'versao') {
    out.publicar = (await c.api('POST', `/api/quick-wins/${qw}/publicar`, { para_que_serve: `Resumo sintético de homologação ${letra} (v3)` })).status;
    const r = await c.api('POST', `${base}/executar`, {}); out.executar = [r.status, r.dados?.erro];
    const a = await c.api('POST', `${base}/estado`, { ativa: true }); out.reativar = [a.status, a.dados?.erro];
  }
  if (caso === 'pausar') { const r = await c.api('POST', `${base}/estado`, { ativa: false }); out.pausar = [r.status, r.dados?.erro || null]; }
  out.depois = await estado();
  c.salvar(`homolog-prog-${caso}-${Date.now()}`, out); c.log('caso', JSON.stringify(out));
}
