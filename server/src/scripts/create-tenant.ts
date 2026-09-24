// Cria um tenant a partir de um arquivo JSON (implantação).
//   DATABASE_OWNER_URL=... node src/scripts/create-tenant.ts tenant.json
// Formato: ver newTenantSchema em src/platform/tenants.ts e o exemplo no README.
import { readFileSync } from 'node:fs';
import { createPool } from '../db/pool.ts';
import { createTenant } from '../platform/tenants.ts';

const file = process.argv[2];
const url = process.env.DATABASE_OWNER_URL;
if (!file || !url) {
  console.error('Uso: DATABASE_OWNER_URL=... node src/scripts/create-tenant.ts tenant.json');
  process.exit(1);
}
const db = createPool(url, 1);
try {
  const r = await createTenant(db, JSON.parse(readFileSync(file, 'utf8')));
  console.log(`Tenant criado: ${r.slug} (${r.id})`);
  for (const a of r.themeAdjustments) console.log('  cor ajustada para contraste: ' + a);
} catch (e) {
  console.error('Falhou: ' + (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
