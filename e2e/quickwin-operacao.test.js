// E2E dos Quick Wins como operações, no navegador: ensinar um trabalho de conteúdo (LinkedIn e Instagram, com
// pesquisa), ajustar as peças, testar com o exemplo contextual, ver o resultado separado por canal com as fontes,
// responder quando a IA pede contexto e continuar, e excluir pelo modal (sem alerta do navegador). Celular.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso, FONTES_FALSAS } from '../test/openrouter-falso.js';
import { arquivo, docx } from '../test/arquivos.js';

const APY = 'Pesquise os temas em alta da semana sobre mineração e, com o contexto da Apy Mine, crie uma copy para LinkedIn, uma legenda para Instagram, um carrossel e um roteiro de Reels.';
const TECNICO = /prompt|temperatura|tokens?\b|json|openrouter|mistral|gpt|claude|provedor|especifica[çc][ãa]o|ROUTING_|classe:|plugin/i;
const MARCA = 'Briefing (a arte final não é gerada aqui)';
let N, OR, modo = 'completo';
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
function responder(b) {
  const sis = texto(b.messages[0].content);
  if (sis.includes('conferente de qualidade')) return '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"canais","ok":true}]}';
  if (sis.includes('Você organiza o pedido')) return '{"colunas":[]}';
  if (!sis.includes('Entregáveis (entregue todos')) return 'Certo.';
  if (modo === 'pergunta') return 'Antes de começar, preciso de uma informação: qual é o público do conteúdo?';
  const titulos = [...sis.matchAll(/\d+\. ## ([^(\n]+?)(?: \(|\n)/g)].map(m => m[1].trim());
  return titulos.map(t => `## ${t}\n${/Carrossel|Reels/.test(t) ? `${MARCA}\nSlide 1: segurança na Apy Mine.` : `Texto da Apy Mine para ${t}.`}`).join('\n\n')
    + (b.plugins ? `\n\n## Fontes da pesquisa\n${FONTES_FALSAS.map(f => `- ${f.titulo}: ${f.url}`).join('\n')}` : '');
}

before(async () => {
  OR = await openRouterFalso({ responder });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], pesquisaWeb: { ativa: true } });
  const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Marketing' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado', areas: [{ id: area, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'rui@empresa-exemplo.com.br', nome: 'Rui Alves', areas: [{ id: area }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  await admin.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo('sobre.docx', docx(['Sobre a Apy Mine: mineradora de médio porte, foco em segurança e sustentabilidade.'])) });
});
after(async () => { await N.fechar(); await OR.fechar(); });

