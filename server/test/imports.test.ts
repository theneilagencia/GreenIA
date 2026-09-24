// Camada de importação genérica: arquivos exportados de qualquer sistema viram
// registros normalizados por um mapeamento do tenant. Leitura de CSV (Latin-1,
// título acima do cabeçalho, rodapé de total), largura fixa, JSON, XML e XLSX;
// transformações; erros por linha; API com pré-visualização, versões, auditoria
// e permissão; e o mesmo assistente funcionando com dois layouts diferentes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { aplicarMapeamento } from '../src/imports/apply.ts';
import { mapeamentoConfigSchema } from '../src/imports/schema.ts';
import { SAMPLES } from '../src/demo/samples.ts';

const cfg = (c: unknown) => mapeamentoConfigSchema.parse(c);
const latin1 = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
const utf8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

// Exportação em texto com título, cabeçalho, código e descrição juntos, caixa
// com fator de conversão e rodapé de total.
const CSV = [
  'RELATÓRIO DE PEDIDOS DE COMPRA',
  'Pedido: 000777;Emissão: 03/09/2026',
  'Fornecedor: Exemplo Fictício Ltda. CNPJ 12.345.678/0001-99',
  'Item;Produto;Qtde;Un;Fator;Vl. Unit.;Vl. Total',
  '1;000123 - PARAFUSO SEXTAVADO;10;CX;12;"1.234,50";"12.345,00"',
  '2;000456 - ARRUELA LISA;200;UN;1;0,15;30,00',
  'Total geral;;;;;;12.375,00',
].join('\r\n');
const CSV_MAP = cfg({
  formato: 'csv', codificacao: 'latin1', separador: ';', ignorarLinhasInicio: 3, ignorarLinhasQue: ['^Total geral'],
  campos: [
    { campo: 'pedido', doTopo: { padrao: 'Pedido: (\\d+)' }, obrigatorio: true },
    { campo: 'cnpjFornecedor', doTopo: { padrao: 'CNPJ ([\\d./-]+)' }, transformacoes: [{ tipo: 'somenteDigitos' }] },
    { campo: 'dataPedido', doTopo: { padrao: 'Emissão: (\\S+)' }, tipo: 'data' },
    { campo: 'codigo', origem: 'Produto', transformacoes: [{ tipo: 'dividir', separador: ' - ', parte: 0 }], obrigatorio: true },
    { campo: 'descricao', origem: 'Produto', transformacoes: [{ tipo: 'dividir', separador: ' - ', parte: 1 }] },
    { campo: 'quantidade', origem: 'Qtde', tipo: 'numero', transformacoes: [{ tipo: 'multiplicar', porOrigem: 'Fator' }], obrigatorio: true },
    { campo: 'unidade', origem: 'Un', transformacoes: [{ tipo: 'mapear', valores: { CX: 'UN' } }] },
    { campo: 'valorUnitario', origem: 'Vl. Unit.', tipo: 'numero', obrigatorio: true },
  ],
});

test('CSV em Latin-1: título, cabeçalho, rodapé, código e descrição juntos, conversão de unidade', async () => {
  const r = await aplicarMapeamento(latin1(CSV), 'export.csv', CSV_MAP);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.registros.map(x => x.dados), [
    { pedido: '000777', cnpjFornecedor: '12345678000199', dataPedido: '2026-09-03', codigo: '000123', descricao: 'PARAFUSO SEXTAVADO', quantidade: 120, unidade: 'UN', valorUnitario: 1234.5 },
    { pedido: '000777', cnpjFornecedor: '12345678000199', dataPedido: '2026-09-03', codigo: '000456', descricao: 'ARRUELA LISA', quantidade: 200, unidade: 'UN', valorUnitario: 0.15 },
  ]);
  assert.equal(r.registros[0].origens.quantidade, 'export.csv › linha 5');
  assert.equal(r.registros[0].origens.pedido, 'export.csv › linha 2');
});

