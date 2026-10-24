// Mostra o contrato de saída (formato, colunas, seções) e os entregáveis guardados de Quick Wins desta sessão.
export default async function (c, ids = '') {
  for (const id of ids.split(',').map(Number).filter(Boolean)) {
    const q = (await c.api('GET', `/api/quick-wins/${id}`)).dados;
    const e = q?.especificacao || q?.espec || null;
    const es = typeof e === 'string' ? JSON.parse(e) : e;
    c.log(id, q?.nome, JSON.stringify({ formato: q.formato, formato_saida: q.formato_saida, arquetipo: q.arquetipo, regras: q.regras, entregas: q.entregas, operacao_entregaveis: q.operacao?.entregaveis?.map(x => [x.tipo, x.rotulo, x.config]) }).slice(0, 1500));
  }
}
