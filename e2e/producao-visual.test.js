// E2E da produção visual pelo navegador: um Quick Win cujo resultado é uma apresentação (artefato visual) e um
// resumo em texto. A tela de teste mostra ARTEFATOS com a miniatura real, o visualizador navega entre as páginas,
// o PDF é baixado de verdade (cabeçalho %PDF, todas as páginas), o PNG da página também, e a edição cria uma nova
// versão sem refazer a execução. Larguras 390 e 1280 sem rolagem horizontal. As capturas ficam em capturas/tmp
// para a conferência visual (nada de validar só o DOM).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { inspecionarImagem } from '../src/visual/assets.js';

const PEDIDO = 'Transforme o relatório do trimestre em uma apresentação de 6 slides para a diretoria e um resumo curto para e-mail.';
const PLANO = { resumo: 'Apresentação executiva do trimestre e resumo para e-mail.', entradas: [{ tipo: 'documento', rotulo: 'Relatório do trimestre', obrigatoria: true }],
  etapas: [{ texto: 'Ler o relatório' }, { texto: 'Separar resultados, riscos e decisões' }, { texto: 'Montar a narrativa' }],
  entregaveis: [{ id: 'e1', tipo: 'apresentacao', rotulo: 'Apresentação para a diretoria', visual: { tipo: 'presentation', paginas: 6, publico: 'diretoria' } }, { id: 'e2', tipo: 'resumo', rotulo: 'Resumo para e-mail' }],
  ferramentas: ['leitura_documento'] };
