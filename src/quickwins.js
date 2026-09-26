// Quick wins: espaços de trabalho de uma tarefa repetitiva, configurados pelo
// responsável da área (instruções, arquivos, bases, modelo, formato, dados) e
// usados pelo time em conversas próprias, com feedback e medição.
import { readFileSync } from 'node:fs';
import { erro } from './http.js';
import { exec, json, todos, transacao, um } from './db.js';
import { lerConfig, TIPOS_DADO } from './config.js';
import { registrar } from './eventos.js';
import { extrairTexto } from './texto.js';
import { buscar, desindexar, indexar } from './busca.js';
import { trechosDasBases } from './bases.js';
import { acharModelo, custoEstimado, lerModelos } from './modelos.js';

const MODELOS_INICIAIS = new URL('../modelos-quick-win.json', import.meta.url);
const FORMATOS = ['texto', 'lista', 'tabela', 'checklist'];
const STATUS = ['rascunho', 'ativo', 'pausado'];
const MAX_ARQUIVOS_INTEIROS = 40000;   // acima disso, só os trechos relevantes dos arquivos

export const areasDoQw = (db, id) => todos(db, 'select area_id from quick_win_areas where quick_win_id = ?', id).map(a => a.area_id);

export function podeGerir(db, pessoa, qw) {
  if (pessoa.admin) return true;
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
    areas, podeEditar: podeGerir(db, pessoa, q),
  };
  if (!base.podeEditar) return base;
  return { ...base, instrucoes: q.instrucoes, exemplo_entrada: q.exemplo_entrada, exemplo_saida: q.exemplo_saida, bases: json(q.bases, { modo: 'area', ids: [] }),
    dados: json(q.dados, {}), arquivos: todos(db, 'select id, titulo, arquivo, sigiloso, length(texto) as caracteres from documentos where quick_win_id = ? order by id', q.id) };
}

function validar(app, pessoa, atual, c) {
  const cfg = lerConfig(app.db);
  const v = {};
  if (c.nome !== undefined) { v.nome = String(c.nome).trim().slice(0, 80); if (!v.nome) throw erro(400, 'nome', 'Dê um nome ao quick win.'); }
  if (c.cor !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(c.cor)) throw erro(400, 'cor', 'Cor inválida.'); v.cor = c.cor; }
  if (c.icone !== undefined) v.icone = String(c.icone).trim().slice(0, 2);
  for (const k of ['para_que_serve', 'instrucoes', 'exemplo_entrada', 'exemplo_saida']) if (c[k] !== undefined) v[k] = String(c[k]).slice(0, k === 'instrucoes' ? 8000 : 2000);
  if (c.formato !== undefined) { if (!FORMATOS.includes(c.formato)) throw erro(400, 'formato', 'Formato inválido.'); v.formato = c.formato; }
  if (c.status !== undefined) { if (!STATUS.includes(c.status)) throw erro(400, 'status', 'Status inválido.'); v.status = c.status; }
  if (c.sugestoes !== undefined) v.sugestoes = JSON.stringify((c.sugestoes || []).map(s => String(s).trim().slice(0, 160)).filter(Boolean).slice(0, 4));
  if (c.sigiloso !== undefined) v.sigiloso = Number(!!c.sigiloso);
  if (c.pode_trocar !== undefined) v.pode_trocar = Number(!!c.pode_trocar);
  if (c.dados !== undefined) {
    const d = {};
    for (const t of TIPOS_DADO) d[t] = t === 'credencial' ? 'bloquear' : (c.dados?.[t] === 'permitir' ? 'permitir' : c.dados?.[t] === 'bloquear' ? 'bloquear' : cfg.acoesChat[t]);
    v.dados = JSON.stringify(d);
  }
  if (c.bases !== undefined) {
    const modo = ['nenhuma', 'area', 'escolhidas'].includes(c.bases?.modo) ? c.bases.modo : 'area';
    v.bases = JSON.stringify({ modo, ids: modo === 'escolhidas' ? (c.bases.ids || []).map(Number) : [] });
  }
  if (c.modelo !== undefined) v.modelo = c.modelo || null;
  // Áreas: só as que a pessoa gerencia; "toda a empresa", só o admin.
  let areas = null;
  if (c.toda_empresa !== undefined || c.areas !== undefined) {
    v.toda_empresa = Number(!!c.toda_empresa);
    if (v.toda_empresa && !pessoa.admin) throw erro(403, 'toda_empresa', 'Só o admin cria quick win para a empresa toda.');
    areas = v.toda_empresa ? [] : [...new Set((c.areas || []).map(Number))];
    if (!v.toda_empresa && !areas.length) throw erro(400, 'areas', 'Escolha pelo menos uma área.');
    const minhas = pessoa.areas.filter(a => a.responsavel).map(a => a.id);
    if (!pessoa.admin && areas.some(a => !minhas.includes(a))) throw erro(403, 'areas', 'Você só configura quick wins das áreas em que é responsável.');
  }
  // Modelo padrão: liberado, de um perfil que o admin permite; homologado se o quick win é sigiloso.
  const final = { ...atual, ...v };
  if (final.modelo) {
    const m = acharModelo(app.db, cfg, final.modelo);
    if (!m?.liberado) throw erro(400, 'modelo', 'Escolha um modelo liberado na empresa.');
    if (!cfg.perfisQuickWin.includes(m.perfil)) throw erro(400, 'modelo', 'O admin não liberou este perfil de modelo como padrão de quick win.');
    if (final.sigiloso && !m.homologado) throw erro(400, 'modelo', 'Quick win que trata dados sigilosos só aceita modelo homologado.');
  } else if (final.status === 'ativo') throw erro(400, 'modelo', 'Escolha o modelo padrão antes de ativar.');
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
  return lerModelos(app.db).filter(m => m.liberado && cfg.perfisQuickWin.includes(m.perfil))
    .map(m => ({ id: m.id, nome: m.nome, perfil: m.perfil, homologado: m.homologado, custo: custoEstimado(m, entrada, saida) }));
}

