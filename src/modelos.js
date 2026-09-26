// Modelos de IA da empresa (seção 9): catálogo liberado, perfis, acesso por
// grupo ou área, homologação para dados sigilosos, reservas e modo automático.
import { erro } from './http.js';
import { exec, json, todos, transacao, um } from './db.js';
import { lerConfig, salvarConfig } from './config.js';
import { registrar } from './eventos.js';
import { enviarAvisoOperador, situacaoPlano } from './plano.js';

export const PERFIS = { rapido: 'Rápido e econômico', equilibrado: 'Equilibrado', avancado: 'Avançado' };
export const AUTO = 'openrouter/auto';
// Modelos gratuitos: o fornecedor costuma guardar e treinar com os dados.
export const ehGratuito = id => /:free$/.test(id) || id === 'openrouter/free';
const AVISO_GRATUITO = 'Modelo gratuito: o fornecedor pode guardar e treinar com os dados. Não serve para conversas sigilosas e costuma ser recusado quando a exigência de "sem treino" está ligada.';

// Sugestão inicial (análise em docs/modelos-sugeridos.md, 26/09/2026).
const SUGESTAO = [
  { id: 'google/gemini-3.5-flash-lite', nome: 'Gemini 3.5 Flash Lite', perfil: 'rapido', entrada: 0.30, saida: 2.50, contexto: 1048576 },
  { id: 'anthropic/claude-haiku-4.5', nome: 'Claude Haiku 4.5', perfil: 'equilibrado', entrada: 1, saida: 5, contexto: 200000 },
  { id: 'anthropic/claude-sonnet-5', nome: 'Claude Sonnet 5', perfil: 'avancado', entrada: 2, saida: 10, contexto: 1000000 },
];

// Instalação nova: um modelo por perfil, liberado e editável. Nenhum homologado:
// homologar é decisão do admin, com registro.
export function semearSugestao(db) {
  if (um(db, 'select 1 from modelos limit 1')) return;
  // Preços por token, da página do modelo no OpenRouter; a atualização diária corrige.
  for (const m of SUGESTAO) exec(db, 'insert into modelos (id, nome, fornecedor, liberado, perfil, preco_entrada, preco_saida, contexto) values (?, ?, ?, 1, ?, ?, ?, ?)',
    m.id, m.nome, m.id.split('/')[0], m.perfil, m.entrada / 1e6, m.saida / 1e6, m.contexto);
}

const deLinha = m => m && ({
  id: m.id, nome: m.nome || m.id, fornecedor: m.fornecedor, precoEntrada: m.preco_entrada, precoSaida: m.preco_saida, contexto: m.contexto,
  liberado: !!m.liberado, perfil: m.perfil, reserva: m.reserva, homologado: !!m.homologado, homologacao: json(m.homologacao, null),
  noCatalogo: !!m.no_catalogo, aviso: m.aviso,
});

export const lerModelos = db => todos(db, 'select * from modelos order by perfil, nome').map(deLinha);

export function acharModelo(db, cfg, id) {
  if (id === AUTO) return cfg.automatico ? { id: AUTO, nome: 'Automático', fornecedor: 'openrouter', perfil: 'rapido', liberado: true, homologado: false } : null;
  return deLinha(um(db, 'select * from modelos where id = ?', id));
}

export function perfisDe(cfg, pessoa) {
  const out = new Set(['rapido']);
  for (const perfil of ['equilibrado', 'avancado']) {
    const a = cfg.acessoPerfis[perfil] || {};
    if (a.todos || (a.grupos || []).some(g => pessoa.grupos.includes(g)) || (a.areas || []).some(x => pessoa.areas.some(pa => pa.id === x))) out.add(perfil);
  }
  return out;
}

export const paraTodos = (cfg, m) => m.perfil === 'rapido' || !!cfg.acessoPerfis[m.perfil]?.todos;
export const podeUsar = (cfg, pessoa, m) => !!m?.liberado && perfisDe(cfg, pessoa).has(m.perfil);

