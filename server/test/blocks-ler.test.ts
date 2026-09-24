import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind, readFile, lerBlock } from '../src/blocks/ler.ts';
import { parseNFe, type NFe } from '../src/readers/nfe-parser.ts';
import { READERS } from '../src/readers/registry.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { RunContext } from '../src/blocks/types.ts';
import { danfePdf, docx, fakeConverter, inputFile, jpeg, nfeKey, nfeXml, png, scannedPdf, testEnv, textPdf, xlsx } from './fixtures.ts';
import { accessKeyDv, findAccessKey, isAccessKey } from '../src/readers/danfe-key.ts';

const OPTS = { paginasMax: 50, ocrMinConfidence: 70, visionFallback: false };
const FALLBACK = { ...OPTS, visionFallback: true };

test('tipo pelo conteúdo, não só pela extensão', async () => {
  assert.equal(detectKind(inputFile('a.pdf', await textPdf(['oi']))), 'pdf');
  assert.equal(detectKind(inputFile('foto.bin', png())), 'imagem');           // extensão errada, assinatura de PNG
  assert.equal(detectKind(inputFile('contrato.docx', await docx(['oi']))), 'docx');
  assert.equal(detectKind(inputFile('pedido.xlsx', await xlsx({ P: [['a']] }))), 'xlsx');
  // XML de NF-e só vira nfe_xml com o leitor especializado ligado; sem ele, é texto.
  assert.equal(detectKind(inputFile('nota.xml', nfeXml({ numero: '1', emissao: '2026-09-01', itens: [] })), READERS), 'nfe_xml');
  assert.equal(detectKind(inputFile('nota.xml', nfeXml({ numero: '1', emissao: '2026-09-01', itens: [] }))), 'texto');
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

test('PDF escaneado: OCR local nas páginas sem texto, sem chamar o modelo', async () => {
  const { converter, calls: conv } = fakeConverter(pages => (pages ?? [1]).map(n => ({ n, text: n === 1 ? 'RECIBO Nº 123\nValor: R$ 450,00' : 'Assinatura do recebedor', confidence: 91, words: 6 })));
  const { env, calls } = testEnv(undefined, { converter });
  const d = await readFile(inputFile('recibo.pdf', await scannedPdf(2)), OPTS, env);
  assert.equal(d.via, 'ocr');
  assert.equal(d.pageCount, 2);
  assert.deepEqual(d.pages, [{ n: 1, text: 'RECIBO Nº 123\nValor: R$ 450,00', via: 'ocr', confianca: 91 }, { n: 2, text: 'Assinatura do recebedor', via: 'ocr', confianca: 91 }]);
  assert.deepEqual(conv, ['ocrPdf:1,2']);
  assert.equal(calls.length, 0);
  assert.deepEqual(d.warnings, []);
});

test('OCR abaixo do limiar, sem permissão de fallback: fica o texto do OCR, com aviso para revisão', async () => {
  const { converter } = fakeConverter(() => [{ n: 1, text: 'RECIB0 N 1Z3', confidence: 41, words: 3, image: jpeg() }]);
  const { env, calls } = testEnv(undefined, { converter });
  const d = await readFile(inputFile('recibo.pdf', await scannedPdf()), OPTS, env);
  assert.equal(d.via, 'ocr');
  assert.equal(d.text, 'RECIB0 N 1Z3');
  assert.match(d.warnings.join(), /OCR com baixa confiança \(p\. 1: 41%; mínimo 70%\): confira no original/);
  assert.equal(calls.length, 0);
});

test('fallback de visão: só a página abaixo do limiar, com a imagem tratada pelo OCR, e registro na auditoria', async () => {
  const { converter } = fakeConverter(pages => (pages ?? []).map(n => ({ n, text: n === 1 ? 'Recibo legível' : 'r3c1b0 ?? 4S0', confidence: n === 1 ? 93 : 38, words: 3, image: jpeg() })));
  const recorded: [string, Record<string, unknown>][] = [];
  const screened: string[][] = [];
  const { env, calls } = testEnv(() => '=== Página 2 ===\nValor: R$ 450,00', {
    converter, async screen(t) { screened.push(t); return []; }, async record(a, d) { recorded.push([a, d]); },
  });
  const d = await readFile(inputFile('recibo.pdf', await scannedPdf(2)), FALLBACK, env);
  assert.equal(d.via, 'visao');
  assert.deepEqual(d.pages.map(p => [p.n, p.via, p.text]), [[1, 'ocr', 'Recibo legível'], [2, 'visao', 'Valor: R$ 450,00']]);
  assert.deepEqual(screened, [['r3c1b0 ?? 4S0']]);                          // o texto do OCR passou pela política antes
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].content.map(c => c.type), ['text', 'image', 'text']);
  assert.equal((calls[0].content[1] as { mediaType: string }).mediaType, 'image/jpeg');
  assert.deepEqual(recorded, [['leitura_visao_fallback', { arquivo: 'recibo.pdf', sha256: d.sha256, paginas: [2], confiancas: [38], limiar: 70, motivo: 'confianca_baixa' }]]);
  assert.match(d.warnings.join(), /lida pela visão do modelo \(OCR abaixo de 70%\): p\. 2/);
});

