// Revisão final da governança contextual:
//   • elegibilidade por atributos efetivos do recurso (treino, retenção, dados pessoais permitidos, região), e não
//     por um rótulo como "fornecedor fixo"; recursos equivalentes são igualmente elegíveis;
//   • RH classificado pelo conteúdo (registro sobre uma pessoa), não pelo departamento ou por palavras soltas;
//   • processar ≠ guardar: com "Guardar no histórico = não", nada do conteúdo fica em banco, log, evento ou erro.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, pdf, pptx } from './arquivos.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { ErroIA } from '../src/ia.js';
import { POLITICA_SIGILO, protecaoDoRecurso, atributosDoRecurso } from '../src/sigilo.js';
import { lerModelos } from '../src/modelos.js';
import { detectar } from '../src/filtro.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

const EQUILIBRADO = 'anthropic/claude-haiku-4.5', RAPIDO = 'google/gemini-3.5-flash-lite';
const GRATUITO = 'meta-llama/llama-3.3-70b-instruct:free';
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
const TECNICO = /open\s*router|anthropic|google\/|gemini|claude|haiku|mistral|llama/i;
let S, OR, admin, ana, areaId, falharCom = null;
const logs = [], violacoes = [];

before(async () => {
  OR = await openRouterFalso();
  const ia = { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
    async *enviar(mensagens, op) {
      const d = um(S.app.db, 'select * from roteamento order by id desc limit 1');
      if (!d || d.resultado === 'bloqueado') violacoes.push(`chamada fora de ordem: ${op.modelo}`);
      const m = lerModelos(S.app.db).find(x => x.id === op.modelo);
      if (!m?.liberado) violacoes.push(`não liberado: ${op.modelo}`);
      if (op.sigilosa && (!m?.homologado || !op.fornecedor)) violacoes.push(`sigiloso fora do autorizado: ${op.modelo}`);
      // Erro do provedor que repete o conteúdo recebido (o pior caso para a retenção).
      if (falharCom) throw new ErroIA(`upstream falhou com a mensagem: ${mensagens.at(-1).content}`, 502);
      yield* OR.ia.enviar(mensagens, op);
    } };
  S = await subir({ ia, log: (...a) => logs.push(a.join(' ')) });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], exigirSemTreino: false, [POLITICA_SIGILO]: true });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  exec(S.app.db, "insert or ignore into modelos (id, nome, fornecedor, contexto) values (?, 'Gratuito', 'meta', 128000)", GRATUITO);
  exec(S.app.db, "update modelos set liberado = 1, perfil = 'rapido', preco_entrada = 0, preco_saida = 0 where id = ?", GRATUITO);
  areaId = Number(exec(S.app.db, "insert into areas (nome, sigilosa) values ('Comercial', 1)").lastInsertRowid);
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
});
after(async () => { await S.fechar(); await OR.fechar(); assert.deepEqual(violacoes, []); });

