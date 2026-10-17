// Backup manual: node scripts/backup.js  (usa BANCO, BACKUP_PASTA, BACKUP_DESTINO, BACKUP_MANTER)
// Pode rodar com o servidor no ar. Com BACKUP_DESTINO, o envio ao S3 só acontece se a regra de expiração do bucket
// for conferida no próprio bucket (src/backup.js, conferirExpiracaoS3).
import { existsSync } from 'node:fs';
import { abrirBanco } from '../src/db.js';
import { fazerBackup } from '../src/backup.js';

const env = process.env;
const arquivo = env.BANCO || 'dados/greenia.sqlite';
// No serviço errado (ex.: o receptor greenia-backup) não há banco: não cria um vazio, explica onde rodar.
if (!existsSync(arquivo)) { console.log(`Não há banco da GreenIA aqui (${arquivo}). Rode este comando no Shell do serviço greenia.`); process.exit(1); }
const db = abrirBanco(arquivo);
const r = await fazerBackup(db, { pasta: env.BACKUP_PASTA || 'dados/backups', destino: env.BACKUP_DESTINO, manter: Number(env.BACKUP_MANTER || 14) });
db.close();
console.log(`Backup feito: ${r.local} (${(r.tamanho / 1024).toFixed(0)} KB)${r.remoto ? `\nEnviado para: ${r.remoto}` : ''}${r.s3Bloqueado ? `\nNão enviado ao S3: ${r.s3Bloqueado}` : ''}`);
