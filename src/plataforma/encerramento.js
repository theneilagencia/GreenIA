// Encerramento de um ambiente: cancelamento, devolução dos dados e exclusão definitiva.
// - Cancelar registra cancelled_at e delete_after (30 dias corridos). O uso normal para na hora, inclusive o da
//   equipe de operação; o único fluxo é recuperação/exportação com finalidade (exportacoes.js).
// - A exclusão definitiva é automática depois de delete_after (rodada de hora em hora; dry-run sem EXCLUSAO_APLICAR=1),
//   revalidando status, prazo e hold logo antes de excluir. Hold (obrigação legal ou incidente) impede a exclusão.
// - O Cliente pode pedir a exclusão antes do prazo ou uma cópia dos dados (devolução) dentro da janela, com código
//   enviado ao email de um admin autorizado. Pedido informal ao suporte não exclui nada.
// - A devolução é a cópia técnica completa do banco (SQLite), gerada pela equipe de operação e entregue por link de
//   uso único que vale até 7 dias.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { erro } from '../http.js';
import { exec, todos, um } from '../db.js';
import { auditar } from './auditoria.js';
import { normEmail, emailValido, enviarCodigo, conferirCodigo } from './sessao.js';
import { TIPOS_HOLD, criarExportacao, baixarExportacao, eliminarCopia } from './exportacoes.js';
import * as E from './empresas.js';

export const PRAZO_EXCLUSAO_DIAS = 30;
export const PRAZO_LINK_DIAS = 7;
const DIA = 864e5;
const iso = ms => new Date(ms).toISOString();
const agoraMs = P => P.agora().getTime();
const sha = s => createHash('sha256').update(s).digest('hex');


const linha = (P, companyId) => um(P.db, 'select * from company_deletion where company_id = ?', companyId);

// ---------------------------------------------------------------- Agenda da exclusão
export function agendarExclusao(P, c, { ator, origem, cancelledAt = null, estimado = false }) {
  const t = cancelledAt ? Date.parse(cancelledAt) : agoraMs(P);
  const deleteAfter = iso(t + PRAZO_EXCLUSAO_DIAS * DIA);
  exec(P.db, `insert into company_deletion (company_id, nome, slug, cancelled_at, delete_after, estimado, status, updated_at) values (?, ?, ?, ?, ?, ?, 'pendente', ?)
    on conflict (company_id) do update set nome = excluded.nome, slug = excluded.slug, cancelled_at = excluded.cancelled_at, delete_after = excluded.delete_after,
      estimado = excluded.estimado, status = 'pendente', antecipada_por = null, antecipada_em = null, deleted_at = null, deleted_via = null, updated_at = excluded.updated_at`,
  c.id, c.name, c.slug, iso(t), deleteAfter, estimado ? 1 : 0, iso(agoraMs(P)));
  auditar(P, { usuario: ator ?? null, empresa: c.id, acao: 'company.deletion_scheduled', entidade: 'company_deletion', id: c.id, depois: { cancelled_at: iso(t), delete_after: deleteAfter, estimado }, origem });
  return linha(P, c.id);
}

export function reverterExclusao(P, companyId, { ator, origem }) {
  const l = linha(P, companyId);
  if (!l || l.status !== 'pendente') return;
  exec(P.db, "update company_deletion set status = 'revertida', updated_at = ? where company_id = ?", iso(agoraMs(P)), companyId);
  for (const d of todos(P.db, "select id from data_returns where company_id = ? and status = 'solicitada'", companyId)) exec(P.db, "update data_returns set status = 'cancelada', motivo_fim = 'ambiente_reaberto', updated_at = ? where id = ?", iso(agoraMs(P)), d.id);
  auditar(P, { usuario: ator ?? null, empresa: companyId, acao: 'company.deletion_cancelled', entidade: 'company_deletion', id: companyId, antes: { delete_after: l.delete_after }, origem });
}

