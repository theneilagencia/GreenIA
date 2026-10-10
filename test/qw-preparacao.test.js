import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/servidor.js';
import { exec, um, json } from '../src/db.js';
import { salvarConfig } from '../src/config.js';
import { cliente } from '../scripts/cliente.js';
import { descobrir } from '../src/integracoes/descoberta.js';
import { criarConector, definirCapabilities, lerConector } from '../src/integracoes/conectores.js';
import { configurarCredencial, testarConector, publicar } from '../src/integracoes/ciclo.js';
import { decidir, lerAprovacao } from '../src/integracoes/aprovacoes.js';
import { criarPlano, executarPlano } from '../src/integracoes/plano.js';
import { limparOperacao } from '../src/quickwin-operacao.js';
import { limparControles, impedimentoControle } from '../src/integracoes/controle-qw.js';
import { apiFalsa, OPENAPI_FALSA } from './integracoes-fake.js';
let api;
before(async () => { api = await apiFalsa(); });
after(async () => { await api.fechar(); });
const ADM = { id: 1, admin: true, email: 'admin@empresa-exemplo.com.br' };
function novo() {
  const app = criarApp({ log: () => {}, adminEmail: ADM.email });
  salvarConfig(app.db, { dominios: ['empresa-exemplo.com.br'], integracoes: { ativa: true, pessoas: [], rede_privada_autorizada: true } });
  exec(app.db, "insert into pessoas(id,email,nome,papel) values(2,'revisor@empresa-exemplo.com.br','Revisor','admin')");
  return app;
}
async function ativo(app) {
  const d = descobrir(OPENAPI_FALSA(api.base));
  const c = criarConector(app, ADM, { nome: 'CRM Fictício', sistema: 'CRM Fictício', base_url: d.base_url, operacoes: d.operacoes, auth_type: 'api_key', config: { rede_privada: true, cabecalho_auth: 'X-API-Key' } });
  definirCapabilities(app, ADM, c.id, [{ operation_id: 'listarClientes', efeitos: { personal_data: false } }, { operation_id: 'criarFatura' }]);
  configurarCredencial(app, ADM, c.id, api.chave);
  const t = await testarConector(app, ADM, c.id); assert.ok(t.passou);
  decidir(app, ADM, t.aprovacao.id, { aprovar: true }); publicar(app, ADM, c.id);
  return lerConector(app, c.id);
}
const need = modo => ({ id: 'n1', sistema: 'CRM Fictício', acao: modo === 'read' ? 'Consultar clientes' : 'Criar fatura', categoria: modo === 'read' ? 'read_data' : 'create_record', modo });
const controle = extra => ({ modo: 'aprovar', max_acoes: 10, max_registros: 10, aprovador_id: null, ...extra });

test('controles persistem na operação; valores inválidos ficam restritivos; nenhuma autorização nasce do texto', () => {
  assert.equal(limparOperacao({ integracoes: [need('read')], controles: controle({ max_registros: 3 }) }).controles.max_registros, 3);
  assert.equal(limparControles({ modo: 'executar_livre', max_acoes: 1000 }).modo, 'preparar');
  assert.equal(limparControles({ max_acoes: 1000 }).max_acoes, 1);
  assert.equal(limparControles({ aprovador_id: 'inválido' }).aprovador_id, -1);
  assert.match(impedimentoControle(controle({ modo: 'consultar' }), { modo: 'write' }, {}), /não alterar/);
  assert.match(impedimentoControle(controle(), { modo: 'write', efeitos: { bulk: true } }, {}), /não permite verificar/);
  assert.match(impedimentoControle(controle({ max_registros: 1 }), { modo: 'write' }, { itens: [{}, {}] }), /limite/);
});

test('preparar, consultar, limites de ações e itens bloqueiam no servidor antes de efeitos externos', async () => {
  const app = novo(); await ativo(app);
  try {
    let antes = api.estado.chamadas.length;
    let p = criarPlano(app, ADM, { necessidades: [need('read')], controles: controle({ modo: 'preparar' }) });
    let r = await executarPlano(app, ADM, p.id); assert.equal(r.passos[0].status, 'BLOCKED'); assert.equal(api.estado.chamadas.length, antes);
    p = criarPlano(app, ADM, { necessidades: [need('write')], controles: controle({ modo: 'consultar' }) });
    r = await executarPlano(app, ADM, p.id); assert.equal(r.passos[0].status, 'BLOCKED'); assert.equal(api.estado.chamadas.length, antes);
    p = criarPlano(app, ADM, { necessidades: [need('read'), { ...need('read'), id: 'n2' }], controles: controle({ max_acoes: 1 }) });
    r = await executarPlano(app, ADM, p.id); assert.ok(r.passos.every(p => p.status === 'BLOCKED')); assert.equal(api.estado.chamadas.length, antes);
    p = criarPlano(app, ADM, { necessidades: [need('read')], controles: controle({ max_registros: 1 }) });
    r = await executarPlano(app, ADM, p.id); assert.equal(r.passos[0].status, 'BLOCKED');
    assert.deepEqual(json(um(app.db, 'select estado from integ_planos where id=?', p.id).estado).saidas, {}, 'consulta maior que o limite não vira material da IA');
  } finally { app.db.close(); }
});

