// Consumo do tenant: relatório mensal (por assistente, por pessoa, por dia),
// exportável para faturamento, e simulador de custo com as médias medidas.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { toCsv } from '../util/csv.ts';
import { measuredFor, simulate, simulateSchema } from './simulate.ts';

export const monthSchema = z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), format: z.enum(['json', 'csv', 'xlsx']).default('json') });

const SUMS = `count(*)::int as chamadas, coalesce(sum(input_tokens), 0)::bigint as tokens_entrada, coalesce(sum(output_tokens), 0)::bigint as tokens_saida,
  coalesce(sum(pages), 0)::int as paginas, round(coalesce(sum(cost_brl), 0), 4)::float as custo_brl`;
const inMonth = (col: string) => `(${col} at time zone 'America/Sao_Paulo') >= $1::date and (${col} at time zone 'America/Sao_Paulo') < ($1::date + interval '1 month')`;

export async function monthlyUsage(tx: Tx, mes: string) {
  const d = `${mes}-01`;
  const num = (r: Record<string, unknown>) => ({ ...r, tokens_entrada: Number(r.tokens_entrada), tokens_saida: Number(r.tokens_saida) });
  const total = num((await tx.query(`select ${SUMS} from usage_events where ${inMonth('at')}`, [d])).rows[0]);
  const porAssistente = (await tx.query(
    `select coalesce(a.slug, '(chat livre)') as assistente, coalesce(a.name, 'Chat livre') as nome, ${SUMS}
     from usage_events e left join assistants a on a.id = e.assistant_id where ${inMonth('e.at')}
     group by 1, 2 order by custo_brl desc`, [d])).rows.map(num);
  const porPessoa = (await tx.query(
    `select coalesce(u.email, '(sistema)') as pessoa, ${SUMS}
     from usage_events e left join users u on u.id = e.user_id where ${inMonth('e.at')}
     group by 1 order by custo_brl desc`, [d])).rows.map(num);
  const porDia = (await tx.query(
    `select to_char(at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia, ${SUMS} from usage_events where ${inMonth('at')} group by 1 order by 1`, [d])).rows.map(num);
  const precos = (await tx.query(
    `select distinct p.model, p.valid_from, p.input_per_mtok_usd::float as entrada_usd, p.output_per_mtok_usd::float as saida_usd, p.per_page_brl::float as por_pagina_brl, p.usd_brl::float as cambio, p.source
     from usage_events e join price_tables p on p.id = e.price_id where ${inMonth('e.at')}`, [d])).rows;
  return { mes, total, porAssistente, porPessoa, porDia, precos };
}

export async function usageXlsx(r: Awaited<ReturnType<typeof monthlyUsage>>, tenantName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreenIA';
  const sheet = (name: string, rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    const cols = rows.length ? Object.keys(rows[0]) : ['sem dados'];
    ws.addRow(cols).font = { bold: true };
    rows.forEach(x => ws.addRow(cols.map(c => x[c] as ExcelJS.CellValue)));
    cols.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });
  };
  sheet('Resumo', [{ cliente: tenantName, mes: r.mes, ...r.total }]);
  sheet('Por assistente', r.porAssistente);
  sheet('Por pessoa', r.porPessoa);
  sheet('Por dia', r.porDia);
  sheet('Preços usados', r.precos);
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

export async function usageRoutes(app: FastifyInstance) {
  app.get('/api/usage/report', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure') && !can(a, 'audit.read')) return reply.code(403).send({ error: 'sem_permissao' });
    const q = monthSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const { r, tenantName } = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = await monthlyUsage(tx, q.data.mes);
      const tenantName = (await tx.query(`select name from tenants where id = $1`, [a.tenantId])).rows[0].name as string;
      if (q.data.format !== 'json') await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'relatorio_consumo_exportado', details: { mes: q.data.mes, formato: q.data.format } });
      return { r, tenantName };
    });
    if (q.data.format === 'csv') {
      return reply.type('text/csv; charset=utf-8').header('content-disposition', `attachment; filename="consumo-${q.data.mes}.csv"`)
        .send(toCsv(r.porAssistente.map(x => ({ mes: r.mes, ...x }))));
    }
    if (q.data.format === 'xlsx') {
      return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', `attachment; filename="consumo-${q.data.mes}.xlsx"`)
        .send(await usageXlsx(r, tenantName));
    }
    return r;
  });

  app.post('/api/usage/simulate', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'tenant.configure') && !can(a, 'kb.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    const p = simulateSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    return withTenant(app.deps.db, tenantCtx(a), async tx => {
      const config = parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [a.tenantId])).rows[0]?.config).config;
      return simulate(tx, p.data, { provider: config.llm.provider, model: config.llm.model, usdBrlFallback: app.deps.config.USD_BRL, measured: slug => measuredFor(tx, slug) });
    });
  });
}
