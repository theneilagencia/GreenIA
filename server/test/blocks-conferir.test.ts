import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conferirBlock, compare, type ResultadoConferencia } from '../src/blocks/conferir.ts';
import { lerBlock } from '../src/blocks/ler.ts';
import { parseNumberBr, parseDateBr, globMatch, normKey, containsPhrase, getPath } from '../src/blocks/values.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { RunContext, Section } from '../src/blocks/types.ts';
import { inputFile, nfeXml, testEnv, xlsx } from './fixtures.ts';

test('números e datas como aparecem em documentos brasileiros', () => {
  assert.equal(parseNumberBr('1.250,50'), 1250.5);
  assert.equal(parseNumberBr('R$ 1.980,00'), 1980);
  assert.equal(parseNumberBr('1250.5'), 1250.5);
  assert.equal(parseNumberBr('1,250.50'), 1250.5);
  assert.equal(parseNumberBr('1.250'), 1250);
  assert.equal(parseNumberBr('12,5'), 12.5);
  assert.equal(parseNumberBr(' -3,2 '), -3.2);
  assert.equal(parseNumberBr('doze'), null);
  assert.equal(parseDateBr('30/09/2026')!.toISOString().slice(0, 10), '2026-09-30');
  assert.equal(parseDateBr('2026-09-02T10:00:00-03:00')!.toISOString().slice(0, 10), '2026-09-02');
  assert.equal(parseDateBr(46295)!.toISOString().slice(0, 10), '2026-09-30');   // série do Excel
  assert.equal(parseDateBr('31/02/2026'), null);
  assert.equal(normKey(' 00123 '), '123');
  assert.equal(normKey('P-001'), 'p-001');
  assert.ok(globMatch('*pedido*', 'Pedido-4500123.xlsx'));
  assert.ok(!globMatch('*pedido*', 'nota.xml'));
  assert.ok(containsPhrase('copia do rg e cpf', 'RG'));
  assert.ok(!containsPhrase('cargo pretendido', 'RG'));
  assert.equal(getPath({ 'Preço unitário': 3 }, 'preco unitario'), 3);
  assert.equal(getPath({ a: { b: [{ c: 1 }] } }, 'a.b.0.c'), 1);
});

test('regras: igual, texto, número com tolerância e data dentro do prazo', () => {
  const r = (x: object) => ({ campo: 'c', esquerda: 'a', direita: 'b', tipo: 'igual' as const, ...x });
  assert.equal(compare(r({ tipo: 'numero' }), 100, '100,00'), null);
  assert.match(compare(r({ tipo: 'numero' }), 101, 100)!, /diferença de 1 \(1,00%\)/);
  assert.equal(compare(r({ tipo: 'numero', tolerancia: { percentual: 1 } }), 12.62, 12.5), null);      // 0,96%
  assert.match(compare(r({ tipo: 'numero', tolerancia: { percentual: 1 } }), 12.7, 12.5)!, /acima da tolerância/);
  assert.equal(compare(r({ tipo: 'numero', tolerancia: { absoluta: 0.05 } }), 10.04, 10), null);
  assert.equal(compare(r({ tipo: 'numero' }), 'abc', 1), 'valor não numérico');
  assert.equal(compare(r({ tipo: 'texto' }), 'Caixa  Plástica', 'caixa plastica'), null);
  assert.equal(compare(r({ tipo: 'igual' }), 'Caixa Plástica', 'caixa plastica'), 'valores diferentes');
  assert.equal(compare(r({ tipo: 'data', prazoDias: 10 }), '2026-09-01', '11/09/2026'), null);
  assert.match(compare(r({ tipo: 'data', prazoDias: 10 }), '2026-09-01', '12/09/2026')!, /11 dias, acima do prazo de 10/);
  assert.match(compare(r({ tipo: 'data', prazoDias: 10 }), '2026-09-05', '2026-09-01')!, /4 dia\(s\) antes/);
  assert.match(compare(r({ tipo: 'data' }), '2026-09-01', '2026-09-02')!, /datas diferentes/);
  assert.equal(compare(r({}), '', null), null);
  assert.equal(compare(r({}), 'x', ''), 'valor ausente à direita');
});

// NF-e de entrada × pedido de compra (XLSX), como no assistente de referência fiscal.
async function notaPedido(itensNota: Parameters<typeof nfeXml>[0]['itens'], linhasPedido: (string | number)[][], extra: Record<string, unknown> = {}) {
  const def = assistantDefinitionSchema.parse({
    inputs: { files: { enabled: true, accept: ['nfe_xml', 'xlsx'] } },
    pipeline: [
      { bloco: 'ler' },
      { bloco: 'conferir', params: {
        esquerda: { de: 'nfe', caminho: 'itens' }, direita: { de: 'tabela', arquivo: '*pedido*' },
        rotulos: { esquerda: 'Nota', direita: 'Pedido' },
        chave: { esquerda: 'codigo', direita: 'Código' },
        regras: [
          { campo: 'Quantidade', esquerda: 'quantidade', direita: 'Quantidade', tipo: 'numero' },
          { campo: 'Valor unitário', esquerda: 'valorUnitario', direita: 'Preço', tipo: 'numero', tolerancia: { percentual: 1 } },
          { campo: 'Descrição', esquerda: 'descricao', direita: 'Descrição', tipo: 'texto' },
        ], ...extra } },
    ],
  });
  const { env } = testEnv();
  const ctx: RunContext = { def, text: '', docs: [], sections: [], env, files: [
    inputFile('nfe-1234.xml', nfeXml({ numero: '1234', emissao: '2026-09-02', itens: itensNota })),
    inputFile('pedido-4500123.xlsx', await xlsx({ Pedido: [['Código', 'Descrição', 'Quantidade', 'Preço'], ...linhasPedido] })),
  ] };
  ctx.sections.push(await lerBlock(ctx, def.pipeline[0]));
  const s = await conferirBlock(ctx, def.pipeline[1]);
  return { s, r: s.data as ResultadoConferencia };
}

