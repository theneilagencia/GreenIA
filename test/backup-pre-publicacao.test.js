import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { backupPrePublicacao } from '../scripts/backup-pre-publicacao.mjs';

test('cópias compactadas são restauráveis e preservam originais e backups anteriores', async () => {
  const pasta = mkdtempSync('/tmp/backup-publicacao-');
  try {
    const banco = join(pasta, 'plataforma.sqlite'), empresa = join(pasta, 'empresa.sqlite');
    const a = new DatabaseSync(banco), b = new DatabaseSync(empresa);
    a.exec('CREATE TABLE companies(banco TEXT)'); a.prepare('INSERT INTO companies VALUES (?)').run(empresa); a.close();
    b.exec("CREATE TABLE exemplo(valor TEXT); INSERT INTO exemplo VALUES ('dado fictício preservado')"); b.close();
    const original = readFileSync(empresa);
    mkdirSync(join(pasta, 'backups')); writeFileSync(join(pasta, 'backups', 'anterior.gz'), 'backup anterior intocável');
    const env = { BANCO_PLATAFORMA: banco, BANCO: empresa, RENDER_GIT_COMMIT: 'a'.repeat(40) };
    const r = await backupPrePublicacao(env);
    assert.equal(r.copias.length, 2); assert.deepEqual(readFileSync(empresa), original);
    assert.equal(readFileSync(join(pasta, 'backups', 'anterior.gz'), 'utf8'), 'backup anterior intocável');
    const recuperado = join(pasta, 'restaurado.sqlite');
    writeFileSync(recuperado, gunzipSync(readFileSync(join(r.destino, r.copias.find(c => c.origem === empresa).copia))));
    const copia = new DatabaseSync(recuperado, { readOnly: true });
    assert.equal(copia.prepare('SELECT valor FROM exemplo').get().valor, 'dado fictício preservado'); copia.close();
    const manifesto = JSON.parse(readFileSync(join(r.destino, 'manifesto.json')));
    assert.equal(manifesto.formato, 'sqlite.gz'); assert.equal(manifesto.copias.length, 2);
    const repetido = await backupPrePublicacao(env);
    assert.equal(repetido.destino, r.destino); assert.equal(repetido.reutilizado, true);
    assert.equal(readdirSync(join(pasta, 'backups-publicacao')).length, 1);
    writeFileSync(join(r.destino, r.copias[0].copia), 'cópia adulterada');
    await assert.rejects(backupPrePublicacao(env), /Backup anterior divergente/);
    await assert.rejects(backupPrePublicacao({ BANCO_PLATAFORMA: join(pasta, 'ausente.sqlite') }), /ausente/);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('disco persistente insuficiente bloqueia publicação sem deixar cópias incompletas', async () => {
  const pasta = mkdtempSync('/tmp/backup-sem-espaco-'), temp = mkdtempSync('/tmp/staging-publicacao-');
  try {
    const banco = join(pasta, 'plataforma.sqlite'), a = new DatabaseSync(banco);
    a.exec('CREATE TABLE companies(banco TEXT)'); a.close();
    const original = readFileSync(banco);
    const env = { BANCO_PLATAFORMA: banco, BANCO: banco };
    await assert.rejects(backupPrePublicacao(env, { temporarios: temp, espaco: p => ({ bavail: p === pasta ? 0 : 1024 ** 3, bsize: 1 }) }), /Espaço persistente insuficiente/);
    assert.deepEqual(readFileSync(banco), original);
    assert.equal(readdirSync(temp).length, 0);
    assert.equal(readdirSync(pasta).includes('backups-publicacao'), false);
    await assert.rejects(backupPrePublicacao(env, { temporarios: temp, espaco: () => ({ bavail: 0, bsize: 1 }) }), /Espaço temporário insuficiente/);
    assert.equal(readdirSync(temp).length, 0);
  } finally { rmSync(pasta, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true }); }
});

test('publicações sucessivas retêm dois conjuntos verificados sem tocar em desconhecidos e holds', async () => {
  const pasta = mkdtempSync('/tmp/retencao-publicacao-');
  try {
    const banco = join(pasta, 'plataforma.sqlite'), db = new DatabaseSync(banco);
    db.exec('CREATE TABLE companies(banco TEXT)'); db.close();
    const env = { BANCO_PLATAFORMA: banco, BANCO: banco };
    for (const letra of ['a', 'b', 'c']) await backupPrePublicacao({ ...env, RENDER_GIT_COMMIT: letra.repeat(40) });
    const raiz = join(pasta, 'backups-publicacao');
    assert.equal(readdirSync(raiz).length, 2);
    assert.ok(readdirSync(raiz).includes('c'.repeat(40)));
    const salvo = readdirSync(raiz).find(n => n !== 'c'.repeat(40));
    writeFileSync(join(raiz, salvo, 'HOLD.json'), '{}');
    mkdirSync(join(raiz, 'desconhecido'));writeFileSync(join(raiz, 'desconhecido', 'nao-apagar'), 'preservado');
    for (const letra of ['d', 'e']) await backupPrePublicacao({ ...env, RENDER_GIT_COMMIT: letra.repeat(40) });
    assert.equal(readdirSync(raiz).length, 4); // dois elegíveis + hold + desconhecido
    assert.equal(readFileSync(join(raiz, 'desconhecido', 'nao-apagar'), 'utf8'), 'preservado');
    assert.ok(readdirSync(raiz).includes(salvo));
    const { limparPublicacoes } = await import('../scripts/backup-pre-publicacao.mjs');
    const antes = readdirSync(raiz).sort();
    await limparPublicacoes(raiz, { atual: 'f'.repeat(40) });
    assert.deepEqual(readdirSync(raiz).sort(), antes);
    await assert.rejects(limparPublicacoes(raiz, { atual: 'e'.repeat(40), manter: 1 }), /inválida/);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
