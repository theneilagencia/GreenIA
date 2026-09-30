// Quick wins: espaços de trabalho de uma tarefa repetitiva, configurados pelo
// responsável da área (instruções, arquivos, bases, modelo, formato, dados) e
// usados pelo time em conversas próprias, com feedback e medição.
import { readFileSync } from 'node:fs';
import { erro } from './http.js';
import { exec, json, todos, transacao, um } from './db.js';
import { acoesDoQuickWin, lerConfig, TIPOS_DADO } from './config.js';
import { ACOES } from './filtro.js';
import { registrar } from './eventos.js';
import { delimitar, extrairTexto } from './texto.js';
import { buscar, desindexar, indexar } from './busca.js';
import { trechosDasBases } from './bases.js';
import { acharModelo, custoEstimado, ehClasse, lerModelos, NOMES_CLASSE, resolverClasse } from './modelos.js';
import * as QW2 from './quickwin-construtor.js';
import { estruturarObjetivo } from './quickwin-estrutura.js';

const MODELOS_INICIAIS = new URL('../modelos-quick-win.json', import.meta.url);
const FORMATOS = ['texto', 'lista', 'tabela', 'checklist'];
// Ciclo de adoção: identificar, configurar, testar, usar, avaliar, decidir, ampliar.
export const STATUS = ['identificado', 'em_configuracao', 'em_teste', 'em_uso', 'em_avaliacao', 'aprovado', 'em_expansao', 'descartado'];
export const EM_CIRCULACAO = ['em_teste', 'em_uso', 'em_avaliacao', 'aprovado', 'em_expansao'];   // disponíveis para quem está nas áreas
const ANTIGOS = { rascunho: 'em_configuracao', ativo: 'em_uso', pausado: 'em_configuracao' };      // nomes da versão anterior da API
const MAX_ARQUIVOS_INTEIROS = 40000;   // acima disso, só os trechos relevantes dos arquivos

export const areasDoQw = (db, id) => todos(db, 'select area_id from quick_win_areas where quick_win_id = ?', id).map(a => a.area_id);

const naLista = (pessoa, l = {}) => (l.pessoas || []).includes(pessoa.id) || (l.grupos || []).some(g => pessoa.grupos.includes(g));

// O que a pessoa pode criar: em quais áreas e se pode para a empresa toda.
export function permissoesQw(db, pessoa, cfg = lerConfig(db)) {
  const c = cfg.criarQuickWin;
  const autorizado = pessoa.admin || naLista(pessoa, c);
  const areas = pessoa.admin ? todos(db, 'select id, nome from areas where ativa = 1 order by nome')
    : autorizado ? pessoa.areas : c.responsaveis ? pessoa.areas.filter(a => a.responsavel) : [];
  const todaEmpresa = pessoa.admin || naLista(pessoa, c.todaEmpresa);
  return { criar: areas.length > 0 || todaEmpresa, todaEmpresa, areas: areas.map(a => ({ id: a.id, nome: a.nome })) };
}

// Gerencia: o admin, o responsável de uma das áreas e quem criou (enquanto puder criar).
export function podeGerir(db, pessoa, qw) {
  if (pessoa.admin) return true;
  if (qw.criado_por === pessoa.id && permissoesQw(db, pessoa).criar) return true;
  if (qw.toda_empresa) return false;
  const minhas = pessoa.areas.filter(a => a.responsavel).map(a => a.id);
  return areasDoQw(db, qw.id).some(a => minhas.includes(a));
}

function visivel(db, pessoa, qw) {
  if (qw.toda_empresa) return true;
  const minhas = pessoa.areas.map(a => a.id);
  return areasDoQw(db, qw.id).some(a => minhas.includes(a));
}

function publico(db, pessoa, q) {
  const areas = areasDoQw(db, q.id);
  const base = {
    id: q.id, nome: q.nome, cor: q.cor, icone: q.icone, para_que_serve: q.para_que_serve, status: q.status, formato: q.formato,
    sugestoes: json(q.sugestoes, []), modelo: q.modelo, pode_trocar: !!q.pode_trocar, sigiloso: !!q.sigiloso, toda_empresa: !!q.toda_empresa,
    areas, podeEditar: podeGerir(db, pessoa, q), problema: q.problema, objetivo: q.objetivo,
    responsavel: q.responsavel_id ? um(db, 'select id, nome, email from pessoas where id = ?', q.responsavel_id) || null : null,
  };
  const v2 = versaoDe(db, q);
  if (v2) Object.assign(base, v2.publico);
  if (!base.podeEditar) return base;
  if (v2) Object.assign(base, v2.gestao);
  return { ...base, processo_atual: q.processo_atual, resultado: q.resultado, instrucoes: q.instrucoes, exemplo_entrada: q.exemplo_entrada, exemplo_saida: q.exemplo_saida, bases: json(q.bases, { modo: 'area', ids: [] }),
    dados: acoesDoQuickWin(q.dados, lerConfig(db)), arquivos: todos(db, 'select id, titulo, arquivo, sigiloso, length(texto) as caracteres from documentos where quick_win_id = ? order by id', q.id) };
}

