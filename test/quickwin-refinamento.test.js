import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { construir, promptExecucao, promptQualidade, normalizar, conferirComCorrecao } from '../src/quickwin-construtor.js';
import { salvarConfig } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { sugerirRefinamento, validarAlteracoes } from '../public/qw-refinamento.js';

let S, OR, admin, usuario, q, conv;
let resposta = JSON.stringify({ sugestoes: [{ campo: 'regras', depois: 'Começar pela recomendação.', motivo: 'O resultado testado não apresentou recomendação.' }] });
before(async () => {
  OR = await openRouterFalso({ responder: b => String(b.messages[0].content).includes('Você refina Quick Wins') ? (typeof resposta === 'function' ? resposta(b) : resposta) : 'Resumo do material enviado.' });
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

test('falha da IA mantém feedback sem inventar sugestões nem alterar o rascunho', async () => {
  resposta = '{"sugestoes":[{"campo":"permissoes","depois":"admin","motivo":"liberar"}]}';
  const r = await propor();
  assert.equal(r.dados.fonte, 'indisponivel');
  assert.equal(r.dados.sugestoes.length, 0);
  assert.match(r.dados.mensagem, /orientação foi mantida/);
  resposta = JSON.stringify({ sugestoes: [{ campo: 'regras', depois: 'Começar pela recomendação.', motivo: 'Revisar início' }] });
});

test('sigilo impede enviar material e resultado para análise adicional', async () => {
  exec(S.app.db, 'update conversas set sigilosa = 1 where id = ?', conv.id);
  const n = OR.chamadas.length;
  const r = await propor();
  assert.equal(r.dados.fonte, 'indisponivel');
  assert.equal(OR.chamadas.length, n);
  exec(S.app.db, 'update conversas set sigilosa = 0 where id = ?', conv.id);
});

test('recupera proposta que eliminou a escolha e explica a validação na segunda tentativa', async () => {
  const antes = um(S.app.db, 'select * from quick_wins where id = ?', q.id);
  const n = OR.chamadas.length;
  let tentativas = 0;
  const original = resposta;
  try {
    resposta = b => {
      tentativas++;
      if (tentativas === 1) return JSON.stringify({ sugestoes: [{ campo: 'processo', depois: 'Sugira três temas e escreva um artigo.', motivo: 'Organizar a entrega.' }] });
      assert.match(b.messages[0].content, /decisao_humana_ausente/);
      assert.match(b.messages[0].content, /Espere minha escolha antes de produzir o resultado final/);
      return JSON.stringify({ sugestoes: [{ campo: 'processo', depois: 'Sugira três temas. Espere minha escolha antes de produzir o resultado final. Escreva até 200 palavras com um exemplo em três passos.', motivo: 'Preserva a escolha e reduz o texto genérico.' }] });
    };
    const r = await propor({ feedback: 'Primeiro sugira três temas e aguarde minha escolha antes de escrever até 200 palavras.' });
    assert.equal(r.dados.fonte, 'ia');
    assert.equal(OR.chamadas.length - n, 2);
    assert.match(r.dados.sugestoes[0].depois, /200 palavras/);
    assert.deepEqual(um(S.app.db, 'select * from quick_wins where id = ?', q.id), antes);
  } finally { resposta = original; }
});

test('reabrir recupera resultado, material e histórico próprio sem refazer o editor', async () => {
  const r = await admin.get(`/api/quick-wins/${q.id}/refinamento?conversa=${conv.id}`);
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.teste.conversa, conv.id);
  assert.equal(r.dados.teste.saida, 'Resumo do material enviado.');
  assert.match(r.dados.teste.texto, /Documento de exemplo/);
  assert.equal(r.dados.teste.disponivel, true);
  assert.equal(r.dados.historico.length, 1);
  assert.ok([403, 404].includes((await usuario.get(`/api/quick-wins/${q.id}/refinamento?conversa=${conv.id}`)).status));
});

test('repete material guardado em novo teste e mantém ligação para comparar após reabrir', async () => {
  const novo = (await admin.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
  const r = await enviarMensagem(admin, novo.id, { repetir_conversa_id: conv.id, texto: 'NÃO USAR ESTE TEXTO' });
  assert.equal(r.status, 200, JSON.stringify(r));
  const mensagens = todos(S.app.db, 'select texto from mensagens where conversa_id = ? and papel = ?', novo.id, 'user');
  assert.equal(mensagens[0].texto, 'Documento de exemplo com recomendação de revisão.');
  const contexto = (await admin.get(`/api/quick-wins/${q.id}/refinamento?conversa=${novo.id}`)).dados;
  assert.equal(contexto.teste.qualidade.conversa_base, conv.id);
  assert.equal(contexto.anterior.conversa, conv.id);
  assert.equal(contexto.anterior.saida, 'Resumo do material enviado.');
  const deNovo = await admin.req('POST', `/api/conversas/${novo.id}/mensagens`, { repetir_conversa_id: conv.id });
  assert.equal(deNovo.status, 409);
});

test('repetição recusa conversa de outra pessoa, outro Quick Win e conversa regular como destino', async () => {
  const outro = (await admin.post('/api/quick-wins', { assistente: { descricao: 'Preparar pauta', formato: 'lista' }, toda_empresa: true })).dados;
  const nova = (await admin.post('/api/conversas', { quick_win_id: outro.id, teste: true })).dados.conversa;
  assert.equal((await admin.req('POST', `/api/conversas/${nova.id}/mensagens`, { repetir_conversa_id: conv.id })).status, 404);
  const regular = (await admin.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  assert.equal((await admin.req('POST', `/api/conversas/${regular.id}/mensagens`, { repetir_conversa_id: conv.id })).status, 409);
  const usuarioConv = (await usuario.post('/api/conversas', {})).dados.conversa;
  exec(S.app.db, 'update conversas set quick_win_id = ? where id = ?', q.id, usuarioConv.id);
  assert.equal((await admin.get(`/api/quick-wins/${q.id}/refinamento?conversa=${usuarioConv.id}`)).status, 404);
});

test('retenção impede repetir ou analisar conteúdo não guardado', async () => {
  const antes = um(S.app.db, "select id, texto from mensagens where conversa_id = ? and papel = 'user'", conv.id);
  exec(S.app.db, 'update mensagens set texto = ? where id = ?', '[Conteúdo processado e não guardado, pela política de retenção da empresa.]', antes.id);
  try {
    assert.equal((await admin.get(`/api/quick-wins/${q.id}/refinamento?conversa=${conv.id}`)).dados.teste.disponivel, false);
    const n = OR.chamadas.length;
    const proposta = await propor();
    assert.equal(proposta.dados.fonte, 'indisponivel');
    assert.match(proposta.dados.mensagem, /retenção/);
    assert.equal(OR.chamadas.length, n);
    const novo = (await admin.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
    assert.equal((await admin.req('POST', `/api/conversas/${novo.id}/mensagens`, { repetir_conversa_id: conv.id })).status, 409);
  } finally { exec(S.app.db, 'update mensagens set texto = ? where id = ?', antes.texto, antes.id); }
});

test('resultado de execução regular pode ser refinado sem usar resposta de conversa posterior', async () => {
  const regular = (await admin.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  const executada = await enviarMensagem(admin, regular.id, { texto: 'Material desta execução regular.', executar_quick_win: true });
  assert.equal(executada.status, 200);
  const respostaId = executada.fim.id;
  exec(S.app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'assistant', ?, ?)", regular.id, 'Conversa posterior sem conferência.', new Date().toISOString());
  const c = (await admin.get(`/api/quick-wins/${q.id}/refinamento?conversa=${regular.id}`)).dados;
  assert.equal(c.teste.saida, 'Resumo do material enviado.');
  assert.notEqual(c.teste.saida, 'Conversa posterior sem conferência.', new Date().toISOString());
  const r = await propor({ conversa_id: regular.id });
  assert.equal(r.dados.fonte, 'ia');
  assert.doesNotMatch(JSON.stringify(OR.chamadas.at(-1).messages), /Conversa posterior sem conferência/);
  assert.ok(respostaId);
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


test('processo aprovado orienta execução e conferência sem trocar contrato, regras ou ferramentas', async () => {
  const base = construir({ descricao: 'Comparar propostas', formato: 'tabela', colunas: ['Fornecedor', 'Preço', 'Prazo'], colunas_origem: 'pessoa', regras: ['nao_inventar'] });
  const e = construir({ ...base.origem, como: { modo: 'explicar', texto: 'Antes da tabela, indicar a proposta de menor preço e ressalvar o prazo ausente. Não decidir contratação.' } });
  assert.deepEqual(e.formato_saida, base.formato_saida);
  assert.deepEqual(e.ferramentas_permitidas, base.ferramentas_permitidas);
  assert.deepEqual(e.regras, base.regras);
  const n = normalizar(e);
  assert.equal(n.criterios_qualidade.filter(c => c.id === 'processo_confirmado').length, 1);
  assert.equal(normalizar(n).criterios_qualidade.filter(c => c.id === 'processo_confirmado').length, 1, 'normalização não duplica critério');
  assert.match(promptExecucao(e), /não a mova para depois/);
  assert.match(promptQualidade(e), /processo_confirmado:.*Antes da tabela/);
  const table = '| Fornecedor | Preço | Prazo |\n| --- | --- | --- |\n| Beta | R$ 80 | não informado |';
  const nota = 'Beta é o menor preço; o prazo não foi informado.';
  const resto = base.formato_saida.secoes.map(s => `## ${s}\nNenhuma.`).join('\n');
  const chamar = async mensagens => {
    const sistema = mensagens[0].content;
    if (sistema.includes('revisor da conferência')) return { texto: JSON.stringify({ achados: [{ id: 'processo_confirmado', confirmado: true, trecho: nota, prova: 'A orientação aparece depois da tabela.' }] }) };
    if (sistema.includes('conferente de qualidade')) {
      const t = mensagens.at(-1).content;
      const correto = t.indexOf(nota) < t.indexOf('| Fornecedor');
      return { texto: JSON.stringify({ criterios: [{ id: 'processo_confirmado', ok: correto, motivo: correto ? '' : 'A orientação aparece depois da tabela.' }] }) };
    }
    return { texto: `${nota}\n\n${table}\n${resto}` };
  };
  const r = await conferirComCorrecao({ espec: e, resposta: `${table}\n${nota}\n${resto}`, entrada: 'Beta: R$ 80; prazo não informado.', mensagens: [{ role: 'system', content: promptExecucao(e) }], chamar });
  assert.equal(r.registro.status, 'corrigido');
  assert.ok(r.texto.indexOf(nota) < r.texto.indexOf('| Fornecedor'), 'a correção atende à sequência aprovada');
  const falha = await conferirComCorrecao({ espec: e, resposta: `${table}\n${nota}\n${resto}`, entrada: 'Beta: R$ 80; prazo não informado.', mensagens: [{ role: 'system', content: promptExecucao(e) }], chamar: async m => m[0].content.includes('conferente de qualidade') || m[0].content.includes('revisor da conferência') ? chamar(m) : { texto: `${table}\n${nota}\n${resto}` } });
  assert.equal(falha.registro.status, 'inconsistente', 'ignorar o processo nunca sai aprovado');
});
