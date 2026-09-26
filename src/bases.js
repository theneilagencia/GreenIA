// Bases de conhecimento: documentos por área ou da empresa toda. O texto é
// extraído no envio e indexado para a busca.
import { erro } from './http.js';
import { exec, todos, um } from './db.js';
import { registrar } from './eventos.js';
import { delimitar, extrairTexto } from './texto.js';
import { buscar, desindexar, indexar } from './busca.js';

export const podeGerirArea = (pessoa, areaId) => pessoa.admin || pessoa.areas.some(a => a.id === Number(areaId) && a.responsavel);

// Documentos de base que a pessoa pode consultar: das áreas dela e da empresa toda.
export function basesVisiveis(db, pessoa) {
  const areas = pessoa.areas.map(a => a.id);
  return todos(db, `select id from documentos where quick_win_id is null and (toda_empresa = 1 ${areas.length ? `or area_id in (${areas.map(() => '?').join(',')})` : ''})`, ...areas).map(d => d.id);
}

const LISTA = `select d.id, d.titulo, d.arquivo, d.area_id, a.nome as area, d.toda_empresa, d.sigiloso, length(d.texto) as caracteres, d.atualizado_em
  from documentos d left join areas a on a.id = d.area_id`;

function podeGerirDoc(pessoa, d) {
  if (!d || d.quick_win_id) return false;
  return d.toda_empresa ? pessoa.admin : podeGerirArea(pessoa, d.area_id);
}

// Trechos das bases para uma pergunta: texto para o modelo, fontes e se algum é sigiloso.
export function trechosDasBases(db, consulta, ids) {
  const achados = buscar(db, consulta, ids, 5);
  if (!achados.length) return { parte: null, fontes: [], sigiloso: false };
  const docs = new Map(todos(db, `select id, titulo, sigiloso from documentos where id in (${[...new Set(achados.map(a => a.documento_id))].join(',')})`).map(d => [d.id, d]));
  const parte = 'Trechos das bases de conhecimento que podem ajudar (cite o título do documento quando usar):\n\n'
    + achados.map(a => delimitar('documento', docs.get(a.documento_id).titulo, a.texto)).join('\n\n');
  const usados = [...docs.values()];
  return { parte, fontes: usados.map(d => d.titulo), sigiloso: usados.some(d => d.sigiloso) };
}

