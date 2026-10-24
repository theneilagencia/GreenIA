// Consumo de IA no console: conta no OpenRouter, total da plataforma, cada empresa e alerta de saldo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { exec, todos } from '../src/db.js';
import { conferirSaldo } from '../src/plataforma/consumo.js';

let S, ops, A, conta, chamadasConta = 0;
const ia = { configurada: true, async listarModelos() { return []; }, async *enviar() {},
  async conta() { chamadasConta++; return conta; } };

before(async () => {
  S = await subirPlataforma({ ia });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  A = (await ops.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa', status: 'ativa', plan_id: planos.find(p => p.credits > 0).id, admin_email: 'x@alfa.com' })).dados;
  const db = S.P.tenant(A.id).db, hoje = new Date();
  for (let d = 0; d < 10; d++) for (let i = 0; i < 3; i++) exec(db, 'insert into uso (em, pessoa_id, conversa_id, modelo_usado, custo) values (?, 1, 1, ?, 0.5)', new Date(hoje - d * 864e5).toISOString(), i ? 'x/modelo-a' : 'y/modelo-b');
});
after(() => S.fechar());

test('console mostra saldo, créditos e uso da chave no OpenRouter, e o consumo diário da plataforma e da empresa', async () => {
  conta = { chave: { label: 'prod', usage: 100, limit: null, limit_remaining: null, usage_daily: 1.5, usage_weekly: 10.5, usage_monthly: 15 }, creditos: { total_credits: 200, total_usage: 150 } };
  const r = (await ops.get('/api/plataforma/consumo?forcar=1')).dados;
  assert.equal(r.conta.saldo, 50);
  assert.deepEqual([r.conta.comprado, r.conta.gasto, r.conta.chave.hoje, r.conta.chave.mes], [200, 150, 1.5, 15]);
  assert.equal(r.serie.length, 30);
  assert.equal(r.serie.at(-1).custo, 1.5, 'hoje: três respostas de 0,50');
  const e = r.empresas.find(x => x.id === A.id);
  assert.deepEqual([e.custoHoje, e.custo7], [1.5, 10.5]);
  assert.equal(e.serie.length, 30);
  assert.equal(r.alerta.diasRestantes, Math.floor(50 / 1.5));
  assert.equal(JSON.stringify(r).includes('Bearer'), false);
  const d = (await ops.get(`/api/plataforma/empresas/${A.id}/consumo`)).dados;
  assert.deepEqual(d.porModelo.map(x => x.modelo), ['x/modelo-a', 'y/modelo-b']);
  // Cache de 5 minutos: sem forcar, não chama o OpenRouter de novo.
  const n = chamadasConta; await ops.get('/api/plataforma/consumo'); assert.equal(chamadasConta, n);
});

test('só o admin da plataforma vê; a empresa não vê a conta nem o consumo das outras', async () => {
  const x = S.navegador(); await x.get('/alfa'); await x.entrarEmpresa('x@alfa.com');
  assert.notEqual((await x.get('/api/plataforma/consumo')).status, 200);
  assert.equal((await S.navegador().get('/api/plataforma/consumo')).status, 401);
});

test('saldo abaixo do alerta avisa os admins por email, no máximo uma vez por dia; o limite é configurável', async () => {
  assert.equal((await ops.put('/api/plataforma/consumo/alerta', { limiarUsd: -1 })).status, 400);
  conta = { chave: { usage: 1, usage_daily: 1, usage_weekly: 1, usage_monthly: 1 }, creditos: { total_credits: 10, total_usage: 7 } };
  const antes = S.P.email.enviados.length;
  assert.equal((await ops.put('/api/plataforma/consumo/alerta', { limiarUsd: 5 })).status, 200);
  const m = S.P.email.enviados.slice(antes).find(x => /Saldo de IA baixo/.test(x.assunto));
  assert.ok(m, 'email enviado');
  assert.match(m.texto, /US\$ 3\.00/);
  const n = S.P.email.enviados.length;
  await conferirSaldo(S.P);
  assert.equal(S.P.email.enviados.length, n, 'não repete no mesmo dia');
  // Chave sem acesso ao saldo: usa o que resta do limite da chave.
  conta = { chave: { usage: 1, limit: 50, limit_remaining: 42 }, creditos: { erro: 403 } };
  const r = (await ops.get('/api/plataforma/consumo?forcar=1')).dados;
  assert.equal(r.conta.saldo, null);
  assert.match(r.conta.creditosIndisponivel, /não tem acesso/);
  assert.equal(r.alerta.abaixo, false);
});

test('cliente do OpenRouter lê /key e /credits e tolera a parte que falhar', async () => {
  const { criarOpenRouter } = await import('../src/ia.js');
  const pedidos = [];
  const f = async (url, op) => { pedidos.push([url, op.headers.authorization]); return url.endsWith('/key')
    ? new Response(JSON.stringify({ data: { label: 'k', usage: 3, usage_daily: 1 } }), { status: 200 })
    : new Response('{}', { status: 403 }); };
  const r = await criarOpenRouter({ chave: 'sk-teste', fetch: f }).conta();
  assert.deepEqual(r, { chave: { label: 'k', usage: 3, usage_daily: 1 }, creditos: { erro: 403 } });
  assert.deepEqual(pedidos.map(p => p[0]).sort(), ['https://openrouter.ai/api/v1/credits', 'https://openrouter.ai/api/v1/key']);
  assert.ok(pedidos.every(p => p[1] === 'Bearer sk-teste'));
});

test('receita e margem TOTAL do console: plano + Capacity Packs do mês − custos proporcionais − IA com a taxa − parte da infraestrutura; servidor configurável e auditado', async () => {
  assert.equal((await ops.put('/api/plataforma/consumo/servidor', { custoUsd: -1 })).status, 400);
  assert.equal((await ops.put('/api/plataforma/consumo/servidor', { custoUsd: 30 })).dados.custoUsd, 30);
  const p = (await ops.get('/api/plataforma/planos')).dados.planos.find(x => x.credits > 0);   // o plano da Alfa
  // O operador informa a quantidade de Capacity Packs; créditos e valor saem das regras do plano (nunca do pedido).
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/pacotes`, { packs: 2 })).status, 200);
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/pacotes`, { packs: 0 })).status, 400);
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/pacotes`, { packs: 1.5 })).status, 400);
  assert.equal((await ops.post(`/api/plataforma/empresas/${A.id}/pacotes`, { creditos: 300, observacao: 'cortesia' })).status, 200);   // cortesia: sem receita
  const linhas = todos(S.P.tenant(A.id).db, 'select creditos, produto, preco_usd from pacotes order by id').map(x => ({ ...x }));
  assert.deepEqual(linhas, [{ creditos: 2 * p.rules.pack_credits, produto: 'capacity_pack', preco_usd: 2 * p.rules.pack_price_usd }, { creditos: 300, produto: 'cortesia', preco_usd: 0 }]);
  const r = (await ops.get('/api/plataforma/consumo')).dados;
  const e = r.empresas.find(x => x.id === A.id), n = r.empresas.length;
  const pacote = 2 * p.rules.pack_price_usd, receita = p.price_usd + pacote;
  assert.equal(e.receitaPacotesUsd, pacote);
  assert.equal(e.receitaUsd, receita);
  assert.ok(Math.abs(e.infraUsd - 30 / n) < 1e-9, 'servidor dividido entre as empresas ativas');
  const esperado = receita - receita * 0.30 - e.custoMes * 1.055 - 30 / n;
  assert.ok(Math.abs(e.margemUsd - esperado) < 1e-9, `${e.margemUsd} ≠ ${esperado}`);
  assert.ok(Math.abs(e.margemPct - esperado / receita) < 1e-9);
  assert.equal(r.plataforma.custoServidor, 30);
  assert.ok(Math.abs(r.plataforma.margemMes - (r.plataforma.receitaMes * 0.70 - r.plataforma.custoMesComTaxa - 30)) < 1e-9);
  // A tela de uso por empresa usa a mesma conta.
  const u = (await ops.get('/api/plataforma/uso')).dados.empresas.find(x => x.id === A.id);
  assert.equal(u.margemUsd, e.margemUsd);
  const aud = (await ops.get('/api/plataforma/auditoria')).dados;
  assert.ok(JSON.stringify(aud).includes('platform.server_cost_changed'));
  assert.equal((await ops.put('/api/plataforma/consumo/servidor', { custoUsd: 0 })).status, 200);
});

test('planos no console: margem TOTAL no pior caso com detalhamento, status, preço mínimo e folga; trava de 50% no salvamento; sem preço e sem teto marcados', async () => {
  const r = (await ops.get('/api/plataforma/planos')).dados;
  assert.deepEqual([r.margemMinima, r.metaMargem], [0.5, 0.52]);
  const starter = r.planos.find(p => p.name === 'GreenIA Starter');
  const e = starter.economia;
  // 199: impostos 12%, pagamento/câmbio 3%, suporte 15%, IA (2.000 + 400) × 0,01 × 1,055, infraestrutura 0 (servidor sem fatura).
  assert.deepEqual([e.capacidadePiorCaso, e.impostos, e.pagamento, e.suporte, e.custoIaPiorCaso, e.infra], [2400, 23.88, 5.97, 29.85, 25.32, 0]);
  assert.ok(Math.abs(e.margem - (199 - 199 * 0.3 - 25.32) / 199) < 1e-9);
  assert.equal(e.status, 'saudavel');
  assert.ok(Math.abs(e.folga - (e.margem - 0.5)) < 1e-12);
  assert.ok(Math.abs(e.precoMinimo - Math.ceil(25.32 / 0.2 * 100) / 100) < 1e-9);
  assert.equal(e.simulacao.length, 5);
  assert.ok(e.margemIa > e.margem, 'margem de IA é só diagnóstico (maior que a total)');
  assert.ok(r.planos.find(p => !p.credits).economia.semTeto, 'Liberado: sem teto de custo');
  // Abaixo do piso: recusado, com o preço mínimo calculado pela margem total.
  const base = { name: 'Barato', credits: 10000, reserve: 2000, limits: {}, features: {}, rules: { pack_credits: 2000, pack_price_usd: 229 } };
  const caro = await ops.post('/api/plataforma/planos', { ...base, price_usd: 600 });
  assert.equal(caro.status, 400);
  assert.match(caro.dados.mensagem, /margem total no pior caso/);
  assert.match(caro.dados.mensagem, /preço mínimo é US\$ 633\.00/);
  const pacote = await ops.post('/api/plataforma/planos', { ...base, price_usd: 749, rules: { pack_credits: 2000, pack_price_usd: 40 } });
  assert.equal(pacote.status, 400);
  assert.match(pacote.dados.mensagem, /Capacity Pack/);
  // Prévia: a mesma conta, sem gravar.
  const pv = (await ops.post('/api/plataforma/planos/previa', { credits: 10000, reserve: 2000, price_usd: 600 })).dados.economia;
  assert.equal(pv.status, 'critico');
  assert.equal(pv.precoMinimo, 633);
  // Sem preço (piloto/cortesia) é permitido e aparece como custo sem receita.
  const piloto = await ops.post('/api/plataforma/planos', { ...base, name: 'Piloto margem', price_usd: 0 });
  assert.equal(piloto.status, 200);
  const lista = (await ops.get('/api/plataforma/planos')).dados.planos;
  assert.ok(lista.find(p => p.name === 'Piloto margem').economia.semReceita);
});

test('conciliação com o OpenRouter: gasto da chave no mês contra o registrado como crédito; alerta quando passa de 1%', async () => {
  const mes = (await ops.get('/api/plataforma/consumo')).dados.plataforma.custoMes;
  conta = { chave: { label: 'prod', usage: 100, limit: null, limit_remaining: null, usage_daily: 1, usage_weekly: 5, usage_monthly: mes * 1.04 }, creditos: { total_credits: 200, total_usage: 150 } };
  let c = (await ops.get('/api/plataforma/consumo?forcar=1')).dados.conciliacao;
  assert.equal(c.alerta, true);
  assert.ok(Math.abs(c.percentual - 4) < 1e-6);
  conta = { ...conta, chave: { ...conta.chave, usage_monthly: mes * 1.005 } };
  c = (await ops.get('/api/plataforma/consumo?forcar=1')).dados.conciliacao;
  assert.equal(c.alerta, false, 'meio por cento: dentro da tolerância');
});