test('erro por linha tira só aquele registro; coluna ausente para tudo', async () => {
  const ruim = CSV.replace('0,15', 'abc');
  const r = await aplicarMapeamento(latin1(ruim), 'export.csv', CSV_MAP);
  assert.equal(r.registros.length, 1);
  assert.deepEqual(r.erros, [{ linha: 6, campo: 'valorUnitario', motivo: 'número inválido (abc)' }]);
  const semColuna = cfg({ ...CSV_MAP, campos: [...CSV_MAP.campos, { campo: 'x', origem: 'Coluna que não existe' }] });
  const r2 = await aplicarMapeamento(latin1(CSV), 'export.csv', semColuna);
  assert.equal(r2.registros.length, 0);
  assert.deepEqual(r2.erros, [{ campo: 'x', motivo: 'coluna Coluna que não existe não encontrada' }]);
});

test('largura fixa, JSON e XML', async () => {
  const txt = ['PEDIDO 000888 20260910', '000123PARAFUSO            0000010,00000001,25', '000456ARRUELA             0000200,00000000,15', 'FIM'].join('\n');
  const fixo = cfg({ formato: 'txt_largura_fixa', ignorarLinhasInicio: 1, ignorarLinhasFim: 1, linhaCabecalho: false, data: 'aaaammdd', campos: [
    { campo: 'pedido', doTopo: { padrao: 'PEDIDO (\\d+)' } },
    { campo: 'dataPedido', doTopo: { padrao: 'PEDIDO \\d+ (\\d{8})' }, tipo: 'data' },
    { campo: 'codigo', posicao: { inicio: 1, tamanho: 6 } },
    { campo: 'descricao', posicao: { inicio: 7, tamanho: 20 } },
    { campo: 'quantidade', posicao: { inicio: 27, tamanho: 10 }, tipo: 'numero' },
    { campo: 'valorUnitario', posicao: { inicio: 37, tamanho: 11 }, tipo: 'numero' },
  ] });
  const a = await aplicarMapeamento(utf8(txt), 'pedido.txt', fixo);
  assert.deepEqual(a.erros, []);
  assert.deepEqual(a.registros.map(x => x.dados), [
    { pedido: '000888', dataPedido: '2026-09-10', codigo: '000123', descricao: 'PARAFUSO', quantidade: 10, valorUnitario: 1.25 },
    { pedido: '000888', dataPedido: '2026-09-10', codigo: '000456', descricao: 'ARRUELA', quantidade: 200, valorUnitario: 0.15 },
  ]);
  const json = JSON.stringify({ cabecalho: { numero: 999, data: '2026-09-11' }, linhas: [{ sku: 'A1', qtd: 2, preco: 10.5 }, { sku: 'B2', qtd: 1, preco: 3 }] });
  const jm = cfg({ formato: 'json', caminhoRegistros: 'linhas', data: 'aaaa-mm-dd', numero: { decimal: '.', milhar: '' }, campos: [
    { campo: 'pedido', origem: '$.cabecalho.numero' }, { campo: 'dataPedido', origem: '$.cabecalho.data', tipo: 'data' },
    { campo: 'codigo', origem: 'sku' }, { campo: 'quantidade', origem: 'qtd', tipo: 'numero' }, { campo: 'valorUnitario', origem: 'preco', tipo: 'numero' },
  ] });
  const b = await aplicarMapeamento(utf8(json), 'pedido.json', jm);
  assert.deepEqual(b.registros.map(x => x.dados), [
    { pedido: '999', dataPedido: '2026-09-11', codigo: 'A1', quantidade: 2, valorUnitario: 10.5 },
    { pedido: '999', dataPedido: '2026-09-11', codigo: 'B2', quantidade: 1, valorUnitario: 3 },
  ]);
  const xml = `<?xml version="1.0"?><Pedido numero="321"><Itens><Item><Cod>X9</Cod><Qt>3.000</Qt><Vu>2.50</Vu></Item></Itens></Pedido>`;
  const xm = cfg({ formato: 'xml', caminhoRegistros: 'Pedido.Itens.Item', numero: { decimal: '.', milhar: '' }, campos: [
    { campo: 'pedido', origem: '$.Pedido.@numero' }, { campo: 'codigo', origem: 'Cod' }, { campo: 'quantidade', origem: 'Qt', tipo: 'numero' }, { campo: 'valorUnitario', origem: 'Vu', tipo: 'numero' },
  ] });
  const c = await aplicarMapeamento(utf8(xml), 'pedido.xml', xm);
  assert.deepEqual(c.registros.map(x => x.dados), [{ pedido: '321', codigo: 'X9', quantidade: 3, valorUnitario: 2.5 }]);
  assert.equal(c.registros[0].origem, 'pedido.xml › registro 1');
});

