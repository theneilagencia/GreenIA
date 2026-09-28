// Quem usa não administra a plataforma: em nenhum dos 20 cenários a pessoa recebe instrução técnica, precisa
// escolher modelo, homologar ou mudar configuração. A GreenIA tenta resolver sozinha, dentro das regras; quando
// não há alternativa segura, bloqueia, registra e avisa o admin (uma vez por dia por causa). Governança nunca
// é afrouxada para atender.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo } from './arquivos.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, todos, um } from '../src/db.js';
import { ErroIA } from '../src/ia.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';

// Modelo que de fato respondeu, pelo registro (a resposta para quem não administra não traz identificador técnico).
const usado = r => um(S.app.db, 'select modelo_usado from roteamento where resposta_id = ?', r.fim.id)?.modelo_usado;


const RAPIDO = 'google/gemini-3.5-flash-lite', EQUILIBRADO = 'anthropic/claude-haiku-4.5', AVANCADO = 'anthropic/claude-sonnet-5';
const CONTRATO = 'Analise este contrato e identifique riscos jurídicos, obrigações e possíveis pontos de exposição.';
const enc = encodeURIComponent;
// Palavras que transferem decisão técnica para quem usa.
const TECNICO = /modelo|homolog|\bclasse\b|perfil|janela|token|configur|libere|liberar|openrouter|provedor|fornecedor|gestão|fale com o admin|avise o admin/i;

let S, OR, admin, ana, recusar = false;
// IA de teste: o OpenRouter falso, com a opção de o provedor recusar a chave (401).
const ia = () => ({ ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a),
  async *enviar(msgs, op) { if (recusar) throw new ErroIA('O serviço de IA recusou: invalid api key (sk-or-v1-abc)', 401); yield* OR.ia.enviar(msgs, op); } });

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: ia() });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], allow_sensitive_processing_with_guardrails: true });   // empresa que processa informação sigilosa com guardrails
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: false } } });
});
after(async () => { await S.fechar(); await OR.fechar(); });

const conversa = async (corpo = {}) => (await ana.post('/api/conversas', corpo)).dados.conversa;
const sigilosa = async () => { const c = await conversa(); await ana.patch(`/api/conversas/${c.id}`, { sigilosa: true }); return c; };
const ultimaRota = () => { const r = um(S.app.db, 'select * from roteamento order by id desc limit 1'); for (const k of ['politicas', 'fallback', 'candidatos']) r[k] = JSON.parse(r[k] ?? 'null'); return r; };
const alertas = causa => todos(S.app.db, "select detalhes from eventos where tipo = 'governance.admin_alert'").filter(e => JSON.parse(e.detalhes).causa === causa).length;
const emailsAdmin = () => S.app.email.enviados.filter(m => m.para === 'admin@exemplo.com.br').map(m => m.assunto);

// O que quem usa vê: a mensagem de erro, a explicação da escolha e os avisos da conversa.
async function semDecisaoTecnica(conv, r) {
  const textos = [r.erro?.mensagem, r.falha?.mensagem, r.fim?.rota?.explicacao];
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  for (const m of d.mensagens) { if (m.papel === 'aviso') textos.push(m.texto); if (m.papel === 'assistant') { textos.push(m.rota_explicacao); assert.equal(m.fornecedor, null); } }
  for (const t of textos.filter(Boolean)) assert.doesNotMatch(t, TECNICO, `texto técnico para quem usa: ${t}`);
  assert.ok(!r.erro || !('sugestao' in r.erro), 'nenhuma sugestão de modelo para a pessoa escolher');
}

