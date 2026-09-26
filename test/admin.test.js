// Painel do admin: permissão para criar quick wins, política com seção automática,
// tetos de gasto, configurações, uso e custo, eventos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';

const enc = encodeURIComponent;
const HOMOLOGADO = 'mistralai/mistral-small-2603';
let S, OR, admin, ana, dani, bia, A, B, grupo;

before(async () => {
  OR = await openRouterFalso({ custo: 0.01 });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Área Alfa' })).dados;
  B = (await admin.post('/api/admin/areas', { nome: 'Área Beta' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  const daniId = (await admin.post('/api/admin/pessoas', { email: 'dani@exemplo.com.br', nome: 'Dani Reis', areas: [{ id: A.id }] })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'bia@exemplo.com.br', nome: 'Bia Souza', areas: [{ id: B.id }] });
  grupo = (await admin.post('/api/admin/grupos', { nome: 'Criadores' })).dados;
  await admin.put(`/api/admin/grupos/${grupo.id}`, { pessoas: [daniId] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  dani = await S.cliente().entrar('dani@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('quick win: usuário comum só cria se o admin autorizar; cria nas próprias áreas e gerencia o que criou', async () => {
  assert.equal((await dani.post('/api/quick-wins', { nome: 'Meu quick win', areas: [A.id] })).status, 403);
  assert.equal((await dani.get('/api/eu')).dados.quickWins.criar, false);
  await admin.put('/api/admin/quick-wins-permissoes', { responsaveis: true, grupos: [grupo.id] });
  const eu = (await dani.get('/api/eu')).dados.quickWins;
  assert.deepEqual([eu.criar, eu.todaEmpresa, eu.areas.map(a => a.nome)], [true, false, ['Área Alfa']]);
  assert.equal((await dani.post('/api/quick-wins', { nome: 'Em outra área', areas: [B.id] })).status, 403);
  assert.equal((await dani.post('/api/quick-wins', { nome: 'Para todos', toda_empresa: true })).status, 403);
  const q = (await dani.post('/api/quick-wins', { nome: 'Resumo de reuniões', areas: [A.id] })).dados;
  assert.equal(q.podeEditar, true);
  assert.equal((await dani.put(`/api/quick-wins/${q.id}`, { status: 'ativo' })).status, 200);
  // O responsável da área também gerencia; quem é de outra área não vê.
  assert.equal((await ana.get(`/api/quick-wins/${q.id}`)).dados.podeEditar, true);
  assert.equal((await bia.get(`/api/quick-wins/${q.id}`)).status, 404);
  // Um quick win da Ana, dani usa mas não configura.
  const daAna = (await ana.post('/api/quick-wins', { nome: 'Da Ana', areas: [A.id] })).dados;
  await ana.put(`/api/quick-wins/${daAna.id}`, { status: 'ativo' });
  assert.equal((await dani.put(`/api/quick-wins/${daAna.id}`, { nome: 'x' })).status, 404);
  // "Toda a empresa" é autorização à parte.
  await admin.put('/api/admin/quick-wins-permissoes', { responsaveis: true, grupos: [grupo.id], todaEmpresa: { grupos: [grupo.id] } });
  assert.equal((await dani.post('/api/quick-wins', { nome: 'Para todos', toda_empresa: true })).status, 200);
  // Sem autorização aos responsáveis, a Ana deixa de criar.
  await admin.put('/api/admin/quick-wins-permissoes', { responsaveis: false, grupos: [grupo.id] });
  assert.equal((await ana.post('/api/quick-wins', { nome: 'Nova', areas: [A.id] })).status, 403);
  await admin.put('/api/admin/quick-wins-permissoes', { responsaveis: true, grupos: [grupo.id] });
  assert.equal((await ana.put('/api/admin/quick-wins-permissoes', { responsaveis: false })).status, 403);
  // Lista do admin: todos os quick wins, com criador e áreas.
  const lista = (await admin.get('/api/admin/quick-wins')).dados.quickWins;
  assert.ok(lista.some(x => x.nome === 'Resumo de reuniões' && x.criado_por === 'dani@exemplo.com.br' && x.areas[0] === 'Área Alfa'));
});

test('política: a seção automática muda com a homologação e gera nova versão; preço não; ciência pendente bloqueia o envio', async () => {
  const v1 = (await admin.get('/api/politica')).dados;
  assert.match(v1.secao, /Nenhum modelo homologado ainda/);
  assert.match(v1.secao, /Avançado: ninguém/);
  await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { liberado: true, perfil: 'rapido' });
  await admin.post(`/api/admin/modelos/${enc(HOMOLOGADO)}/homologar`, { fornecedor: 'mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no OpenRouter.' });
  const v2 = (await admin.get('/api/politica')).dados;
  assert.ok(v2.versao > v1.versao);
  assert.match(v2.secao, new RegExp(`fornecedor mistral\\), homologado em`));
  // Mudança só de preço não gera versão.
  S.app.db.prepare('update modelos set preco_entrada = 0.000002 where id = ?').run(HOMOLOGADO);
  await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { perfil: 'rapido' });
  assert.equal((await admin.get('/api/politica')).dados.versao, v2.versao);
  // Acesso a perfil entra na seção.
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: false, grupos: [grupo.id] } } });
  const v3 = (await admin.get('/api/politica')).dados;
  assert.match(v3.secao, /Avançado: Criadores/);
  // Quem não registrou ciência da versão nova não envia.
  const conv = (await bia.post('/api/conversas', {})).dados.conversa;
  assert.equal((await bia.get('/api/politica')).dados.cienciaPendente, true);
  const r = await bia.req('POST', `/api/conversas/${conv.id}/mensagens`, { texto: 'Olá' });
  assert.equal(r.status, 428);
  assert.equal((await bia.post('/api/politica/ciencia', { versao: v3.versao - 1 })).status, 409);
  assert.equal((await bia.post('/api/politica/ciencia', { versao: v3.versao })).status, 200);
  assert.equal((await bia.req('POST', `/api/conversas/${conv.id}/mensagens`, { texto: 'Olá' })).status, 200);
  // O admin edita o texto do cliente: nova versão, com a seção automática no fim.
  assert.equal((await admin.put('/api/admin/politica', { texto: 'Texto próprio da empresa sobre o uso de IA no trabalho.' })).status, 200);
  const v4 = (await admin.get('/api/politica')).dados;
  assert.equal(v4.texto, 'Texto próprio da empresa sobre o uso de IA no trabalho.');
  assert.match(v4.secao, /Como a GreenIA trata dados sigilosos/);
  assert.equal((await ana.put('/api/admin/politica', { texto: 'Tentativa de quem não é admin.' })).status, 403);
});

