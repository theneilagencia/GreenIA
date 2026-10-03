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
let N, OR;
before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  N.app.buscarLink = buscarFalso;
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
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
    assert.ok(await p.locator('#entregas').count(), 'entregáveis na mesma etapa');
    const cab = await p.textContent('#fontes-qw');
    assert.match(cab, /Fontes de conhecimento e referência/);
    for (const b of ['Enviar arquivo', 'Adicionar link', 'Usar conhecimento da empresa', 'Adicionar referência']) assert.match(cab, new RegExp(b));
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
    assert.equal(um(N.app.db, "select papel from documentos where quick_win_id = ? and tipo_fonte = 'url'", id).papel, 'REQUIRED_SOURCE');
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
