// Sugestão da GreenIA para os modelos: uso real da empresa + política → dois modelos de fabricantes diferentes para
// dados sigilosos (só com rota conferida, nunca com garantia inventada) e o modelo preferido de cada nível. Aplicar
// grava o mesmo registro de uma aprovação manual, respeita vetos, tetos e o modo de governança, e é idempotente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, exec, json, todos, um } from '../src/db.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { semearSugestao, lerModelos, acharModelo, homologadoPadrao } from '../src/modelos.js';
import { REQUISITOS_PLATAFORMA, avaliarRecurso } from '../src/sigilo.js';
import { calcularSugestao, usoDaEmpresa, sugestaoDaEmpresa, aplicarSigilo, aplicarNiveis, palavraDeCusto, politicaDaEmpresa, nomeFabricante } from '../src/sugestao-modelos.js';
import { subirPlataforma } from './ajuda-plataforma.js';

const agora = new Date('2026-10-13T12:00:00Z');
const GOOGLE = 'google/gemini-3.5-flash-lite', ANTHROPIC = 'anthropic/claude-haiku-4.5', SONNET = 'anthropic/claude-sonnet-5', OPENAI = 'openai/gpt-5-mini', MISTRAL = 'mistralai/mistral-small';
const rota = (fornecedor, extra = {}) => JSON.stringify({ fornecedor, endpoint: fornecedor, retencaoZero: true, semTreino: true, justificativa: 'Rota conferida pela operadora.', por: 'ops@plataforma', em: '2026-10-01T00:00:00Z', ...extra });

// Empresa de teste: banco em memória com a semente (3 modelos liberados), sigilo ligado e regras da plataforma.
function empresa({ modo = 'manual', plataforma = true, sigilo = true } = {}) {
  const db = abrirBanco(':memory:');
  semearSugestao(db);
  salvarConfig(db, { governanca: { modo }, allow_sensitive_processing_with_guardrails: sigilo, ...(plataforma ? { requisitosSigilo: REQUISITOS_PLATAFORMA } : {}) });
  const app = { db, agora: () => agora, catalogo: [], aoMudarModelos() { this.mudou = (this.mudou || 0) + 1; } };
  return app;
}
// O que aplicarHomologacoesPlataforma grava na empresa: a autorização numa coluna própria (e, no modo recomendado, liberado).
function autorizar(app, id, { perfil = 'rapido', fornecedor = 'Vertex', liberado = 0, preco = null } = {}) {
  if (!um(app.db, 'select 1 from modelos where id = ?', id)) exec(app.db, 'insert into modelos (id, nome, fornecedor, liberado, perfil) values (?, ?, ?, ?, ?)', id, id.split('/')[1], id.split('/')[0], liberado, perfil);
  exec(app.db, 'update modelos set autorizacao_plataforma = ?, liberado = ?, perfil = ? where id = ?', rota(fornecedor), liberado, perfil, id);
  if (preco) exec(app.db, 'update modelos set preco_entrada = ?, preco_saida = ? where id = ?', preco[0] / 1e6, preco[1] / 1e6, id);
}
const decidir = (app, tipos, n = 1, dias = 1) => { for (let i = 0; i < n; i++) exec(app.db, "insert into roteamento (em, modo, complexidade, tipos) values (?, 'automatico', 'simples', ?)", new Date(agora.getTime() - dias * 864e5).toISOString(), JSON.stringify(tipos)); };
const eventos = (app, tipo) => todos(app.db, 'select * from eventos where tipo = ? order by id', tipo).map(e => ({ ...e, detalhes: json(e.detalhes, {}) }));
const ADMIN = { id: 1, email: 'admin@empresa.com.br' };

