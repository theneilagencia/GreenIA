// Área com política de sigilo = PROTEÇÃO REFORÇADA, e não "tudo sigiloso".
//   área_sigilo → proteção reforçada + avaliação do conteúdo + políticas da empresa + só recursos elegíveis.
//   Conteúdo comum na área: processa, só em recurso compatível com a proteção da área (fornecedor fixo,
//   sem treino com os dados). Conteúdo sigiloso: todos os guardrails; sem recurso autorizado, nada sai.
// Fluxo: mensagem + anexos → classificação → políticas → guardrails → elegíveis → capacidade → seleção →
// processamento. Nenhuma chamada ao provedor acontece antes da decisão registrada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, pdf } from './arquivos.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { POLITICA_SIGILO } from '../src/sigilo.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';
import { detectarReforcado } from '../src/filtro.js';

const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
const GRATUITO = 'meta-llama/llama-3.3-70b-instruct:free';
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
const enc = encodeURIComponent;
let S, OR, admin, ana, areaId;
// Espião: cada chamada ao provedor confere que a decisão já estava registrada e que um conteúdo sigiloso só
// segue para recurso autorizado. Qualquer violação fica em `violacoes`.
const violacoes = [];

before(async () => {
  OR = await openRouterFalso();
  const ia = { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
    async *enviar(mensagens, op) {
      const conv = Number(/"conversa":(\d+)/.exec(JSON.stringify(op))?.[1]) || null;
      const d = um(S.app.db, 'select * from roteamento order by id desc limit 1');
      if (!d) violacoes.push(`chamada sem decisão registrada: ${op.modelo}`);
      else if (d.resultado === 'bloqueado') violacoes.push(`chamada depois de um bloqueio: ${op.modelo}`);
      if (op.sigilosa && !um(S.app.db, 'select homologado from modelos where id = ?', op.modelo)?.homologado) violacoes.push(`sigiloso em recurso não autorizado: ${op.modelo}`);
      if (op.sigilosa && !op.fornecedor) violacoes.push(`sigiloso sem rota fixada: ${op.modelo}`);
      void conv;
      yield* OR.ia.enviar(mensagens, op);
    } };
  S = await subir({ ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], exigirSemTreino: false, [POLITICA_SIGILO]: true });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: true } } });
  // O gratuito é o mais barato do Rápido: numa área comum, sem exigência de "sem treino", é o escolhido.
  exec(S.app.db, "insert or ignore into modelos (id, nome, fornecedor, preco_entrada, preco_saida, contexto) values (?, 'Gratuito', 'meta', 0, 0, 128000)", GRATUITO);
  exec(S.app.db, "update modelos set liberado = 1, perfil = 'rapido', preco_entrada = 0, preco_saida = 0 where id = ?", GRATUITO);
  areaId = Number(exec(S.app.db, "insert into areas (nome, sigilosa) values ('Diretoria', 1)").lastInsertRowid);
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
});
after(async () => {
  await S.fechar(); await OR.fechar();
  assert.deepEqual(violacoes, [], 'nenhuma chamada ao provedor antes da decisão de elegibilidade');
});