function catalogo(rotas) {
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(S.app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
}
const reforcada = v => exec(S.app.db, 'update areas set sigilosa = ? where id = ?', Number(v), areaId);
const atributos = (id, a) => admin.put(`/api/admin/modelos/${encodeURIComponent(id)}`, { atributos: a });
const nova = async () => (await ana.post('/api/conversas', {})).dados.conversa;
async function enviar(texto, extra = {}, conv = null) {
  conv ??= await nova();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  const rota = um(S.app.db, 'select * from roteamento where conversa_id = ? order by id desc limit 1', conv.id);
  return { r, conv, n: OR.chamadas.length - n, ultima: OR.chamadas.at(-1), rota, candidatos: rota ? JSON.parse(rota.candidatos || '[]') : [],
    sigilosa: um(S.app.db, 'select sigilosa from conversas where id = ?', conv.id).sigilosa };
}
const motivos = (x, id) => x.candidatos.find(c => c.id === id)?.motivos || [];
function processa(x, msg) {
  assert.equal(x.r.status, 200, `${msg}: ${JSON.stringify(x.r.erro)}`);
  assert.equal(x.n, 1, msg);
  assert.equal(x.sigilosa, 0, `${msg}: continua normal`);
  assert.doesNotMatch(JSON.stringify({ ...x.r.fim, rota: { ...x.r.fim.rota, explicacao: null } }), TECNICO, msg);
}
// Tudo o que ficou guardado sobre a conversa, em qualquer tabela, e o que foi para o log.
const guardado = conv => JSON.stringify([
  todos(S.app.db, 'select * from mensagens where conversa_id = ?', conv.id), todos(S.app.db, 'select * from anexos where conversa_id = ?', conv.id),
  todos(S.app.db, 'select * from conversas where id = ?', conv.id), todos(S.app.db, 'select * from roteamento where conversa_id = ?', conv.id),
  todos(S.app.db, 'select * from uso where conversa_id = ?', conv.id), todos(S.app.db, 'select * from eventos where detalhes like ?', `%"conversa":${conv.id}%`), logs,
]);

// ------------------------------------------------------------------------------------ Recursos
test('elegibilidade por atributos: recursos equivalentes são elegíveis; um rótulo não substitui o atributo real', async () => {
  catalogo({});
  reforcada(false);
  const cfg = () => lerConfig(S.app.db);
  const m = id => lerModelos(S.app.db).find(x => x.id === id);
  // Sem atributo declarado: o gratuito não garante o não uso para treino → só conteúdo comum.
  assert.equal(atributosDoRecurso(m(GRATUITO), cfg()).semTreino, 'não garantido');
  let x = await enviar('Confira o cadastro de joao@gmail.com.');
  assert.ok(motivos(x, GRATUITO).includes('protecao_insuficiente'), 'gratuito sem garantia: fora');
  assert.ok(!motivos(x, RAPIDO).includes('protecao_insuficiente') && !motivos(x, EQUILIBRADO).includes('protecao_insuficiente'), 'os dois recursos com a garantia: elegíveis');
  // O admin declara o atributo real (contrato de não treino): o mesmo recurso passa a ser elegível para dado pessoal.
  assert.equal((await atributos(GRATUITO, { semTreino: true, regiao: 'Brasil' })).status, 200);
  try {
  assert.equal(protecaoDoRecurso(m(GRATUITO), cfg()), 2);
  x = await enviar('Confira o cadastro de joao@gmail.com.');
  processa(x, 'recurso equivalente');
  assert.ok(!motivos(x, GRATUITO).includes('protecao_insuficiente'), 'elegível pelos atributos, sem o rótulo');
  // Pedido explícito pelo recurso equivalente: é usado (antes, sem o atributo, seria substituído).
  x = await enviar('Resuma: joao@gmail.com confirmou presença.', { modelo: GRATUITO });
  processa(x, 'recurso equivalente pedido');
  assert.equal(x.ultima.model, GRATUITO);
  // O admin proíbe dado pessoal num recurso de rota fixa: ele sai dos elegíveis para dado pessoal, e só para isso.
  assert.equal((await atributos(RAPIDO, { dadosPessoais: 'proibido' })).status, 200);
  x = await enviar('Confira o cadastro de joao@gmail.com.');
  assert.ok(motivos(x, RAPIDO).includes('protecao_insuficiente'));
  processa(await enviar('Resuma o processo de compras.', { modelo: RAPIDO }), 'conteúdo comum continua no recurso');
  // A tela do admin mostra o que cada recurso pode receber e sob quais condições.
  const tela = (await admin.get('/api/admin/modelos')).dados.modelos.find(y => y.id === GRATUITO);
  assert.deepEqual([tela.dados.dadosPessoais, tela.dados.semTreino, tela.dados.regiao, tela.dados.confidenciais], [true, 'comprovado', 'Brasil', false]);
  assert.doesNotMatch(JSON.stringify((await admin.get('/api/admin/modelos')).dados), /open\s*router/i, 'o admin da empresa não vê o provedor');
  } finally { await atributos(GRATUITO, null); await atributos(RAPIDO, null); }
});

test('área reforçada sem recurso para confidencial, mas com recurso compatível com a área: documento comum processa', async () => {
  catalogo({});
  reforcada(true);
  processa(await enviar('Resuma o documento.', { anexos: [arquivo('institucional.pdf', pdf(['Apresentacao institucional: historia, produtos e canais.']))] }), 'área reforçada');
  // Sem nenhum recurso compatível com a área (só o gratuito sem garantia), aí sim nada sai, com a mensagem simples.
  const antes = um(S.app.db, 'select group_concat(id) ids from modelos where liberado = 1 and id <> ?', GRATUITO).ids.split(',');
  exec(S.app.db, 'update modelos set liberado = 0 where id <> ?', GRATUITO);
  try {
    const x = await enviar('Resuma o documento.', { anexos: [arquivo('institucional.pdf', pdf(['Apresentacao institucional.']))] });
    assert.deepEqual([x.r.status, x.n, x.sigilosa], [503, 0, 0]);
    assert.equal(x.r.erro.mensagem, MSG_USUARIO.indisponivel);
  } finally { for (const id of antes) exec(S.app.db, 'update modelos set liberado = 1 where id = ?', id); reforcada(false); }
});

// ------------------------------------------------------------------------------------ RH pelo conteúdo
test('RH: classificado pelo conteúdo (casos A a F), não pelo departamento nem por palavras soltas', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const casos = {
    A: ['João Silva é gerente comercial e participou da reunião.', []],
    B: ['João ficou responsável por preparar a proposta até sexta-feira.', []],
    C: ['João recebeu feedback sobre a apresentação comercial.', []],
    D: ['João recebeu uma advertência disciplinar.', ['pessoal_restrito']],
    E: ['João apresentou diagnóstico médico e resultado de exame.', ['sensivel']],
    F: ['Analise esta transcrição de uma reunião de RH e extraia as tarefas.', []],
  };
  for (const [k, [texto, tipos]] of Object.entries(casos)) assert.deepEqual(detectar(texto), tipos, `caso ${k}`);
  for (const k of ['A', 'B', 'C', 'F']) processa(await enviar(casos[k][0]), `caso ${k}`);
  // D: dado pessoal restrito → mais proteção (recurso que garante o não uso para treino), sem virar sigilosa.
  let x = await enviar(casos.D[0]);
  processa(x, 'caso D');
  assert.equal(x.ultima.provider?.data_collection, 'deny');
  assert.ok(motivos(x, GRATUITO).includes('protecao_insuficiente'));
  // E: dado sensível → controles adicionais (guardrails).
  x = await enviar(casos.E[0]);
  assert.deepEqual([x.r.status, x.sigilosa, x.ultima.model, x.ultima.provider.only?.[0]], [200, 1, EQUILIBRADO, 'Anthropic']);
  // A política da empresa pode elevar o dado pessoal restrito para "só com proteção".
  const antes = lerConfig(S.app.db).acoesChat;
  salvarConfig(S.app.db, { acoesChat: { ...antes, pessoal_restrito: 'proteger' } });
  try { x = await enviar(casos.D[0]); assert.deepEqual([x.r.status, x.sigilosa, x.ultima.model], [200, 1, EQUILIBRADO]); }
  finally { salvarConfig(S.app.db, { acoesChat: antes }); }
  // Documento de RH comum e reunião de RH: processam.
  processa(await enviar('Organize as tarefas.', { anexos: [arquivo('rh.pptx', pptx([['Reunião de RH', 'Plano de férias da equipe', 'Contratação de dois analistas'], ['Onboarding com o gerente', 'Calendário de avaliação anual']]))] }), 'PPTX de RH comum');
});

