// "Gerar de novo" (QA UX M13): nova resposta ao mesmo último pedido, pelo mesmo caminho de um envio.
// Cobrança registrada, dono da conversa, só a última resposta, plano esgotado bloqueia, falha mantém a anterior.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { exec, todos, um } from '../src/db.js';

let S, OR, admin, ana, bia;
const relogio = new Date('2026-09-10T12:00:00Z');

before(async () => {
  OR = await openRouterFalso({ custo: 0.01 });   // cada resposta: 1 crédito
  S = await subir({ ia: OR.ia, agora: () => relogio, plano: { creditos: 1000, reserva: 100, precoUsd: 750 } });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana' });
  await admin.post('/api/admin/pessoas', { email: 'bia@exemplo.com.br', nome: 'Bia' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function regenerar(c, conversaId, corpo) {
  const r = await c.req('POST', `/api/conversas/${conversaId}/regenerar`, corpo);
  if (typeof r.dados === 'object') return { status: r.status, erro: r.dados };
  const eventos = r.dados.trim().split('\n').map(l => JSON.parse(l));
  return { status: r.status, eventos, texto: eventos.filter(e => e.t === 'texto').map(e => e.v).join(''), fim: eventos.find(e => e.t === 'fim'), falha: eventos.find(e => e.t === 'erro') };
}
async function conversaComResposta(c = ana, texto = 'Resuma o processo de compras em três pontos.') {
  const conv = (await c.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(c, conv.id, { texto });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  return { conv, resposta: r.fim.id };
}
const contar = (sql, ...a) => um(S.app.db, sql, ...a).n;

test('gera de novo a última resposta: substitui a anterior, mantém o pedido, cobra e registra o uso das duas', async () => {
  const { conv, resposta } = await conversaComResposta();
  await ana.patch(`/api/conversas/${conv.id}`, { feedback: 'nao_serviu', motivo: 'faltou detalhe' });
  const chamadas = OR.chamadas.length;
  const r = await regenerar(ana, conv.id, { mensagem_id: resposta });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.ok(r.fim && r.fim.id > resposta);
  assert.match(r.texto, /para: Resuma o processo de compras/);
  // A IA recebe o mesmo pedido como última mensagem, sem a resposta anterior no histórico.
  const enviada = OR.chamadas[chamadas].messages.slice(1);
  assert.deepEqual(enviada.map(m => m.role), ['user']);
  assert.match(enviada[0].content, /Resuma o processo de compras/);
  // Conversa: um pedido e só a nova resposta; avaliação volta a ficar em aberto.
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.filter(m => m.papel !== 'aviso').map(m => [m.papel, m.id === r.fim.id || m.papel === 'user']), [['user', true], ['assistant', true]]);
  assert.equal(d.conversa.feedback, null);
  // Cobrança: o uso e o custo das duas respostas ficam registrados (créditos consumidos duas vezes).
  assert.equal(contar('select count(*) as n from uso where conversa_id = ?', conv.id), 2);
  assert.equal(contar("select count(*) as n from eventos where tipo = 'credits.consumed' and detalhes like ?", `%"conversa":${conv.id},%`), 2);
  assert.equal(contar("select count(*) as n from eventos where tipo = 'conversation.regenerated' and detalhes like ?", `%"conversa":${conv.id},%`), 1);
  // Roteamento: a decisão anterior fica marcada como refeita e ligada à nova.
  const rotas = todos(S.app.db, "select id, resposta_id, refeito, nova_tentativa_de, mensagem_id from roteamento where conversa_id = ? order by id", conv.id);
  assert.equal(rotas.length, 2);
  assert.equal(rotas[0].refeito, 1);
  assert.equal(rotas[1].nova_tentativa_de, rotas[0].id);
  assert.equal(rotas[1].resposta_id, r.fim.id);
  assert.equal(rotas[0].mensagem_id, rotas[1].mensagem_id, 'o mesmo pedido, sem duplicar a mensagem');
});

test('só quem é dono da conversa gera de novo (404 para outra pessoa, nada é cobrado)', async () => {
  const { conv, resposta } = await conversaComResposta();
  const n = OR.chamadas.length, uso = contar('select count(*) as n from uso');
  const r = await regenerar(bia, conv.id, { mensagem_id: resposta });
  assert.equal(r.status, 404);
  assert.equal(OR.chamadas.length, n);
  assert.equal(contar('select count(*) as n from uso'), uso);
  assert.ok((await ana.get(`/api/conversas/${conv.id}`)).dados.mensagens.some(m => m.id === resposta));
});

test('só a última resposta: uma resposta anterior ou um id qualquer é recusado sem chamar a IA', async () => {
  const { conv, resposta: primeira } = await conversaComResposta();
  const segunda = (await enviarMensagem(ana, conv.id, { texto: 'Agora em formato de lista.' })).fim.id;
  const n = OR.chamadas.length;
  for (const id of [primeira, segunda + 999, undefined]) {
    const r = await regenerar(ana, conv.id, { mensagem_id: id });
    assert.equal(r.status, 409);
    assert.equal(r.erro.erro, 'regerar_so_ultima');
  }
  assert.equal(OR.chamadas.length, n);
  // Conversa sem resposta também não tem o que gerar de novo.
  const vazia = (await ana.post('/api/conversas', {})).dados.conversa;
  assert.equal((await regenerar(ana, vazia.id, { mensagem_id: 1 })).status, 409);
});

test('conversa de teste de Quick Win: indisponível (o fluxo de execução e conferência fica como está)', async () => {
  const { conv, resposta } = await conversaComResposta();
  exec(S.app.db, 'update conversas set teste = 1 where id = ?', conv.id);
  const r = await regenerar(ana, conv.id, { mensagem_id: resposta });
  assert.equal(r.status, 409);
  assert.equal(r.erro.erro, 'regerar_indisponivel');
});

test('falha da IA ao gerar de novo: a resposta anterior continua na conversa', async () => {
  const { conv, resposta } = await conversaComResposta();
  const ultima = OR.chamadas.at(-1);
  for (const m of [ultima.model, ...(ultima.models || [])]) OR.falhar.add(m);
  try {
    const r = await regenerar(ana, conv.id, { mensagem_id: resposta });
    assert.equal(r.status, 200);
    assert.ok(r.falha && !r.fim);
  } finally { OR.falhar.clear(); }
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.filter(m => m.papel === 'assistant').map(m => m.id), [resposta]);
});

test('plano esgotado bloqueia gerar de novo como qualquer envio, e a resposta anterior fica', async () => {
  const { conv, resposta } = await conversaComResposta();
  exec(S.app.db, "insert into uso (em, custo) values (?, 20)", relogio.toISOString());   // 2.000 créditos: acabou o mês e a reserva
  try {
    const n = OR.chamadas.length;
    const r = await regenerar(ana, conv.id, { mensagem_id: resposta });
    assert.equal(r.status, 429);
    assert.equal(r.erro.erro, 'plano_esgotado');
    assert.equal(OR.chamadas.length, n);
    const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
    assert.deepEqual(d.mensagens.filter(m => m.papel === 'assistant').map(m => m.id), [resposta]);
  } finally { exec(S.app.db, 'delete from uso where conversa_id is null'); }
});

test('política de dados vale ao gerar de novo: sigilo não permitido bloqueia, avisa e mantém a resposta anterior', async () => {
  const { conv, resposta } = await conversaComResposta();
  assert.equal((await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: true })).status, 200);
  const n = OR.chamadas.length;
  const r = await regenerar(ana, conv.id, { mensagem_id: resposta });
  assert.equal(r.status, 409);
  assert.equal(r.erro.erro, 'sigilo_nao_permitido');
  assert.equal(OR.chamadas.length, n);
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.ok(d.mensagens.some(m => m.id === resposta));
  assert.ok(d.mensagens.some(m => m.papel === 'aviso' && /A nova resposta não foi gerada\..*A resposta anterior foi mantida\./.test(m.texto)));
});