test('teto de gasto mensal interrompe os envios; limite diário por pessoa também', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Primeira' })).status, 200);
  const gasto = um(S.app.db, 'select sum(custo) as c from uso').c;
  salvarConfig(S.app.db, { tetoMensal: gasto });
  const n = OR.chamadas.length;
  let r = await enviarMensagem(ana, conv.id, { texto: 'Segunda' });
  assert.equal(r.status, 429);
  assert.equal(r.erro.erro, 'teto_mensal');
  assert.equal(OR.chamadas.length, n);
  salvarConfig(S.app.db, { tetoMensal: 0, limiteDiarioPessoa: 1 });
  r = await enviarMensagem(ana, conv.id, { texto: 'Terceira' });
  assert.equal(r.erro.erro, 'limite_diario');
  salvarConfig(S.app.db, { limiteDiarioPessoa: 0, tetoPessoaMensal: 0.001 });
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Quarta' })).erro.erro, 'teto_pessoa');
  salvarConfig(S.app.db, { tetoPessoaMensal: 0 });
});

test('configurações: cor de marca com contraste baixo é recusada; domínios e retenção validados; só o admin', async () => {
  let r = await admin.put('/api/admin/config', { corMarca: '#9CC9B2' });
  assert.equal(r.status, 400);
  assert.match(r.dados.mensagem, /mínimo é 4,5:1/);
  assert.equal((await admin.put('/api/admin/config', { corMarca: '#1B4F8C', empresa: 'Empresa Exemplo', dominios: 'exemplo.com.br, @exemplo.net', retencaoDias: 60 })).status, 200);
  const c = (await admin.get('/api/admin/config')).dados;
  assert.deepEqual([c.corMarca, c.empresa, c.dominios, c.retencaoDias], ['#1B4F8C', 'Empresa Exemplo', ['exemplo.com.br', 'exemplo.net'], 60]);
  assert.equal((await admin.put('/api/admin/config', { dominios: '' })).status, 400);
  assert.equal((await admin.put('/api/admin/config', { retencaoDias: 0 })).status, 400);
  assert.equal((await admin.put('/api/admin/config', { acoesChat: { credencial: 'permitir', cpf: 'permitir' } })).status, 200);
  assert.equal((await admin.get('/api/admin/config')).dados.acoesChat.credencial, 'bloquear');
  assert.equal((await ana.get('/api/admin/config')).status, 403);
  assert.equal((await admin.post('/api/admin/smtp/teste')).status, 200);
  assert.equal((await S.cliente().get('/api/publico')).dados.empresa, 'Empresa Exemplo');
  await admin.put('/api/admin/config', { retencaoDias: 90, acoesChat: { cnpj: 'permitir', email: 'permitir', telefone: 'permitir', cep: 'permitir', endereco: 'permitir' } });
});

test('uso e custo: por mês, área, quick win, pessoa, modelo e tipo; CSV; eventos com filtro, sem conteúdo', async () => {
  const u = (await admin.get('/api/admin/uso')).dados;
  assert.ok(u.totais.custo > 0 && u.totais.conversas >= 2);
  assert.ok(u.porPessoa.some(p => p.email === 'ana@exemplo.com.br'));
  assert.ok(u.porQuickWin.some(q => q.quick_win === 'Chat geral'));
  assert.ok(u.porArea.some(a => a.area === 'Área Alfa'));
  assert.ok(u.porModelo.length >= 1);
  assert.ok(u.porTipo.some(t => t.tipo === 'normal'));
  const csv = await admin.get('/api/admin/uso?formato=csv');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.dados, /Por pessoa;ana@exemplo\.com\.br/);
  const ev = (await admin.get('/api/admin/eventos?tipo=uso')).dados;
  assert.ok(ev.total >= 2 && ev.eventos.every(e => e.tipo === 'uso'));
  assert.ok(ev.tipos.includes('login'));
  const todosEv = (await admin.get('/api/admin/eventos?formato=csv')).dados;
  assert.ok(!/Primeira|Segunda|Olá/.test(todosEv), 'nenhum conteúdo de conversa nos eventos');
  assert.equal((await ana.get('/api/admin/eventos')).status, 403);
  assert.equal((await ana.get('/api/admin/uso')).status, 403);
});
