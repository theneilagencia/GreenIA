// Mede a detecção de nomes de pessoa no conjunto de teste.
//   node eval/nomes/avaliar.mjs [conjunto.json] [--detalhe]
//   (padrão: conjunto-teste.json; use conjunto-validacao.json para a medida sem ajuste)
// Compara: (A) regras atuais do filtro (nome depois de marcador) e
// (B) candidato local (listas de nomes + forma do texto).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { findNames } from './candidato-local.mjs';

const require = createRequire(import.meta.url);
const core = require('../../lib/greenia-core.js');
const file = process.argv.slice(2).find(a => a.endsWith('.json')) || 'conjunto-teste.json';
const data = JSON.parse(readFileSync(new URL('./' + file.split('/').pop(), import.meta.url), 'utf8'));

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const systems = {
  'A. regras atuais': text => core.findSensitive(text).filter(f => f.type === 'nome').map(f => text.slice(f.start, f.end)),
  'B. candidato local': text => findNames(text).map(f => f.text),
};

// Um nome esperado conta como achado se algum trecho detectado o contém ou está contido nele.
const overlaps = (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));

function evaluate(fn) {
  let tp = 0, fp = 0, fn_ = 0, posSent = 0, posHit = 0, negSent = 0, negAlarm = 0;
  const misses = [], alarms = [];
  const t0 = process.hrtime.bigint();
  for (const ex of data.exemplos) {
    const got = fn(ex.texto);
    const used = new Set();
    for (const exp of ex.nomes) {
      const k = got.findIndex((g, idx) => !used.has(idx) && overlaps(g, exp));
      if (k >= 0) { tp++; used.add(k); } else { fn_++; misses.push(exp); }
    }
    got.forEach((g, idx) => { if (!used.has(idx)) { fp++; alarms.push(g + '  ←  ' + ex.texto.replace(/\n/g, ' / ')); } });
    if (ex.nomes.length) { posSent++; if (got.length) posHit++; } else { negSent++; if (got.length) negAlarm++; }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn_ || 1);
  return {
    precision, recall, f1: 2 * precision * recall / (precision + recall || 1),
    sentRecall: posHit / posSent, falseAlarm: negAlarm / negSent,
    tp, fp, fn: fn_, posSent, negSent, ms, misses, alarms,
  };
}

const pct = x => (100 * x).toFixed(1).replace('.', ',') + '%';
console.log(`Conjunto ${file.split('/').pop()}: ${data.exemplos.length} frases (${data.exemplos.filter(e => e.nomes.length).length} com nome, ${data.exemplos.filter(e => !e.nomes.length).length} sem), ${data.exemplos.reduce((n, e) => n + e.nomes.length, 0)} nomes.\n`);
for (const [name, fn] of Object.entries(systems)) {
  const r = evaluate(fn);
  console.log(`${name}`);
  console.log(`  por nome:  precisão ${pct(r.precision)}  cobertura ${pct(r.recall)}  F1 ${pct(r.f1)}  (acertos ${r.tp}, alarmes falsos ${r.fp}, perdidos ${r.fn})`);
  console.log(`  por frase: frases com nome avisadas ${pct(r.sentRecall)}  frases sem nome com aviso indevido ${pct(r.falseAlarm)}`);
  console.log(`  tempo total: ${r.ms.toFixed(1)} ms`);
  if (process.argv.includes('--detalhe')) {
    console.log('  perdidos: ' + (r.misses.join('; ') || '-'));
    console.log('  alarmes falsos:\n    ' + (r.alarms.join('\n    ') || '-'));
  }
  console.log('');
}
