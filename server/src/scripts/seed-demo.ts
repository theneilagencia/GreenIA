// Cria o tenant de demonstração com os quatro assistentes de referência.
//   DATABASE_OWNER_URL=... (e as variáveis do S3) node src/scripts/seed-demo.ts
//   node src/scripts/seed-demo.ts --amostras ./amostras   só grava as amostras fictícias em disco
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPool } from '../db/pool.ts';
import { loadConfig } from '../config.ts';
import { S3ObjectStore } from '../storage/object-store.ts';
import { seedDemo } from '../demo/seed.ts';
import { SAMPLES } from '../demo/samples.ts';

const i = process.argv.indexOf('--amostras');
if (i > 0) {
  const dir = process.argv[i + 1] || './amostras';
  for (const [slug, gen] of Object.entries(SAMPLES)) {
    mkdirSync(join(dir, slug), { recursive: true });
    for (const f of await gen()) writeFileSync(join(dir, slug, f.name), f.bytes);
  }
  console.log(`Amostras gravadas em ${dir}`);
} else {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) { console.error('Defina DATABASE_OWNER_URL.'); process.exit(1); }
  const config = loadConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_URL || url });
  const db = createPool(url, 2);
  try {
    const r = await seedDemo(db, new S3ObjectStore(config));
    console.log(`Tenant de demonstração criado: ${r.slug} (${r.tenantId}). Acesse pelo host demo.localhost.`);
  } catch (e) {
    console.error('Falhou: ' + (e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
