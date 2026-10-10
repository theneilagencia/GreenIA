// Catálogo fechado e versionado. A pessoa escolhe o trabalho; não desenha campos ou fórmulas.
export const MODELOS_PAINEL = {
  fornecedores: {
    id: 'fornecedores', versao: 1, nome: 'Conferir documentos de fornecedores',
    descricao: 'Confira os documentos apresentados e acompanhe o que está completo ou precisa de atenção.',
    unidade: 'documentos', estados: { conferido: 'Conferido', pendente: 'Com pendência', nao_informado: 'Precisa conferir' },
    campos: [{ id: 'fornecedor', nome: 'Fornecedor', obrigatorio: true, max: 160 }, { id: 'documento', nome: 'Documento', obrigatorio: true, max: 160 }, { id: 'situacao', nome: 'Situação', tipo: 'estado', obrigatorio: true }, { id: 'pendencia', nome: 'O que precisa resolver', max: 500 }],
    ensino: { nome: 'Conferência de fornecedores', descricao: 'Confira os documentos dos fornecedores enviados pela pessoa, usando os critérios fornecidos pela empresa. Apresente uma tabela com fornecedor, documento, situação e o que precisa resolver. Use conferido somente quando puder conferir pelos critérios e fontes disponíveis; pendente quando houver uma pendência identificada; precisa conferir quando faltar evidência. Não certifique compliance, autenticidade ou aprovação do fornecedor. Se os critérios não forem fornecidos, explique a limitação. Não invente documentos, fornecedores nem pendências.', formato: 'tabela', regras: ['nao_inventar', 'destacar_ausentes', 'indicar_fontes', 'preservar_numeros'] },
  },
  acoes: {
    id: 'acoes', versao: 1, nome: 'Acompanhar ações e prazos',
    descricao: 'Organize as ações informadas e acompanhe responsáveis, prazos e o que falta concluir.',
    unidade: 'ações', estados: { pendente: 'Pendente', concluida: 'Concluída', nao_informado: 'Precisa conferir' },
    campos: [{ id: 'acao', nome: 'Ação', obrigatorio: true, max: 300 }, { id: 'responsavel', nome: 'Responsável', max: 160 }, { id: 'prazo', nome: 'Prazo', tipo: 'data' }, { id: 'situacao', nome: 'Situação', tipo: 'estado', obrigatorio: true }],
    ensino: { nome: 'Acompanhamento de ações', descricao: 'Organize as ações dos materiais enviados numa tabela com ação, responsável, prazo e situação. Preserve nomes e datas informados. Use pendente ou concluída somente quando explicitamente informado; caso contrário, indique precisa conferir. Não invente responsáveis, prazos, ações nem conclusões. Indique o que falta informar.', formato: 'tabela', regras: ['nao_inventar', 'destacar_ausentes', 'indicar_fontes', 'preservar_numeros'] },
  },
};
export const ESQUEMA_PAINEIS = `
create table if not exists qw_paineis (
 quick_win_id integer primary key references quick_wins(id) on delete cascade,
 modelo text not null, versao integer not null, criado_por integer not null, criado_em text not null);
create table if not exists qw_painel_registros (
 id integer primary key, quick_win_id integer not null references qw_paineis(quick_win_id) on delete cascade,
 conversa_id integer not null references conversas(id) on delete cascade,
 mensagem_id integer not null unique references mensagens(id) on delete cascade,
 pessoa_id integer not null references pessoas(id) on delete cascade,
 estado text not null check(estado in ('rascunho','confirmado','cancelado')),
 escopo text not null default 'pessoal' check(escopo in ('pessoal','equipe')),
 dados text not null, evidencias text not null default '[]', motivo_preparacao text,
 versao integer not null default 1, criado_em text not null, confirmado_em text, atualizado_em text not null);
create index if not exists qw_painel_qw on qw_painel_registros(quick_win_id,estado);
create table if not exists qw_painel_revisoes (
 id integer primary key, registro_id integer not null references qw_painel_registros(id) on delete cascade,
 versao integer not null, dados text not null, escopo text not null, estado text not null,
 motivo text not null, pessoa_id integer not null, em text not null, unique(registro_id,versao));`;
