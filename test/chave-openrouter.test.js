// Chave do OpenRouter informada no console: testada antes de salvar, cifrada no banco, vale na hora
// para todas as empresas, nunca volta para a tela e sobrevive a um reinício.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { subirPlataforma } from './ajuda-plataforma.js';

const pasta = mkdtempSync(join(tmpdir(), 'greenia-chave-')), banco = join(pasta, 'plataforma.sqlite');
const mestra = randomBytes(32);
const BOA = 'sk-or-v1-' + 'a'.repeat(56) + 'b9c1', RUIM = 'sk-or-v1-' + 'z'.repeat(60);
const criadas = [];
// Cliente falso: a chave BOA existe no OpenRouter; a RUIM é recusada.
const criarIA = chave => { criadas.push(chave); return { configurada: true, async listarModelos() { return []; }, async *enviar() { yield { tipo: 'texto', texto: `resposta com ${chave.slice(-4)}` }; yield { tipo: 'fim', modelo: 'x/y', custo: 0 }; },
  async conta() { return chave === BOA ? { chave: { label: 'producao', usage: 1, usage_daily: 0.5 }, creditos: { total_credits: 10, total_usage: 1 } } : { chave: { erro: 401 }, creditos: { erro: 401 } }; } }; };
let S;
after(async () => { await S?.fechar(); rmSync(pasta, { recursive: true, force: true }); });

test('admin informa a chave: formato, teste no OpenRouter, cifrada, máscara e troca na hora', async () => {
  S = await subirPlataforma({ banco, criarIA, chaveMestra: mestra, chaveVariavel: null });
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  let r = (await ops.get('/api/plataforma/consumo')).dados;
  assert.equal(r.chaveConfig.origem, null);
  assert.equal(r.conta.disponivel, false);
  assert.equal((await ops.put('/api/plataforma/openrouter/chave', { chave: 'abc' })).status, 400);
  const recusada = await ops.put('/api/plataforma/openrouter/chave', { chave: RUIM });
  assert.equal(recusada.status, 400);
  assert.match(recusada.dados.mensagem, /recusou esta chave/);
  const ok = await ops.put('/api/plataforma/openrouter/chave', { chave: BOA });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  assert.equal(ok.dados.chaveConfig.mascara, 'sk-or-v1-…b9c1');
  assert.equal(ok.dados.chaveConfig.nome, 'producao');
  assert.equal(ok.dados.conta.saldo, 9);
  // Nunca volta para a tela nem fica em claro no banco ou na auditoria.
  r = (await ops.get('/api/plataforma/consumo')).dados;
  assert.equal(JSON.stringify(r).includes(BOA), false);
  const cru = S.P.db.prepare("select value from platform_settings where key = 'openrouter_chave'").get().value;
  assert.equal(cru.includes(BOA) || cru.includes(BOA.slice(9, 40)), false);
  const aud = (await ops.get('/api/plataforma/auditoria')).dados.itens.find(x => x.action === 'platform.openrouter_key_set');
  assert.ok(aud);
  assert.equal(JSON.stringify(aud).includes(BOA), false);
  // Vale na hora para as empresas (mesmo objeto de IA).
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa', status: 'ativa', admin_email: 'x@alfa.com' })).dados;
  const partes = []; for await (const p of S.P.tenant(c.id).ia.enviar([], {})) partes.push(p);
  assert.equal(partes[0].texto, 'resposta com b9c1');
  // Empresa não mexe na chave.
  const x = S.navegador(); await x.get('/alfa'); await x.entrarEmpresa('x@alfa.com');
  assert.notEqual((await x.put('/api/plataforma/openrouter/chave', { chave: BOA })).status, 200);
  await S.fechar();
});

test('depois de reiniciar, a chave salva volta sozinha; remover volta para a variável', async () => {
  criadas.length = 0;
  S = await subirPlataforma({ banco, criarIA, chaveMestra: mestra, chaveVariavel: 'sk-or-v1-…0000', ia: { configurada: true, async listarModelos() { return []; }, async *enviar() { yield { tipo: 'texto', texto: 'da variável' }; } } });
  assert.deepEqual(criadas, [BOA], 'carregou a chave cifrada na subida');
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  let k = (await ops.get('/api/plataforma/consumo')).dados.chaveConfig;
  assert.deepEqual([k.origem, k.mascara, k.variavelTambem], ['console', 'sk-or-v1-…b9c1', true]);
  assert.equal((await ops.del('/api/plataforma/openrouter/chave')).status, 200);
  k = (await ops.get('/api/plataforma/consumo')).dados.chaveConfig;
  assert.deepEqual([k.origem, k.mascara], ['variavel', 'sk-or-v1-…0000']);
  const partes = []; for await (const p of S.P.ia.enviar([], {})) partes.push(p);
  assert.equal(partes[0].texto, 'da variável');
  assert.equal((await ops.del('/api/plataforma/openrouter/chave')).status, 409);
});
