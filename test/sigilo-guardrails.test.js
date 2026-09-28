// Informações sigilosas com guardrails de proteção. Invariante:
//   sigilosa E política ligada E guardrails satisfeitos E recurso autorizado E rota elegível → ENVIA;
//   qualquer outra combinação → NÃO ENVIA (e a chamada externa não acontece).
// Custo, continuidade, reserva do plano, falha do fornecedor, nova tentativa, API e anexos nunca superam a
// autorização. OpenRouter, fornecedor e identificadores técnicos nunca aparecem para quem usa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, docx } from './arquivos.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, todos, um } from '../src/db.js';
import { detectar, decidir, CATEGORIAS } from '../src/filtro.js';
import { avaliarRecurso, avaliarProcessamentoSigiloso, politicaSigiloLigada, POLITICA_SIGILO } from '../src/sigilo.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
const enc = encodeURIComponent;
const ROTA = f => ({ fornecedor: f, endpoint: f, retencaoZero: true, semTreino: true });
let S, OR, admin, ana;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: true } } });
});
after(async () => { await S.fechar(); await OR.fechar(); });

// Estado do catálogo para cada cenário: homologações (rota) por modelo; o resto sem homologação.
function catalogo(rotas) {
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, vetado_plataforma = 0, autorizacao_plataforma = null');
  for (const [id, r] of Object.entries(rotas)) exec(S.app.db, 'update modelos set liberado = 1, homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id);
}
const politica = ativo => salvarConfig(S.app.db, { [POLITICA_SIGILO]: ativo });
const sigilosa = async () => { const c = (await ana.post('/api/conversas', {})).dados.conversa; await ana.patch(`/api/conversas/${c.id}`, { sigilosa: true }); return c; };
const conversa = async () => (await ana.post('/api/conversas', {})).dados.conversa;
const ultimaRota = () => { const r = um(S.app.db, 'select * from roteamento order by id desc limit 1'); r.guardrails = JSON.parse(r.guardrails || 'null'); return r; };
// O que chegou ao fornecedor desde n: modelos e rotas fixadas.
const chegou = n => OR.chamadas.slice(n).map(c => ({ modelos: [c.model, ...(c.models || [])], rota: c.provider?.only?.[0] || null }));
async function enviar(conv, texto, extra = {}) {
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...extra });
  return { r, n, chamadas: chegou(n), rota: ultimaRota() };
}

