// Monta o servidor Fastify com as dependências injetadas, para os testes
// trocarem banco, fila, provedor de modelo e email por versões locais.
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import type { Config } from './config.ts';
import type { Db } from './db/pool.ts';
import { tenantRoutes } from './tenants/routes.ts';
import { sessionPlugin } from './auth/session.ts';
import { authRoutes } from './auth/routes.ts';
import type { EmailSender } from './email/sender.ts';
import { adminRoutes } from './admin/routes.ts';
import { platformRoutes } from './platform/routes.ts';
import { chatRoutes } from './chat/routes.ts';
import { composeSteps, type ChatHooks } from './chat/hooks.ts';
import { assistantStep, dataPolicyStep, usagePolicyStep } from './chat/steps.ts';
import { assistantRoutes } from './assistants/routes.ts';
import { kbRoutes } from './kb/routes.ts';
import { auditRoutes } from './audit/routes.ts';
import { runRoutes } from './runs/routes.ts';
import { reviewRoutes } from './runs/review.ts';
import { metricsRoutes } from './metrics/routes.ts';
import { policyRoutes } from './policy/routes.ts';
import { incidentRoutes } from './incidents/routes.ts';
import { usageRoutes } from './usage/routes.ts';
import { makeRunExecutor } from './runs/executor.ts';
import { knowledgeStep } from './kb/step.ts';
import { makeIndexer } from './kb/indexer.ts';
import { retentionStep, makeRetentionSweep } from './retention/retention.ts';
import { usageStep } from './usage/step.ts';
import type { RateLimiter } from './usage/rate-limit.ts';
import { staticRoutes } from './web/static.ts';
import type { ObjectStore } from './storage/object-store.ts';
import type { JobQueue } from './jobs/queue.ts';
import type { KnowledgeSource } from './kb/knowledge.ts';
import type { LlmProvider } from './llm/provider.ts';

export interface Deps {
  config: Config;
  db: Db;
  ownerDb?: Db; // conexão do dono das tabelas: só operações de plataforma
  email: EmailSender;
  llm: (providerId: string) => LlmProvider;
  chatHooks: ChatHooks;
  objects: ObjectStore;
  queue: JobQueue;
  knowledge: KnowledgeSource;
  rateLimiter: RateLimiter;
  ping?: { redis?: () => Promise<unknown> };
}

export async function buildApp(input: Omit<Deps, 'chatHooks'> & { chatHooks?: ChatHooks }): Promise<FastifyInstance> {
  // Etapas padrão do chat, em ordem. Os próximos itens acrescentam as suas.
  const deps: Deps = { ...input, chatHooks: input.chatHooks ?? composeSteps([usagePolicyStep, usageStep, assistantStep, dataPolicyStep, knowledgeStep, retentionStep]) };
  const app = Fastify({
    logger: deps.config.LOG_LEVEL === 'silent' ? false : {
      level: deps.config.LOG_LEVEL,
      // Logs estruturados sem conteúdo: nada de corpo de requisição, cookies ou tokens.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
    },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });
  await app.register(cookie);
  app.decorate('deps', deps);

  // Vivo: o processo responde.
  app.get('/health', async () => ({ status: 'ok' }));
  // Pronto: banco (e Redis, se configurado) respondem.
  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, string> = {};
    try { await deps.db.query('select 1'); checks.db = 'ok'; } catch { checks.db = 'erro'; }
    if (deps.ping?.redis) {
      try { await deps.ping.redis(); checks.redis = 'ok'; } catch { checks.redis = 'erro'; }
    }
    const ok = Object.values(checks).every(v => v === 'ok');
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ok' : 'erro', checks });
  });

  // Sessão e proteção de escrita valem para todas as rotas (hook na raiz).
  await sessionPlugin(app);
  await app.register(tenantRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(platformRoutes);
  await app.register(chatRoutes);
  await app.register(assistantRoutes);
  await app.register(kbRoutes);
  await app.register(auditRoutes);
  await app.register(runRoutes);
  await app.register(reviewRoutes);
  await app.register(metricsRoutes);
  await app.register(policyRoutes);
  await app.register(incidentRoutes);
  await app.register(usageRoutes);

  // Frontend (mesma origem da API). Registrado por último: as rotas da API têm prioridade.
  await app.register(staticRoutes);

  // Tarefas da fila.
  deps.queue.register('kb:index', makeIndexer(deps.db, deps.objects));
  deps.queue.register('run:execute', makeRunExecutor(app));
  const sweep = makeRetentionSweep(deps.db, deps.objects);
  deps.queue.register('retention:sweep', async () => { await sweep(); });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance { deps: Deps }
}
