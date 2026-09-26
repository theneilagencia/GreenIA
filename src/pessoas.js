// Pessoas, áreas e grupos de acesso a modelos.
import { erro } from './http.js';
import { exec, todos, transacao, um } from './db.js';
import { registrar } from './eventos.js';
import { lerConfig } from './config.js';
import { dominioPermitido } from './auth.js';

const membros = (db, areaId) => todos(db, 'select pessoa_id, responsavel from area_pessoas where area_id = ?', areaId)
  .map(m => ({ pessoa_id: m.pessoa_id, responsavel: !!m.responsavel }));

function salvarAreasDaPessoa(db, pessoaId, areas) {
  exec(db, 'delete from area_pessoas where pessoa_id = ?', pessoaId);
  for (const a of areas || []) exec(db, 'insert into area_pessoas (area_id, pessoa_id, responsavel) select id, ?, ? from areas where id = ?', pessoaId, Number(!!a.responsavel), Number(a.id));
}

export function rotasPessoas(app, r) {
  // Áreas: o admin vê todas; cada pessoa vê as suas (com a marca de responsável).
  r.get('/api/areas', ({ pessoa }) => ({
    areas: pessoa.admin ? todos(app.db, 'select id, nome, sigilosa from areas order by nome').map(a => ({ ...a, sigilosa: !!a.sigilosa, responsavel: true })) : pessoa.areas,
  }));

  r.get('/api/admin/areas', () => ({
    areas: todos(app.db, 'select id, nome, sigilosa from areas order by nome').map(a => ({ ...a, sigilosa: !!a.sigilosa, pessoas: membros(app.db, a.id) })),
  }), { admin: true });

  r.post('/api/admin/areas', ({ pessoa, corpo }) => {
    const nome = String(corpo.nome || '').trim().slice(0, 80);
    if (!nome) throw erro(400, 'nome', 'Dê um nome à área.');
    if (um(app.db, 'select 1 from areas where nome = ?', nome)) throw erro(409, 'nome', 'Já existe uma área com esse nome.');
    const id = Number(exec(app.db, 'insert into areas (nome, sigilosa) values (?, ?)', nome, Number(!!corpo.sigilosa)).lastInsertRowid);
    registrar(app, 'area_criada', pessoa.id, { area: id, nome, sigilosa: !!corpo.sigilosa });
    app.aoMudarModelos?.();
    return { id, nome, sigilosa: !!corpo.sigilosa, pessoas: [] };
  }, { admin: true });

  r.put('/api/admin/areas/:id', ({ pessoa, params, corpo }) => {
    const id = Number(params.id);
    if (!um(app.db, 'select 1 from areas where id = ?', id)) throw erro(404, 'area', 'Área não encontrada.');
    transacao(app.db, () => {
      if (corpo.nome) exec(app.db, 'update areas set nome = ? where id = ?', String(corpo.nome).trim().slice(0, 80), id);
      if (corpo.sigilosa !== undefined) exec(app.db, 'update areas set sigilosa = ? where id = ?', Number(!!corpo.sigilosa), id);
      if (Array.isArray(corpo.pessoas)) {
        exec(app.db, 'delete from area_pessoas where area_id = ?', id);
        for (const m of corpo.pessoas) exec(app.db, 'insert or ignore into area_pessoas (area_id, pessoa_id, responsavel) select ?, id, ? from pessoas where id = ?', id, Number(!!m.responsavel), Number(m.pessoa_id));
      }
    });
    registrar(app, 'area_alterada', pessoa.id, { area: id, sigilosa: corpo.sigilosa, pessoas: corpo.pessoas?.length });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });

  r.del('/api/admin/areas/:id', ({ pessoa, params }) => {
    exec(app.db, 'delete from areas where id = ?', Number(params.id));
    registrar(app, 'area_removida', pessoa.id, { area: Number(params.id) });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });

  // Pessoas: o admin cadastra (ou elas entram sozinhas com email de domínio permitido).
  r.get('/api/admin/pessoas', () => ({
    pessoas: todos(app.db, 'select id, email, nome, papel, ativo from pessoas order by nome, email').map(p => ({
      ...p, ativo: !!p.ativo,
      areas: todos(app.db, 'select area_id as id, responsavel from area_pessoas where pessoa_id = ?', p.id).map(a => ({ id: a.id, responsavel: !!a.responsavel })),
      grupos: todos(app.db, 'select grupo_id from grupo_pessoas where pessoa_id = ?', p.id).map(g => g.grupo_id) })),
  }), { admin: true });

  r.post('/api/admin/pessoas', ({ pessoa, corpo }) => {
    const email = String(corpo.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erro(400, 'email', 'Email inválido.');
    if (!dominioPermitido(lerConfig(app.db), email)) throw erro(400, 'dominio', 'O domínio deste email não está na lista de domínios permitidos.');
    if (um(app.db, 'select 1 from pessoas where email = ?', email)) throw erro(409, 'email', 'Esta pessoa já está cadastrada.');
    const papel = corpo.papel === 'admin' ? 'admin' : 'usuario';
    const id = transacao(app.db, () => {
      const novo = Number(exec(app.db, 'insert into pessoas (email, nome, papel) values (?, ?, ?)', email, String(corpo.nome || email.split('@')[0]).trim().slice(0, 120), papel).lastInsertRowid);
      salvarAreasDaPessoa(app.db, novo, corpo.areas);
      return novo;
    });
    registrar(app, 'pessoa_criada', pessoa.id, { pessoa: id, papel });
    return { id };
  }, { admin: true });

  r.put('/api/admin/pessoas/:id', ({ pessoa, params, corpo }) => {
    const id = Number(params.id);
    const alvo = um(app.db, 'select id, papel, ativo from pessoas where id = ?', id);
    if (!alvo) throw erro(404, 'pessoa', 'Pessoa não encontrada.');
    const papel = corpo.papel === undefined ? alvo.papel : corpo.papel === 'admin' ? 'admin' : 'usuario';
    const ativo = corpo.ativo === undefined ? alvo.ativo : Number(!!corpo.ativo);
    const admins = um(app.db, "select count(*) as n from pessoas where papel = 'admin' and ativo = 1 and id != ?", id).n;
    if (alvo.papel === 'admin' && (papel !== 'admin' || !ativo) && !admins) throw erro(409, 'ultimo_admin', 'A instalação precisa de pelo menos um admin ativo.');
    transacao(app.db, () => {
      exec(app.db, 'update pessoas set nome = coalesce(?, nome), papel = ?, ativo = ? where id = ?', corpo.nome ? String(corpo.nome).trim().slice(0, 120) : null, papel, ativo, id);
      if (Array.isArray(corpo.areas)) salvarAreasDaPessoa(app.db, id, corpo.areas);
      if (!ativo) exec(app.db, 'delete from sessoes where pessoa_id = ?', id);
    });
    registrar(app, 'pessoa_alterada', pessoa.id, { pessoa: id, papel, ativo: !!ativo, areas: corpo.areas?.length });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });

  // Grupos: nome e pessoas, usados só para liberar perfis de modelo.
  r.get('/api/admin/grupos', () => ({
    grupos: todos(app.db, 'select id, nome from grupos order by nome').map(g => ({
      ...g, pessoas: todos(app.db, 'select pessoa_id from grupo_pessoas where grupo_id = ?', g.id).map(x => x.pessoa_id) })),
  }), { admin: true });

  r.post('/api/admin/grupos', ({ pessoa, corpo }) => {
    const nome = String(corpo.nome || '').trim();
    if (!nome) throw erro(400, 'nome', 'Dê um nome ao grupo.');
    if (um(app.db, 'select 1 from grupos where nome = ?', nome)) throw erro(409, 'nome', 'Já existe um grupo com esse nome.');
    const id = Number(exec(app.db, 'insert into grupos (nome) values (?)', nome).lastInsertRowid);
    registrar(app, 'grupo_criado', pessoa.id, { grupo: id, nome });
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
    registrar(app, 'grupo_alterado', pessoa.id, { grupo: id, pessoas: corpo.pessoas?.length });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });

  r.del('/api/admin/grupos/:id', ({ pessoa, params }) => {
    exec(app.db, 'delete from grupos where id = ?', Number(params.id));
    registrar(app, 'grupo_removido', pessoa.id, { grupo: Number(params.id) });
    app.aoMudarModelos?.();
    return { ok: true };
  }, { admin: true });
}
