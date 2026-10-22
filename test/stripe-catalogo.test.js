import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogoStripe, prepararCatalogoStripe, clienteStripeTeste } from '../src/plataforma/stripe-catalogo.js';

const env = { STRIPE_SECRET_KEY: 'rk_test_fake', STRIPE_API_VERSION: '2026-09-30.clover' };

function stripeFalso() {
  const produtos = new Map(), precos = new Map(), chamadas = [];
  return { chamadas, precos, transporte: async (url, op) => {
    chamadas.push({ url, op });
    const u = new URL(url), b = op.method === 'GET' ? u.searchParams : op.body;
    let corpo, status = 200;
    if (u.pathname.startsWith('/v1/products/')) {
      corpo = produtos.get(u.pathname.split('/').at(-1));
      if (!corpo) { status = 404; corpo = {}; }
    } else if (u.pathname === '/v1/products') {
      corpo = { id: b.get('id'), active: true, livemode: false, metadata: { greenia_product: b.get('metadata[greenia_product]') } };
      produtos.set(corpo.id, corpo);
    } else if (op.method === 'GET') {
      const p = precos.get(b.get('lookup_keys[0]'));
      corpo = { data: p ? [p] : [], has_more: false };
    } else {
      corpo = { id: `price_${precos.size}`, product: b.get('product'), currency: b.get('currency'), unit_amount: Number(b.get('unit_amount')),
        active: true, livemode: false, billing_scheme: 'per_unit', recurring: b.has('recurring[interval]') ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null };
      precos.set(b.get('lookup_key'), corpo);
    }
    return { ok: status === 200, status, json: async () => corpo };
  } };
}

test('prévia mantém USD aprovado e BRL pendente, sem usar rede ou chaves', async () => {
  const r = await prepararCatalogoStripe({}, { transporte: () => assert.fail('rede na prévia') });
  assert.equal(r.itens.length, 10);
  assert.deepEqual(r.itens.filter(x => x.moeda === 'usd').map(x => x.valor_centavos), [19900, 39900, 74900, 179900, 22900]);
  assert.ok(r.itens.filter(x => x.moeda === 'brl').every(x => x.pendente));
  assert.deepEqual(r.itens.filter(x => x.moeda === 'usd').map(x => [x.creditos, x.reserva]), [[2000,400],[5000,1000],[10000,2000],[25000,5000],[2000,0]]);
});

test('BRL não aceita preço fixo e exige conversão por emissão', () => {
  assert.throws(() => catalogoStripe({ STRIPE_PRECOS_BRL_CENTAVOS: '{"starter":100000}' }), /fixos desativados/);
  assert.ok(catalogoStripe().filter(x => x.moeda === 'brl').every(x => x.conversao_por_emissao));
});

test('aplicação com BRL pendente não faz nenhuma chamada', async () => {
  await assert.rejects(prepararCatalogoStripe({}, { aplicar: true, transporte: () => assert.fail('rede') }), /emissão/);
});

test('recusa produção e exige versão de API antes da rede', () => {
  for (const chave of ['', 'sk_live_fake', 'rk_live_fake', 'pk_test_fake']) assert.throws(() => clienteStripeTeste({ ...env, STRIPE_SECRET_KEY: chave }), /credencial/);
  assert.throws(() => clienteStripeTeste({ ...env, STRIPE_API_VERSION: '' }), /VERSION/);
});

test('preparador cria 5 produtos e 5 preços USD; repetição reutiliza tudo sem duplicar', async () => {
  const falso = stripeFalso();
  const a = await prepararCatalogoStripe(env, { aplicar: true, moeda: 'usd', transporte: falso.transporte });
  assert.equal(a.itens.length, 5);
  assert.equal(falso.chamadas.filter(x => x.op.method === 'POST').length, 10);
  const b = await prepararCatalogoStripe(env, { aplicar: true, moeda: 'usd', transporte: falso.transporte });
  assert.deepEqual(a, b);
  assert.equal(falso.chamadas.filter(x => x.op.method === 'POST').length, 10);
  for (const x of falso.chamadas) {
    assert.equal(new URL(x.url).host, 'api.stripe.com');
    assert.equal(x.op.redirect, 'error');
    if (x.op.method === 'POST') assert.ok(x.op.headers['Idempotency-Key']);
  }
});

test('rejeita preço existente com moeda, valor, recorrência, modo ou produto incorretos', async () => {
  for (const alteracao of [{ currency: 'brl' }, { unit_amount: 1 }, { livemode: true }, { active: false },
    { product: 'prod_outro' }, { recurring: null }, { transform_quantity: { divide_by: 2 } }]) {
    const falso = stripeFalso();
    await prepararCatalogoStripe(env, { aplicar: true, moeda: 'usd', transporte: falso.transporte });
    Object.assign(falso.precos.get('greenia_v1_starter_usd_19900'), alteracao);
    await assert.rejects(prepararCatalogoStripe(env, { aplicar: true, moeda: 'usd', transporte: falso.transporte }), /divergente/);
  }
});

test('erros da API não revelam segredos; 403 não é tratado como produto inexistente', async () => {
  let n = 0;
  await assert.rejects(prepararCatalogoStripe(env, { aplicar: true, moeda: 'usd', transporte: async () => {
    n++; return { ok: false, status: 403, json: async () => ({ error: { message: env.STRIPE_SECRET_KEY } }) };
  } }), e => e.message.includes('403') && !e.message.includes(env.STRIPE_SECRET_KEY));
  assert.equal(n, 1);
});
