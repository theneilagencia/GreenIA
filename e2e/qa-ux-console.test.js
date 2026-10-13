// Regressão do QA de UX de out/2026, console da plataforma: auditoria em português (A27), três estados da IA (A28),
// confirmações no modal próprio (M2/M3), selos sem quebra (M42), celular sem valores escondidos (M43/M34), termos do
// glossário (M44), conta × acesso (M45), troca de plano com de → para (M46), bloqueios da marca num só lugar (M50),
// títulos e cabeçalhos (B2), saídas do login (B14), números pt-BR (B15), rótulos visíveis (B19) e ícones (B20).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { um } from '../src/db.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, emp, cancelada, planos;
const u = () => new URL(S.base);
// Página do console; qualquer diálogo nativo (confirm/prompt) é falha.
async function pagina({ width = 1280, height = 860, sessao = ops } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  if (sessao) await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = []; p.nativos = [];
  p.on('pageerror', e => p.erros.push(e.message));
  p.on('dialog', d => { p.nativos.push(d.message()); d.dismiss(); });
  return p;
}
const texto = p => p.locator('#principal').innerText();

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  const team = planos.find(x => x.name === 'GreenIA Team');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Console UX', slug: 'console-ux', status: 'ativa', plan_id: team.id, admin_email: 'admin@console-ux.test' })).dados;
  await ops.post(`/api/plataforma/empresas/${emp.id}/usuarios`, { email: 'marina@console-ux.test', name: 'Marina', role_id: 'role_member' });
  cancelada = (await ops.post('/api/plataforma/empresas', { name: 'Encerrada UX', slug: 'encerrada-ux', status: 'ativa', admin_email: 'admin@encerrada-ux.test' })).dados;
  await ops.post(`/api/plataforma/empresas/${cancelada.id}/status`, { status: 'cancelada' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('B14: login do console tem saída para quem não é operador e volta ao site', async () => {
  const p = await pagina({ sessao: null });
  await p.goto(`${S.base}/plataforma`);
  await p.getByRole('heading', { name: 'Acesso do operador da plataforma' }).waitFor();
  assert.equal(await p.getByRole('link', { name: 'Encontre o ambiente da sua empresa' }).getAttribute('href'), '/encontrar');
  assert.equal(await p.getByRole('link', { name: 'Voltar ao site' }).getAttribute('href'), '/');
  assert.deepEqual(p.erros, []);
});

test('A27: auditoria em português, sem código de ação, chave em inglês ou "null"; troca de plano com antes → depois', async () => {
  await ops.post(`/api/plataforma/empresas/${emp.id}/plano`, { plan_id: planos.find(x => x.name === 'GreenIA Starter').id });
  const p = await pagina();
  await p.goto(`${S.base}/plataforma#/auditoria`);
  await p.getByText('Pessoa adicionada').first().waitFor();
  const t = await texto(p);
  assert.doesNotMatch(t, /user\.created|company\.created|platform\.login|custom_domain|\bnull\b|\brole\b|emp_[0-9a-f]/);
  assert.match(t, /Empresa criada/); assert.match(t, /Entrou no console/); assert.match(t, /Console da plataforma/);
  assert.match(t, /Plano: GreenIA Team → GreenIA Starter/);
  assert.match(t, /Perfil: Membro/);
  // Detalhe com mais de dois campos diz que abre e mostra tudo.
  const abrir = p.locator('.aud-abrir').first();
  assert.match(await abrir.innerText(), /^Ver tudo \(\d+\)$/);
  await abrir.click();
  assert.ok(await p.locator('.aud-detalhe[open] .aud-lista li').count() >= 3);
  assert.deepEqual(p.erros, []);
});

test('A28/B15: ambiente mostra o estado real da IA (três estados) e o tamanho em pt-BR', async () => {
  const r = await ops.get('/api/plataforma/ambientes');
  const a = r.dados.ambientes.find(x => x.id === emp.id);
  assert.ok(['ligada', 'simulada', 'desligada'].includes(a.iaEstado));
  assert.equal(a.ia, a.iaEstado === 'ligada', '"ia" só é verdadeiro com modelo real');
  const p = await pagina();
  await p.goto(`${S.base}/plataforma#/ambientes`);
  await p.getByText('Console UX').first().waitFor();
  const t = await texto(p);
  assert.match(t, { ligada: /Ligada/, simulada: /Sem chave \(simulada\)/, desligada: /Desligada/ }[a.iaEstado]);
  assert.doesNotMatch(t, /\d\.\d MB/, 'MB com vírgula');
  assert.deepEqual(p.erros, []);
});

test('M2/M3/M45: remover pessoa e bloquear conta pedem confirmação no modal, com nome e ação de perigo; conta separada do acesso', async () => {
  const p = await pagina();
  await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/usuarios`);
  await p.locator('th', { hasText: 'Acesso nesta empresa' }).waitFor();
  assert.equal(await p.locator('th', { hasText: /^Perfil$/ }).count(), 1);
  // Uma ação por linha: "Alterar" abre perfil, acesso (com os nomes do glossário) e a remoção, de perigo.
  await p.locator('tr', { hasText: 'Marina' }).getByRole('button', { name: 'Alterar o acesso de Marina' }).click();
  const editar = p.getByRole('dialog');
  await editar.locator('select[data-st]').waitFor();
  assert.deepEqual(await editar.locator('select[data-st] option').evaluateAll(os => os.map(o => o.textContent)), ['Convidado', 'Ativo', 'Inativo']);
  const remover = editar.getByRole('button', { name: 'Remover da empresa…' });
  assert.match(await remover.getAttribute('class'), /link-perigo/);
  await remover.click();
  const dialogo = p.getByRole('dialog');
  await dialogo.getByText('Remover Marina da Console UX?').waitFor();
  assert.match(await dialogo.innerText(), /Remover Marina da Console UX\?/);
  assert.match(await dialogo.getByRole('button', { name: 'Remover Marina' }).getAttribute('class'), /btn-perigo/);
  await p.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'detached' });
  assert.ok(um(S.P.db, "select 1 as x from company_users cu join users u on u.id = cu.user_id where u.email = 'marina@console-ux.test'"), 'Esc não remove');
  // Usuários da plataforma: "Conta" (ativa/bloqueada) separada do acesso em cada empresa.
  await p.goto(`${S.base}/plataforma#/usuarios`);
  await p.locator('th', { hasText: /^Conta$/ }).waitFor();
  const linha = p.locator('tr', { hasText: 'marina@console-ux.test' });
  assert.match(await linha.innerText(), /Membro · acesso convidado/);
  await linha.getByRole('button', { name: 'Bloquear' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Bloquear em todas as empresas' }).click();
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(um(S.P.db, "select status from users where email = 'marina@console-ux.test'").status, 'bloqueado');
  assert.deepEqual(p.nativos, [], 'nenhum confirm()/prompt() do navegador');
  assert.deepEqual(p.erros, []);
});

test('M46: alterar plano mostra de → para (créditos e preço) e só aplica depois da confirmação', async () => {
  const p = await pagina();
  await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/resumo`);
  // Troca de plano é ação rara: fica em "Mais ações" do Resumo.
  await p.getByRole('button', { name: 'Mais ações' }).click();
  await p.getByRole('menuitem', { name: 'Alterar plano…' }).click();
  await p.locator('#s-plano').waitFor();
  const antes = um(S.P.db, 'select plan_id from companies where id = ?', emp.id).plan_id;
  const business = planos.find(x => x.name === 'GreenIA Business');
  await p.selectOption('#s-plano', business.id);
  assert.match(await p.locator('#s-plano-info').innerText(), /10\.000 créditos \+ 2\.000 de reserva por mês · US\$ 749,00 por mês/);
  await p.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
  const dialogo = p.getByRole('dialog');
  await dialogo.getByRole('button', { name: 'Trocar para GreenIA Business' }).waitFor();
  assert.match(await dialogo.innerText(), /De GreenIA Starter \(2\.000 créditos.*US\$ 199,00 por mês\) para GreenIA Business \(10\.000 créditos/);
  assert.equal(um(S.P.db, 'select plan_id from companies where id = ?', emp.id).plan_id, antes, 'nada muda antes de confirmar');
  await dialogo.getByRole('button', { name: 'Trocar para GreenIA Business' }).click();
  await dialogo.waitFor({ state: 'detached' });
  assert.equal(um(S.P.db, 'select plan_id from companies where id = ?', emp.id).plan_id, business.id);
  assert.deepEqual(p.nativos, []);
  assert.deepEqual(p.erros, []);
});

test('M2/M3: exclusão definitiva é ação de perigo no modal, liberada só com o identificador', async () => {
  const p = await pagina();
  await p.goto(`${S.base}/plataforma#/empresas/${cancelada.id}/resumo`);
  const botao = p.getByRole('button', { name: 'Excluir definitivamente…' });
  await botao.waitFor();
  assert.match(await botao.getAttribute('class'), /btn-perigo/);
  await botao.click();
  const dialogo = p.getByRole('dialog');
  const confirmar = dialogo.getByRole('button', { name: 'Excluir definitivamente', exact: true });
  assert.equal(await confirmar.isDisabled(), true);
  await dialogo.getByRole('textbox').fill('encerrada-ux');
  assert.equal(await confirmar.isDisabled(), false);
  await dialogo.getByRole('button', { name: 'Voltar sem alterar' }).click();
  assert.ok(um(S.P.db, 'select 1 as x from companies where id = ?', cancelada.id), 'voltar não exclui');
  assert.deepEqual(p.nativos, []);
});

test('M44/M50/B2: termos do glossário, bloqueios da marca só na aba Marca, h2 depois do h1 e colunas nomeadas', async () => {
  const p = await pagina();
  for (const rota of [`empresas/${emp.id}/resumo`, `empresas/${emp.id}/usuarios`, `empresas/${emp.id}/permissoes`, 'usuarios', 'planos', `planos/${planos[0].id}`, 'uso', 'configuracoes', 'encerramentos', 'auditoria']) {
    await p.goto(`${S.base}/plataforma#/${rota}`);
    await p.waitForFunction(() => document.querySelector('.pagina-dentro') && !document.querySelector('.pagina-dentro > .esqueleto, #aba > .esqueleto'));
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => ({
      texto: document.querySelector('#principal').innerText,
      // primeiro título depois do h1 da tela (fora de modais)
      niveis: [...document.querySelectorAll('#principal :is(h1,h2,h3,h4)')].map(h => Number(h.tagName[1])),
      thVazios: [...document.querySelectorAll('#principal th')].filter(th => !th.textContent.trim()).length,
    }));
    for (let i = 1; i < m.niveis.length; i++) assert.ok(m.niveis[i] <= m.niveis[i - 1] + 1, `${rota}: h${m.niveis[i - 1]} → h${m.niveis[i]}`);
    assert.equal(m.thVazios, 0, `${rota}: coluna sem nome`);
    assert.doesNotMatch(m.texto, /Landing Page|\bRoles?\b|\b[Hh]old\b|EXCLUSAO_APLICAR|\(slug\)|curinga|\bclasse\b|quick wins?\b/, rota);
  }
  await p.goto(`${S.base}/plataforma#/encerramentos`);
  await p.getByText('modo simulação', { exact: false }).waitFor();
  // Permissões: os bloqueios da marca aparecem como estado, com o caminho para a aba Marca.
  await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/permissoes`);
  await p.getByRole('link', { name: 'Alterar na aba Marca' }).waitFor();
  assert.equal(await p.locator('[data-l]').count(), 0);
  // B20: Encerramentos e Auditoria com ícones diferentes.
  const icones = await p.evaluate(() => ['encerramentos', 'auditoria'].map(s => document.querySelector(`#lateral a[href="#/${s}"] svg`).innerHTML));
  assert.notEqual(icones[0], icones[1]);
  assert.deepEqual(p.erros, []);
});

test('B19: campos do console com rótulo visível; exemplos ficam no texto de ajuda', async () => {
  const p = await pagina();
  // Adicionar administrador e adicionar pessoa abrem o formulário em modal, pela ação principal do cabeçalho.
  for (const [rota, ids, abrir] of [['configuracoes', ['cf-smtp', 'cf-rem', 'cf-sub']], ['usuarios', ['a-email'], 'Adicionar administrador'], [`empresas/${emp.id}/usuarios`, ['u-email', 'u-nome', 'u-role'], 'Adicionar pessoa']]) {
    await p.goto(`${S.base}/plataforma#/${rota}`);
    if (abrir) await p.getByRole('button', { name: abrir, exact: true }).click();
    await p.locator(`#${ids[0]}`).waitFor();
    for (const id of ids) {
      const c = await p.locator(`#${id}`).evaluate(e => ({ rotulo: [...e.labels].map(l => l.offsetHeight).some(Boolean), placeholder: e.getAttribute('placeholder') || '' }));
      assert.ok(c.rotulo, `${id} sem rótulo visível`);
      assert.equal(c.placeholder, '', `${id} com exemplo no placeholder`);
    }
  }
  assert.match(await p.goto(`${S.base}/plataforma#/configuracoes`).then(() => p.locator('#cf-smtp-ajuda').innerText()), /smtps:\/\/usuario:senha@/);
});

test('M42: selos de status em uma linha na tabela de planos', async () => {
  const p = await pagina({ width: 1366 });
  await p.goto(`${S.base}/plataforma#/planos`);
  await p.getByText('GreenIA Starter').waitFor();
  const alturas = await p.locator('td[data-r="Status"] .selo').evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
  assert.ok(alturas.length && alturas.every(h => h < 26), JSON.stringify(alturas));
});

test('M43/M34: no celular, abas da empresa visíveis, valores técnicos dentro do cartão e valor composto num bloco', async () => {
  const p = await pagina({ width: 390, height: 844 });
  await p.goto(`${S.base}/plataforma#/empresas/${emp.id}/resumo`);
  await p.locator('.subnav a').first().waitFor();
  const abas = await p.locator('.subnav a').evaluateAll(as => as.map(a => a.getBoundingClientRect().right <= innerWidth));
  assert.equal(abas.length, 7); assert.ok(abas.every(Boolean), 'nenhuma aba fora da tela');
  await p.goto(`${S.base}/plataforma#/ambientes`);
  await p.locator('td[data-r="Banco"] code').first().waitFor();
  const m = await p.evaluate(() => {
    const code = document.querySelector('td[data-r="Banco"] code').getBoundingClientRect(), td = document.querySelector('td[data-r="Banco"]').getBoundingClientRect();
    return { dentro: code.right <= td.right + 1, hscroll: document.documentElement.scrollWidth > innerWidth };
  });
  assert.deepEqual(m, { dentro: true, hscroll: false });
  await p.goto(`${S.base}/plataforma#/empresas`);
  const credito = p.locator('td[data-r="Créditos no mês"]').first();
  await credito.waitFor();
  // valor e complemento juntos, à direita (não espalhados como colunas soltas)
  const pos = await credito.evaluate(td => { const r = td.getBoundingClientRect(), s = td.querySelector('.dica').getBoundingClientRect(); return { fim: r.right - s.right }; });
  assert.ok(pos.fim < 20, JSON.stringify(pos));
  assert.deepEqual(p.erros, []);
});
