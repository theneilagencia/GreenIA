// Quick Wins 2.0 (P1-A): colunas pedidas no objetivo. A IA estrutura (com evidência do trecho do objetivo), o
// servidor confere a origem de forma determinística, a pessoa revê e ajusta, e o contrato final fica em
// formato_saida.colunas: a mesma fonte para a execução, o Quality Check, a correção e as versões.
// Também: uma chamada só por objetivo novo, governança da chamada, créditos registrados e falha sem invenção.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/quickwin-construtor.js';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { exec, json, todos, um } from '../src/db.js';
import { creditosDe } from '../src/plano.js';

const A_ = 'Gere uma tabela com Cliente, Valor e Status.';
const B_ = 'Organize em uma tabela com Fornecedor, Vencimento, Valor contratado e Situação.';
const C_ = 'Analise este contrato.';
const D_ = 'Faça uma tabela com os principais pontos.';
const REGRA = 'Destacar documentos vencidos';
// Respostas da IA de estruturação (o que um modelo responderia), por objetivo. `inventa`: acrescenta um campo que
// o objetivo não tem e renomeia outro, para provar que a conferência de origem descarta os dois.
const RESPOSTAS = {
  [A_]: [['Cliente', 'Cliente'], ['Valor', 'Valor'], ['Status', 'Status']],
  [B_]: [['Fornecedor', 'Fornecedor'], ['Vencimento', 'Vencimento'], ['Valor contratado', 'Valor contratado'], ['Situação', 'Situação']],
  [C_]: [], [D_]: [],
};
const jsonEstrutura = pares => JSON.stringify({ colunas: pares.map(([nome, evidencia]) => ({ nome, evidencia })) });
const ehEstruturacao = b => JSON.stringify(b.messages[0].content).includes('Você organiza o pedido');
const ehConferencia = b => JSON.stringify(b.messages[0].content).includes('conferente de qualidade');
let S, OR, admin, ana, carlos, A, modo = 'normal', falharInvencao = false;

function roteiro(b) {
  const sis = JSON.stringify(b.messages[0].content), usuario = String(b.messages.at(-1).content);
  if (ehEstruturacao(b)) {
    const obj = Object.keys(RESPOSTAS).find(k => usuario.includes(k));
    if (modo === 'lixo') return 'não sei';
    const pares = RESPOSTAS[obj] || [];
    return jsonEstrutura(modo === 'inventa' ? [...pares, ['Prazo', 'Prazo'], ['Situação', 'Status']] : pares);
  }
  if (ehConferencia(b)) {
    if (modo === 'segue_criterios') {
      const pedidas = (/tabela com exatamente as colunas (.+?), nesta ordem/.exec(sis)?.[1] || '').split(' | ').filter(Boolean);
      const cab = (/\| ([^\n]+) \|/.exec(usuario)?.[1] || '').split(' | ');
      const faltam = pedidas.filter(c => !cab.includes(c));
      const inventou = falharInvencao && !(falharInvencao = false);
      return JSON.stringify({ criterios: [{ id: 'completo', ok: !faltam.length, motivo: faltam.length ? `faltou ${faltam.join(', ')}` : '' }, { id: 'nao_inventar', ok: !inventou, motivo: inventou ? 'um valor não está na entrada' : '' }] });
    }
    return '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"formato","ok":true},{"id":"propria_1","ok":true}]}';
  }
  // Execução: devolve exatamente as colunas e seções que o contrato pede.
  const cols = (/cabeçalho exatamente nestas colunas: ([^.]+)\./.exec(sis)?.[1] || 'Item').split(' | ');
  const secoes = (/estas seções, nesta ordem, cada uma com título \\"## Nome\\": ([^\\]+)\./.exec(sis)?.[1] || '').split('; ').filter(Boolean);
  return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, `| ${cols.map((_, i) => `v${i}`).join(' | ')} |`, '', ...secoes.map(x => `## ${x}\n- Nenhuma`)].join('\n');
}

