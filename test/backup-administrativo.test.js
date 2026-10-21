import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { criarPlataforma } from '../src/plataforma/servidor.js';
import { executarBackupPlataforma } from '../scripts/backup-plataforma.mjs';
import { lerEstado } from '../src/plataforma/backup-estado.js';

test('rodada administrativa usa banco e chave existentes, registra auditoria e não inicia servidor', async () => {
  const raiz = mkdtempSync('/tmp/backup-administrativo-');
  const banco = join(raiz, 'plataforma.sqlite');
  const P = criarPlataforma({ banco, log: () => {} });
  try {
    const r = await executarBackupPlataforma({ BANCO_PLATAFORMA: banco });
    assert.equal(r.total, 1);assert.equal(r.falhas, 0);assert.equal(r.problemas, 0);
    assert.equal(lerEstado(P).rodada.total, 1);assert.ok(P.db.prepare("SELECT 1 FROM audit_log WHERE action='backup.completed'").get());
    assert.equal(P.servidor.listening, false);
    await assert.rejects(executarBackupPlataforma({ BANCO_PLATAFORMA: banco, CHAVE_MESTRA: 'outra-chave' }), /divergente/);
    const ausente = join(raiz, 'ausente.sqlite');
    await assert.rejects(executarBackupPlataforma({ BANCO_PLATAFORMA: ausente }), /obrigatório/);
    assert.equal(existsSync(ausente), false);
  } finally { P.db.close();rmSync(raiz, { recursive: true, force: true }); }
});
