// Rodada administrativa única, sem iniciar servidor, IA, emails ou agendamentos.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { backupDaPlataforma } from '../src/iniciar.js';
import { lerChaveMestraExistente, impressaoMestra } from '../src/chave-recuperacao.js';
import { lerAjuste } from '../src/plataforma/db.js';
import { conferirBackups } from '../src/plataforma/backup-estado.js';
import { prazosDe } from '../src/retencao.js';
import { pathToFileURL } from 'node:url';

export async function executarBackupPlataforma(env = process.env) {
  const arquivo = resolve(env.BANCO_PLATAFORMA || '/app/dados/plataforma.sqlite');
  if (!existsSync(arquivo)) throw new Error('Banco existente da plataforma obrigatório');
  const raiz = realpathSync(dirname(arquivo));
  const mestra = lerChaveMestraExistente({ env, arquivo: join(raiz, '.chave-mestra') });
  if (!mestra || mestra.length !== 32) throw new Error('Chave-mestra existente obrigatória');
  const db = new DatabaseSync(arquivo), tenants = new Map();
  try {
    db.exec('PRAGMA busy_timeout=5000');
    const registrada = lerAjuste(db, 'chave_mestra_impressao', null)?.impressao;
    if (!registrada || registrada !== impressaoMestra(mestra)) throw new Error('Chave-mestra divergente');
    const empresas = db.prepare('SELECT id,banco FROM companies ORDER BY id').all();
    // Valida todos antes de copiar: jamais cria banco ausente ou abre caminho externo.
    for (const c of empresas) {
      if (!existsSync(c.banco)) throw new Error('Banco de empresa ausente');
      const real = realpathSync(c.banco), rel = relative(raiz, real);
      if (!rel || rel.startsWith('..') || rel.startsWith('/')) throw new Error('Banco de empresa fora da pasta');
    }
    for (const c of empresas) tenants.set(c.id, { db: new DatabaseSync(c.banco, { readOnly: true }) });
    const P = { db, tenants, agora: () => new Date(), log: console.log, mestra: () => mestra };
    const pasta = env.BACKUP_PASTA || join(raiz, 'backups');
    const r = await backupDaPlataforma(P, { pasta, env, destino: env.BACKUP_DESTINO || '', manter: Number(env.BACKUP_MANTER || 7), limiteDias: prazosDe(env).automaticoDias });
    const c = conferirBackups(P, { pasta, ativo: true, s3: !!env.BACKUP_DESTINO });
    console.log('BACKUP_ADMINISTRATIVO', JSON.stringify({ ...r, problemas: c.problemas.length }));
    return { ...r, problemas: c.problemas.length };
  } finally { for (const t of tenants.values()) t.db.close(); db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const r = await executarBackupPlataforma(); process.exitCode = r.falhas || r.s3Bloqueados || r.problemas ? 1 : 0; }
  catch (e) { console.error('Backup administrativo interrompido:', e.code || e.message); process.exitCode = 1; }
}
