import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { exportSections, type ExportMeta } from '../src/blocks/exportar.ts';
import { parseCsv } from '../src/util/csv.ts';
import type { Section } from '../src/blocks/types.ts';
import { inputFile } from './fixtures.ts';

const META: ExportMeta = {
  runId: '0b9e7c1a-1111-2222-3333-444455556666', assistente: 'Conferência de NF-e', versao: 3, criadoEm: '2026-09-24T10:15:00.000Z',
  revisao: { status: 'aprovado_com_edicao', revisor: 'key.fiscal@repet.com.br', em: '2026-09-24T11:00:00.000Z' }, tenant: 'Empresa Exemplo',
};

const SECTIONS: Section[] = [
  { id: 'ler', bloco: 'ler', titulo: 'Documentos lidos', kind: 'documentos', flags: [], data: [{ arquivo: 'nfe-1234.xml', tipo: 'nfe_xml', leitura: 'parser', paginas: 1, avisos: [] }] },
  { id: 'nota-pedido', bloco: 'conferir', titulo: 'Nota × pedido', kind: 'divergencias', flags: [], data: {
    rotulos: { esquerda: 'Nota', direita: 'Pedido' }, resumo: { esquerda: 2, direita: 2, pares: 2, divergencias: 1, conferidos: 4 },
    divergencias: [{ chave: 'P-002', campo: 'Quantidade', regra: 'numero', motivo: 'diferença de -2 (-4,00%)', esquerda: { valor: 48, origem: 'nfe-1234.xml › item 2' }, direita: { valor: 50, origem: 'pedido.xlsx › Pedido › linha 3' } }] } },
  { id: 'exportar', bloco: 'exportar', titulo: 'Exportação', kind: 'exportacao', flags: [], data: { formatos: ['xlsx'] } },
];

test('XLSX: identificação da execução e uma aba por seção, com cabeçalho e valores', async () => {
  const f = await exportSections('xlsx', SECTIONS, META);
  assert.equal(f.name, 'conferencia-de-nf-e-0b9e7c1a.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(f.bytes) as unknown as ArrayBuffer);
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Identificação', 'Documentos lidos', 'Nota × pedido']);
  assert.match(String(wb.getWorksheet('Identificação')!.getCell('A3').value), /aprovada com edição por key\.fiscal@repet\.com\.br/);
  const ws = wb.getWorksheet('Nota × pedido')!;
  assert.deepEqual((ws.getRow(1).values as unknown[]).slice(1), ['Chave', 'Campo', 'Divergência', 'Nota', 'Origem (Nota)', 'Pedido', 'Origem (Pedido)']);
  assert.deepEqual((ws.getRow(2).values as unknown[]).slice(1), ['P-002', 'Quantidade', 'diferença de -2 (-4,00%)', '48', 'nfe-1234.xml › item 2', '50', 'pedido.xlsx › Pedido › linha 3']);
});

test('CSV: a tabela principal (não a lista de documentos)', async () => {
  const f = await exportSections('csv', SECTIONS, META);
  const rows = parseCsv(new TextDecoder().decode(f.bytes));
  assert.equal(rows[0][0], 'Chave');
  assert.equal(rows[1][2], 'diferença de -2 (-4,00%)');
});

test('PDF e DOCX: identificação, título da seção e divergência legíveis', async () => {
  const pdf = await exportSections('pdf', SECTIONS, META);
  const t = (await extractText(await getDocumentProxy(pdf.bytes), { mergePages: true })).text;
  assert.match(t, /Conferência de NF-e/);
  assert.match(t, /Revisão: aprovada com edição por key\.fiscal@repet\.com\.br/);
  assert.match(t, /Nota × pedido/);
  assert.match(t, /diferença de -2 \(-4,00%\)/);
  const docx = await exportSections('docx', SECTIONS, META);
  const d = (await mammoth.extractRawText({ buffer: Buffer.from(docx.bytes) })).value;
  assert.match(d, /Nota × pedido/);
  assert.match(d, /pedido\.xlsx › Pedido › linha 3/);
});

test('ZIP organizado da classificação: pastas por categoria, nomes do índice revisado e índice em CSV', async () => {
  const files = [inputFile('scan_004.pdf', 'lista'), inputFile('politica.pdf', 'politica')];
  const sections: Section[] = [{ id: 'c', bloco: 'classificar', titulo: 'Índice', kind: 'classificacao', flags: [], data: { pacoteZip: true, indice: [
    { arquivo: 'scan_004.pdf', categoria: 'treinamento', categoriaNome: 'Treinamento', periodo: '2026-05', nomeSugerido: 'treinamento_2026-05_lista-lgpd.pdf', confianca: 'alta', como: '' },
    { arquivo: 'politica.pdf', categoria: 'politica', categoriaNome: 'Política', periodo: '2026-03', nomeSugerido: 'politicas/2026/politica-privacidade.pdf', confianca: 'alta', como: '' },
    { arquivo: 'sumiu.pdf', categoria: null, categoriaNome: 'Não classificado', periodo: null, nomeSugerido: 'x.pdf', confianca: 'baixa', como: '' },
  ] } }];
  const f = await exportSections('zip', sections, META, files);
  const zip = await JSZip.loadAsync(f.bytes);
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
  assert.deepEqual(names, ['LEIAME.txt', 'indice.csv', 'politicas/2026/politica-privacidade.pdf', 'treinamento/treinamento_2026-05_lista-lgpd.pdf']);
  assert.equal(await zip.file('treinamento/treinamento_2026-05_lista-lgpd.pdf')!.async('string'), 'lista');
  const idx = parseCsv(await zip.file('indice.csv')!.async('string'));
  assert.equal(idx[3][3], '(arquivo original indisponível)');
  await assert.rejects(exportSections('zip', SECTIONS, META), /não há classificação/);
});
