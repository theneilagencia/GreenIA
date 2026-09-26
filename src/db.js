// Banco da instalação: um arquivo SQLite (WAL). Uma empresa por instalação,
// então nenhuma tabela tem coluna de cliente.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ESQUEMA = `
create table if not exists config (chave text primary key, valor text not null);

create table if not exists pessoas (
  id integer primary key, email text not null unique, nome text not null default '',
  papel text not null default 'usuario' check (papel in ('admin','usuario')),
  ativo integer not null default 1, ciencia_versao integer not null default 0,
  criado_em text not null default (datetime('now')));

create table if not exists codigos (
  email text primary key, hash text not null, expira integer not null,
  tentativas integer not null default 0, enviados text not null default '[]');

create table if not exists sessoes (
  token_hash text primary key, pessoa_id integer not null references pessoas(id) on delete cascade,
  csrf text not null, expira integer not null);

-- Registro de eventos: só inclusão, sem conteúdo de conversa.
create table if not exists eventos (
  id integer primary key, em text not null, pessoa_id integer, tipo text not null, detalhes text not null default '{}');
create trigger if not exists eventos_sem_update before update on eventos begin select raise(abort, 'eventos: só inclusão'); end;
create trigger if not exists eventos_sem_delete before delete on eventos begin select raise(abort, 'eventos: só inclusão'); end;

create table if not exists areas (
  id integer primary key, nome text not null unique, sigilosa integer not null default 0);
create table if not exists area_pessoas (
  area_id integer not null references areas(id) on delete cascade,
  pessoa_id integer not null references pessoas(id) on delete cascade,
  responsavel integer not null default 0, primary key (area_id, pessoa_id));
create table if not exists grupos (id integer primary key, nome text not null unique);
create table if not exists grupo_pessoas (
  grupo_id integer not null references grupos(id) on delete cascade,
  pessoa_id integer not null references pessoas(id) on delete cascade, primary key (grupo_id, pessoa_id));

-- Catálogo de modelos da empresa (ids do OpenRouter).
create table if not exists modelos (
  id text primary key, nome text not null default '', fornecedor text not null default '',
  preco_entrada real, preco_saida real, contexto integer,
  liberado integer not null default 0, perfil text check (perfil in ('rapido','equilibrado','avancado')),
  reserva text, homologado integer not null default 0, homologacao text,
  no_catalogo integer not null default 1, aviso text, atualizado_em text);

create table if not exists documentos (
  id integer primary key, titulo text not null, arquivo text not null,
  area_id integer references areas(id) on delete cascade, toda_empresa integer not null default 0,
  quick_win_id integer references quick_wins(id) on delete cascade,
  sigiloso integer not null default 0, texto text not null, enviado_por integer,
  criado_em text not null default (datetime('now')), atualizado_em text not null default (datetime('now')));
create virtual table if not exists trechos using fts5(texto, documento_id unindexed, tokenize = 'unicode61 remove_diacritics 2');

create table if not exists quick_wins (
  id integer primary key, nome text not null, cor text not null default '#1B7950', icone text not null default '',
  para_que_serve text not null default '', instrucoes text not null default '',
  toda_empresa integer not null default 0, bases text not null default '{"modo":"area","ids":[]}',
  modelo text, pode_trocar integer not null default 0, formato text not null default 'texto',
  sugestoes text not null default '[]', exemplo_entrada text not null default '', exemplo_saida text not null default '',
  sigiloso integer not null default 0, dados text not null default '{}',
  status text not null default 'em_configuracao' check (status in ('identificado','em_configuracao','em_teste','em_uso','em_avaliacao','aprovado','em_expansao','descartado')),
  problema text not null default '', objetivo text not null default '', processo_atual text not null default '', resultado text not null default '',
  responsavel_id integer references pessoas(id) on delete set null,
  criado_por integer, criado_em text not null default (datetime('now')), atualizado_em text not null default (datetime('now')));
create table if not exists quick_win_areas (
  quick_win_id integer not null references quick_wins(id) on delete cascade,
  area_id integer not null references areas(id) on delete cascade, primary key (quick_win_id, area_id));

create table if not exists conversas (
  id integer primary key, pessoa_id integer not null references pessoas(id) on delete cascade,
  quick_win_id integer references quick_wins(id) on delete set null, teste integer not null default 0,
  titulo text not null default 'Nova conversa', modelo text,
  sigilosa integer not null default 0, motivo_sigilosa text, cortada integer not null default 0,
  feedback text check (feedback in ('serviu','ajustes','nao_serviu')), feedback_motivo text,
  criado_em text not null, atualizado_em text not null);
create table if not exists mensagens (
  id integer primary key, conversa_id integer not null references conversas(id) on delete cascade,
  papel text not null check (papel in ('user','assistant','aviso')), texto text not null,
  modelo text, fornecedor text, fontes text, criado_em text not null);
-- Anexos: só o texto extraído, apagado junto com a conversa.
create table if not exists anexos (
  id integer primary key, conversa_id integer not null references conversas(id) on delete cascade,
  mensagem_id integer references mensagens(id) on delete cascade, nome text not null, texto text not null);

