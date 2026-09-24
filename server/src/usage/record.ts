// Limites e consumo, comuns ao chat e às execuções de assistentes: limite de
// requisições (pessoa e tenant), cota mensal antes da chamada, e registro do
// consumo (tokens, páginas, custo) com alertas de 80% e 100% depois.
import type { FastifyInstance } from 'fastify';
import { withTenant, type Tx } from '../db/pool.ts';
import { audit } from '../audit.ts';
import type { TenantConfig } from '../tenants/config.ts';
import type { LlmUsage } from '../llm/provider.ts';
import { costBrl, currentPrice, priceCost } from './pricing.ts';

// Mês corrente no fuso de Brasília (a cota vira no dia 1º, horário local).
export const MONTH_SQL = `date_trunc('month', now() at time zone 'America/Sao_Paulo')::date`;

export async function monthCost(tx: Tx) {
  return Number((await tx.query(
    `select coalesce(sum(cost_brl), 0) as total from usage_events
     where (at at time zone 'America/Sao_Paulo') >= ${MONTH_SQL}`)).rows[0].total);
}

export async function checkLimits(app: FastifyInstance, who: { tenantId: string; userId: string }, config: TenantConfig) {
  const rl = app.deps.rateLimiter;
  const user = await rl.hit(`u:${who.userId}`, config.limits.userPerMinute, 60);
  if (!user.ok) return { status: 429, body: { error: 'muitas_requisicoes', retryAfterSec: user.retryAfterSec } };
  const tenant = await rl.hit(`t:${who.tenantId}`, config.limits.tenantPerMinute, 60);
  if (!tenant.ok) return { status: 429, body: { error: 'muitas_requisicoes_no_cliente', retryAfterSec: tenant.retryAfterSec } };
  if (config.limits.hardLimit && config.limits.monthlyBudgetBrl > 0) {
    const spent = await withTenant(app.deps.db, { tenantId: who.tenantId }, monthCost);
    if (spent >= config.limits.monthlyBudgetBrl) return { status: 429, body: { error: 'cota_mensal_esgotada' } };
  }
  return null;
}

export interface UsageRecord {
  tenantId: string;
  userId: string | null;
  assistantId: string | null;
  runId?: string | null;
  provider: string;
  model: string;
  usage: LlmUsage;
  pages?: number;
}

// Grava o consumo, dispara os alertas de cota e devolve o custo em reais.
export async function recordUsage(app: FastifyInstance, config: TenantConfig, r: UsageRecord): Promise<number> {
  let cost = 0;
  const alerts = await withTenant(app.deps.db, { tenantId: r.tenantId }, async tx => {
    const price = await currentPrice(tx, r.provider, r.model);
    cost = price
      ? priceCost(price, r.usage.inputTokens, r.usage.outputTokens, r.pages ?? 0)
      : costBrl(r.model, r.usage.inputTokens, r.usage.outputTokens, app.deps.config.USD_BRL);
    await tx.query(
      `insert into usage_events (tenant_id, user_id, assistant_id, run_id, provider, model, input_tokens, output_tokens, pages, cost_brl, price_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [r.tenantId, r.userId, r.assistantId, r.runId ?? null, r.provider, r.model, r.usage.inputTokens, r.usage.outputTokens, r.pages ?? 0, cost, price?.id ?? null]);
    const budget = config.limits.monthlyBudgetBrl;
    if (budget <= 0) return [];
    const pct = (await monthCost(tx)) / budget * 100;
    const fired: number[] = [];
    for (const threshold of [80, 100]) {
      if (pct < threshold) continue;
      const q = await tx.query(
        `insert into quota_alerts (tenant_id, month, threshold) values ($1, ${MONTH_SQL}, $2) on conflict do nothing`,
        [r.tenantId, threshold]);
      if (q.rowCount) {
        fired.push(threshold);
        await audit(tx, { tenantId: r.tenantId, action: 'alerta_cota', details: { limite: threshold, orcamentoBrl: budget } });
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
  return cost;
}
