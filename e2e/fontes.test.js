// E2E das fontes do Quick Win pelo navegador: na criação, a seção "Fontes" fica separada dos entregáveis; link
// (lido pela rede segura, aqui com uma página falsa), arquivo e papel de cada fonte; na conversa, "Adicionar link"
// e o papel de cada anexo; em 390 px, sem rolagem horizontal. Nada de sistema ou site real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { buscaSegura } from '../src/integracoes/rede.js';
import { um } from '../src/db.js';

const PEDIDO = 'Resuma pedidos de viagem conforme a política e prepare a resposta ao solicitante.';
const PLANO = { resumo: 'Resumo do pedido e resposta ao solicitante.', entradas: [{ tipo: 'documento', rotulo: 'Pedido de viagem', obrigatoria: true }],
  etapas: [{ texto: 'Ler o pedido' }, { texto: 'Conferir com a política' }],
  entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo do pedido' }, { id: 'e2', tipo: 'texto', rotulo: 'Resposta ao solicitante' }], ferramentas: [] };
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
function responder(b) {
  const sis = texto(b.messages[0].content);
  if (sis.includes('PLANO DE TRABALHO')) return JSON.stringify(PLANO);
  if (sis.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (sis.includes('Você organiza o pedido')) return '{"colunas":[]}';
  if (sis.includes('material FICTÍCIO')) return 'PEDIDO DE VIAGEM (fictício): São Paulo, 2 noites.';
  return '## Resumo do pedido\nViagem a São Paulo, 2 noites; hospedagem até R$ 410 (Fonte: Política de Viagens QA).\n\n## Resposta ao solicitante\nSeu pedido está dentro da política.\n\n## Informações não encontradas\nNenhuma';
}
const buscarFalso = async o => {
  const u = new URL(o.url);
  if (!u.hostname.endsWith('.exemplo.test')) return buscaSegura(o);
  return { status: 200, cabecalhos: { 'content-type': 'text/html' }, corpo: Buffer.from('<html><head><title>Política de Viagens QA</title></head><body><h1>Política</h1><p>Hospedagem até R$ 410 por noite.</p></body></html>') };
};
let N, OR, adminQA;
before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  N.app.buscarLink = buscarFalso;
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  adminQA = admin;
  const area = (await admin.post('/api/admin/areas', { nome: 'Viagens' })).dados.id;
  for (const e of ['lia', 'w390']) await admin.post('/api/admin/pessoas', { email: `${e}@empresa-exemplo.com.br`, nome: e, areas: [{ id: area, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N.fechar(); await OR.fechar(); });

const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function ateResultado(p) {
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', PEDIDO);
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('#fontes-qw .fontes');
}

for (const [largura, email] of [[1280, 'lia'], [390, 'w390']]) {
  test(`criação (${largura}px): Fontes separadas dos entregáveis; link lido, arquivo enviado, papel trocado; conversa com link e papel do anexo`, async () => {
    const ctx = await N.navegador.newContext({ viewport: { width: largura, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p = await N.entrar(`${email}@empresa-exemplo.com.br`, await ctx.newPage());
    const erros = [];
    p.on('pageerror', e => erros.push(e.message));
    await ateResultado(p);
    await p.waitForFunction(() => !document.querySelector('#fontes-qw')?.textContent.includes('Carregando…'));
    assert.ok(await p.locator('#entregas').count(), 'entregáveis na mesma etapa');
    const cab = await p.textContent('#fontes-qw');
    assert.match(cab, /Materiais que este Quick Win usa/);
    for (const b of ['Enviar arquivo', 'Adicionar link', 'Conhecimento da empresa', 'Adicionar exemplo de estilo']) assert.match(cab, new RegExp(b));
    // Link: lido e listado como pronto (o rascunho é criado na primeira fonte).
    await p.click('[data-fonte-acao="link"]');
    await p.fill('#fonte-url', 'https://politicas.exemplo.test/viagens?token=abc123');
    await p.click('[data-fonte-acao="ler-link"]');
    await p.waitForSelector('.fonte-item:has-text("Política de Viagens QA")');
    assert.match(await p.textContent('.fonte-item'), /Pronta/);
    assert.doesNotMatch(await p.textContent('#fontes-qw'), /abc123/);
    // Arquivo como referência.
    await p.setInputFiles('[data-fonte-arquivo]', { name: 'modelo.txt', mimeType: 'text/plain', buffer: Buffer.from('Relatório modelo fictício: estrutura em três partes.') });
    await p.click('[data-fonte-acao="referencia"]').catch(() => {});
    await p.waitForSelector('.fonte-item:has-text("modelo")');
    // Papel: base de conhecimento → fonte obrigatória.
    await p.selectOption('.fonte-item:has-text("Política de Viagens QA") select', 'REQUIRED_SOURCE');
    await p.waitForFunction(() => [...document.querySelectorAll('.fonte-item')].some(li => li.textContent.includes('Política de Viagens QA') && li.querySelector('select').value === 'REQUIRED_SOURCE'));
    const id = Number(/#\/qw\/(\d+)/.exec(p.url())?.[1]);
    assert.ok(id, 'rascunho criado');
    // O select muda na hora; o papel é gravado pela API logo depois (sob carga, alguns ms a mais).
    const papel = () => um(N.app.db, "select papel from documentos where quick_win_id = ? and tipo_fonte = 'url'", id).papel;
    for (let i = 0; i < 50 && papel() !== 'REQUIRED_SOURCE'; i++) await p.waitForTimeout(100);
    assert.equal(papel(), 'REQUIRED_SOURCE');
    assert.ok(await semRolagem(p), 'criação sem rolagem horizontal');
    await p.screenshot({ path: `capturas/tmp/fontes-criacao-${largura}.png`, fullPage: true });
    // Conversa: "Adicionar link" e o papel de cada anexo.
    await p.goto(`${N.base}/app#/nova`);
    await p.waitForSelector('#anexar-link');
    await p.click('#anexar-link');
    await p.fill('#link-url', 'https://politicas.exemplo.test/viagens');
    await p.click('#link-ok');
    await p.waitForSelector('#anexos .anexo-chip select');
    assert.deepEqual(await p.$$eval('#anexos .anexo-chip select option', o => o.map(x => x.textContent)), ['Material', 'Só referência', 'Fonte principal']);
    assert.ok(await semRolagem(p), 'conversa sem rolagem horizontal');
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test('aviso de configuração com link: "Liberar a pesquisa na internet" leva a Políticas com o campo em destaque', async () => {
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.get('/api/admin/areas')).dados;
  const areaId = (Array.isArray(area) ? area : area.areas)[0].id;
  const q = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Pesquise na internet as tendências do setor de viagens corporativas',
    operacao: { canais: [], entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Tendências' }], ferramentas: ['pesquisa_web'], origem: 'pessoa' } }, areas: [areaId] })).dados;
  const ctx = await N.navegador.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await N.entrar('admin@empresa-exemplo.com.br', await ctx.newPage());
  assert.equal((await admin.post(`/api/quick-wins/${q.id}/publicar`, {})).status, 200);
  await p.goto(`${N.base}/app#/qw/${q.id}/usar`);
  await p.waitForSelector('#entrada-qw');
  await p.fill('#entrada-qw', 'Faça o levantamento.');
  await p.click('#executar-btn');
  const link = p.locator('.qc-acoes a:has-text("Liberar a pesquisa na internet")');
  await link.waitFor({ timeout: 30000 });
  assert.equal(await link.getAttribute('href'), '#/politicas?foco=pesquisa-web');
  await link.click();
  await p.waitForSelector('.campo-destacado #pesquisa-web, #pesquisa-web');
  await p.waitForFunction(() => document.activeElement?.id === 'pesquisa-web' && !!document.querySelector('.campo-destacado'));
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'capturas/tmp/aviso-link-politicas.png' });
  await ctx.close();
});


test('proteção reforçada: usuário comum recebe causa, impacto e relato existente; servidor impede alteração da área', async () => {
  const admin = adminQA;
  const area = (await admin.post('/api/admin/areas', { nome: 'Proteção QA', sigilosa: true })).dados;
  const pessoa = (await admin.get('/api/admin/pessoas')).dados.pessoas.find(p => p.email === 'lia@empresa-exemplo.com.br');
  await admin.post(`/api/admin/areas/${area.id}/pessoas`, { pessoas: [pessoa.id], adminBase: false });
  salvarConfig(N.app.db, { pesquisaWeb: { ativa: true } });
  const q = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Pesquise na internet tendências de viagens', operacao: { canais: [], entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Tendências' }], ferramentas: ['pesquisa_web'], origem: 'pessoa' } }, areas: [area.id] })).dados;
  assert.equal((await admin.post(`/api/quick-wins/${q.id}/publicar`, {})).status, 200);
  const comum = await cliente(N.app, N.base).entrar('lia@empresa-exemplo.com.br');
  assert.equal((await comum.put(`/api/admin/areas/${area.id}`, { sigilosa: false })).status, 403);
  const ctx = await N.navegador.newContext({ viewport: { width: 390, height: 844 } });
  const p = await N.entrar('lia@empresa-exemplo.com.br', await ctx.newPage());
  await p.goto(`${N.base}/app#/qw/${q.id}/usar`);
  await p.waitForSelector('#entrada-qw');
  await p.fill('#entrada-qw', 'Prepare sugestões para a próxima reunião.');
  await p.click('#executar-btn');
  const solicitar = p.getByRole('button', { name: 'Solicitar revisão ao administrador', exact: true });
  await solicitar.waitFor({ timeout: 30000 });
  assert.match(await p.locator('.qc-limitacao').innerText(),/pesquisa na internet foi bloqueada pela proteção da área.*temas atuais não foram confirmados.*Você não pode alterar/s);
  assert.equal(await p.getByRole('link', { name: 'Revisar a proteção da área →', exact: true }).count(),0);
  assert.ok(await semRolagem(p));
  await solicitar.click();
  await p.getByRole('dialog').waitFor();
  assert.match(await p.inputValue('#descricao-problema'),/pesquisa_area_reforcada/);
  await p.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.ok(new URL(p.url()).hash.startsWith('#/c/'),'permanece no trabalho');
  assert.equal(await p.locator('[data-campo="sigilosa"]').count(), 0);
  assert.equal((await admin.get(`/api/admin/areas/${area.id}`)).dados.area.sigilosa, true);
  await ctx.close();
});
