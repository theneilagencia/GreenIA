// Geradores do corpus da Fase 4: os gabaritos validam no schema, os arquivos
// saem iguais com a mesma semente, todo PDF tem a marca d'água, os CPFs têm
// dígitos válidos, e o que o gabarito diz está de fato nos arquivos (item
// ausente não aparece, duvidoso só na ficha, divergência plantada na cotação,
// trecho da cláusula no contrato).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { gerarRh } from '../eval/fase4/gerar-rh.ts';
import { gerarJuridico, gerarSuprimentos } from '../eval/fase4/gerar-construtora.ts';
import { gabaritosEm, validar } from '../eval/fase4/validar.ts';
import { MARCA, cpfValido } from '../eval/fase4/lib.ts';

let A = '', B = '';
const norm = (s: string) => s.replace(/\s+/g, ' ');
async function textOf(path: string): Promise<string> {
  const buf = readFileSync(path);
  if (path.endsWith('.pdf')) return norm((await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true })).text);
  if (path.endsWith('.docx')) return norm((await mammoth.extractRawText({ buffer: buf })).value);
  return '';
}
const load = (dir: string, frente: string) => gabaritosEm(join(dir, frente)).map(f => ({ dir: join(f, '..'), g: JSON.parse(readFileSync(f, 'utf8')) }));

before(async () => {
  A = mkdtempSync(join(tmpdir(), 'fase4-a-'));
  B = mkdtempSync(join(tmpdir(), 'fase4-b-'));
  for (const d of [A, B]) {
    await gerarRh(d, 5, 4101);
    await gerarSuprimentos(d, 2, 4201);
    await gerarJuridico(d, 4, 4201);
  }
});
after(() => { rmSync(A, { recursive: true, force: true }); rmSync(B, { recursive: true, force: true }); });

test('gabaritos validam no schema e os sha256 batem com os arquivos', () => {
  const r = validar(A);
  assert.equal(r.casos, 5 + 6 + 4);
  assert.deepEqual(r.erros, []);
});

test('mesma semente, mesmos arquivos', () => {
  const sums = (d: string) => gabaritosEm(d).map(f => JSON.parse(readFileSync(f, 'utf8'))).flatMap((g: { caso: string; arquivos: { nome: string; sha256: string }[] }) => g.arquivos.map(a => `${g.caso}/${a.nome}:${a.sha256}`)).sort();
  assert.deepEqual(sums(A), sums(B));
});

test('RH: marca d’água em todo PDF, CPF válido, ausente não aparece, duvidoso só na ficha', async () => {
  // Título do documento (o que prova o item) e como a ficha cita o item duvidoso.
  const words: Record<string, RegExp> = { rg: /CARTEIRA DE IDENTIDADE/, cpf: /Cadastro de Pessoas Físicas/, residencia: /CONTA DE LUZ/, ctps: /CARTEIRA DE TRABALHO DIGITAL/,
    aso: /ATESTADO DE SAÚDE OCUPACIONAL/, titulo: /TÍTULO ELEITORAL/, banco: /COMPROVANTE DE CONTA SALÁRIO/ };
  const cita: Record<string, RegExp> = { rg: /RG:/, cpf: /CPF:/, residencia: /Comprovante de residência/, ctps: /Carteira de trabalho/, aso: /ASO:/, titulo: /Título de eleitor/, banco: /Dados bancários/ };
  const casos = load(A, 'rh');
  assert.equal(casos.filter(c => c.g.esperado.itens.every((i: { situacao: string }) => i.situacao === 'presente')).length >= 1, true);   // há pasta completa
  assert.ok(casos.some(c => c.g.esperado.itens.some((i: { situacao: string }) => i.situacao === 'ausente')));
  for (const { dir, g } of casos) {
    const texts = new Map<string, string>();
    for (const a of g.arquivos) texts.set(a.nome, await textOf(join(dir, a.nome)));
    for (const [nome, t] of texts) {
      assert.ok(t.includes(MARCA), `${g.caso}/${nome} sem marca d'água`);
      for (const c of t.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g) ?? []) assert.ok(cpfValido(c), `${g.caso}: CPF inválido ${c}`);
    }
    const ficha = texts.get('ficha-de-admissao.pdf')!;
    const outros = [...texts].filter(([n]) => n !== 'ficha-de-admissao.pdf').map(([, t]) => t).join(' ');
    for (const it of g.esperado.itens as { item: string; situacao: string; arquivo: string | null }[]) {
      if (it.situacao === 'presente') assert.match(texts.get(it.arquivo!)!, words[it.item], `${g.caso}: ${it.item} presente`);
      if (it.situacao === 'ausente') { assert.doesNotMatch(outros, words[it.item], `${g.caso}: ${it.item} deveria faltar`); assert.doesNotMatch(ficha.split('Observações')[1] ?? '', cita[it.item]); }
      if (it.situacao === 'duvidoso') { assert.doesNotMatch(outros, words[it.item], `${g.caso}: ${it.item} só na ficha`); assert.match(ficha.split('Observações')[1] ?? '', cita[it.item]); }
    }
  }
});

