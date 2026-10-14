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

test('M32/A16: menu de admin curto (até nove itens), com ícones únicos e o mesmo texto do título de cada tela', async () => {
  const p = await pagina(admin);
  await abrir(p, 'visao-geral');
  const itens = await p.locator('#lateral .lateral-rolagem a.item-lat').evaluateAll(as => as.map(a => ({ href: a.getAttribute('href'), nome: a.querySelector('.nome').textContent.trim(), icone: a.querySelector('svg')?.outerHTML || '' })));
  assert.ok(itens.length >= 8 && itens.length <= 9, JSON.stringify(itens.map(i => i.nome)));
  assert.equal(new Set(itens.map(i => i.icone)).size, itens.length, 'cada item com um ícone diferente');
  assert.ok(itens.some(i => i.nome === 'Marca e endereço'), 'marca, página e endereço numa tela só');
  assert.equal(await p.locator('#lateral .aviso-contexto').count(), 0, 'sem a caixa de explicação na lateral');
  for (const i of itens) {
    await p.click(`#lateral a.item-lat[href="${i.href}"]`);
    await p.waitForFunction(n => document.querySelector('.cabeca h1')?.textContent.trim() === n, i.nome, { timeout: 8000 });
  }
  // O que saiu do menu continua a um clique: abas da tela do mesmo assunto.
  for (const [rota, titulo, aba] of [['atividade/suporte', 'Atividade', 'Acessos do suporte'], ['empresa/landing', 'Marca e endereço', 'Página de apresentação'], ['empresa/url', 'Marca e endereço', 'URL e domínio']]) {
    await abrir(p, rota);
    assert.equal(await p.locator('.cabeca h1').innerText(), titulo, rota);
    assert.equal(await p.locator('[role=tab][aria-selected=true]').innerText(), aba, rota);
  }
  assert.deepEqual(p.erros, []);
});

test('A16/M37: "Perfil" com os mesmos valores na lista, no detalhe e no convite, e um só Convidar, que abre o painel de convite', async () => {
  const p = await pagina(admin);
  await abrir(p, 'pessoas');
  await p.waitForSelector('.lx-linha');
  const linha = p.locator('.lx-linha', { hasText: 'Marina Souza' });
  assert.match(await linha.innerText(), /Membro/);
  assert.doesNotMatch(await p.locator('#conteudo').innerText(), /\bPapel\b|\bUsuário\b/);
  await linha.click();
  assert.equal(await p.locator('#px-perfil option:checked').innerText(), 'Membro');
  await p.keyboard.press('Escape');
  await p.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await p.getByRole('button', { name: /Convidar/ }).count(), 1, 'um só botão Convidar');
  await p.getByRole('button', { name: 'Convidar pessoa' }).click();
  await p.getByRole('dialog').waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), 'cv-email');
  assert.equal(await p.locator('#cv-role option:checked').innerText(), 'Membro');
  assert.deepEqual(p.erros, []);
});

test('M2/M3: remover pessoa é ação de perigo com confirmação própria, que diz o nome e a consequência', async () => {
  const p = await pagina(admin);
  await abrir(p, 'pessoas');
  await p.locator('.lx-linha', { hasText: 'Marina Souza' }).click();
  const remover = p.getByRole('button', { name: 'Remover Marina Souza' });
  assert.match(await remover.getAttribute('class'), /btn-perigo/);
  await remover.click();
  const dialogo = p.locator('.adm-confirmar [role=dialog]');
  await dialogo.waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), 'adm-conf-titulo', 'foco no título do modal');
  assert.match(await dialogo.innerText(), /Remover Marina Souza da empresa\?/);
  await p.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'detached' });
  await remover.click();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
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

test('A25/M31/B13: Visão geral começa pelo próximo passo da preparação (mesma fonte), com a lista completa recolhida', async () => {
  const p = await pagina(admin);
  await abrir(p, 'visao-geral');
  const prep = (await admin.get('/api/acompanhamento')).dados.passos;
  const prontos = prep.filter(x => x.pronto).length, faltam = prep.filter(x => !x.pronto && !x.opcional);
  const texto = await p.locator('#principal').innerText();
  assert.match(texto, new RegExp(`${prontos} de ${prep.length} prontos?`));
  assert.doesNotMatch(texto, /Disponível para conferir|disponíveis para conferir/);
  // Um próximo passo só, com uma ação; a lista inteira fica recolhida até a pessoa pedir.
  assert.ok(faltam.length > 0, 'a empresa de teste ainda tem passos a fazer');
  assert.equal(await p.locator('.adm-proximo h2').innerText(), faltam[0].titulo);
  assert.equal(await p.getByRole('link', { name: 'Fazer agora' }).count(), 1);
  assert.equal(await p.locator('#prep-passos').isVisible(), false);
  await p.getByRole('button', { name: 'Ver todos os passos' }).click();
  assert.equal(await p.locator('#prep-passos > li').count(), prep.length);
  assert.equal(await p.locator('#prep-passos').getByRole('link', { name: 'Fazer agora' }).count(), prep.filter(x => !x.pronto).length);
  // O endereço antigo de Preparar o ambiente leva à Visão geral com a lista aberta, sem rastro no histórico.
  await p.goto(`${S.base}/app#/preparacao`);
  await p.waitForFunction(() => location.hash === '#/visao-geral?passos=1');
  await p.locator('#prep-passos').waitFor();
  await p.locator('.toast', { hasText: 'Preparar o ambiente agora fica no alto da Visão geral' }).waitFor();
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
  // Uma lista por tipo de dado, com as três regras ("Não enviar" entre elas), cabendo na tela e com 44 px de toque.
  const regra = p.locator('select[name="d-cpf"]');
  await regra.scrollIntoViewIfNeeded();
  const caixa = await regra.boundingBox();
  assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390 && caixa.height >= 44, JSON.stringify(caixa));
  assert.deepEqual(await regra.locator('option').allInnerTexts(), ['Processar normalmente', 'Só com proteção', 'Não enviar']);
  await regra.selectOption('bloquear');
  assert.match(await p.locator('[data-efeito="cpf"]').innerText(), /Não é enviado/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(p.erros, []);
});

