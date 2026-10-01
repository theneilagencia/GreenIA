// Encerramento de ambiente: cancelamento bloqueia o uso (inclusive da equipe de operação), a exclusão definitiva é
// automática 30 dias corridos depois (dry-run sem aplicar), revalidada, idempotente e auditada; hold impede; o Cliente
// pode pedir a exclusão antecipada ou uma cópia dos dados com código enviado ao email de um admin autorizado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { request } from 'node:http';
import { subirPlataforma } from './ajuda-plataforma.js';
import { um, todos } from '../src/db.js';
import { rodadaExclusoes, rodadaDevolucoes, PRAZO_EXCLUSAO_DIAS } from '../src/plataforma/encerramento.js';

const DIA = 864e5;
let S, planos;
let deslocamento = 0;   // relógio controlado
const avancar = ms => { deslocamento += ms; };
const agora = () => Date.now() + deslocamento;

before(async () => {
  S = await subirPlataforma({ agora: () => new Date(agora()) });
  const ops = await consoleNovo();
  planos = (await ops.get('/api/plataforma/planos')).dados.planos;
});
after(() => S.fechar());

// Console: reaproveita a sessão enquanto vale (o limite de códigos por email também vale aqui); depois de o relógio
// avançar além das 12 horas da sessão, entra de novo.
let opsAtual = null;
async function consoleNovo() {
  if (opsAtual && (await opsAtual.get('/api/plataforma/planos')).status === 200) return opsAtual;
  opsAtual = await S.navegador().entrarConsole('ops@theneil.com.br');
  return opsAtual;
}
let seq = 0;
async function empresaCancelada(ops, { admin = true } = {}) {
  const slug = `enc-${++seq}-${Math.random().toString(36).slice(2, 6)}`;
  const c = (await ops.post('/api/plataforma/empresas', { name: `Encerrada ${seq}`, slug, plan_id: planos[0].id, status: 'ativa', ...(admin ? { admin_email: `adm@${slug}.com` } : {}) })).dados;
  return { c, slug, admin: `adm@${slug}.com` };
}
const linha = id => um(S.P.db, 'select * from company_deletion where company_id = ?', id);
const acoes = id => todos(S.P.db, 'select action from audit_log where company_id = ? order by id', id).map(x => x.action);
// POST sem corpo que devolve bytes (o navegador de teste lê a resposta como texto).
const postBinario = caminho => new Promise((ok, falha) => {
  const u = new URL(S.base + caminho);
  const r = request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { host: 'plataforma.teste', 'content-length': 0 } },
    res => { const b = []; res.on('data', x => b.push(x)); res.on('end', () => ok({ status: res.statusCode, dados: Buffer.concat(b) })); });
  r.on('error', falha); r.end();
});
const ultimoCodigo = email => /(\d{6})/.exec(S.P.email.enviados.filter(m => m.para === email).at(-1).assunto)[1];

