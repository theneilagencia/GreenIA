import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { buildTestApp, loginAs } from './app-helpers.ts';
import { AnthropicProvider, FakeProvider, LlmError } from '../src/llm/provider.ts';

let db: TestDb;
let app: FastifyInstance;
let base = '';
const fake = new FakeProvider();
let repet: Awaited<ReturnType<typeof seedTenant>>;

before(async () => {
  db = await createTestDb();
  repet = await seedTenant(db.owner, 'repet');
  await db.owner.query(`update tenants set config = $1 where id = $2`,
    [{ branding: { orgName: 'Repet' }, keyUserContact: 'Ana · ana@repet.com.br' }, repet.tenantId]);
  app = await buildTestApp(db, { fake });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
after(async () => { await app?.close(); await db?.drop(); });

// Lê um stream SSE e devolve a lista de eventos { event, data }.
async function readSse(res: Response) {
  const text = await res.text();
  return text.split('\n\n').filter(Boolean).map(block => {
    const event = block.match(/^event: (.*)$/m)?.[1];
    const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] || 'null');
    return { event, data };
  });
}

async function chat(payload: unknown, userId = repet.userId, extraHeaders: Record<string, string> = {}, signal?: AbortSignal) {
  const { headers } = await loginAs(db, userId);
  return fetch(base + '/api/chat', {
    method: 'POST', signal,
    headers: { ...headers, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(payload),
  });
}

test('sem sessão: 401; sem CSRF: 403', async () => {
  const r1 = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://greenia.test' }, body: '{}' });
  assert.equal(r1.status, 401);
  const r2 = await chat({ messages: [{ role: 'user', content: 'oi' }] }, repet.userId, { 'x-csrf-token': 'errado' });
  assert.equal(r2.status, 403);
});

test('responde em streaming (SSE) com deltas e done, e a persona vai no system', async () => {
  fake.reply = () => 'Olá! Posso ajudar a resumir esse texto.';
  const res = await chat({ messages: [{ role: 'user', content: 'Resumir: bom dia' }] });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
  const events = await readSse(res);
  const text = events.filter(e => e.event === 'delta').map(e => e.data.text).join('');
  assert.equal(text, 'Olá! Posso ajudar a resumir esse texto.');
  assert.ok(events.filter(e => e.event === 'delta').length > 1, 'deveria chegar em pedaços');
  const done = events.find(e => e.event === 'done');
  assert.ok(done && done.data.usage.outputTokens > 0);
  const req = fake.requests.at(-1)!;
  assert.match(req.system, /assistente de IA do dia a dia do Repet/);
  assert.match(req.system, /ana@repet\.com\.br/);
  assert.equal(req.model, 'claude-haiku-4-5');
  // Sem o par falso de mensagens da Fase 1: a conversa começa pela pessoa.
  assert.deepEqual(req.messages, [{ role: 'user', content: 'Resumir: bom dia' }]);
});

test('texto chega aos poucos, não tudo no fim', async () => {
  fake.reply = () => 'x'.repeat(80);
  fake.chunkDelayMs = 30;
  const res = await chat({ messages: [{ role: 'user', content: 'oi' }] });
  const reader = res.body!.getReader();
  const t0 = Date.now();
  const first = await reader.read();
  const firstAt = Date.now() - t0;
  while (!(await reader.read()).done) { /* consome o resto */ }
  const total = Date.now() - t0;
  fake.chunkDelayMs = 0;
  assert.ok(first.value && first.value.length > 0);
  assert.ok(firstAt < total / 2, `primeiro pedaço em ${firstAt} ms de ${total} ms`);
});

test('cliente desconecta: a chamada ao modelo é cancelada', async () => {
  fake.reply = () => 'y'.repeat(400);
  fake.chunkDelayMs = 20;
  const ctl = new AbortController();
  const res = await chat({ messages: [{ role: 'user', content: 'oi' }] }, repet.userId, {}, ctl.signal);
  const reader = res.body!.getReader();
  await reader.read();
  ctl.abort();
  await new Promise(r => setTimeout(r, 150));
  fake.chunkDelayMs = 0;
  assert.equal(fake.requests.at(-1)!.signal?.aborted, true);
});

test('falha do provedor vira evento de erro (sem resposta inventada)', async () => {
  fake.failWith = new LlmError('limite do provedor', true, 429);
  const events = await readSse(await chat({ messages: [{ role: 'user', content: 'oi' }] }));
  fake.failWith = null;
  assert.deepEqual(events.map(e => e.event), ['error']);
  assert.deepEqual(events[0].data, { error: 'provedor_indisponivel', retryable: true });
});

test('validação: última mensagem precisa ser da pessoa; mensagem longa demais: 413', async () => {
  assert.equal((await chat({ messages: [{ role: 'assistant', content: 'oi' }] })).status, 400);
  assert.equal((await chat({ messages: [{ role: 'user', content: 'a'.repeat(20001) }] })).status, 413);
});

// ---- AnthropicProvider contra um servidor que imita a API ------------------------------

function mockAnthropic(handler: (body: Record<string, unknown>) => { status: number; sse?: string; json?: unknown }) {
  const seen: Record<string, unknown>[] = [];
  const server: Server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw || '{}');
    seen.push(body);
    const out = handler(body);
    if (out.sse) { res.writeHead(out.status, { 'content-type': 'text/event-stream' }); res.end(out.sse); }
    else { res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out.json)); }
  });
  return { server, seen };
}

const sseOf = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

test('AnthropicProvider: envia system e mensagens, lê deltas, uso e stop_reason', async () => {
  const { server, seen } = mockAnthropic(() => ({
    status: 200,
    sse: sseOf([
      ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 42, output_tokens: 1 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Olá, ' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'tudo certo.' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } }],
      ['message_stop', { type: 'message_stop' }],
    ]),
  }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const p = new AnthropicProvider('chave-teste', new Anthropic({ apiKey: 'chave-teste', baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 }));
  const events = [];
  for await (const ev of p.stream({ model: 'claude-haiku-4-5', system: 'Você é a GreenIA.', messages: [{ role: 'user', content: 'oi' }], maxOutputTokens: 4096 })) events.push(ev);
  server.close();
  assert.deepEqual(events.filter(e => e.type === 'text').map(e => (e as { text: string }).text), ['Olá, ', 'tudo certo.']);
  assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'end_turn', model: 'claude-haiku-4-5', usage: { inputTokens: 42, outputTokens: 7 } });
  assert.equal(seen[0].system, 'Você é a GreenIA.');
  assert.equal(seen[0].model, 'claude-haiku-4-5');
  assert.equal(seen[0].stream, true);
  assert.deepEqual(seen[0].messages, [{ role: 'user', content: 'oi' }]);
});

test('AnthropicProvider: 429 vira LlmError com retryable', async () => {
  const { server } = mockAnthropic(() => ({ status: 429, json: { type: 'error', error: { type: 'rate_limit_error', message: 'devagar' } } }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const p = new AnthropicProvider('k', new Anthropic({ apiKey: 'k', baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 }));
  await assert.rejects(async () => { for await (const _ of p.stream({ model: 'm', system: 's', messages: [{ role: 'user', content: 'oi' }], maxOutputTokens: 256 })) { /* nada */ } },
    (e: unknown) => e instanceof LlmError && e.retryable && e.status === 429);
  server.close();
});
