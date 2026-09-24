import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificarBlock, detectPeriod, suggestName, type LinhaIndice } from '../src/blocks/classificar.ts';
import { consultarBlock, buscarBlock, resumirBlock, excerpt } from '../src/blocks/consultar.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { BlockEnv, ReadDoc, RunContext } from '../src/blocks/types.ts';
import type { KnowledgeHit } from '../src/kb/knowledge.ts';
import { testEnv } from './fixtures.ts';

const doc = (name: string, text: string, extra: Partial<ReadDoc> = {}): ReadDoc => ({ fileId: name, name, kind: 'pdf', sha256: 'x', via: 'texto', pages: [{ n: 1, text }], text, pageCount: 1, warnings: [], ...extra });
const ctxFor = (pipeline: unknown[], env: BlockEnv, docs: ReadDoc[] = [], text = '', inputs: object = {}): RunContext => {
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true }, ...inputs }, pipeline });
  return { def, text, files: [], docs, sections: [], env };
};

// Evidências de LGPD, como no assistente de referência.
const TAXONOMIA = [
  { id: 'politica', nome: 'Política', sinonimos: ['política de privacidade', 'norma interna'] },
  { id: 'treinamento', nome: 'Treinamento', sinonimos: ['lista de presença', 'certificado'] },
  { id: 'contrato', nome: 'Contrato com operador', sinonimos: ['acordo de processamento', 'DPA'] },
  { id: 'incidente', nome: 'Registro de incidente', sinonimos: ['relatório de incidente'] },
];

test('período: competência, mês por extenso, data dada por um leitor ou primeira data', () => {
  assert.equal(detectPeriod({ text: 'Folha de pagamento - competência 08/2026' }), '2026-08');
  assert.equal(detectPeriod({ text: 'Lista de presença do treinamento de março de 2026' }), '2026-03');
  assert.equal(detectPeriod({ text: 'Assinado em 15/07/2026.' }), '2026-07');
  assert.equal(detectPeriod({ text: 'x', periodo: '2026-09' }), '2026-09');
  assert.equal(detectPeriod({ text: 'sem data' }), null);
});

test('nome sugerido pelo padrão, sem acento e sem repetir', () => {
  const used = new Set<string>();
  const v = { categoria: 'politica', categoriaNome: 'Política', periodo: '2026-03', arquivo: 'Política de Privacidade (final).PDF' };
  assert.equal(suggestName('{categoria}_{periodo}_{nome}', v, used), 'politica_2026-03_politica-de-privacidade-final.pdf');
  assert.equal(suggestName('{categoria}_{periodo}_{nome}', v, used), 'politica_2026-03_politica-de-privacidade-final-2.pdf');
  assert.equal(suggestName('{categoria}/{periodo}-{nome}', { ...v, categoria: null, periodo: null }, new Set()), 'nao-classificado/sem-periodo-politica-de-privacidade-final.pdf');
});

test('classificação por regras: índice com categoria, período e nome; incerteza vai para revisão', async () => {
  const { env, calls } = testEnv();
  const ctx = ctxFor([{ bloco: 'classificar', params: { taxonomia: TAXONOMIA } }], env, [
    doc('politica-privacidade.pdf', 'POLÍTICA DE PRIVACIDADE\nVersão de março de 2026'),
    doc('scan_004.pdf', 'LISTA DE PRESENÇA\nTreinamento LGPD - 12/05/2026'),
    doc('anexo.pdf', 'Documento diverso. ' + 'x'.repeat(600) + ' Conforme o acordo de processamento assinado em 01/02/2026.'),
    doc('foto.pdf', 'imagem sem texto útil'),
  ]);
  const s = await classificarBlock(ctx, ctx.def.pipeline[0]);
  const idx = (s.data as { indice: LinhaIndice[] }).indice;
  assert.deepEqual(idx.map(r => [r.arquivo, r.categoria, r.periodo, r.confianca]), [
    ['politica-privacidade.pdf', 'politica', '2026-03', 'alta'],
    ['scan_004.pdf', 'treinamento', '2026-05', 'alta'],
    ['anexo.pdf', 'contrato', '2026-02', 'baixa'],
    ['foto.pdf', null, null, 'baixa'],
  ]);
  assert.equal(idx[1].nomeSugerido, 'treinamento_2026-05_scan-004.pdf');
  assert.deepEqual(s.flags.map(f => `${f.ref}: ${f.reason}`), [
    'anexo.pdf: classificação com baixa confiança (meio do texto)',
    'foto.pdf: documento não classificado',
    'foto.pdf: período não identificado',
  ]);
  assert.equal(calls.length, 0);
});

test('classificação pelo modelo: categoria fora da taxonomia é recusada', async () => {
  const { env } = testEnv(() => JSON.stringify({ arquivos: [
    { arquivo: 'a.pdf', categoria: 'politica', periodo: '2026-04', confianca: 'alta' },
    { arquivo: 'b.pdf', categoria: 'folha', periodo: null, confianca: 'alta' },
  ] }));
  const ctx = ctxFor([{ bloco: 'classificar', params: { taxonomia: TAXONOMIA, metodo: 'modelo' } }], env, [doc('a.pdf', 'Norma'), doc('b.pdf', 'Holerite')]);
  const s = await classificarBlock(ctx, ctx.def.pipeline[0]);
  const idx = (s.data as { indice: LinhaIndice[] }).indice;
  assert.deepEqual(idx.map(r => [r.categoria, r.periodo, r.confianca]), [['politica', '2026-04', 'alta'], [null, null, 'baixa']]);
  assert.ok(s.flags.some(f => f.reason === 'categoria folha fora da taxonomia'));
});

