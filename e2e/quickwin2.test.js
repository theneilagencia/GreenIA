// E2E Quick Wins 2.0 no navegador: uma pessoa leiga (responsável da área, sem ser admin) cria em 5 etapas,
// testa com o exemplo automático, publica; um colega executa pelo cartão, no celular. Nada técnico aparece.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';

const BOM = '| Item | Documento 1 | Documento 2 | Diferença | Relevância |\n|---|---|---|---|---|\n| Rolamento 6205 | 40 unidades | 38 unidades | 2 unidades | Alta |\n\n## Pontos de atenção\n- Faltam 2 rolamentos.\n\n## Informações não encontradas\n- Prazo de entrega do documento 2: não informado.';
const QC_OK = '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"formato","ok":true}]}';
const TECNICO = /prompt|temperatura|tokens?\b|json|openrouter|mistral|gpt|claude|system|provedor|fornecedor de ia|ROUTING_|classe:/i;
let N, OR;

before(async () => {
  OR = await openRouterFalso({ responder: b => (JSON.stringify(b.messages[0].content).includes('conferente de qualidade') ? QC_OK : BOM) });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado', areas: [{ id: area, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'rui@empresa-exemplo.com.br', nome: 'Rui Alves', areas: [{ id: area }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
});
after(async () => { await N.fechar(); await OR.fechar(); });

test('pessoa leiga cria, testa, publica; colega executa no celular', async () => {
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await N.entrar('lia@empresa-exemplo.com.br', p);
  let cliques = 0;
  const clicar = async sel => { cliques++; await p.click(sel); };

  // Etapa 1: descrição livre (a sugestão clicável também serve).
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#descricao');
  assert.match(await p.textContent('#progresso'), /Etapa 1 de 5/);
  assert.equal(await p.locator('.chip').count(), 7);
  await p.fill('#descricao', 'Compare pedidos de compra com notas de entrega');
  await clicar('[data-avancar]');
  // Etapa 2: nada obrigatório.
  await p.waitForSelector('[data-pular]');
  assert.match(await p.textContent('#progresso'), /Etapa 2 de 5/);
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'titulo-etapa', 'o foco vai para a nova pergunta');
  await clicar('[data-pular]');
  // Etapa 3: poucas regras, "não inventar" travada.
  await p.waitForSelector('input[name=regra]');
  const travada = p.locator('input[name=regra][value=nao_inventar]');
  assert.ok(await travada.isChecked() && await travada.isDisabled());
  assert.ok(await p.locator('input[name=regra]').count() <= 6);
  await clicar('[data-avancar]');
  // Etapa 4: formato sugerido com motivo, aceito num clique.
  await p.waitForSelector('#motivo-formato');
  assert.match(await p.textContent('#motivo-formato'), /Tabela/);
  assert.equal(await p.textContent('[data-avancar]'), 'Usar o sugerido');
  await clicar('[data-avancar]');
  // Etapa 5: teste com exemplo automático, com a conferência completa.
  await p.waitForSelector('input[name=teste][value=auto]:checked');
  const textoCriacao = await p.textContent('#principal');
  assert.doesNotMatch(textoCriacao, TECNICO, 'nada técnico na criação');
  await clicar('[data-avancar]');
  await p.waitForSelector('.qualidade');
  const resumo = await p.textContent('.qualidade');
  for (const t of ['Teste concluído ✓', 'Regras respeitadas ✓', 'Resultado completo ✓', 'Formato correto ✓', 'Nenhuma informação inventada detectada ✓']) assert.ok(resumo.includes(t), t);
  assert.equal(await p.locator('#modelo').count(), 0, 'sem seletor de modelo');
  await p.waitForSelector('[data-csv]');   // o resultado é o trabalho (tabela), não um texto técnico
  // Publicar: nome automático usado sem precisar mexer.
  await clicar('.aviso-teste a[href$="/publicar"]');
  await p.waitForSelector('#publicar');
  assert.equal((await p.textContent('#nome-atual')).trim(), 'Comparar pedidos de compra com notas de entrega');
  assert.match(await p.textContent('.publicar'), /Teste concluído ✓.*Formato correto ✓/s);
  assert.match(await p.textContent('.publicar'), /Não inventar informações/);
  await clicar('#publicar');
  await p.waitForSelector('.executar');
  assert.match(await p.textContent('#principal'), /Versão atual: v1/);
  assert.ok(cliques <= 8, `criação, teste e publicação em ${cliques} cliques`);

  // Colega, no celular: cartão → entrada → Executar → resultado.
  const cel = await N.navegador.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  await cel.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const q = await N.entrar('rui@empresa-exemplo.com.br', await cel.newPage());
  q.on('pageerror', e => erros.push(e.message));
  await q.goto(`${N.base}/app#/quick-wins`);
  await q.click('a.lista-item:has-text("Comparar pedidos de compra")');
  await q.waitForSelector('#entrada-qw');
  assert.equal(await q.locator('.gestao-qw').count(), 0, 'quem só usa não vê gestão');
  await q.fill('#entrada-qw', 'Pedido 882: 40 rolamentos 6205. Nota de entrega 45.117: 38 rolamentos 6205.');
  await q.click('#executar-btn');
  await q.waitForSelector('.qualidade');
  assert.match(await q.textContent('.qualidade'), /Resultado conferido ✓/);
  assert.doesNotMatch(await q.textContent('#principal'), TECNICO, 'nada técnico no resultado');
  assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal no celular');
  // Teclado: o botão Executar e o campo têm rótulo e são alcançáveis.
  await q.goto(`${N.base}/app#/quick-wins`);
  await q.click('a.lista-item:has-text("Comparar pedidos de compra")');
  await q.waitForSelector('#entrada-qw');
  assert.equal(await q.getAttribute('label[for=entrada-qw]', 'for'), 'entrada-qw');
  await q.focus('#entrada-qw');
  await q.keyboard.press('Tab'); await q.keyboard.press('Tab');
  assert.equal(await q.evaluate(() => document.activeElement?.id), 'executar-btn');
  await cel.close();
  assert.deepEqual(erros, []);
});

