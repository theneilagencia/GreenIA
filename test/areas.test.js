// Áreas (departamentos): o admin cria, descreve, desativa e define pessoas e permissões; cada área
// tem a sua base; quem administra a base de uma área não administra a de outra.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { arquivo, docx } from './arquivos.js';

let S, admin, rh, fin, pessoas = {}, cli = {};
const doc = (area, titulo, extra = {}) => ({ area_id: area, titulo, arquivo: arquivo(`${titulo}.docx`, docx([`Conteúdo de ${titulo}`])), ...extra });

before(async () => {
  S = await subir();
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  for (const n of ['rita', 'rui', 'fabio', 'flavia', 'jose']) {
    pessoas[n] = (await admin.post('/api/admin/pessoas', { email: `${n}@exemplo.com.br`, nome: n })).dados.id;
  }
  rh = (await admin.post('/api/admin/areas', { nome: 'Recursos Humanos', descricao: 'Pessoas, benefícios e folha' })).dados;
  fin = (await admin.post('/api/admin/areas', { nome: 'Financeiro' })).dados;
  for (const n of Object.keys(pessoas)) cli[n] = await S.cliente().entrar(`${n}@exemplo.com.br`);
});
after(() => S.fechar());

test('admin cria área com descrição, adiciona pessoas como membros ou administradores da base e vê quem está em cada área', async () => {
  assert.equal(rh.descricao, 'Pessoas, benefícios e folha');
  assert.equal(rh.ativa, true);
  let r = await admin.post(`/api/admin/areas/${rh.id}/pessoas`, { pessoas: [pessoas.rita, pessoas.rui], adminBase: false });
  assert.equal(r.status, 200);
  r = await admin.post(`/api/admin/areas/${rh.id}/pessoas`, { pessoas: [pessoas.rita], adminBase: true });
  await admin.post(`/api/admin/areas/${fin.id}/pessoas`, { pessoas: [pessoas.fabio], adminBase: true });
  await admin.post(`/api/admin/areas/${fin.id}/pessoas`, { pessoas: [pessoas.flavia, pessoas.rita] });
  const a = (await admin.get(`/api/admin/areas/${rh.id}`)).dados.area;
  assert.deepEqual(a.pessoas.map(m => [m.nome, m.adminBase]), [['rita', true], ['rui', false]]);
  const lista = (await admin.get('/api/admin/areas')).dados.areas;
  assert.deepEqual(lista.map(x => [x.nome, x.pessoas.length, x.pessoas.filter(m => m.adminBase).length]), [['Financeiro', 3, 1], ['Recursos Humanos', 2, 1]]);
  // Uma pessoa em várias áreas, com permissão diferente em cada uma.
  const rita = (await cli.rita.get('/api/areas')).dados.areas;
  assert.deepEqual(rita.map(x => [x.nome, x.adminBase]), [['Financeiro', false], ['Recursos Humanos', true]]);
  // Só o admin da empresa mexe na estrutura.
  assert.equal((await cli.rita.post(`/api/admin/areas/${rh.id}/pessoas`, { pessoas: [pessoas.jose] })).status, 403);
  assert.equal((await cli.rita.put(`/api/admin/areas/${rh.id}/pessoas/${pessoas.rui}`, { adminBase: true })).status, 403);
  assert.equal((await cli.rita.post('/api/admin/areas', { nome: 'Nova' })).status, 403);
});

