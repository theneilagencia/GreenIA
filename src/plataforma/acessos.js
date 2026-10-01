// Acesso da equipe GreenIA (admin da plataforma) ao ambiente de uma empresa: excepcional, com motivo, temporário,
// registrado e visível para a empresa. A sessão de operador só tem os poderes de operador enquanto o acesso
// estiver aberto; ao sair, expirar ou ser encerrado (pelo operador ou por um admin da empresa), o registro fecha
// com a duração. Exportação do banco é um evento sensível à parte, também com motivo e registro.
import { randomUUID } from 'node:crypto';
import { erro } from '../http.js';
import { exec, todos, um } from '../db.js';
import { auditar } from './auditoria.js';
import { FINALIDADES_EXPORTACAO, situacaoExportacao } from './exportacoes.js';

export const TIPOS_ACESSO = { suporte: 'Suporte', solicitacao_cliente: 'Solicitação do cliente', incidente: 'Incidente', outro: 'Outro' };
export const DURACAO_ACESSO_MS = 60 * 60e3;
const JUSTIFICATIVA_MIN = 10, JUSTIFICATIVA_MAX = 500;

export const ESQUEMA_ACESSOS = `
create table if not exists operator_access (
  id text primary key, company_id text not null, user_id text not null, operador_email text not null,
  tipo text not null, justificativa text not null, inicio text not null, expira text not null, fim text, duracao_s integer,
  status text not null check (status in ('aberto','encerrado','expirado')), motivo_fim text, encerrado_por text,
  aviso text not null default '', origin text not null default '{}');
create index if not exists operator_access_empresa on operator_access (company_id, inicio);
create index if not exists operator_access_abertos on operator_access (status, expira);
create table if not exists operator_exports (
  id text primary key, company_id text not null, user_id text not null, operador_email text not null,
  tipo text not null, justificativa text not null, formato text not null, em text not null,
  sucesso integer not null, bytes integer, erro text, aviso text not null default '', origin text not null default '{}');
create index if not exists operator_exports_empresa on operator_exports (company_id, em);
`;

// Tipo e justificativa válidos, ou 400: sem eles, nada é aberto nem exportado.
export function validarMotivo(corpo) {
  const tipo = String(corpo?.tipo || '').trim();
  const justificativa = String(corpo?.justificativa || '').replace(/\s+/g, ' ').trim();
  if (!TIPOS_ACESSO[tipo]) throw erro(400, 'tipo_acesso', `Escolha o tipo do acesso: ${Object.values(TIPOS_ACESSO).join(', ')}.`);
  if (justificativa.length < JUSTIFICATIVA_MIN) throw erro(400, 'justificativa', `Escreva a justificativa do acesso (pelo menos ${JUSTIFICATIVA_MIN} caracteres).`);
  if (justificativa.length > JUSTIFICATIVA_MAX) throw erro(400, 'justificativa', `A justificativa pode ter até ${JUSTIFICATIVA_MAX} caracteres.`);
  return { tipo, justificativa };
}

const agoraMs = P => P.agora().getTime();
const iso = ms => new Date(ms).toISOString();

// Fecha o acesso (uma vez só) e derruba as sessões presas a ele. Expiração fecha no horário em que venceu.
export function encerrarAcesso(P, id, motivo, { por = null, origem } = {}) {
  const a = um(P.db, 'select * from operator_access where id = ?', id);
  if (!a || a.status !== 'aberto') return a || null;
  const expira = Date.parse(a.expira), agora = agoraMs(P);
  const fim = motivo === 'expiracao' ? Math.min(expira, agora) : Math.min(agora, expira);
  const status = motivo === 'expiracao' || agora >= expira ? 'expirado' : 'encerrado';
  const duracao = Math.max(0, Math.round((fim - Date.parse(a.inicio)) / 1000));
  const r = exec(P.db, "update operator_access set status = ?, fim = ?, duracao_s = ?, motivo_fim = ?, encerrado_por = ? where id = ? and status = 'aberto'",
    status, iso(fim), duracao, status === 'expirado' ? 'expiracao' : motivo, por, id);
  exec(P.db, 'delete from sessions where access_id = ?', id);
  if (r.changes) auditar(P, { usuario: por || a.user_id, empresa: a.company_id, acao: 'company.access_ended', entidade: 'operator_access', id, depois: { status, motivo: status === 'expirado' ? 'expiracao' : motivo, duracao_s: duracao }, origem });
  return um(P.db, 'select * from operator_access where id = ?', id);
}

// Acessos vencidos e ainda abertos passam a "expirado"; abertos sem sessão (derrubada por suspensão, bloqueio,
// remoção...) fecham como "sessao_encerrada". Roda antes de toda leitura e validação.
export function varrerExpirados(P) {
  for (const a of todos(P.db, "select id from operator_access where status = 'aberto' and expira <= ?", iso(agoraMs(P)))) encerrarAcesso(P, a.id, 'expiracao');
  for (const a of todos(P.db, "select a.id from operator_access a where a.status = 'aberto' and not exists (select 1 from sessions s where s.access_id = a.id)")) encerrarAcesso(P, a.id, 'sessao_encerrada');
}

