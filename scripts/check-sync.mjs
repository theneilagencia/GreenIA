// Garante que o bloco de funções puras em GreenIA.dc.html é idêntico ao de
// lib/greenia-core.js (o runtime do Claude Design não importa arquivos, então
// o bloco existe em cópia).
//
//   node scripts/check-sync.mjs          falha (exit 1) se as cópias divergirem
//   node scripts/check-sync.mjs --write  copia o bloco da lib para o .dc.html
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const LIB = root + 'lib/greenia-core.js';
const PAGE = root + 'GreenIA.dc.html';
const BEGIN = '// >>> greenia-core';
const END = '// <<< greenia-core';

function block(src, name) {
  const a = src.indexOf(BEGIN);
  const b = src.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error(`${name}: marcadores do bloco greenia-core não encontrados`);
  if (src.indexOf(BEGIN, a + 1) !== -1) throw new Error(`${name}: marcador de início repetido`);
  return { start: a, end: b + END.length, text: src.slice(a, b + END.length) };
}

const lib = readFileSync(LIB, 'utf8');
const page = readFileSync(PAGE, 'utf8');
const L = block(lib, 'lib/greenia-core.js');
const P = block(page, 'GreenIA.dc.html');

if (process.argv.includes('--write')) {
  if (L.text !== P.text) {
    writeFileSync(PAGE, page.slice(0, P.start) + L.text + page.slice(P.end));
    console.log('GreenIA.dc.html atualizado a partir de lib/greenia-core.js');
  } else {
    console.log('Já estavam iguais.');
  }
} else if (L.text !== P.text) {
  const l = L.text.split('\n');
  const p = P.text.split('\n');
  const i = l.findIndex((line, k) => line !== p[k]);
  console.error('greenia-core divergiu entre lib/greenia-core.js e GreenIA.dc.html.');
  console.error(`Primeira diferença na linha ${i + 1} do bloco:`);
  console.error('  lib : ' + JSON.stringify(l[i]));
  console.error('  page: ' + JSON.stringify(p[i]));
  console.error('Rode: node scripts/check-sync.mjs --write');
  process.exit(1);
} else {
  console.log('greenia-core em sincronia.');
}
