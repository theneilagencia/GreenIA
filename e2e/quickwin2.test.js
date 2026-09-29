// E2E da jornada de Quick Wins no navegador: uma pessoa leiga (responsável da área, sem ser admin) entra na
// biblioteca vazia, ensina o trabalho em etapas de foco único (voltar e avançar sem perder nada), testa na
// mesma tela, revisa e publica; usa; continua conversando normalmente; roda uma nova execução explícita.
// Estados da conferência: aprovado, parcial (◐, sem linguagem de aprovação) e pontos para revisar. Celular.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';

const TECNICO = /prompt|temperatura|tokens?\b|json|openrouter|mistral|gpt|claude|provedor|especifica[çc][ãa]o|contrato de sa[íi]da|governan[çc]a|ROUTING_|classe:/i;
const APROVACAO = /✓|conferid|concluíd|aprovad|validad|verificad|certificad|garantid|sucesso|tudo certo/i;
const QC_OK = '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"formato","ok":true}]}';
let N, OR, qc = 'ok';
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));

// IA falsa: na execução, devolve exatamente as colunas e seções que o prompt de execução pede; na conversa
// normal, responde à pergunta; na conferência, o veredito do cenário.
function responder(b) {
  const sis = texto(b.messages[0].content), ultima = String(b.messages.at(-1).content);
  if (sis.includes('conferente de qualidade')) return qc === 'ok' ? QC_OK : qc === 'parcial' ? 'não consegui conferir' : '{"criterios":[{"id":"formato","ok":false,"motivo":"fora do formato"}]}';
  if (/A conferência de qualidade encontrou/.test(ultima)) return qc === 'falha' ? 'Resultado ainda fora do formato.' : execucao(b.messages.find(m => m.role === 'system'));
  if (!/Você está executando o Quick Win/.test(sis)) return /maior valor/i.test(ultima) ? 'O maior valor é R$ 3.400,00, do cliente Beta Serviços.' : 'Certo. Segue a resposta, em texto corrido.';
  return execucao(b.messages[0]);
}
function execucao(m) {
  const sis = texto(m.content);
  const cols = (/cabeçalho exatamente nestas colunas: (.+)\./.exec(sis)?.[1] || 'Item | Descrição').split(' | ');
  const secoes = (/(?:inclua|Use) estas seções, nesta ordem, cada uma com título "## Nome": (.+)\./.exec(sis)?.[1] || '').split('; ').filter(Boolean);
  const linha = v => `| ${cols.map((_, i) => (i === 0 ? v : `valor ${i}`)).join(' | ')} |`;
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, linha('Alfa Comércio'), linha('Beta Serviços'), '', ...secoes.map(s => `## ${s}\n- Nenhuma`)].join('\n');
}

before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado', areas: [{ id: area, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'rui@empresa-exemplo.com.br', nome: 'Rui Alves', areas: [{ id: area }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
});
after(async () => { await N.fechar(); await OR.fechar(); });

