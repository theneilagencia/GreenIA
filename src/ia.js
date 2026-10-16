// Acesso a modelos de IA. Uma camada só, o OpenRouter (API compatível com a da
// OpenAI). O resto do código fala só com enviar(mensagens, opções) e
// listarModelos(), para trocar de camada no futuro se for preciso.

import { semRotaFixa } from './sigilo.js';

export class ErroIA extends Error {
  constructor(mensagem, status = 502) { super(mensagem); this.status = status; }
}

// Preferências de privacidade (seção 9): vão em toda chamada.
//  - normal: só fornecedores que não treinam com os dados (a não ser que o admin desligue);
//    com modelo de reserva, o OpenRouter tenta o principal e cai no reserva.
//  - sigilosa: fornecedor fixado, retenção zero exigida, sem cair para outro fornecedor.
//    Defesa final (fail closed), independente do roteador: um pedido sigiloso nunca sai sem fornecedor fixado,
//    para um modelo sem rota fixa (gratuito, roteador automático, ":online"), com lista de modelos de reserva
//    no fornecedor ou com a pesquisa na internet (o plugin leva o pedido a um mecanismo de busca, fora da rota
//    homologada, e a retenção zero do serviço de acesso só vale para a inferência).
export function montarCorpo(mensagens, op) {
  const corpo = { model: op.modelo, messages: mensagens, stream: true, usage: { include: true } };
  if (op.sigilosa) {
    if (!op.fornecedor || typeof op.fornecedor !== 'string') throw new ErroIA('Modelo homologado sem fornecedor fixado.', 400);
    if (semRotaFixa(op.modelo)) throw new ErroIA('Recurso sem rota fixa não recebe informação sigilosa.', 400);
    if (op.pesquisaWeb) throw new ErroIA('Pesquisa na internet não é usada com informação sigilosa.', 400);
    corpo.provider = { order: [op.fornecedor], only: [op.fornecedor], allow_fallbacks: false, zdr: true, data_collection: 'deny' };
  } else {
    corpo.provider = { data_collection: op.semTreino === false ? 'allow' : 'deny' };
    if (op.reserva) corpo.models = [op.modelo, op.reserva];
  }
  if (op.maxTokens) corpo.max_tokens = op.maxTokens;
  // Pesquisa na internet (plugin "web" do OpenRouter): só quando a governança liberou para esta chamada.
  // As citações voltam como anotações "url_citation" e viram as fontes da resposta.
  // Motor Exa fixo (homologação real): na busca nativa o modelo decide se pesquisa e se anota, e numa entrega longa
  // o Gemini não pesquisou e o Claude pesquisou sem devolver anotação (fontes só no texto, que não contamos); as
  // fontes nativas do Gemini ainda vinham como links de redirecionamento. Com o Exa, toda execução traz as citações
  // com o endereço real do publicador, em qualquer modelo e com data_collection='deny'.
  if (op.pesquisaWeb) corpo.plugins = [{ id: 'web', engine: 'exa', max_results: Math.min(10, Math.max(1, Number(op.pesquisaWeb.max) || 5)) }];
  return corpo;
}

