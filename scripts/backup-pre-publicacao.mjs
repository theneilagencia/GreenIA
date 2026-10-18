// Cópia consistente local, antes de abrir/migrar bancos. Falha impede iniciar a candidata.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, statSync, statfsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export function backupPrePublicacao(env = process.env) {
  const plataforma = resolve(env.BANCO_PLATAFORMA || '/app/dados/plataforma.sqlite');
  if (!existsSync(plataforma)) throw new Error('Banco da plataforma ausente; publicação controlada interrompida');
  const raiz = dirname(plataforma), bancos = new Set([plataforma]);
  const p = new DatabaseSync(plataforma, { readOnly: true });
  try { for (const c of p.prepare('SELECT banco FROM companies').all()) {
    const arquivo = resolve(c.banco), rel = relative(raiz, arquivo);
    if (rel.startsWith('..') || !existsSync(arquivo)) throw new Error('Banco de empresa fora da pasta ou indisponível');
    bancos.add(arquivo);
  } } finally { p.close(); }
  const legado = resolve(env.BANCO || '/app/dados/greenia.sqlite'); if (existsSync(legado)) bancos.add(legado);
  const fs = statfsSync(raiz), necessarios = [...bancos].reduce((s, a) => s + statSync(a).size + (existsSync(a + '-wal') ? statSync(a + '-wal').size : 0), 0);
  if (fs.bavail * fs.bsize < Math.max(16 * 1024 * 1024, necessarios * 2)) throw new Error('Espaço insuficiente para cópia pré-publicação');
  const destino = join(raiz, 'backups-publicacao', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
  mkdirSync(destino, { recursive: true, mode: 0o700 });
  const copias = [];
  for (const arquivo of bancos) {
    const nome = `banco-${copias.length}.sqlite`, db = new DatabaseSync(arquivo, { readOnly: true });
    try { db.prepare('VACUUM INTO ?').run(join(destino, nome)); } finally { db.close(); }
    const conferir = new DatabaseSync(join(destino, nome), { readOnly: true });
    try { if (conferir.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Cópia não íntegra'); } finally { conferir.close(); }
    const bytes = readFileSync(join(destino, nome));
    copias.push({ origem: arquivo, copia: nome, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  writeFileSync(join(destino, 'manifesto.json'), JSON.stringify({ anterior: '9d4780fcffe6b506fa0b2dc03b6a89b099d67bf8', copias }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log('BACKUP_PRE_PUBLICACAO_OK', copias.length, 'bancos', destino);
  return { destino, copias };
}
if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) backupPrePublicacao();
