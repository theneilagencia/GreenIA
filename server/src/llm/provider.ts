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

// Chamada única (sem streaming) dos blocos de capacidade: aceita imagem e PDF
// (visão do modelo, para documento escaneado) e, opcionalmente, um JSON Schema
// para a resposta. A resposta é validada de novo pelo bloco: o schema aqui só
// reduz a chance de erro, não substitui a validação.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string }
  | { type: 'pdf'; data: string; title?: string };

export interface LlmCompleteRequest {
  model: string;
  system: string;
  content: ContentPart[];
  maxOutputTokens: number;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LlmCompletion { text: string; usage: LlmUsage; stopReason: string | null; model: string }

export interface LlmProvider {
  readonly id: string;
  stream(req: LlmRequest): AsyncIterable<LlmEvent>;
  complete(req: LlmCompleteRequest): Promise<LlmCompletion>;
}

// Adapta um JSON Schema ao subconjunto aceito pela saída estruturada da API:
// objetos fechados (additionalProperties: false) e sem restrições numéricas, de
// tamanho ou de padrão (essas continuam valendo na validação do bloco).
const UNSUPPORTED = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', '$schema', '$id']);
const FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);
export function toApiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toApiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED.has(k)) continue;
    if (k === 'format' && !FORMATS.has(String(v))) continue;
    if (k === 'minItems' && typeof v === 'number' && v > 1) continue;
    out[k] = k === 'properties' && v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toApiSchema(pv)]))
      : toApiSchema(v);
  }
  const isObject = out.type === 'object' || (Array.isArray(out.type) && out.type.includes('object'));
  if (isObject) out.additionalProperties = false;
  return out;
}

function mapError(e: unknown): unknown {
  if (e instanceof Anthropic.APIUserAbortError) return new LlmError('cancelado', false);
  if (e instanceof Anthropic.RateLimitError) return new LlmError('limite do provedor', true, 429);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('credencial do provedor inválida', false, e.status);
  }
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) {
    return new LlmError('requisição recusada pelo provedor', false, e.status);
  }
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('provedor fora do ar', true);
  if (e instanceof Anthropic.APIError) return new LlmError('erro do provedor', (e.status ?? 500) >= 500, e.status);
  return e;
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
      throw mapError(e);
    }
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompletion> {
    const content: Anthropic.ContentBlockParam[] = req.content.map(c =>
      c.type === 'text' ? { type: 'text', text: c.text }
        : c.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.data } }
          : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.data }, ...(c.title ? { title: c.title } : {}) });
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model, max_tokens: req.maxOutputTokens, system: req.system, messages: [{ role: 'user', content }],
    };
    const run = async (p: Anthropic.MessageCreateParamsNonStreaming) => {
      const m = await this.client.messages.create(p, { signal: req.signal });
      return {
        text: m.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join(''),
        usage: { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens },
        stopReason: m.stop_reason, model: m.model,
      };
    };
    try {
      if (!req.jsonSchema) return await run(params);
      try {
        return await run({ ...params, output_config: { format: { type: 'json_schema', schema: toApiSchema(req.jsonSchema) as Record<string, unknown> } } });
      } catch (e) {
        // Schema fora do subconjunto aceito: segue sem saída estruturada (o bloco valida de qualquer forma).
        if (e instanceof Anthropic.BadRequestError) return await run(params);
        throw e;
      }
    } catch (e) {
      throw mapError(e);
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
  completions: LlmCompleteRequest[] = [];
  // Resposta simulada dos blocos (extração, visão, resumo...). Padrão: texto fixo.
  completeReply: (req: LlmCompleteRequest) => string = () => 'Resposta simulada.';

  async complete(req: LlmCompleteRequest): Promise<LlmCompletion> {
    this.completions.push(req);
    if (this.failWith) throw this.failWith;
    const text = this.completeReply(req);
    const inChars = req.system.length + req.content.reduce((n, c) => n + (c.type === 'text' ? c.text.length : 6000), 0);
    return { text, stopReason: 'end_turn', model: req.model, usage: { inputTokens: Math.ceil(inChars / 4), outputTokens: Math.ceil(text.length / 4) } };
  }

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