test('aprovador definido é obrigatório, entrada aprovada não duplica a escrita e autorização expira', async () => {
  const app = novo(); await ativo(app);
  try {
    const p = criarPlano(app, ADM, { necessidades: [need('write')], controles: controle({ aprovador_id: 2 }) });
    const entrada = { cliente_id: 2, valor: 25 };
    const ctx = { dados: { n1: entrada } }; let r = await executarPlano(app, ADM, p.id, ctx);
    assert.equal(r.passos[0].status, 'APPROVAL_REQUIRED'); const aid = r.passos[0].aprovacao;
    assert.throws(() => decidir(app, ADM, aid, { aprovar: true }), /pessoa definida/);
    decidir(app, { id: 2, admin: true }, aid, { aprovar: true });
    const antes = api.estado.faturas.size;
    r = await executarPlano(app, ADM, p.id); assert.equal(r.passos[0].status, 'SUCCESS');
    await executarPlano(app, ADM, p.id); assert.equal(api.estado.faturas.size, antes + 1);
    const rev = criarPlano(app, ADM, { necessidades: [need('write')], controles: controle() });
    r = await executarPlano(app, ADM, rev.id, ctx); const rid = r.passos[0].aprovacao;
    decidir(app, { id: 2, admin: true }, rid, { aprovar: true });
    exec(app.db, "update pessoas set papel='usuario' where id=2");
    r = await executarPlano(app, ADM, rev.id);
    assert.equal(r.passos[0].status, 'APPROVAL_REQUIRED');
    assert.equal(lerAprovacao(app, rid).status, 'invalidada', 'revogar a permissão invalida autorização ainda não executada');
    const p2 = criarPlano(app, ADM, { necessidades: [need('write')], controles: controle() });
    r = await executarPlano(app, ADM, p2.id, ctx); const exp = r.passos[0].aprovacao;
    const tempo = app.agora(); app.agora = () => new Date(tempo.getTime() + 25 * 3600000);
    assert.throws(() => decidir(app, ADM, exp, { aprovar: true }), /prazo/); assert.equal(lerAprovacao(app, exp).status, 'invalidada');
  } finally { app.db.close(); }
});

test('catálogo não expõe credenciais; pedido é persistente, idempotente e só pode ser concluído com conexão pronta', async () => {
  const app = novo(); await new Promise(r => app.servidor.listen(0, '127.0.0.1', r));
  const c = await cliente(app, `http://127.0.0.1:${app.servidor.address().port}`).entrar(ADM.email);
  try {
    const res = await c.post('/api/quick-wins', { toda_empresa: true, assistente: { descricao: 'Consultar clientes no CRM Fictício', operacao: { integracoes: [need('read')], controles: controle({ modo: 'consultar' }) } } });
    assert.equal(res.status, 200); const id = res.dados.id;
    const a = await c.post(`/api/quick-wins/${id}/pedir-conexao`), b = await c.post(`/api/quick-wins/${id}/pedir-conexao`);
    assert.equal(a.status, 200); assert.equal(a.dados.id, b.dados.id);
    assert.equal((await c.post(`/api/quick-wins/pedidos-conexao/${a.dados.id}/concluir`)).status, 409);
    await ativo(app);
    const plano = await c.post('/api/integracoes/planos', { quick_win_id: id, controles: controle({ modo: 'aprovar' }), necessidades: [need('write')] });
    assert.equal(plano.status, 200);
    assert.equal(json(um(app.db, 'select estado from integ_planos where id=?', plano.dados.id).estado).controles.modo, 'consultar');
    assert.equal(plano.dados.passos[0].modo, 'read', 'cliente não troca ações do trabalho por escrita');
    assert.equal((await c.get('/api/integracoes/aprovacoes')).status, 200);
    const catalogo = await c.get('/api/quick-wins/assistente/preparacao'); assert.equal(catalogo.status, 200); assert.ok(catalogo.dados.acoes.length);
    assert.doesNotMatch(JSON.stringify(catalogo.dados), /chave-secreta|secret_ref|base_url|authorization/i);
    assert.equal((await c.post(`/api/quick-wins/pedidos-conexao/${a.dados.id}/concluir`)).status, 200);
    assert.equal((await c.get(`/api/quick-wins/${id}/preparacao`)).dados.pedidos[0].status, 'pronto');
    salvarConfig(app.db, { integracoes: { ativa: false } });
    assert.equal((await c.post(`/api/quick-wins/${id}/pedir-conexao`)).status, 404);
  } finally { app.servidor.closeAllConnections(); await new Promise(r => app.servidor.close(r)); app.db.close(); }
});
