// Documento longo lido por partes: nenhuma página fica de fora da extração nem do
// resumo; cada parte vai numa chamada, com as páginas indicadas, e o resultado é
// consolidado. Valores diferentes entre partes vão para revisão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairBlock, type Extracao } from '../src/blocks/extrair.ts';
import { resumirBlock } from '../src/blocks/consultar.ts';
import { dividirEmPartes, descreverParte } from '../src/blocks/partes.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { ReadDoc, RunContext } from '../src/blocks/types.ts';
import { testEnv } from './fixtures.ts';

const SCHEMA = { type: 'object', properties: { receita: { type: ['number', 'null'] }, saldo: { type: ['number', 'null'] }, notas: { type: 'array', items: { type: 'string' } } } };
// 90 páginas de 1.000 caracteres; a receita está na página 5 e o saldo na página 84.
const longo = (): ReadDoc => {
  const pages = Array.from({ length: 90 }, (_, i) => ({ n: i + 1, text: i === 4 ? 'Receita total: 120.000,00' : i === 83 ? 'Saldo final: 45.000,00' : `Página ${i + 1}. ` + 'x'.repeat(1000) }));
  return { fileId: 'b', name: 'balancete.pdf', kind: 'pdf', sha256: 'x', via: 'texto', pageCount: 90, warnings: [], pages, text: pages.map(p => p.text).join('\n\n') };
};

test('partes: páginas em ordem, nenhuma perdida, nenhuma parte acima do limite (salvo página única maior)', () => {
  const d = longo();
  const partes = dividirEmPartes([d], 20_000);
  assert.ok(partes.length >= 4);
  assert.deepEqual(partes.flatMap(p => p.itens.flatMap(i => i.paginas.map(pg => pg.n))), d.pages.map(p => p.n));
  assert.ok(partes.every(p => p.caracteres <= 20_000));
  assert.match(descreverParte(partes[0]), /^balancete\.pdf, p\. 1–\d+$/);
});

test('extração por partes: uma chamada por parte, consolidada; o saldo da página 84 não se perde', async () => {
  const reply = (req: { content: { type: string; text?: string }[] }) => {
    const t = req.content.map(c => c.text ?? '').join('');
    return JSON.stringify({
      campos: { receita: t.includes('Receita total') ? 120000 : null, saldo: t.includes('Saldo final') ? 45000 : null, notas: t.includes('=== Página 1 ===') ? ['início'] : [] },
      origem: [...(t.includes('Receita total') ? [{ campo: 'receita', pagina: 5, trecho: 'Receita total: 120.000,00' }] : []), ...(t.includes('Saldo final') ? [{ campo: 'saldo', pagina: 84, trecho: 'Saldo final: 45.000,00' }] : []), ...(t.includes('=== Página 1 ===') ? [{ campo: 'notas', pagina: 1, trecho: 'Página 1.' }] : [])],
    });
  };
  const { env, calls } = testEnv(reply as never);
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'extrair', params: { schema: SCHEMA, caracteresPorParte: 20_000 } }] });
  const s = await extrairBlock({ def, text: '', files: [], docs: [longo()], sections: [], env } as RunContext, def.pipeline[0]);
  const r = (s.data as Extracao[])[0];
  assert.ok(calls.length >= 4);
  assert.match(calls[1].purpose, /^extração estruturada \(parte 2 de \d+\)$/);
  assert.match(calls[1].system, /Esta é a parte 2 \(balancete\.pdf, p\. \d+–\d+\)/);
  assert.equal(r.partes!.length, calls.length);
  assert.deepEqual(r.campos, { receita: 120000, saldo: 45000, notas: ['início'] });
  assert.equal(r.valido, true, JSON.stringify(s.flags));
  assert.deepEqual(r.origem.map(o => o.pagina).sort((a, b) => a! - b!), [1, 5, 84]);
});

test('o mesmo campo com valores diferentes em duas partes vai para revisão', async () => {
  const { env } = testEnv();
  let k = 0;
  env.complete = async () => ({ text: JSON.stringify({ campos: { receita: [100, 200][k++] ?? null, saldo: null, notas: [] }, origem: [] }), model: 'fake', stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } });
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'extrair', params: { schema: SCHEMA, caracteresPorParte: 50_000 } }] });
  const s = await extrairBlock({ def, text: '', files: [], docs: [longo()], sections: [], env } as RunContext, def.pipeline[0]);
  assert.ok(s.flags.some(f => /valores diferentes entre as partes para receita: 100 \(balancete\.pdf, p\. 1–\d+\) e 200/.test(f.reason)), JSON.stringify(s.flags));
  assert.equal((s.data as Extracao[])[0].campos!.receita, 100);
});

test('resumo por partes: um parcial por parte e a consolidação só dos parciais', async () => {
  const { env, calls } = testEnv(req => req.purpose.startsWith('resumo (parte') ? `## Visão geral\nParcial de ${req.purpose}.` : '## Visão geral\nConsolidado.');
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'resumir', params: { topicos: ['Visão geral'], caracteresPorParte: 20_000 } }] });
  const s = await resumirBlock({ def, text: '', files: [], docs: [longo()], sections: [], env } as RunContext, def.pipeline[0]);
  const d = s.data as { topicos: { texto: string }[]; partes: string[] };
  assert.equal(calls.at(-1)!.purpose, 'resumo (consolidação das partes)');
  assert.equal(calls.length, d.partes.length + 1);
  assert.match(calls.at(-1)!.content.map(c => (c as { text: string }).text).join(''), /Resumo parcial 1 de \d+ \(balancete\.pdf, p\. 1–/);
  assert.ok(!calls.at(-1)!.content.map(c => (c as { text: string }).text).join('').includes('x'.repeat(200)));   // a consolidação não reenvia o documento
  assert.equal(d.topicos[0].texto, 'Consolidado.');
  // Material curto: uma chamada só, como antes.
  const curto = testEnv(() => '## Visão geral\nCurto.');
  await resumirBlock({ def, text: 'Texto curto.', files: [], docs: [], sections: [], env: curto.env } as RunContext, def.pipeline[0]);
  assert.deepEqual(curto.calls.map(c => c.purpose), ['resumo']);
});