// Empresas já canceladas antes deste controle: a data vem do registro de cancelamento na auditoria
// (ou da última alteração), marcada como estimada. Roda no início; idempotente.
export function migrarCanceladas(P) {
  for (const c of todos(P.db, "select * from companies where status = 'cancelada' and id not in (select company_id from company_deletion where status = 'pendente')")) {
    const a = um(P.db, "select at from audit_log where company_id = ? and action = 'company.cancelled' order by id desc limit 1", c.id);
    agendarExclusao(P, c, { ator: null, origem: { painel: 'migracao' }, cancelledAt: a?.at || c.updated_at, estimado: true });
  }
}

// Revalidação logo antes de excluir: empresa ainda cancelada, agenda pendente, sem hold e, salvo exclusão
// antecipada pelo Cliente, prazo vencido. Devolve null quando pode, ou o motivo.
export function motivoQueImpede(P, companyId, { antecipada = false } = {}) {
  const c = E.lerEmpresa(P, companyId);
  if (!c) return 'empresa_inexistente';
  if (c.status !== 'cancelada') return 'nao_cancelada';
  const l = linha(P, companyId);
  if (!l || l.status !== 'pendente') return 'sem_agenda';
  if (l.hold_em) return 'hold';
  if (!antecipada && Date.parse(l.delete_after) > agoraMs(P)) return 'prazo';
  return null;
}
export const MENSAGENS_IMPEDIMENTO = {
  empresa_inexistente: 'Empresa não encontrada.',
  nao_cancelada: 'Cancele a empresa antes de excluir. A exclusão só vale para ambientes cancelados.',
  sem_agenda: 'Esta empresa não tem exclusão agendada.',
  hold: 'A exclusão está suspensa por hold (obrigação legal ou incidente).',
  prazo: `A exclusão definitiva só acontece ${PRAZO_EXCLUSAO_DIAS} dias depois do cancelamento, ou antes, a pedido verificado do Cliente.`,
};

// Depois da exclusão: agenda fechada, pedidos de devolução em aberto encerrados e a necessidade das cópias
// operacionais da empresa encerrada (prazo de 7 dias para eliminá-las, salvo hold).
export function concluirExclusao(P, companyId, { via }) {
  exec(P.db, "update company_deletion set status = 'excluida', deleted_at = ?, deleted_via = ?, updated_at = ? where company_id = ?", iso(agoraMs(P)), via, iso(agoraMs(P)), companyId);
  for (const d of todos(P.db, "select id from data_returns where company_id = ? and status = 'solicitada'", companyId)) exec(P.db, "update data_returns set status = 'cancelada', motivo_fim = 'ambiente_excluido', updated_at = ? where id = ?", iso(agoraMs(P)), d.id);
}

export function marcarHoldExclusao(P, companyId, { tipo, motivo, por, ator, origem }) {
  const l = linha(P, companyId);
  if (!l || l.status !== 'pendente') throw erro(409, 'sem_agenda', 'Esta empresa não tem exclusão agendada.');
  if (!TIPOS_HOLD[tipo]) throw erro(400, 'hold_tipo', `Escolha o motivo do hold: ${Object.values(TIPOS_HOLD).join(' ou ')}.`);
  if (String(motivo || '').trim().length < 10) throw erro(400, 'hold_motivo', 'Descreva o motivo do hold (pelo menos 10 caracteres).');
  exec(P.db, 'update company_deletion set hold_tipo = ?, hold_motivo = ?, hold_por = ?, hold_em = ?, updated_at = ? where company_id = ?', tipo, String(motivo).trim(), por, iso(agoraMs(P)), iso(agoraMs(P)), companyId);
  auditar(P, { usuario: ator ?? null, empresa: companyId, acao: 'company.deletion_hold', entidade: 'company_deletion', id: companyId, depois: { tipo, motivo: String(motivo).trim(), por }, origem });
  return linha(P, companyId);
}
export function liberarHoldExclusao(P, companyId, { por, ator, origem }) {
  const l = linha(P, companyId);
  if (!l?.hold_em) throw erro(409, 'sem_hold', 'A exclusão desta empresa não está em hold.');
  exec(P.db, 'update company_deletion set hold_tipo = null, hold_motivo = null, hold_por = null, hold_em = null, updated_at = ? where company_id = ?', iso(agoraMs(P)), companyId);
  auditar(P, { usuario: ator ?? null, empresa: companyId, acao: 'company.deletion_hold_released', entidade: 'company_deletion', id: companyId, antes: { tipo: l.hold_tipo, motivo: l.hold_motivo }, depois: { por }, origem });
  return linha(P, companyId);
}

