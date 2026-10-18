import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectar } from '../src/filtro.js';
import { construir, pedidoDeCorrecao, descreverContrato, promptExecucao, REGRAS } from '../src/quickwin-construtor.js';
import { verificarFacilitiesQa } from '../scripts/qa-facilities-oraculo.mjs';
const fixture = nome => readFileSync(new URL(`./fixtures/qa-real/${nome}-20261018.md`, import.meta.url), 'utf8');
test('auditoria real do QA: prontuários de treinamento não são classificados como prontuários de saúde', () => {
  assert.ok(!detectar(fixture('u10')).includes('sensivel'));
  assert.ok(!detectar('Prontuários de treinamento dos operadores e instrumentos de medição').includes('sensivel'));
});
test('a exceção de treinamento não libera documentos médicos, sinais de saúde, sigilo explícito ou credenciais', () => {
  for (const s of ['prontuário do paciente', 'prontuário médico', 'prontuários de treinamento e exame admissional', 'prontuários de treinamento: saúde ocupacional', 'prontuário de treinamento da enfermagem', 'prontuário de treinamento: medicamento e dosagem']) assert.ok(detectar(s).includes('sensivel'), s);
  assert.ok(detectar('prontuários de treinamento CONFIDENCIAL').includes('confidencial'));
  assert.ok(detectar('prontuários de treinamento; senha: NuncaUsar2026!').includes('credencial'));
});
test('facilities: resposta real omite OS elegível e agrupamento, sem confundir menção na nota com linha entregue', () => {
  const [entrada, resultado] = fixture('u05').split('\n---\n');
  const r = verificarFacilitiesQa(entrada, resultado);
  assert.deepEqual(r.esperados, ['OS-4401', 'OS-4412', 'OS-4420', 'OS-4435']);
  assert.ok(r.falhas.includes('Facilities: registro elegível omitido (OS-4435)'));
  assert.ok(r.falhas.some(x => /agrupamento/.test(x)));
});
test('facilities: grupo correto e célula ausente preservada; OS mais recente não entra no filtro', () => {
  const [entrada] = fixture('u05').split('\n---\n');
  const texto = '## Ordens\n| Item | Tipo de Serviço | Responsável |\n|---|---|---|\n| OS-4401 | Climatização | Carlos Mendes |\n| OS-4412 | Hidráulica | Roberto Faria |\n| OS-4420 | Elétrica | Marcos Souza |\n| OS-4435 | Serralheria | não informado |';
  assert.deepEqual(verificarFacilitiesQa(entrada, texto).falhas, []);
  assert.ok(verificarFacilitiesQa(entrada, texto + '\n| OS-4470 | Civil | Juliana Dias |').falhas.some(x => /fora do filtro/.test(x)));
});
test('correção conserva colunas manuais e de exemplo; sugestão não vira contrato fixo', () => {
  const e = construir({ descricao: 'Liste as ordens abertas e agrupe por tipo de serviço', operacao: { v: 2, entregaveis: [{ tipo: 'tabela', rotulo: 'Ordens' }] } });
  e.configuracao_confirmada = true; e.formato_saida = { tipo: 'tabela', colunas: ['Item', 'Responsável'], secoes: [], origem_colunas: 'sugestao' };
  assert.doesNotMatch(descreverContrato(e.formato_saida), /exatamente/);
  assert.doesNotMatch(pedidoDeCorrecao(['faltou agrupamento'], e), /Mantenha exatamente/);
  for (const origem of ['pessoa', 'exemplo']) { e.formato_saida.origem_colunas = origem; assert.match(pedidoDeCorrecao(['x'], e), /Mantenha exatamente estas colunas/); }
  assert.match(REGRAS.destacar_ausentes.instrucao, /Não exclua uma linha/);
  assert.match(REGRAS.preservar_dados.instrucao, /valores derivados corretos/);
});