test('pessoa leiga: biblioteca vazia → ensinar em 5 etapas → testar → revisar → publicar → usar → conversar → nova execução', async () => {
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await N.entrar('lia@empresa-exemplo.com.br', p);
  let cliques = 0;
  const clicar = async sel => { cliques++; await p.click(sel); };
  const semTecnico = async onde => assert.doesNotMatch(await p.textContent('#principal'), TECNICO, onde);

  // Biblioteca vazia: onboarding, não tela administrativa.
  await p.goto(`${N.base}/app#/quick-wins`);
  await p.waitForSelector('.qw-vazio');
  assert.match(await p.textContent('.qw-vazio'), /Crie um trabalho que sua equipe poderá repetir com segurança\./);
  assert.equal(await p.locator('table').count(), 0, 'sem tabela administrativa');
  await semTecnico('biblioteca vazia');
  await clicar('.qw-vazio a:has-text("Criar meu primeiro Quick Win")');

  // Etapa 1: só a pergunta, o campo, exemplos discretos e Continuar.
  await p.waitForSelector('#objetivo');
  assert.equal((await p.textContent('#pergunta')).trim(), 'O que você quer que a IA faça?');
  assert.match(await p.textContent('.pg-cabeca'), /Ensine ao GreenIA como realizar esse trabalho\./);
  assert.equal(await p.locator('.passos [aria-current="step"]').textContent(), '1Objetivo');
  assert.equal(await p.locator('.pergunta').count(), 1, 'uma etapa por vez');
  assert.equal(await p.locator('.chip, .cartao-opcao').count(), 0, 'sem chips grandes');
  await p.click('[data-continuar]');
  await p.waitForSelector('#erro-etapa .aviso-erro');
  await p.fill('#objetivo', 'Compare pedidos de compra com notas de entrega e diga o que não bate');
  await clicar('[data-continuar]');
  // Etapa 2: nada obrigatório.
  await p.waitForSelector('#processo');
  assert.match(await p.textContent('#pergunta'), /O que normalmente precisa ser considerado para fazer isso bem\?/);
  await clicar('[data-continuar]');
  // Etapa 3: regras em lista simples; "não inventar" sempre ativa.
  await p.waitForSelector('input[name=regra]');
  assert.match(await p.textContent('#pergunta'), /O que a IA não pode ignorar\?/);
  const travada = p.locator('input[name=regra][value=nao_inventar]');
  assert.ok(await travada.isChecked() && await travada.isDisabled());
  assert.match(await p.textContent('.regras-lista'), /Sempre ativa/);
  await clicar('[data-continuar]');
  // Etapa 4: formato sugerido, com motivo, já marcado.
  await p.waitForSelector('input[name=saida]');
  assert.match(await p.textContent('#pergunta'), /Como você quer receber a resposta\?/);
  assert.match(await p.textContent('.saida-motivo'), /Sugestão da GreenIA/);
  assert.equal(await p.locator('input[name=saida]:checked').getAttribute('value'), 'tabela');
  assert.match(await p.textContent('.saida:has(input:checked)'), /Tabela.*Sugerido/s);
  await semTecnico('etapas de criação');
  await clicar('[data-continuar]');
  // Etapa 5: teste na mesma tela, com o exemplo pronto.
  await p.waitForSelector('[data-testar]');
  assert.match(await p.textContent('#pergunta'), /Vamos testar antes de colocar em uso/);
  assert.equal(await p.locator('[data-material="auto"]').getAttribute('aria-pressed'), 'true');
  await clicar('[data-testar]');
  await p.waitForSelector('#teste-resultado .qc');
  assert.match(await p.textContent('.qc'), /Resultado conferido.*A resposta atendeu às regras definidas para este Quick Win\./s);
  assert.ok(await p.locator('#resultado-teste table').count() >= 1, 'o resultado é o trabalho (tabela)');
  const ordem = await p.evaluate(() => { const r = document.getElementById('resultado-teste'), q = document.querySelector('#teste-resultado .qc'); return r.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING; });
  assert.ok(ordem, 'conferência abaixo do resultado');
  // Revisar e publicar.
  await clicar('[data-continuar]');
  await p.waitForSelector('.resumo-pub');
  assert.equal((await p.textContent('#nome-atual')).trim(), 'Comparar pedidos de compra com notas de entrega');
  const resumo = await p.textContent('.resumo-pub');
  for (const r of ['Faz', 'Considera', 'Respeita', 'Entrega', 'Não inventar informações', 'Tabela', 'Resultado conferido']) assert.ok(resumo.includes(r), r);
  await clicar('[data-continuar]');
  await p.waitForSelector('.sucesso');
  assert.match(await p.textContent('.sucesso'), /Quick Win publicado.*Agora ele está disponível para sua equipe\..*v1/s);
  assert.ok(cliques <= 8, `da biblioteca à publicação em ${cliques} cliques`);

  // Usar agora: o que enviar → Executar → resultado com conferência logo abaixo.
  await p.click('.sucesso a:has-text("Usar agora")');
  await p.waitForSelector('#entrada-qw');
  assert.match(await p.textContent('label[for=entrada-qw]'), /Envie os documentos que devem ser comparados\./);
  await p.fill('#entrada-qw', 'Pedido 882: 40 rolamentos. Nota 45.117: 38 rolamentos.');
  const antes = OR.chamadas.length;
  await p.click('#executar-btn');
  await p.waitForSelector('.resposta .qc');
  assert.equal(OR.chamadas.length - antes, 2, 'execução + conferência');
  assert.match(await p.textContent('.rotulo-execucao'), /Resultado do Quick Win/);
  assert.match(await p.textContent('.resposta .qc'), /Resultado conferido/);
  assert.equal(await p.locator('#modelo').count(), 0, 'sem seletor de modelo');
  await semTecnico('resultado');
  // Mensagem seguinte: conversa normal (sem rótulo de execução, sem conferência, uma chamada).
  let n = OR.chamadas.length;
  await p.fill('#entrada', 'Qual foi o maior valor?');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => /O maior valor é R\$ 3\.400,00/.test(document.getElementById('coluna').textContent));
  await p.waitForSelector('#entrada:not([disabled])');
  assert.equal(OR.chamadas.length - n, 1);
  assert.equal(await p.locator('.resposta .qc').count(), 1);
  assert.equal(await p.locator('.rotulo-execucao').count(), 1);
  // Nova execução explícita: o ciclo completo volta.
  await p.click('#nova-execucao');
  await p.waitForSelector('.proxima-execucao');
  n = OR.chamadas.length;
  await p.fill('#entrada', 'Pedido 883: 10 correias. Nota: 9 correias.');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelectorAll('.resposta .qc').length === 2);
  assert.equal(OR.chamadas.length - n, 2);
  assert.equal(await p.locator('.rotulo-execucao').count(), 2);
  assert.equal(await p.locator('.proxima-execucao').count(), 0, 'a nova execução vale só para um envio');
  // Biblioteca: publicado, com versão e ações.
  await p.goto(`${N.base}/app#/quick-wins`);
  await p.waitForSelector('.qw-item');
  assert.match(await p.textContent('.qw-item'), /Comparar pedidos de compra.*v1.*Publicado.*Usar/s);
  assert.deepEqual(erros, []);
});