test('11. nenhum modelo homologado: conversa sigilosa bloqueada com segurança, nada enviado, admin avisado uma vez', async () => {
  const conv = await sigilosa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Estratégia de preço do próximo trimestre.' });
  assert.equal(r.status, 409);
  assert.equal(r.erro.erro, 'sem_modelo_autorizado');
  assert.equal(r.erro.mensagem, MSG_USUARIO.sigilo);
  assert.equal(OR.chamadas.length, n, 'nada foi enviado');
  assert.equal(ultimaRota().resultado, 'bloqueado');
  assert.equal(alertas('sem_modelo_sigilo'), 1);
  assert.ok(emailsAdmin().some(a => /Conversas confidenciais estão sendo bloqueadas/.test(a)));
  await semDecisaoTecnica(conv, r);
  // De novo: continua bloqueado e registrado, sem repetir o email.
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Mais uma pergunta.' });
  assert.equal(r2.status, 409);
  assert.equal(alertas('sem_modelo_sigilo'), 1);
  assert.equal(um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.blocked'").n, 2);
  // A conversa continua sigilosa: bloquear não afrouxa a regra.
  assert.equal((await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: false })).status, 409);
});

test('1. sigilosa sem modelo elegível para a pessoa (homologado só numa classe que ela não acessa): bloqueio seguro', async () => {
  await admin.put(`/api/admin/modelos/${enc(AVANCADO)}`, { liberado: true, perfil: 'avancado' });
  const h = await admin.post(`/api/admin/modelos/${enc(AVANCADO)}/homologar`, { fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato do fornecedor.' });
  assert.equal(h.status, 200, JSON.stringify(h.dados));
  const conv = await sigilosa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Pergunta confidencial.' });
  assert.equal(r.status, 409, JSON.stringify(r.erro));
  assert.equal(r.erro.mensagem, MSG_USUARIO.sigilo);
  assert.equal(OR.chamadas.length, n);
  assert.ok(ultimaRota().candidatos.every(c => c.motivos.length), 'cada modelo tem o motivo de exclusão na auditoria');
  await semDecisaoTecnica(conv, r);
  await admin.del(`/api/admin/modelos/${enc(AVANCADO)}/homologar`).catch(() => {});
});

test('2. sigilosa com modelo elegível em outro nível: a GreenIA usa o autorizado, sem perguntar', async () => {
  const h = await admin.post(`/api/admin/modelos/${enc(EQUILIBRADO)}/homologar`, { fornecedor: 'Anthropic', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato do fornecedor.' });
  assert.equal(h.status, 200, JSON.stringify(h.dados));
  const conv = await sigilosa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Liste os itens.', modelo: 'classe:rapido' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(OR.chamadas.at(-1).model, EQUILIBRADO);
  assert.deepEqual(OR.chamadas.at(-1).provider, { order: ['Anthropic'], only: ['Anthropic'], allow_fallbacks: false, zdr: true, data_collection: 'deny' });
  assert.notEqual(ultimaRota().classe, 'rapido');
  await semDecisaoTecnica(conv, r);
});

test('17. conteúdo confidencial detectado com escolha de modelo não autorizado: não vai ao não autorizado', async () => {
  const cfg = lerConfig(S.app.db);
  salvarConfig(S.app.db, { acoesChat: { ...cfg.acoesChat, confidencial: 'proteger' } });
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Resuma o relatório CONFIDENCIAL da diretoria.', modelo: RAPIDO });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(OR.chamadas.at(-1).model, EQUILIBRADO);
  assert.ok(!OR.chamadas.at(-1).models, 'sem reserva de outro fornecedor');
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).dados.conversa.sigilosa, true);
  salvarConfig(S.app.db, { acoesChat: cfg.acoesChat });
});

test('9. pessoa sem conhecimento técnico: pede, e a GreenIA resolve; o seletor não mostra modelos técnicos', async () => {
  const opcoes = (await ana.get('/api/modelos')).dados.opcoes;
  assert.ok(opcoes.every(o => !o.id.includes('/')), 'só níveis, nenhum identificador técnico');
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Me ajude a escrever um email de boas-vindas.' });
  assert.equal(r.status, 200);
  assert.match(r.fim.rota.explicacao, /escolhido automaticamente pela GreenIA/);
  await semDecisaoTecnica(conv, r);
});

test('14. pedido simples usa o nível econômico', async () => {
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: "Traduza 'bom dia' para inglês." });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, RAPIDO);
  await semDecisaoTecnica(conv, r);
});

