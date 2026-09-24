// Sessão por cookie: token aleatório no cookie (HttpOnly, Secure, SameSite=Lax),
// só o sha256 dele no banco. Toda requisição resolve usuário, tenant, papéis e
// áreas a partir do cookie. Rotas que alteram estado exigem Origin do próprio
// app e, quando autenticadas, o token CSRF da sessão no cabeçalho X-CSRF-Token.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { preAuth, withTenant, type TenantContext, type Tx } from '../db/pool.ts';

export type Role = 'usuario' | 'revisor' | 'key_user' | 'admin_cliente' | 'admin_theneil';

export interface AuthContext {
  sessionId: string;
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  roles: Role[];                               // papéis no tenant todo
  areaRoles: { areaId: string; slug: string; name: string; role: Role }[];
  areaIds: string[];
  allAreas: boolean;                           // admin do cliente ou da TheNeil vê todas as áreas
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
    const u = (await tx.query(`select email, name from users where id = $1`, [s.user_id])).rows[0];
    const m = (await tx.query(
      `select m.role, m.area_id, a.slug, a.name from memberships m left join areas a on a.id = m.area_id where m.user_id = $1`,
      [s.user_id])).rows;
    await tx.query(`update sessions set last_seen_at = now() where id = $1 and last_seen_at < now() - interval '5 minutes'`, [s.session_id]);
    const roles = m.filter(r => !r.area_id).map(r => r.role as Role);
    const areaRoles = m.filter(r => r.area_id).map(r => ({ areaId: r.area_id, slug: r.slug, name: r.name, role: r.role as Role }));
    const allAreas = roles.includes('admin_cliente') || roles.includes('admin_theneil');
    return {
      sessionId: s.session_id, tenantId: s.tenant_id, userId: s.user_id, email: u.email, name: u.name,
      roles, areaRoles, areaIds: [...new Set(areaRoles.map(a => a.areaId))], allAreas, csrfToken: s.csrf_token,
    };
  });
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
