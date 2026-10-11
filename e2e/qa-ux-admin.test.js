// Regressão do QA de UX de out/2026 na Administração da empresa: confirmações no modal próprio (M2/M3), aviso de
// alterações não salvas (A23), menu com ícones únicos e rótulo igual ao título (M32/A16), um só termo "Perfil" e um
// só "Convidar" (A16/M37), créditos e mês em pt-BR (A17/M28/B11), Preparar o ambiente com uma só fonte (A25/M31),
// causa exata do alerta de modelo homologado (A18), políticas no celular (A19/M29), perfis no celular (A20/M34),
// página de apresentação (M35/M36), atividade legível (M39/A26) e hierarquia de títulos (B2).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { subirPlataforma } from '../test/ajuda-plataforma.js';
import { lerConfig } from '../src/config.js';
import { subir } from '../test/ajuda.js';

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH, process.env.CHROMIUM].find(p => p && existsSync(p));
let S, nav, ops, emp, admin;
const u = () => new URL(S.base);
async function pagina(sessao, { width = 1280, height = 860 } = {}) {
  const ctx = await nav.newContext({ viewport: { width, height } });
  await ctx.addCookies([...sessao.cookies].map(([name, value]) => ({ name, value, domain: u().hostname, path: '/', httpOnly: true, sameSite: 'Lax' })));
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  // Nenhuma confirmação pode usar o diálogo nativo do navegador.
  p.on('dialog', d => { p.erros.push(`diálogo nativo: ${d.message()}`); d.dismiss(); });
  return p;
}
const abrir = async (p, rota) => { await p.goto(`${S.base}/app#/${rota}`); await p.waitForSelector('#conteudo > :not(.carregando), .pagina-dentro > :not(#conteudo)'); await p.waitForLoadState('networkidle'); };

before(async () => {
  S = await subirPlataforma();
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  emp = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Admin UX', slug: 'empresa-admin-ux', status: 'ativa', admin_email: 'admin@adm.test' })).dados;
  admin = S.navegador(); await admin.get('/empresa-admin-ux'); await admin.entrarEmpresa('admin@adm.test');
  await admin.post('/api/admin/areas', { nome: 'Operações' });
  await admin.post('/api/empresa/usuarios', { email: 'marina@adm.test', name: 'Marina Souza', role_id: 'role_member' });
  nav = await chromium.launch({ executablePath: CHROMIUM });
});
after(async () => { await nav?.close(); await S?.fechar(); });

test('M32/A16: menu de admin com ícones únicos, rótulos curtos e o mesmo texto do título de cada tela', async () => {
  const p = await pagina(admin);
  await abrir(p, 'visao-geral');
  const itens = await p.locator('#lateral .lateral-rolagem a.item-lat').evaluateAll(as => as.map(a => ({ href: a.getAttribute('href'), nome: a.querySelector('.nome').textContent.trim(), icone: a.querySelector('svg')?.outerHTML || '' })));
  assert.ok(itens.length >= 12, JSON.stringify(itens.map(i => i.nome)));
  assert.equal(new Set(itens.map(i => i.icone)).size, itens.length, 'cada item com um ícone diferente');
  assert.ok(itens.some(i => i.nome === 'Acessos do suporte'), 'rótulo curto, sem reticências');
  for (const i of itens) {
    await p.click(`#lateral a.item-lat[href="${i.href}"]`);
    await p.waitForFunction(n => document.querySelector('.cabeca h1')?.textContent.trim() === n, i.nome, { timeout: 8000 });
  }
  assert.deepEqual(p.erros, []);
});

test('A16/M37: "Perfil" com os mesmos valores nas duas telas e um só Convidar, que abre o painel de convite', async () => {
  const p = await pagina(admin);
  await abrir(p, 'pessoas/pessoas');
  await p.waitForSelector('.lx-linha');
  const linha = p.locator('.lx-linha', { hasText: 'Marina Souza' });
  assert.match(await linha.innerText(), /Membro/);
  assert.doesNotMatch(await p.locator('#conteudo').innerText(), /\bPapel\b|\bUsuário\b/);
  assert.equal(await p.locator('button#lx-novo').count(), 0, 'sem um segundo botão Convidar');
  await p.getByRole('link', { name: 'Convidar em Usuários' }).click();
  await p.waitForSelector('#f-convite:not([hidden])');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'cv-email');
  assert.equal(await p.getByRole('button', { name: 'Convidar pessoa' }).getAttribute('aria-expanded'), 'true');
  assert.match(await p.locator('#u-lista').innerText(), /Membro/);
  assert.deepEqual(p.erros, []);
});

