// Quick Wins antigos (v1, sem especificação) e a ação "Atualizar para Quick Win inteligente": antes de atualizar,
// tudo igual; a prévia (interpretação) não grava nada; salvar a atualização não muda o que a equipe usa, nem o
// histórico, nem as conversas; publicar passa a usar a operação v2; versões e restauração continuam.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { json, um, todos } from '../src/db.js';

const FIXO = 'mistralai/mistral-small';
const sis = b => JSON.stringify(b.messages[0].content);
const PLANO = { resumo: 'Confere pedidos e notas.', entradas: [{ tipo: 'documento', rotulo: 'Pedido e nota', quantidade: 2 }], etapas: [{ texto: 'Ler os dois documentos' }, { texto: 'Comparar item a item' }],
  entregaveis: [{ id: 'e1', tipo: 'tabela', rotulo: 'Diferenças' }, { id: 'e2', tipo: 'lista', rotulo: 'Pontos de atenção' }], ferramentas: ['leitura_documento'] };
function roteiro(b) {
  if (sis(b).includes('PLANO DE TRABALHO')) return JSON.stringify(PLANO);
  if (sis(b).includes('conferente de qualidade')) return '{"criterios":[]}';
  if (sis(b).includes('Entregáveis (entregue todos')) return '## Diferenças\n| Item | Pedido | Nota |\n|---|---|---|\n| A | 40 | 38 |\n\n## Pontos de atenção\n- Faltam 2.\n\n## Informações não encontradas\nNenhuma';
  return 'Resposta do Quick Win antigo.';
}
let S, OR, ana, admin, A;
const quick = (sql, ...p) => um(S.app.db, sql, ...p);
async function conversar(id, texto, extra = {}) {
  const conv = (await ana.post('/api/conversas', { quick_win_id: id, ...extra })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto, ...(extra.executar ? { executar_quick_win: true } : {}) });
  return { ...r, conv, chamadas: OR.chamadas.slice(antes) };
}

