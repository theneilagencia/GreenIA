// POST /api/chat: conversa com o modelo pelo servidor, com streaming (SSE).
//
// Eventos enviados:
//   delta  { text }                       pedaço da resposta
//   done   { usage, stopReason, model }   fim da resposta
//   error  { error, retryable }           falha (nada de fallback silencioso)
// Antes de abrir o stream, a rota pode responder JSON com erro (401, 403, 400).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { buildSystemPrompt } from '../llm/persona.ts';
import { LlmError, type ChatTurn } from '../llm/provider.ts';
import { openSse } from './sse.ts';

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })).min(1).max(60),
  // Tipos de dado que a pessoa confirmou no aviso ("Enviar mesmo assim").
  confirmedWarnings: z.array(z.string()).max(20).default([]),
});

export type ChatBody = z.infer<typeof bodySchema>;

export async function chatRoutes(app: FastifyInstance) {
  app.post('/api/chat', async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    if (!can(auth, 'chat.use')) return reply.code(403).send({ error: 'sem_permissao' });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const body = parsed.data;
    if (body.messages[body.messages.length - 1].role !== 'user') return reply.code(400).send({ error: 'ultima_mensagem_deve_ser_do_usuario' });

    const ctx = tenantCtx(auth);
    const { config } = await withTenant(app.deps.db, ctx, async tx =>
      parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [auth.tenantId])).rows[0]?.config));

    const tooLong = body.messages.some(m => m.content.length > config.limits.maxMessageChars);
    if (tooLong) return reply.code(413).send({ error: 'mensagem_longa_demais', limite: config.limits.maxMessageChars });

    // Pontos de extensão, na ordem: política de dados (item 6), base de
    // conhecimento (item 7) e limites/consumo (item 9).
    const prep = await app.deps.chatHooks.prepare({ app, auth, config, body });
    if (prep.reject) return reply.code(prep.reject.status).send(prep.reject.body);
    const messages: ChatTurn[] = prep.messages ?? body.messages;

    const provider = app.deps.llm(config.llm.provider);
    const abort = new AbortController();
    reply.hijack();
    const sse = openSse(reply.raw);
    const onClose = () => { if (!reply.raw.writableEnded) abort.abort(); };
    reply.raw.on('close', onClose);
    if (prep.meta) sse.send('meta', prep.meta);

    try {
      for await (const ev of provider.stream({
        model: config.llm.model,
        system: buildSystemPrompt({ config }),
        messages,
        maxOutputTokens: config.llm.maxOutputTokens,
        signal: abort.signal,
      })) {
        if (ev.type === 'text') sse.send('delta', { text: ev.text });
        else {
          await app.deps.chatHooks.completed({ app, auth, config, usage: ev.usage, model: ev.model, providerId: provider.id, meta: prep.meta });
          sse.send('done', { usage: ev.usage, stopReason: ev.stopReason, model: ev.model });
        }
      }
    } catch (e) {
      if (abort.signal.aborted) return; // o cliente saiu: nada a enviar
      const err = e instanceof LlmError ? e : new LlmError('erro interno', false);
      req.log.warn({ provider: provider.id, status: err.status, retryable: err.retryable }, 'falha no provedor do modelo');
      sse.send('error', { error: err.retryable ? 'provedor_indisponivel' : 'falha_na_resposta', retryable: err.retryable });
    } finally {
      reply.raw.off('close', onClose);
      sse.end();
    }
  });
}