// Rodada de hora em hora. Sem `aplicar`, só registra o que faria (dry-run). Idempotente: o que já foi excluído
// não volta ao plano; cada item é revalidado antes de excluir.
export function rodadaExclusoes(P, { aplicar = false, log = () => {} } = {}) {
  const vencidas = todos(P.db, "select company_id, delete_after, hold_em from company_deletion where status = 'pendente' and delete_after <= ?", iso(agoraMs(P)));
  const plano = vencidas.map(v => ({ companyId: v.company_id, deleteAfter: v.delete_after, impede: motivoQueImpede(P, v.company_id) }));
  const feitos = [];
  if (aplicar) for (const i of plano.filter(x => !x.impede)) {
    if (motivoQueImpede(P, i.companyId)) continue;   // revalida logo antes
    try { E.excluirEmpresa(P, i.companyId, null, null, { painel: 'retencao' }, { via: 'rotina' }); feitos.push(i.companyId); }
    catch (e) { log(`exclusão automática de ${i.companyId} falhou`, e.message); }
  }
  if (plano.length) log(`exclusões${aplicar ? '' : ' (dry-run)'}: ${plano.filter(x => !x.impede).length} ambiente(s) com prazo vencido${aplicar ? `, ${feitos.length} excluído(s)` : ''}; ${plano.filter(x => x.impede).length} impedido(s) (${[...new Set(plano.filter(x => x.impede).map(x => x.impede))].join(', ') || '—'})`);
  return { plano, excluidas: feitos };
}

export function listarExclusoes(P) {
  const agora = agoraMs(P);
  return todos(P.db, "select * from company_deletion where status = 'pendente' or deleted_at >= ? order by status = 'pendente' desc, delete_after", iso(agora - 90 * DIA)).map(l => ({
    companyId: l.company_id, nome: l.nome, slug: l.slug, status: l.status, canceladaEm: l.cancelled_at, excluirApos: l.delete_after, estimado: !!l.estimado,
    diasRestantes: l.status === 'pendente' ? Math.max(0, Math.ceil((Date.parse(l.delete_after) - agora) / DIA)) : null,
    hold: l.hold_em ? { tipo: l.hold_tipo, tipoNome: TIPOS_HOLD[l.hold_tipo], motivo: l.hold_motivo, por: l.hold_por, em: l.hold_em } : null,
    excluidaEm: l.deleted_at, via: l.deleted_via, antecipadaPor: l.antecipada_por,
    devolucoes: todos(P.db, 'select id, solicitante_email, solicitado_em, status, gerado_em, link_expira, entregue_em from data_returns where company_id = ? order by solicitado_em desc', l.company_id),
  }));
}

// ---------------------------------------------------------------- Pedidos do Cliente (código por email)
// Admin autorizado: admin cadastrado do ambiente (vínculo ativo ou convidado, sem ter sido desativado), usuário ativo e
// permissão company.manage. A posse do email é provada pelo código. Admin da plataforma sem vínculo não pede nada aqui.
function adminAutorizado(P, companyId, email) {
  return um(P.db, `select u.id, u.email from company_users cu join users u on u.id = cu.user_id join role_permissions rp on rp.role_id = cu.role_id
    where cu.company_id = ? and u.email = ? and cu.status in ('ativo','convidado') and u.status = 'ativo' and rp.permission_key = 'company.manage'`, companyId, email);
}
const escopoCodigo = companyId => `encerramento:${companyId}`;

function exigirJanela(P, empresa) {
  if (empresa.status !== 'cancelada') throw erro(409, 'nao_cancelada', 'Este ambiente não está encerrado.');
  const l = linha(P, empresa.id);
  if (!l || l.status !== 'pendente') throw erro(409, 'sem_agenda', 'Este ambiente não está mais disponível para pedidos.');
  return l;
}

