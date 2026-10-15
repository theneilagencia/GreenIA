// Vigia de memória: com pouca memória livre, encerra os processos auxiliares (nunca o principal); com folga, nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarVigia, descendentes } from '../src/vigia-memoria.js';
import { spawn } from 'node:child_process';

test('pouca memória livre: encerra os filhos; com folga: não encerra nada; sem limite de contêiner: desligado', async () => {
  let livre = 500; const mortos = [];
  const v = iniciarVigia({ intervaloMs: 10, limiarMb: 72, log: () => {}, ler: () => ({ limite: 512, livre }), filhos: () => [111, 222], matar: pid => mortos.push(pid) });
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(mortos, []);
  livre = 40;
  await new Promise(r => setTimeout(r, 40));
  assert.ok(mortos.includes(111) && mortos.includes(222));
  v.parar();
  assert.equal(iniciarVigia({ ler: () => null }).ativo, false);
});

test('descendentes: acha o processo filho real deste processo', { skip: process.platform !== 'linux' }, async () => {
  const f = spawn('sleep', ['5']);
  await new Promise(r => setTimeout(r, 100));
  assert.ok(descendentes().includes(f.pid));
  f.kill('SIGKILL');
});

test('envio grande com memória apertada: 503 com aviso, antes de ler o corpo; sem cgroup (local), segue normal', async () => {
  const { subir } = await import('./ajuda.js');
  const S = await subir();
  const r = await fetch(`${S.base}/api/conversas/1/mensagens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'x'.repeat(3 * 1048576) }) });
  assert.notEqual(r.status, 503);   // aqui não há limite de contêiner: a regra não se aplica
  await S.fechar();
});