test('M2/M3: remover pessoa é ação de perigo com confirmação própria, que diz o nome e a consequência', async () => {
  const p = await pagina(admin);
  await abrir(p, 'empresa/usuarios');
  const marina = (await admin.get('/api/empresa/usuarios')).dados.usuarios.find(x => x.email === 'marina@adm.test');
  const remover = p.locator(`[data-remover="${marina.id}"]`);
  assert.match(await remover.getAttribute('class'), /btn-perigo/);
  await remover.click();
  const dialogo = p.getByRole('dialog');
  await dialogo.waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), 'adm-conf-titulo', 'foco no título do modal');
  assert.match(await dialogo.innerText(), /Remover Marina Souza da empresa\?/);
  await p.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'detached' });
  await remover.click();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  assert.ok((await admin.get('/api/empresa/usuarios')).dados.usuarios.some(x => x.email === 'marina@adm.test'), 'cancelar não remove');
  assert.deepEqual(p.erros, []);
});

test('A23: formulário alterado avisa antes de sair; continuar editando mantém a tela e o que foi digitado', async () => {
  const p = await pagina(admin);
  await abrir(p, 'configuracoes');
  await p.locator('details.cfg-caixa', { has: p.locator('#c-dom-novo') }).locator('summary').click();
  await p.fill('#c-dom-novo', 'adm.test'); await p.click('#c-dom-add');
  await p.locator('.cfg-salvar', { hasText: 'Alterações não salvas' }).waitFor();
  await p.click('#lateral a.item-lat[href="#/uso"]');
  const dialogo = p.getByRole('dialog');
  await dialogo.waitFor();
  assert.match(await dialogo.innerText(), /Sair sem salvar\?/);
  await dialogo.getByRole('button', { name: 'Continuar editando' }).click();
  assert.equal(await p.evaluate(() => location.hash), '#/configuracoes');
  assert.match(await p.locator('#c-chips').innerText(), /adm\.test/);
  await p.click('#lateral a.item-lat[href="#/uso"]');
  await p.getByRole('dialog').getByRole('button', { name: 'Sair sem salvar' }).click();
  await p.waitForFunction(() => document.querySelector('.cabeca h1')?.textContent.trim() === 'Uso e créditos');
  assert.deepEqual(p.erros, []);
});

test('A17/M28/B11: Uso com mês em português, planilha e "—" no tempo sem dados', async () => {
  const p = await pagina(admin);
  await abrir(p, 'uso');
  const mes = await p.locator('#mes option:checked').innerText();
  assert.match(mes, /^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de \d{4}$/);
  const texto = await p.locator('#conteudo').innerText();
  assert.doesNotMatch(texto, /January|February|March|April|May|June|July|August|September|October|November|December|CSV/);
  assert.match(texto, /Tempo médio de resposta\s*—\s*ainda sem dados suficientes/);
  assert.deepEqual(p.erros, []);
});

test('A25/M31/B13: Visão geral resume a preparação (mesma fonte) com "prontos" e uma ação por item que falta', async () => {
  const p = await pagina(admin);
  await abrir(p, 'visao-geral');
  const prep = (await admin.get('/api/acompanhamento')).dados.passos;
  const prontos = prep.filter(x => x.pronto).length;
  const texto = await p.locator('#principal').innerText();
  assert.match(texto, new RegExp(`${prontos} de ${prep.length} prontos?`));
  assert.doesNotMatch(texto, /Disponível para conferir|disponíveis para conferir/);
  assert.equal(await p.getByRole('link', { name: 'Fazer agora' }).count(), prep.filter(x => !x.pronto && !x.opcional).length);
  await abrir(p, 'preparacao');
  assert.match(await p.locator('.acomp-resumo').innerText(), new RegExp(`${prontos} de ${prep.length} prontos?`));
  assert.doesNotMatch(await p.locator('#principal').innerText(), /Não é certificação|Disponível para conferir/);
  assert.deepEqual(p.erros, []);
});

