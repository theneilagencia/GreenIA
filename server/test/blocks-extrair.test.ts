import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairBlock, parseJsonReply, type Extracao } from '../src/blocks/extrair.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { BlockEnv, ReadDoc, RunContext } from '../src/blocks/types.ts';
import { testEnv } from './fixtures.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    fornecedor: { type: 'string' },
    numero: { type: 'string' },
    valor: { type: 'number' },
    vencimento: { type: ['string', 'null'], format: 'date' },
  },
  required: ['fornecedor', 'numero', 'valor'],
};

const doc = (name: string, pages: string[]): ReadDoc => ({
  fileId: name, name, kind: 'pdf', sha256: 'x', via: 'texto', pageCount: pages.length, warnings: [],
  pages: pages.map((text, i) => ({ n: i + 1, text })), text: pages.join('\n\n'),
});
const BOLETO = doc('boleto.pdf', ['Beneficiário: Transportes Rápidos Ltda\nDocumento nº 7788', 'Valor do documento: R$ 1.980,00\nVencimento: 30/09/2026']);

function ctxWith(env: BlockEnv, docs: ReadDoc[], params: Record<string, unknown> = {}) {
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'extrair', params: { schema: SCHEMA, ...params } }] });
  const ctx: RunContext = { def, text: '', files: [], docs, sections: [], env };
  return { ctx, step: def.pipeline[0] };
}
const run = async (reply: string, docs = [BOLETO], params = {}) => {
  const { env, calls } = testEnv(() => reply);
  const { ctx, step } = ctxWith(env, docs, params);
  const s = await extrairBlock(ctx, step);
  return { s, data: s.data as Extracao[], calls };
};

test('extração válida: campos no schema, cada um com página e trecho que existem no documento', async () => {
  const { s, data, calls } = await run(JSON.stringify({
    campos: { fornecedor: 'Transportes Rápidos Ltda', numero: '7788', valor: 1980, vencimento: '2026-09-30' },
    origem: [
      { campo: 'fornecedor', pagina: 1, trecho: 'Beneficiário: Transportes Rápidos Ltda' },
      { campo: 'numero', pagina: 1, trecho: 'Documento nº 7788' },
      { campo: 'valor', pagina: 2, trecho: 'Valor do documento: R$ 1.980,00' },
      { campo: 'vencimento', pagina: 2, trecho: 'vencimento:   30/09/2026' },  // maiúsculas e espaços não importam
    ],
  }));
  assert.equal(data[0].valido, true);
  assert.deepEqual(s.flags, []);
  assert.ok(data[0].origem.every(o => o.confere));
  // O modelo recebe o texto com a marcação de página e o schema de resposta.
  const sent = (calls[0].content[0] as { text: string }).text;
  assert.match(sent, /=== Página 2 ===\nValor do documento/);
  assert.deepEqual(Object.keys((calls[0].jsonSchema as { properties: object }).properties), ['campos', 'origem']);
});

test('saída fora do schema vai para revisão e nunca é completada', async () => {
  const { s, data } = await run(JSON.stringify({
    campos: { fornecedor: 'Transportes Rápidos Ltda', valor: 'mil novecentos e oitenta' },   // sem número; valor em texto
    origem: [{ campo: 'fornecedor', pagina: 1, trecho: 'Transportes Rápidos Ltda' }],
  }));
  assert.equal(data[0].valido, false);
  assert.ok(data[0].erros.some(e => /numero/.test(e)), data[0].erros.join());
  assert.ok(data[0].erros.some(e => /\/valor must be number/.test(e)), data[0].erros.join());
  // Nada foi preenchido pela plataforma: o campo faltante continua faltando.
  assert.equal('numero' in data[0].campos!, false);
  assert.equal(data[0].campos!.valor, 'mil novecentos e oitenta');
  assert.ok(s.flags.some(f => /fora do schema/.test(f.reason)));
  assert.ok(s.flags.some(f => f.reason === 'campo valor preenchido sem origem'));
});

