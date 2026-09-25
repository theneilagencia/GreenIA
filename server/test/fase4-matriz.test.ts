// Matriz de pontuação de três estados: congelada com hash, regras pedidas, e a
// pontuação gravada do desenvolvimento é a que a matriz dá sobre as medições.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classificar, lerMatriz, pontuar, pontuarMedicoes, pontuarMedicoesV2, rotulo } from '../eval/fase4/pontuar.ts';
import { sha256 } from '../eval/fase4/lib.ts';

const AQUI = new URL('../eval/fase4/', import.meta.url);

test('matriz congelada: o sha256 confere', () => {
  const hash = readFileSync(new URL('matriz.sha256', AQUI), 'utf8').split(/\s+/)[0];
  assert.equal(sha256(readFileSync(new URL('matriz.json', AQUI), 'utf8')), hash);
  assert.doesNotThrow(() => lerMatriz());
});

test('regras: ausente × presente é grave, presente × ausente é comum, duvidoso é revisão', () => {
  assert.equal(classificar('ausente', 'presente'), 'erro_grave');
  assert.equal(classificar('presente', 'ausente'), 'erro_comum');
  for (const g of ['presente', 'ausente', 'duvidoso'] as const) assert.equal(classificar(g, 'duvidoso'), 'revisao');
  assert.equal(classificar('presente', 'presente'), 'acerto');
  assert.equal(classificar('ausente', 'ausente'), 'acerto');
  assert.equal(classificar('duvidoso', 'presente'), 'erro_grave');
  assert.equal(classificar('duvidoso', 'ausente'), 'acerto');
  const p = pontuar([
    { caso: 'a', unidade: '1', gabarito: 'ausente', plataforma: 'presente' }, { caso: 'a', unidade: '2', gabarito: 'presente', plataforma: 'ausente' },
    { caso: 'b', unidade: '1', gabarito: 'presente', plataforma: 'duvidoso' }, { caso: 'b', unidade: '2', gabarito: 'presente', plataforma: 'presente' },
  ]);
  assert.deepEqual([p.casos, p.unidades, p.acerto, p.errosGraves, p.errosComuns, p.revisao], [2, 4, 1, 1, 1, 1]);
  assert.deepEqual(p.taxas, { acerto: 25, errosGraves: 25, errosComuns: 25, revisao: 25 });
  assert.deepEqual(p.graves, ['a:1']);
});

test('pontuação do desenvolvimento gravada = matriz aplicada às medições; nenhuma do reservado', () => {
  const gravada = JSON.parse(readFileSync(new URL('resultados/pontuacao-desenvolvimento.json', AQUI), 'utf8'));
  assert.equal(gravada.matriz, readFileSync(new URL('matriz.sha256', AQUI), 'utf8').split(/\s+/)[0]);
  const agora = pontuarMedicoes();
  assert.deepEqual(gravada.medicoes, JSON.parse(JSON.stringify(agora)));
  for (const m of agora) { assert.equal(m.conjunto, 'desenvolvimento'); assert.ok(m.pontuacao, m.arquivo); }
  // Depois das correções: nenhum erro grave no RH, na construtora e no fiscal.
  for (const a of ['rh-desenvolvimento-depois-das-correcoes.json', 'contratacao-desenvolvimento.json', 'fiscal-desenvolvimento.json']) {
    assert.equal(agora.find(m => m.arquivo === a)!.pontuacao!.errosGraves, 0, a);
  }
});

test('rótulos: estimativa de acerto só do reservado; construtora no desenvolvimento é prova de generalização', () => {
  assert.throws(() => rotulo('desenvolvimento', 'estimativa_de_acerto'), /só vem do conjunto reservado/);
  assert.throws(() => rotulo('reservado', 'desenvolvimento'), /estimativa de acerto/);
  assert.equal(rotulo('reservado', 'estimativa_de_acerto'), '[reservado · estimativa de acerto]');
  const ms = pontuarMedicoes();
  assert.ok(ms.filter(m => m.frente === 'contratacao').every(m => m.natureza === 'prova_de_generalizacao'));
  assert.ok(ms.every(m => (m.natureza as string) !== 'estimativa_de_acerto' && /desenvolvimento/.test(m.rotuloRelatorio)));
});

test('pontuação do corpus v2 gravada = matriz aplicada às medições, por tipo de nome', async () => {
  const gravada = JSON.parse(readFileSync(new URL('resultados/pontuacao-v2-desenvolvimento.json', AQUI), 'utf8'));
  const agora = await pontuarMedicoesV2();
  assert.deepEqual(gravada.medicoes, JSON.parse(JSON.stringify(agora)));
  for (const m of agora) {
    assert.ok(m.pontuacao && m.porNome, m.arquivo);
    assert.equal(m.porNome.generico.unidades + m.porNome.descritivo.unidades, m.pontuacao.unidades, m.arquivo);
  }
  for (const a of ['rh-v2-desenvolvimento.json', 'contratacao-v2-desenvolvimento.json', 'fiscal-v2-desenvolvimento.json', 'lgpd-v2-desenvolvimento.json']) {
    const m = agora.find(x => x.arquivo === a)!;
    assert.equal(m.porNome!.generico.errosGraves, 0, a);
    assert.equal(m.porNome!.descritivo.errosGraves, 0, a);
  }
});