test('A18: alerta de homologado explica a causa exata quando o modelo não está liberado para todos', async () => {
  // Instalação única: a empresa aprova o modelo para dados sigilosos sem depender da plataforma.
  const L = await subir();
  try {
    const a = await L.cliente().entrar('admin@exemplo.com.br');
    const id = encodeURIComponent('mistralai/mistral-small-2603');
    await a.put(`/api/admin/modelos/${id}`, { liberado: true, perfil: 'rapido' });
    await a.post(`/api/admin/modelos/${id}/homologar`, { fornecedor: 'mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no contrato.' });
    const atencao = async () => (await a.get('/api/admin/visao-geral')).dados.atencao.map(x => x.texto).join('\n');
    assert.doesNotMatch(await atencao(), /Nenhum modelo homologado|não está liberado para todas/, 'no nível Rápido vale para todos');
    // O mesmo modelo no nível Avançado, que não é de todos (estado a que a empresa chega, por exemplo, ao restringir
    // o nível depois): a regra não muda, só a explicação fica exata.
    L.app.db.prepare("update modelos set perfil = 'avancado' where id = ?").run('mistralai/mistral-small-2603');
    assert.equal(lerConfig(L.app.db).acessoPerfis.avancado?.todos ?? false, false);
    const texto = await atencao();
    assert.match(texto, /Há 1 modelo homologado \(aprovado para dados sigilosos\), mas ele não está liberado para todas as pessoas/);
    assert.doesNotMatch(texto, /Nenhum modelo homologado/);
  } finally { await L.fechar(); }
});

test('A19/M29/M28: Políticas com Ligado/Desligado, efeito ao vivo e "Não enviar" visível no celular', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await abrir(p, 'politicas');
  assert.match(await p.locator('#sigilo-politica .estado').innerText(), /^(Ligado|Desligado)$/);
  assert.doesNotMatch(await p.locator('#conteudo').innerText(), /\bON\b|\bOFF\b|os proteções|permite o uso de IA/);
  const naoEnviar = p.locator('label', { has: p.locator('input[name="d-cpf"][value="bloquear"]') });
  await naoEnviar.scrollIntoViewIfNeeded();
  const caixa = await naoEnviar.boundingBox();
  assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390 && caixa.height >= 44, JSON.stringify(caixa));
  await naoEnviar.click();
  assert.match(await p.locator('[data-efeito="cpf"]').innerText(), /Não é enviado/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(p.erros, []);
});