test('operação de conteúdo: peças por canal, pesquisa, exemplo contextual, resultado por canal com fontes, pausa e retomada', async () => {
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('dialog', d => { erros.push(`alerta nativo: ${d.message()}`); d.dismiss(); });
  await N.entrar('lia@empresa-exemplo.com.br', p);
  await p.goto(`${N.base}/app#/qw/nova`);
  await p.waitForSelector('#objetivo');
  await p.fill('#objetivo', APY);
  await p.click('[data-continuar]'); await p.waitForSelector('#processo');
  await p.fill('#processo', 'Sempre começo pela segurança. Evito promessas.');
  await p.click('[data-continuar]'); await p.waitForSelector('input[name=regra]');
  await p.click('[data-continuar]');
  // Resultado: as peças inferidas do pedido, ligadas ao canal; formato único fica escondido.
  await p.waitForSelector('#entregas');
  assert.equal(await p.locator('.entregaveis-lista li').count(), 5);
  assert.ok(await p.locator('input[name=canal][value=linkedin]').isChecked() && await p.locator('input[name=canal][value=instagram]').isChecked());
  assert.ok(await p.locator('#pesquisa-web').isChecked());
  assert.ok(await p.locator('#formato-unico').isHidden());
  assert.match(await p.textContent('#entregas'), /saem como briefing/);
  // Ajuste: carrossel com 8 slides; tira o Reels.
  const carrossel = await p.locator('[data-e-slides]').getAttribute('data-e-slides');
  await p.fill(`[data-e-slides="${carrossel}"]`, '8');
  const reels = await p.evaluate(() => [...document.querySelectorAll('[data-e-tipo]')].find(s => s.value === 'reels').dataset.eTipo);
  await p.click(`[data-e-remover="${reels}"]`);
  await p.waitForFunction(() => document.querySelectorAll('.entregaveis-lista li').length === 4);
  assert.equal(await p.inputValue(`[data-e-slides="${carrossel}"]`), '8', 'o ajuste não se perde ao redesenhar');
  assert.doesNotMatch(await p.textContent('#principal'), TECNICO);
  await p.click('[data-continuar]');
  // Teste: exemplo pronto contextual, com o aviso de fictício.
  await p.waitForSelector('[data-testar]');
  assert.match(await p.textContent('#teste-corpo'), /Exemplo fictício gerado para testar este Quick Win\. Nenhum dado real é usado\./);
  assert.match(await p.textContent('.previa-texto'), /Instagram · Carrossel/);
  const antes = OR.chamadas.length;
  await p.click('[data-testar]');
  await p.waitForSelector('#teste-resultado .qc-ok');
  // Execução em etapas: a coleta (pesquisa) vem primeiro; os entregáveis estão no prompt da produção.
  const exec = OR.chamadas.slice(antes).find(b => !texto(b.messages[0].content).includes('conferente') && texto(b.messages[0].content).includes('Entregáveis (entregue todos'));
  const coleta = OR.chamadas.slice(antes).find(b => b.plugins);
  assert.ok(coleta && /Etapa 1 de 2 desta execução: pesquisa/.test(texto(coleta.messages[0].content)), 'o teste executa de verdade, com pesquisa (etapa de coleta)');
  assert.equal(exec.plugins, undefined, 'a produção usa as notas da pesquisa, sem pesquisar de novo');
  assert.match(texto(exec.messages[0].content), /Instagram · Carrossel \(8 slides[,)]/);
  assert.doesNotMatch(texto(exec.messages[0].content), /Instagram · Reels/);
  // Resultado separado por canal e peça, com fontes; filtro por canal.
  assert.deepEqual(await p.locator('.qw-canal-nome').allTextContents(), ['Geral', 'LinkedIn', 'Instagram']);
  assert.equal(await p.locator('.qw-peca').count(), 4);
  assert.equal(await p.locator('.qw-fontes a').count(), 2);
  assert.equal(await p.locator('.qw-fontes a').first().getAttribute('rel'), 'noopener noreferrer');
  assert.match(await p.textContent('.qc'), /Pesquisa na internet com 2 fontes/);
  assert.ok(await p.locator('.qw-peca .tag:has-text("Briefing")').count() >= 1);
  await p.click('[data-canal="Instagram"]');
  assert.ok(await p.locator('[data-grupo="LinkedIn"]').isHidden());
  assert.ok(await p.locator('[data-grupo="Instagram"]').isVisible());
  assert.ok(await p.locator('[data-ajustar]').isVisible() && await p.locator('[data-testar]:has-text("Testar novamente")').isVisible());
  // A IA pede contexto: a execução pausa; "Responder e continuar" segue a mesma execução.
  modo = 'pergunta';
  await p.click('[data-testar]');
  await p.waitForSelector('[data-responder]');
  assert.match(await p.textContent('.resultado-cabeca'), /A GreenIA precisa de uma informação/);
  assert.equal(await p.locator('[data-continuar]').count(), 0, 'não publica com a execução pausada');
  modo = 'completo';
  await p.fill('#responder-texto', 'Gestores de operação e segurança.');
  await p.click('[data-responder]');
  await p.waitForSelector('#teste-resultado .qc-ok');
  assert.equal(await p.locator('.qw-peca').count(), 4);
  assert.deepEqual(erros, []);
});

