// Estrutura aditiva; dados antigos permanecem intactos.
export const ESQUEMA_PROGRAMACAO = `create table if not exists qw_programacoes (
    id text primary key, quick_win_id integer not null references quick_wins(id), versao_id integer not null,
    pessoa_id integer not null references pessoas(id), nome text not null, tipo text not null,
    agenda text not null, webhook_id text, entrada_cifrada text not null, ativa integer not null default 0,
    proxima_em text, limite_creditos real not null, max_dia integer not null, revisao integer not null default 1,
    criado_em text not null, atualizado_em text not null);
    create index if not exists qw_programacoes_proxima on qw_programacoes(ativa,proxima_em);
    create table if not exists qw_programadas_execucoes (
    id text primary key, programacao_id text not null references qw_programacoes(id), revisao integer not null,
    chave text not null unique, status text not null, prevista_em text not null, criada_em text not null,
    iniciada_em text, finalizada_em text, conversa_id integer references conversas(id) on delete set null,
    custo real not null default 0, motivo text, notificada integer not null default 0);
    create index if not exists qw_programadas_fila on qw_programadas_execucoes(status,criada_em);`;