test('conferência parcial não aparece como aprovada; mensagem seguinte é conversa normal', async () => {
  // A conferência pela IA não responde no formato: estado parcial.
  OR.responder = b => (JSON.stringify(b.messages[0].content).includes('conferente de qualidade') ? 'não consegui conferir' : BOM);
  const cel = await N.navegador.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  await cel.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const q = await N.entrar('rui@empresa-exemplo.com.br', await cel.newPage());
  const erros = [];
  q.on('pageerror', e => erros.push(e.message));
  await q.goto(`${N.base}/app#/quick-wins`);
  await q.click('a.lista-item:has-text("Comparar pedidos de compra")');
  await q.waitForSelector('#entrada-qw');
  await q.fill('#entrada-qw', 'Pedido 882: 40 rolamentos. Nota: 38 rolamentos.');
  await q.click('#executar-btn');
  await q.waitForSelector('.qualidade.parcial');
  const painel = await q.textContent('.qualidade');
  assert.match(painel, /Conferência incompleta/);
  assert.match(painel, /A conferência completa não pôde ser feita agora\. Revise antes de usar\./);
  assert.match(painel, /◐/, 'ícone próprio do estado parcial');
  assert.doesNotMatch(painel, /✓|conferid|concluíd|aprovad|validad|verificad|certificad|garantid|sucesso|tudo certo/i, 'nada indica validação completa no estado parcial');
  // Mensagem seguinte: resposta normal, sem nova conferência nem painel de qualidade.
  OR.responder = b => (JSON.stringify(b.messages[0].content).includes('conferente de qualidade') ? QC_OK : 'O maior valor é 40 unidades.');
  const antes = OR.chamadas.length;
  await q.fill('#entrada', 'Qual foi o maior valor?');
  await q.keyboard.press('Enter');
  await q.waitForFunction(() => document.querySelectorAll('.resposta .bolha-ia').length >= 2 && !document.querySelector('.cursor'));
  await q.waitForFunction(() => /O maior valor é 40 unidades/.test(document.querySelector('#coluna').textContent));
  assert.equal(OR.chamadas.length - antes, 1, 'uma só chamada');
  assert.equal(await q.locator('.qualidade').count(), 1, 'só a execução tem painel de conferência');
  await cel.close();
  assert.deepEqual(erros, []);
});