test('uso da empresa: sem histórico vale o uso geral do escritório; com histórico, os tipos reais (sem consulta nem conteúdo)', () => {
  const vazio = usoDaEmpresa({});
  assert.equal(vazio.origem, 'padrao');
  assert.deepEqual(vazio.principais, ['sintese', 'redacao', 'analise', 'extracao']);
  assert.match(vazio.frase, /uso geral de um escritório: resumir, redigir textos, conferir documentos e trabalhar com planilhas/);
  const poucas = usoDaEmpresa({ decisoes: [['programacao'], ['consulta'], ['indeterminado']] });
  assert.equal(poucas.origem, 'padrao', 'poucas decisões ainda não dizem nada');
  const real = usoDaEmpresa({ decisoes: [...Array(6).fill(['programacao']), ['raciocinio', 'programacao'], ...Array(20).fill(['consulta'])] });
  assert.equal(real.origem, 'historico');
  assert.equal(real.principais[0], 'programacao');
  assert.equal(real.decisoes, 7, 'consulta não conta como uso');
  assert.match(real.frase, /^Sua equipe usa a IA principalmente para programar/);
  const qw = usoDaEmpresa({ quickWins: [{ arquetipo: 'responder_clientes' }, { arquetipo: 'criar_relatorio' }, { arquetipo: 'outro' }] });
  assert.equal(qw.origem, 'quick_wins');
  assert.equal(qw.quickWins, 2);
  assert.equal(qw.principais[0], 'redacao');
  assert.match(qw.frase, /Quick Wins/);
});

test('política: sigilo, regras por tipo de dado e reserva do plano viram uma frase simples', () => {
  const app = empresa();
  const p = politicaDaEmpresa(lerConfig(app.db));
  assert.ok(p.sigiloLigado);
  assert.deepEqual(p.protegidos, ['dados pessoais sensíveis', 'dados financeiros', 'documentos confidenciais'], 'padrão: financeiro, sensível e confidencial só com proteção');
  assert.match(p.frase, /^Dados sigilosos estão ligados; dados pessoais sensíveis, dados financeiros e documentos confidenciais só com proteção/);
  salvarConfig(app.db, { acoesChat: { ...lerConfig(app.db).acoesChat, cpf: 'proteger' }, allow_sensitive_processing_with_guardrails: false });
  const q = politicaDaEmpresa(lerConfig(app.db), { plano: { fase: 'reserva' } });
  assert.equal(q.sigiloLigado, false);
  assert.match(q.frase, /^Dados sigilosos estão desligados/);
  assert.match(q.frase, /só o nível Rápido responde/);
  assert.ok(q.reserva);
});

test('dados sigilosos: dois modelos de fabricantes diferentes, com rota conferida, motivos simples e palavra de custo', () => {
  const app = empresa();
  autorizar(app, GOOGLE, { perfil: 'rapido', fornecedor: 'google-vertex', liberado: 1 });
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 1 });
  autorizar(app, SONNET, { perfil: 'avancado', fornecedor: 'amazon-bedrock', liberado: 1 });
  // Vetado pela plataforma (com homologação antiga da empresa): nunca é sugerido.
  exec(app.db, "insert into modelos (id, nome, fornecedor, liberado, perfil, vetado_plataforma, homologado, homologacao) values (?, 'Mistral Small', 'mistralai', 1, 'rapido', 1, 1, ?)", MISTRAL, rota('Mistral'));
  // Gratuito liberado: sem fornecedor fixo, fora.
  exec(app.db, "insert into modelos (id, nome, fornecedor, liberado, perfil) values ('meta-llama/llama-3.3-70b-instruct:free', 'Llama grátis', 'meta-llama', 1, 'rapido')");
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.modo, 'manual');
  assert.equal(s.sigilo.situacao, 'aplicar');
  assert.ok(s.sigilo.necessario);
  assert.equal(s.sigilo.sugeridos.length, 2);
  const fab = s.sigilo.sugeridos.map(x => x.fabricante);
  assert.equal(new Set(fab).size, 2, 'fabricantes diferentes');
  assert.deepEqual(fab.sort(), ['Anthropic', 'Google']);
  assert.ok(!s.sigilo.sugeridos.some(x => x.id === MISTRAL), 'vetado fica de fora');
  assert.ok(s.sigilo.descartados.some(x => x.id === MISTRAL && x.motivo === 'proibido_pela_plataforma'));
  assert.ok(!s.sigilo.sugeridos.some(x => /:free$/.test(x.id)));
  for (const x of s.sigilo.sugeridos) {
    assert.equal(x.acao, 'aprovar');
    assert.ok(x.motivos.length >= 1 && x.motivos.length <= 2);
    assert.match(x.motivos[0], /^Bom para /, 'motivo ligado ao uso');
    assert.equal(x.garantia, 'Não guarda nem usa seus dados para treinar');
    assert.ok(['econômico', 'médio', 'alto'].includes(x.custo));
    assert.equal(x.detalhes.origem, 'Rota autorizada pela plataforma');
    assert.ok(x.detalhes.retencaoZero && x.detalhes.semTreino && x.detalhes.endpoint);
  }
  // Disponível para todos pesa: o Sonnet (Avançado, restrito) perde para o Haiku (Equilibrado, de todos).
  assert.ok(s.sigilo.sugeridos.some(x => x.id === ANTHROPIC));
  assert.match(s.porque, /^Escolhidos para o uso geral de um escritório \(resumir, redigir textos, conferir documentos e trabalhar com planilhas\) e para a sua política de dados \(dados sigilosos ligados; dados pessoais sensíveis, dados financeiros e documentos confidenciais só com proteção\)\.$/);
  assert.match(s.sigilo.confirmacao, /passam a receber conversas sigilosas/);
});

