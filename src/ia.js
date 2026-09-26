// Acesso a modelos de IA. Uma camada só, o OpenRouter (API compatível com a da
// OpenAI). O resto do código fala só com enviar(mensagens, opções) e
// listarModelos(), para trocar de camada no futuro se for preciso.

export class ErroIA extends Error {
  constructor(mensagem, status = 502) { super(mensagem); this.status = status; }
}

// Preferências de privacidade (seção 9): vão em toda chamada.
//  - normal: só fornecedores que não treinam com os dados (a não ser que o admin desligue);
//    com modelo de reserva, o OpenRouter tenta o principal e cai no reserva.
//  - sigilosa: fornecedor fixado, retenção zero exigida, sem cair para outro fornecedor.
export function montarCorpo(mensagens, op) {
  const corpo = { model: op.modelo, messages: mensagens, stream: true, usage: { include: true } };
  if (op.sigilosa) {
    if (!op.fornecedor) throw new ErroIA('Modelo homologado sem fornecedor fixado.', 400);
    corpo.provider = { order: [op.fornecedor], only: [op.fornecedor], allow_fallbacks: false, zdr: true, data_collection: 'deny' };
  } else {
    corpo.provider = { data_collection: op.semTreino === false ? 'allow' : 'deny' };
    if (op.reserva) corpo.models = [op.modelo, op.reserva];
  }
  if (op.maxTokens) corpo.max_tokens = op.maxTokens;
  return corpo;
}

export function criarOpenRouter({ chave, base = 'https://openrouter.ai/api/v1', fetch: f = globalThis.fetch, titulo = 'GreenIA' }) {
  const cab = { authorization: `Bearer ${chave}`, 'content-type': 'application/json', 'x-title': titulo };
  return {
    async listarModelos() {
      const r = await f(`${base}/models`, { headers: cab });
      if (!r.ok) throw new ErroIA(`OpenRouter respondeu ${r.status} na lista de modelos.`);
      return ((await r.json()).data || []).map(m => ({
        id: m.id, nome: m.name || m.id, fornecedor: m.id.split('/')[0],
        precoEntrada: Number(m.pricing?.prompt ?? NaN), precoSaida: Number(m.pricing?.completion ?? NaN), contexto: m.context_length ?? null,
      }));
    },

    async *enviar(mensagens, op) {
      let r;
      try {
        r = await f(`${base}/chat/completions`, { method: 'POST', headers: cab, body: JSON.stringify(montarCorpo(mensagens, op)), signal: op.sinal });
      } catch (e) { throw new ErroIA('Não foi possível falar com o serviço de IA. Tente de novo.'); }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new ErroIA(d.error?.message ? `O serviço de IA recusou: ${d.error.message}` : `O serviço de IA respondeu ${r.status}.`, r.status >= 500 ? 502 : r.status);
      }
      const fim = { modelo: null, fornecedor: null, custo: 0, economia: 0, tokensEntrada: 0, tokensSaida: 0 };
      const dec = new TextDecoder();
      let resto = '';
      for await (const pedaco of r.body) {
        resto += dec.decode(pedaco, { stream: true });
        const linhas = resto.split('\n');
        resto = linhas.pop();
        for (const l of linhas) {
          if (!l.startsWith('data: ') || l === 'data: [DONE]') continue;
          let d; try { d = JSON.parse(l.slice(6)); } catch { continue; }
          if (d.error) throw new ErroIA(`O serviço de IA falhou: ${d.error.message || 'erro'}`);
          if (d.model) fim.modelo = d.model;
          if (d.provider) fim.fornecedor = d.provider;
          const texto = d.choices?.[0]?.delta?.content;
          if (texto) yield { tipo: 'texto', texto };
          if (d.usage) {
            fim.custo = Number(d.usage.cost ?? 0);
            fim.economia = Number(d.usage.cache_discount ?? 0);
            fim.tokensEntrada = d.usage.prompt_tokens ?? 0;
            fim.tokensSaida = d.usage.completion_tokens ?? 0;
          }
        }
      }
      yield { tipo: 'fim', ...fim };
    },
  };
}

// IA simulada, para demonstração e desenvolvimento sem chave. Responde de forma
// previsível ao último pedido (tabela, resumo curto ou eco organizado).
export function criarSimulada() {
  return {
    async listarModelos() { return []; },
    async *enviar(mensagens, op) {
      const ultima = String(mensagens.filter(m => m.role === 'user').at(-1)?.content || '');
      const pede = s => new RegExp(s, 'i').test(ultima);
      let texto;
      if (pede('tabela|coluna')) {
        texto = pede('tire|sem a coluna|remova')
          ? 'Pronto, sem a coluna pedida:\n\n| Item | Situação |\n|---|---|\n| Documento A | Conferido |\n| Documento B | Divergente |'
          : 'Aqui está a comparação:\n\n| Item | Valor | Situação |\n|---|---|---|\n| Documento A | 10 | Conferido |\n| Documento B | 12 | Divergente |\n\nRevise os itens marcados como divergentes.';
      } else if (pede('3 linhas|três linhas|resuma')) {
        texto = 'Resumo em três linhas:\n1. O material trata do pedido enviado.\n2. Há dois pontos que pedem atenção.\n3. O próximo passo é revisar e confirmar.';
      } else {
        texto = `Entendi o pedido. Organizei os pontos principais:\n\n- ${ultima.slice(0, 140) || 'sem texto'}\n- Nada foi enviado a um modelo real: esta é a IA simulada.\n\nQuer que eu ajuste o formato?`;
      }
      for (const parte of texto.match(/.{1,24}/gs)) yield { tipo: 'texto', texto: parte };
      yield { tipo: 'fim', modelo: op.modelo, fornecedor: op.fornecedor || 'simulado', custo: 0.0004, economia: 0, tokensEntrada: 800, tokensSaida: 120 };
    },
  };
}
