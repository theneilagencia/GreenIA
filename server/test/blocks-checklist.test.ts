import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistBlock, type ResultadoChecklist } from '../src/blocks/checklist.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import type { ReadDoc, RunContext } from '../src/blocks/types.ts';
import { testEnv } from './fixtures.ts';

// Documentos de admissão, como no assistente de referência de RH.
const ITENS = [
  { id: 'rg', nome: 'RG', sinonimos: ['identidade', 'carteira de identidade'] },
  { id: 'cpf', nome: 'CPF', sinonimos: [] },
  { id: 'residencia', nome: 'Comprovante de residência', sinonimos: ['comprovante de endereço', 'conta de luz'] },
  { id: 'ctps', nome: 'Carteira de trabalho', sinonimos: ['CTPS'] },
  { id: 'aso', nome: 'ASO', sinonimos: ['atestado de saúde ocupacional', 'exame admissional'] },
  { id: 'foto', nome: 'Foto 3x4', sinonimos: [], obrigatorio: false },
];
const doc = (name: string, text: string): ReadDoc => ({ fileId: name, name, kind: 'pdf', sha256: 'x', via: 'texto', pages: [{ n: 1, text }], text, pageCount: 1, warnings: [] });

async function run(docs: ReadDoc[], metodo: 'regras' | 'modelo' = 'regras', reply = '') {
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'checklist', params: { itens: ITENS, metodo } }] });
  const { env, calls } = testEnv(() => reply);
  const ctx: RunContext = { def, text: '', files: [], docs, sections: [], env };
  const s = await checklistBlock(ctx, def.pipeline[0]);
  return { s, r: s.data as ResultadoChecklist, calls, st: Object.fromEntries((s.data as ResultadoChecklist).itens.map(i => [i.id, i.status])) };
}

test('regras: presente pelo nome do arquivo ou pelo início do conteúdo; ausente quando não há nada', async () => {
  const { r, st, s, calls } = await run([
    doc('RG_Maria.pdf', 'República Federativa do Brasil'),
    doc('scan0001.pdf', 'COMPROVANTE DE ENDEREÇO\nCompanhia de Energia\nConta de agosto'),
    doc('cpf-maria.jpg.pdf', 'Cadastro de Pessoas Físicas'),
    doc('exame.pdf', 'ATESTADO DE SAÚDE OCUPACIONAL\nApto para a função.'),
  ]);
  assert.deepEqual(st, { rg: 'presente', cpf: 'presente', residencia: 'presente', ctps: 'ausente', aso: 'presente', foto: 'ausente' });
  assert.deepEqual(r.itens.find(i => i.id === 'residencia')!.evidencias[0], { arquivo: 'scan0001.pdf', pagina: 1, como: 'título da página 1 ("comprovante de endereço")' });
  assert.deepEqual(r.resumo, { presente: 4, ausente: 2, duvidoso: 0 });
  assert.deepEqual(s.counts, { pendencias: 1 });                  // CTPS obrigatória ausente; a foto é opcional
  assert.equal(calls.length, 0);                                  // regras: sem modelo
});

test('duvidoso: citado só no meio do texto, ou um arquivo com mais de um item; sempre vai para revisão', async () => {
  const { st, s, r } = await run([
    doc('ficha-cadastral.pdf', 'Ficha cadastral do candidato.\n' + 'x'.repeat(400) + '\nDocumentos entregues: CTPS em análise.'),
    doc('documentos.pdf', 'RG e CPF digitalizados na mesma folha'),
    doc('boleto.pdf', 'Boleto de mensalidade'),
  ]);
  assert.equal(st.ctps, 'duvidoso');
  assert.equal(st.rg, 'duvidoso');
  assert.equal(st.cpf, 'duvidoso');
  assert.ok(s.flags.some(f => f.reason.startsWith('item duvidoso: Carteira de trabalho')));
  assert.equal(r.itens.find(i => i.id === 'ctps')!.motivo, 'mencionado em ficha-cadastral.pdf, documento não encontrado');
  assert.ok(s.flags.some(f => f.reason === 'arquivo não corresponde a nenhum item' && f.ref === 'boleto.pdf'));
  assert.deepEqual(r.naoIdentificados, ['ficha-cadastral.pdf', 'boleto.pdf']);   // só citar um item não identifica o arquivo
  assert.equal(s.counts!.pendencias, 5);                          // 3 duvidosos + residência e ASO ausentes
});

