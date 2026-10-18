// Critérios do coletor, separados da resposta do modelo. Nunca converte custo ausente em zero.
export function registrarRecibo(c, d) {
  if (d.id) c.geracao = d.id;
  if (d.model) c.modeloResposta = d.model;
  if (d.provider) c.provedor = d.provider;
  if (d.error) c.erroProvedor = true;
  if (d.usage) {
    c.tokens = { entrada: d.usage.prompt_tokens ?? null, saida: d.usage.completion_tokens ?? null };
    if (typeof d.usage.cost === 'number' && Number.isFinite(d.usage.cost) && d.usage.cost >= 0) c.custo = d.usage.cost;
  }
}
export function falhasDaEntrega(x) {
  const f = [];
  if (x.http !== 200) f.push(`HTTP de execução ${x.http}`);
  if (x.falha || x.status === 'erro') f.push('execução falhou');
  if (x.status === 'inconsistente') f.push('resultado inconsistente');
  if (!x.finalizou) f.push('evento final ausente');
  if (!String(x.texto || '').trim()) f.push('resposta vazia');
  if (!x.chamadasReais) f.push('nenhuma inferência comprovada nesta execução');
  return f;
}
export function consolidarRecibos(chamadas) {
  const pendentes = chamadas.filter(c => c.custo === null || c.custo === undefined);
  return {
    tentativas: chamadas.length,
    inferenciasComRecibo: chamadas.filter(c => c.status === 200 && c.geracao && c.modeloResposta && !c.erroStream && !c.erroProvedor).length,
    custoConfirmadoUsd: chamadas.reduce((s, c) => s + (Number.isFinite(c.custo) ? c.custo : 0), 0),
    custoTotalUsd: pendentes.length ? null : chamadas.reduce((s, c) => s + c.custo, 0),
    tentativasComCustoPendente: pendentes.length,
    // Autenticação real, arquivos e adequação ao trabalho têm aceitação própria.
    liberacaoProducao: false,
  };
}
