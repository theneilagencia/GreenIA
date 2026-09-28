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

// Modelo que de fato respondeu, pelo registro (a resposta para quem não administra não traz identificador técnico).
const usado = r => um(S.app.db, 'select modelo_usado from roteamento where resposta_id = ?', r.fim.id)?.modelo_usado;


const HOMOLOGADO = 'mistralai/mistral-small';
const AVANCADO = 'anthropic/claude-sonnet-5';
const RAPIDO = 'google/gemini-3.5-flash-lite';
const enc = encodeURIComponent;
let S, OR, admin, ana;
let agora = new Date('2026-09-26T12:00:00Z');

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia, agora: () => agora });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], allow_sensitive_processing_with_guardrails: true });   // empresa que processa informação sigilosa com guardrails
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
  assert.match(r.texto, /^Resposta de google\/gemini-3\.5-flash-lite/);
  assert.equal(usado(r), RAPIDO);
  assert.equal(r.fim.modelo, null, 'quem usa não recebe o identificador técnico');
  assert.equal(r.fim.classe, 'rapido');
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

test('modelo fora da lista liberada nunca é usado: o pedido segue no automático, sem perguntar nada à pessoa', async () => {
  const conv = await novaConversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: 'openai/gpt-4o' });
  assert.equal(r.status, 200);
  assert.notEqual(usado(r), 'openai/gpt-4o');
  assert.ok(!OR.chamadas.some(c => c.model === 'openai/gpt-4o' || c.models?.includes('openai/gpt-4o')));
  const rota = um(S.app.db, 'select politicas, fallback from roteamento where conversa_id = ? order by id desc limit 1', conv.id);
  assert.match(rota.politicas, /escolha_substituida_pelo_roteamento/);
  assert.equal(JSON.parse(rota.fallback).tipo, 'escolha_substituida');
});

test('acesso por perfil: sem o Avançado, a pessoa não vê nem usa modelo Avançado no chat', async () => {
  // O seletor mostra classes, não fornecedores.
  const opcoes = (await ana.get('/api/modelos')).dados.opcoes.map(o => o.id);
  assert.ok(opcoes.includes('classe:rapido') && opcoes.includes('classe:equilibrado'));
  assert.ok(!opcoes.includes('classe:avancado') && !opcoes.includes(AVANCADO));
  const conv = await novaConversa();
  // Pedido forçado pela API a um Avançado: não é usado; o automático escolhe entre o que ela pode usar.
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: AVANCADO });
  assert.equal(r.status, 200);
  assert.notEqual(usado(r), AVANCADO);
  assert.notEqual(r.fim.classe, 'avancado');
  // Liberado para um grupo do qual ela faz parte: passa a ver e usar; a mudança fica no log.
  const g = (await admin.post('/api/admin/grupos', { nome: 'Analistas' })).dados;
  await admin.put(`/api/admin/grupos/${g.id}`, { pessoas: [ana.pessoa.id] });
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: false, grupos: [g.id] } } });
  assert.ok((await ana.get('/api/modelos')).dados.opcoes.some(o => o.id === 'classe:avancado'));
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: 'classe:avancado' });
  assert.equal(r2.status, 200);
  assert.equal(usado(r2), AVANCADO);
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'model.config_changed'"));
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: false } } });
});

test('trocar de modelo no meio da conversa funciona e fica registrado na conversa', async () => {
  const conv = await novaConversa();
  await enviarMensagem(ana, conv.id, { texto: 'Primeira pergunta' });
  const r = await enviarMensagem(ana, conv.id, { texto: 'Segunda pergunta', modelo: 'classe:equilibrado' });
  assert.equal(usado(r), 'anthropic/claude-haiku-4.5');
  assert.equal(r.fim.classe, 'equilibrado');
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.ok(d.mensagens.some(m => m.papel === 'aviso' && /Nível trocado para Equilibrado/.test(m.texto)));
  // O histórico vai junto para o novo modelo.
  assert.equal(OR.chamadas.at(-1).messages.filter(m => m.role !== 'system').length, 3);
});