test('"RG" não casa com "cargo"', async () => {
  const { st } = await run([doc('ficha.pdf', 'Cargo pretendido: analista')]);
  assert.equal(st.rg, 'ausente');
});

test('modelo: confiança alta com trecho que confere fica presente; o resto, duvidoso', async () => {
  const reply = JSON.stringify({ arquivos: [
    { arquivo: 'a.pdf', item: 'rg', confianca: 'alta', trecho: 'Registro Geral 12.345.678' },
    { arquivo: 'b.pdf', item: 'ctps', confianca: 'media', trecho: 'Carteira de Trabalho Digital' },
    { arquivo: 'c.pdf', item: 'aso', confianca: 'alta', trecho: 'trecho inventado' },
    { arquivo: 'd.pdf', item: null, confianca: 'alta', trecho: 'Boleto' },
  ] });
  const { st, r } = await run([
    doc('a.pdf', 'Registro Geral 12.345.678'), doc('b.pdf', 'Carteira de Trabalho Digital'), doc('c.pdf', 'Exame clínico'), doc('d.pdf', 'Boleto'),
  ], 'modelo', reply);
  assert.equal(st.rg, 'presente');
  assert.equal(st.ctps, 'duvidoso');
  assert.equal(st.aso, 'duvidoso');
  assert.match(r.itens.find(i => i.id === 'aso')!.evidencias[0].como, /trecho não encontrado/);
  assert.equal(st.cpf, 'ausente');
  assert.deepEqual(r.naoIdentificados, ['d.pdf']);
});

test('modelo fora do formato: todos os itens duvidosos, nunca presentes por suposição', async () => {
  const { st, s } = await run([doc('a.pdf', 'RG')], 'modelo', 'não sei');
  assert.ok(Object.values(st).every(v => v === 'duvidoso'));
  assert.match(s.flags[0].reason, /checklist pelo modelo falhou/);
});

test('sem arquivos: tudo ausente e sinalizado', async () => {
  const { st, s } = await run([]);
  assert.ok(Object.values(st).every(v => v === 'ausente'));
  assert.equal(s.flags[0].reason, 'nenhum arquivo lido para conferir o checklist');
});

const pages = (name: string, ...texts: string[]): ReadDoc => ({ fileId: name, name, kind: 'pdf', sha256: 'x', via: 'texto', pages: texts.map((text, i) => ({ n: i + 1, text })), text: texts.join('\n'), pageCount: texts.length, warnings: [] });
const MARCA = 'ESPÉCIME · DOCUMENTO FICTÍCIO';

test('vários documentos no mesmo arquivo: cada item com a sua página', async () => {
  const { st, r } = await run([
    pages('documentos-pessoais.pdf', `${MARCA}\nCARTEIRA DE IDENTIDADE\nRegistro Geral: 12.345.678-9`, `${MARCA}\nCOMPROVANTE DE INSCRIÇÃO NO CPF\nNúmero: 123.456.789-09`),
    pages('scan.pdf', `${MARCA}\nCARTEIRA DE TRABALHO DIGITAL\nCPF: 123.456.789-09`),
  ]);
  assert.equal(st.rg, 'presente');
  assert.equal(st.cpf, 'presente');
  assert.equal(st.ctps, 'presente');
  assert.deepEqual(r.itens.find(i => i.id === 'rg')!.evidencias.map(e => [e.arquivo, e.pagina]), [['documentos-pessoais.pdf', 1]]);
  assert.deepEqual(r.itens.find(i => i.id === 'cpf')!.evidencias.map(e => [e.arquivo, e.pagina]), [['documentos-pessoais.pdf', 2]]);
  // O CPF citado na CTPS fica como menção, sem mudar a evidência.
  assert.deepEqual(r.itens.find(i => i.id === 'cpf')!.mencoes!.map(e => [e.arquivo, e.pagina]), [['scan.pdf', 1]]);
});

