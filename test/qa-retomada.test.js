import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selecionarRetomada, extrairMaterialRetomada } from '../scripts/qa-baixar-candidata.mjs';
test('retomada preserva positivos, inclui surpresas e não reexecuta casos fora da rodada anterior', () => {
  const r = selecionarRetomada({ homologacao: { principais: [{ id: '01-contrato', estado: 'fora_desta_rodada', utilizavel: null }, { id: '03-planilha', utilizavel: true, custo: 0.02 }, { id: '12-apresentacao', utilizavel: true, custo: 0.1 }], surpresa: [{ id: 'U01', utilizavel: true, custo: 0.01 }, { id: 'U05', utilizavel: false }] }, classes: { rapido: { contrato: { status: 'erro', falhas: ['bloqueio'] } }, equilibrado: { contrato: { status: 'aprovado', falhas: [] } } } });
  assert.deepEqual(r, { casos: ['03-planilha', 'U05'], classes: ['rapido/contrato'] });
});
test('não marca ausência de objeto de classes como execução nem repete uma planilha já conferida', () => {
  assert.deepEqual(selecionarRetomada({ homologacao: { principais: [{ id: '03-planilha', utilizavel: true, custo: 0.1, conferenciaNumerica: { falhas: [] } }] }, classes: 'NAO_COBERTO' }), { casos: [], classes: [] });
});
test('retomada usa o material anterior inteiro, inclusive separadores internos, sem inferência de exemplo', () => {
  const entrada = '# Auditoria\n\n---\n\n## Achados\nDados originais';
  assert.equal(extrairMaterialRetomada(entrada + '\n\n---\n\n'), entrada);
  assert.equal(extrairMaterialRetomada(entrada + '\n\n---\n\nResposta conferida'), entrada);
  assert.throws(() => extrairMaterialRetomada('sem separador'), /não pôde ser separado/);
});
