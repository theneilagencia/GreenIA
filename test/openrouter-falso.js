// OpenRouter falso: servidor HTTP local com o mesmo protocolo (SSE), que grava
// cada chamada. Serve para testar o cliente de verdade, sem rede.
import { createServer } from 'node:http';
import { criarOpenRouter } from '../src/ia.js';

export async function openRouterFalso({ modelos = [], falhar = new Set(), custo = 0.00123 } = {}) {
  const chamadas = [];
  const srv = createServer(async (req, res) => {
    if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: modelos })); }
    let corpo = '';
    for await (const c of req) corpo += c;
    const b = JSON.parse(corpo);
    chamadas.push(b);
    // O OpenRouter tenta o principal e, se falhar, os da lista "models".
    const tentar = [b.model, ...(b.models || []).filter(m => m !== b.model)];
    const respondeu = tentar.find(m => !falhar.has(m));
    if (!respondeu) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'modelo indisponível' } })); }
    const fornecedor = b.provider?.order?.[0] || 'FornecedorLivre';
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': OPENROUTER PROCESSING\n\n');
    const ultima = b.messages.filter(m => m.role === 'user').at(-1)?.content || '';
    for (const parte of [`Resposta de ${respondeu}`, ` para: ${String(ultima).slice(0, 40)}`]) {
      res.write(`data: ${JSON.stringify({ model: respondeu, provider: fornecedor, choices: [{ delta: { content: parte } }] })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ model: respondeu, provider: fornecedor, choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 20, cost: custo, cache_discount: 0.0001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/v1`;
  return { chamadas, falhar, ia: criarOpenRouter({ chave: 'teste', base }), fechar: () => new Promise(r => srv.close(r)) };
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
