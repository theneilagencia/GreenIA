// Medição dos quick wins, decisões, problemas reportados e modelos gratuitos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';

let S, OR, admin, ana, carlos, qw;
before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  const A = (await admin.post('/api/admin/areas', { nome: 'Área Alfa' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'carlos@exemplo.com.br', nome: 'Carlos Dias', areas: [{ id: A.id }] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  carlos = await S.cliente().entrar('carlos@exemplo.com.br');
  qw = (await ana.post('/api/quick-wins', { nome: 'Conferência', areas: [A.id] })).dados;
  await ana.put(`/api/quick-wins/${qw.id}`, { status: 'ativo' });
  for (let i = 0; i < 2; i++) {
    const c = (await carlos.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
    await enviarMensagem(carlos, c.id, { texto: 'Confira' });
    if (i === 0) await carlos.patch(`/api/conversas/${c.id}`, { feedback: 'serviu' });
  }
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('medição sem valor antes mostra "sem ponto de partida" e não calcula nada; com antes e depois, mostra a variação', async () => {
  let r = await ana.post(`/api/quick-wins/${qw.id}/medicoes`, { indicador: 'minutos por documento conferido', depois_valor: '12', depois_data: '2026-09-20', depois_origem: 'medido' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  let m = r.dados.medicoes[0];
  assert.equal(m.situacao, 'sem ponto de partida');
  assert.equal(m.variacao, null);
  assert.equal(m.percentual, null);
  r = await ana.put(`/api/quick-wins/${qw.id}/medicoes/${m.id}`, { indicador: m.indicador, antes_valor: '30', antes_data: '2026-08-01', antes_origem: 'informado', depois_valor: '12', depois_data: '2026-09-20', depois_origem: 'medido' });
  m = r.dados.medicoes[0];
  assert.deepEqual([m.situacao, m.variacao, m.percentual], ['com antes e depois', -18, -60]);
  // Valor sem data ou sem origem é recusado.
  assert.equal((await ana.post(`/api/quick-wins/${qw.id}/medicoes`, { indicador: 'x', antes_valor: 5 })).status, 400);
});

test('uso automático por mês: conversas (não mensagens), pessoas, feedback e custo', async () => {
  const d = (await ana.get(`/api/quick-wins/${qw.id}/medicao`)).dados;
  const u = d.usoMensal[0];
  assert.deepEqual([u.conversas, u.mensagens, u.pessoas, u.serviu, u.sem_feedback], [2, 2, 1, 1, 1]);
  assert.ok(u.custo > 0);
});

test('decisão com data, quem decidiu e por quê; CSV com uso, medições e decisões; só quem gerencia', async () => {
  assert.equal((await ana.post(`/api/quick-wins/${qw.id}/decisoes`, { decisao: 'ampliar', motivo: '' })).status, 400);
  const r = await ana.post(`/api/quick-wins/${qw.id}/decisoes`, { decisao: 'ampliar', motivo: 'Serviu para o time; vale levar para outra área.' });
  assert.equal(r.dados.decisoes[0].por, 'ana@exemplo.com.br');
  const csv = await ana.get(`/api/quick-wins/${qw.id}/medicao.csv`);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.dados, /minutos por documento conferido;30;2026-08-01;informado;12/);
  assert.match(csv.dados, /com antes e depois;-18;/);
  assert.match(csv.dados, /decisão;ampliar;"Serviu para o time; vale/);
  for (const url of [`/api/quick-wins/${qw.id}/medicao`, `/api/quick-wins/${qw.id}/medicao.csv`]) assert.equal((await carlos.get(url)).status, 404);
  assert.equal((await carlos.post(`/api/quick-wins/${qw.id}/decisoes`, { decisao: 'descartar', motivo: 'não gostei' })).status, 404);
});

test('problema reportado: gravado, email ao admin, evento sem a descrição', async () => {
  const r = await carlos.post('/api/problemas', { tipo: 'resposta', descricao: 'A resposta inventou um prazo de entrega.' });
  assert.equal(r.status, 200);
  const mail = S.app.email.enviados.filter(m => m.para === 'admin@exemplo.com.br').at(-1);
  assert.match(mail.assunto, /problema reportado \(Resposta errada ou inventada\)/);
  assert.match(mail.texto, /inventou um prazo/);
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'problema_reportado' order by id desc limit 1").detalhes;
  assert.ok(!ev.includes('inventou'));
  const lista = (await admin.get('/api/admin/problemas')).dados.problemas;
  assert.equal(lista[0].email, 'carlos@exemplo.com.br');
  assert.equal((await carlos.get('/api/admin/problemas')).status, 403);
  assert.equal((await admin.put(`/api/admin/problemas/${lista[0].id}`, { resolvido: true })).status, 200);
});

test('modelo gratuito: liberado com aviso, nunca homologado', async () => {
  const id = encodeURIComponent('meta-llama/llama-3.3-70b-instruct:free');
  const r = await admin.put(`/api/admin/modelos/${id}`, { liberado: true, perfil: 'rapido' });
  assert.match(r.dados.aviso, /Modelo gratuito/);
  const h = await admin.post(`/api/admin/modelos/${id}/homologar`, { fornecedor: 'x', semTreino: true, retencaoZero: true, justificativa: 'tentativa indevida' });
  assert.equal(h.status, 400);
  assert.equal(h.dados.erro, 'nao_homologavel');
});