const DECK = `Título: Resultados do 3º trimestre

### Resultados do 3º trimestre
Receita acima da meta e custos sob controle.

### Indicadores do trimestre
- Receita: R$ 4,2 mi
- Margem: 18%
- Clientes ativos: 312

### Receita por mês
| Mês | Receita |
|---|---|
| Julho | R$ 1,3 mi |
| Agosto | R$ 1,4 mi |
| Setembro | R$ 1,5 mi |

### Riscos
- Concentração de 40% da receita em 3 clientes.
- Atraso na contratação de 2 vendedores.

### Processo de aprovação
Proposta -> Revisão financeira -> Aprovado? -> (sim) Executar
Aprovado? -> (não) Ajustar proposta

### Próximos passos
Chamada: Aprovar o orçamento de marketing do 4º trimestre`;
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
function responder(b) {
  const sis = texto(b.messages[0].content);
  if (sis.includes('PLANO DE TRABALHO')) return JSON.stringify(PLANO);
  if (sis.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (sis.includes('Você organiza o pedido')) return '{"colunas":[]}';
  if (sis.includes('material FICTÍCIO')) return 'RELATÓRIO DO TRIMESTRE (fictício)\nReceita: R$ 4,2 mi. Margem: 18%.';
  // Diretor de arte: um plano por seção, com o gráfico da tabela (o caminho da IA, validado pelo servidor).
  if (sis.includes('diretor de arte')) {
    const ids = [...texto(b.messages[1].content).matchAll(/^(s\d+)\.(i\d+) \((\w+)/gm)].map(m => ({ s: m[1], id: `${m[1]}.${m[2]}`, tipo: m[3] }));
    const secoes = [...new Set(ids.map(x => x.s))];
    return JSON.stringify({ paginas: secoes.map((s, k) => ({ papel: k === 0 ? 'capa' : 'conteudo', layout: k === 0 ? 'capa' : 'auto', titulo: '', blocos: k === 0 ? [] : ids.filter(x => x.s === s).map(x => ({ tipo: x.tipo === 'tabela' ? 'grafico' : x.tipo === 'fluxo' ? 'diagrama' : x.tipo === 'indicadores' ? 'indicadores' : x.tipo === 'lista' ? 'lista' : 'texto', refs: [x.id], ...(x.tipo === 'tabela' ? { grafico: { tipo: 'barras', series: [1] } } : {}) })) })) });
  }
  if (!sis.includes('Entregáveis (entregue todos')) return 'Certo.';
  return `## Apresentação para a diretoria\n${DECK}\n\n## Resumo para e-mail\nReceita de R$ 4,2 mi, margem de 18%. Decisão pedida: orçamento de marketing.\n\n## Informações não encontradas\nNenhuma`;
}
let N, OR;
before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Diretoria' })).dados.id;
  for (const e of ['lia', 'w390']) await admin.post('/api/admin/pessoas', { email: `${e}@empresa-exemplo.com.br`, nome: e, areas: [{ id: area, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  mkdirSync('capturas/tmp', { recursive: true });
});
after(async () => { await N.fechar(); await OR.fechar(); });

async function ateArtefatos(p) {
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', PEDIDO);
  await p.click('[data-continuar]'); await p.waitForSelector('#plano');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]'); await p.waitForSelector('#entregas');
  await p.click('[data-continuar]'); await p.waitForSelector('[data-testar]');
  await p.click('[data-testar]'); await p.waitForSelector('#teste-resultado .artefato', { timeout: 30000 });
}
const semRolagem = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('artefato visual: cartão com miniatura real, visualizador multipágina, PDF e PNG baixados, edição em nova versão', async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route(u => !u.href.startsWith(N.base), r => r.abort());
  const p = await N.entrar('lia@empresa-exemplo.com.br', await ctx.newPage());
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await ateArtefatos(p);
  const cartao = p.locator('#teste-resultado .artefato').first();
  assert.match(await cartao.innerText(), /Apresentação para a diretoria/);
  assert.match(await cartao.innerText(), /6 páginas/);
  assert.match(await cartao.innerText(), /Pronto/);
  assert.doesNotMatch(await p.locator('#teste-resultado').innerText(), /"paginas"|\{"|refs|blocos/, 'nada de JSON na tela');
  // Miniatura real (a imagem carregou e tem a proporção 16:9 do formato).
  await p.waitForFunction(() => { const i = document.querySelector('.artefato-miniatura img'); return i && i.complete && i.naturalWidth > 0; });
  const prop = await p.evaluate(() => { const i = document.querySelector('.artefato-miniatura img'); return i.naturalWidth / i.naturalHeight; });
  assert.ok(Math.abs(prop - 16 / 9) < 0.02, `proporção ${prop}`);
  // O resumo em texto continua como entregável comum (a produção visual não engoliu o resto).
  assert.match(await p.locator('#resultado-teste').innerText(), /Resumo para e-mail/);
  await p.screenshot({ path: 'capturas/tmp/visual-cartao-1280.png', fullPage: false });
  // Visualizador: navega pelas 6 páginas, cada uma uma imagem real.
  await cartao.locator('button[data-ver]').first().click();
  await p.waitForSelector('.modal-visual #vis-img');
  for (let n = 1; n <= 6; n++) {
    await p.waitForFunction(k => { const i = document.querySelector('#vis-img'); return i.complete && i.naturalWidth > 0 && i.src.includes(`/paginas/${k}?`); }, n);
    assert.match(await p.locator('#vis-pag').innerText(), new RegExp(`Página ${n} de 6`));
    if (n === 1 || n === 4) await p.screenshot({ path: `capturas/tmp/visual-visualizador-p${n}.png` });
    if (n < 6) await p.click('[data-prox]');
  }
  assert.equal(await p.locator('[data-prox]').isDisabled(), true);
  await p.keyboard.press('ArrowLeft');
  assert.match(await p.locator('#vis-pag').innerText(), /Página 5 de 6/);
  // PDF de verdade, com todas as páginas.
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal-visual a[href*="formato=pdf"]')]);
  const pdf = readFileSync(await dl.path());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 6);
  assert.match(dl.suggestedFilename(), /\.pdf$/);
  // PNG da página atual (5).
  const [dp] = await Promise.all([p.waitForEvent('download'), p.click('[data-pagina-png]')]);
  const png = inspecionarImagem(readFileSync(await dp.path()));
  assert.equal(png.mime, 'image/png');
  assert.equal(png.w, 1920, 'página 16:9 exportada em 1,5x');
  await p.keyboard.press('Escape');
  // Editor: muda o título e salva; o cartão vira a versão 2, conferida de novo.
  await cartao.locator('[data-editar]').click();
  await p.waitForSelector('#ed-titulo');
  await p.fill('#ed-titulo', 'Resultados do trimestre para a diretoria');
  await p.screenshot({ path: 'capturas/tmp/visual-editor.png' });
  await p.click('#ed-salvar');
  await p.waitForFunction(() => /versão 2/.test(document.querySelector('#teste-resultado .artefato')?.innerText || ''));
  assert.match(await p.locator('#teste-resultado .artefato').first().innerText(), /Resultados do trimestre para a diretoria/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('celular (390px): cartão e visualizador sem rolagem horizontal, página inteira visível', async () => {
  const ctx = await N.navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.route(u => !u.href.startsWith(N.base), r => r.abort());
  const p = await N.entrar('w390@empresa-exemplo.com.br', await ctx.newPage());
  await ateArtefatos(p);
  await p.locator('#teste-resultado .artefato').scrollIntoViewIfNeeded();
  assert.ok(await semRolagem(p), 'sem rolagem horizontal com os artefatos');
  await p.screenshot({ path: 'capturas/tmp/visual-cartao-390.png', fullPage: false });
  await p.locator('#teste-resultado .artefato button[data-ver]').first().click();
  await p.waitForFunction(() => { const i = document.querySelector('#vis-img'); return i && i.complete && i.naturalWidth > 0; });
  const caixa = await p.locator('#vis-img').boundingBox();
  assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390 + 1, 'a página cabe na largura');
  assert.ok(await semRolagem(p));
  await p.screenshot({ path: 'capturas/tmp/visual-visualizador-390.png' });
  await ctx.close();
});
