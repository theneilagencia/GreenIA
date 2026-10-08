import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { construir, promptExecucao, promptQualidade } from '../src/quickwin-construtor.js';
import { salvarConfig } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { sugerirRefinamento, validarAlteracoes } from '../public/qw-refinamento.js';

let S, OR, admin, usuario, q, conv;
let resposta = JSON.stringify({ sugestoes: [{ campo: 'regras', depois: 'Começar pela recomendação.', motivo: 'O resultado testado não apresentou recomendação.' }] });
before(async () => {
  OR = await openRouterFalso({ responder: b => String(b.messages[0].content).includes('Você refina Quick Wins') ? resposta : 'Resumo do material enviado.' });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  await admin.put('/api/admin/modelos/mistralai%2Fmistral-small', { liberado: true, perfil: 'rapido' });
  await admin.post('/api/admin/pessoas', { email: 'usuario@exemplo.com.br', nome: 'Usuário' });
  usuario = await S.cliente().entrar('usuario@exemplo.com.br');
  q = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Resumir documentos', formato: 'resumo' }, toda_empresa: true })).dados;
  conv = (await admin.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
  await enviarMensagem(admin, conv.id, { texto: 'Documento de exemplo com recomendação de revisão.', executar_quick_win: true });
});
after(async () => { await S?.fechar(); await OR?.fechar(); });
const propor = (extra = {}) => admin.post(`/api/quick-wins/${q.id}/refinamento`, { feedback: 'Começar pela recomendação.', conversa_id: conv.id, ...extra });

test('sugestões contextualizadas pela IA não alteram o Quick Win e usam o resultado guardado', async () => {
  const antes = um(S.app.db, 'select * from quick_wins where id = ?', q.id);
  const r = await propor();
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.fonte, 'ia');
  assert.equal(r.dados.sugestoes[0].campo, 'regras');
  assert.deepEqual(um(S.app.db, 'select * from quick_wins where id = ?', q.id), antes);
  const chamada = OR.chamadas.at(-1);
  assert.match(JSON.stringify(chamada.messages), /Resumo do material enviado/);
  assert.match(JSON.stringify(chamada.messages), /Começar pela recomendação/);
  const eventos = todos(S.app.db, "select detalhes from eventos where tipo = 'quickwin.refinement_proposed'");
  assert.doesNotMatch(JSON.stringify(eventos), /recomendação|Resumo do material/);
});

test('exige edição autorizada e teste pertencente à pessoa e ao Quick Win', async () => {
  assert.ok([403, 404].includes((await usuario.post(`/api/quick-wins/${q.id}/refinamento`, { conversa_id: conv.id, feedback: 'Revisar resultado' })).status));
  assert.equal((await propor({ conversa_id: 99999 })).status, 404);
  assert.equal((await propor({ feedback: 'ab' })).status, 422);
});

test('falha da IA oferece orientação explícita, sem interpretar resposta inválida como sugestão', async () => {
  resposta = '{"sugestoes":[{"campo":"permissoes","depois":"admin","motivo":"liberar"}]}';
  const r = await propor();
  assert.equal(r.dados.fonte, 'orientacao');
  assert.equal(r.dados.sugestoes.length, 4);
  resposta = JSON.stringify({ sugestoes: [{ campo: 'regras', depois: 'Começar pela recomendação.', motivo: 'Revisar início' }] });
});

test('sigilo impede enviar material e resultado para análise adicional', async () => {
  exec(S.app.db, 'update conversas set sigilosa = 1 where id = ?', conv.id);
  const n = OR.chamadas.length;
  const r = await propor();
  assert.equal(r.dados.fonte, 'orientacao');
  assert.equal(OR.chamadas.length, n);
  exec(S.app.db, 'update conversas set sigilosa = 0 where id = ?', conv.id);
});

test('aprovação rejeita sugestão desatualizada e conserva a especificação', async () => {
  const proposta = (await propor()).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { assistente: { descricao: 'Resumir documentos com riscos', formato: 'resumo' } });
  const antes = um(S.app.db, 'select especificacao from quick_wins where id = ?', q.id);
  const r = await admin.put(`/api/quick-wins/${q.id}`, { assinatura_refinamento: proposta.assinatura, assistente: { descricao: 'Texto obsoleto', formato: 'resumo' } });
  assert.equal(r.status, 409);
  assert.deepEqual(um(S.app.db, 'select especificacao from quick_wins where id = ?', q.id), antes);
});

test('seleção explícita por campo e limites protegem as regras atuais', () => {
  const s = sugerirRefinamento({ descricao: 'Resumir', feedback: 'Destacar riscos', resultado: { qualidade: { problemas: ['Faltam evidências'] } } });
  assert.match(s[0].motivo, /Faltam evidências/);
  assert.throws(() => validarAlteracoes(s, {}), /Selecione/);
  assert.equal(validarAlteracoes(s, { objetivo: 'Resumir com riscos' }).length, 1);
  assert.throws(() => validarAlteracoes(s, { regras: 'Nova regra' }, ['1','2','3','4','5']), /cinco/);
  assert.throws(() => validarAlteracoes(s, { entregaveis: 'x'.repeat(201) }), /200/);
});

test('orientação dos entregáveis vale na execução e na conferência sem trocar formato ou ferramentas', () => {
  const base = construir({ descricao: 'Resumir documento', formato: 'resumo' });
  const novo = construir({ descricao: 'Resumir documento', formato: 'resumo', formato_descricao: 'Começar pela recomendação.' });
  assert.equal(novo.formato_saida.tipo, base.formato_saida.tipo);
  assert.deepEqual(novo.ferramentas_permitidas, base.ferramentas_permitidas);
  assert.match(promptExecucao(novo), /Começar pela recomendação/);
  assert.match(promptQualidade(novo), /Começar pela recomendação/);
});


test('teste de outro Quick Win não é usado no refinamento', async () => {
  const outro = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Preparar pauta', formato: 'lista' }, toda_empresa: true })).dados;
  const r = await admin.post(`/api/quick-wins/${outro.id}/refinamento`, { feedback: 'Revisar a ordem', conversa_id: conv.id });
  assert.equal(r.status, 404);
});


test('não sobrescreve uma tela aberta antes de mudar o responsável ou o rascunho', async () => {
  const antigo = q.assinatura_rascunho;
  const r = await propor({ assinatura_base: antigo });
  assert.equal(r.status, 409);
});
