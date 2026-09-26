// Quick wins: configuração, arquivos, teste, conversas com retomada e ajustes,
// feedback, uso, visibilidade por área, filtro, perfis e conversas sigilosas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { arquivo, docx } from './arquivos.js';

const enc = encodeURIComponent;
const HOMOLOGADO = 'mistralai/mistral-small';
const AVANCADO = 'anthropic/claude-sonnet-5';
const AVANCADO2 = 'openai/gpt-5';
let S, OR, admin, ana, carlos, bia, A, B, qw;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Área Alfa' })).dados;
  B = (await admin.post('/api/admin/areas', { nome: 'Área Beta' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'carlos@exemplo.com.br', nome: 'Carlos Dias', areas: [{ id: A.id }] });
  await admin.post('/api/admin/pessoas', { email: 'bia@exemplo.com.br', nome: 'Bia Souza', areas: [{ id: B.id }] });
  await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { liberado: true, perfil: 'rapido' });
  await admin.post(`/api/admin/modelos/${enc(HOMOLOGADO)}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no OpenRouter.' });
  await admin.put(`/api/admin/modelos/${enc(AVANCADO2)}`, { liberado: true, perfil: 'avancado' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  carlos = await S.cliente().entrar('carlos@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('quick win de ponta a ponta: configurar com arquivo, testar, ativar, conversar com anexo, ajustar, retomar, feedback e uso', async () => {
  // Configurar a partir de um modelo inicial, com arquivo de referência.
  const modelos = (await ana.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
  assert.ok(modelos.length >= 8);
  const i = modelos.findIndex(m => m.nome === 'Conferir dois documentos');
  let r = await ana.post('/api/quick-wins', { modelo_inicial: i, areas: [A.id] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  qw = r.dados;
  assert.equal(qw.status, 'rascunho');
  assert.equal(qw.formato, 'tabela');
  r = await ana.put(`/api/quick-wins/${qw.id}`, { nome: 'Conferência de pedidos', sugestoes: ['Confira estes dois documentos e liste as diferenças'], instrucoes: 'Compare e liste diferenças de quantidade e preço.' });
  assert.equal(r.status, 200);
  r = await ana.post(`/api/quick-wins/${qw.id}/arquivos`, { arquivo: arquivo('regras.docx', docx(['Regra da área: diferença de preço acima de 2% deve ser marcada como relevante.'])) });
  assert.equal(r.dados.arquivos.length, 1);
  // Rascunho: o time ainda não vê.
  assert.ok(!(await carlos.get('/api/quick-wins')).dados.quickWins.some(q => q.id === qw.id));
  assert.equal((await carlos.post('/api/conversas', { quick_win_id: qw.id })).status, 404);
  // Testar antes de ativar.
  const teste = (await ana.post('/api/conversas', { quick_win_id: qw.id, teste: true })).dados.conversa;
  r = await enviarMensagem(ana, teste.id, { texto: 'Teste rápido' });
  assert.equal(r.status, 200);
  const sistema = JSON.stringify(OR.chamadas.at(-1).messages[0].content);
  assert.match(sistema, /Compare e liste diferenças de quantidade e preço/);
  assert.match(sistema, /diferença de preço acima de 2%/);
  assert.match(sistema, /tabela em Markdown/);
  // Ativar.
  assert.equal((await ana.put(`/api/quick-wins/${qw.id}`, { status: 'ativo' })).status, 200);
  assert.ok((await carlos.get('/api/quick-wins')).dados.quickWins.some(q => q.id === qw.id));
  // Conversa com anexo e um ajuste.
  const conv = (await carlos.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  const pedido = arquivo('pedido.docx', docx(['Pedido 4500123456: 10 caixas a R$ 12,00']));
  r = await enviarMensagem(carlos, conv.id, { texto: 'Confira estes dois documentos e liste as diferenças', anexos: [pedido] });
  assert.equal(r.status, 200);
  assert.match(OR.chamadas.at(-1).messages.at(-1).content, /\[Anexo: pedido\.docx\]\nPedido 4500123456/);
  r = await enviarMensagem(carlos, conv.id, { texto: 'Tire a coluna de relevância' });
  assert.equal(OR.chamadas.at(-1).messages.filter(m => m.role !== 'system').length, 3, 'o ajuste leva o histórico');
  // Sair e retomar: a conversa está na lista dele, com o histórico.
  const lista = (await carlos.get(`/api/conversas?quick_win=${qw.id}`)).dados.conversas;
  assert.deepEqual(lista.map(c => c.id), [conv.id]);
  const d = (await carlos.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.filter(m => m.papel !== 'aviso').map(m => m.papel), ['user', 'assistant', 'user', 'assistant']);
  assert.deepEqual(d.mensagens[0].anexos, ['pedido.docx']);
  await enviarMensagem(carlos, conv.id, { texto: 'Obrigado, agora resuma em 3 linhas' });
  assert.equal(OR.chamadas.at(-1).messages.filter(m => m.role !== 'system').length, 5);
  // Renomear e dar feedback (pode mudar depois).
  await carlos.patch(`/api/conversas/${conv.id}`, { titulo: 'Pedido de setembro' });
  await carlos.patch(`/api/conversas/${conv.id}`, { feedback: 'nao_serviu', motivo: 'faltou a coluna de prazo' });
  r = await carlos.patch(`/api/conversas/${conv.id}`, { feedback: 'ajustes' });
  assert.equal(r.dados.conversa.feedback, 'ajustes');
  assert.equal(r.dados.conversa.titulo, 'Pedido de setembro');
  // Uso no painel: uma conversa (o teste não conta), três mensagens, uma pessoa.
  const uso = (await ana.get(`/api/quick-wins/${qw.id}/uso`)).dados;
  assert.equal(uso.conversas, 1);
  assert.equal(uso.mensagens, 3);
  assert.equal(uso.pessoas, 1);
  assert.deepEqual(uso.feedback, { serviu: 0, ajustes: 1, nao_serviu: 0, sem: 0 });
  assert.equal(uso.porModelo.length, 1);
  assert.ok(uso.custo > 0);
  // Quem usa não vê o uso nem a configuração completa.
  assert.equal((await carlos.get(`/api/quick-wins/${qw.id}/uso`)).status, 404);
  assert.equal((await carlos.get(`/api/quick-wins/${qw.id}`)).dados.instrucoes, undefined);
});

test('pessoa de outra área não vê o quick win; "toda a empresa" aparece para todos', async () => {
  assert.ok(!(await bia.get('/api/quick-wins')).dados.quickWins.some(q => q.id === qw.id));
  assert.equal((await bia.get(`/api/quick-wins/${qw.id}`)).status, 404);
  assert.equal((await bia.post('/api/conversas', { quick_win_id: qw.id })).status, 404);
  assert.equal((await ana.post('/api/quick-wins', { nome: 'Para todos', toda_empresa: true })).status, 403);
  const todos = (await admin.post('/api/quick-wins', { nome: 'Revisar texto', toda_empresa: true })).dados;
  await admin.put(`/api/quick-wins/${todos.id}`, { status: 'ativo' });
  for (const c of [bia, carlos, ana]) assert.ok((await c.get('/api/quick-wins')).dados.quickWins.some(q => q.id === todos.id));
});

test('filtro no servidor: CPF bloqueado no quick win com "bloquear"; credencial sempre bloqueada', async () => {
  await ana.put(`/api/quick-wins/${qw.id}`, { dados: { cpf: 'bloquear', credencial: 'permitir' } });
  assert.equal(um(S.app.db, 'select dados from quick_wins where id = ?', qw.id).dados.includes('"credencial":"bloquear"'), true);
  const conv = (await carlos.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  const n = OR.chamadas.length;
  // Mesmo sem nenhum filtro no navegador: a chamada vai direto à API.
  let r = await enviarMensagem(carlos, conv.id, { texto: 'Cliente de CPF 529.982.247-25 pediu revisão.' });
  assert.equal(r.status, 422);
  r = await enviarMensagem(carlos, conv.id, { texto: 'Veja o anexo', anexos: [arquivo('dados.docx', docx(['token=abc123segredo']))] });
  assert.equal(r.status, 422);
  assert.deepEqual(r.erro.tipos, ['credencial']);
  assert.equal(OR.chamadas.length, n);
});

test('perfis: sem o Avançado, a pessoa usa o Avançado que é padrão do quick win, mas não troca para outro Avançado', async () => {
  const q = (await ana.post('/api/quick-wins', { nome: 'Análise avançada', areas: [A.id], modelo: AVANCADO, pode_trocar: true })).dados;
  await ana.put(`/api/quick-wins/${q.id}`, { status: 'ativo' });
  const conv = (await carlos.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  let r = await enviarMensagem(carlos, conv.id, { texto: 'Analise este cenário' });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, AVANCADO);
  const opcoes = (await carlos.get(`/api/modelos?quick_win=${q.id}`)).dados.opcoes.map(o => o.id);
  assert.ok(opcoes.includes(AVANCADO) && !opcoes.includes(AVANCADO2));
  r = await enviarMensagem(carlos, conv.id, { texto: 'De novo', modelo: AVANCADO2 });
  assert.equal(r.status, 403);
  // No chat, sem o perfil, o mesmo modelo é recusado.
  const chat = (await carlos.post('/api/conversas', {})).dados.conversa;
  assert.equal((await enviarMensagem(carlos, chat.id, { texto: 'Olá', modelo: AVANCADO })).status, 403);
  // O admin define quais perfis podem ser padrão de quick win.
  await admin.put('/api/admin/modelos-config', { perfisQuickWin: ['rapido', 'equilibrado'] });
  assert.equal((await ana.put(`/api/quick-wins/${q.id}`, { modelo: AVANCADO2 })).status, 400);
  await admin.put('/api/admin/modelos-config', { perfisQuickWin: ['rapido', 'equilibrado', 'avancado'] });
});

test('sigilosa por quick win que trata dados sigilosos: nasce sigilosa; modelo não homologado é recusado e reenviado ao homologado', async () => {
  let r = await ana.post('/api/quick-wins', { nome: 'Casos de clientes', areas: [A.id], sigiloso: true, modelo: 'google/gemini-3.5-flash-lite' });
  assert.equal(r.status, 400, 'quick win sigiloso só aceita modelo homologado');
  const q = (await ana.post('/api/quick-wins', { nome: 'Casos de clientes', areas: [A.id], sigiloso: true, modelo: HOMOLOGADO, pode_trocar: true })).dados;
  await ana.put(`/api/quick-wins/${q.id}`, { status: 'ativo' });
  const conv = (await carlos.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  assert.equal(conv.sigilosa, true);
  assert.deepEqual((await carlos.get(`/api/modelos?quick_win=${q.id}&sigilosa=1`)).dados.opcoes.map(o => o.id), [HOMOLOGADO]);
  const n = OR.chamadas.length;
  r = await enviarMensagem(carlos, conv.id, { texto: 'Caso do cliente', modelo: 'google/gemini-3.5-flash-lite' });
  assert.equal(r.status, 409);
  assert.equal(OR.chamadas.length, n);
  r = await enviarMensagem(carlos, conv.id, { texto: 'Caso do cliente', modelo: r.erro.sugestao.id });
  assert.equal(r.status, 200);
  assert.deepEqual(OR.chamadas.at(-1).provider, { order: ['Mistral'], only: ['Mistral'], allow_fallbacks: false, zdr: true, data_collection: 'deny' });
  assert.equal((await carlos.patch(`/api/conversas/${conv.id}`, { sigilosa: false })).status, 409);
  assert.equal(JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'conversa_sigilosa' order by id desc limit 1").detalhes).motivo, 'quick_win');
});

test('apagar a conversa apaga os anexos; outra pessoa, o responsável e o admin não leem a conversa', async () => {
  const conv = (await carlos.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  await enviarMensagem(carlos, conv.id, { texto: 'Veja', anexos: [arquivo('nota.docx', docx(['Conteúdo do anexo']))] });
  assert.equal(um(S.app.db, 'select count(*) as n from anexos where conversa_id = ?', conv.id).n, 1);
  for (const c of [ana, admin, bia]) assert.equal((await c.get(`/api/conversas/${conv.id}`)).status, 404);
  assert.equal((await carlos.del(`/api/conversas/${conv.id}`)).status, 200);
  assert.equal(um(S.app.db, 'select count(*) as n from anexos where conversa_id = ?', conv.id).n, 0);
  assert.equal(um(S.app.db, 'select count(*) as n from mensagens where conversa_id = ?', conv.id).n, 0);
});

test('duplicar para outra área copia instruções, arquivos e configuração, nunca conversas', async () => {
  assert.equal((await ana.post('/api/quick-wins', { duplicar_de: qw.id, areas: [B.id] })).status, 403, 'ana não é responsável da área Beta');
  const r = await admin.post('/api/quick-wins', { duplicar_de: qw.id, areas: [B.id] });
  assert.equal(r.status, 200);
  const copia = r.dados;
  assert.equal(copia.nome, 'Conferência de pedidos (cópia)');
  assert.equal(copia.instrucoes, 'Compare e liste diferenças de quantidade e preço.');
  assert.equal(copia.arquivos.length, 1);
  assert.equal(copia.status, 'rascunho');
  assert.deepEqual(copia.areas, [B.id]);
  assert.equal(um(S.app.db, 'select count(*) as n from conversas where quick_win_id = ?', copia.id).n, 0);
});

test('estimativa de custo por conversa típica, por modelo, a partir do preço do catálogo', async () => {
  S.app.db.prepare('update modelos set preco_entrada = 0.0000003, preco_saida = 0.0000025 where id = ?').run('google/gemini-3.5-flash-lite');
  const est = (await ana.get(`/api/quick-wins/${qw.id}/estimativas`)).dados.modelos;
  const g = est.find(m => m.id === 'google/gemini-3.5-flash-lite');
  assert.ok(g.custo > 0 && g.custo < 0.05, String(g.custo));
  assert.equal(est.find(m => m.id === AVANCADO2).custo, null, 'sem preço no catálogo: sem estimativa');
  assert.ok(est.find(m => m.id === AVANCADO).custo > g.custo, 'o Avançado sugerido custa mais que o Rápido');
});
