// Banco de uma empresa: um arquivo SQLite (WAL). Cada empresa tem o seu arquivo (instalação única
// ou dados/empresas/<company_id>.sqlite no modo multiempresa), então nenhuma tabela tem coluna de cliente.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ESQUEMA = `
create table if not exists config (chave text primary key, valor text not null);

create table if not exists pessoas (
  id integer primary key, email text not null unique, nome text not null default '',
  papel text not null default 'usuario' check (papel in ('admin','usuario')),
  ativo integer not null default 1, ciencia_versao integer not null default 0,
  criado_em text not null default (datetime('now')), user_id text);

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

-- Área (departamento): grupo de pessoas com base de conhecimento própria. Desativada, sai do uso
-- (ninguém a vê nem usa os documentos dela), mas nada é apagado.
create table if not exists areas (
  id integer primary key, nome text not null unique, sigilosa integer not null default 0,
  descricao text not null default '', ativa integer not null default 1);
-- Permissões dentro da área, independentes do papel global: admin_base administra a base de
-- conhecimento da área; responsavel responde pela área (quick wins e contato indicado pela IA).
create table if not exists area_pessoas (
  area_id integer not null references areas(id) on delete cascade,
  pessoa_id integer not null references pessoas(id) on delete cascade,
  responsavel integer not null default 0, admin_base integer not null default 0, primary key (area_id, pessoa_id));
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
  no_catalogo integer not null default 1, aviso text, atualizado_em text,
  capacidades text, vetado_plataforma integer not null default 0, autorizacao_plataforma text, atributos text);

create table if not exists documentos (
  id integer primary key, titulo text not null, arquivo text not null,
  area_id integer references areas(id) on delete cascade, toda_empresa integer not null default 0,
  quick_win_id integer references quick_wins(id) on delete cascade,
  sigiloso integer not null default 0, texto text not null, enviado_por integer,
  pasta text not null default '', revisado_em text, revisado_por integer,
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
  criado_por integer, criado_em text not null default (datetime('now')), atualizado_em text not null default (datetime('now')),
  especificacao text, versao_publicada integer, excluido_em text, excluido_por integer);
-- Versões publicadas de um Quick Win 2.0: o que as pessoas usam. O rascunho fica em quick_wins.especificacao.
-- Só o trabalho é versionado; áreas, regras de dados, sigilo e bases valem na hora (governança).
create table if not exists quick_win_versoes (
  id integer primary key, quick_win_id integer not null references quick_wins(id) on delete cascade,
  numero integer not null, especificacao text not null, nome text not null, para_que_serve text not null default '',
  formato text not null default 'texto', teste text, publicada_em text not null, publicada_por integer, unique (quick_win_id, numero));
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

-- Contatos da página de vendas (só na instalação do operador, com PAGINA_INICIAL=vendas).
create table if not exists leads (id integer primary key, em text not null, nome text not null, email text not null, empresa text not null,
  cargo text not null default '', pessoas text not null default '', mensagem text not null default '', ip text);

-- Pacotes extras de créditos, liberados pelo operador da plataforma.
create table if not exists pacotes (id integer primary key, em text not null, creditos integer not null, pessoa_id integer,
  observacao text not null default '', validade text, origem text not null default 'manual', operador text);

