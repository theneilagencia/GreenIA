// Preparação em linguagem de trabalho, sem acesso a credenciais ou execução de ações.
import { exec, todos, um, json } from './db.js';
import { erro } from './http.js';
import { registrar } from './eventos.js';
import { normalizar } from './quickwin-construtor.js';
import { integracoesLigadas } from './integracoes/rotas.js';
import { resolverNecessidades } from './integracoes/plano.js';
import { pessoasDoTrabalho } from './integracoes/controle-qw.js';
import { novoId } from './integracoes/conectores.js';

const gerencia = p => Array.isArray(p.permissoes) ? p.permissoes.includes('integrations.manage') : p.admin;
const operacao = q => normalizar(json(q.especificacao, {}))?.operacao;
export function pedidosConexao(app) {
  return todos(app.db, `select p.*, q.nome as trabalho from qw_pedidos_conexao p join quick_wins q on q.id = p.quick_win_id
    where p.tenant_id = ? and q.excluido_em is null order by p.criado_em desc limit 100`, app.tenantId).map(p => ({ ...p, necessidades: json(p.necessidades, []) }));
}
export function rotasPreparacao(app, r, { carregar, podeMontar }) {
  const exigirCriador = p => { if (!podeMontar(p)) throw erro(403, 'sem_permissao', 'Você não pode preparar Quick Wins.'); };
  const gate = p => { if (!integracoesLigadas(app, p)) throw erro(404, 'nao_encontrado', 'Conexões indisponíveis para este perfil.'); };
  r.get('/api/quick-wins/assistente/preparacao', ({ pessoa }) => {
    exigirCriador(pessoa);
    const ligada = integracoesLigadas(app, pessoa);
    const acoes = ligada ? todos(app.db, `select c.id,c.nome,c.categoria,c.modo,k.sistema from capabilities c join connectors k on k.id=c.connector_id
      where c.tenant_id=? and k.tenant_id=? and c.status='ativa' and k.status='ACTIVE' and k.aprovado_versao=k.versao order by k.sistema,c.nome`, app.tenantId, app.tenantId).map(c => {
        const n = resolverNecessidades(app, [{ id: 'n', acao: c.nome, categoria: c.categoria, sistema: c.sistema, modo: c.modo, capability_id: c.id }], { pessoa })[0];
        return { ...c, estado: n.estado, motivo: n.motivo };
      }).filter(c => c.estado !== 'nao_permitido') : [];
    return { pessoas: pessoasDoTrabalho(app), integracoes: ligada, acoes };
  });
  r.get('/api/quick-wins/:id/preparacao', ({ pessoa, params }) => {
    const q = carregar(pessoa, params.id, true);
    const ligada = integracoesLigadas(app, pessoa);
    return { necessidades: ligada ? resolverNecessidades(app, operacao(q)?.integracoes || [], { pessoa, quickWinId: q.id }) : [],
      pedidos: ligada ? pedidosConexao(app).filter(p => p.quick_win_id === q.id).map(({ id, status, criado_em }) => ({ id, status, criado_em })) : [] };
  });
  r.post('/api/quick-wins/:id/pedir-conexao', ({ pessoa, params }) => {
    gate(pessoa); const q = carregar(pessoa, params.id, true);
    const necessidades = resolverNecessidades(app, operacao(q)?.integracoes || [], { pessoa, quickWinId: q.id }).filter(n => n.estado === 'configurar');
    if (!necessidades.length) throw erro(409, 'sem_pendencia', 'Nenhuma conexão precisa ser preparada para este trabalho.');
    const hash = JSON.stringify(necessidades.map(n => ({ acao: n.acao, sistema: n.sistema, categoria: n.categoria, modo: n.modo, ...(n.capability_id ? { capability_id: n.capability_id } : {}) })));
    const antes = um(app.db, "select id from qw_pedidos_conexao where tenant_id=? and quick_win_id=? and necessidades=? and status='pendente'", app.tenantId, q.id, hash);
    if (antes) return { id: antes.id, status: 'pendente' };
    const id = novoId('ped');
    exec(app.db, "insert into qw_pedidos_conexao (id,tenant_id,quick_win_id,pessoa_id,necessidades,status,criado_em) values (?,?,?,?,?,'pendente',?)", id, app.tenantId, q.id, pessoa.id, hash, app.agora().toISOString());
    registrar(app, 'quickwin.connection_requested', pessoa.id, { pedido: id, quick_win: q.id, acoes: necessidades.length });
    return { id, status: 'pendente' };
  });
  r.get('/api/quick-wins/pedidos-conexao', ({ pessoa }) => { gate(pessoa); if (!gerencia(pessoa)) throw erro(403, 'sem_permissao', 'Somente quem prepara conexões pode ver estes pedidos.'); return { pedidos: pedidosConexao(app) }; });
  r.post('/api/quick-wins/pedidos-conexao/:id/concluir', ({ pessoa, params }) => {
    gate(pessoa); if (!gerencia(pessoa)) throw erro(403, 'sem_permissao', 'Você não pode concluir pedidos de conexão.');
    const p = pedidosConexao(app).find(p => p.id === params.id);
    if (!p) throw erro(404, 'pedido', 'Pedido não encontrado.');
    const ns = resolverNecessidades(app, p.necessidades, { pessoa, quickWinId: p.quick_win_id });
    if (!ns.length || ns.some(n => !['disponivel', 'requer_aprovacao'].includes(n.estado))) throw erro(409, 'conexao_pendente', 'A conexão ainda não está ativa e autorizada para todas as ações pedidas.');
    exec(app.db, "update qw_pedidos_conexao set status='pronto' where id=? and tenant_id=?", p.id, app.tenantId);
    registrar(app, 'quickwin.connection_ready', pessoa.id, { pedido: p.id, quick_win: p.quick_win_id });
    return { ok: true };
  });
}
