// Backup e restauração. O backup é uma cópia consistente do banco (VACUUM INTO,
// funciona com o servidor no ar), compactada com gzip. Vai para uma pasta local
// e, se BACKUP_DESTINO for s3://bucket/prefixo, também para um armazenamento
// compatível com S3 (AWS, Cloudflare R2, Backblaze B2, MinIO, Magalu Cloud...).
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { registrar } from './eventos.js';
import { configS3, enviarBackupS3, baixarBackupS3, decifrarBackup, ehCifrado, chaveCifraDe, ErroBackup } from './backup-s3.js';

export { assinarS3, ErroBackup } from './backup-s3.js';
const sha256 = d => createHash('sha256').update(d).digest('hex');
const LIMITE_S3_PADRAO = 7;   // dias: prazo dos backups automáticos (docs/politica-retencao.md)

// Faz o backup. Devolve o caminho local e, se houver, a URL no S3.
export const carimboDe = agora => agora.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
export function fazerBackupLocal(db, { pasta = 'dados/backups', manter = 14, agora = new Date() } = {}) {
  mkdirSync(pasta, { recursive: true });
  const carimbo = carimboDe(agora);
  const nome = `greenia-${carimbo}.sqlite.gz`;
  const temp = join(pasta, `.${nome}.tmp`);
  rmSync(temp, { force: true });
  db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`);
  const gz = gzipSync(readFileSync(temp), { level: 9 });
  rmSync(temp);
  const local = join(pasta, nome);
  writeFileSync(local, gz);
  // Retenção local: fica com os mais recentes.
  const antigos = readdirSync(pasta).filter(f => /^greenia-\d{8}-\d{6}\.sqlite\.gz$/.test(f)).sort().reverse().slice(Math.max(1, manter));
  for (const f of antigos) rmSync(join(pasta, f));
  return { local, tamanho: gz.length, nome, carimbo, sha256: sha256(gz) };
}

// Backup local e, com BACKUP_DESTINO=s3://..., cópia cifrada no S3 (src/backup-s3.js).
// `banco`: identificador do banco no nome do objeto (plataforma, emp_..., greenia). `verificacao`: cache da
// conferência do ciclo de vida do bucket, compartilhado pela rodada. Se o S3 falhar depois do backup local, o erro
// leva `local` (o backup local existe) e `etapa: 's3'`.
export async function fazerBackup(db, { pasta = 'dados/backups', destino = '', manter = 14, agora = new Date(), env = process.env, banco = 'greenia', verificacao = {}, limiteDias, mestra = null, fetch: f } = {}) {
  const b = fazerBackupLocal(db, { pasta, manter, agora });
  let remoto = null;
  try {
    const cfg = configS3(destino, env, { mestra });
    if (cfg) remoto = await enviarBackupS3(cfg, { banco, carimbo: b.carimbo, gz: readFileSync(b.local), criadoEm: agora.toISOString(), limiteDias: limiteDias ?? limiteS3(env), verificacao }, f);
  } catch (e) { e.local = b.local; e.etapa = 's3'; e.backup = b; throw e; }
  return { local: b.local, tamanho: b.tamanho, sha256: b.sha256, carimbo: b.carimbo, remoto: remoto?.url || null, s3: remoto };
}
// O S3 não pode guardar por mais tempo que a retenção dos backups automáticos.
export const limiteS3 = env => { const n = Number(env?.RETENCAO_AUTOMATICO_DIAS); return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : LIMITE_S3_PADRAO; };

// Confere se um arquivo SQLite está íntegro e é um banco da GreenIA.
export function conferir(arquivo, { tipo = 'empresa' } = {}) {
  if (!['empresa', 'plataforma'].includes(tipo)) throw new Error('Tipo de banco inválido: use empresa ou plataforma.');
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const r = db.prepare('pragma integrity_check').get();
    if (Object.values(r)[0] !== 'ok') throw new Error('O arquivo de backup está corrompido: ' + Object.values(r)[0]);
    const tabelas = tipo === 'plataforma' ? ['companies', 'plans', 'users', 'company_users', 'roles', 'role_permissions', 'platform_settings', 'audit_log'] : ['config', 'pessoas', 'eventos', 'conversas'];
    for (const t of tabelas) {
      if (!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(t)) throw new Error(`O arquivo não é um banco da GreenIA do tipo ${tipo} (falta a tabela ${t}).`);
    }
    if (db.prepare('pragma foreign_key_check').all().length) throw new Error('O backup contém referências inconsistentes entre registros.');
    if (tipo === 'plataforma') return { tipo, empresas: db.prepare('select count(*) as n from companies').get().n, usuarios: db.prepare('select count(*) as n from users').get().n, eventos: db.prepare('select count(*) as n from audit_log').get().n };
    return { tipo, pessoas: db.prepare('select count(*) as n from pessoas').get().n, eventos: db.prepare('select count(*) as n from eventos').get().n };
  } finally { db.close(); }
}

// Restaura um backup (arquivo local .gz ou s3://bucket/caminho). Com o servidor parado.
// O banco atual não é apagado: fica ao lado, com o sufixo .antes-da-restauracao.
export async function restaurar(origem, banco, { env = process.env, tipo = 'empresa', fetch: f } = {}) {
  let gz;
  if (origem.startsWith('s3://')) {
    const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(origem);
    if (!m) throw new ErroBackup('S3_ORIGEM', 'Origem S3 inválida: use s3://bucket/caminho/do/objeto.');
    const cfg = configS3(`s3://${m[1]}`, env);
    gz = (await baixarBackupS3(cfg, m[2], f)).gz;
  } else {
    gz = readFileSync(origem);
    if (ehCifrado(gz)) gz = decifrarBackup(chaveCifraDe(env), gz).dados;   // cópia baixada do S3 (.enc)
  }
  mkdirSync(dirname(banco), { recursive: true });
  const temp = `${banco}.restaurando`;
  writeFileSync(temp, gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz);   // aceita .gz ou .sqlite
  let resumo;
  try { resumo = conferir(temp, { tipo }); } catch (e) { rmSync(temp, { force: true }); throw e; }
  let anterior = null;
  if (existsSync(banco) && statSync(banco).size > 0) {
    anterior = `${banco}.antes-da-restauracao`; renameSync(banco, anterior);
    // Manifesto: a cópia anterior expira no prazo de backup manual da política de retenção (src/retencao.js).
    writeFileSync(`${anterior}.json`, JSON.stringify({ tipo: 'antes-da-restauracao', criado_em: new Date().toISOString(), origem: basename(origem) }, null, 2) + '\n');
  }
  for (const s of ['-wal', '-shm']) rmSync(banco + s, { force: true });
  renameSync(temp, banco);
  return { ...resumo, anterior };
}

// Backup automático uma vez por dia, na hora marcada (HH:MM, horário do servidor).
export function agendarBackup(app, { hora, ...op }) {
  if (!/^\d{2}:\d{2}$/.test(hora || '')) return null;
  let ultimo = '';
  const t = setInterval(() => {
    const agora = new Date();
    const hhmm = agora.toTimeString().slice(0, 5);
    const dia = agora.toDateString();
    if (hhmm !== hora || ultimo === dia) return;
    ultimo = dia;
    fazerBackup(app.db, op)
      .then(r => { app.log(`backup feito: ${r.local}${r.remoto ? ' e ' + r.remoto : ''}; sha256 ${r.sha256}`); registrar(app, 'backup.completed', null, { tamanho: r.tamanho, sha256: r.sha256, remoto: !!r.remoto }); })
      .catch(e => { app.log('backup falhou', e.code || '', e.message); registrar(app, 'backup.failed', null, { codigo: e.code || 'erro', etapa: e.etapa || 'local', erro: e.message }); });
  }, 30e3);
  t.unref();
  return t;
}