const HITS: KnowledgeHit[] = [{ documentId: 'd1', version: 2, title: 'Férias e ausências', text: 'O pedido de férias deve ser feito com 30 dias de antecedência.' }];

test('consulta à base: responde citando documento e versão', async () => {
  const { env, calls } = testEnv(() => 'Peça com 30 dias de antecedência [Férias e ausências, v 2].', { searchKnowledge: async () => HITS });
  const ctx = ctxFor([{ bloco: 'consultar' }], env, [], 'Com quanto tempo peço férias?', { files: { enabled: false } });
  const s = await consultarBlock(ctx, ctx.def.pipeline[0]);
  const d = s.data as { coberto: boolean; fontes: { documentId: string; version: number }[] };
  assert.equal(d.coberto, true);
  assert.deepEqual(d.fontes.map(f => [f.documentId, f.version]), [['d1', 2]]);
  assert.deepEqual(s.flags, []);
  assert.match((calls[0].content[0] as { text: string }).text, /### Férias e ausências \(v 2\)/);
});

test('consulta sem documento na base: diz que não cobre e indica o key user, sem chamar o modelo', async () => {
  const { env, calls } = testEnv(() => 'x');
  const ctx = ctxFor([{ bloco: 'consultar' }], env, [], 'Qual o horário do refeitório?', { files: { enabled: false } });
  const s = await consultarBlock(ctx, ctx.def.pipeline[0]);
  const d = s.data as { coberto: boolean; resposta: string };
  assert.equal(d.coberto, false);
  assert.equal(d.resposta, 'A base de conhecimento não cobre essa pergunta. Fale com Key user da área: key.user@exemplo.com.br.');
  assert.equal(calls.length, 0);
});

test('consulta: resposta sem citação vai para revisão; "não cobre" do modelo é respeitado', async () => {
  let { env } = testEnv(() => 'Peça com 30 dias.', { searchKnowledge: async () => HITS });
  let ctx = ctxFor([{ bloco: 'consultar' }], env, [], 'férias?', { files: { enabled: false } });
  assert.equal((await consultarBlock(ctx, ctx.def.pipeline[0])).flags[0].reason, 'resposta sem citação de documento da base');
  ({ env } = testEnv(() => 'A base de conhecimento não cobre essa pergunta. Fale com o key user.', { searchKnowledge: async () => HITS }));
  ctx = ctxFor([{ bloco: 'consultar' }], env, [], 'e o décimo terceiro?', { files: { enabled: false } });
  const s = await consultarBlock(ctx, ctx.def.pipeline[0]);
  assert.equal((s.data as { coberto: boolean }).coberto, false);
  assert.deepEqual(s.flags, []);
});

test('busca: base (com permissão aplicada pela fonte) e arquivos enviados, com trecho', async () => {
  let areasPedidas: string[] | undefined = ['x'];
  const { env } = testEnv(() => '', { searchKnowledge: async (_q, o) => { areasPedidas = o.areas; return HITS; } });
  const ctx = ctxFor([{ bloco: 'buscar' }], env, [doc('ata-comite.pdf', 'Ata do comitê. Aprovada a nova política de férias coletivas.')], 'política de férias');
  const s = await buscarBlock(ctx, ctx.def.pipeline[0]);
  const r = (s.data as { resultados: { origem: string; titulo: string; trecho: string }[] }).resultados;
  assert.deepEqual(r.map(x => [x.origem, x.titulo]), [['base', 'Férias e ausências'], ['envio', 'ata-comite.pdf']]);
  assert.equal(areasPedidas, undefined);                       // sem áreas na definição: a da pessoa (RLS)
  assert.equal(excerpt('a'.repeat(500) + ' férias ' + 'b'.repeat(500), 'férias').includes('férias'), true);
});

test('resumo com tópicos fixos: tópico faltante e excesso de palavras vão para revisão', async () => {
  const topicos = ['Situação', 'Pontos de atenção', 'Próximos passos'];
  const { env } = testEnv(() => '## Situação\nFaturamento de agosto em R$ 1,2 mi.\n\n## pontos de atenção\nInadimplência subiu.');
  const ctx = ctxFor([{ bloco: 'resumir', params: { topicos, palavrasMax: 50 } }], env, [doc('dre-agosto.pdf', 'DRE agosto: receita 1,2 mi')]);
  const s = await resumirBlock(ctx, ctx.def.pipeline[0]);
  const d = s.data as { topicos: { titulo: string; texto: string }[]; fontes: string[] };
  assert.deepEqual(d.topicos.map(t => t.titulo), topicos);
  assert.equal(d.topicos[1].texto, 'Inadimplência subiu.');           // casa sem diferenciar maiúsculas
  assert.equal(d.topicos[2].texto, '');                              // nada inventado
  assert.deepEqual(s.flags.map(f => f.reason), ['tópico ausente no resumo: Próximos passos']);
  assert.deepEqual(d.fontes, ['dre-agosto.pdf']);
  const long = testEnv(() => topicos.map(t => `## ${t}\n${'palavra '.repeat(30)}`).join('\n'));
  const s2 = await resumirBlock(ctxFor([{ bloco: 'resumir', params: { topicos, palavrasMax: 50 } }], long.env, [doc('a.pdf', 'x')]), ctxFor([{ bloco: 'resumir', params: { topicos, palavrasMax: 50 } }], long.env).def.pipeline[0]);
  assert.match(s2.flags[0].reason, /90 palavras, acima do limite de 50/);
});
