// Monta o app para testes, com banco de teste e configuração local.
import { buildApp, type Deps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { TestDb } from './helpers.ts';
import { MemoryEmailSender } from '../src/email/sender.ts';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../src/auth/session.ts';

export function testConfig(db: TestDb, extra: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: db.appUrl,
    DATABASE_OWNER_URL: db.ownerUrl,
    PUBLIC_URL: 'https://greenia.test',
    LOG_LEVEL: 'silent',
    ...extra,
  });
}

export async function buildTestApp(db: TestDb, overrides: Partial<Deps> = {}, env: Record<string, string> = {}) {
  return buildApp({ config: testConfig(db, env), db: db.app, ownerDb: db.owner, email: new MemoryEmailSender(), ...overrides } as Deps);
}

// Abre uma sessão direto no banco (atalho para testes que não são de login).
// Devolve os cabeçalhos prontos para uma requisição autenticada que altera estado.
export async function loginAs(db: TestDb, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const u = (await db.owner.query(`select tenant_id from users where id = $1`, [userId])).rows[0];
  await db.owner.query(
    `insert into sessions (tenant_id, user_id, token_hash, csrf_token, expires_at) values ($1, $2, $3, $4, now() + interval '1 hour')`,
    [u.tenant_id, userId, hashToken(token), csrf]);
  const cookie = '__Host-gia_session=' + token;
  return { cookie, csrf, headers: { cookie, 'x-csrf-token': csrf, origin: 'https://greenia.test' } };
}

// Cria uma pessoa com papel no tenant (e na área, se informada).
export async function addPerson(db: TestDb, tenantId: string, email: string, role: string, areaSlug?: string) {
  const u = (await db.owner.query(`insert into users (tenant_id, email, name) values ($1, $2, $2) returning id`, [tenantId, email])).rows[0];
  const areaId = areaSlug ? (await db.owner.query(`select id from areas where tenant_id = $1 and slug = $2`, [tenantId, areaSlug])).rows[0].id : null;
  await db.owner.query(`insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, $4)`, [tenantId, u.id, areaId, role]);
  return u.id as string;
}
