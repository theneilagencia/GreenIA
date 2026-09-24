// Registro de auditoria. Nunca grava conteúdo de mensagens nem valores de dados
// sensíveis: só quem, quando, o quê e metadados (tipos detectados, ids, versões).
import type { Tx } from './db/pool.ts';

export interface AuditEvent {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  target?: string | null;
  details?: Record<string, unknown>;
}

export async function audit(tx: Tx, e: AuditEvent) {
  await tx.query(
    `insert into audit_log (tenant_id, actor_user_id, action, target, details) values ($1, $2, $3, $4, $5)`,
    [e.tenantId, e.actorUserId || null, e.action, e.target || null, e.details || {}],
  );
}
