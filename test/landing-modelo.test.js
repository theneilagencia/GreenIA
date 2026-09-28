// Landing page da empresa: nasce publicada com o modelo completo (nome da empresa em todos os textos),
// todas as seções são editáveis e a página pública recebe tudo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';

let S, ops, c;
before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  c = (await ops.post('/api/plataforma/empresas', { name: 'Construtora Horizonte', slug: 'horizonte', status: 'ativa' })).dados;
});
after(() => S.fechar());

test('empresa nova já tem a landing publicada e preenchida, com SEO', async () => {
  const d = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados;
  const l = d.landing;
  assert.equal(l.status, 'publicada');
  assert.match(l.content.rotulo, /Construtora Horizonte/);
  assert.equal(l.content.passos.length, 3);
  assert.equal(l.content.tarefas.length, 6);
  assert.ok(l.content.regras.pode.length && l.content.regras.sigilo.length && l.content.regras.nunca.length);
  assert.match(l.content.institucional.titulo, /Construtora Horizonte/);
  assert.ok(l.content.institucional.links.some(x => x.link === '/politica'));
  assert.match(l.seo.title, /Construtora Horizonte/);
  assert.ok(l.modelo && l.modeloSeo);
  const pub = (await S.navegador().get('/horizonte').then(async () => null), await (async () => { const v = S.navegador(); await v.get('/horizonte'); return (await v.get('/api/publico')).dados; })());
  assert.equal(pub.landing.textos.fim_titulo, 'Pronto para começar');
  assert.equal(pub.landing.passos[0].titulo, 'Entre com o seu email');
});

test('todas as seções novas são salvas e validadas', async () => {
  const r = await ops.put(`/api/plataforma/empresas/${c.id}/landing`, { content: {
    textos: { tarefas_titulo: 'Comece por aqui', fim_botao: 'Acessar' },
    passos: [{ titulo: 'Um', texto: 'Primeiro' }], regras: { pode: ['Tudo de trabalho'], sigilo: [], nunca: ['Senhas'] },
    tarefas: [{ tipo: 'Resumir', texto: 'Resuma isto' }, { tipo: '', texto: '' }] } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const l = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.landing.content;
  assert.equal(l.textos.tarefas_titulo, 'Comece por aqui');
  assert.equal(l.textos.fim_titulo, 'Pronto para começar');   // o que não veio continua do modelo
  assert.deepEqual(l.passos, [{ titulo: 'Um', texto: 'Primeiro' }]);
  assert.deepEqual(l.regras.nunca, ['Senhas']);
  assert.equal(l.tarefas.length, 1);
});

test('marca: favicon em JPG ou WEBP é aceito, e o ícone da aba não fica em cache', async () => {
  const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  assert.equal((await ops.put(`/api/plataforma/empresas/${c.id}/marca`, { favicon: jpg, logo: 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==' })).status, 200);
  const v = S.navegador(); await v.get('/horizonte');
  const r = await v.get('/icone');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
});

test('marca nasce com título e texto do login e aviso de privacidade de exemplo, editáveis', async () => {
  const { marcaPadrao, preencherTextosMarca } = await import('../src/plataforma/empresas.js');
  const { exec } = await import('../src/db.js');
  const { salvarAjuste } = await import('../src/plataforma/db.js');
  const m = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.marca;
  const modelo = marcaPadrao('Construtora Horizonte');
  assert.deepEqual([m.login_title, m.login_text, m.privacy_note], [modelo.login_title, modelo.login_text, modelo.privacy_note]);
  assert.match(m.login_text, /Construtora Horizonte/);
  assert.deepEqual(m.modelo, modelo);
  // A tela de login recebe os textos.
  const v = S.navegador(); await v.get('/horizonte');
  const pub = (await v.get('/api/publico')).dados;
  assert.equal(pub.loginTitulo, modelo.login_title);
  assert.equal(pub.privacyNote, modelo.privacy_note);
  // O cliente edita; e pode apagar.
  assert.equal((await ops.put(`/api/plataforma/empresas/${c.id}/marca`, { login_title: 'Bem-vindo', login_text: '' })).status, 200);
  const m2 = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.marca;
  assert.deepEqual([m2.login_title, m2.login_text], ['Bem-vindo', '']);
  // Empresas antigas com textos vazios recebem o exemplo uma vez; depois, um texto apagado continua apagado.
  preencherTextosMarca(S.P);
  assert.equal((await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.marca.login_text, '');
  salvarAjuste(S.P.db, 'marca_textos_preenchidos', false);
  exec(S.P.db, "update branding set privacy_note = '' where company_id = ?", c.id);
  preencherTextosMarca(S.P);
  const m3 = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.marca;
  assert.deepEqual([m3.login_title, m3.login_text, m3.privacy_note], ['Bem-vindo', modelo.login_text, modelo.privacy_note]);
});

test('multiempresa: o aviso de administrar a base leva ao endereço da própria empresa', async () => {
  await ops.post('/api/plataforma/empresas', { name: 'Delta', slug: 'delta', admin_email: 'dora@delta.com', status: 'ativa' });
  const dora = S.navegador(); await dora.get('/delta'); await dora.entrarEmpresa('dora@delta.com');
  const area = (await dora.post('/api/admin/areas', { nome: 'Operações' })).dados;
  const eu = (await dora.get('/api/eu')).dados.pessoa;
  const r = await dora.post(`/api/admin/areas/${area.id}/pessoas`, { pessoas: [eu.id], adminBase: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const m = [...S.P.email.enviados].reverse().find(x => x.para === 'dora@delta.com' && /administra a base/.test(x.assunto));
  assert.ok(m, 'email enviado');
  assert.match(m.texto, /http:\/\/plataforma\.teste\/delta\/app#\/conhecimento/);
  assert.equal((await dora.get('/api/eu')).dados.bases.areas[0].nome, 'Operações');
});
