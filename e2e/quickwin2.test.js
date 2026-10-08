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
import { arquivo } from '../test/arquivos.js';

const TECNICO = /prompt|temperatura|tokens?\b|json|openrouter|mistral|gpt|claude|provedor|especifica[çc][ãa]o|contrato de sa[íi]da|governan[çc]a|ROUTING_|classe:/i;
const APROVACAO = /✓|conferid|concluíd|aprovad|validad|verificad|certificad|garantid|sucesso|tudo certo/i;
const QC_OK = '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"formato","ok":true}]}';
let N, OR, areaCompras, qc = 'ok';
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));

// IA falsa: na execução, devolve exatamente as colunas e seções que o prompt de execução pede; na conversa
// normal, responde à pergunta; na conferência, o veredito do cenário; na estruturação do objetivo, os campos que
// cada objetivo do teste nomeia (com o trecho de origem), ou uma resposta ilegível no cenário de falha.
const CAMPOS = { 'Cliente, Valor e Status': ['Cliente', 'Valor', 'Status'], 'Fornecedor, Vencimento, Valor contratado e Situação': ['Fornecedor', 'Vencimento', 'Valor contratado', 'Situação'] };
let estruturaFalha = false;
const ehEstruturacao = b => texto(b.messages[0].content).includes('Você organiza o pedido');
function responder(b) {
  const sis = texto(b.messages[0].content), ultima = String(b.messages.at(-1).content);
  if (ehEstruturacao(b)) {
    if (estruturaFalha) return 'sem resposta';
    const campos = Object.entries(CAMPOS).find(([k]) => ultima.includes(k))?.[1] || [];
    return JSON.stringify({ colunas: campos.map(c => ({ nome: c, evidencia: c })) });
  }
  if (sis.includes('conferente de qualidade')) return qc === 'ok' ? QC_OK : qc === 'parcial' ? 'não consegui conferir' : '{"criterios":[{"id":"completo","ok":false,"motivo":"faltou parte do material"}]}';
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
  N.qaAdmin = admin;
  const area = (await admin.post('/api/admin/areas', { nome: 'Compras' })).dados.id;
  areaCompras = area;
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
  assert.match(await p.textContent('.pg-cabeca'), /Ensine à GreenIA como realizar esse trabalho\./);
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
  assert.match(await p.textContent('.qc'), /Resultado conferido.*A resposta foi conferida pelas regras deste Quick Win\. Revise antes de usar\./s);
  assert.ok(await p.locator('#resultado-teste table').count() >= 1, 'o resultado é o trabalho (tabela)');
  const ordem = await p.evaluate(() => { const r = document.getElementById('resultado-teste'), q = document.querySelector('#teste-resultado .qc'); return r.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING; });
  assert.ok(ordem, 'conferência abaixo do resultado');
  // Refinar depois do teste salva uma orientação sem publicar e mantém o caso de comparação.
  await p.click('#refinar-qw summary');
  const exemploAntes = await p.textContent('[aria-label="Material fictício do teste"]');
  await p.click('#salvar-refinamento');
  assert.match(await p.textContent('#refinamento-erro'), /Descreva o que precisa mudar/);
  const orientacao = 'Começar pela recomendação e destacar os riscos antes da conclusão.';
  await p.fill('#refinamento-texto', orientacao);
  assert.equal(await p.getAttribute('#refinamento-texto', 'maxlength'), '160');
  await p.click('#salvar-refinamento');
  await p.waitForFunction(() => !document.querySelector('#resultado-teste') && document.querySelector('[data-testar]') && document.querySelector('#refinamento-texto')?.value === '');
  assert.equal(await p.textContent('[aria-label="Material fictício do teste"]'), exemploAntes);
  const idRefinado = /#\/qw\/(\d+)/.exec(p.url())[1];
  const salvoRefinado = (await N.qaAdmin.get(`/api/quick-wins/${idRefinado}`)).dados;
  assert.ok(salvoRefinado.assistente.regras_proprias.includes(orientacao));
  assert.equal(salvoRefinado.versao, null, 'refinar não publica');
  await p.click('[data-testar]');
  await p.waitForSelector('#teste-resultado .qc');
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
  // O que enviar vem do plano do Quick Win (o material que cada execução recebe).
  // QA-10: sem IA, o material é o que o pedido nomeia ("compare A com B": os dois), não um rótulo de modelo.
  assert.match(await p.textContent('label[for=entrada-qw]'), /Envie: Pedidos de compra; Notas de entrega\./);
  await p.fill('#entrada-qw', 'Pedido 882: 40 rolamentos. Nota 45.117: 38 rolamentos.');
  const antes = OR.chamadas.length;
  await p.click('#executar-btn');
  await p.waitForSelector('.resposta .qc');
  assert.equal(OR.chamadas.length - antes, 2, 'execução + conferência');
  assert.match(await p.textContent('.rotulo-execucao'), /Resultado do Quick Win/);
  assert.match(await p.textContent('.resposta .qc'), /Resultado conferido/);
  assert.equal(await p.locator('.resposta a:has-text("Refinar Quick Win")').count(), 1);
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
  await p.route(/\/api\/conversas\/\d+$/, async r => {
    if (r.request().method() === 'GET') await new Promise(ok => setTimeout(ok, 600));
    await r.continue();
  });
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
  await p.waitForLoadState('networkidle');
  // A opção deve ser encontrada no detalhe, na reabertura do teste e pela rota direta.
  await p.goto(`${N.base}/app#/qw/${idRefinado}`);
  await p.waitForSelector(`a[href="#/qw/${idRefinado}/refinar"]`);
  await p.goto(`${N.base}/app#/qw/${idRefinado}/teste`);
  await p.waitForSelector('#refinar-qw');
  await p.goto(`${N.base}/app#/qw/${idRefinado}/refinar`);
  await p.waitForSelector('#refinar-qw[open]');
  assert.equal(await p.locator('#refinamento-texto').isVisible(), true);
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
  // Regras próprias: "+ Adicionar regra" (Enter ou botão), entram na mesma lista e podem ser removidas.
  const sugeridas = await p.locator('.regras-lista li').count();
  await p.click('#adicionar-regra');
  await p.fill('#nova-regra-texto', 'Destacar documentos vencidos');
  await p.press('#nova-regra-texto', 'Enter');
  await p.waitForSelector('.regra-propria');
  await p.click('#adicionar-regra');
  await p.fill('#nova-regra-texto', 'Ordenar os valores do maior para o menor');
  await p.click('#confirmar-regra');
  await p.waitForFunction(() => document.querySelectorAll('.regra-propria').length === 2);
  assert.equal(await p.locator('.regras-lista li').count(), sugeridas + 2, 'na mesma lista das sugeridas');
  await p.click('[data-remover-regra="1"]');
  await p.waitForFunction(() => document.querySelectorAll('.regra-propria').length === 1);
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'adicionar-regra', 'o foco volta para "Adicionar regra"');
  assert.doesNotMatch(await p.textContent('.regras-lista'), TECNICO);
  await p.click('[data-continuar]');
  await p.waitForSelector('input[name=saida]');
  // Voltar e avançar: a regra própria continua na lista.
  await p.click('[data-voltar]');
  await p.waitForSelector('.regra-propria');
  assert.match(await p.textContent('.regra-propria'), /Destacar documentos vencidos/);
  assert.doesNotMatch(await p.textContent('.regras-lista'), /Ordenar os valores/);
  await p.click('[data-continuar]');
  await p.waitForSelector('input[name=saida]');
  assert.match(await p.textContent('.saida-motivo'), /Segue o formato do exemplo/);
  assert.equal(await p.locator('input[name=saida]:checked').getAttribute('value'), 'tabela');
  await p.click('[data-continuar]');
  // Conferência parcial: ◐, sem nenhuma linguagem de aprovação.
  qc = 'parcial';
  await p.waitForSelector('[data-testar]');
  // Salvo no rascunho, como dado da especificação, e enviado na execução do teste.
  const id = Number(/#\/qw\/(\d+)/.exec(p.url())[1]);
  const espec = JSON.parse(N.app.db.prepare('select especificacao from quick_wins where id = ?').get(id).especificacao);
  assert.deepEqual(espec.regras_proprias, [{ id: 'propria_1', texto: 'Destacar documentos vencidos' }]);
  const antes = OR.chamadas.length;
  await p.click('[data-testar]');
  await p.waitForSelector('.qc-parcial');
  const parcial = await p.textContent('.qc-parcial');
  assert.match(parcial, /◐/);
  assert.match(parcial, /Conferência incompleta.*A conferência completa não pôde ser feita agora\. Revise antes de usar\./s);
  assert.doesNotMatch(parcial, APROVACAO, 'parcial nunca parece aprovado');
  assert.match(texto(OR.chamadas[antes].messages[0].content), /- Destacar documentos vencidos/);
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

test('colunas do objetivo: uma estruturação por objetivo, revisão e ajuste manual soberano, falha sem inventar', async () => {
  qc = 'ok';
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  const estruturacoes = () => OR.chamadas.filter(ehEstruturacao).length;
  const colunas = () => p.$$eval('[data-coluna]', l => l.map(i => i.value));
  const irResultado = async () => { for (const sel of ['#processo', 'input[name=regra]', 'input[name=saida]']) { await p.click('[data-continuar]'); await p.waitForSelector(sel); } };
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Gere uma tabela com Cliente, Valor e Status.');
  let n = estruturacoes();
  for (const sel of ['#processo', 'input[name=regra]', 'input[name=saida]']) { await p.click('[data-continuar]'); await p.waitForSelector(sel); }
  assert.equal(estruturacoes() - n, 1, 'objetivo novo: 1 chamada ao preparar a etapa Resultado');
  assert.equal(await p.locator('input[name=saida]:checked').getAttribute('value'), 'tabela');
  assert.deepEqual(await colunas(), ['Cliente', 'Valor', 'Status']);
  assert.match(await p.textContent('#colunas-origem'), /Pelo que você escreveu no objetivo/);
  assert.doesNotMatch(await p.textContent('#principal'), TECNICO);
  // Voltar e avançar; mudar só uma regra: nenhuma chamada nova.
  n = estruturacoes();
  await p.click('[data-voltar]'); await p.waitForSelector('input[name=regra]');
  await p.locator('input[name=regra]:not([disabled])').first().uncheck();
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=saida]');
  await p.click('[data-voltar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=saida]');
  assert.equal(estruturacoes() - n, 0, 'mesmo objetivo: 0 chamadas');
  assert.deepEqual(await colunas(), ['Cliente', 'Valor', 'Status']);
  // Objetivo alterado: 1 chamada nova e as colunas acompanham (a pessoa ainda não mexeu nelas).
  await p.click('.passos [data-ir-etapa="0"]'); await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Organize em uma tabela com Fornecedor, Vencimento, Valor contratado e Situação.');
  n = estruturacoes();
  await irResultado();
  assert.equal(estruturacoes() - n, 1);
  assert.deepEqual(await colunas(), ['Fornecedor', 'Vencimento', 'Valor contratado', 'Situação']);
  // Ajuste manual: renomear, mudar a ordem, remover, adicionar.
  await p.fill('#coluna-3', 'Situação do documento');
  await p.click('[data-subir="1"]');
  await p.waitForFunction(() => document.querySelector('#coluna-0')?.value === 'Vencimento');
  await p.click('[data-remover-coluna="2"]');
  await p.waitForFunction(() => document.querySelectorAll('[data-coluna]').length === 3);
  await p.click('#adicionar-coluna');
  await p.fill('#coluna-3', 'Responsável');
  assert.deepEqual(await colunas(), ['Vencimento', 'Fornecedor', 'Situação do documento', 'Responsável']);
  await p.click('[data-voltar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=saida]');
  assert.deepEqual(await colunas(), ['Vencimento', 'Fornecedor', 'Situação do documento', 'Responsável'], 'o ajuste não se perde');
  assert.match(await p.textContent('#colunas-origem'), /Do jeito que você definiu/);
  // Objetivo muda de novo: a estrutura da pessoa fica; a nova vira só uma sugestão.
  await p.click('.passos [data-ir-etapa="0"]'); await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Gere uma tabela com Cliente, Valor e Status.');
  n = estruturacoes();
  await irResultado();
  assert.equal(estruturacoes() - n, 0, 'objetivo já estruturado nesta tela: a estrutura guardada para ele é reaproveitada');
  assert.deepEqual(await colunas(), ['Vencimento', 'Fornecedor', 'Situação do documento', 'Responsável'], 'a IA não sobrescreve o que a pessoa definiu');
  assert.match(await p.textContent('#colunas-bloco .aviso-linha'), /O objetivo mudou\. Pelo novo objetivo: Cliente, Valor, Status\./);
  await p.click('#manter-colunas');
  await p.waitForFunction(() => !document.querySelector('#colunas-bloco .aviso-linha'));
  // Salvar (Continuar): o contrato é o que a pessoa confirmou; o teste executa com essas colunas.
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  const id = Number(/#\/qw\/(\d+)/.exec(p.url())[1]);
  const espec = JSON.parse(N.app.db.prepare('select especificacao from quick_wins where id = ?').get(id).especificacao);
  assert.deepEqual(espec.formato_saida.colunas, ['Vencimento', 'Fornecedor', 'Situação do documento', 'Responsável']);
  assert.equal(espec.formato_saida.origem_colunas, 'pessoa');
  const antes = OR.chamadas.length;
  await p.click('[data-testar]');
  await p.waitForSelector('#teste-resultado .qc');
  assert.match(texto(OR.chamadas[antes].messages[0].content), /cabeçalho exatamente nestas colunas: Vencimento \| Fornecedor \| Situação do documento \| Responsável\./);
  assert.equal(OR.chamadas.slice(antes).filter(ehEstruturacao).length, 0, 'a execução não estrutura de novo');
  // Revisão: mostra as colunas combinadas.
  await p.click('[data-continuar]'); await p.waitForSelector('.resumo-pub');
  assert.match(await p.textContent('.resumo-pub'), /Tabela · Vencimento, Fornecedor, Situação do documento, Responsável/);
  // Falha da estruturação: mensagem simples, nenhuma coluna fixa inventada; a pessoa define.
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', 'Monte uma tabela das entregas da semana.');
  estruturaFalha = true;
  for (const sel of ['#processo', 'input[name=regra]', 'input[name=saida]']) { await p.click('[data-continuar]'); await p.waitForSelector(sel); }
  estruturaFalha = false;
  assert.match(await p.textContent('#colunas-origem'), /Não conseguimos sugerir a estrutura agora\. Você pode defini-la abaixo\./);
  assert.deepEqual(await colunas(), [], 'sem Item / Descrição / Observação');
  await p.click('#adicionar-coluna');
  await p.fill('#coluna-0', 'Entrega');
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  const id2 = Number(/#\/qw\/(\d+)/.exec(p.url())[1]);
  assert.deepEqual(JSON.parse(N.app.db.prepare('select especificacao from quick_wins where id = ?').get(id2).especificacao).formato_saida.colunas, ['Entrega']);
  assert.deepEqual(erros, []);
});

test('concorrência: resposta atrasada não vale para outro objetivo, não desenha etapa abandonada e não vence a mais nova', async () => {
  qc = 'ok';
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  const OBJ_A = 'Gere uma tabela com Cliente, Valor e Status.';
  const OBJ_B = 'Organize em uma tabela com Fornecedor, Vencimento, Valor contratado e Situação.';
  const COL_A = ['Cliente', 'Valor', 'Status'], COL_B = ['Fornecedor', 'Vencimento', 'Valor contratado', 'Situação'];
  // Atrasa no navegador a resposta da estruturação do objetivo escolhido (o servidor responde normalmente).
  let atrasar = null;
  await p.route('**/api/quick-wins/assistente/estrutura', async rota => {
    const corpo = rota.request().postData() || '';
    if (atrasar && corpo.includes(atrasar)) { atrasar = null; await new Promise(r => setTimeout(r, 2500)); }
    await rota.continue();
  });
  const enviados = obj => OR.chamadas.filter(b => ehEstruturacao(b) && String(b.messages.at(-1).content).includes(obj)).length;
  const colunas = () => p.$$eval('[data-coluna]', l => l.map(i => i.value));
  const atual = () => p.$eval('.passos [aria-current="step"]', e => e.textContent.trim());
  const pergunta = () => p.$eval('#pergunta', e => e.textContent.trim());
  const avancar = async (...sels) => { for (const s of sels) { await p.click('[data-continuar]'); await p.waitForSelector(s); } };
  p.on('dialog', d => d.accept()); // Estes casos abandonam alterações deliberadamente para testar respostas atrasadas.
  const novo = async obj => { await p.goto(`${N.base}/app#/quick-wins`); await p.waitForSelector('.qw-lista'); await p.goto(`${N.base}/app#/qw/nova`); await p.waitForSelector('#objetivo'); await p.fill('#objetivo', obj); };
  const PERGUNTA_PROCESSO = /O que normalmente precisa ser considerado/;

  // Caso 1: A pendente → volta → B → avança; a resposta de A chega depois.
  await novo(OBJ_A);
  atrasar = 'Cliente, Valor e Status';
  await avancar('#processo', 'input[name=regra]');
  await p.click('[data-continuar]');                       // Resultado: estruturação de A pendente
  await p.waitForSelector('#etapa .dica');
  await p.click('.passos [data-ir-etapa="0"]'); await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', OBJ_B);
  await avancar('#processo');
  await p.waitForTimeout(3000);                            // a resposta de A chegou
  assert.equal(await atual(), '2Processo', 'a tela não salta de etapa');
  assert.match(await pergunta(), PERGUNTA_PROCESSO);
  assert.equal(await p.locator('input[name=saida]').count(), 0, 'nada da etapa Resultado por cima');
  const b0 = enviados(OBJ_B);
  await avancar('input[name=regra]', 'input[name=saida]');
  assert.equal(enviados(OBJ_B) - b0, 1, 'B recebe a própria estruturação');
  assert.deepEqual(await colunas(), COL_B, 'A não aparece como sugestão de B');
  assert.match(await p.textContent('#colunas-origem'), /Pelo que você escreveu no objetivo/);
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  const id1 = Number(/#\/qw\/(\d+)/.exec(p.url())[1]);
  const e1 = JSON.parse(N.app.db.prepare('select especificacao from quick_wins where id = ?').get(id1).especificacao);
  assert.deepEqual([e1.objetivo, e1.formato_saida.colunas, e1.formato_saida.origem_colunas], [OBJ_B, COL_B, 'objetivo'], 'o que a pessoa viu é o que foi salvo');

  // Caso 2: entra em Resultado, volta para Processo, a resposta chega: continua em Processo.
  await novo(OBJ_A);
  atrasar = 'Cliente, Valor e Status';
  await avancar('#processo', 'input[name=regra]');
  await p.click('[data-continuar]');
  await p.waitForSelector('#etapa .dica');
  await p.click('.passos [data-ir-etapa="1"]'); await p.waitForSelector('#processo');
  await p.focus('#processo');
  await p.waitForTimeout(3000);
  assert.equal(await atual(), '2Processo');
  assert.match(await pergunta(), PERGUNTA_PROCESSO);
  assert.equal(await p.locator('input[name=saida]').count(), 0, 'sem repaint de Resultado');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'processo', 'o foco não é roubado');
  const a0 = enviados(OBJ_A);
  await avancar('input[name=regra]', 'input[name=saida]');
  assert.equal(enviados(OBJ_A) - a0, 0, 'a resposta que chegou fica guardada para o mesmo objetivo: sem chamada nova');
  assert.deepEqual(await colunas(), COL_A);

  // Caso 3: A inicia → B inicia → B responde → A responde. O estado final é B.
  await novo(OBJ_A);
  atrasar = 'Cliente, Valor e Status';
  await avancar('#processo', 'input[name=regra]');
  await p.click('[data-continuar]');
  await p.waitForSelector('#etapa .dica');
  await p.click('.passos [data-ir-etapa="0"]'); await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', OBJ_B);
  await avancar('#processo', 'input[name=regra]', 'input[name=saida]');   // B responde logo
  assert.deepEqual(await colunas(), COL_B);
  await p.waitForTimeout(3000);                                           // A responde depois
  assert.equal(await atual(), '4Resultado');
  assert.deepEqual(await colunas(), COL_B, 'A nunca sobrescreve B');
  assert.match(await p.textContent('#colunas-origem'), /Pelo que você escreveu no objetivo/);
  await p.unroute('**/api/quick-wins/assistente/estrutura');
  assert.deepEqual(erros, []);
});

test('a revisão não reaproveita a conferência em memória depois de mudar uma fonte', async () => {
  qc = 'ok';
  const p = await N.contexto.newPage();
  const eu = await (await p.request.get(`${N.base}/api/eu`)).json();
  assert.equal(eu.pessoa.email, 'lia@empresa-exemplo.com.br');
  const headers = { 'x-csrf': eu.csrf };
  const q = await (await p.request.post(`${N.base}/api/quick-wins`, { headers, data: { assistente: { descricao: 'Compare pedidos com notas de entrega', formato: 'tabela' }, areas: [areaCompras] } })).json();
  await p.goto(`${N.base}/app#/qw/${q.id}/teste`);
  await p.waitForSelector('[data-testar]:not([disabled])');
  await p.click('[data-testar]');
  await p.waitForSelector('#teste-resultado .qc');
  assert.match(await p.textContent('#teste-resultado .qc'), /Resultado conferido/);
  assert.equal((await p.request.post(`${N.base}/api/quick-wins/${q.id}/arquivos`, { headers, data: { arquivo: arquivo('nova-fonte.txt', Buffer.from('Referência fictícia adicionada após o teste.')), papel: 'REFERENCE' } })).status(), 200);
  await p.click('[data-continuar]');
  await p.waitForSelector('.resumo-pub');
  assert.match(await p.textContent('.resumo-pub'), /Ainda não testado/);
  assert.doesNotMatch(await p.textContent('.resumo-pub'), /Resultado conferido/);
  await p.close();
});
