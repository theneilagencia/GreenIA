// Login: código por email e OIDC (Entra ID, Google Workspace), sessão e saída.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { withTenant, type Tx } from '../db/pool.ts';
import { resolveTenant } from '../tenants/routes.ts';
import { parseTenantConfig } from '../tenants/config.ts';
import { audit } from '../audit.ts';
import { secretFromEnv } from '../config.ts';
import { cookieName, requireAuth, startSession, tenantCtx } from './session.ts';

const CODE_TTL_MIN = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODE_MAX_PER_15MIN = 3;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).refine(e => e.length <= 254);
const domainOf = (email: string) => email.split('@')[1] || '';

async function domainAllowed(tx: Tx, tenantId: string, email: string) {
  const r = await tx.query(`select 1 from tenant_domains where tenant_id = $1 and domain = $2`, [tenantId, domainOf(email)]);
  return (r.rowCount || 0) > 0;
}

// Usuário existente e ativo, ou criado agora se o tenant permitir (papel usuario).
async function findOrProvisionUser(tx: Tx, tenantId: string, email: string, name: string, autoProvision: boolean) {
  const found = (await tx.query(`select id, status from users where email = $1`, [email])).rows[0];
  if (found) return found.status === 'ativo' ? found.id as string : null;
  if (!autoProvision) return null;
  const u = (await tx.query(`insert into users (tenant_id, email, name) values ($1, $2, $3) returning id`, [tenantId, email, name])).rows[0];
  await tx.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'usuario')`, [tenantId, u.id]);
  await audit(tx, { tenantId, actorUserId: u.id, action: 'usuario_criado_no_primeiro_login' });
  return u.id as string;
}

// Só caminho relativo do próprio app (evita redirecionamento aberto).
function safeReturnTo(v: unknown) {
  const s = typeof v === 'string' ? v : '/';
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(s) ? s : '/';
}

// Configurações OIDC descobertas, por provedor (o documento de descoberta muda pouco).
const oidcCache = new Map<string, { at: number; config: oidc.Configuration }>();

interface ProviderRow { id: string; kind: string; config: Record<string, unknown>; enabled: boolean }

async function oidcConfig(app: FastifyInstance, p: ProviderRow) {
  const hit = oidcCache.get(p.id);
  if (hit && Date.now() - hit.at < 3600_000) return hit.config;
  const c = p.config as { issuer?: string; clientId?: string; clientSecretEnv?: string; allowInsecure?: boolean };
  if (!c.issuer || !c.clientId) throw new Error('provedor OIDC sem issuer ou clientId');
  const secret = secretFromEnv(c.clientSecretEnv);
  if (!secret) throw new Error('segredo do provedor OIDC não definido no ambiente');
  // HTTP sem TLS só em teste, com o emissor simulado.
  const insecure = app.deps.config.NODE_ENV === 'test' && c.allowInsecure === true;
  const config = await oidc.discovery(new URL(c.issuer), c.clientId, secret, undefined,
    insecure ? { execute: [oidc.allowInsecureRequests] } : undefined);
  oidcCache.set(p.id, { at: Date.now(), config });
  return config;
}

// Origem do callback: a do próprio pedido, se for a URL pública ou um host de tenant.
function callbackUrl(app: FastifyInstance, req: FastifyRequest, tenantHostOk: boolean) {
  const pub = new URL(app.deps.config.PUBLIC_URL);
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  const base = tenantHostOk && host && host !== pub.hostname ? `${pub.protocol}//${host}` : pub.origin;
  return base + '/api/auth/oidc/callback';
}

// Checagens além das do protocolo: diretório (tid) do Entra ou domínio (hd) do Google.
function claimsAllowed(kind: string, cfg: Record<string, unknown>, claims: Record<string, unknown>) {
  if (kind === 'entra') return typeof cfg.tenantId === 'string' && claims.tid === cfg.tenantId;
  if (kind === 'google') return typeof cfg.hostedDomain === 'string' && claims.hd === cfg.hostedDomain && claims.email_verified === true;
  return true;
}

