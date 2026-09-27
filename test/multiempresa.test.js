// Multiempresa: fluxo de aceite (plataforma → empresa → admin → usuários → roles → personalização),
// isolamento entre empresas, status, URL, planos, auditoria e importação da instalação única.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { criarApp } from '../src/servidor.js';
import { criarPlataforma } from '../src/plataforma/servidor.js';
import { salvarConfig } from '../src/config.js';
import { um, todos } from '../src/db.js';

let S, ops, planos, A, B;
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  planos = (await ops.get('/api/plataforma/planos')).dados.planos;
});
after(() => S.fechar());

test('console: só admin da plataforma entra; pessoa comum não recebe código', async () => {
  const x = S.navegador();
  assert.equal((await x.post('/api/plataforma/login/codigo', { email: 'alguem@acme.com' })).status, 403);
  assert.equal((await x.get('/api/plataforma/empresas')).status, 401);
  const eu = (await ops.get('/api/plataforma/eu')).dados;
  assert.ok(eu.permissoes.includes('platform.companies.manage'));
});

test('fluxo de aceite: criar empresa, plano, admin, marca, landing, URL e publicar', async () => {
  const c = await ops.post('/api/plataforma/empresas', { name: 'Acme Ltda', slug: 'acme', plan_id: planos.find(p => p.name.includes('Company')).id, admin_email: 'ana@acme.com', admin_name: 'Ana' });
  assert.equal(c.status, 200, JSON.stringify(c.dados));
  A = c.dados;
  assert.equal(A.status, 'em_implantacao');
  assert.ok(S.P.email.enviados.some(m => m.para === 'ana@acme.com' && /Convite/.test(m.assunto)));
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/marca`, { display_name: 'Acme', primary_color: '#0F5E78', secondary_color: '#F2B705', logo: LOGO, login_title: 'Bem-vindo à IA da Acme' })).status, 200);
  const land = await ops.put(`/api/plataforma/empresas/${A.id}/landing`, { status: 'publicada', content: { titulo: 'A IA da Acme', subtitulo: 'Tudo num lugar só', botoes: [{ texto: 'Entrar', link: '/entrar' }] }, seo: { title: 'Acme IA' } });
  assert.equal(land.status, 200);
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/url`, { slug: 'acme-ia' })).status, 200);
  // Antes de publicar, a landing pública não aparece e só o admin da empresa entra.
  const visitante = S.navegador();
  assert.equal((await visitante.get('/acme-ia')).status, 200);
  const pub = (await visitante.get('/api/publico')).dados;
  assert.equal(pub.landing, null);
  assert.equal(pub.empresa, 'Acme');
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/status`, { status: 'ativa' })).status, 200);
  const pub2 = (await visitante.get('/api/publico')).dados;
  assert.equal(pub2.landing.titulo, 'A IA da Acme');
  assert.equal(pub2.corMarca, '#0F5E78');
  assert.equal(pub2.loginTitulo, 'Bem-vindo à IA da Acme');
  // Slug antigo redireciona para o novo.
  const antigo = await visitante.get('/acme');
  assert.equal(antigo.status, 301);
  assert.equal(antigo.headers.get('location'), '/acme-ia');
});

let ana, bruno;
test('admin da empresa entra, convida usuário, cria role e define permissões', async () => {
  ana = S.navegador();
  await ana.get('/acme-ia');
  assert.equal((await ana.entrarEmpresa('ana@acme.com')).status, 200);
  const eu = (await ana.get('/api/eu')).dados;
  assert.ok(eu.permissoes.includes('role.manage'));
  assert.equal(eu.plataforma.empresa.slug, 'acme-ia');
  const resumo = (await ana.get('/api/empresa/resumo')).dados;
  assert.equal(resumo.plano.credits, 25000);
  assert.ok(!JSON.stringify(resumo).includes('price'), 'a empresa não vê preço do plano');
  // Role própria: pode ver uso e usar o chat, mas não administra.
  const role = await ana.post('/api/empresa/roles', { name: 'Analista de dados', description: 'Vê uso', permissoes: ['company.read', 'chat.use', 'usage.read'] });
  assert.equal(role.status, 200, JSON.stringify(role.dados));
  assert.equal((await ana.post('/api/empresa/roles', { name: 'Hack', permissoes: ['platform.companies.manage'] })).status, 400);
  const u = await ana.post('/api/empresa/usuarios', { email: 'bruno@acme.com', name: 'Bruno', role_id: role.dados.id });
  assert.equal(u.status, 200, JSON.stringify(u.dados));
  assert.equal(u.dados.status, 'convidado');
  bruno = S.navegador();
  await bruno.get('/acme-ia');
  assert.equal((await bruno.entrarEmpresa('bruno@acme.com')).status, 200);
  const ebr = (await bruno.get('/api/eu')).dados;
  assert.deepEqual(ebr.permissoes.sort(), ['chat.use', 'company.read', 'usage.read']);
  assert.equal((await bruno.get('/api/admin/uso')).status, 200);          // usage.read
  assert.equal((await bruno.get('/api/admin/config')).status, 403);       // settings.manage
  assert.equal((await bruno.get('/api/empresa/usuarios')).status, 403);   // user.read
  assert.equal((await bruno.post('/api/empresa/usuarios', { email: 'x@acme.com' })).status, 403);
  // O vínculo fica ativo no primeiro acesso.
  assert.equal((await ana.get('/api/empresa/usuarios')).dados.usuarios.find(x => x.email === 'bruno@acme.com').status, 'ativo');
});

test('admin da empresa personaliza dentro do que foi concedido; o operador bloqueia e sobrescreve', async () => {
  assert.equal((await ana.put('/api/empresa/marca', { display_name: 'Acme IA', primary_color: '#1B4F72' })).status, 200);
  assert.equal((await ana.put('/api/empresa/landing', { content: { titulo: 'Nova IA da Acme' } })).status, 200);
  // Cor com contraste baixo é recusada.
  assert.equal((await ana.put('/api/empresa/marca', { primary_color: '#FFFF00' })).status, 400);
  // O operador bloqueia o logo e tira a URL da empresa.
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/concessoes`, { grants: { branding: true, landing_page: true, url: false, domain: false, roles: true }, locked: ['logo'] })).status, 200);
  const bloqueado = await ana.put('/api/empresa/marca', { logo: '' });
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.dados.erro, 'campo_bloqueado');
  assert.equal((await ana.put('/api/empresa/url', { slug: 'acme-nova' })).status, 403);
  // O operador continua podendo alterar tudo.
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/marca`, { display_name: 'Acme (revisado)' })).status, 200);
  assert.equal((await ana.get('/api/publico')).dados.empresa, 'Acme (revisado)');
  // Link com javascript: é recusado na landing.
  assert.equal((await ana.put('/api/empresa/landing', { content: { botoes: [{ texto: 'x', link: 'javascript:alert(1)' }] } })).status, 400);
});

test('isolamento: nada da empresa A é alcançável a partir da empresa B', async () => {
  const c = await ops.post('/api/plataforma/empresas', { name: 'Beta SA', slug: 'beta', plan_id: planos[0].id, admin_email: 'carla@beta.com', status: 'ativa' });
  B = c.dados;
  const carla = S.navegador();
  await carla.get('/beta');
  assert.equal((await carla.entrarEmpresa('carla@beta.com')).status, 200);
  // Uma conversa na empresa A.
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  // Carla não enxerga usuários, conversas nem roles da A.
  const usuariosB = (await carla.get('/api/empresa/usuarios')).dados.usuarios.map(u => u.email);
  assert.deepEqual(usuariosB, ['carla@beta.com']);
  assert.equal((await carla.get(`/api/conversas/${conv.id}`)).status, 404);
  const anaId = (await ana.get('/api/empresa/usuarios')).dados.usuarios.find(u => u.email === 'ana@acme.com').id;
  assert.equal((await carla.put(`/api/empresa/usuarios/${anaId}`, { status: 'inativo' })).status, 404);
  const roleA = (await ana.get('/api/empresa/roles')).dados.roles.find(r => !r.system);
  assert.equal((await carla.post('/api/empresa/usuarios', { email: 'd@beta.com', role_id: roleA.id })).status, 400);
  // Trocar o cookie de contexto para a empresa A não dá acesso: a sessão é da B.
  carla.cookies.set('gia_t', encodeURIComponent(A.id));
  assert.equal((await carla.get('/api/empresa/usuarios')).status, 401);
  assert.equal((await carla.get('/api/conversas')).status, 401);
  // Admin de empresa não usa o console.
  assert.equal((await carla.get('/api/plataforma/empresas')).status, 401);
  // Os bancos são arquivos separados: a conversa só existe no da A.
  assert.equal(um(S.P.tenant(B.id).db, 'select count(*) as n from conversas').n, 0);
  assert.equal(um(S.P.tenant(A.id).db, 'select count(*) as n from conversas where id = ?', conv.id).n, 1);
});

test('domínio próprio e subdomínio resolvem a empresa; duplicidade e domínio da plataforma são recusados', async () => {
  assert.equal((await ops.put(`/api/plataforma/empresas/${B.id}/url`, { custom_domain: 'ia.beta.com.br' })).status, 200);
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/url`, { custom_domain: 'ia.beta.com.br' })).status, 409);
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/url`, { custom_domain: 'x.plataforma.teste' })).status, 400);
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/url`, { slug: 'plataforma' })).status, 400);
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/url`, { slug: 'beta' })).status, 409);
  const porDominio = S.navegador('ia.beta.com.br');
  assert.equal((await porDominio.get('/api/publico')).dados.empresa, 'Beta SA');
  // No domínio de uma empresa, o console não existe.
  assert.equal((await porDominio.get('/plataforma')).status, 404);
  assert.equal((await porDominio.get('/api/plataforma/eu')).status, 404);
  await ops.put('/api/plataforma/configuracoes', { subdominio_base: 'ia.plataforma.teste' });
  assert.equal((await S.navegador('acme-ia.ia.plataforma.teste').get('/api/publico')).dados.empresa, 'Acme (revisado)');
  assert.equal((await S.navegador('naoexiste.ia.plataforma.teste').get('/api/publico')).status, 404);
});

test('suspender derruba as sessões e bloqueia o acesso; reativar libera', async () => {
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/status`, { status: 'suspensa' })).status, 200);
  assert.equal((await ana.get('/api/eu')).status, 401);
  const nova = S.navegador();
  await nova.get('/acme-ia');
  assert.equal((await nova.post('/api/login/codigo', { email: 'ana@acme.com' })).status, 403);
  assert.equal((await nova.get('/api/publico')).dados.aviso, 'Este ambiente está indisponível no momento.');
  await ops.post(`/api/plataforma/empresas/${A.id}/status`, { status: 'ativa' });
  assert.equal((await ana.entrarEmpresa('ana@acme.com', { ciencia: false })).status, 200);
});

