// Serviço de conversão: na AWS (Fargate), o sistema não permite tirar a rede de
// um processo filho; a conversão roda então numa tarefa própria, sem saída de
// rede e sem segredos, e o servidor envia os bytes para lá (CONVERTER_URL).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { buildConverterService } from '../src/convert/service.ts';
import { RemoteConverter } from '../src/convert/remote.ts';
import { ConversionError, type Converter } from '../src/convert/converter.ts';
import { createTestDb, type TestDb } from './helpers.ts';
import { buildTestApp } from './app-helpers.ts';

const TOKEN = 'token-de-teste-do-conversor-0123456789abcdef';
const chamadas: string[] = [];
const fake: Converter = {
  async available() { return { ocr: true, images: true, office: false }; },
  async isolamento() { return { rede: true, limites: true, ambienteLimpo: true as const }; },
  async ocrPdf(b, pages) { chamadas.push(`ocrPdf:${b.length}:${pages?.join(',') ?? 'todas'}`); return [{ n: 2, text: 'Página dois', confidence: 91.5, words: 2, image: new Uint8Array([255, 216, 1]) }]; },
  async ocrImage(b) { chamadas.push(`ocrImage:${b.length}`); return [{ n: 1, text: 'foto', confidence: 80, words: 1 }]; },
  async imageToJpeg(b) { chamadas.push(`imageToJpeg:${b.length}`); return [new Uint8Array([1]), new Uint8Array([2, 3])]; },
  async officeToOoxml(b, from) { chamadas.push(`office:${from}:${b.length}`); if (from === 'xls') throw new ConversionError('o LibreOffice não converteu o arquivo XLS'); return new Uint8Array([80, 75, 3, 4]); },
};
let svc: FastifyInstance, url = '', db: TestDb | undefined;
before(async () => {
  svc = await buildConverterService(fake, { token: TOKEN, bodyLimitMb: 5 });
  url = await svc.listen({ port: 0, host: '127.0.0.1' });
});
after(async () => { await svc?.close(); await db?.drop(); });

test('o conversor remoto faz as mesmas operações que o local, com os mesmos resultados', async () => {
  const r = new RemoteConverter({ url, token: TOKEN, timeoutS: 30 });
  assert.deepEqual(await r.available(), { ocr: true, images: true, office: false });
  assert.deepEqual(await r.isolamento(), { rede: true, limites: true, ambienteLimpo: true, remoto: true });
  assert.deepEqual(await r.ocrPdf(new Uint8Array(10), [2, 3]), [{ n: 2, text: 'Página dois', confidence: 91.5, words: 2, image: new Uint8Array([255, 216, 1]) }]);
  assert.equal((await r.ocrImage(new Uint8Array(4)))[0].image, undefined);
  assert.deepEqual(await r.imageToJpeg(new Uint8Array(3)), [new Uint8Array([1]), new Uint8Array([2, 3])]);
  assert.deepEqual(await r.officeToOoxml(new Uint8Array(7), 'doc'), new Uint8Array([80, 75, 3, 4]));
  assert.deepEqual(chamadas.splice(0), ['ocrPdf:10:2,3', 'ocrImage:4', 'imageToJpeg:3', 'office:doc:7']);
  // Erro de conversão chega como erro de conversão, com a mesma mensagem.
  await assert.rejects(r.officeToOoxml(new Uint8Array(1), 'xls'), (e: Error) => e instanceof ConversionError && /não converteu o arquivo XLS/.test(e.message));
  assert.deepEqual(chamadas.splice(0), ['office:xls:1']);
});

test('sem o token certo, o serviço não converte nada; /health fica aberto', async () => {
  for (const auth of [undefined, 'Bearer errado', `Bearer ${TOKEN}x`, TOKEN]) {
    const r = await svc.inject({ method: 'POST', url: '/v1/imagem-jpeg', headers: { 'content-type': 'application/octet-stream', ...(auth ? { authorization: auth } : {}) }, payload: Buffer.from([1]) });
    assert.equal(r.statusCode, 401, String(auth));
  }
  assert.equal(chamadas.length, 0);
  assert.equal((await svc.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  await assert.rejects(new RemoteConverter({ url, token: 'x'.repeat(40), timeoutS: 5 }).imageToJpeg(new Uint8Array(1)), /respondeu 401/);
  assert.throws(() => new RemoteConverter({ url, token: 'curto', timeoutS: 5 }), /CONVERTER_TOKEN/);
  await assert.rejects(buildConverterService(fake, { token: 'curto', bodyLimitMb: 1 }), /32 caracteres/);
});

test('arquivo acima do limite do serviço é recusado (413); origem inválida no office, 422', async () => {
  const h = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream' };
  assert.equal((await svc.inject({ method: 'POST', url: '/v1/ocr-imagem', headers: h, payload: Buffer.alloc(6 * 1024 * 1024) })).statusCode, 413);
  assert.equal((await svc.inject({ method: 'POST', url: '/v1/office?de=exe', headers: h, payload: Buffer.from([1]) })).statusCode, 422);
  assert.equal(chamadas.length, 0);
});

test('com CONVERTER_URL, o servidor usa o serviço e a prontidão diz onde e como as conversões rodam', async () => {
  db = await createTestDb();
  const app = await buildTestApp(db, {}, { CONVERTER_URL: url, CONVERTER_TOKEN: TOKEN });
  try {
    const r = (await app.inject({ method: 'GET', url: '/health/ready' })).json();
    assert.deepEqual(r.isolamento, { onde: 'servico', rede: 'sem_rede', limites: 'ok' });
    assert.deepEqual(r.ferramentas, { ocr: 'ok', imagens: 'ok', office: 'ausente' });
  } finally { await app.close(); }
  // Serviço fora do ar: a prontidão do servidor não cai (as conversões são informativas).
  const fora = await buildTestApp(db, {}, { CONVERTER_URL: 'http://127.0.0.1:9', CONVERTER_TOKEN: TOKEN });
  try {
    const r = await fora.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().ferramentas, { ocr: 'ausente', imagens: 'ausente', office: 'ausente' });
  } finally { await fora.close(); }
});

test('o serviço sobe sozinho, sem banco, Redis nem chave do modelo', async () => {
  const porta = 20000 + Math.floor(Math.random() * 20000);
  const p = spawn(process.execPath, ['src/converter-main.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { PATH: process.env.PATH, CONVERTER_TOKEN: TOKEN, CONVERTER_PORT: String(porta), HOST: '127.0.0.1' }, stdio: 'ignore',
  });
  try {
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) {
      ok = await fetch(`http://127.0.0.1:${porta}/health`).then(r => r.ok, () => false);
      if (!ok) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ok, 'o serviço respondeu /health');
    const d = await fetch(`http://127.0.0.1:${porta}/v1/disponivel`, { headers: { authorization: `Bearer ${TOKEN}` } }).then(r => r.json()) as { isolamento: { ambienteLimpo: boolean } };
    assert.equal(d.isolamento.ambienteLimpo, true);
  } finally { p.kill('SIGTERM'); }
});
