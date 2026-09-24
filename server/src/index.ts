// Ponto de entrada: lê a configuração, conecta e sobe o servidor.
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { buildApp } from './app.ts';
import { MemoryEmailSender, SmtpEmailSender } from './email/sender.ts';
import { AnthropicProvider, FakeProvider, type LlmProvider } from './llm/provider.ts';

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
const app = await buildApp({ config, db, ownerDb, email, llm });

const stop = async () => {
  await app.close();
  await db.end();
  await ownerDb?.end();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

await app.listen({ port: config.PORT, host: config.HOST });
