// Exportação do banco de uma empresa: cópia operacional com finalidade, prazo e eliminação registrados.
// Finalidades: pedido do Cliente, incidente de segurança ou obrigação legal ("suporte" não exporta o banco).
// O arquivo fica no servidor (pasta de exportações), sai por download registrado e é eliminado 7 dias depois de
// encerrada a necessidade, salvo hold (obrigação legal ou incidente), que suspende o prazo. Cópia baixada para fora
// do servidor sai do controle técnico: fica registrado o download (quem, quando) e, se houver, a declaração de
// eliminação de quem a recebeu. Nada aqui prova a eliminação de uma cópia externa.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { erro } from '../http.js';
import { exec, todos, um } from '../db.js';
import { auditar } from './auditoria.js';

export const FINALIDADES_EXPORTACAO = { solicitacao_cliente: 'Pedido do cliente', incidente: 'Incidente de segurança', obrigacao_legal: 'Obrigação legal' };
export const TIPOS_HOLD = { legal: 'Obrigação legal', incidente: 'Investigação de incidente' };
export const PRAZO_COPIA_DIAS = 7;
const DIA = 864e5;
const JUSTIFICATIVA_MIN = 10, JUSTIFICATIVA_MAX = 500, MOTIVO_MIN = 10;

// Colunas do ciclo de vida, acrescentadas a operator_exports (tabela de acessos.js). Exportações antigas (antes
// deste controle) ficam com arquivo nulo: foram entregues direto ao operador.
export const COLUNAS_EXPORTACAO = [
  ['arquivo', 'text'], ['sha256', 'text'], ['necessidade_encerrada_em', 'text'], ['necessidade_encerrada_por', 'text'], ['expira_em', 'text'],
  ['hold_tipo', 'text'], ['hold_motivo', 'text'], ['hold_por', 'text'], ['hold_em', 'text'],
  ['downloads', 'integer not null default 0'], ['baixado_em', 'text'], ['baixado_por', 'text'],
  ['eliminado_em', 'text'], ['eliminacao', 'text'], ['declaracao', 'text'], ['declarada_em', 'text'], ['declarada_por', 'text'], ['devolucao_id', 'text'],
];

const iso = ms => new Date(ms).toISOString();
const agoraMs = P => P.agora().getTime();

export function validarFinalidade(corpo) {
  const tipo = String(corpo?.tipo || '').trim();
  const justificativa = String(corpo?.justificativa || '').replace(/\s+/g, ' ').trim();
  if (tipo === 'suporte' || tipo === 'outro') throw erro(400, 'finalidade', 'Suporte não é finalidade para exportar o banco. Se o caso precisar da cópia, registre o pedido do cliente e use "Pedido do cliente".');
  if (!FINALIDADES_EXPORTACAO[tipo]) throw erro(400, 'finalidade', `Escolha a finalidade da exportação: ${Object.values(FINALIDADES_EXPORTACAO).join(', ')}.`);
  if (justificativa.length < JUSTIFICATIVA_MIN) throw erro(400, 'justificativa', `Escreva a justificativa (pelo menos ${JUSTIFICATIVA_MIN} caracteres).`);
  if (justificativa.length > JUSTIFICATIVA_MAX) throw erro(400, 'justificativa', `A justificativa pode ter até ${JUSTIFICATIVA_MAX} caracteres.`);
  return { tipo, justificativa };
}

const lerExportacao = (P, id) => um(P.db, 'select * from operator_exports where id = ?', id);
export function exigirExportacao(P, id) {
  const x = lerExportacao(P, id);
  if (!x) throw erro(404, 'exportacao', 'Exportação não encontrada.');
  return x;
}

