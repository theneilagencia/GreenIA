// Roteamento de modelos: a análise do pedido define a capacidade necessária; a governança
// (acesso, sigilo, plano, contexto) limita os candidatos; a escolha é o menor custo que atende;
// cada decisão fica registrada com critérios e sem o conteúdo do pedido.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, todos, um } from '../src/db.js';
import { analisarPedido, nivelNecessario, rotear, AUTOMATICO } from '../src/roteador.js';

const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
let S, OR, admin, ana;
const pessoaSemAcesso = { grupos: [], areas: [] };

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

const liberarClasses = async todosTem => {
  const r = await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: todosTem }, avancado: { todos: todosTem } } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
};
const conversa = async () => (await ana.post('/api/conversas', {})).dados.conversa;
const ultimaRota = () => um(S.app.db, 'select * from roteamento order by id desc limit 1');

test('análise: pedido simples é simples; raciocínio com assunto sensível e várias etapas é complexo', () => {
  const simples = analisarPedido({ texto: 'Traduza para o inglês: bom dia a todos' });
  assert.equal(simples.complexidade, 'simples');
  assert.ok(simples.tipos.includes('traducao'));
  assert.equal(nivelNecessario(simples).classe, 'rapido');

  const complexo = analisarPedido({ texto: 'Analise as cláusulas deste contrato e recomende a estratégia:\n1. riscos\n2. prós e contras\n3. cenário se a lei mudar\nJustifique cada ponto.' });
  assert.equal(complexo.complexidade, 'complexa');
  assert.ok(complexo.precisao.includes('juridico'));
  assert.equal(nivelNecessario(complexo).classe, 'avancado');
});

test('análise: volume de contexto conta; insatisfação com a resposta anterior sobe um nível', () => {
  const grande = analisarPedido({ texto: 'Resuma', anexos: [{ texto: 'x'.repeat(200000) }] });
  assert.ok(grande.tokensEntrada > 50000);
  assert.ok(grande.sinais.pontos.volume > 0);
  const a = analisarPedido({ texto: 'Liste os itens', temResposta: true });
  const b = analisarPedido({ texto: 'Está errado, refaça a lista', temResposta: true });
  assert.equal(b.insatisfacao, true);
  assert.ok(nivelNecessario(b).nivel > nivelNecessario(a).nivel);
});

test('a preferência da empresa desloca a régua: economia sobe menos, qualidade sobe mais cedo', () => {
  const texto = 'Compare as duas propostas e recomende uma, com prós e contras.';
  const n = p => nivelNecessario(analisarPedido({ texto, preferencia: p })).nivel;
  assert.ok(n('economia') <= n('equilibrio'));
  assert.ok(n('qualidade') >= n('equilibrio'));
});

test('pedido simples vai para a classe Rápido; pedido complexo vai para uma classe maior', async () => {
  await liberarClasses(true);
  let conv = await conversa();
  let r = await enviarMensagem(ana, conv.id, { texto: 'Traduza para o inglês: obrigado pela reunião' });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, RAPIDO);
  assert.equal(ultimaRota().modo, 'automatico');
  assert.equal(ultimaRota().classe, 'rapido');

  conv = await conversa();
  r = await enviarMensagem(ana, conv.id, { texto: 'Analise as cláusulas deste contrato e recomende a estratégia:\n1. riscos\n2. prós e contras\n3. cenário se a lei mudar\nJustifique cada ponto.' });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, AVANCADO);
  const rota = ultimaRota();
  assert.equal(rota.classe_necessaria, 'avancado');
  assert.match(rota.explicacao, /escolhida automaticamente/);
  assert.ok(r.fim.rota?.explicacao, 'a explicação vai para a tela');
});

test('sem acesso à classe necessária: fica na mais capaz permitida, com a limitação registrada', async () => {
  await liberarClasses(false);
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Analise as cláusulas deste contrato e recomende a estratégia:\n1. riscos\n2. prós e contras\n3. cenário se a lei mudar\nJustifique cada ponto.' });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, RAPIDO);
  const rota = ultimaRota();
  assert.ok(JSON.parse(rota.politicas).includes('capacidade_limitada_pelas_permissoes'));
  assert.ok(JSON.parse(rota.candidatos).some(c => c.id === AVANCADO && c.status === 'sem_acesso_a_classe'));
  await liberarClasses(true);
});

test('classe escolhida pela pessoa é respeitada, com o mesmo registro de critérios', async () => {
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Traduza: bom dia', modelo: 'classe:equilibrado' });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, EQUILIBRADO);
  const rota = ultimaRota();
  assert.equal(rota.modo, 'manual');
  assert.equal(rota.classe_necessaria, 'rapido');
  assert.match(rota.explicacao, /escolhida pela pessoa/);
});