test('A20/M34: Perfis no celular: permissões cabem na tela e o selo "Sistema" não quebra', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await abrir(p, 'empresa/roles');
  const m = await p.evaluate(() => {
    const fora = [...document.querySelectorAll('#conteudo .chip')].filter(c => c.getBoundingClientRect().right > innerWidth + 1).length;
    const selo = document.querySelector('#conteudo .selo'); const r = selo.getBoundingClientRect();
    return { fora, alturaSelo: r.height, hs: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(m.fora, 0, JSON.stringify(m));
  assert.ok(m.alturaSelo < 30, JSON.stringify(m));
  assert.equal(m.hs, false);
  assert.equal(await p.locator('th:empty').count(), 0, 'cabeçalhos de ação com nome');
});

test('M35/M36/M28: página de apresentação sem interruptor no título, restaurar em zona de perigo e envio em português', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await abrir(p, 'empresa/landing');
  assert.equal(await p.locator('#form-landing summary :is(button, input, a, [role=switch])').count(), 0, 'nada interativo dentro do título');
  const topo = await p.locator('#form-landing summary').first().evaluate(s => { const b = s.querySelector('b').getBoundingClientRect(), d = s.querySelector('.dica').getBoundingClientRect(); return { fimTitulo: b.right, inicioDica: d.left, mesmaLinha: Math.abs(b.top - d.top) < 6 }; });
  assert.ok(!topo.mesmaLinha || topo.inicioDica - topo.fimTitulo >= 4, `título e explicação separados: ${JSON.stringify(topo)}`);
  assert.match(await p.locator('#ld-restaurar').getAttribute('class'), /btn-perigo/);
  assert.equal(await p.locator('#ld-restaurar').evaluate(b => !!b.closest('.ld-perigo')), true);
  assert.equal(await p.locator('label.btn[for="ld-imagem"]').innerText(), 'Escolher arquivo');
  assert.equal(await p.locator('[data-botao-link="0"]').getAttribute('list'), 'ld-destinos');
  // O interruptor de seção ainda funciona e conta como alteração.
  const chave = p.locator('#ld-sec-como_usar');
  const antes = await chave.getAttribute('aria-checked');
  await chave.click();
  assert.notEqual(await chave.getAttribute('aria-checked'), antes);
  assert.equal(await p.locator('details[data-secao="como_usar"]').evaluate(d => d.open), false, 'o interruptor não abre o bloco');
  await p.locator('.adm-sujo', { hasText: 'Alterações não salvas' }).waitFor();
  assert.deepEqual(p.erros, []);
});

test('M39/A26/B2: Atividade sem códigos internos, com título dos problemas e hierarquia de títulos nas telas', async () => {
  const p = await pagina(admin);
  await abrir(p, 'atividade');
  await p.getByRole('heading', { name: 'Problemas reportados', level: 2 }).waitFor();
  const tipos = await p.locator('#ev-tipo option').allInnerTexts();
  assert.ok(tipos.every(t => !/\b[a-z_]+\.[a-z_]+\b/.test(t)), JSON.stringify(tipos));
  const resumo = await p.locator('.auditoria-detalhe summary').allInnerTexts();
  assert.ok(resumo.every(t => !/Ver registro \d+/.test(t)), JSON.stringify(resumo.slice(0, 3)));
  for (const rota of ['visao-geral', 'uso', 'modelos', 'modelos/roteamento', 'politicas', 'politicas/texto', 'configuracoes', 'empresa/usuarios', 'empresa/acessos', 'empresa/url', 'pessoas', 'pessoas/criacao']) {
    await abrir(p, rota);
    const pulo = await p.evaluate(() => {
      const hs = [...document.querySelectorAll('#principal :is(h1,h2,h3,h4)')].filter(h => h.getClientRects().length && !h.closest('[role=dialog]'));
      for (let i = 1; i < hs.length; i++) if (Number(hs[i].tagName[1]) - Number(hs[i - 1].tagName[1]) > 1) return `${hs[i - 1].tagName} "${hs[i - 1].textContent.trim().slice(0, 40)}" → ${hs[i].tagName} "${hs[i].textContent.trim().slice(0, 40)}"`;
      return '';
    });
    assert.equal(pulo, '', rota);
    assert.equal(await p.locator('#principal th:empty').count(), 0, `${rota}: cabeçalho vazio`);
  }
  assert.deepEqual(p.erros, []);
});

test('M40/M38/B10: texto da política com prévia ao lado; Quem cria Quick Wins com escopos e busca; atalhos sob "?"', async () => {
  const p = await pagina(admin);
  await abrir(p, 'politicas/texto');
  await p.fill('#pol-texto', '## Regra nova\n- item um');
  await p.locator('#pol-previa h2, #pol-previa h3', { hasText: 'Regra nova' }).first().waitFor();
  await p.click('#form-pol button.btn-verde');
  await p.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  // O texto ficou alterado: sair pede confirmação no modal da tela.
  await p.goto(`${S.base}/app#/pessoas/criacao`);
  await p.getByRole('dialog').getByRole('button', { name: 'Sair sem salvar' }).click();
  await p.waitForSelector('#perm-qw');
  for (const t of ['Nas áreas de cada pessoa', 'Para a empresa toda']) await p.getByRole('heading', { name: t }).waitFor();
  await p.fill('#busca-areas', 'marina');
  const visiveis = await p.locator('#perm-qw input[name="perm-pessoas"]').evaluateAll(cs => cs.filter(c => c.getClientRects().length).map(c => c.closest('label').textContent.trim()));
  assert.ok(visiveis.length >= 1 && visiveis.every(t => /marina/i.test(t)), JSON.stringify(visiveis));
  assert.equal(await p.locator('.adm-sujo', { hasText: 'Alterações não salvas' }).count(), 0, 'buscar não é alterar');
  await abrir(p, 'pessoas');
  assert.equal(await p.locator('.lx-atalhos').isVisible(), false, 'atalhos recolhidos');
  assert.equal(await p.locator('[role=listitem]').count(), 0, 'linhas continuam botões, sem papel de item de lista');
  assert.deepEqual(p.erros, []);
});