test('sigilo desligado: nada é pedido, mas a sugestão continua disponível para consulta', () => {
  const app = empresa({ sigilo: false });
  autorizar(app, GOOGLE, { fornecedor: 'google-vertex', liberado: 1 });
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 1 });
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.sigilo.necessario, false);
  assert.equal(s.sigilo.sugeridos.length, 2);
  assert.match(s.politica.frase, /desligados/);
});

test('nenhuma garantia inventada: sem rota conferida, nada é sugerido e a mensagem diz o que fazer', () => {
  const app = empresa({ plataforma: false });
  // Atributos declarados (sem fornecedor nem endpoint) não são rota verificável.
  exec(app.db, 'update modelos set atributos = ? where id = ?', JSON.stringify({ semTreino: true, retencaoZero: true }), GOOGLE);
  // Autorização incompleta (sem retenção zero): também não serve.
  exec(app.db, 'update modelos set autorizacao_plataforma = ? where id = ?', rota('Bedrock', { retencaoZero: false }), ANTHROPIC);
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.sigilo.situacao, 'impossivel');
  assert.deepEqual(s.sigilo.sugeridos, []);
  assert.match(s.sigilo.titulo, /Ainda não há modelo com garantias conferidas/);
  assert.match(s.sigilo.oQueFazer, /Peça à equipe da GreenIA/);
  assert.deepEqual(aplicarSigilo(app, ADMIN), []);
  assert.equal(todos(app.db, 'select * from modelos where homologado = 1').length, 0);
});

test('um só fabricante com rota conferida: sugere o que dá e pede a autorização de outro fabricante', () => {
  const app = empresa();
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 1 });
  autorizar(app, SONNET, { perfil: 'avancado', fornecedor: 'amazon-bedrock', liberado: 1 });
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.sigilo.situacao, 'parcial');
  assert.equal(s.sigilo.sugeridos.length, 1);
  assert.match(s.sigilo.oQueFazer, /Peça à equipe da GreenIA para autorizar mais um modelo, de outro fabricante/);
  aplicarSigilo(app, ADMIN);
  const depois = sugestaoDaEmpresa(app);
  assert.equal(depois.sigilo.situacao, 'impossivel', 'nada mais a aplicar, e não finge que está pronto');
  assert.equal(depois.sigilo.aprovados.length, 1);
  assert.match(depois.sigilo.titulo, /outro fabricante/);
});