test('falha do modelo principal usa o reserva e registra qual respondeu', async () => {
  await admin.put(`/api/admin/modelos/${enc('openai/gpt-5-mini')}`, { liberado: true, perfil: 'rapido' });
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: 'openai/gpt-5-mini' });
  OR.falhar.add(RAPIDO);
  const conv = await novaConversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá' });
  OR.falhar.delete(RAPIDO);
  assert.deepEqual(OR.chamadas.at(-1).models, [RAPIDO, 'openai/gpt-5-mini']);
  assert.equal(usado(r), 'openai/gpt-5-mini');
  assert.equal(r.fim.reserva, true);
  const u = um(S.app.db, 'select modelo_pedido, modelo_usado from uso where conversa_id = ?', conv.id);
  assert.deepEqual({ ...u }, { modelo_pedido: RAPIDO, modelo_usado: 'openai/gpt-5-mini' });
  const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'credits.consumed' order by id desc limit 1").detalhes);
  assert.equal(ev.modelo_usado, 'openai/gpt-5-mini');
  assert.ok(!('texto' in ev));
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: null });
});

test('filtro no servidor: CPF é dado pessoal e segue normalmente por padrão; proteger e bloquear são política da empresa; credencial nunca sai', async () => {
  // Padrão: CPF identificado → dado pessoal, processado pelas regras gerais; a conversa não vira sigilosa.
  let conv = await novaConversa();
  let r = await enviarMensagem(ana, conv.id, { texto: 'O CPF do cliente é 529.982.247-25' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa, false);
  assert.match(um(S.app.db, "select detalhes from eventos where tipo = 'conversation.completed' order by id desc limit 1").detalhes, /"tipos":\["cpf"\]/, 'o tipo fica registrado, sem o valor');
  // A empresa escolhe "só com proteção" para CPF: a conversa vira sigilosa e segue só por rota autorizada.
  const cfg = lerConfig(S.app.db);
  salvarConfig(S.app.db, { acoesChat: { ...cfg.acoesChat, cpf: 'proteger' } });
  conv = await novaConversa();
  r = await enviarMensagem(ana, conv.id, { texto: 'O CPF do cliente é 529.982.247-25' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(OR.chamadas.at(-1).model, HOMOLOGADO);
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa, true);
  // A empresa escolhe bloquear CPF: vira política dela, e a mensagem diz isso.
  salvarConfig(S.app.db, { acoesChat: { ...cfg.acoesChat, cpf: 'bloquear', credencial: 'permitir' } });
  conv = await novaConversa();
  const n = OR.chamadas.length;
  r = await enviarMensagem(ana, conv.id, { texto: 'O CPF do cliente é 529.982.247-25' });
  assert.equal(r.status, 422);
  assert.deepEqual(r.erro.tipos, ['cpf']);
  assert.match(r.erro.mensagem, /^Pela política da empresa/);
  // Credencial: regra de segurança da GreenIA, mesmo marcada como "permitir".
  r = await enviarMensagem(ana, conv.id, { texto: 'a senha: Primavera2026' });
  assert.equal(r.status, 422);
  assert.deepEqual(r.erro.tipos, ['credencial']);
  assert.match(r.erro.mensagem, /^Por segurança, senhas, chaves de acesso e outros segredos nunca são enviados à IA/);
  salvarConfig(S.app.db, { acoesChat: cfg.acoesChat });
  assert.equal(OR.chamadas.length, n);
  // O histórico registra que as mensagens não saíram, sem guardar o conteúdo delas.
  const hist = (await ana.get(`/api/conversas/${conv.id}`)).dados.mensagens;
  assert.deepEqual(hist.map(m => m.papel), ['aviso', 'aviso']);
  assert.ok(hist.every(m => /^Uma mensagem não foi enviada\./.test(m.texto) && /não foi guardado/.test(m.texto)));
  assert.doesNotMatch(JSON.stringify(hist), /Primavera|529\.982/);
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'policy.blocked' order by id desc limit 1");
  assert.ok(!ev.detalhes.includes('Primavera'));
});

// Conversas sigilosas: a mensagem não vai a modelo não homologado. Uma escolha que não serve para dado
// sigiloso é trocada pela GreenIA por um recurso autorizado, sem pedir nada à pessoa; a chave não desliga.
async function confereSigilosa(conv, corpo, motivo) {
  // Pedido por um modelo técnico não homologado: não é usado; a resposta vem do homologado.
  const r = await enviarMensagem(ana, conv.id, { ...corpo, modelo: RAPIDO });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(usado(r), HOMOLOGADO);
  assert.equal(OR.chamadas.at(-1).model, HOMOLOGADO, 'nada foi enviado ao modelo não homologado');
  assert.ok(!OR.chamadas.at(-1).models, 'sem reserva de outro fornecedor');
  // Pedido por classe (o caminho da interface): vai direto a um homologado.
  const ok = await enviarMensagem(ana, conv.id, { ...corpo, modelo: 'classe:rapido' });
  assert.equal(ok.status, 200);
  const chamada = OR.chamadas.at(-1);
  assert.equal(chamada.model, HOMOLOGADO);
  assert.deepEqual(chamada.provider, { order: ['Mistral'], only: ['Mistral'], allow_fallbacks: false, zdr: true, data_collection: 'deny' });
  assert.ok(!chamada.models, 'sem reserva de outro fornecedor');
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.equal(d.conversa.sigilosa, true);
  assert.equal((await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: false })).status, 409);
  const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'conversation.confidential' order by id desc limit 1").detalhes);
  assert.equal(ev.motivo, motivo);
}

