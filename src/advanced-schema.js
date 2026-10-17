// Tabelas aditivas, isoladas por banco da empresa. Conteúdo privado só em pedidos.
export const ESQUEMA_ADVANCED = `
create table if not exists advanced_autorizacoes (
 id integer primary key, pessoa_id integer references pessoas(id) on delete cascade,
 grupo_id integer references grupos(id) on delete cascade, papel text,
 conversa_id integer references conversas(id) on delete cascade,
 ferramentas text not null default '{}', modelos text not null, provedores text not null, limite_usd real not null,
 limite_chamada_usd real not null, saida_tokens integer not null,
 expira_em text not null, revogada integer not null default 0, por integer not null, em text not null);
create table if not exists advanced_pedidos (
 id integer primary key, pessoa_id integer not null references pessoas(id) on delete cascade,
 conversa_id integer not null references conversas(id) on delete cascade,
 estado text not null check(estado in ('preparado','pendente','aprovado','recusado')),
 alternativa integer not null default 0, requisitos text not null default '{}', corpo text not null, justificativa text not null, estimativa_usd real,
 em text not null, decisao_em text, decisao_por integer, motivo text,
 autorizacao_id integer references advanced_autorizacoes(id) on delete set null);
create table if not exists advanced_consumo (
 id integer primary key, autorizacao_id integer not null,
 pessoa_id integer not null, conversa_id integer, modelo text not null, provedor text not null,
 reservado real not null, custo real, geracao text, em text not null);
create index if not exists advanced_consumo_autorizacao on advanced_consumo(autorizacao_id);
create index if not exists advanced_pedidos_pessoa on advanced_pedidos(pessoa_id,conversa_id);
`;
