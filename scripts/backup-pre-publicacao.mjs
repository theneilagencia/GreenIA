// Cópias consistentes compactadas. A candidata só inicia após verificar todas as cópias persistidas.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, statSync, statfsSync, copyFileSync, rmSync, readFileSync, writeFileSync, createReadStream, createWriteStream } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const RESERVA = 16 * 1024 * 1024;
async function sha256(arquivo) {
  const h = createHash('sha256');
  for await (const bloco of createReadStream(arquivo)) h.update(bloco);
  return h.digest('hex');
}
function conferir(arquivo) {
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try { if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Cópia não íntegra'); }
  finally { db.close(); }
}
export async function backupPrePublicacao(env = process.env, { espaco = statfsSync, temporarios = tmpdir() } = {}) {
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
  const publicacao = /^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT || '') ? env.RENDER_GIT_COMMIT : null;
  const fixo = publicacao ? join(raiz, 'backups-publicacao', publicacao) : null;
  if (fixo && existsSync(fixo)) {
    // Snapshot anterior à primeira inicialização desta versão, não um novo backup diário.
    const m = JSON.parse(readFileSync(join(fixo, 'manifesto.json'), 'utf8'));
    if (m.publicacao !== publicacao || m.formato !== 'sqlite.gz' || m.copias.length !== bancos.size ||
        new Set(m.copias.map(c => c.origem)).size !== bancos.size) throw new Error('Manifesto anterior inválido');
    for (const c of m.copias) {
      if (!bancos.has(c.origem) || !/^banco-\d+\.sqlite\.gz$/.test(c.copia) || await sha256(join(fixo, c.copia)) !== c.sha256) throw new Error('Backup anterior divergente');
    }
    console.log('BACKUP_PRE_PUBLICACAO_REUTILIZADO', m.copias.length, 'bancos', fixo);
    return { destino: fixo, copias: m.copias, reutilizado: true };
  }
  const livre = pasta => { const fs = espaco(pasta); return fs.bavail * fs.bsize; };
  const trabalho = mkdtempSync(join(temporarios, 'greenia-backup-publicacao-'));
  let destino, concluido = false;
  try {
    const copias = [];
    for (const arquivo of bancos) {
      const tamanho = statSync(arquivo).size + (existsSync(arquivo + '-wal') ? statSync(arquivo + '-wal').size : 0);
      if (livre(trabalho) < tamanho * 2 + RESERVA) throw new Error('Espaço temporário insuficiente para verificar a cópia pré-publicação');
      const nome = `banco-${copias.length}.sqlite.gz`, bruto = join(trabalho, 'copia.sqlite'), gz = join(trabalho, nome);
      const db = new DatabaseSync(arquivo, { readOnly: true });
      try { db.prepare('VACUUM INTO ?').run(bruto); } finally { db.close(); }
      conferir(bruto);
      const sha256Banco = await sha256(bruto);
      await pipeline(createReadStream(bruto), createGzip({ level: 9 }), createWriteStream(gz, { flags: 'wx', mode: 0o600 }));
      rmSync(bruto);
      await pipeline(createReadStream(gz), createGunzip(), createWriteStream(bruto, { flags: 'wx', mode: 0o600 }));
      if (await sha256(bruto) !== sha256Banco) throw new Error('Compactação não preservou o banco');
      conferir(bruto);
      rmSync(bruto);
      copias.push({ origem: arquivo, copia: nome, formato: 'sqlite.gz', bytes: statSync(gz).size, sha256: await sha256(gz), sha256Banco });
    }
    const necessarios = copias.reduce((s, c) => s + c.bytes, 0), disponiveis = livre(raiz);
    if (disponiveis < necessarios + RESERVA) throw new Error(`Espaço persistente insuficiente: disponíveis=${disponiveis}, cópias compactadas=${necessarios}, reserva=${RESERVA}`);
    const novo = fixo || join(raiz, 'backups-publicacao', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
    mkdirSync(dirname(novo), { recursive: true, mode: 0o700 });
    mkdirSync(novo, { mode: 0o700 });
    destino = novo;
    for (const c of copias) {
      copyFileSync(join(trabalho, c.copia), join(destino, c.copia));
      if (await sha256(join(destino, c.copia)) !== c.sha256) throw new Error('Cópia persistida divergente');
    }
    writeFileSync(join(destino, 'manifesto.json'), JSON.stringify({ publicacao, anterior: '3cbef4b9b78292edfec62dbfb7b1b333b1675a74', formato: 'sqlite.gz', reservaBytes: RESERVA, copias }, null, 2), { mode: 0o600, flag: 'wx' });
    concluido = true;
    console.log('BACKUP_PRE_PUBLICACAO_OK', copias.length, 'bancos', necessarios, 'bytes compactados', destino);
    return { destino, copias };
  } finally {
    // Remove apenas arquivos desta tentativa incompleta; nunca backups anteriores ou bancos originais.
    if (destino && !concluido) rmSync(destino, { recursive: true, force: true });
    rmSync(trabalho, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) await backupPrePublicacao();