export function rotasEncerramentoEmpresa(P, r) {
  // Situação da janela (pública: nada sensível além do prazo).
  r.get('/api/encerramento', ({ empresa }) => {
    if (empresa.status !== 'cancelada') return { encerrado: false };
    const l = linha(P, empresa.id);
    return { encerrado: true, excluirApos: l?.status === 'pendente' ? l.delete_after : null, identificador: empresa.slug, prazoDias: PRAZO_EXCLUSAO_DIAS };
  }, { publica: true });

  r.post('/api/encerramento/codigo', async ({ corpo, companyId, empresa }) => {
    exigirJanela(P, empresa);
    const email = normEmail(corpo.email);
    if (!emailValido(email)) throw erro(400, 'email_invalido', 'Informe um email válido.');
    if (!adminAutorizado(P, companyId, email)) throw erro(403, 'nao_autorizado', 'Só um administrador cadastrado deste ambiente pode fazer este pedido.');
    const nome = E.lerMarca(P, companyId)?.display_name || empresa.name;
    await enviarCodigo(P, email, escopoCodigo(companyId), P.emailDa(companyId), `Código de confirmação do encerramento de ${nome}`);
    return { ok: true };
  }, { publica: true });

  // Exclusão antecipada: código + identificador digitado + ciência de que é irreversível. Hold bloqueia (registrado).
  r.post('/api/encerramento/excluir', ({ corpo, companyId, empresa, origem }) => {
    const l = exigirJanela(P, empresa);
    const email = normEmail(corpo.email);
    conferirCodigo(P, email, escopoCodigo(companyId), String(corpo.codigo || '').trim());
    const u = adminAutorizado(P, companyId, email);
    if (!u) throw erro(403, 'nao_autorizado', 'Só um administrador cadastrado deste ambiente pode fazer este pedido.');
    if (String(corpo.confirmacao || '').trim().toLowerCase() !== empresa.slug || corpo.irreversivel !== true) throw erro(400, 'confirmacao', `Para confirmar, digite o identificador ${empresa.slug} e marque que entende que a exclusão é irreversível.`);
    if (l.hold_em) {
      auditar(P, { usuario: u.id, empresa: companyId, acao: 'company.early_deletion_blocked', entidade: 'company_deletion', id: companyId, depois: { motivo: 'hold', hold_tipo: l.hold_tipo }, origem });
      throw erro(409, 'hold', 'A exclusão deste ambiente está suspensa por obrigação legal ou investigação de incidente. Fale com o suporte.');
    }
    exec(P.db, 'update company_deletion set antecipada_por = ?, antecipada_em = ?, updated_at = ? where company_id = ?', email, iso(agoraMs(P)), iso(agoraMs(P)), companyId);
    auditar(P, { usuario: u.id, empresa: companyId, acao: 'company.early_deletion_requested', entidade: 'company_deletion', id: companyId, depois: { por: email, verificacao: 'codigo_email' }, origem });
    E.excluirEmpresa(P, companyId, empresa.slug, u.id, origem, { via: 'cliente' });
    return { ok: true, excluido: true };
  }, { publica: true });

  // Pedido de devolução (cópia técnica completa, SQLite). A equipe de operação gera e envia o link.
  r.post('/api/encerramento/devolucao', ({ corpo, companyId, empresa, origem }) => {
    exigirJanela(P, empresa);
    const email = normEmail(corpo.email);
    conferirCodigo(P, email, escopoCodigo(companyId), String(corpo.codigo || '').trim());
    const u = adminAutorizado(P, companyId, email);
    if (!u) throw erro(403, 'nao_autorizado', 'Só um administrador cadastrado deste ambiente pode fazer este pedido.');
    const aberto = um(P.db, "select id from data_returns where company_id = ? and status in ('solicitada','gerada')", companyId);
    if (aberto) return { ok: true, pedido: aberto.id, jaExistia: true };
    const id = `dev_${randomUUID().replace(/-/g, '').slice(0, 20)}`, agora = iso(agoraMs(P));
    exec(P.db, `insert into data_returns (id, company_id, solicitante_email, solicitante_user_id, solicitado_em, verificado_em, status, updated_at) values (?, ?, ?, ?, ?, ?, 'solicitada', ?)`, id, companyId, email, u.id, agora, agora, agora);
    auditar(P, { usuario: u.id, empresa: companyId, acao: 'company.data_return_requested', entidade: 'data_return', id, depois: { por: email, verificacao: 'codigo_email' }, origem });
    for (const para of P.adminsPlataforma()) P.email.enviar(para, 'Pedido de devolução de dados', `Um administrador de um ambiente cancelado pediu a cópia dos dados.\n\nReferência: ${id}\n\nConsulte e gere a cópia no console, em Exclusões.`).catch(() => {});
    return { ok: true, pedido: id };
  }, { publica: true });
}