test('fallback de visão não acontece se o texto do OCR tiver dado que a política não deixa enviar', async () => {
  const { converter } = fakeConverter(() => [{ n: 1, text: 'CPF 123.456.789-09 (leitura ruim)', confidence: 50, words: 4, image: jpeg() }]);
  const recorded: string[] = [];
  const { env, calls } = testEnv(undefined, { converter, async screen() { return ['cpf']; }, async record(a) { recorded.push(a); } });
  const d = await readFile(inputFile('doc.png', png()), FALLBACK, env);
  assert.equal(calls.length, 0);
  assert.equal(d.via, 'ocr');
  assert.match(d.warnings.join(), /a visão do modelo não foi usada porque o texto lido contém cpf/);
  assert.deepEqual(recorded, ['leitura_visao_nao_usada']);
});

test('sem OCR no servidor: aviso; com fallback permitido, a imagem original vai à visão, registrada como OCR indisponível', async () => {
  const { env, calls } = testEnv(() => 'CNH digitalizada: validade 10/2030');
  const semFallback = await readFile(inputFile('cnh.png', png()), OPTS, env);
  assert.match(semFallback.warnings.join(), /OCR não foi feito: OCR indisponível no servidor/);
  assert.equal(calls.length, 0);
  const recorded: Record<string, unknown>[] = [];
  const { env: env2, calls: calls2 } = testEnv(() => 'CNH digitalizada: validade 10/2030', { async record(_a, d) { recorded.push(d); } });
  const d = await readFile(inputFile('cnh.png', png()), FALLBACK, env2);
  assert.equal(d.via, 'visao');
  assert.equal(d.pageCount, 1);
  assert.equal(d.text, 'CNH digitalizada: validade 10/2030');
  assert.equal((calls2[0].content[1] as { mediaType: string }).mediaType, 'image/png');
  assert.equal(recorded[0].motivo, 'ocr_indisponivel');
});

test('TIFF e HEIC são reconhecidos como imagem e passam pelo OCR', async () => {
  const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
  const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
  assert.equal(detectKind(inputFile('scan.tif', tiff)), 'imagem');
  assert.equal(detectKind(inputFile('IMG_0001.HEIC', heic)), 'imagem');
  const { converter, calls } = fakeConverter(() => [{ n: 1, text: 'Página 1', confidence: 88, words: 2 }, { n: 2, text: 'Página 2', confidence: 90, words: 2 }]);
  const { env } = testEnv(undefined, { converter });
  const d = await readFile(inputFile('scan.tif', tiff), OPTS, env);
  assert.equal(d.convertedFrom, 'TIFF');
  assert.equal(d.pageCount, 2);
  assert.deepEqual(calls, ['ocrImage']);
});