test('cancelar registra cancelled_at e delete_after = +30 dias corridos e bloqueia o uso na hora, inclusive da equipe de operação', async () => {
  const ops = await consoleNovo();
  const { c, slug, admin } = await empresaCancelada(ops);
  const pessoa = S.navegador(); await pessoa.get(`/${slug}`); assert.equal((await pessoa.entrarEmpresa(admin)).status, 200);
  const op = S.navegador(); op.cookies.set('gia_p', ops.cookies.get('gia_p')); op.csrf = ops.csrf;
  assert.equal((await op.post(`/api/plataforma/empresas/${c.id}/entrar`, { tipo: 'suporte', justificativa: 'Verificar configuração antes do encerramento' })).status, 200);
  assert.equal((await op.get('/api/conversas')).status, 200, 'antes do cancelamento o operador usa');
  const t0 = agora();
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' })).status, 200);
  const l = linha(c.id);
  assert.equal(l.status, 'pendente');
  assert.ok(Math.abs(Date.parse(l.cancelled_at) - t0) < 2000);
  assert.equal(Date.parse(l.delete_after) - Date.parse(l.cancelled_at), PRAZO_EXCLUSAO_DIAS * DIA);
  assert.ok(acoes(c.id).includes('company.cancelled') && acoes(c.id).includes('company.deletion_scheduled'));
  // Uso bloqueado: pessoa e operador perdem a sessão; ninguém entra de novo.
  assert.equal((await pessoa.get('/api/conversas')).status, 401);
  assert.equal((await op.get('/api/conversas')).status, 401);
  const nova = S.navegador(); await nova.get(`/${slug}`);
  assert.equal((await nova.post('/api/login/codigo', { email: admin })).status, 403);
  const r = await op.post(`/api/plataforma/empresas/${c.id}/entrar`, { tipo: 'suporte', justificativa: 'Tentar usar o ambiente cancelado' });
  assert.equal(r.status, 409, 'o operador não entra num ambiente cancelado');
  // O fluxo específico de recuperação continua: exportação com finalidade.
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/exportar`, { tipo: 'solicitacao_cliente', justificativa: 'Cópia pedida pelo cliente no encerramento' })).status, 200);
  // Reabrir desfaz a agenda.
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'em_implantacao' });
  assert.equal(linha(c.id).status, 'revertida');
  assert.ok(acoes(c.id).includes('company.deletion_cancelled'));
});

test('antes de 30 dias não exclui; no prazo exclui sozinha (dry-run só registra); revalida e é idempotente', async () => {
  let ops = await consoleNovo();
  const { c, slug } = await empresaCancelada(ops);
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  const banco = um(S.P.db, 'select banco from companies where id = ?', c.id).banco;
  avancar(PRAZO_EXCLUSAO_DIAS * DIA - 60e3);   // falta 1 minuto
  assert.deepEqual(rodadaExclusoes(S.P, { aplicar: true }).excluidas, []);
  ops = await consoleNovo();
  const cedo = await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: slug });
  assert.equal(cedo.status, 409);
  assert.equal(cedo.dados.erro, 'prazo');
  avancar(2 * 60e3);   // passou do prazo
  const logs = [];
  const seco = rodadaExclusoes(S.P, { aplicar: false, log: m => logs.push(m) });
  assert.ok(seco.plano.some(i => i.companyId === c.id && !i.impede));
  assert.deepEqual(seco.excluidas, []);
  assert.ok(um(S.P.db, 'select 1 from companies where id = ?', c.id), 'dry-run não exclui');
  assert.match(logs.join('\n'), /exclusões \(dry-run\)/);
  assert.doesNotMatch(logs.join('\n'), new RegExp(slug), 'o log não traz identificação da empresa');
  const r = rodadaExclusoes(S.P, { aplicar: true });
  assert.ok(r.excluidas.includes(c.id));
  assert.ok(!um(S.P.db, 'select 1 from companies where id = ?', c.id));
  assert.equal(linha(c.id).status, 'excluida');
  assert.equal(linha(c.id).deleted_via, 'rotina');
  const del = um(S.P.db, "select after from audit_log where company_id = ? and action = 'company.deleted'", c.id);
  assert.equal(JSON.parse(del.after).via, 'rotina');
  assert.ok(!(await import('node:fs')).existsSync(banco) || banco === ':memory:');
  // Idempotente: nada mais a fazer.
  assert.ok(!rodadaExclusoes(S.P, { aplicar: true }).plano.some(i => i.companyId === c.id));
});

test('hold impede a exclusão automática e a do console; liberado, a exclusão segue', async () => {
  let ops = await consoleNovo();
  const { c, slug } = await empresaCancelada(ops);
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/exclusao/hold`, { tipo: 'legal', motivo: 'curto' })).status, 400);
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/exclusao/hold`, { tipo: 'legal', motivo: 'Ofício judicial 123/2026 pede preservação' })).status, 200);
  avancar(PRAZO_EXCLUSAO_DIAS * DIA + 60e3);
  const r = rodadaExclusoes(S.P, { aplicar: true });
  assert.equal(r.plano.find(i => i.companyId === c.id).impede, 'hold');
  assert.ok(um(S.P.db, 'select 1 from companies where id = ?', c.id));
  ops = await consoleNovo();
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: slug })).dados.erro, 'hold');
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/exclusao/liberar`, {})).status, 200);
  assert.ok(acoes(c.id).includes('company.deletion_hold') && acoes(c.id).includes('company.deletion_hold_released'));
  assert.ok(rodadaExclusoes(S.P, { aplicar: true }).excluidas.includes(c.id));
});

