// Acesso ao banco. Toda consulta de dado de cliente passa por withTenant(), que
// abre uma transação e fixa o contexto usado pelas políticas de RLS.
import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string, max = 10): Db {
  return new pg.Pool({ connectionString: url, max });
}

export interface TenantContext {
  tenantId: string;
  userId?: string | null;
  areaIds?: string[];
  allAreas?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Roda `fn` numa transação com o contexto do tenant. Sem tenant válido, recusa.
export async function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(ctx.tenantId)) throw new Error('withTenant: tenantId inválido');
  if (ctx.userId && !UUID.test(ctx.userId)) throw new Error('withTenant: userId inválido');
  const areas = (ctx.areaIds || []).filter(a => UUID.test(a));
  const tx = await db.connect();
  try {
    await tx.query('begin');
    await tx.query(
      `select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true),
              set_config('app.area_ids', $3, true), set_config('app.all_areas', $4, true)`,
      [ctx.tenantId, ctx.userId || '', '{' + areas.join(',') + '}', ctx.allAreas ? 'on' : 'off'],
    );
    const out = await fn(tx);
    await tx.query('commit');
    return out;
  } catch (e) {
    await tx.query('rollback').catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
}

// Consulta sem contexto de tenant: só para as funções SECURITY DEFINER de
// antes do login (public_tenant, session_lookup, auth_flow_take).
export async function preAuth<T extends pg.QueryResultRow>(db: Db, sql: string, params: unknown[]): Promise<T[]> {
  if (!/^\s*select \* from (public_tenant|session_lookup|auth_flow_take)\(/i.test(sql)) {
    throw new Error('preAuth: só funções de antes do login');
  }
  const r = await db.query<T>(sql, params);
  return r.rows;
}