function catalogo(rotas) {
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(S.app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
}
const reforcada = ligada => exec(S.app.db, 'update areas set sigilosa = ? where id = ?', Number(ligada), areaId);
const conversa = async () => (await ana.post('/api/conversas', {})).dados.conversa;
const estado = id => um(S.app.db, 'select sigilosa, motivo_sigilosa from conversas where id = ?', id);
async function enviar(texto, extra = {}, conv = null) {
  conv ??= await conversa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  const chamadas = OR.chamadas.slice(n).map(c => ({ modelo: c.model, reserva: c.models || null, rota: c.provider?.only?.[0] || null, semTreino: c.provider?.data_collection === 'deny' }));
  return { r, conv, chamadas, conv_estado: estado(conv.id), rota: um(S.app.db, 'select * from roteamento where conversa_id = ? order by id desc limit 1', conv.id) };
}
const PDF_INSTITUCIONAL = arquivo('workshop.pdf', pdf(['Workshop de decisao', 'Fontes comparadas: base oficial e fornecedor de mercado', 'Cobertura: 27 UFs', 'Custo por consulta e prazo de integracao']));

test('0. controle: numa área comum, sem exigência de "sem treino", o gratuito pedido pela pessoa é usado', async () => {
  reforcada(false); catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  try {
    const x = await enviar('Resuma em três linhas o processo de compras.', { modelo: GRATUITO });
    assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
    assert.equal(x.chamadas[0].modelo, GRATUITO);
  } finally { reforcada(true); }
});

test('1. área sigilosa + PDF sem informação sigilosa → não bloqueia; segue as regras gerais, mesmo sem recurso autorizado', async () => {
  catalogo({});   // nenhum recurso autorizado para dado sigiloso
  const conv = await conversa();
  assert.equal(conv.sigilosa, false, 'a conversa não nasce sigilosa por causa da área');
  const x = await enviar('Analise este arquivo.', { anexos: [PDF_INSTITUCIONAL] }, conv);
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.equal(x.conv_estado.sigilosa, 0);
  assert.equal(x.chamadas.length, 1);
  // Proteção reforçada: nada de gratuito ou automático, e o fornecedor não treina com os dados.
  assert.notEqual(x.chamadas[0].modelo, GRATUITO);
  assert.equal(x.chamadas[0].semTreino, true);
  assert.ok(JSON.parse(x.rota.politicas).includes('area_protecao_reforcada'));
  assert.ok(JSON.parse(x.rota.candidatos).find(c => c.id === GRATUITO).motivos.includes('area_protecao_reforcada'));
  assert.match(x.r.fim.rota.explicacao_simples, /Proteção reforçada da área/);
});

test('2. área sigilosa + documento com CPF → dado pessoal: segue a política (padrão: normal, sem virar sigilosa); com "proteger", só recurso autorizado', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const doc = { anexos: [arquivo('cadastro.pdf', pdf(['Responsavel: CPF 529.982.247-25']))] };
  let x = await enviar('Confira o cadastro.', doc);
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.equal(x.conv_estado.sigilosa, 0, 'CPF não torna a conversa sigilosa por si só');
  assert.ok(x.chamadas.every(c => c.modelo !== GRATUITO), 'mas a proteção da área continua valendo');
  const antes = lerConfig(S.app.db).acoesChat;
  salvarConfig(S.app.db, { acoesChat: { ...antes, cpf: 'proteger' } });
  try {
    x = await enviar('Confira o cadastro.', doc);
    assert.deepEqual([x.conv_estado.sigilosa, x.conv_estado.motivo_sigilosa], [1, 'dado:cpf']);
    assert.deepEqual(x.chamadas.map(c => [c.modelo, c.rota, c.reserva]), [[EQUILIBRADO, 'Anthropic', null]]);
  } finally { salvarConfig(S.app.db, { acoesChat: antes }); }
});

test('3. área sigilosa + dados bancários → política de informação sigilosa', async () => {
  const x = await enviar('Pague o fornecedor: agência 1234, conta corrente 56789-0.');
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.equal(x.conv_estado.motivo_sigilosa, 'dado:banco');
  assert.deepEqual(x.chamadas.map(c => [c.modelo, c.rota]), [[EQUILIBRADO, 'Anthropic']]);
});

test('4. área sigilosa + credencial → bloqueio (regra de segurança), nada enviado, nada guardado', async () => {
  const x = await enviar('Use a senha: Primavera2026 para entrar.');
  assert.equal(x.r.status, 422);
  assert.deepEqual(x.r.erro.tipos, ['credencial']);
  assert.deepEqual(x.chamadas, []);
  assert.equal(um(S.app.db, "select count(*) n from mensagens where conversa_id = ? and papel = 'user'", x.conv.id).n, 0);
});

test('5. área sigilosa + documento público → processa quando as demais regras são atendidas', async () => {
  const edital = arquivo('edital.pdf', pdf(['Edital publico de licitacao', 'Modalidade: pregao eletronico', 'Objeto: servicos de limpeza']));
  const x = await enviar('Liste os prazos do edital.', { anexos: [edital] });
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.equal(x.conv_estado.sigilosa, 0);
  assert.notEqual(x.chamadas[0].modelo, GRATUITO);
  // Sinais que só a proteção reforçada vê (marcação de confidencialidade, dado sensível) viram sigilosos.
  assert.deepEqual(detectarReforcado('Edital público de licitação'), []);
  const y = await enviar('Resuma o relatório CONFIDENCIAL da diretoria.');
  assert.equal(y.r.status, 200);
  assert.equal(y.conv_estado.motivo_sigilosa, 'dado:confidencial');
  assert.deepEqual(y.chamadas.map(c => [c.modelo, c.rota]), [[EQUILIBRADO, 'Anthropic']]);
});

