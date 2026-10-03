// Banco da plataforma (plano de controle): empresas, planos, identidades, vínculos, roles,
// permissões, marca, landing page, configurações, sessões e auditoria. Os dados do produto de
// cada empresa ficam no banco dela (dados/empresas/<company_id>.sqlite).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { exec, um } from '../db.js';
import { ESQUEMA_ACESSOS } from './acessos.js';
import { COLUNAS_EXPORTACAO } from './exportacoes.js';

const ESQUEMA = `
create table if not exists companies (
  id text primary key, name text not null, slug text not null unique, custom_domain text unique,
  status text not null default 'em_implantacao' check (status in ('em_implantacao','ativa','suspensa','cancelada')),
  plan_id text references plans(id), banco text not null, legal_name text not null default '', document text not null default '',
  contact_email text not null default '', notes text not null default '',
  created_at text not null, updated_at text not null);
create table if not exists company_slugs (slug text primary key, company_id text not null references companies(id), until text not null);

create table if not exists plans (
  id text primary key, name text not null, description text not null default '',
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  price_usd real, credits integer not null default 0, reserve integer not null default 0,
  limits text not null default '{}', features text not null default '{}', rules text not null default '{}', settings text not null default '{}',
  created_at text not null, updated_at text not null);

create table if not exists users (
  id text primary key, email text not null unique, name text not null default '',
  status text not null default 'ativo' check (status in ('ativo','bloqueado')), created_at text not null);
create table if not exists platform_members (user_id text primary key references users(id) on delete cascade, role text not null default 'platform_admin');

create table if not exists roles (
  id text primary key, company_id text references companies(id) on delete cascade, key text not null, name text not null,
  description text not null default '', system integer not null default 0, created_at text not null);
create unique index if not exists roles_chave on roles (coalesce(company_id, ''), key);
create table if not exists permissions (key text primary key, description text not null, scope text not null check (scope in ('platform','company')));
create table if not exists role_permissions (role_id text not null references roles(id) on delete cascade, permission_key text not null references permissions(key), primary key (role_id, permission_key));

create table if not exists company_users (
  company_id text not null references companies(id) on delete cascade, user_id text not null references users(id) on delete cascade,
  role_id text not null references roles(id), status text not null default 'convidado' check (status in ('convidado','ativo','inativo')),
  invited_by text, created_at text not null, updated_at text not null, primary key (company_id, user_id));

create table if not exists branding (
  company_id text primary key references companies(id) on delete cascade,
  display_name text not null default '', logo text not null default '', favicon text not null default '',
  primary_color text not null default '', secondary_color text not null default '',
  login_title text not null default '', login_text text not null default '', privacy_note text not null default '',
  locked text not null default '[]', updated_at text not null);
create table if not exists landing_pages (
  company_id text primary key references companies(id) on delete cascade,
  status text not null default 'rascunho' check (status in ('rascunho','publicada')),
  content text not null default '{}', seo text not null default '{}', updated_at text not null);
create table if not exists company_settings (
  company_id text primary key references companies(id) on delete cascade,
  settings text not null default '{}', grants text not null default '{}', updated_at text not null);
create table if not exists platform_settings (key text primary key, value text not null);
-- Avisos da chave do OpenRouter: uma linha por chave, estágio e destinatário. A chave primária
-- garante no máximo um email por estágio, mesmo com execuções simultâneas ou mais de uma instância.
create table if not exists avisos_chave (chave_id text not null, estagio text not null, destinatario text not null,
  estado text not null check (estado in ('enviando','enviado')), em text not null, primary key (chave_id, estagio, destinatario));

create table if not exists login_codes (email text not null, scope text not null, hash text not null, expira integer not null,
  tentativas integer not null default 0, enviados text not null default '[]', primary key (email, scope));
create table if not exists sessions (token_hash text primary key, user_id text not null references users(id) on delete cascade,
  company_id text references companies(id) on delete cascade, csrf text not null, expira integer not null, via text not null default 'login');

create table if not exists audit_log (
  id integer primary key, at text not null, user_id text, company_id text, action text not null,
  entity text not null, entity_id text, before text, after text, origin text not null default '{}');
create index if not exists audit_empresa on audit_log (company_id, id);
`;