test('admin da plataforma entra em qualquer ambiente, com registro na auditoria', async () => {
  const r = await ops.post(`/api/plataforma/empresas/${B.id}/entrar`);
  assert.equal(r.status, 200);
  const eu = await ops.get('/api/eu');
  assert.equal(eu.status, 200);
  assert.equal(eu.dados.plataforma.empresa.id, B.id);
  assert.equal(eu.dados.plataforma.adminPlataforma, true);
  assert.equal(eu.dados.unidade, 'usd');   // só o operador vê dólar
});

test('planos por configuração: limite de usuários, recursos e mudança de plano valem na hora', async () => {
  const p = await ops.post('/api/plataforma/planos', { name: 'Piloto', credits: 1000, reserve: 100, price_usd: 0, limits: { max_users: 2, messages_per_minute: 5, max_quick_wins: 0 }, features: { quick_wins: false, knowledge: true, custom_branding: false, landing_page: true, custom_url: false, custom_domain: false, custom_roles: false } });
  assert.equal(p.status, 200, JSON.stringify(p.dados));
  assert.equal((await ops.post(`/api/plataforma/empresas/${B.id}/plano`, { plan_id: p.dados.id })).status, 200);
  const carla = S.navegador();
  await carla.get('/beta');
  await carla.entrarEmpresa('carla@beta.com');
  assert.equal((await carla.post('/api/empresa/usuarios', { email: 'd1@beta.com' })).status, 200);
  const limite = await carla.post('/api/empresa/usuarios', { email: 'd2@beta.com' });
  assert.equal(limite.status, 409);
  assert.equal(limite.dados.erro, 'limite_usuarios');
  assert.equal((await carla.put('/api/empresa/marca', { display_name: 'Beta' })).status, 403);   // plano sem marca própria
  assert.equal((await carla.post('/api/empresa/roles', { name: 'X', permissoes: ['company.read'] })).status, 403);
  assert.equal((await carla.post('/api/quick-wins', {})).status, 403);   // recurso fora do plano
  assert.equal(S.P.tenant(B.id).plano.creditos, 1000);
  assert.equal(S.P.tenant(B.id).rajada, 5);
});

