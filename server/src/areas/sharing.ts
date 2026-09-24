// Compartilhamento de assistentes e documentos da base: a área dona decide
// com quais outras áreas compartilhar, ou marca como de toda a empresa. A
// visibilidade é aplicada pela RLS (migração 016); aqui só se grava.
import { z } from 'zod';
import type { Tx } from '../db/pool.ts';
import { audit } from '../audit.ts';

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
// Áreas pelas quais a pessoa pode usar o assistente.
export async function eligibleRunAreas(tx: Tx, assistant: { id: string; area_id: string | null; company_wide: boolean }, userAreaIds: string[], allAreas: boolean): Promise<string[]> {
  const shared = (await tx.query(`select area_id from assistant_shares where assistant_id = $1`, [assistant.id])).rows.map(r => r.area_id as string);
  const mine = (id: string | null) => id === null || allAreas || userAreaIds.includes(id);
  const eligible = [assistant.area_id, ...shared].filter((id, i, arr) => id && arr.indexOf(id) === i && mine(id)) as string[];
  if (assistant.company_wide) for (const id of userAreaIds) if (!eligible.includes(id)) eligible.push(id);
  return eligible;
}

export async function runAreaFor(tx: Tx, assistant: { id: string; area_id: string | null; company_wide: boolean }, userAreaIds: string[], allAreas: boolean, requested?: string): Promise<string | null | undefined> {
  const eligible = await eligibleRunAreas(tx, assistant, userAreaIds, allAreas);
  if (requested) {
    const id = (await tx.query(`select id from areas where slug = $1`, [requested])).rows[0]?.id as string | undefined;
    return id && eligible.includes(id) ? id : undefined;                // undefined: área pedida não serve
  }
  return eligible[0] ?? assistant.area_id;
}

// ---- Compartilhamento com aprovação --------------------------------------------------------------
// Compartilhar um assistente ou documento com outra área (ou com a empresa toda)
// amplia o acesso ao que ele consulta; por isso só vale depois de aprovado pelo
// key user da área dona, ou pelo admin do cliente se a área não tiver key user.
// Quem aprova e pede ao mesmo tempo aplica direto; os outros (patrocinador,
// admin de área com key user, ampliação de quick win) deixam o pedido pendente.
// Retirar um compartilhamento reduz acesso e vale na hora.
export type ShareActor = { tenantId: string; userId: string; email: string; roles: string[] };
export interface ShareTarget { id: string; area_id: string | null; company_wide: boolean; label: string }

export async function shareTarget(tx: Tx, kind: Kind, ref: string): Promise<ShareTarget | null> {
  return (await tx.query(`select * from share_target($1, $2)`, [kind, ref])).rows[0] ?? null;
}

// Quem aprova: key users da área dona (com herança); sem key user, admin do cliente.
export async function canApproveShare(tx: Tx, a: ShareActor, ownerAreaId: string | null): Promise<boolean> {
  const keyUsers = ownerAreaId ? (await tx.query(`select area_key_users as id from area_key_users($1)`, [ownerAreaId])).rows.map(r => r.id as string) : [];
  if (keyUsers.length) return keyUsers.includes(a.userId);
  return a.roles.includes('admin_cliente') || a.roles.includes('admin_theneil');
}

export interface ShareOutcome { aplicados: string[]; pendentes: string[]; removidos: string[]; missing: string[] }

// Pede (ou aplica, se quem pede aprova) o compartilhamento com as áreas e, opcionalmente, com a empresa.
export async function requestShares(tx: Tx, a: ShareActor, kind: Kind, target: ShareTarget, areaIds: { id: string; slug: string }[], empresa: boolean, origin: string): Promise<{ aplicados: string[]; pendentes: string[] }> {
  const t = TABLES[kind];
  const approver = await canApproveShare(tx, a, target.area_id);
  const current = new Set((await tx.query(`select area_id from ${t.shares} where ${t.col} = $1`, [target.id])).rows.map(r => r.area_id as string));
  const wanted: { areaId: string | null; label: string }[] = areaIds.filter(x => x.id !== target.area_id && !current.has(x.id)).map(x => ({ areaId: x.id, label: x.slug }));
  if (empresa && !target.company_wide) wanted.push({ areaId: null, label: 'empresa' });
  const out = { aplicados: [] as string[], pendentes: [] as string[] };
  for (const w of wanted) {
    const pending = (await tx.query(
      `select id from share_requests where coalesce(assistant_id, document_id) = $1 and ((target_area_id = $2) or ($2::uuid is null and company_wide)) and status = 'pendente'`,
      [target.id, w.areaId])).rows[0];
    const id = pending?.id ?? (await tx.query(
      `insert into share_requests (tenant_id, kind, assistant_id, document_id, owner_area_id, target_area_id, company_wide, origin, requested_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [a.tenantId, kind, kind === 'assistente' ? target.id : null, kind === 'documento' ? target.id : null, target.area_id, w.areaId, w.areaId === null, origin, a.userId])).rows[0].id;
    const ref = `${kind}:${target.label}`;
    if (approver) {
      await tx.query(`update share_requests set status = 'aprovado', decided_by = $2, decided_at = now(), note = 'pedido e aprovado por quem responde pela área dona' where id = $1`, [id, a.userId]);
      await tx.query(`select share_apply($1)`, [id]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'compartilhamento_aprovado', target: ref, details: { destino: w.label, origem: origin, por: a.email, pedido: id } });
      out.aplicados.push(w.label);
    } else {
      if (!pending) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'compartilhamento_pedido', target: ref, details: { destino: w.label, origem: origin, por: a.email, pedido: id } });
      out.pendentes.push(w.label);
    }
  }
  return out;
}

// Troca o compartilhamento pelo conjunto pedido: tira na hora o que saiu; o que entrou segue a aprovação.
export async function changeShares(tx: Tx, a: ShareActor, kind: Kind, target: ShareTarget, input: ShareInput, origin: string, mayRemove: boolean): Promise<ShareOutcome | { error: string }> {
  const t = TABLES[kind];
  const slugs = [...new Set(input.areas)];
  const found = slugs.length ? (await tx.query(`select id, slug from areas where slug = any($1)`, [slugs])).rows as { id: string; slug: string }[] : [];
  const missing = slugs.filter(s => !found.some(f => f.slug === s));
  if (missing.length) return { aplicados: [], pendentes: [], removidos: [], missing };
  const current = (await tx.query(`select s.area_id, a.slug from ${t.shares} s join areas a on a.id = s.area_id where s.${t.col} = $1`, [target.id])).rows as { area_id: string; slug: string }[];
  const removing = current.filter(c => !found.some(f => f.id === c.area_id));
  const unsetEmpresa = target.company_wide && !input.empresa;
  if ((removing.length || unsetEmpresa) && !mayRemove) return { error: 'so_quem_administra_a_area_dona_retira' };
  for (const r of removing) await tx.query(`delete from ${t.shares} where ${t.col} = $1 and area_id = $2`, [target.id, r.area_id]);
  if (unsetEmpresa) await tx.query(`update ${t.owner} set company_wide = false where id = $1`, [target.id]);
  const removidos = [...removing.map(r => r.slug), ...(unsetEmpresa ? ['empresa'] : [])];
  if (removidos.length) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'compartilhamento_retirado', target: `${kind}:${target.label}`, details: { areas: removidos, por: a.email } });
  const r = await requestShares(tx, a, kind, target, found, input.empresa, origin);
  return { ...r, removidos, missing: [] };
}