// ---------------------------------------------------------------- Camada central (função pura)
test('camada central: fail closed; desconhecido nunca vale como permitido', () => {
  const cfg = { governanca: { modo: 'manual' }, requisitosSigilo: { plataforma: false } };
  const m = over => ({ id: 'x/y', liberado: true, homologacaoEmpresa: ROTA('X'), ...over });
  assert.equal(avaliarRecurso(m(), cfg).elegivel, true);
  const motivo = over => avaliarRecurso(m(over), cfg).motivos;
  assert.deepEqual(motivo({ homologacaoEmpresa: { ...ROTA('X'), retencaoZero: false } }), ['retencao_nao_comprovada']);
  assert.deepEqual(motivo({ homologacaoEmpresa: { ...ROTA('X'), retencaoZero: 'sim' } }), ['retencao_nao_comprovada'], 'só true comprova');
  assert.deepEqual(motivo({ homologacaoEmpresa: { fornecedor: 'X', endpoint: 'X', semTreino: true } }), ['retencao_nao_comprovada'], 'ausente = não comprovado');
  assert.deepEqual(motivo({ homologacaoEmpresa: { ...ROTA('X'), semTreino: undefined } }), ['treino_nao_comprovado']);
  assert.deepEqual(motivo({ homologacaoEmpresa: { ...ROTA('X'), fornecedor: '' } }), ['fornecedor_desconhecido']);
  assert.deepEqual(motivo({ homologacaoEmpresa: { ...ROTA('X'), endpoint: null } }), ['endpoint_desconhecido']);
  assert.deepEqual(motivo({ homologacaoEmpresa: 'lixo' }), ['sem_homologacao_empresa'], 'registro inválido = sem homologação');
  assert.ok(motivo({ id: 'meta-llama/x:free' }).includes('sem_rota_fixa'));
  assert.ok(motivo({ id: 'openrouter/auto' }).includes('sem_rota_fixa'));
  assert.ok(motivo({ vetadoPlataforma: true }).includes('proibido_pela_plataforma'));
  assert.ok(motivo({ liberado: false }).includes('nao_liberado'));
  // Com a camada da plataforma: a autorização dela é o mínimo, e a rota precisa ser a mesma.
  const pl = modo => ({ governanca: { modo }, requisitosSigilo: { plataforma: true, exigeAutorizacao: true } });
  assert.deepEqual(avaliarRecurso(m(), pl('manual')).motivos, ['sem_autorizacao_plataforma'], 'empresa sim, plataforma não → inelegível');
  assert.deepEqual(avaliarRecurso(m({ homologacaoEmpresa: null, autorizacaoPlataforma: ROTA('X') }), pl('manual')).motivos, ['sem_homologacao_empresa'], 'plataforma sim, empresa não (manual) → inelegível');
  assert.equal(avaliarRecurso(m({ homologacaoEmpresa: null, autorizacaoPlataforma: ROTA('X') }), pl('recomendado')).elegivel, true, 'seguir as recomendações adota a autorização');
  assert.equal(avaliarRecurso(m({ autorizacaoPlataforma: ROTA('X') }), pl('manual')).elegivel, true, 'plataforma sim + empresa sim → elegível');
  assert.deepEqual(avaliarRecurso(m({ autorizacaoPlataforma: ROTA('Y') }), pl('manual')).motivos, ['rota_diferente_da_autorizada'], 'mesmo modelo, outra rota: outro recurso');
  assert.deepEqual(avaliarRecurso(m({ autorizacaoPlataforma: { ...ROTA('X'), retencaoZero: false } }), pl('manual')).motivos, ['retencao_nao_comprovada'], 'a empresa não afrouxa a plataforma');
  // Política da empresa: só true liga.
  for (const v of [undefined, null, false, 'true', 1, 'on']) assert.equal(politicaSigiloLigada({ [POLITICA_SIGILO]: v }), false, String(v));
  assert.equal(politicaSigiloLigada({ [POLITICA_SIGILO]: true }), true);
  assert.equal(politicaSigiloLigada(lerConfig(S.app.db)), false, 'padrão: desligada');
  assert.equal(avaliarProcessamentoSigiloso({ cfg: {}, sigilosa: true }).motivo, 'politica_sigilo_desligada');
  assert.equal(avaliarProcessamentoSigiloso({ cfg: {}, sigilosa: false }).permitido, true);
});

