// Ponto de entrada: lê a configuração, conecta e sobe o servidor.
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { buildApp } from './app.ts';
import { MemoryEmailSender, SmtpEmailSender } from './email/sender.ts';
import { AnthropicProvider, FakeProvider, type LlmProvider } from './llm/provider.ts';
import { S3ObjectStore } from './storage/object-store.ts';
import { BullJobQueue } from './jobs/queue.ts';
import { KeywordKnowledgeSource } from './kb/knowledge.ts';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
if (!config.SMTP_URL && config.NODE_ENV === 'production') throw new Error('SMTP_URL é obrigatório em produção');
const email = config.SMTP_URL ? new SmtpEmailSender(config.SMTP_URL, config.EMAIL_FROM) : new MemoryEmailSender();
const ownerDb = config.DATABASE_OWNER_URL ? createPool(config.DATABASE_OWNER_URL, 2) : undefined;
if (!config.ANTHROPIC_API_KEY && config.NODE_ENV === 'production') throw new Error('ANTHROPIC_API_KEY é obrigatório em produção');
const providers: Record<string, LlmProvider> = {
  anthropic: config.ANTHROPIC_API_KEY ? new AnthropicProvider(config.ANTHROPIC_API_KEY) : new FakeProvider(),
};
const llm = (id: string) => {
  const p = providers[id];
  if (!p) throw new Error('provedor de modelo desconhecido: ' + id);
  return p;
};
const queue = new BullJobQueue(config.REDIS_URL);
const app = await buildApp({
  config, db, ownerDb, email, llm, queue,
  objects: new S3ObjectStore(config),
  knowledge: new KeywordKnowledgeSource(),
});
// Este processo também processa a fila. Em escala, pode rodar um processo só de fila.
queue.startWorker();
await queue.repeat('retention:sweep', 60 * 60 * 1000); // de hora em hora

const stop = async () => {
  await app.close();
  await queue.close();
  await db.end();
  await ownerDb?.end();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

await app.listen({ port: config.PORT, host: config.HOST });