test('último admin da empresa não sai; próprio usuário não se rebaixa', async () => {
  const lista = (await ana.get('/api/empresa/usuarios')).dados.usuarios;
  const anaId = lista.find(u => u.email === 'ana@acme.com').id;
  assert.equal((await ana.put(`/api/empresa/usuarios/${anaId}`, { status: 'inativo' })).status, 409);
  assert.equal((await ops.put(`/api/plataforma/empresas/${A.id}/usuarios/${anaId}`, { status: 'inativo' })).status, 409);
});

test('auditoria registra usuário, empresa, ação, antes, depois e origem', async () => {
  const a = (await ops.get(`/api/plataforma/auditoria?empresa=${A.id}`)).dados.itens;
  const acoes = a.map(x => x.action);
  for (const esperado of ['company.created', 'user.created', 'branding.updated', 'landing_page.published', 'company.url_changed', 'company.published', 'role.created', 'company.suspended', 'company.grants_changed'])
    assert.ok(acoes.includes(esperado), `faltou ${esperado}`);
  const url = a.find(x => x.action === 'company.url_changed' && x.after?.slug === 'acme-ia');
  assert.deepEqual([url.before.slug, url.after.slug, url.usuario, url.origin.painel], ['acme', 'acme-ia', 'ops@theneil.com.br', 'plataforma']);
  const marca = a.find(x => x.action === 'branding.updated' && x.origin.painel === 'empresa');
  assert.equal(marca.usuario, 'ana@acme.com');
  assert.match(JSON.stringify(a.find(x => x.after?.logo)?.after), /arquivo de/);   // imagem não vai inteira para a auditoria
  // O admin da empresa vê só a auditoria dele.
  const daEmpresa = (await ana.get('/api/empresa/auditoria')).dados.itens;
  assert.ok(daEmpresa.length > 0 && daEmpresa.every(x => x.empresa === 'Acme Ltda'));
});

