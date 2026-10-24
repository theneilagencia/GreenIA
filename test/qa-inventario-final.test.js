import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconciliar, inspecionar, SELOS } from '../scripts/qa-inventario-final.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const recibo = (geracao, custo) => ({ geracao, custo, modeloResposta: 'modelo-ficticio' });
test('histórico não duplica rodadas, gerações nem totais aninhados', () => {
  const a = { sha256: 'a', recibos: [recibo('gen-1', .1)], pendenciasAnteriores: { custoTotalUsd: 999 } };
  const b = { sha256: 'b', recibos: [recibo('gen-1', .1), recibo('gen-2', .2)] };
  const r = reconciliar([a, a, b], new Set(['a', 'b']));
  assert.equal(r.geracoesUnicas, 2); assert.equal(r.rodadasUnicas, 2);
  assert.ok(Math.abs(r.totalHistoricoUsd - .3) < 1e-12);
});
test('custos ausentes, negativos, sem ID ou rodadas faltantes impedem total', () => {
  for (const recibos of [[recibo('gen-1', null)], [recibo('gen-1', -1)], [recibo(null, 0)], [{ geracao: 'gen-1', custo: .2 }]]) {
    assert.equal(reconciliar([{ sha256: 'a', recibos }], new Set(['a'])).totalHistoricoUsd, null);
  }
  assert.equal(reconciliar([{ sha256: 'a', recibos: [] }], new Set(['a', 'b'])).totalHistoricoUsd, null);
});
test('recibos conflitantes não entram no subtotal; zero explícito é válido', () => {
  const r = reconciliar([{ sha256: 'a', recibos: [recibo('gen-1', .1), recibo('gen-1', .2), recibo('gen-2', 0)] }], new Set(['a']));
  assert.equal(r.conflitos.length, 1); assert.equal(r.subtotalRecibosUsd, 0); assert.equal(r.totalHistoricoUsd, null);
});
test('recibo comprovado posterior resolve ausência pelo mesmo ID e modelo', () => {
  const r = reconciliar([{ sha256: 'a', recibos: [recibo('gen-1', null)] }, { sha256: 'b', recibos: [recibo('gen-1', .3)] }], new Set(['a', 'b']));
  assert.equal(r.totalHistoricoUsd, .3); assert.equal(r.pendentes.length, 0);
});
test('inventário preserva bytes sintéticos, recusa links e não altera o original', () => {
  const raiz = mkdtempSync('/tmp/greenia-candidata-'), p = join(raiz, 'qa-candidato-saida/2026-10-18T00-00-00-000Z');
  let destino, selo; const log = console.log;
  try {
    mkdirSync(join(p, 'artefatos'), { recursive: true });
    const dados = Buffer.from('artefato fictício'), sha = b => createHash('sha256').update(b).digest('hex');
    writeFileSync(join(p, 'artefatos/teste.txt'), dados);
    symlinkSync(join(p, 'artefatos/teste.txt'), join(p, 'artefatos/link.txt'));
    const original = JSON.stringify({ recibos: [], artefatosPreservados: [{ caso: 'ficticio', arquivos: [
      { arquivo: 'artefatos/teste.txt', bytes: dados.length, sha256: sha(dados), mime: 'text/plain' },
      { arquivo: 'artefatos/link.txt', bytes: dados.length, sha256: sha(dados) },
    ] }] });
    writeFileSync(join(p, 'relatorio.json'), original); selo = sha(original); SELOS.add(selo);
    console.log = () => {};
    const r = inspecionar(); destino = r.pastaParaTransferir;
    const rodada = r.rodadas.find(x => x.sha256 === selo);
    assert.equal(rodada.arquivos[0].integridade, 'confere'); assert.equal(rodada.arquivos[1].integridade, 'falhou');
    assert.deepEqual(readFileSync(join(destino, selo.slice(0, 12), 'artefatos/teste.txt')), dados);
    assert.equal(readFileSync(join(p, 'relatorio.json'), 'utf8'), original);
    assert.equal(r.novasInferencias, 0); assert.equal(r.bancoAcessado, false); assert.equal(r.liberacaoProducao, false);
  } finally { console.log = log; SELOS.delete(selo); rmSync(raiz, { recursive: true, force: true }); if (destino) rmSync(destino, { recursive: true, force: true }); }
});
