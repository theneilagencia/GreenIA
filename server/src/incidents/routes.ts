// "Reportar incidente": qualquer pessoa abre (dado enviado indevidamente,
// resposta errada ou inadequada, problema técnico, outro). O incidente segue
// com status até o encerramento, com histórico.
// Quem lê a descrição (que pode conter o próprio dado):
//   - quem reportou e o key user da área; sem key user na área (ou incidente
//     sem área), o administrador do cliente faz esse papel;
//   - a TheNeil só quando o key user escala o caso ou o tipo é "problema
//     técnico". Fora disso, ela vê tipo, status, data e a execução ou saída.
// Toda leitura da descrição fica na auditoria do cliente, com quem leu.
// Os emails nunca levam a descrição.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseTenantConfig } from '../tenants/config.ts';

export const INCIDENT_KINDS = ['dado_indevido', 'resposta_errada', 'resposta_inadequada', 'problema_tecnico', 'outro'] as const;
export const INCIDENT_STATUS = ['aberto', 'em_analise', 'resolvido', 'encerrado'] as const;
export const KIND_LABEL: Record<string, string> = { dado_indevido: 'dado enviado indevidamente', resposta_errada: 'resposta errada', resposta_inadequada: 'resposta inadequada', problema_tecnico: 'problema técnico', outro: 'outro' };

// Transições permitidas (reabrir um resolvido volta para análise).
export const NEXT: Record<string, string[]> = {
  aberto: ['em_analise', 'resolvido', 'encerrado'],
  em_analise: ['resolvido', 'encerrado'],
  resolvido: ['encerrado', 'em_analise'],
  encerrado: [],
};

const createSchema = z.object({
  tipo: z.enum(INCIDENT_KINDS),
  descricao: z.string().trim().min(10).max(5000),
  areaSlug: z.string().max(60).optional(),
  runId: z.uuid().optional(),
  outputId: z.uuid().optional(),
  tela: z.string().max(200).optional(),
});
const statusSchema = z.object({ status: z.enum(INCIDENT_STATUS), nota: z.string().trim().max(2000).optional() });
export const code = (id: string) => id.slice(0, 8).toUpperCase();

// Quem trata: key user da área ou admin do cliente.
const canHandle = (a: AuthContext, areaId: string | null) => can(a, 'people.manage', areaId) && (can(a, 'audit.read', areaId));

// Key users ativos da área; sem nenhum, os administradores do cliente.
export async function descriptionHolders(tx: Tx, areaId: string | null): Promise<{ emails: string[]; ids: string[]; fallback: boolean }> {
  const q = (role: string, area: boolean) => tx.query(
    `select distinct u.id, u.email from users u join memberships m on m.user_id = u.id
     where u.status = 'ativo' and m.role = $1 ${area ? 'and m.area_id = $2' : ''}`, area ? [role, areaId] : [role]);
  let rows = areaId ? (await q('key_user', true)).rows : [];
  const fallback = !rows.length;
  if (fallback) rows = (await q('admin_cliente', false)).rows;
  return { emails: rows.map(r => r.email as string), ids: rows.map(r => r.id as string), fallback };
}

// A TheNeil lê a descrição só com escalonamento ou quando é problema técnico.
export const platformMayRead = (i: { kind: string; escalated_at: Date | string | null }) => i.kind === 'problema_tecnico' || !!i.escalated_at;

async function sendAll(app: FastifyInstance, to: string[], subject: string, text: string) {
  for (const addr of new Set(to)) await app.deps.email.send({ to: addr, subject, text }).catch(() => {});
}

