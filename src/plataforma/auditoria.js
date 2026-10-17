// Auditoria administrativa: quem, em qual empresa, qual ação, em qual entidade, antes e depois, quando e de onde.
import { exec, todos, um } from '../db.js';

// Arquivos (imagens em data: URL) entram só com o tamanho, para a auditoria não guardar arquivos.
function limpar(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(limpar);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.startsWith('data:') ? `[arquivo de ${Math.max(1, Math.round(x.length * 3 / 4 / 1024))} KB]` : limpar(x)]));
  return v;
}

export function origemDe(req, painel) {
  const ip = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req?.socket?.remoteAddress || '';
  return { painel, ip, agente: String(req?.headers?.['user-agent'] || '').slice(0, 160) };
}

export function auditar(p, { usuario, empresa, acao, entidade, id, antes, depois, origem }) {
  exec(p.db, 'insert into audit_log (at, user_id, company_id, action, entity, entity_id, before, after, origin) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    p.agora().toISOString(), usuario ?? null, empresa ?? null, acao, entidade, id == null ? null : String(id),
    antes === undefined ? null : JSON.stringify(limpar(antes)), depois === undefined ? null : JSON.stringify(limpar(depois)), JSON.stringify(origem || {}));
}

export function listarAuditoria(p, { empresa, acao, pagina = 0, porPagina = 50 } = {}) {
  const cond = [], par = [];
  if (empresa) { cond.push('a.company_id = ?'); par.push(empresa); }
  if (acao) { cond.push('a.action like ?'); par.push(`${acao}%`); }
  const where = cond.length ? `where ${cond.join(' and ')}` : '';
  const total = um(p.db, `select count(*) as n from audit_log a ${where}`, ...par).n;
  const itens = todos(p.db, `select a.id, a.at, a.action, a.entity, a.entity_id, a.before, a.after, a.origin, u.email as usuario, c.name as empresa
    from audit_log a left join users u on u.id = a.user_id left join companies c on c.id = a.company_id ${where} order by a.id desc limit ? offset ?`, ...par, porPagina, pagina * porPagina)
    .map(x => ({ ...x, before: x.before ? JSON.parse(x.before) : null, after: x.after ? JSON.parse(x.after) : null, origin: JSON.parse(x.origin || '{}') }));
  return { total, itens, pagina };
}