// Quick Win 2.0 (com especificação): o que quem usa vê (versão atual) e o que quem gere vê (rascunho, respostas
// da criação, último teste). Nunca modelo, prompt ou detalhe técnico.
function versaoDe(db, q) {
  if (!q.especificacao) return null;
  const espec = json(q.especificacao, null);
  const pub = q.versao_publicada ? um(db, 'select id, numero, especificacao, publicada_em from quick_win_versoes where id = ?', q.versao_publicada) : null;
  const teste = um(db, "select r.qualidade, r.em from roteamento r join conversas c on c.id = r.conversa_id where r.quick_win_id = ? and r.teste = 1 and r.qualidade is not null order by r.id desc limit 1", q.id);
  return {
    publico: { v2: true, versao: pub?.numero ?? null, regras: QW2.regrasPrincipais(pub ? json(pub.especificacao, null) : espec), formato_saida: (pub ? json(pub.especificacao, {}) : espec)?.formato_saida?.tipo || null },
    gestao: { assistente: espec?.origem || null, rascunho_alterado: !pub || pub.especificacao !== q.especificacao, regras_rascunho: QW2.regrasPrincipais(espec),
      arquetipo: espec?.arquetipo || null, ultimo_teste: teste ? { ...QW2.resumoQualidade(json(teste.qualidade, {})), em: teste.em } : null },
  };
}

// Classe de partida de um Quick Win 2.0, pela dica de complexidade da especificação. É só um piso para o
// roteamento automático (o Quick Win deixa trocar): a governança e o roteador continuam decidindo o recurso.
function classeSugerida(app, cfg, espec, sigiloso) {
  const ordem = espec?.dicas_roteamento?.complexidade === 'baixa' ? ['rapido', 'equilibrado', 'avancado'] : ['equilibrado', 'rapido', 'avancado'];
  for (const p of ordem.filter(x => cfg.perfisQuickWin.includes(x))) {
    const m = acharModelo(app.db, cfg, resolverClasse(app.db, cfg, `classe:${p}`, { sigilosa: !!sigiloso }));
    if (m?.liberado && (!sigiloso || (m.homologado && m.perfil === p))) return `classe:${p}`;
  }
  return null;
}

// A especificação só entra pelo construtor (ou cópia interna): um corpo JSON não tem chave Symbol, então
// ninguém grava uma especificação montada à mão pela API.
const ESPEC = Symbol('especificacao');

// Respostas da criação em 5 etapas -> campos do Quick Win. Segredo no que a pessoa escreveu ou mostrou: recusa.
function doAssistente(app, cfg, a, atual = {}) {
  if (QW2.conferirSegredos([a?.descricao, a?.como?.texto, a?.como?.exemplo, a?.nome, a?.para_que_serve, a?.formato_descricao, ...QW2.regrasProprias(a?.regras_proprias).map(x => x.texto), ...QW2.limparColunas(a?.colunas)]))
    throw erro(422, 'dado_bloqueado', 'Por segurança, senhas, chaves de acesso e outros segredos não podem fazer parte de um Quick Win. Tire o segredo do texto e tente de novo.', { tipos: ['credencial'] });
  // Regras próprias: ajustar sem mandar a lista mantém as que já estão no rascunho (lista vazia remove todas).
  const anterior = json(atual.especificacao, null);
  const proprias = a?.regras_proprias !== undefined ? a.regras_proprias : anterior?.regras_proprias || [];
  // Colunas: sem a lista, as que a pessoa definiu continuam; a estrutura do objetivo continua se o objetivo for o mesmo.
  const colunas = a?.colunas !== undefined ? { colunas: a.colunas, colunas_origem: a.colunas_origem }
    : anterior?.origem?.colunas_origem === 'pessoa' ? { colunas: anterior.origem.colunas, colunas_origem: 'pessoa' } : {};
  const estrutura_objetivo = a?.estrutura_objetivo !== undefined ? a.estrutura_objetivo : anterior?.origem?.estrutura_objetivo || null;
  const espec = QW2.construir({ ...a, ...colunas, estrutura_objetivo, regras_proprias: proprias, _estruturaAnterior: anterior?.origem?.exemplo || null, nome: a?.nome || (atual.especificacao ? atual.nome : '') });
  const v = { [ESPEC]: JSON.stringify(espec), formato: QW2.FORMATOS_SAIDA[espec.formato_saida.tipo].legado, pode_trocar: 1 };
  if (!atual.id || a?.nome) v.nome = espec.origem.nome;
  if (!atual.id || a?.para_que_serve !== undefined || !atual.para_que_serve) v.para_que_serve = String(a?.para_que_serve || QW2.descricaoAutomatica(v.nome || atual.nome, espec.regras)).slice(0, 200);
  const classe = classeSugerida(app, cfg, espec, atual.sigiloso);
  if (classe && (!atual.modelo || ehClasse(atual.modelo))) v.modelo = classe;
  return v;
}

