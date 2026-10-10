// E2E dos Quick Wins generalistas, no navegador: um trabalho que não é de conteúdo (contratos) recebe a mesma
// experiência estruturada. A GreenIA mostra "Entendi que este Quick Win vai fazer" (objetivo, o que precisa, o que
// faz, o que entrega, o que usa), a pessoa confirma, edita, aceita uma sugestão, ajusta os entregáveis, testa com
// um contrato fictício e vê um cartão por entregável. Quick Win antigo: "Atualizar para Quick Win inteligente",
// com a estrutura só como sugestão. Celular (390px) sem rolagem horizontal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';

const CONTRATOS = 'Analise contratos de fornecedores e destaque riscos e obrigações.';
const PLANO = { resumo: 'Lê contratos de fornecedores e aponta riscos e obrigações.', categoria: 'contratos',
  entradas: [{ tipo: 'documento', rotulo: 'Contrato do fornecedor', quantidade: 1, obrigatoria: true }],
  etapas: [{ texto: 'Ler o contrato inteiro', ferramenta: 'leitura_documento' }, { texto: 'Identificar as cláusulas' }, { texto: 'Classificar os riscos' }, { texto: 'Extrair as obrigações' }],
  entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo executivo' }, { id: 'e2', tipo: 'riscos', rotulo: 'Riscos' }, { id: 'e3', tipo: 'lista', rotulo: 'Obrigações' }],
  ferramentas: ['leitura_documento'], sugestoes: [{ texto: 'Extrair também prazos e multas?', entregavel: { tipo: 'tabela', rotulo: 'Prazos e multas' } }],
  lacunas: [{ id: 'papel', pergunta: 'A sua empresa é a contratante ou a fornecedora nesses contratos?', obrigatoria: false }], criterios: ['Cada risco cita a cláusula'] };
