// Acesso da equipe GreenIA ao ambiente das empresas: motivo obrigatório, prazo, registro estruturado, visibilidade
// só para a própria empresa, encerramento (sair, expirar, encerrar) com duração, exportação com registro próprio,
// conversas fora do alcance das telas e nenhuma porta lateral pelo login da empresa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { todos, um } from '../src/db.js';
import { DURACAO_ACESSO_MS } from '../src/plataforma/acessos.js';

let S, ops, A, B, ana, carla;
let deslocamento = 0;   // relógio controlado: só avança quando o teste manda
const MOTIVO = { tipo: 'suporte', justificativa: 'Conferir a configuração de modelos a pedido do admin' };
const esperar = () => new Promise(r => setTimeout(r, 20));

before(async () => {
  S = await subirPlataforma({ agora: () => new Date(Date.now() + deslocamento) });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  A = (await ops.post('/api/plataforma/empresas', { name: 'Acme', slug: 'acme', plan_id: planos[0].id, admin_email: 'ana@acme.com', status: 'ativa' })).dados;
  B = (await ops.post('/api/plataforma/empresas', { name: 'Beta', slug: 'beta', plan_id: planos[0].id, admin_email: 'carla@beta.com', status: 'ativa' })).dados;
  ana = S.navegador(); await ana.get('/acme'); await ana.entrarEmpresa('ana@acme.com');
  carla = S.navegador(); await carla.get('/beta'); await carla.entrarEmpresa('carla@beta.com');
});
after(() => S.fechar());

const acessos = (companyId = A.id) => todos(S.P.db, 'select * from operator_access where company_id = ? order by inicio', companyId);
async function operador(motivo = MOTIVO, empresa = A) {
  // Navegador novo com a sessão do console (sem pedir outro código: o limite de códigos vale também aqui).
  const o = S.navegador();
  o.cookies.set('gia_p', ops.cookies.get('gia_p'));
  o.csrf = ops.csrf;
  const r = await o.post(`/api/plataforma/empresas/${empresa.id}/entrar`, motivo);
  if (r.status === 200) o.csrf = (await o.get('/api/eu')).dados.csrf;   // a sessão da empresa tem CSRF próprio
  return { o, r };
}