test('etapas: voltar e avançar sem perder nada; exemplo; conferência parcial (◐) e pontos para revisar', async () => {
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await N.entrar('lia@empresa-exemplo.com.br', p);
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.click('.exemplos [data-exemplo="3"]');
  assert.match(await p.inputValue('#objetivo'), /Organizar anotações soltas/);
  await p.fill('#objetivo', 'Organizar a relação de cobranças em uma tabela com Cliente, Valor e Status');
  await p.click('[data-continuar]');
  await p.waitForSelector('#modo-exemplo');
  await p.click('#modo-exemplo');
  await p.waitForSelector('#exemplo');
  await p.fill('#exemplo', '| Cliente | Valor | Status |\n|---|---|---|\n| Exemplo Ltda | R$ 10,00 | Pago |');
  await p.click('[data-continuar]');
  await p.waitForSelector('input[name=regra]');
  // Voltar: o exemplo e o objetivo continuam lá.
  await p.click('[data-voltar]');
  await p.waitForSelector('#exemplo');
  assert.match(await p.inputValue('#exemplo'), /Cliente \| Valor \| Status/);
  await p.click('[data-voltar]');
  await p.waitForSelector('#objetivo');
  assert.match(await p.inputValue('#objetivo'), /Cliente, Valor e Status/);
  // Pelo progresso: pula de volta para Processo (etapa já alcançada).
  await p.click('.passos [data-ir-etapa="1"]');
  await p.waitForSelector('#exemplo');
  await p.click('[data-continuar]');
  await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]');
  await p.waitForSelector('input[name=saida]');
  assert.match(await p.textContent('.saida-motivo'), /Segue o formato do exemplo/);
  assert.equal(await p.locator('input[name=saida]:checked').getAttribute('value'), 'tabela');
  await p.click('[data-continuar]');
  // Conferência parcial: ◐, sem nenhuma linguagem de aprovação.
  qc = 'parcial';
  await p.waitForSelector('[data-testar]');
  await p.click('[data-testar]');
  await p.waitForSelector('.qc-parcial');
  const parcial = await p.textContent('.qc-parcial');
  assert.match(parcial, /◐/);
  assert.match(parcial, /Conferência incompleta.*A conferência completa não pôde ser feita agora\. Revise antes de usar\./s);
  assert.doesNotMatch(parcial, APROVACAO, 'parcial nunca parece aprovado');
  // Pontos para revisar: resultado recolhido, "Ver resultado" e "Ajustar Quick Win".
  qc = 'falha';
  await p.click('[data-testar]');
  await p.waitForSelector('.qc-revisar');
  assert.match(await p.textContent('.qc-revisar'), /Encontramos pontos para revisar/);
  assert.ok(await p.locator('#resultado-teste').isHidden());
  await p.click('.qc-revisar [data-ver-resultado]');
  assert.ok(await p.locator('#resultado-teste').isVisible());
  assert.equal(await p.locator('[data-continuar]').count(), 0, 'publicar não é a ação principal com pontos para revisar');
  await p.click('[data-ajustar]');
  await p.waitForSelector('#objetivo');
  assert.match(await p.inputValue('#objetivo'), /Cliente, Valor e Status/, 'ajustar volta ao início com tudo preenchido');
  qc = 'ok';
  assert.deepEqual(erros, []);
});