test('classificação: CPF, CNPJ, cartão, banco, PIX, senha e API key detectados; categorias distintas', () => {
  const casos = [['cpf', 'O CPF é 529.982.247-25'], ['cnpj', 'CNPJ 11.222.333/0001-81'], ['cartao', 'cartão 4111 1111 1111 1111'],
    ['banco', 'agência 1234 conta 56789-0'], ['pix', 'chave pix 123e4567-e89b-12d3-a456-426614174000'], ['credencial', 'senha: Primavera2026'],
    ['credencial', 'api_key=sk-abcdefghijklmnopqrstuv'], ['credencial', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123'],
    ['credencial', '-----BEGIN RSA PRIVATE KEY-----\nMIIE...'], ['credencial', 'client_secret: 9f8e7d6c'], ['credencial', 'token=ghp_abcdefghijklmnopqrstuvwxyz'],
    ['credencial', 'conecte em postgres://app:SenhaForte9@db.interno:5432/prod']];
  for (const [tipo, texto] of casos) assert.ok(detectar(texto).includes(tipo), `${tipo}: ${texto}`);
  assert.ok(detectar('Resumo do relatório. A senha: Primavera2026 está no cofre.').includes('credencial'), 'credencial no meio de texto normal');
  assert.deepEqual(detectar('Reunião dia 12/03/2026, pedido 123456, valor R$ 1.234,56'), [], 'datas, pedidos e valores não disparam');
  // Categorias: identificação, financeiro, pessoal e segredo não se confundem.
  assert.equal(CATEGORIAS.cpf, 'identificacao'); assert.equal(CATEGORIAS.cartao, 'financeiro'); assert.equal(CATEGORIAS.email, 'pessoal'); assert.equal(CATEGORIAS.credencial, 'segredo');
  // Credencial é sempre bloqueada, mesmo com a empresa marcando "permitir"; ação desconhecida vale bloquear.
  assert.deepEqual(decidir(['credencial', 'cpf'], { credencial: 'permitir', cpf: 'permitir' }).bloqueados, ['credencial']);
  assert.deepEqual(decidir(['cpf'], { cpf: 'talvez' }).bloqueados, ['cpf']);
  // Padrão proporcional ao risco: nada é bloqueado por decreto (bloquear é escolha da empresa); dado pessoal comum
  // segue normalmente; pagamento, dado sensível e marcação de confidencial seguem só com proteção.
  const padrao = lerConfig(S.app.db).acoesChat;
  assert.equal(padrao.credencial, 'bloquear');
  for (const t of ['cpf', 'rg', 'cnpj', 'email', 'telefone', 'cep', 'endereco']) assert.equal(padrao[t], 'permitir', t);
  for (const t of ['cartao', 'banco', 'pix', 'sensivel', 'confidencial']) assert.equal(padrao[t], 'proteger', t);
  assert.ok(!Object.entries(padrao).some(([t, v]) => t !== 'credencial' && v === 'bloquear'));
});

// ---------------------------------------------------------------- Política OFF
test('política OFF: informação sigilosa nunca é enviada; nada gravado; sem marcar a conversa; mensagem simples', async () => {
  politica(false);
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  // Pelo interruptor manual, por dado detectado (CPF) e por anexo.
  for (const [nome, prep, texto, extra] of [
    ['manual', sigilosa, 'Estratégia de preço do trimestre.', {}],
    ['dado detectado', conversa, 'Pague o fornecedor: agência 1234, conta corrente 56789-0.', {}],
    ['anexo', conversa, 'Resuma o anexo.', { anexos: [arquivo('cadastro.docx', docx(['Responsável: agência 1234, conta corrente 56789-0']))] }],
  ]) {
    const conv = await prep();
    const x = await enviar(conv, texto, extra);
    assert.equal(x.r.status, 409, nome);
    assert.equal(x.r.erro.erro, 'sigilo_nao_permitido');
    assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo_desligado);
    assert.equal(x.chamadas.length, 0, `${nome}: a chamada externa não aconteceu`);
    assert.equal(um(S.app.db, "select count(*) as n from mensagens where conversa_id = ? and papel = 'user'", conv.id).n, 0);
    assert.equal(um(S.app.db, 'select count(*) as n from anexos where conversa_id = ?', conv.id).n, 0);
    assert.equal(x.rota.politica_sigilo, 'off');
    assert.equal(x.rota.motivo_bloqueio, 'politica_sigilo_desligada');
    if (nome !== 'manual') assert.equal((await ana.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa, false, 'conteúdo não enviado não deixa marca');
  }
  // Conteúdo comum continua normal com a política desligada.
  const comum = await enviar(await conversa(), 'Escreva um convite para a reunião de sexta.');
  assert.equal(comum.r.status, 200);
  // Credencial: bloqueada independentemente da política (OFF e ON).
  for (const ligada of [false, true]) {
    politica(ligada);
    const x = await enviar(await conversa(), 'Configure com a senha: Primavera2026');
    assert.equal(x.r.status, 422);
    assert.equal(x.chamadas.length, 0);
  }
  // Desligada não avisa o admin: foi escolha da empresa, não falta de configuração.
  assert.equal(todos(S.app.db, "select detalhes from eventos where tipo = 'governance.admin_alert'").length, 0);
});

// ---------------------------------------------------------------- Política ON
test('política ON + rota válida: envia pela rota fixada, com retenção zero exigida; o registro reconstrói a decisão', async () => {
  politica(true);
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const conv = await conversa();
  const x = await enviar(conv, 'Resuma a proposta do cliente CNPJ 12.345.678/0001-95 e confira os dados de pagamento: agência 1234, conta corrente 56789-0.');
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.deepEqual(x.chamadas, [{ modelos: [EQUILIBRADO], rota: 'Anthropic' }]);
  assert.deepEqual(OR.chamadas.at(-1).provider, { order: ['Anthropic'], only: ['Anthropic'], allow_fallbacks: false, zdr: true, data_collection: 'deny' });
  assert.match(x.r.fim.rota.explicacao, /Proteção aplicada: a GreenIA identificou informações sigilosas e aplicou automaticamente os controles de proteção da empresa/);
  // Auditoria: foi sigiloso? política? guardrails? elegíveis? descartados e por quê? selecionado? enviado?
  const r = x.rota;
  assert.equal(r.sigilosa, 1);
  assert.equal(r.politica_sigilo, 'on');
  assert.equal(r.resultado, 'respondido');
  assert.deepEqual(r.guardrails.elegiveis, [EQUILIBRADO]);
  assert.equal(r.guardrails.selecionado, EQUILIBRADO);
  assert.ok(r.guardrails.requisitos.exigeRetencaoZero && r.guardrails.requisitos.exigeSemTreino && r.guardrails.requisitos.politicaEmpresa);
  assert.ok(r.guardrails.descartados.some(d => d.id === RAPIDO && d.motivos.includes('sem_homologacao_empresa')), 'rejeitado por não ser autorizado, com motivo');
  assert.ok(!JSON.stringify(r).includes('56789-0') && !JSON.stringify(r).includes('proposta do cliente'), 'a auditoria não guarda o conteúdo');
});

test('política ON + guardrail inválido, autorização ausente ou desconhecida: nunca envia; admin avisado uma vez', async () => {
  politica(true);
  const casos = [
    ['retenção não comprovada', { [EQUILIBRADO]: { ...ROTA('Anthropic'), retencaoZero: false } }, 'retencao_nao_comprovada'],
    ['treino não comprovado', { [EQUILIBRADO]: { ...ROTA('Anthropic'), semTreino: null } }, 'treino_nao_comprovado'],
    ['fornecedor desconhecido', { [EQUILIBRADO]: { ...ROTA(''), endpoint: 'Anthropic' } }, 'fornecedor_desconhecido'],
    ['endpoint desconhecido', { [EQUILIBRADO]: { fornecedor: 'Anthropic', retencaoZero: true, semTreino: true } }, 'endpoint_desconhecido'],
    ['autorização ausente', {}, 'sem_homologacao_empresa'],
    ['autorização ilegível', { [EQUILIBRADO]: 'nao-e-json' }, null],
  ];
  const alertasAntes = um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n;
  for (const [nome, rotas, motivo] of casos) {
    if (rotas[EQUILIBRADO] === 'nao-e-json') { catalogo({}); exec(S.app.db, "update modelos set homologado = 1, homologacao = 'nao-e-json' where id = ?", EQUILIBRADO); }
    else catalogo(rotas);
    const x = await enviar(await sigilosa(), 'Pergunta confidencial.');
    assert.equal(x.r.status, 409, nome);
    assert.equal(x.r.erro.mensagem, MSG_USUARIO.sigilo);
    assert.equal(x.chamadas.length, 0, `${nome}: nada chegou ao fornecedor`);
    assert.equal(x.rota.resultado, 'bloqueado');
    assert.equal(x.rota.motivo_bloqueio, 'sem_recurso_elegivel');
    if (motivo) assert.ok(x.rota.guardrails.descartados.some(d => d.id === EQUILIBRADO && d.motivos.includes(motivo)), `${nome}: ${JSON.stringify(x.rota.guardrails.descartados)}`);
  }
  assert.equal(um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n, alertasAntes + 1, 'o admin é avisado (uma vez por dia)');
  const email = S.app.email.enviados.filter(m => m.para === 'admin@exemplo.com.br').at(-1);
  assert.match(email.assunto, /Conversas confidenciais estão sendo bloqueadas/);
});

test('economia nunca supera autorização: o barato não autorizado nunca é usado, mesmo para pedido simples', async () => {
  politica(true);
  catalogo({ [AVANCADO]: ROTA('Anthropic') });   // só o caro é autorizado
  for (const pedido of [undefined, RAPIDO, 'classe:rapido']) {
    const x = await enviar(await sigilosa(), "Traduza 'bom dia' para o inglês.", pedido ? { modelo: pedido } : {});
    assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
    assert.deepEqual(x.chamadas, [{ modelos: [AVANCADO], rota: 'Anthropic' }], `pedido ${pedido}`);
  }
});

test('fallback: principal indisponível → outro recurso SÓ se autorizado e elegível; senão, nada mais é enviado', async () => {
  politica(true);
  // Reserva configurada para um não autorizado: nunca é usada em conversa sigilosa.
  await admin.put(`/api/admin/modelos/${enc(EQUILIBRADO)}`, { reserva: 'anthropic/claude-sonnet-5' });
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  OR.falhar.add(EQUILIBRADO);
  let x = await enviar(await sigilosa(), 'Pergunta confidencial.');
  assert.equal(x.r.falha.mensagem, MSG_USUARIO.falhou);
  assert.ok(x.chamadas.every(c => c.modelos.every(id => id === EQUILIBRADO)), `só o autorizado recebeu: ${JSON.stringify(x.chamadas)}`);
  // Um segundo recurso autorizado e elegível existe: a GreenIA o usa, com a rota dele.
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic'), [AVANCADO]: ROTA('AnthropicB') });
  x = await enviar(await sigilosa(), 'Pergunta confidencial.');
  OR.falhar.clear();
  assert.equal(x.r.status, 200);
  assert.ok(x.r.texto.length > 0);
  assert.deepEqual(x.chamadas, [{ modelos: [EQUILIBRADO], rota: 'Anthropic' }, { modelos: [AVANCADO], rota: 'AnthropicB' }]);
  const r = um(S.app.db, 'select * from roteamento where id = ?', x.rota.id);
  assert.equal(r.resultado, 'respondido_pela_reserva');
  assert.equal(r.reserva, `guardrails:${AVANCADO}`, 'o fallback fica registrado');
  await admin.put(`/api/admin/modelos/${enc(EQUILIBRADO)}`, { reserva: null });
});

test('reserva do plano: créditos no fim continuam só com recurso autorizado; sem ele, nada é enviado', async () => {
  const OR2 = await openRouterFalso({ custo: 0.04 });
  const S2 = await subir({ ia: OR2.ia, plano: { creditos: 1, reserva: 100, precoUsd: 100 } });
  try {
    salvarConfig(S2.app.db, { [POLITICA_SIGILO]: true });
    const adm = await S2.cliente().entrar('admin@exemplo.com.br');
    const c0 = (await adm.post('/api/conversas', {})).dados.conversa;
    assert.equal((await enviarMensagem(adm, c0.id, { texto: 'Olá' })).status, 200);   // entra na reserva
    const set = rotas => { exec(S2.app.db, 'update modelos set homologado = 0, homologacao = null'); for (const [id, r] of Object.entries(rotas)) exec(S2.app.db, 'update modelos set homologado = 1, homologacao = ? where id = ?', JSON.stringify(r), id); };
    const sig = async () => { const c = (await adm.post('/api/conversas', {})).dados.conversa; await adm.patch(`/api/conversas/${c.id}`, { sigilosa: true }); return c; };
    // Só o Equilibrado é autorizado; a reserva só usa Rápido; o Rápido disponível NÃO é autorizado → não envia.
    set({ [EQUILIBRADO]: ROTA('Anthropic') });
    let n = OR2.chamadas.length;
    let r = await enviarMensagem(adm, (await sig()).id, { texto: 'Pergunta confidencial' });
    assert.equal(r.status, 409);
    assert.equal(OR2.chamadas.length, n, 'reserva disponível + recurso não autorizado = nada enviado');
    // Rápido autorizado: a reserva continua atendendo, dentro dos guardrails.
    set({ [RAPIDO]: ROTA('Google') });
    n = OR2.chamadas.length;
    r = await enviarMensagem(adm, (await sig()).id, { texto: 'Pergunta confidencial' });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    assert.deepEqual(OR2.chamadas.slice(n).map(c => [c.model, c.provider.only?.[0]]), [[RAPIDO, 'Google']]);
  } finally { await S2.fechar(); await OR2.fechar(); }
});

test('API, nova tentativa, anexo e streaming: a mesma governança em todo envio', async () => {
  politica(true);
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  // API pedindo o não autorizado (e o Automático do provedor): nunca executa.
  await admin.put('/api/admin/modelos-config', { automatico: true });
  for (const modelo of [RAPIDO, AVANCADO, 'openrouter/auto', 'classe:externo', 'nao/existe']) {
    const x = await enviar(await sigilosa(), 'Pergunta confidencial.', { modelo });
    assert.equal(x.r.status, 200, `${modelo}: ${JSON.stringify(x.r.erro)}`);
    assert.deepEqual(x.chamadas, [{ modelos: [EQUILIBRADO], rota: 'Anthropic' }], modelo);
  }
  await admin.put('/api/admin/modelos-config', { automatico: false });
  // Nova tentativa ("não resolveu"): passa de novo pelos guardrails; uma tentativa anterior não autoriza nada.
  const conv = await sigilosa();
  await enviar(conv, 'Liste os itens do pedido confidencial.');
  catalogo({});   // a autorização acabou entre uma mensagem e a outra
  const retry = await enviar(conv, 'Não resolveu, a lista está errada.');
  assert.equal(retry.r.status, 409);
  assert.equal(retry.chamadas.length, 0);
  // Anexo com informação sigilosa numa conversa comum: a combinação mensagem + anexo decide.
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const comAnexo = await enviar(await conversa(), 'Resuma o anexo.', { anexos: [arquivo('cadastro.docx', docx(['Titular: CPF 529.982.247-25, conta 12345-6 agência 0001']))] });
  assert.equal(comAnexo.r.status, 200);
  assert.deepEqual(comAnexo.chamadas, [{ modelos: [EQUILIBRADO], rota: 'Anthropic' }]);
  // Anexo com credencial: nunca sai, nem com a política ligada.
  const cred = await enviar(await conversa(), 'Veja o anexo.', { anexos: [arquivo('config.docx', docx(['api_key=sk-abcdefghijklmnopqrstuv']))] });
  assert.equal(cred.r.status, 422);
  assert.equal(cred.chamadas.length, 0);
  // Streaming: todos os trechos vieram do recurso autorizado (uma chamada, a da rota fixada).
  assert.ok(comAnexo.r.eventos.filter(e => e.t === 'texto').length >= 1);
});

test('invariante absoluta: nenhuma condição (barato, rápido, único disponível, reserva, créditos, fallback, API, retry) faz a informação sigilosa chegar a recurso não autorizado', async () => {
  politica(true);
  const autorizados = [EQUILIBRADO];
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  const n = OR.chamadas.length, idAntes = um(S.app.db, 'select coalesce(max(id), 0) as i from roteamento').i;
  let semente = 7;
  const al = k => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente % k; };
  for (let i = 0; i < 60; i++) {
    const modelo = [undefined, RAPIDO, AVANCADO, 'openrouter/auto', 'classe:rapido', 'classe:avancado'][al(6)];
    if (al(4) === 0) OR.falhar.add(EQUILIBRADO); else OR.falhar.clear();
    const conv = al(2) ? await sigilosa() : await conversa();
    await enviarMensagem(ana, conv.id, { texto: al(2) ? "Traduza 'bom dia'." : 'Confira a conta corrente 56789-0, agência 1234.', ...(modelo ? { modelo } : {}) });
  }
  OR.falhar.clear();
  // Toda chamada com informação sigilosa (rota fixada) foi a um autorizado, pela rota autorizada.
  const sigilosas = OR.chamadas.slice(n).filter(c => c.provider?.only);
  assert.ok(sigilosas.length > 10);
  for (const c of sigilosas) { assert.ok(autorizados.includes(c.model), c.model); assert.equal(c.provider.only[0], 'Anthropic'); assert.ok(!c.models); }
  // E toda decisão sigilosa registrada com recurso selecionado aponta para um autorizado.
  for (const r of todos(S.app.db, "select modelo from roteamento where sigilosa = 1 and politica_sigilo = 'on' and modelo is not null and id > ?", idAntes)) assert.ok(autorizados.includes(r.modelo), r.modelo);
});

