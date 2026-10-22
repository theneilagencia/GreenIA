import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consultarPtax, converterCentavosUsdParaBrl, cotarCobrancaBrl } from '../src/plataforma/stripe-cambio.js';

const agora = new Date('2026-10-22T18:00:00Z');
const boletim = { cotacaoVenda: 5.1234, dataHoraCotacao: '2026-10-22 13:08:00.000' };
const resposta = r => async () => ({ ok: true, json: async () => ({ value: r ? [r] : [] }) });
const pedido = { pedido: 'pedido_00001', empresa: 'empresa_a', produto: 'starter', usd_centavos: 19900 };

test('consulta BCB por fechamento de venda e registra origem, publicação e consulta', async () => {
  const r = await consultarPtax({ agora, transporte: async (url, op) => {
    const u = new URL(url);
    assert.equal(u.hostname, 'olinda.bcb.gov.br');
    assert.ok(u.pathname.includes('CotacaoDolarPeriodo'));
    assert.equal(u.searchParams.get('@dataFinalCotacao'), "'10-22-2026'");
    assert.equal(u.searchParams.get('$orderby'), 'dataHoraCotacao desc');
    assert.equal(op.redirect, 'error');
    return { ok: true, json: async () => ({ value: [boletim] }) };
  } });
  assert.equal(r.taxa, '5.1234');
  assert.equal(r.fonte, 'BCB_PTAX_VENDA');
  assert.equal(r.fechamento_anterior, false);
  assert.equal(r.publicada_em, '2026-10-22T16:08:00.000Z');
});

test('consulta usa data de São Paulo, inclusive perto da meia-noite UTC', async () => {
  await consultarPtax({ agora: new Date('2026-10-23T01:00:00Z'), transporte: async url => {
    assert.equal(new URL(url).searchParams.get('@dataFinalCotacao'), "'10-22-2026'");
    return { ok: true, json: async () => ({ value: [boletim] }) };
  } });
});

test('antes do fechamento e em fim de semana conserva data real da última cotação', async () => {
  const anterior = { ...boletim, dataHoraCotacao: '2026-10-21 13:08:00.000' };
  const r = await consultarPtax({ agora: new Date('2026-10-22T11:00:00Z'), transporte: resposta(anterior) });
  assert.equal(r.data_referencia, '2026-10-21');
  assert.equal(r.fechamento_anterior, true);
  const fim = await consultarPtax({ agora: new Date('2026-10-25T11:00:00Z'), transporte: resposta(boletim) });
  assert.equal(fim.data_referencia, '2026-10-22');
  assert.equal(fim.fechamento_anterior, true);
});

test('conversão usa aritmética inteira e arredonda uma vez no total', () => {
  assert.equal(converterCentavosUsdParaBrl(19900, '5.1234'), 101956);
  assert.equal(converterCentavosUsdParaBrl(1, '1.5000'), 2);
  assert.equal(converterCentavosUsdParaBrl(3, '1.5000'), 5);
  for (const v of [0, -1, 1.1, NaN, '19900']) assert.throws(() => converterCentavosUsdParaBrl(v, '5.0000'));
  for (const t of ['0.0000', 'NaN', '5', '-5.0000', '5.00001', 5]) assert.throws(() => converterCentavosUsdParaBrl(19900, t));
  assert.throws(() => converterCentavosUsdParaBrl(99_999_999, '5.0000'));
});

test('falha, resposta vazia, cotação futura, antiga ou inválida bloqueiam emissão', async () => {
  const ruins = [null, { ...boletim, cotacaoVenda: 0 }, { ...boletim, cotacaoVenda: '5.1234' },
    { ...boletim, cotacaoVenda: 5.12345 }, { ...boletim, dataHoraCotacao: '2026-10-23 13:08:00.000' },
    { ...boletim, dataHoraCotacao: '2026-10-22 20:00:00.000' }, { ...boletim, dataHoraCotacao: '2026-10-01 13:08:00.000' }];
  for (const r of ruins) await assert.rejects(consultarPtax({ agora, transporte: resposta(r) }));
  await assert.rejects(consultarPtax({ agora, transporte: async () => { throw new Error('network'); } }), /indisponível/);
  await assert.rejects(consultarPtax({ agora, transporte: async () => ({ ok: false }) }), /indisponível/);
});

test('mesmo pedido mantém valor e cotação após reiniciar banco e trocar o dia', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'greenia-stripe-cambio-'));
  const arquivo = join(pasta, 'plataforma.sqlite');
  let db = new DatabaseSync(arquivo);
  try {
    const a = await cotarCobrancaBrl(db, pedido, { agora, transporte: resposta(boletim) });
    db.close();
    db = new DatabaseSync(arquivo);
    const b = await cotarCobrancaBrl(db, pedido, { agora: new Date('2026-10-23T18:00:00Z'), transporte: () => assert.fail('não recotar reenvio') });
    assert.deepEqual(a, b);
    const c = await cotarCobrancaBrl(db, { ...pedido, pedido: 'pedido_00002' }, { agora: new Date('2026-10-23T18:00:00Z'),
      transporte: resposta({ cotacaoVenda: 5.5, dataHoraCotacao: '2026-10-23 13:08:00.000' }) });
    assert.equal(c.total_brl_centavos, 109450);
    assert.notEqual(c.total_brl_centavos, a.total_brl_centavos);
  } finally { db.close(); rmSync(pasta, { recursive: true, force: true }); }
});

test('reutilização de pedido entre empresas, produtos ou valores é recusada', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await cotarCobrancaBrl(db, pedido, { agora, transporte: resposta(boletim) });
    for (const mudanca of [{ empresa: 'outra' }, { produto: 'team' }, { usd_centavos: 39900 }, { quantidade: 2 }]) {
      await assert.rejects(cotarCobrancaBrl(db, { ...pedido, ...mudanca }, { transporte: () => assert.fail('rede') }), /outros dados/);
    }
  } finally { db.close(); }
});

test('emissões simultâneas do mesmo pedido recuperam um único snapshot', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const [a,b] = await Promise.all([
      cotarCobrancaBrl(db, pedido, { agora, transporte: resposta(boletim) }),
      cotarCobrancaBrl(db, pedido, { agora, transporte: resposta({ ...boletim, cotacaoVenda: 5.2 }) }),
    ]);
    assert.deepEqual(a,b);
    assert.equal(db.prepare('select count(*) n from stripe_cotacoes').get().n, 1);
  } finally { db.close(); }
});
