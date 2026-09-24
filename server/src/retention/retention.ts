// Retenção: grava a saída de assistentes que exigem evidência, com prazo, e
// apaga o que venceu. Conversa livre nunca é gravada.
import { createHash } from 'node:crypto';
import type { Db } from '../db/pool.ts';
import { withTenant } from '../db/pool.ts';
import { tenantCtx } from '../auth/session.ts';
import type { ChatStep } from '../chat/hooks.ts';
import type { AssistantDefinition } from '../assistants/schema.ts';
import type { KnowledgeHit } from '../kb/knowledge.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const retentionStep: ChatStep = {
  name: 'retencao',
  async completed({ app, auth, config, model, outputText }, state) {
    const a = state.assistant;
    const def = a?.definition as AssistantDefinition | undefined;
    if (!a || !def?.retention.keepOutputs) return; // chat livre ou assistente sem evidência: nada gravado
    const days = def.retention.days ?? config.retention.defaultOutputDays;
    const hits = (state.kbHits as KnowledgeHit[] | undefined) || [];
    await withTenant(app.deps.db, tenantCtx(auth), tx => tx.query(
      `insert into outputs (tenant_id, user_id, assistant_id, assistant_version, area_id, content, sources, input_sha256, output_sha256, model, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + make_interval(days => $11))`,
      [auth.tenantId, auth.userId, a.id, a.version, a.areaId, outputText,
        JSON.stringify(hits.map(h => ({ documento: h.documentId, versao: h.version }))),
        sha(JSON.stringify(state.messages)), sha(outputText), model, days]));
  },
};

// Tarefa periódica: apaga as saídas vencidas (em lotes) e devolve o total.
export function makeRetentionSweep(db: Db) {
  return async () => {
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const rows = (await db.query(`select * from purge_expired_outputs(5000)`)).rows;
      const n = rows.reduce((s, r) => s + Number(r.apagadas), 0);
      total += n;
      if (n < 5000) break;
    }
    return total;
  };
}