test('Suprimentos: cada divergência do gabarito está na cotação; a primeira cotação de cada especificação vem limpa', async () => {
  const casos = load(A, 'suprimentos');
  assert.equal(casos.length, 6);
  for (const { dir, g } of casos) {
    const spec = g.arquivos.find((a: { tipo: string }) => a.tipo === 'planilha').nome;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(dir, spec));
    const rows = (wb.getWorksheet('Especificação')!.getSheetValues() as unknown[][]).filter(Boolean).map(r => r.slice(1)).filter(r => /^[A-Z]{3}-/.test(String(r[0])));
    const specOf = new Map(rows.map(r => [String(r[0]), { q: Number(r[2]), u: String(r[3]) }]));
    const cot = await textOf(join(dir, g.esperado.cotacao.arquivo));
    assert.ok(cot.includes(MARCA));
    const lineOf = (code: string) => cot.match(new RegExp(`${code} · [^·]+ · ([\\d,]+) (\\S+) · R\\$`));
    if (g.caso.endsWith('-1')) assert.deepEqual(g.esperado.divergencias, []);
    for (const d of g.esperado.divergencias as { codigo: string; tipo: string; especificado: unknown; cotado: unknown }[]) {
      const l = lineOf(d.codigo);
      if (d.tipo === 'faltante_na_cotacao') { assert.equal(l, null, `${g.caso}: ${d.codigo} deveria faltar`); assert.ok(specOf.has(d.codigo)); }
      if (d.tipo === 'sem_especificacao') { assert.ok(l); assert.ok(!specOf.has(d.codigo)); }
      if (d.tipo === 'quantidade') { assert.equal(Number(l![1].replace(',', '.')), d.cotado); assert.equal(specOf.get(d.codigo)!.q, d.especificado); assert.notEqual(d.cotado, d.especificado); }
      if (d.tipo === 'unidade') { assert.equal(l![2], d.cotado); assert.equal(specOf.get(d.codigo)!.u, d.especificado); }
    }
    // Itens sem divergência: cotação igual à especificação.
    const marcados = new Set(g.esperado.divergencias.map((d: { codigo: string }) => d.codigo));
    for (const [code, s] of specOf) if (!marcados.has(code)) { const l = lineOf(code)!; assert.equal(Number(l[1].replace(',', '.')), s.q); assert.equal(l[2], s.u); }
  }
});

test('Jurídico: o trecho de cada cláusula esperada está no contrato; cláusula ausente não aparece; perguntas apontam para o gabarito', async () => {
  const HEAD: Record<string, string> = { vigencia: 'DA VIGÊNCIA', reajuste: 'DO REAJUSTE', multa: 'DAS PENALIDADES', rescisao: 'DA RESCISÃO', confidencialidade: 'DA CONFIDENCIALIDADE', foro: 'DO FORO' };
  const casos = load(A, 'juridico');
  for (const { dir, g } of casos) {
    const t = await textOf(join(dir, g.esperado.contrato));
    assert.ok(t.includes(MARCA));
    for (const [campo, v] of Object.entries(g.esperado.campos) as [string, { clausula: string; trecho: string } | null][]) {
      if (v) { assert.ok(t.includes(v.trecho), `${g.caso}: trecho de ${campo}`); if (campo !== 'partes') assert.ok(t.includes(`${v.clausula.replace('Cláusula', 'CLÁUSULA')} · ${HEAD[campo]}`), `${g.caso}: título de ${campo}`); }
      else assert.ok(!t.includes(HEAD[campo]), `${g.caso}: ${campo} deveria faltar`);
    }
  }
  const p = JSON.parse(readFileSync(join(A, 'juridico', 'perguntas.json'), 'utf8')).perguntas;
  assert.equal(p.length, 4);
  for (const q of p) {
    const g = casos.find(c => c.g.esperado.contrato === q.contrato)!.g;
    assert.deepEqual([q.clausula, q.trecho], g.esperado.campos[q.campo] ? [g.esperado.campos[q.campo].clausula, g.esperado.campos[q.campo].trecho] : [null, null]);
  }
});

test('nenhum arquivo gerado fica fora do gabarito', () => {
  for (const f of gabaritosEm(A)) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    const onDisk = readdirSync(join(f, '..')).filter(n => n !== 'gabarito.json').sort();
    assert.deepEqual(g.arquivos.map((a: { nome: string }) => a.nome).sort(), onDisk, g.caso);
  }
});

test('o corpus oficial gerado de novo bate com os gabaritos congelados (sha256 e esperado)', async () => {
  const { gerarOficial, GABARITOS } = await import('../eval/fase4/congelar.ts');
  const d = mkdtempSync(join(tmpdir(), 'fase4-oficial-'));
  try {
    await gerarOficial(d);
    const fresh = gabaritosEm(d).map(f => JSON.parse(readFileSync(f, 'utf8')));
    const frozen = readdirSync(GABARITOS).filter(n => !n.endsWith('.json')).flatMap(fr => readdirSync(join(GABARITOS, fr)).filter(n => n !== 'perguntas.json').map(n => JSON.parse(readFileSync(join(GABARITOS, fr, n), 'utf8'))));
    assert.equal(fresh.length, frozen.length);
    assert.equal(frozen.length, 15 + 60 + 25 + 30 + 10 + 6 + 15);
    const byCase = new Map(frozen.map(g => [g.caso, g]));
    for (const g of fresh) assert.deepEqual(g, byCase.get(g.caso), g.caso);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
