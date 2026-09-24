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
  systemExtra?: string;           // instruções do assistente, somadas à persona
  state?: ChatState;              // passado adiante para completed()
}
export interface CompletedInput {
  app: FastifyInstance; auth: AuthContext; config: TenantConfig;
  usage: LlmUsage; model: string; providerId: string; meta?: Record<string, unknown>;
  state?: ChatState;
  outputText: string;             // resposta completa (para retenção como evidência, se o assistente pedir)
}

// Estado compartilhado entre as etapas de uma mesma requisição.
export interface ChatState {
  messages: ChatTurn[];
  meta: Record<string, unknown>;
  systemExtra?: string;
  assistant?: { id: string; slug: string; version: number; areaId: string | null; definition: unknown };
  [key: string]: unknown;
}

export interface ChatHooks {
  prepare(i: PrepareInput): Promise<PrepareResult>;
  completed(i: CompletedInput): Promise<void>;
}

export const noopChatHooks: ChatHooks = {
  async prepare() { return {}; },
  async completed() {},
};

// Uma etapa do chat. prepare pode recusar a requisição, trocar as mensagens ou
// acrescentar metadados; completed roda depois que o modelo respondeu.
export interface ChatStep {
  name: string;
  prepare?(i: PrepareInput, state: ChatState): Promise<{ status: number; body: Record<string, unknown> } | void>;
  completed?(i: CompletedInput, state: ChatState): Promise<void>;
}

// Junta etapas em ordem. A primeira recusa interrompe as seguintes.
export function composeSteps(steps: ChatStep[]): ChatHooks {
  return {
    async prepare(i) {
      const state: ChatState = { messages: i.body.messages.map(m => ({ role: m.role, content: m.content })), meta: {} };
      for (const s of steps) {
        const reject = await s.prepare?.(i, state);
        if (reject) return { reject };
      }
      return { messages: state.messages, meta: Object.keys(state.meta).length ? state.meta : undefined, systemExtra: state.systemExtra, state };
    },
    async completed(i) {
      const state = i.state ?? { messages: [], meta: {} };
      for (const s of steps) await s.completed?.(i, state);
    },
  };
}