function emailFromClaims(kind: string, claims: Record<string, unknown>) {
  const v = kind === 'entra' ? (claims.email || claims.preferred_username) : claims.email;
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export async function authRoutes(app: FastifyInstance) {
  const deny = async (reply: FastifyReply, tenantId: string, reason: string, details: Record<string, unknown> = {}) => {
    await withTenant(app.deps.db, { tenantId }, tx => audit(tx, { tenantId, action: 'login_negado', details: { reason, ...details } }));
    return reply.code(403).send({ error: 'acesso_negado' });
  };

  // ---- Código por email -----------------------------------------------------------

  // Resposta sempre igual (202), para não revelar se o email ou o domínio existem.
  app.post('/api/auth/email/start', async (req, reply) => {
    const t = await resolveTenant(app, req);
    if (!t) return reply.code(404).send({ error: 'tenant_nao_encontrado' });
    const parsed = emailSchema.safeParse((req.body as Record<string, unknown> | null)?.email);
    if (!parsed.success) return reply.code(400).send({ error: 'email_invalido' });
    const email = parsed.data;
    await withTenant(app.deps.db, { tenantId: t.id }, async tx => {
      const enabled = (await tx.query(`select 1 from auth_providers where kind = 'email_code' and enabled`)).rowCount;
      if (!enabled || !(await domainAllowed(tx, t.id, email))) return;
      const recent = (await tx.query(`select count(*)::int as n from login_codes where email = $1 and created_at > now() - interval '15 minutes'`, [email])).rows[0].n;
      if (recent >= CODE_MAX_PER_15MIN) return;
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.query(
        `insert into login_codes (tenant_id, email, code_hash, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))`,
        [t.id, email, createHash('sha256').update(t.id + ':' + email + ':' + code).digest(), CODE_TTL_MIN]);
      const { config } = parseTenantConfig(t.config);
      await app.deps.email.send({
        to: email,
        subject: `Seu código de acesso à ${config.branding.productName}`,
        text: `Seu código de acesso é ${code}. Ele vale por ${CODE_TTL_MIN} minutos.\n\nSe você não pediu este código, ignore este email.`,
      });
    });
    return reply.code(202).send({ ok: true });
  });

  app.post('/api/auth/email/verify', async (req, reply) => {
    const t = await resolveTenant(app, req);
    if (!t) return reply.code(404).send({ error: 'tenant_nao_encontrado' });
    const body = (req.body || {}) as Record<string, unknown>;
    const parsed = emailSchema.safeParse(body.email);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!parsed.success || !/^\d{6}$/.test(code)) return reply.code(400).send({ error: 'dados_invalidos' });
    const email = parsed.data;
    const { config } = parseTenantConfig(t.config);
    const result = await withTenant(app.deps.db, { tenantId: t.id }, async tx => {
      const row = (await tx.query(
        `select id, code_hash, attempts from login_codes
         where email = $1 and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update`, [email])).rows[0];
      if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false as const };
      const expected = createHash('sha256').update(t.id + ':' + email + ':' + code).digest();
      if (!timingSafeEqual(expected, row.code_hash)) {
        await tx.query(`update login_codes set attempts = attempts + 1 where id = $1`, [row.id]);
        return { ok: false as const };
      }
      await tx.query(`update login_codes set consumed_at = now() where id = $1`, [row.id]);
      if (!(await domainAllowed(tx, t.id, email))) return { ok: false as const };
      const userId = await findOrProvisionUser(tx, t.id, email, '', config.autoProvision);
      if (!userId) return { ok: false as const };
      const s = await startSession(app, reply, tx, t.id, userId);
      await audit(tx, { tenantId: t.id, actorUserId: userId, action: 'login', details: { method: 'email_code' } });
      return { ok: true as const, csrfToken: s.csrfToken };
    });
    if (!result.ok) return reply.code(401).send({ error: 'codigo_invalido' });
    return { ok: true, csrfToken: result.csrfToken };
  });

  // ---- OIDC (Entra ID, Google Workspace) ----------------------------------------------

  app.get('/api/auth/oidc/:providerId/start', async (req, reply) => {
    const t = await resolveTenant(app, req);
    if (!t) return reply.code(404).send({ error: 'tenant_nao_encontrado' });
    const { providerId } = req.params as { providerId: string };
    if (!/^[0-9a-f-]{36}$/.test(providerId)) return reply.code(404).send({ error: 'provedor_nao_encontrado' });
    const p = await withTenant(app.deps.db, { tenantId: t.id }, tx =>
      tx.query<ProviderRow>(`select id, kind, config, enabled from auth_providers where id = $1 and enabled and kind in ('entra', 'google', 'oidc')`, [providerId])
        .then(r => r.rows[0]));
    if (!p) return reply.code(404).send({ error: 'provedor_nao_encontrado' });
    const config = await oidcConfig(app, p);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const redirectUri = callbackUrl(app, req, true);
    await withTenant(app.deps.db, { tenantId: t.id }, tx => tx.query(
      `insert into auth_flows (state, tenant_id, provider_id, code_verifier, nonce, return_to, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + interval '10 minutes')`,
      [state, t.id, p.id, verifier, nonce, safeReturnTo((req.query as Record<string, unknown>).returnTo)]));
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state, nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    return reply.redirect(url.href, 302);
  });

  app.get('/api/auth/oidc/callback', async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (!q.state || q.state.length > 200) return reply.code(400).send({ error: 'fluxo_invalido' });
    const flow = (await app.deps.db.query(`select * from auth_flow_take($1)`, [q.state])).rows[0];
    if (!flow) return reply.code(400).send({ error: 'fluxo_expirado' });
    const tenantId = flow.tenant_id as string;
    const p = await withTenant(app.deps.db, { tenantId }, tx =>
      tx.query<ProviderRow>(`select id, kind, config, enabled from auth_providers where id = $1 and enabled`, [flow.provider_id]).then(r => r.rows[0]));
    if (!p) return deny(reply, tenantId, 'provedor_desativado');
    const config = await oidcConfig(app, p);
    const current = new URL(callbackUrl(app, req, true));
    for (const [k, v] of Object.entries(q)) current.searchParams.set(k, v);
    let claims: Record<string, unknown>;
    try {
      // Valida assinatura, iss, aud, exp, nonce, state e PKCE.
      const tokens = await oidc.authorizationCodeGrant(config, current, {
        pkceCodeVerifier: flow.code_verifier, expectedState: q.state, expectedNonce: flow.nonce, idTokenExpected: true,
      });
      claims = (tokens.claims() || {}) as Record<string, unknown>;
    } catch (e) {
      return deny(reply, tenantId, 'token_invalido', { erro: (e as Error).name });
    }
    if (!claimsAllowed(p.kind, p.config, claims)) return deny(reply, tenantId, 'diretorio_ou_dominio_diferente', { kind: p.kind });
    const email = emailFromClaims(p.kind, claims);
    if (!emailSchema.safeParse(email).success) return deny(reply, tenantId, 'sem_email');
    const name = typeof claims.name === 'string' ? claims.name.slice(0, 200) : '';
    const ok = await withTenant(app.deps.db, { tenantId }, async tx => {
      const { config: tc } = parseTenantConfig((await tx.query(`select config from tenants where id = $1`, [tenantId])).rows[0]?.config);
      if (!(await domainAllowed(tx, tenantId, email))) return false;
      const userId = await findOrProvisionUser(tx, tenantId, email, name, tc.autoProvision);
      if (!userId) return false;
      await startSession(app, reply, tx, tenantId, userId);
      await audit(tx, { tenantId, actorUserId: userId, action: 'login', details: { method: p.kind } });
      return true;
    });
    if (!ok) return deny(reply, tenantId, 'dominio_nao_permitido_ou_usuario_bloqueado', { domain: domainOf(email) });
    return reply.redirect(flow.return_to || '/', 302);
  });

  // ---- Sessão --------------------------------------------------------------------------

  app.get('/api/session', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    return {
      user: { email: a.email, name: a.name },
      roles: a.roles,
      areas: a.areaRoles.map(r => ({ slug: r.slug, name: r.name, role: r.role })),
      onboardingDone: a.onboardingDone,
      csrfToken: a.csrfToken,
    };
  });

  // Roteiro de primeiro acesso concluído (ou pulado).
  app.post('/api/me/onboarding', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    await withTenant(app.deps.db, tenantCtx(a), tx => tx.query(`update users set onboarding_done_at = coalesce(onboarding_done_at, now()) where id = $1`, [a.userId]));
    return { onboardingDone: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    await withTenant(app.deps.db, { tenantId: a.tenantId, userId: a.userId }, async tx => {
      await tx.query(`delete from sessions where id = $1`, [a.sessionId]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'logout' });
    });
    reply.clearCookie(cookieName(app.deps.config.COOKIE_SECURE), { path: '/' });
    return { ok: true };
  });
}
