// O aviso de tarefa programada de uma empresa (multiempresa) sai com o nome dela e o endereço de entrada, como o
// convite e o código de acesso, sem o nome da plataforma (white label) e sem conteúdo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { salvarConfig } from '../src/config.js';

test('identidade do ambiente para avisos: nome de exibição e endereço da empresa', async t => {
  const S = await subirPlataforma(); t.after(() => S.fechar());
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  const e = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Exemplo', slug: 'exemplo', status: 'ativa', plan_id: planos[0].id, admin_email: 'admin@exemplo.com.br' })).dados;
  const id = S.P.tenant(e.id).identidadeEmail();
  assert.equal(id.nome, 'Empresa Exemplo');
  assert.match(id.url, /\/exemplo$/);
});

test('console: o resumo da empresa mostra o filtro "sem treino" (ligado por padrão, desligado quando o admin desliga)', async t => {
  const S = await subirPlataforma(); t.after(() => S.fechar());
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  const e = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Exemplo', slug: 'exemplo', status: 'ativa', plan_id: planos[0].id })).dados;
  assert.equal((await ops.get(`/api/plataforma/empresas/${e.id}`)).dados.ambiente.semTreino, true);
  salvarConfig(S.P.tenant(e.id).db, { exigirSemTreino: false });
  assert.equal((await ops.get(`/api/plataforma/empresas/${e.id}`)).dados.ambiente.semTreino, false);
});