// ------------------------------------------------------------------------------------ Sensível e restrito
test('conteúdo sensível: classificação adequada, controles adicionais, bloqueio só sem caminho permitido', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const casos = [
    ['saúde', 'Organize o laudo médico e o atestado médico do colaborador.', 'sensivel', 3],
    ['biometria', 'Os dados biométricos do cadastro precisam ser revisados.', 'sensivel', 3],
    ['altamente pessoal', 'A orientação sexual do candidato não pode influenciar a seleção.', 'sensivel', 3],
    ['financeiro pessoal', 'O salário do João é R$ 8.000 e a conta corrente 56789-0, agência 1234.', 'banco', 3],
    ['disciplinar', 'Registre a advertência disciplinar aplicada ao colaborador.', 'pessoal_restrito', 2],
    ['confidencial', 'Resuma o documento CONFIDENCIAL da diretoria.', 'confidencial', 3],
  ];
  for (const [nome, texto, tipo, nivel] of casos) {
    assert.ok(detectar(texto).includes(tipo), `${nome}: ${detectar(texto)}`);
    const x = await enviar(texto);
    assert.equal(x.r.status, 200, `${nome}: caminho permitido existe`);
    assert.equal(x.sigilosa, nivel === 3 ? 1 : 0, nome);
    if (nivel === 3) assert.equal(x.ultima.provider.only?.[0], 'Anthropic', `${nome}: só pela rota autorizada`);
  }
  catalogo({});
  const x = await enviar('Organize o laudo médico do colaborador.');
  assert.deepEqual([x.r.status, x.n, x.sigilosa], [409, 0, 0], 'sem caminho permitido: não envia');
  assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo);
  assert.doesNotMatch(x.r.erro.mensagem, /remova|retire|tire|anonimi|evite/i);
});

