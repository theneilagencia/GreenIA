import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { carregarVerificado } from '../scripts/qa-proxima-etapa.mjs';
test('orquestrador recusa módulo alterado antes de executá-lo e só baixa commit imutável', async () => {
  const s = 'export const ficticio = true;', h = createHash('sha256').update(s).digest('hex');
  let consultas = 0;
  const obter = async (url, op) => { consultas++; assert.ok(url.includes('a'.repeat(40))); assert.equal(op.redirect, 'error'); return new Response(s); };
  await assert.rejects(carregarVerificado('main', 'qa-ficticio.mjs', h, obter), /Referência/);
  assert.equal(consultas, 0);
  await assert.rejects(carregarVerificado('a'.repeat(40), 'qa-ficticio.mjs', '0'.repeat(64), obter), /diferente/);
  assert.equal((await carregarVerificado('a'.repeat(40), 'qa-ficticio.mjs', h, obter)).ficticio, true);
});