test('exclusão antecipada pelo Cliente: código no email do admin, identificador e ciência de irreversível', async () => {
  const ops = await consoleNovo();
  const { c, slug, admin } = await empresaCancelada(ops);
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  const v = S.navegador(); await v.get(`/${slug}`);
  assert.equal((await v.get('/api/encerramento')).dados.encerrado, true);
  assert.equal((await v.post('/api/encerramento/codigo', { email: admin })).status, 200);
  const codigo = ultimoCodigo(admin);
  assert.doesNotMatch(S.P.email.enviados.filter(m => m.para === admin).at(-1).assunto, /GreenIA/, 'marca branca no email');
  // Sem a confirmação explícita, nada acontece (o código já foi usado: pede outro).
  assert.equal((await v.post('/api/encerramento/excluir', { email: admin, codigo, confirmacao: slug, irreversivel: false })).status, 400);
  assert.ok(um(S.P.db, 'select 1 from companies where id = ?', c.id));
  await v.post('/api/encerramento/codigo', { email: admin });
  const r = await v.post('/api/encerramento/excluir', { email: admin, codigo: ultimoCodigo(admin), confirmacao: slug, irreversivel: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.ok(!um(S.P.db, 'select 1 from companies where id = ?', c.id));
  assert.equal(linha(c.id).deleted_via, 'cliente');
  assert.equal(linha(c.id).antecipada_por, admin);
  assert.ok(acoes(c.id).includes('company.early_deletion_requested') && acoes(c.id).includes('company.deleted'));
});

test('exclusão antecipada sem autorização falha: quem não é admin, código errado, pedido informal e hold', async () => {
  const ops = await consoleNovo();
  const { c, slug, admin } = await empresaCancelada(ops);
  const m = await ops.post(`/api/plataforma/empresas/${c.id}/usuarios`, { email: `membro@${slug}.com`, name: 'Membro', role_id: 'role_member', convidar: false });
  assert.equal(m.status, 200, JSON.stringify(m.dados));
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  const v = S.navegador(); await v.get(`/${slug}`);
  assert.equal((await v.post('/api/encerramento/codigo', { email: `membro@${slug}.com` })).status, 403, 'membro comum não pede');
  assert.equal((await v.post('/api/encerramento/codigo', { email: 'ops@theneil.com.br' })).status, 403, 'operador sem vínculo não pede');
  assert.equal((await v.post('/api/encerramento/excluir', { email: admin, codigo: '000000', confirmacao: slug, irreversivel: true })).status, 401, 'sem código válido');
  // Pedido informal ao suporte: o console não antecipa a exclusão.
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: slug })).dados.erro, 'prazo');
  // Hold: bloqueia e registra o motivo.
  await ops.post(`/api/plataforma/empresas/${c.id}/exclusao/hold`, { tipo: 'incidente', motivo: 'Investigação do incidente INC-77 em andamento' });
  await v.post('/api/encerramento/codigo', { email: admin });
  const r = await v.post('/api/encerramento/excluir', { email: admin, codigo: ultimoCodigo(admin), confirmacao: slug, irreversivel: true });
  assert.equal(r.status, 409);
  assert.equal(r.dados.erro, 'hold');
  assert.ok(um(S.P.db, 'select 1 from companies where id = ?', c.id));
  const bloqueio = um(S.P.db, "select after from audit_log where company_id = ? and action = 'company.early_deletion_blocked'", c.id);
  assert.equal(JSON.parse(bloqueio.after).motivo, 'hold');
  // Ambiente ativo não aceita pedidos de encerramento.
  const ativa = (await ops.post('/api/plataforma/empresas', { name: 'Ativa', slug: `ativa-${seq}`, plan_id: planos[0].id, status: 'ativa', admin_email: `a@ativa${seq}.com` })).dados;
  const va = S.navegador(); await va.get(`/${ativa.slug}`);
  assert.equal((await va.post('/api/encerramento/codigo', { email: `a@ativa${seq}.com` })).status, 409);
});

