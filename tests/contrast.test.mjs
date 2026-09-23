import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, checkPage, readTokens } from '../scripts/check-contrast.mjs';

test('contraste segue a fórmula da WCAG', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrast('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  assert.equal(contrast('#1F8A5B', '#FAF7EF').toFixed(2), '4.05');
});

test('variantes de texto passam de 4,5:1 em todos os fundos claros pedidos', () => {
  const light = ['#FAF7EF', '#FFFFFF', '#F1EDE2', '#E6F0E7', '#FBF9F2', '#F1EAD9', '#E9E0CD'];
  for (const variant of ['#19704A', '#845C1B']) {
    for (const bg of light) assert.ok(contrast(variant, bg) >= 4.5, `${variant} sobre ${bg}: ${contrast(variant, bg).toFixed(2)}`);
  }
});

test('par abaixo do mínimo é erro; token inexistente também', () => {
  const src = ':root{ --a:#1F8A5B; --b:#FAF7EF; }';
  const r = checkPage('x', src, [['--a', '--b', 'pequeno', 'teste'], ['--a', '--b', 'grande', 'teste'], ['--zz', '--b', 'pequeno', 'teste']]);
  assert.equal(r.length, 2);
  assert.match(r[0].msg, /4\.05:1, mínimo 4\.5:1/);
  assert.match(r[1].msg, /token inexistente/);
});

test('readTokens lê os tokens do :root', () => {
  assert.deepEqual(readTokens(':root{\n --gia-x:#abcdef; /* c */\n --gia-y:#000000;\n}'), { '--gia-x': '#ABCDEF', '--gia-y': '#000000' });
});
