import { test } from 'node:test';
import assert from 'node:assert/strict';
import core from '../lib/greenia-core.js';

const { typewriterChunk, typewriterNext, TYPEWRITER_MAX_MS, TYPEWRITER_FRAME_MS } = core;

// Simula o laço de requestAnimationFrame e devolve a duração total em ms.
function simulate(length, frameMs) {
  const chunk = typewriterChunk(length);
  let shown = 0;
  let t = 0;
  let frames = 0;
  while (shown < length) {
    shown = typewriterNext(length, shown, t, chunk);
    frames++;
    if (shown < length) t += frameMs;
    assert.ok(frames < 100000, 'laço não terminou');
  }
  return t;
}

for (const length of [10, 2000, 20000]) {
  test(`duração nunca passa de ~1,2 s para ${length} caracteres (60 fps)`, () => {
    assert.ok(simulate(length, TYPEWRITER_FRAME_MS) <= TYPEWRITER_MAX_MS);
  });
  test(`duração nunca passa de ~1,2 s para ${length} caracteres (quadros lentos, 50 ms)`, () => {
    assert.ok(simulate(length, 50) <= TYPEWRITER_MAX_MS + 50);
  });
}

test('texto curto é mostrado caractere a caractere', () => {
  assert.equal(typewriterChunk(10), 1);
});

test('bloco cresce com o tamanho do texto', () => {
  assert.ok(typewriterChunk(20000) > typewriterChunk(2000));
  assert.ok(typewriterChunk(2000) > typewriterChunk(10));
});

test('nunca passa do fim do texto', () => {
  assert.equal(typewriterNext(100, 99, 0, 5), 100);
  assert.equal(typewriterNext(100, 0, 99999, 1), 100);
});
