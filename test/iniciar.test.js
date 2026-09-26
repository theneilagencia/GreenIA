// O processo sobe de verdade pelo ponto de entrada (npm start) e responde na saúde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('npm start: sobe, responde em /api/saude e para com SIGTERM', async () => {
  const porta = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORTA: String(porta), HOST: '127.0.0.1', BANCO: join(mkdtempSync(join(tmpdir(), 'greenia-')), 'g.sqlite'), OPENROUTER_API_KEY: '', NODE_ENV: 'development' };
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/iniciar.js'], { env, stdio: 'pipe' });
  let saida = '';
  p.stdout.on('data', d => { saida += d; });
  p.stderr.on('data', d => { saida += d; });
  let ok = false;
  for (let i = 0; i < 50 && !ok; i++) {
    await new Promise(r => setTimeout(r, 100));
    ok = await fetch(`http://127.0.0.1:${porta}/api/saude`).then(r => r.ok).catch(() => false);
  }
  const fim = new Promise(r => p.on('exit', r));
  p.kill('SIGTERM');
  assert.ok(ok, saida);
  assert.equal(await fim, 0);
});
