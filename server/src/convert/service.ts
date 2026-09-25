// Serviço de conversão: as mesmas ferramentas de converter.ts atrás de um HTTP
// interno, para rodar num processo (e numa tarefa) sem saída de rede e sem os
// segredos da plataforma. Recebe os bytes, devolve o resultado; não guarda nada.
//   POST /v1/ocr-pdf?paginas=1,2   POST /v1/ocr-imagem   POST /v1/imagem-jpeg
//   POST /v1/office?de=doc|xls|odt|ods   GET /v1/disponivel   GET /health
// Autenticação: Authorization: Bearer <CONVERTER_TOKEN> (comparação em tempo constante).
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ConversionError, type Converter, type OcrPage, type OfficeKind } from './converter.ts';

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
export const paginasParaJson = (ps: OcrPage[]) => ps.map(p => ({ ...p, image: p.image ? b64(p.image) : undefined }));

export async function buildConverterService(conv: Converter, opts: { token: string; bodyLimitMb: number; log?: boolean }): Promise<FastifyInstance> {
  if (opts.token.length < 32) throw new Error('CONVERTER_TOKEN precisa de pelo menos 32 caracteres');
  const esperado = createHash('sha256').update(opts.token).digest();
  const app = Fastify({ logger: opts.log ? { redact: ['req.headers.authorization'] } : false, bodyLimit: opts.bodyLimitMb * 1024 * 1024 });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get('/health', async () => ({ status: 'ok' }));
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    const h = String(req.headers.authorization ?? '');
    const dado = createHash('sha256').update(h.startsWith('Bearer ') ? h.slice(7) : '').digest();
    if (!timingSafeEqual(dado, esperado)) return reply.code(401).send({ error: 'nao_autorizado' });
  });
  const bytes = (body: unknown) => {
    if (!Buffer.isBuffer(body) || !body.length) throw new ConversionError('corpo vazio: envie os bytes como application/octet-stream');
    return new Uint8Array(body);
  };
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ConversionError) return reply.code(422).send({ error: 'conversao', mensagem: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'requisicao', mensagem: (err as Error).message });
    return reply.code(500).send({ error: 'interno' });
  });

  app.get('/v1/disponivel', async () => ({ ...(await conv.available()), isolamento: await conv.isolamento?.() }));
  app.post('/v1/ocr-pdf', async req => {
    const q = String((req.query as { paginas?: string }).paginas ?? '');
    const paginas = q ? q.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0) : undefined;
    return { paginas: paginasParaJson(await conv.ocrPdf(bytes(req.body), paginas)) };
  });
  app.post('/v1/ocr-imagem', async req => ({ paginas: paginasParaJson(await conv.ocrImage(bytes(req.body))) }));
  app.post('/v1/imagem-jpeg', async req => ({ imagens: (await conv.imageToJpeg(bytes(req.body))).map(b64) }));
  app.post('/v1/office', async (req, reply) => {
    const de = String((req.query as { de?: string }).de ?? '');
    if (!['doc', 'xls', 'odt', 'ods'].includes(de)) throw new ConversionError('formato de origem inválido');
    const out = await conv.officeToOoxml(bytes(req.body), de as OfficeKind);
    return reply.type('application/octet-stream').send(Buffer.from(out));
  });
  return app;
}
