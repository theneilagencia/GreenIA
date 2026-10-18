import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupPrePublicacao } from '../scripts/backup-pre-publicacao.mjs';
test('cópias consistentes preservam plataforma e banco de empresa antes de publicar', () => {
  const pasta = mkdtempSync('/tmp/backup-publicacao-'); const log = console.log;
  try {
    const banco = join(pasta, 'plataforma.sqlite'), empresa = join(pasta, 'empresa.sqlite');
    const a = new DatabaseSync(banco), b = new DatabaseSync(empresa);
    a.exec('CREATE TABLE companies(banco TEXT)'); a.prepare('INSERT INTO companies VALUES (?)').run(empresa); a.close();
    b.exec("CREATE TABLE exemplo(valor TEXT); INSERT INTO exemplo VALUES ('dado fictício preservado')"); b.close();
    const original = readFileSync(empresa); console.log = () => {};
    const r = backupPrePublicacao({ BANCO_PLATAFORMA: banco, BANCO: empresa });
    assert.equal(r.copias.length, 2); assert.deepEqual(readFileSync(empresa), original);
    const copia = new DatabaseSync(join(r.destino, r.copias.find(c => c.origem === empresa).copia), { readOnly: true });
    assert.equal(copia.prepare('SELECT valor FROM exemplo').get().valor, 'dado fictício preservado'); copia.close();
    assert.throws(() => backupPrePublicacao({ BANCO_PLATAFORMA: join(pasta, 'ausente.sqlite') }), /ausente/);
  } finally { console.log = log; rmSync(pasta, { recursive: true, force: true }); }
});