test('A20/M34: Perfis no celular: permissões cabem na tela e o selo "Sistema" não quebra', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await abrir(p, 'pessoas/perfis');
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

test('M35/M36/M28: página de apresentação com seções fechadas (só o botão no título), restaurar em "Mais ações" com confirmação e envio em português', async () => {
  const p = await pagina(admin, { width: 390, height: 844 });
  await abrir(p, 'empresa/landing');
  // Cada seção: um título com um único botão (aria-expanded), nada mais interativo nele; todas fechadas ao entrar.
  assert.equal(await p.locator('#form-landing .ld-bloco-cab :is(input, a, [role=switch], select)').count(), 0, 'nada interativo além do botão no título');
  assert.deepEqual([...new Set(await p.locator('.ld-bloco-botao').evaluateAll(bs => bs.map(b => b.getAttribute('aria-expanded'))))], ['false']);
  // Restaurar o modelo: ação de perigo no "Mais ações", com confirmação no modal da tela.
  await p.getByRole('button', { name: 'Mais ações' }).click();
  const restaurar = p.getByRole('menuitem', { name: 'Restaurar o modelo…' });
  assert.match(await restaurar.getAttribute('class'), /perigo/);
  assert.equal(await p.locator('#ld-restaurar').evaluate(b => !!b.closest('[role=menu]')), true);
  await restaurar.click();
  const dialogo = p.getByRole('dialog');
  await dialogo.getByRole('heading', { name: 'Restaurar os textos do modelo?' }).waitFor();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await p.locator('#ld-cab-topo').click();
  assert.equal(await p.locator('label.btn[for="ld-imagem"]').innerText(), 'Escolher arquivo');
  assert.equal(await p.locator('[data-botao-link="0"]').getAttribute('list'), 'ld-destinos');
  // O interruptor de seção fica dentro do bloco aberto, ainda funciona e conta como alteração.
  await p.locator('#ld-cab-como_usar').click();
  assert.equal(await p.locator('#ld-corpo-topo').isVisible(), false, 'uma seção aberta por vez');
  const chave = p.locator('#ld-sec-como_usar');
  const antes = await chave.getAttribute('aria-checked');
  await chave.click();
  assert.notEqual(await chave.getAttribute('aria-checked'), antes);
  assert.equal(await p.locator('#ld-corpo-como_usar').isVisible(), true, 'o interruptor não fecha o bloco');
  assert.equal(await p.locator('[data-bloco="como_usar"] .ld-selo-oculta').isVisible(), true, 'selo "Oculta" no título da seção');
  await p.locator('#ld-sujo', { hasText: 'Alterações não salvas' }).waitFor({ state: 'attached' });
  assert.equal(await p.locator('.adm-topo [data-acao="salvar"]').isEnabled(), true);
  assert.equal(await p.locator('.adm-topo [data-acao="salvar"]').innerText(), 'Salvar e atualizar a página');
  assert.deepEqual(p.erros, []);
});

test('M39/A26/B2: Atividade sem códigos internos, registro aberto no painel, problemas numa aba e hierarquia de títulos nas telas', async () => {
  const p = await pagina(admin);
  await abrir(p, 'atividade');
  // Filtros fechados até a pessoa pedir.
  assert.equal(await p.locator('#filtro-ev').isVisible(), false);
  await p.getByRole('button', { name: 'Filtrar' }).click();
  const tipos = await p.locator('#ev-tipo option').allInnerTexts();
  assert.ok(tipos.every(t => !/\b[a-z_]+\.[a-z_]+\b/.test(t)), JSON.stringify(tipos));
  // Um detalhe por vez, no painel lateral; nenhum "details" por linha.
  assert.equal(await p.locator('#conteudo details').count(), 0);
  await p.locator('#conteudo tr[data-registro]').first().click();
  const painel = p.getByRole('dialog');
  await painel.waitFor();
  assert.match(await painel.innerText(), /Autor:/);
  assert.doesNotMatch(await painel.innerText(), /Ver registro \d+|\{"/);
  await p.keyboard.press('Escape');
  await painel.waitFor({ state: 'detached' });
  await abrir(p, 'atividade/problemas');
  assert.equal(await p.locator('[role=tab][aria-selected=true]').innerText(), 'Problemas reportados');
  for (const rota of ['visao-geral', 'uso', 'modelos', 'modelos/catalogo', 'modelos/roteamento', 'politicas', 'politicas/texto', 'configuracoes', 'pessoas', 'pessoas/areas', 'pessoas/grupos', 'pessoas/perfis', 'atividade/suporte', 'empresa/url', 'pessoas/criacao']) {
    await abrir(p, rota);
    // Com o que está recolhido aberto, a hierarquia continua certa.
    await p.evaluate(() => { for (const b of document.querySelectorAll('#principal .adm-revelar[aria-expanded="false"]')) b.click(); });
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
  // O escopo mais raro (empresa toda) fica recolhido até a pessoa pedir.
  assert.equal(await p.locator('#perm-toda-empresa').isVisible(), false);
  await p.getByRole('button', { name: 'Para a empresa toda' }).click();
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
