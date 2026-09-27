// Login por código e sessões da plataforma. Duas portas separadas:
// - console do operador da plataforma (cookie gia_p, sessão sem empresa), só para admins da plataforma;
// - ambiente de cada empresa (cookie gia_s, sessão presa ao company_id resolvido pelo servidor).
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { erro } from '../http.js';
import { exec, um } from '../db.js';

export const COOKIE_EMPRESA = 'gia_s';
export const COOKIE_PLATAFORMA = 'gia_p';
export const COOKIE_CONTEXTO = 'gia_t';
const VALIDADE_CODIGO_MS = 10 * 60e3, MAX_TENTATIVAS = 5, MAX_CODIGOS = 3, JANELA_MS = 15 * 60e3, SESSAO_MS = 12 * 3600e3;

const sha = s => createHash('sha256').update(s).digest('hex');
const iguais = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const normEmail = e => String(e || '').trim().toLowerCase();
export const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

export async function enviarCodigo(P, email, escopo, remetente, assunto) {
  const agora = P.agora().getTime();
  const antigo = um(P.db, 'select enviados from login_codes where email = ? and scope = ?', email, escopo);
  const enviados = JSON.parse(antigo?.enviados || '[]').filter(t => agora - t < JANELA_MS);
  if (enviados.length >= MAX_CODIGOS) throw erro(429, 'muitos_codigos', 'Muitos códigos pedidos. Espere alguns minutos.');
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sal = randomBytes(8).toString('hex');
  exec(P.db, `insert into login_codes (email, scope, hash, expira, tentativas, enviados) values (?, ?, ?, ?, 0, ?)
    on conflict (email, scope) do update set hash = excluded.hash, expira = excluded.expira, tentativas = 0, enviados = excluded.enviados`,
  email, escopo, `${sal}$${sha(sal + codigo)}`, agora + VALIDADE_CODIGO_MS, JSON.stringify([...enviados, agora]));
  await remetente.enviar(email, `${assunto}: ${codigo}`, `Seu código de acesso é ${codigo}.\n\nEle vale por 10 minutos. Se você não pediu, ignore este email.`);
}

export function conferirCodigo(P, email, escopo, codigo) {
  const c = um(P.db, 'select hash, expira, tentativas from login_codes where email = ? and scope = ?', email, escopo);
  const invalido = erro(401, 'codigo_invalido', 'Código inválido ou vencido. Peça um novo.');
  if (!c || c.expira < P.agora().getTime() || c.tentativas >= MAX_TENTATIVAS) throw invalido;
  const [sal, hash] = c.hash.split('$');
  if (!/^\d{6}$/.test(String(codigo || '')) || !iguais(sha(sal + codigo), hash)) {
    exec(P.db, 'update login_codes set tentativas = tentativas + 1 where email = ? and scope = ?', email, escopo);
    throw invalido;
  }
  exec(P.db, 'update login_codes set expira = 0 where email = ? and scope = ?', email, escopo);   // uso único
}

const cookie = (P, nome, valor, maxAge) => `${nome}=${valor}; HttpOnly${P.cookieSeguro ? '; Secure' : ''}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
export function adicionarCookie(res, valor) {
  const atual = res.getHeader('set-cookie');
  res.setHeader('set-cookie', [...(Array.isArray(atual) ? atual : atual ? [atual] : []), valor]);
}

export function abrirSessao(P, res, userId, companyId, via = 'login') {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  exec(P.db, 'insert into sessions (token_hash, user_id, company_id, csrf, expira, via) values (?, ?, ?, ?, ?, ?)', sha(token), userId, companyId ?? null, csrf, P.agora().getTime() + SESSAO_MS, via);
  adicionarCookie(res, cookie(P, companyId ? COOKIE_EMPRESA : COOKIE_PLATAFORMA, token, SESSAO_MS / 1000));
  return csrf;
}

export function fecharSessao(P, res, cookies, companyId) {
  const nome = companyId ? COOKIE_EMPRESA : COOKIE_PLATAFORMA;
  if (cookies[nome]) exec(P.db, 'delete from sessions where token_hash = ?', sha(cookies[nome]));
  adicionarCookie(res, cookie(P, nome, '', 0));
}

export const definirContexto = (P, res, companyId) => adicionarCookie(res, cookie(P, COOKIE_CONTEXTO, encodeURIComponent(companyId), 30 * 86400));

// Sessão válida só para o escopo pedido: a da empresa X não vale na empresa Y nem no console.
export function lerSessaoBruta(P, cookies, companyId) {
  const token = cookies[companyId ? COOKIE_EMPRESA : COOKIE_PLATAFORMA];
  if (!token) return null;
  const s = um(P.db, `select s.user_id, s.company_id, s.csrf, s.expira, s.via, u.email, u.name, u.status from sessions s join users u on u.id = s.user_id where s.token_hash = ?`, sha(token));
  if (!s || s.expira < P.agora().getTime() || s.status !== 'ativo') return null;
  if ((s.company_id || null) !== (companyId || null)) return null;
  return s;
}

export function checarCsrf(sessao, req) {
  const t = String(req.headers['x-csrf'] || '');
  if (!sessao || !t || !iguais(t, sessao.csrf)) throw erro(403, 'csrf', 'Sessão inválida. Recarregue a página.');
}
