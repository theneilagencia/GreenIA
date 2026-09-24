// Guarda contra um defeito já visto três vezes neste projeto: ao editar arquivos,
// o escape "\u0300-\u036f" das regex de acento virou os próprios caracteres
// combinantes, invisíveis no editor. A regex continua funcionando, mas o código
// fica ilegível e frágil. Este teste falha se isso voltar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'assets', 'uploads']);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(m?js|ts|html)$/.test(name)) yield p;
  }
}

test('nenhum caractere combinante (U+0300 a U+036F) solto no código-fonte', () => {
  const bad = [];
  for (const f of files(ROOT)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (/[\u0300-\u036f]/.test(l)) bad.push(`${f.slice(ROOT.length)}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], 'use o escape \\u0300-\\u036f em vez dos caracteres');
});