// ---------------------------------------------------------------- Console: exclusões, hold e devolução
export function gerarDevolucao(P, id, { sessao, origem }) {
  const d = um(P.db, 'select * from data_returns where id = ?', id);
  if (!d) throw erro(404, 'devolucao', 'Pedido não encontrado.');
  if (d.status !== 'solicitada') throw erro(409, 'devolucao_status', 'Este pedido já foi atendido ou encerrado.');
  const c = E.lerEmpresa(P, d.company_id);
  if (!c) throw erro(409, 'empresa', 'O ambiente já foi excluído.');
  const x = criarExportacao(P, { userId: sessao.userId, email: sessao.email, companyId: c.id, tipo: 'solicitacao_cliente', origem, devolucaoId: d.id,
    justificativa: `Devolução dos dados pedida por ${d.solicitante_email} (pedido ${d.id})`, gerar: () => E.exportarEmpresa(P, c.id) });
  const token = randomBytes(32).toString('base64url');
  const expira = iso(agoraMs(P) + PRAZO_LINK_DIAS * DIA);
  exec(P.db, "update data_returns set status = 'gerada', export_id = ?, gerado_por = ?, gerado_em = ?, token_hash = ?, link_expira = ?, sha256 = ?, bytes = ?, updated_at = ? where id = ?",
    x.id, sessao.email, iso(agoraMs(P)), sha(token), expira, x.sha256, x.bytes, iso(agoraMs(P)), d.id);
  auditar(P, { usuario: sessao.userId, empresa: c.id, acao: 'company.data_return_generated', entidade: 'data_return', id: d.id, depois: { export_id: x.id, sha256: x.sha256, link_expira: expira, para: d.solicitante_email }, origem });
  const link = `${(P.urlBase || '').replace(/\/$/, '')}/devolucao/${token}`;
  const nome = E.lerMarca(P, c.id)?.display_name || c.name;
  P.emailDa(c.id).enviar(d.solicitante_email, `Cópia dos dados de ${nome}`, `A cópia completa do banco de dados do ambiente ${nome} está pronta.\n\nBaixe pelo link abaixo. Ele funciona uma única vez e vale até ${expira} (UTC):\n${link}\n\nO arquivo é um banco de dados SQLite compactado (gzip). Depois do download, a guarda da cópia é responsabilidade de quem a recebeu.\nSHA-256 do arquivo: ${x.sha256}`)
    .catch(e => P.log?.('email da devolução falhou', e?.message));
  return { ok: true, linkExpira: expira, sha256: x.sha256, ...(P.exporLinkDevolucao ? { link } : {}) };
}

const pedidoPorToken = (P, token) => (token && /^[A-Za-z0-9_-]{20,}$/.test(token) ? um(P.db, 'select * from data_returns where token_hash = ?', sha(token)) : null);