test('4. o necessário não está disponível para a pessoa: usa o mais capaz permitido e registra a causa', async () => {
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: CONTRATO });
  assert.equal(r.status, 200);
  assert.notEqual(OR.chamadas.at(-1).model, AVANCADO, 'o acesso por grupo não é afrouxado');
  const rota = ultimaRota();
  assert.equal(rota.fallback.tipo, 'abaixo_do_necessario');
  assert.ok(rota.fallback.causas.includes('sem_acesso_a_classe'));
  await semDecisaoTecnica(conv, r);
});

test('12. nível sem permissão para o grupo da pessoa, pedido à força: não é usado; o automático resolve', async () => {
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: 'classe:avancado' });
  assert.equal(r.status, 200);
  assert.notEqual(OR.chamadas.at(-1).model, AVANCADO);
  assert.equal(ultimaRota().fallback.tipo, 'escolha_substituida');
  await semDecisaoTecnica(conv, r);
});

test('13. pedido que exige mais capacidade: sobe de nível sozinho quando a pessoa tem acesso', async () => {
  await admin.put('/api/admin/modelos-config', { acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: true } } });
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: CONTRATO });
  assert.equal(r.status, 200);
  assert.equal(OR.chamadas.at(-1).model, AVANCADO);
  await semDecisaoTecnica(conv, r);
});

test('3 e 7. principal indisponível com reserva: a reserva responde, registrada, sem perguntar', async () => {
  await admin.put(`/api/admin/modelos/${enc('openai/gpt-5-mini')}`, { liberado: true, perfil: 'rapido' });
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: 'openai/gpt-5-mini' });
  OR.falhar.add(RAPIDO);
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá' });
  OR.falhar.delete(RAPIDO);
  assert.equal(r.status, 200);
  assert.equal(usado(r), 'openai/gpt-5-mini');
  assert.equal(r.fim.reserva, true);
  await semDecisaoTecnica(conv, r);
});

test('8 e 16. principal e reserva fora: mensagem simples; nova tentativa funciona sem nada a configurar', async () => {
  OR.falhar.add(RAPIDO); OR.falhar.add('openai/gpt-5-mini');
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá' });
  assert.equal(r.falha.mensagem, MSG_USUARIO.falhou);
  assert.equal(ultimaRota().resultado, 'falha_na_execucao');
  const ev = JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'ai.failed' order by id desc limit 1").detalhes);
  assert.ok(ev.erro, 'o detalhe técnico fica no registro, para o admin');
  OR.falhar.clear();
  await admin.put(`/api/admin/modelos/${enc(RAPIDO)}`, { reserva: null });
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Olá de novo' });
  assert.equal(r2.status, 200);
  await semDecisaoTecnica(conv, r2);
});

test('5. conteúdo maior que a janela do nível econômico: vai para um que lê tudo, sem pedir nada', async () => {
  exec(S.app.db, 'update modelos set contexto = 2000 where perfil = ?', 'rapido');
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: `Resuma o texto a seguir. ${'Relatório de atividades do mês. '.repeat(400)}` });
  exec(S.app.db, 'update modelos set contexto = 1048576 where perfil = ?', 'rapido');
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.notEqual(OR.chamadas.at(-1).model, RAPIDO);
  await semDecisaoTecnica(conv, r);
});