// O homologado padrão: o escolhido pelo admin, se ainda serve; senão, o primeiro
// homologado liberado e disponível para todos.
export function homologadoPadrao(db, cfg) {
  const serve = m => m && m.liberado && m.homologado && paraTodos(cfg, m);
  const escolhido = cfg.padroes.homologado && acharModelo(db, cfg, cfg.padroes.homologado);
  return serve(escolhido) ? escolhido : lerModelos(db).find(serve) || null;
}

// Classes operacionais: o trabalho escolhe a classe; a empresa decide o modelo por trás.
// "classe:equilibrado" vale o modelo padrão da classe no momento do envio (em conversa
// sigilosa, um homologado da classe). Trocar o modelo da classe muda todos os usos de uma vez.
export const NOMES_CLASSE = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
const CLASSE = /^classe:(rapido|equilibrado|avancado)$/;
export const ehClasse = id => CLASSE.test(id || '');
export function resolverClasse(db, cfg, id, { sigilosa = false } = {}) {
  const c = CLASSE.exec(id || '');
  if (!c) return id;
  const padrao = cfg.padroes[c[1]];
  if (!sigilosa) return padrao || null;
  const homologados = lerModelos(db).filter(m => m.liberado && m.homologado && m.perfil === c[1]);
  if (homologados.some(m => m.id === padrao)) return padrao;
  return homologados[0]?.id || homologadoPadrao(db, cfg)?.id || null;
}
export const classeDe = (db, cfg, id) => (ehClasse(id) ? id : (acharModelo(db, cfg, id)?.perfil ? `classe:${acharModelo(db, cfg, id).perfil}` : null));

// Opções do seletor de uma conversa: classes, não fornecedores. O admin vê o modelo por trás.
export function opcoesDeModelo(db, cfg, pessoa, { qw = null, sigilosa = false } = {}) {
  const perfis = perfisDe(cfg, pessoa);
  const qwClasse = qw?.modelo ? classeDe(db, cfg, qw.modelo) : null;
  const out = [];
  for (const [perfil, nome] of Object.entries(NOMES_CLASSE)) {
    const id = `classe:${perfil}`;
    const doQw = qwClasse === id;
    if (qw && !qw.pode_trocar && !doQw) continue;
    if (!doQw && !perfis.has(perfil) && !(sigilosa && homologadoPadrao(db, cfg)?.perfil === perfil)) continue;
    const m = acharModelo(db, cfg, resolverClasse(db, cfg, id, { sigilosa }));
    if (!m?.liberado || (sigilosa && !m.homologado)) continue;
    if (sigilosa && m.perfil !== perfil && !doQw) continue;     // classe sem homologado próprio não aparece em conversa sigilosa
    out.push({ id, nome: pessoa.admin ? `${nome} · ${m.nome}` : nome, perfil, homologado: m.homologado, classe: true });
  }
  if (cfg.automatico && !sigilosa && (!qw || qw.pode_trocar)) out.push({ id: AUTO, nome: 'Automático', perfil: 'rapido', homologado: false });
  return out;
}

// Valida o modelo (ou a classe) pedido para um envio. Devolve o modelo técnico ou lança erro.
export function modeloPermitido(db, cfg, pessoa, id, { qw = null, sigilosa = false } = {}) {
  const m = acharModelo(db, cfg, resolverClasse(db, cfg, id, { sigilosa }));
  if (!m || !m.liberado) throw erro(403, 'modelo_nao_liberado', 'Esta classe de modelo não está disponível na empresa.');
  const garantia = sigilosa && homologadoPadrao(db, cfg)?.id === m.id;
  const doQw = qw && (id === qw.modelo || m.id === resolverClasse(db, cfg, qw.modelo, { sigilosa }));
  const ok = qw ? doQw || (!!qw.pode_trocar && podeUsar(cfg, pessoa, m)) || garantia : podeUsar(cfg, pessoa, m) || garantia;
  if (!ok) throw erro(403, 'modelo_sem_acesso', 'Você não tem acesso a esta classe de modelo.');
  return m;
}

export const custoEstimado = (m, entrada, saida) =>
  m && m.precoEntrada != null && m.precoSaida != null ? m.precoEntrada * entrada + m.precoSaida * saida : null;

