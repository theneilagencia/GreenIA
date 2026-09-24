// Aplica as migrações de server/migrations/ em ordem, uma vez cada, com o papel
// dono das tabelas (DATABASE_OWNER_URL). Se APP_DB_USER e APP_DB_PASSWORD
// estiverem definidos, cria ou atualiza o papel de login do servidor como membro
// de greenia_app (sem BYPASSRLS). Depois, publica as versões novas do catálogo
// de modelos (server/catalog/).
//   node src/db/migrate.ts
// Uma migração pode ter a volta em migrations/down/ com o mesmo nome:
//   node src/db/migrate.ts --down 022_remove_medicao_por_assistente.sql
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { syncCatalog } from '../catalog/catalog.ts';

const DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

// upTo: aplica só até esta migração, inclusive (testes de reconciliação).
export async function migrate(ownerUrl: string, opts: { appUser?: string; appPassword?: string; log?: (m: string) => void; upTo?: string } = {}) {
  const log = opts.log || (() => {});
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    // Um migrador por vez.
    await client.query('select pg_advisory_lock(727274)');
    const done = new Set((await client.query('select name from schema_migrations')).rows.map(r => r.name));
    const files = readdirSync(DIR).filter(f => /^\d{3}_[\w-]+\.sql$/.test(f)).sort().filter(f => !opts.upTo || f.slice(0, 3) <= opts.upTo.slice(0, 3));
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
    // Catálogo de modelos da TheNeil: publica as versões novas dos arquivos.
    await syncCatalog(client, { log });
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

// Desfaz uma migração que tenha volta (migrations/down/<nome>), só se ela for a última aplicada.
export async function migrateDown(ownerUrl: string, name: string, log: (m: string) => void = () => {}) {
  if (!/^\d{3}_[\w-]+\.sql$/.test(name)) throw new Error('nome de migração inválido');
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock(727274)');
    const last = (await client.query('select name from schema_migrations order by name desc limit 1')).rows[0]?.name;
    if (last !== name) throw new Error(`só a última migração aplicada volta (a última é ${last})`);
    const sql = readFileSync(DIR + 'down/' + name, 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('delete from schema_migrations where name = $1', [name]);
      await client.query('commit');
      log('migração desfeita: ' + name);
    } catch (e) {
      await client.query('rollback');
      throw new Error(`volta da migração ${name} falhou: ${(e as Error).message}`);
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
  const down = process.argv.indexOf('--down');
  if (down > 0) {
    migrateDown(url, process.argv[down + 1] ?? '', m => console.log(m)).catch(e => { console.error(e.message); process.exit(1); });
  } else migrate(url, { appUser: process.env.APP_DB_USER, appPassword: process.env.APP_DB_PASSWORD, log: m => console.log(m) })
    .then(() => console.log('Migrações em dia.'))
    .catch(e => { console.error(e.message); process.exit(1); });
}