before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Área Alfa' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'carlos@exemplo.com.br', nome: 'Carlos Dias', areas: [{ id: A.id }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('openai/gpt-5')}`, { liberado: true, perfil: 'avancado' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  carlos = await S.cliente().entrar('carlos@exemplo.com.br');
  for (const c of [ana, carlos]) await c.post('/api/politica/ciencia', { versao: (await c.get('/api/politica')).dados.versao });
});
after(async () => { await S.fechar(); await OR.fechar(); });

// Uma "etapa Resultado": estrutura o objetivo pelo servidor, contando as chamadas de IA feitas.
async function estruturar(descricao, extra = {}) {
  const antes = OR.chamadas.length;
  const r = await ana.post('/api/quick-wins/assistente/estrutura', { descricao, ...extra });
  return { ...r, chamadas: OR.chamadas.slice(antes) };
}
const especDe = id => json(um(S.app.db, 'select especificacao from quick_wins where id = ?', id).especificacao);

// ---- Construtor (sem servidor) ------------------------------------------------------------------------------
const estruturaDe = (descricao, pares) => ({ chave: C.chaveObjetivo(descricao), colunas: C.lerEstrutura(jsonEstrutura(pares), descricao).colunas, falhou: false });

test('A e B: colunas nomeadas no objetivo viram o contrato (execução e Quality Check usam as mesmas)', () => {
  const e = C.construir({ descricao: A_, estrutura_objetivo: estruturaDe(A_, RESPOSTAS[A_]) });
  assert.equal(e.formato_saida.tipo, 'tabela');
  assert.deepEqual(e.formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  assert.equal(e.formato_saida.origem_colunas, 'objetivo');
  for (const x of ['Item', 'Descrição', 'Observação']) assert.ok(!e.formato_saida.colunas.includes(x));
  assert.match(C.promptExecucao(e, { nome: 'X' }), /cabeçalho exatamente nestas colunas: Cliente \| Valor \| Status\./);
  assert.match(C.promptQualidade(e), /com as colunas Cliente, Valor, Status/);
  // Conferência do contrato: a tabela certa passa; sem Status, falha o formato.
  assert.deepEqual(C.conferirContrato(e, '| Cliente | Valor | Status |\n|---|---|---|\n| Alfa | 1 | Pago |\n\n## Principais informações\n- a\n\n## Pontos de atenção\n- a\n\n## Próximo passo\n- a\n\n## Informações não encontradas\n- Nenhuma').falhas, []);
  const sem = C.conferirContrato(e, '| Cliente | Valor |\n|---|---|\n| Alfa | 1 |');
  assert.ok(sem.falhas.includes('formato'));
  assert.match(sem.detalhes.join(' '), /Faltaram as colunas: Status\./);
  const b = C.construir({ descricao: B_, estrutura_objetivo: estruturaDe(B_, RESPOSTAS[B_]) });
  assert.deepEqual(b.formato_saida.colunas, ['Fornecedor', 'Vencimento', 'Valor contratado', 'Situação']);
  assert.deepEqual(b.origem.estrutura_objetivo.colunas.map(c => c.evidencia), ['Fornecedor', 'Vencimento', 'Valor contratado', 'Situação'], 'cada coluna com a origem no objetivo');
});

test('origem conferida: campo inventado ou renomeado pela IA é descartado; resposta ilegível não inventa nada', () => {
  const r = C.lerEstrutura(jsonEstrutura([...RESPOSTAS[A_], ['Prazo', 'Prazo'], ['Situação', 'Status'], ['Cliente', 'cliente'], ['x', 'x']]), A_);
  assert.deepEqual(r.colunas.map(c => c.nome), ['Cliente', 'Valor', 'Status'], 'sem Prazo (não está no objetivo), sem "Situação" (o trecho não tem esse nome), sem repetida');
  assert.equal(r.descartadas, 3);
  assert.equal(C.lerEstrutura('não sei', A_), null);
  assert.equal(C.lerEstrutura('{"colunas":"Cliente"}', A_), null);
  // A evidência é conferida sem diferenciar maiúsculas, acentos e espaços; o nome precisa estar no trecho.
  assert.deepEqual(C.validarColunas([{ nome: 'valor contratado', evidencia: 'valor  contratado' }], B_).colunas, [{ nome: 'Valor contratado', evidencia: 'valor contratado' }]);
  // Estrutura de outro objetivo (chave diferente) não vale.
  assert.equal(C.estruturaValida(estruturaDe(A_, RESPOSTAS[A_]), `${A_} Inclua o prazo.`), null);
  // Estrutura forjada (evidência fora do objetivo) é conferida de novo ao montar.
  const forjada = { chave: C.chaveObjetivo(A_), colunas: [{ nome: 'Senha', evidencia: 'Senha' }], falhou: false };
  assert.deepEqual(C.construir({ descricao: A_, estrutura_objetivo: forjada }).formato_saida.origem_colunas, 'sugestao');
});

test('C e D: sem campos nomeados, nenhuma coluna tratada como pedida', () => {
  const c = C.construir({ descricao: C_, estrutura_objetivo: estruturaDe(C_, []) });
  assert.equal(c.formato_saida.tipo, 'relatorio');
  assert.deepEqual(c.formato_saida.colunas, [], '"Analise este contrato." não gera colunas');
  assert.equal(c.formato_saida.origem_colunas, undefined);
  const d = C.construir({ descricao: D_, estrutura_objetivo: estruturaDe(D_, []) });
  assert.equal(d.formato_saida.tipo, 'tabela');
  assert.equal(d.formato_saida.origem_colunas, 'sugestao', 'estrutura sugerida (editável), não requisito da pessoa');
  assert.equal(d.origem.colunas_origem, 'sugestao');
});

test('E, F e G: exemplo define como antes; compatível sem duplicar; conflitante mantém o exemplo e registra', () => {
  const ex = cols => ({ modo: 'mostrar', exemplo: `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n| ${cols.map(() => 'x').join(' | ')} |` });
  // E: só o exemplo (comportamento anterior).
  const e = C.construir({ descricao: 'Organize as cobranças', como: ex(['Cliente', 'Valor', 'Status']) });
  assert.deepEqual(e.formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  assert.equal(e.formato_saida.origem_colunas, 'exemplo');
  // F: compatíveis.
  const f = C.construir({ descricao: A_, como: ex(['Cliente', 'Valor', 'Status']), estrutura_objetivo: estruturaDe(A_, RESPOSTAS[A_]) });
  assert.deepEqual(f.formato_saida.colunas, ['Cliente', 'Valor', 'Status'], 'sem perda e sem duplicação');
  assert.equal(f.origem.conflito_colunas, undefined);
  // G: conflitantes. Precedência atual do exemplo, sem somar campos; o conflito fica registrado.
  const g = C.construir({ descricao: A_, como: ex(['Fornecedor', 'Prazo']), estrutura_objetivo: estruturaDe(A_, RESPOSTAS[A_]) });
  assert.deepEqual(g.formato_saida.colunas, ['Fornecedor', 'Prazo']);
  assert.equal(g.formato_saida.origem_colunas, 'exemplo');
  assert.deepEqual(g.origem.conflito_colunas, { objetivo: ['Cliente', 'Valor', 'Status'], exemplo: ['Fornecedor', 'Prazo'] });
});

test('edição manual é soberana; falha da IA não inventa colunas; Quick Win antigo igual', () => {
  const est = estruturaDe(A_, RESPOSTAS[A_]);
  const m = C.construir({ descricao: A_, estrutura_objetivo: est, colunas: ['Status', 'Cliente', 'Valor pago', 'Vencimento'], colunas_origem: 'pessoa' });
  assert.deepEqual(m.formato_saida.colunas, ['Status', 'Cliente', 'Valor pago', 'Vencimento'], 'adicionar, renomear e reordenar valem');
  assert.equal(m.formato_saida.origem_colunas, 'pessoa');
  // Lista de outra origem não é aceita como decisão da pessoa: o construtor recalcula pelas fontes.
  assert.deepEqual(C.construir({ descricao: A_, estrutura_objetivo: est, colunas: ['Senha'], colunas_origem: 'objetivo' }).formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  const f = C.construir({ descricao: A_, estrutura_objetivo: { chave: C.chaveObjetivo(A_), colunas: [], falhou: true } });
  assert.deepEqual(f.formato_saida.colunas, [], 'sem Item/Descrição/Observação');
  assert.equal(f.formato_saida.origem_colunas, 'livre');
  assert.match(C.promptExecucao(f, { nome: 'X' }), /tabela em Markdown \(linhas com \| \), com cabeçalho, com as colunas que o objetivo pede\./);
  assert.doesNotMatch(C.conferirContrato(f, '| Cliente | Valor |\n|---|---|\n| a | 1 |').detalhes.join(' '), /colunas/, 'sem colunas fixas, nenhuma é cobrada');
  assert.deepEqual(C.construir({ descricao: A_, colunas_origem: 'livre' }).formato_saida.colunas, []);
  // Sem os campos novos (API antiga, Quick Win antigo): exatamente as colunas de antes.
  const antigo = C.construir({ descricao: A_ });
  assert.deepEqual(antigo.formato_saida.colunas, ['Item', 'Descrição', 'Observação']);
  const semOrigem = { ...antigo, formato_saida: { ...antigo.formato_saida } };
  delete semOrigem.formato_saida.origem_colunas;
  assert.match(C.promptExecucao(semOrigem, { nome: 'X' }), /Item \| Descrição \| Observação/);
});

// ---- Servidor: chamada governada, cache, créditos ----------------------------------------------------------
test('uma chamada por objetivo novo; mesmo objetivo salvo = 0 chamadas; objetivo alterado = 1; consumo registrado', async () => {
  modo = 'normal';
  const usoAntes = um(S.app.db, 'select count(*) as n, coalesce(sum(custo), 0) as c from uso').n;
  const r1 = await estruturar(A_);
  assert.equal(r1.status, 200);
  assert.equal(r1.chamadas.length, 1, 'objetivo novo: 1 chamada estrutural');
  assert.deepEqual(r1.dados.colunas.map(c => c.nome), ['Cliente', 'Valor', 'Status']);
  assert.equal(r1.dados.falhou, false);
  assert.doesNotMatch(JSON.stringify(r1.dados), /mistral|openai|modelo|fornecedor/i, 'nada técnico para a tela');
  // Classe rápida, pelo roteamento, com o objetivo delimitado (é material, não instrução).
  assert.equal(um(S.app.db, 'select perfil from modelos where id = ?', r1.chamadas[0].model).perfil, 'rapido');
  assert.match(String(r1.chamadas[0].messages[1].content), /<objetivo/);
  // Registro: decisão do roteamento, uso e evento de créditos, sem conteúdo.
  const rota = um(S.app.db, "select * from roteamento where origem = 'quick_win_estrutura' order by id desc limit 1");
  assert.equal(rota.resultado, 'respondido');
  assert.equal(rota.modelo_usado, r1.chamadas[0].model);
  assert.equal(rota.classe, 'rapido');
  assert.equal(rota.conversa_id, null);
  const uso = um(S.app.db, 'select * from uso order by id desc limit 1');
  assert.equal(uso.custo, 0.00123);
  assert.equal(uso.teste, 0, 'conta no consumo normal');
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'credits.consumed' order by id desc limit 1").detalhes;
  assert.match(ev, /quick_win_estrutura/);
  assert.doesNotMatch(ev, /Cliente|Valor|Status/);
  // Cria com a estrutura (etapa Resultado confirmada): as colunas entram no contrato.
  const q = (await ana.post('/api/quick-wins', { assistente: { descricao: A_, formato: 'tabela', estrutura_objetivo: r1.dados, colunas: ['Cliente', 'Valor', 'Status'], colunas_origem: 'objetivo' }, areas: [A.id] })).dados;
  assert.deepEqual(especDe(q.id).formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  assert.deepEqual(q.assistente.colunas, ['Cliente', 'Valor', 'Status']);
  // Reabrir o mesmo objetivo (editar, voltar, avançar): 0 chamadas.
  const r2 = await estruturar(A_, { quick_win_id: q.id });
  assert.equal(r2.chamadas.length, 0);
  assert.equal(r2.dados.cache, true);
  assert.deepEqual(r2.dados.colunas.map(c => c.nome), ['Cliente', 'Valor', 'Status']);
  // Ajustar só uma regra: a estrutura continua (0 chamadas) e as colunas também.
  await ana.put(`/api/quick-wins/${q.id}`, { assistente: { descricao: A_, formato: 'tabela', regras: ['nao_inventar', 'linguagem_simples'] } });
  assert.deepEqual(especDe(q.id).formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  assert.equal((await estruturar(A_, { quick_win_id: q.id })).chamadas.length, 0);
  // Objetivo alterado: 1 chamada nova.
  const r3 = await estruturar(B_, { quick_win_id: q.id });
  assert.equal(r3.chamadas.length, 1);
  assert.deepEqual(r3.dados.colunas.map(c => c.nome), ['Fornecedor', 'Vencimento', 'Valor contratado', 'Situação']);
  // Créditos realmente registrados neste cenário (provedor de teste: custo fixo por chamada).
  const novos = todos(S.app.db, 'select custo from uso order by id').slice(usoAntes);
  assert.equal(novos.length, 2, 'duas estruturações de fato (A e B); os reaproveitamentos não registram consumo');
  assert.deepEqual(novos.map(u => creditosDe(u.custo)), [0.1, 0.1]);
});

test('C, D e campo inventado pela IA, pelo servidor', async () => {
  modo = 'normal';
  assert.deepEqual((await estruturar(C_)).dados.colunas, []);
  assert.deepEqual((await estruturar(D_)).dados.colunas, []);
  modo = 'inventa';
  const r = await estruturar(A_);
  assert.deepEqual(r.dados.colunas.map(c => c.nome), ['Cliente', 'Valor', 'Status'], 'Prazo e o "Situação" renomeado ficam de fora');
  assert.ok(um(S.app.db, "select detalhes from eventos where tipo = 'quickwin.structured' order by id desc limit 1").detalhes.includes('"descartadas":2'));
  modo = 'lixo';
  assert.deepEqual((await estruturar(A_)).dados, { chave: C.chaveObjetivo(A_), colunas: [], falhou: true });
  modo = 'normal';
});

test('governança da chamada: permissão, segredo, dados, política, limites, plano e falha da IA (sem bloquear a criação)', async () => {
  modo = 'normal';
  assert.equal((await carlos.post('/api/quick-wins/assistente/estrutura', { descricao: A_ })).status, 403, 'só quem cria Quick Win');
  let r = await estruturar('Gere uma tabela com Cliente e a senha: Sup3r$ecreta!2026');
  assert.equal(r.status, 422);
  assert.equal(r.chamadas.length, 0, 'segredo não sai');
  const B = (await admin.post('/api/admin/areas', { nome: 'Área Beta' })).dados;
  const outro = (await admin.post('/api/quick-wins', { assistente: { descricao: C_ }, areas: [B.id] })).dados;
  assert.equal((await estruturar(A_, { quick_win_id: outro.id })).status, 404, 'Quick Win de quem não gere não é lido');
  // Dado que a política manda proteger: não vai para a IA aqui (a pessoa define as colunas).
  const antes = lerConfig(S.app.db).acoesChat;
  salvarConfig(S.app.db, { acoesChat: { ...antes, cpf: 'proteger' } });
  r = await estruturar('Gere uma tabela com Cliente, CPF 123.456.789-09 e Status.');
  assert.deepEqual([r.status, r.dados.falhou, r.chamadas.length], [200, true, 0]);
  salvarConfig(S.app.db, { acoesChat: antes });
  // Limite diário da pessoa: sem chamada, sem bloquear.
  salvarConfig(S.app.db, { limiteDiarioPessoa: 1 });
  r = await estruturar(`${A_} Agora.`);
  assert.deepEqual([r.dados.falhou, r.chamadas.length], [true, 0]);
  salvarConfig(S.app.db, { limiteDiarioPessoa: 0 });
  // Política de uso nova sem ciência: sem chamada.
  exec(S.app.db, 'update pessoas set ciencia_versao = 0 where email = ?', 'ana@exemplo.com.br');
  r = await estruturar(`${A_} Hoje.`);
  assert.deepEqual([r.dados.falhou, r.chamadas.length], [true, 0]);
  await ana.post('/api/politica/ciencia', { versao: (await ana.get('/api/politica')).dados.versao });
  // A IA falha: resposta simples, nada inventado, e a criação segue com a tabela sem colunas fixas.
  const rapidos = todos(S.app.db, "select id from modelos where perfil = 'rapido'").map(m => m.id);
  rapidos.forEach(id => OR.falhar.add(id));
  r = await estruturar(`${A_} Por favor.`);
  rapidos.forEach(id => OR.falhar.delete(id));
  assert.deepEqual([r.status, r.dados.falhou, r.dados.colunas], [200, true, []]);
  assert.equal(um(S.app.db, "select resultado from roteamento where origem = 'quick_win_estrutura' order by id desc limit 1").resultado, 'falha_na_execucao');
  const q = await ana.post('/api/quick-wins', { assistente: { descricao: `${A_} Por favor.`, formato: 'tabela', estrutura_objetivo: r.dados, colunas: [], colunas_origem: 'livre' }, areas: [A.id] });
  assert.equal(q.status, 200);
  assert.deepEqual(especDe(q.dados.id).formato_saida.colunas, []);
  assert.equal(especDe(q.dados.id).formato_saida.origem_colunas, 'livre');
});

test('plano na reserva: nenhuma chamada extra na criação', async () => {
  const OR2 = await openRouterFalso({ responder: roteiro });
  const T = await subir({ ia: OR2.ia, plano: { creditos: 4, reserva: 100 } });
  salvarConfig(T.app.db, { dominios: ['exemplo.com.br'] });
  const adm = await T.cliente().entrar('admin@exemplo.com.br');
  await adm.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  await adm.post('/api/politica/ciencia', { versao: (await adm.get('/api/politica')).dados.versao });
  const r0 = await adm.post('/api/quick-wins/assistente/estrutura', { descricao: A_ });
  assert.equal(r0.dados.falhou, false);
  exec(T.app.db, "insert into uso (em, pessoa_id, custo) values (?, 1, 0.05)", new Date().toISOString());   // passa de 4 créditos: reserva
  const n = OR2.chamadas.length;
  const r = await adm.post('/api/quick-wins/assistente/estrutura', { descricao: B_ });
  assert.deepEqual([r.status, r.dados.falhou, OR2.chamadas.length - n], [200, true, 0]);
  await T.fechar(); await OR2.fechar();
});

// ---- Os dois P1 juntos: colunas + regra própria, da especificação à execução e ao Quality Check ------------
test('colunas Cliente/Valor/Status + regra própria "Destacar documentos vencidos": especificação, execução e Quality Check', async () => {
  modo = 'normal';
  const est = (await estruturar(A_)).dados;
  const q = (await ana.post('/api/quick-wins', { assistente: { descricao: A_, formato: 'tabela', estrutura_objetivo: est, colunas: est.colunas.map(c => c.nome), colunas_origem: 'objetivo', regras_proprias: [REGRA] }, areas: [A.id] })).dados;
  const e = especDe(q.id);
  assert.deepEqual(e.formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  assert.deepEqual(e.regras_proprias, [{ id: 'propria_1', texto: REGRA }]);
  const conv = (await ana.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Cobranças: Alfa 1.200 pago; Beta 3.400 em aberto (vencido).' });
  const [exec1, qc] = OR.chamadas.slice(n);
  assert.equal(OR.chamadas.length - n, 2, 'execução + conferência; a estruturação não se repete na execução');
  const sis = JSON.stringify(exec1.messages[0].content);
  assert.match(sis, /cabeçalho exatamente nestas colunas: Cliente \| Valor \| Status\./);
  assert.match(sis, new RegExp(`- ${REGRA}`));
  const conf = JSON.stringify(qc.messages[0].content);
  assert.match(conf, /tabela com exatamente as colunas Cliente \| Valor \| Status, nesta ordem/);
  assert.match(conf, new RegExp(`propria_1: Regra do responsável: \\\\"${REGRA}\\\\"`));
  assert.match(r.texto, /\| Cliente \| Valor \| Status \|/);
  assert.equal(r.fim.qualidade.status, 'aprovado');
  // Publicada (v1) e nova versão: as colunas e a regra seguem no contrato.
  await ana.post(`/api/quick-wins/${q.id}/publicar`, {});
  await ana.put(`/api/quick-wins/${q.id}`, { assistente: { descricao: A_, formato: 'tabela' } });
  assert.deepEqual(especDe(q.id).formato_saida.colunas, ['Cliente', 'Valor', 'Status']);
  assert.deepEqual(especDe(q.id).regras_proprias.map(x => x.texto), [REGRA]);
});

// ---- Precedência da configuração confirmada sobre o texto do objetivo ---------------------------------------
test('precedência: configuração confirmada vale mais que o objetivo na execução e na conferência; especificação antiga igual', () => {
  const e = C.construir({ descricao: A_, formato: 'tabela', colunas: ['Cliente', 'Valor'], colunas_origem: 'pessoa' });
  assert.equal(e.configuracao_confirmada, true);
  const exec1 = C.promptExecucao(e, { nome: 'X' });
  assert.ok(exec1.indexOf(C.PRECEDENCIA_EXECUCAO) > exec1.indexOf('Intenção do trabalho:'), 'a intenção do trabalho continua, seguida da precedência');
  assert.doesNotMatch(exec1, /Status/, 'o campo que a pessoa tirou não vai para a execução');
  assert.match(exec1, /nestas colunas: Cliente \| Valor\./);
  const qc = C.promptQualidade(e);
  assert.ok(qc.includes(C.PRECEDENCIA_CONFERENCIA));
  assert.match(qc, /completo: O resultado cobre a intenção do trabalho e todo o material relevante da entrada, dentro do contrato confirmado\./);
  assert.match(qc, /Contrato confirmado pelo responsável: tabela com exatamente as colunas Cliente \| Valor, nesta ordem/);
  assert.doesNotMatch(qc, /Status/, 'a conferência não recebe o campo que a pessoa tirou');
  assert.doesNotMatch(qc, /^- formato:/m, 'formato de tabela confirmado: conferido pelo código');
  // A precedência é geral: formato escolhido, regras escolhidas ou regras próprias também contam como confirmação.
  for (const r of [{ formato: 'lista' }, { regras: ['nao_inventar'] }, { regras_proprias: ['Destacar documentos vencidos'] }])
    assert.equal(C.construir({ descricao: A_, ...r }).configuracao_confirmada, true, JSON.stringify(r));
  // Especificação sem confirmação (API antiga) ou já gravada sem o campo: prompts exatamente como antes.
  const antiga = C.construir({ descricao: A_ });
  assert.equal(antiga.configuracao_confirmada, undefined);
  assert.ok(!C.promptExecucao(antiga, { nome: 'X' }).includes(C.PRECEDENCIA_EXECUCAO));
  assert.ok(!C.promptQualidade(antiga).includes(C.PRECEDENCIA_CONFERENCIA));
  assert.match(C.promptQualidade(antiga), /completo: O resultado responde ao objetivo por inteiro, sem deixar parte do pedido de fora\./);
});

test('soberania na execução, no Quality Check e na correção: remover, renomear, adicionar e ordenar', async () => {
  modo = 'segue_criterios';
  const est = (await estruturar(A_)).dados;
  const criarCom = async (colunas, descricao = A_, e = est) => (await ana.post('/api/quick-wins', { assistente: { descricao, formato: 'tabela', estrutura_objetivo: e, colunas, colunas_origem: 'pessoa' }, areas: [A.id] })).dados;
  const rodar = async q => {
    const conv = (await ana.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
    const n = OR.chamadas.length;
    const r = await enviarMensagem(ana, conv.id, { texto: 'Cobranças: Alfa 1.200 pago; Beta 3.400 em aberto.' });
    return { r, chamadas: OR.chamadas.slice(n) };
  };
  const sistema = b => JSON.stringify(b.messages[0].content);
  // Remoção: objetivo cita Status; confirmado Cliente / Valor. Aprovado sem correção; nada recoloca Status.
  const rem = await rodar(await criarCom(['Cliente', 'Valor']));
  assert.equal(rem.r.fim.qualidade.status, 'aprovado');
  assert.equal(rem.chamadas.length, 2, 'sem correção');
  assert.match(rem.r.texto, /^\| Cliente \| Valor \|\n/);
  assert.ok(sistema(rem.chamadas[0]).includes(C.PRECEDENCIA_EXECUCAO) && sistema(rem.chamadas[1]).includes(C.PRECEDENCIA_CONFERENCIA));
  // Se a correção acontecer por outro motivo, ela segue o contrato confirmado (com a mesma precedência), sem Status.
  falharInvencao = true;
  const corr = await rodar(await criarCom(['Cliente', 'Valor']));
  assert.equal(corr.chamadas.length, 4);
  assert.match(sistema(corr.chamadas[2]), /nestas colunas: Cliente \| Valor\./);
  assert.ok(sistema(corr.chamadas[2]).includes(C.PRECEDENCIA_EXECUCAO));
  assert.doesNotMatch(String(corr.chamadas[2].messages.at(-1).content), /Status/, 'o pedido de correção não cita Status');
  assert.match(corr.r.texto, /^\| Cliente \| Valor \|\n/);
  // Renomeação: conferência e execução usam os nomes confirmados.
  const ren = await rodar(await criarCom(['Cliente', 'Valor total', 'Situação']));
  assert.match(sistema(ren.chamadas[0]), /nestas colunas: Cliente \| Valor total \| Situação\./);
  assert.match(sistema(ren.chamadas[1]), /exatamente as colunas Cliente \| Valor total \| Situação, nesta ordem/);
  assert.equal(ren.r.fim.qualidade.status, 'aprovado');
  // Adição: objetivo com Cliente e Valor; confirmado com Responsável, que passa a ser exigido.
  const obj2 = 'Gere uma tabela com Cliente e Valor.';
  const e2 = { chave: C.chaveObjetivo(obj2), colunas: [{ nome: 'Cliente', evidencia: 'Cliente' }, { nome: 'Valor', evidencia: 'Valor' }], falhou: false };
  const qAd = await criarCom(['Cliente', 'Valor', 'Responsável'], obj2, e2);
  const ad = await rodar(qAd);
  assert.match(sistema(ad.chamadas[0]), /nestas colunas: Cliente \| Valor \| Responsável\./);
  assert.match(sistema(ad.chamadas[1]), /exatamente as colunas Cliente \| Valor \| Responsável, nesta ordem/);
  const espAd = especDe(qAd.id);
  assert.match(C.conferirContrato(espAd, '| Cliente | Valor |\n|---|---|\n| a | 1 |').detalhes.join(' '), /Faltaram as colunas: Responsável\./);
  // Ordem: a execução pede a ordem confirmada.
  const ord = await rodar(await criarCom(['Status', 'Cliente', 'Valor']));
  assert.match(sistema(ord.chamadas[0]), /nestas colunas: Status \| Cliente \| Valor\./);
  assert.match(ord.r.texto, /^\| Status \| Cliente \| Valor \|\n/);
  modo = 'normal';
});
