// OpenRouter falso: servidor HTTP local com o mesmo protocolo (SSE), que grava
// cada chamada. Serve para testar o cliente de verdade, sem rede.
import { createServer } from 'node:http';
import { Resvg } from '@resvg/resvg-js';
import { criarOpenRouter } from '../src/ia.js';

// responder(corpo): texto da resposta (opcional), para roteirizar respostas nos testes.
export const FONTES_FALSAS = [{ url: 'https://noticias.exemplo/mineracao-segura', titulo: 'Segurança na mineração em 2026' }, { url: 'https://revista.exemplo/esg-mineracao', titulo: 'ESG e mineração' }];
// chave: se informada, só aceita "Bearer <chave>" (401 nas demais), como o OpenRouter; autorizacoes guarda o
// cabeçalho recebido em cada chamada de chat, para conferir QUAL chave a GreenIA usou (nunca vai para fixture).
// anotacoes: função opcional (corpo, fontes) => chunks SSE extras com as citações, para simular outros formatos.
// imagem: função opcional (corpo) => data URL da imagem gerada (geração de imagem, sem streaming); null => 500.
// Sem ela, um pedido de imagem recebe uma imagem PNG pequena.
export const PNG_FALSO = `data:image/png;base64,${Buffer.from(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g"><stop offset="0" stop-color="#2E7D4F"/><stop offset="1" stop-color="#9AD1B0"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="420" cy="180" r="120" fill="#fff" opacity=".35"/></svg>').render().asPng()).toString('base64')}`;
// Revisão dos achados da conferência (segunda leitura): por padrão o "modelo" confirma todos os achados, com um trecho
// que existe no resultado — os testes antigos continuam com a mesma semântica. `revisao(b)` troca esse comportamento.
const conteudo = c => (typeof c === 'string' ? c : (c || []).map(p => p.text).join('\n'));
export const ehRevisao = b => conteudo(b.messages?.[0]?.content).includes('revisor da conferência');
export function confirmarAchados(b) {
  const u = conteudo(b.messages.at(-1).content);
  const resultado = (/<resultado[^>]*>\n([\s\S]*?)\n<\/resultado>/.exec(u)?.[1] || '').split('\n').find(l => l.trim()) || '';
  const ids = [...u.matchAll(/^- ([a-z_0-9]+) \(/gm)].map(m => m[1]);
  return JSON.stringify({ achados: ids.map(id => ({ id, confirmado: true, trecho: resultado.trim().slice(0, 40), prova: 'confirmado no teste' })) });
}
export async function openRouterFalso({ revisao = confirmarAchados, modelos = [], falhar = new Set(), custo = 0.00123, responder = null, fontes = FONTES_FALSAS, chave = null, anotacoes = null, imagem = null } = {}) {
  const chamadas = [], autorizacoes = [], revisoes = [];
  const srv = createServer(async (req, res) => {
    if (chave && req.headers.authorization !== `Bearer ${chave}`) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'No auth credentials found' } })); }
    if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: modelos })); }
    if (req.url.endsWith('/key')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: { label: 'teste', usage: 0, limit: null } })); }
    if (req.url.endsWith('/credits')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: { total_credits: 10, total_usage: 0 } })); }
    let corpo = '';
    for await (const c of req) corpo += c;
    const b = JSON.parse(corpo);
    (ehRevisao(b) ? revisoes : chamadas).push(b);
    autorizacoes.push(req.headers.authorization || null);
    if (b.modalities?.includes('image')) {
      const url = imagem ? imagem(b) : PNG_FALSO;
      if (!url) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'falhou' } })); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ model: b.model, choices: [{ message: { role: 'assistant', content: '', images: [{ type: 'image_url', image_url: { url } }] } }], usage: { cost: 0.039 } }));
    }
    // O OpenRouter tenta o principal e, se falhar, os da lista "models".
    const tentar = [b.model, ...(b.models || []).filter(m => m !== b.model)];
    const respondeu = tentar.find(m => !falhar.has(m));
    if (!respondeu) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'modelo indisponível' } })); }
    const fornecedor = b.provider?.order?.[0] || 'FornecedorLivre';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': OPENROUTER PROCESSING\n\n');
    const ultima = b.messages.filter(m => m.role === 'user').at(-1)?.content || '';
    const roteiro = ehRevisao(b) && revisao ? revisao(b) : responder?.(b);
    for (const parte of roteiro != null ? [roteiro] : [`Resposta de ${respondeu}`, ` para: ${String(ultima).slice(0, 40)}`]) {
      res.write(`data: ${JSON.stringify({ model: respondeu, provider: fornecedor, choices: [{ delta: { content: parte } }] })}\n\n`);
    }
    // Pesquisa na internet (plugin "web"): o OpenRouter devolve as citações como anotações url_citation.
    if (b.plugins?.some(p => p.id === 'web') && fontes.length && anotacoes) for (const ch of anotacoes(b, fontes, { model: respondeu, provider: fornecedor })) res.write(`data: ${JSON.stringify(ch)}\n\n`);
    else if (b.plugins?.some(p => p.id === 'web') && fontes.length)
      res.write(`data: ${JSON.stringify({ model: respondeu, provider: fornecedor, choices: [{ delta: { annotations: fontes.map(f => ({ type: 'url_citation', url_citation: { url: f.url, title: f.titulo, content: 'trecho' } })) } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ model: respondeu, provider: fornecedor, choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: custo, cache_discount: 0.0001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/v1`;
  return { chamadas, revisoes, autorizacoes, base, falhar, set responder(f) { responder = f; }, set imagem(f) { imagem = f; }, ia: criarOpenRouter({ chave: 'teste', base }), fechar: () => new Promise(r => srv.close(r)) };
}

// Lê a resposta em linhas JSON do envio de mensagem.
// Se a política mudou (428), registra a ciência e reenvia: o bloqueio tem teste próprio.
export async function enviarMensagem(c, conversaId, corpo) {
  let r = await c.req('POST', `/api/conversas/${conversaId}/mensagens`, corpo);
  if (r.status === 428) {
    await c.post('/api/politica/ciencia', { versao: (await c.get('/api/politica')).dados.versao });
    r = await c.req('POST', `/api/conversas/${conversaId}/mensagens`, corpo);
  }
  if (typeof r.dados === 'object') return { status: r.status, erro: r.dados };
  const eventos = r.dados.trim().split('\n').map(l => JSON.parse(l));
  return { status: r.status, eventos, texto: eventos.filter(e => e.t === 'texto').map(e => e.v).join(''), fim: eventos.find(e => e.t === 'fim'), falha: eventos.find(e => e.t === 'erro') };
}