test('nunca expor provider: respostas para quem usa não citam OpenRouter, fornecedor, rota nem identificador técnico', async () => {
  politica(true);
  catalogo({ [EQUILIBRADO]: ROTA('Anthropic') });
  await admin.put('/api/admin/modelos-config', { automatico: true });
  const coletado = [];
  const guardar = (onde, dados) => coletado.push([onde, JSON.stringify(dados, (k, v) => (k === 'texto' || k === 'v' ? undefined : v))]);   // conteúdo da conversa fica fora
  // Sucesso, fallback, bloqueio, indisponibilidade, Automático do provedor, histórico e telas.
  const c1 = await conversa();
  guardar('sucesso', (await enviarMensagem(ana, c1.id, { texto: 'Olá' })).eventos);
  guardar('automatico', (await enviarMensagem(ana, c1.id, { texto: 'Olá', modelo: 'classe:externo' })).eventos);
  const c2 = await sigilosa();
  OR.falhar.add(EQUILIBRADO);
  guardar('falha', (await enviarMensagem(ana, c2.id, { texto: 'Confidencial', modelo: RAPIDO })));
  OR.falhar.clear();
  catalogo({});
  guardar('bloqueio', (await enviarMensagem(ana, c2.id, { texto: 'Confidencial' })).erro);
  politica(false);
  guardar('politica off', (await enviarMensagem(ana, c2.id, { texto: 'Confidencial' })).erro);
  exec(S.app.db, 'update modelos set liberado = 0');
  guardar('indisponivel', (await enviarMensagem(ana, (await conversa()).id, { texto: 'Olá' })).erro);
  exec(S.app.db, 'update modelos set liberado = 1 where id in (?, ?, ?)', RAPIDO, EQUILIBRADO, AVANCADO);
  for (const p of ['/api/eu', '/api/modelos', '/api/modelos?sigilosa=1', '/api/conversas', `/api/conversas/${c1.id}`, `/api/conversas/${c2.id}`, '/api/politica', '/api/quick-wins', '/api/publico'])
    guardar(p, (await ana.get(p)).dados);
  await admin.put('/api/admin/modelos-config', { automatico: false });
  const ids = todos(S.app.db, 'select id from modelos').map(m => m.id);
  const proibidos = [/openrouter/i, /anthropic(?!o)/i, /\bgoogle\b/i, /mistral/i, /FornecedorLivre/, /chat\/completions/, /sk-or/, /data_collection|allow_fallbacks|zdr/];
  for (const [onde, json] of coletado) {
    for (const re of proibidos) assert.doesNotMatch(json, re, `${onde}: ${json.slice(0, 300)}`);
    for (const id of ids) assert.ok(!json.includes(id), `${onde}: identificador técnico ${id}`);
  }
  // O admin continua vendo o técnico quando precisa.
  const c3 = (await admin.post('/api/conversas', {})).dados.conversa;
  const ra = await enviarMensagem(admin, c3.id, { texto: 'Olá' });
  assert.ok(ids.includes(ra.fim.modelo));
});

