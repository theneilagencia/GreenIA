// Papel do processo: na AWS, a API e a fila rodam em serviços separados com a
// mesma imagem. Só os papéis all e worker processam a fila.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgres://x@localhost/x' };

test('PROCESS_ROLE: padrão all; aceita api e worker; recusa outro valor', () => {
  assert.equal(loadConfig(base).PROCESS_ROLE, 'all');
  assert.equal(loadConfig({ ...base, PROCESS_ROLE: 'api' }).PROCESS_ROLE, 'api');
  assert.equal(loadConfig({ ...base, PROCESS_ROLE: 'worker' }).PROCESS_ROLE, 'worker');
  assert.throws(() => loadConfig({ ...base, PROCESS_ROLE: 'fila' }), /PROCESS_ROLE/);
});

test('o processo api não inicia o consumidor da fila nem as tarefas periódicas', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const bloco = src.slice(src.indexOf("if (config.PROCESS_ROLE !== 'api')"));
  assert.ok(bloco.length < src.length, 'a condição do papel existe');
  const corpo = bloco.slice(0, bloco.indexOf('\n}\n'));
  for (const s of ['queue.startWorker()', "queue.repeat('retention:sweep'", "queue.repeat('audit:anchor'"]) {
    assert.ok(corpo.includes(s), `${s} fica dentro da condição`);
    assert.equal(src.split(s).length, 2, `${s} aparece uma vez só`);
  }
});
