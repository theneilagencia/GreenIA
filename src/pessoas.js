// Pessoas, áreas e grupos de acesso a modelos.
import { erro } from './http.js';
import { exec, todos, transacao, um } from './db.js';
import { registrar } from './eventos.js';

export function rotasPessoas(app, r) {
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
