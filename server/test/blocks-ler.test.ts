import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind, readFile, lerBlock } from '../src/blocks/ler.ts';
import { parseNFe } from '../src/blocks/nfe.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { RunContext } from '../src/blocks/types.ts';
import { docx, inputFile, nfeXml, png, scannedPdf, testEnv, textPdf, xlsx } from './fixtures.ts';

const OPTS = { visao: 'auto' as const, paginasMax: 50 };

test('tipo pelo conteúdo, não só pela extensão', async () => {
  assert.equal(detectKind(inputFile('a.pdf', await textPdf(['oi']))), 'pdf');
  assert.equal(detectKind(inputFile('foto.bin', png())), 'imagem');           // extensão errada, assinatura de PNG
  assert.equal(detectKind(inputFile('contrato.docx', await docx(['oi']))), 'docx');
  assert.equal(detectKind(inputFile('pedido.xlsx', await xlsx({ P: [['a']] }))), 'xlsx');
  assert.equal(detectKind(inputFile('nota.xml', nfeXml({ numero: '1', emissao: '2026-09-01', itens: [] }))), 'nfe_xml');
  assert.equal(detectKind(inputFile('outro.xml', '<?xml version="1.0"?><a/>')), 'texto');
  assert.equal(detectKind(inputFile('lista.csv', 'a;b\n1;2')), 'csv');
  assert.equal(detectKind(inputFile('x.exe', new Uint8Array([0x4d, 0x5a, 0, 0, 1]))), null);
});

test('PDF com texto: texto por página, sem chamar o modelo', async () => {
  const { env, calls } = testEnv();
  const d = await readFile(inputFile('politica.pdf', await textPdf(['Política de reembolso de despesas.', 'Prazo de 30 dias para o pedido.'])), OPTS, env);
  assert.equal(d.via, 'texto');
  assert.equal(d.pageCount, 2);
  assert.deepEqual(d.pages.map(p => p.n), [1, 2]);
  assert.match(d.pages[1].text, /Prazo de 30 dias/);
  assert.equal(calls.length, 0);
});