export function rotasBases(app, r) {
  r.get('/api/bases/documentos', ({ pessoa }) => {
    if (pessoa.admin) return { documentos: todos(app.db, `${LISTA} where d.quick_win_id is null order by d.toda_empresa desc, a.nome, d.titulo`) };
    const minhas = pessoa.areas.filter(a => a.responsavel).map(a => a.id);
    if (!minhas.length) return { documentos: [] };
    return { documentos: todos(app.db, `${LISTA} where d.quick_win_id is null and d.area_id in (${minhas.map(() => '?').join(',')}) order by a.nome, d.titulo`, ...minhas) };
  });

  // Conhecimento que a IA pode usar para esta pessoa, e em quais quick wins cada documento entra.
  r.get('/api/conhecimento', ({ pessoa }) => {
    const ids = basesVisiveis(app.db, pessoa);
    const docs = ids.length ? todos(app.db, `${LISTA} where d.id in (${ids.map(() => '?').join(',')}) order by d.toda_empresa desc, a.nome, d.titulo`, ...ids) : [];
    const qws = todos(app.db, "select q.id, q.nome, q.bases, q.toda_empresa, (select group_concat(area_id) from quick_win_areas where quick_win_id = q.id) as areas from quick_wins q where q.status not in ('identificado', 'descartado')");
    const usa = (q, d) => {
      const b = JSON.parse(q.bases || '{}');
      if (b.modo === 'escolhidas') return (b.ids || []).includes(d.id);
      if (b.modo === 'area') return d.toda_empresa || String(q.areas || '').split(',').map(Number).includes(d.area_id);
      return false;
    };
    return { documentos: docs.map(d => ({ ...d, quickWins: qws.filter(q => usa(q, d)).map(q => ({ id: q.id, nome: q.nome })) })), podeGerir: pessoa.admin || pessoa.areas.some(a => a.responsavel) };
  });

  r.post('/api/bases/documentos', async ({ pessoa, corpo }) => {
    const todaEmpresa = !!corpo.toda_empresa;
    const areaId = todaEmpresa ? null : Number(corpo.area_id) || null;
    if (todaEmpresa ? !pessoa.admin : !areaId || !podeGerirArea(pessoa, areaId)) throw erro(403, 'sem_permissao', 'Só o admin ou o responsável da área envia documentos para a base.');
    if (areaId && !um(app.db, 'select 1 from areas where id = ?', areaId)) throw erro(404, 'area', 'Área não encontrada.');
    const { nome, texto } = await extrairTexto(corpo.arquivo || {});
    const titulo = String(corpo.titulo || '').trim() || nome.replace(/\.[^.]+$/, '');
    const id = Number(exec(app.db, 'insert into documentos (titulo, arquivo, area_id, toda_empresa, sigiloso, texto, enviado_por) values (?, ?, ?, ?, ?, ?, ?)',
      titulo.slice(0, 200), nome, areaId, Number(todaEmpresa), Number(!!corpo.sigiloso), texto, pessoa.id).lastInsertRowid);
    indexar(app.db, id, texto);
    registrar(app, 'knowledge.added', pessoa.id, { documento: id, area: areaId, toda_empresa: todaEmpresa, sigiloso: !!corpo.sigiloso });
    return um(app.db, `${LISTA} where d.id = ?`, id);
  }, { limiteMb: 30 });

  r.put('/api/bases/documentos/:id', async ({ pessoa, params, corpo }) => {
    const d = um(app.db, 'select * from documentos where id = ?', Number(params.id));
    if (!podeGerirDoc(pessoa, d)) throw erro(404, 'documento', 'Documento não encontrado.');
    if (corpo.arquivo) {
      const { nome, texto } = await extrairTexto(corpo.arquivo);
      exec(app.db, "update documentos set arquivo = ?, texto = ?, atualizado_em = datetime('now') where id = ?", nome, texto, d.id);
      indexar(app.db, d.id, texto);
    }
    if (corpo.titulo) exec(app.db, 'update documentos set titulo = ? where id = ?', String(corpo.titulo).trim().slice(0, 200), d.id);
    if (corpo.sigiloso !== undefined) exec(app.db, 'update documentos set sigiloso = ? where id = ?', Number(!!corpo.sigiloso), d.id);
    registrar(app, 'knowledge.updated', pessoa.id, { documento: d.id, substituido: !!corpo.arquivo, sigiloso: corpo.sigiloso });
    return um(app.db, `${LISTA} where d.id = ?`, d.id);
  }, { limiteMb: 30 });

  r.del('/api/bases/documentos/:id', ({ pessoa, params }) => {
    const d = um(app.db, 'select * from documentos where id = ?', Number(params.id));
    if (!podeGerirDoc(pessoa, d)) throw erro(404, 'documento', 'Documento não encontrado.');
    desindexar(app.db, d.id);
    exec(app.db, 'delete from documentos where id = ?', d.id);
    registrar(app, 'knowledge.removed', pessoa.id, { documento: d.id });
    return { ok: true };
  });
}

// Contexto de cada mensagem (chat e quick win). O quick win acrescenta os
// próprios arquivos e as bases escolhidas (quickwins.js).
export function criarContexto(app) {
  return {
    async montar(pessoa, qw, texto) {
      if (qw && app.quickWins) return app.quickWins.contexto(pessoa, qw, texto);
      const t = trechosDasBases(app.db, texto, basesVisiveis(app.db, pessoa));
      return { partes: t.parte ? [t.parte] : [], fontes: t.fontes, sigiloso: t.sigiloso, cacheavel: false };
    },
    arquivosSigilosos: qw => !!qw && !!um(app.db, 'select 1 from documentos where quick_win_id = ? and sigiloso = 1', qw.id),
  };
}
