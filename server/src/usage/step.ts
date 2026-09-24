// Etapa do chat: limite de requisições (pessoa e tenant), cota mensal do tenant
// antes da chamada, e registro do consumo com alertas de 80% e 100% depois.
import { withTenant, type Tx } from '../db/pool.ts';
import { tenantCtx } from '../auth/session.ts';
import { audit } from '../audit.ts';
import type { ChatStep } from '../chat/hooks.ts';
import { costBrl } from './pricing.ts';

// Mês corrente no fuso de Brasília (a cota vira no dia 1º, horário local).
const MONTH_SQL = `date_trunc('month', now() at time zone 'America/Sao_Paulo')::date`;

async function monthCost(tx: Tx) {
  return Number((await tx.query(
    `select coalesce(sum(cost_brl), 0) as total from usage_events
     where (at at time zone 'America/Sao_Paulo') >= ${MONTH_SQL}`)).rows[0].total);
}

export const usageStep: ChatStep = {
  name: 'limites-e-consumo',
  async prepare({ app, auth, config }) {
    const rl = app.deps.rateLimiter;
    const user = await rl.hit(`u:${auth.userId}`, config.limits.userPerMinute, 60);
    if (!user.ok) return { status: 429, body: { error: 'muitas_requisicoes', retryAfterSec: user.retryAfterSec } };
    const tenant = await rl.hit(`t:${auth.tenantId}`, config.limits.tenantPerMinute, 60);
    if (!tenant.ok) return { status: 429, body: { error: 'muitas_requisicoes_no_cliente', retryAfterSec: tenant.retryAfterSec } };
    if (config.limits.hardLimit && config.limits.monthlyBudgetBrl > 0) {
      const spent = await withTenant(app.deps.db, tenantCtx(auth), monthCost);
      if (spent >= config.limits.monthlyBudgetBrl) return { status: 429, body: { error: 'cota_mensal_esgotada' } };
    }
  },

  async completed({ app, auth, config, usage, model, providerId }, state) {
    const cost = costBrl(model, usage.inputTokens, usage.outputTokens, app.deps.config.USD_BRL);
    const alerts = await withTenant(app.deps.db, tenantCtx(auth), async tx => {
      await tx.query(
        `insert into usage_events (tenant_id, user_id, assistant_id, provider, model, input_tokens, output_tokens, cost_brl)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [auth.tenantId, auth.userId, state.assistant?.id ?? null, providerId, model, usage.inputTokens, usage.outputTokens, cost]);
      const budget = config.limits.monthlyBudgetBrl;
      if (budget <= 0) return [];
      const pct = (await monthCost(tx)) / budget * 100;
      const fired: number[] = [];
      for (const threshold of [80, 100]) {
        if (pct < threshold) continue;
        const r = await tx.query(
          `insert into quota_alerts (tenant_id, month, threshold) values ($1, ${MONTH_SQL}, $2) on conflict do nothing`,
          [auth.tenantId, threshold]);
        if (r.rowCount) {
          fired.push(threshold);
          await audit(tx, { tenantId: auth.tenantId, action: 'alerta_cota', details: { limite: threshold, orcamentoBrl: budget } });
        }
      }
      if (!fired.length) return [];
      const admins = (await tx.query(
        `select distinct u.email from users u join memberships m on m.user_id = u.id where m.role = 'admin_cliente' and u.status = 'ativo'`)).rows;
      return fired.map(t => ({ threshold: t, to: admins.map(a => a.email as string) }));
    });
    const product = config.branding.productName;
    for (const a of alerts) {
      for (const to of a.to) {
        await app.deps.email.send({
          to,
          subject: `${product}: consumo do mês chegou a ${a.threshold}% da cota`,
          text: a.threshold >= 100
            ? `O consumo de IA do mês chegou à cota de R$ ${config.limits.monthlyBudgetBrl.toFixed(2)}.${config.limits.hardLimit ? ' Novas respostas ficam bloqueadas até o próximo mês ou até a cota ser ajustada.' : ''}`
            : `O consumo de IA do mês chegou a 80% da cota de R$ ${config.limits.monthlyBudgetBrl.toFixed(2)}.`,
        }).catch(() => {}); // alerta por email não pode derrubar a resposta; a auditoria já registrou
      }
    }
  },
};
