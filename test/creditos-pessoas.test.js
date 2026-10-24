// Créditos para todas as pessoas: percentual e renovação visíveis (sem números nem valores), pedido de mais créditos
// (pessoa -> administrador; administrador -> equipe da plataforma) e a explicação no chat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';

let S, OR, admin, ana;
before(async () => {
  OR = await openRouterFalso({ custo: 0.04 });   // cada resposta: 4 créditos
  S = await subir({ ia: OR.ia, agora: () => new Date('2026-10-10T12:00:00Z'), plano: { creditos: 10, reserva: 10, precoUsd: 750 }, operadores: ['suporte@operadora.com'] });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('pessoa vê percentual e renovação (sem números do plano); ao passar de 80%, aviso para todos', async () => {
  const c = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, c.id, { texto: 'Resuma o texto' });
  await enviarMensagem(ana, c.id, { texto: 'Resuma de novo' });   // 8 de 10 créditos: 80%
  const p = (await ana.get('/api/eu')).dados.plano;
  assert.equal(p.percentual, 80); assert.equal(p.renova, '2026-11-01'); assert.equal(p.fase, 'aviso');
  assert.match(p.mensagem, /80%/);
  assert.equal(p.creditos, undefined, 'número do plano só para o admin'); assert.equal(p.usados, undefined);
  assert.equal((await admin.get('/api/eu')).dados.plano.creditos, 10);
});

test('pedido de mais créditos: pessoa avisa o administrador (uma vez por dia); administrador pede à equipe da plataforma', async () => {
  const r = await ana.post('/api/plano/pedido', {});
  assert.equal(r.status, 200); assert.ok(r.dados.plano.pedido);
  await ana.post('/api/plano/pedido', {});
  const { visaoGeral } = await import('../src/visao.js');
  assert.ok(visaoGeral(S.app).atencao.some(a => /1 pessoa pediu mais créditos/.test(a.texto)), 'admin vê o pedido');
  await admin.post('/api/plano/pedido', {});
  const { resumoInstancia } = await import('../src/operador.js');
  assert.ok(resumoInstancia(S.app).alertas.some(a => /administrador pediu um Capacity Pack/.test(a.texto)), 'equipe da plataforma vê o pedido');
});

test('no chat, pergunta sobre créditos tem os fatos da plataforma e a situação atual', async () => {
  const c = (await ana.post('/api/conversas', {})).dados.conversa;
  const antes = OR.chamadas.length;
  await enviarMensagem(ana, c.id, { texto: 'como são os créditos? se acabar consigo comprar como no Claude?' });
  const sis = JSON.stringify(OR.chamadas.slice(antes)[0].messages[0]);
  assert.match(sis, /créditos são da empresa/);
  assert.match(sis, /peça ao administrador/);
  assert.match(sis, /% dos créditos do plano usados neste ciclo/);
  assert.match(sis, /renovação em 01\/11\/2026/);
  assert.doesNotMatch(sis, /US\$|\$ ?\d/);
});
