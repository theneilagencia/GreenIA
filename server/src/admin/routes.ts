// Administração do tenant: áreas e pessoas. Tudo dentro do contexto do tenant da
// sessão (RLS): um admin nunca alcança áreas ou pessoas de outro tenant.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/pool.ts';
import { requireAuth, tenantCtx, type Role } from '../auth/session.ts';
import { assignableRoles, can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseCsvObjects } from '../util/csv.ts';
import { normPt } from '../util/text.ts';

const areaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  name: z.string().trim().min(1).max(80),
});

const membershipSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().max(200).optional(),
  areaSlug: z.string().optional(),
  role: z.enum(['usuario', 'revisor', 'key_user', 'admin_cliente']),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return withTenant(app.deps.db, tenantCtx(a), tx =>
      tx.query(`select id, slug, name from areas order by name`).then(r => r.rows));
  });

  app.post('/api/admin/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'areas.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    const p = areaSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    try {
      const row = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        const r = (await tx.query(`insert into areas (tenant_id, slug, name) values ($1, $2, $3) returning id, slug, name`,
          [a.tenantId, p.data.slug, p.data.name])).rows[0];
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'area_criada', target: r.id });
        return r;
      });
      return reply.code(201).send(row);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'area_ja_existe' });
      throw e;
    }
  });

  // Dá um papel a uma pessoa (cria a pessoa, se ainda não existir no tenant).
  app.post('/api/admin/memberships', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = membershipSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      let areaId: string | null = null;
      if (p.data.areaSlug) {
        areaId = (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id || null;
        if (!areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      }
      if (!can(a, 'people.manage', areaId) || !assignableRoles(a, areaId).includes(p.data.role as Role)) {
        return { status: 403, body: { error: 'sem_permissao' } };
      }
      const domain = p.data.email.split('@')[1];
      const allowed = (await tx.query(`select 1 from tenant_domains where domain = $1`, [domain])).rowCount;
      if (!allowed) return { status: 422, body: { error: 'dominio_nao_permitido' } };
      const user = (await tx.query(
        `insert into users (tenant_id, email, name) values ($1, $2, $3)
         on conflict (tenant_id, email) do update set name = coalesce(nullif(excluded.name, ''), users.name)
         returning id`, [a.tenantId, p.data.email, p.data.name || ''])).rows[0];
      await tx.query(
        `insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, $4) on conflict do nothing`,
        [a.tenantId, user.id, areaId, p.data.role]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'papel_atribuido', target: user.id, details: { role: p.data.role, areaId } });
      return { status: 201, body: { userId: user.id, role: p.data.role, areaId } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/admin/users', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'people.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    return withTenant(app.deps.db, tenantCtx(a), tx => tx.query(
      `select u.id, u.email, u.name, u.status,
              coalesce(json_agg(json_build_object('role', m.role, 'area', ar.slug)) filter (where m.id is not null), '[]') as papeis
       from users u left join memberships m on m.user_id = u.id left join areas ar on ar.id = m.area_id
       group by u.id order by u.email`).then(r => r.rows));
  });

  // Importação de pessoas por CSV (implantação). Colunas: email; nome; area;
  // papel (usuario, revisor, key_user ou admin_cliente; área vazia = tenant todo).
  // Cada linha é validada; as inválidas voltam no relatório e as demais entram.
  // Com simular=true nada é gravado.
  app.post('/api/admin/users/import', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = z.object({ csv: z.string().min(1).max(2_000_000), simular: z.boolean().default(false) }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const rows = parseCsvObjects(p.data.csv).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [normPt(k).replace(/[^a-z]/g, ''), v])));
    if (!rows.length) return reply.code(400).send({ error: 'csv_vazio' });
    if (!('email' in rows[0]) || !('papel' in rows[0])) return reply.code(400).send({ error: 'colunas_obrigatorias', colunas: ['email', 'nome', 'area', 'papel'] });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const areas = (await tx.query(`select id, slug, name from areas`)).rows as { id: string; slug: string; name: string }[];
      const domains = new Set((await tx.query(`select domain from tenant_domains`)).rows.map(r => r.domain as string));
      const erros: { linha: number; email: string; erro: string }[] = [];
      let criados = 0, vinculos = 0;
      for (const [i, r] of rows.entries()) {
        const linha = i + 2;                                   // 1 = cabeçalho
        const email = String(r.email ?? '').trim().toLowerCase();
        const papel = normPt(String(r.papel ?? '')).replace(/[\s-]+/g, '_').replace(/^keyuser$/, 'key_user');
        const areaTxt = normPt(String(r.area ?? ''));
        const fail = (erro: string) => erros.push({ linha, email, erro });
        if (!z.email().safeParse(email).success) { fail('email inválido'); continue; }
        if (!domains.has(email.split('@')[1])) { fail('domínio não permitido neste cliente'); continue; }
        const area = areaTxt ? areas.find(x => normPt(x.slug) === areaTxt || normPt(x.name) === areaTxt) : null;
        if (areaTxt && !area) { fail(`área não encontrada: ${r.area}`); continue; }
        if (!['usuario', 'revisor', 'key_user', 'admin_cliente'].includes(papel)) { fail(`papel inválido: ${r.papel}`); continue; }
        const areaId = area?.id ?? null;
        if (!can(a, 'people.manage', areaId) || !assignableRoles(a, areaId).includes(papel as Role)) { fail(`sem permissão para dar o papel ${papel}${area ? ` na área ${area.name}` : ' no tenant todo'}`); continue; }
        if (p.data.simular) { vinculos++; continue; }
        const u = (await tx.query(
          `insert into users (tenant_id, email, name) values ($1, $2, $3)
           on conflict (tenant_id, email) do update set name = coalesce(nullif(excluded.name, ''), users.name)
           returning id, (xmax = 0) as novo`, [a.tenantId, email, String(r.nome ?? '').trim()])).rows[0];
        if (u.novo) criados++;
        const m = await tx.query(`insert into memberships (tenant_id, user_id, area_id, role) values ($1, $2, $3, $4) on conflict do nothing`, [a.tenantId, u.id, areaId, papel]);
        vinculos += m.rowCount ?? 0;
      }
      if (!p.data.simular) await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'usuarios_importados', details: { linhas: rows.length, criados, vinculos, erros: erros.length } });
      return { simulado: p.data.simular, linhas: rows.length, criados, vinculos, erros };
    });
    return reply.send(out);
  });
}
