// Etapa 4 da auditoria operacional (provedores de IA): o que de fato SAI para o serviço de acesso a modelos
// quando a conversa tem informação sigilosa. Cada teste confere os corpos das requisições recebidas pelo
// OpenRouter falso (modelo, provider.only/order, allow_fallbacks, zdr, data_collection, models, plugins) em
// todos os caminhos: permitido, negado, indisponível (5xx e 429), reserva do plano, gerar de novo, Quick Win com
// conferência e pesquisa liberada, execução programada e chamadas secundárias. Conteúdo 100% sintético.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { montarCorpo, criarOpenRouter, ErroIA } from '../src/ia.js';
import { POLITICA_SIGILO, semRotaFixa, avaliarRecurso } from '../src/sigilo.js';
import { construir } from '../src/quickwin-construtor.js';
import { chamarGovernado } from '../src/quickwin-estrutura.js';
import { decisaoImagem } from '../src/visual/producao.js';
import { rodadaProgramadas } from '../src/qw-programacao.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
const FIXADA = f => ({ order: [f], only: [f], allow_fallbacks: false, zdr: true, data_collection: 'deny' });
const SINTETICO = 'Documento CONFIDENCIAL fictício: proposta Projeto Aurora, valor de referência 999 unidades.';
const enc = encodeURIComponent;
let S, OR, admin, ana;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], [POLITICA_SIGILO]: true, pesquisaWeb: { ativa: true } });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: true } } });
});
after(async () => { await S.fechar(); await OR.fechar(); });

