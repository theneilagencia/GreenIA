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

export interface Deps {
  config: Config;
  db: Db;
  ownerDb?: Db; // conexão do dono das tabelas: só operações de plataforma
  email: EmailSender;
  ping?: { redis?: () => Promise<unknown> };
}

export async function buildApp(deps: Deps): Promise<FastifyInstance> {
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

  return app;
}

declare module 'fastify' {
  interface FastifyInstance { deps: Deps }
}
