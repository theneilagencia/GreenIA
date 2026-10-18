import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

test('consulta pública importa por data URL e recusa relatório ou resposta alterados antes de acessar a rede', async () => {
  const codigo = readFileSync(new URL('../scripts/qa-fontes-publicas.mjs', import.meta.url));
  const { verificar } = await import('data:text/javascript;base64,' + codigo.toString('base64'));
  const raiz = mkdtempSync('/tmp/greenia-candidata-'), rodada = join(raiz, 'qa-candidato-saida/2026-10-18T21-48-41-817Z');
  const originalFetch = globalThis.fetch; let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; throw Error('não acessar a rede'); };
  try {
    mkdirSync(rodada, { recursive: true });
    const r = Buffer.from('{"classes":{}}'); writeFileSync(join(rodada, 'relatorio.json'), r);
    writeFileSync(join(rodada, 'classe-avancado-pesquisa.md'), 'Texto preservado');
    await assert.rejects(verificar('a'.repeat(40), { rodada: '/app/dados' }), /Pasta inválida/);
    await assert.rejects(verificar('a'.repeat(40), { rodada, hashAnterior: 'b'.repeat(64) }), /Relatório diferente/);
    await assert.rejects(verificar('a'.repeat(40), { rodada, hashAnterior: createHash('sha256').update(r).digest('hex'), hashResposta: 'c'.repeat(64) }), /Resposta diferente/);
    await assert.rejects(verificar('a'.repeat(40), { rodada, hashAnterior: createHash('sha256').update(r).digest('hex'), hashResposta: createHash('sha256').update('Texto preservado').digest('hex'), somente: ['https://outra.exemplo/fora'] }), /somente fontes do relatório/);
    assert.equal(chamadas, 0);
    assert.deepEqual(readFileSync(join(rodada, 'relatorio.json')), r);
  } finally { globalThis.fetch = originalFetch; rmSync(raiz, { recursive: true, force: true }); }
});