test('teto do nível: modelo autorizado, mas acima do consumo que o nível permite, não é sugerido', () => {
  const app = empresa();
  autorizar(app, GOOGLE, { fornecedor: 'google-vertex', liberado: 1 });
  autorizar(app, OPENAI, { perfil: 'rapido', fornecedor: 'azure', liberado: 1, preco: [8, 40] });
  const s = sugestaoDaEmpresa(app);
  assert.ok(!s.sigilo.sugeridos.some(x => x.id === OPENAI));
  assert.ok(s.sigilo.descartados.some(x => x.id === OPENAI && x.motivo === 'acima_do_teto_do_nivel'));
  assert.equal(palavraDeCusto({ precoEntrada: 0.3 / 1e6, precoSaida: 2.5 / 1e6 }), 'econômico');
  assert.equal(palavraDeCusto({ precoEntrada: 1 / 1e6, precoSaida: 5 / 1e6 }), 'médio');
  assert.equal(palavraDeCusto({ precoEntrada: 2 / 1e6, precoSaida: 10 / 1e6 }), 'alto');
  assert.equal(palavraDeCusto({ perfil: 'avancado' }), 'alto', 'sem preço, pelo nível');
});

test('aplicar (modo manual): aprova com a rota conferida, registra como aprovação manual, não muda o modo e é idempotente', () => {
  const app = empresa();
  autorizar(app, GOOGLE, { fornecedor: 'google-vertex', liberado: 1 });
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 0 });   // não liberado: a sugestão libera
  assert.equal(homologadoPadrao(app.db, lerConfig(app.db)), null);
  const feitos = aplicarSigilo(app, ADMIN);
  assert.deepEqual(feitos.sort(), [ANTHROPIC, GOOGLE].sort());
  const cfg = lerConfig(app.db);
  assert.equal(cfg.governanca.modo, 'manual', 'o modo de governança continua o mesmo');
  for (const [id, forn] of [[GOOGLE, 'google-vertex'], [ANTHROPIC, 'amazon-bedrock']]) {
    const m = acharModelo(app.db, cfg, id);
    assert.ok(m.liberado && m.homologado, id);
    assert.equal(m.homologacaoEmpresa.fornecedor, forn, 'a rota é a da autorização, nunca outra');
    assert.equal(m.homologacaoEmpresa.endpoint, forn);
    assert.equal(m.homologacaoEmpresa.retencaoZero, true);
    assert.equal(m.homologacaoEmpresa.semTreino, true);
    assert.equal(m.homologacaoEmpresa.origem, 'sugestao');
    assert.match(m.homologacaoEmpresa.justificativa, /^Sugestão da GreenIA para o uso da empresa \(resumir, redigir textos.*\) e a política de dados; aprovado por admin@empresa\.com\.br\.$/);
    assert.equal(m.homologacaoEmpresa.quem, ADMIN.email);
  }
  const cert = eventos(app, 'model.certified');
  assert.equal(cert.length, 2);
  assert.ok(cert.every(e => e.detalhes.origem === 'sugestao' && e.pessoa_id === ADMIN.id));
  const lib = eventos(app, 'model.changed');
  assert.deepEqual(lib.map(e => [e.detalhes.modelo, e.detalhes.liberado, e.detalhes.origem]), [[ANTHROPIC, true, 'sugestao']]);
  assert.equal(eventos(app, 'model.suggestion_applied').length, 1);
  assert.ok(app.mudou >= 1, 'a Política de Uso é avisada (nova versão)');
  assert.ok(homologadoPadrao(app.db, cfg), 'agora há homologado para todos');
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.sigilo.situacao, 'pronto');
  assert.equal(s.sigilo.necessario, false);
  assert.match(s.sigilo.titulo, /^Pronto: 2 modelos aprovados para dados sigilosos/);
  // Idempotente: aplicar de novo não grava nada.
  assert.deepEqual(aplicarSigilo(app, ADMIN), []);
  assert.equal(eventos(app, 'model.certified').length, 2);
  assert.equal(eventos(app, 'model.suggestion_applied').length, 1);
});