// Encerramento de ambientes (cancelamento → exclusão em 30 dias) e devolução dos dados: src/plataforma/encerramento.js.
export const ESQUEMA_ENCERRAMENTO = `
create table if not exists company_deletion (
  company_id text primary key, nome text not null, slug text not null,
  cancelled_at text not null, delete_after text not null, estimado integer not null default 0,
  status text not null check (status in ('pendente','excluida','revertida')),
  hold_tipo text, hold_motivo text, hold_por text, hold_em text,
  antecipada_por text, antecipada_em text, deleted_at text, deleted_via text, updated_at text not null);
create index if not exists company_deletion_prazo on company_deletion (status, delete_after);
create table if not exists data_returns (
  id text primary key, company_id text not null, solicitante_email text not null, solicitante_user_id text,
  solicitado_em text not null, verificado_em text not null,
  status text not null check (status in ('solicitada','gerada','entregue','expirada','cancelada')),
  export_id text, gerado_por text, gerado_em text, token_hash text, link_expira text, sha256 text, bytes integer,
  entregue_em text, entregue_agente text, motivo_fim text, updated_at text not null);
create index if not exists data_returns_empresa on data_returns (company_id, solicitado_em);
create unique index if not exists data_returns_token on data_returns (token_hash);
`;

// Contatos comerciais (página de vendas): retenção de 24 meses depois da última interação comercial registrada.
export const ESQUEMA_CONTATOS = `
create table if not exists commercial_contacts (
  id text primary key, created_at text not null, last_interaction_at text not null,
  nome text not null, email text not null, empresa text not null, cargo text not null default '', pessoas text not null default '', mensagem text not null default '',
  hold_motivo text, hold_por text, hold_em text);
create index if not exists commercial_contacts_email on commercial_contacts (email);
create index if not exists commercial_contacts_ultima on commercial_contacts (last_interaction_at);
create table if not exists commercial_interactions (
  id integer primary key, contact_id text not null references commercial_contacts(id) on delete cascade,
  at text not null, tipo text not null, por text, nota text not null default '', dados text not null default '');
create index if not exists commercial_interactions_contato on commercial_interactions (contact_id, at);
-- Estatística irreversivelmente agregada dos contatos eliminados: só mês de entrada, faixa de pessoas e contagem.
create table if not exists commercial_contacts_stats (mes text not null, pessoas text not null, eliminados integer not null, primary key (mes, pessoas));
`;

export function abrirPlataforma(arquivo = ':memory:') {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');
  db.exec(ESQUEMA);
  db.exec(ESQUEMA_ACESSOS);
  db.exec(ESQUEMA_ENCERRAMENTO);
  db.exec(ESQUEMA_CONTATOS);
  // Colunas acrescentadas depois da primeira versão (bancos da plataforma que já existiam).
  const colunas = t => db.prepare(`pragma table_info(${t})`).all().map(c => c.name);
  const faltam = colunas('companies');
  for (const [c, def] of [['domain_status', "text not null default ''"], ['domain_checked_at', 'text'], ['domain_message', "text not null default ''"]]) {
    if (!faltam.includes(c)) db.exec(`alter table companies add column ${c} ${def}`);
  }
  // Sessão de operador (acesso da equipe GreenIA): presa a um registro de operator_access aberto.
  if (!colunas('sessions').includes('access_id')) db.exec('alter table sessions add column access_id text');
  db.exec('create index if not exists sessions_acesso on sessions (access_id)');
  // Exportações: ciclo de vida da cópia operacional (finalidade, prazo, hold, download, eliminação).
  const exp = colunas('operator_exports');
  for (const [c, def] of COLUNAS_EXPORTACAO) if (!exp.includes(c)) db.exec(`alter table operator_exports add column ${c} ${def}`);
  return db;
}

export const lerAjuste = (db, chave, padrao) => { const r = um(db, 'select value from platform_settings where key = ?', chave); try { return r ? JSON.parse(r.value) : padrao; } catch { return padrao; } };
export const salvarAjuste = (db, chave, valor) => exec(db, 'insert into platform_settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', chave, JSON.stringify(valor));