function validar(app, pessoa, atual, c) {
  const cfg = lerConfig(app.db);
  if (c.assistente) c = { ...c, ...doAssistente(app, cfg, c.assistente, atual), assistente: undefined };
  const v = {};
  if (c[ESPEC] !== undefined) v.especificacao = c[ESPEC];
  if (c.nome !== undefined) { v.nome = String(c.nome).trim().slice(0, 80); if (!v.nome) throw erro(400, 'nome', 'Dê um nome ao quick win.'); }
  if (c.cor !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(c.cor)) throw erro(400, 'cor', 'Cor inválida.'); v.cor = c.cor; }
  if (c.icone !== undefined) v.icone = String(c.icone).trim().slice(0, 2);
  for (const k of ['para_que_serve', 'instrucoes', 'exemplo_entrada', 'exemplo_saida', 'problema', 'objetivo', 'processo_atual', 'resultado']) if (c[k] !== undefined) v[k] = String(c[k]).slice(0, k === 'instrucoes' ? 8000 : 2000);
  if (c.responsavel_id !== undefined) {
    const r = c.responsavel_id ? um(app.db, 'select id from pessoas where id = ? and ativo = 1', Number(c.responsavel_id)) : null;
    if (c.responsavel_id && !r) throw erro(400, 'responsavel', 'Escolha uma pessoa ativa como responsável.');
    v.responsavel_id = r?.id ?? null;
  }
  if (c.formato !== undefined) { if (!FORMATOS.includes(c.formato)) throw erro(400, 'formato', 'Formato inválido.'); v.formato = c.formato; }
  if (c.status !== undefined) {
    const st = ANTIGOS[c.status] || c.status;
    if (!STATUS.includes(st)) throw erro(400, 'status', 'Estado inválido.');
    v.status = st;
  }
  if (c.sugestoes !== undefined) v.sugestoes = JSON.stringify((c.sugestoes || []).map(s => String(s).trim().slice(0, 160)).filter(Boolean).slice(0, 4));
  if (c.sigiloso !== undefined) v.sigiloso = Number(!!c.sigiloso);
  if (c.pode_trocar !== undefined) v.pode_trocar = Number(!!c.pode_trocar);
  if (c.dados !== undefined) {
    const d = {};
    for (const t of TIPOS_DADO) d[t] = t === 'credencial' ? 'bloquear' : ACOES.includes(c.dados?.[t]) ? c.dados[t] : cfg.acoesChat[t];
    v.dados = JSON.stringify({ ...d, _v: 2 });
  }
  if (c.bases !== undefined) {
    const modo = ['nenhuma', 'area', 'escolhidas'].includes(c.bases?.modo) ? c.bases.modo : 'area';
    v.bases = JSON.stringify({ modo, ids: modo === 'escolhidas' ? (c.bases.ids || []).map(Number) : [] });
  }
  if (c.modelo !== undefined) v.modelo = c.modelo || null;
  // Áreas: só as que a pessoa gerencia; "toda a empresa", só o admin.
  let areas = null;
  if (c.toda_empresa !== undefined || c.areas !== undefined) {
    const perm = permissoesQw(app.db, pessoa, cfg);
    v.toda_empresa = Number(!!c.toda_empresa);
    if (v.toda_empresa && !perm.todaEmpresa) throw erro(403, 'toda_empresa', 'Você não tem autorização para quick win da empresa toda.');
    areas = v.toda_empresa ? [] : [...new Set((c.areas || []).map(Number))];
    if (!v.toda_empresa && !areas.length) throw erro(400, 'areas', 'Escolha pelo menos uma área.');
    // Pode manter as áreas que o quick win já tinha; acrescentar, só as que a pessoa pode.
    const atuais = atual.id ? areasDoQw(app.db, atual.id) : [];
    if (areas.some(a => !atuais.includes(a) && !perm.areas.some(p => p.id === a))) throw erro(403, 'areas', 'Você não pode criar quick wins nesta área.');
  }
  // Modelo padrão: liberado, de um perfil que o admin permite; homologado se o quick win é sigiloso.
  const final = { ...atual, ...v };
  if (final.modelo) {
    if (!ehClasse(final.modelo) && !pessoa.admin && v.modelo !== undefined && v.modelo !== atual.modelo) throw erro(403, 'modelo', 'Escolha uma classe de modelo. O modelo técnico por trás é definido pelo admin.');
    const m = acharModelo(app.db, cfg, resolverClasse(app.db, cfg, final.modelo, { sigilosa: !!final.sigiloso }));
    if (!m?.liberado) throw erro(400, 'modelo', 'Esta classe de modelo não está disponível na empresa.');
    if (!cfg.perfisQuickWin.includes(m.perfil)) throw erro(400, 'modelo', 'O admin não liberou esta classe como padrão de quick win.');
    if (final.sigiloso && !m.homologado) throw erro(400, 'modelo', 'Quick win que trata dados sigilosos só aceita classe com modelo homologado.');
    if (final.sigiloso && ehClasse(final.modelo) && `classe:${m.perfil}` !== final.modelo) throw erro(400, 'modelo', `A classe ${NOMES_CLASSE[final.modelo.slice(7)]} não tem modelo homologado. Escolha outra classe ou homologue um modelo nela.`);
  } else if (EM_CIRCULACAO.includes(final.status)) throw erro(400, 'modelo', 'Escolha a classe de modelo antes de colocar em teste ou em uso.');
  return { v, areas };
}

