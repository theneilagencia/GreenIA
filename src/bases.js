// Bases de conhecimento: documentos por área ou da empresa toda. O texto é
// extraído no envio e indexado para a busca.
import { erro } from './http.js';
import { consolidarWal, exec, todos, um } from './db.js';
import { registrar } from './eventos.js';
import { delimitar, extrairTexto } from './texto.js';
import { buscar, desindexar, indexar } from './busca.js';

// Administrar a base de uma área: o admin da empresa, ou quem recebeu a permissão naquela área.
// A permissão vale só para a área em que foi dada, e não depende do papel global da pessoa.
export const podeGerirArea = (pessoa, areaId) => pessoa.admin || pessoa.areas.some(a => a.id === Number(areaId) && a.adminBase);
const areasQueAdministra = pessoa => pessoa.areas.filter(a => a.adminBase).map(a => a.id);

// Documentos de base que a pessoa pode consultar: das áreas dela e da empresa toda.
export function basesVisiveis(db, pessoa) {
  const areas = pessoa.areas.map(a => a.id);
  return todos(db, `select d.id from documentos d left join areas a on a.id = d.area_id where d.quick_win_id is null
    and (d.toda_empresa = 1 ${areas.length ? `or (a.ativa = 1 and d.area_id in (${areas.map(() => '?').join(',')}))` : ''})`, ...areas).map(d => d.id);
}

const LISTA = `select d.id, d.titulo, d.arquivo, d.area_id, a.nome as area, a.ativa as area_ativa, d.toda_empresa, d.sigiloso, d.pasta,
  length(d.texto) as caracteres, d.atualizado_em, d.revisado_em, r.nome as revisado_por
  from documentos d left join areas a on a.id = d.area_id left join pessoas r on r.id = d.revisado_por`;
const pasta = v => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);

function podeGerirDoc(pessoa, d) {
  if (!d || d.quick_win_id) return false;
  return d.toda_empresa ? pessoa.admin : podeGerirArea(pessoa, d.area_id);
}

// Resumo para quem administra a base de alguma área (a permissão explícita, não o papel de admin):
// quais bases, quantos documentos e quantos pedem revisão (nunca revisados ou há mais de 180 dias).
export const DIAS_REVISAO = 180;
export function resumoBases(db, pessoa) {
  const ids = areasQueAdministra(pessoa);
  const areas = ids.map(id => um(db, `select a.id, a.nome, count(d.id) as documentos,
    coalesce(sum(case when d.id is not null and (d.revisado_em is null or d.revisado_em < datetime('now', '-${DIAS_REVISAO} days')) then 1 else 0 end), 0) as paraRevisar
    from areas a left join documentos d on d.area_id = a.id and d.quick_win_id is null where a.id = ? group by a.id`, id)).filter(Boolean);
  return { areas, paraRevisar: areas.reduce((t, a) => t + a.paraRevisar, 0), diasRevisao: DIAS_REVISAO };
}

// Trechos das bases para uma pergunta: texto para o modelo, fontes e se algum é sigiloso.
export function trechosDasBases(db, consulta, ids) {
  const achados = buscar(db, consulta, ids, 5);
  if (!achados.length) return { parte: null, fontes: [], sigiloso: false, pecas: [] };
  const docs = new Map(todos(db, `select id, titulo, sigiloso from documentos where id in (${[...new Set(achados.map(a => a.documento_id))].join(',')})`).map(d => [d.id, d]));
  const parte = 'Trechos das bases de conhecimento que podem ajudar (cite o título do documento quando usar):\n\n'
    + achados.map(a => delimitar('documento', docs.get(a.documento_id).titulo, a.texto)).join('\n\n');
  const usados = [...docs.values()];
  // Peças: cada trecho com o documento de origem (e o título, que também vai para a IA), para a política de
  // credenciais conferir o que de fato entra no contexto (conversas.js).
  const pecas = achados.map(a => ({ origem: 'base', documento: a.documento_id, texto: `${docs.get(a.documento_id).titulo}\n${a.texto}` }));
  return { parte, fontes: usados.map(d => d.titulo), sigiloso: usados.some(d => d.sigiloso), pecas };
}

