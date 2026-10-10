// Produção visual entre empresas (multiempresa): artefato, prévia, download, edição, imagens e identidade visual de
// uma empresa não são alcançáveis a partir de outra (um banco por empresa; o id de uma não abre nada na outra).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso, PNG_FALSO } from './openrouter-falso.js';
import { um } from '../src/db.js';

const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
function roteiro(b) {
  const s = texto(b.messages[0].content);
  if (s.includes('PLANO DE TRABALHO')) return JSON.stringify({ entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Página executiva', visual: { tipo: 'one_page' } }], etapas: [{ texto: 'Ler' }, { texto: 'Montar' }] });
  if (s.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (s.includes('diretor de arte')) return 'sem plano';
  if (s.includes('Você está executando o Quick Win')) return '## Página executiva\nTítulo: Riscos do contrato Alfa\n\n### Riscos\n- Multa de 20% sem teto.\n\n### Prazos\n- Vigência: 12 meses';
  return 'Certo.';
}
let S, OR, ops, A, B;
before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subirPlataforma({ ia: OR.ia });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company'));
  A = (await ops.post('/api/plataforma/empresas', { name: 'Alfa Ltda', slug: 'alfa', plan_id: plano.id, admin_email: 'ana@alfa.com', status: 'ativa' })).dados;
  B = (await ops.post('/api/plataforma/empresas', { name: 'Beta SA', slug: 'beta', plan_id: plano.id, admin_email: 'bia@beta.com', status: 'ativa' })).dados;
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function enviar(n, conv, corpo) {
  const r = await n.req('POST', `/api/conversas/${conv}/mensagens`, corpo);
  return typeof r.dados === 'string' ? r.dados.trim().split('\n').map(l => JSON.parse(l)) : r;
}

test('isolamento: o artefato visual da empresa A não abre, não baixa e não se edita na empresa B; a identidade visual é por empresa', async () => {
  const ana = S.navegador();
  await ana.get('/alfa');
  assert.equal((await ana.entrarEmpresa('ana@alfa.com')).status, 200);
  // Identidade visual da Alfa: só no banco da Alfa.
  assert.equal((await ana.put('/api/admin/config', { identidadeVisual: { regras: { cores: { primaria: '#7A1F3D' } }, preferencias: {} } })).status, 200);
  const area = (await ana.post('/api/admin/areas', { nome: 'Jurídico' })).dados.id;
  const descricao = 'Analise este contrato e crie uma página executiva com riscos e prazos.';
  const it = (await ana.post('/api/quick-wins/assistente/interpretar', { descricao })).dados;
  const qw = (await ana.post('/api/quick-wins', { assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } }, areas: [area] })).dados;
  const conv = (await ana.post('/api/conversas', { quick_win_id: qw.id, teste: true })).dados.conversa;
  const ev = await enviar(ana, conv.id, { executar_quick_win: true, texto: 'Contrato fictício.' });
  const fim = ev.find(e => e.t === 'fim');
  assert.ok(fim?.artefatos?.length, JSON.stringify(ev.slice(-2)));
  const art = fim.artefatos[0];
  assert.equal((await ana.get(`/api/artefatos/${art.id}`)).status, 200);
  const doA = um(S.P.tenant(A.id).db, 'select identidade from artefatos_visuais where id = ?', art.id);
  assert.match(doA.identidade, /#7A1F3D/, 'a peça da Alfa usa a marca da Alfa');

  const bia = S.navegador();
  await bia.get('/beta');
  assert.equal((await bia.entrarEmpresa('bia@beta.com')).status, 200);
  for (const [m, c, corpo] of [['get', `/api/artefatos/${art.id}`], ['get', `/api/artefatos/${art.id}/paginas/1`], ['get', `/api/artefatos/${art.id}/baixar?formato=pdf`],
    ['req', `/api/artefatos/${art.id}`, { titulo: 'x' }], ['post', `/api/artefatos/${art.id}/derivar`, { tipo: 'poster' }], ['post', `/api/artefatos/${art.id}/imagem`, { imagem: PNG_FALSO }],
    ['post', `/api/artefatos/${art.id}/restaurar`], ['get', `/api/artefatos?conversa=${conv.id}`]]) {
    const r = m === 'req' ? await bia.req('PATCH', c, corpo) : await bia[m](c, corpo);
    assert.equal(r.status, 404, `${m} ${c}`);
  }
  // Banco da Beta: nada da Alfa; a identidade visual da Beta continua a padrão.
  assert.equal(um(S.P.tenant(B.id).db, 'select count(*) as n from artefatos_visuais').n, 0);
  assert.equal(um(S.P.tenant(B.id).db, 'select count(*) as n from visual_assets').n, 0);
  assert.doesNotMatch(JSON.stringify((await bia.get('/api/admin/config')).dados.identidadeVisual || {}), /7A1F3D/);
  // A sessão da Alfa não vale na Beta.
  const cruzada = S.navegador();
  await cruzada.get('/alfa');
  await cruzada.entrarEmpresa('ana@alfa.com');
  cruzada.host = bia.host;
  await cruzada.get('/beta');
  assert.notEqual((await cruzada.get(`/api/artefatos/${art.id}`)).status, 200);
  // Na própria Alfa, a dona continua editando.
  const r = await ana.req('PATCH', `/api/artefatos/${art.id}`, { titulo: 'Novo título' });
  assert.equal(r.status, 200, 'a dona edita');
});