// Gera a cópia, guarda no servidor e registra (sucesso ou falha). Devolve o registro.
export function criarExportacao(P, { userId, email, companyId, tipo, justificativa, origem, devolucaoId = null, gerar }) {
  const id = `exp_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const base = [id, companyId, userId, email, tipo, justificativa, iso(agoraMs(P))];
  let arquivo, caminho;
  try {
    arquivo = gerar();
    mkdirSync(P.pastaExportacoes, { recursive: true, mode: 0o700 });
    caminho = join(P.pastaExportacoes, `${id}.sqlite.gz`);
    writeFileSync(caminho, arquivo.dados, { mode: 0o600 });
  } catch (e) {
    const falha = String(e?.message || e).slice(0, 200);
    exec(P.db, `insert into operator_exports (id, company_id, user_id, operador_email, tipo, justificativa, formato, em, sucesso, erro, origin, devolucao_id)
      values (?, ?, ?, ?, ?, ?, 'banco_completo', ?, 0, ?, ?, ?)`, ...base, falha, JSON.stringify(origem || {}), devolucaoId);
    auditar(P, { usuario: userId, empresa: companyId, acao: 'company.export_failed', entidade: 'operator_export', id, depois: { finalidade: tipo, justificativa, erro: falha }, origem });
    throw erro(500, 'exportacao_falhou', 'A exportação falhou. A tentativa ficou registrada.');
  }
  const sha256 = createHash('sha256').update(arquivo.dados).digest('hex');
  exec(P.db, `insert into operator_exports (id, company_id, user_id, operador_email, tipo, justificativa, formato, em, sucesso, bytes, origin, arquivo, sha256, devolucao_id)
    values (?, ?, ?, ?, ?, ?, 'banco_completo', ?, 1, ?, ?, ?, ?, ?)`, ...base, arquivo.dados.length, JSON.stringify(origem || {}), `${id}.sqlite.gz`, sha256, devolucaoId);
  auditar(P, { usuario: userId, empresa: companyId, acao: 'company.exported', entidade: 'operator_export', id, depois: { finalidade: tipo, justificativa, formato: 'banco_completo', bytes: arquivo.dados.length, sha256, devolucao: devolucaoId }, origem });
  return { ...lerExportacao(P, id), nome: arquivo.nome };
}

const caminhoDe = (P, x) => (x.arquivo ? join(P.pastaExportacoes, x.arquivo) : null);
export const arquivoDisponivel = (P, x) => !!(x.arquivo && !x.eliminado_em && existsSync(caminhoDe(P, x)));

// Download (pelo operador no console, ou pelo Cliente no link de devolução): conta e registra quem baixou.
// A responsabilidade pela cópia baixada passa a ser de quem a recebeu.
export function baixarExportacao(P, id, { por, origem }) {
  const x = exigirExportacao(P, id);
  if (!arquivoDisponivel(P, x)) throw erro(410, 'exportacao_indisponivel', 'A cópia não está mais disponível no servidor.');
  const dados = readFileSync(caminhoDe(P, x));
  exec(P.db, 'update operator_exports set downloads = downloads + 1, baixado_em = coalesce(baixado_em, ?), baixado_por = coalesce(baixado_por, ?) where id = ?', iso(agoraMs(P)), por, id);
  auditar(P, { usuario: null, empresa: x.company_id, acao: 'export.downloaded', entidade: 'operator_export', id, depois: { por, responsabilidade: 'transferida a quem baixou' }, origem });
  return { dados, nome: `copia-${x.company_id}-${x.em.slice(0, 10)}.sqlite.gz` };
}

// Necessidade encerrada: começa o prazo de 7 dias para eliminar a cópia do servidor.
export function encerrarNecessidade(P, id, { por, ator, origem }) {
  const x = exigirExportacao(P, id);
  if (x.necessidade_encerrada_em) return lerExportacao(P, id);
  const agora = agoraMs(P);
  exec(P.db, 'update operator_exports set necessidade_encerrada_em = ?, necessidade_encerrada_por = ?, expira_em = ? where id = ? and necessidade_encerrada_em is null', iso(agora), por, iso(agora + PRAZO_COPIA_DIAS * DIA), id);
  auditar(P, { usuario: ator ?? null, empresa: x.company_id, acao: 'export.need_ended', entidade: 'operator_export', id, depois: { por, expira_em: iso(agora + PRAZO_COPIA_DIAS * DIA) }, origem });
  return lerExportacao(P, id);
}

// Hold: suspende o prazo. Ao liberar, o tempo que faltava volta a correr a partir da liberação.
export function marcarHoldExportacao(P, id, { tipo, motivo, por, ator, origem }) {
  const x = exigirExportacao(P, id);
  if (!TIPOS_HOLD[tipo]) throw erro(400, 'hold_tipo', `Escolha o motivo do hold: ${Object.values(TIPOS_HOLD).join(' ou ')}.`);
  if (String(motivo || '').trim().length < MOTIVO_MIN) throw erro(400, 'hold_motivo', `Descreva o motivo do hold (pelo menos ${MOTIVO_MIN} caracteres).`);
  if (x.eliminado_em) throw erro(409, 'eliminada', 'A cópia já foi eliminada.');
  exec(P.db, 'update operator_exports set hold_tipo = ?, hold_motivo = ?, hold_por = ?, hold_em = ? where id = ?', tipo, String(motivo).trim(), por, iso(agoraMs(P)), id);
  auditar(P, { usuario: ator ?? null, empresa: x.company_id, acao: 'export.hold', entidade: 'operator_export', id, depois: { tipo, motivo: String(motivo).trim(), por }, origem });
  return lerExportacao(P, id);
}
export function liberarHoldExportacao(P, id, { por, ator, origem }) {
  const x = exigirExportacao(P, id);
  if (!x.hold_em) throw erro(409, 'sem_hold', 'Esta exportação não está em hold.');
  const agora = agoraMs(P);
  const restante = x.expira_em ? Math.max(0, Date.parse(x.expira_em) - Date.parse(x.hold_em)) : null;
  const expira = restante == null ? null : iso(agora + restante);
  exec(P.db, 'update operator_exports set hold_tipo = null, hold_motivo = null, hold_por = null, hold_em = null, expira_em = ? where id = ?', expira, id);
  auditar(P, { usuario: ator ?? null, empresa: x.company_id, acao: 'export.hold_released', entidade: 'operator_export', id, depois: { por, expira_em: expira }, origem });
  return lerExportacao(P, id);
}

// Declaração de quem baixou a cópia: registra o procedimento informado. Não é prova técnica de eliminação.
export function declararEliminacao(P, id, { texto, por, ator, origem }) {
  const x = exigirExportacao(P, id);
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length < 10) throw erro(400, 'declaracao', 'Descreva o que foi feito com a cópia baixada (pelo menos 10 caracteres).');
  if (!x.baixado_em) throw erro(409, 'sem_download', 'Esta cópia não foi baixada: não há cópia externa a declarar.');
  exec(P.db, 'update operator_exports set declaracao = ?, declarada_em = ?, declarada_por = ? where id = ?', t.slice(0, 500), iso(agoraMs(P)), por, id);
  auditar(P, { usuario: ator ?? null, empresa: x.company_id, acao: 'export.elimination_declared', entidade: 'operator_export', id, depois: { por, declaracao: t.slice(0, 500) }, origem });
  return lerExportacao(P, id);
}

// Elimina a cópia do servidor (uma vez só): prazo vencido, entrega única concluída ou empresa excluída.
export function eliminarCopia(P, id, metodo, { origem } = {}) {
  const x = lerExportacao(P, id);
  if (!x || !x.arquivo || x.eliminado_em) return false;
  const c = caminhoDe(P, x);
  if (existsSync(c)) rmSync(c, { force: true });
  const r = exec(P.db, 'update operator_exports set eliminado_em = ?, eliminacao = ? where id = ? and eliminado_em is null', iso(agoraMs(P)), metodo, id);
  if (r.changes) auditar(P, { usuario: null, empresa: x.company_id, acao: 'export.deleted', entidade: 'operator_export', id, depois: { metodo, sha256: x.sha256 }, origem: origem || { painel: 'retencao' } });
  return !!r.changes;
}

// Rodada de hora em hora: elimina as cópias com prazo vencido e sem hold. Sem `aplicar`, só registra (dry-run).
// Revalida cada item antes de apagar. Cópia sem "necessidade encerrada" há mais de 30 dias vira alerta (não apaga).
export function rodadaExportacoes(P, { aplicar = false, log = () => {} } = {}) {
  const agora = iso(agoraMs(P));
  const vencidas = todos(P.db, "select id from operator_exports where arquivo is not null and eliminado_em is null and hold_em is null and expira_em is not null and expira_em <= ?", agora).map(x => x.id);
  const abertas = todos(P.db, 'select id from operator_exports where arquivo is not null and eliminado_em is null and necessidade_encerrada_em is null and em <= ?', iso(agoraMs(P) - 30 * DIA)).map(x => x.id);
  const feitos = [];
  if (aplicar) for (const id of vencidas) {
    const x = lerExportacao(P, id);
    if (x && !x.eliminado_em && !x.hold_em && x.expira_em && x.expira_em <= iso(agoraMs(P)) && eliminarCopia(P, id, 'prazo')) feitos.push(id);
  }
  if (vencidas.length || abertas.length) log(`exportações${aplicar ? '' : ' (dry-run)'}: ${vencidas.length} cópia(s) com prazo vencido${aplicar ? `, ${feitos.length} eliminada(s)` : ''}; ${abertas.length} sem necessidade encerrada há mais de 30 dias`);
  return { vencidas, eliminadas: feitos, alertas: abertas };
}

// Empresa excluída: a necessidade das cópias operacionais dela acaba (o prazo de 7 dias começa), salvo hold.
export function encerrarNecessidadesDaEmpresa(P, companyId, { por, origem }) {
  for (const x of todos(P.db, 'select id from operator_exports where company_id = ? and arquivo is not null and eliminado_em is null and necessidade_encerrada_em is null', companyId)) encerrarNecessidade(P, x.id, { por, origem });
}

// O que o console e a empresa veem de cada exportação (sem IP, sem caminho no disco).
export function situacaoExportacao(P, x) {
  return {
    finalidadeNome: FINALIDADES_EXPORTACAO[x.tipo] || null,
    noServidor: arquivoDisponivel(P, x), sha256: x.sha256 || null,
    necessidadeEncerradaEm: x.necessidade_encerrada_em || null, expiraEm: x.hold_em ? null : x.expira_em || null,
    hold: x.hold_em ? { tipo: x.hold_tipo, tipoNome: TIPOS_HOLD[x.hold_tipo], motivo: x.hold_motivo, por: x.hold_por, em: x.hold_em } : null,
    downloads: x.downloads || 0, baixadoEm: x.baixado_em || null, baixadoPor: x.baixado_por || null,
    eliminadoEm: x.eliminado_em || null, eliminacao: x.eliminacao || null,
    declaracao: x.declaracao ? { texto: x.declaracao, em: x.declarada_em, por: x.declarada_por } : null,
    controle: x.arquivo ? 'servidor' : 'anterior',   // anterior: exportação de antes deste controle, entregue direto
  };
}
