// Credencial do OpenRouter pelo mecanismo oficial da GreenIA (console da plataforma), usada pelos Quick Wins
// das empresas: sem variável de ambiente, sem chave real (a chave do teste é gerada na hora e nunca é gravada),
// com o plugin web e data_collection='deny', nos três níveis, com citações no formato documentado do OpenRouter,
// isolamento entre empresas e ausência de chave sem simular pesquisa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { criarOpenRouter, criarIndisponivel } from '../src/ia.js';
import { json, um } from '../src/db.js';
import * as OP from '../src/quickwin-operacao.js';
import { arquivo, docx } from './arquivos.js';

// Formato das citações do plugin web no streaming (docs do OpenRouter, "Web Search" / "url_citation"):
// as anotações chegam num chunk próprio em choices[0].delta.annotations, com url_citation aninhado e índices.
// Fixture sanitizada: domínios .exemplo, sem chave, sem conteúdo real.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/openrouter-web-stream.json', import.meta.url), 'utf8'));
const FONTES = FIXTURE.fontes;
const anotacoes = (b, fontes, meta) => FIXTURE.chunks.map(c => ({ ...meta, ...c }));

const CHAVE = 'sk-or-v1-' + randomBytes(32).toString('hex');   // gerada no teste; não é chave de verdade
const PEDIDO_A = 'Pesquise temas recentes relacionados à inteligência artificial aplicada à mineração e selecione os mais relevantes.';
const PEDIDO_F = 'Pesquise temas em alta relacionados à mineração e conecte os temas ao contexto de atuação da empresa. A partir disso, crie conteúdos para LinkedIn e Instagram: copy, carrossel e imagem para o LinkedIn; legenda, carrossel, imagem e roteiro de Reels para o Instagram.';
const CONTEXTO = 'Empresa B2B de tecnologia para mineração, focada em organização documental, compliance, fornecedores e reporte. Público: gestores de compliance e suprimentos de mineradoras. Tom: técnico e direto.';
const pasta = mkdtempSync(join(tmpdir(), 'greenia-credqw-'));
let S, OR, ops, A, B, ana, bia;

