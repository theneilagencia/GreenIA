// Homologação (Etapa 6): estado da programação, execuções e eventos de aviso (sem conteúdo nem endereço).
export default async function (c, letra = 'A') {
  const L = String(letra).toUpperCase(), h = c.estado.homolog?.[L];
  const p = await c.api('GET', `/api/quick-wins/${h.quick_win}/programacoes`);
  const ev = await c.api('GET', '/api/admin/eventos?prefixo=quickwin.');
  const eventos = (ev.dados?.eventos || []).filter(e => /scheduled/.test(e.tipo)).map(e => ({ tipo: e.tipo, em: e.em, detalhes: e.detalhes || e.dados || null }));
  const out = { programacoes: p.status === 200 ? (p.dados?.programacoes || p.dados) : p.status, eventos };
  c.salvar(`homolog-conferir-prog-${L}-${Date.now()}`, out);
  c.log(JSON.stringify(out).slice(0, 1800));
}