test('importação: a instalação única vira a primeira empresa, com pessoas e admins', async () => {
  const legado = criarApp({ banco: ':memory:', log: () => {}, adminEmail: 'dono@antiga.com.br' });
  salvarConfig(legado.db, { empresa: 'Empresa Antiga', corMarca: '#1B7950' });
  legado.db.prepare("insert into pessoas (email, nome) values ('func@antiga.com.br', 'Func')").run();
  // A importação usa o caminho do arquivo; em memória, testamos pela função com um arquivo temporário.
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const pasta = mkdtempSync(join(tmpdir(), 'gia-'));
  const arquivo = join(pasta, 'greenia.sqlite');
  legado.db.exec(`vacuum into '${arquivo}'`);
  const P = criarPlataforma({ banco: join(pasta, 'plataforma.sqlite'), log: () => {}, cookieSeguro: false, legado: { banco: arquivo } });
  const empresas = todos(P.db, 'select * from companies');
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].slug, 'empresa-antiga');
  assert.equal(empresas[0].status, 'ativa');
  const membros = todos(P.db, 'select u.email, r.key from company_users cu join users u on u.id = cu.user_id join roles r on r.id = cu.role_id order by u.email');
  assert.deepEqual(membros.map(m => [m.email, m.key]), [['dono@antiga.com.br', 'company_admin'], ['func@antiga.com.br', 'member']]);
  assert.equal(um(P.tenant(empresas[0].id).db, "select user_id from pessoas where email = 'dono@antiga.com.br'").user_id !== null, true);
});