-- Decisões de roteamento: por que cada resposta usou aquele modelo. Só sinais, rótulos e números;
-- nenhum trecho da mensagem, dos anexos ou dos documentos.
create table if not exists roteamento (
  id integer primary key, em text not null, pessoa_id integer, conversa_id integer, mensagem_id integer, resposta_id integer, quick_win_id integer,
  modo text not null, complexidade text not null, pontuacao real not null default 0, tipos text not null default '[]', precisao text not null default '[]',
  sinais text not null default '{}', classe_necessaria text, modelo text, classe text, politicas text not null default '[]', candidatos text not null default '[]',
  tokens_entrada integer, tokens_saida integer, custo_estimado real, custo_referencia real, modelo_usado text, custo_real real,
  explicacao text not null default '', versao text not null default '', sigilosa integer not null default 0, teste integer not null default 0,
  origem text, classe_pedida text, preferencia text, requisitos text not null default '{}', janela_minima integer, janela_desejada integer,
  motivo_escolha text, fallback text, reserva text, resultado text,
  ms_primeiro_token integer, ms_total integer, feedback text, refeito integer not null default 0, nova_tentativa_de integer,
  modelo_solicitado text, decisao_solicitado text, motivo_substituicao text, politica_sigilo text, guardrails text, motivo_bloqueio text,
  qualidade text);
create index if not exists roteamento_em on roteamento (em);

-- Produção visual: artefatos de uma execução (apresentação, one-page, infográfico, peça...). Pertencem à conversa
-- (apagados com ela, pela retenção) e a quem a criou. Cada edição é uma nova versão (mesma base_id); só uma é atual.
-- Guarda o conteúdo estruturado, o plano visual, as opções de composição e a identidade usada: o arquivo final
-- (PDF, PNG, JPG, SVG) é refeito a partir deles, sempre igual.
create table if not exists artefatos_visuais (
  id integer primary key, base_id integer, versao integer not null default 1, atual integer not null default 1,
  conversa_id integer not null references conversas(id) on delete cascade, mensagem_id integer references mensagens(id) on delete set null,
  roteamento_id integer, quick_win_id integer references quick_wins(id) on delete set null, quick_win_versao integer,
  pessoa_id integer not null references pessoas(id) on delete cascade, entregavel_id text, derivado_de integer,
  tipo text not null, rotulo text not null, titulo text not null, formato text not null, paginas integer not null default 1,
  conteudo text not null, plano text not null, opcoes text not null default '{}', identidade text not null default '{}',
  qualidade text not null default '{}', status text not null, exportacoes text not null default '[]',
  editado_por integer, criado_em text not null);
create index if not exists artefatos_conversa on artefatos_visuais (conversa_id, atual);
-- Imagens usadas pelos artefatos (geradas ou enviadas). Só o binário e metadados técnicos.
create table if not exists visual_assets (
  id integer primary key, conversa_id integer not null references conversas(id) on delete cascade, pessoa_id integer not null,
  tipo text not null, origem text not null, mime text not null, w integer, h integer, bytes blob not null, sha text, criado_em text not null);

-- Uso da IA: uma linha por resposta, sem conteúdo.
create table if not exists uso (
  id integer primary key, em text not null, pessoa_id integer, conversa_id integer, quick_win_id integer,
  modelo_pedido text, modelo_usado text, fornecedor text, custo real not null default 0,
  economia real not null default 0, ms integer, sigilosa integer not null default 0, teste integer not null default 0);