test('aplicar (modo recomendado): o adotado já vale; o autorizado ainda fora da lista é liberado e aprovado, e o modo não muda', () => {
  const app = empresa({ modo: 'recomendado' });
  autorizar(app, GOOGLE, { fornecedor: 'google-vertex', liberado: 1 });      // adotado: já elegível, sem ação
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 0 });
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.modo, 'recomendado');
  assert.equal(s.sigilo.situacao, 'aplicar');
  assert.deepEqual(s.sigilo.sugeridos.map(x => [x.id, x.acao]).sort(), [[ANTHROPIC, 'aprovar'], [GOOGLE, 'nenhuma']].sort());
  assert.match(s.sigilo.modoTexto, /continua seguindo as recomendações/);
  assert.deepEqual(aplicarSigilo(app, ADMIN), [ANTHROPIC]);
  assert.equal(lerConfig(app.db).governanca.modo, 'recomendado');
  assert.equal(acharModelo(app.db, lerConfig(app.db), GOOGLE).homologacaoEmpresa, null, 'o adotado não ganha registro novo');
  assert.equal(sugestaoDaEmpresa(app).sigilo.situacao, 'pronto');
});

test('aplicar recusa uma sugestão antiga se a plataforma vetou ou retirou a rota enquanto o admin decidia', () => {
  const app = empresa();
  autorizar(app, GOOGLE, { fornecedor: 'google-vertex', liberado: 1 });
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 1 });
  const antiga = sugestaoDaEmpresa(app);
  exec(app.db, 'update modelos set autorizacao_plataforma = null, vetado_plataforma = 1 where id = ?', ANTHROPIC);
  assert.throws(() => aplicarSigilo(app, ADMIN, antiga), e => e.status === 409 && e.codigo === 'sugestao_mudou');
  assert.equal(todos(app.db, 'select * from modelos where homologado = 1').length, 0, 'nada aprovado pela metade');
  assert.equal(eventos(app, 'model.certified').length, 0);
  // A sugestão nova já não traz o vetado.
  assert.ok(!sugestaoDaEmpresa(app).sigilo.sugeridos.some(x => x.id === ANTHROPIC));
});

test('cada aprovação sugerida passa pela camada central de sigilo (fail closed)', () => {
  const app = empresa();
  autorizar(app, GOOGLE, { fornecedor: 'google-vertex', liberado: 1 });
  autorizar(app, ANTHROPIC, { perfil: 'equilibrado', fornecedor: 'amazon-bedrock', liberado: 1 });
  aplicarSigilo(app, ADMIN);
  const cfg = lerConfig(app.db);
  for (const m of lerModelos(app.db).filter(x => x.homologado)) {
    const a = avaliarRecurso(m, cfg);
    assert.ok(a.elegivel && a.rota.retencaoZero && a.rota.semTreino);
    // A empresa só restringe: retirar a autorização da plataforma tira a elegibilidade, mesmo com a aprovação da empresa.
    assert.equal(avaliarRecurso({ ...m, autorizacaoPlataforma: null }, cfg).elegivel, false);
  }
});

test('níveis: uso geral segue a curadoria; uso de programação sugere outro preferido, aplicado de forma mínima e idempotente', () => {
  const app = empresa({ modo: 'recomendado' });
  const s0 = sugestaoDaEmpresa(app);
  assert.equal(s0.niveis.segue, true);
  assert.equal(s0.niveis.frase, 'Sua configuração já segue a sugestão.');
  assert.deepEqual(aplicarNiveis(app, ADMIN), []);
  // Catálogo confirmado com o modelo de programação do nível Rápido; equipe que programa muito.
  app.catalogo = [{ id: OPENAI, nome: 'GPT-5 Mini', precoEntrada: 0.25 / 1e6, precoSaida: 2 / 1e6, contexto: 400000 }];
  decidir(app, ['programacao'], 12);
  decidir(app, ['raciocinio'], 3);
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.uso.origem, 'historico');
  const rapido = s.niveis.itens.find(i => i.nivel === 'rapido');
  assert.equal(rapido.sugerido.id, OPENAI);
  assert.equal(rapido.segue, false);
  assert.match(rapido.sugerido.motivo, /Bom para programar/);
  assert.match(s.niveis.confirmacao, /continua seguindo as recomendações/);
  assert.deepEqual(aplicarNiveis(app, ADMIN), ['rapido']);
  const cfg = lerConfig(app.db);
  assert.equal(cfg.padroes.rapido, OPENAI);
  assert.equal(cfg.padroes.chat, OPENAI, 'o chat acompanhava o Rápido');
  assert.equal(cfg.governanca.modo, 'recomendado', 'o modo não muda');
  assert.ok(acharModelo(app.db, cfg, OPENAI).liberado);
  assert.ok(acharModelo(app.db, cfg, GOOGLE).liberado, 'mudança mínima: nada é desligado');
  const ev = eventos(app, 'model.suggestion_applied');
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0].detalhes, { parte: 'niveis', padroes: { rapido: OPENAI }, origem: 'sugestao' });
  assert.equal(sugestaoDaEmpresa(app).niveis.segue, true);
  assert.deepEqual(aplicarNiveis(app, ADMIN), [], 'idempotente');
});

