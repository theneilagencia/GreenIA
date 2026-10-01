// Contatos comerciais da página de vendas (modo multiempresa). Retenção: 24 meses depois da última interação
// comercial relevante registrada no sistema (last_interaction_at). Vencido o prazo, os dados pessoais são eliminados;
// fica só uma contagem agregada (mês de entrada e faixa de pessoas), sem nome, email, empresa, cargo nem mensagem.
// Não há limite de quantidade que apague contatos: a listagem é paginada. Hold (obrigação legal, contrato ou litígio)
// suspende a eliminação. Só o formulário e o registro manual de uma interação real movem last_interaction_at.
import { randomUUID } from 'node:crypto';
import { erro } from '../http.js';
import { exec, todos, um, transacao } from '../db.js';
import { auditar } from './auditoria.js';
import { lerAjuste } from './db.js';

export const PRAZO_CONTATOS_MESES = 24;
export const TIPOS_INTERACAO = { resposta: 'Resposta ao contato', reuniao: 'Reunião ou apresentação', proposta: 'Proposta', contato: 'Novo contato comercial', outro: 'Outra interação comercial' };
export const TIPOS_HOLD_CONTATO = { legal: 'Obrigação legal', contrato: 'Contrato', litigio: 'Litígio' };
const iso = d => new Date(d).toISOString();

// Limite do prazo: 24 meses de calendário antes de `agora` (UTC).
export function limiteRetencao(agora) {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - PRAZO_CONTATOS_MESES);
  return d.toISOString();
}

