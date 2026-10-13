// Diálogos nativos: nenhuma ação das telas abaixo pode abrir confirm()/prompt()/alert() do navegador.
// Cada confirmação aparece no modal da plataforma (título com o objeto, consequência e botão com o nome da ação);
// cancelar não grava nada. Dados fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
import { construir } from '../src/quickwin-construtor.js';
import { apiFalsa, OPENAPI_FALSA } from '../test/integracoes-fake.js';

let N, API, admin, p, area, q, conv, msg;
const nativos = [], erros = [];
const arquivo = (nome, texto) => ({ nome, base64: Buffer.from(texto).toString('base64') });
const modal = nome => p.getByRole('dialog', { name: nome });
const fechado = () => p.locator('.adm-confirmar, .hc-modal-fundo').waitFor({ state: 'detached' });
// Conta as gravações (tudo que não é GET) enquanto a pessoa cancela.
async function semGravar(fn) {
  let n = 0; const ver = r => { if (r.method() !== 'GET' && r.url().includes('/api/')) n++; };
  p.on('request', ver); try { await fn(); await p.waitForTimeout(150); } finally { p.off('request', ver); }
  assert.equal(n, 0, 'cancelar não grava');
}

before(async () => {
  API = await apiFalsa();
  N = await subirComNavegador();
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados;
  // Quick Win publicado (v1 e v2) com uma execução cuja conferência apontou pontos a melhorar.
  const ensino = { nome: 'Newsletter fictícia', descricao: 'Escrever uma newsletter com linguagem natural.', regras: ['nao_inventar'], formato: 'texto' };
  q = (await admin.post('/api/quick-wins', { assistente: ensino, toda_empresa: true })).dados;
  const spec = JSON.stringify(construir(ensino)), em = new Date().toISOString();
  exec(N.app.db, 'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,1,?,?,?)', q.id, spec, q.nome, em);
  const v2 = exec(N.app.db, 'insert into quick_win_versoes(quick_win_id,numero,especificacao,nome,publicada_em) values(?,2,?,?,?)', q.id, spec, q.nome, em).lastInsertRowid;
  exec(N.app.db, "update quick_wins set especificacao=?,versao_publicada=?,status='em_uso' where id=?", spec, v2, q.id);
  conv = (await admin.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  exec(N.app.db, "insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'user','Tema fictício de QA.',?)", conv.id, em);
  msg = Number(exec(N.app.db, "insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant','Texto fictício que precisa melhorar',?)", conv.id, em).lastInsertRowid);
  const qualidade = { status: 'inconsistente', falhas: ['completo'], razoes: [{ grupo: 'completo', motivo: 'Falta plano de ação com responsáveis, prazos e KPIs mensuráveis. (critério: Plano de ação)' }] };
  exec(N.app.db, "insert into roteamento(conversa_id,resposta_id,pessoa_id,qualidade,em,modo,complexidade) values(?,?,?,?,?,'automatico','baixa')", conv.id, msg, admin.pessoa.id, JSON.stringify(qualidade), em);
  p = await N.entrar('admin@empresa-exemplo.com.br');
  p.on('dialog', d => { nativos.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
  p.on('pageerror', e => erros.push(e.message));
});
after(async () => { await N?.fechar(); await API?.fechar(); });

test('conversa: substituir o pedido já escrito pede confirmação no modal (sugestão da conversa vazia e Melhorar resultado)', async () => {
  await p.goto(`${N.base}/app#/nova`); await p.reload(); await p.waitForSelector('#sugestoes');
  await p.fill('#entrada', 'Pedido que eu já escrevi');
  const sugestao = p.locator('#sugestoes').getByRole('button', { name: 'Organizar em tabela', exact: true });
  await semGravar(async () => {
    await sugestao.click();
    const m = modal(/Substituir o pedido/); await m.waitFor();
    assert.match(await m.innerText(), /anexos continuam/);
    assert.equal(await p.locator('#adm-conf-titulo').evaluate(e => e === document.activeElement), true, 'foco no título do modal');
    await m.getByRole('button', { name: 'Manter meu texto', exact: true }).click(); await fechado();
  });
  assert.equal(await p.inputValue('#entrada'), 'Pedido que eu já escrevi');
  await sugestao.click();
  await modal(/Substituir o pedido/).getByRole('button', { name: 'Substituir pedido', exact: true }).click();
  await p.waitForFunction(() => /^Organize as informações abaixo em uma tabela/.test(document.querySelector('#entrada').value));

  await p.goto(`${N.base}/app#/c/${conv.id}`); await p.locator('[data-melhorar-resultado]').waitFor();
  await p.fill('#entrada', 'Outro texto meu');
  await semGravar(async () => {
    await p.locator('[data-melhorar-resultado]').click();
    await modal(/Substituir o pedido/).waitFor(); await p.keyboard.press('Escape'); await fechado();
  });
  assert.equal(await p.inputValue('#entrada'), 'Outro texto meu', 'Esc cancela');
  await p.locator('[data-melhorar-resultado]').click();
  await modal(/Substituir o pedido/).getByRole('button', { name: 'Substituir pedido', exact: true }).click();
  await p.waitForFunction(() => /responsáveis, prazos e indicadores/.test(document.querySelector('#entrada').value));
  assert.equal(um(N.app.db, 'select count(*) as n from mensagens where conversa_id = ?', conv.id).n, 2, 'preparar não envia');
  assert.deepEqual(nativos, []);
});

test('refinar: trocar a orientação escrita pelos pontos da conferência pede confirmação', async () => {
  await p.goto(`${N.base}/app#/qw/${q.id}/refinar/${conv.id}/${msg}`); await p.waitForSelector('#refinamento-texto');
  await p.fill('#refinamento-texto', 'Minha orientação própria');
  const usar = p.getByRole('button', { name: 'Usar estes pontos como orientação', exact: true });
  await semGravar(async () => {
    await usar.click(); const m = modal(/Substituir sua orientação/); await m.waitFor();
    await m.getByRole('button', { name: 'Manter meu texto', exact: true }).click(); await fechado();
  });
  assert.equal(await p.inputValue('#refinamento-texto'), 'Minha orientação própria');
  await usar.click(); await modal(/Substituir sua orientação/).getByRole('button', { name: 'Usar os pontos da conferência', exact: true }).click();
  assert.match(await p.inputValue('#refinamento-texto'), /responsáveis/);
  assert.deepEqual(nativos, []);
});

test('Quick Win: arquivar, restaurar, renomear e excluir execução, voltar versão — tudo no modal, cancelar não grava', async () => {
  const c2 = (await admin.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  exec(N.app.db, "update conversas set titulo = 'Execução fictícia' where id = ?", c2.id);
  const status = async () => (await admin.get(`/api/quick-wins/${q.id}`)).dados.status;
  await p.goto(`${N.base}/app#/qw/${q.id}`); await p.locator(`[data-renomear="${c2.id}"]`).waitFor();
  const menu = async item => { await p.locator('summary[aria-label="Mais ações"]').click(); await p.getByRole('menuitem', { name: item, exact: true }).click(); };

  await semGravar(async () => {
    await menu('Arquivar'); const m = modal(/Arquivar o Quick Win “Newsletter fictícia”/); await m.waitFor();
    assert.equal(await m.getByRole('button', { name: 'Arquivar Quick Win', exact: true }).getAttribute('class'), 'btn btn-perigo');
    await m.getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado();
  });
  assert.equal(await status(), 'em_uso');
  await menu('Arquivar'); await modal(/Arquivar o Quick Win/).getByRole('button', { name: 'Arquivar Quick Win', exact: true }).click();
  await p.locator('[data-acao=restaurar]').waitFor({ state: 'attached' }); assert.equal(await status(), 'descartado');
  await semGravar(async () => { await menu('Restaurar em preparo'); await modal(/Restaurar o Quick Win/).getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado(); });
  assert.equal(await status(), 'descartado');
  await menu('Restaurar em preparo'); await modal(/Restaurar o Quick Win/).getByRole('button', { name: 'Restaurar Quick Win', exact: true }).click();
  await p.locator('[data-acao=arquivar]').waitFor({ state: 'attached' }); assert.equal(await status(), 'em_configuracao');

  // Renomear a execução: o mesmo modal do histórico de conversas, com campo de texto (sem prompt()).
  await p.locator(`[data-renomear="${c2.id}"]`).waitFor();
  await semGravar(async () => {
    await p.click(`[data-renomear="${c2.id}"]`); const m = modal('Renomear conversa'); await m.waitFor();
    await m.getByRole('textbox', { name: 'Nome da conversa' }).fill('Nome que não vai ficar');
    await m.getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado();
  });
  assert.equal(um(N.app.db, 'select titulo from conversas where id = ?', c2.id).titulo, 'Execução fictícia');
  await p.click(`[data-renomear="${c2.id}"]`); await modal('Renomear conversa').getByRole('textbox', { name: 'Nome da conversa' }).fill('Execução renomeada');
  await modal('Renomear conversa').getByRole('button', { name: 'Salvar nome', exact: true }).click(); await fechado();
  await p.locator('.execucoes', { hasText: 'Execução renomeada' }).waitFor();
  await semGravar(async () => {
    await p.click(`[data-apagar="${c2.id}"]`); const m = modal('Excluir esta conversa?'); await m.waitFor();
    assert.match(await m.innerText(), /Execução renomeada/); await m.getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado();
  });
  assert.ok(um(N.app.db, 'select id from conversas where id = ?', c2.id));
  await p.click(`[data-apagar="${c2.id}"]`); await modal('Excluir esta conversa?').getByRole('button', { name: 'Excluir conversa', exact: true }).click(); await fechado();
  await p.waitForFunction(id => !document.querySelector(`[data-apagar="${id}"]`), c2.id);
  assert.equal(um(N.app.db, 'select id from conversas where id = ?', c2.id), undefined);

  // Versões: voltar para a v1.
  const atual = () => um(N.app.db, 'select v.numero from quick_wins q join quick_win_versoes v on v.id = q.versao_publicada where q.id = ?', q.id).numero;
  await p.goto(`${N.base}/app#/qw/${q.id}/versoes`); await p.waitForSelector('[data-restaurar="1"]');
  await semGravar(async () => { await p.click('[data-restaurar="1"]'); await modal(/Voltar “Newsletter fictícia” para a v1/).getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado(); });
  assert.equal(atual(), 2);
  await p.click('[data-restaurar="1"]'); await modal(/para a v1/).getByRole('button', { name: 'Voltar para a v1', exact: true }).click();
  await p.waitForFunction(() => /v1 · Versão atual/.test(document.querySelector('.execucoes')?.textContent || ''));
  assert.equal(atual(), 1);
  assert.deepEqual(nativos, []);
});

test('Conhecimento: suspender, marcar revisado e remover documento no modal; cancelar não grava', async () => {
  const doc = (await admin.post('/api/bases/documentos', { area_id: area.id, titulo: 'Manual fictício de diálogos', pasta: 'Manuais', arquivo: arquivo('manual.txt', 'Conteúdo fictício.') })).dados;
  exec(N.app.db, "update documentos set revisado_em = datetime('now','-200 days') where id = ?", doc.id);
  const linha = () => um(N.app.db, 'select coalesce(g.suspenso, 0) as suspenso, d.revisado_em from documentos d left join conhecimento_governanca g on g.documento_id = d.id where d.id = ?', doc.id);
  await p.goto(`${N.base}/app#/conhecimento`); await p.click('[data-conhecimento-vista="gerir"]'); await p.waitForSelector(`[data-revisar-conhecimento="${doc.id}"]`);

  const revisadoAntes = linha().revisado_em;
  await semGravar(async () => { await p.click(`[data-revisar-conhecimento="${doc.id}"]`); await modal(/Marcar “Manual fictício de diálogos” como revisado/).getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado(); });
  assert.equal(linha().revisado_em, revisadoAntes);
  await p.click(`[data-revisar-conhecimento="${doc.id}"]`); await modal(/como revisado/).getByRole('button', { name: 'Confirmar revisão', exact: true }).click();
  await p.waitForSelector(`[data-documento="${doc.id}"]:has-text("Conteúdo revisado")`);

  await p.click(`[data-editar-conhecimento="${doc.id}"]`); await p.check('#conhecimento-ed-suspenso');
  await semGravar(async () => {
    await p.click('#conhecimento-ed-salvar'); const m = modal(/Suspender “Manual fictício de diálogos”/); await m.waitFor();
    // Esc fecha só a confirmação: o editor continua aberto com a escolha feita.
    await p.keyboard.press('Escape'); await fechado();
  });
  assert.ok(await p.locator('#conhecimento-ed-form').isVisible()); assert.equal(await p.isChecked('#conhecimento-ed-suspenso'), true); assert.equal(linha().suspenso, 0);
  await p.click('#conhecimento-ed-salvar'); await modal(/Suspender/).getByRole('button', { name: 'Suspender documento', exact: true }).click();
  await p.waitForSelector('#conhecimento-ed-form', { state: 'detached' }); assert.equal(linha().suspenso, 1);

  await p.click(`[data-editar-conhecimento="${doc.id}"]`); await p.click('.conhecimento-remover>summary');
  await semGravar(async () => {
    await p.click('#conhecimento-ed-remover'); const m = modal(/Remover “Manual fictício de diálogos” da base/); await m.waitFor();
    assert.equal(await m.getByRole('button', { name: 'Remover documento', exact: true }).getAttribute('class'), 'btn btn-perigo');
    await m.getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado();
  });
  assert.ok(um(N.app.db, 'select id from documentos where id = ?', doc.id)); assert.ok(await p.locator('#conhecimento-ed-form').isVisible());
  await p.click('#conhecimento-ed-remover'); await modal(/Remover/).getByRole('button', { name: 'Remover documento', exact: true }).click();
  await p.waitForSelector('#conhecimento-ed-form', { state: 'detached' });
  assert.equal(um(N.app.db, 'select id from documentos where id = ?', doc.id), undefined);
  assert.deepEqual(nativos, []);
});

test('Integrações: revogar pede confirmação de perigo no modal; cancelar mantém a integração', async () => {
  await admin.put('/api/admin/config', { integracoes: { ativa: true, pessoas: [], rede_privada_autorizada: true } });
  const d = (await admin.post('/api/admin/integracoes/descobrir', { especificacao: JSON.stringify(OPENAPI_FALSA(API.base)) })).dados;
  const c = (await admin.post('/api/admin/integracoes', { nome: 'QA - Diálogos', sistema: 'Diálogos', base_url: d.base_url, auth_type: 'api_key', operacoes: d.operacoes, config: { rede_privada: true, cabecalho_auth: 'X-API-Key' } })).dados;
  const status = async () => (await admin.get(`/api/admin/integracoes/${c.id}`)).dados.status;
  const antes = await status();
  await p.goto(`${N.base}/app#/integracoes/c/${c.id}`); await p.reload(); await p.waitForSelector('[data-acao="revogar"]');
  await semGravar(async () => {
    await p.click('[data-acao="revogar"]'); const m = modal(/Revogar a integração “QA - Diálogos”/); await m.waitFor();
    assert.match(await m.innerText(), /credencial cadastrada é apagada/);
    assert.equal(await m.getByRole('button', { name: 'Revogar integração', exact: true }).getAttribute('class'), 'btn btn-perigo');
    await m.getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado();
  });
  assert.equal(await status(), antes);
  await p.click('[data-acao="revogar"]'); await modal(/Revogar a integração/).getByRole('button', { name: 'Revogar integração', exact: true }).click();
  await p.waitForFunction(() => !document.querySelector('[data-acao="revogar"]'));
  assert.equal(await status(), 'REVOKED');
  assert.deepEqual(nativos, []);
});

test('operador: liberar Capacity Packs confirma no modal com a quantidade no botão; cancelar não libera', async () => {
  const resumo = {
    plano: { creditos: 5000, precoUsd: 100 }, situacao: { fase: 'normal', usados: 500, percentual: 10, naReserva: 0, reserva: 250, pacoteDisponivel: 0, renova: '2026-11-01' },
    financeiro: { receita: 100, margem: 60, custoIa: 20, custoComTaxa: 22, custoInfraUsd: 5, receitaPacotes: 0, margemPct: 60 }, alertas: [],
    status: { ia: true, usaramNoMes: 1, pessoasAtivas: 3, conversasNoMes: 4, ultimoUso: null },
    classes: { rapido: { nome: 'Modelo fictício', id: 'ficticio/rapido', precoEntrada: 0.1, precoSaida: 0.2, homologado: true } }, variacoes: [], pacotes: [],
  };
  const liberacoes = [];
  await p.route('**/api/eu', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ operador: true, csrf: 'csrf-ficticio' }) }));
  await p.route('**/api/operador/leads', r => r.fulfill({ contentType: 'application/json', body: '{"leads":[]}' }));
  await p.route('**/api/operador/instancias', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ instancias: [{ id: 'cli-1', nome: 'Cliente Fictício', ok: true, resumo }], pacotePadrao: { creditos: 2000, precoUsd: 50 } }) }));
  await p.route('**/api/operador/instancias/*/pacotes', r => { liberacoes.push(r.request().postDataJSON()); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  try {
    await p.goto(`${N.base}/operador`); await p.waitForSelector('form[data-pacote="cli-1"]', { state: 'attached' });
    await p.locator('#cliente-cli-1>summary').click(); await p.fill('#q-cli-1', '2');
    await p.click('form[data-pacote="cli-1"] button:not(.data-br-cal)'); const m = modal('Liberar 2 Capacity Packs para Cliente Fictício?'); await m.waitFor();
    assert.match(await m.innerText(), /admins do cliente recebem um email/);
    await m.getByRole('button', { name: 'Cancelar', exact: true }).click(); await fechado();
    assert.deepEqual(liberacoes, []); assert.equal(await p.locator('form[data-pacote="cli-1"] button:not(.data-br-cal)').isEnabled(), true);
    await p.click('form[data-pacote="cli-1"] button:not(.data-br-cal)'); await modal(/Liberar 2 Capacity Packs/).getByRole('button', { name: 'Liberar 2 Capacity Packs', exact: true }).click();
    await p.waitForFunction(() => /Capacity Pack liberado/.test(document.querySelector('.toast')?.textContent || ''));
    assert.equal(liberacoes.length, 1); assert.equal(liberacoes[0].packs, 2);
  } finally { await p.unrouteAll({ behavior: 'ignoreErrors' }); }
  assert.deepEqual(nativos, []);
  assert.deepEqual(erros, []);
});