before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Compras' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana', areas: [{ id: A.id, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent(FIXO)}`, { liberado: true, perfil: 'rapido' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

const FIXTURES = {
  simples: { nome: 'Resumo de propostas', para_que_serve: 'Resume propostas', instrucoes: 'Resuma em 5 linhas.', formato: 'texto' },
  tabela: { nome: 'Conferir pedido e nota', para_que_serve: 'Compara pedido e nota fiscal', instrucoes: 'Compare item a item.', formato: 'tabela' },
  fixado: { nome: 'Triagem com modelo fixo', para_que_serve: 'Faz triagem de chamados', instrucoes: 'Classifique o chamado.', formato: 'lista', modelo: FIXO, pode_trocar: false },
};

test('v1 (simples, tabela, modelo fixado, com histórico e conversas): antes, prévia, atualização, publicação e restauração', async () => {
  for (const [nome, f] of Object.entries(FIXTURES)) {
    // Modelo técnico fixado: só o admin fixa (quem é responsável escolhe uma classe).
    const r0 = await (f.modelo ? admin : ana).post('/api/quick-wins', { ...f, areas: [A.id], status: 'em_uso' });
    assert.equal(r0.status, 200, JSON.stringify(r0.dados));
    const qw = r0.dados;
    assert.equal(qw.v2, undefined, nome);
    // Histórico: duas conversas com mensagens, antes de qualquer atualização.
    const c1 = await conversar(qw.id, 'Primeira conversa (fictícia).');
    await conversar(qw.id, 'Segunda conversa (fictícia).');
    const linhaAntes = quick('select formato, modelo, pode_trocar, instrucoes, especificacao, versao_publicada from quick_wins where id = ?', qw.id);
    const msgsAntes = todos(S.app.db, 'select m.id, m.texto from mensagens m join conversas c on c.id = m.conversa_id where c.quick_win_id = ? order by m.id', qw.id);
    // ANTES: comportamento antigo (instruções em cada mensagem; formato; modelo fixado quando houver).
    assert.match(sis(c1.chamadas[0]), new RegExp(f.instrucoes.replace('.', '\\.')), nome);
    if (f.formato === 'tabela') assert.match(sis(c1.chamadas[0]), /Responda com uma tabela em Markdown/);
    if (f.modelo) assert.equal(c1.chamadas[0].model, FIXO);
    // PRÉVIA: a interpretação não grava nada no Quick Win.
    const it = (await ana.post('/api/quick-wins/assistente/interpretar', { descricao: [f.para_que_serve, f.instrucoes].join('\n'), quick_win_id: qw.id })).dados;
    assert.equal(it.fonte, 'ia');
    assert.deepEqual(quick('select formato, modelo, pode_trocar, instrucoes, especificacao, versao_publicada from quick_wins where id = ?', qw.id), linhaAntes, `${nome}: prévia sem gravar`);
    // ATUALIZAR (salvar o rascunho com a estrutura aceita): nada muda para a equipe nem no histórico.
    const up = await ana.put(`/api/quick-wins/${qw.id}`, { assistente: { descricao: [f.para_que_serve, f.instrucoes].join('\n'), operacao: { ...it.operacao, origem: 'pessoa' }, interpretacao: { chave: it.chave, operacao: it.operacao } } });
    assert.equal(up.status, 200, JSON.stringify(up.dados));
    const linha = quick('select formato, modelo, pode_trocar, instrucoes, especificacao, versao_publicada from quick_wins where id = ?', qw.id);
    assert.deepEqual([linha.formato, linha.modelo, linha.pode_trocar, linha.instrucoes, linha.versao_publicada], [linhaAntes.formato, linhaAntes.modelo, linhaAntes.pode_trocar, linhaAntes.instrucoes, null], `${nome}: configuração antiga intacta`);
    assert.equal(json(linha.especificacao).origem.atualizado_de, 'v1');
    assert.deepEqual(todos(S.app.db, 'select m.id, m.texto from mensagens m join conversas c on c.id = m.conversa_id where c.quick_win_id = ? order by m.id', qw.id), msgsAntes, `${nome}: histórico intacto`);
    assert.equal((await ana.get(`/api/conversas/${c1.conv.id}`)).status, 200, `${nome}: conversa antiga acessível`);
    const equipe = await conversar(qw.id, 'Uso da equipe (fictício).');
    assert.match(sis(equipe.chamadas[0]), new RegExp(f.instrucoes.replace('.', '\\.')), `${nome}: equipe continua no antigo`);
    assert.doesNotMatch(sis(equipe.chamadas[0]), /Você está executando o Quick Win/);
    if (f.modelo) assert.equal(equipe.chamadas[0].model, FIXO);
    // O teste de quem gere já usa a operação v2.
    const teste = await conversar(qw.id, 'Pedido 40 e nota 38 (fictícios).', { teste: true, executar: true });
    assert.match(sis(teste.chamadas[0]), /Você está executando o Quick Win/);
    assert.match(sis(teste.chamadas[0]), /Material deste trabalho:\\n- Pedido e nota \(2\): obrigatório/);
    // PUBLICAR: a equipe passa a usar a v2; o modelo fixado continua fixado; o histórico continua.
    assert.equal((await ana.post(`/api/quick-wins/${qw.id}/publicar`, {})).dados.versao, 1);
    const depois = await conversar(qw.id, 'Pedido 10 e nota 10 (fictícios).', { executar: true });
    assert.match(sis(depois.chamadas[0]), /Você está executando o Quick Win/, `${nome}: v2 depois de publicar`);
    if (f.modelo) assert.equal(depois.chamadas[0].model, FIXO, 'modelo fixado preservado');
    assert.equal((await ana.get(`/api/conversas/${c1.conv.id}`)).status, 200);
    // RESTAURAÇÃO: ajusta e publica a v2; restaura a v1 publicada.
    await ana.put(`/api/quick-wins/${qw.id}`, { assistente: { descricao: [f.para_que_serve, f.instrucoes].join('\n'), regras: ['nao_inventar', 'priorizar_itens'] } });
    assert.equal((await ana.post(`/api/quick-wins/${qw.id}/publicar`, {})).dados.versao, 2);
    assert.equal((await ana.post(`/api/quick-wins/${qw.id}/versoes/1/restaurar`, {})).status, 200, `${nome}: restauração`);
    const atual = quick('select v.numero from quick_wins q join quick_win_versoes v on v.id = q.versao_publicada where q.id = ?', qw.id);
    assert.ok(atual.numero >= 1);
  }
});
