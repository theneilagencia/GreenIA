// Backup manual: node scripts/backup.js  (usa BANCO, BACKUP_PASTA, BACKUP_DESTINO, BACKUP_MANTER)
// Pode rodar com o servidor no ar.
import { abrirBanco } from '../src/db.js';
import { fazerBackup } from '../src/backup.js';

const env = process.env;
const db = abrirBanco(env.BANCO || 'dados/greenia.sqlite');
const r = await fazerBackup(db, { pasta: env.BACKUP_PASTA || 'dados/backups', destino: env.BACKUP_DESTINO, manter: Number(env.BACKUP_MANTER || 14) });
db.close();
console.log(`Backup feito: ${r.local} (${(r.tamanho / 1024).toFixed(0)} KB)${r.remoto ? `\nEnviado para: ${r.remoto}` : ''}`);
