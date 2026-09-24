// Rotas de plataforma: só admin_theneil do tenant interno da TheNeil.
import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { createTenant } from './tenants.ts';
import type { AuthContext } from '../auth/session.ts';
import { INCIDENT_STATUS, NEXT, code, platformMayRead } from '../incidents/routes.ts';
import { makeAnchorJob } from '../audit/anchor.ts';
import { simulate, simulateSchema } from '../usage/simulate.ts';

const priceSchema = z.object({
  provider: z.enum(['anthropic']),
  model: z.string().trim().min(1).max(120),
  inputPerMTokUsd: z.number().min(0).max(10000),
  outputPerMTokUsd: z.number().min(0).max(10000),
  perPageBrl: z.number().min(0).max(1000).default(0),
  usdBrl: z.number().positive().max(100),
  validFrom: z.iso.date(),
  source: z.string().trim().min(5).max(500),
});

// Operação da plataforma: pessoa admin_theneil no tenant interno da TheNeil.
export async function isPlatformAdmin(app: FastifyInstance, a: AuthContext) {
  const isPlatform = await withTenant(app.deps.db, tenantCtx(a), tx =>
    tx.query(`select is_platform from tenants where id = $1`, [a.tenantId]).then(r => r.rows[0]?.is_platform === true));
  return isPlatform && can(a, 'platform.tenants');
}

