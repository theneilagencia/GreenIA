// Camada de provedor do modelo. O resto do servidor fala só com LlmProvider;
// trocar de provedor (ou acrescentar um com processamento em região específica)
// não mexe nas rotas.
import Anthropic from '@anthropic-ai/sdk';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export interface LlmRequest {
  model: string;
  system: string;
  messages: ChatTurn[];
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface LlmUsage { inputTokens: number; outputTokens: number }

export type LlmEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: LlmUsage; stopReason: string | null; model: string };

// Falha do provedor, com a indicação de se vale tentar de novo (429, 5xx, rede).
export class LlmError extends Error {
  retryable: boolean;
  status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.retryable = retryable;
    this.status = status;
  }
}

export interface LlmProvider {
  readonly id: string;
  stream(req: LlmRequest): AsyncIterable<LlmEvent>;
}

// API da Anthropic (@anthropic-ai/sdk), com streaming.
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string, client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey });
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmEvent> {
    const messages: Anthropic.MessageParam[] = req.messages.map(m => ({ role: m.role, content: m.content }));
    try {
      const stream = this.client.messages.stream(
        { model: req.model, max_tokens: req.maxOutputTokens, system: req.system, messages },
        { signal: req.signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: 'done',
        stopReason: final.stop_reason,
        model: final.model,
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
      };
    } catch (e) {
      if (e instanceof Anthropic.APIUserAbortError) throw new LlmError('cancelado', false);
      if (e instanceof Anthropic.RateLimitError) throw new LlmError('limite do provedor', true, 429);
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new LlmError('credencial do provedor inválida', false, e.status);
      }
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) {
        throw new LlmError('requisição recusada pelo provedor', false, e.status);
      }
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError('provedor fora do ar', true);
      if (e instanceof Anthropic.APIError) throw new LlmError('erro do provedor', (e.status ?? 500) >= 500, e.status);
      throw e;
    }
  }
}

// Provedor simulado para testes e para o ambiente local sem chave.
export class FakeProvider implements LlmProvider {
  readonly id = 'fake';
  requests: LlmRequest[] = [];
  reply: (req: LlmRequest) => string = () => 'Resposta simulada.';
  chunkDelayMs = 0;
  failWith: LlmError | null = null;

  async *stream(req: LlmRequest): AsyncIterable<LlmEvent> {
    this.requests.push(req);
    if (this.failWith) throw this.failWith;
    const text = this.reply(req);
    const parts = text.match(/.{1,8}/gs) || [''];
    for (const p of parts) {
      if (req.signal?.aborted) throw new LlmError('cancelado', false);
      if (this.chunkDelayMs) await new Promise(r => setTimeout(r, this.chunkDelayMs));
      yield { type: 'text', text: p };
    }
    yield { type: 'done', stopReason: 'end_turn', model: req.model, usage: { inputTokens: Math.ceil(req.system.length / 4) + 10, outputTokens: Math.ceil(text.length / 4) } };
  }
}
