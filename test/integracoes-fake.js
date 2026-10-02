// Servidor de API falso, local e seguro, para os testes do Integration Builder (nunca um sistema real).
// Rotas: GET /clientes (lista), GET /clientes/{id}, POST /faturas (escrita; conta chamadas por Idempotency-Key),
// DELETE /clientes/{id}, GET /lento (não responde a tempo), GET /instavel (503 nas N primeiras), GET /fora (fora do
// esquema), GET /grande (resposta grande), GET /redireciona?para=..., GET /eco-auth (ecoa o cabeçalho de auth).
import http from 'node:http';

export async function apiFalsa({ chave = 'chave-secreta-de-teste-123', instavel = 2 } = {}) {
  const estado = { chamadas: [], faturas: new Map(), instavel, apagados: 0 };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let corpo = '';
    req.on('data', d => { corpo += d; });
    req.on('end', () => {
      estado.chamadas.push({ metodo: req.method, caminho: u.pathname, auth: !!req.headers['x-api-key'] || !!req.headers.authorization });
      const json = (st, d, h = {}) => { res.writeHead(st, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(d)); };
      const autorizado = req.headers['x-api-key'] === chave || req.headers.authorization === `Bearer ${chave}`;
      if (u.pathname === '/token' && req.method === 'POST') {
        const p = new URLSearchParams(corpo);
        if (p.get('client_secret') !== 'segredo-cliente') return json(401, { error: 'invalid_client' });
        return json(200, { access_token: chave, expires_in: 3600, token_type: 'Bearer', scope: 'clientes.ler' });
      }
      if (u.pathname === '/eco-auth') return json(200, { recebido: req.headers.authorization || req.headers['x-api-key'] || null });
      if (u.pathname === '/redireciona') { res.writeHead(302, { location: u.searchParams.get('para') }); return res.end(); }
      if (!autorizado) return json(401, { erro: 'nao_autorizado', detalhe: `chave recebida: ${req.headers['x-api-key'] || req.headers.authorization || ''}` });
      if (u.pathname === '/clientes' && req.method === 'GET') return json(200, [{ id: 1, nome: 'Cliente Fictício A', email: 'a@exemplo.test' }, { id: 2, nome: 'Cliente Fictício B', email: 'b@exemplo.test' }]);
      if (/^\/clientes\/\d+$/.test(u.pathname) && req.method === 'GET') return json(200, { id: Number(u.pathname.split('/')[2]), nome: 'Cliente Fictício' });
      if (/^\/clientes\/\d+$/.test(u.pathname) && req.method === 'DELETE') { estado.apagados++; return json(200, { ok: true }); }
      if (u.pathname === '/faturas' && req.method === 'POST') {
        const k = req.headers['idempotency-key'] || `sem-chave-${Math.random()}`;
        if (!estado.faturas.has(k)) estado.faturas.set(k, { id: estado.faturas.size + 1, ...JSON.parse(corpo || '{}') });
        return json(201, estado.faturas.get(k));
      }
      if (u.pathname === '/lento') return setTimeout(() => json(200, { ok: true }), 3000);
      if (u.pathname === '/instavel') { if (estado.instavel-- > 0) return json(503, { erro: 'indisponivel' }); return json(200, { ok: true }); }
      if (u.pathname === '/fora') return json(200, { inesperado: true });
      if (u.pathname === '/grande') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ x: 'a'.repeat(3 * 1024 * 1024) })); }
      json(404, { erro: 'nao_encontrado' });
    });
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const porta = srv.address().port;
  return { estado, chave, porta, base: `http://127.0.0.1:${porta}`, fechar: () => new Promise(ok => { srv.closeAllConnections?.(); srv.close(ok); }) };
}

// Especificação OpenAPI da API falsa (o que um admin colaria na descoberta).
export const OPENAPI_FALSA = base => ({
  openapi: '3.0.3', info: { title: 'API Fictícia de Clientes' }, servers: [{ url: base }],
  components: { securitySchemes: { chave: { type: 'apiKey', in: 'header', name: 'X-API-Key' } }, schemas: {
    Cliente: { type: 'object', required: ['id', 'nome'], properties: { id: { type: 'integer' }, nome: { type: 'string' }, email: { type: 'string' } } },
    Fatura: { type: 'object', required: ['cliente_id', 'valor'], properties: { cliente_id: { type: 'integer' }, valor: { type: 'number' }, descricao: { type: 'string' } } } } },
  paths: {
    '/clientes': { get: { operationId: 'listarClientes', summary: 'Clientes', parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }], responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Cliente' } } } } } } } },
    '/clientes/{id}': {
      get: { operationId: 'lerCliente', summary: 'Um cliente', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Cliente' } } } } } },
      delete: { operationId: 'apagarCliente', summary: 'Apagar cliente', parameters: [{ name: 'id', in: 'path', required: true }], responses: { 200: {} } },
    },
    '/faturas': { post: { operationId: 'criarFatura', summary: 'Faturas', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Fatura' } } } }, responses: { 201: { content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } } } } } },
    '/lento': { get: { operationId: 'lento', summary: 'Lento', responses: { 200: {} } } },
    '/instavel': { get: { operationId: 'instavel', summary: 'Instável', responses: { 200: {} } } },
    '/fora': { get: { operationId: 'fora', summary: 'Fora do esquema', responses: { 200: { content: { 'application/json': { schema: { type: 'object', required: ['id', 'nome'], properties: { id: { type: 'integer' } } } } } } } } },
    '/grande': { get: { operationId: 'grande', summary: 'Grande', responses: { 200: {} } } },
  },
});
