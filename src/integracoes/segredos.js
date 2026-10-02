// Cofre de segredos das integrações (por empresa). O segredo é cifrado (AES-256-GCM, chave-mestra da instalação) e
// guardado uma vez; o conector guarda só a referência { provider, key_id, tenant_id }. O valor nunca volta para a
// tela, nunca vai para log, auditoria, prompt ou URL: só o runtime o lê, na hora de montar a autenticação.
import { randomUUID } from 'node:crypto';
import { cifrar, decifrar } from '../plataforma/segredo.js';
import { exec, um, json } from '../db.js';

export const PROVIDER = 'greenia-local';
const mascarar = v => { const s = String(v || ''); return s.length <= 8 ? '••••' : `${s.slice(0, 3)}…${s.slice(-4)}`; };

// valor: string, ou objeto (OAuth: { client_id, client_secret, access_token, refresh_token, expira }).
export function guardarSegredo(app, { conectorId, tipo, valor, keyId = null }) {
  if (valor == null || (typeof valor === 'string' && !valor.trim())) throw new Error('segredo vazio');
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  if (texto.length > 16384) throw new Error('segredo grande demais');
  const id = keyId || `sec_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const agora = app.agora().toISOString();
  const mascara = typeof valor === 'string' ? mascarar(valor) : Object.keys(valor).filter(k => valor[k]).map(k => k.replace(/_/g, ' ')).join(', ');
  const existe = um(app.db, 'select key_id from connector_secrets_ref where key_id = ? and tenant_id = ?', id, app.tenantId);
  if (existe) exec(app.db, 'update connector_secrets_ref set cifrado = ?, mascara = ?, tipo = ?, rotacionado_em = ? where key_id = ? and tenant_id = ?', JSON.stringify(cifrar(app.mestra(), texto)), mascara, tipo, agora, id, app.tenantId);
  else exec(app.db, 'insert into connector_secrets_ref (key_id, tenant_id, connector_id, provider, tipo, cifrado, mascara, criado_em) values (?, ?, ?, ?, ?, ?, ?, ?)',
    id, app.tenantId, conectorId, PROVIDER, tipo, JSON.stringify(cifrar(app.mestra(), texto)), mascara, agora);
  return { provider: PROVIDER, key_id: id, tenant_id: app.tenantId };
}

// Só o runtime chama. A referência de outra empresa não existe neste banco (e o tenant_id também é conferido).
export function lerSegredo(app, ref) {
  if (!ref?.key_id || ref.tenant_id !== app.tenantId) return null;
  const r = um(app.db, 'select cifrado from connector_secrets_ref where key_id = ? and tenant_id = ?', ref.key_id, app.tenantId);
  if (!r) return null;
  const t = decifrar(app.mestra(), json(r.cifrado, null));
  if (t == null) return null;
  try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : t; } catch { return t; }
}
export function descreverSegredo(app, ref) {
  if (!ref?.key_id || ref.tenant_id !== app.tenantId) return null;
  const r = um(app.db, 'select tipo, mascara, criado_em, rotacionado_em from connector_secrets_ref where key_id = ? and tenant_id = ?', ref.key_id, app.tenantId);
  return r ? { tipo: r.tipo, mascara: r.mascara, criado_em: r.criado_em, rotacionado_em: r.rotacionado_em } : null;
}
export function apagarSegredo(app, ref) {
  if (ref?.key_id && ref.tenant_id === app.tenantId) exec(app.db, 'delete from connector_secrets_ref where key_id = ? and tenant_id = ?', ref.key_id, app.tenantId);
}

// Remoção de credenciais de qualquer objeto ou texto antes de log, auditoria, erro ou tela.
const CHAVE_SENSIVEL = /(authorization|auth|token|secret|senha|password|passwd|api[-_]?key|apikey|cookie|set-cookie|refresh|client[-_]?secret|private[-_]?key|signature|assinatura|credencial|credential|bearer)/i;
export function redigir(v, segredos = [], prof = 0) {
  if (prof > 8) return '[…]';
  if (typeof v === 'string') { let s = v; for (const x of segredos.filter(x => typeof x === 'string' && x.length >= 4)) s = s.split(x).join('[redigido]'); return s.replace(/(bearer|basic)\s+[\w.~+/=-]{6,}/gi, '$1 [redigido]'); }
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redigir(x, segredos, prof + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, CHAVE_SENSIVEL.test(k) ? '[redigido]' : redigir(x, segredos, prof + 1)]));
  return v;
}
// Valores secretos de um segredo lido (para tirar de mensagens de erro e respostas ecoadas).
export function valoresSecretos(s) { return s == null ? [] : typeof s === 'string' ? [s] : Object.values(s).filter(x => typeof x === 'string' && x.length >= 4); }