test('níveis em modo manual: só o preferido do nível muda; o resto da configuração manual fica', () => {
  const app = empresa({ modo: 'manual' });
  salvarConfig(app.db, { padroes: { ...lerConfig(app.db).padroes, equilibrado: null }, acessoPerfis: { equilibrado: { todos: false, grupos: [3], areas: [] }, avancado: { todos: false, grupos: [], areas: [] } } });
  exec(app.db, "insert into modelos (id, nome, fornecedor, liberado, perfil) values ('x-ai/grok-mini', 'Grok', 'x-ai', 1, 'rapido')");
  const s = sugestaoDaEmpresa(app);
  const eq = s.niveis.itens.find(i => i.nivel === 'equilibrado');
  assert.equal(eq.segue, false);
  assert.equal(eq.sugerido.id, ANTHROPIC);
  assert.match(s.niveis.confirmacao, /continua no modo manual/);
  aplicarNiveis(app, ADMIN);
  const cfg = lerConfig(app.db);
  assert.equal(cfg.padroes.equilibrado, ANTHROPIC);
  assert.equal(cfg.governanca.modo, 'manual');
  assert.deepEqual(cfg.acessoPerfis.equilibrado.grupos, [3], 'acesso não muda');
  assert.ok(acharModelo(app.db, cfg, 'x-ai/grok-mini').liberado, 'ajuste manual continua');
});

test('uso real: só decisões dos últimos 90 dias, sem testes, e Quick Wins ativos; nada de conteúdo', () => {
  const app = empresa();
  decidir(app, ['programacao'], 10, 120);   // antigas: não contam
  assert.equal(sugestaoDaEmpresa(app).uso.origem, 'padrao');
  decidir(app, ['traducao'], 6, 10);
  exec(app.db, "insert into roteamento (em, modo, complexidade, tipos, teste) values (?, 'automatico', 'simples', '[\"programacao\"]', 1)", agora.toISOString());
  const s = sugestaoDaEmpresa(app);
  assert.equal(s.uso.origem, 'historico');
  assert.deepEqual(s.uso.principais, ['traducao']);
  assert.equal(s.uso.decisoes, 6);
  exec(app.db, "insert into quick_wins (nome, status, especificacao) values ('Respostas', 'em_uso', ?), ('Velho', 'descartado', ?)", JSON.stringify({ arquetipo: 'responder_clientes' }), JSON.stringify({ arquetipo: 'analisar_documentos' }));
  const q = sugestaoDaEmpresa(app).uso;
  assert.equal(q.quickWins, 1, 'descartado não conta');
  assert.ok(q.pesos.redacao > 0 && !q.pesos.analise);
});

test('fabricante pelo prefixo do identificador, com nome legível', () => {
  assert.equal(nomeFabricante(GOOGLE), 'Google');
  assert.equal(nomeFabricante('openai/gpt-5.5'), 'OpenAI');
  assert.equal(nomeFabricante('novafab/modelo'), 'Novafab');
});