// Atualização diária pelo OpenRouter: preços, e aviso se um modelo liberado sair
// do ar ou mudar de preço mais de 20%.
export async function atualizarCatalogo(app) {
  const lista = await app.ia.listarModelos();
  app.catalogo = lista;
  const porId = new Map(lista.map(m => [m.id, m]));
  for (const m of lerModelos(app.db)) {
    const n = porId.get(m.id);
    if (!n) { exec(app.db, "update modelos set no_catalogo = 0, aviso = 'Saiu do catálogo do OpenRouter.', atualizado_em = ? where id = ?", app.agora().toISOString(), m.id); continue; }
    const mudou = (a, b) => a > 0 && Math.abs(b - a) / a > 0.2;
    const aviso = mudou(m.precoEntrada, n.precoEntrada) || mudou(m.precoSaida, n.precoSaida)
      ? `Preço mudou mais de 20% (entrada ${fmt(m.precoEntrada)} → ${fmt(n.precoEntrada)}; saída ${fmt(m.precoSaida)} → ${fmt(n.precoSaida)} por milhão de tokens).` : m.aviso?.startsWith('Preço') ? m.aviso : null;
    if (aviso && aviso !== m.aviso) avisarPrecoAoOperador(app, m, n);
    exec(app.db, 'update modelos set nome = ?, preco_entrada = ?, preco_saida = ?, contexto = ?, no_catalogo = 1, aviso = ?, atualizado_em = ? where id = ?',
      n.nome, n.precoEntrada, n.precoSaida, n.contexto, aviso, app.agora().toISOString(), m.id);
  }
  return lista.length;
}
const fmt = p => (p === null || p === undefined ? '?' : `US$ ${(p * 1e6).toFixed(2)}`);

// Toda mudança na configuração de modelos passa por aqui: se havia um homologado
// disponível para todos e a mudança o tira, ela é recusada.
function mudar(app, pessoa, tipo, detalhes, fn) {
  transacao(app.db, () => {
    const antes = !!homologadoPadrao(app.db, lerConfig(app.db));
    fn();
    if (antes && !homologadoPadrao(app.db, lerConfig(app.db))) {
      throw erro(409, 'sem_homologado', 'É preciso ter pelo menos um modelo homologado disponível para todos. Homologue outro modelo antes.');
    }
    registrar(app, tipo, pessoa.id, detalhes);
  });
  app.aoMudarModelos?.();
}

// Preço de um modelo liberado mudou mais de 20%: o operador recebe email (a empresa vê só o aviso no painel).
// Troca do modelo por trás de uma classe: os admins recebem um aviso, sem alarde.
function avisarModeloAlterado(app, trocas) {
  const admins = todos(app.db, "select email from pessoas where papel = 'admin' and ativo = 1").map(a => a.email);
  const linhas = trocas.map(([k, m]) => `- Classe ${NOMES_CLASSE[k]}: agora atendida por ${m?.nome || 'outro modelo'}`).join('\n');
  const texto = `O modelo por trás de uma classe foi atualizado:\n\n${linhas}\n\nNada muda na forma de usar: as pessoas continuam escolhendo a classe, e as conversas seguem normalmente. O histórico da troca fica em Modelos.`;
  for (const para of admins) app.email.enviar(para, 'GreenIA: modelo de uma classe atualizado', texto).catch(e => app.log('email de modelo', e.message));
}

function avisarPrecoAoOperador(app, m, n) {
  if (!m.liberado) return;
  registrar(app, 'model.price_changed', null, { modelo: m.id, classe: m.perfil, entrada: [m.precoEntrada, n.precoEntrada], saida: [m.precoSaida, n.precoSaida] });
  if (!app.operadores?.length) return;
  enviarAvisoOperador(app, `preço do modelo ${m.nome} mudou mais de 20%`,
    `O modelo ${m.id} (${m.perfil}) mudou de preço no OpenRouter.\nEntrada: ${fmt(m.precoEntrada)} → ${fmt(n.precoEntrada)} por milhão de tokens.\nSaída: ${fmt(m.precoSaida)} → ${fmt(n.precoSaida)} por milhão de tokens.\n\nOs créditos acompanham o custo real, então a margem não muda. Se o aumento for grande, considere trocar o modelo padrão do perfil por um equivalente mais barato.${m.homologado ? '\n\nAtenção: este modelo está homologado para conversas sigilosas.' : ''}`)
    .catch(e => app.log('aviso de preço', e.message));
}