test('hard block: senha, API key, token, chave privada, seed phrase e credencial, em texto, PDF e PPTX', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const segredos = ['senha: Primavera2026', 'api_key = sk-abcdefghijklmnopqrstuvwxyz123456', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA', 'seed phrase: abandon ability able about above absent absorb abstract absurd abuse access accident',
    'conecte em postgres://app:SenhaForte9@db.interno:5432/prod'];
  for (const s of segredos) {
    for (const [onde, extra] of [['texto', {}], ['PDF', { anexos: [arquivo('a.pdf', pdf(s.split('\n')))] }], ['PPTX', { anexos: [arquivo('a.pptx', pptx([s.split('\n')]))] }]]) {
      const x = await enviar(onde === 'texto' ? s : 'Veja o anexo.', extra);
      assert.deepEqual([x.r.status, x.n], [422, 0], `${onde}: ${s.slice(0, 30)}`);
    }
  }
});

// ------------------------------------------------------------------------------------ Retenção
test('retenção: guardar = sim; guardar = não (processa, entrega, nada fica em banco, log, evento ou erro); bloqueado', async () => {
  catalogo({});
  const doc = () => arquivo('cadastro-maria.pdf', pdf(['Cadastro de Maria Souza', 'CPF 529.982.247-25', 'maria.souza@hotmail.com']));
  // Guardar = sim.
  const sim = await enviar('Resuma o cadastro da Maria Souza.', { anexos: [doc()] });
  processa(sim, 'guardar = sim');
  let d = (await ana.get(`/api/conversas/${sim.conv.id}`)).dados;
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant']);
  assert.deepEqual(d.mensagens[0].anexos, ['cadastro-maria.pdf']);
  assert.match(d.mensagens[1].texto, /Resposta de/);
  assert.match(d.conversa.titulo, /Resuma o cadastro/);
  // Guardar = não para CPF e email pessoal.
  assert.equal((await admin.put('/api/admin/config', { naoArmazenar: ['cpf', 'email'] })).status, 200);
  try {
    const nao = await enviar('Resuma o cadastro da Maria Souza.', { anexos: [doc()] });
    processa(nao, 'guardar = não');
    assert.ok(nao.r.texto.length > 0, 'a resposta é entregue');
    d = (await ana.get(`/api/conversas/${nao.conv.id}`)).dados;   // recarregar
    const tudo = guardado(nao.conv);
    assert.doesNotMatch(tudo, /Maria Souza|529\.982|maria\.souza|cadastro-maria|Resuma o cadastro|Resposta de/, 'nada do conteúdo, do anexo, da resposta ou do título');
    assert.equal(um(S.app.db, 'select count(*) n from anexos where conversa_id = ?', nao.conv.id).n, 0, 'o anexo não permanece');
    assert.equal(d.conversa.titulo, 'Conversa');
    // Fica o registro operacional mínimo: decisão, recurso, status, tipos (sem valor).
    assert.equal(nao.rota.resultado, 'respondido');
    assert.ok(nao.rota.modelo);
    assert.deepEqual(JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'conversation.completed' and detalhes like ?", `%"conversa":${nao.conv.id},%`).detalhes).tipos, ['cpf', 'email'], 'só os tipos, sem os valores');
    // Erro do provedor que repetiria o conteúdo: o evento fica só com o status.
    falharCom = true;
    const falha = await enviar('Resuma o cadastro da Maria Souza, CPF 529.982.247-25.');
    falharCom = null;
    assert.ok(falha.r.falha);
    assert.doesNotMatch(guardado(falha.conv), /Maria Souza|529\.982/, 'nem o erro do provedor guarda o conteúdo');
    assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'ai.failed' and detalhes like '%status 502%'"));
  } finally { falharCom = null; await admin.put('/api/admin/config', { naoArmazenar: [] }); }
  // Bloqueado: nada enviado, nada do conteúdo guardado; fica só o registro do bloqueio.
  const b = await enviar('Veja o anexo da Maria Souza.', { anexos: [arquivo('acesso.pdf', pdf(['senha: Primavera2026']))] });
  assert.deepEqual([b.r.status, b.n], [422, 0]);
  assert.doesNotMatch(guardado(b.conv), /Primavera|Maria Souza|acesso\.pdf/);
  assert.match(guardado(b.conv), /Uma mensagem não foi enviada/);
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'policy.blocked' and detalhes like ?", `%"conversa":${b.conv.id}%`));
});

// ------------------------------------------------------------------------------------ Quick win
test('quick win comercial com dados reais simulados (nomes, cargos, emails corporativos, clientes), em área reforçada', async () => {
  catalogo({});
  reforcada(true);
  const q = (await admin.post('/api/quick-wins', { nome: 'Reunião → Plano de ação', areas: [areaId] })).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { status: 'em_uso', instrucoes: 'Transforme a reunião num plano de ação. Não invente informações.' });
  const conv = (await ana.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  const transcricao = arquivo('reuniao-comercial.pdf', pdf([
    'Reuniao comercial - cliente Construtora Horizonte e cliente Mercado Bom Preco',
    'Carla Mendes, gerente de marketing (carla.mendes@apymine.com.br): campanha pronta ate 15/10.',
    'Bruno Alves, diretor comercial (bruno.alves@apymine.com.br): proposta para a Construtora Horizonte ate 03/10.',
    'Diego Rocha, coordenador de operacoes: estoque inicial chega em 10/10.',
    'Decisao: lancamento online, sem evento presencial.']));
  const x = await enviar('Analise esta transcrição e transforme-a em um plano de ação com decisões, tarefas, responsáveis e prazos. Não invente informações.', { anexos: [transcricao] }, conv);
  processa(x, 'quick win comercial');
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.deepEqual(d.mensagens.map(m => m.papel), ['user', 'assistant'], 'salvo conforme a política (guardar = sim)');
  assert.deepEqual(d.mensagens[0].anexos, ['reuniao-comercial.pdf']);
  assert.match(um(S.app.db, 'select texto from anexos where conversa_id = ?', conv.id).texto, /carla\.mendes@apymine\.com\.br/, 'sem anonimização');
  assert.doesNotMatch(JSON.stringify({ ...d, mensagens: d.mensagens.map(({ texto, ...m }) => m) }), TECNICO);
  reforcada(false);
});