test('excluir: só quem gere vê a ação; modal pede o nome; histórico preservado; nenhum alerta do navegador', async () => {
  const p = await N.contexto.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('dialog', d => { erros.push(`alerta nativo: ${d.message()}`); d.dismiss(); });
  await N.entrar('lia@empresa-exemplo.com.br', p);
  const qws = (await (await p.request.get(`${N.base}/api/quick-wins`)).json()).quickWins;
  const q = qws.find(x => /Pesquisar temas|Pesquisar/.test(x.nome)) || qws[0];
  await p.goto(`${N.base}/app#/quick-wins`);
  await p.waitForSelector('.qw-item');
  const item = p.locator('.qw-item', { hasText: q.nome }).first();
  await item.locator('summary').click();
  await item.locator('[data-acao="excluir"]').click();
  await p.waitForSelector('.modal[role=dialog]');
  assert.match(await p.textContent('.modal'), /Excluir este Quick Win\?.*Esta ação remove o Quick Win do catálogo da empresa\. As execuções anteriores e seus registros continuam preservados\./s);
  assert.ok(await p.locator('[data-confirmar]').isDisabled(), 'só confirma digitando o nome');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.modal', { state: 'detached' });
  await item.locator('summary').click();
  await item.locator('[data-acao="excluir"]').click();
  await p.fill('#excluir-nome', 'outro nome');
  assert.ok(await p.locator('[data-confirmar]').isDisabled());
  await p.fill('#excluir-nome', q.nome);
  await p.click('[data-confirmar]');
  await p.waitForFunction(nome => ![...document.querySelectorAll('.qw-item-nome')].some(n => n.textContent === nome), q.nome);
  const linha = N.app.db.prepare('select excluido_em from quick_wins where id = ?').get(q.id);
  assert.ok(linha.excluido_em, 'soft delete');
  assert.ok(N.app.db.prepare('select count(*) as n from conversas where quick_win_id = ?').get(q.id).n >= 1, 'execuções preservadas');
  assert.deepEqual(erros, []);
});

test('celular: etapa de entregas e resultado por canal sem rolagem horizontal; quem só usa não vê "Excluir"', async () => {
  const cel = await N.navegador.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  await cel.route(u => !u.href.startsWith(N.base), r => r.abort());
  const lia = await N.entrar('lia@empresa-exemplo.com.br', await cel.newPage());
  const erros = [];
  lia.on('pageerror', e => erros.push(e.message));
  await lia.goto(`${N.base}/app#/qw/nova`);
  await lia.waitForSelector('#objetivo');
  await lia.fill('#objetivo', APY);
  for (const sel of ['#processo', 'input[name=regra]', '#entregas']) { await lia.click('[data-continuar]'); await lia.waitForSelector(sel); }
  const semRolagem = () => lia.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(await semRolagem(), 'entregas sem rolagem horizontal');
  await lia.click('[data-continuar]'); await lia.waitForSelector('[data-testar]');
  await lia.click('[data-testar]'); await lia.waitForSelector('#teste-resultado .qc');
  assert.ok(await semRolagem(), 'resultado por canal sem rolagem horizontal');
  const id = Number(/qw\/(\d+)/.exec(lia.url())[1]);
  // Publica pela própria sessão da página (mesma proteção de requisição da tela).
  assert.equal(await lia.evaluate(qid => import('/comum.js').then(m => m.api(`/api/quick-wins/${qid}/publicar`, { metodo: 'POST', corpo: {} })).then(r => r.versao), id), 1);
  const rui = await N.entrar('rui@empresa-exemplo.com.br', await cel.newPage());
  await rui.goto(`${N.base}/app#/quick-wins`);
  await rui.waitForSelector('.qw-item');
  await rui.locator('.qw-item summary').first().click();
  assert.ok(await rui.locator('.menu-lista').first().isVisible());
  assert.equal(await rui.locator('[data-acao="excluir"]').count(), 0, 'sem permissão: a ação não aparece');
  assert.deepEqual(erros, []);
  await cel.close();
});