export function rotasModelos(app, r) {
  semearSugestao(app.db);

  r.get('/api/modelos', ({ pessoa, query }) => {
    const cfg = lerConfig(app.db);
    const qw = query.quick_win ? um(app.db, 'select id, modelo, pode_trocar from quick_wins where id = ?', Number(query.quick_win)) : null;
    const reserva = situacaoPlano(app)?.fase === 'reserva';
    const opcoes = opcoesDeModelo(app.db, cfg, pessoa, { qw, sigilosa: query.sigilosa === '1' })
      .map(o => (reserva && (o.perfil !== 'rapido' || o.id === AUTO) ? { ...o, bloqueado: true } : o));
    const h = homologadoPadrao(app.db, cfg);
    return { opcoes, padrao: classeDe(app.db, cfg, qw?.modelo || cfg.padroes.chat), homologadoPadrao: h ? `classe:${h.perfil}` : null, perfis: PERFIS };
  });

  r.get('/api/admin/modelos', () => {
    const cfg = lerConfig(app.db);
    const h = homologadoPadrao(app.db, cfg);
    return { modelos: lerModelos(app.db).map(m => ({ ...m, custoConversa: custoEstimado(m, 12000, 1500) })), perfis: PERFIS, homologadoPadrao: h?.id || null, garantia: !!h,
      config: { padroes: cfg.padroes, acessoPerfis: cfg.acessoPerfis, perfisQuickWin: cfg.perfisQuickWin, exigirSemTreino: cfg.exigirSemTreino, automatico: cfg.automatico } };
  }, { admin: true });

  r.get('/api/admin/modelos/catalogo', async ({ query }) => {
    if (!app.catalogo) await atualizarCatalogo(app).catch(() => { app.catalogo = []; });
    const q = String(query.busca || '').toLowerCase();
    return { modelos: app.catalogo.filter(m => !q || m.id.toLowerCase().includes(q) || m.nome.toLowerCase().includes(q)).slice(0, 50).map(m => ({ ...m, custoConversa: custoEstimado(m, 12000, 1500) })) };
  }, { admin: true });

  r.put('/api/admin/modelos/:id', ({ pessoa, params, corpo }) => {
    const id = params.id;
    if (corpo.perfil && !PERFIS[corpo.perfil]) throw erro(400, 'perfil', 'Perfil inválido.');
    const cat = (app.catalogo || []).find(m => m.id === id);
    const atual = um(app.db, 'select * from modelos where id = ?', id);
    if (!atual && !cat && !corpo.perfil) throw erro(404, 'modelo', 'Modelo não encontrado no catálogo.');
    const reserva = corpo.reserva === undefined ? atual?.reserva : corpo.reserva || null;
    if (reserva) {
      const rs = um(app.db, 'select perfil, liberado from modelos where id = ?', reserva);
      if (!rs?.liberado || rs.perfil !== (corpo.perfil || atual?.perfil)) throw erro(400, 'reserva', 'O reserva precisa estar liberado e ser do mesmo perfil.');
    }
    mudar(app, pessoa, 'model.changed', { modelo: id, liberado: corpo.liberado, perfil: corpo.perfil, reserva }, () => {
      if (!atual) exec(app.db, 'insert into modelos (id, nome, fornecedor, preco_entrada, preco_saida, contexto) values (?, ?, ?, ?, ?, ?)',
        id, cat?.nome || id, id.split('/')[0], cat?.precoEntrada ?? null, cat?.precoSaida ?? null, cat?.contexto ?? null);
      exec(app.db, 'update modelos set liberado = coalesce(?, liberado), perfil = coalesce(?, perfil), reserva = ? where id = ?',
        corpo.liberado === undefined ? null : Number(!!corpo.liberado), corpo.perfil ?? null, reserva, id);
      if (ehGratuito(id)) exec(app.db, 'update modelos set aviso = ? where id = ?', AVISO_GRATUITO, id);
      // Modelo que deixa de ser liberado perde a homologação.
      if (corpo.liberado === false) exec(app.db, 'update modelos set homologado = 0 where id = ?', id);
    });
    return deLinha(um(app.db, 'select * from modelos where id = ?', id));
  }, { admin: true });

  r.post('/api/admin/modelos/:id/homologar', ({ pessoa, params, corpo }) => {
    const m = um(app.db, 'select * from modelos where id = ?', params.id);
    if (!m?.liberado) throw erro(400, 'nao_liberado', 'Libere o modelo antes de homologar.');
    if (ehGratuito(m.id) || m.id === AUTO) throw erro(400, 'nao_homologavel', 'Modelos gratuitos e o modo automático não podem ser homologados: não há fornecedor fixo com retenção zero.');
    const fornecedor = String(corpo.fornecedor || '').trim();
    const justificativa = String(corpo.justificativa || '').trim();
    if (!fornecedor) throw erro(400, 'fornecedor', 'Informe o fornecedor fixado no OpenRouter.');
    if (corpo.semTreino !== true || corpo.retencaoZero !== true) throw erro(400, 'garantias', 'Confirme que o fornecedor não treina com os dados e não guarda nada (retenção zero).');
    if (justificativa.length < 10) throw erro(400, 'justificativa', 'Escreva a justificativa da homologação.');
    const registro = { quem: pessoa.email, em: app.agora().toISOString(), fornecedor, justificativa };
    mudar(app, pessoa, 'model.certified', { modelo: m.id, fornecedor }, () => {
      exec(app.db, 'update modelos set homologado = 1, homologacao = ? where id = ?', JSON.stringify(registro), m.id);
    });
    return deLinha(um(app.db, 'select * from modelos where id = ?', m.id));
  }, { admin: true });

  r.del('/api/admin/modelos/:id/homologar', ({ pessoa, params }) => {
    mudar(app, pessoa, 'model.uncertified', { modelo: params.id }, () => exec(app.db, 'update modelos set homologado = 0 where id = ?', params.id));
    return { ok: true };
  }, { admin: true });

  r.put('/api/admin/modelos-config', ({ pessoa, corpo }) => {
    const cfg = lerConfig(app.db);
    const novo = {};
    if (corpo.padroes) novo.padroes = { ...cfg.padroes, ...corpo.padroes };
    if (corpo.acessoPerfis) {
      const limpo = a => ({ todos: !!a?.todos, grupos: (a?.grupos || []).map(Number), areas: (a?.areas || []).map(Number) });
      novo.acessoPerfis = { equilibrado: limpo(corpo.acessoPerfis.equilibrado), avancado: limpo(corpo.acessoPerfis.avancado) };
    }
    if (corpo.perfisQuickWin) novo.perfisQuickWin = corpo.perfisQuickWin.filter(p => PERFIS[p]);
    if (corpo.exigirSemTreino !== undefined) novo.exigirSemTreino = !!corpo.exigirSemTreino;
    if (corpo.automatico !== undefined) novo.automatico = !!corpo.automatico;
    for (const [k, id] of Object.entries(novo.padroes || {})) {
      if (id && !acharModelo(app.db, { ...cfg, ...novo }, id)?.liberado) throw erro(400, 'padrao', `O padrão "${k}" precisa ser um modelo liberado.`);
    }
    mudar(app, pessoa, 'model.config_changed', { campos: Object.keys(novo), exigirSemTreino: novo.exigirSemTreino }, () => salvarConfig(app.db, novo));
    const trocas = Object.keys(NOMES_CLASSE).filter(k => novo.padroes && novo.padroes[k] !== cfg.padroes[k]);
    if (trocas.length) avisarModeloAlterado(app, trocas.map(k => [k, acharModelo(app.db, lerConfig(app.db), novo.padroes[k])]));
    return { ok: true };
  }, { admin: true });
}