test('acesso sem tipo, com tipo inválido ou sem justificativa é bloqueado e não abre sessão nem registro', async () => {
  const antes = acessos().length;
  for (const corpo of [{}, { justificativa: MOTIVO.justificativa }, { tipo: 'curiosidade', justificativa: MOTIVO.justificativa }, { tipo: 'suporte' }, { tipo: 'suporte', justificativa: 'ver' }, { tipo: 'suporte', justificativa: '          ' }]) {
    const { o, r } = await operador(corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(o.cookies.has('gia_s'), false, 'sem sessão na empresa');
  }
  assert.equal(acessos().length, antes);
});

test('acesso válido: operador, empresa, tipo, justificativa, início, prazo de 60 minutos e status aberto', async () => {
  const { o, r } = await operador({ tipo: 'incidente', justificativa: '  Investigar   falha de envio relatada pelo cliente  ' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const a = acessos().at(-1);
  const ops_id = um(S.P.db, "select id from users where email = 'ops@theneil.com.br'").id;
  assert.equal(a.user_id, ops_id);
  assert.equal(a.operador_email, 'ops@theneil.com.br');
  assert.equal(a.company_id, A.id);
  assert.equal(a.tipo, 'incidente');
  assert.equal(a.justificativa, 'Investigar falha de envio relatada pelo cliente');
  assert.equal(a.status, 'aberto');
  assert.equal(Date.parse(a.expira) - Date.parse(a.inicio), DURACAO_ACESSO_MS);
  assert.equal(DURACAO_ACESSO_MS, 60 * 60e3);
  assert.equal(r.dados.acesso.id, a.id);
  // A sessão de operador vale só até o fim do acesso.
  const s = um(S.P.db, 'select expira from sessions where access_id = ?', a.id);
  assert.equal(s.expira, Date.parse(a.expira));
  const eu = (await o.get('/api/eu')).dados;
  assert.equal(eu.plataforma.adminPlataforma, true);
  assert.equal(eu.plataforma.acessoOperador.id, a.id);
  // Auditoria da plataforma com o motivo.
  const aud = um(S.P.db, "select after from audit_log where action = 'company.accessed' and entity_id = ?", a.id);
  assert.match(aud.after, /Investigar falha de envio/);
  await o.post('/api/sair');
});

test('o acesso aparece na hora para o admin da empresa; outra empresa não vê nem encerra', async () => {
  const { o } = await operador();
  const a = acessos().at(-1);
  const lista = (await ana.get('/api/empresa/acessos-greenia')).dados;
  const visto = lista.acessos.find(x => x.id === a.id);
  assert.ok(visto, 'visível para a Acme');
  assert.deepEqual([visto.operador, visto.tipo, visto.status, visto.justificativa], ['ops@theneil.com.br', 'suporte', 'aberto', MOTIVO.justificativa]);
  assert.ok(visto.inicio && visto.expira);
  assert.equal(visto.origin, undefined, 'sem IP nem navegador do operador');
  const beta = (await carla.get('/api/empresa/acessos-greenia')).dados;
  assert.ok(!beta.acessos.some(x => x.company_id === A.id || x.id === a.id), 'invisível para a Beta');
  assert.equal((await carla.post(`/api/empresa/acessos-greenia/${a.id}/encerrar`)).status, 404);
  assert.equal(um(S.P.db, 'select status from operator_access where id = ?', a.id).status, 'aberto');
  // Pessoa sem permissão de auditoria não consulta.
  await ana.post('/api/empresa/usuarios', { email: 'davi@acme.com', role_id: 'role_member' });
  const davi = S.navegador(); await davi.get('/acme'); await davi.entrarEmpresa('davi@acme.com');
  assert.equal((await davi.get('/api/empresa/acessos-greenia')).status, 403);
  await o.post('/api/sair');
});

test('sair encerra o acesso e registra fim e duração', async () => {
  const { o } = await operador();
  const a = acessos().at(-1);
  deslocamento += 5 * 60e3;
  assert.equal((await o.post('/api/sair')).status, 200);
  const f = um(S.P.db, 'select * from operator_access where id = ?', a.id);
  assert.equal(f.status, 'encerrado');
  assert.equal(f.motivo_fim, 'logout');
  assert.ok(f.fim);
  assert.ok(Math.abs(f.duracao_s - 300) <= 2, `duração ${f.duracao_s}`);
  assert.equal((await o.get('/api/eu')).status, 401);
  assert.ok(um(S.P.db, "select 1 from audit_log where action = 'company.access_ended' and entity_id = ?", a.id));
});

test('o acesso expira em 60 minutos: a sessão cai e o registro fecha no horário do vencimento', async () => {
  const { o } = await operador();
  const a = acessos().at(-1);
  assert.equal((await o.get('/api/eu')).status, 200);
  deslocamento += DURACAO_ACESSO_MS + 60e3;
  assert.equal((await o.get('/api/eu')).status, 401, 'sessão de operador vencida');
  const f = um(S.P.db, 'select * from operator_access where id = ?', a.id);
  assert.equal(f.status, 'expirado');
  assert.equal(f.motivo_fim, 'expiracao');
  assert.equal(f.fim, a.expira);
  assert.equal(f.duracao_s, DURACAO_ACESSO_MS / 1000);
  assert.equal(um(S.P.db, 'select count(*) as n from sessions where access_id = ?', a.id).n, 0);
});

test('acesso vencido sem nenhuma requisição não aparece como aberto na tela da empresa', async () => {
  await operador();
  const a = acessos().at(-1);
  deslocamento += DURACAO_ACESSO_MS + 1000;
  const visto = (await ana.get('/api/empresa/acessos-greenia')).dados.acessos.find(x => x.id === a.id);
  assert.equal(visto.status, 'expirado');
  assert.equal(visto.duracao_s, DURACAO_ACESSO_MS / 1000);
});

test('admin da empresa encerra o acesso: a sessão do operador cai na hora', async () => {
  const { o } = await operador();
  const a = acessos().at(-1);
  const r = await ana.post(`/api/empresa/acessos-greenia/${a.id}/encerrar`);
  assert.equal(r.status, 200);
  assert.equal(r.dados.status, 'encerrado');
  assert.equal((await o.get('/api/eu')).status, 401);
  const f = um(S.P.db, 'select * from operator_access where id = ?', a.id);
  assert.equal(f.motivo_fim, 'manual_empresa');
  assert.equal(f.encerrado_por, um(S.P.db, "select id from users where email = 'ana@acme.com'").id);
});

test('suspender a empresa encerra o acesso aberto (não fica aberto sem sessão)', async () => {
  await operador();
  const a = acessos().at(-1);
  await ops.post(`/api/plataforma/empresas/${A.id}/status`, { status: 'suspensa' });
  assert.equal(um(S.P.db, 'select status, motivo_fim from operator_access where id = ?', a.id).motivo_fim, 'empresa_suspensa');
  await ops.post(`/api/plataforma/empresas/${A.id}/status`, { status: 'ativa' });
  await ana.entrarEmpresa('ana@acme.com');
});

test('novo acesso do mesmo operador substitui o anterior, que fecha com duração', async () => {
  await operador();
  const primeiro = acessos().at(-1);
  const { o } = await operador({ tipo: 'outro', justificativa: 'Segundo acesso para revisar a marca da empresa' });
  assert.equal(um(S.P.db, 'select motivo_fim from operator_access where id = ?', primeiro.id).motivo_fim, 'substituido');
  assert.equal(todos(S.P.db, "select id from operator_access where status = 'aberto' and company_id = ?", A.id).length, 1);
  await o.post('/api/sair');
});

test('sem porta lateral: admin da plataforma sem vínculo não entra pela tela de login da empresa', async () => {
  const x = S.navegador(); await x.get('/acme');
  const antes = S.P.email.enviados.length;
  const r = await x.post('/api/login/codigo', { email: 'ops@theneil.com.br' });
  assert.equal(r.status, 403);
  assert.match(r.dados.mensagem, /console/);
  assert.equal(S.P.email.enviados.length, antes, 'nenhum código enviado');
});

test('admin da plataforma com vínculo na empresa entra como qualquer pessoa, sem poderes de operador', async () => {
  await ana.post('/api/empresa/usuarios', { email: 'ops@theneil.com.br', role_id: 'role_member' });
  const x = S.navegador(); await x.get('/acme');
  assert.equal((await x.entrarEmpresa('ops@theneil.com.br')).status, 200);
  const eu = (await x.get('/api/eu')).dados;
  assert.equal(eu.plataforma.adminPlataforma, false);
  assert.equal(eu.plataforma.acessoOperador, null);
  assert.ok(!eu.permissoes.includes('company.manage'));
  assert.equal((await x.get('/api/empresa/acessos-greenia')).status, 403);
  await x.post('/api/sair');
  const u = um(S.P.db, "select id from users where email = 'ops@theneil.com.br'");
  await ana.del(`/api/empresa/usuarios/${u.id}`);
});

test('sessão de operador de uma empresa não vale em outra', async () => {
  const { o } = await operador();
  await o.get('/beta');
  const eu = await o.get('/api/eu');
  assert.equal(eu.status, 401);
  assert.equal((await o.get('/api/empresa/acessos-greenia')).status, 401);
  await o.get('/acme');
  await o.post('/api/sair');
});

test('o operador continua sem ler conversas das pessoas, e a tela de acessos não traz conteúdo', async () => {
  await ana.post('/api/politica/ciencia', { versao: (await ana.get('/api/politica')).dados.versao });
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  assert.ok(conv?.id);
  await ana.req('PATCH', `/api/conversas/${conv.id}`, { titulo: 'Assunto reservado da Ana' });
  const { o } = await operador();
  assert.equal((await o.get(`/api/conversas/${conv.id}`)).status, 404);
  assert.ok(!(await o.get('/api/conversas')).dados.conversas.some(x => x.id === conv.id));
  assert.doesNotMatch(JSON.stringify((await o.get('/api/empresa/acessos-greenia')).dados), /Assunto reservado/);
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).status, 200, 'a dona continua lendo');
  await o.post('/api/sair');
});

test('exportação: sem motivo é bloqueada; com motivo gera registro próprio, visível só para a empresa, e avisa os admins', async () => {
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/exportar`, {})).status, 400);
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/exportar`, { tipo: 'suporte' })).status, 400);
  assert.equal((await ops.req('GET', `/api/plataforma/empresas/${A.id}/exportar`)).status, 404, 'GET sem motivo deixou de existir');
  assert.equal(um(S.P.db, 'select count(*) as n from operator_exports').n, 0);
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/exportar`, MOTIVO)).status, 400, 'suporte não é finalidade de exportação');
  const r = await ops.post(`/api/plataforma/empresas/${A.id}/exportar`, { tipo: 'solicitacao_cliente', justificativa: 'Cópia pedida pelo admin para arquivo interno' });
  assert.equal(r.status, 200);
  const baixado = await ops.get(r.dados.download);
  assert.equal(baixado.status, 200);
  assert.equal(baixado.headers.get('content-type'), 'application/gzip');
  const x = um(S.P.db, 'select * from operator_exports where company_id = ?', A.id);
  assert.deepEqual([x.operador_email, x.tipo, x.formato, x.sucesso], ['ops@theneil.com.br', 'solicitacao_cliente', 'banco_completo', 1]);
  assert.ok(x.bytes > 0 && x.em);
  assert.ok(um(S.P.db, "select 1 from audit_log where action = 'company.exported' and entity_id = ?", x.id));
  assert.ok((await ana.get('/api/empresa/acessos-greenia')).dados.exportacoes.some(e => e.id === x.id));
  assert.ok(!(await carla.get('/api/empresa/acessos-greenia')).dados.exportacoes.some(e => e.id === x.id));
  await esperar();
  assert.ok(S.P.email.enviados.some(m => m.para === 'ana@acme.com' && /Exportação de dados pela equipe de operação da plataforma/.test(m.assunto)));
  assert.equal(um(S.P.db, 'select aviso from operator_exports where id = ?', x.id).aviso, 'enviado');
});

test('exportação que falha também fica registrada, como falha', async () => {
  const t = S.P.tenant(B.id);
  t.db.close();
  try {
    const r = await ops.post(`/api/plataforma/empresas/${B.id}/exportar`, { tipo: 'incidente', justificativa: 'Análise do incidente de segurança INC-12' });
    assert.equal(r.status, 500);
    const x = um(S.P.db, 'select * from operator_exports where company_id = ? order by em desc', B.id);
    assert.equal(x.sucesso, 0);
    assert.ok(x.erro);
    assert.ok(um(S.P.db, "select 1 from audit_log where action = 'company.export_failed' and entity_id = ?", x.id));
  } finally { S.P.tenants.delete(B.id); }
});

test('aviso por email aos admins é complemento: sem email, o acesso abre e fica registrado como falha do aviso', async () => {
  const original = S.P.emailDa;
  S.P.emailDa = () => ({ enviar: async () => { throw new Error('smtp fora'); } });
  try {
    const { o, r } = await operador();
    assert.equal(r.status, 200);
    await esperar();
    assert.equal(acessos().at(-1).aviso, 'falhou');
    assert.equal((await o.get('/api/eu')).status, 200, 'o acesso não depende do email');
    await o.post('/api/sair');
  } finally { S.P.emailDa = original; }
  await operador();
  await esperar();
  assert.ok(S.P.email.enviados.some(m => m.para === 'ana@acme.com' && /Acesso da equipe de operação da plataforma ao ambiente/.test(m.assunto)));
});

test('marca branca: a empresa vê "Acessos da equipe de operação", sem o nome da plataforma, e o operador continua identificado', async () => {
  const { readFileSync } = await import('node:fs');
  const ler = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  for (const p of ['public/empresa.js', 'public/app.js']) {
    assert.match(ler(p), /Acessos da equipe de operação/, p);
    assert.doesNotMatch(ler(p).replace(/^\s*\/\/.*$/gm, ''), /equipe GreenIA/, p);
  }
  const lista = (await ana.get('/api/empresa/acessos-greenia')).dados;
  assert.ok(lista.acessos.every(a => a.operador && a.tipo && a.justificativa && a.inicio && a.status));
  assert.ok(lista.acessos.some(a => a.operador === 'ops@theneil.com.br'));
});