export function criarQuickWins(app) {
  return {
    // Quick win para uso numa conversa: ativo e visível, ou (rascunho, pausado, teste) só para quem gerencia.
    paraUso(pessoa, id, teste = false) {
      const q = um(app.db, 'select * from quick_wins where id = ?', Number(id));
      if (!q) return null;
      const gere = podeGerir(app.db, pessoa, q);
      if (teste || q.status !== 'ativo') return gere ? q : null;
      return visivel(app.db, pessoa, q) || gere ? q : null;
    },

    // Contexto: instruções (na persona), arquivos do quick win e bases escolhidas.
    contexto(pessoa, qw, texto) {
      const arquivos = todos(app.db, 'select id, titulo, texto, sigiloso from documentos where quick_win_id = ? order by id', qw.id);
      const partes = [], fontes = [];
      let sigiloso = arquivos.some(a => a.sigiloso);
      if (arquivos.length) {
        const total = arquivos.reduce((n, a) => n + a.texto.length, 0);
        const corpo = total <= MAX_ARQUIVOS_INTEIROS
          ? arquivos.map(a => `### ${a.titulo}\n${a.texto}`).join('\n\n')
          : buscar(app.db, texto, arquivos.map(a => a.id), 8).map(t => `### ${arquivos.find(a => a.id === t.documento_id).titulo}\n${t.texto}`).join('\n\n');
        partes.push(`Arquivos de referência deste quick win (use em todas as respostas):\n\n${corpo}`);
        fontes.push(...arquivos.map(a => a.titulo));
      }
      const b = json(qw.bases, { modo: 'area' });
      if (b.modo !== 'nenhuma') {
        const areas = areasDoQw(app.db, qw.id);
        const ids = b.modo === 'escolhidas' ? b.ids
          : todos(app.db, `select id from documentos where quick_win_id is null and (toda_empresa = 1 ${areas.length ? `or area_id in (${areas.join(',')})` : ''})`).map(d => d.id);
        const t = trechosDasBases(app.db, texto, ids);
        if (t.parte) { partes.push(t.parte); fontes.push(...t.fontes); sigiloso ||= t.sigiloso; }
      }
      return { partes, fontes: [...new Set(fontes)], sigiloso, cacheavel: arquivos.length > 0 };
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

  r.get('/api/quick-wins/modelos-iniciais', () => ({ modelos: JSON.parse(readFileSync(MODELOS_INICIAIS, 'utf8')) }));

  r.get('/api/quick-wins/:id', ({ pessoa, params }) => publico(app.db, pessoa, carregar(pessoa, params.id)));

  r.get('/api/quick-wins/:id/estimativas', ({ pessoa, params }) => ({ modelos: estimativas(app, carregar(pessoa, params.id, true)) }));

  // Criar: do zero, de um modelo inicial ou duplicando um existente (inclusive
  // para outra área). Duplicar copia instruções, arquivos e configuração, nunca conversas.
  r.post('/api/quick-wins', ({ pessoa, corpo }) => {
    let base = {};
    let origem = null;
    if (corpo.duplicar_de) {
      origem = carregar(pessoa, corpo.duplicar_de);
      if (!podeGerir(app.db, pessoa, origem) && origem.status !== 'ativo') throw erro(404, 'quick_win', 'Quick win não encontrado.');
      base = { ...publico(app.db, { ...pessoa, admin: true }, origem), nome: corpo.nome || `${origem.nome} (cópia)` };
    } else if (corpo.modelo_inicial !== undefined) {
      base = JSON.parse(readFileSync(MODELOS_INICIAIS, 'utf8'))[Number(corpo.modelo_inicial)];
      if (!base) throw erro(404, 'modelo_inicial', 'Modelo inicial não encontrado.');
    }
    const cfg = lerConfig(app.db);
    const dados = { modelo: cfg.padroes[cfg.perfisQuickWin[0]] || cfg.padroes.chat, ...base, ...corpo, status: 'rascunho' };
    delete dados.id;
    const id = transacao(app.db, () => {
      const novo = Number(exec(app.db, 'insert into quick_wins (nome, criado_por) values (?, ?)', 'Novo quick win', pessoa.id).lastInsertRowid);
      const { v, areas } = validar(app, pessoa, {}, { nome: dados.nome || 'Novo quick win', cor: dados.cor || '#1B7950', icone: dados.icone || '', para_que_serve: dados.para_que_serve || '',
        instrucoes: dados.instrucoes || '', formato: dados.formato || 'texto', sugestoes: dados.sugestoes || [], exemplo_entrada: dados.exemplo_entrada || '', exemplo_saida: dados.exemplo_saida || '',
        sigiloso: dados.sigiloso || false, pode_trocar: dados.pode_trocar || false, dados: dados.dados || {}, bases: dados.bases || { modo: 'area' }, modelo: dados.modelo,
        status: 'rascunho', toda_empresa: !!corpo.toda_empresa, areas: corpo.areas || [] });
      gravar(app, novo, v, areas);
      if (origem) {
        for (const a of todos(app.db, 'select titulo, arquivo, sigiloso, texto from documentos where quick_win_id = ?', origem.id)) {
          const d = Number(exec(app.db, 'insert into documentos (titulo, arquivo, quick_win_id, sigiloso, texto, enviado_por) values (?, ?, ?, ?, ?, ?)', a.titulo, a.arquivo, novo, a.sigiloso, a.texto, pessoa.id).lastInsertRowid);
          indexar(app.db, d, a.texto);
        }
      }
      return novo;
    });
    registrar(app, 'quick_win_criado', pessoa.id, { quick_win: id, duplicado_de: origem?.id ?? null, modelo_inicial: corpo.modelo_inicial ?? null });
    return publico(app.db, pessoa, um(app.db, 'select * from quick_wins where id = ?', id));
  });

  r.put('/api/quick-wins/:id', ({ pessoa, params, corpo }) => {
    const q = carregar(pessoa, params.id, true);
    const { v, areas } = validar(app, pessoa, q, corpo);
    transacao(app.db, () => gravar(app, q.id, v, areas));
    registrar(app, 'quick_win_alterado', pessoa.id, { quick_win: q.id, campos: Object.keys(v), status: v.status });
    return publico(app.db, pessoa, um(app.db, 'select * from quick_wins where id = ?', q.id));
  });

  r.del('/api/quick-wins/:id', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    for (const d of todos(app.db, 'select id from documentos where quick_win_id = ?', q.id)) desindexar(app.db, d.id);
    exec(app.db, 'delete from quick_wins where id = ?', q.id);
    registrar(app, 'quick_win_removido', pessoa.id, { quick_win: q.id });
    return { ok: true };
  });

  r.post('/api/quick-wins/:id/arquivos', async ({ pessoa, params, corpo }) => {
    const q = carregar(pessoa, params.id, true);
    const { nome, texto } = await extrairTexto(corpo.arquivo || {});
    const id = Number(exec(app.db, 'insert into documentos (titulo, arquivo, quick_win_id, sigiloso, texto, enviado_por) values (?, ?, ?, ?, ?, ?)',
      (String(corpo.titulo || '').trim() || nome.replace(/\.[^.]+$/, '')).slice(0, 200), nome, q.id, Number(!!corpo.sigiloso), texto, pessoa.id).lastInsertRowid);
    indexar(app.db, id, texto);
    registrar(app, 'quick_win_arquivo', pessoa.id, { quick_win: q.id, documento: id, sigiloso: !!corpo.sigiloso });
    return publico(app.db, pessoa, q);
  }, { limiteMb: 30 });

  r.del('/api/quick-wins/:id/arquivos/:doc', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    const d = um(app.db, 'select id from documentos where id = ? and quick_win_id = ?', Number(params.doc), q.id);
    if (!d) throw erro(404, 'arquivo', 'Arquivo não encontrado.');
    desindexar(app.db, d.id);
    exec(app.db, 'delete from documentos where id = ?', d.id);
    registrar(app, 'quick_win_arquivo_removido', pessoa.id, { quick_win: q.id, documento: d.id });
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