test('API: o admin vê e aplica a sugestão (registro na auditoria); quem não administra modelos não chama', async () => {
  const PL = await subirPlataforma();
  try {
    const ops = await PL.navegador().entrarConsole('ops@theneil.com.br');
    await ops.post('/api/plataforma/empresas', { name: 'Delta SA', slug: 'delta', admin_email: 'dora@delta.com', status: 'ativa' });
    const dora = PL.navegador(); await dora.get('/delta'); assert.equal((await dora.entrarEmpresa('dora@delta.com')).status, 200);
    assert.equal((await dora.put('/api/admin/sigilo', { ativo: true })).status, 200);
    assert.equal((await dora.put('/api/admin/governanca', { modo: 'manual' })).status, 200);
    for (const [id, perfil, fornecedor] of [[GOOGLE, 'rapido', 'google-vertex'], [ANTHROPIC, 'equilibrado', 'amazon-bedrock']]) {
      const r = await ops.post('/api/plataforma/homologacoes', { id, perfil, fornecedor, semTreino: true, retencaoZero: true, justificativa: 'Rota conferida no contrato do fornecedor.' });
      assert.equal(r.status, 200, JSON.stringify(r.dados));
    }
    await dora.post('/api/empresa/usuarios', { email: 'mel@delta.com', name: 'Mel', role_id: 'role_member' });
    const mel = PL.navegador(); await mel.get('/delta'); assert.equal((await mel.entrarEmpresa('mel@delta.com')).status, 200);
    assert.equal((await mel.get('/api/admin/modelos/sugestao')).status, 403);
    assert.equal((await mel.post('/api/admin/modelos/sugestao/aplicar', { parte: 'sigilo' })).status, 403);
    const g = await dora.get('/api/admin/modelos/sugestao');
    assert.equal(g.status, 200, JSON.stringify(g.dados));
    assert.equal(g.dados.sigilo.situacao, 'aplicar');
    assert.equal(new Set(g.dados.sigilo.sugeridos.map(x => x.fabricante)).size, 2);
    assert.doesNotMatch(JSON.stringify(g.dados), /openrouter|preco|US\$/i, 'sem provedor nem preço');
    assert.equal((await dora.post('/api/admin/modelos/sugestao/aplicar', { parte: 'xyz' })).status, 400);
    // Visão geral e Preparar o ambiente levam ao mesmo fluxo de um clique.
    const passo = (await dora.get('/api/acompanhamento')).dados.passos.find(x => x.id === 'recursos');
    assert.deepEqual([passo.titulo, passo.href, passo.pronto], ['Aprovar os modelos sugeridos', '#/politicas?sugestao=1', false]);
    const item = (await dora.get('/api/admin/visao-geral')).dados.atencao.find(x => x.sugestao);
    assert.deepEqual([item.botao, item.link], ['Aprovar os modelos sugeridos', '#/politicas?sugestao=1']);
    const a = await dora.post('/api/admin/modelos/sugestao/aplicar', { parte: 'sigilo' });
    assert.equal(a.status, 200, JSON.stringify(a.dados));
    assert.equal(a.dados.aplicado.aprovados.length, 2);
    assert.equal(a.dados.sugestao.sigilo.situacao, 'pronto');
    const t = PL.P.tenants.get([...PL.P.tenants.keys()][0]);
    assert.equal(todos(t.db, "select * from eventos where tipo = 'model.certified'").filter(e => json(e.detalhes, {}).origem === 'sugestao').length, 2);
    assert.equal(lerConfig(t.db).governanca.modo, 'manual');
    const b = await dora.post('/api/admin/modelos/sugestao/aplicar', { parte: 'tudo' });
    assert.equal(b.status, 200);
    assert.deepEqual(b.dados.aplicado.aprovados, [], 'idempotente');
    const m = (await dora.get('/api/admin/modelos')).dados.modelos.filter(x => x.homologado);
    assert.equal(m.length, 2);
    assert.ok(!(await dora.get('/api/admin/visao-geral')).dados.atencao.some(x => x.tipo === 'modelo' && /homologado/.test(x.texto)), 'nada mais a pedir');
    assert.equal((await dora.get('/api/acompanhamento')).dados.passos.find(x => x.id === 'recursos').titulo, 'Confira os recursos de IA');
  } finally { await PL.fechar(); }
});
