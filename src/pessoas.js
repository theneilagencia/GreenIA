// Pessoas, áreas e grupos de acesso a modelos.
import { erro } from './http.js';
import { exec, todos, transacao, um } from './db.js';
import { registrar } from './eventos.js';
import { lerConfig } from './config.js';

// Membros da área e as permissões de cada um dentro dela.
const membros = (db, areaId) => todos(db, `select ap.pessoa_id, ap.responsavel, ap.admin_base, p.nome, p.email, p.ativo
  from area_pessoas ap join pessoas p on p.id = ap.pessoa_id where ap.area_id = ? order by ap.admin_base desc, p.nome, p.email`, areaId)
  .map(m => ({ pessoa_id: m.pessoa_id, nome: m.nome, email: m.email, ativo: !!m.ativo, responsavel: !!m.responsavel, adminBase: !!m.admin_base }));

const lerArea = (db, id) => {
  const a = um(db, `select a.id, a.nome, a.descricao, a.sigilosa, a.ativa,
    (select count(*) from documentos d where d.area_id = a.id and d.quick_win_id is null) as documentos from areas a where a.id = ?`, id);
  return a && { ...a, sigilosa: !!a.sigilosa, ativa: !!a.ativa, pessoas: membros(db, a.id) };
};

// Sem adminBase (clientes antigos da API), vale o comportamento anterior: o responsável administra a base.
function salvarAreasDaPessoa(db, pessoaId, areas) {
  exec(db, 'delete from area_pessoas where pessoa_id = ?', pessoaId);
  for (const a of areas || []) exec(db, 'insert into area_pessoas (area_id, pessoa_id, responsavel, admin_base) select id, ?, ?, ? from areas where id = ?', pessoaId, Number(!!a.responsavel), Number(!!(a.adminBase ?? a.responsavel)), Number(a.id));
}

// Aviso por email a quem acabou de receber a permissão de administrar a base de uma área:
// compara quem administrava antes e depois da mudança e escreve só para os novos.
const adminsBase = db => new Set(todos(db, 'select area_id, pessoa_id from area_pessoas where admin_base = 1').map(x => `${x.area_id}:${x.pessoa_id}`));
function avisarNovosAdminsBase(app, req, antes) {
  const novos = [...adminsBase(app.db)].filter(k => !antes.has(k));
  if (!novos.length) return;
  const proto = req?.headers['x-forwarded-proto'] === 'https' || app.cookieSeguro ? 'https' : 'http';
  const caminho = app.linkApp?.() ?? '/app';
  const link = `${/^https?:/.test(caminho) ? caminho : `${proto}://${req?.headers.host || 'localhost'}${caminho}`}#/conhecimento`;
  const empresa = lerConfig(app.db).empresa || 'sua empresa';
  const porPessoa = new Map();
  for (const k of novos) { const [a, p] = k.split(':').map(Number); if (!porPessoa.has(p)) porPessoa.set(p, []); porPessoa.get(p).push(a); }
  for (const [pid, areas] of porPessoa) {
    const p = um(app.db, 'select email, nome, ativo from pessoas where id = ?', pid);
    const nomes = areas.map(a => um(app.db, 'select nome from areas where id = ? and ativa = 1', a)?.nome).filter(Boolean);
    if (!p?.ativo || !nomes.length) continue;
    const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
    const texto = `Olá${p.nome ? `, ${p.nome.split(' ')[0]}` : ''}.\n\nVocê agora administra a base de conhecimento de ${lista}, na GreenIA da ${empresa}.\n\n`
      + `O que você pode fazer: adicionar procedimentos, políticas, manuais e outros documentos da área, organizar em pastas, revisar, atualizar e remover conteúdos. A IA usa esses documentos nas respostas das pessoas da área, citando a fonte.\n\n`
      + `Para começar, entre na GreenIA e abra Conhecimento, no menu Trabalho:\n${link}\n\nA permissão vale só para ${nomes.length === 1 ? 'esta área' : 'estas áreas'}.`;
    app.email.enviar(p.email, `Você agora administra a base de ${lista}`, texto).catch(e => app.log('aviso de admin da base', e.message));
    registrar(app, 'area.kb_admin_notified', null, { pessoa: pid, areas });
  }
}

const nomeArea = v => { const n = String(v ?? '').trim().slice(0, 80); if (!n) throw erro(400, 'nome', 'Dê um nome à área.'); return n; };
const descricaoArea = v => String(v ?? '').trim().slice(0, 400);