test('nota × pedido sem divergência', async () => {
  const { s, r } = await notaPedido(
    [{ codigo: 'P-001', descricao: 'Caixa plástica', qtd: 100, unit: 12.5 }, { codigo: 'P-002', descricao: 'Tampa', qtd: 50, unit: 3.2 }],
    [['P-001', 'Caixa Plástica', 100, 12.5], ['P-002', 'tampa', 50, 3.2]]);
  assert.deepEqual(r.resumo, { esquerda: 2, direita: 2, pares: 2, divergencias: 0, conferidos: 6 });
  assert.deepEqual(s.flags, []);
  assert.deepEqual(s.counts, { divergencias: 0 });
});

test('nota × pedido: quantidade, preço acima da tolerância, item sem par e chave com zeros', async () => {
  const { r } = await notaPedido(
    [
      { codigo: '00123', descricao: 'Caixa plástica', qtd: 100, unit: 12.62 },   // chave "00123" = 123; preço dentro de 1%
      { codigo: 'P-002', descricao: 'Tampa', qtd: 48, unit: 3.4 },              // quantidade e preço divergentes
      { codigo: 'P-009', descricao: 'Etiqueta', qtd: 10, unit: 1 },             // não está no pedido
    ],
    [[123, 'Caixa plástica', 100, 12.5], ['P-002', 'Tampa', 50, 3.2], ['P-003', 'Fita', 5, 9.9]]);
  const d = r.divergencias.map(x => [x.chave, x.campo, x.motivo]);
  assert.deepEqual(d, [
    ['P-002', 'Quantidade', 'diferença de -2 (-4,00%)'],
    ['P-002', 'Valor unitário', 'diferença de 0,2 (6,25%), acima da tolerância'],
    ['P-009', '(registro)', 'sem par em Pedido'],
    ['P-003', '(registro)', 'sem par em Nota'],
  ]);
  const q = r.divergencias[0];
  assert.deepEqual(q.esquerda, { valor: 48, origem: 'nfe-1234.xml › item 2' });
  assert.deepEqual(q.direita, { valor: 50, origem: 'pedido-4500123.xlsx › Pedido › linha 3' });
});

test('sem par pode ser ignorado; chave repetida no pedido é sinalizada', async () => {
  const { s, r } = await notaPedido(
    [{ codigo: 'P-001', descricao: 'Caixa', qtd: 1, unit: 1 }, { codigo: 'P-009', descricao: 'x', qtd: 1, unit: 1 }],
    [['P-001', 'Caixa', 1, 1], ['P-001', 'Caixa', 1, 1]], { semPar: 'ignorar' });
  assert.equal(r.divergencias.length, 0);
  assert.ok(s.flags.some(f => /chave P-001 repetida em Pedido/.test(f.reason)));
});

test('conjunto não encontrado nunca vira "sem divergências": vai para revisão', async () => {
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'conferir', params: {
    esquerda: { de: 'nfe', caminho: 'itens' }, direita: { de: 'tabela', arquivo: '*pedido*' }, regras: [{ campo: 'q', esquerda: 'quantidade', direita: 'Quantidade', tipo: 'numero' }] } }] });
  const { env } = testEnv();
  const s = await conferirBlock({ def, text: '', files: [], docs: [], sections: [], env }, def.pipeline[0]);
  assert.deepEqual(s.flags.map(f => f.reason), ['nenhum registro encontrado em Documento', 'nenhum registro encontrado em Referência']);
});

test('conferência sobre campos extraídos (nota × contrato), com a página de origem', async () => {
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'conferir', params: {
    esquerda: { de: 'extraido', bloco: 'nota' }, direita: { de: 'extraido', bloco: 'contrato' },
    regras: [
      { campo: 'Valor', esquerda: 'valor', direita: 'valorMensal', tipo: 'numero' },
      { campo: 'Vencimento', esquerda: 'emissao', direita: 'vencimento', tipo: 'data', prazoDias: 30 },
    ] } }] });
  const sec = (id: string, arquivo: string, campos: object, origem: object[]): Section => ({ id, bloco: 'extrair', titulo: id, kind: 'campos', flags: [], data: [{ arquivo, arquivos: [arquivo], campos, origem, valido: true, erros: [] }] });
  const { env } = testEnv();
  const ctx: RunContext = { def, text: '', files: [], docs: [], env, sections: [
    sec('nota', 'nfs-88.pdf', { valor: 5200, emissao: '2026-09-01' }, [{ campo: 'valor', pagina: 1, trecho: 'x' }]),
    sec('contrato', 'contrato.pdf', { valorMensal: '5.000,00', vencimento: '2026-10-15' }, [{ campo: 'valorMensal', pagina: 3, trecho: 'y' }]),
  ] };
  const r = (await conferirBlock(ctx, def.pipeline[0])).data as ResultadoConferencia;
  assert.deepEqual(r.divergencias.map(d => [d.campo, d.motivo]), [['Valor', 'diferença de 200 (4,00%)'], ['Vencimento', '44 dias, acima do prazo de 30']]);
  assert.equal(r.divergencias[0].esquerda!.origem, 'nfs-88.pdf › p. 1');
  assert.equal(r.divergencias[0].direita!.origem, 'contrato.pdf › p. 3');
});