const sistemaDe = b => JSON.stringify(b.messages[0].content);
const ehConferencia = b => sistemaDe(b).includes('conferente de qualidade');
function roteiro(b) {
  if (ehConferencia(b)) return '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"canais","ok":true},{"id":"pesquisa","ok":true},{"id":"contexto_empresa","ok":true}]}';
  const sis = sistemaDe(b);
  if (!sis.includes('Entregáveis (entregue todos')) return 'Temas: (1) IA na gestão de rejeitos [1]; (2) visão computacional em segurança [2].';
  const titulos = [...sis.matchAll(/\d+\. ## ([^\\(]+?)(?: \(|\\n|")/g)].map(m => m[1].trim());
  const ctx = sis.includes('organização documental') ? 'compliance e organização documental' : 'a empresa';
  const corpo = titulos.map(t => `## ${t}\n${/Imagem|Carrossel|Reels/.test(t) ? `${OP.MARCA_BRIEFING}\n${/Reels/.test(t) ? 'Roteiro: cena 1, cena 2, cena 3' : 'Slide 1'} sobre ${ctx}.` : `Texto sobre ${ctx} para ${t}.`}`).join('\n\n');
  return corpo + (b.plugins ? `\n\n## ${OP.SECAO_FONTES}\n${FONTES.map(f => `- ${f.titulo}: ${f.url}`).join('\n')}` : '\n\nPesquisa na internet não realizada.');
}

async function empresa(nome, slug, email) {
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company'));
  const c = (await ops.post('/api/plataforma/empresas', { name: nome, slug, plan_id: plano.id, admin_email: email, status: 'ativa' })).dados;
  const n = S.navegador();
  await n.get(`/${slug}`);
  assert.equal((await n.entrarEmpresa(email)).status, 200);
  return { c, n };
}
async function criarQw(cli, descricao) {
  const area = (await cli.post('/api/admin/areas', { nome: 'Marketing' + Math.random() })).dados.id;
  const r = await cli.post('/api/quick-wins', { assistente: { descricao }, areas: [area] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r.dados;
}
async function executar(cli, qwId, texto, modelo) {
  const conv = (await cli.post('/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(cli, conv.id, { texto, executar_quick_win: true, ...(modelo ? { modelo } : {}) });
  return { ...r, conv, chamadas: OR.chamadas.slice(antes), autorizacoes: OR.autorizacoes.slice(antes) };
}

before(async () => {
  OR = await openRouterFalso({ responder: roteiro, chave: CHAVE, fontes: FONTES, anotacoes });
  // Produção sem OPENROUTER_API_KEY: a IA padrão é a indisponível (nunca a simulada). O cliente real do
  // OpenRouter é criado com a chave que o admin informa no console (só o endereço aponta para o servidor falso).
  S = await subirPlataforma({ banco: join(pasta, 'plataforma.sqlite'), chaveMestra: randomBytes(32), chaveVariavel: null, ia: criarIndisponivel(),
    criarIA: chave => criarOpenRouter({ chave, base: OR.base }) });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  ({ c: A, n: ana } = await empresa('Mina Docs Tecnologia (fictícia)', 'minadocs', 'ana@minadocs.exemplo'));
  ({ c: B, n: bia } = await empresa('Beta Fictícia SA', 'betaf', 'bia@betaf.exemplo'));
  for (const n of [ana, bia]) assert.equal((await n.put('/api/admin/config', { pesquisaWeb: { ativa: true } })).status, 200);
});
after(async () => { await S?.fechar(); await OR?.fechar(); rmSync(pasta, { recursive: true, force: true }); });

test('sem credencial configurada: o Quick Win de pesquisa não quebra, não simula e não chama o provedor', async () => {
  assert.equal((await ops.get('/api/plataforma/consumo')).dados.chaveConfig.origem, null, 'OPENROUTER_CREDENTIAL_CONFIGURED=false');
  const q = await criarQw(ana, PEDIDO_A);
  const r = await executar(ana, q.id, 'Execute agora.');
  assert.equal(r.status, 200);
  assert.ok(r.falha, 'avisa que não foi possível gerar');
  assert.equal(r.chamadas.length, 0, 'nada chegou ao OpenRouter');
  assert.doesNotMatch(JSON.stringify(r.eventos), /simulad|OPENROUTER_API_KEY/i);
  assert.equal(r.fim?.fontes?.length ?? 0, 0, 'nenhuma fonte inventada');
});

test('admin da empresa não configura a chave; a do console é testada, cifrada e nunca volta', async () => {
  for (const n of [ana, bia]) assert.notEqual((await n.put('/api/plataforma/openrouter/chave', { chave: CHAVE })).status, 200);
  const ok = await ops.put('/api/plataforma/openrouter/chave', { chave: CHAVE });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  assert.equal(ok.dados.chaveConfig.origem, 'console', 'OPENROUTER_CREDENTIAL_CONFIGURED=true');
  assert.equal(JSON.stringify(ok.dados).includes(CHAVE), false);
  assert.equal(JSON.stringify((await ops.get('/api/plataforma/consumo')).dados).includes(CHAVE), false);
  assert.equal(S.P.db.prepare("select value from platform_settings where key = 'openrouter_chave'").get().value.includes(CHAVE.slice(9)), false);
  // Nada da chave nas telas e no banco das empresas.
  for (const [n, c] of [[ana, A], [bia, B]]) {
    assert.equal(JSON.stringify((await n.get('/api/admin/config')).dados).includes(CHAVE.slice(9)), false);
    assert.equal(JSON.stringify(S.P.tenant(c.id).db.prepare("select * from eventos").all()).includes(CHAVE.slice(9)), false);
  }
});

test('A: pesquisa com a chave do console, plugin web, data_collection=deny, fontes reais do payload e tool_used só com metadados', async () => {
  const q = await criarQw(ana, PEDIDO_A);
  assert.deepEqual(json(um(S.P.tenant(A.id).db, 'select especificacao from quick_wins where id = ?', q.id).especificacao).ferramentas_permitidas, ['pesquisa_web']);
  const r = await executar(ana, q.id, 'Execute agora.');
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(r.falha, undefined, JSON.stringify(r.falha));
  assert.ok(r.autorizacoes.length && r.autorizacoes.every(a => a === `Bearer ${CHAVE}`), 'toda chamada saiu com a chave do console');
  const exec = r.chamadas.find(b => !ehConferencia(b));
  assert.deepEqual(exec.plugins, [{ id: 'web', max_results: 5 }]);
  assert.equal(exec.provider.data_collection, 'deny');
  assert.ok(r.chamadas.filter(ehConferencia).every(b => !b.plugins && b.provider.data_collection === 'deny'));
  assert.deepEqual(r.fim.fontes.filter(f => f.url).map(f => [f.url, f.titulo]), FONTES.map(f => [f.url, f.titulo]));
  const ev = json(um(S.P.tenant(A.id).db, "select detalhes from eventos where tipo = 'quickwin.tool_used' order by id desc limit 1").detalhes);
  assert.equal(ev.ferramenta, 'pesquisa_web');
  assert.equal(ev.fontes, FONTES.length);
  assert.doesNotMatch(JSON.stringify(ev), /http|mineração|Bearer|sk-or/, 'evento só com metadados');
});

test('três níveis: Rápido, Equilibrado e Avançado usam o modelo configurado, a mesma chave, web e deny', async () => {
  const q = await criarQw(ana, PEDIDO_A);
  // O Avançado não é liberado para todos por padrão (governança): o admin libera para este teste.
  assert.equal((await ana.put('/api/admin/modelos-config', { acessoPerfis: { avancado: { todos: true, grupos: [], areas: [] } } })).status, 200);
  const padroes = (await ana.get('/api/admin/modelos')).dados.config.padroes;
  for (const nivel of ['rapido', 'equilibrado', 'avancado']) {
    // O nível do Quick Win é a classe fixada por quem o administra (sem troca na conversa).
    const up = await ana.put(`/api/quick-wins/${q.id}`, { modelo: `classe:${nivel}`, pode_trocar: false });
    assert.equal(up.status, 200, JSON.stringify(up.dados));
    const r = await executar(ana, q.id, 'Execute agora.');
    assert.equal(r.falha, undefined, `${nivel}: ${JSON.stringify(r.falha)}`);
    const exec = r.chamadas.find(b => !ehConferencia(b));
    assert.equal(exec.model, padroes[nivel], `${nivel}: modelo`);
    assert.ok(r.autorizacoes.every(a => a === `Bearer ${CHAVE}`), `${nivel}: chave`);
    assert.deepEqual(exec.plugins, [{ id: 'web', max_results: 5 }], `${nivel}: plugin`);
    assert.equal(exec.provider.data_collection, 'deny', `${nivel}: deny`);
    assert.equal(r.fim.fontes.filter(f => f.url).length, FONTES.length, `${nivel}: fontes`);
  }
});

test('F: pesquisa + contexto da empresa + entregáveis separados por canal, briefing nas imagens e roteiro de Reels', async () => {
  // Contexto empresarial fictício na base da empresa toda (o mesmo caminho do produto).
  assert.equal((await ana.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo('sobre.docx', docx([CONTEXTO])) })).status, 200);
  const q = await criarQw(ana, PEDIDO_F);
  const r = await executar(ana, q.id, 'Faça o trabalho desta semana.');
  assert.equal(r.falha, undefined, JSON.stringify(r.falha));
  const exec = r.chamadas.find(b => !ehConferencia(b));
  assert.deepEqual(exec.plugins, [{ id: 'web', max_results: 5 }]);
  assert.match(sistemaDe(exec), /organização documental/, 'contexto da empresa enviado');
  for (const t of ['LinkedIn · Copy', 'LinkedIn · Carrossel', 'LinkedIn · Imagem', 'Instagram · Legenda', 'Instagram · Carrossel', 'Instagram · Imagem', 'Instagram · Reels'])
    assert.match(r.texto, new RegExp(`## ${t}`), t);
  for (const t of ['LinkedIn · Imagem', 'Instagram · Imagem']) assert.match(r.texto.split(`## ${t}`)[1], new RegExp(OP.MARCA_BRIEFING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r.texto.split('## Instagram · Reels')[1], /Roteiro/);
  assert.equal(r.fim.qualidade.pesquisa.feita, true);
  assert.equal(r.fim.qualidade.pesquisa.fontes, FONTES.length);
  assert.equal(r.fim.qualidade.status, 'aprovado');
});

test('isolamento: a empresa B não lê a credencial nem a configura; sem liberar pesquisa, nada de plugin e resultado parcial', async () => {
  assert.notEqual((await bia.get('/api/plataforma/consumo')).status, 200);
  assert.equal((await bia.put('/api/admin/config', { pesquisaWeb: { ativa: false } })).status, 200);
  const q = await criarQw(bia, PEDIDO_A);
  const r = await executar(bia, q.id, 'Execute agora.');
  assert.equal(r.falha, undefined);
  assert.ok(r.chamadas.every(b => !b.plugins), 'sem pesquisa quando a empresa não liberou');
  assert.equal(r.fim.qualidade.pesquisa.feita, false);
  assert.equal(r.fim.fontes?.filter(f => f.url).length ?? 0, 0);
  // Nenhum dado da empresa A no banco da B.
  assert.equal(JSON.stringify(S.P.tenant(B.id).db.prepare('select * from mensagens').all()).includes('organização documental'), false);
});
