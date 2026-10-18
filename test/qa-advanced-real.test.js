import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selecionarRotaQa, prepararAdvancedQa } from '../scripts/qa-advanced-real.mjs';
import { subir } from './ajuda.js';
import { lerModelos } from '../src/modelos.js';
import { um } from '../src/db.js';
const agora = Date.parse('2026-10-18T12:00:00Z');
// Catálogo sintético exclusivamente para testar os critérios, nunca prova de disponibilidade real.
const modelo = () => ({ id: 'anthropic/claude-sonnet-5.5', perfil: 'avancado', liberado: false, noCatalogo: true, vetadoPlataforma: false,
  atributos: { catalogo: { consultadoEm: new Date(agora).toISOString(), contexto: 200000, maxSaida: 32768, entrada: 0.000002, saida: 0.00001, parametros: ['max_tokens', 'tools'], rotas: [{ id: 'rota-sintetica', contexto: 200000, maxSaida: 32768, entrada: 0.000002, saida: 0.00001, parametros: ['max_tokens', 'tools'] }] } } });
test('QA Advanced: a preparação considera a curadoria desabilitada, sem depender do antigo Sonnet 5', () => {
  assert.equal(selecionarRotaQa([modelo()], agora).modelo, 'anthropic/claude-sonnet-5.5');
  const antigo = modelo(); antigo.id = 'anthropic/claude-sonnet-5'; antigo.liberado = true;
  assert.equal(selecionarRotaQa([antigo], agora), null);
});
test('QA Advanced: veto, catálogo vencido, preço ausente e saída insuficiente continuam impedindo a preparação', () => {
  for (const mudar of [m => m.vetadoPlataforma = true, m => m.atributos.catalogo.consultadoEm = '2026-10-01', m => m.atributos.catalogo.rotas[0].saida = null, m => m.atributos.catalogo.rotas[0].maxSaida = 8192, m => delete m.atributos.catalogo.rotas[0].contexto, m => delete m.atributos.catalogo.maxSaida]) {
    const m = modelo(); mudar(m); assert.equal(selecionarRotaQa([m], agora), null);
  }
});
test('QA Advanced: sem rota não há habilitação, aprovação ou concessão silenciosa', async () => {
  const a = { put() { assert.fail('não deve escrever sem rota'); }, post() { assert.fail('não deve conceder sem rota'); } };
  assert.ok((await prepararAdvancedQa(a, [], 1)).pendente);
});
test('QA Advanced: APIs locais registram revisão, concessão com teto e padrão para um modelo da curadoria', async () => {
  const m = modelo(); m.atributos.catalogo.consultadoEm = new Date().toISOString();
  const met = m.atributos.catalogo;
  const s = await subir({ banco: ':memory:', ia: { simulada: true, configurada: true,
    listarModelos: async () => [{ id: m.id, nome: 'Modelo sintético de QA', fornecedor: 'anthropic', contexto: met.contexto, maxSaida: met.maxSaida, parametros: met.parametros, precoEntrada: met.entrada, precoSaida: met.saida }],
    listarRotas: async () => met.rotas,
  } });
  try {
    const admin = await s.cliente().entrar('admin@exemplo.com.br');
    assert.equal((await admin.post('/api/admin/modelos/atualizar', {})).status, 200);
    const publico = (await admin.get('/api/admin/modelos')).dados.modelos.find(x => x.id === m.id);
    assert.equal(publico.atributos.catalogo.entrada, undefined, 'o cliente continua sem ver o custo');
    const modelos = lerModelos(s.app.db);
    const r = await prepararAdvancedQa(admin, modelos, admin.pessoa.id);
    assert.ok(r.id); assert.equal(r.modelo, m.id);
    const estado = (await admin.get('/api/admin/advanced')).dados;
    assert.equal(estado.autorizacoes.length, 1); assert.equal(estado.autorizacoes[0].limite_usd, undefined);
    const interno = um(s.app.db, 'select limite_usd,limite_chamada_usd from advanced_autorizacoes where id = ?', r.id);
    assert.equal(interno.limite_usd, 2); assert.equal(interno.limite_chamada_usd, 2);
    assert.deepEqual(JSON.parse(estado.autorizacoes[0].modelos), [m.id]);
    assert.equal((await admin.get('/api/admin/modelos')).dados.config.padroes.avancado, m.id);
  } finally { await s.fechar(); }
});

test('QA Advanced: catálogo real relatado exige reserva de pesquisa US$ 2,269144, sem elevar teto ou reduzir classe', async () => {
  const caro = modelo(); caro.atributos.catalogo.contexto = 1000000; caro.atributos.catalogo.rotas[0].contexto = 1000000;
  const r = selecionarRotaQa([caro], agora);
  assert.ok(Math.abs(r.estimativaPesquisa - 2.269144) < 1e-12);
  assert.equal(selecionarRotaQa([caro], agora, { pesquisaWeb: true }), null);
  const compativel = modelo(); compativel.atributos.catalogo.rotas[0].id = 'rota-compativel';
  assert.equal(selecionarRotaQa([caro, compativel], agora, { pesquisaWeb: true }).provedor, 'rota-compativel');
  const a = { put() { assert.fail('sem reserva válida não alterar autorização'); }, post() { assert.fail('não conceder'); } };
  caro.atributos.catalogo.consultadoEm = new Date().toISOString();
  assert.match((await prepararAdvancedQa(a, [caro], 1, { pesquisaWeb: true })).pendente, /Não iniciar inferências/);
});

test('QA Advanced: US$ 3 só por opção explícita, sem ampliar saída, trocar classe ou aceitar valor livre', async () => {
  const m = modelo(); m.atributos.catalogo.contexto = 1000000; m.atributos.catalogo.rotas[0].contexto = 1000000;
  assert.equal(selecionarRotaQa([m], agora, { pesquisaWeb: true }), null);
  assert.equal(selecionarRotaQa([m], agora, { pesquisaWeb: true, limiteReservaUsd: 3 }).modelo, m.id);
  for (const limiteReservaUsd of [0, -1, 2.5, 4, 100, NaN, '3']) assert.throws(() => selecionarRotaQa([m], agora, { limiteReservaUsd }), /explicitamente/);
  m.atributos.catalogo.consultadoEm = new Date().toISOString();
  const gravacoes = [];
  const cli = { put: async (url, corpo) => { gravacoes.push({ url, corpo }); return { status: 200, dados: {} }; }, post: async (url, corpo) => { gravacoes.push({ url, corpo }); return { status: 200, dados: { id: 7 } }; } };
  const r = await prepararAdvancedQa(cli, [m], 1, { pesquisaWeb: true, limiteReservaUsd: 3 });
  assert.equal(r.limiteReservaUsd, 3);
  const g = gravacoes.find(x => x.url === '/api/admin/advanced/autorizacoes').corpo;
  assert.equal(g.limite_usd, 3); assert.equal(g.limite_chamada_usd, 3); assert.equal(g.saida_tokens, 32768);
  assert.deepEqual(g.modelos, [m.id]); assert.equal(g.pesquisa_web, true);
});
