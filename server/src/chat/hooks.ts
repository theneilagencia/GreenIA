// Etapas antes e depois da chamada ao modelo. Cada item da Fase 2 que mexe no
// chat (política de dados, base de conhecimento, limites e consumo) entra aqui,
// sem inflar a rota.
import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../auth/session.ts';
import type { TenantConfig } from '../tenants/config.ts';
import type { ChatTurn, LlmUsage } from '../llm/provider.ts';
import type { ChatBody } from './routes.ts';

export interface PrepareInput { app: FastifyInstance; auth: AuthContext; config: TenantConfig; body: ChatBody }
export interface PrepareResult {
  reject?: { status: number; body: Record<string, unknown> };
  messages?: ChatTurn[];          // mensagens a enviar (mascaradas, com contexto da base)
  meta?: Record<string, unknown>; // enviado ao cliente antes da resposta (ex.: fontes)
}
export interface CompletedInput {
  app: FastifyInstance; auth: AuthContext; config: TenantConfig;
  usage: LlmUsage; model: string; providerId: string; meta?: Record<string, unknown>;
}

export interface ChatHooks {
  prepare(i: PrepareInput): Promise<PrepareResult>;
  completed(i: CompletedInput): Promise<void>;
}

export const noopChatHooks: ChatHooks = {
  async prepare() { return {}; },
  async completed() {},
};
