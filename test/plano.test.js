// Plano contratado: créditos, 80%, só rápido em 100%, bloqueio no fim da reserva,
// pacote do operador, renovação no mês seguinte, e nenhum dólar para quem não é operador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { lerPlano, situacaoPlano } from '../src/plano.js';
import { um } from '../src/db.js';

let S, OR, admin, op, relogio = new Date('2026-09-10T12:00:00Z');
const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5';
before(async () => {
  OR = await openRouterFalso({ custo: 0.04 });   // cada resposta: 4 créditos
  S = await subir({ ia: OR.ia, agora: () => relogio, plano: { creditos: 10, reserva: 10, precoUsd: 750 }, operadores: ['suporte@operadora.com'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  op = await S.cliente().entrar('suporte@operadora.com');
});
after(async () => { await S.fechar(); await OR.fechar(); });

const emails = para => S.app.email.enviados.filter(m => m.para === para).map(m => m.assunto);
async function enviar(modelo) {
  const c = (await admin.post('/api/conversas', {})).dados.conversa;
  return enviarMensagem(admin, c.id, { texto: 'Resuma o texto', modelo });
}

test('variáveis do servidor: PLANO_CREDITOS e reserva de 20% por padrão', () => {
  assert.equal(lerPlano({}), null);
  assert.deepEqual(lerPlano({ PLANO_CREDITOS: '25000' }), { creditos: 25000, reserva: 5000, precoUsd: null });
  assert.deepEqual(lerPlano({ PLANO_CREDITOS: '10000', PLANO_RESERVA: '2000', PLANO_PRECO_USD: '290' }), { creditos: 10000, reserva: 2000, precoUsd: 290 });
});

test('operador de outro domínio entra; só ele vê dólar e preços dos modelos', async () => {
  assert.equal((await op.get('/api/eu')).dados.operador, true);
  assert.equal((await admin.get('/api/eu')).dados.unidade, 'creditos');
  assert.equal((await op.get('/api/eu')).dados.unidade, 'usd');
  const deAdmin = (await admin.get('/api/admin/modelos')).dados;
  assert.ok(!JSON.stringify(deAdmin).includes('precoEntrada'));
  assert.ok(JSON.stringify((await op.get('/api/admin/modelos')).dados).includes('precoEntrada'));
  // Qualquer outro domínio continua recusado.
  assert.equal((await S.cliente().post('/api/login/codigo', { email: 'alguem@outra.com' })).status, 403);
});

test('mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email', async () => {
  let r = await enviar(EQUILIBRADO);                     // 0 → 4
  assert.ok(r.fim);
  r = await enviar(EQUILIBRADO);                         // 4 → 8 (80%)
  assert.equal(situacaoPlano(S.app).fase, 'aviso');
  assert.ok(emails('admin@exemplo.com.br').some(a => /80% dos créditos/.test(a)));
  assert.ok(emails('suporte@operadora.com').some(a => /80% dos créditos/.test(a)));
  r = await enviar(EQUILIBRADO);                         // 8 → 12: plano acabou, reserva com 2
  assert.equal(situacaoPlano(S.app).fase, 'reserva');
  assert.ok(emails('admin@exemplo.com.br').some(a => /só o modelo rápido/.test(a)));
  // Na reserva: o pedido pelo equilibrado vira rápido, com aviso na conversa; o seletor marca os outros como bloqueados.
  const opcoes = (await admin.get('/api/modelos')).dados.opcoes;
  assert.equal(opcoes.find(o => o.id === 'classe:equilibrado').bloqueado, true);
  assert.ok(!opcoes.find(o => o.id === 'classe:rapido').bloqueado);
  const antes = OR.chamadas.length;
  r = await enviar(EQUILIBRADO);                         // reserva 2 → 6
  assert.equal(OR.chamadas[antes].model, RAPIDO);
  assert.equal((await admin.get('/api/eu')).dados.plano.fase, 'reserva');
  r = await enviar(RAPIDO);                              // reserva 6 → 10: acabou
  assert.equal(situacaoPlano(S.app).fase, 'esgotado');
  assert.ok(emails('admin@exemplo.com.br').some(a => /quase no fim/.test(a)));
  assert.ok(emails('admin@exemplo.com.br').some(a => /pausado/.test(a)));
  r = await enviar(RAPIDO);
  assert.equal(r.status, 429);
  assert.equal(r.erro.erro, 'plano_esgotado');
  // Cada aviso só uma vez no mês.
  assert.equal(emails('admin@exemplo.com.br').filter(a => /80% dos créditos/.test(a)).length, 1);
});

test('o cliente vê créditos, nunca dólar: uso, eventos, tetos e CSV', async () => {
  const uso = (await admin.get('/api/admin/uso')).dados;
  assert.equal(uso.totais.custo, 20);                     // US$ 0,20 = 20 créditos
  const usoOp = (await op.get('/api/admin/uso')).dados;
  assert.ok(Math.abs(usoOp.totais.custo - 0.2) < 1e-9);
  const ev = (await admin.get('/api/admin/eventos?tipo=credits.consumed')).dados.eventos[0];
  assert.ok(!ev.detalhes.includes('"custo"') && ev.detalhes.includes('"creditos":4'));
  const csv = (await admin.get('/api/admin/uso?formato=csv')).dados;
  assert.match(csv, /créditos/);
  assert.doesNotMatch(csv, /US\$/);
  // Tetos: o admin digita em créditos; o servidor guarda em dólar.
  assert.equal((await admin.put('/api/admin/config', { tetoPessoaMensal: 500 })).status, 200);
  assert.equal((await admin.get('/api/admin/config')).dados.tetoPessoaMensal, 500);
  assert.equal((await op.get('/api/admin/config')).dados.tetoPessoaMensal, 5);
  // Só o operador vê o resumo com custo real e libera pacotes.
  assert.equal((await admin.get('/api/operador/plano')).status, 403);
  assert.equal((await admin.post('/api/operador/pacotes', { creditos: 20 })).status, 403);
  const res = (await op.get('/api/operador/plano')).dados.resumo;
  assert.ok(res.custoComTaxa > 0.2 && res.lucroSemServidor > 749);
});

test('pacote do operador volta todos os modelos, o que sobra passa para o mês seguinte, e a renovação avisa', async () => {
  const r = (await op.post('/api/operador/pacotes', { creditos: 20 })).dados.resumo;
  assert.equal(r.fase, 'pacote');
  assert.equal(r.pacoteDisponivel, 10);                  // 10 cobriram o que passou do plano
  assert.ok(emails('admin@exemplo.com.br').some(a => /pacote extra/.test(a)));
  const antes = OR.chamadas.length;
  await enviar(EQUILIBRADO);                             // pacote 10 → 6
  assert.equal(OR.chamadas[antes].model, EQUILIBRADO);
  // Mês seguinte: plano renovado, sobra do pacote preservada, aviso de renovação.
  relogio = new Date('2026-10-02T12:00:00Z');
  const s = situacaoPlano(S.app);
  assert.deepEqual([s.fase, s.usados, s.pacoteDisponivel], ['normal', 0, 6]);
  // O pacote já avisou que tudo voltou ao normal: na virada, não há aviso de renovação.
  const { verificarAvisos } = await import('../src/plano.js');
  assert.deepEqual(await verificarAvisos(S.app), []);
});

test('mês que terminou só no rápido: na virada, o admin recebe o aviso de renovação', async () => {
  let t = new Date('2026-09-20T12:00:00Z');
  const T = await subir({ ia: OR.ia, agora: () => t, plano: { creditos: 4, reserva: 100 } });
  const a = await T.cliente().entrar('admin@exemplo.com.br');
  const c = (await a.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(a, c.id, { texto: 'Oi' });       // 4 de 4: só rápido
  assert.equal(situacaoPlano(T.app).fase, 'reserva');
  t = new Date('2026-10-01T09:00:00Z');
  const { verificarAvisos } = await import('../src/plano.js');
  assert.deepEqual(await verificarAvisos(T.app), ['renovado']);
  assert.ok(T.app.email.enviados.some(m => /renovados/.test(m.assunto)));
  assert.deepEqual(await verificarAvisos(T.app), []);
  await T.fechar();
});

test('sem plano, nada muda: o admin vê dólar e não há bloqueio', async () => {
  const T = await subir({ ia: OR.ia });
  const a = await T.cliente().entrar('admin@exemplo.com.br');
  assert.equal((await a.get('/api/eu')).dados.unidade, 'usd');
  assert.equal((await a.get('/api/eu')).dados.plano, null);
  assert.ok(JSON.stringify((await a.get('/api/admin/modelos')).dados).includes('precoEntrada'));
  await T.fechar();
});

test('preço de modelo liberado muda mais de 20%: evento e email ao operador; a empresa não é avisada sem decisão do operador', async () => {
  const OR2 = await openRouterFalso({ modelos: [{ id: RAPIDO, name: 'Gemini 3.5 Flash Lite', pricing: { prompt: '0.0000006', completion: '0.000005' }, context_length: 1048576 }] });
  const T = await subir({ ia: OR2.ia, plano: { creditos: 100, reserva: 20 }, operadores: ['suporte@operadora.com'] });
  const { atualizarCatalogo } = await import('../src/modelos.js');
  await atualizarCatalogo(T.app);
  await new Promise(r => setTimeout(r, 20));
  const mail = T.app.email.enviados.find(m => m.para === 'suporte@operadora.com');
  assert.match(mail.assunto, /mudou mais de 20%/);
  assert.match(mail.texto, /US\$ 0\.30 → US\$ 0\.60/);
  assert.ok(!T.app.email.enviados.some(m => m.para === 'admin@exemplo.com.br' && /mudou/.test(m.assunto)));
  const a = await T.cliente().entrar('admin@exemplo.com.br');
  try {
    assert.equal((await a.get('/api/admin/modelos')).dados.modelos.find(m => m.id === RAPIDO).aviso, null);
    assert.ok(um(T.app.db, "select 1 from eventos where tipo = 'model.price_changed'"));
  } finally { await T.fechar(); await OR2.fechar(); }
});