test('administrador da base gere só a base da própria área; membro só consulta', async () => {
  // Rita administra RH: adiciona, edita, organiza em pasta, revisa e remove.
  let r = await cli.rita.post('/api/bases/documentos', doc(rh.id, 'Manual de benefícios', { pasta: 'Manuais' }));
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const id = r.dados.id;
  assert.equal(r.dados.pasta, 'Manuais');
  r = await cli.rita.put(`/api/bases/documentos/${id}`, { titulo: 'Manual de benefícios 2026', pasta: 'Políticas', revisado: true });
  assert.equal(r.status, 200);
  assert.deepEqual([r.dados.titulo, r.dados.pasta, r.dados.revisado_por], ['Manual de benefícios 2026', 'Políticas', 'rita']);
  assert.ok(r.dados.revisado_em);
  // Rita é só membro do Financeiro: não envia nem mexe lá.
  assert.equal((await cli.rita.post('/api/bases/documentos', doc(fin.id, 'Tentativa'))).status, 403);
  const f = (await cli.fabio.post('/api/bases/documentos', doc(fin.id, 'Fechamento mensal'))).dados;
  assert.equal((await cli.rita.put(`/api/bases/documentos/${f.id}`, { titulo: 'x' })).status, 404);
  assert.equal((await cli.rita.del(`/api/bases/documentos/${f.id}`)).status, 404);
  // Fábio administra o Financeiro, não o RH.
  assert.equal((await cli.fabio.del(`/api/bases/documentos/${id}`)).status, 404);
  // Rui é membro do RH: vê o documento, não gere.
  assert.equal((await cli.rui.post('/api/bases/documentos', doc(rh.id, 'Tentativa'))).status, 403);
  const k = (await cli.rui.get('/api/conhecimento')).dados;
  assert.deepEqual(k.documentos.map(d => d.titulo), ['Manual de benefícios 2026']);
  assert.equal(k.podeGerir, false);
  // Na tela de gestão, cada um vê só as bases que administra, com as pessoas da área.
  const bases = (await cli.rita.get('/api/bases/areas')).dados;
  assert.deepEqual(bases.areas.map(a => a.nome), ['Recursos Humanos']);
  assert.equal(bases.areas[0].membros, 2);
  assert.deepEqual(bases.areas[0].administradores.map(x => x.nome), ['rita']);
  assert.equal(bases.todaEmpresa, false);
  assert.deepEqual((await cli.rita.get('/api/bases/documentos')).dados.documentos.map(d => d.titulo), ['Manual de benefícios 2026']);
});

test('a permissão da base é independente do responsável pela área e pode ser tirada', async () => {
  // Responsável sem permissão de base não administra a base.
  await admin.put(`/api/admin/areas/${rh.id}/pessoas/${pessoas.rui}`, { responsavel: true });
  assert.equal((await cli.rui.post('/api/bases/documentos', doc(rh.id, 'Tentativa'))).status, 403);
  // Promover e rebaixar.
  await admin.put(`/api/admin/areas/${rh.id}/pessoas/${pessoas.rui}`, { adminBase: true });
  assert.equal((await cli.rui.post('/api/bases/documentos', doc(rh.id, 'Código de conduta'))).status, 200);
  await admin.put(`/api/admin/areas/${rh.id}/pessoas/${pessoas.rui}`, { adminBase: false });
  assert.equal((await cli.rui.post('/api/bases/documentos', doc(rh.id, 'Outra'))).status, 403);
  // Remover da área tira o acesso à base.
  await admin.del(`/api/admin/areas/${rh.id}/pessoas/${pessoas.rui}`);
  assert.deepEqual((await cli.rui.get('/api/conhecimento')).dados.documentos, []);
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'area.permission_changed'"));
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'area.member_removed'"));
});

test('área desativada sai do uso sem apagar nada; só dá para excluir depois de desativar', async () => {
  assert.equal((await admin.del(`/api/admin/areas/${fin.id}`)).status, 409);
  let r = await admin.put(`/api/admin/areas/${fin.id}`, { ativa: false, descricao: 'Encerrada' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.dados.ativa, r.dados.descricao, r.dados.pessoas.length], [false, 'Encerrada', 3]);
  // Ninguém vê a base, nem quem administrava; a IA não usa.
  assert.deepEqual((await cli.flavia.get('/api/conhecimento')).dados.documentos, []);
  assert.equal((await cli.fabio.post('/api/bases/documentos', doc(fin.id, 'Depois'))).status, 403);
  assert.deepEqual((await cli.fabio.get('/api/bases/areas')).dados.areas, []);
  assert.ok(!(await admin.get('/api/areas')).dados.areas.some(a => a.id === fin.id));
  // Reativar devolve tudo.
  await admin.put(`/api/admin/areas/${fin.id}`, { ativa: true });
  assert.deepEqual((await cli.flavia.get('/api/conhecimento')).dados.documentos.map(d => d.titulo), ['Fechamento mensal']);
  // Excluir, depois de desativar.
  await admin.put(`/api/admin/areas/${fin.id}`, { ativa: false });
  assert.equal((await admin.del(`/api/admin/areas/${fin.id}`)).status, 200);
  assert.ok(!um(S.app.db, 'select 1 from documentos where area_id = ?', fin.id));
});

test('renomear para um nome que já existe é recusado', async () => {
  const x = (await admin.post('/api/admin/areas', { nome: 'Jurídico' })).dados;
  assert.equal((await admin.put(`/api/admin/areas/${x.id}`, { nome: 'Recursos Humanos' })).status, 409);
  assert.equal((await admin.put(`/api/admin/areas/${x.id}`, { nome: '  ' })).status, 400);
});