test('sigilosa pela chave manual', async () => {
  const conv = await novaConversa();
  await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: true });
  await confereSigilosa(conv, { texto: 'Estratégia de preço do próximo trimestre.' }, 'manual');
});

test('sigilosa por dado que a política manda proteger (dados bancários); CNPJ de empresa é conteúdo normal', async () => {
  const conv = await novaConversa();
  await confereSigilosa(conv, { texto: 'Pague o fornecedor: agência 1234, conta corrente 56789-0.' }, 'dado:banco');
  const outra = await novaConversa();
  const r = await enviarMensagem(ana, outra.id, { texto: 'Confira o fornecedor CNPJ 11.222.333/0001-81.' });
  assert.equal(r.status, 200);
  assert.equal((await ana.get(`/api/conversas/${outra.id}`)).dados.conversa.sigilosa, false);
});

// Área com política de sigilo = proteção reforçada, e não "tudo sigiloso": quem decide é o conteúdo.
test('área com proteção reforçada: conteúdo comum segue as regras gerais, mesmo sem recurso para dado sigiloso', async () => {
  const areaId = Number(exec(S.app.db, "insert into areas (nome, sigilosa) values ('Área reforçada', 1)").lastInsertRowid);
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
  try {
    const conv = await novaConversa();
    assert.equal(conv.sigilosa, false, 'a conversa não nasce sigilosa por causa da área');
    // Sem recurso autorizado para dado sigiloso, o conteúdo comum continua funcionando (o caso do PDF sem dados sigilosos).
    const cfg = lerConfig(S.app.db);
    exec(S.app.db, 'update modelos set homologado = 0, autorizacao_plataforma = null');
    const pdf = { nome: 'workshop.txt', base64: Buffer.from('Workshop de decisão: comparação entre duas fontes de consulta de dados, cobertura de 27 UFs, custo por consulta e prazo.').toString('base64') };
    const r = await enviarMensagem(ana, conv.id, { texto: 'Analise este arquivo.', anexos: [pdf] });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    assert.equal((await ana.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa, false);
    // Conteúdo com marcação de confidencialidade, na mesma área: vira sigiloso e, sem recurso autorizado, não sai.
    const n = OR.chamadas.length;
    const b = await enviarMensagem(ana, conv.id, { texto: 'Resuma o memorando CONFIDENCIAL da diretoria.' });
    assert.equal(b.status, 409);
    assert.equal(OR.chamadas.length, n, 'nada foi enviado');
    assert.doesNotMatch(b.erro.mensagem, /recurso autorizado|homolog|modelo/i, 'quem usa não recebe mensagem técnica');
    salvarConfig(S.app.db, { padroes: cfg.padroes });
    exec(S.app.db, 'update modelos set homologado = 1 where id = ?', HOMOLOGADO);
    // Com recurso autorizado: o conteúdo sigiloso segue só pelos guardrails.
    const conv2 = await novaConversa();
    await confereSigilosa(conv2, { texto: 'Resuma o laudo médico do colaborador.' }, 'dado:sensivel');
    // Registro de pessoa em processo interno: sinal só da área reforçada.
    const conv4 = await novaConversa();
    await confereSigilosa(conv4, { texto: 'Organize o holerite deste mês por rubrica.' }, 'reforco:pessoas');
    // Fora da área reforçada: o dado sensível continua protegido (vale em qualquer área); o holerite é conteúdo comum.
    exec(S.app.db, 'update areas set sigilosa = 0 where id = ?', areaId);
    const conv3 = await novaConversa();
    const c = await enviarMensagem(ana, conv3.id, { texto: 'Organize o holerite deste mês por rubrica.' });
    assert.equal(c.status, 200);
    assert.equal((await ana.get(`/api/conversas/${conv3.id}`)).dados.conversa.sigilosa, false);
    const conv5 = await novaConversa();
    await confereSigilosa(conv5, { texto: 'Resuma o laudo médico do colaborador.' }, 'dado:sensivel');
  } finally {
    exec(S.app.db, 'delete from area_pessoas where area_id = ?', areaId);
    exec(S.app.db, 'delete from areas where id = ?', areaId);
  }
});

test('conversa marcada só pela área (regra antiga): sem sinal de conteúdo sigiloso, volta às regras gerais; com sinal, continua sigilosa', async () => {
  const limpa = await novaConversa();
  exec(S.app.db, "update conversas set sigilosa = 1, motivo_sigilosa = 'area' where id = ?", limpa.id);
  exec(S.app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', 'Resuma a política de férias.', '2026-09-26')", limpa.id);
  const d = (await ana.get(`/api/conversas/${limpa.id}`)).dados;
  assert.equal(d.conversa.sigilosa, false);
  assert.match(d.mensagens.at(-1).texto, /voltou às regras gerais/);
  const comDado = await novaConversa();
  exec(S.app.db, "update conversas set sigilosa = 1, motivo_sigilosa = 'area' where id = ?", comDado.id);
  exec(S.app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', 'Pague: agência 1234, conta corrente 56789-0.', '2026-09-26')", comDado.id);
  assert.equal((await ana.get(`/api/conversas/${comDado.id}`)).dados.conversa.sigilosa, true, 'dado que a política manda proteger mantém a conversa sigilosa');
  // Marcada pela regra antiga "qualquer dado pessoal = sigiloso" (email pessoal, CPF): volta às regras gerais.
  const porEmail = await novaConversa();
  exec(S.app.db, "update conversas set sigilosa = 1, motivo_sigilosa = 'dado:email' where id = ?", porEmail.id);
  exec(S.app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', 'João Silva (joao@gmail.com, CPF 529.982.247-25) fica com a proposta.', '2026-09-26')", porEmail.id);
  assert.equal((await ana.get(`/api/conversas/${porEmail.id}`)).dados.conversa.sigilosa, false);
  // Marcação manual nunca é desfeita.
  const manual = await novaConversa();
  exec(S.app.db, "update conversas set sigilosa = 1, motivo_sigilosa = 'manual' where id = ?", manual.id);
  assert.equal((await ana.get(`/api/conversas/${manual.id}`)).dados.conversa.sigilosa, true);
  const marcada = await novaConversa();
  exec(S.app.db, "update conversas set sigilosa = 1, motivo_sigilosa = 'area' where id = ?", marcada.id);
  exec(S.app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', 'Documento de uso interno.', '2026-09-26')", marcada.id);
  assert.equal((await ana.get(`/api/conversas/${marcada.id}`)).dados.conversa.sigilosa, true);
});

test('sigilosa: o seletor mostra só homologados, e a pessoa usa o homologado padrão mesmo sem o perfil', async () => {
  const op = (await ana.get('/api/modelos?sigilosa=1')).dados.opcoes;
  assert.deepEqual(op.map(o => o.id), ['classe:auto', 'classe:rapido'], 'Automático (só homologados) e a classe homologada');
  assert.ok(op.every(o => o.homologado));
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
  assert.ok(um(S.app.db, `select 1 from eventos where tipo = 'conversation.deleted' and detalhes like '%"por":"retencao"%'`));
});
