// Webhooks de entrada (gatilho "quando X acontecer"). Nada é confiável sem verificação: assinatura HMAC-SHA256 de
// "<timestamp>.<corpo>", timestamp dentro de 5 minutos, id de entrega único (replay), limite de taxa por webhook,
// isolamento por empresa (o webhook só existe no banco dela, com tenant_id) e rotação de segredo (o anterior vale
// por um período de transição). O corpo recebido não é guardado: só metadados.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { exec, um, json } from '../db.js';
import { registrar } from '../eventos.js';
import { cifrar, decifrar } from '../plataforma/segredo.js';
import { ErroIntegracao, novoId } from './conectores.js';

const TOLERANCIA_S = 300, TRANSICAO_MS = 24 * 3600 * 1000;
const janelas = new Map();
export const assinar = (segredo, ts, corpo) => createHmac('sha256', segredo).update(`${ts}.${corpo}`).digest('hex');

export function criarWebhook(app, pessoa, { conectorId = null, evento, filtros = {}, quickWinId = null }) {
  const segredo = randomBytes(32).toString('base64url');
  const id = novoId('whk');
  exec(app.db, 'insert into webhook_configs (id, tenant_id, connector_id, evento, filtros, segredos, quick_win_id, ativo, criado_em) values (?, ?, ?, ?, ?, ?, ?, 1, ?)',
    id, app.tenantId, conectorId, String(evento || 'evento').slice(0, 80), JSON.stringify(filtros && typeof filtros === 'object' ? filtros : {}), JSON.stringify([{ cifrado: cifrar(app.mestra(), segredo), desde: Date.now() }]), quickWinId, app.agora().toISOString());
  registrar(app, 'WEBHOOK_CREATED', pessoa?.id, { webhook: id, connector: conectorId, evento });
  // O segredo aparece UMA vez, para configurar o sistema de origem; depois disso, nunca mais.
  return { id, segredo, caminho: `/api/integracoes/webhooks/${id}` };
}
export function rotacionarSegredo(app, pessoa, id) {
  const w = um(app.db, 'select * from webhook_configs where id = ? and tenant_id = ?', String(id), app.tenantId);
  if (!w) throw new ErroIntegracao(404, 'nao_encontrado', 'Webhook não encontrado.');
  const novo = randomBytes(32).toString('base64url');
  const atuais = json(w.segredos, []).map(s => ({ ...s, expira: s.expira ?? Date.now() + TRANSICAO_MS }));
  exec(app.db, 'update webhook_configs set segredos = ?, rotacionado_em = ? where id = ? and tenant_id = ?', JSON.stringify([{ cifrado: cifrar(app.mestra(), novo), desde: Date.now() }, ...atuais.slice(0, 1)]), app.agora().toISOString(), w.id, app.tenantId);
  registrar(app, 'WEBHOOK_SECRET_ROTATED', pessoa?.id, { webhook: w.id });
  return { id: w.id, segredo: novo };
}

// Verificação da entrega. cabecalhos: x-greenia-timestamp, x-greenia-entrega, x-greenia-assinatura (sha256=<hex>).
export function receberWebhook(app, id, { cabecalhos, corpoBruto }) {
  const w = um(app.db, 'select * from webhook_configs where id = ? and tenant_id = ? and ativo = 1', String(id), app.tenantId);
  const negar = (codigo, status = 401) => { registrar(app, 'WEBHOOK_REJECTED', null, { webhook: w ? w.id : null, motivo: codigo }); throw new ErroIntegracao(status, codigo, 'Entrega recusada.'); };
  if (!w) negar('desconhecido', 404);
  const agora = Date.now();
  const l = (janelas.get(w.id) || []).filter(t => agora - t < 60_000);
  if (l.length >= 120) negar('limite', 429);
  l.push(agora); janelas.set(w.id, l);
  const ts = Number(cabecalhos['x-greenia-timestamp']), entrega = String(cabecalhos['x-greenia-entrega'] || ''), assinatura = String(cabecalhos['x-greenia-assinatura'] || '').replace(/^sha256=/, '');
  if (!Number.isFinite(ts) || Math.abs(agora / 1000 - ts) > TOLERANCIA_S) negar('timestamp');
  if (!/^[\w.-]{8,100}$/.test(entrega)) negar('entrega');
  if (!/^[0-9a-f]{64}$/.test(assinatura)) negar('assinatura');
  const validos = json(w.segredos, []).filter(s => !s.expira || s.expira > agora).map(s => decifrar(app.mestra(), s.cifrado)).filter(Boolean);
  const recebida = Buffer.from(assinatura, 'hex');
  const ok = validos.some(seg => { const esperado = Buffer.from(assinar(seg, ts, corpoBruto), 'hex'); return esperado.length === recebida.length && timingSafeEqual(esperado, recebida); });
  if (!ok) negar('assinatura');
  try { exec(app.db, 'insert into webhook_entregas (tenant_id, webhook_id, entrega_id, recebido_em) values (?, ?, ?, ?)', app.tenantId, w.id, entrega, new Date(agora).toISOString()); }
  catch { negar('replay', 409); }
  exec(app.db, 'delete from webhook_entregas where tenant_id = ? and recebido_em < ?', app.tenantId, new Date(agora - 7 * 864e5).toISOString());
  registrar(app, 'WEBHOOK_RECEIVED', null, { webhook: w.id, evento: w.evento, bytes: Buffer.byteLength(corpoBruto || '') });
  // Gatilho: um plano em espera para o Quick Win ligado (a execução continua governada pelo plano e pela política).
  if (w.quick_win_id) exec(app.db, "insert into integ_planos (id, tenant_id, quick_win_id, gatilho, passos, estado, status, criado_em, atualizado_em) values (?, ?, ?, 'webhook', '[]', ?, 'aguardando', ?, ?)",
    novoId('pln'), app.tenantId, w.quick_win_id, JSON.stringify({ webhook: w.id, entrega }), new Date(agora).toISOString(), new Date(agora).toISOString());
  return { recebido: true };
}
