// Rota pública de configuração do tenant, e resolução do tenant pelo endereço.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { preAuth } from '../db/pool.ts';
import { publicConfig } from './config.ts';

export interface PublicTenantRow {
  id: string; slug: string; name: string; status: string; config: unknown; providers: unknown;
}

// Tenant pelo host (produção: repet.greenia.theneil.com.br) ou pelo parâmetro
// ?tenant=slug, aceito só fora de produção (local e testes): em produção, o host
// de um cliente não pode abrir o login de outro. Só tenants ativos.
export async function resolveTenant(app: FastifyInstance, req: FastifyRequest): Promise<PublicTenantRow | null> {
  const q = req.query as Record<string, unknown> | undefined;
  const slug = app.deps.config.NODE_ENV !== 'production' && typeof q?.tenant === 'string' ? q.tenant : '';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  const rows = await preAuth<PublicTenantRow>(app.deps.db, 'select * from public_tenant($1, $2)', [host, slug]);
  return rows[0] || null;
}

export async function tenantRoutes(app: FastifyInstance) {
  app.get('/api/tenant/config', async (req, reply) => {
    const t = await resolveTenant(app, req);
    if (!t) return reply.code(404).send({ error: 'tenant_nao_encontrado' });
    return publicConfig(t);
  });
}
