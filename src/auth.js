// Login por código enviado por email, sessão por cookie e proteção CSRF.
// OIDC (Microsoft, Google) fica para depois: um provedor só precisa de
// { id, nome, iniciar(ctx), retorno(ctx) } e de chamar abrirSessao() com a pessoa.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { erro } from './http.js';
import { exec, todos, um } from './db.js';
import { lerConfig } from './config.js';
import { registrar } from './eventos.js';

export const COOKIE = 'gl_sessao';
const VALIDADE_CODIGO_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 5;
const MAX_CODIGOS = 3;                 // por email, a cada 15 minutos
const JANELA_CODIGOS_MS = 15 * 60 * 1000;
const SESSAO_MS = 12 * 60 * 60 * 1000;

export const provedoresLogin = [];     // OIDC: não implementado nesta versão

const sha = s => createHash('sha256').update(s).digest('hex');
const iguais = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const normEmail = e => String(e || '').trim().toLowerCase();
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

export function dominioPermitido(cfg, email) {
  const d = email.split('@')[1];
  return cfg.dominios.map(x => x.toLowerCase().replace(/^@/, '')).includes(d);
}

export function carregarPessoa(db, id) {
  const p = um(db, 'select id, email, nome, papel, ativo, ciencia_versao from pessoas where id = ?', id);
  if (!p || !p.ativo) return null;
  const areas = todos(db, 'select a.id, a.nome, a.sigilosa, ap.responsavel from area_pessoas ap join areas a on a.id = ap.area_id where ap.pessoa_id = ? order by a.nome', id)
    .map(a => ({ id: a.id, nome: a.nome, sigilosa: !!a.sigilosa, responsavel: !!a.responsavel }));
  const grupos = todos(db, 'select grupo_id from grupo_pessoas where pessoa_id = ?', id).map(g => g.grupo_id);
  return { ...p, admin: p.papel === 'admin', areas, grupos };
}

export function lerSessao(app, cookies) {
  const token = cookies[COOKIE];
  if (!token) return null;
  const s = um(app.db, 'select pessoa_id, csrf, expira from sessoes where token_hash = ?', sha(token));
  if (!s || s.expira < app.agora().getTime()) return null;
  const pessoa = carregarPessoa(app.db, s.pessoa_id);
  return pessoa ? { pessoa, csrf: s.csrf } : null;
}

export function checarCsrf(sessao, req) {
  const t = String(req.headers['x-csrf'] || '');
  if (!t || !iguais(t, sessao.csrf)) throw erro(403, 'csrf', 'Sessão inválida. Recarregue a página.');
}

export function checarOrigem(req) {
  const o = req.headers.origin;
  if (o && new URL(o).host !== req.headers.host) throw erro(403, 'origem', 'Origem não permitida.');
}

export function abrirSessao(app, res, pessoaId) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  exec(app.db, 'insert into sessoes (token_hash, pessoa_id, csrf, expira) values (?, ?, ?, ?)', sha(token), pessoaId, csrf, app.agora().getTime() + SESSAO_MS);
  const seguro = app.cookieSeguro ? '; Secure' : '';
  res.setHeader('set-cookie', `${COOKIE}=${token}; HttpOnly${seguro}; SameSite=Lax; Path=/; Max-Age=${SESSAO_MS / 1000}`);
  return csrf;
}

export function rotasLogin(app, r) {
  r.post('/api/login/codigo', async ({ corpo }) => {
    const email = normEmail(corpo.email);
    if (!emailValido(email)) throw erro(400, 'email_invalido', 'Informe um email válido.');
    const cfg = lerConfig(app.db);
    if (!dominioPermitido(cfg, email) && !(app.operadores || []).includes(email)) throw erro(403, 'dominio', 'Use o seu email da empresa.');
    const agora = app.agora().getTime();
    const antigo = um(app.db, 'select enviados from codigos where email = ?', email);
    const enviados = JSON.parse(antigo?.enviados || '[]').filter(t => agora - t < JANELA_CODIGOS_MS);
    if (enviados.length >= MAX_CODIGOS) throw erro(429, 'muitos_codigos', 'Muitos códigos pedidos. Espere alguns minutos.');
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const sal = randomBytes(8).toString('hex');
    exec(app.db, `insert into codigos (email, hash, expira, tentativas, enviados) values (?, ?, ?, 0, ?)
      on conflict (email) do update set hash = excluded.hash, expira = excluded.expira, tentativas = 0, enviados = excluded.enviados`,
    email, `${sal}$${sha(sal + codigo)}`, agora + VALIDADE_CODIGO_MS, JSON.stringify([...enviados, agora]));
    await app.email.enviar(email, `Seu código de acesso à GreenIA: ${codigo}`,
      `Seu código de acesso é ${codigo}.\n\nEle vale por 10 minutos. Se você não pediu, ignore este email.`);
    return { ok: true };
  }, { publica: true });

  r.post('/api/login/entrar', async ({ corpo, res }) => {
    const email = normEmail(corpo.email);
    const codigo = String(corpo.codigo || '').trim();
    const c = um(app.db, 'select hash, expira, tentativas from codigos where email = ?', email);
    const invalido = erro(401, 'codigo_invalido', 'Código inválido ou vencido. Peça um novo.');
    if (!c || c.expira < app.agora().getTime() || c.tentativas >= MAX_TENTATIVAS) throw invalido;
    const [sal, hash] = c.hash.split('$');
    if (!/^\d{6}$/.test(codigo) || !iguais(sha(sal + codigo), hash)) {
      exec(app.db, 'update codigos set tentativas = tentativas + 1 where email = ?', email);
      throw invalido;
    }
    exec(app.db, 'update codigos set expira = 0 where email = ?', email);   // uso único
    if (!dominioPermitido(lerConfig(app.db), email) && !(app.operadores || []).includes(email)) throw erro(403, 'dominio', 'Use o seu email da empresa.');
    let p = um(app.db, 'select id, ativo from pessoas where email = ?', email);
    if (!p) p = { id: Number(exec(app.db, 'insert into pessoas (email, nome) values (?, ?)', email, email.split('@')[0]).lastInsertRowid), ativo: 1 };
    if (!p.ativo) throw erro(403, 'inativo', 'Seu acesso está desativado. Fale com o admin.');
    const csrf = abrirSessao(app, res, p.id);
    registrar(app, 'auth.login', p.id, {});
    return { ok: true, csrf };
  }, { publica: true });

  r.post('/api/sair', ({ req, res, cookies }) => {
    checarCsrf(lerSessao(app, cookies) || { csrf: '' }, req);
    if (cookies[COOKIE]) exec(app.db, 'delete from sessoes where token_hash = ?', sha(cookies[COOKIE]));
    res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return { ok: true };
  }, { publica: true });
}