function gravar(app, id, v, areas) {
  const campos = Object.keys(v);
  if (campos.length) exec(app.db, `update quick_wins set ${campos.map(k => `${k} = ?`).join(', ')}, atualizado_em = datetime('now') where id = ?`, ...campos.map(k => v[k]), id);
  if (areas) {
    exec(app.db, 'delete from quick_win_areas where quick_win_id = ?', id);
    for (const a of areas) exec(app.db, 'insert into quick_win_areas (quick_win_id, area_id) select ?, id from areas where id = ?', id, a);
  }
}

// Estimativa de custo de uma conversa típica (3 perguntas e 3 respostas), por modelo.
function estimativas(app, qw) {
  const cfg = lerConfig(app.db);
  const fixos = ((qw.instrucoes || '').length + Math.min(MAX_ARQUIVOS_INTEIROS, um(app.db, 'select coalesce(sum(length(texto)), 0) as n from documentos where quick_win_id = ?', qw.id).n)) / 4;
  const entrada = 3 * (fixos + 900) + 1200, saida = 3 * 500;
  const classes = Object.entries(NOMES_CLASSE).filter(([p]) => cfg.perfisQuickWin.includes(p)).map(([p, nome]) => {
    const m = acharModelo(app.db, cfg, resolverClasse(app.db, cfg, `classe:${p}`, { sigilosa: !!qw.sigiloso }));
    return m?.liberado ? { id: `classe:${p}`, nome, perfil: p, classe: true, modelo: m.nome, homologado: m.homologado, custo: custoEstimado(m, entrada, saida) } : null;
  }).filter(Boolean);
  const tecnicos = lerModelos(app.db).filter(m => m.liberado && cfg.perfisQuickWin.includes(m.perfil))
    .map(m => ({ id: m.id, nome: m.nome, perfil: m.perfil, homologado: m.homologado, custo: custoEstimado(m, entrada, saida) }));
  return [...classes, ...tecnicos];
}

export function criarQuickWins(app) {
  return {
    // Quick win para uso numa conversa: em circulação e visível; fora de circulação (ou teste), só para quem gerencia.
    paraUso(pessoa, id, teste = false) {
      const q = um(app.db, 'select * from quick_wins where id = ?', Number(id));
      if (!q) return null;
      const gere = podeGerir(app.db, pessoa, q);
      if (teste || !EM_CIRCULACAO.includes(q.status)) return gere ? q : null;
      return visivel(app.db, pessoa, q) || gere ? q : null;
    },

    // Quick Win 2.0 como é executado: quem usa recebe a versão publicada; o teste (de quem gere) usa o rascunho.
    // Só o trabalho muda com a versão; dados, sigilo, bases e áreas são sempre os atuais.
    efetivo(q, teste = false) {
      if (!q?.especificacao) return q;
      const v = !teste && q.versao_publicada ? um(app.db, 'select numero, especificacao, nome, para_que_serve, formato from quick_win_versoes where id = ?', q.versao_publicada) : null;
      const espec = QW2.normalizar(json(v ? v.especificacao : q.especificacao, null));
      return espec ? { ...q, ...(v ? { nome: v.nome, para_que_serve: v.para_que_serve, formato: v.formato } : {}), espec, versao: v?.numero ?? null } : q;
    },

    // Contexto: instruções (na persona), arquivos do quick win e bases escolhidas.
    contexto(pessoa, qw, texto) {
      const arquivos = todos(app.db, 'select id, titulo, texto, sigiloso from documentos where quick_win_id = ? order by id', qw.id);
      const partes = [], fontes = [], pecas = [];
      let sigiloso = arquivos.some(a => a.sigiloso);
      if (arquivos.length) {
        const total = arquivos.reduce((n, a) => n + a.texto.length, 0);
        // O que de fato entra no contexto (arquivo inteiro ou trecho), com o título: conferido pela política de credenciais.
        const usados = total <= MAX_ARQUIVOS_INTEIROS ? arquivos.map(a => ({ documento_id: a.id, texto: a.texto })) : buscar(app.db, texto, arquivos.map(a => a.id), 8);
        const titulo = id => arquivos.find(a => a.id === id).titulo;
        pecas.push(...usados.map(u => ({ origem: 'quick_win', documento: u.documento_id, texto: `${titulo(u.documento_id)}\n${u.texto}` })));
        const corpo = usados.map(u => delimitar('documento', titulo(u.documento_id), u.texto)).join('\n\n');
        partes.push(`Arquivos de referência deste quick win (use em todas as respostas):\n\n${corpo}`);
        fontes.push(...arquivos.map(a => a.titulo));
      }
      const b = json(qw.bases, { modo: 'area' });
      if (b.modo !== 'nenhuma') {
        const areas = areasDoQw(app.db, qw.id);
        const ids = b.modo === 'escolhidas' ? b.ids
          : todos(app.db, `select id from documentos where quick_win_id is null and (toda_empresa = 1 ${areas.length ? `or area_id in (${areas.join(',')})` : ''})`).map(d => d.id);
        const t = trechosDasBases(app.db, texto, ids);
        if (t.parte) { partes.push(t.parte); fontes.push(...t.fontes); pecas.push(...t.pecas); sigiloso ||= t.sigiloso; }
      }
      return { partes, fontes: [...new Set(fontes)], sigiloso, cacheavel: arquivos.length > 0, pecas };
    },
  };
}