-- Medição manual dos quick wins (lançada pelo responsável) e decisões.
create table if not exists medicoes (
  id integer primary key, quick_win_id integer not null references quick_wins(id) on delete cascade,
  indicador text not null, antes_valor real, antes_data text, antes_origem text check (antes_origem in ('medido','informado')),
  depois_valor real, depois_data text, depois_origem text check (depois_origem in ('medido','informado')),
  observacao text not null default '', criado_por integer, atualizado_em text not null,
  tipo text not null default 'outro' check (tipo in ('tempo','financeiro','qualidade','volume','outro')), unidade text not null default '');
create table if not exists decisoes (
  id integer primary key, quick_win_id integer not null references quick_wins(id) on delete cascade,
  decisao text not null check (decisao in ('manter','ajustar','descartar','ampliar')), motivo text not null, pessoa_id integer, em text not null);

-- Problemas reportados pelas pessoas.
create table if not exists problemas (
  id integer primary key, pessoa_id integer, tipo text not null, descricao text not null, em text not null,
  resolvido integer not null default 0);

-- Política de Uso de IA: texto do cliente e seção automática sobre dados sigilosos, por versão.
create table if not exists politica_versoes (
  versao integer primary key, texto text not null, secao text not null, criado_em text not null, criado_por integer);

-- Pacotes extras de créditos, liberados pelo operador da plataforma.
create table if not exists pacotes (id integer primary key, em text not null, creditos integer not null, pessoa_id integer);

-- Uso da IA: uma linha por resposta, sem conteúdo.
create table if not exists uso (
  id integer primary key, em text not null, pessoa_id integer, conversa_id integer, quick_win_id integer,
  modelo_pedido text, modelo_usado text, fornecedor text, custo real not null default 0,
  economia real not null default 0, ms integer, sigilosa integer not null default 0, teste integer not null default 0);
`;

export function abrirBanco(arquivo = ':memory:') {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');
  const novo = !db.prepare("select 1 from sqlite_master where type = 'table' and name = 'config'").get();
  db.exec(ESQUEMA);
  // Banco novo já nasce com a estrutura atual: as migrações servem aos bancos que já existiam.
  if (novo) db.exec(`pragma user_version = ${MIGRACOES.length}`);
  else migrar(db);
  return db;
}

// Mudanças de estrutura depois da primeira versão: acrescente no fim, nunca edite
// as que já existem. Cada uma roda uma vez, na subida (pragma user_version).
const COLUNAS_QW = 'id, nome, cor, icone, para_que_serve, instrucoes, toda_empresa, bases, modelo, pode_trocar, formato, sugestoes, exemplo_entrada, exemplo_saida, sigiloso, dados, criado_por, criado_em, atualizado_em';
const MIGRACOES = [
  // 1. Quick win como unidade operacional: oito estados, problema, objetivo, processo atual, responsável e resultado.
  //    Medição ganha tipo (tempo, financeiro...) e unidade.
  `create table quick_wins_nova (
    id integer primary key, nome text not null, cor text not null default '#1B7950', icone text not null default '',
    para_que_serve text not null default '', instrucoes text not null default '',
    toda_empresa integer not null default 0, bases text not null default '{"modo":"area","ids":[]}',
    modelo text, pode_trocar integer not null default 0, formato text not null default 'texto',
    sugestoes text not null default '[]', exemplo_entrada text not null default '', exemplo_saida text not null default '',
    sigiloso integer not null default 0, dados text not null default '{}',
    status text not null default 'em_configuracao' check (status in ('identificado','em_configuracao','em_teste','em_uso','em_avaliacao','aprovado','em_expansao','descartado')),
    problema text not null default '', objetivo text not null default '', processo_atual text not null default '', resultado text not null default '',
    responsavel_id integer references pessoas(id) on delete set null,
    criado_por integer, criado_em text not null default (datetime('now')), atualizado_em text not null default (datetime('now')));
  insert into quick_wins_nova (${COLUNAS_QW}, status, responsavel_id)
    select ${COLUNAS_QW}, case status when 'ativo' then 'em_uso' else 'em_configuracao' end, criado_por from quick_wins;
  drop table quick_wins;
  alter table quick_wins_nova rename to quick_wins;
  alter table medicoes add column tipo text not null default 'outro' check (tipo in ('tempo','financeiro','qualidade','volume','outro'));
  alter table medicoes add column unidade text not null default '';`,
];

export function migrar(db, lista = MIGRACOES) {
  const atual = db.prepare('pragma user_version').get().user_version;
  if (atual >= lista.length) return;
  // Reconstruir tabela exige as chaves estrangeiras desligadas (fora da transação).
  db.exec('pragma foreign_keys = off');
  try {
    for (let v = atual; v < lista.length; v++) {
      transacao(db, () => { db.exec(lista[v]); db.exec(`pragma user_version = ${v + 1}`); });
    }
  } finally { db.exec('pragma foreign_keys = on'); }
}

// Atalhos. Parâmetros booleanos e undefined viram 0/1 e null (o SQLite não aceita).
const norm = p => p.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
export const um = (db, sql, ...p) => db.prepare(sql).get(...norm(p));
export const todos = (db, sql, ...p) => db.prepare(sql).all(...norm(p));
export const exec = (db, sql, ...p) => db.prepare(sql).run(...norm(p));

export function transacao(db, fn) {
  db.exec('begin');
  try { const r = fn(); db.exec('commit'); return r; } catch (e) { db.exec('rollback'); throw e; }
}

export const json = (v, padrao) => { try { return v ? JSON.parse(v) : padrao; } catch { return padrao; } };