test('19. conteúdo incompatível com todos os modelos: bloqueio com orientação da tarefa, sem acionar o admin', async () => {
  const janelas = todos(S.app.db, 'select id, contexto from modelos');
  exec(S.app.db, 'update modelos set contexto = 1000');
  const conv = await conversa();
  const n = OR.chamadas.length, alertasAntes = um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n;
  const r = await enviarMensagem(ana, conv.id, { texto: `Resuma o texto a seguir. ${'Relatório de atividades do mês. '.repeat(400)}` });
  for (const j of janelas) exec(S.app.db, 'update modelos set contexto = ? where id = ?', j.contexto, j.id);
  assert.equal(r.status, 413);
  assert.equal(r.erro.mensagem, MSG_USUARIO.grande);
  assert.equal(OR.chamadas.length, n);
  assert.equal(ultimaRota().resultado, 'bloqueado');
  assert.equal(um(S.app.db, "select count(*) as n from eventos where tipo = 'governance.admin_alert'").n, alertasAntes, 'o tamanho do material não é problema de governança');
  await semDecisaoTecnica(conv, r);
});

test('15. anexo de tipo desconhecido: recusado com orientação simples, nada enviado', async () => {
  const conv = await conversa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Veja o anexo', anexos: [arquivo('planilha.xyz', 'conteúdo qualquer')] });
  assert.equal(r.status, 415);
  assert.match(r.erro.mensagem, /formato não aceito\. Use PDF com texto, DOCX, PPTX, TXT, MD, CSV ou XLSX/);
  assert.equal(OR.chamadas.length, n);
  await semDecisaoTecnica(conv, r);
});

test('6. chave recusada pelo provedor: mensagem simples para quem usa; detalhe técnico e aviso só para o admin', async () => {
  recusar = true;
  const conv = await conversa();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá' });
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Olá de novo' });
  recusar = false;
  assert.equal(r.falha.mensagem, MSG_USUARIO.ia_fora);
  assert.equal(r2.falha.mensagem, MSG_USUARIO.ia_fora);
  assert.equal(alertas('ia_fora'), 1, 'um aviso ao admin, sem repetir');
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'ai.failed' order by id desc limit 1").detalhes;
  assert.match(ev, /recusou/);
  assert.ok(!emailsAdmin().some(a => /sk-or/.test(a)));
  await semDecisaoTecnica(conv, r);
});