const TECNICO = /prompt|tokens?\b|json|openrouter|mistral|claude|provedor|especifica[çc][ãa]o|classe:|plugin|heur/i;
let N, OR, AREA;
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
function responder(b) {
  const sis = texto(b.messages[0].content);
  if (sis.includes('PLANO DE TRABALHO')) return JSON.stringify(PLANO);
  if (sis.includes('conferente de qualidade')) return '{"criterios":[]}';
  if (sis.includes('Você organiza o pedido')) return '{"colunas":[]}';
  if (sis.includes('material FICTÍCIO')) return 'CONTRATO DE FORNECIMENTO 12/2026 (fictício)\nContratante: Empresa Exemplo Ltda.\nMulta por atraso: 10%.\nPrazo de pagamento: não informado.';
  if (!sis.includes('Entregáveis (entregue todos')) return 'Certo.';
  const titulos = [...sis.matchAll(/\d+\. ## ([^(\n]+?)(?: \(|\n)/g)].map(m => m[1].trim());
  return titulos.map(t => `## ${t}\n${/Prazos/.test(t) ? '| Cláusula | Prazo |\n|---|---|\n| 4.1 | 30 dias |' : `Conteúdo de ${t} do contrato fictício.`}`).join('\n\n')
    + (sis.includes('Informações não encontradas') ? '\n\n## Informações não encontradas\nPrazo de pagamento: não informado.' : '');
}

before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  AREA = (await admin.post('/api/admin/areas', { nome: 'Jurídico' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado', areas: [{ id: AREA, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'leo@empresa-exemplo.com.br', nome: 'Leo Dias', areas: [{ id: AREA, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
});
after(async () => { await N.fechar(); await OR.fechar(); });

test('contrato: entendimento do trabalho, edição, sugestão aceita, entregáveis, teste real e um cartão por entregável', async () => {
  const p = await N.entrar('lia@empresa-exemplo.com.br');
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', CONTRATOS);
  await p.click('[data-continuar]');
  await p.waitForSelector('#plano');
  const plano = await p.textContent('#plano');
  assert.match(plano, /Entendi que este Quick Win vai fazer:/);
  for (const t of ['Lê contratos de fornecedores', 'Vai precisar de', 'Contrato do fornecedor', 'Vai fazer', 'Classificar os riscos', 'Vai entregar', 'Resumo executivo', 'Riscos', 'Obrigações', 'Vai usar', 'Leitura de documentos'])
    assert.ok(plano.includes(t), t);
  assert.doesNotMatch(plano, TECNICO);
  // Pergunta de contexto e sugestão: a sugestão só entra se a pessoa incluir.
  assert.match(plano, /A sua empresa é a contratante ou a fornecedora/);
  await p.fill('[data-lacuna="papel"]', 'Contratante');
  assert.doesNotMatch(await p.textContent('#plano dl'), /Prazos e multas/);
  await p.click('[data-sugestao="0"]');
  await p.waitForFunction(() => document.querySelector('#plano dl')?.textContent.includes('Prazos e multas'));
  assert.equal(await p.inputValue('[data-lacuna="papel"]'), 'Contratante', 'a resposta não se perde');
  // Editar: etapas uma por linha e um material a mais.
  await p.click('#plano-editar');
  await p.waitForSelector('#plano-etapas');
  await p.fill('#plano-etapas', 'Ler o contrato inteiro\nIdentificar as cláusulas\nClassificar os riscos\nExtrair as obrigações\nConferir multas e prazos');
  await p.click('#x-adicionar');
  await p.waitForSelector('[data-x-rotulo="1"]');
  await p.fill('[data-x-rotulo="1"]', 'Aditivos do contrato');
  await p.uncheck('[data-x-obrig="1"]');
  await p.click('#plano-editar');
  await p.waitForSelector('#plano-ok');
  assert.match(await p.textContent('#plano'), /Conferir multas e prazos/);
  assert.match(await p.textContent('#plano'), /Aditivos do contrato \(opcional\)/);
  await p.click('#plano-ok');
  await p.waitForSelector('#plano-ok[aria-pressed="true"]');
  // Regras → Resultado: o editor de entregáveis vale para qualquer trabalho (canal é opcional).
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('#entregas');
  const rotulos = await p.$$eval('[data-e-rotulo]', l => l.map(i => i.value || i.placeholder));
  assert.deepEqual(rotulos, ['Resumo executivo', 'Riscos', 'Obrigações', 'Prazos e multas']);
  assert.equal(await p.locator('input[name=canal]:checked').count(), 0, 'nenhum canal');
  assert.match(await p.textContent('#entregas'), /Canais \(opcional, para conteúdo\)/);
  // Testar: exemplo pronto do tipo da entrada (um contrato fictício) e execução real.
  await p.click('[data-continuar]');
  await p.waitForSelector('[data-testar]');
  assert.match(await p.textContent('.previa-texto'), /CONTRATO DE FORNECIMENTO 12\/2026 \(fictício\)/);
  const antes = OR.chamadas.length;
  await p.click('[data-testar]');
  await p.waitForSelector('#teste-resultado .qw-peca');
  const exec = OR.chamadas.slice(antes).find(b => texto(b.messages[0].content).includes('Entregáveis (entregue todos'));
  const sis = texto(exec.messages[0].content);
  assert.match(sis, /Material deste trabalho:\n- Contrato do fornecedor: obrigatório\n- Aditivos do contrato: opcional/);
  assert.match(sis, /5\. Conferir multas e prazos/);
  assert.match(sis, /A sua empresa é a contratante ou a fornecedora nesses contratos\? Contratante/);
  assert.deepEqual(await p.$$eval('.qw-peca-cabeca b', l => l.map(x => x.textContent)), ['Resumo executivo', 'Riscos', 'Obrigações', 'Prazos e multas', 'Informações não encontradas']);
  assert.match(await p.textContent('#teste-resultado .qc'), /Resultado conferido/);
  assert.equal(await p.locator('.qw-canal-nome').count(), 0, 'sem canal, sem grupo de canal');
  assert.equal(await p.locator('.qw-peca [data-csv]').count(), 1, 'a tabela do entregável pode ser baixada');
  assert.ok(await p.locator('[data-ajustar]').isVisible());
  assert.ok(await p.locator('[data-testar]:has-text("Testar novamente")').isVisible());
  assert.doesNotMatch(await p.textContent('#etapa'), TECNICO);
  assert.deepEqual(erros, []);
});

test('Quick Win antigo: "Atualizar para Quick Win inteligente" mostra a estrutura como sugestão; nada muda sem aceitar', async () => {
  const lia = await cliente(N.app, N.base).entrar('lia@empresa-exemplo.com.br');
  const antigo = (await lia.post('/api/quick-wins', { nome: 'Contratos antigos', para_que_serve: CONTRATOS, instrucoes: 'Liste os riscos.', areas: [AREA] })).dados;
  assert.equal(antigo.v2, undefined);
  const p = await N.entrar('lia@empresa-exemplo.com.br');
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto(`${N.base}/app#/quick-wins`);
  await p.waitForSelector('.qw-item');
  const item = p.locator('.qw-item', { hasText: 'Contratos antigos' });
  await item.locator('summary').click();
  await item.locator('a:has-text("Atualizar para Quick Win inteligente")').click();
  await p.waitForSelector('#objetivo');
  assert.match(await p.inputValue('#objetivo'), /Analise contratos de fornecedores/);
  assert.match(await p.textContent('.pagina'), /Atualizando para Quick Win inteligente/);
  await p.click('[data-continuar]');
  await p.waitForSelector('#plano');
  assert.match(await p.textContent('#plano'), /Sugestão: a GreenIA estruturaria este Quick Win assim/);
  assert.equal(await p.locator('#plano-usar').count(), 1);
  // Ainda nada mudou no servidor: o antigo continua sem especificação.
  assert.equal((await lia.get(`/api/quick-wins/${antigo.id}`)).dados.v2, undefined);
  await p.click('#plano-usar');
  await p.waitForSelector('#plano-ok');
  assert.match(await p.textContent('#plano'), /Entendi que este Quick Win vai fazer:/);
  assert.deepEqual(erros, []);
});

test('celular (390px): entendimento, entregáveis e resultado sem rolagem horizontal', async () => {
  const cel = await N.navegador.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  await cel.route(u => !u.href.startsWith(N.base), r => r.abort());
  const p = await N.entrar('leo@empresa-exemplo.com.br', await cel.newPage());
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  const semRolagem = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', CONTRATOS);
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  assert.ok(await semRolagem(), 'entendimento sem rolagem horizontal');
  await p.click('#plano-editar'); await p.waitForSelector('[data-x-rotulo="0"]');
  assert.ok(await semRolagem(), 'edição do plano sem rolagem horizontal');
  await p.click('#plano-editar');
  for (const sel of ['input[name=regra]', '#entregas']) { await p.click('[data-continuar]'); await p.waitForSelector(sel); }
  assert.ok(await semRolagem(), 'entregáveis sem rolagem horizontal');
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  await p.click('[data-testar]'); await p.waitForSelector('#teste-resultado .qw-peca');
  assert.ok(await semRolagem(), 'resultado sem rolagem horizontal');
  assert.deepEqual(erros, []);
  await cel.close();
});
