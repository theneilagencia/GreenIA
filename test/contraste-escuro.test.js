// Tema escuro: contraste AA nos pares de texto (4,5:1) e nos de controle e foco (3:1), os dois blocos do tema
// iguais (Automático e Escuro escolhido) e a cor de marca de qualquer empresa legível no escuro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/estilo.css', import.meta.url), 'utf8');
const bloco = sel => { const i = css.indexOf(sel); assert.ok(i >= 0, `bloco ausente: ${sel}`); const a = css.indexOf('{', i) + 1; return css.slice(a, css.indexOf('}', a)); };
const tokens = txt => Object.fromEntries([...txt.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const AUTO = tokens(bloco(':root:not([data-tema="claro"]){'));
const ESCURO = tokens(bloco(':root[data-tema="escuro"]{'));
const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const cor = n => (n.startsWith('#') ? n : ESCURO[n]);

test('os dois blocos do tema escuro (Automático e escolhido) têm os mesmos valores', () => {
  assert.ok(Object.keys(ESCURO).length > 40);
  assert.deepEqual(AUTO, ESCURO);
});

test('tema escuro: texto com 4,5:1 e bordas de controle e foco com 3:1', () => {
  const FUNDOS = ['paper', 'surface', 'sand', 'sand-hover', 'campo'];
  const TEXTO = [
    // stone: separadores das migalhas, sempre sobre o papel.
    ...['ink', 'tinta-2', 'muted', 'faint', 'forest-text', 'stone'].flatMap(t => FUNDOS.filter(f => t !== 'stone' || f === 'paper').map(f => [t, f])),
    ['forest-text', 'mint'], ['ink', 'mint'], ['amber-text', 'amber-bg'], ['amber-text', 'paper'], ['red-text', 'red-bg'], ['red-text', 'paper'],
    ['clay-text', 'clay-bg'], ['roxo-text', 'roxo-bg'], ['forest-text', 'ok-bg'], ['ink', 'escolha-marcada'], ['tinta-2', 'atencao-bg'], ['tinta-2', 'erro-bg'],
    ['sobre-forte', 'forest-strong'], ['sobre-forte', 'forest-strong-hover'], ['sobre-deep', 'deep'], ['ink', 'lateral-admin'], ['muted', 'lateral-admin'],
  ];
  const CONTROLE = [['line-strong', 'paper'], ['line-strong', 'surface'], ['forest', 'paper'], ['forest', 'campo'], ['forest', 'surface'], ['forest', 'sand']];
  const ruins = [...TEXTO.map(p => [...p, 4.5]), ...CONTROLE.map(p => [...p, 3])].map(([t, f, m]) => [t, f, m, razao(cor(t), cor(f))]).filter(p => p[3] < p[2]);
  assert.deepEqual(ruins.map(([t, f, m, r]) => `${t} sobre ${f}: ${r.toFixed(2)} (mínimo ${m})`), []);
});

test('cor de marca no escuro: botão na cor da empresa, texto e foco no mesmo tom clareado, sempre legíveis', async () => {
  const { contraste } = await import('../src/admin.js');
  const { tonsMarca, FUNDOS_ESCUROS } = await import('../public/comum.js');
  let aceitas = 0;
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    const c = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    if (contraste(c, '#F1F1EE') < 4.5) continue;   // o servidor recusa
    aceitas++;
    const { escuro: e } = tonsMarca(c);
    assert.equal(e['--forest-strong'], c);
    assert.ok(contraste('#FFFFFF', c) >= 4.5, `${c}: texto branco no botão`);
    for (const f of [...FUNDOS_ESCUROS, e['--mint'], e['--ok-bg'], e['--escolha-marcada']]) assert.ok(contraste(e['--forest-text'], f) >= 4.5, `${c}: texto ${e['--forest-text']} sobre ${f}`);
    for (const f of FUNDOS_ESCUROS) assert.ok(contraste(e['--forest'], f) >= 3, `${c}: foco ${e['--forest']} sobre ${f}`);
    assert.ok(contraste('#1A1915', e['--deep']) >= 7, `${c}: texto no selo claro`);
  }
  assert.ok(aceitas > 500);
});

test('fundos escuros usados na conta da marca são os do tema', async () => {
  const { FUNDOS_ESCUROS } = await import('../public/comum.js');
  assert.deepEqual(FUNDOS_ESCUROS, ['paper', 'campo', 'surface', 'sand', 'sand-hover'].map(n => ESCURO[n].toLowerCase()));
});
