import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { comCancelamento, opcoesCancelaveis } from '../src/cancelamento-chat.js';
import { contabilizarIA } from '../src/custo-ia.js';
import { caminhoChromium, comLeitorPdf } from '../src/visual/chromium.js';

test('interromper cancela a IA, impede duplicação, preserva o pedido e libera nova execução', async () => {
  let sinal, entrar, chamadas = 0, bloquear = true;
  const entrou = new Promise(r => { entrar = r; });
  const S = await subir({ ia: { async *enviar(msgs, op) {
    chamadas++; sinal = op.sinal; entrar();
    if (bloquear) { yield { tipo: 'texto', texto: 'Resposta parcial ainda em preparação' }; await esperar(60000, null, { signal: op.sinal }); }
    yield { tipo: 'texto', texto: 'Resposta completa' };
    yield { tipo: 'fim', modelo: op.modelo, custo: 0 };
  } } });
  try {
    salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
    const ana = await S.cliente().entrar('admin@exemplo.com.br');
    const outra = await S.cliente().entrar('outra@exemplo.com.br');
    const c = (await ana.post('/api/conversas', {})).dados.conversa;
    const r = await fetch(S.base + `/api/conversas/${c.id}/mensagens`, {
      method: 'POST', headers: { cookie: ana.cookie, 'x-csrf': ana.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'Explique este processo' }),
    });
    const corpo = r.text(); await entrou;
    assert.equal((await ana.get(`/api/conversas/${c.id}`)).dados.conversa.em_execucao, true);
    assert.equal((await ana.post(`/api/conversas/${c.id}/mensagens`, { texto: 'Pedido duplicado' })).status, 409);
    assert.equal((await outra.post(`/api/conversas/${c.id}/interromper`, {})).status, 404);
    assert.equal(sinal.aborted, false, 'outra pessoa não interrompe');
    assert.equal((await ana.post(`/api/conversas/${c.id}/interromper`, {})).dados.interrompida, true);
    assert.equal(sinal.aborted, true);
    assert.match(await corpo, /"t":"interrompido"/);
    const d = (await ana.get(`/api/conversas/${c.id}`)).dados;
    assert.equal(d.conversa.em_execucao, false);
    assert.ok(d.mensagens.some(m => m.papel === 'user' && m.texto === 'Explique este processo'));
    assert.ok(d.mensagens.some(m => m.papel === 'aviso' && /interrompida/.test(m.texto)));
    assert.ok(!d.mensagens.some(m => m.papel === 'assistant'), 'parcial não vira resposta concluída');
    assert.equal(um(S.app.db, 'select count(*) n from arquivos_gerados where conversa_id = ?', c.id).n, 0);
    assert.equal(um(S.app.db, 'select resultado from roteamento where conversa_id = ?', c.id).resultado, 'interrompido');
    assert.equal(chamadas, 1, 'sem repetição automática');
    assert.equal((await ana.post(`/api/conversas/${c.id}/interromper`, {})).dados.interrompida, false);
    bloquear = false;
    const novo = await ana.post(`/api/conversas/${c.id}/mensagens`, { texto: 'Explique novamente' });
    assert.match(novo.dados, /"t":"fim"/);
  } finally { await S.fechar(); }
});

test('cancelamento vale para imagem e chamadas auxiliares e não escapa entre execuções', async () => {
  const c = new AbortController(), outro = new AbortController();
  await Promise.all([
    comCancelamento(c.signal, async () => { c.abort(); assert.throws(() => opcoesCancelaveis({}), { name: 'AbortError' }); }),
    comCancelamento(outro.signal, async () => { await esperar(1); assert.equal(opcoesCancelaveis({}).sinal.aborted, false); }),
  ]);
  let imagens = 0;
  const ia = contabilizarIA({ db: null }, { async gerarImagem() { imagens++; } });
  await assert.rejects(comCancelamento(c.signal, () => ia.gerarImagem('teste', {})), { name: 'AbortError' });
  assert.equal(imagens, 0);
});

test('interromper fecha o leitor PDF ativo e libera sua fila', { skip: !caminhoChromium() }, async () => {
  const c = new AbortController();
  await assert.rejects(comCancelamento(c.signal, () => comLeitorPdf(Buffer.from('teste'), async page => {
    const timer = setTimeout(() => c.abort(), 25);
    try { return await page.evaluate(() => new Promise(() => {})); } finally { clearTimeout(timer); }
  })), /closed|Target|abort/i);
  assert.equal(await comLeitorPdf(Buffer.from('teste'), page => page.evaluate(() => 'fila livre')), 'fila livre');
});

test('interromper durante a edição do PPTX cancela a chamada auxiliar sem criar arquivo parcial', async () => {
  const { pptx } = await import('../src/escritorio.js');
  let chamadas = 0, entrar, abortado = false;
  const entrou = new Promise(r => { entrar = r; });
  const S = await subir({ ia: { async *enviar(msgs, op) {
    chamadas++;
    if (chamadas === 1) yield { tipo: 'texto', texto: 'Vou corrigir o arquivo enviado.' };
    else {
      entrar();
      try { await esperar(60000, null, { signal: op.sinal }); } catch (e) { abortado = op.sinal.aborted; throw e; }
    }
    yield { tipo: 'fim', modelo: op.modelo, custo: 0 };
  } } });
  try {
    const ana = await S.cliente().entrar('admin@exemplo.com.br');
    const c = (await ana.post('/api/conversas', {})).dados.conversa;
    const r = await fetch(S.base + `/api/conversas/${c.id}/mensagens`, {
      method: 'POST', headers: { cookie: ana.cookie, 'x-csrf': ana.csrf, 'content-type': 'application/json' },
      body: JSON.stringify({ texto: 'Corrija a ortografia no próprio arquivo PowerPoint anexo, mantendo o resto igual.', anexos: [{ nome: 'Kickoff.pptx', base64: pptx('# Kickoff\n\n## Agenda\nTexto a corrigir').toString('base64') }] }),
    });
    const corpo = r.text(); await entrou;
    await ana.post(`/api/conversas/${c.id}/interromper`, {});
    assert.match(await corpo, /"t":"interrompido"/);
    assert.equal(abortado, true);
    assert.equal(chamadas, 2, 'nenhuma nova chamada depois de cancelar');
    const d = (await ana.get(`/api/conversas/${c.id}`)).dados;
    assert.equal(d.conversa.em_execucao, false);
    assert.ok(d.mensagens.find(m => m.papel === 'user').anexos.includes('Kickoff.pptx'));
    assert.equal(um(S.app.db, 'select count(*) n from arquivos_gerados where conversa_id = ?', c.id).n, 0);
  } finally { await S.fechar(); }
});
