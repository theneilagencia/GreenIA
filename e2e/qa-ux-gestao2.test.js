// Regressão da segunda rodada de QA de UX, frente Gestão: comparação do Quick Win por nível para quem gerencia (M22),
// prévia do que está em edição na página de apresentação (M36), datas em dd/mm/aaaa nas telas de gestão (M28),
// "Resultados do processo" no lugar de "acompanhamento" nos registros (A13) e largura única do conteúdo (B13).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { exec, todos } from '../src/db.js';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, emp, admin, gestora, area, qw, modelos;
const u = () => new URL(S.base);
// Navegador em inglês: os campos de data não podem seguir o idioma do navegador.
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height }, locale: 'en-US' });
  // A sessão vale no endereço do teste e no endereço público da plataforma (plataforma.teste, mapeado para o mesmo
  // servidor), onde abre a página de apresentação.
  for (const domain of [u().hostname, 'plataforma.teste']) await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const abrir = async (p, rota) => { await p.goto(`${S.base}/app#/${rota}`); await p.waitForSelector('#conteudo > :not(.carregando), .pagina-dentro > :not(#conteudo)'); await p.waitForLoadState('networkidle'); };

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Gestão UX', slug: 'gestao-ux', status: 'ativa', admin_email: 'admin@gestao.test' })).dados;
  admin = S.navegador(); await admin.get('/gestao-ux'); await admin.entrarEmpresa('admin@gestao.test');
  area = (await admin.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
  await admin.post('/api/empresa/usuarios', { email: 'gestora@gestao.test', name: 'Gestora', role_id: 'role_member' });
  const lista = (await admin.get('/api/admin/pessoas')).dados;
  const pid = (lista.pessoas || lista).find(x => x.email === 'gestora@gestao.test').id;
  await admin.put(`/api/admin/pessoas/${pid}`, { areas: [{ id: area, responsavel: true }] });
  gestora = S.navegador(); await gestora.get('/gestao-ux'); await gestora.entrarEmpresa('gestora@gestao.test');
  // Quick Win em uso, com conversas deste mês respondidas por modelos de dois níveis.
  qw = (await admin.post('/api/quick-wins', { modelo_inicial: 1, areas: [area] })).dados;
  await admin.put(`/api/quick-wins/${qw.id}`, { status: 'em_uso' });
  const db = S.P.tenant(emp.id).db;
  modelos = todos(db, 'select id from modelos order by id limit 2').map(m => m.id);
  exec(db, "update modelos set perfil = 'rapido' where id = ?", modelos[0]);
  exec(db, "update modelos set perfil = 'avancado' where id = ?", modelos[1]);
  const em = new Date().toISOString();
  for (const [i, modelo] of [modelos[0], modelos[0], modelos[1]].entries()) {
    const c = Number(exec(db, 'insert into conversas (pessoa_id, quick_win_id, criado_em, atualizado_em, feedback) values (1, ?, ?, ?, ?)', qw.id, em, em, i === 2 ? 'ajustes' : 'serviu').lastInsertRowid);
    exec(db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', 'Pedido', ?)", c, em);
    exec(db, 'insert into uso (em, pessoa_id, conversa_id, quick_win_id, modelo_pedido, modelo_usado, custo, ms) values (?, 1, ?, ?, ?, ?, 0.01, 1500)', em, c, qw.id, modelo, modelo);
  }
  nav = await chromium.launch({ executablePath: CHROMIUM, args: [`--host-resolver-rules=MAP plataforma.teste ${u().host}`] });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('M22: quem gerencia o Quick Win compara por nível; o nome técnico do modelo fica com quem administra', async () => {
  const p = await pagina(gestora);
  await p.goto(`${S.base}/app#/qw/${qw.id}`);
  await p.locator('summary', { hasText: 'Uso e decisão' }).click();
  await p.getByRole('heading', { name: 'Níveis neste mês', level: 3 }).waitFor();
  const tabela = p.locator('table', { has: p.locator('th', { hasText: 'Nível' }) });
  const texto = await tabela.innerText();
  assert.match(texto, /Rápido/);
  assert.match(texto, /Avançado/);
  for (const m of modelos) assert.ok(!texto.includes(m), `sem o identificador técnico ${m}`);
  assert.equal(await tabela.locator('th', { hasText: /^Modelo$/ }).count(), 0);
  assert.deepEqual(p.erros, []);
  // Quem administra vê o modelo e o nível lado a lado.
  const pa = await pagina(admin);
  await pa.goto(`${S.base}/app#/qw/${qw.id}`);
  await pa.locator('summary', { hasText: 'Uso e decisão' }).click();
  await pa.getByRole('heading', { name: 'Modelos neste mês', level: 3 }).waitFor();
  const ta = await pa.locator('table', { has: pa.locator('th', { hasText: 'Nível' }) }).innerText();
  assert.ok(modelos.every(m => ta.includes(m)), ta);
  assert.match(ta, /Rápido/);
  assert.deepEqual(pa.erros, []);
});

test('M36: "Ver prévia" mostra o que está em edição, sem salvar (painel da empresa e console)', async () => {
  for (const [sessao, rota, ehConsole] of [[admin, 'empresa/landing', false], [ops, null, true]]) {
    const p = await pagina(sessao);
    if (ehConsole) { await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/landing`); await p.locator('#form-landing').waitFor(); }
    else await abrir(p, rota);
    const salvo = (await admin.get('/api/empresa/landing')).dados.landing;
    const titulo = `Título só em edição ${ehConsole ? 'console' : 'empresa'}`;
    await p.fill('#ld-titulo', titulo);
    const botao = p.getByRole('button', { name: 'Ver prévia', exact: true });
    assert.equal(await botao.count(), 1);
    assert.equal(await p.getByText('Ver prévia do que está salvo').count(), 0);
    const [aba] = await Promise.all([p.context().waitForEvent('page'), botao.click()]);
    await aba.locator('.pp-previa').waitFor();
    await aba.locator('#ld-titulo', { hasText: titulo }).waitFor();
    assert.match(await aba.locator('.pp-previa').innerText(), /o que está em edição, ainda sem salvar/);
    // Nada foi gravado.
    const depois = (await admin.get('/api/empresa/landing')).dados.landing;
    assert.equal(depois.content.titulo, salvo.content.titulo);
    assert.notEqual(depois.content.titulo, titulo);
    await aba.close();
    // Erro de validação aparece no editor, como ao salvar, e a aba nova fecha.
    await p.locator('details.ld-bloco').first().evaluate(d => { d.open = true; });
    await p.fill('[data-botao-texto="0"]', 'Clique');
    await p.fill('[data-botao-link="0"]', 'javascript:alert(1)');
    const [aba2] = await Promise.all([p.context().waitForEvent('page'), botao.click()]);
    await p.locator('#ld-erro:not(.oculto)').waitFor();
    for (let i = 0; i < 150 && !aba2.isClosed(); i++) await p.waitForTimeout(100);   // sob carga a validação no servidor pode demorar
    assert.ok(aba2.isClosed(), 'a aba da prévia fecha quando o conteúdo não passa na validação');
    assert.deepEqual(p.erros, []);
  }
});

test('M28: De/Até da Atividade em dd/mm/aaaa num navegador em inglês, com o mesmo valor ISO para a API', async () => {
  const p = await pagina(admin);
  await abrir(p, 'atividade');
  // Os filtros ficam atrás de "Filtrar"; o envio é "Aplicar filtros".
  await p.getByRole('button', { name: 'Filtrar' }).click();
  for (const id of ['ev-de', 'ev-ate']) {
    const campo = p.locator(`#${id}`);
    assert.equal(await campo.getAttribute('type'), 'text');
    assert.equal(await campo.getAttribute('placeholder'), 'dd/mm/aaaa');
    assert.equal(await p.locator(`label[for="${id}"]`).count(), 1);
  }
  assert.equal(await p.locator('#conteudo input[type=date]:not(.data-br-nativo)').count(), 0, 'nenhum campo de data nativo à vista');
  assert.equal(await p.locator('#conteudo .data-br-nativo').evaluateAll(es => es.every(e => e.getAttribute('aria-hidden') === 'true' && e.tabIndex === -1 && getComputedStyle(e).opacity === '0')), true);
  assert.equal(await p.getByRole('button', { name: 'Escolher a data inicial no calendário' }).count(), 1);
  // Máscara: as barras entram sozinhas.
  await p.locator('#ev-de').pressSequentially('01102026');
  assert.equal(await p.locator('#ev-de').inputValue(), '01/10/2026');
  // Data inválida não filtra: o campo avisa.
  await p.locator('#ev-ate').pressSequentially('31022026');
  let pedidos = 0;
  p.on('request', r => { if (r.url().includes('/api/admin/eventos')) pedidos++; });
  await p.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  assert.equal(await p.locator('#ev-ate').getAttribute('aria-invalid'), 'true');
  assert.equal(pedidos, 0);
  // Data válida: a API recebe aaaa-mm-dd e a data volta ao campo em dd/mm/aaaa.
  await p.locator('#ev-ate').fill('');
  await p.locator('#ev-ate').pressSequentially('31102026');
  const [pedido] = await Promise.all([p.waitForRequest(r => r.url().includes('/api/admin/eventos?')), p.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()]);
  const q = new URL(pedido.url()).searchParams;
  assert.deepEqual([q.get('de'), q.get('ate')], ['2026-10-01', '2026-10-31']);
  await p.waitForLoadState('networkidle');
  assert.equal(await p.locator('#ev-de').inputValue(), '01/10/2026');
  // Calendário: a escolha volta ao campo em dd/mm/aaaa.
  await p.locator('#ev-de').locator('xpath=..').locator('.data-br-nativo').evaluate(n => { n.value = '2026-09-05'; n.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await p.locator('#ev-de').inputValue(), '05/09/2026');
  assert.deepEqual(p.erros, []);
});

test('M28: datas de antes e depois do Quick Win em dd/mm/aaaa, gravadas em ISO', async () => {
  const p = await pagina(gestora);
  await p.goto(`${S.base}/app#/qw/${qw.id}`);
  await p.locator('summary', { hasText: 'Uso e decisão' }).click();
  await p.getByRole('button', { name: 'Lançar medição' }).click();
  await p.fill('#indicador', 'minutos por pedido');
  await p.fill('#antes-valor', '20');
  await p.locator('#antes-data').fill('');
  await p.locator('#antes-data').pressSequentially('02092026');
  assert.equal(await p.locator('#depois-data').getAttribute('placeholder'), 'dd/mm/aaaa');
  const [resp] = await Promise.all([p.waitForResponse(r => r.url().includes('/medicoes') && r.request().method() === 'POST'), p.getByRole('button', { name: 'Salvar medição' }).click()]);
  assert.equal(resp.status(), 200);
  assert.equal(resp.request().postDataJSON().antes_data, '2026-09-02');
  assert.deepEqual(p.erros, []);
});

test('B13: a mesma largura de conteúdo nas telas de gestão; formulários na largura de leitura', async () => {
  const p = await pagina(admin);
  const medidas = {};
  for (const rota of ['visao-geral', 'uso', 'atividade', 'empresa/marca', 'empresa/landing', 'empresa/url', 'configuracoes']) {
    await abrir(p, rota);
    medidas[rota] = await p.evaluate(() => {
      const d = document.querySelector('.pagina-dentro'), f = document.querySelector('#conteudo :is(.cfg,.ld-editor,.url-passos,#form-marca)');
      return { pagina: parseFloat(getComputedStyle(d).maxWidth), form: f ? parseFloat(getComputedStyle(f).maxWidth) : null };
    });
  }
  const paginas = new Set(Object.values(medidas).map(m => m.pagina)), forms = new Set(Object.values(medidas).map(m => m.form).filter(Boolean));
  assert.equal(paginas.size, 1, JSON.stringify(medidas));
  assert.equal(forms.size, 1, JSON.stringify(medidas));
  assert.ok([...forms][0] < [...paginas][0]);
  // Console: o mesmo token.
  const pc = await pagina(ops);
  await pc.goto(`${S.base}/plataforma#/empresas/${emp.id}/landing`);
  await pc.locator('#form-landing').waitFor();
  const c = await pc.evaluate(() => ({ pagina: parseFloat(getComputedStyle(document.querySelector('.pagina-dentro')).maxWidth), form: parseFloat(getComputedStyle(document.querySelector('.ld-editor')).maxWidth) }));
  assert.deepEqual([c.pagina, c.form], [[...paginas][0], [...forms][0]]);
});

test('A13/M28: registros do processo falam em "resultados do processo" e o prazo vai em dd/mm/aaaa', async () => {
  const N = await subirComNavegador();
  try {
    const a = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
    const q = (await a.post('/api/quick-wins', { nome: 'Ações da reunião', toda_empresa: true, painel_modelo: 'acoes' })).dados;
    exec(N.app.db, "update quick_wins set status='em_uso' where id=?", q.id);
    const em = new Date().toISOString(), c = Number(exec(N.app.db, 'insert into conversas(pessoa_id,quick_win_id,criado_em,atualizado_em) values(?,?,?,?)', a.pessoa.id, q.id, em, em).lastInsertRowid);
    const m = Number(exec(N.app.db, "insert into mensagens(conversa_id,papel,texto,criado_em) values(?,'assistant',?,?)", c, 'Enviar contrato | Ana | sem prazo', em).lastInsertRowid);
    exec(N.app.db, "insert into roteamento(em,pessoa_id,conversa_id,resposta_id,quick_win_id,modo,complexidade,resultado,versao,qualidade) values(?,?,?,?,?,'auto','baixa','respondido','teste',?)", em, a.pessoa.id, c, m, q.id, JSON.stringify({ status: 'aprovado' }));
    const p = await N.entrar('admin@empresa-exemplo.com.br');
    await p.goto(`${N.base}/app#/qw/${q.id}/acompanhamento/resultado/${m}`);
    await p.getByRole('heading', { name: 'Confira antes de registrar' }).waitFor();
    // Fora a citação do link da conversa, nenhum "acompanhamento" como nome da tela.
    const texto = (await p.locator('#principal').innerText()).replace(/“Conferir dados para os resultados”/g, '');
    assert.doesNotMatch(texto, /acompanhamento/i);
    assert.equal(await p.getByRole('link', { name: 'Voltar aos resultados do processo' }).count(), 1);
    const prazo = p.getByLabel('Prazo', { exact: true });
    assert.equal(await prazo.getAttribute('placeholder'), 'dd/mm/aaaa');
    await p.getByLabel('Ação *', { exact: true }).fill('Enviar contrato');
    await prazo.fill('');
    await prazo.pressSequentially('15102026');
    await p.getByLabel('Conferi os dados. Eles podem ser usados nos indicadores dos resultados do processo.').check();
    const parcial = p.getByLabel('Conferi as limitações do resultado parcial e os dados que quero registrar');
    if (await parcial.count()) await parcial.check();
    const [req] = await Promise.all([p.waitForRequest(r => /\/painel\/registros\/\d+$/.test(r.url()) && r.method() === 'POST'), p.getByRole('button', { name: 'Confirmar e incluir no histórico' }).click()]);
    assert.equal(req.postDataJSON().dados[0].prazo, '2026-10-15');
    await p.getByRole('heading', { level: 2, name: 'Ações da reunião' }).waitFor();
    assert.doesNotMatch((await p.locator('#principal').innerText()).replace(/“Conferir dados para os resultados”/g, ''), /acompanhamento/i);
    assert.equal(await p.getByRole('region', { name: 'Indicadores dos resultados do processo' }).count(), 1);
  } finally { await N.fechar(); }
});