test('6. área sigilosa + conteúdo sigiloso + processamento sigiloso desligado → não envia', async () => {
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: false });
  try {
    const x = await enviar('Resuma o laudo médico do colaborador.');
    assert.equal(x.r.status, 409);
    assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo_desligado);
    assert.deepEqual(x.chamadas, []);
    assert.equal(x.conv_estado.sigilosa, 0, 'nada marcado');
    // Conteúdo comum na mesma área continua funcionando com a política desligada.
    assert.equal((await enviar('Resuma o processo de compras.')).r.status, 200);
  } finally { salvarConfig(S.app.db, { [POLITICA_SIGILO]: true }); }
});

test('7. área sigilosa + conteúdo sigiloso + nenhum recurso autorizado → não envia, admin avisado, mensagem simples', async () => {
  catalogo({});
  try {
  const x = await enviar('Resuma o laudo médico do colaborador.');
  assert.equal(x.r.status, 409);
  assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo);
  assert.doesNotMatch(x.r.erro.mensagem, /modelo|provedor|fornecedor|homolog|endpoint|open\s*router/i);
  assert.deepEqual(x.chamadas, []);
  assert.equal(x.rota.motivo_bloqueio, 'sem_recurso_elegivel');
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'governance.admin_alert' and detalhes like '%sem_modelo_sigilo%'"));
  // O histórico registra a tentativa sem guardar o conteúdo.
  const hist = (await ana.get(`/api/conversas/${x.conv.id}`)).dados.mensagens;
  assert.deepEqual(hist.map(m => m.papel), ['aviso']);
  assert.match(hist[0].texto, /^Uma mensagem não foi enviada/);
  assert.doesNotMatch(hist[0].texto, /laudo/);
  assert.equal(x.conv_estado.sigilosa, 0, 'o bloqueio não deixa a conversa presa como sigilosa');
  } finally { catalogo({ [EQUILIBRADO]: ROTA('Anthropic') }); }
});

test('8. recurso autorizado indisponível → nunca cai para recurso não autorizado (nem a reserva configurada)', async () => {
  await admin.put(`/api/admin/modelos/${enc(EQUILIBRADO)}`, { reserva: RAPIDO });
  OR.falhar.add(EQUILIBRADO);
  try {
    const x = await enviar('Resuma o laudo médico do colaborador.');
    assert.ok(x.r.falha, 'a pessoa recebe a falha, sem conteúdo em outro recurso');
    assert.ok(x.chamadas.length >= 1 && x.chamadas.every(c => c.modelo === EQUILIBRADO && !c.reserva), JSON.stringify(x.chamadas));
    // Conteúdo comum na área: a reserva só entra se também passar pelas regras da área.
    const y = await enviar('Resuma o processo de compras.');
    assert.ok(y.chamadas.every(c => ![c.modelo, ...(c.reserva || [])].includes(GRATUITO)), JSON.stringify(y.chamadas));
  } finally { OR.falhar.clear(); await admin.put(`/api/admin/modelos/${enc(EQUILIBRADO)}`, { reserva: null }); }
});