`;

// Consolida o WAL no banco e trunca o arquivo -wal: o conteúdo apagado (já zerado no banco por secure_delete)
// deixa de existir também no WAL. Seguro com o servidor no ar: o checkpoint é do próprio SQLite e, se houver
// leitura em andamento, ele devolve busy e a próxima rodada completa. Não reescreve o banco (não é VACUUM).
export function consolidarWal(db) {
  try { const r = db.prepare('pragma wal_checkpoint(TRUNCATE)').get(); return { ok: !r.busy, ...r }; }
  catch (e) { return { ok: false, erro: e.message }; }
}

export function abrirBanco(arquivo = ':memory:') {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  // secure_delete: o que é apagado (conversa excluída, retenção vencida) é zerado no arquivo, e não fica em
  // página livre do banco nem, por consequência, nos backups, que são cópias dele.
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000; pragma secure_delete = on;');
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
  // 2. Pacote extra com observação, validade opcional e origem (painel ou console do operador).
  //    Bancos anteriores aos pacotes já recebem a tabela nova pelo ESQUEMA: só acrescenta o que falta.
  db => {
    for (const [coluna, def] of [['observacao', "text not null default ''"], ['validade', 'text'], ['origem', "text not null default 'manual'"], ['operador', 'text']]) {
      if (!db.prepare('pragma table_info(pacotes)').all().some(c => c.name === coluna)) db.exec(`alter table pacotes add column ${coluna} ${def}`);
    }
  },
  // 3. Multiempresa: a pessoa da empresa aponta para a identidade global do usuário na plataforma.
  db => {
    if (!db.prepare('pragma table_info(pessoas)').all().some(c => c.name === 'user_id')) db.exec('alter table pessoas add column user_id text');
  },
  // 4. Áreas com descrição e desativação; permissão de administrar a base separada do responsável
  //    (quem já era responsável continua administrando a base); documentos com pasta e revisão.
  db => {
    const tem = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
    if (!tem('areas', 'descricao')) db.exec("alter table areas add column descricao text not null default ''");
    if (!tem('areas', 'ativa')) db.exec('alter table areas add column ativa integer not null default 1');
    if (!tem('area_pessoas', 'admin_base')) db.exec('alter table area_pessoas add column admin_base integer not null default 0; update area_pessoas set admin_base = responsavel;');
    if (!tem('documentos', 'pasta')) db.exec("alter table documentos add column pasta text not null default ''");
    if (!tem('documentos', 'revisado_em')) db.exec('alter table documentos add column revisado_em text; alter table documentos add column revisado_por integer;');
  },
  // 5. Roteamento de modelos: a tabela vem pelo ESQUEMA; nada a converter.
  () => {},
  // 6. Roteamento 2.0: requisitos de capacidade, janela, preferência, motivo da escolha, fallback,
  //    reserva de execução e resultado, para reconstruir cada decisão sem o conteúdo da conversa.
  db => {
    const tem = c => db.prepare('pragma table_info(roteamento)').all().some(x => x.name === c);
    for (const [c, def] of [['origem', 'text'], ['classe_pedida', 'text'], ['preferencia', 'text'], ['requisitos', "text not null default '{}'"], ['janela_minima', 'integer'],
      ['janela_desejada', 'integer'], ['motivo_escolha', 'text'], ['fallback', 'text'], ['reserva', 'text'], ['resultado', 'text']]) if (!tem(c)) db.exec(`alter table roteamento add column ${c} ${def}`);
  },
  // 7. Capacidades explícitas por modelo (opcional; sem elas vale o nível da classe) e dados para
  //    calibração futura do roteador: latência, feedback da resposta e se o pedido foi refeito.
  db => {
    const tem = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
    if (!tem('modelos', 'capacidades')) db.exec('alter table modelos add column capacidades text');
    for (const [c, def] of [['ms_primeiro_token', 'integer'], ['ms_total', 'integer'], ['feedback', 'text'], ['refeito', 'integer not null default 0'], ['nova_tentativa_de', 'integer']])
      if (!tem('roteamento', c)) db.exec(`alter table roteamento add column ${c} ${def}`);
  },
  // 8. Modelo solicitado (pela tela ou pela API) é preferência: o registro guarda o que foi pedido, a decisão
  //    (respeitado, substituido, bloqueado) e o motivo determinístico. Veto da plataforma para dado sigiloso.
  db => {
    const tem = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
    for (const c of ['modelo_solicitado', 'decisao_solicitado', 'motivo_substituicao']) if (!tem('roteamento', c)) db.exec(`alter table roteamento add column ${c} text`);
    if (!tem('modelos', 'vetado_plataforma')) db.exec('alter table modelos add column vetado_plataforma integer not null default 0');
  },
  // 9. Informação sigilosa com guardrails: a autorização da plataforma sai da homologação da empresa (coluna
  //    própria); as homologações existentes ganham os atributos da rota que já valiam (fornecedor usado como
  //    endpoint no envio; retenção zero e ausência de treino eram confirmações obrigatórias para homologar).
  //    Registro de auditoria: política da empresa, guardrails aplicados e motivo do bloqueio.
  db => {
    const tem = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
    if (!tem('modelos', 'autorizacao_plataforma')) db.exec('alter table modelos add column autorizacao_plataforma text');
    for (const c of ['politica_sigilo', 'guardrails', 'motivo_bloqueio']) if (!tem('roteamento', c)) db.exec(`alter table roteamento add column ${c} text`);
    for (const m of db.prepare('select id, homologado, homologacao from modelos where homologacao is not null').all()) {
      let h; try { h = JSON.parse(m.homologacao); } catch { continue; }
      if (h?.origem === 'plataforma') {
        db.prepare('update modelos set autorizacao_plataforma = ?, homologado = 0, homologacao = null where id = ?')
          .run(JSON.stringify({ fornecedor: h.fornecedor, endpoint: h.fornecedor, retencaoZero: true, semTreino: true, justificativa: h.justificativa, por: h.quem, em: h.em }), m.id);
      } else if (h && h.endpoint === undefined) {
        db.prepare('update modelos set homologacao = ? where id = ?').run(JSON.stringify({ ...h, endpoint: h.fornecedor, retencaoZero: true, semTreino: true, atributos: 'confirmados na homologação' }), m.id);
      }
    }
  },
  // 10. O modo "Automático do serviço de IA" deixa de levar o nome do provedor no identificador interno.
  db => {
    db.exec("update roteamento set modo = 'externo' where modo = 'openrouter_auto'");
    db.exec("update roteamento set classe_pedida = 'externo' where classe_pedida = 'openrouter_auto'");
  },
  // 11. Atributos de dados de cada recurso, declarados pelo admin (treino, retenção, dado pessoal, região).
  db => { if (!db.prepare("select 1 from pragma_table_info('modelos') where name = 'atributos'").get()) db.exec('alter table modelos add column atributos text'); },
  // 12. Quick Wins 2.0: especificação interna (rascunho), versão publicada e resultado da conferência de
  //     qualidade de cada resposta (só estado e itens, sem conteúdo). A tabela de versões vem pelo ESQUEMA.
  db => {
    const tem = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
    if (!tem('quick_wins', 'especificacao')) db.exec('alter table quick_wins add column especificacao text');
    if (!tem('quick_wins', 'versao_publicada')) db.exec('alter table quick_wins add column versao_publicada integer');
    if (!tem('roteamento', 'qualidade')) db.exec('alter table roteamento add column qualidade text');
  },
  // 13. Exclusão de Quick Win sem perder histórico (soft delete): versões, medições, decisões, arquivos, conversas
  //     e eventos continuam; o Quick Win só sai do catálogo da empresa. Só acrescenta colunas.
  db => {
    const tem = (t, c) => db.prepare(`pragma table_info(${t})`).all().some(x => x.name === c);
    if (!tem('quick_wins', 'excluido_em')) db.exec('alter table quick_wins add column excluido_em text');
    if (!tem('quick_wins', 'excluido_por')) db.exec('alter table quick_wins add column excluido_por integer');
  },
  // 14. Produção visual: as tabelas artefatos_visuais e visual_assets vêm pelo ESQUEMA (só acrescenta).
  () => {},
];

export function migrar(db, lista = MIGRACOES) {
  const atual = db.prepare('pragma user_version').get().user_version;
  if (atual >= lista.length) return;
  // Reconstruir tabela exige as chaves estrangeiras desligadas (fora da transação).
  db.exec('pragma foreign_keys = off');
  try {
    for (let v = atual; v < lista.length; v++) {
      transacao(db, () => { typeof lista[v] === 'function' ? lista[v](db) : db.exec(lista[v]); db.exec(`pragma user_version = ${v + 1}`); });
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