test('devolução: pedido verificado, cópia SQLite gerada pela operação, link de uso único até 7 dias, entrega registrada', async () => {
  const ops = await consoleNovo();
  const { c, slug, admin } = await empresaCancelada(ops);
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  const v = S.navegador(); await v.get(`/${slug}`);
  await v.post('/api/encerramento/codigo', { email: admin });
  const p = await v.post('/api/encerramento/devolucao', { email: admin, codigo: ultimoCodigo(admin) });
  assert.equal(p.status, 200);
  const d0 = um(S.P.db, 'select * from data_returns where id = ?', p.dados.pedido);
  assert.equal(d0.status, 'solicitada');
  assert.equal(d0.solicitante_email, admin);
  const g = await ops.post(`/api/plataforma/devolucoes/${d0.id}/gerar`, {});
  assert.equal(g.status, 200, JSON.stringify(g.dados));
  assert.ok(Date.parse(g.dados.linkExpira) - agora() <= 7 * DIA + 2000);
  await new Promise(r => setTimeout(r, 20));
  const email = S.P.email.enviados.filter(m => m.para === admin).at(-1);
  assert.doesNotMatch(`${email.assunto} ${email.texto}`, /GreenIA/, 'marca branca');
  const token = /\/devolucao\/([A-Za-z0-9_-]+)/.exec(email.texto)[1];
  const d1 = um(S.P.db, 'select * from data_returns where id = ?', d0.id);
  assert.equal(d1.status, 'gerada');
  assert.notEqual(d1.token_hash, token, 'só o hash do token fica guardado');
  const x = um(S.P.db, 'select * from operator_exports where id = ?', d1.export_id);
  assert.deepEqual([x.tipo, x.devolucao_id, x.sha256], ['solicitacao_cliente', d0.id, d1.sha256]);
  // GET mostra a página (não consome); POST entrega uma vez.
  const plat = S.navegador();
  assert.equal((await plat.get(`/devolucao/${token}`)).status, 200);
  assert.equal(um(S.P.db, 'select status from data_returns where id = ?', d0.id).status, 'gerada');
  const baixa = await postBinario(`/devolucao/${token}`);
  assert.equal(baixa.status, 200);
  assert.equal(gunzipSync(baixa.dados).subarray(0, 15).toString(), 'SQLite format 3');
  const d2 = um(S.P.db, 'select * from data_returns where id = ?', d0.id);
  assert.equal(d2.status, 'entregue');
  const x2 = um(S.P.db, 'select * from operator_exports where id = ?', d1.export_id);
  assert.equal(x2.eliminacao, 'entrega_unica');
  assert.equal(x2.baixado_por, admin);
  assert.ok(acoes(c.id).includes('company.data_return_requested') && acoes(c.id).includes('company.data_return_generated') && acoes(c.id).includes('company.data_return_delivered'));
  // Segundo uso: indisponível.
  assert.equal((await postBinario(`/devolucao/${token}`)).status, 410);
});

test('link de devolução vence em 7 dias: a cópia sai do servidor sem download', async () => {
  const ops = await consoleNovo();
  const { c, slug, admin } = await empresaCancelada(ops);
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  const v = S.navegador(); await v.get(`/${slug}`);
  await v.post('/api/encerramento/codigo', { email: admin });
  const p = await v.post('/api/encerramento/devolucao', { email: admin, codigo: ultimoCodigo(admin) });
  await ops.post(`/api/plataforma/devolucoes/${p.dados.pedido}/gerar`, {});
  const d = um(S.P.db, 'select * from data_returns where id = ?', p.dados.pedido);
  avancar(7 * DIA + 60e3);
  rodadaDevolucoes(S.P);
  assert.equal(um(S.P.db, 'select status from data_returns where id = ?', d.id).status, 'expirada');
  const x = um(S.P.db, 'select * from operator_exports where id = ?', d.export_id);
  assert.equal(x.eliminacao, 'link_vencido');
  assert.equal(x.downloads, 0);
});