test('migração de bancos existentes: autorização da plataforma vai para coluna própria; homologações antigas ganham os atributos que já valiam', async () => {
  const { abrirBanco, migrar } = await import('../src/db.js');
  const db = abrirBanco();
  exec(db, "insert into modelos (id, nome, liberado, perfil, homologado, homologacao) values ('a/empresa', 'A', 1, 'rapido', 1, ?)", JSON.stringify({ quem: 'x@y', fornecedor: 'Forn', justificativa: 'ok' }));
  exec(db, "insert into modelos (id, nome, liberado, perfil, homologado, homologacao) values ('b/plataforma', 'B', 1, 'rapido', 1, ?)", JSON.stringify({ quem: 'ops (plataforma)', fornecedor: 'FornP', origem: 'plataforma' }));
  db.exec('pragma user_version = 8');
  migrar(db);
  const a = JSON.parse(um(db, "select homologacao from modelos where id = 'a/empresa'").homologacao);
  assert.deepEqual([a.endpoint, a.retencaoZero, a.semTreino], ['Forn', true, true], 'o fornecedor era a rota usada no envio; as garantias eram obrigatórias para homologar');
  const b = um(db, "select homologado, homologacao, autorizacao_plataforma from modelos where id = 'b/plataforma'");
  assert.equal(b.homologado, 0);
  assert.equal(b.homologacao, null);
  assert.equal(JSON.parse(b.autorizacao_plataforma).endpoint, 'FornP');
  // Política da empresa continua desligada depois da migração: ninguém liga por ela.
  assert.equal(politicaSigiloLigada(lerConfig(db)), false);
});
