// Catálogo de modelos da TheNeil (server/catalog/): modelos de assistente e
// conjuntos iniciais de áreas, versionados e sem ligação com cliente. Os
// arquivos são a fonte; o migrador publica no banco cada versão nova
// (catalog_templates). Versão já publicada não muda: conteúdo diferente com o
// mesmo número de versão é erro, para ninguém alterar em silêncio o que um
// cliente já usou.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { readerById } from '../readers/registry.ts';

export const CATALOG_DIR = fileURLToPath(new URL('../../catalog/', import.meta.url));

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/);

export const assistantTemplateSchema = z.object({
  kind: z.literal('assistente'),
  slug,
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(600).default(''),
  areaSugerida: z.string().max(200).default(''),             // só texto de orientação: nenhuma área é criada por isso
  leitores: z.array(z.string()).default([]).refine(ids => ids.every(id => !!readerById(id)), 'leitor desconhecido'),
  definition: z.unknown().superRefine((d, ctx) => {
    const r = assistantDefinitionSchema.safeParse(d);
    if (!r.success) for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: i.path.map(String), message: i.message });
  }),
});

export const areasTemplateSchema = z.object({
  kind: z.literal('areas'),
  slug,
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(600).default(''),
  areas: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/).optional(),
    description: z.string().max(1000).default(''),
    parent: z.string().optional(),                             // slug de uma área declarada antes
  })).min(1).max(100),
});

export const templateSchema = z.discriminatedUnion('kind', [assistantTemplateSchema, areasTemplateSchema]);
export type Template = z.infer<typeof templateSchema>;
export type AssistantTemplate = z.infer<typeof assistantTemplateSchema>;
export type AreasTemplate = z.infer<typeof areasTemplateSchema>;

export const contentSha = (t: Template) => createHash('sha256').update(JSON.stringify(t)).digest('hex');

export function loadCatalogFiles(dir = CATALOG_DIR): Template[] {
  const out: Template[] = [];
  for (const sub of ['modelos', 'areas']) {
    let files: string[] = [];
    try { files = readdirSync(join(dir, sub)).filter(f => f.endsWith('.json')).sort(); } catch { continue; }
    for (const f of files) {
      const r = templateSchema.safeParse(JSON.parse(readFileSync(join(dir, sub, f), 'utf8')));
      if (!r.success) throw new Error(`catálogo ${sub}/${f}: ${r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      out.push(r.data);
    }
  }
  return out;
}

interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }> }

// Publica no banco as versões novas dos arquivos (conexão do dono).
export async function syncCatalog(db: Queryable, opts: { dir?: string; by?: string; log?: (m: string) => void } = {}) {
  const published: string[] = [];
  for (const t of loadCatalogFiles(opts.dir)) {
    const sha = contentSha(t);
    const same = (await db.query(`select content_sha256 from catalog_templates where kind = $1 and slug = $2 and version = $3`, [t.kind, t.slug, t.version])).rows[0];
    if (same) {
      if (same.content_sha256 !== sha) throw new Error(`catálogo: ${t.kind} ${t.slug} v${t.version} mudou sem mudar a versão`);
      continue;
    }
    const latest = (await db.query(`select max(version) as v from catalog_templates where kind = $1 and slug = $2`, [t.kind, t.slug])).rows[0].v;
    if (latest !== null && Number(latest) > t.version) continue;
    await db.query(`insert into catalog_templates (kind, slug, version, name, description, content, content_sha256, published_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [t.kind, t.slug, t.version, t.name, t.description, t, sha, opts.by ?? 'arquivos do catálogo']);
    published.push(`${t.kind}:${t.slug}@${t.version}`);
    opts.log?.(`catálogo publicado: ${t.kind} ${t.slug} v${t.version}`);
  }
  return published;
}

export async function latestTemplates(db: Queryable, kind: Template['kind']) {
  return (await db.query(
    `select distinct on (slug) slug, version, name, description, content, published_at from catalog_templates where kind = $1 order by slug, version desc`, [kind])).rows;
}

export async function getTemplate(db: Queryable, kind: Template['kind'], s: string, version?: number): Promise<Template | null> {
  const r = (await db.query(
    `select content from catalog_templates where kind = $1 and slug = $2 and ($3::int is null or version = $3) order by version desc limit 1`, [kind, s, version ?? null])).rows[0];
  return r ? templateSchema.parse(r.content) : null;
}
