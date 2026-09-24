// Administração do tenant: áreas e pessoas. Tudo dentro do contexto do tenant da
// sessão (RLS): um admin nunca alcança áreas ou pessoas de outro tenant.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx, type Role } from '../auth/session.ts';
import { assignableRoles, can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { parseCsvObjects } from '../util/csv.ts';
import { normPt } from '../util/text.ts';

// Área: nome livre, slug gerado do nome quando não vem. O código não conhece
// nenhuma área pelo nome; cada tenant cria as suas.
const areaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(''),
  parentSlug: z.string().max(60).optional(),
  inheritPermissions: z.boolean().default(true),
});
const areaPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  parentSlug: z.string().max(60).nullable().optional(),     // null: vira área de primeiro nível
  position: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
  inheritPermissions: z.boolean().optional(),
});

export const slugify = (name: string) => normPt(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'area';

// Lista das áreas em árvore (ordem de exibição), com o caminho de cada uma.
export async function areaTree(tx: Tx) {
  const rows = (await tx.query(
    `select a.id, a.slug, a.name, a.description, a.parent_id, a.position, a.active, a.inherit_permissions,
            (select count(*) from memberships m where m.area_id = a.id and m.role = 'key_user')::int as key_users,
            (select count(*) from memberships m where m.area_id = a.id and m.role = 'revisor')::int as revisores,
            (select count(*) from kb_documents d where d.area_id = a.id)::int as documentos,
            (select count(*) from assistants s where s.area_id = a.id)::int as assistentes
     from areas a order by a.position, a.name`)).rows;
  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
  const out: Record<string, unknown>[] = [];
  const walk = (parent: string | null, path: string[], depth: number, parentActive: boolean) => {
    for (const r of byParent.get(parent) ?? []) {
      const caminho = [...path, r.name];
      out.push({ id: r.id, slug: r.slug, name: r.name, description: r.description, parentId: r.parent_id, position: r.position,
        active: r.active, efetivamenteAtiva: parentActive && r.active, inheritPermissions: r.inherit_permissions, depth, caminho: caminho.join(' > '),
        keyUsers: r.key_users, revisores: r.revisores, documentos: r.documentos, assistentes: r.assistentes });
      walk(r.id, caminho, depth + 1, parentActive && r.active);
    }
  };
  walk(null, [], 0, true);
  return out;
}

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
    return withTenant(app.deps.db, tenantCtx(a), areaTree);
  });

  app.post('/api/admin/areas', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'areas.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    const p = areaSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    try {
      const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        let parentId: string | null = null;
        if (p.data.parentSlug) {
          parentId = (await tx.query(`select id from areas where slug = $1`, [p.data.parentSlug])).rows[0]?.id ?? null;
          if (!parentId) return { status: 404, body: { error: 'area_mae_nao_encontrada' } };
        }
        const position = (await tx.query(`select coalesce(max(position), -1) + 1 as n from areas where parent_id is not distinct from $1`, [parentId])).rows[0].n;
        const r = (await tx.query(
          `insert into areas (tenant_id, slug, name, description, parent_id, position, inherit_permissions) values ($1, $2, $3, $4, $5, $6, $7)
           returning id, slug, name`,
          [a.tenantId, p.data.slug ?? slugify(p.data.name), p.data.name, p.data.description, parentId, position, p.data.inheritPermissions])).rows[0];
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'area_criada', target: r.id, details: { nome: r.name, areaMae: parentId } });
        return { status: 201, body: r };
      });
      return reply.code(out.status).send(out.body);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'area_ja_existe' });
      throw e;
    }
  });

  // Renomear, descrever, mover (subárea), reordenar, desativar e reativar.
  app.patch('/api/admin/areas/:slug', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    if (!can(a, 'areas.manage')) return reply.code(403).send({ error: 'sem_permissao' });
    const { slug } = req.params as { slug: string };
    const p = areaPatchSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    try {
      const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
        const cur = (await tx.query(`select * from areas where slug = $1 for update`, [slug])).rows[0];
        if (!cur) return { status: 404, body: { error: 'area_nao_encontrada' } };
        const d = p.data;
        let parentId: string | null = cur.parent_id;
        if (d.parentSlug !== undefined) {
          parentId = d.parentSlug === null ? null : (await tx.query(`select id from areas where slug = $1`, [d.parentSlug])).rows[0]?.id ?? undefined;
          if (parentId === undefined) return { status: 404, body: { error: 'area_mae_nao_encontrada' } };
        }
        await tx.query(
          `update areas set name = $2, description = $3, parent_id = $4, position = $5, active = $6, inherit_permissions = $7 where id = $1`,
          [cur.id, d.name ?? cur.name, d.description ?? cur.description, parentId, d.position ?? cur.position, d.active ?? cur.active, d.inheritPermissions ?? cur.inherit_permissions]);
        const changed = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
        await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: d.active === false ? 'area_desativada' : d.active === true && !cur.active ? 'area_reativada' : 'area_alterada', target: cur.id, details: changed });
        return { status: 200, body: { slug, ...changed } };
      });
      return reply.code(out.status).send(out.body);
    } catch (e) {
      if (/ciclo|profunda/.test((e as Error).message)) return reply.code(409).send({ error: 'hierarquia_invalida' });
      throw e;
    }
  });

  // Detalhe da área: key users, revisores e demais pessoas (papéis próprios),
  // base de conhecimento e assistentes (da área e compartilhados com ela).
  app.get('/api/admin/areas/:slug', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const { slug } = req.params as { slug: string };
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const ar = (await tx.query(`select id, slug, name, description, parent_id, active, inherit_permissions from areas where slug = $1`, [slug])).rows[0];
      if (!ar) return null;
      if (!can(a, 'people.manage', ar.id) && !can(a, 'kb.manage', ar.id)) return 'proibido' as const;
      const people = (await tx.query(`select u.email, u.name, m.role from memberships m join users u on u.id = m.user_id where m.area_id = $1 order by m.role, u.email`, [ar.id])).rows;
      const docs = (await tx.query(
        `select d.id, d.title, d.company_wide, d.area_id = $1 as propria from kb_documents d
         where d.area_id = $1 or exists (select 1 from kb_document_shares s where s.document_id = d.id and s.area_id = $1) order by d.title`, [ar.id])).rows;
      const assistants = (await tx.query(
        `select s.slug, s.name, s.status, s.company_wide, s.area_id = $1 as propria from assistants s
         where s.area_id = $1 or exists (select 1 from assistant_shares x where x.assistant_id = s.id and x.area_id = $1) order by s.name`, [ar.id])).rows;
      const parent = ar.parent_id ? (await tx.query(`select slug, name from areas where id = $1`, [ar.parent_id])).rows[0] : null;
      return {
        slug: ar.slug, name: ar.name, description: ar.description, active: ar.active, inheritPermissions: ar.inherit_permissions, areaMae: parent,
        keyUsers: people.filter(p => p.role === 'key_user'), revisores: people.filter(p => p.role === 'revisor'), usuarios: people.filter(p => p.role === 'usuario'),
        documentos: docs.map(d => ({ id: d.id, titulo: d.title, daArea: d.propria, empresa: d.company_wide })),
        assistentes: assistants.map(s => ({ slug: s.slug, nome: s.name, status: s.status, daArea: s.propria, empresa: s.company_wide })),
      };
    });
    if (out === null) return reply.code(404).send({ error: 'area_nao_encontrada' });
    if (out === 'proibido') return reply.code(403).send({ error: 'sem_permissao' });
    return out;
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

  // Tira um papel (na área ou no tenant). Quem atribui também retira.
  app.delete('/api/admin/memberships', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = membershipSchema.omit({ name: true }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const areaId = p.data.areaSlug ? (await tx.query(`select id from areas where slug = $1`, [p.data.areaSlug])).rows[0]?.id ?? null : null;
      if (p.data.areaSlug && !areaId) return { status: 404, body: { error: 'area_nao_encontrada' } };
      if (!can(a, 'people.manage', areaId) || !assignableRoles(a, areaId).includes(p.data.role as Role)) return { status: 403, body: { error: 'sem_permissao' } };
      const r = await tx.query(
        `delete from memberships m using users u where u.id = m.user_id and u.email = $1 and m.area_id is not distinct from $2 and m.role = $3 returning m.user_id`,
        [p.data.email, areaId, p.data.role]);
      if (!r.rowCount) return { status: 404, body: { error: 'papel_nao_encontrado' } };
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'papel_retirado', target: r.rows[0].user_id, details: { role: p.data.role, areaId } });
      return { status: 200, body: { ok: true } };
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
