// Prova de que o núcleo é da plataforma, não de um cliente: falha se nomes de
// área, nomes de cliente ou tipos de documento aparecem fixos no código do
// núcleo. Ficam de fora os dados de demonstração (src/demo, deploy/demo), o
// catálogo (catalog/), os fixtures de teste e o registro de leitores
// (src/readers), que é o lugar próprio dos formatos de documento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const SERVER = join(ROOT, 'server');

function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });
}

// Sem comentários: exemplo em comentário não é regra no código.
const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1').replace(/^\s*--.*$/, '')).join('\n');

const core = [
  ...walk(join(SERVER, 'src'), /\.ts$/).filter(p => !/\/src\/(demo|readers)\//.test(p)),
  ...walk(join(SERVER, 'migrations'), /\.sql$/),
  ...walk(join(ROOT, 'lib'), /\.js$/),
];
const readers = walk(join(SERVER, 'src', 'readers'), /\.ts$/);
const pages = readdirSync(ROOT).filter(n => n.endsWith('.dc.html')).map(n => join(ROOT, n));

const CLIENTES = /\b(repet|sygecom|prumo)\b/i;
const AREAS = /['"`](fiscal|rh|financeiro|lgpd|jur[ií]dico|comercial|suprimentos|compras|atendimento|obras|engenharia|faturamento|manuten[cç][aã]o|opera[cç][oõ]es|recursos humanos|contabilidade|log[ií]stica)['"`]/i;
const DOCUMENTOS = /\b(nf-?e|nfs-?e|danfe|ct-?e|boleto|notas? fisca(l|is))\b/i;

function hits(files: string[], re: RegExp) {
  const out: string[] = [];
  for (const f of files) {
    stripComments(readFileSync(f, 'utf8')).split('\n').forEach((l, i) => { if (re.test(l)) out.push(`${relative(ROOT, f)}:${i + 1}: ${l.trim().slice(0, 140)}`); });
  }
  return out;
}

test('nenhum nome de cliente no núcleo, no registro de leitores nem nas páginas', () => {
  assert.deepEqual(hits([...core, ...readers, ...pages], CLIENTES), []);
});

test('nenhum nome de área fixo no núcleo: as áreas são do cliente', () => {
  assert.deepEqual(hits([...core, ...readers], AREAS), []);
});

test('nenhum tipo de documento fixo no núcleo: formatos ficam no registro de leitores', () => {
  assert.deepEqual(hits(core, DOCUMENTOS), []);
});

test('o próprio teste pega o que deve pegar', () => {
  assert.ok(core.length > 60, `arquivos do núcleo lidos: ${core.length}`);
  assert.ok(hits(readers, DOCUMENTOS).length > 0);                 // os leitores falam de documentos: a varredura funciona
  assert.ok(CLIENTES.test('tenant da Repet'));
  assert.ok(AREAS.test(`where slug = 'fiscal'`));
  assert.ok(DOCUMENTOS.test(`if (kind === 'nfe')`));
  assert.equal(stripComments('const a = 1; // ex.: NF-e'), 'const a = 1; ');
  assert.equal(stripComments(`const u = 'http://x'`), `const u = 'http://x'`);
});

// Os dados de cada cliente ficam em implantacoes/<cliente>/tenant.json, fora do
// código, e passam pela mesma validação da criação de tenant.
test('arquivos de implantação validam no schema de criação de tenant', async () => {
  const { newTenantSchema } = await import('../src/platform/tenants.ts');
  const { parseTenantConfig } = await import('../src/tenants/config.ts');
  const dir = join(ROOT, 'implantacoes');
  const files = readdirSync(dir).map(n => join(dir, n, 'tenant.json')).filter(p => { try { return statSync(p).isFile(); } catch { return false; } });
  assert.ok(files.length >= 1);
  for (const f of files) {
    const t = newTenantSchema.parse(JSON.parse(readFileSync(f, 'utf8')));
    parseTenantConfig(t.config);
    for (const p of t.providers) assert.equal((p.config as { clientSecret?: string }).clientSecret, undefined, `${f}: segredo no arquivo`);
  }
});
