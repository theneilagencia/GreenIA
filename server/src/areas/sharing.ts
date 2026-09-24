// Compartilhamento de assistentes e documentos da base: a área dona decide
// com quais outras áreas compartilhar, ou marca como de toda a empresa. A
// visibilidade é aplicada pela RLS (migração 016); aqui só se grava.
import { z } from 'zod';
import type { Tx } from '../db/pool.ts';

export const shareSchema = z.object({
  areas: z.array(z.string().max(60)).max(200).default([]),   // slugs das áreas com quem compartilhar
  empresa: z.boolean().default(false),                       // toda a empresa
});
export type ShareInput = z.infer<typeof shareSchema>;

type Kind = 'assistente' | 'documento';
const TABLES: Record<Kind, { shares: string; col: string; owner: string }> = {
  assistente: { shares: 'assistant_shares', col: 'assistant_id', owner: 'assistants' },
  documento: { shares: 'kb_document_shares', col: 'document_id', owner: 'kb_documents' },
};

// Troca o compartilhamento. Devolve as áreas não encontradas (nada é gravado se houver).
export async function setShares(tx: Tx, kind: Kind, tenantId: string, objectId: string, input: ShareInput): Promise<{ missing: string[] }> {
  const t = TABLES[kind];
  const slugs = [...new Set(input.areas)];
  const found = slugs.length ? (await tx.query(`select id, slug from areas where slug = any($1)`, [slugs])).rows as { id: string; slug: string }[] : [];
  const missing = slugs.filter(s => !found.some(f => f.slug === s));
  if (missing.length) return { missing };
  await tx.query(`delete from ${t.shares} where ${t.col} = $1`, [objectId]);
  for (const f of found) await tx.query(`insert into ${t.shares} (tenant_id, ${t.col}, area_id) values ($1, $2, $3) on conflict do nothing`, [tenantId, objectId, f.id]);
  await tx.query(`update ${t.owner} set company_wide = $2 where id = $1`, [objectId, input.empresa]);
  return { missing: [] };
}

export async function sharesOf(tx: Tx, kind: Kind, objectId: string): Promise<{ areas: string[]; empresa: boolean }> {
  const t = TABLES[kind];
  const areas = (await tx.query(`select a.slug from ${t.shares} s join areas a on a.id = s.area_id where s.${t.col} = $1 order by a.slug`, [objectId])).rows.map(r => r.slug as string);
  const empresa = !!(await tx.query(`select company_wide from ${t.owner} where id = $1`, [objectId])).rows[0]?.company_wide;
  return { areas, empresa };
}

// Área em que uma execução acontece: a pedida (se a pessoa usa o assistente por
// ela), senão a dona, senão a primeira área compartilhada da pessoa; para
// assistente da empresa, a primeira área da pessoa. A revisão segue essa área.
export async function runAreaFor(tx: Tx, assistant: { id: string; area_id: string | null; company_wide: boolean }, userAreaIds: string[], allAreas: boolean, requested?: string): Promise<string | null | undefined> {
  const shared = (await tx.query(`select area_id from assistant_shares where assistant_id = $1`, [assistant.id])).rows.map(r => r.area_id as string);
  const mine = (id: string | null) => id === null || allAreas || userAreaIds.includes(id);
  const eligible = [assistant.area_id, ...shared].filter((id, i, arr) => id && arr.indexOf(id) === i && mine(id)) as string[];
  if (assistant.company_wide) for (const id of userAreaIds) if (!eligible.includes(id)) eligible.push(id);
  if (requested) {
    const id = (await tx.query(`select id from areas where slug = $1`, [requested])).rows[0]?.id as string | undefined;
    return id && eligible.includes(id) ? id : undefined;                // undefined: área pedida não serve
  }
  return eligible[0] ?? assistant.area_id;
}
