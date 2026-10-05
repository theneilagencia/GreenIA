// E2E do Integration Builder (navegador + API), só com servidores falsos e locais e dados fictícios:
//   tela: o Quick Win mostra "precisa acessar" + "Configurar integração"; o assistente de 8 passos cria, testa,
//         aprova (tela "poderá / não poderá") e publica; a credencial não volta para a tela; o Quick Win passa a ✓.
//   A leitura (só leitura) · B escrita com aprovação · C credencial inválida · D tempo esgotado · E resposta fora do
//   esquema · F 503 repetível · G operação irreversível negada · H acesso de outra pessoa / sem permissão negado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { todos } from '../src/db.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { apiFalsa, OPENAPI_FALSA } from '../test/integracoes-fake.js';

const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
const vistos = [];
function responder(b) {
  const sis = texto(b.messages[0].content), tudo = b.messages.map(m => texto(m.content)).join('\n');
  vistos.push(tudo);
  if (sis.includes('PLANO DE TRABALHO')) return JSON.stringify({ resumo: 'Resumo dos clientes da base fictícia.', entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo dos clientes' }], etapas: [{ texto: 'Consultar a base' }, { texto: 'Resumir' }] });
  if (sis.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (sis.includes('Você organiza o pedido')) return '{"colunas":[]}';
  if (sis.includes('material FICTÍCIO')) return 'Base fictícia de clientes de setembro.';
  if (!sis.includes('Você está executando o Quick Win')) return 'Certo.';
  const fatura = /dados_integracao/.test(tudo) ? '\n\n```dados_integracao\n{"n2": {"cliente_id": 2, "valor": 99.9, "descricao": "QA fatura fictícia E2E"}}\n```' : '';
  return `## Resumo\n- Cliente Fictício A e Cliente Fictício B estão na base.\n\n## Pontos de atenção\n- Nenhum.\n\n## Informações não encontradas\n- Nenhuma.${fatura}`;
}
let N, OR, API, admin;
before(async () => {
  API = await apiFalsa();
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Comercial' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia', areas: [{ id: area, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N.fechar(); await OR.fechar(); await API.fechar(); });

const SPEC = () => JSON.stringify(OPENAPI_FALSA(API.base));
// Conector pela API (para os cenários de falha), até onde der: teste e, se passar, aprovação e publicação.
async function conector(nome, ops, { chave = API.chave, config = {} } = {}) {
  const d = (await admin.post('/api/admin/integracoes/descobrir', { especificacao: SPEC() })).dados;
  const c = (await admin.post('/api/admin/integracoes', { nome: `QA - ${nome}`, sistema: nome, base_url: d.base_url, auth_type: 'api_key', operacoes: d.operacoes, config: { rede_privada: true, cabecalho_auth: 'X-API-Key', timeout_ms: 1000, backoff_ms: 10, ...config } })).dados;
  await admin.put(`/api/admin/integracoes/${c.id}/capabilities`, { escolhas: ops.map(o => (typeof o === 'string' ? { operation_id: o } : o)) });
  await admin.put(`/api/admin/integracoes/${c.id}/credencial`, { valor: chave });
  const t = (await admin.post(`/api/admin/integracoes/${c.id}/testar`, {})).dados;
  if (t.passou) {
    await admin.post(`/api/admin/integracoes/aprovacoes/${t.aprovacao.id}/decidir`, { aprovar: true });
    assert.equal((await admin.post(`/api/admin/integracoes/${c.id}/publicar`, {})).dados.status, 'ACTIVE');
  }
  return { id: c.id, teste: t };
}

test('tela: Quick Win pede a integração; assistente de 8 passos cria, testa, aprova e publica; credencial não volta; Quick Win passa a ✓', async () => {
  assert.equal((await admin.put('/api/admin/config', { integracoes: { ativa: true, pessoas: [], rede_privada_autorizada: true } })).status, 200);
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  // Quick Win: precisa do CRM Fictício, que ainda não existe.
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Consulte os clientes no CRM Fictício e faça um resumo.');
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  const plano = await p.locator('#plano').innerText();
  assert.match(plano, /Este Quick Win precisa acessar CRM Fictício/);
  assert.match(plano, /precisa configurar/);
  assert.equal(await p.locator('#plano a[href="#/integracoes/nova"]').count(), 1, 'CTA Configurar integração');
  await p.screenshot({ path: 'capturas/tmp/integracoes-qw-precisa.png' });

  // Assistente.
  await p.goto(`${N.base}/app#/integracoes/nova`);
  await p.waitForSelector('#i-nome');
  await p.fill('#i-nome', 'QA - CRM Fictício'); await p.fill('#i-sistema', 'CRM Fictício');
  await p.click('#seguir');
  await p.waitForSelector('#i-base');
  await p.fill('#i-doc', SPEC());
  await p.click('#ler-doc');
  await p.waitForFunction(() => /Ações encontradas \(\d+\)/.test(document.body.innerText) && !/Ações encontradas \(0\)/.test(document.body.innerText));
  await p.check('#i-interna');
  await p.click('#seguir');
  await p.waitForSelector('#a-tipo');
  await p.selectOption('#a-tipo', 'api_key');
  await p.fill('#c-cab', 'X-API-Key'); await p.fill('#c-valor', API.chave);
  await p.click('#seguir');
  await p.waitForSelector('[data-op]');
  for (const op of await p.locator('[data-op]').all()) await op.uncheck();
  await p.check('[data-op="listarClientes"]'); await p.check('[data-op="criarFatura"]');
  await p.click('#seguir');
  await p.waitForSelector('#p-tempo');
  assert.doesNotMatch(await p.content(), new RegExp(API.chave), 'a credencial não volta para a tela');
  await p.click('#seguir');
  await p.waitForSelector('#testar');
  await p.click('#testar');
  await p.waitForSelector('text=Passou no teste', { timeout: 20000 });
  assert.match(await p.locator('.pagina-dentro').innerText(), /SIMULATED/);
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'capturas/tmp/integracoes-teste.png', fullPage: true });
  await p.click('#seguir');
  await p.waitForSelector('#aprovar');
  const tela = await p.locator('.pagina-dentro').innerText();
  assert.match(tela, /Esta integração poderá/); assert.match(tela, /Esta integração não poderá/); assert.match(tela, /apagar/i);
  assert.doesNotMatch(tela, /\{"|"podera"/, 'nada de JSON para quem aprova');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'capturas/tmp/integracoes-aprovacao.png', fullPage: true });
  await p.click('#aprovar');
  await p.waitForSelector('#publicar:not([disabled])');
  await p.click('#publicar');
  await p.waitForSelector('text=Ações disponíveis');
  assert.match(await p.locator('.pagina-dentro').innerText(), /Ativa/);
  assert.doesNotMatch(await p.content(), new RegExp(API.chave));
  // O mesmo pedido agora resolve: ✓ disponível para a leitura.
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Consulte os clientes no CRM Fictício e faça um resumo.');
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  assert.match(await p.locator("#plano").innerText(), /CRM Fictício: disponível com aprovação/, "lista de clientes tem e-mail (dado pessoal): a política pede aprovação");
  assert.deepEqual(erros, []);
});

test('A (só leitura) e B (escrita com aprovação): leitura vira material; escrita espera aprovação, grava uma vez a entrada aprovada', async () => {
  const lerCap = await conector('ERP Fictício', [{ operation_id: 'listarClientes', efeitos: { personal_data: false } }, 'criarFatura']);
  const descricao = 'Consulte os clientes no sistema ERP Fictício e registre uma fatura no mesmo sistema.';
  const it = (await admin.post('/api/quick-wins/assistente/interpretar', { descricao })).dados;
  assert.deepEqual(it.integracoes.map(n => [n.sistema_resolvido, n.estado]), [['ERP Fictício', 'disponivel'], ['ERP Fictício', 'requer_aprovacao']]);
  const area = (await admin.get('/api/admin/areas')).dados.areas?.[0]?.id ?? (await admin.post('/api/admin/areas', { nome: 'Financeiro' })).dados.id;
  const qw = (await admin.post('/api/quick-wins', { assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } }, areas: [area] })).dados;
  const conv = (await admin.post('/api/conversas', { quick_win_id: qw.id, teste: true })).dados.conversa;
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  vistos.length = 0;
  await p.goto(`${N.base}/app#/c/${conv.id}`);
  const r = await admin.req('POST', `/api/conversas/${conv.id}/mensagens`, { executar_quick_win: true, texto: 'Base fictícia de setembro.' });
  const ev = String(r.dados).trim().split('\n').map(l => JSON.parse(l));
  const fim = ev.find(e => e.t === 'fim');
  assert.deepEqual(fim.qualidade.integracoes.passos.map(x => [x.modo, x.status]), [['read', 'SUCCESS'], ['write', 'APPROVAL_REQUIRED']], JSON.stringify(fim.qualidade));
  assert.ok(vistos.some(v => v.includes('Cliente Fictício A')), 'A: dado lido chega como material');
  assert.ok(!vistos.some(v => v.includes(API.chave)), 'credencial nunca vai ao modelo');
  assert.equal(API.estado.faturas.size, 0, 'B: nada gravado sem aprovação');
  // Tela da conversa: etapas com status; aprovação pela tela; retomar pelo botão.
  await p.goto(`${N.base}/app#/c/${conv.id}`); await p.reload();
  await p.waitForSelector('.painel-integracoes');
  assert.match(await p.locator('.painel-integracoes').innerText(), /aguardando aprovação/);
  const apr = fim.qualidade.integracoes.passos[1].aprovacao;
  await p.goto(`${N.base}/app#/integracoes/aprovacao/${apr}`);
  await p.waitForSelector('#aprovar');
  assert.match(await p.locator('.pagina-dentro').innerText(), /QA fatura fictícia E2E/);
  await p.click('#aprovar');
  await p.waitForURL(/#\/integracoes$/);
  await p.goto(`${N.base}/app#/c/${conv.id}`); await p.reload();
  await p.waitForSelector('[data-integ-executar]');
  await p.click('[data-integ-executar]');
  await p.waitForFunction(() => /concluída[\s\S]*concluída/.test(document.querySelector('.painel-integracoes')?.innerText || ''));
  await p.screenshot({ path: 'capturas/tmp/integracoes-execucao.png', fullPage: true });
  assert.equal(API.estado.faturas.size, 1);
  assert.equal([...API.estado.faturas.values()][0].descricao, 'QA fatura fictícia E2E');
  const de = await admin.get(`/api/admin/integracoes/${lerCap.id}`);
  assert.ok(de.dados.execucoes.some(x => x.status === 'SUCCESS' && x.operation_id === 'criarFatura' && x.modo === 'real'));
});

test('C credencial inválida, D tempo esgotado, E resposta fora do esquema: o teste reprova e a integração não publica', async () => {
  const c = await conector('Sistema C', [{ operation_id: 'listarClientes', efeitos: { personal_data: false } }], { chave: 'chave-errada-qa' });
  assert.equal(c.teste.passou, false); assert.equal(c.teste.itens.find(i => i.id === 'autenticacao').ok, false);
  assert.equal((await admin.post(`/api/admin/integracoes/${c.id}/publicar`, {})).status, 409);
  const d = await conector('Sistema D', ['lento']);
  assert.equal(d.teste.passou, false); assert.equal(d.teste.resultados[0].erro, 'tempo_esgotado');
  const e = await conector('Sistema E', ['fora']);
  assert.equal(e.teste.passou, false); assert.equal(e.teste.resultados[0].erro, 'resposta_fora_do_esquema');
  // Nenhum segredo nas respostas ou nos eventos (a API falsa ecoa a chave recebida no erro 401).
  const tudo = JSON.stringify([c, d, e, todos(N.app.db, 'select * from eventos'), todos(N.app.db, 'select * from connector_runs')]);
  assert.ok(!tudo.includes('chave-errada-qa') && !tudo.includes(API.chave));
});

test('F 503 repetível: leitura repete com segurança e conclui; G irreversível: negado pela política, nada apagado', async () => {
  API.estado.instavel = 1;
  const f = await conector('Sistema F', ['instavel']);
  assert.ok(f.teste.passou, JSON.stringify(f.teste));
  API.estado.instavel = 1;
  const pl = (await admin.post('/api/integracoes/planos', { necessidades: [{ acao: 'Consultar disponibilidade no Sistema F', categoria: 'read_data', sistema: 'Sistema F', modo: 'read' }] })).dados;
  const r = (await admin.post(`/api/integracoes/planos/${pl.id}/executar`, {})).dados;
  assert.equal(r.passos[0].status, 'SUCCESS', JSON.stringify(r));
  const run = todos(N.app.db, "select tentativas from connector_runs where connector_id = ? and modo = 'real' order by criado_em desc limit 1", f.id)[0];
  assert.equal(run.tentativas, 2);
  const g = await conector('Sistema G', ['apagarCliente']);
  const res = (await admin.post('/api/integracoes/necessidades', { necessidades: [{ acao: 'Apagar o cliente no Sistema G', categoria: 'delete_record', sistema: 'Sistema G', modo: 'write' }] })).dados;
  assert.equal(res.necessidades[0].estado, 'nao_permitido');
  const pg = (await admin.post('/api/integracoes/planos', { necessidades: [{ acao: 'Apagar o cliente no Sistema G', categoria: 'delete_record', sistema: 'Sistema G', modo: 'write' }] })).dados;
  const rg = (await admin.post(`/api/integracoes/planos/${pg.id}/executar`, {})).dados;
  assert.equal(rg.passos[0].status, 'BLOCKED');
  assert.equal(API.estado.apagados, 0, 'nada apagado');
  assert.ok(g.id);
});

test('H: outra pessoa não abre o plano nem a aprovação de quem pediu; sem permissão, nada da administração de integrações', async () => {
  const pl = (await admin.post('/api/integracoes/planos', { necessidades: [{ acao: 'Consultar clientes no ERP Fictício', categoria: 'read_data', sistema: 'ERP Fictício', modo: 'read' }] })).dados;
  await admin.put('/api/admin/config', { integracoes: { ativa: true, pessoas: [], rede_privada_autorizada: true } });
  const lia = await cliente(N.app, N.base).entrar('lia@empresa-exemplo.com.br');
  assert.equal((await lia.get(`/api/integracoes/planos/${pl.id}`)).status, 404);
  assert.equal((await lia.post(`/api/integracoes/planos/${pl.id}/executar`, {})).status, 404);
  const apr = todos(N.app.db, "select id from integration_approvals limit 1")[0].id;
  assert.equal((await lia.get(`/api/integracoes/aprovacoes/${apr}`)).status, 404);
  for (const [m, c] of [['get', '/api/admin/integracoes'], ['post', `/api/admin/integracoes/aprovacoes/${apr}/decidir`]]) assert.equal((await lia[m](c, {})).status, 403, `${m} ${c}`);
  // Lista de pessoas: quem não está nela não vê o recurso (404), mesmo com a empresa ligada.
  await admin.put('/api/admin/config', { integracoes: { ativa: true, pessoas: ['admin@empresa-exemplo.com.br'], rede_privada_autorizada: true } });
  assert.equal((await lia.post('/api/integracoes/necessidades', { descricao: 'Consulte clientes no ERP Fictício.' })).status, 404);
  assert.equal((await lia.get('/api/eu')).dados.integracoes, undefined);
});