test('configuração inválida é recusada com o motivo', () => {
  const r = mapeamentoConfigSchema.safeParse({ formato: 'csv', campos: [{ campo: 'a', origem: 'x', posicao: { inicio: 1, tamanho: 2 } }, { campo: 'a', origem: 'y' }] });
  assert.ok(!r.success);
  const msgs = r.error.issues.map(i => i.message).join(' | ');
  assert.match(msgs, /um só lugar/);
  assert.match(msgs, /campo repetido/);
});

// ------------------------------------------------------------------ API e execução
let db: TestDb;
let app: FastifyInstance;
const u: Record<string, string> = {};
let T: Awaited<ReturnType<typeof seedTenant>>, T2: Awaited<ReturnType<typeof seedTenant>>;
const call = async (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, u[who])).headers, payload });
const arq = (nome: string, bytes: Uint8Array) => ({ nome, base64: Buffer.from(bytes).toString('base64') });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'empresa-a', { role: 'admin_cliente' });
  T2 = await seedTenant(db.owner, 'empresa-b', { role: 'admin_cliente' });
  u.admin = T.userId; u.admin2 = T2.userId;
  app = await buildTestApp(db, { fake: new FakeProvider(), objects: new MemoryObjectStore() });
  await call('admin', 'POST', '/api/admin/areas', { name: 'Compras' });
  u.key = await addPerson(db, T.tenantId, 'key.compras@empresa-a.com.br', 'key_user', 'compras');
  u.user = await addPerson(db, T.tenantId, 'ana@empresa-a.com.br', 'usuario', 'compras');
});
after(async () => { await app?.close(); await db?.drop(); });

const JSON_MAP = { formato: 'json', caminhoRegistros: 'itens', numero: { decimal: '.', milhar: '' }, campos: [
  { campo: 'codigo', origem: 'sku', obrigatorio: true }, { campo: 'quantidade', origem: 'qtd', tipo: 'numero', obrigatorio: true }, { campo: 'valorUnitario', origem: 'preco', tipo: 'numero', obrigatorio: true },
] };

