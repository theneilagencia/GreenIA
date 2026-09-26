// Chat: streaming pelo OpenRouter (falso), filtro no servidor, catálogo e acesso
// por perfil, homologação, conversas sigilosas, privacidade e retenção.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { montarCorpo } from '../src/ia.js';
import { apagarVencidas } from '../src/conversas.js';

const HOMOLOGADO = 'mistralai/mistral-small';
const AVANCADO = 'anthropic/claude-sonnet-4.5';
const RAPIDO = 'google/gemini-2.5-flash';
const enc = encodeURIComponent;
let S, OR, admin, ana;
let agora = new Date('2026-09-26T12:00:00Z');

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia, agora: () => agora });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  assert.equal((await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { liberado: true, perfil: 'rapido' })).status, 200);
  const h = await admin.post(`/api/admin/modelos/${enc(HOMOLOGADO)}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Fornecedor com retenção zero e sem treino, conferido no OpenRouter.' });
  assert.equal(h.status, 200, JSON.stringify(h.dados));
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

const novaConversa = async (c = ana, corpo = {}) => (await c.post('/api/conversas', corpo)).dados.conversa;

test('chat com streaming: persona no system, resposta gravada, custo informado pelo OpenRouter', async () => {
  const conv = await novaConversa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Resuma este parágrafo sobre o novo processo de compras.' });
  assert.equal(r.status, 200);
  assert.match(r.texto, /^Resposta de google\/gemini-2\.5-flash/);
  assert.equal(r.fim.modelo, RAPIDO);
  const chamada = OR.chamadas[n];
  assert.equal(chamada.messages[0].role, 'system');
  assert.match(chamada.messages[0].content, /Você é a GreenIA/);
  assert.equal(chamada.stream, true);
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant']);
  assert.equal(d.conversa.titulo, 'Resuma este parágrafo sobre o novo processo de compras.');
  const uso = um(S.app.db, 'select custo, modelo_usado, economia from uso where conversa_id = ?', conv.id);
  assert.equal(uso.custo, 0.00123);
  assert.equal(uso.modelo_usado, RAPIDO);
  assert.equal(uso.economia, 0.0001);
});

test('preferências de privacidade em toda chamada: normal pede fornecedor sem treino; o admin pode desligar', () => {
  assert.deepEqual(montarCorpo([], { modelo: 'x/y' }).provider, { data_collection: 'deny' });
  assert.deepEqual(montarCorpo([], { modelo: 'x/y', semTreino: false }).provider, { data_collection: 'allow' });
  assert.ok(OR.chamadas.every(c => c.provider && 'data_collection' in c.provider));
});

test('modelo fora da lista liberada é recusado pela API', async () => {
  const conv = await novaConversa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: 'openai/gpt-4o' });
  assert.equal(r.status, 403);
  assert.equal(r.erro.erro, 'modelo_nao_liberado');
  assert.equal(OR.chamadas.length, n);
});

test('acesso por perfil: sem o Avançado, a pessoa não vê nem usa modelo Avançado no chat', async () => {
  const opcoes = (await ana.get('/api/modelos')).dados.opcoes.map(o => o.id);
  assert.ok(opcoes.includes(RAPIDO) && opcoes.includes('openai/gpt-5-mini'));
  assert.ok(!opcoes.includes(AVANCADO));
  const conv = await novaConversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: AVANCADO });
  assert.equal(r.status, 403);
  assert.equal(r.erro.erro, 'modelo_sem_acesso');
  // Liberado para um grupo do qual ela faz parte: passa a ver e usar; a mudança fica no log.
  const g = (await admin.post('/api/admin/grupos', { nome: 'Analistas' })).dados;
  await admin.put(`/api/admin/grupos/${g.id}`, { pessoas: [ana.pessoa.id] });
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: false, grupos: [g.id] } } });
  assert.ok((await ana.get('/api/modelos')).dados.opcoes.some(o => o.id === AVANCADO));
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: AVANCADO })).status, 200);
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'config_modelos'"));
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: false } } });
});

test('trocar de modelo no meio da conversa funciona e fica registrado na conversa', async () => {
  const conv = await novaConversa();
  await enviarMensagem(ana, conv.id, { texto: 'Primeira pergunta' });
  const r = await enviarMensagem(ana, conv.id, { texto: 'Segunda pergunta', modelo: 'openai/gpt-5-mini' });
  assert.equal(r.fim.modelo, 'openai/gpt-5-mini');
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.ok(d.mensagens.some(m => m.papel === 'aviso' && /Modelo trocado para GPT-5 mini/.test(m.texto)));
  // O histórico vai junto para o novo modelo.
  assert.equal(OR.chamadas.at(-1).messages.filter(m => m.role !== 'system').length, 3);
});

test('falha do modelo principal usa o reserva e registra qual respondeu', async () => {
  await admin.put(`/api/admin/modelos/${enc('google/gemini-2.5-flash-lite')}`, { liberado: true, perfil: 'rapido' });
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: 'google/gemini-2.5-flash-lite' });
  OR.falhar.add(RAPIDO);
  const conv = await novaConversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá' });
  OR.falhar.delete(RAPIDO);
  assert.deepEqual(OR.chamadas.at(-1).models, [RAPIDO, 'google/gemini-2.5-flash-lite']);
  assert.equal(r.fim.modelo, 'google/gemini-2.5-flash-lite');
  assert.equal(r.fim.reserva, true);
  const u = um(S.app.db, 'select modelo_pedido, modelo_usado from uso where conversa_id = ?', conv.id);
  assert.deepEqual({ ...u }, { modelo_pedido: RAPIDO, modelo_usado: 'google/gemini-2.5-flash-lite' });
  const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'uso' order by id desc limit 1").detalhes);
  assert.equal(ev.modelo_usado, 'google/gemini-2.5-flash-lite');
  assert.ok(!('texto' in ev));
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: null });
});

test('filtro no servidor: CPF bloqueado no chat por padrão; credencial sempre, mesmo marcada como permitir', async () => {
  const conv = await novaConversa();
  const n = OR.chamadas.length;
  let r = await enviarMensagem(ana, conv.id, { texto: 'O CPF do cliente é 529.982.247-25' });
  assert.equal(r.status, 422);
  assert.deepEqual(r.erro.tipos, ['cpf']);
  const cfg = lerConfig(S.app.db);
  salvarConfig(S.app.db, { acoesChat: { ...cfg.acoesChat, credencial: 'permitir' } });
  r = await enviarMensagem(ana, conv.id, { texto: 'a senha: Primavera2026' });
  assert.equal(r.status, 422);
  assert.deepEqual(r.erro.tipos, ['credencial']);
  salvarConfig(S.app.db, { acoesChat: cfg.acoesChat });
  assert.equal(OR.chamadas.length, n);
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).dados.mensagens.length, 0);
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'bloqueio' order by id desc limit 1");
  assert.ok(!ev.detalhes.includes('Primavera'));
});

// Conversas sigilosas: a mensagem não vai a modelo não homologado; volta 409
// com o homologado padrão; o reenvio com ele funciona; a chave não desliga.
async function confereSigilosa(conv, corpo, motivo) {
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, corpo);
  assert.equal(r.status, 409, JSON.stringify(r.erro));
  assert.equal(r.erro.erro, 'precisa_homologado');
  assert.match(r.erro.mensagem, /passou a ter dados sigilosos e vai usar o modelo homologado/);
  assert.equal(r.erro.sugestao.id, HOMOLOGADO);
  assert.equal(OR.chamadas.length, n, 'nada foi enviado ao modelo não homologado');
  const ok = await enviarMensagem(ana, conv.id, { ...corpo, modelo: r.erro.sugestao.id });
  assert.equal(ok.status, 200);
  const chamada = OR.chamadas.at(-1);
  assert.equal(chamada.model, HOMOLOGADO);
  assert.deepEqual(chamada.provider, { order: ['Mistral'], only: ['Mistral'], allow_fallbacks: false, zdr: true, data_collection: 'deny' });
  assert.ok(!chamada.models, 'sem reserva de outro fornecedor');
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.equal(d.conversa.sigilosa, true);
  assert.equal((await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: false })).status, 409);
  const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'conversa_sigilosa' order by id desc limit 1").detalhes);
  assert.equal(ev.motivo, motivo);
}

test('sigilosa pela chave manual', async () => {
  const conv = await novaConversa();
  await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: true });
  await confereSigilosa(conv, { texto: 'Estratégia de preço do próximo trimestre.' }, 'manual');
});

test('sigilosa por dado detectado com "permitir" (CNPJ no chat)', async () => {
  const conv = await novaConversa();
  await confereSigilosa(conv, { texto: 'Confira o fornecedor CNPJ 11.222.333/0001-81.' }, 'dado:cnpj');
});

test('sigilosa por área marcada como "todas as conversas são sigilosas"', async () => {
  const areaId = Number(exec(S.app.db, "insert into areas (nome, sigilosa) values ('Área sigilosa', 1)").lastInsertRowid);
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
  const conv = await novaConversa();
  assert.equal(conv.sigilosa, true);
  await confereSigilosa(conv, { texto: 'Uma pergunta qualquer.' }, 'area');
  exec(S.app.db, 'delete from areas where id = ?', areaId);
});

test('sigilosa: o seletor mostra só homologados, e a pessoa usa o homologado padrão mesmo sem o perfil', async () => {
  const op = (await ana.get('/api/modelos?sigilosa=1')).dados.opcoes;
  assert.deepEqual(op.map(o => o.id), [HOMOLOGADO]);
});

test('sem nenhum homologado disponível para todos, a configuração é recusada', async () => {
  let r = await admin.del(`/api/admin/modelos/${enc(HOMOLOGADO)}/homologar`);
  assert.equal(r.status, 409);
  assert.equal(r.dados.erro, 'sem_homologado');
  r = await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { perfil: 'avancado' });
  assert.equal(r.status, 409);
  r = await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { liberado: false });
  assert.equal(r.status, 409);
  assert.equal(um(S.app.db, 'select homologado from modelos where id = ?', HOMOLOGADO).homologado, 1);
  // Homologar exige fornecedor, as duas garantias e justificativa.
  r = await admin.post(`/api/admin/modelos/${enc(RAPIDO)}/homologar`, { fornecedor: 'Google', semTreino: true, justificativa: 'sem retenção' });
  assert.equal(r.status, 400);
});

test('privacidade: outra pessoa e o admin não leem a conversa pela API', async () => {
  const conv = await novaConversa();
  await enviarMensagem(ana, conv.id, { texto: 'Rascunho de email para a equipe.' });
  const bia = await S.cliente().entrar('bia@exemplo.com.br');
  for (const c of [bia, admin]) {
    assert.equal((await c.get(`/api/conversas/${conv.id}`)).status, 404);
    assert.equal((await c.patch(`/api/conversas/${conv.id}`, { titulo: 'x' })).status, 404);
    assert.equal((await c.del(`/api/conversas/${conv.id}`)).status, 404);
    assert.ok(!(await c.get('/api/conversas')).dados.conversas.some(x => x.id === conv.id));
  }
});

test('retenção: conversas sem uso há mais que o prazo são apagadas, com registro', async () => {
  const conv = await novaConversa();
  await enviarMensagem(ana, conv.id, { texto: 'Mensagem antiga' });
  agora = new Date(agora.getTime() + 91 * 864e5);
  ana = await S.cliente().entrar('ana@exemplo.com.br');   // a sessão também venceu
  const recente = await novaConversa();
  assert.ok(apagarVencidas(S.app) >= 1);
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).status, 404);
  assert.equal((await ana.get(`/api/conversas/${recente.id}`)).status, 200);
  assert.equal(um(S.app.db, 'select count(*) n from mensagens where conversa_id = ?', conv.id).n, 0);
  assert.ok(um(S.app.db, `select 1 from eventos where tipo = 'conversa_apagada' and detalhes like '%"por":"retencao"%'`));
});