export function rotasQuickWins(app, r) {
  app.quickWins = criarQuickWins(app);
  const carregar = (pessoa, id, gerir = false) => {
    const q = um(app.db, 'select * from quick_wins where id = ?', Number(id));
    if (!q || (gerir ? !podeGerir(app.db, pessoa, q) : !app.quickWins.paraUso(pessoa, q.id) && !podeGerir(app.db, pessoa, q))) throw erro(404, 'quick_win', 'Quick win não encontrado.');
    return q;
  };

  r.get('/api/quick-wins', ({ pessoa }) => ({
    quickWins: todos(app.db, 'select * from quick_wins order by nome')
      .filter(q => app.quickWins.paraUso(pessoa, q.id) || podeGerir(app.db, pessoa, q))
      .map(q => ({ id: q.id, nome: q.nome, cor: q.cor, icone: q.icone, status: q.status, para_que_serve: q.para_que_serve, podeEditar: podeGerir(app.db, pessoa, q) })),
  }));

  // Portfólio para quem gere: estado, onde, responsável, uso, créditos, avaliação, medição e decisão.
  r.get('/api/quick-wins/portfolio', ({ pessoa }) => {
    const mes = app.agora().toISOString().slice(0, 7);
    const lista = todos(app.db, `select q.*, p.nome as responsavel_nome,
        (select count(distinct u.conversa_id) from uso u where u.quick_win_id = q.id and u.teste = 0 and substr(u.em, 1, 7) = ?) as execucoes,
        (select count(distinct u.pessoa_id) from uso u where u.quick_win_id = q.id and u.teste = 0 and substr(u.em, 1, 7) = ?) as pessoas,
        (select coalesce(sum(u.custo), 0) from uso u where u.quick_win_id = q.id and u.teste = 0 and substr(u.em, 1, 7) = ?) as custo,
        (select count(*) from conversas c where c.quick_win_id = q.id and c.teste = 0 and c.feedback = 'serviu') as serviu,
        (select count(*) from conversas c where c.quick_win_id = q.id and c.teste = 0 and c.feedback is not null) as avaliadas,
        (select count(*) from medicoes m where m.quick_win_id = q.id and m.antes_valor is not null and m.depois_valor is not null) as medicoes,
        (select d.decisao from decisoes d where d.quick_win_id = q.id order by d.id desc limit 1) as decisao
      from quick_wins q left join pessoas p on p.id = q.responsavel_id order by q.atualizado_em desc`, mes, mes, mes)
      .filter(q => podeGerir(app.db, pessoa, q));
    const nomesAreas = new Map(todos(app.db, 'select id, nome from areas').map(a => [a.id, a.nome]));
    return { quickWins: lista.map(q => ({ id: q.id, nome: q.nome, cor: q.cor, status: q.status, problema: q.problema, responsavel: q.responsavel_nome,
      onde: q.toda_empresa ? 'Empresa toda' : areasDoQw(app.db, q.id).map(a => nomesAreas.get(a)).filter(Boolean).join(', '),
      execucoes: q.execucoes, pessoas: q.pessoas, custo: q.custo, custoPorExecucao: q.execucoes ? q.custo / q.execucoes : null,
      aceitacao: q.avaliadas ? Math.round(q.serviu / q.avaliadas * 100) : null, avaliadas: q.avaliadas, medicoes: q.medicoes, decisao: q.decisao })) };
  });

  r.get('/api/quick-wins/modelos-iniciais', () => ({ modelos: JSON.parse(readFileSync(MODELOS_INICIAIS, 'utf8')) }));

  // Criação em 5 etapas: sugestões (tipo de trabalho, nome, descrição, regras, formato) sem chamar a IA.
  const podeMontar = pessoa => permissoesQw(app.db, pessoa).criar || pessoa.admin || pessoa.areas.some(a => a.responsavel);
  r.post('/api/quick-wins/assistente/sugerir', ({ pessoa, corpo }) => {
    if (!podeMontar(pessoa)) throw erro(403, 'sem_permissao', 'Você não tem autorização para criar Quick Wins. Fale com o admin.');
    const como = corpo.como || {};
    if (QW2.conferirSegredos([corpo.descricao, como.texto, como.exemplo]))
      throw erro(422, 'dado_bloqueado', 'Por segurança, senhas, chaves de acesso e outros segredos não podem fazer parte de um Quick Win. Tire o segredo do texto e tente de novo.', { tipos: ['credencial'] });
    return { ...QW2.sugerir({ descricao: String(corpo.descricao || '').slice(0, 1000), arquetipo: corpo.arquetipo, como, estrutura: corpo.estrutura || null }), sugestoes: QW2.SUGESTOES };
  });
  // Estrutura pedida no objetivo (colunas): uma chamada de IA, governada, só para um objetivo novo ou alterado.
  // A tela chama ao preparar a etapa Resultado; o mesmo objetivo já estruturado é reaproveitado sem chamada.
  r.post('/api/quick-wins/assistente/estrutura', async ({ pessoa, corpo }) => {
    if (!podeMontar(pessoa)) throw erro(403, 'sem_permissao', 'Você não tem autorização para criar Quick Wins. Fale com o admin.');
    const descricao = String(corpo.descricao || '').slice(0, 1000);
    if (QW2.conferirSegredos([descricao]))
      throw erro(422, 'dado_bloqueado', 'Por segurança, senhas, chaves de acesso e outros segredos não podem fazer parte de um Quick Win. Tire o segredo do texto e tente de novo.', { tipos: ['credencial'] });
    const qw = corpo.quick_win_id ? carregar(pessoa, corpo.quick_win_id, true) : null;
    return estruturarObjetivo(app, pessoa, { descricao, qw });
  });
  // Exemplo em arquivo: o texto é lido (com a mesma leitura dos anexos) e volta só para a tela da criação.
  // Nada é guardado aqui; na criação, só a estrutura do exemplo fica na especificação.
  r.post('/api/quick-wins/assistente/exemplo', async ({ pessoa, corpo }) => {
    if (!podeMontar(pessoa)) throw erro(403, 'sem_permissao', 'Você não tem autorização para criar Quick Wins. Fale com o admin.');
    const { texto } = await extrairTexto(corpo.arquivo || {}, { ocr: app.ocr, limitesOcr: app.limitesOcr });
    if (QW2.conferirSegredos([texto])) throw erro(422, 'dado_bloqueado', 'Por segurança, senhas, chaves de acesso e outros segredos não podem fazer parte de um Quick Win. Use um exemplo sem o segredo.', { tipos: ['credencial'] });
    return { texto: texto.slice(0, 8000), estrutura: QW2.analisarExemplo(texto) };
  }, { limiteMb: 35 });
  r.get('/api/quick-wins/assistente/entrada-teste', ({ query }) => ({ texto: QW2.entradaDeTeste(query.arquetipo) }));

  r.get('/api/quick-wins/:id', ({ pessoa, params }) => publico(app.db, pessoa, carregar(pessoa, params.id)));

  r.get('/api/quick-wins/:id/estimativas', ({ pessoa, params }) => ({ modelos: estimativas(app, carregar(pessoa, params.id, true)).filter(m => m.classe || pessoa.admin) }));

  // Criar: do zero, de um modelo inicial ou duplicando um existente (inclusive
  // para outra área). Duplicar copia instruções, arquivos e configuração, nunca conversas.
  r.post('/api/quick-wins', ({ pessoa, corpo }) => {
    if (!permissoesQw(app.db, pessoa).criar) throw erro(403, 'sem_permissao', 'Você não tem autorização para criar quick wins. Fale com o admin.');
    let base = {};
    let origem = null;
    if (corpo.duplicar_de) {
      origem = carregar(pessoa, corpo.duplicar_de);
      if (!podeGerir(app.db, pessoa, origem) && !EM_CIRCULACAO.includes(origem.status)) throw erro(404, 'quick_win', 'Quick win não encontrado.');
      base = { ...publico(app.db, { ...pessoa, admin: true }, origem), nome: corpo.nome || `${origem.nome} (cópia)` };
    } else if (corpo.modelo_inicial !== undefined) {
      base = JSON.parse(readFileSync(MODELOS_INICIAIS, 'utf8'))[Number(corpo.modelo_inicial)];
      if (!base) throw erro(404, 'modelo_inicial', 'Modelo inicial não encontrado.');
    }
    const cfg = lerConfig(app.db);
    const dados = { modelo: `classe:${cfg.perfisQuickWin[0] || 'rapido'}`, ...base, ...corpo };
    delete dados.id;
    // Quick Win 2.0: a especificação é montada das respostas da criação (ou copiada, ao duplicar).
    const v2 = corpo.assistente ? doAssistente(app, cfg, corpo.assistente) : origem?.especificacao ? { [ESPEC]: origem.especificacao } : {};
    delete dados.especificacao;
    Object.assign(dados, v2);
    const id = transacao(app.db, () => {
      const novo = Number(exec(app.db, 'insert into quick_wins (nome, criado_por) values (?, ?)', 'Novo quick win', pessoa.id).lastInsertRowid);
      const { v, areas } = validar(app, pessoa, {}, { nome: dados.nome || 'Novo quick win', cor: dados.cor || '#1B7950', icone: dados.icone || '', para_que_serve: dados.para_que_serve || '',
        instrucoes: dados.instrucoes || '', formato: dados.formato || 'texto', sugestoes: dados.sugestoes || [], exemplo_entrada: dados.exemplo_entrada || '', exemplo_saida: dados.exemplo_saida || '',
        sigiloso: dados.sigiloso || false, pode_trocar: dados.pode_trocar || false, dados: dados.dados || {}, bases: dados.bases || { modo: 'area' }, modelo: dados.modelo,
        status: ['identificado', 'em_configuracao'].includes(corpo.status) ? corpo.status : 'em_configuracao', toda_empresa: !!corpo.toda_empresa, areas: corpo.areas || [],
        problema: corpo.problema || '', objetivo: corpo.objetivo || '', processo_atual: corpo.processo_atual || '', responsavel_id: corpo.responsavel_id || pessoa.id,
        ...(v2[ESPEC] ? { [ESPEC]: v2[ESPEC] } : {}) });
      gravar(app, novo, v, areas);
      if (origem) {
        for (const a of todos(app.db, 'select titulo, arquivo, sigiloso, texto from documentos where quick_win_id = ?', origem.id)) {
          const d = Number(exec(app.db, 'insert into documentos (titulo, arquivo, quick_win_id, sigiloso, texto, enviado_por) values (?, ?, ?, ?, ?, ?)', a.titulo, a.arquivo, novo, a.sigiloso, a.texto, pessoa.id).lastInsertRowid);
          indexar(app.db, d, a.texto);
        }
      }
      return novo;
    });
    registrar(app, 'quickwin.created', pessoa.id, { quick_win: id, duplicado_de: origem?.id ?? null, modelo_inicial: corpo.modelo_inicial ?? null, v2: !!v2[ESPEC] });
    return publico(app.db, pessoa, um(app.db, 'select * from quick_wins where id = ?', id));
  });

  r.put('/api/quick-wins/:id', ({ pessoa, params, corpo }) => {
    const q = carregar(pessoa, params.id, true);
    const { v, areas } = validar(app, pessoa, q, corpo);
    transacao(app.db, () => gravar(app, q.id, v, areas));
    registrar(app, 'quickwin.updated', pessoa.id, { quick_win: q.id, campos: Object.keys(v) });
    if (v.status && v.status !== q.status) registrar(app, 'quickwin.status_changed', pessoa.id, { quick_win: q.id, de: q.status, para: v.status });
    return publico(app.db, pessoa, um(app.db, 'select * from quick_wins where id = ?', q.id));
  });

  // Publicar: o rascunho vira a versão seguinte (v1, v2...) e passa a ser a que as pessoas usam.
  r.post('/api/quick-wins/:id/publicar', ({ pessoa, params, corpo }) => {
    const q = carregar(pessoa, params.id, true);
    if (!q.especificacao) throw erro(400, 'quick_win', 'Este Quick Win não tem uma especificação para publicar.');
    const cfg = lerConfig(app.db);
    const mudar = {};
    if (corpo.nome !== undefined) mudar.nome = corpo.nome;
    if (corpo.para_que_serve !== undefined) mudar.para_que_serve = corpo.para_que_serve;
    if (corpo.areas !== undefined || corpo.toda_empresa !== undefined) { mudar.areas = corpo.areas ?? areasDoQw(app.db, q.id); mudar.toda_empresa = !!corpo.toda_empresa; }
    if (QW2.conferirSegredos([corpo.nome, corpo.para_que_serve])) throw erro(422, 'dado_bloqueado', 'Por segurança, senhas, chaves de acesso e outros segredos não podem fazer parte de um Quick Win.', { tipos: ['credencial'] });
    if (!EM_CIRCULACAO.includes(q.status)) {
      mudar.status = 'em_uso';
      if (!q.modelo) { const c = classeSugerida(app, cfg, json(q.especificacao, {}), q.sigiloso); if (!c) throw erro(503, 'sem_modelo', 'A empresa ainda não liberou recursos de IA para Quick Wins. Fale com o administrador.'); mudar.modelo = c; }
    }
    const { v, areas } = validar(app, pessoa, q, mudar);
    const teste = um(app.db, 'select qualidade from roteamento where quick_win_id = ? and teste = 1 and qualidade is not null order by id desc limit 1', q.id);
    const numero = transacao(app.db, () => {
      gravar(app, q.id, v, areas);
      const atual = um(app.db, 'select * from quick_wins where id = ?', q.id);
      const n = (um(app.db, 'select max(numero) as n from quick_win_versoes where quick_win_id = ?', q.id).n || 0) + 1;
      const vid = Number(exec(app.db, 'insert into quick_win_versoes (quick_win_id, numero, especificacao, nome, para_que_serve, formato, teste, publicada_em, publicada_por) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        q.id, n, atual.especificacao, atual.nome, atual.para_que_serve, atual.formato, teste?.qualidade ?? null, app.agora().toISOString(), pessoa.id).lastInsertRowid);
      exec(app.db, 'update quick_wins set versao_publicada = ? where id = ?', vid, q.id);
      return n;
    });
    registrar(app, 'quickwin.published', pessoa.id, { quick_win: q.id, versao: numero, testado: !!teste });
    if (v.status) registrar(app, 'quickwin.status_changed', pessoa.id, { quick_win: q.id, de: q.status, para: v.status });
    return publico(app.db, pessoa, um(app.db, 'select * from quick_wins where id = ?', q.id));
  });

  r.get('/api/quick-wins/:id/versoes', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    return { versoes: todos(app.db, 'select v.id, v.numero, v.nome, v.publicada_em, v.teste, p.nome as publicada_por from quick_win_versoes v left join pessoas p on p.id = v.publicada_por where v.quick_win_id = ? order by v.numero desc', q.id)
      .map(x => ({ numero: x.numero, nome: x.nome, publicada_em: x.publicada_em, publicada_por: x.publicada_por, atual: x.id === q.versao_publicada, teste: json(x.teste, null)?.status || null })) };
  });

  // Restaurar: a versão escolhida volta a ser a atual e também vira o rascunho (para ajustar a partir dela).
  r.post('/api/quick-wins/:id/versoes/:numero/restaurar', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    const ver = um(app.db, 'select * from quick_win_versoes where quick_win_id = ? and numero = ?', q.id, Number(params.numero));
    if (!ver) throw erro(404, 'versao', 'Versão não encontrada.');
    exec(app.db, "update quick_wins set versao_publicada = ?, especificacao = ?, nome = ?, para_que_serve = ?, formato = ?, atualizado_em = datetime('now') where id = ?", ver.id, ver.especificacao, ver.nome, ver.para_que_serve, ver.formato, q.id);
    registrar(app, 'quickwin.version_restored', pessoa.id, { quick_win: q.id, versao: ver.numero });
    return publico(app.db, pessoa, um(app.db, 'select * from quick_wins where id = ?', q.id));
  });

  r.del('/api/quick-wins/:id', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    for (const d of todos(app.db, 'select id from documentos where quick_win_id = ?', q.id)) desindexar(app.db, d.id);
    exec(app.db, 'delete from quick_wins where id = ?', q.id);
    registrar(app, 'quickwin.deleted', pessoa.id, { quick_win: q.id });
    return { ok: true };
  });

  r.post('/api/quick-wins/:id/arquivos', async ({ pessoa, params, corpo }) => {
    const q = carregar(pessoa, params.id, true);
    const { nome, texto } = await extrairTexto(corpo.arquivo || {}, { ocr: app.ocr, limitesOcr: app.limitesOcr });
    const id = Number(exec(app.db, 'insert into documentos (titulo, arquivo, quick_win_id, sigiloso, texto, enviado_por) values (?, ?, ?, ?, ?, ?)',
      (String(corpo.titulo || '').trim() || nome.replace(/\.[^.]+$/, '')).slice(0, 200), nome, q.id, Number(!!corpo.sigiloso), texto, pessoa.id).lastInsertRowid);
    indexar(app.db, id, texto);
    registrar(app, 'knowledge.added', pessoa.id, { quick_win: q.id, documento: id, sigiloso: !!corpo.sigiloso });
    return publico(app.db, pessoa, q);
  }, { limiteMb: 35 });   // arquivo de até 25 MB, em base64

  r.del('/api/quick-wins/:id/arquivos/:doc', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    const d = um(app.db, 'select id from documentos where id = ? and quick_win_id = ?', Number(params.doc), q.id);
    if (!d) throw erro(404, 'arquivo', 'Arquivo não encontrado.');
    desindexar(app.db, d.id);
    exec(app.db, 'delete from documentos where id = ?', d.id);
    registrar(app, 'knowledge.removed', pessoa.id, { quick_win: q.id, documento: d.id });
    return publico(app.db, pessoa, q);
  });

  // Uso automático do quick win (sem as conversas de teste), para quem gerencia.
  // Cada conversa conta como um uso; o conteúdo nunca aparece.
  r.get('/api/quick-wins/:id/uso', ({ pessoa, params, query }) => {
    const q = carregar(pessoa, params.id, true);
    const mes = /^\d{4}-\d{2}$/.test(query.mes || '') ? query.mes : app.agora().toISOString().slice(0, 7);
    const conversas = todos(app.db, "select id, pessoa_id, feedback, sigilosa from conversas where quick_win_id = ? and teste = 0 and substr(criado_em, 1, 7) = ? and exists (select 1 from mensagens m where m.conversa_id = conversas.id and m.papel = 'user')", q.id, mes);
    const u = um(app.db, 'select count(*) as respostas, coalesce(sum(custo), 0) as custo, coalesce(avg(ms), 0) as ms, coalesce(sum(economia), 0) as economia from uso where quick_win_id = ? and teste = 0 and substr(em, 1, 7) = ?', q.id, mes);
    const conta = f => conversas.filter(c => c.feedback === f).length;
    const porModelo = todos(app.db, `select u.modelo_usado as modelo, count(distinct u.conversa_id) as conversas, sum(u.custo) as custo, avg(u.ms) as ms,
        sum(case when c.feedback = 'serviu' then 1 else 0 end) as serviu, sum(case when c.feedback = 'ajustes' then 1 else 0 end) as ajustes, sum(case when c.feedback = 'nao_serviu' then 1 else 0 end) as nao_serviu
      from uso u join conversas c on c.id = u.conversa_id where u.quick_win_id = ? and u.teste = 0 and substr(u.em, 1, 7) = ? group by u.modelo_usado`, q.id, mes)
      .map(m => ({ ...m, custoMedio: m.conversas ? m.custo / m.conversas : 0 }));
    return {
      mes, conversas: conversas.length, pessoas: new Set(conversas.map(c => c.pessoa_id)).size,
      mensagens: um(app.db, "select count(*) as n from mensagens m join conversas c on c.id = m.conversa_id where c.quick_win_id = ? and c.teste = 0 and m.papel = 'user' and substr(m.criado_em, 1, 7) = ?", q.id, mes).n,
      feedback: { serviu: conta('serviu'), ajustes: conta('ajustes'), nao_serviu: conta('nao_serviu'), sem: conta(null) },
      sigilosas: conversas.filter(c => c.sigilosa).length, custo: u.custo, economiaCache: u.economia, tempoMedioMs: Math.round(u.ms), porModelo,
    };
  });
}
