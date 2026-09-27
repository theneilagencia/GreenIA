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