export function rotasPessoas(app, r) {
  // Áreas: o admin vê todas as ativas; cada pessoa vê as suas (com as permissões dela em cada uma).
  r.get('/api/areas', ({ pessoa }) => ({
    areas: pessoa.admin ? todos(app.db, 'select id, nome, sigilosa from areas where ativa = 1 order by nome').map(a => ({ ...a, sigilosa: !!a.sigilosa, responsavel: true, adminBase: true })) : pessoa.areas,
  }));

  r.get('/api/admin/areas', () => ({
    areas: todos(app.db, 'select id from areas order by ativa desc, nome').map(a => lerArea(app.db, a.id)),
  }), { admin: true });

  r.get('/api/admin/areas/:id', ({ params }) => {
    const a = lerArea(app.db, Number(params.id));
    if (!a) throw erro(404, 'area', 'Área não encontrada.');
    return { area: a };
  }, { admin: true });

  r.post('/api/admin/areas', ({ pessoa, corpo }) => {
    const nome = nomeArea(corpo.nome), descricao = descricaoArea(corpo.descricao);
    if (um(app.db, 'select 1 from areas where nome = ?', nome)) throw erro(409, 'nome', 'Já existe uma área com esse nome.');
    const id = Number(exec(app.db, 'insert into areas (nome, descricao, sigilosa) values (?, ?, ?)', nome, descricao, Number(!!corpo.sigilosa)).lastInsertRowid);
    registrar(app, 'area.created', pessoa.id, { area: id, nome, sigilosa: !!corpo.sigilosa });
    app.aoMudarModelos?.();
    return lerArea(app.db, id);
  }, { admin: true });

  r.put('/api/admin/areas/:id', ({ pessoa, params, corpo, req }) => {
    const antesBase = adminsBase(app.db);
    const id = Number(params.id);
    const antes = lerArea(app.db, id);
    if (!antes) throw erro(404, 'area', 'Área não encontrada.');
    transacao(app.db, () => {
      if (corpo.nome !== undefined) {
        const nome = nomeArea(corpo.nome);
        if (um(app.db, 'select 1 from areas where nome = ? and id != ?', nome, id)) throw erro(409, 'nome', 'Já existe uma área com esse nome.');
        exec(app.db, 'update areas set nome = ? where id = ?', nome, id);
      }
      if (corpo.descricao !== undefined) exec(app.db, 'update areas set descricao = ? where id = ?', descricaoArea(corpo.descricao), id);
      if (corpo.sigilosa !== undefined) exec(app.db, 'update areas set sigilosa = ? where id = ?', Number(!!corpo.sigilosa), id);
      if (corpo.ativa !== undefined) exec(app.db, 'update areas set ativa = ? where id = ?', Number(!!corpo.ativa), id);
      if (Array.isArray(corpo.pessoas)) {
        exec(app.db, 'delete from area_pessoas where area_id = ?', id);
        for (const m of corpo.pessoas) exec(app.db, 'insert or ignore into area_pessoas (area_id, pessoa_id, responsavel, admin_base) select ?, id, ?, ? from pessoas where id = ?', id, Number(!!m.responsavel), Number(!!(m.adminBase ?? m.responsavel)), Number(m.pessoa_id));
      }
    });
    const tipo = corpo.ativa === false && antes.ativa ? 'area.deactivated' : corpo.ativa === true && !antes.ativa ? 'area.activated' : 'area.updated';
    registrar(app, tipo, pessoa.id, { area: id, nome: corpo.nome, sigilosa: corpo.sigilosa, pessoas: corpo.pessoas?.length });
    app.aoMudarModelos?.();
    avisarNovosAdminsBase(app, req, antesBase);
    return lerArea(app.db, id);
  }, { admin: true });

  // Pessoas da área, uma a uma: adicionar (várias de uma vez), mudar a permissão e remover.
  const areaOu404 = id => { if (!um(app.db, 'select 1 from areas where id = ?', id)) throw erro(404, 'area', 'Área não encontrada.'); };
  r.post('/api/admin/areas/:id/pessoas', ({ pessoa, params, corpo, req }) => {
    const antesBase = adminsBase(app.db);
    const id = Number(params.id);
    areaOu404(id);
    const ids = [...new Set((Array.isArray(corpo.pessoas) ? corpo.pessoas : []).map(Number).filter(Boolean))];
    if (!ids.length) throw erro(400, 'pessoas', 'Escolha ao menos uma pessoa.');
    const adminBase = Number(!!corpo.adminBase);
    transacao(app.db, () => {
      for (const p of ids) exec(app.db, `insert into area_pessoas (area_id, pessoa_id, admin_base) select ?, id, ? from pessoas where id = ?
        on conflict (area_id, pessoa_id) do update set admin_base = max(admin_base, excluded.admin_base)`, id, adminBase, p);
    });
    registrar(app, 'area.members_added', pessoa.id, { area: id, pessoas: ids, admin_base: !!adminBase });
    app.aoMudarModelos?.();
    avisarNovosAdminsBase(app, req, antesBase);
    return lerArea(app.db, id);
  }, { admin: true });

  r.put('/api/admin/areas/:id/pessoas/:pessoa', ({ pessoa, params, corpo, req }) => {
    const antesBase = adminsBase(app.db);
    const id = Number(params.id), alvo = Number(params.pessoa);
    const m = um(app.db, 'select responsavel, admin_base from area_pessoas where area_id = ? and pessoa_id = ?', id, alvo);
    if (!m) throw erro(404, 'membro', 'Esta pessoa não faz parte da área.');
    const v = { adminBase: corpo.adminBase === undefined ? !!m.admin_base : !!corpo.adminBase, responsavel: corpo.responsavel === undefined ? !!m.responsavel : !!corpo.responsavel };
    exec(app.db, 'update area_pessoas set admin_base = ?, responsavel = ? where area_id = ? and pessoa_id = ?', Number(v.adminBase), Number(v.responsavel), id, alvo);
    registrar(app, 'area.permission_changed', pessoa.id, { area: id, pessoa: alvo, admin_base: v.adminBase, responsavel: v.responsavel });
    avisarNovosAdminsBase(app, req, antesBase);
    return lerArea(app.db, id);
  }, { admin: true });

  r.del('/api/admin/areas/:id/pessoas/:pessoa', ({ pessoa, params }) => {
    const id = Number(params.id), alvo = Number(params.pessoa);
    exec(app.db, 'delete from area_pessoas where area_id = ? and pessoa_id = ?', id, alvo);
    registrar(app, 'area.member_removed', pessoa.id, { area: id, pessoa: alvo });
    app.aoMudarModelos?.();
    return lerArea(app.db, id) || { ok: true };
  }, { admin: true });

  // Excluir apaga a base da área: só depois de desativada, para não perder documentos por engano.
  r.del('/api/admin/areas/:id', ({ pessoa, params }) => {
    const a = lerArea(app.db, Number(params.id));
    if (!a) return { ok: true };
    if (a.ativa) throw erro(409, 'area_ativa', 'Desative a área antes de excluir. Excluir apaga também os documentos da base de conhecimento dela.');
    exec(app.db, 'delete from areas where id = ?', a.id);
    registrar(app, 'area.removed', pessoa.id, { area: a.id, nome: a.nome, documentos: a.documentos });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });

  // Pessoas: o admin cadastra (ou elas entram sozinhas com email de domínio permitido).
  r.get('/api/admin/pessoas', () => ({
    pessoas: todos(app.db, 'select id, email, nome, papel, ativo from pessoas order by nome, email').map(p => ({
      ...p, ativo: !!p.ativo,
      areas: todos(app.db, 'select area_id as id, responsavel, admin_base from area_pessoas where pessoa_id = ?', p.id).map(a => ({ id: a.id, responsavel: !!a.responsavel, adminBase: !!a.admin_base })),
      grupos: todos(app.db, 'select grupo_id from grupo_pessoas where pessoa_id = ?', p.id).map(g => g.grupo_id) })),
  }), { admin: true });

  r.post('/api/admin/pessoas', ({ pessoa, corpo, req }) => {
    const antesBase = adminsBase(app.db);
    // Multiempresa: usuários, convites, roles e status ficam na plataforma (Usuários, no admin da empresa).
    if (app.tenant) throw erro(409, 'use_usuarios', 'Cadastre pessoas em Usuários. Aqui ficam as áreas e os grupos.');
    const email = String(corpo.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erro(400, 'email', 'Email inválido.');
    // Fora dos domínios permitidos, só entra quem o admin cadastrou (a pessoa, não o domínio).
    if (um(app.db, 'select 1 from pessoas where email = ?', email)) throw erro(409, 'email', 'Esta pessoa já está cadastrada.');
    const papel = corpo.papel === 'admin' ? 'admin' : 'usuario';
    const id = transacao(app.db, () => {
      const novo = Number(exec(app.db, 'insert into pessoas (email, nome, papel) values (?, ?, ?)', email, String(corpo.nome || email.split('@')[0]).trim().slice(0, 120), papel).lastInsertRowid);
      salvarAreasDaPessoa(app.db, novo, corpo.areas);
      return novo;
    });
    registrar(app, 'people.created', pessoa.id, { pessoa: id, papel });
    avisarNovosAdminsBase(app, req, antesBase);
    return { id };
  }, { admin: true });

  r.put('/api/admin/pessoas/:id', ({ pessoa, params, corpo, req }) => {
    const antesBase = adminsBase(app.db);
    const id = Number(params.id);
    const alvo = um(app.db, 'select id, papel, ativo from pessoas where id = ?', id);
    if (!alvo) throw erro(404, 'pessoa', 'Pessoa não encontrada.');
    if (app.tenant && (corpo.papel !== undefined || corpo.ativo !== undefined)) throw erro(409, 'use_usuarios', 'Role e status são alterados em Usuários.');
    const papel = corpo.papel === undefined ? alvo.papel : corpo.papel === 'admin' ? 'admin' : 'usuario';
    const ativo = corpo.ativo === undefined ? alvo.ativo : Number(!!corpo.ativo);
    const admins = um(app.db, "select count(*) as n from pessoas where papel = 'admin' and ativo = 1 and id != ?", id).n;
    if (alvo.papel === 'admin' && (papel !== 'admin' || !ativo) && !admins) throw erro(409, 'ultimo_admin', 'A instalação precisa de pelo menos um admin ativo.');
    transacao(app.db, () => {
      exec(app.db, 'update pessoas set nome = coalesce(?, nome), papel = ?, ativo = ? where id = ?', corpo.nome ? String(corpo.nome).trim().slice(0, 120) : null, papel, ativo, id);
      if (Array.isArray(corpo.areas)) salvarAreasDaPessoa(app.db, id, corpo.areas);
      if (Array.isArray(corpo.grupos)) {
        exec(app.db, 'delete from grupo_pessoas where pessoa_id = ?', id);
        for (const g of new Set(corpo.grupos.map(Number))) exec(app.db, 'insert into grupo_pessoas (grupo_id, pessoa_id) select id, ? from grupos where id = ?', id, g);
      }
      if (!ativo) exec(app.db, 'delete from sessoes where pessoa_id = ?', id);
    });
    registrar(app, 'people.updated', pessoa.id, { pessoa: id, papel, ativo: !!ativo, areas: corpo.areas?.length, grupos: corpo.grupos?.length });
    app.aoMudarModelos?.();
    avisarNovosAdminsBase(app, req, antesBase);
    return { ok: true };
  }, { admin: true });

  // Grupos: nome e pessoas, usados só para liberar perfis de modelo.
  // Grupo não tem base de conhecimento: só serve para liberar recursos. "usos" diz o que cada um libera
  // (e onde isso se muda), para a tela mostrar a diferença entre grupo e área.
  r.get('/api/admin/grupos', () => {
    const cfg = lerConfig(app.db), c = cfg.criarQuickWin;
    const usos = id => [
      ...['equilibrado', 'avancado'].filter(k => (cfg.acessoPerfis[k]?.grupos || []).includes(id)).map(k => ({ texto: `Usar a classe ${k === 'avancado' ? 'Avançado' : 'Equilibrado'} no dia a dia`, onde: '#/modelos' })),
      ...((c.grupos || []).includes(id) ? [{ texto: 'Criar quick wins nas suas áreas', onde: '#/pessoas/criacao' }] : []),
      ...((c.todaEmpresa?.grupos || []).includes(id) ? [{ texto: 'Criar quick wins para a empresa toda', onde: '#/pessoas/criacao' }] : []),
    ];
    return { grupos: todos(app.db, 'select id, nome from grupos order by nome').map(g => ({
      ...g, pessoas: todos(app.db, 'select pessoa_id from grupo_pessoas where grupo_id = ?', g.id).map(x => x.pessoa_id), usos: usos(g.id) })) };
  }, { admin: true });

  r.post('/api/admin/grupos', ({ pessoa, corpo }) => {
    const nome = String(corpo.nome || '').trim();
    if (!nome) throw erro(400, 'nome', 'Dê um nome ao grupo.');
    if (um(app.db, 'select 1 from grupos where nome = ?', nome)) throw erro(409, 'nome', 'Já existe um grupo com esse nome.');
    const id = Number(exec(app.db, 'insert into grupos (nome) values (?)', nome).lastInsertRowid);
    registrar(app, 'group.created', pessoa.id, { grupo: id, nome });
    return { id, nome, pessoas: [] };
  }, { admin: true });

  r.put('/api/admin/grupos/:id', ({ pessoa, params, corpo }) => {
    const id = Number(params.id);
    if (!um(app.db, 'select 1 from grupos where id = ?', id)) throw erro(404, 'grupo', 'Grupo não encontrado.');
    transacao(app.db, () => {
      if (corpo.nome) exec(app.db, 'update grupos set nome = ? where id = ?', String(corpo.nome).trim(), id);
      if (Array.isArray(corpo.pessoas)) {
        exec(app.db, 'delete from grupo_pessoas where grupo_id = ?', id);
        for (const p of new Set(corpo.pessoas.map(Number))) exec(app.db, 'insert into grupo_pessoas (grupo_id, pessoa_id) select ?, id from pessoas where id = ?', id, p);
      }
    });
    registrar(app, 'group.updated', pessoa.id, { grupo: id, pessoas: corpo.pessoas?.length });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });

  r.del('/api/admin/grupos/:id', ({ pessoa, params }) => {
    exec(app.db, 'delete from grupos where id = ?', Number(params.id));
    registrar(app, 'group.removed', pessoa.id, { grupo: Number(params.id) });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });
}