test('menção não satisfaz item que exige documento; marca d’água e rótulo com número não são título', async () => {
  const { st, r } = await run([
    pages('aso.pdf', `${MARCA}\nATESTADO DE SAÚDE OCUPACIONAL\nCPF: 123.456.789-09\nApto.`),
    pages('ficha.pdf', `${MARCA}\nFICHA DE ADMISSÃO\nObservações: carteira de trabalho entregue depois.`),
    pages('outro.pdf', `${MARCA}\nDECLARAÇÃO\nTexto.`),
  ]);
  assert.equal(st.aso, 'presente');
  assert.equal(st.cpf, 'duvidoso');
  assert.equal(r.itens.find(i => i.id === 'cpf')!.motivo, 'mencionado em aso.pdf, documento não encontrado');
  assert.equal(st.ctps, 'duvidoso');
  assert.equal(r.itens.find(i => i.id === 'ctps')!.motivo, 'mencionado em ficha.pdf, documento não encontrado');
  assert.ok(!r.itens.some(i => i.evidencias.some(e => /espécime|especime/i.test(e.como))));
});

test('regra E/OU por item: documento, menção, um dos dois, os dois', async () => {
  const itens = [
    { id: 'art', nome: 'ART', sinonimos: ['anotação de responsabilidade técnica'], evidencia: 'documento_e_mencao' },
    { id: 'cno', nome: 'Matrícula CNO', sinonimos: [], mencoes: ['CNO'], evidencia: 'mencao' },
    { id: 'garantia', nome: 'Seguro garantia', sinonimos: ['apólice'], mencoes: ['caução'], evidencia: 'documento_ou_mencao' },
    { id: 'alvara', nome: 'Alvará de construção', sinonimos: [] },
  ];
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'checklist', params: { itens } }] });
  const go = async (docs: ReadDoc[]) => {
    const { env } = testEnv(() => '');
    const s = await checklistBlock({ def, text: '', files: [], docs, sections: [], env }, def.pipeline[0]);
    return (s.data as ResultadoChecklist).itens;
  };
  const contrato = pages('contrato.pdf', 'CONTRATO DE EMPREITADA\nCláusula 3: a obra segue a ART nº 2026-000123, CNO 51.234.56789/70.\nGarantia por caução de 5%.');
  let it = await go([contrato]);
  const st = (x: typeof it) => Object.fromEntries(x.map(i => [i.id, i.status]));
  assert.deepEqual(st(it), { art: 'duvidoso', cno: 'presente', garantia: 'presente', alvara: 'ausente' });
  assert.equal(it.find(i => i.id === 'art')!.motivo, 'mencionado em contrato.pdf, documento não encontrado');
  it = await go([contrato, pages('art.pdf', 'ANOTAÇÃO DE RESPONSABILIDADE TÉCNICA\nNúmero 2026-000123')]);
  assert.equal(st(it).art, 'presente');
  it = await go([pages('art.pdf', 'ANOTAÇÃO DE RESPONSABILIDADE TÉCNICA\nNúmero 2026-000123')]);
  assert.deepEqual([st(it).art, it.find(i => i.id === 'art')!.motivo], ['duvidoso', 'documento encontrado, sem a menção pedida']);
});

test('termos que se sobrepõem: vale o mais longo', async () => {
  const itens = [{ id: 'titulo', nome: 'Título de eleitor', sinonimos: ['título eleitoral'] }, { id: 'protesto', nome: 'Título', sinonimos: ['título protestado'] }];
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'checklist', params: { itens } }] });
  const { env } = testEnv(() => '');
  const s = await checklistBlock({ def, text: '', files: [], docs: [pages('a.pdf', 'JUSTIÇA ELEITORAL · TÍTULO ELEITORAL\nZona 1')], sections: [], env }, def.pipeline[0]);
  assert.deepEqual((s.data as ResultadoChecklist).itens.map(i => i.status), ['presente', 'ausente']);
});
