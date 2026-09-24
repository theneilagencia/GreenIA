// Apoio aos testes: banco novo por execução, migrado com um dono que NÃO é
// superusuário (superusuário ignora RLS e esconderia falhas de isolamento), e
// conexão do servidor com o papel greenia_srv_test (membro de greenia_app).
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { migrate } from '../src/db/migrate.ts';
import { createPool, type Db } from '../src/db/pool.ts';

const ADMIN = process.env.TEST_PG_ADMIN_URL || 'postgres://postgres@localhost:5432/postgres';
const OWNER_ROLE = 'greenia_owner_test';
const APP_ROLE = 'greenia_srv_test';
const PASS = 'teste-local';

export interface TestDb {
  name: string;
  ownerUrl: string;
  appUrl: string;
  app: Db;     // conexão com RLS (como o servidor)
  owner: Db;   // conexão do dono (para preparar dados)
  drop(): Promise<void>;
}

function withDb(url: string, db: string) {
  const u = new URL(url);
  u.pathname = '/' + db;
  return u.toString();
}

function withUser(url: string, user: string, password: string) {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

export async function createTestDb(): Promise<TestDb> {
  const name = 'greenia_test_' + randomBytes(4).toString('hex');
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  try {
    await admin.query(`do $$ begin
      create role ${OWNER_ROLE} login createrole nosuperuser password '${PASS}';
    exception when duplicate_object then null; end $$`);
    await admin.query(`create database ${name} owner ${OWNER_ROLE}`);
  } finally {
    await admin.end();
  }
  // Extensões exigem superusuário; em produção (RDS), o usuário mestre as cria.
  const adminDb = new pg.Client({ connectionString: withDb(ADMIN, name) });
  await adminDb.connect();
  await adminDb.query('create extension if not exists pgcrypto; create extension if not exists vector;');
  await adminDb.end();

  const ownerUrl = withUser(withDb(ADMIN, name), OWNER_ROLE, PASS);
  await migrate(ownerUrl, { appUser: APP_ROLE, appPassword: PASS });
  const appUrl = withUser(withDb(ADMIN, name), APP_ROLE, PASS);
  const app = createPool(appUrl, 5);
  const owner = createPool(ownerUrl, 3);
  return {
    name, ownerUrl, appUrl, app, owner,
    async drop() {
      await app.end();
      await owner.end();
      const a = new pg.Client({ connectionString: ADMIN });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

// Cria um tenant com um usuário, direto pelo dono (sem passar pela API).
export async function seedTenant(owner: Db, slug: string, opts: { email?: string; role?: string; domain?: string } = {}) {
  const t = (await owner.query(`insert into tenants (slug, name) values ($1, $2) returning id`, [slug, 'Tenant ' + slug])).rows[0];
  const email = opts.email || `pessoa@${slug}.com.br`;
  const u = (await owner.query(`insert into users (tenant_id, email, name) values ($1, $2, $3) returning id`, [t.id, email, 'Pessoa ' + slug])).rows[0];
  await owner.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)`, [t.id, u.id, opts.role || 'usuario']);
  await owner.query(`insert into tenant_domains (tenant_id, domain) values ($1, $2)`, [t.id, opts.domain || `${slug}.com.br`]);
  return { tenantId: t.id as string, userId: u.id as string, email };
}
