// Monta o app para testes, com banco de teste e configuração local.
import { buildApp, type Deps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { TestDb } from './helpers.ts';

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
  return buildApp({ config: testConfig(db, env), db: db.app, ...overrides } as Deps);
}
