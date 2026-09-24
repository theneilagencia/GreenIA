// Pedidos de compartilhamento: quem aprova vê os pendentes das áreas pelas
// quais responde (key user da área dona; sem key user, admin do cliente) e
// aprova ou recusa, com a decisão na auditoria. Quem pediu acompanha os seus.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { audit } from '../audit.ts';
import { canApproveShare } from './sharing.ts';

export async function shareRequestRoutes(app: FastifyInstance) {
  app.get('/api/admin/share-requests', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = z.object({ status: z.enum(['pendente', 'aprovado', 'recusado']).default('pendente') }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const rows = (await tx.query(
        `select r.*, t.label, ow.name as owner_area, ta.name as target_area, u.email as requested_by_email, d.email as decided_by_email
         from share_requests r
         cross join lateral share_target(r.kind, case when r.kind = 'assistente' then (select slug from assistants where id = r.assistant_id) else r.document_id::text end) t
         left join areas ow on ow.id = r.owner_area_id left join areas ta on ta.id = r.target_area_id
         left join users u on u.id = r.requested_by left join users d on d.id = r.decided_by
         where r.status = $1 order by r.requested_at`, [q.data.status])).rows;
      const out = [];
      for (const r of rows) {
        const podeAprovar = r.status === 'pendente' && await canApproveShare(tx, a, r.owner_area_id);
        if (!podeAprovar && r.requested_by !== a.userId && !a.allAreas) continue;
        out.push({ id: r.id, tipo: r.kind, recurso: r.label, areaDona: r.owner_area ?? 'empresa', destino: r.company_wide ? 'empresa toda' : r.target_area,
          origem: r.origin, situacao: r.status, pedidoPor: r.requested_by_email, pedidoEm: r.requested_at, decididoPor: r.decided_by_email, nota: r.note, podeAprovar });
      }
      return out;
    });
  });

  for (const [path, status, action] of [['aprovar', 'aprovado', 'compartilhamento_aprovado'], ['recusar', 'recusado', 'compartilhamento_recusado']] as const) {
    app.post(`/api/admin/share-requests/:id/${path}`, async (req, reply) => {
      const a = requireAuth(req, reply);
      if (!a) return;
      const { id } = req.params as { id: string };
      const p = z.object({ nota: z.string().trim().max(2000).default('') }).safeParse(req.body ?? {});
      if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
      if (status === 'recusado' && p.data.nota.length < 3) return reply.code(400).send({ error: 'dados_invalidos', detalhe: 'diga o motivo da recusa' });
      const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        const r = (await tx.query(`select * from share_requests where id = $1 for update`, [id])).rows[0];
        if (!r) return { status: 404, body: { error: 'nao_encontrado' } };
        if (r.status !== 'pendente') return { status: 409, body: { error: 'pedido_ja_decidido', situacao: r.status } };
        if (!(await canApproveShare(tx, a, r.owner_area_id))) return { status: 403, body: { error: 'so_key_user_da_area_dona', detalhe: 'aprova o key user da área dona; sem key user, o admin do cliente' } };
        await tx.query(`update share_requests set status = $2, decided_by = $3, decided_at = now(), note = nullif($4, '') where id = $1`, [id, status, a.userId, p.data.nota]);
        if (status === 'aprovado') await tx.query(`select share_apply($1)`, [id]);
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action, target: `${r.kind}:${r.assistant_id ?? r.document_id}`,
          details: { pedido: id, destino: r.company_wide ? 'empresa' : r.target_area_id, por: a.email, nota: p.data.nota || null } });
        return { status: 200, body: { id, situacao: status } };
      });
      return reply.code(out.status).send(out.body);
    });
  }
}
