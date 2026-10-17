// Metadados operacionais; nenhum prompt, anexo, nome de arquivo ou conteúdo produzido.
export const ESQUEMA_RESULTADOS = `
create table if not exists resultado_meta(chave text primary key, valor text not null);
create table if not exists trabalhos(
 id integer primary key, pessoa_id integer not null, conversa_id integer, tipo text not null,
 estado text not null default 'em_execucao', aberto_em text not null, atualizado_em text not null,
 concluido_em text, teste integer not null default 0, origem text not null default 'observado', anterior_id integer);
create index if not exists trabalhos_pessoa on trabalhos(pessoa_id,aberto_em);
create index if not exists trabalhos_conversa on trabalhos(conversa_id,id);
create table if not exists trabalho_tentativas(
 id integer primary key, trabalho_id integer not null references trabalhos(id), pessoa_id integer not null,
 inicio text not null, fim text, classe text not null, estado text not null default 'em_execucao',
 executada integer not null default 0, resposta_id integer, rota_id integer, motivo text);
create table if not exists trabalho_chamadas(
 id integer primary key, tentativa_id integer references trabalho_tentativas(id), em text not null, fim text,
 geracao text, modelo text, estado text not null, custo_reportado real, custo_conciliado real, conciliado_em text);
create table if not exists trabalho_verificacoes(
 id integer primary key, trabalho_id integer not null references trabalhos(id), tentativa_id integer,
 em text not null, por integer, categoria text not null, criterio text not null, resultado text not null, limite text not null, evidencia text);
create table if not exists trabalho_eventos(
 id integer primary key, trabalho_id integer not null references trabalhos(id), tentativa_id integer,
 em text not null, tipo text not null, estado text, pessoa_id integer);
create table if not exists resultado_contas(pessoa_id integer primary key, categoria text not null default 'pessoa');
create table if not exists resultado_habilitacao(
 id integer primary key, pessoa_id integer not null, em text not null, habilitada integer not null,
 categoria text not null, nome text not null, situacao text not null);
create index if not exists resultado_habilitacao_pessoa on resultado_habilitacao(pessoa_id,em);
create table if not exists resultado_ajustes_creditos(
 id integer primary key, pessoa_id integer not null, trabalho_id integer, em text not null,
 creditos real not null, referencia text not null unique, natureza text not null, origem text not null);
`;
