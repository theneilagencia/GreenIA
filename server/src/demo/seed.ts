// Tenant de demonstração com os quatro assistentes de referência, criados só a
// partir de configuração (server/deploy/demo): nenhum código específico por
// assistente. Também indexa os documentos fictícios da base (área LGPD).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/pool.ts';
import type { ObjectStore } from '../storage/object-store.ts';
import { tenantPrefix } from '../storage/object-store.ts';
import { createTenant } from '../platform/tenants.ts';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { makeIndexer } from '../kb/indexer.ts';

export const DEMO_DIR = fileURLToPath(new URL('../../deploy/demo/', import.meta.url));

export interface AssistantFile { slug: string; name: string; area: string; status: string; definition: unknown }

export function demoAssistants(dir = DEMO_DIR): AssistantFile[] {
  return readdirSync(join(dir, 'assistentes')).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(readFileSync(join(dir, 'assistentes', f), 'utf8')) as AssistantFile);
}

export async function seedDemo(owner: Db, objects: ObjectStore, dir = DEMO_DIR) {
  const tenantJson = JSON.parse(readFileSync(join(dir, 'tenant-demo.json'), 'utf8'));
  const t = await createTenant(owner, tenantJson);
  const admin = (await owner.query(`select id from users where tenant_id = $1 and email = $2`, [t.id, tenantJson.admins[0]])).rows[0].id as string;
  const client = await owner.connect();
  try {
    await client.query('begin');
    for (const a of demoAssistants(dir)) {
      const def = assistantDefinitionSchema.parse(a.definition);            // mesma validação do painel
      const areaId = (await client.query(`select id from areas where tenant_id = $1 and slug = $2`, [t.id, a.area])).rows[0]?.id;
      if (!areaId) throw new Error(`área ${a.area} do assistente ${a.slug} não existe`);
      const id = (await client.query(`insert into assistants (tenant_id, slug, name, area_id, status) values ($1, $2, $3, $4, $5) returning id`,
        [t.id, a.slug, a.name, areaId, a.status])).rows[0].id;
      await client.query(`insert into assistant_versions (tenant_id, assistant_id, version, definition, created_by) values ($1, $2, 1, $3, $4)`, [t.id, id, def, admin]);
      await client.query(`insert into audit_log (tenant_id, actor_user_id, action, target) values ($1, $2, 'assistente_criado', $3)`, [t.id, admin, `assistente:${a.slug}@1`]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  // Base de conhecimento da área LGPD (Markdown fictício).
  const lgpd = (await owner.query(`select id from areas where tenant_id = $1 and slug = 'lgpd'`, [t.id])).rows[0].id;
  const index = makeIndexer(owner, objects);
  for (const f of readdirSync(join(dir, 'base')).filter(x => x.endsWith('.md')).sort()) {
    const text = readFileSync(join(dir, 'base', f), 'utf8');
    const title = text.match(/^#\s+(.+)$/m)?.[1] ?? f.replace(/\.md$/, '');
    const bytes = new TextEncoder().encode(text);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const doc = (await owner.query(`insert into kb_documents (tenant_id, area_id, title, created_by) values ($1, $2, $3, $4) returning id`, [t.id, lgpd, title, admin])).rows[0].id;
    const key = `${tenantPrefix(t.id)}kb/${doc}/v1/${sha}`;
    await objects.put(key, bytes, 'text/markdown');
    await owner.query(`insert into kb_document_versions (tenant_id, document_id, version, object_key, sha256, mime, bytes, created_by) values ($1, $2, 1, $3, $4, 'text/markdown', $5, $6)`,
      [t.id, doc, key, sha, bytes.length, admin]);
    await index({ tenantId: t.id, documentId: doc, version: 1 });
  }
  return { tenantId: t.id as string, slug: t.slug };
}