test('pré-visualização, criação, versão nova com motivo, auditoria e permissão', async () => {
  const body = { nome: 'Exportação de compras em texto', config: CSV_MAP, arquivoExemplo: arq('export.csv', latin1(CSV)) };
  assert.equal((await call('user', 'POST', '/api/admin/import-mappings', body)).statusCode, 403);
  const ins = await call('key', 'POST', '/api/admin/import-mappings/inspecionar', { arquivo: arq('export.csv', latin1(CSV)) });
  assert.deepEqual([ins.json().formato, ins.json().codificacao, ins.json().separador], ['csv', 'latin1', ';']);
  const prev = await call('key', 'POST', '/api/admin/import-mappings/previa', { config: CSV_MAP, arquivo: arq('export.csv', latin1(CSV)) });
  assert.equal(prev.statusCode, 200, prev.body);
  assert.equal(prev.json().registros, 2);
  assert.equal(prev.json().amostra[0].codigo, '000123');
  const bad = await call('key', 'POST', '/api/admin/import-mappings/previa', { config: { formato: 'csv', campos: [] }, arquivo: arq('x.csv', utf8('a;b')) });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, 'mapeamento_invalido');
  // Exemplo que não lê nada: não salva.
  assert.equal((await call('key', 'POST', '/api/admin/import-mappings', { ...body, arquivoExemplo: arq('export.csv', utf8('nada aqui')) })).statusCode, 422);
  const c = await call('key', 'POST', '/api/admin/import-mappings', body);
  assert.equal(c.statusCode, 201, c.body);
  assert.equal(c.json().slug, 'exportacao-de-compras-em-texto');
  const id = c.json().id;
  assert.equal((await call('key', 'PUT', `/api/admin/import-mappings/${id}`, { config: CSV_MAP })).statusCode, 400);   // sem motivo
  const v2 = await call('key', 'PUT', `/api/admin/import-mappings/${id}`, { config: { ...CSV_MAP, ignorarLinhasFim: 0 }, nota: 'rodapé tratado pela expressão' });
  assert.equal(v2.json().versao, 2);
  const det = (await call('key', 'GET', `/api/admin/import-mappings/${id}`)).json();
  assert.deepEqual(det.versoes.map((v: { versao: number }) => v.versao), [2, 1]);
  const audits = (await db.owner.query(`select action, target from audit_log where tenant_id = $1 and action like 'mapeamento_importacao%' order by seq`, [T.tenantId])).rows;
  assert.deepEqual(audits.map(a => [a.action, a.target]), [['mapeamento_importacao_criado', 'mapeamento:exportacao-de-compras-em-texto@1'], ['mapeamento_importacao_alterado', 'mapeamento:exportacao-de-compras-em-texto@2']]);
  // Outro tenant não vê.
  assert.deepEqual((await call('admin2', 'GET', '/api/admin/import-mappings')).json(), []);
  assert.equal((await call('admin2', 'GET', `/api/admin/import-mappings/${id}`)).statusCode, 404);
});