// Contatos guardados no formato antigo (lista em platform_settings, cortada em 500): viram linhas, com a data do
// formulário como última interação. A lista antiga sai do banco. Idempotente.
export function migrarContatosAntigos(P) {
  const antigos = lerAjuste(P.db, 'leads', null);
  if (!Array.isArray(antigos)) return 0;
  transacao(P.db, () => {
    for (const l of antigos) {
      const em = l.em || iso(P.agora());
      const id = `ct_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      exec(P.db, 'insert into commercial_contacts (id, created_at, last_interaction_at, nome, email, empresa, cargo, pessoas, mensagem) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, em, em, l.nome || '', String(l.email || '').toLowerCase(), l.empresa || '', l.cargo || '', l.pessoas || '', l.mensagem || '');
      exec(P.db, "insert into commercial_interactions (contact_id, at, tipo, por) values (?, ?, 'formulario', 'migracao')", id, em);
    }
    exec(P.db, "delete from platform_settings where key = 'leads'");
  });
  auditar(P, { acao: 'contacts.migrated', entidade: 'commercial_contacts', depois: { quantidade: antigos.length }, origem: { painel: 'migracao' } });
  return antigos.length;
}

// Formulário da página de vendas: o mesmo email volta para o mesmo contato (dados atualizados, nova interação).
export function registrarFormulario(P, lead) {
  const agora = iso(P.agora());
  const email = String(lead.email).toLowerCase();
  const existente = um(P.db, 'select id from commercial_contacts where email = ?', email);
  let id;
  if (existente) {
    id = existente.id;
    exec(P.db, 'update commercial_contacts set nome = ?, empresa = ?, cargo = ?, pessoas = ?, mensagem = ?, last_interaction_at = ? where id = ?',
      lead.nome, lead.empresa, lead.cargo || '', lead.pessoas || '', lead.mensagem || '', agora, id);
  } else {
    id = `ct_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    exec(P.db, 'insert into commercial_contacts (id, created_at, last_interaction_at, nome, email, empresa, cargo, pessoas, mensagem) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, agora, agora, lead.nome, email, lead.empresa, lead.cargo || '', lead.pessoas || '', lead.mensagem || '');
  }
  exec(P.db, "insert into commercial_interactions (contact_id, at, tipo, por, nota) values (?, ?, 'formulario', 'formulario', ?)", id, agora, lead.mensagem || '');
  auditar(P, { acao: existente ? 'contact.interaction' : 'contact.created', entidade: 'commercial_contact', id, depois: { tipo: 'formulario' }, origem: { painel: 'vendas' } });
  return { id, novo: !existente };
}

const exigirContato = (P, id) => { const c = um(P.db, 'select * from commercial_contacts where id = ?', id); if (!c) throw erro(404, 'contato', 'Contato não encontrado.'); return c; };

// Interação real registrada por um admin da plataforma (resposta, reunião, proposta...). A data pode ser a de uma
// interação já ocorrida (nunca no futuro); last_interaction_at fica com a mais recente.
export function registrarInteracao(P, id, { tipo, nota = '', em = null, por, ator, origem }) {
  const c = exigirContato(P, id);
  if (!TIPOS_INTERACAO[tipo]) throw erro(400, 'tipo', `Escolha o tipo da interação: ${Object.values(TIPOS_INTERACAO).join(', ')}.`);
  const agora = P.agora().getTime();
  const quando = em ? Date.parse(em) : agora;
  if (!Number.isFinite(quando) || quando > agora) throw erro(400, 'data', 'Informe a data da interação (hoje ou antes).');
  exec(P.db, 'insert into commercial_interactions (contact_id, at, tipo, por, nota) values (?, ?, ?, ?, ?)', id, iso(quando), tipo, por, String(nota || '').slice(0, 500));
  if (iso(quando) > c.last_interaction_at) exec(P.db, 'update commercial_contacts set last_interaction_at = ? where id = ?', iso(quando), id);
  auditar(P, { usuario: ator ?? null, acao: 'contact.interaction', entidade: 'commercial_contact', id, depois: { tipo, em: iso(quando) }, origem });
  return um(P.db, 'select * from commercial_contacts where id = ?', id);
}

export function marcarHoldContato(P, id, { tipo, motivo, por, ator, origem }) {
  exigirContato(P, id);
  if (!TIPOS_HOLD_CONTATO[tipo]) throw erro(400, 'hold_tipo', `Escolha o motivo do hold: ${Object.values(TIPOS_HOLD_CONTATO).join(', ')}.`);
  if (String(motivo || '').trim().length < 10) throw erro(400, 'hold_motivo', 'Descreva o motivo do hold (pelo menos 10 caracteres).');
  exec(P.db, 'update commercial_contacts set hold_motivo = ?, hold_por = ?, hold_em = ? where id = ?', `${TIPOS_HOLD_CONTATO[tipo]}: ${String(motivo).trim()}`, por, iso(P.agora()), id);
  auditar(P, { usuario: ator ?? null, acao: 'contact.hold', entidade: 'commercial_contact', id, depois: { tipo, por }, origem });
  return um(P.db, 'select * from commercial_contacts where id = ?', id);
}
export function liberarHoldContato(P, id, { por, ator, origem }) {
  const c = exigirContato(P, id);
  if (!c.hold_em) throw erro(409, 'sem_hold', 'Este contato não está em hold.');
  exec(P.db, 'update commercial_contacts set hold_motivo = null, hold_por = null, hold_em = null where id = ?', id);
  auditar(P, { usuario: ator ?? null, acao: 'contact.hold_released', entidade: 'commercial_contact', id, depois: { por }, origem });
  return um(P.db, 'select * from commercial_contacts where id = ?', id);
}

// Rodada de hora em hora: elimina os contatos sem interação há mais de 24 meses e sem hold. Sem `aplicar`, só
// registra (dry-run). Revalida cada um antes de eliminar. Logs e auditoria levam só ids e contagens.
export function rodadaContatos(P, { aplicar = false, log = () => {} } = {}) {
  const limite = limiteRetencao(P.agora());
  const vencidos = todos(P.db, 'select id from commercial_contacts where last_interaction_at < ? and hold_em is null', limite).map(x => x.id);
  const eliminados = [];
  if (aplicar) for (const id of vencidos) {
    const c = um(P.db, 'select * from commercial_contacts where id = ?', id);
    if (!c || c.hold_em || c.last_interaction_at >= limiteRetencao(P.agora())) continue;
    transacao(P.db, () => {
      exec(P.db, `insert into commercial_contacts_stats (mes, pessoas, eliminados) values (?, ?, 1)
        on conflict (mes, pessoas) do update set eliminados = eliminados + 1`, c.created_at.slice(0, 7), c.pessoas || '');
      exec(P.db, 'delete from commercial_interactions where contact_id = ?', id);
      exec(P.db, 'delete from commercial_contacts where id = ?', id);
    });
    auditar(P, { acao: 'contact.deleted', entidade: 'commercial_contact', id, depois: { motivo: `retencao_${PRAZO_CONTATOS_MESES}_meses` }, origem: { painel: 'retencao' } });
    eliminados.push(id);
  }
  if (vencidos.length) log(`contatos comerciais${aplicar ? '' : ' (dry-run)'}: ${vencidos.length} sem interação há mais de ${PRAZO_CONTATOS_MESES} meses${aplicar ? `, ${eliminados.length} eliminado(s)` : ''}`);
  return { vencidos, eliminados, limite };
}

// Console: paginado (sem corte destrutivo). Mostra a data-limite de cada contato.
export function listarContatos(P, { pagina = 0, porPagina = 50 } = {}) {
  const total = um(P.db, 'select count(*) as n from commercial_contacts').n;
  const fim = c => { const d = new Date(c.last_interaction_at); d.setUTCMonth(d.getUTCMonth() + PRAZO_CONTATOS_MESES); return d.toISOString(); };
  const itens = todos(P.db, 'select * from commercial_contacts order by last_interaction_at desc limit ? offset ?', porPagina, pagina * porPagina).map(c => ({
    id: c.id, em: c.created_at, ultimaInteracao: c.last_interaction_at, eliminarApos: c.hold_em ? null : fim(c),
    nome: c.nome, email: c.email, empresa: c.empresa, cargo: c.cargo, pessoas: c.pessoas, mensagem: c.mensagem,
    hold: c.hold_em ? { motivo: c.hold_motivo, por: c.hold_por, em: c.hold_em } : null,
    interacoes: todos(P.db, 'select at, tipo, por from commercial_interactions where contact_id = ? order by at desc limit 20', c.id),
  }));
  return { total, pagina, porPagina, itens, prazoMeses: PRAZO_CONTATOS_MESES };
}
