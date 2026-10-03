// Integration Builder entre empresas e pela API (multiempresa): recurso desligado por padrão (404); ciclo completo
// pelas rotas (descoberta, conector, ações, credencial, teste, aprovação, publicação); Quick Win com leitura e
// escrita (aprovação a cada execução); e isolamento: conector, credencial, aprovação, plano e execução de uma
// empresa não são alcançáveis a partir de outra. Só servidores falsos e locais; dados fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso } from './openrouter-falso.js';
import { apiFalsa, OPENAPI_FALSA } from './integracoes-fake.js';
import { todos } from '../src/db.js';

const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
const vistos = [];
function roteiro(b) {
  const s = texto(b.messages[0].content), tudo = b.messages.map(m => texto(m.content)).join('\n');
  vistos.push(tudo);
  if (s.includes('PLANO DE TRABALHO')) return JSON.stringify({ entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo dos clientes' }], etapas: [{ texto: 'Consultar' }, { texto: 'Resumir' }] });
  if (s.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (s.includes('Você está executando o Quick Win')) {
    const fatura = /dados_integracao/.test(tudo) ? '\n\n```dados_integracao\n{"n2": {"cliente_id": 1, "valor": 150.5, "descricao": "QA fatura fictícia"}}\n```' : '';
    return `## Resumo\n- Cliente Fictício A e Cliente Fictício B estão na base.\n\n## Pontos de atenção\n- Nenhum.\n\n## Informações não encontradas\n- Nenhuma.${fatura}`;
  }
  return 'Certo.';
}
let S, OR, API, ops, A, B, ana, bia;
before(async () => {
  API = await apiFalsa();
  OR = await openRouterFalso({ responder: roteiro });
  S = await subirPlataforma({ ia: OR.ia });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company'));
  A = (await ops.post('/api/plataforma/empresas', { name: 'Alfa Ltda', slug: 'alfa', plan_id: plano.id, admin_email: 'ana@alfa.com', status: 'ativa' })).dados;
  B = (await ops.post('/api/plataforma/empresas', { name: 'Beta SA', slug: 'beta', plan_id: plano.id, admin_email: 'bia@beta.com', status: 'ativa' })).dados;
  ana = S.navegador(); await ana.get('/alfa'); assert.equal((await ana.entrarEmpresa('ana@alfa.com')).status, 200);
  bia = S.navegador(); await bia.get('/beta'); assert.equal((await bia.entrarEmpresa('bia@beta.com')).status, 200);
});
after(async () => { await S.fechar(); await OR.fechar(); await API.fechar(); });

async function enviar(n, conv, corpo) {
  const r = await n.req('POST', `/api/conversas/${conv}/mensagens`, corpo);
  return typeof r.dados === 'string' ? r.dados.trim().split('\n').map(l => JSON.parse(l)) : r;
}
const ligar = n => n.put('/api/admin/config', { integracoes: { ativa: true, pessoas: [], rede_privada_autorizada: true } });

// Conector da API falsa pela API HTTP, até publicado.
async function conectorPelaApi(n) {
  const d = (await n.post('/api/admin/integracoes/descobrir', { especificacao: JSON.stringify(OPENAPI_FALSA(API.base)) })).dados;
  assert.equal(d.formato, 'openapi3');
  const c = (await n.post('/api/admin/integracoes', { nome: 'QA - CRM Fictício', sistema: 'CRM Fictício', base_url: d.base_url, auth_type: 'api_key', operacoes: d.operacoes, config: { rede_privada: true, cabecalho_auth: 'X-API-Key', timeout_ms: 2000 } })).dados;
  assert.equal(c.status, 'DISCOVERED');
  const caps = await n.put(`/api/admin/integracoes/${c.id}/capabilities`, { escolhas: [{ operation_id: 'listarClientes', efeitos: { personal_data: false } }, { operation_id: 'criarFatura' }] });
  assert.equal(caps.status, 200, JSON.stringify(caps.dados));
  const cred = await n.put(`/api/admin/integracoes/${c.id}/credencial`, { valor: API.chave });
  assert.equal(cred.status, 200);
  assert.ok(!JSON.stringify(cred.dados).includes(API.chave), 'a resposta não devolve a credencial');
  const t = (await n.post(`/api/admin/integracoes/${c.id}/testar`, {})).dados;
  assert.ok(t.passou, JSON.stringify(t));
  assert.equal(t.resultados.find(r => r.modo === 'write').status, 'SIMULATED', 'escrita só simulada no teste');
  assert.equal(API.estado.faturas.size, 0, 'teste não escreve no sistema externo');
  const ap = await n.post(`/api/admin/integracoes/aprovacoes/${t.aprovacao.id}/decidir`, { aprovar: true });
  assert.equal(ap.status, 200);
  const pub = (await n.post(`/api/admin/integracoes/${c.id}/publicar`, {})).dados;
  assert.equal(pub.status, 'ACTIVE');
  return c;
}

let conectorA, aprovacaoExecA, planoA;
test('desligado por padrão: rotas de integração respondem 404 e o Quick Win não mostra nada de integração', async () => {
  for (const [m, c] of [['get', '/api/admin/integracoes'], ['post', '/api/admin/integracoes/descobrir'], ['post', '/api/integracoes/necessidades'], ['get', '/api/integracoes/planos/pln_x']]) {
    const r = await ana[m](c, {});
    assert.equal(r.status, 404, `${m} ${c}`);
  }
  assert.equal((await ana.get('/api/eu')).dados.integracoes, undefined);
  const it = (await ana.post('/api/quick-wins/assistente/interpretar', { descricao: 'Consulte os clientes no CRM Fictício e faça um resumo.' })).dados;
  assert.equal(it.integracoes, undefined);
  assert.equal(it.operacao?.integracoes, undefined);
});

test('ciclo completo pela API e Quick Win: leitura vira material; escrita pede aprovação, executa só a entrada aprovada e não duplica', async () => {
  assert.equal((await ligar(ana)).status, 200);
  assert.equal((await ana.get('/api/eu')).dados.integracoes, true);
  conectorA = await conectorPelaApi(ana);
  const det = (await ana.get(`/api/admin/integracoes/${conectorA.id}`)).dados;
  assert.ok(!JSON.stringify(det).includes(API.chave), 'detalhe sem credencial');
  assert.equal(det.credencial.mascara, '••••••••');

  const descricao = 'Consulte os clientes no CRM Fictício e registre uma fatura no CRM Fictício.';
  const it = (await ana.post('/api/quick-wins/assistente/interpretar', { descricao })).dados;
  assert.deepEqual(it.integracoes.map(n => [n.categoria, n.estado]), [['read_data', 'disponivel'], ['create_record', 'requer_aprovacao']]);
  const area = (await ana.post('/api/admin/areas', { nome: 'Financeiro' })).dados.id;
  const qw = (await ana.post('/api/quick-wins', { assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } }, areas: [area] })).dados;
  const conv = (await ana.post('/api/conversas', { quick_win_id: qw.id, teste: true })).dados.conversa;
  vistos.length = 0;
  const ev = await enviar(ana, conv.id, { executar_quick_win: true, texto: 'Base fictícia de setembro.' });
  const fim = ev.find(e => e.t === 'fim');
  assert.ok(fim, JSON.stringify(ev.slice(-3)));
  // A leitura chegou à IA como material; a credencial nunca.
  assert.ok(vistos.some(v => v.includes('Cliente Fictício A')), 'os dados lidos viram material da execução');
  assert.ok(!vistos.some(v => v.includes(API.chave)), 'credencial nunca vai para o modelo');
  const texto = ev.filter(e => e.t === 'texto').at(-1).v;
  assert.ok(!texto.includes('dados_integracao'), 'o bloco estruturado sai do texto mostrado');
  const passos = fim.qualidade.integracoes.passos;
  assert.deepEqual(passos.map(p => [p.modo, p.status]), [['read', 'SUCCESS'], ['write', 'APPROVAL_REQUIRED']]);
  assert.equal(API.estado.faturas.size, 0, 'nenhuma escrita silenciosa');
  planoA = fim.qualidade.integracoes.plano;
  aprovacaoExecA = passos[1].aprovacao;
  assert.ok(aprovacaoExecA);
  // Aprovação: a tela mostra os dados que serão enviados; aprovar e executar o plano grava uma vez.
  const pend = (await ana.get('/api/admin/integracoes/aprovacoes')).dados.pendentes.find(a => a.id === aprovacaoExecA);
  assert.equal(pend.resumo.dados.descricao, 'QA fatura fictícia');
  assert.equal((await ana.post(`/api/admin/integracoes/aprovacoes/${aprovacaoExecA}/decidir`, { aprovar: true })).status, 200);
  const r = (await ana.post(`/api/integracoes/planos/${planoA}/executar`, {})).dados;
  assert.equal(r.passos[1].status, 'SUCCESS', JSON.stringify(r));
  assert.equal(API.estado.faturas.size, 1);
  const r2 = (await ana.post(`/api/integracoes/planos/${planoA}/executar`, {})).dados;
  assert.equal(r2.status, 'concluido');
  assert.equal(API.estado.faturas.size, 1, 'reexecutar não duplica');
  // Auditoria: eventos com metadados, sem credencial.
  const evs = todos(S.P.tenant(A.id).db, "select tipo, detalhes from eventos where tipo like 'CONNECTOR_%' or tipo like 'APPROVAL_%' or tipo = 'CAPABILITY_EXECUTED'");
  for (const t of ['CONNECTOR_DISCOVERED', 'CONNECTOR_CREATED', 'CONNECTOR_TESTED', 'CONNECTOR_APPROVED', 'CONNECTOR_PUBLISHED', 'APPROVAL_REQUESTED', 'APPROVAL_GRANTED', 'CAPABILITY_EXECUTED']) assert.ok(evs.some(e => e.tipo === t), t);
  assert.ok(!JSON.stringify(evs).includes(API.chave));
});

test('isolamento entre empresas: conector, credencial, aprovação, plano e catálogo da Alfa não existem para a Beta', async () => {
  assert.equal((await ligar(bia)).status, 200);
  const id = conectorA.id;
  for (const [m, c, corpo] of [['get', `/api/admin/integracoes/${id}`], ['req:PATCH', `/api/admin/integracoes/${id}`, { nome: 'x' }], ['put', `/api/admin/integracoes/${id}/credencial`, { valor: 'outra-chave-123' }],
    ['put', `/api/admin/integracoes/${id}/capabilities`, { escolhas: [] }], ['post', `/api/admin/integracoes/${id}/testar`], ['post', `/api/admin/integracoes/${id}/publicar`], ['post', `/api/admin/integracoes/${id}/pausar`],
    ['post', `/api/admin/integracoes/${id}/revogar`], ['post', `/api/admin/integracoes/aprovacoes/${aprovacaoExecA}/decidir`, { aprovar: true }], ['get', `/api/integracoes/aprovacoes/${aprovacaoExecA}`],
    ['get', `/api/integracoes/planos/${planoA}`], ['post', `/api/integracoes/planos/${planoA}/executar`]]) {
    const r = m.startsWith('req:') ? await bia.req(m.slice(4), c, corpo) : await bia[m](c, corpo || {});
    assert.equal(r.status, 404, `${m} ${c}: ${JSON.stringify(r.dados)}`);
  }
  const lista = (await bia.get('/api/admin/integracoes')).dados;
  assert.deepEqual([lista.conectores.length, lista.catalogo.length, lista.pendentes.length], [0, 0, 0]);
  const it = (await bia.post('/api/integracoes/necessidades', { descricao: 'Consulte os clientes no CRM Fictício.' })).dados;
  assert.equal(it.necessidades[0].estado, 'configurar', 'a integração da Alfa não serve para a Beta');
  const dbB = S.P.tenant(B.id).db;
  for (const t of ['connectors', 'capabilities', 'connector_secrets_ref', 'integration_approvals', 'connector_runs', 'integ_planos']) assert.equal(todos(dbB, `select * from ${t}`).length, 0, t);
  // A Alfa continua intacta.
  assert.equal((await ana.get(`/api/admin/integracoes/${id}`)).dados.status, 'ACTIVE');
});

test('sem permissão: quem não administra não configura nem aprova integrações', async () => {
  assert.equal((await ana.post('/api/empresa/usuarios', { email: 'caio@alfa.com', name: 'Caio', role_id: 'role_member' })).status, 200);
  const caio = S.navegador(); await caio.get('/alfa');
  assert.equal((await caio.entrarEmpresa('caio@alfa.com')).status, 200);
  for (const [m, c] of [['get', '/api/admin/integracoes'], ['post', `/api/admin/integracoes/${conectorA.id}/revogar`], ['post', `/api/admin/integracoes/aprovacoes/${aprovacaoExecA}/decidir`]]) assert.equal((await caio[m](c, {})).status, 403, `${m} ${c}`);
});