test('PDF escaneado vai para a visão do modelo e volta página a página', async () => {
  const { env, calls } = testEnv(() => '=== Página 1 ===\nRECIBO Nº 123\nValor: R$ 450,00\n=== Página 2 ===\nAssinatura [ilegível]');
  const d = await readFile(inputFile('recibo.pdf', await scannedPdf(2)), OPTS, env);
  assert.equal(d.via, 'visao');
  assert.equal(d.pageCount, 2);
  assert.deepEqual(d.pages, [{ n: 1, text: 'RECIBO Nº 123\nValor: R$ 450,00' }, { n: 2, text: 'Assinatura [ilegível]' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].content[0].type, 'pdf');
});

test('visão desligada: PDF escaneado e imagem não vão ao modelo, com aviso', async () => {
  const { env, calls } = testEnv();
  const d = await readFile(inputFile('recibo.pdf', await scannedPdf()), { visao: 'nunca', paginasMax: 50 }, env);
  assert.equal(d.via, 'texto');
  assert.match(d.warnings.join(), /escaneado/);
  const i = await readFile(inputFile('foto.png', png()), { visao: 'nunca', paginasMax: 50 }, env);
  assert.match(i.warnings.join(), /imagem ignorada/);
  assert.equal(calls.length, 0);
});

test('imagem: visão do modelo, 1 página', async () => {
  const { env, calls } = testEnv(() => 'CNH digitalizada: validade 10/2030');
  const d = await readFile(inputFile('cnh.png', png()), OPTS, env);
  assert.equal(d.via, 'visao');
  assert.equal(d.pageCount, 1);
  assert.equal(d.text, 'CNH digitalizada: validade 10/2030');
  assert.equal(calls[0].content[0].type, 'image');
});

test('PDF com mais páginas que o limite: lê as primeiras e avisa', async () => {
  const { env } = testEnv();
  const d = await readFile(inputFile('longo.pdf', await textPdf(['Primeira página do relatório mensal.', 'Segunda página do relatório mensal.', 'Terceira página do relatório mensal.'])), { visao: 'auto', paginasMax: 2 }, env);
  assert.equal(d.pages.length, 2);
  assert.match(d.warnings.join(), /3 páginas: lidas só as 2 primeiras/);
});

test('DOCX: texto', async () => {
  const { env } = testEnv();
  const d = await readFile(inputFile('contrato.docx', await docx(['CONTRATO DE FORNECIMENTO', 'Prazo de entrega: 15 dias.'])), OPTS, env);
  assert.match(d.text, /CONTRATO DE FORNECIMENTO\s+Prazo de entrega: 15 dias\./);
});

test('XLSX: título acima da tabela é pulado; várias planilhas; linha de origem', async () => {
  const { env } = testEnv();
  const bytes = await xlsx({
    Pedido: [['Pedido de compra 4500123'], [], ['Código', 'Descrição', 'Quantidade', 'Preço', 'Entrega'], ['P-001', 'Caixa plástica', 100, 12.5, new Date('2026-09-10')], ['P-002', 'Tampa', 50, 3.2, null]],
    Obs: [['Nota'], ['Urgente']],
  });
  const d = await readFile(inputFile('pedido-4500123.xlsx', bytes), OPTS, env);
  assert.equal(d.via, 'parser');
  assert.deepEqual(d.sheets!.map(s => s.name), ['Pedido', 'Obs']);
  const s = d.sheets![0];
  assert.deepEqual(s.header, ['Código', 'Descrição', 'Quantidade', 'Preço', 'Entrega']);
  assert.equal(s.rows.length, 2);
  assert.deepEqual(s.rowNumbers, [4, 5]);
  assert.deepEqual(d.sheets![1].rows, [{ Nota: 'Urgente' }]);
});

test('XLSX com cabeçalho na primeira linha', async () => {
  const { env } = testEnv();
  const bytes = await xlsx({ Pedido: [['Código', 'Descrição', 'Quantidade', 'Preço', 'Entrega'], ['P-001', 'Caixa plástica', 100, 12.5, new Date('2026-09-10')], [], ['P-002', 'Tampa', 50, 3.2, null]] });
  const s = (await readFile(inputFile('pedido.xlsx', bytes), OPTS, env)).sheets![0];
  assert.deepEqual(s.header, ['Código', 'Descrição', 'Quantidade', 'Preço', 'Entrega']);
  assert.deepEqual(s.rows[0], { 'Código': 'P-001', 'Descrição': 'Caixa plástica', Quantidade: 100, 'Preço': 12.5, Entrega: '2026-09-10' });
  assert.deepEqual(s.rowNumbers, [2, 4]);                     // a linha vazia não vira registro
});

test('CSV exportado do ERP em Latin-1, com ; e aspas', async () => {
  const { env } = testEnv();
  const latin1 = Buffer.from('Código;Descrição;Valor\r\nP-001;"Caixa; reforçada";1.250,50\r\n', 'latin1');
  const s = (await readFile(inputFile('export-sygecom.csv', new Uint8Array(latin1)), OPTS, env)).sheets![0];
  assert.deepEqual(s.header, ['Código', 'Descrição', 'Valor']);
  assert.deepEqual(s.rows[0], { 'Código': 'P-001', 'Descrição': 'Caixa; reforçada', Valor: '1.250,50' });
});

test('NF-e: campos por parser, sem modelo', async () => {
  const { env, calls } = testEnv();
  const xml = nfeXml({ numero: '1234', emissao: '2026-09-02', pedido: '4500123', itens: [
    { codigo: '00123', descricao: 'Caixa plástica', qtd: 100, unit: 12.5, pedido: '4500123', itemPedido: '10' },
    { codigo: 'P-002', descricao: 'Tampa', qtd: 48, unit: 3.2 },
  ] });
  const d = await readFile(inputFile('nfe-1234.xml', xml), OPTS, env);
  assert.equal(d.via, 'parser');
  assert.equal(calls.length, 0);
  const n = d.nfe!;
  assert.equal(n.numero, '1234');
  assert.equal(n.chave.length, 44);
  assert.equal(n.emitente.cnpj, '12345678000199');
  assert.equal(n.pedido, '4500123');
  assert.equal(n.protocolo, '135260000000001');
  assert.deepEqual(n.itens[0], { n: 1, codigo: '00123', descricao: 'Caixa plástica', ncm: '39239000', cfop: '1102', unidade: 'UN', quantidade: 100, valorUnitario: 12.5, valorTotal: 1250, pedido: '4500123', itemPedido: '10', ean: '' });
  assert.equal(n.totais.nota, 1403.6);
  assert.throws(() => parseNFe('<a>'), /não é uma NF-e|XML inválido/);
});

test('bloco de leitura: respeita os tipos aceitos e sinaliza o que não leu', async () => {
  const { env } = testEnv();
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true, accept: ['pdf', 'nfe_xml'] } }, pipeline: [{ bloco: 'ler' }] });
  const ctx: RunContext = { def, text: '', docs: [], sections: [], env, files: [
    inputFile('nota.xml', nfeXml({ numero: '9', emissao: '2026-09-01', itens: [{ codigo: 'A', descricao: 'x', qtd: 1, unit: 1 }] })),
    inputFile('planilha.xlsx', await xlsx({ A: [['x']] })),
    inputFile('vazio.pdf', await scannedPdf()),
  ] };
  const s = await lerBlock(ctx, def.pipeline[0]);
  assert.equal(ctx.docs.length, 2);
  assert.deepEqual(s.flags.map(f => f.ref), ['planilha.xlsx', 'vazio.pdf']);
  assert.match(s.flags[0].reason, /xlsx não aceito/);
});