test('resposta que não é JSON: nada extraído, vai para revisão', async () => {
  const { s, data } = await run('O fornecedor parece ser a Transportes Rápidos.');
  assert.equal(data[0].campos, null);
  assert.equal(data[0].valido, false);
  assert.match(s.flags[0].reason, /não é JSON válido/);
});

test('origem inventada (trecho que não está no documento) é sinalizada', async () => {
  const { s, data } = await run(JSON.stringify({
    campos: { fornecedor: 'Transportes Rápidos Ltda', numero: '7788', valor: 1980, vencimento: null },
    origem: [
      { campo: 'fornecedor', pagina: 1, trecho: 'Transportes Rápidos Ltda' },
      { campo: 'numero', pagina: 1, trecho: 'Documento nº 7788' },
      { campo: 'valor', pagina: 2, trecho: 'Total a pagar: 1980' },
    ],
  }));
  assert.equal(data[0].valido, true);                      // o schema passa...
  assert.deepEqual(s.flags.map(f => f.reason), [            // ...mas a revisão precisa olhar a origem
    'origem do campo valor não encontrada no documento',
    'campo valor preenchido sem origem',
  ]);
});

test('JSON em bloco de código também é aceito', () => {
  assert.deepEqual(parseJsonReply('Segue:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(() => parseJsonReply('sem json'), /sem JSON/);
});

test('por documento: uma chamada por documento; por conjunto: uma só', async () => {
  const outro = doc('boleto2.pdf', ['Beneficiário: Gráfica Central\nDocumento nº 12\nValor: R$ 90,00']);
  const reply = JSON.stringify({ campos: { fornecedor: 'x', numero: '1', valor: 1 }, origem: [] });
  assert.equal((await run(reply, [BOLETO, outro])).calls.length, 2);
  const c = await run(reply, [BOLETO, outro], { por: 'conjunto' });
  assert.equal(c.calls.length, 1);
  assert.deepEqual(c.data[0].arquivos, ['boleto.pdf', 'boleto2.pdf']);
});

test('conteúdo bloqueado pela política não é extraído', async () => {
  const { env } = testEnv(() => '{}');
  env.complete = async () => ({ text: '', blocked: ['cpf'], model: 'fake', stopReason: null, usage: { inputTokens: 0, outputTokens: 0 } });
  const { ctx, step } = ctxWith(env, [BOLETO]);
  const s = await extrairBlock(ctx, step);
  assert.equal((s.data as Extracao[])[0].campos, null);
  assert.equal(s.flags[0].reason, 'não enviado ao modelo: contém cpf');
});

test('DANFE em PDF não é extraído do texto impresso; página de OCR vai marcada para o modelo', async () => {
  const danfe: ReadDoc = { ...doc('danfe.pdf', ['DANFE\nCHAVE DE ACESSO ...']), semExtracao: 'DANFE: campos não extraídos do PDF; use o XML da nota (chave ' + '3'.repeat(44) + ')' };
  const ocr: ReadDoc = { ...doc('recibo.pdf', ['Recibo 7788']), via: 'ocr', pages: [{ n: 1, text: 'Recibo 7788', via: 'ocr', confianca: 84.6 }] };
  const { s, data, calls } = await run('{"campos": {"fornecedor": null, "numero": "7788", "valor": null}, "origem": []}', [danfe, ocr]);
  assert.deepEqual(data.map(d => d.arquivo), ['recibo.pdf']);
  assert.equal(calls.length, 1);
  assert.match((calls[0].content[0] as { text: string }).text, /=== Página 1 === \(lida por OCR, confiança 85%: pode ter erro de leitura\)/);
  assert.doesNotMatch((calls[0].content[0] as { text: string }).text, /danfe\.pdf/);
  assert.ok(s.flags.some(f => f.ref === 'danfe.pdf' && /DANFE: campos não extraídos do PDF; use o XML da nota/.test(f.reason)));
});