export function criarOpenRouter({ chave, base = 'https://openrouter.ai/api/v1', fetch: f = globalThis.fetch, titulo = 'GreenIA' }) {
  const cab = { authorization: `Bearer ${chave}`, 'content-type': 'application/json', 'x-title': titulo };
  return {
    geraImagem: true,
    // Conta no OpenRouter: dados da chave (uso, limite, uso do dia/semana/mês) e créditos comprados e gastos.
    // Cada parte falha sozinha (a de créditos pode exigir outro tipo de chave). A chave nunca sai daqui.
    async conta() {
      const pegar = async caminho => {
        try { const r = await f(`${base}${caminho}`, { headers: cab }); return r.ok ? ((await r.json()).data ?? null) : { erro: r.status }; }
        catch { return { erro: 'rede' }; }
      };
      const [chave, creditos] = await Promise.all([pegar('/key'), pegar('/credits')]);
      return { chave, creditos };
    },

    // Custo cobrado de uma geração (para chamadas que não devolveram o custo no fim do stream). null: ainda não disponível.
    async custoDaGeracao(id) {
      try {
        const r = await f(`${base}/generation?id=${encodeURIComponent(id)}`, { headers: cab });
        if (!r.ok) return null;
        const d = (await r.json()).data || {};
        const c = Number(d.total_cost ?? d.usage);
        return Number.isFinite(c) ? c : null;
      } catch { return null; }
    },

    async listarModelos() {
      const r = await f(`${base}/models`, { headers: cab });
      if (!r.ok) throw new ErroIA(`OpenRouter respondeu ${r.status} na lista de modelos.`);
      return ((await r.json()).data || []).map(m => ({
        id: m.id, nome: m.name || m.id, fornecedor: m.id.split('/')[0],
        precoEntrada: Number(m.pricing?.prompt ?? NaN), precoSaida: Number(m.pricing?.completion ?? NaN), contexto: m.context_length ?? null,
      }));
    },

    // Geração de imagem (asset da produção visual): uma chamada sem streaming a um modelo que devolve imagem. Só
    // é chamada quando a empresa liberou e a governança permite (src/visual/producao.js). Devolve a imagem como
    // data URL e o custo; o texto do pedido não volta.
    async gerarImagem(prompt, op = {}) {
      // Sem rota homologada para imagem: informação sigilosa nunca vai ao gerador (a governança já barra antes).
      if (op.sigilosa) throw new ErroIA('Geração de imagem não é usada com informação sigilosa.', 400);
      let r;
      try {
        r = await f(`${base}/chat/completions`, { method: 'POST', headers: cab, signal: op.sinal,
          // Edição: a imagem de base vai junto do pedido. Proporção pedida (16:9, 1:1...): image_config do gerador.
          body: JSON.stringify({ model: op.modelo, messages: [{ role: 'user', content: op.imagens?.length ? [{ type: 'text', text: prompt }, ...op.imagens.map(url => ({ type: 'image_url', image_url: { url } }))] : prompt }],
            modalities: ['image', 'text'], stream: false, usage: { include: true }, ...(op.proporcao ? { image_config: { aspect_ratio: op.proporcao } } : {}),
            provider: { data_collection: 'deny' } }) });
      } catch { throw new ErroIA('Não foi possível falar com o serviço de imagem.'); }
      if (!r.ok) throw new ErroIA(`O serviço de imagem respondeu ${r.status}.`, r.status >= 500 ? 502 : r.status);
      const d = await r.json().catch(() => ({}));
      const url = d.choices?.[0]?.message?.images?.map(i => i?.image_url?.url || i?.url).find(u => /^data:image\/(png|jpeg|webp);base64,/.test(String(u || '')));
      // Cobrada sem imagem válida: o custo segue no erro, para virar crédito (src/custo-ia.js).
      if (!url) throw Object.assign(new ErroIA('O serviço de imagem não devolveu imagem.'), { custo: Number(d.usage?.cost ?? 0), geracao: d.id || null });
      return { dataUrl: url, custo: Number(d.usage?.cost ?? 0), modelo: d.model || op.modelo };
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
      let gerou = false;
      const dec = new TextDecoder();
      let resto = '';
      for await (const pedaco of r.body) {
        resto += dec.decode(pedaco, { stream: true });
        const linhas = resto.split('\n');
        resto = linhas.pop();
        for (const l of linhas) {
          if (!l.startsWith('data: ') || l === 'data: [DONE]') continue;
          let d; try { d = JSON.parse(l.slice(6)); } catch { continue; }
          // Identificação da geração: com ela, o custo de uma chamada interrompida é buscado depois (src/custo-ia.js).
          if (d.id && !gerou) { gerou = true; op.aoGerar?.(d.id); }
          if (d.error) throw new ErroIA(`O serviço de IA falhou: ${d.error.message || 'erro'}`);
          if (d.model) fim.modelo = d.model;
          if (d.provider) fim.fornecedor = d.provider;
          const texto = d.choices?.[0]?.delta?.content;
          if (texto) yield { tipo: 'texto', texto };
          for (const a of [...(d.choices?.[0]?.delta?.annotations || []), ...(d.choices?.[0]?.message?.annotations || [])]) {
            const c = a?.type === 'url_citation' ? a.url_citation || a : null;
            if (c?.url && /^https?:\/\//.test(c.url)) yield { tipo: 'fonte', url: String(c.url).slice(0, 500), titulo: String(c.title || c.url).slice(0, 200) };
          }
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

// Produção sem chave: o servidor sobe (o admin entra e vê o aviso), mas nenhuma
// resposta é gerada. Nunca troca pela simulada em produção.
// A chave é informada no console da plataforma (Uso); a variável OPENROUTER_API_KEY é só a alternativa do servidor.
export const MSG_SEM_CHAVE = 'A IA ainda não está configurada: falta a chave do OpenRouter (informada no console da plataforma, em Uso, ou na variável OPENROUTER_API_KEY do servidor). Avise o admin.';
export function criarIndisponivel() {
  return {
    configurada: false, geraImagem: false,
    async conta() { return null; },
    async listarModelos() { return []; },
    async *enviar() { throw new ErroIA(MSG_SEM_CHAVE, 503); },
    async gerarImagem() { throw new ErroIA(MSG_SEM_CHAVE, 503); },
  };
}

// IA simulada, para demonstração e desenvolvimento sem chave. Responde de forma previsível ao último pedido,
// no formato pedido (email, lista, tabela, resumo, ou a combinação deles). O aviso de que a resposta é simulada
// não entra no texto: a tela mostra um selo fora da resposta (/api/eu informa iaSimulada).
const TABELA_SIMULADA = '| Item | Valor | Situação |\n|---|---|---|\n| Documento A | 10 | Conferido |\n| Documento B | 12 | Divergente |';
const LISTA_SIMULADA = '- Confirmar o objetivo com quem pediu.\n- Reunir o material necessário.\n- Revisar o resultado antes de enviar.';
const RESUMO_SIMULADO = '1. O material trata do pedido enviado.\n2. Há dois pontos que pedem atenção.\n3. O próximo passo é revisar e confirmar.';
export function respostaSimulada(pedido) {
  const pede = s => new RegExp(s, 'i').test(pedido);
  const tabela = pede('tabela|coluna');
  if (tabela && pede('tire|sem a coluna|remova')) return 'Pronto, sem a coluna pedida:\n\n| Item | Situação |\n|---|---|\n| Documento A | Conferido |\n| Documento B | Divergente |';
  const email = pede('\\be-?mails?\\b'), lista = pede('\\blista\\b|\\bliste\\b|\\btópicos\\b|\\bpassos\\b'), resumo = pede('3 linhas|três linhas|\\bresum');
  const partes = [];
  if (resumo) partes.push(`Resumo em três linhas:\n${RESUMO_SIMULADO}`);
  if (lista) partes.push(`${email ? 'Próximos passos' : 'Aqui está a lista'}:\n${LISTA_SIMULADA}`);
  if (tabela) partes.push(`${pede('compar') ? 'Aqui está a comparação' : 'Aqui está a tabela'}:\n\n${TABELA_SIMULADA}\n\nRevise os itens marcados como divergentes.`);
  if (email) return `Assunto: Retorno sobre o pedido\n\nOlá,\n\nCompartilho abaixo o que foi combinado.\n\n${partes.length ? `${partes.join('\n\n')}\n\n` : ''}Fico à disposição para ajustar o que for preciso.\n\nAtenciosamente,\n[Seu nome]`;
  if (partes.length) return partes.join('\n\n');
  return `Entendi o pedido. Organizei os pontos principais:\n\n- ${pedido.slice(0, 140) || 'sem texto'}\n- O próximo passo é revisar e confirmar.\n\nQuer que eu ajuste o formato?`;
}
export function criarSimulada() {
  return {
    simulada: true,
    async conta() { return null; },
    async listarModelos() { return []; },
    async *enviar(mensagens, op) {
      const texto = respostaSimulada(String(mensagens.filter(m => m.role === 'user').at(-1)?.content || ''));
      for (const parte of texto.match(/.{1,24}/gs)) yield { tipo: 'texto', texto: parte };
      yield { tipo: 'fim', modelo: op.modelo, fornecedor: op.fornecedor || 'simulado', custo: 0.0004, economia: 0, tokensEntrada: 800, tokensSaida: 120 };
    },
  };
}