// Link de devolução (host da plataforma). GET mostra a página com o botão; só o POST entrega e consome o link,
// para um verificador de links do email não gastar o uso único.
export function paginaDevolucao(P, token) {
  const d = pedidoPorToken(P, token);
  const valido = d && d.status === 'gerada' && Date.parse(d.link_expira) > agoraMs(P);
  const corpo = valido
    ? `<h1>Cópia dos dados</h1><p>O link funciona uma única vez e vale até ${d.link_expira} (UTC). O arquivo é um banco de dados SQLite compactado.</p><form method="post"><button class="btn btn-verde" type="submit">Baixar a cópia</button></form><p class="dica">SHA-256: <code>${d.sha256}</code></p>`
    : '<h1>Link indisponível</h1><p>Este link já foi usado, venceu ou não existe. Peça uma nova cópia ao suporte dentro do prazo do encerramento.</p>';
  return { status: valido ? 200 : 410, html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Cópia dos dados</title><link rel="stylesheet" href="/estilo.css"></head><body><main style="max-width:520px;margin:48px auto;padding:0 16px">${corpo}</main></body></html>` };
}

export function entregarDevolucao(P, token, { agente, origem }) {
  const d = pedidoPorToken(P, token);
  if (!d || d.status !== 'gerada') throw erro(410, 'link', 'Este link já foi usado ou não existe.');
  if (Date.parse(d.link_expira) <= agoraMs(P)) { expirarDevolucao(P, d.id); throw erro(410, 'link', 'Este link venceu.'); }
  // Consome o link antes de entregar: uso único mesmo com dois cliques simultâneos.
  const r = exec(P.db, "update data_returns set status = 'entregue', entregue_em = ?, entregue_agente = ?, updated_at = ? where id = ? and status = 'gerada'", iso(agoraMs(P)), String(agente || '').slice(0, 160), iso(agoraMs(P)), d.id);
  if (!r.changes) throw erro(410, 'link', 'Este link já foi usado.');
  const arquivo = baixarExportacao(P, d.export_id, { por: d.solicitante_email, origem });
  eliminarCopia(P, d.export_id, 'entrega_unica', { origem });
  auditar(P, { usuario: d.solicitante_user_id, empresa: d.company_id, acao: 'company.data_return_delivered', entidade: 'data_return', id: d.id, depois: { para: d.solicitante_email, sha256: d.sha256, responsabilidade: 'transferida ao Cliente' }, origem });
  return arquivo;
}

function expirarDevolucao(P, id) {
  const d = um(P.db, 'select * from data_returns where id = ?', id);
  if (!d || d.status !== 'gerada') return;
  exec(P.db, "update data_returns set status = 'expirada', motivo_fim = 'link_vencido', updated_at = ? where id = ? and status = 'gerada'", iso(agoraMs(P)), id);
  if (d.export_id) eliminarCopia(P, d.export_id, 'link_vencido');
  auditar(P, { usuario: null, empresa: d.company_id, acao: 'company.data_return_expired', entidade: 'data_return', id, origem: { painel: 'retencao' } });
}

// Links vencidos: a cópia sai do servidor (independe de RETENCAO_APLICAR: nunca chegou a ser entregue).
export function rodadaDevolucoes(P) {
  for (const d of todos(P.db, "select id from data_returns where status = 'gerada' and link_expira <= ?", iso(agoraMs(P)))) expirarDevolucao(P, d.id);
}

export function rotasEncerramentoPlataforma(P, r, precisa) {
  r.get('/api/plataforma/exclusoes', ({ sessao }) => { precisa(sessao, 'platform.companies.manage'); return { exclusoes: listarExclusoes(P), prazoDias: PRAZO_EXCLUSAO_DIAS, aplicar: !!P.exclusaoAplicar }; });
  r.post('/api/plataforma/empresas/:id/exclusao/hold', ({ sessao, params, corpo, origem }) => { precisa(sessao, 'platform.companies.manage'); return { exclusao: marcarHoldExclusao(P, params.id, { tipo: corpo.tipo, motivo: corpo.motivo, por: sessao.email, ator: sessao.userId, origem }) }; });
  r.post('/api/plataforma/empresas/:id/exclusao/liberar', ({ sessao, params, origem }) => { precisa(sessao, 'platform.companies.manage'); return { exclusao: liberarHoldExclusao(P, params.id, { por: sessao.email, ator: sessao.userId, origem }) }; });
  r.post('/api/plataforma/devolucoes/:id/gerar', ({ sessao, params, origem }) => { precisa(sessao, 'platform.companies.manage'); return gerarDevolucao(P, params.id, { sessao, origem }); });
}