test('o registro da decisão não guarda o texto do pedido', async () => {
  const conv = await conversa();
  const segredo = 'Projeto Aurora com margem de 37 por cento';
  assert.equal((await enviarMensagem(ana, conv.id, { texto: `Resuma: ${segredo}` })).status, 200);
  const linha = JSON.stringify(ultimaRota());
  assert.ok(!linha.includes('Aurora') && !linha.includes('37 por cento'));
  const tela = JSON.stringify((await admin.get('/api/admin/roteamento')).dados);
  assert.ok(!tela.includes('Aurora'));
});

test('contexto que não cabe no modelo mais barato: vai para um com janela maior', () => {
  const db = S.app.db, cfg = lerConfig(db);
  cfg.acessoPerfis = { equilibrado: { todos: true }, avancado: { todos: true } };
  const antes = um(db, 'select contexto from modelos where id = ?', RAPIDO).contexto;
  exec(db, 'update modelos set contexto = 16000 where id = ?', RAPIDO);
  try {
    const analise = analisarPedido({ texto: 'Resuma', anexos: [{ texto: 'x'.repeat(300000) }] });
    const rota = rotear({ db, cfg, pessoa: pessoaSemAcesso, pedido: AUTOMATICO, analise });
    assert.notEqual(rota.modelo.id, RAPIDO);
    assert.equal(rota.candidatos.find(c => c.id === RAPIDO).status, 'contexto_insuficiente');
    // Classe escolhida à mão que não comporta o conteúdo: troca por uma que comporta, com registro.
    const manual = rotear({ db, cfg, pessoa: pessoaSemAcesso, pedido: 'classe:rapido', analise, modeloManual: { id: RAPIDO, perfil: 'rapido' } });
    assert.notEqual(manual.modelo.id, RAPIDO);
    assert.ok(manual.politicas.includes('trocado_por_falta_de_contexto'));
  } finally { exec(db, 'update modelos set contexto = ? where id = ?', antes, RAPIDO); }
});

test('reserva do plano força a classe Rápido; sigilosa sem homologado não escolhe nenhum', () => {
  const db = S.app.db, cfg = lerConfig(db);
  cfg.acessoPerfis = { equilibrado: { todos: true }, avancado: { todos: true } };
  const analise = analisarPedido({ texto: 'Analise as cláusulas deste contrato e recomende a estratégia:\n1. riscos\n2. prós e contras\n3. cenário' });
  const reserva = rotear({ db, cfg, pessoa: pessoaSemAcesso, pedido: AUTOMATICO, analise, reservaDoPlano: true });
  assert.equal(reserva.modelo.perfil, 'rapido');
  assert.ok(reserva.politicas.includes('plano_na_reserva_so_rapido'));
  const sig = rotear({ db, cfg, pessoa: pessoaSemAcesso, pedido: AUTOMATICO, analise, sigilosa: true });
  assert.equal(sig.modelo, null);
  assert.ok(sig.candidatos.every(c => c.status === 'nao_homologado'));
});

test('admin: a opção Automático é o padrão; dá para desligar e ajustar a preferência; a tela mostra decisões sem valores em dólar', async () => {
  const m = (await ana.get('/api/modelos')).dados;
  assert.equal(m.padrao, AUTOMATICO);
  assert.equal(m.opcoes[0].id, AUTOMATICO);
  assert.equal((await ana.put('/api/admin/modelos-config', { roteamento: { ativo: false } })).status, 403);
  assert.equal((await admin.put('/api/admin/modelos-config', { roteamento: { ativo: false, preferencia: 'qualidade' } })).status, 200);
  assert.deepEqual(lerConfig(S.app.db).roteamento, { ativo: false, preferencia: 'qualidade' });
  const sem = (await ana.get('/api/modelos')).dados;
  assert.notEqual(sem.padrao, AUTOMATICO);
  assert.ok(!sem.opcoes.some(o => o.id === AUTOMATICO));
  const conv = await conversa();
  assert.equal((await enviarMensagem(ana, conv.id, { texto: 'Olá' })).status, 200);
  assert.equal(ultimaRota().modo, 'manual');
  await admin.put('/api/admin/modelos-config', { roteamento: { ativo: true, preferencia: 'equilibrio' } });

  const resp = await admin.get('/api/admin/roteamento');
  assert.equal(resp.status, 200, JSON.stringify(resp.dados));
  const d = resp.dados;
  assert.ok(d.resumo.decisoes >= 5);
  assert.ok(d.decisoes[0].explicacao);
  assert.ok(Array.isArray(d.decisoes[0].candidatos));
  assert.ok(!('custo_estimado' in d.decisoes[0]) && !('custo_referencia' in d.decisoes[0]));
  assert.equal((await ana.get('/api/admin/roteamento')).status, 403);
  assert.ok(todos(S.app.db, 'select 1 from roteamento').length >= 5);
});