// Antes de derrubar sessões em massa (suspensão, cancelamento, exclusão, bloqueio ou remoção de pessoa).
export function encerrarAcessosAbertos(P, { companyId, userId }, motivo, origem) {
  const cond = ["status = 'aberto'"], par = [];
  if (companyId) { cond.push('company_id = ?'); par.push(companyId); }
  if (userId) { cond.push('user_id = ?'); par.push(userId); }
  for (const a of todos(P.db, `select id from operator_access where ${cond.join(' and ')}`, ...par)) encerrarAcesso(P, a.id, motivo, { origem });
}

export function acessoValido(P, id) {
  if (!id) return null;
  const a = um(P.db, 'select * from operator_access where id = ?', id);
  if (!a || a.status !== 'aberto') return null;
  if (Date.parse(a.expira) <= agoraMs(P)) { encerrarAcesso(P, id, 'expiracao'); return null; }
  return a;
}

// Abre um acesso: um por operador e empresa (o anterior, se aberto, é encerrado como substituído).
export function abrirAcesso(P, { userId, email, companyId, tipo, justificativa, origem }) {
  varrerExpirados(P);
  for (const a of todos(P.db, "select id from operator_access where status = 'aberto' and user_id = ? and company_id = ?", userId, companyId)) encerrarAcesso(P, a.id, 'substituido', { por: userId, origem });
  const id = `acc_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const inicio = agoraMs(P);
  exec(P.db, `insert into operator_access (id, company_id, user_id, operador_email, tipo, justificativa, inicio, expira, status, origin)
    values (?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?)`, id, companyId, userId, email, tipo, justificativa, iso(inicio), iso(inicio + DURACAO_ACESSO_MS), JSON.stringify(origem || {}));
  auditar(P, { usuario: userId, empresa: companyId, acao: 'company.accessed', entidade: 'operator_access', id, depois: { tipo, justificativa, expira: iso(inicio + DURACAO_ACESSO_MS) }, origem });
  return um(P.db, 'select * from operator_access where id = ?', id);
}

// O que a empresa vê: só os registros dela, sem IP nem navegador do operador.
const publicoAcesso = a => ({ id: a.id, operador: a.operador_email, tipo: a.tipo, tipoNome: TIPOS_ACESSO[a.tipo] || a.tipo, justificativa: a.justificativa,
  inicio: a.inicio, expira: a.expira, fim: a.fim, duracao_s: a.duracao_s, status: a.status, motivo_fim: a.motivo_fim, aviso: a.aviso });
const publicoExportacao = (P, x) => ({ id: x.id, operador: x.operador_email, tipo: x.tipo, tipoNome: FINALIDADES_EXPORTACAO[x.tipo] || TIPOS_ACESSO[x.tipo] || x.tipo, justificativa: x.justificativa,
  formato: x.formato, em: x.em, sucesso: !!x.sucesso, bytes: x.bytes, aviso: x.aviso, ...situacaoExportacao(P, x) });

export function listarAcessos(P, companyId, { limite = 200 } = {}) {
  varrerExpirados(P);
  return {
    acessos: todos(P.db, 'select * from operator_access where company_id = ? order by inicio desc limit ?', companyId, limite).map(publicoAcesso),
    exportacoes: todos(P.db, 'select * from operator_exports where company_id = ? order by em desc limit ?', companyId, limite).map(x => publicoExportacao(P, x)),
    duracaoMinutos: DURACAO_ACESSO_MS / 60e3,
  };
}

export const acessoDaEmpresa = (P, companyId, id) => um(P.db, 'select * from operator_access where id = ? and company_id = ?', id, companyId);

// Aviso por email aos admins da empresa: complemento, nunca condição. A tela da empresa é a fonte da verdade;
// o resultado do envio fica gravado no próprio registro (enviado, falhou, sem destinatários).
export function avisarAdmins(P, { tabela, id, companyId, operadorId, assunto, texto }) {
  const marcar = v => { try { exec(P.db, `update ${tabela} set aviso = ? where id = ?`, v, id); } catch { /* registro removido */ } };
  let para = [];
  try {
    para = todos(P.db, `select distinct u.email from company_users cu join users u on u.id = cu.user_id join role_permissions rp on rp.role_id = cu.role_id
      where cu.company_id = ? and cu.status = 'ativo' and u.status = 'ativo' and rp.permission_key = 'company.manage' and u.id <> ?`, companyId, operadorId).map(x => x.email);
  } catch { para = []; }
  if (!para.length) { marcar('sem_destinatarios'); return Promise.resolve(); }
  const enviar = async () => {
    let falhas = 0;
    for (const e of para) { try { await P.emailDa(companyId).enviar(e, assunto, texto); } catch { falhas++; } }
    marcar(falhas === para.length ? 'falhou' : falhas ? 'parcial' : 'enviado');
  };
  return enviar().catch(e => { marcar('falhou'); P.log?.('aviso de acesso da equipe falhou', e?.message); });
}
