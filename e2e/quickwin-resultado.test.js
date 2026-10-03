// E2E do resultado modular e do CSV: um Quick Win com resumo, riscos, obrigações, tabela, matriz, ata, decisões,
// próximos passos e relatório mostra um cartão por entregável (nada volta a ser um bloco só); cada tabela baixa
// em CSV com cabeçalho, UTF-8 (BOM), acentos e números (inclusive negativos) intactos. Larguras 320, 390, 768
// e 1280: cartão do plano, materiais, sugestões, lacunas, entregáveis, resultado e tabelas sem rolagem horizontal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';

const PEDIDO = 'Consolide a operação do mês: resumo, riscos, obrigações, tabela de custos, matriz de fornecedores, ata, decisões, próximos passos e relatório.';
const ENTREGAS = [['resumo', 'Resumo'], ['riscos', 'Riscos'], ['lista', 'Obrigações'], ['tabela', 'Tabela de custos'], ['matriz', 'Matriz de fornecedores'], ['ata', 'Ata'], ['lista', 'Decisões'], ['plano_acao', 'Próximos passos'], ['relatorio', 'Relatório']];
const PLANO = { resumo: 'Consolida a operação do mês.', entradas: [{ tipo: 'dados', rotulo: 'Dados do mês', obrigatoria: true }, { tipo: 'transcricao', rotulo: 'Anotações da reunião', obrigatoria: false }],
  etapas: [{ texto: 'Ler os dados' }, { texto: 'Organizar os entregáveis' }], entregaveis: ENTREGAS.map(([tipo, rotulo], i) => ({ id: `e${i + 1}`, tipo, rotulo })),
  lacunas: [{ id: 'periodo', pergunta: 'Qual é o mês de referência da consolidação?', obrigatoria: false }], sugestoes: [{ texto: 'Incluir também um comparativo com o mês anterior?', entregavel: { tipo: 'tabela', rotulo: 'Comparativo mensal' } }] };
const TABELA = '| Categoria | Previsto (R$) | Realizado (R$) | Variação |\n|---|---|---|---|\n| Manutenção | 1.234,50 | 1.100,00 | -10,9% |\n| Peças e serviços | 980,00 | 1.390,25 | +41,9% |\n| Energia elétrica | 2.000,00 | -150,00 | -107,5% |';
const MATRIZ = '| Fornecedor | Preço | Prazo | Risco |\n|---|---|---|---|\n| Ação Ltda. | R$ 10.000 | 30 dias | Médio |\n| Ômega S.A. | R$ 9.500 | 45 dias | Alto |';
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
function responder(b) {
  const sis = texto(b.messages[0].content);
  if (sis.includes('PLANO DE TRABALHO')) return JSON.stringify(PLANO);
  if (sis.includes('conferente de qualidade')) return '{"criterios":[]}';
  if (sis.includes('Você organiza o pedido')) return '{"colunas":[]}';
  if (sis.includes('material FICTÍCIO')) return 'Dados do mês (fictícios): manutenção 1.100,00; peças 1.390,25.\nReunião: decidido trocar o fornecedor Ômega.';
  if (!sis.includes('Entregáveis (entregue todos')) return 'Certo.';
  const corpo = { 'Tabela de custos': TABELA, 'Matriz de fornecedores': MATRIZ };
  return ENTREGAS.map(([, r]) => `## ${r}\n${corpo[r] || `Conteúdo de ${r} (fictício).`}`).join('\n\n') + '\n\n## Informações não encontradas\nNenhuma';
}
let N, OR;
before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados.id;
  for (const e of ['lia', 'w320', 'w390', 'w768', 'w1280']) await admin.post('/api/admin/pessoas', { email: `${e}@empresa-exemplo.com.br`, nome: e, areas: [{ id: area, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
});
after(async () => { await N.fechar(); await OR.fechar(); });

async function ateResultado(p) {
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', PEDIDO);
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('#entregas');
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  await p.click('[data-testar]'); await p.waitForSelector('#teste-resultado .qw-peca');
}

test('resultado modular: um cartão por entregável e CSV de cada tabela (UTF-8, acentos e números intactos)', async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route(u => !u.href.startsWith(N.base), r => r.abort());
  const p = await N.entrar('lia@empresa-exemplo.com.br', await ctx.newPage());
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await ateResultado(p);
  assert.deepEqual(await p.$$eval('#teste-resultado .qw-peca-cabeca b', l => l.map(x => x.textContent)), [...ENTREGAS.map(([, r]) => r), 'Informações não encontradas']);
  assert.equal(await p.locator('#teste-resultado .resultado-corpo.bolha-ia').count(), 0, 'não é um bloco só');
  assert.equal(await p.locator('#teste-resultado .qw-peca [data-csv]').count(), 2, 'tabela e matriz, cada uma com o seu CSV');
  const baixar = async i => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.locator('#teste-resultado .qw-peca [data-csv]').nth(i).click()]);
    return readFileSync(await d.path(), 'utf8');
  };
  const csv = await baixar(0);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'UTF-8 com BOM (acentos certos no Excel)');
  assert.deepEqual(csv.slice(1).split('\r\n'), ['Categoria;Previsto (R$);Realizado (R$);Variação', 'Manutenção;1.234,50;1.100,00;-10,9%', 'Peças e serviços;980,00;1.390,25;+41,9%', 'Energia elétrica;2.000,00;-150,00;-107,5%']);
  const matriz = await baixar(1);
  assert.deepEqual(matriz.slice(1).split('\r\n')[0].split(';'), ['Fornecedor', 'Preço', 'Prazo', 'Risco'], 'a segunda tabela é a da matriz (índices por cartão)');
  assert.match(matriz, /Ômega S\.A\.;R\$ 9\.500;45 dias;Alto/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [320, 390, 768, 1280]) test(`largura ${largura}px: plano, materiais, sugestões, lacunas, entregáveis e resultado sem rolagem horizontal`, async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: largura, height: 900 } });
  await ctx.route(u => !u.href.startsWith(N.base), r => r.abort());
  const p = await N.entrar(`w${largura}@empresa-exemplo.com.br`, await ctx.newPage());
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  const semRolagem = async onde => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${largura}px: ${onde}`);
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', PEDIDO);
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  assert.ok(await p.locator('#plano-lacunas').isVisible() && await p.locator('[data-sugestao]').isVisible());
  await semRolagem('cartão do plano com lacunas e sugestões');
  await p.click('#plano-editar'); await p.waitForSelector('[data-x-rotulo="1"]');
  await semRolagem('materiais e etapas em edição');
  await p.click('#plano-editar');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('#entregas');
  await semRolagem('entregáveis');
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  await p.click('[data-testar]'); await p.waitForSelector('#teste-resultado .qw-peca');
  await semRolagem('resultado modular com tabelas');
  // A tabela larga rola dentro do próprio cartão, nunca a página.
  assert.ok(await p.locator('#teste-resultado .qw-peca [data-csv]').first().isVisible(), 'botão de CSV visível');
  assert.deepEqual(erros, []);
  await ctx.close();
});
