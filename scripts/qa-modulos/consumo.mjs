// Consumo real da empresa (somente leitura): plano, uso por mês (sem execuções de teste), por classe, modelo e
// quick win, e cada resposta registrada (evento credits.consumed: classe e custo). Para conferir a formação de preço.
// Uso: rodar consumo
export default async function (c) {
  const eu = (await c.api('GET', '/api/eu')).dados;
  const out = { unidade: eu.unidade, operador: eu.operador, plano: eu.plano, meses: {}, respostas: [] };
  const atual = (await c.api('GET', '/api/admin/uso')).dados;
  const meses = (atual.tendencia || []).map(t => t.mes);
  for (const m of [...new Set([...meses, atual.mes])]) out.meses[m] = (await c.api('GET', `/api/admin/uso?mes=${m}`)).dados;
  for (let pagina = 0; ; pagina++) {
    const r = (await c.api('GET', `/api/admin/eventos?tipo=credits.consumed&pagina=${pagina}`)).dados;
    const evs = r?.eventos || [];
    for (const e of evs) { let d = {}; try { d = JSON.parse(e.detalhes); } catch {} out.respostas.push({ em: e.em, classe: d.classe ?? null, modelo: d.modelo_usado ?? null, creditos: d.creditos ?? null, custo: d.custo ?? null, quick_win: d.quick_win ?? null, origem: d.origem ?? null }); }
    if (evs.length < 100) break;
  }
  out.pacotes = atual.pacotes || [];
  c.salvar('50-consumo', out);
  c.log('unidade', out.unidade, 'operador', out.operador, 'plano', JSON.stringify(out.plano));
  c.log('meses', JSON.stringify(Object.fromEntries(Object.entries(out.meses).map(([m, u]) => [m, u.totais]))));
  c.log('respostas registradas', out.respostas.length);
}
