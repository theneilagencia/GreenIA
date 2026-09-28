// Consistência entre a página de vendas e o produto: cada afirmação crítica tem trecho na página, regra,
// implementação e teste (docs/claims-lp.md). Frases que viram promessa jurídica ou garantia não comprovada
// não podem aparecer nas páginas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('../', import.meta.url).pathname;
const ler = p => readFileSync(raiz + p, 'utf8');
const semTags = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PAGINAS = ['public/vendas.html', 'public/index.html'];

test('cada afirmação crítica da página tem regra, implementação e teste existentes', () => {
  const linhas = ler('docs/claims-lp.md').split('\n').filter(l => /^\| C\d+ \|/.test(l));
  assert.ok(linhas.length >= 15);
  const pagina = semTags(ler('public/vendas.html'));
  const testes = readdirSync(raiz + 'test').filter(f => f.endsWith('.test.js')).map(f => ler('test/' + f)).join('\n');
  for (const l of linhas) {
    const [id, trecho, , impl, teste] = l.split(' | ').map(x => x.replace(/^\|\s*|\s*\|$/g, '').trim());
    const texto = trecho.replace(/`/g, '');
    assert.ok(pagina.includes(texto), `${id}: trecho não está na página: "${texto}"`);
    const [, arquivo, simbolo] = /^`([^`]+)` → `(.+)`$/.exec(impl) || [];
    assert.ok(arquivo && simbolo, `${id}: implementação mal descrita: ${impl}`);
    assert.ok(ler(arquivo).includes(simbolo), `${id}: ${arquivo} não contém "${simbolo}"`);
    const titulo = teste.replace(/`/g, '');
    assert.ok(testes.includes(`test('${titulo}'`), `${id}: teste inexistente: "${titulo}"`);
  }
});

test('as páginas não fazem promessa jurídica, não generalizam garantias e não expõem o provedor', () => {
  const PROIBIDO = [
    /garant\w*\s+(?:o\s+)?compliance/i, /compliance\s+garantid/i, /100\s*%\s+(?:em\s+)?compliance/i, /\bLGPD\b/i,
    /prote[çc][ãa]o garantida/i, /todos os modelos\s+(?:t[êe]m|tem)\s+reten/i, /nenhum modelo usa/i,
    /bloqueamos (?:seus )?dados/i, /modelos? homologad/i, /openrouter/i, /processad\w* sempre com seguran[çc]a/i,
    /\bCPF\b[^.]{0,40}\b(?:sempre )?bloquead/i,
  ];
  for (const p of PAGINAS) {
    const t = semTags(ler(p));
    for (const re of PROIBIDO) assert.doesNotMatch(t, re, `${p}: ${re}`);
  }
  // O conceito aprovado e a responsabilidade da empresa estão na página de vendas.
  const v = semTags(ler('public/vendas.html'));
  for (const frase of ['IA disponível, mas com controle', 'Permita o uso de informações sigilosas com guardrails de proteção', 'Sua empresa decide. A GreenIA aplica.',
    'Controle o custo sem contar tokens', 'permanece responsável por suas obrigações legais e regulatórias'])
    assert.ok(v.includes(frase), frase);
});
