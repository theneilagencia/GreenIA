import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { fazerBackupLocal } from '../src/backup.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const agora = new Date('2026-10-21T06:00:00Z');
const nome = 'greenia-20261021-060000.sqlite.gz';
const antigo = 'greenia-20261020-060000.sqlite.gz';

test('ENOSPC no gzip parcial preserva a cópia anterior, limpa estágio e permite repetir', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'backup-gzip-enospc-'));
  const db = new DatabaseSync(':memory:');
  const escrever = fs.writeFileSync;
  try {
    db.exec('create table dados (valor); insert into dados values (42)');
    writeFileSync(join(pasta, nome), 'cópia anterior');
    writeFileSync(join(pasta, antigo), 'histórico');
    fs.writeFileSync = (p, d, ...args) => {
      if (p === join(pasta, `.${nome}.gz.tmp`)) {
        escrever(p, d.subarray(0, 3));
        throw Object.assign(new Error('sem espaço'), { code: 'ENOSPC' });
      }
      return escrever(p, d, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => fazerBackupLocal(db, { pasta, agora, manter: 1 }), { code: 'ENOSPC' });
    assert.deepEqual(readdirSync(pasta).sort(), [antigo, nome].sort());
    assert.equal(readFileSync(join(pasta, nome), 'utf8'), 'cópia anterior');
    fs.writeFileSync = escrever;
    syncBuiltinESMExports();
    fazerBackupLocal(db, { pasta, agora, manter: 1 });
    assert.deepEqual(readdirSync(pasta), [nome]);
    assert.match(gunzipSync(readFileSync(join(pasta, nome))).subarray(0, 16).toString(), /^SQLite format 3/);
  } finally {
    fs.writeFileSync = escrever;
    syncBuiltinESMExports();
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('falha do VACUUM limpa o bruto parcial e preserva as cópias e sua retenção', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'backup-falha-'));
  try {
    writeFileSync(join(pasta, nome), 'cópia anterior');
    writeFileSync(join(pasta, antigo), 'histórico');
    const db = { exec() {
      writeFileSync(join(pasta, `.${nome}.tmp`), Buffer.alloc(1024 * 1024));
      throw Object.assign(new Error('sem espaço'), { code: 'ENOSPC' });
    } };
    assert.throws(() => fazerBackupLocal(db, { pasta, agora, manter: 1 }), { code: 'ENOSPC' });
    assert.deepEqual(readdirSync(pasta).sort(), [antigo, nome].sort());
    assert.equal(readFileSync(join(pasta, nome), 'utf8'), 'cópia anterior');
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('falha na publicação do gzip remove ambos os temporários e não aplica retenção', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'backup-publicar-'));
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('create table dados (valor); insert into dados values (42)');
    mkdirSync(join(pasta, nome)); // destino obstruído: rename real deve falhar
    writeFileSync(join(pasta, antigo), 'histórico');
    assert.throws(() => fazerBackupLocal(db, { pasta, agora, manter: 1 }));
    assert.deepEqual(readdirSync(pasta).sort(), [antigo, nome].sort());
    assert.equal(readFileSync(join(pasta, antigo), 'utf8'), 'histórico');
  } finally { db.close(); rmSync(pasta, { recursive: true, force: true }); }
});

test('backup publicado é SQLite legível, substitui a mesma rodada e aplica retenção', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'backup-sucesso-'));
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('create table dados (valor); insert into dados values (42)');
    writeFileSync(join(pasta, antigo), 'histórico');
    writeFileSync(join(pasta, nome), 'cópia anterior');
    const r = fazerBackupLocal(db, { pasta, agora, manter: 1 });
    assert.deepEqual(readdirSync(pasta), [nome]);
    const restaurado = join(pasta, 'restaurado.sqlite');
    writeFileSync(restaurado, gunzipSync(readFileSync(r.local)));
    const copia = new DatabaseSync(restaurado, { readOnly: true });
    try {
      assert.equal(copia.prepare('pragma integrity_check').get().integrity_check, 'ok');
      assert.equal(copia.prepare('select valor from dados').get().valor, 42);
    } finally { copia.close(); }
  } finally { db.close(); rmSync(pasta, { recursive: true, force: true }); }
});
