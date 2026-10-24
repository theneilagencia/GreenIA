import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { lerPreservados } from '../scripts/qa-recuperar-visuais.mjs';
test('recuperação rejeita alteração no relatório ou binário antes de baixar código/exportar', () => {
  const raiz = mkdtempSync('/tmp/greenia-candidata-'), pasta = join(raiz, 'qa-candidato-saida/2026-10-18T00-00-00-000Z');
  const sha = b => createHash('sha256').update(b).digest('hex');
  try {
    mkdirSync(join(pasta, 'artefatos'), { recursive: true });
    const dados = Buffer.from('{"id":1}'); writeFileSync(join(pasta, 'artefatos/visual-1.json'), dados);
    const original = JSON.stringify({ artefatosPreservados: [{ arquivos: [{ arquivo: 'artefatos/visual-1.json', sha256: sha(dados), bytes: dados.length }] }] });
    writeFileSync(join(pasta, 'relatorio.json'), original);
    assert.throws(() => lerPreservados(pasta, '0'.repeat(64)), /Relatório diferente/);
    assert.equal(lerPreservados(pasta, sha(original)).grupos.length, 1);
    writeFileSync(join(pasta, 'artefatos/visual-1.json'), 'alterado');
    assert.throws(() => lerPreservados(pasta, sha(original)), /diverge/);
    assert.equal(readFileSync(join(pasta, 'relatorio.json'), 'utf8'), original);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});