test('9. créditos no fim → nunca usa recurso não autorizado nem fora da proteção da área para manter continuidade', async () => {
  const OR2 = await openRouterFalso({ custo: 0.04 });
  const S2 = await subir({ ia: OR2.ia, plano: { creditos: 1, reserva: 100, precoUsd: 100 } });
  try {
    salvarConfig(S2.app.db, { [POLITICA_SIGILO]: true, exigirSemTreino: false });
    const adm = await S2.cliente().entrar('admin@exemplo.com.br');
    exec(S2.app.db, "insert or ignore into modelos (id, nome, fornecedor, contexto) values (?, 'Gratuito', 'meta', 128000)", GRATUITO);
    exec(S2.app.db, "update modelos set liberado = 1, perfil = 'rapido', preco_entrada = 0, preco_saida = 0 where id = ?", GRATUITO);
    const a = Number(exec(S2.app.db, "insert into areas (nome, sigilosa) values ('Diretoria', 1)").lastInsertRowid);
    exec(S2.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', a, adm.pessoa.id);
    const nova = async () => (await adm.post('/api/conversas', {})).dados.conversa;
    assert.equal((await enviarMensagem(adm, (await nova()).id, { texto: 'Olá' })).status, 200);   // entra na reserva do plano
    // Só o Equilibrado é autorizado, e a reserva do plano só usa Rápido: conteúdo sigiloso não sai.
    exec(S2.app.db, 'update modelos set homologado = 0, homologacao = null');
    exec(S2.app.db, 'update modelos set homologado = 1, homologacao = ? where id = ?', JSON.stringify(ROTA('Anthropic')), EQUILIBRADO);
    let n = OR2.chamadas.length;
    const r = await enviarMensagem(adm, (await nova()).id, { texto: 'Resuma o laudo médico do colaborador.' });
    assert.equal(r.status, 409);
    assert.equal(OR2.chamadas.length, n, 'reserva do plano + recurso não autorizado = nada enviado');
    // Conteúdo comum: continua no Rápido, mas nunca no gratuito (fora da proteção da área).
    n = OR2.chamadas.length;
    const c = await enviarMensagem(adm, (await nova()).id, { texto: 'Resuma o processo de compras.' });
    assert.equal(c.status, 200, JSON.stringify(c.erro));
    assert.ok(OR2.chamadas.slice(n).every(x => x.model !== GRATUITO && !(x.models || []).includes(GRATUITO)));
  } finally { await S2.fechar(); await OR2.fechar(); }
});

test('10. nova tentativa, fallback, anexos e API passam de novo pela mesma governança', async () => {
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  // API: pedir o gratuito, o Automático do serviço de IA ou um recurso não autorizado é só preferência.
  for (const modelo of [GRATUITO, 'classe:externo', 'openrouter/auto']) {
    const x = await enviar('Resuma o processo de compras.', { modelo });
    assert.equal(x.r.status, 200, `${modelo}: ${JSON.stringify(x.r.erro)}`);
    assert.ok(x.chamadas.every(c => c.modelo !== GRATUITO && c.modelo !== 'openrouter/auto'), `${modelo}: ${JSON.stringify(x.chamadas)}`);
    assert.equal(x.rota.decisao_solicitado, 'substituido', modelo);
  }
  const x = await enviar('Resuma o laudo médico do colaborador.', { modelo: RAPIDO });
  assert.deepEqual(x.chamadas.map(c => [c.modelo, c.rota]), [[EQUILIBRADO, 'Anthropic']], 'API com dado sigiloso: só o autorizado');
  // Nova tentativa na mesma conversa (já sigilosa): mesma governança.
  await ana.patch(`/api/conversas/${x.conv.id}`, { feedback: 'nao_serviu' });
  const y = await enviar('Tente de novo, com mais detalhe.', {}, x.conv);
  assert.equal(y.r.status, 200, JSON.stringify(y.r.erro));
  assert.ok(y.chamadas.every(c => c.modelo === EQUILIBRADO && c.rota === 'Anthropic'), JSON.stringify(y.chamadas));
  // Anexo com credencial numa conversa comum: bloqueia antes de qualquer chamada.
  const z = await enviar('Veja o arquivo.', { anexos: [arquivo('config.pdf', pdf(['api_key = sk-abcdefghijklmnopqrstuvwxyz123456']))] });
  assert.equal(z.r.status, 422);
  assert.deepEqual(z.chamadas, []);
});

// Regressão do caso real: PDF institucional (~9 mil caracteres, sem nenhum dado sigiloso) enviado numa área
// com proteção reforçada, sem NENHUM recurso autorizado para informação sigilosa. Não pode ser bloqueado por
// causa da área. Quem usa não vê recurso técnico; o admin da empresa vê o que o nível dele permite.
test('regressão: PDF institucional sem dado sigiloso em área reforçada não é bloqueado por causa da área', async () => {
  exec(S.app.db, 'insert or ignore into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, admin.pessoa.id);
  const linhas = [];
  for (let i = 1; linhas.join(' ').length < 9500; i++)
    linhas.push(`${i}. Comparacao entre a base oficial e o fornecedor de mercado: cobertura por UF, prazo de integracao e custo por consulta.`);
  const doc = arquivo('consultas-de-dados.pdf', pdf(linhas));
  for (const ligada of [true, false]) {   // com a opção de informação sigilosa ligada ou desligada: o resultado é o mesmo
    salvarConfig(S.app.db, { [POLITICA_SIGILO]: ligada });
    catalogo({});   // nenhum recurso autorizado para informação sigilosa
    const n = OR.chamadas.length;
    const x = await enviar('Analise este arquivo e faça um resumo.', { anexos: [doc] });
    assert.equal(x.r.status, 200, `política ${ligada}: ${JSON.stringify(x.r.erro)}`);
    assert.ok(x.r.texto.length > 0);
    assert.equal(OR.chamadas.length, n + 1, 'uma chamada, depois da decisão');
    // Não virou sigiloso, e a decisão ficou registrada como conteúdo comum com a proteção da área.
    assert.equal(x.conv_estado.sigilosa, 0);
    assert.equal(x.rota.sigilosa, 0);
    assert.equal(x.rota.resultado, 'respondido');
    assert.ok(JSON.parse(x.rota.politicas).includes('area_protecao_reforcada'));
    // Recurso compatível com a área (fornecedor fixo, sem treino), sem exigir autorização para dado sigiloso.
    const usado = x.chamadas[0].modelo;
    assert.notEqual(usado, GRATUITO);
    assert.equal(x.chamadas[0].semTreino, true);
    assert.equal(um(S.app.db, 'select homologado from modelos where id = ?', usado).homologado, 0);
    // O anexo foi lido inteiro e ficou no histórico com a mensagem.
    assert.equal(um(S.app.db, 'select count(*) n from anexos where conversa_id = ?', x.conv.id).n, 1);
    // Quem usa: nada técnico, nem no streaming nem no histórico.
    assert.equal(x.r.fim.modelo, null);
    assert.equal(x.r.fim.fornecedor ?? null, null);
    // (o provedor falso escreve o nome do modelo no próprio texto da resposta; o que se confere são os metadados)
    const d = (await ana.get(`/api/conversas/${x.conv.id}`)).dados;
    const hist = JSON.stringify({ ...d, mensagens: d.mensagens.map(({ texto, ...m }) => m) });
    assert.doesNotMatch(hist, new RegExp(`${usado.replace(/[/.]/g, '\\$&')}|open\\s*router|Anthropic|Google`, 'i'));
    assert.doesNotMatch(hist, /Uma mensagem não foi enviada/);
  }
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: true });
  // Admin da empresa, na mesma área: o mesmo resultado, e ele vê o recurso usado (o nível de informação dele).
  const c = (await admin.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(admin, c.id, { texto: 'Analise este arquivo.', anexos: [doc] });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.ok(r.fim.modelo && r.fim.modelo !== GRATUITO);
  assert.doesNotMatch(JSON.stringify(r.fim), /open\s*router/i, 'nem o admin da empresa vê o provedor');
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
});

test('regressão: o único bloqueio legítimo de conteúdo comum na área é não haver recurso compatível; mensagem simples, sem marcar a conversa', async () => {
  // Só o gratuito liberado: nenhum recurso cumpre a proteção da área. Nada é enviado (não se usa o incompatível
  // para manter continuidade), a mensagem é a de indisponibilidade (não a de informação sigilosa), a conversa
  // não fica sigilosa e o histórico registra a tentativa sem o conteúdo.
  const antes = um(S.app.db, "select group_concat(id) ids from modelos where liberado = 1 and id <> ?", GRATUITO).ids.split(',');
  exec(S.app.db, 'update modelos set liberado = 0 where id <> ?', GRATUITO);
  try {
    const x = await enviar('Analise este arquivo.', { anexos: [PDF_INSTITUCIONAL] });
    assert.equal(x.r.status, 503);
    assert.equal(x.r.erro.mensagem, MSG_USUARIO.indisponivel);
    assert.deepEqual(x.chamadas, []);
    assert.equal(x.conv_estado.sigilosa, 0);
    const hist = (await ana.get(`/api/conversas/${x.conv.id}`)).dados.mensagens;
    assert.deepEqual(hist.map(m => m.papel), ['aviso']);
    assert.equal(um(S.app.db, 'select count(*) n from anexos where conversa_id = ?', x.conv.id).n, 0, 'anexo bloqueado não é guardado');
    assert.doesNotMatch(hist[0].texto, /Workshop|UFs/);
  } finally {
    for (const id of antes) exec(S.app.db, 'update modelos set liberado = 1 where id = ?', id);
  }
});
