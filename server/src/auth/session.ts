// Sessão por cookie: token aleatório no cookie (HttpOnly, Secure, SameSite=Lax),
// só o sha256 dele no banco. Toda requisição resolve usuário, tenant, papéis e
// áreas a partir do cookie. Rotas que alteram estado exigem Origin do próprio
// app e, quando autenticadas, o token CSRF da sessão no cabeçalho X-CSRF-Token.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { preAuth, withTenant, type TenantContext, type Tx } from '../db/pool.ts';

export type Role = 'usuario' | 'revisor' | 'key_user' | 'admin_cliente' | 'admin_theneil';

export interface AreaRole { areaId: string; slug: string; name: string; role: Role; inherited?: boolean }

export interface AuthContext {
  sessionId: string;
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  roles: Role[];                               // papéis no tenant todo
  areaRoles: AreaRole[];
  areaIds: string[];
  allAreas: boolean;                           // admin do cliente ou da TheNeil vê todas as áreas
  onboardingDone: boolean;                     // já passou pelo roteiro de primeiro acesso
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest { auth: AuthContext | null }
}

export function cookieName(secure: boolean) {
  // O prefixo __Host- obriga Secure, Path=/ e nenhum Domain no navegador.
  return secure ? '__Host-gia_session' : 'gia_session';
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest();

export function tenantCtx(auth: AuthContext): TenantContext {
  return { tenantId: auth.tenantId, userId: auth.userId, areaIds: auth.areaIds, allAreas: auth.allAreas };
}

// Cria a sessão (dentro do contexto do tenant) e grava o cookie.
export async function startSession(app: FastifyInstance, reply: FastifyReply, tx: Tx, tenantId: string, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const ttlH = app.deps.config.SESSION_TTL_HOURS;
  await tx.query(
    `insert into sessions (tenant_id, user_id, token_hash, csrf_token, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
    [tenantId, userId, hashToken(token), csrf, ttlH],
  );
  await tx.query(`update users set last_login_at = now() where id = $1`, [userId]);
  const secure = app.deps.config.COOKIE_SECURE;
  reply.setCookie(cookieName(secure), token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: ttlH * 3600 });
  return { csrfToken: csrf };
}

async function loadAuth(app: FastifyInstance, req: FastifyRequest): Promise<AuthContext | null> {
  const token = req.cookies[cookieName(app.deps.config.COOKIE_SECURE)];
  if (!token || token.length > 200) return null;
  const rows = await preAuth<{ session_id: string; tenant_id: string; user_id: string; csrf_token: string }>(
    app.deps.db, 'select * from session_lookup($1)', [hashToken(token)]);
  const s = rows[0];
  if (!s) return null;
  return withTenant(app.deps.db, { tenantId: s.tenant_id, userId: s.user_id }, async tx => {
    await tx.query(`update sessions set last_seen_at = now() where id = $1 and last_seen_at < now() - interval '5 minutes'`, [s.session_id]);
    const m = await loadMembership(tx, s.user_id);
    return { sessionId: s.session_id, tenantId: s.tenant_id, userId: s.user_id, csrfToken: s.csrf_token, ...m };
  });
}

// Papéis e áreas de uma pessoa (a transação já está no contexto do tenant).
// Usado pela sessão e pelas tarefas na fila, que agem em nome de quem pediu.
// Papel numa área vale nas subáreas (herdado), exceto quando a subárea não
// herda (inherit_permissions falso) ou quando a pessoa tem papel próprio nela,
// que sobrescreve o herdado. Área desativada (ou abaixo de uma desativada) não
// dá acesso; o admin do cliente continua vendo todas.
export async function loadMembership(tx: Tx, userId: string) {
  const u = (await tx.query(`select email, name, onboarding_done_at from users where id = $1`, [userId])).rows[0] ?? { email: '', name: '', onboarding_done_at: null };
  const m = (await tx.query(`select role, area_id from memberships where user_id = $1`, [userId])).rows as { role: Role; area_id: string | null }[];
  const roles = m.filter(r => !r.area_id).map(r => r.role);
  const allAreas = roles.includes('admin_cliente') || roles.includes('admin_theneil');
  const areaRoles: AreaRole[] = [];
  if (m.some(r => r.area_id)) {
    const areas = (await tx.query(`select id, slug, name, parent_id, active, inherit_permissions from areas order by position, name`)).rows as
      { id: string; slug: string; name: string; parent_id: string | null; active: boolean; inherit_permissions: boolean }[];
    const explicit = new Map<string, Role[]>();
    for (const r of m.filter(r => r.area_id)) explicit.set(r.area_id!, [...(explicit.get(r.area_id!) ?? []), r.role]);
    const children = new Map<string | null, typeof areas>();
    for (const a of areas) children.set(a.parent_id, [...(children.get(a.parent_id) ?? []), a]);
    const walk = (parent: string | null, inherited: Role[]) => {
      for (const a of children.get(parent) ?? []) {
        if (!a.active) continue;                                      // desativada: ela e as de baixo ficam sem acesso
        const own = explicit.get(a.id);
        const eff = own ?? (a.inherit_permissions ? inherited : []);
        for (const role of eff) areaRoles.push({ areaId: a.id, slug: a.slug, name: a.name, role, inherited: !own });
        walk(a.id, eff);
      }
    };
    walk(null, []);
  }
  return { email: u.email as string, name: u.name as string, roles, areaRoles, areaIds: [...new Set(areaRoles.map(a => a.areaId))], allAreas, onboardingDone: !!u.onboarding_done_at };
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Origin permitido: a URL pública do app ou um host de tenant cadastrado.
async function originAllowed(app: FastifyInstance, origin: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  const pub = new URL(app.deps.config.PUBLIC_URL);
  if (u.origin === pub.origin) return true;
  if (u.protocol !== pub.protocol) return false;
  const rows = await preAuth(app.deps.db, 'select * from public_tenant($1, $2)', [u.hostname, '']);
  return rows.length > 0;
}

export async function sessionPlugin(app: FastifyInstance) {
  app.decorateRequest('auth', null);
  app.addHook('preHandler', async (req, reply) => {
    req.auth = await loadAuth(app, req);
    if (SAFE.has(req.method) || !req.url.startsWith('/api/')) return;
    // Toda escrita: Origin (ou Referer) precisa ser do próprio app.
    const origin = (req.headers.origin as string) || (req.headers.referer ? new URL(String(req.headers.referer)).origin : '');
    if (!origin || !(await originAllowed(app, origin))) {
      return reply.code(403).send({ error: 'origem_nao_permitida' });
    }
    // Com sessão: token CSRF da sessão no cabeçalho.
    if (req.auth) {
      const sent = String(req.headers['x-csrf-token'] || '');
      if (!sent || !sameToken(sent, req.auth.csrfToken)) return reply.code(403).send({ error: 'csrf_invalido' });
    }
  });
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply): AuthContext | null {
  if (!req.auth) { reply.code(401).send({ error: 'nao_autenticado' }); return null; }
  return req.auth;
}