export async function incidentRoutes(app: FastifyInstance) {
  app.post('/api/incidents', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = createSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      let areaId: string | null = null;
      if (p.data.runId) {
        const run = (await tx.query(`select area_id, user_id from runs where id = $1`, [p.data.runId])).rows[0];
        if (!run) return { status: 404, body: { error: 'execucao_nao_encontrada' } };
        areaId = run.area_id;
      } else if (p.data.areaSlug) {
        areaId = a.areaRoles.find(r => r.slug === p.data.areaSlug)?.areaId ?? null;
        if (!areaId && !a.allAreas) return { status: 404, body: { error: 'area_nao_encontrada' } };
        if (!areaId) areaId = (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id ?? null;
      } else areaId = a.areaRoles[0]?.areaId ?? null;
      const inc = (await tx.query(
        `insert into incidents (tenant_id, kind, description, area_id, reporter_id, run_id, output_id, screen) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, created_at`,
        [a.tenantId, p.data.tipo, p.data.descricao, areaId, a.userId, p.data.runId ?? null, p.data.outputId ?? null, p.data.tela ?? null])).rows[0];
      await tx.query(`insert into incident_events (tenant_id, incident_id, actor, status_to, note) values ($1, $2, $3, 'aberto', null)`, [a.tenantId, inc.id, a.email]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'incidente_aberto', target: `incidente:${inc.id}`,
        details: { tipo: p.data.tipo, areaId, execucao: p.data.runId ?? null, saida: p.data.outputId ?? null } });
      const t = (await tx.query(`select name, config from tenants where id = $1`, [a.tenantId])).rows[0];
      const area = areaId ? (await tx.query(`select name from areas where id = $1`, [areaId])).rows[0]?.name : null;
      return { status: 201, body: { id: inc.id, codigo: code(inc.id), status: 'aberto' }, notify: { to: (await descriptionHolders(tx, areaId)).emails, tenant: t.name, product: parseTenantConfig(t.config).config.branding.productName, area, created: new Date(inc.created_at).toISOString() } };
    });
    if ('notify' in out && out.notify) {
      const n = out.notify;
      const subject = `${n.product}: incidente ${out.body.codigo} (${KIND_LABEL[p.data.tipo]})`;
      await sendAll(app, n.to, subject, `Novo incidente ${out.body.codigo} em ${n.tenant}${n.area ? `, área ${n.area}` : ''}: ${KIND_LABEL[p.data.tipo]}.\nAbra a plataforma para ler a descrição e registrar o andamento.`);
      // TheNeil: tipo, status, data e o que foi afetado, sem conteúdo.
      const support = app.deps.config.PLATFORM_SUPPORT_EMAIL;
      if (support) {
        const ref = p.data.runId ? `execução ${p.data.runId}` : p.data.outputId ? `saída ${p.data.outputId}` : 'sem execução ou saída indicada';
        await sendAll(app, [support], subject, `Incidente ${out.body.codigo} em ${n.tenant}: ${KIND_LABEL[p.data.tipo]}, aberto em ${n.created}; ${ref}.\n${p.data.tipo === 'problema_tecnico' ? 'Problema técnico: a descrição está disponível no painel da plataforma.' : 'A descrição fica com o key user da área; ela chega à TheNeil se o caso for escalado.'}`);
      }
    }
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/incidents', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = z.object({ status: z.enum(INCIDENT_STATUS).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = await withTenant(app.deps.db, tenantCtx(a), async tx => (await tx.query(
      `select i.id, i.kind, i.status, i.created_at, i.updated_at, i.area_id, i.reporter_id, ar.name as area, u.email as reporter
       from incidents i left join areas ar on ar.id = i.area_id join users u on u.id = i.reporter_id
       where ($1::text is null or i.status = $1) order by i.created_at desc limit 500`, [q.data.status ?? null])).rows);
    return rows.filter(r => r.reporter_id === a.userId || canHandle(a, r.area_id))
      .map(r => ({ id: r.id, codigo: code(r.id), tipo: r.kind, status: r.status, area: r.area, reportadoPor: r.reporter, criadoEm: r.created_at, atualizadoEm: r.updated_at, possoTratar: canHandle(a, r.area_id) }));
  });

  app.get('/api/incidents/:id', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'nao_encontrado' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const i = (await tx.query(
        `select i.*, ar.name as area, u.email as reporter from incidents i left join areas ar on ar.id = i.area_id join users u on u.id = i.reporter_id where i.id = $1`, [id])).rows[0];
      if (!i || !(i.reporter_id === a.userId || canHandle(a, i.area_id))) return null;
      const events = (await tx.query(`select at, actor, status_from, status_to, note from incident_events where incident_id = $1 order by id`, [id])).rows;
      const holder = (await descriptionHolders(tx, i.area_id)).ids.includes(a.userId);
      const reads = holder || i.reporter_id === a.userId;
      if (reads) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'incidente_descricao_lida', target: `incidente:${id}`, details: { por: a.email } });
      return { i, events, reads, holder };
    });
    if (!out) return reply.code(404).send({ error: 'nao_encontrado' });
    const { i, events, reads, holder } = out;
    return { id: i.id, codigo: code(i.id), tipo: i.kind, descricao: reads ? i.description : null, descricaoRestrita: !reads, status: i.status, area: i.area, reportadoPor: i.reporter,
      execucao: i.run_id, saida: i.output_id, tela: i.screen, criadoEm: i.created_at, historico: events, possoTratar: canHandle(a, i.area_id), proximos: canHandle(a, i.area_id) ? NEXT[i.status] : [],
      escalado: i.escalated_at ? { em: i.escalated_at, por: i.escalated_by } : null,
      podeEscalar: holder && !i.escalated_at && i.kind !== 'problema_tecnico' && i.status !== 'encerrado' };
  });

  app.post('/api/incidents/:id/status', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = statusSchema.safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const i = (await tx.query(`select id, status, area_id, reporter_id from incidents where id = $1 for update`, [id])).rows[0];
      if (!i || !(i.reporter_id === a.userId || canHandle(a, i.area_id))) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!canHandle(a, i.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      if (!NEXT[i.status].includes(p.data.status)) return { status: 409, body: { error: 'transicao_invalida', de: i.status, possiveis: NEXT[i.status] } };
      if (['resolvido', 'encerrado'].includes(p.data.status) && !p.data.nota) return { status: 400, body: { error: 'nota_obrigatoria' } };
      await tx.query(`update incidents set status = $2, updated_at = now() where id = $1`, [id, p.data.status]);
      await tx.query(`insert into incident_events (tenant_id, incident_id, actor, status_from, status_to, note) values ($1, $2, $3, $4, $5, $6)`,
        [a.tenantId, id, a.email, i.status, p.data.status, p.data.nota ?? null]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'incidente_status', target: `incidente:${id}`, details: { de: i.status, para: p.data.status } });
      return { status: 200, body: { id, status: p.data.status } };
    });
    return reply.code(out.status).send(out.body);
  });

  // O key user (ou quem lê a descrição no lugar dele) escala o caso: a
  // descrição passa a ficar disponível para a TheNeil.
  app.post('/api/incidents/:id/escalar', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { id } = req.params as { id: string };
    const p = z.object({ nota: z.string().trim().min(3).max(2000) }).safeParse(req.body);
    if (!z.uuid().safeParse(id).success || !p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const i = (await tx.query(`select id, kind, status, area_id, reporter_id, escalated_at from incidents where id = $1 for update`, [id])).rows[0];
      if (!i || !(i.reporter_id === a.userId || canHandle(a, i.area_id))) return { status: 404, body: { error: 'nao_encontrado' } };
      if (!(await descriptionHolders(tx, i.area_id)).ids.includes(a.userId)) return { status: 403, body: { error: 'so_o_key_user_escala' } };
      if (i.escalated_at || i.kind === 'problema_tecnico') return { status: 409, body: { error: 'ja_disponivel_para_a_theneil' } };
      if (i.status === 'encerrado') return { status: 409, body: { error: 'incidente_encerrado' } };
      await tx.query(`update incidents set escalated_at = now(), escalated_by = $2, updated_at = now() where id = $1`, [id, a.email]);
      await tx.query(`insert into incident_events (tenant_id, incident_id, actor, status_from, status_to, note) values ($1, $2, $3, $4, $4, $5)`,
        [a.tenantId, id, a.email, i.status, `Escalado para a TheNeil: ${p.data.nota}`]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'incidente_escalado', target: `incidente:${id}`, details: { por: a.email } });
      const t = (await tx.query(`select name from tenants where id = $1`, [a.tenantId])).rows[0];
      return { status: 200, body: { id, escalado: true }, tenant: t.name as string, kind: i.kind as string };
    });
    const support = app.deps.config.PLATFORM_SUPPORT_EMAIL;
    if (out.status === 200 && support && 'tenant' in out) {
      await sendAll(app, [support], `Incidente ${code(id)} escalado (${KIND_LABEL[String(out.kind)]})`, `O key user de ${out.tenant} escalou o incidente ${code(id)}. A descrição está disponível no painel da plataforma.`);
    }
    return reply.code(out.status).send(out.body);
  });
}