test('18. Automático do provedor: nunca usado com dado sigiloso; fora dele, explicado sem termos técnicos', async () => {
  await admin.put('/api/admin/modelos-config', { automatico: true });
  const sig = await sigilosa();
  const r = await enviarMensagem(ana, sig.id, { texto: 'Pergunta confidencial', modelo: 'openrouter/auto' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(OR.chamadas.at(-1).model, EQUILIBRADO, 'resolvido com o autorizado');
  await semDecisaoTecnica(sig, r);
  const conv = await conversa();
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Olá', modelo: 'openrouter/auto' });
  assert.equal(r2.status, 200);
  assert.equal(OR.chamadas.at(-1).model, 'openrouter/auto');
  assert.match(ultimaRota().explicacao, /fora das classes e das regras de roteamento/, 'o registro técnico diz que ficou fora das regras de roteamento');
  await semDecisaoTecnica(conv, r2);
  await admin.put('/api/admin/modelos-config', { automatico: false });
});

test('10. configuração incompleta (quick win fixo numa classe sem modelo liberado): atende no automático e avisa o admin', async () => {
  const q = (await admin.post('/api/quick-wins', { nome: 'Análise', toda_empresa: true, modelo: 'classe:avancado', pode_trocar: false })).dados;
  assert.equal((await admin.put(`/api/quick-wins/${q.id}`, { status: 'ativo' })).status, 200);
  exec(S.app.db, "update modelos set liberado = 0 where perfil = 'avancado' and homologado = 0");
  const conv = await conversa({ quick_win_id: q.id });
  const r = await enviarMensagem(ana, conv.id, { texto: 'Analise este cenário.' });
  exec(S.app.db, "update modelos set liberado = 1 where id = ?", AVANCADO);
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.notEqual(OR.chamadas.at(-1).model, AVANCADO);
  assert.equal(alertas('quick_win_sem_modelo'), 1);
  await semDecisaoTecnica(conv, r);
});

test('20. falha que exige o admin (nenhum modelo liberado): bloqueio simples, auditado, admin avisado', async () => {
  const liberados = todos(S.app.db, 'select id from modelos where liberado = 1').map(m => m.id);
  exec(S.app.db, 'update modelos set liberado = 0');
  const conv = await conversa();
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Olá' });
  for (const id of liberados) exec(S.app.db, 'update modelos set liberado = 1 where id = ?', id);
  assert.equal(r.status, 503, JSON.stringify(r.erro));
  assert.equal(r.erro.mensagem, MSG_USUARIO.indisponivel);
  assert.equal(OR.chamadas.length, n);
  assert.equal(ultimaRota().resultado, 'bloqueado');
  assert.equal(alertas('sem_modelo'), 1);
  assert.ok(emailsAdmin().some(a => /nenhum modelo disponível/.test(a)));
  await semDecisaoTecnica(conv, r);
});

test('plataforma: a operadora autoriza um modelo para dado sigiloso em todas as empresas; a empresa não retira', async () => {
  const PL = await subirPlataforma({ ia: { configurada: true, async listarModelos() { return []; }, async *enviar() { yield { tipo: 'texto', texto: 'ok' }; yield { tipo: 'fim', modelo: 'mistralai/mistral-small', custo: 0 }; } } });
  try {
    const ops = await PL.navegador().entrarConsole('ops@theneil.com.br');
    const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
    assert.ok((await ops.post('/api/plataforma/empresas', { name: 'Gama SA', slug: 'gama', plan_id: planos[0].id, admin_email: 'gil@gama.com', status: 'ativa' })).dados.id);
    const gil = PL.navegador();
    await gil.get('/gama');
    assert.equal((await gil.entrarEmpresa('gil@gama.com')).status, 200);
    assert.equal((await gil.put('/api/admin/sigilo', { ativo: true })).status, 200);   // a empresa liga o processamento protegido
    assert.equal((await ops.post('/api/plataforma/homologacoes', { id: 'mistralai/mistral-small', nome: 'Mistral Small', perfil: 'rapido', fornecedor: 'Mistral', semTreino: true, retencaoZero: false, justificativa: 'Retenção zero conferida.' })).status, 400, 'as duas garantias são obrigatórias');
    assert.equal((await gil.post('/api/plataforma/homologacoes', { id: 'x/y' })).status, 401, 'só a operadora autoriza pela plataforma');
    const ok = await ops.post('/api/plataforma/homologacoes', { id: 'mistralai/mistral-small', nome: 'Mistral Small', perfil: 'rapido', fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato.' });
    assert.equal(ok.status, 200, JSON.stringify(ok.dados));
    const m = (await gil.get('/api/admin/modelos')).dados.modelos.find(x => x.id === 'mistralai/mistral-small');
    // Seguindo as recomendações, a empresa adota a autorização da plataforma sem configurar nada.
    assert.ok(m.homologado && m.liberado && m.homologacao.origem === 'recomendacao_da_plataforma');
    assert.equal(m.autorizacaoPlataforma.endpoint, 'Mistral');
    // Conversa sigilosa na empresa funciona sem nenhuma configuração do admin.
    const conv = (await gil.post('/api/conversas', {})).dados.conversa;
    await gil.req('PATCH', `/api/conversas/${conv.id}`, { sigilosa: true });
    const r = await enviarMensagem(gil, conv.id, { texto: 'Pergunta confidencial' });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    assert.ok(um(PL.P.db, "select 1 from audit_log where action = 'platform.model_certified'"));
    // Retirada pela operadora: some da empresa.
    assert.equal((await ops.del(`/api/plataforma/homologacoes/${enc('mistralai/mistral-small')}`)).status, 200);
    assert.ok(!(await gil.get('/api/admin/modelos')).dados.modelos.find(x => x.id === 'mistralai/mistral-small')?.homologado);
  } finally { await PL.fechar(); }
});
