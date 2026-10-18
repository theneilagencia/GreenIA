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
// Mantém o corpo original intacto para a aplicação. Imagens usam JSON, texto normalmente SSE.
export function observarResposta(c, resposta, stream = true) {
  c.formatoResposta = stream === false || /application\/json/i.test(resposta.headers.get('content-type') || '') ? 'json' : 'sse';
  const copia = resposta.clone();
  c.pronto = (async () => {
    if (c.formatoResposta === 'json') registrarRecibo(c, await copia.json());
    else {
      const dec = new TextDecoder(); let resto = '';
      const linha = l => {
        if (!l.startsWith('data:')) return;
        const dado = l.slice(5).trim(); if (dado === '[DONE]') return;
        try { registrarRecibo(c, JSON.parse(dado)); } catch { c.reciboMalformado = true; }
      };
      for await (const pedaco of copia.body) {
        resto += dec.decode(pedaco, { stream: true });
        const linhas = resto.split('\n'); resto = linhas.pop(); linhas.forEach(linha);
      }
      resto += dec.decode(); if (resto.trim()) linha(resto);
    }
  })().catch(() => { c.erroStream = 'Falha na coleta da resposta do provedor'; }).finally(() => { c.ms = Date.now() - c.t0; });
  return resposta;
}
export function falhasDaEntrega(x) {
  const f = [];
  if (x.http !== 200) f.push(`HTTP de execução ${x.http}`);
  if (x.falha || x.status === 'erro') f.push('execução falhou');
  if (x.status === 'inconsistente') f.push('resultado inconsistente');
  if (!x.finalizou) f.push('evento final ausente');
  if (!String(x.texto || '').trim()) f.push('resposta vazia');
  if (!x.chamadasReais) f.push('nenhuma inferência comprovada nesta execução');
  if (x.custosPendentes) f.push('custo pendente de comprovação');
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
export function canaisNaoPedidos(pedido, entregaveis) {
  const t = String(pedido).toLowerCase();
  const citados = { linkedin: /linked\s?in/, instagram: /instagram|\binsta\b|\breels?\b/, facebook: /facebook/, tiktok: /tik\s?tok/, youtube: /youtube|\bshorts\b/, x: /twitter|\btweets?\b|\b(?:no|para o) x\b/, blog: /blog|artigo/, email: /e-?mail|newsletter/ };
  return [...new Set(entregaveis.map(e => e.canal).filter(c => c && !citados[c]?.test(t)))];
}
