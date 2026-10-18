import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('falha ao iniciar navegador encerra o servidor do QA e retorna erro, sem processo preso', () => {
  const codigo = `import {subirComNavegador} from './scripts/navegador.js';
    try { const n=await subirComNavegador(); await n.fechar(); process.exitCode = 2; }
    catch { console.log('falha detectada'); process.exitCode = 1; }`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, CHROMIUM_PATH: '/bin/false' }, timeout: 10000, encoding: 'utf8',
  });
  assert.equal(r.error, undefined, r.error?.message);
  assert.equal(r.signal, null);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /falha detectada/);
});

test('execução programada conclui e o processo encerra sem temporizador de streaming pendurado', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=execução programada de Quick Win sigiloso',
    'test/provedores-ia-sigilo.test.js'], { cwd: new URL('../', import.meta.url), env, timeout: 20000, encoding: 'utf8' });
  assert.equal(r.error, undefined, r.error?.message);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pass 1/);
});
