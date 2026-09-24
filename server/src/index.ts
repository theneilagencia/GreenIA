// Ponto de entrada: lê a configuração, conecta e sobe o servidor.
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { buildApp } from './app.ts';
import { MemoryEmailSender, SmtpEmailSender } from './email/sender.ts';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
if (!config.SMTP_URL && config.NODE_ENV === 'production') throw new Error('SMTP_URL é obrigatório em produção');
const email = config.SMTP_URL ? new SmtpEmailSender(config.SMTP_URL, config.EMAIL_FROM) : new MemoryEmailSender();
const ownerDb = config.DATABASE_OWNER_URL ? createPool(config.DATABASE_OWNER_URL, 2) : undefined;
const app = await buildApp({ config, db, ownerDb, email });

const stop = async () => {
  await app.close();
  await db.end();
  await ownerDb?.end();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

await app.listen({ port: config.PORT, host: config.HOST });
