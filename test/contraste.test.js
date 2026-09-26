// Contraste mínimo de 4,5:1 nos pares de texto pequeno usados nas telas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/estilo.css', import.meta.url), 'utf8');
const cor = n => {
  if (n.startsWith('#')) return n;
  const m = new RegExp(`--${n}:(#[0-9A-Fa-f]{6})`).exec(css);
  if (!m) throw new Error(`token ausente: ${n}`);
  return m[1];
};
const lum = h => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PARES = [
  ['forest-text', 'paper'], ['forest-text', 'surface'], ['forest-text', 'mint'], ['forest-text', 'surface-hover'], ['forest-strong-hover', 'sand'],
  ['muted', 'paper'], ['muted', 'surface'], ['muted', 'sand'], ['ink', 'paper'], ['ink', 'mint'],
  ['amber-text', 'paper'], ['amber-text', '#F6ECD8'], ['red-text', 'paper'], ['paper', 'forest-strong'],
  ['sage', 'deep'], ['leaf', 'deep'], ['spark', 'deep'], ['deep', 'spark'], ['line', 'deep'],
];

test('texto pequeno com contraste de pelo menos 4,5:1', () => {
  const ruins = PARES.map(([t, f]) => [t, f, razao(cor(t), cor(f))]).filter(p => p[2] < 4.5);
  assert.deepEqual(ruins.map(([t, f, r]) => `${t} sobre ${f}: ${r.toFixed(2)}`), []);
});

test('verde e âmbar de texto pequeno são os pedidos', () => {
  assert.equal(cor('forest-text').toUpperCase(), '#1B7950');
  assert.equal(cor('amber-text').toUpperCase(), '#8C621D');
});
