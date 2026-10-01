// Documentos legais e rodapé da LP: páginas geradas em dia com docs/legal, rotas no ar, identificação legal igual nos
// três lugares, aviso de rascunho enquanto houver pendência e a LP sem claim que dependa do que ainda não existe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOCUMENTOS, pagina } from '../scripts/gerar-legais.js';
import { subir } from './ajuda.js';
import { subirPlataforma } from './ajuda-plataforma.js';

const raiz = new URL('../', import.meta.url).pathname;
const ler = p => readFileSync(raiz + p, 'utf8');
const semTags = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const IDENTIDADE = ['NEIL INOVAÇÃO E TECNOLOGIA LTDA', '37.749.373/0001-70', 'Rua G, nº 277, Montserrat, Betim/MG', 'hello@theneil.com.br', 'Vinicius Guimaraes'];

let V, P;
before(async () => { V = await subir({ paginaInicial: 'vendas' }); P = await subirPlataforma({ paginaInicial: 'vendas' }); });
after(async () => { await V.fechar(); await P.fechar(); });

test('páginas legais geradas em dia com docs/legal (rode node scripts/gerar-legais.js depois de editar o .md)', () => {
  for (const d of DOCUMENTOS) assert.equal(ler(d.html), pagina(d), `${d.html} desatualizada em relação a ${d.md}`);
});

test('termos e privacidade no ar na instalação de vendas e na plataforma, com aviso de rascunho enquanto houver pendência', async () => {
  for (const base of [V.base]) {
    for (const d of DOCUMENTOS) {
      const r = await fetch(`${base}${d.caminho}`);
      assert.equal(r.status, 200, d.caminho);
      const h = await r.text();
      assert.match(h, new RegExp(d.titulo));
      if (/\[PENDÊNCIA/.test(ler(d.md))) { assert.match(h, /Rascunho em revisão/); assert.match(h, /noindex/); }
    }
  }
  const nav = P.navegador();
  for (const d of DOCUMENTOS) assert.equal((await nav.get(d.caminho)).status, 200, `plataforma ${d.caminho}`);
});

test('identificação legal igual no rodapé da LP, nos Termos e na Política', () => {
  const lp = semTags(ler('public/vendas.html'));
  for (const x of IDENTIDADE) {
    assert.ok(lp.includes(x), `rodapé sem: ${x}`);
    assert.ok(ler('docs/legal/politica-de-privacidade.md').includes(x), `Política sem: ${x}`);
  }
  for (const x of IDENTIDADE.slice(0, 4)) assert.ok(ler('docs/legal/termos-de-uso.md').includes(x), `Termos sem: ${x}`);
  assert.match(ler('public/vendas.html'), /href="\/termos">Termos de Uso</);
  assert.match(ler('public/vendas.html'), /href="\/privacidade">Política de Privacidade</);
  assert.doesNotMatch(lp, /Bernardo Guimarães/, 'endereço do site institucional não é a sede');
});

test('LP: acesso da equipe sem aprovação prévia inventada; retenção sem prazo na página; nada de "equipe GreenIA" no app das empresas', () => {
  const lp = semTags(ler('public/vendas.html'));
  assert.match(lp, /[Nn]ão depende de aprovação prévia/);
  assert.doesNotMatch(lp.replace(/[Nn]ão depende de aprovação prévia/g, ''), /aprovação prévia|consentimento prévio|autorização (?:prévia|obrigatória)/i);
  assert.doesNotMatch(lp, /\b(?:15|38) dias\b/, 'prazos de cópias ficam na Política (ainda não ativos em produção)');
  for (const p of ['public/app.js', 'public/empresa.js']) assert.doesNotMatch(ler(p).replace(/^\s*\/\/.*$/gm, ''), /equipe GreenIA/, p);
});