export async function platformRoutes(app: FastifyInstance) {
  app.post('/api/platform/tenants', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    try {
      return reply.code(201).send(await createTenant(app.deps.ownerDb, req.body, { tenantId: a.tenantId, userId: a.userId }));
    } catch (e) {
      if (e instanceof ZodError) return reply.code(400).send({ error: 'dados_invalidos', detalhes: e.issues.map(i => i.path.join('.') + ': ' + i.message) });
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'slug_dominio_ou_host_ja_usado' });
      if (e instanceof Error && /fora dos domínios|segredo não vai|não existe no tenant|não existe no catálogo|área mãe/.test(e.message)) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  // Publica agora a âncora do dia de cada tenant (a tarefa diária faz o mesmo).
  app.post('/api/platform/audit/anchors/run', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.anchors) return reply.code(409).send({ error: 'ancora_desligada', detalhe: 'configure AUDIT_ANCHOR_BUCKET' });
    return { resultados: await makeAnchorJob(app)() };
  });

  // Incidentes de todos os clientes, para o suporte da TheNeil acompanhar:
  // tipo, status, data e a execução ou saída afetada, sem a descrição. Lê pela
  // conexão do dono (fora da RLS por tenant); cada acesso fica na auditoria do
  // tenant do incidente.
  app.get('/api/platform/incidents', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const q = z.object({ status: z.enum(INCIDENT_STATUS).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = (await app.deps.ownerDb.query(
      `select i.id, i.tenant_id, t.slug as tenant, i.kind, i.status, i.run_id, i.output_id, i.escalated_at, i.created_at, i.updated_at
       from incidents i join tenants t on t.id = i.tenant_id
       where ($1::text is null or i.status = $1) order by i.created_at desc limit 500`, [q.data.status ?? null])).rows;
    const perTenant = new Map<string, number>();
    for (const r of rows) perTenant.set(r.tenant_id, (perTenant.get(r.tenant_id) ?? 0) + 1);
    for (const [tenantId, n] of perTenant) {
      await app.deps.ownerDb.query(`insert into audit_log (tenant_id, action, details) values ($1, 'incidentes_consultados_pela_theneil', $2)`,
        [tenantId, { quantidade: n, por: a.email }]);
    }
    return rows.map(r => ({ id: r.id, codigo: code(r.id), tenant: r.tenant, tipo: r.kind, status: r.status, execucao: r.run_id, saida: r.output_id,
      escalado: !!r.escalated_at, descricaoDisponivel: platformMayRead(r), criadoEm: r.created_at, atualizadoEm: r.updated_at, proximos: NEXT[r.status] }));
  });

  // Detalhe para a TheNeil. A descrição (e as notas do histórico, que podem
  // repetir o conteúdo) só vêm com escalonamento ou em problema técnico; a
  // leitura fica na auditoria do cliente.
  app.get('/api/platform/incidents/:id', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const { id } = req.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const i = (await app.deps.ownerDb.query(
      `select i.*, t.slug as tenant from incidents i join tenants t on t.id = i.tenant_id where i.id = $1`, [id])).rows[0];
    if (!i) return reply.code(404).send({ error: 'nao_encontrado' });
    const reads = platformMayRead(i);
    const events = (await app.deps.ownerDb.query(`select at, actor, status_from, status_to, note from incident_events where incident_id = $1 order by id`, [id])).rows
      .map(e => ({ at: e.at, actor: e.actor, status_from: e.status_from, status_to: e.status_to, note: reads || String(e.actor).startsWith('TheNeil') ? e.note : null }));
    await app.deps.ownerDb.query(`insert into audit_log (tenant_id, action, target, details) values ($1, $2, $3, $4)`,
      [i.tenant_id, reads ? 'incidente_descricao_lida' : 'incidente_consultado_pela_theneil', `incidente:${id}`, { por: `TheNeil (${a.email})` }]);
    return { id: i.id, codigo: code(i.id), tenant: i.tenant, tipo: i.kind, status: i.status, execucao: i.run_id, saida: i.output_id, criadoEm: i.created_at,
      escalado: i.escalated_at ? { em: i.escalated_at, por: i.escalated_by } : null, descricao: reads ? i.description : null, descricaoRestrita: !reads,
      historico: events, proximos: NEXT[i.status] };
  });

  app.post('/api/platform/incidents/:id/status', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const { id } = req.params as { id: string };
    const p = z.object({ status: z.enum(INCIDENT_STATUS), nota: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const client = await app.deps.ownerDb.connect();
    try {
      await client.query('begin');
      const i = (await client.query(`select tenant_id, status from incidents where id = $1 for update`, [id])).rows[0];
      if (!i) { await client.query('rollback'); return reply.code(404).send({ error: 'nao_encontrado' }); }
      if (!NEXT[i.status].includes(p.data.status)) { await client.query('rollback'); return reply.code(409).send({ error: 'transicao_invalida', de: i.status, possiveis: NEXT[i.status] }); }
      await client.query(`update incidents set status = $2, updated_at = now() where id = $1`, [id, p.data.status]);
      await client.query(`insert into incident_events (tenant_id, incident_id, actor, status_from, status_to, note) values ($1, $2, $3, $4, $5, $6)`,
        [i.tenant_id, id, `TheNeil (${a.email})`, i.status, p.data.status, p.data.nota]);
      await client.query(`insert into audit_log (tenant_id, action, target, details) values ($1, 'incidente_status', $2, $3)`,
        [i.tenant_id, `incidente:${id}`, { de: i.status, para: p.data.status, por: `TheNeil (${a.email})` }]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return { id, status: p.data.status };
  });

  // Tabela de preços (vigência por data). Só inclusão: preço novo é uma nova linha.
  app.get('/api/platform/prices', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    return (await app.deps.db.query(`select * from price_tables order by model, valid_from desc`)).rows;
  });

  app.post('/api/platform/prices', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const p = priceSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const v = p.data;
    try {
      const r = (await app.deps.ownerDb.query(
        `insert into price_tables (provider, model, input_per_mtok_usd, output_per_mtok_usd, per_page_brl, usd_brl, valid_from, source, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [v.provider, v.model, v.inputPerMTokUsd, v.outputPerMTokUsd, v.perPageBrl, v.usdBrl, v.validFrom, v.source, a.email])).rows[0];
      await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(`insert into audit_log (tenant_id, actor_user_id, action, details) values ($1, $2, 'preco_cadastrado', $3)`,
        [a.tenantId, a.userId, { modelo: v.model, vigencia: v.validFrom, entrada: v.inputPerMTokUsd, saida: v.outputPerMTokUsd, porPagina: v.perPageBrl, cambio: v.usdBrl }]));
      return reply.code(201).send({ id: r.id });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'ja_existe_preco_nessa_data' });
      throw e;
    }
  });

  // Consumo do mês por cliente, para faturamento.
  app.get('/api/platform/usage', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    if (!app.deps.ownerDb) return reply.code(503).send({ error: 'plataforma_indisponivel' });
    const q = z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    return (await app.deps.ownerDb.query(
      `select t.slug as cliente, count(e.*)::int as chamadas, coalesce(sum(e.input_tokens), 0)::bigint as tokens_entrada,
              coalesce(sum(e.output_tokens), 0)::bigint as tokens_saida, coalesce(sum(e.pages), 0)::int as paginas,
              round(coalesce(sum(e.cost_brl), 0), 2)::float as custo_brl
       from tenants t left join usage_events e on e.tenant_id = t.id
         and (e.at at time zone 'America/Sao_Paulo') >= $1::date and (e.at at time zone 'America/Sao_Paulo') < ($1::date + interval '1 month')
       where not t.is_platform group by t.slug order by custo_brl desc`, [`${q.data.mes}-01`])).rows
      .map(r => ({ ...r, tokens_entrada: Number(r.tokens_entrada), tokens_saida: Number(r.tokens_saida) }));
  });

  // Simulador para a proposta comercial (sem dados de cliente: só premissas).
  app.post('/api/platform/simulate', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!(await isPlatformAdmin(app, a))) return reply.code(403).send({ error: 'sem_permissao' });
    const p = simulateSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const client = await app.deps.db.connect();
    try {
      return await simulate(client, { ...p.data, itens: p.data.itens.map(i => ({ ...i, assistente: undefined })) },
        { provider: 'anthropic', model: p.data.modelo ?? 'claude-haiku-4-5', usdBrlFallback: app.deps.config.USD_BRL });
    } finally { client.release(); }
  });
}