test('celular: progresso compacto na criação; colega usa pela biblioteca, sem rolagem horizontal', async () => {
  const cel = await N.navegador.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  await cel.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const erros = [];
  const lia = await N.entrar('lia@empresa-exemplo.com.br', await cel.newPage());
  lia.on('pageerror', e => erros.push(e.message));
  await lia.goto(`${N.base}/app#/qw/nova`);
  await lia.waitForSelector('#objetivo');
  assert.ok(await lia.locator('.passos-compacto').isVisible());
  assert.ok(await lia.locator('.passos ol').isHidden());
  assert.match(await lia.textContent('.passos-compacto'), /Etapa 1 de 5 · Objetivo/);
  assert.ok(await lia.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'criação sem rolagem horizontal');
  await lia.close();
  const rui = await N.entrar('rui@empresa-exemplo.com.br', await cel.newPage());
  rui.on('pageerror', e => erros.push(e.message));
  await rui.goto(`${N.base}/app#/quick-wins`);
  await rui.waitForSelector('.qw-item');
  assert.equal(await rui.locator('text=Em preparo').count(), 0, 'quem só usa vê só o que está publicado');
  assert.ok(await rui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'biblioteca sem rolagem horizontal');
  await rui.click('.qw-item a:has-text("Usar")');
  await rui.waitForSelector('#entrada-qw');
  await rui.fill('#entrada-qw', 'Pedido 900: 5 rolamentos. Nota: 5 rolamentos.');
  await rui.click('#executar-btn');
  await rui.waitForSelector('.resposta .qc');
  assert.ok(await rui.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'resultado sem rolagem horizontal');
  // Teclado: o campo tem rótulo e o botão Executar é alcançável.
  await rui.goto(`${N.base}/app#/quick-wins`);
  await rui.click('.qw-item a:has-text("Usar")');
  await rui.waitForSelector('#entrada-qw');
  await rui.focus('#entrada-qw');
  await rui.keyboard.press('Tab'); await rui.keyboard.press('Tab');
  assert.equal(await rui.evaluate(() => document.activeElement?.id), 'executar-btn');
  await cel.close();
  assert.deepEqual(erros, []);
});

test('editar um Quick Win publicado cria a próxima versão sem mexer na publicada; versões e restauração', async () => {
  qc = 'ok';
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  // O contexto já tem a sessão da Lia (os testes anteriores entraram): sem pedir mais um código.
  await p.goto(`${N.base}/app#/quick-wins`);
  await p.click('a.qw-item-link:has-text("Comparar pedidos de compra")');
  await p.waitForSelector('.pg-cabeca .btn:has-text("Editar")');
  assert.match(await p.textContent('.pg-meta'), /Publicado.*Versão publicada: v1/s);
  await p.click('.pg-cabeca .btn:has-text("Editar")');
  await p.waitForSelector('#objetivo');
  assert.match(await p.textContent('.aviso-linha'), /Versão publicada: v1\..*editando a v2.*continua usando a v1/s);
  assert.match(await p.inputValue('#objetivo'), /Compare pedidos de compra/, 'o que foi ensinado vem preenchido');
  // Editando, as etapas já feitas ficam clicáveis: vai direto para Regras.
  await p.click('.passos [data-ir-etapa="2"]');
  await p.waitForSelector('input[name=regra]');
  const opcional = p.locator('input[name=regra]:not([disabled])').first();
  const regra = await opcional.getAttribute('value');
  await opcional.uncheck();
  await p.click('[data-continuar]');
  await p.waitForSelector('input[name=saida]');
  await p.click('[data-continuar]');
  await p.waitForSelector('[data-testar]');
  // O rascunho não afeta quem usa: a versão publicada continua v1 até publicar.
  const q = (await (await p.request.get(`${N.base}/api/quick-wins`)).json()).quickWins.find(x => /Comparar pedidos/.test(x.nome));
  const antes = await (await p.request.get(`${N.base}/api/quick-wins/${q.id}`)).json();
  assert.equal(antes.versao, 1);
  assert.equal(antes.rascunho_alterado, true);
  await p.click('[data-testar]');
  await p.waitForSelector('#teste-resultado .qc-ok');
  await p.click('[data-continuar]');
  await p.waitForSelector('.resumo-pub');
  await p.click('[data-continuar]');
  await p.waitForSelector('.sucesso');
  assert.match(await p.textContent('.sucesso'), /Versão atual: v2/);
  // Versões: v2 atual, v1 restaurável.
  await p.goto(`${N.base}/app#/qw/${q.id}/versoes`);
  await p.waitForSelector('[data-restaurar="1"]');
  assert.match(await p.textContent('.execucoes'), /v2 · Versão atual.*v1/s);
  p.once('dialog', d => d.accept());
  await p.click('[data-restaurar="1"]');
  await p.waitForFunction(() => /v1 · Versão atual/.test(document.querySelector('.execucoes')?.textContent || ''));
  const depois = await (await p.request.get(`${N.base}/api/quick-wins/${q.id}`)).json();
  assert.equal(depois.versao, 1);
  assert.ok(depois.regras.length >= 1 && regra);
  assert.deepEqual(erros, []);
});