test('DOC, XLS, ODT e ODS: convertidos no servidor antes da leitura', async () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  const odt = new TextEncoder().encode('PK\u0003\u0004xxxxxxxxxxxxxxxxxxxxxxxxxxmimetypeapplication/vnd.oasis.opendocument.text');
  assert.equal(detectKind(inputFile('ficha.doc', ole)), 'docx');
  assert.equal(detectKind(inputFile('pedido.xls', ole)), 'xlsx');
  assert.equal(detectKind(inputFile('ficha.odt', odt)), 'docx');
  assert.equal(detectKind(inputFile('arquivo.bin', ole)), null);
  const docxBytes = await docx(['Ficha cadastral', 'Cargo: analista']);
  const xlsxBytes = await xlsx({ Itens: [['Código', 'Qtd'], ['P-001', 10]] });
  const seen: string[] = [];
  const { converter } = fakeConverter(() => [], { async officeToOoxml(_b, from) { seen.push(from); return from === 'doc' || from === 'odt' ? docxBytes : xlsxBytes; } });
  const { env } = testEnv(undefined, { converter });
  const d = await readFile(inputFile('ficha.doc', ole), OPTS, env);
  assert.equal(d.convertedFrom, 'DOC');
  assert.match(d.text, /Cargo: analista/);
  const x = await readFile(inputFile('pedido.xls', ole), OPTS, env);
  assert.equal(x.convertedFrom, 'XLS');
  assert.deepEqual(x.sheets![0].rows, [{ 'Código': 'P-001', Qtd: 10 }]);
  assert.deepEqual(seen, ['doc', 'xls']);
  const semConversor = await readFile(inputFile('ficha.doc', ole), OPTS, testEnv().env);
  assert.match(semConversor.warnings.join(), /arquivo DOC não lido: conversão indisponível no servidor/);
});

test('chave de acesso: dígito verificador, modelo 55/65 e texto de DANFE', () => {
  const k = nfeKey('123');
  assert.ok(isAccessKey(k));
  assert.equal(k[43], accessKeyDv(k.slice(0, 43)));
  assert.equal(isAccessKey(k.slice(0, 43) + ((Number(k[43]) + 1) % 10)), false);   // dígito errado
  assert.equal(findAccessKey(`DANFE\nCHAVE DE ACESSO\n${k.replace(/(\d{4})(?=\d)/g, '$1 ')}`), k);
  assert.equal(findAccessKey(`DANFE\nCHAVE DE ACESSO ${k.replace(/(\d{4})(?=\d)/g, '$1.')} Protocolo 135260000000123`), k);
  assert.equal(findAccessKey(`Boleto bancário ${k}`), null);                         // sem texto de DANFE
});

test('PDF com mais páginas que o limite: lê as primeiras e avisa', async () => {
  const { env } = testEnv();
  const d = await readFile(inputFile('longo.pdf', await textPdf(['Primeira página do relatório mensal.', 'Segunda página do relatório mensal.', 'Terceira página do relatório mensal.'])), { ...OPTS, paginasMax: 2 }, env);
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
  const n = d.dados!.nfe as NFe;
  assert.equal(n.numero, '1234');
  assert.equal(n.chave.length, 44);
  assert.equal(n.emitente.cnpj, '12345678000199');
  assert.equal(n.pedido, '4500123');
  assert.equal(n.protocolo, '135260000000123');
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
  assert.deepEqual([...new Set(s.flags.map(f => f.ref))], ['planilha.xlsx', 'vazio.pdf']);
  assert.match(s.flags[0].reason, /xlsx não aceito/);
});

test('DANFE em PDF: com o XML da mesma chave, a nota vem do XML; sem ele, "pedir o XML ao fornecedor"', async () => {
  const { env } = testEnv();
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true, accept: ['pdf', 'nfe_xml'] } }, pipeline: [{ bloco: 'ler' }] });
  const ctx: RunContext = { def, text: '', docs: [], sections: [], env, files: [
    inputFile('nfe-123.xml', nfeXml({ numero: '123', emissao: '2026-09-15', itens: [{ codigo: 'A', descricao: 'x', qtd: 1, unit: 10 }] })),
    inputFile('danfe-123.pdf', await danfePdf({ numero: '123', emissao: '2026-09-15', total: 'R$ 10,00' })),
    inputFile('danfe-456.pdf', await danfePdf({ numero: '456', emissao: '2026-09-16', total: 'R$ 99,00' })),
  ] };
  const s = await lerBlock(ctx, def.pipeline[0]);
  const rows = s.data as { arquivo: string; danfe?: { chave: string; xml: string | null; situacao: string } }[];
  assert.deepEqual(rows.find(r => r.arquivo === 'danfe-123.pdf')!.danfe, { chave: nfeKey('123'), xml: 'nfe-123.xml', situacao: 'XML da nota enviado junto' });
  assert.deepEqual(rows.find(r => r.arquivo === 'danfe-456.pdf')!.danfe, { chave: nfeKey('456'), xml: null, situacao: 'pedir o XML ao fornecedor' });
  assert.deepEqual(s.counts, { pendencias: 1 });
  assert.deepEqual(s.flags, [{ reason: `DANFE sem o XML da nota (chave ${nfeKey('456')}): pedir o XML ao fornecedor`, ref: 'danfe-456.pdf' }]);
});