function catalogo(app, rotas) {
  exec(app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
}
// Tudo o que chegou ao fornecedor desde a marca (execução, conferência e revisão da conferência).
const marca = (or = OR) => ({ c: or.chamadas.length, r: or.revisoes.length });
const desde = (m, or = OR) => [...or.chamadas.slice(m.c), ...or.revisoes.slice(m.r)];
// Toda requisição de conversa sigilosa: modelo autorizado, fornecedor fixado, sem reserva no fornecedor, sem plugins.
function soRotaFixada(corpos, modelos, fornecedor) {
  assert.ok(corpos.length > 0, 'houve envio');
  for (const b of corpos) {
    assert.ok(modelos.includes(b.model), `modelo ${b.model} fora dos autorizados`);
    assert.deepEqual(b.provider, FIXADA(fornecedor), `provider de ${b.model}`);
    assert.equal(b.models, undefined, 'sem lista de modelos de reserva no fornecedor');
    assert.equal(b.plugins, undefined, 'sem plugins (pesquisa na internet)');
    assert.equal(b.modalities, undefined, 'sem geração de imagem');
    assert.ok(!semRotaFixa(b.model), 'nunca automático, gratuito ou :online');
  }
}
const sigilosa = async (c = ana) => { const v = (await c.post('/api/conversas', {})).dados.conversa; await c.patch(`/api/conversas/${v.id}`, { sigilosa: true }); return v; };
const ultimaRota = (app = S.app) => um(app.db, 'select * from roteamento order by id desc limit 1');

// ---------------------------------------------------------------- Corpo da requisição (função pura)
test('montarCorpo: sigilosa fixa o fornecedor e recusa (fail closed) automático, gratuito, :online, pesquisa e reserva', () => {
  const b = montarCorpo([{ role: 'user', content: 'x' }], { modelo: EQUILIBRADO, sigilosa: true, fornecedor: 'anthropic', reserva: AVANCADO, semTreino: false });
  assert.deepEqual(b.provider, FIXADA('anthropic'), 'semTreino=false não afrouxa a sigilosa');
  assert.equal(b.models, undefined, 'a reserva do modelo nunca entra numa sigilosa');
  assert.equal(b.plugins, undefined);
  const recusa = op => assert.throws(() => montarCorpo([], { modelo: EQUILIBRADO, sigilosa: true, fornecedor: 'anthropic', ...op }), ErroIA, JSON.stringify(op));
  recusa({ fornecedor: undefined });
  recusa({ fornecedor: '' });
  recusa({ fornecedor: ['anthropic'] });
  for (const modelo of ['openrouter/auto', 'openrouter/free', 'openrouter/qualquer-roteador', 'meta-llama/x:free', `${EQUILIBRADO}:online`]) recusa({ modelo });
  recusa({ pesquisaWeb: { max: 5 } });
  // Conversa normal: pedido "sem coleta" por padrão; a reserva vai na lista de modelos.
  assert.deepEqual(montarCorpo([], { modelo: RAPIDO, reserva: EQUILIBRADO }).provider, { data_collection: 'deny' });
  assert.deepEqual(montarCorpo([], { modelo: RAPIDO, reserva: EQUILIBRADO }).models, [RAPIDO, EQUILIBRADO]);
  // A camada central trata :online e roteadores do serviço de acesso como sem rota fixa.
  const cfg = { governanca: { modo: 'manual' } };
  for (const id of [`${EQUILIBRADO}:online`, 'openrouter/qualquer-roteador']) assert.ok(avaliarRecurso({ id, liberado: true, homologacaoEmpresa: ROTA('anthropic') }, cfg).motivos.includes('sem_rota_fixa'), id);
});

test('gerarImagem: nunca recebe pedido sigiloso (nenhuma requisição sai); governança barra a imagem em sigilosa', async () => {
  const pedidos = [];
  const ia = criarOpenRouter({ chave: 'x', base: 'http://127.0.0.1:9/api/v1', fetch: async (...a) => { pedidos.push(a); throw new Error('não deveria chamar'); } });
  await assert.rejects(ia.gerarImagem('tema', { modelo: 'google/gemini-2.5-flash-image', sigilosa: true }), ErroIA);
  assert.equal(pedidos.length, 0);
  const app = { ia: { gerarImagem() {}, geraImagem: true } };
  const cfg = { producaoVisual: { imagens: { ativa: true } } };
  assert.deepEqual(decisaoImagem(app, cfg, { sigilosa: true }), { pode: false, motivo: 'sigilosa' });
  assert.equal(decisaoImagem(app, cfg, { areaReforcada: true }).pode, false);
});

// ---------------------------------------------------------------- Chat
test('permitido: uma única requisição, pela rota homologada, com zdr e data_collection deny; nenhuma chamada secundária (título, resumo)', async () => {
  catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic') });
  salvarConfig(S.app.db, { exigirSemTreino: false });   // o admin desligou o filtro das conversas normais
  try {
    const conv = await sigilosa();
    const m = marca();
    const r = await enviarMensagem(ana, conv.id, { texto: SINTETICO });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    const corpos = desde(m);
    assert.equal(corpos.length, 1, 'título e resumo não usam IA: só a resposta');
    soRotaFixada(corpos, [EQUILIBRADO], 'anthropic');
    assert.equal(ultimaRota().resultado, 'respondido');
    // Conversa comum ao lado: sem fornecedor fixado e, com o filtro desligado pelo admin, data_collection allow.
    const comum = (await ana.post('/api/conversas', {})).dados.conversa;
    const m2 = marca();
    await enviarMensagem(ana, comum.id, { texto: 'Traduza bom dia para o inglês.' });
    assert.equal(desde(m2)[0].provider.only, undefined);
    assert.equal(desde(m2)[0].provider.data_collection, 'allow');
  } finally { salvarConfig(S.app.db, { exigirSemTreino: true }); }
});

test('negado: sem rota elegível nada é enviado, a pessoa lê a mensagem clara e fica o registro de auditoria', async () => {
  // Rápido barato liberado e o Automático do serviço disponíveis, mas nenhum homologado com garantias completas.
  catalogo(S.app, { [EQUILIBRADO]: { ...ROTA('anthropic'), retencaoZero: false } });
  await admin.put('/api/admin/modelos-config', { automatico: true });
  try {
    for (const modelo of [undefined, RAPIDO, 'openrouter/auto', 'classe:rapido']) {
      const conv = await sigilosa();
      const m = marca();
      const r = await enviarMensagem(ana, conv.id, { texto: SINTETICO, ...(modelo ? { modelo } : {}) });
      assert.equal(r.status, 409, String(modelo));
      assert.equal(r.erro.mensagem, MSG_USUARIO.sigilo);
      assert.equal(desde(m).length, 0, `${modelo}: nada saiu`);
      const rota = ultimaRota();
      assert.equal(rota.resultado, 'bloqueado');
      assert.equal(rota.motivo_bloqueio, 'sem_recurso_elegivel');
      assert.equal(rota.sigilosa, 1);
      assert.ok(!JSON.stringify(rota).includes('Projeto Aurora'), 'auditoria sem conteúdo');
    }
    assert.ok(um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n >= 1, 'admin avisado');
  } finally { await admin.put('/api/admin/modelos-config', { automatico: false }); }
});

for (const status of [503, 429]) {
  test(`indisponível (${status}): só o homologado é tentado; sem reserva não homologada, sem automático; erro para a pessoa`, async () => {
    catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic') });
    await admin.put(`/api/admin/modelos/${enc(EQUILIBRADO)}`, { reserva: RAPIDO });   // reserva configurada, não homologada
    OR.statusFalha = status;
    OR.falhar.add(EQUILIBRADO);
    try {
      const conv = await sigilosa();
      const m = marca();
      const r = await enviarMensagem(ana, conv.id, { texto: SINTETICO });
      const corpos = desde(m);
      soRotaFixada(corpos, [EQUILIBRADO], 'anthropic');
      assert.equal(corpos.length, 1, 'sem nova tentativa automática para outro recurso não elegível');
      assert.ok(r.falha, 'a pessoa recebe o erro');
      assert.ok([MSG_USUARIO.falhou, MSG_USUARIO.ia_fora].includes(r.falha.mensagem));
      assert.equal(ultimaRota().resultado, 'falha_na_execucao');
      assert.ok(um(S.app.db, "select count(*) as n from eventos where tipo = 'ai.failed' and detalhes like ?", `%"conversa":${conv.id},%`).n >= 1);
    } finally {
      OR.falhar.clear(); OR.statusFalha = 503;
      await admin.put(`/api/admin/modelos/${enc(EQUILIBRADO)}`, { reserva: null });
    }
  });
}

test('indisponível: homologação não concede Advanced ao fallback sem autorização administrativa', async () => {
  catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic'), [AVANCADO]: ROTA('anthropic-b') });
  OR.statusFalha = 429; OR.falhar.add(EQUILIBRADO);
  try {
    const m = marca();
    const r = await enviarMensagem(ana, (await sigilosa()).id, { texto: SINTETICO });
    assert.equal(r.status, 200);
    const corpos = desde(m);
    assert.deepEqual(corpos.map(b => [b.model, b.provider.only[0]]), [[EQUILIBRADO, 'anthropic']]);
    assert.ok(r.falha,'sem concessão Advanced, informa impedimento em vez de escalar');
    for (const b of corpos) assert.deepEqual(b.provider, FIXADA(b.provider.only[0]));
  } finally { OR.falhar.clear(); OR.statusFalha = 503; }
});

test('gerar de novo: mesma rota fixada; autorização retirada → nada é enviado', async () => {
  catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic') });
  const conv = await sigilosa();
  const r1 = await enviarMensagem(ana, conv.id, { texto: SINTETICO });
  assert.equal(r1.status, 200);
  const regenerar = async () => { const r = await ana.req('POST', `/api/conversas/${conv.id}/regenerar`, { mensagem_id: r1.fim.id }); return r; };
  let m = marca();
  const r2 = await regenerar();
  assert.equal(r2.status, 200);
  soRotaFixada(desde(m), [EQUILIBRADO], 'anthropic');
  catalogo(S.app, {});
  m = marca();
  const r3 = await regenerar();
  assert.equal(r3.status, 409);
  assert.equal(desde(m).length, 0);
});

test('reserva do plano não reduz a capacidade necessária, mesmo com Rápido homologado', async () => {
  const OR2 = await openRouterFalso({ custo: 0.04 });
  const S2 = await subir({ ia: OR2.ia, plano: { creditos: 1, reserva: 100, precoUsd: 100 } });
  try {
    salvarConfig(S2.app.db, { [POLITICA_SIGILO]: true });
    const adm = await S2.cliente().entrar('admin@exemplo.com.br');
    assert.equal((await enviarMensagem(adm, (await adm.post('/api/conversas', {})).dados.conversa.id, { texto: 'Olá' })).status, 200);   // consome e entra na reserva
    catalogo(S2.app, { [EQUILIBRADO]: ROTA('anthropic') });
    let m = marca(OR2);
    let r = await enviarMensagem(adm, (await sigilosa(adm)).id, { texto: SINTETICO });
    assert.equal(r.status, 402);
    assert.equal(desde(m, OR2).length, 0, 'na reserva, o Rápido não homologado nunca recebe a sigilosa');
    catalogo(S2.app, { [RAPIDO]: ROTA('google-vertex') });
    m = marca(OR2);
    r = await enviarMensagem(adm, (await sigilosa(adm)).id, { texto: SINTETICO });
    assert.equal(r.status, 402, JSON.stringify(r.erro));
    assert.equal(desde(m, OR2).length,0,'a homologação do Rápido não atende a exigência do pedido');
  } finally { await S2.fechar(); await OR2.fechar(); }
});

// ---------------------------------------------------------------- Quick Win (execução, conferência, pesquisa, programação)
async function qwSigilosoComPesquisa(app, cli) {
  const q = (await cli.post('/api/quick-wins', { nome: 'Comparativo sigiloso', toda_empresa: true })).dados;
  const espec = construir({ descricao: 'Pesquise na internet os principais concorrentes da empresa no mercado de software de gestão e monte uma tabela comparativa', formato: 'tabela' });
  assert.ok(espec.ferramentas_permitidas.includes('pesquisa_web'), 'o Quick Win pede pesquisa na internet');
  const agora = new Date().toISOString();
  const v = exec(app.db, 'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)', q.id, JSON.stringify(espec), q.nome, agora).lastInsertRowid;
  exec(app.db, "update quick_wins set especificacao=?, versao_publicada=?, status='em_uso', sigiloso=1 where id=?", JSON.stringify(espec), v, q.id);
  return q;
}

test('Quick Win sigiloso com pesquisa liberada pela empresa: sem plugin web; execução e conferência pela rota fixada', async () => {
  catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic') });
  const q = await qwSigilosoComPesquisa(S.app, admin);
  const conv = (await admin.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  const m = marca();
  const r = await enviarMensagem(admin, conv.id, { executar_quick_win: true, texto: SINTETICO });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const corpos = desde(m);
  assert.ok(corpos.length >= 2, `execução e conferência (${corpos.length})`);
  soRotaFixada(corpos, [EQUILIBRADO], 'anthropic');
  assert.equal(um(S.app.db, 'select sigilosa from conversas where id = ?', conv.id).sigilosa, 1);
  // A pesquisa foi recusada com motivo registrado (o resultado fica parcial; nada é simulado).
  assert.equal(um(S.app.db, "select count(*) as n from eventos where tipo = 'quickwin.tool_used' and detalhes like ?", `%"conversa":${conv.id},%`).n, 0);
});

test('Quick Win sigiloso sem rota elegível: nenhuma requisição, nem da conferência', async () => {
  catalogo(S.app, {});
  const q = await qwSigilosoComPesquisa(S.app, admin);
  const conv = (await admin.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  const m = marca();
  const r = await enviarMensagem(admin, conv.id, { executar_quick_win: true, texto: SINTETICO });
  assert.equal(r.status, 409);
  assert.equal(desde(m).length, 0);
});

test('chamadas curtas da criação/refino/painel (interpretação, estrutura, exemplo): Quick Win sigiloso nunca vai à IA', async () => {
  catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic') });
  await admin.post('/api/politica/ciencia', { versao: (await admin.get('/api/politica')).dados.versao });
  const pessoa = { ...(await admin.get('/api/eu')).dados.pessoa, areas: [] };
  const m = marca();
  const r = await chamarGovernado(S.app, pessoa, { conteudo: 'Resuma o material.', mensagens: [{ role: 'user', content: 'Resuma o material.' }], qw: { id: 0, sigiloso: true }, origem: 'teste' });
  assert.deepEqual(r, { recusado: true, motivo: 'sigilo' });
  const r2 = await chamarGovernado(S.app, pessoa, { conteudo: SINTETICO, mensagens: [{ role: 'user', content: SINTETICO }], qw: null, origem: 'teste' });
  assert.equal(r2.recusado, true, 'conteúdo que a política manda proteger também não sai por essas chamadas');
  assert.equal(desde(m).length, 0);
});

test('execução programada de Quick Win sigiloso: rota fixada; sem rota elegível, bloqueia sem enviar', async () => {
  catalogo(S.app, { [EQUILIBRADO]: ROTA('anthropic') });
  const q = await qwSigilosoComPesquisa(S.app, admin);
  const corpo = { nome: 'Rotina sigilosa', tipo: 'horario', agenda: { frequencia: 'diaria', hora: '08:00', fuso: 'America/Sao_Paulo' }, entrada: SINTETICO, limite_creditos: 1000, max_dia: 5 };
  const s = (await admin.post(`/api/quick-wins/${q.id}/programacoes`, corpo)).dados;
  assert.ok(s?.id, JSON.stringify(s));
  const base = `/api/quick-wins/${q.id}/programacoes/${s.id}`;
  assert.equal((await admin.post(`${base}/estado`, { ativa: true })).status, 200);
  assert.equal((await admin.post(`${base}/executar`, {})).status, 200);
  let m = marca();
  await rodadaProgramadas(S.app);
  const e = um(S.app.db, 'select * from qw_programadas_execucoes where programacao_id = ? order by criada_em desc limit 1', s.id);
  assert.ok(e.conversa_id, JSON.stringify(e));
  soRotaFixada(desde(m), [EQUILIBRADO], 'anthropic');
  // Sem rota elegível: a execução programada não envia nada.
  catalogo(S.app, {});
  assert.equal((await admin.post(`${base}/estado`, { ativa: true })).status, 200);
  assert.equal((await admin.post(`${base}/executar`, {})).status, 200);
  m = marca();
  await rodadaProgramadas(S.app);
  const e2 = todos(S.app.db, 'select * from qw_programadas_execucoes where programacao_id = ? order by rowid desc', s.id)[0];
  assert.notEqual(e2.id, e.id);
  assert.ok(['falhou', 'bloqueada'].includes(e2.status), JSON.stringify(e2));
  assert.equal(desde(m).length, 0, 'nada saiu');
});

test('homologação: variante :online e roteadores do serviço de acesso nunca são aprovados para sigilo', async () => {
  for (const id of [`${EQUILIBRADO}:online`, 'openrouter/roteador-novo']) {
    exec(S.app.db, "insert or ignore into modelos (id, nome, fornecedor, liberado, perfil, preco_entrada, preco_saida, contexto) values (?, ?, 'x', 1, 'equilibrado', 1e-6, 2e-6, 200000)", id, id);
    const r = await admin.post(`/api/admin/modelos/${enc(id)}/homologar`, { fornecedor: 'anthropic', semTreino: true, retencaoZero: true, justificativa: 'teste sintético de bloqueio' });
    assert.equal(r.status, 400, `${id}: ${JSON.stringify(r.dados)}`);
    assert.match(JSON.stringify(r.dados), /nao_homologavel/);
    assert.equal(um(S.app.db, 'select homologado from modelos where id = ?', id).homologado, 0);
    exec(S.app.db, 'delete from modelos where id = ?', id);
  }
});