test('o mesmo assistente confere dois layouts diferentes, só pelos mapeamentos', async () => {
  assert.equal((await call('admin', 'POST', '/api/admin/import-mappings', { slug: 'pedido-json', nome: 'Pedido em JSON', config: JSON_MAP })).statusCode, 201);
  const dados = [
    { id: 'pedido', nome: 'Pedido', arquivo: '*pedido*', campos: [{ campo: 'codigo' }, { campo: 'quantidade', tipo: 'numero' }, { campo: 'valorUnitario', tipo: 'numero' }] },
    { id: 'recebido', nome: 'Recebimento', arquivo: '*recebimento*', campos: [{ campo: 'codigo' }, { campo: 'quantidade', tipo: 'numero' }] },
  ];
  const def = {
    inputs: { text: { enabled: false }, files: { enabled: true, required: true, accept: ['csv', 'xlsx', 'texto'] } }, dados,
    pipeline: [{ bloco: 'ler' }, { bloco: 'conferir', id: 'itens', params: {
      esquerda: { de: 'importacao', conjunto: 'recebido' }, direita: { de: 'importacao', conjunto: 'pedido' }, rotulos: { esquerda: 'Recebimento', direita: 'Pedido' },
      chave: { esquerda: 'codigo', direita: 'codigo' }, regras: [{ campo: 'Quantidade', esquerda: 'quantidade', direita: 'quantidade', tipo: 'numero' }] } }],
  };
  // Campo não declarado no conjunto: recusado.
  const errado = structuredClone(def);
  (errado.pipeline[1].params as { regras: { direita: string }[] }).regras[0].direita = 'qtdPedida';
  const e = await call('admin', 'POST', '/api/admin/assistants', { slug: 'errado', name: 'Errado', areaSlug: 'compras', status: 'ativo', definition: errado });
  assert.equal(e.statusCode, 400);
  assert.match(e.body, /qtdPedida não existe no conjunto pedido/);
  assert.equal((await call('admin', 'POST', '/api/admin/assistants', { slug: 'recebimento', name: 'Recebimento × pedido', areaSlug: 'compras', status: 'ativo', definition: def })).statusCode, 201);
  const recebimento = { name: 'recebimento.json', mime: 'application/json', contentBase64: Buffer.from(JSON.stringify({ itens: [{ sku: '000123', qtd: 100, preco: 1 }, { sku: '000456', qtd: 200, preco: 1 }] })).toString('base64') };
  const rodar = async (pedido: { name: string; bytes: Uint8Array; mime: string }) => {
    const r = await call('user', 'POST', '/api/runs', { assistant: 'recebimento', files: [recebimento, { name: pedido.name, mime: pedido.mime, contentBase64: Buffer.from(pedido.bytes).toString('base64') }] });
    assert.equal(r.statusCode, 202, r.body);
    const d = (await call('user', 'GET', `/api/runs/${r.json().runId}`)).json();
    assert.equal(d.status, 'rascunho', d.error);
    return d.result.sections;
  };
  // Layout 1: texto com título e rodapé. Layout 2: JSON.
  const s1 = await rodar({ name: 'pedido-777.csv', bytes: latin1(CSV), mime: 'text/csv' });
  const s2 = await rodar({ name: 'pedido-777.json', mime: 'application/json', bytes: utf8(JSON.stringify({ itens: [{ sku: '000123', qtd: 120, preco: 1234.5 }, { sku: '000456', qtd: 200, preco: 0.15 }] })) });
  for (const s of [s1, s2]) {
    const conf = s.find((x: { id: string }) => x.id === 'itens');
    assert.deepEqual(conf.data.divergencias.map((d: { chave: string; esquerda: { valor: number }; direita: { valor: number } }) => [d.chave, d.esquerda.valor, d.direita.valor]), [['000123', 100, 120]]);
  }
  const ler1 = s1.find((x: { bloco: string }) => x.bloco === 'ler');
  assert.deepEqual(ler1.data.find((x: { arquivo: string }) => x.arquivo === 'pedido-777.csv').importacao, [{ conjunto: 'pedido', mapeamento: 'Exportação de compras em texto', versao: 2, registros: 2, errosDeLinha: 0 }]);
  assert.equal(s1.find((x: { id: string }) => x.id === 'itens').data.divergencias[0].direita.origem, 'pedido-777.csv › linha 5');
  // Mapeamento arquivado não é usado: o pedido em texto fica sem registros e vai para a revisão.
  const id = (await call('admin', 'GET', '/api/admin/import-mappings')).json().find((m: { slug: string }) => m.slug === 'exportacao-de-compras-em-texto').id;
  await call('admin', 'POST', `/api/admin/import-mappings/${id}/arquivar`, {});
  const s3 = await rodar({ name: 'pedido-777.csv', bytes: latin1(CSV), mime: 'text/csv' });
  const flags = s3.flatMap((x: { flags: { reason: string }[] }) => x.flags.map(f => f.reason));
  assert.ok(flags.includes('conferência não realizada: falta Pedido'), flags.join(' | '));
  assert.ok(flags.some((f: string) => /nenhum mapeamento de importação/.test(f)), flags.join(' | '));
});

test('a planilha da demonstração entra pelo mapeamento da implantação', async () => {
  const [, pedido] = await SAMPLES['conferencia-nfe']();
  const tj = JSON.parse((await import('node:fs')).readFileSync(new URL('../deploy/demo/tenant-demo.json', import.meta.url), 'utf8'));
  const r = await aplicarMapeamento(pedido.bytes, pedido.name, cfg(tj.mapeamentosImportacao[0].config));
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.registros[0].dados, { pedido: '4500123', cnpjFornecedor: '12345678000199', dataPedido: '2026-09-01', totalPedido: 1581, codigo: 'P-001', descricao: 'Caixa plástica 20L', quantidade: 100, valorUnitario: 12.5 });
  assert.equal(r.registros[0].origens.pedido, 'pedido-4500123.xlsx › Cabeçalho › linha 1');
});
