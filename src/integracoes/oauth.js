// OAuth2 dos conectores: client credentials e authorization code (com state de uso único, PKCE S256, redirect exato
// e escopos mínimos). Tokens só no cofre (segredos.js); nunca na tela, em log, na URL de retorno ou em prompt.
import { randomBytes, createHash } from 'node:crypto';
import { exec, um } from '../db.js';
import { registrar } from '../eventos.js';
import { buscaSegura, ErroRede } from './rede.js';
import { redePrivadaDe } from './conectores.js';
import { lerSegredo, guardarSegredo } from './segredos.js';
import { ErroIntegracao, conectorOu404 } from './conectores.js';

const VALIDADE_STATE_MS = 10 * 60 * 1000;
const sha = s => createHash('sha256').update(String(s)).digest('hex');
const b64url = b => b.toString('base64url');
export const CAMINHO_RETORNO = '/api/integracoes/oauth/retorno';

function urlNaAllowlist(u, c, app = null) {
  let x; try { x = new URL(u); } catch { throw new ErroIntegracao(400, 'oauth_url', 'Endereço de autorização inválido.'); }
  const http = x.protocol === 'http:' && app && redePrivadaDe(app, c);
  if ((x.protocol !== 'https:' && !http) || !c.allowed_hosts.includes(x.hostname.toLowerCase())) throw new ErroIntegracao(400, 'oauth_url', 'O endereço de autorização precisa ser https e estar nos hosts autorizados da integração.');
  return x;
}

// Início do authorization code: devolve a URL para onde a pessoa vai (o navegador dela, não o servidor).
export function iniciarAutorizacao(app, pessoa, conectorId, { origem }) {
  const c = conectorOu404(app, conectorId);
  if (c.auth_type !== 'oauth2_authorization_code') throw new ErroIntegracao(400, 'oauth_tipo', 'Esta integração não usa autorização OAuth.');
  const segredo = lerSegredo(app, c.secret_ref);
  if (!segredo?.client_id) throw new ErroIntegracao(400, 'oauth_cliente', 'Cadastre o client id e o client secret antes de autorizar.');
  const esperado = `${origem}${CAMINHO_RETORNO}`;
  if (!c.config.redirect_uri || c.config.redirect_uri !== esperado) throw new ErroIntegracao(400, 'oauth_redirect', `O endereço de retorno da integração precisa ser exatamente ${esperado}.`);
  const auth = urlNaAllowlist(c.config.auth_url, c);
  const state = b64url(randomBytes(32)), verificador = b64url(randomBytes(32));
  exec(app.db, 'delete from oauth_estados where expira < ?', Date.now());
  exec(app.db, 'insert into oauth_estados (estado_hash, tenant_id, connector_id, pessoa_id, redirect, verificador, expira) values (?, ?, ?, ?, ?, ?, ?)',
    sha(state), app.tenantId, c.id, pessoa.id, esperado, verificador, Date.now() + VALIDADE_STATE_MS);
  const p = auth.searchParams;
  p.set('response_type', 'code'); p.set('client_id', segredo.client_id); p.set('redirect_uri', esperado); p.set('state', state);
  p.set('code_challenge', b64url(createHash('sha256').update(verificador).digest())); p.set('code_challenge_method', 'S256');
  if (c.config.escopos?.length) p.set('scope', c.config.escopos.join(' '));
  return { url: auth.toString() };
}

async function pedirToken(app, c, corpo) {
  const url = urlNaAllowlist(c.config.token_url, c, app).toString();
  const r = await buscaSegura({ url, metodo: 'POST', cabecalhos: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, corpo: new URLSearchParams(corpo).toString(),
    hosts: c.allowed_hosts, redePrivada: redePrivadaDe(app, c), tempoMs: Math.min(c.config.timeout_ms || 10000, 20000), sensiveis: ['authorization'] });
  let d = null; try { d = JSON.parse(r.corpo.toString('utf8')); } catch { /* resposta não JSON */ }
  if (r.status >= 400 || !d?.access_token) throw new ErroIntegracao(502, 'oauth_token', 'O servidor de autorização recusou a credencial.');
  return d;
}

// Retorno do provedor: confere state (uso único, mesma pessoa, mesma empresa, dentro do prazo), troca o code.
export async function concluirAutorizacao(app, pessoa, { state, code }) {
  if (!state || !code || String(state).length > 200 || String(code).length > 2000) throw new ErroIntegracao(400, 'oauth_retorno', 'Retorno de autorização inválido.');
  const e = um(app.db, 'select * from oauth_estados where estado_hash = ? and tenant_id = ?', sha(state), app.tenantId);
  exec(app.db, 'delete from oauth_estados where estado_hash = ?', sha(state));   // uso único, mesmo se falhar
  if (!e || e.expira < Date.now() || e.pessoa_id !== pessoa.id) throw new ErroIntegracao(400, 'oauth_state', 'Autorização expirada ou de outra sessão: comece de novo.');
  const c = conectorOu404(app, e.connector_id);
  const segredo = lerSegredo(app, c.secret_ref) || {};
  const d = await pedirToken(app, c, { grant_type: 'authorization_code', code: String(code), redirect_uri: e.redirect, code_verifier: e.verificador, client_id: segredo.client_id, client_secret: segredo.client_secret });
  guardarSegredo(app, { conectorId: c.id, tipo: 'oauth2', keyId: c.secret_ref.key_id, valor: { ...segredo, access_token: d.access_token, refresh_token: d.refresh_token || segredo.refresh_token || null, expira: Date.now() + (Number(d.expires_in) || 3600) * 1000, escopos_aprovados: String(d.scope || c.config.escopos.join(' ')).slice(0, 500) } });
  registrar(app, 'CONNECTOR_AUTHORIZED', pessoa.id, { connector: c.id, escopos: String(d.scope || '').split(/\s+/).filter(Boolean).slice(0, 20) });
  return { connector: c.id };
}

// Token de acesso válido para o runtime: client credentials ou refresh (com rotação do refresh token).
export async function tokenDeAcesso(app, c) {
  const s = lerSegredo(app, c.secret_ref);
  if (!s || typeof s !== 'object') throw new ErroIntegracao(400, 'credencial_ausente', 'A integração está sem credencial.');
  if (s.access_token && s.expira > Date.now() + 30_000) return s.access_token;
  let d;
  try {
    if (c.auth_type === 'oauth2_client_credentials') d = await pedirToken(app, c, { grant_type: 'client_credentials', client_id: s.client_id, client_secret: s.client_secret, ...(c.config.escopos?.length ? { scope: c.config.escopos.join(' ') } : {}) });
    else if (s.refresh_token) d = await pedirToken(app, c, { grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: s.client_id, client_secret: s.client_secret });
    else throw new ErroIntegracao(401, 'autorizacao_necessaria', 'A integração precisa ser autorizada de novo.');
  } catch (e) { if (e instanceof ErroRede) throw new ErroIntegracao(502, 'oauth_token', 'Não foi possível obter o token de acesso.'); throw e; }
  guardarSegredo(app, { conectorId: c.id, tipo: 'oauth2', keyId: c.secret_ref.key_id, valor: { ...s, access_token: d.access_token, refresh_token: d.refresh_token || s.refresh_token || null, expira: Date.now() + (Number(d.expires_in) || 3600) * 1000 } });
  return d.access_token;
}
