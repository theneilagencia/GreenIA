import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selecionarRetomada, extrairMaterialRetomada, conferirPlanilhaSalva, selecionarRevalidacaoArquivos, executar } from '../scripts/qa-baixar-candidata.mjs';
test('revalidação visual só repete apresentação e social e conserva as demais pendências', async () => {
  const anterior = { classes: { rapido: { contrato: { status: 'erro' } } } };
  const r = selecionarRevalidacaoArquivos(anterior);
  assert.deepEqual(r.casos, ['12-apresentacao', '14-social']); assert.deepEqual(r.classes, []);
  assert.deepEqual(r.pendenciasForaDestaRodada.classes, ['rapido/contrato']);
  await assert.rejects(executar('a'.repeat(40), { revalidarArquivos: true }), /exige retomada/);
  await assert.rejects(executar('a'.repeat(40), { retomar: '/tmp/ficticio', revalidarArquivos: true, somenteClasses: ['avancado/pesquisa'] }), /não aceita seleção/);
});
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

test('retomada conserva classes selecionadas mas não executadas e exclui as concluídas', () => {
  const escopo = { selecaoClasses: ['rapido/contrato', 'avancado/contrato', 'avancado/reuniao'] };
  assert.deepEqual(selecionarRetomada({ escopo, classes: 'NAO_EXECUTADO — rodada interrompida' }).classes, escopo.selecaoClasses);
  assert.deepEqual(selecionarRetomada({ escopo, classes: { avancado: { contrato: { status: 'aprovado', falhas: [] }, reuniao: { status: 'erro', falhas: ['403'] } } } }).classes.sort(), ['rapido/contrato', 'avancado/reuniao'].sort());
});
test('reconferência salva remove somente o falso negativo demonstrado, nunca outros erros ou custo pendente', () => {
  const erro = 'Ranking e percentuais da planilha não foram verificados independentemente';
  const caso = { id: '03-planilha', fonte: 'ia', http: 200, status: 'aprovado', custo: 0.01933725, custosPendentes: 0, utilizavel: false, falhas: [erro] };
  const conferencia = { falhas: [], lancamentosVerificados: 8 };
  const revisto = conferirPlanilhaSalva(caso, conferencia);
  assert.equal(revisto.utilizavel, true); assert.equal(caso.utilizavel, false);
  assert.deepEqual(selecionarRetomada({ homologacao: { principais: [revisto] } }).casos, []);
  assert.equal(conferirPlanilhaSalva({ ...caso, falhas: [erro, 'não usou material'] }, conferencia).utilizavel, false);
  assert.equal(conferirPlanilhaSalva({ ...caso, custo: null, custosPendentes: 1 }, conferencia).utilizavel, false);
  assert.equal(conferirPlanilhaSalva({ ...caso, http: 403 }, conferencia).utilizavel, false);
  assert.equal(conferirPlanilhaSalva(caso, { falhas: ['Percentual divergente: L092'] }), caso);
});

test('retomada inclui pesquisa parcial mesmo que o relatório antigo tenha falhas vazias', () => {
  assert.deepEqual(selecionarRetomada({ classes: { avancado: { pesquisa: { status: 'parcial', falhas: [] }, contrato: { status: 'inconsistente', falhas: [] }, social: { status: 'aprovado', falhas: [] } } } }).classes, ['avancado/pesquisa', 'avancado/contrato']);
});
