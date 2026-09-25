// Planilhas com linhas acima da tabela: o leitor acha a região da tabela e
// guarda o que vem antes (título, período, unidade, responsável) como metadados,
// com a linha de origem. O assistente recebe os metadados no texto e nos
// registros ("_meta.<rótulo>"); o mapeamento de importação pode usá-los como campo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from '../src/blocks/ler.ts';
import { conferirBlock, type ResultadoConferencia } from '../src/blocks/conferir.ts';
import { assistantDefinitionSchema } from '../src/assistants/schema.ts';
import { aplicarMapeamento } from '../src/imports/apply.ts';
import { mapeamentoConfigSchema } from '../src/imports/schema.ts';
import { lerMetadados } from '../src/util/metadados.ts';
import { inputFile, testEnv, xlsx } from './fixtures.ts';

const OPTS = { paginasMax: 50, ocrMinConfidence: 70, visionFallback: false };
const PLANILHA = () => xlsx({ Lista: [
  ['LISTA DE PRESENÇA · TREINAMENTO DE PRIVACIDADE'],
  ['Período: 08/2026'],
  ['Unidade', 'Matriz'],
  ['Responsável:', 'Ana Exemplo', null],
  [],
  ['Nome', 'Setor', 'Assinatura'],
  ['Bruno Fictício', 'Compras', 'sim'],
  ['Carla Modelo', 'RH', 'sim'],
] });

test('parser: título, "rótulo: valor", rótulo e valor em duas células, rótulo terminado em dois-pontos', () => {
  const m = lerMetadados([
    { n: 1, celulas: ['RELATÓRIO MENSAL'] }, { n: 2, celulas: ['Competência: 07/2026', null] },
    { n: 3, celulas: ['Unidade', 'Filial Sul'] }, { n: 4, celulas: ['Emitido por:', 'Sistema', 'Página 1'] }, { n: 5, celulas: [null] },
  ]);
  assert.equal(m.titulo, 'RELATÓRIO MENSAL');
  assert.deepEqual(m.campos, { 'Competência': '07/2026', Unidade: 'Filial Sul', 'Emitido por': 'Sistema' });
  assert.deepEqual(m.linhaDe, { titulo: 1, 'Competência': 2, Unidade: 3, 'Emitido por': 4 });
});

test('leitor: acha o cabeçalho certo (não a linha "Unidade | Matriz") e guarda as linhas de cima como metadados', async () => {
  const { env } = testEnv();
  const d = await readFile(inputFile('presenca.xlsx', await PLANILHA()), OPTS, env);
  const s = d.sheets![0];
  assert.deepEqual(s.header, ['Nome', 'Setor', 'Assinatura']);
  assert.equal(s.rows.length, 2);
  assert.deepEqual([s.metadados!.titulo, s.metadados!.campos], ['LISTA DE PRESENÇA · TREINAMENTO DE PRIVACIDADE', { 'Período': '08/2026', Unidade: 'Matriz', 'Responsável': 'Ana Exemplo' }]);
  // O texto que o assistente recebe traz o título e o período antes da tabela.
  assert.match(d.text, /^\[Lista\]\nLISTA DE PRESENÇA · TREINAMENTO DE PRIVACIDADE\nPeríodo: 08\/2026\nUnidade \| Matriz\n/);
});

test('registros da planilha trazem os metadados em "_meta", com a linha de origem', async () => {
  const { env } = testEnv();
  const doc = await readFile(inputFile('presenca.xlsx', await PLANILHA()), OPTS, env);
  const def = assistantDefinitionSchema.parse({ inputs: { files: { enabled: true } }, pipeline: [{ bloco: 'conferir', params: {
    esquerda: { de: 'tabela', arquivo: '*presenca*' }, direita: { de: 'tabela', arquivo: '*presenca*' },
    regras: [{ campo: 'Período', esquerda: '_meta.Período', direita: '_meta.Unidade', tipo: 'igual' }] } }] });
  const s = await conferirBlock({ def, text: '', files: [], docs: [doc], sections: [], env }, def.pipeline[0]);
  const r = s.data as ResultadoConferencia;
  assert.equal(r.divergencias.length, 2);
  assert.deepEqual([r.divergencias[0].esquerda!.valor, r.divergencias[0].esquerda!.origem, r.divergencias[0].direita!.origem],
    ['08/2026', 'presenca.xlsx › Lista › linha 2', 'presenca.xlsx › Lista › linha 3']);
});

test('mapeamento de importação: um metadado das linhas de cima vira campo', async () => {
  const csv = Buffer.from(['Relatório de estoque', 'Unidade: Filial Norte;;', 'Data-base: 31/08/2026;;', 'Código;Descrição;Saldo', 'A1;Parafuso;10', 'B2;Arruela;5'].join('\n'), 'latin1');
  const cfg = mapeamentoConfigSchema.parse({ formato: 'csv', codificacao: 'latin1', ignorarLinhasInicio: 3, campos: [
    { campo: 'unidade', doMetadado: { chave: 'unidade' }, obrigatorio: true },
    { campo: 'dataBase', doMetadado: { chave: 'Data-base' }, tipo: 'data' },
    { campo: 'titulo', doMetadado: { chave: 'titulo' } },
    { campo: 'codigo', origem: 'Código' }, { campo: 'saldo', origem: 'Saldo', tipo: 'numero' },
  ] });
  const r = await aplicarMapeamento(new Uint8Array(csv), 'estoque.csv', cfg);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.registros.map(x => x.dados), [
    { unidade: 'Filial Norte', dataBase: '2026-08-31', titulo: 'Relatório de estoque', codigo: 'A1', saldo: 10 },
    { unidade: 'Filial Norte', dataBase: '2026-08-31', titulo: 'Relatório de estoque', codigo: 'B2', saldo: 5 },
  ]);
  assert.equal(r.registros[0].origens.unidade, 'estoque.csv › linha 2');
  assert.deepEqual(r.metadados!.campos, { Unidade: 'Filial Norte', 'Data-base': '31/08/2026' });
  // Metadado obrigatório ausente: erro geral, nenhum registro.
  const falta = mapeamentoConfigSchema.parse({ ...cfg, campos: [{ campo: 'centro', doMetadado: { chave: 'Centro de custo' }, obrigatorio: true }, { campo: 'codigo', origem: 'Código' }] });
  assert.deepEqual((await aplicarMapeamento(new Uint8Array(csv), 'estoque.csv', falta)).erros, [{ campo: 'centro', motivo: 'metadado Centro de custo não encontrado nas linhas acima da tabela' }]);
  // JSON e XML não têm linhas acima da tabela.
  assert.ok(!mapeamentoConfigSchema.safeParse({ formato: 'json', campos: [{ campo: 'x', doMetadado: { chave: 'y' } }] }).success);
});
