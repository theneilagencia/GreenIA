// Fontes servidas pelo próprio servidor: nenhuma página chama o Google Fonts, a CSP só aceita fontes locais,
// os arquivos existem com a licença (OFL) ao lado e chegam com o tipo certo e cache longo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { subir } from './ajuda.js';

const raiz = new URL('../', import.meta.url).pathname;
const ler = p => readFileSync(raiz + p, 'utf8');
let V;
before(async () => { V = await subir({ paginaInicial: 'vendas' }); });
after(() => V.fechar());

test('nenhuma página nem gerador chama o Google Fonts; todas usam /fontes/fontes.css', () => {
  const paginas = readdirSync(raiz + 'public').filter(f => f.endsWith('.html'));
  for (const p of [...paginas.map(f => 'public/' + f), 'scripts/gerar-legais.js', 'src/http.js']) assert.doesNotMatch(ler(p), /fonts\.(googleapis|gstatic)\.com/, p);
  for (const f of paginas) assert.match(ler('public/' + f), /href="\/fontes\/fontes\.css"/, f);
  for (const m of ler('public/fontes/fontes.css').matchAll(/url\(([^)]+)\)/g)) assert.ok(existsSync(raiz + 'public' + m[1]), m[1]);
  for (const l of ['OFL-Inter.txt', 'OFL-Source-Serif-4.txt']) assert.match(ler('public/fontes/' + l), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(ler('public/fontes/OFL-Source-Serif-4.txt'), /Reserved Font Name ‘Source’/);
});

test('fontes servidas com tipo font/woff2, cache longo e CSP só com fontes locais', async () => {
  const css = await fetch(`${V.base}/fontes/fontes.css`);
  assert.equal(css.status, 200);
  const csp = css.headers.get('content-security-policy');
  assert.match(csp, /font-src 'self';/);
  assert.doesNotMatch(csp, /googleapis|gstatic/);
  for (const m of (await css.text()).matchAll(/url\(([^)]+)\)/g)) {
    const r = await fetch(V.base + m[1]);
    assert.equal(r.status, 200, m[1]);
    assert.equal(r.headers.get('content-type'), 'font/woff2');
    assert.match(r.headers.get('cache-control'), /immutable/);
    await r.arrayBuffer();
  }
  assert.equal((await fetch(`${V.base}/fontes/OFL-Inter.txt`)).status, 200);
});