export function rotasBases(app, r) {
  r.get('/api/bases/documentos', ({ pessoa }) => {
    if (pessoa.admin) return { documentos: todos(app.db, `${LISTA} where d.quick_win_id is null order by d.toda_empresa desc, a.nome, d.titulo`) };
    const minhas = areasQueAdministra(pessoa);
    if (!minhas.length) return { documentos: [] };
    return { documentos: todos(app.db, `${LISTA} where d.quick_win_id is null and d.area_id in (${minhas.map(() => '?').join(',')}) order by a.nome, d.titulo`, ...minhas) };
  });

  // Conhecimento que a IA pode usar para esta pessoa, e em quais quick wins cada documento entra.
  r.get('/api/conhecimento', ({ pessoa }) => {
    const ids = basesVisiveis(app.db, pessoa);
    const docs = ids.length ? todos(app.db, `${LISTA} where d.id in (${ids.map(() => '?').join(',')}) order by d.toda_empresa desc, a.nome, d.titulo`, ...ids) : [];
    const qws = todos(app.db, "select q.id, q.nome, q.bases, q.toda_empresa, (select group_concat(area_id) from quick_win_areas where quick_win_id = q.id) as areas from quick_wins q where q.excluido_em is null and q.status not in ('identificado', 'descartado')");
    const usa = (q, d) => {
      const b = JSON.parse(q.bases || '{}');
      if (b.modo === 'escolhidas') return (b.ids || []).includes(d.id);
      if (b.modo === 'area') return d.toda_empresa || String(q.areas || '').split(',').map(Number).includes(d.area_id);
      return false;
    };
    return { documentos: docs.map(d => ({ ...d, quickWins: qws.filter(q => usa(q, d)).map(q => ({ id: q.id, nome: q.nome })) })), podeGerir: pessoa.admin || pessoa.areas.some(a => a.adminBase) };
  });

  r.get('/api/bases/resumo', ({ pessoa }) => resumoBases(app.db, pessoa));

  // Áreas cuja base a pessoa administra, com quem são os membros e os administradores.
  // O administrador da base vê as pessoas da própria área, sem poder mudá-las.
  r.get('/api/bases/areas', ({ pessoa }) => {
    const ids = pessoa.admin ? todos(app.db, 'select id from areas where ativa = 1 order by nome').map(a => a.id) : areasQueAdministra(pessoa);
    return { areas: ids.map(id => {
      const a = um(app.db, `select id, nome, descricao, (select count(*) from documentos where area_id = areas.id and quick_win_id is null) as documentos from areas where id = ?`, id);
      const m = todos(app.db, 'select p.nome, p.email, ap.admin_base from area_pessoas ap join pessoas p on p.id = ap.pessoa_id where ap.area_id = ? and p.ativo = 1 order by ap.admin_base desc, p.nome', id);
      return { ...a, membros: m.length, administradores: m.filter(x => x.admin_base).map(x => ({ nome: x.nome, email: x.email })), pessoas: m.map(x => ({ nome: x.nome, email: x.email, adminBase: !!x.admin_base })) };
    }), todaEmpresa: pessoa.admin };
  });

  r.post('/api/bases/documentos', async ({ pessoa, corpo }) => {
    const todaEmpresa = !!corpo.toda_empresa;
    const areaId = todaEmpresa ? null : Number(corpo.area_id) || null;
    if (todaEmpresa ? !pessoa.admin : !areaId || !podeGerirArea(pessoa, areaId)) throw erro(403, 'sem_permissao', 'Só o admin da empresa ou um administrador da base desta área envia documentos para ela.');
    if (areaId && !um(app.db, 'select 1 from areas where id = ? and ativa = 1', areaId)) throw erro(404, 'area', 'Área não encontrada ou desativada.');
    const { nome, texto } = await extrairTexto(corpo.arquivo || {}, { ocr: app.ocr, limitesOcr: app.limitesOcr });
    const titulo = String(corpo.titulo || '').trim() || nome.replace(/\.[^.]+$/, '');
    // Quem envia conferiu o conteúdo: o documento nasce revisado (o prazo de revisão conta daqui).
    const id = Number(exec(app.db, "insert into documentos (titulo, arquivo, area_id, toda_empresa, sigiloso, texto, enviado_por, pasta, revisado_em, revisado_por) values (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)",
      titulo.slice(0, 200), nome, areaId, Number(todaEmpresa), Number(!!corpo.sigiloso), texto, pessoa.id, pasta(corpo.pasta), pessoa.id).lastInsertRowid);
    indexar(app.db, id, texto);
    registrar(app, 'knowledge.added', pessoa.id, { documento: id, area: areaId, toda_empresa: todaEmpresa, sigiloso: !!corpo.sigiloso });
    return um(app.db, `${LISTA} where d.id = ?`, id);
  }, { limiteMb: 35 });   // arquivo de até 25 MB, em base64

  r.put('/api/bases/documentos/:id', async ({ pessoa, params, corpo }) => {
    const d = um(app.db, 'select * from documentos where id = ?', Number(params.id));
    if (!podeGerirDoc(pessoa, d)) throw erro(404, 'documento', 'Documento não encontrado.');
    if (corpo.arquivo) {
      const { nome, texto } = await extrairTexto(corpo.arquivo, { ocr: app.ocr, limitesOcr: app.limitesOcr });
      exec(app.db, "update documentos set arquivo = ?, texto = ?, atualizado_em = datetime('now') where id = ?", nome, texto, d.id);
      indexar(app.db, d.id, texto);
    }
    if (corpo.titulo) exec(app.db, 'update documentos set titulo = ? where id = ?', String(corpo.titulo).trim().slice(0, 200), d.id);
    if (corpo.sigiloso !== undefined) exec(app.db, 'update documentos set sigiloso = ? where id = ?', Number(!!corpo.sigiloso), d.id);
    if (corpo.pasta !== undefined) exec(app.db, 'update documentos set pasta = ? where id = ?', pasta(corpo.pasta), d.id);
    // Revisar: a pessoa confirma que o conteúdo continua certo. Substituir o arquivo também conta.
    if (corpo.revisado || corpo.arquivo) exec(app.db, "update documentos set revisado_em = datetime('now'), revisado_por = ? where id = ?", pessoa.id, d.id);
    registrar(app, 'knowledge.updated', pessoa.id, { documento: d.id, substituido: !!corpo.arquivo, sigiloso: corpo.sigiloso, pasta: corpo.pasta, revisado: !!corpo.revisado });
    return um(app.db, `${LISTA} where d.id = ?`, d.id);
  }, { limiteMb: 35 });   // arquivo de até 25 MB, em base64

  r.del('/api/bases/documentos/:id', ({ pessoa, params }) => {
    const d = um(app.db, 'select * from documentos where id = ?', Number(params.id));
    if (!podeGerirDoc(pessoa, d)) throw erro(404, 'documento', 'Documento não encontrado.');
    desindexar(app.db, d.id);
    exec(app.db, 'delete from documentos where id = ?', d.id);
    registrar(app, 'knowledge.removed', pessoa.id, { documento: d.id });
    consolidarWal(app.db);
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
      return { partes: t.parte ? [t.parte] : [], fontes: t.fontes, sigiloso: t.sigiloso, cacheavel: false, pecas: t.pecas };
    },
    arquivosSigilosos: qw => !!qw && !!um(app.db, 'select 1 from documentos where quick_win_id = ? and sigiloso = 1', qw.id),
  };
}
