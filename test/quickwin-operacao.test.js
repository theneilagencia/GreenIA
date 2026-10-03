// Quick Wins como operações: entregáveis por canal, pesquisa real na internet (governada), contexto da empresa,
// exemplo pronto contextual, pausa para pedir contexto e retomada, e exclusão sem perder histórico.
// Inclui os critérios de aceite A a E (caso Apy Mine).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem, FONTES_FALSAS } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { json, todos, um } from '../src/db.js';
import { arquivo, docx } from './arquivos.js';
import * as OP from '../src/quickwin-operacao.js';
import * as C from '../src/quickwin-construtor.js';

const enc = encodeURIComponent;
const MODELO = 'mistralai/mistral-small';
const APY = 'Pesquise os temas em alta da semana sobre mineração e, com o contexto da Apy Mine, crie uma copy para LinkedIn, uma legenda para Instagram, um carrossel, uma imagem e um roteiro de Reels.';
const SOBRE = 'Sobre a Apy Mine: a Apy Mine é uma mineradora de médio porte que atua com segurança operacional, tecnologia embarcada e sustentabilidade. Público: gestores de operação e de segurança do trabalho. Tom: técnico e acessível.';
let S, OR, admin, ana, carlos, dani, A, B, modo = 'completo';

const sistemaDe = b => JSON.stringify(b.messages[0].content);
const ehConferencia = b => sistemaDe(b).includes('conferente de qualidade');
const ehExemplo = b => sistemaDe(b).includes('material FICTÍCIO');
// A IA falsa faz o trabalho pedido: um título por entregável, briefing nas peças visuais, fontes quando pesquisou.
function roteiro(b) {
  if (ehConferencia(b)) return '{"criterios":[{"id":"nao_inventar","ok":true},{"id":"canais","ok":true},{"id":"pesquisa","ok":true},{"id":"contexto_empresa","ok":true}]}';
  if (ehExemplo(b)) return 'Mensagem do Cliente Modelo (fictício):\nPedido 0000 da Empresa Exemplo Ltda. atrasado.\nPrazo combinado: não informado.\nValor: R$ 1.000,00.\nContato: Cliente Modelo.\nObservação: material fictício para teste.';
  const sis = sistemaDe(b);
  if (!sis.includes('Entregáveis (entregue todos')) return 'Resposta comum.';
  if (modo === 'pergunta') return `${C.MARCADOR_PERGUNTA} sobre qual empresa é o conteúdo e para quem?`;
  const titulos = [...sis.matchAll(/\d+\. ## ([^\\(]+?)(?: \(|\\n|")/g)].map(m => m[1].trim()).filter(t => modo !== 'faltando' || !/Legenda/.test(t));
  const empresa = sis.includes('Apy Mine') ? 'Apy Mine' : 'a empresa';
  const corpo = titulos.map(t => `## ${t}\n${/Imagem|Carrossel|Reels|Vídeo/.test(t) ? `${OP.MARCA_BRIEFING}\nSlide 1: segurança na ${empresa}.` : `Texto sobre ${empresa} para ${t}.`}`).join('\n\n');
  const fontes = b.plugins || sis.includes('Notas da pesquisa desta execu') ? `\n\n## ${OP.SECAO_FONTES}\n${FONTES_FALSAS.map(f => `- ${f.titulo}: ${f.url}`).join('\n')}` : '\n\nPesquisa na internet não realizada.';
  return corpo + fontes;
}

before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Marketing' })).dados;
  B = (await admin.post('/api/admin/areas', { nome: 'Financeiro' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'carlos@exemplo.com.br', nome: 'Carlos Dias', areas: [{ id: A.id }] });
  await admin.post('/api/admin/pessoas', { email: 'dani@exemplo.com.br', nome: 'Dani Reis', areas: [{ id: B.id, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${enc(MODELO)}`, { liberado: true, perfil: 'rapido' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  carlos = await S.cliente().entrar('carlos@exemplo.com.br');
  dani = await S.cliente().entrar('dani@exemplo.com.br');
  assert.equal((await admin.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo('sobre.docx', docx([SOBRE])) })).status, 200);
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function criar(descricao, extra = {}) {
  const r = await ana.post('/api/quick-wins', { assistente: { descricao, ...extra }, areas: [A.id] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r.dados;
}
async function executar(cli, qwId, texto, { teste = true, conv = null } = {}) {
  conv ||= (await cli.post('/api/conversas', { quick_win_id: qwId, teste })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(cli, conv.id, { texto, executar_quick_win: true });
  return { ...r, conv, chamadas: OR.chamadas.slice(antes) };
}
const espec = id => json(um(S.app.db, 'select especificacao from quick_wins where id = ?', id).especificacao);
const ultimoEvento = tipo => json(um(S.app.db, 'select detalhes from eventos where tipo = ? order by id desc limit 1', tipo)?.detalhes, null);

test('inferência: canais, entregáveis ligados ao canal, pesquisa e só valores do catálogo', () => {
  const op = OP.inferirOperacao(APY);
  assert.deepEqual(op.canais, ['linkedin', 'instagram']);
  assert.deepEqual(op.entregaveis.map(OP.rotuloEntregavel), ['Temas sugeridos', 'LinkedIn · Copy', 'Instagram · Legenda', 'Instagram · Carrossel', 'Instagram · Imagem', 'Instagram · Reels']);
  assert.deepEqual(op.ferramentas, ['pesquisa_web']);
  assert.deepEqual(OP.inferirOperacao('Crie posts para LinkedIn e Instagram').entregaveis.map(OP.rotuloEntregavel), ['LinkedIn · Copy', 'Instagram · Legenda']);
  // Lista de peças fechada por um canal ("copy, carrossel e imagem para o LinkedIn") e cabeçalho por canal
  // ("LinkedIn: copy, carrossel e imagem"): a lista toda é daquele canal (cenário F).
  const F = ['LinkedIn · Copy', 'LinkedIn · Carrossel', 'LinkedIn · Imagem', 'Instagram · Legenda', 'Instagram · Carrossel', 'Instagram · Imagem', 'Instagram · Reels'];
  for (const t of ['Pesquise temas em alta sobre mineração. A partir disso, crie conteúdos para LinkedIn e Instagram: copy, carrossel e imagem para o LinkedIn; legenda, carrossel, imagem e roteiro de Reels para o Instagram.',
    'Pesquise temas em alta sobre mineração.\nLinkedIn: copy, carrossel e briefing de imagem.\nInstagram: legenda, carrossel, briefing de imagem e roteiro de Reels.'])
    assert.deepEqual(OP.inferirOperacao(t).entregaveis.map(OP.rotuloEntregavel), ['Temas sugeridos', ...F], t);
  // Formato clássico continua clássico (sem canal, um tipo só).
  assert.deepEqual(OP.inferirOperacao('Montar relatório de visita').entregaveis, []);
  // Catálogo: canal, entregável e ferramenta desconhecidos saem; configuração com limites.
  const l = OP.limparOperacao({ canais: ['linkedin', 'orkut'], ferramentas: ['pesquisa_web', 'email'], entregaveis: [{ tipo: 'carrossel', canal: 'instagram', config: { slides: 99 } }, { tipo: 'hack', canal: 'x' }, { tipo: 'outro' }] });
  assert.deepEqual(l.canais, ['linkedin', 'instagram']);
  assert.deepEqual(l.ferramentas, ['pesquisa_web']);
  assert.deepEqual(l.entregaveis, [{ id: 'e1', tipo: 'carrossel', canal: 'instagram', config: { slides: 20 } }]);
});

test('criação: contexto acumulativo, entrega por canal no contrato, lacunas só quando a base não tem o contexto', async () => {
  const s = (await ana.post('/api/quick-wins/assistente/sugerir', { descricao: APY, como: { modo: 'explicar', texto: 'Sempre cito segurança primeiro.' } })).dados;
  assert.equal(s.arquetipo, 'criar_conteudo');
  assert.equal(s.operacao.entregaveis.length, 6);
  assert.equal(s.temBase, true);
  assert.deepEqual(s.lacunas, [], 'a base da empresa já tem o contexto: nada a perguntar');
  assert.equal(s.pesquisaLiberada, false);
  // Sem base visível (Dani é de outra área e a base da empresa toda é visível para todos; aqui, sem base nenhuma):
  assert.deepEqual(OP.lacunasDeContexto({ descricao: 'Crie posts para LinkedIn', operacao: OP.inferirOperacao('Crie posts para LinkedIn'), temBase: false }).map(l => l.id), ['empresa', 'publico']);
  const q = await criar(APY, { como: { modo: 'explicar', texto: 'Sempre cito segurança primeiro. Uso dados do setor.' } });
  const e = espec(q.id);
  assert.equal(e.formato_saida.tipo, 'outro');
  assert.deepEqual(e.ferramentas_permitidas, ['pesquisa_web']);
  assert.match(e.contexto, /Sempre cito segurança primeiro\. Uso dados do setor\./, 'o processo inteiro entra no contexto');
  assert.deepEqual(q.entregas.entregaveis, ['Temas sugeridos', 'LinkedIn · Copy', 'Instagram · Legenda', 'Instagram · Carrossel', 'Instagram · Imagem', 'Instagram · Reels']);
  assert.ok(e.criterios_qualidade.some(c => c.id === 'canais') && e.criterios_qualidade.some(c => c.id === 'pesquisa'));
  // A pessoa ajusta: tira a imagem, muda o carrossel e responde o contexto. Vale a dela.
  const op = { ...e.operacao, entregaveis: e.operacao.entregaveis.filter(x => x.tipo !== 'imagem').map(x => (x.tipo === 'carrossel' ? { ...x, config: { slides: 8 } } : x)), contexto_respostas: [{ id: 'tom', resposta: 'Técnico e acessível.' }] };
  const q2 = (await ana.put(`/api/quick-wins/${q.id}`, { assistente: { descricao: APY, operacao: op } })).dados;
  const e2 = espec(q2.id);
  assert.equal(e2.operacao.origem, 'pessoa');
  assert.equal(e2.operacao.entregaveis.length, 5);
  assert.equal(e2.operacao.entregaveis.find(x => x.tipo === 'carrossel').config.slides, 8);
  // Ajustar outra coisa sem mandar a operação mantém a da pessoa.
  await ana.put(`/api/quick-wins/${q.id}`, { assistente: { descricao: APY, regras: ['nao_inventar', 'adaptar_canal'] } });
  assert.equal(espec(q.id).operacao.entregaveis.length, 5);
  const p = C.promptExecucao(C.normalizar(espec(q.id)), { nome: 'x' });
  // Produção visual: o carrossel sai como artefato pronto (os 8 slides são as páginas dele).
  assert.match(p, /## Instagram · Carrossel \(8 slides, artefato visual pronto: Carrossel\)/);
  assert.equal(espec(q.id).operacao.entregaveis.find(x => x.tipo === 'carrossel').visual.paginas, 8);
  assert.match(p, /Contexto informado pelo responsável:\n- Como a marca costuma falar \(tom de voz\)\? Técnico e acessível\./);
  // Segredo nas respostas de contexto: recusado.
  const seg = await ana.put(`/api/quick-wins/${q.id}`, { assistente: { descricao: APY, operacao: { ...op, contexto_respostas: [{ id: 'empresa', resposta: 'senha: Abc123!@#xyz token sk-or-v1-1234567890abcdef1234567890abcdef' }] } } });
  assert.equal(seg.status, 422);
});

test('aceite A e B (Apy Mine): pesquisa real, contexto da empresa, todos os entregáveis por canal, fontes guardadas', async () => {
  salvarConfig(S.app.db, { pesquisaWeb: { ativa: true } });
  modo = 'completo';
  const q = await criar(APY);
  const r = await executar(ana, q.id, 'Pedido de teste: faça o trabalho desta semana.');
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  // Execução em etapas: 1) coleta (pesquisa, só notas com fonte); 2) produção a partir das notas, sem nova pesquisa.
  const [exec, producao] = r.chamadas.filter(b => !ehConferencia(b));
  assert.deepEqual(exec.plugins, [{ id: 'web', engine: 'exa', max_results: 5 }], 'a execução pesquisou de verdade');
  assert.match(sistemaDe(exec), /Etapa 1 de 2 desta execução: pesquisa na internet/);
  assert.equal(producao.plugins, undefined, 'a produção não pesquisa de novo');
  assert.match(sistemaDe(producao), /a pesquisa na internet desta execução já foi feita/);
  assert.match(sistemaDe(producao), /<pesquisa nome=/);
  assert.ok(r.chamadas.filter(ehConferencia).every(b => !b.plugins), 'a conferência nunca pesquisa');
  assert.ok(r.chamadas.filter(ehConferencia).every(b => JSON.stringify(b.messages).includes('Notas da pesquisa desta execu')), 'a conferência recebe as notas da pesquisa');
  // Contexto da empresa: a mensagem de hoje é genérica, mas a consulta à base usa o objetivo do Quick Win. QA-04: a
  // base vai só para a produção; a coleta (a busca na internet) leva só o contexto externo seguro.
  assert.doesNotMatch(JSON.stringify(exec.messages), /mineradora de médio porte/, 'contexto interno na busca externa');
  assert.match(String(exec.messages.at(-1).content), /^Tema da pesquisa: Pesquise os temas em alta da semana sobre mineração/);
  assert.match(sistemaDe(producao), /mineradora de médio porte/);
  for (const t of ['LinkedIn · Copy', 'Instagram · Legenda', 'Instagram · Carrossel', 'Instagram · Imagem', 'Instagram · Reels', 'Temas sugeridos']) assert.match(r.texto, new RegExp(`## ${t}`));
  assert.match(r.texto, /Apy Mine/);
  assert.equal(r.fim.qualidade.status, 'aprovado');
  assert.deepEqual(r.fim.qualidade.entregaveis, { esperados: 6, encontrados: 6 });
  assert.deepEqual(r.fim.qualidade.pesquisa, { exigida: true, feita: true, fontes: 2 });
  assert.deepEqual(r.fim.fontes.filter(f => f.url).map(f => f.url), FONTES_FALSAS.map(f => f.url));
  const msg = um(S.app.db, "select fontes from mensagens where conversa_id = ? and papel = 'assistant'", r.conv.id);
  assert.equal(json(msg.fontes, []).filter(f => f.url).length, 2, 'fontes da pesquisa guardadas na resposta');
  assert.deepEqual(ultimoEvento('quickwin.tool_used'), { conversa: r.conv.id, quick_win: q.id, teste: true, ferramenta: 'pesquisa_web', fontes: 2, roteamento: ultimoEvento('quickwin.tool_used').roteamento });
  assert.equal(ultimoEvento('quickwin.tested').status, 'aprovado');
  assert.doesNotMatch(JSON.stringify(ultimoEvento('quickwin.tested')), /Apy|mineração/, 'auditoria só com metadados');
});

test('aceite A (falhas): sem pesquisa liberada, entregável faltando ou conversa sigilosa, o resultado não passa como aprovado', async () => {
  const q = await criar(APY);
  // Pesquisa desligada pela empresa: nenhuma pesquisa simulada; resultado parcial com o motivo.
  salvarConfig(S.app.db, { pesquisaWeb: { ativa: false } });
  let r = await executar(ana, q.id, 'Pedido de teste.');
  assert.ok(r.chamadas.every(b => !b.plugins));
  assert.match(sistemaDe(r.chamadas[0]), /pesquisa na internet NÃO está disponível nesta execução \(a pesquisa na internet não está liberada pela empresa\)\. Não simule/);
  assert.equal(r.fim.qualidade.status, 'parcial');
  assert.match(r.fim.qualidade.avisos[0], /^Resultado parcial: a pesquisa na internet não foi feita/);
  // Entregável faltando: falha, uma correção, e o que faltou é dito.
  salvarConfig(S.app.db, { pesquisaWeb: { ativa: true } });
  modo = 'faltando';
  r = await executar(ana, q.id, 'Pedido de teste.');
  assert.equal(r.fim.qualidade.status, 'inconsistente');
  assert.ok(r.chamadas.some(b => String(b.messages.at(-1).content).includes('Faltaram entregáveis: Instagram · Legenda')));
  modo = 'completo';
  // Conversa sigilosa: a pesquisa não sai (o pedido iria para fora).
  salvarConfig(S.app.db, { allow_sensitive_processing_with_guardrails: true });
  await admin.post(`/api/admin/modelos/${enc(MODELO)}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida.' });
  const conv = (await ana.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
  await ana.patch(`/api/conversas/${conv.id}`, { sigilosa: true });
  r = await executar(ana, q.id, 'Pedido de teste.', { conv });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.ok(r.chamadas.every(b => !b.plugins), 'sigilosa: sem pesquisa');
  assert.equal(r.fim.qualidade.status, 'parcial');
  assert.equal(ultimoEvento('quickwin.tested').pesquisa.feita, false);
});

test('aceite C: teste contextual e real (exemplo fictício do Quick Win, mesma engine, fora da medição)', async () => {
  const conteudo = await criar(APY);
  let ex = (await ana.post(`/api/quick-wins/${conteudo.id}/exemplo-teste`, {})).dados;
  assert.equal(ex.modo, 'texto');
  assert.equal(ex.aviso, 'Exemplo fictício gerado para testar este Quick Win. Nenhum dado real é usado.');
  assert.match(ex.texto, /Instagram · Legenda/);
  assert.match(ex.texto, /Pesquise os temas/);
  // Outro trabalho: material fictício escrito pela IA a partir do objetivo, pela governança (uma chamada; repetir reaproveita).
  const resp = await criar('Responder reclamações de atraso de pedido com cordialidade');
  const antes = OR.chamadas.length;
  ex = (await ana.post(`/api/quick-wins/${resp.id}/exemplo-teste`, {})).dados;
  assert.equal(ex.modo, 'texto');
  assert.match(ex.texto, /fictício/);
  assert.equal(OR.chamadas.length, antes + 1);
  assert.equal((await ana.post(`/api/quick-wins/${resp.id}/exemplo-teste`, {})).dados.cache, true);
  assert.equal(OR.chamadas.length, antes + 1);
  assert.ok(um(S.app.db, "select 1 from roteamento where origem = 'quick_win_exemplo'"), 'decisão registrada');
  // Trabalho com arquivo: pede o arquivo. Sem contexto: a mensagem de fallback.
  const img = await criar('Ler fotos de comprovantes digitalizados e extrair valor e data');
  assert.equal((await ana.post(`/api/quick-wins/${img.id}/exemplo-teste`, {})).dados.modo, 'arquivo');
  const vago = await criar('Fazer');
  assert.deepEqual((await ana.post(`/api/quick-wins/${vago.id}/exemplo-teste`, {})).dados, { modo: 'insuficiente', mensagem: OP.SEM_CONTEXTO_EXEMPLO });
  // Quem não gere não gera exemplo: rascunho ainda não publicado nem aparece (404); publicado, 403.
  assert.equal((await carlos.post(`/api/quick-wins/${resp.id}/exemplo-teste`, {})).status, 404);
  await ana.post(`/api/quick-wins/${resp.id}/publicar`, {});
  assert.equal((await carlos.post(`/api/quick-wins/${resp.id}/exemplo-teste`, {})).status, 403);
  assert.equal((await dani.post(`/api/quick-wins/${resp.id}/exemplo-teste`, {})).status, 404);
  // O teste roda a execução real e não entra na medição.
  const r = await executar(ana, conteudo.id, ex.texto);
  assert.equal(r.status, 200);
  assert.equal(um(S.app.db, 'select teste from uso where conversa_id = ?', r.conv.id).teste, 1);
});

test('aceite D: falta contexto essencial, a execução pergunta, pausa e continua com a resposta', async () => {
  const q = await criar('Crie posts para LinkedIn e Instagram sobre o lançamento');
  modo = 'pergunta';
  let r = await executar(ana, q.id, 'Pedido de teste.');
  assert.equal(r.fim.qualidade.status, 'pergunta');
  assert.ok(ultimoEvento('quickwin.context_requested'));
  modo = 'completo';
  // A resposta da pessoa, na mesma conversa, continua a mesma execução (com o contrato e a conferência).
  const antes = OR.chamadas.length;
  r = { ...(await enviarMensagem(ana, r.conv.id, { texto: 'É a Apy Mine, para gestores de operação.' })), conv: r.conv };
  const chamadas = OR.chamadas.slice(antes);
  assert.ok(chamadas.some(ehConferencia), 'retomou a execução com conferência');
  assert.match(sistemaDe(chamadas[0]), /Entregáveis \(entregue todos/);
  assert.equal(r.fim.qualidade.status, 'aprovado');
});

test('aceite E: excluir preserva histórico, some do catálogo, respeita permissão e não afeta outra empresa nem o modelo global', async () => {
  const q = await criar('Organizar anotações da reunião semanal em tarefas');
  const r = await executar(ana, q.id, 'Anotação: comprar luvas até sexta.');
  assert.equal(r.status, 200);
  await ana.post(`/api/quick-wins/${q.id}/publicar`, {});
  // Sem permissão: quem só usa recebe 403; quem não vê, 404 (não revela).
  assert.equal((await carlos.del(`/api/quick-wins/${q.id}`)).status, 403);
  assert.equal((await dani.del(`/api/quick-wins/${q.id}`)).status, 404);
  assert.equal((await carlos.get(`/api/quick-wins/${q.id}`)).dados.podeEditar, false, 'a ação não aparece para quem não gere');
  assert.equal((await ana.del(`/api/quick-wins/${q.id}`)).status, 200);
  const linha = um(S.app.db, 'select excluido_em, excluido_por from quick_wins where id = ?', q.id);
  assert.ok(linha.excluido_em && linha.excluido_por === ana.pessoa.id, 'soft delete');
  assert.equal(um(S.app.db, 'select count(*) as n from quick_win_versoes where quick_win_id = ?', q.id).n, 1, 'versões preservadas');
  assert.ok(um(S.app.db, 'select 1 from conversas where id = ? and quick_win_id = ?', r.conv.id, q.id), 'conversa preservada com o vínculo');
  assert.ok(um(S.app.db, 'select 1 from roteamento where quick_win_id = ?', q.id), 'execuções preservadas');
  assert.equal(ultimoEvento('quickwin.deleted').soft, true);
  // Fora do catálogo e de conversas novas.
  assert.ok(!(await ana.get('/api/quick-wins')).dados.quickWins.some(x => x.id === q.id));
  assert.equal((await ana.get(`/api/quick-wins/${q.id}`)).status, 404);
  assert.equal((await carlos.post('/api/conversas', { quick_win_id: q.id })).status, 404);
  assert.equal((await ana.del(`/api/quick-wins/${q.id}`)).status, 404, 'excluir de novo: não existe mais no catálogo');
  // A conversa que já existia continua legível e pode seguir.
  assert.equal((await ana.get(`/api/conversas/${r.conv.id}`)).status, 200);
  assert.equal((await enviarMensagem(ana, r.conv.id, { texto: 'Resuma em uma linha.' })).status, 200);
  // Modelo inicial (global): ocultar vale só para esta empresa; o arquivo e outras empresas não mudam.
  const antes = (await ana.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
  assert.equal((await carlos.post('/api/quick-wins/modelos-iniciais/0/ocultar', {})).status, 403);
  assert.equal((await admin.post('/api/quick-wins/modelos-iniciais/0/ocultar', {})).status, 200);
  const depois = (await ana.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
  assert.equal(depois.length, antes.length - 1);
  assert.ok(!depois.some(m => m.indice === 0) && depois.every(m => Number.isInteger(m.indice)));
  assert.equal(ultimoEvento('quickwin.hidden').global, true);
  const outra = await subir({ ia: OR.ia });
  try {
    const adm2 = await outra.cliente().entrar('admin@exemplo.com.br');
    assert.equal((await adm2.get('/api/quick-wins/modelos-iniciais')).dados.modelos.length, antes.length, 'a outra empresa continua com o modelo');
    assert.equal(um(outra.app.db, 'select count(*) as n from quick_wins').n, 0, 'nada da primeira empresa aparece na outra');
  } finally { await outra.fechar(); }
});

test('compatibilidade: Quick Win antigo (sem operação) segue igual; especificação forjada não liga ferramenta', async () => {
  const e = C.construir({ descricao: 'Resumir textos longos', formato: 'lista' });
  // Todo Quick Win tem plano (entradas e etapas); um trabalho simples continua com um único formato e sem ferramenta.
  assert.equal(e.operacao.v, 2);
  assert.deepEqual(e.operacao.entregaveis, []);
  assert.deepEqual(e.ferramentas_permitidas, []);
  assert.match(C.promptExecucao(e, { nome: 'x' }), /Você não tem ferramentas nem acesso a sistemas externos\./);
  // Ferramenta sem a operação que a pede: descartada na leitura.
  assert.deepEqual(C.normalizar({ ...e, ferramentas_permitidas: ['pesquisa_web', 'email'] }).ferramentas_permitidas, []);
  const antigo = (await ana.post('/api/quick-wins', { nome: 'Antigo', instrucoes: 'Resuma.', areas: [A.id] })).dados;
  assert.equal(antigo.v2, undefined);
  assert.equal((await ana.del(`/api/quick-wins/${antigo.id}`)).status, 200, 'o antigo também é excluído sem perder nada');
  assert.ok(um(S.app.db, 'select 1 from quick_wins where id = ?', antigo.id));
  assert.equal(todos(S.app.db, "select tipo from eventos where tipo like 'quick_win.%'").length, 0, 'a auditoria usa o prefixo quickwin.*');
});

test('inferência: canal coordenado herda as peças já pedidas ("posts para LinkedIn e Instagram e um Reels")', () => {
  const r = t => OP.inferirOperacao(t).entregaveis.map(OP.rotuloEntregavel);
  assert.deepEqual(r('Crie posts para LinkedIn e Instagram e um Reels'), ['LinkedIn · Copy', 'Instagram · Legenda', 'Instagram · Reels']);
  assert.deepEqual(r('Crie copy e carrossel para LinkedIn e Instagram'), ['LinkedIn · Copy', 'Instagram · Legenda', 'LinkedIn · Carrossel', 'Instagram · Carrossel']);
  // Lista compartilhada por canais coordenados: cada peça nos canais em que faz sentido (Reels só no Instagram).
  assert.deepEqual(r('Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.'), ['LinkedIn · Copy', 'Instagram · Legenda', 'LinkedIn · Carrossel', 'Instagram · Carrossel', 'Instagram · Reels']);
  assert.deepEqual(r('Crie uma copy para LinkedIn'), ['LinkedIn · Copy']);
});

test('citações no formato oficial do OpenRouter (message.annotations e delta.annotations); só http(s)', async () => {
  const { criarOpenRouter } = await import('../src/ia.js');
  const cit = (url, title) => ({ type: 'url_citation', url_citation: { url, title, content: 'trecho', start_index: 0, end_index: 5 } });
  const ler = async chunks => {
    const corpo = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
    let enviado;
    const ia = criarOpenRouter({ chave: 'x', fetch: async (_u, op) => { enviado = JSON.parse(op.body); return new Response(new Blob([corpo]).stream(), { status: 200 }); } });
    const out = [];
    for await (const e of ia.enviar([{ role: 'user', content: 'x' }], { modelo: 'm', pesquisaWeb: { max: 5 } })) out.push(e);
    return { fontes: out.filter(e => e.tipo === 'fonte'), enviado };
  };
  let r = await ler([{ choices: [{ delta: { content: 'a' } }] }, { choices: [{ message: { role: 'assistant', content: 'a', annotations: [cit('https://exemplo.org/1', 'Um')] } }] }]);
  assert.deepEqual(r.fontes, [{ tipo: 'fonte', url: 'https://exemplo.org/1', titulo: 'Um' }]);
  assert.deepEqual(r.enviado.plugins, [{ id: 'web', engine: 'exa', max_results: 5 }]);
  r = await ler([{ choices: [{ delta: { content: 'a', annotations: [cit('https://exemplo.org/2', 'Dois'), cit('javascript:alert(1)', 'x')] } }] }]);
  assert.deepEqual(r.fontes.map(f => f.url), ['https://exemplo.org/2']);
});
