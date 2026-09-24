// Configuração do servidor, lida das variáveis de ambiente e validada na partida.
// Nada de segredo em código: chaves e senhas vêm do ambiente (ou do cofre de
// segredos que alimenta o ambiente, em produção).
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform(v => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  // URL pública do app (usada nos redirects do login e na checagem de Origin).
  PUBLIC_URL: z.url().default('http://localhost:8080'),

  // Conexão do servidor: papel membro de greenia_app, sem BYPASSRLS.
  DATABASE_URL: z.string().min(1),
  // Conexão do dono das tabelas: só migrações e rotinas da plataforma.
  DATABASE_OWNER_URL: z.string().min(1).optional(),
  // Se definidos, o migrador cria (ou atualiza) o papel de login do servidor.
  APP_DB_USER: z.string().optional(),
  APP_DB_PASSWORD: z.string().optional(),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Armazenamento de objetos compatível com S3 (AWS S3 em sa-east-1, MinIO local).
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('sa-east-1'),
  S3_BUCKET: z.string().default('greenia-documentos'),
  S3_FORCE_PATH_STYLE: bool.default(false),
  S3_SSE: z.enum(['AES256', 'aws:kms', 'none']).default('AES256'),
  S3_KMS_KEY_ID: z.string().optional(),

  // Email (SMTP; em produção, Amazon SES em sa-east-1 via SMTP).
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('GreenIA <nao-responda@greenia.local>'),

  // Provedores de modelo. As chaves ficam aqui, nunca no frontend.
  ANTHROPIC_API_KEY: z.string().optional(),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  COOKIE_SECURE: bool.default(true),
  // Segredos dos provedores OIDC: config do tenant guarda só o nome da variável.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const msg = r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error('Configuração inválida: ' + msg);
  }
  return r.data;
}

// Segredo referenciado pela configuração do tenant (ex.: "OIDC_REPET_ENTRA_SECRET").
export function secretFromEnv(name: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!name || !/^[A-Z][A-Z0-9_]{2,80}$/.test(name)) return undefined;
  return env[name];
}
