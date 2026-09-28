// O campo "modelo" (tela ou API) é PREFERÊNCIA, nunca garantia: nenhuma entrada faz a GreenIA executar um
// modelo que a governança não permite. Modelo solicitado elegível → usado; não elegível com alternativa →
// substituído (registrado, com motivo determinístico); sem alternativa → bloqueio seguro, nada enviado.
// Também: uma só rota de execução, hierarquia plataforma → empresa → pessoa, modo recomendado e manual com
// as mesmas regras, admin leigo e pessoa leiga.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { subir } from './ajuda.js';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, docx } from './arquivos.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, todos, um } from '../src/db.js';
import { ErroIA } from '../src/ia.js';
import { MOTIVO_SUBSTITUICAO } from '../src/roteador.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
const VETADO = 'mistralai/mistral-small', GRATUITO = 'meta-llama/llama-3.3-70b-instruct:free', NAO_LIBERADO = 'openai/gpt-5-mini';
const enc = encodeURIComponent;
const TECNICO = /modelo|homolog|\bclasse\b|perfil|janela|token|configur|libere|liberar|openrouter|provedor|fornecedor|gestão|fale com o admin|avise o admin|fallback|reserva de/i;

let S, OR, admin, ana, falhaIA = null;
const ia = () => ({ ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
  async *enviar(msgs, op) { if (falhaIA) throw new ErroIA(`O serviço de IA recusou (${falhaIA})`, falhaIA); yield* OR.ia.enviar(msgs, op); } });

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: ia() });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  // Empresa: Avançado só para um grupo (Ana fora); Equilibrado homologado para dado sigiloso; um modelo
  // homologado pela empresa e depois vetado pela plataforma; um gratuito liberado; um modelo não liberado.
  const h = await admin.post(`/api/admin/modelos/${enc(EQUILIBRADO)}/homologar`, { fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato.' });
  assert.equal(h.status, 200, JSON.stringify(h.dados));
  assert.equal((await admin.put(`/api/admin/modelos/${enc(VETADO)}`, { liberado: true, perfil: 'rapido' })).status, 200);
  assert.equal((await admin.post(`/api/admin/modelos/${enc(VETADO)}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato.' })).status, 200);
  exec(S.app.db, 'update modelos set vetado_plataforma = 1 where id = ?', VETADO);   // o que a plataforma aplica na empresa
  assert.equal((await admin.put(`/api/admin/modelos/${enc(GRATUITO)}`, { liberado: true, perfil: 'rapido' })).status, 200);
  exec(S.app.db, "insert or ignore into modelos (id, nome, fornecedor, liberado, perfil) values (?, 'Não liberado', 'openai', 0, 'rapido')", NAO_LIBERADO);
});
after(async () => { await S.fechar(); await OR.fechar(); });

const conversa = async (corpo = {}, c = ana) => (await c.post('/api/conversas', corpo)).dados.conversa;
const sigilosa = async () => { const c = await conversa(); await ana.patch(`/api/conversas/${c.id}`, { sigilosa: true }); return c; };
const ultimaRota = (db = S.app.db) => um(db, 'select * from roteamento order by id desc limit 1');
const executados = n => OR.chamadas.slice(n).flatMap(c => [c.model, ...(c.models || [])]);

// Oráculo independente do roteador: o que a governança da empresa permite para a Ana nesta conversa.
function permitido(id, { sigilosa: sig }) {
  const m = um(S.app.db, 'select * from modelos where id = ?', id);
  const cfg = lerConfig(S.app.db);
  if (id === 'openrouter/auto') return cfg.automatico && !sig;
  if (!m?.liberado) return false;
  if (cfg.exigirSemTreino && /:free$/.test(id)) return false;
  if (sig && (!m.homologado || m.vetado_plataforma)) return false;
  const temAcesso = m.perfil === 'rapido' || cfg.acessoPerfis[m.perfil]?.todos;
  return !!temAcesso;
}

async function pedir(conv, modelo, texto = 'Resuma o texto a seguir em três linhas: reunião de planejamento do trimestre.') {
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...(modelo !== undefined ? { modelo } : {}) });
  return { r, n, feitos: executados(n), rota: ultimaRota() };
}

// Invariante: o que foi executado é sempre permitido; nada é executado num bloqueio; o registro guarda
// o solicitado, a decisão e um motivo da taxonomia.
function confereInvariante({ r, feitos, rota }, modelo, sig) {
  for (const id of feitos) assert.ok(permitido(id, { sigilosa: sig }), `executou ${id} (solicitado ${modelo}, sigilosa ${sig})`);
  if (r.status !== 200) assert.equal(feitos.length, 0, 'bloqueio: nada enviado');
  if (modelo && modelo !== 'classe:auto') {
    assert.equal(rota.modelo_solicitado, modelo);
    assert.ok(['respeitado', 'substituido', 'bloqueado'].includes(rota.decisao_solicitado), rota.decisao_solicitado);
    if (rota.decisao_solicitado === 'substituido') assert.ok(rota.motivo_substituicao in MOTIVO_SUBSTITUICAO, rota.motivo_substituicao);
    if (rota.decisao_solicitado === 'respeitado') assert.equal(rota.motivo_substituicao, null);
    if (r.status === 200 && feitos[0] === modelo) assert.equal(rota.decisao_solicitado, 'respeitado');
  }
}

test('invariante (10 casos): modelo proibido nunca é executado; com alternativa é substituído, sem alternativa bloqueia', async () => {
  const casos = [
    ['1. não homologado (conversa sigilosa)', RAPIDO, true, 'requested_model_not_homologated'],
    ['2. não autorizado para dado sigiloso (vetado pela plataforma)', VETADO, true, 'requested_model_not_allowed_for_sensitive_data'],
    ['2b. gratuito em conversa sigilosa', GRATUITO, true, 'requested_model_not_allowed_for_sensitive_data'],
    ['3. sem permissão para o grupo', AVANCADO, false, 'requested_model_permission_restricted'],
    ['3b. nível sem permissão', 'classe:avancado', false, 'requested_model_permission_restricted'],
    ['5. indisponível (não liberado)', NAO_LIBERADO, false, 'requested_model_not_authorized'],
    ['6. inexistente', 'nao/existe', false, 'requested_model_not_found'],
    ['7. Automático do OpenRouter proibido', 'openrouter/auto', false, 'requested_model_not_authorized'],
    ['10. política da empresa (sem treino com os dados)', GRATUITO, false, 'requested_model_policy_restricted'],
  ];
  for (const [nome, modelo, sig, motivo] of casos) {
    const conv = sig ? await sigilosa() : await conversa();
    const x = await pedir(conv, modelo);
    assert.equal(x.r.status, 200, `${nome}: ${JSON.stringify(x.r.erro)}`);
    assert.ok(!x.feitos.includes(modelo), `${nome}: executou o proibido`);
    confereInvariante(x, modelo, sig);
    assert.equal(x.rota.decisao_solicitado, 'substituido', nome);
    assert.equal(x.rota.motivo_substituicao, motivo, nome);
    assert.match(x.rota.explicacao, /Modelo solicitado não usado/, `${nome}: explicação reconstruída do registro`);
    // Quem conversa sabe que houve troca, sem a regra técnica.
    assert.deepEqual(x.r.fim.rota.solicitacao, { modelo_solicitado: modelo, modelo_selecionado: x.r.fim.modelo, decisao: 'substituido', motivo: 'requested_model_not_eligible' }, nome);
  }
});

test('invariante 7b: Automático do OpenRouter ligado pela empresa nunca recebe dado sigiloso', async () => {
  await admin.put('/api/admin/modelos-config', { automatico: true });
  const x = await pedir(await sigilosa(), 'openrouter/auto');
  assert.equal(x.r.status, 200);
  assert.ok(!x.feitos.includes('openrouter/auto'));
  assert.equal(x.rota.motivo_substituicao, 'requested_model_not_allowed_for_sensitive_data');
  const livre = await pedir(await conversa(), 'openrouter/auto');
  assert.equal(livre.feitos[0], 'openrouter/auto', 'fora do sigilo, a empresa permite: respeitado');
  assert.equal(livre.rota.decisao_solicitado, 'respeitado');
  await admin.put('/api/admin/modelos-config', { automatico: false });
});

test('invariante 8: capacidade abaixo da classe mínima do quick win não é usada', async () => {
  const q = (await admin.post('/api/quick-wins', { nome: 'Análise de riscos', toda_empresa: true, modelo: 'classe:equilibrado', pode_trocar: true })).dados;
  assert.equal((await admin.put(`/api/quick-wins/${q.id}`, { status: 'ativo' })).status, 200);
  const conv = await conversa({ quick_win_id: q.id });
  const x = await pedir(conv, 'classe:rapido');
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.ok(!x.feitos.includes(RAPIDO) && !x.feitos.includes(VETADO) && !x.feitos.includes(GRATUITO));
  assert.equal(x.rota.motivo_substituicao, 'requested_model_insufficient_capacity');
  confereInvariante(x, 'classe:rapido', false);
});

test('invariante 9: janela insuficiente do modelo solicitado: vai para um que lê tudo', async () => {
  exec(S.app.db, 'update modelos set contexto = 2000 where id = ?', RAPIDO);
  const x = await pedir(await conversa(), RAPIDO, `Resuma o texto a seguir. ${'Relatório de atividades do mês. '.repeat(400)}`);
  exec(S.app.db, 'update modelos set contexto = 1048576 where id = ?', RAPIDO);
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.ok(!x.feitos.includes(RAPIDO));
  assert.equal(x.rota.motivo_substituicao, 'requested_model_context_limit');
  confereInvariante(x, RAPIDO, false);
});

test('invariante 4: fora do plano (créditos no fim): só o nível econômico', async () => {
  const OR2 = await openRouterFalso({ custo: 0.04 });
  const S2 = await subir({ ia: OR2.ia, plano: { creditos: 1, reserva: 100, precoUsd: 100 } });
  try {
    const adm = await S2.cliente().entrar('admin@exemplo.com.br');
    const c1 = (await adm.post('/api/conversas', {})).dados.conversa;
    assert.equal((await enviarMensagem(adm, c1.id, { texto: 'Olá' })).status, 200);   // consome o plano: entra na reserva
    const c2 = (await adm.post('/api/conversas', {})).dados.conversa;
    const n = OR2.chamadas.length;
    const r = await enviarMensagem(adm, c2.id, { texto: 'Olá', modelo: EQUILIBRADO });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    assert.ok(!OR2.chamadas.slice(n).some(c => c.model === EQUILIBRADO));
    const rota = ultimaRota(S2.app.db);
    assert.equal(rota.decisao_solicitado, 'substituido');
    assert.equal(rota.motivo_substituicao, 'requested_model_plan_restricted');
    assert.equal(r.fim.rota.solicitacao.motivo, 'requested_model_plan_restricted', 'o admin vê o motivo exato');
  } finally { await S2.fechar(); await OR2.fechar(); }
});

test('invariante (propriedade): 120 entradas aleatórias de API nunca executam modelo proibido', async () => {
  let semente = 20260928;
  const aleatorio = n => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente % n; };
  const pedidos = [RAPIDO, EQUILIBRADO, AVANCADO, VETADO, GRATUITO, NAO_LIBERADO, 'nao/existe', 'openrouter/auto', 'classe:rapido', 'classe:equilibrado', 'classe:avancado', 'classe:auto', undefined, 'x', ''];
  const textos = ['Olá', 'Analise este contrato e identifique riscos jurídicos e obrigações.', 'Corrija este código: function soma(a,b){return a-b}', 'Confira o fornecedor CNPJ 11.222.333/0001-81.'];
  let substituidos = 0;
  for (let i = 0; i < 120; i++) {
    const modelo = pedidos[aleatorio(pedidos.length)], sig = aleatorio(3) === 0, texto = textos[aleatorio(textos.length)];
    const conv = sig ? await sigilosa() : await conversa();
    const x = await pedir(conv, modelo, texto);
    const sigFinal = (await ana.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa;   // o CNPJ torna sigilosa
    assert.ok([200].includes(x.r.status), `entrada ${i} (${modelo}): ${x.r.status} ${JSON.stringify(x.r.erro)}`);
    confereInvariante(x, modelo || null, sigFinal);
    if (x.rota.decisao_solicitado === 'substituido') substituidos++;
  }
  assert.ok(substituidos > 10, 'a amostra exercitou substituições');
});

test('caso A: solicitado elegível é usado (solicitado == selecionado)', async () => {
  const x = await pedir(await conversa(), RAPIDO);
  assert.equal(x.feitos[0], RAPIDO);
  assert.equal(x.rota.decisao_solicitado, 'respeitado');
  assert.deepEqual(x.r.fim.rota.solicitacao, { modelo_solicitado: RAPIDO, modelo_selecionado: RAPIDO, decisao: 'respeitado', motivo: null });
  // Sem modelo solicitado, não há solicitação a relatar.
  const y = await pedir(await conversa(), undefined);
  assert.equal(y.r.fim.rota.solicitacao, null);
  assert.equal(y.rota.modelo_solicitado, null);
});

test('caso B: solicitado não elegível com alternativa: substituído, executa normalmente; o admin vê o motivo exato', async () => {
  const conv = await conversa({}, admin);
  const n = OR.chamadas.length;
  const r = await enviarMensagem(admin, conv.id, { texto: 'Olá', modelo: 'nao/existe' });
  assert.equal(r.status, 200);
  assert.ok(r.texto.length > 0);
  assert.notEqual(r.fim.rota.solicitacao.modelo_selecionado, 'nao/existe');
  assert.deepEqual({ ...r.fim.rota.solicitacao, modelo_selecionado: null }, { modelo_solicitado: 'nao/existe', modelo_selecionado: null, decisao: 'substituido', motivo: 'requested_model_not_found' });
  assert.equal(executados(n).length, 1);
});

test('caso B2: o selecionado cai no fornecedor e a reserva responde: registrado como substituição por indisponibilidade', async () => {
  await admin.put(`/api/admin/modelos/${enc(NAO_LIBERADO)}`, { liberado: true, perfil: 'rapido' });
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: NAO_LIBERADO });
  OR.falhar.add(RAPIDO);
  const x = await pedir(await conversa(), RAPIDO);
  OR.falhar.delete(RAPIDO);
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: null });
  await admin.put(`/api/admin/modelos/${enc(NAO_LIBERADO)}`, { liberado: false });
  assert.equal(x.r.fim.modelo, NAO_LIBERADO);
  const rota = um(S.app.db, 'select * from roteamento where id = ?', x.rota.id);
  assert.equal(rota.decisao_solicitado, 'substituido');
  assert.equal(rota.motivo_substituicao, 'requested_model_not_available');
  assert.equal(x.r.fim.rota.solicitacao.decisao, 'substituido');
});

test('caso C: solicitado não elegível e sem alternativa: bloqueio seguro, nada enviado, admin avisado', async () => {
  exec(S.app.db, 'update modelos set vetado_plataforma = 1 where id = ?', EQUILIBRADO);   // nenhum autorizado sobra
  const conv = await sigilosa();
  const x = await pedir(conv, RAPIDO);
  exec(S.app.db, 'update modelos set vetado_plataforma = 0 where id = ?', EQUILIBRADO);
  assert.equal(x.r.status, 409);
  assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo);
  assert.equal(x.feitos.length, 0);
  assert.equal(x.rota.decisao_solicitado, 'bloqueado');
  assert.deepEqual(x.r.erro.rota.solicitacao, { modelo_solicitado: RAPIDO, modelo_selecionado: null, decisao: 'bloqueado', motivo: 'requested_model_not_eligible' });
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'governance.admin_alert' and detalhes like '%sem_modelo_sigilo%'"));
  // Conteúdo grande demais para todos: bloqueio, mas sem acionar o admin (não é problema de governança).
  const antes = um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n;
  const janelas = todos(S.app.db, 'select id, contexto from modelos');
  exec(S.app.db, 'update modelos set contexto = 1000');
  const y = await pedir(await conversa(), RAPIDO, `Resuma: ${'Relatório de atividades do mês. '.repeat(400)}`);
  for (const j of janelas) exec(S.app.db, 'update modelos set contexto = ? where id = ?', j.contexto, j.id);
  assert.equal(y.r.status, 413);
  assert.equal(y.r.erro.rota.solicitacao.decisao, 'bloqueado');
  assert.equal(um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n, antes);
});

test('uma só rota de execução: toda chamada à IA passa pelo roteador e pela governança', () => {
  const raiz = new URL('../src/', import.meta.url).pathname;
  const arquivos = [];
  const andar = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) andar(p); else if (p.endsWith('.js')) arquivos.push(p); } };
  andar(raiz);
  const chamadas = arquivos.flatMap(p => (readFileSync(p, 'utf8').match(/\bia\.enviar\(/g) || []).map(() => p.slice(raiz.length)));
  assert.deepEqual(chamadas, ['conversas.js'], 'só o envio de mensagens executa modelo');
  const conv = readFileSync(join(raiz, 'conversas.js'), 'utf8');
  assert.match(conv, /app\.ia\.enviar\(mensagens, \{ modelo: m\.id, reserva: sigilosa \? null : rota\.reserva/, 'executa o que o roteador decidiu (modelo e reserva)');
  assert.ok(conv.indexOf('let m = rota.modelo;') < conv.indexOf('app.ia.enviar('), 'a execução vem depois da decisão');
  // O endpoint de chat do provedor só existe no cliente de IA.
  const completions = arquivos.filter(p => readFileSync(p, 'utf8').includes('chat/completions')).map(p => p.slice(raiz.length));
  assert.deepEqual(completions, ['ia.js']);
});

test('modo recomendado e manual: as mesmas regras obrigatórias; o manual muda só o grau de controle', async () => {
  assert.equal((await ana.put('/api/admin/governanca', { modo: 'manual' })).status, 403, 'quem usa não altera a governança');
  for (const modo of ['recomendado', 'manual']) {
    const g = await admin.put('/api/admin/governanca', { modo });
    assert.equal(g.status, 200);
    assert.equal(g.dados.modo, modo);
    assert.match(g.dados.valeSempre, /Nenhum ajuste manual desliga essas regras/);
    for (const [modelo, sig] of [[RAPIDO, true], [VETADO, true], [AVANCADO, false], [GRATUITO, false]]) {
      const x = await pedir(sig ? await sigilosa() : await conversa(), modelo);
      assert.ok(!x.feitos.includes(modelo), `${modo}: ${modelo}`);
      confereInvariante(x, modelo, sig);
    }
  }
  // Ajuste manual pelo admin passa a empresa para o modo manual, com registro.
  await admin.put('/api/admin/governanca', { modo: 'recomendado' });
  await admin.put('/api/admin/modelos-config', { roteamento: { ativo: true, preferencia: 'qualidade' } });
  assert.equal((await admin.get('/api/admin/governanca')).dados.modo, 'manual');
  assert.ok(um(S.app.db, "select 1 from eventos where tipo = 'governance.mode_changed' and detalhes like '%manual%'"));
  // Voltar às recomendações: ajustes de modelos voltam ao recomendado; homologações e vetos continuam.
  await admin.put('/api/admin/governanca', { modo: 'recomendado' });
  const cfg = lerConfig(S.app.db);
  assert.equal(cfg.roteamento.preferencia, 'equilibrio');
  assert.equal(cfg.automatico, false);
  assert.equal(um(S.app.db, 'select liberado from modelos where id = ?', GRATUITO).liberado, 0, 'fora das sugestões e sem homologação: sai');
  assert.equal(um(S.app.db, 'select homologado from modelos where id = ?', EQUILIBRADO).homologado, 1);
  assert.equal(um(S.app.db, 'select vetado_plataforma from modelos where id = ?', VETADO).vetado_plataforma, 1);
});

// Plataforma com IA de teste que registra o modelo executado.
const iaRegistrada = () => {
  const chamadas = [];
  return { chamadas, ia: { configurada: true, async listarModelos() { return []; },
    async *enviar(msgs, op) { chamadas.push(op.modelo); yield { tipo: 'texto', texto: 'ok' }; yield { tipo: 'fim', modelo: op.modelo, custo: 0 }; } } };
};

test('hierarquia: modelo homologado pela empresa MAS proibido pela plataforma não é elegível; a empresa não reverte', async () => {
  const R = iaRegistrada();
  const PL = await subirPlataforma({ ia: R.ia });
  try {
    const ops = await PL.navegador().entrarConsole('ops@theneil.com.br');
    const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
    assert.equal((await ops.post('/api/plataforma/empresas', { name: 'Delta SA', slug: 'delta', plan_id: planos[0].id, admin_email: 'dora@delta.com', status: 'ativa' })).status, 200);
    const dora = PL.navegador();
    await dora.get('/delta');
    assert.equal((await dora.entrarEmpresa('dora@delta.com')).status, 200);
    // A empresa homologa por conta própria.
    assert.equal((await dora.post(`/api/admin/modelos/${enc(EQUILIBRADO)}/homologar`, { fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato.' })).status, 200);
    const conv = (await dora.post('/api/conversas', {})).dados.conversa;
    await dora.req('PATCH', `/api/conversas/${conv.id}`, { sigilosa: true });
    assert.equal((await enviarMensagem(dora, conv.id, { texto: 'Pergunta confidencial', modelo: EQUILIBRADO })).status, 200);
    assert.equal(R.chamadas.at(-1), EQUILIBRADO);
    // A plataforma proíbe o modelo para dado sigiloso: deixa de ser elegível, mesmo homologado pela empresa.
    assert.equal((await ops.post('/api/plataforma/vetos-sigilo', { id: EQUILIBRADO, motivo: 'Fornecedor mudou a política de retenção.' })).status, 200);
    const n = R.chamadas.length;
    const r = await enviarMensagem(dora, conv.id, { texto: 'Outra pergunta confidencial', modelo: EQUILIBRADO });
    assert.equal(r.status, 409, 'sem outro autorizado: bloqueio seguro');
    assert.equal(R.chamadas.length, n, 'nada enviado ao modelo proibido');
    const m = (await dora.get('/api/admin/modelos')).dados.modelos.find(x => x.id === EQUILIBRADO);
    assert.ok(!m.homologado && m.vetadoPlataforma);
    assert.equal((await dora.post(`/api/admin/modelos/${enc(EQUILIBRADO)}/homologar`, { fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Tentando de novo.' })).status, 409);
    // A plataforma não autoriza o que ela mesma proíbe; quem usa não altera nada disso.
    assert.equal((await ops.post('/api/plataforma/homologacoes', { id: EQUILIBRADO, perfil: 'equilibrado', fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Autorização de teste.' })).status, 409);
    assert.equal((await dora.post('/api/plataforma/vetos-sigilo', { id: 'x/y', motivo: 'tentativa da empresa' })).status, 401);
    // Veto de um modelo que a empresa ainda não tem: vale quando ela o acrescentar.
    assert.equal((await ops.post('/api/plataforma/vetos-sigilo', { id: 'novo/modelo-z', motivo: 'Sem garantia de retenção zero.' })).status, 200);
    assert.equal((await dora.put(`/api/admin/modelos/${enc('novo/modelo-z')}`, { liberado: true, perfil: 'rapido' })).status, 200);
    assert.equal((await dora.post(`/api/admin/modelos/${enc('novo/modelo-z')}/homologar`, { fornecedor: 'Z', semTreino: true, retencaoZero: true, justificativa: 'Tentativa de homologar.' })).status, 409);
    // Retirado o veto, volta a valer a homologação da empresa.
    assert.equal((await ops.del(`/api/plataforma/vetos-sigilo/${enc(EQUILIBRADO)}`)).status, 200);
    assert.equal((await enviarMensagem(dora, conv.id, { texto: 'Mais uma', modelo: EQUILIBRADO })).status, 200);
  } finally { await PL.fechar(); }
});

test('admin leigo: nova empresa, recomendações, tarefas, sigilo, bloqueio, alerta legível, manual e volta', async () => {
  const R = iaRegistrada();
  const PL = await subirPlataforma({ ia: R.ia });
  const JARGAO = /token|janela|contexto|provider|llm|routing|roteamento|capabilit|openrouter|fallback/i;
  try {
    const ops = await PL.navegador().entrarConsole('ops@theneil.com.br');
    const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
    // 1. Nova empresa.
    assert.equal((await ops.post('/api/plataforma/empresas', { name: 'Épsilon Ltda', slug: 'epsilon', plan_id: planos[0].id, admin_email: 'eva@epsilon.com', status: 'ativa' })).status, 200);
    const eva = PL.navegador();
    await eva.get('/epsilon');
    assert.equal((await eva.entrarEmpresa('eva@epsilon.com')).status, 200);
    // 2. Seguir recomendações (já é o padrão de uma empresa nova).
    assert.equal((await eva.get('/api/admin/governanca')).dados.modo, 'recomendado');
    assert.equal((await eva.put('/api/admin/governanca', { modo: 'recomendado' })).status, 200);
    // 3. Tarefas normais, sem nenhuma configuração técnica.
    for (const texto of ['Escreva um email de boas-vindas.', 'Analise este contrato e identifique riscos jurídicos e obrigações.']) {
      const c = (await eva.post('/api/conversas', {})).dados.conversa;
      assert.equal((await enviarMensagem(eva, c.id, { texto })).status, 200, texto);
    }
    // 4. Tarefa confidencial: a autorização da plataforma basta.
    assert.equal((await ops.post('/api/plataforma/homologacoes', { id: EQUILIBRADO, nome: 'Equilibrado seguro', perfil: 'equilibrado', fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato.' })).status, 200);
    const sig = (await eva.post('/api/conversas', {})).dados.conversa;
    await eva.req('PATCH', `/api/conversas/${sig.id}`, { sigilosa: true });
    assert.equal((await enviarMensagem(eva, sig.id, { texto: 'Pergunta confidencial' })).status, 200);
    assert.equal(R.chamadas.at(-1), EQUILIBRADO);
    // 5. Sem modelo elegível (a plataforma retira a autorização): bloqueio seguro.
    assert.equal((await ops.del(`/api/plataforma/homologacoes/${enc(EQUILIBRADO)}`)).status, 200);
    const n = R.chamadas.length;
    assert.equal((await enviarMensagem(eva, sig.id, { texto: 'Outra pergunta confidencial' })).status, 409);
    assert.equal(R.chamadas.length, n);
    // 6. Alerta recebido por email, e 7. legível no painel: o que aconteceu e o que resolve, sem jargão.
    const email = PL.P.email.enviados.filter(m => m.para === 'eva@epsilon.com').find(m => /sigilosa bloqueado/.test(m.assunto));
    assert.ok(email, 'o admin recebeu o alerta');
    const texto = email.texto ?? email.corpo ?? JSON.stringify(email);
    assert.doesNotMatch(texto, JARGAO);
    const atencao = (await eva.get('/api/admin/visao-geral')).dados.atencao.find(a => a.tipo === 'governanca');
    assert.ok(atencao, 'o alerta aparece no painel');
    assert.doesNotMatch(`${atencao.texto} ${atencao.acao}`, JARGAO);
    assert.match(atencao.acao, /Seguir recomendações da GreenIA/);
    // 8. Configuração manual: continua seguro (as regras obrigatórias não saem).
    assert.equal((await eva.put('/api/admin/governanca', { modo: 'manual' })).status, 200);
    assert.equal((await eva.put('/api/admin/modelos-config', { exigirSemTreino: false, automatico: true })).status, 200);
    const m = R.chamadas.length;
    assert.equal((await enviarMensagem(eva, sig.id, { texto: 'Confidencial de novo', modelo: 'openrouter/auto' })).status, 409);
    assert.equal(R.chamadas.length, m, 'modo manual não abre exceção ao sigilo');
    // 9. De volta às recomendações.
    assert.equal((await eva.put('/api/admin/governanca', { modo: 'recomendado' })).status, 200);
    const cfg = (await eva.get('/api/admin/modelos')).dados.config;
    assert.equal(cfg.exigirSemTreino, true);
    assert.equal(cfg.automatico, false);
    assert.equal((await eva.get('/api/admin/governanca')).dados.modo, 'recomendado');
  } finally { await PL.fechar(); }
});

// Pessoa completamente leiga: só a intenção. O teste falha se qualquer tarefa exigir saber de modelo,
// capacidade, sigilo, janela ou provedor.
async function semConhecimentoTecnico(conv, r) {
  const textos = [r.erro?.mensagem, r.falha?.mensagem, r.fim?.rota?.explicacao];
  for (const m of (await ana.get(`/api/conversas/${conv.id}`)).dados.mensagens) if (m.papel === 'aviso' || m.papel === 'assistant') textos.push(m.papel === 'aviso' ? m.texto : m.rota_explicacao);
  for (const t of textos.filter(Boolean)) assert.doesNotMatch(t, TECNICO, `texto técnico para quem usa: ${t}`);
  assert.ok(!r.erro || !('sugestao' in r.erro));
  assert.equal(r.fim?.fornecedor ?? null, null, 'o fornecedor técnico não vai para quem usa');
}

test('ignorância deliberada: as tarefas se resolvem só com a intenção', async () => {
  const CONTRATO = docx(['Contrato de prestação de serviços. Cláusula 1: multa de 20% por atraso. Cláusula 2: renovação automática por 5 anos.']);
  const tarefas = [
    ['Analise este contrato e me diga os principais riscos.', [arquivo('contrato.docx', CONTRATO)]],
    ['Resuma este documento.', [arquivo('relatorio.docx', docx(['Relatório do trimestre: vendas subiram 12% e custos caíram 3%.']))]],
    ['Corrija este código: function media(l) { return l.reduce((a, b) => a + b) / l.lenght }', []],
    ['Compare estes dois contratos.', [arquivo('a.docx', CONTRATO), arquivo('b.docx', docx(['Contrato B. Multa de 2% por atraso. Sem renovação automática.']))]],
    ['Analise estes dados.', [arquivo('dados.csv', 'mes,vendas\njan,100\nfev,120\nmar,90\n')]],
    ['Faça uma pesquisa sobre este assunto: trabalho híbrido em equipes de atendimento.', []],
    // O mesmo, com informação confidencial que a pessoa não sabe que é confidencial.
    ['Analise este contrato do fornecedor CNPJ 11.222.333/0001-81 e me diga os principais riscos.', []],
  ];
  for (const [texto, anexos] of tarefas) {
    const conv = await conversa();
    const r = await enviarMensagem(ana, conv.id, { texto, anexos });
    assert.equal(r.status, 200, `${texto}: ${JSON.stringify(r.erro)}`);
    assert.ok(r.texto.length > 0);
    await semConhecimentoTecnico(conv, r);
  }
});

test('matriz da pessoa leiga: nenhum cenário pede decisão técnica, homologação, política, permissão ou reserva', async () => {
  const q = (await admin.post('/api/quick-wins', { nome: 'Revisar texto', toda_empresa: true, modelo: 'classe:rapido', pode_trocar: true })).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { status: 'ativo' });
  const cenarios = [
    ['tarefa simples', {}, 'Traduza bom dia para o inglês.'],
    ['tarefa complexa', {}, 'Analise este contrato e identifique riscos jurídicos, obrigações e pontos de exposição.'],
    ['programação', {}, 'Corrija este código: const x = [1,2,3].mapp(n => n * 2)'],
    ['documento grande', {}, `Resuma: ${'Ata da reunião com decisões e pendências. '.repeat(300)}`],
    ['informação sigilosa', { sigilosa: true }, 'Estratégia de preço do próximo trimestre.'],
    ['modelo indisponível', { falhar: RAPIDO }, 'Olá'],
    ['provedor sem créditos', { falhaIA: 402 }, 'Olá'],
    ['chave recusada', { falhaIA: 401 }, 'Olá'],
    ['nova tentativa', { antes: 'Liste os itens do pedido.' }, 'Não resolveu, a lista está errada.'],
    ['quick win', { qw: q.id }, 'Revise este parágrafo.'],
    ['modelo solicitado via API', { modelo: RAPIDO }, 'Olá'],
    ['modelo não permitido', { modelo: AVANCADO }, 'Olá'],
    ['modelo não homologado', { sigilosa: true, modelo: RAPIDO }, 'Olá'],
    ['contexto incompatível', { modelo: RAPIDO, janela: 2000 }, `Resuma: ${'Relatório de atividades do mês. '.repeat(400)}`],
  ];
  for (const [nome, op, texto] of cenarios) {
    const conv = op.sigilosa ? await sigilosa() : await conversa(op.qw ? { quick_win_id: op.qw } : {});
    if (op.antes) await enviarMensagem(ana, conv.id, { texto: op.antes });
    if (op.falhar) OR.falhar.add(op.falhar);
    if (op.janela) exec(S.app.db, 'update modelos set contexto = ? where id = ?', op.janela, RAPIDO);
    falhaIA = op.falhaIA || null;
    const r = await enviarMensagem(ana, conv.id, { texto, ...(op.modelo ? { modelo: op.modelo } : {}) });
    falhaIA = null; OR.falhar.clear();
    if (op.janela) exec(S.app.db, 'update modelos set contexto = 1048576 where id = ?', RAPIDO);
    assert.ok([200, 409, 413].includes(r.status), `${nome}: ${r.status}`);
    if (op.falhaIA) assert.equal(r.falha.mensagem, MSG_USUARIO.ia_fora, nome);
    await semConhecimentoTecnico(conv, r);
  }
});
