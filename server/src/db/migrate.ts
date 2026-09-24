// Aplica as migrações de server/migrations/ em ordem, uma vez cada, com o papel
// dono das tabelas (DATABASE_OWNER_URL). Se APP_DB_USER e APP_DB_PASSWORD
// estiverem definidos, cria ou atualiza o papel de login do servidor como membro
// de greenia_app (sem BYPASSRLS).
//   node src/db/migrate.ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function migrate(ownerUrl: string, opts: { appUser?: string; appPassword?: string; log?: (m: string) => void } = {}) {
  const log = opts.log || (() => {});
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    // Um migrador por vez.
    await client.query('select pg_advisory_lock(727274)');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map(r => r.name));
    const files = readdirSync(DIR).filter(f => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(DIR + f, 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
        log('migração aplicada: ' + f);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`migração ${f} falhou: ${(e as Error).message}`);
      }
    }
    if (opts.appUser && opts.appPassword) {
      if (!/^[a-z_][a-z0-9_]{2,40}$/.test(opts.appUser)) throw new Error('APP_DB_USER inválido');
      const exists = (await client.query('select 1 from pg_roles where rolname = $1', [opts.appUser])).rowCount;
      const pw = (await client.query('select quote_literal($1) as q', [opts.appPassword])).rows[0].q;
      await client.query(`${exists ? 'alter' : 'create'} role ${opts.appUser} login password ${pw}`);
      await client.query(`grant greenia_app to ${opts.appUser}`);
      log('papel do servidor pronto: ' + opts.appUser);
    }
    await client.query('select pg_advisory_unlock(727274)');
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error('Defina DATABASE_OWNER_URL.');
    process.exit(1);
  }
  migrate(url, { appUser: process.env.APP_DB_USER, appPassword: process.env.APP_DB_PASSWORD, log: m => console.log(m) })
    .then(() => console.log('Migrações em dia.'))
    .catch(e => { console.error(e.message); process.exit(1); });
}
