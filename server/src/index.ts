// Ponto de entrada: lê a configuração, conecta e sobe o servidor.
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { buildApp } from './app.ts';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
const app = await buildApp({ config, db });

const stop = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

await app.listen({ port: config.PORT, host: config.HOST });
