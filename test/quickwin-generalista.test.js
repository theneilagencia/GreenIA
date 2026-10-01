// Quick Wins generalistas: qualquer trabalho vira uma operação (plano) com entradas, etapas, ferramentas,
// entregáveis com dependências, critérios, lacunas e sugestões. Cenários A a J e o critério de aceite com as 7
// frases: todas recebem a mesma experiência estruturada (nenhuma depende de canal ou de palavra-chave).
// A IA falsa faz o papel do modelo: na interpretação devolve o plano que um bom modelo devolveria para o pedido;
// na execução, um título por entregável pedido no prompt. O que se testa é o caminho real da GreenIA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem, FONTES_FALSAS } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { json, um, todos } from '../src/db.js';
import { arquivo, docx } from './arquivos.js';
import * as OP from '../src/quickwin-operacao.js';
import * as C from '../src/quickwin-construtor.js';
import { lerInterpretacao } from '../src/quickwin-interpretacao.js';

const FRASES = {
  contratos: 'Analise contratos de fornecedores e destaque riscos e obrigações.',
  propostas: 'Compare propostas de três fornecedores considerando preço, prazo, escopo e risco.',
  concorrentes: 'Pesquise concorrentes e monte uma matriz de posicionamento.',
  planilha: 'Analise uma planilha mensal e identifique desvios relevantes.',
  reuniao: 'Transforme a reunião em ata, decisões e próximos passos.',
  relatorio: 'Prepare um relatório executivo mensal.',
  social: 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.',
};
const VAGO = 'Quero analisar meus fornecedores';
const IMAGEM = 'Gere a imagem pronta do anúncio de lançamento do nosso produto, com o texto do anúncio.';
// O plano que um bom modelo devolve para cada pedido (formato do PROMPT_INTERPRETACAO).
const PLANOS = {
  [FRASES.contratos]: { resumo: 'Lê contratos de fornecedores e aponta riscos e obrigações.', categoria: 'contratos',
    entradas: [{ tipo: 'documento', rotulo: 'Contrato do fornecedor', quantidade: 1, obrigatoria: true }],
    etapas: [{ texto: 'Ler o contrato inteiro', ferramenta: 'leitura_documento' }, { texto: 'Identificar as cláusulas' }, { texto: 'Classificar os riscos' }, { texto: 'Extrair as obrigações de cada parte' }, { texto: 'Indicar o que precisa de revisão' }],
    entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo executivo' }, { id: 'e2', tipo: 'riscos', rotulo: 'Riscos', descricao: 'Cláusulas de risco com a gravidade', depende_de: ['e1'] }, { id: 'e3', tipo: 'lista', rotulo: 'Obrigações' }, { id: 'e4', tipo: 'checklist', rotulo: 'Pontos para revisão', depende_de: ['e2', 'e3'] }],
    ferramentas: ['leitura_documento'], lacunas: [], sugestoes: [{ texto: 'Extrair também prazos, multas e responsáveis?', entregavel: { tipo: 'tabela', rotulo: 'Prazos e multas' } }],
    criterios: ['Cada risco cita a cláusula de onde veio', 'Obrigações separadas por parte'] },
  [FRASES.propostas]: { resumo: 'Compara três propostas e mostra diferenças e riscos.', categoria: 'compras',
    entradas: [{ tipo: 'documento', rotulo: 'Propostas dos fornecedores', quantidade: 3, obrigatoria: true }],
    etapas: [{ texto: 'Extrair os dados de cada proposta' }, { texto: 'Normalizar preço, prazo e escopo' }, { texto: 'Comparar item a item' }, { texto: 'Destacar os riscos' }],
    entregaveis: [{ id: 'e1', tipo: 'tabela', rotulo: 'Tabela comparativa', config: { colunas: ['Fornecedor', 'Preço', 'Prazo', 'Escopo', 'Risco'] } }, { id: 'e2', tipo: 'analise', rotulo: 'Análise das diferenças', depende_de: ['e1'] }, { id: 'e3', tipo: 'riscos', rotulo: 'Riscos' }, { id: 'e4', tipo: 'recomendacao', rotulo: 'Conclusão', depende_de: ['e2', 'e3'] }],
    ferramentas: ['leitura_documento'], lacunas: [{ id: 'pesos', pergunta: 'Quais critérios pesam mais: preço, prazo, escopo ou risco?', motivo: 'Muda a conclusão', obrigatoria: false }], criterios: ['Todos os fornecedores comparados nos mesmos critérios'] },
  [FRASES.concorrentes]: { resumo: 'Pesquisa concorrentes e monta a matriz de posicionamento.', categoria: 'vendas', contexto_empresa: true, entradas: [],
    etapas: [{ texto: 'Entender a empresa', ferramenta: 'base_empresa' }, { texto: 'Identificar concorrentes', ferramenta: 'pesquisa_web' }, { texto: 'Comparar posicionamento' }, { texto: 'Sintetizar oportunidades' }],
    entregaveis: [{ id: 'e1', tipo: 'lista', rotulo: 'Concorrentes' }, { id: 'e2', tipo: 'matriz', rotulo: 'Matriz de posicionamento', depende_de: ['e1'] }, { id: 'e3', tipo: 'analise', rotulo: 'Análise de posicionamento', depende_de: ['e2'] }, { id: 'e4', tipo: 'lista', rotulo: 'Oportunidades', depende_de: ['e3'] }],
    ferramentas: ['pesquisa_web', 'base_empresa'], lacunas: [{ id: 'mercado', pergunta: 'Em qual mercado e região a empresa compete?', obrigatoria: true, exemplo: 'Ex.: software B2B no Brasil' }] },
  [FRASES.planilha]: { resumo: 'Analisa a planilha do mês e aponta desvios.', categoria: 'financeiro', entradas: [{ tipo: 'planilha', rotulo: 'Planilha mensal de custos', obrigatoria: true }],
    etapas: [{ texto: 'Validar a estrutura da planilha', ferramenta: 'analise_planilha' }, { texto: 'Identificar os campos relevantes' }, { texto: 'Calcular as variações' }, { texto: 'Localizar os desvios' }],
    entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo' }, { id: 'e2', tipo: 'tabela', rotulo: 'Desvios', depende_de: ['e1'] }, { id: 'e3', tipo: 'lista', rotulo: 'Itens prioritários', depende_de: ['e2'] }],
    ferramentas: ['analise_planilha'], sugestoes: [{ texto: 'Sugerir também um plano de ação para cada desvio?', entregavel: { tipo: 'plano_acao', rotulo: 'Plano de ação' } }] },
  [FRASES.reuniao]: { resumo: 'Transforma a reunião em ata, decisões e próximos passos.', categoria: 'operacoes', entradas: [{ tipo: 'transcricao', rotulo: 'Transcrição ou anotações da reunião', obrigatoria: true }],
    etapas: [{ texto: 'Ler a transcrição' }, { texto: 'Separar assuntos e decisões' }, { texto: 'Listar responsáveis e prazos' }],
    entregaveis: [{ id: 'e1', tipo: 'ata', rotulo: 'Ata' }, { id: 'e2', tipo: 'lista', rotulo: 'Decisões' }, { id: 'e3', tipo: 'plano_acao', rotulo: 'Próximos passos', descricao: 'Com responsável e prazo' }, { id: 'e4', tipo: 'lista', rotulo: 'Pendências' }] },
  [FRASES.relatorio]: { resumo: 'Monta o relatório executivo do mês.', categoria: 'operacoes', entradas: [{ tipo: 'dados', rotulo: 'Dados e indicadores do mês', obrigatoria: true }],
    etapas: [{ texto: 'Ler os dados do mês' }, { texto: 'Comparar com o mês anterior e a meta' }, { texto: 'Destacar o que mudou' }],
    entregaveis: [{ id: 'e1', tipo: 'relatorio', rotulo: 'Relatório executivo' }], lacunas: [{ id: 'fonte_dados', pergunta: 'De onde virão os dados do relatório?', obrigatoria: false }] },
  [FRASES.social]: { resumo: 'Cria conteúdo para LinkedIn e Instagram.', categoria: 'conteudo', contexto_empresa: true, entradas: [],
    etapas: [{ texto: 'Entender a empresa e o público', ferramenta: 'base_empresa' }, { texto: 'Escrever cada peça no formato do canal' }],
    entregaveis: [{ id: 'e1', tipo: 'copy', canal: 'linkedin' }, { id: 'e2', tipo: 'carrossel', canal: 'linkedin' }, { id: 'e3', tipo: 'legenda', canal: 'instagram' }, { id: 'e4', tipo: 'carrossel', canal: 'instagram' }, { id: 'e5', tipo: 'reels', canal: 'instagram' }],
    ferramentas: ['base_empresa'] },
  [VAGO]: { resumo: 'Analisa fornecedores pelos critérios definidos.', categoria: 'compras', entradas: [{ tipo: 'dados', rotulo: 'Dados dos fornecedores', obrigatoria: true }],
    etapas: [{ texto: 'Reunir os dados' }, { texto: 'Avaliar pelos critérios' }],
    entregaveis: [{ id: 'e1', tipo: 'analise', rotulo: 'Análise dos fornecedores' }],
    lacunas: [{ id: 'objetivo', pergunta: 'O que você quer saber dos fornecedores: desempenho, custo, risco ou conformidade?', obrigatoria: true }, { id: 'dados', pergunta: 'De onde vêm os dados dos fornecedores?', obrigatoria: true }] },
  [IMAGEM]: { resumo: 'Prepara a imagem do anúncio.', categoria: 'conteudo', contexto_empresa: true, entradas: [],
    etapas: [{ texto: 'Escrever o texto do anúncio' }, { texto: 'Descrever a imagem', ferramenta: 'geracao_imagem' }],
    entregaveis: [{ id: 'e1', tipo: 'texto', rotulo: 'Texto do anúncio' }, { id: 'e2', tipo: 'imagem', rotulo: 'Imagem do anúncio' }], ferramentas: ['geracao_imagem', 'base_empresa'] },
};

const sis = b => JSON.stringify(b.messages[0].content);
const ultima = b => JSON.stringify(b.messages.filter(m => m.role === 'user').at(-1)?.content || '');
const tipoDe = b => (sis(b).includes('PLANO DE TRABALHO') ? 'interpretacao' : sis(b).includes('conferente de qualidade') ? 'conferencia' : sis(b).includes('material FICTÍCIO') ? 'exemplo'
  : sis(b).includes('Etapa 1 de 2') ? 'coleta' : sis(b).includes('Você está executando o Quick Win') ? 'execucao' : 'outra');
let interpretacaoQuebrada = false;
function roteiro(b) {
  const t = tipoDe(b);
  if (t === 'interpretacao') {
    if (interpretacaoQuebrada) return 'não sei responder em JSON';
    const pedido = /<pedido[^>]*>\n([\s\S]+?)\n<\/pedido>/.exec(String(b.messages.filter(m => m.role === 'user').at(-1)?.content || ''))?.[1] || '';
    const plano = PLANOS[Object.keys(PLANOS).find(k => pedido.includes(k))];
    return plano ? JSON.stringify(plano) : '{"entregaveis":[]}';
  }
  if (t === 'conferencia') return '{"criterios":[]}';
  if (t === 'exemplo') return `MATERIAL FICTÍCIO\n${/Material que o trabalho recebe: ([^\\"]+)/.exec(ultima(b))?.[1] || 'texto'}\nEmpresa Exemplo Ltda., valor R$ 1.000,00, prazo não informado.`;
  if (t === 'coleta') return 'Notas da pesquisa:\n- Concorrente Alfa (fictício) — fonte: Revista Exemplo';
  if (t !== 'execucao') return 'Certo.';
  // Material obrigatório que não veio: o modelo pede (o prompt manda pedir em vez de inventar).
  if (sis(b).includes('Material deste trabalho') && ultima(b).includes('SEM MATERIAL')) return `${C.MARCADOR_PERGUNTA} envie as 3 propostas dos fornecedores.`;
  const titulos = [...sis(b).matchAll(/\d+\. ## ([^\\(]+?)(?: \(|\\n|")/g)].map(m => m[1].trim());
  if (!titulos.length) return '## Resumo\nTexto.\n\n## Pontos de atenção\n- Nenhum.\n\n## Informações não encontradas\nNenhuma';
  return titulos.map(x => `## ${x}\n${/Carrossel|Reels|Imagem/.test(x) ? `${OP.MARCA_BRIEFING}\nCena 1 (5s): conteúdo.` : /Tabela|Matriz|Desvios/.test(x) ? '| Item | Valor |\n|---|---|\n| A | 1 |' : `Conteúdo de ${x}.`}`).join('\n\n')
    + (sis(b).includes('Notas da pesquisa desta execu') ? `\n\n## ${OP.SECAO_FONTES}\n- Revista Exemplo: https://revista.exemplo/x` : '');
}

let S, OR, admin, ana, A;
before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], pesquisaWeb: { ativa: true } });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Operações' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  await admin.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo('sobre.docx', docx(['Sobre a Empresa Exemplo (fictícia): software B2B para gestão de fornecedores.'])) });
});
after(async () => { await S.fechar(); await OR.fechar(); });

const interpretar = async descricao => {
  const r = await ana.post('/api/quick-wins/assistente/interpretar', { descricao });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r.dados;
};
// Cria como a tela cria: com o plano interpretado e a chave da interpretação.
async function criarComPlano(descricao) {
  const it = await interpretar(descricao);
  const r = await ana.post('/api/quick-wins', { assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } }, areas: [A.id] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return { qw: r.dados, it, espec: json(um(S.app.db, 'select especificacao from quick_wins where id = ?', r.dados.id).especificacao) };
}
async function executar(qwId, corpo) {
  const conv = (await ana.post('/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { executar_quick_win: true, ...corpo });
  return { ...r, conv, chamadas: OR.chamadas.slice(antes) };
}
const exec = chamadas => chamadas.find(b => tipoDe(b) === 'execucao');

test('critério de aceite: as 7 frases recebem a mesma estrutura de operação (não só a de social media)', async () => {
  for (const [nome, frase] of Object.entries(FRASES)) {
    const { qw, it, espec } = await criarComPlano(frase);
    assert.equal(it.fonte, 'ia', `${nome}: interpretado pela IA`);
    const op = espec.operacao;
    assert.equal(op.v, 2, nome);
    assert.ok(op.etapas.length >= 2, `${nome}: etapas`);
    assert.ok(op.entregaveis.length >= 1, `${nome}: entregáveis`);
    assert.ok(Array.isArray(op.entradas) || nome === 'social' || nome === 'concorrentes', `${nome}: entradas`);
    assert.equal(op.origem, 'ia');
    assert.deepEqual(espec.procedimento, op.etapas.map(x => x.texto), `${nome}: as etapas viram o "como fazer"`);
    // Formato derivado do plano: vários entregáveis viram seções; um só, o contrato do formato dele.
    assert.equal(espec.formato_saida.tipo, op.entregaveis.length > 1 ? 'outro' : 'relatorio', nome);
    // Editável: a pessoa tira um entregável e acrescenta outro; vira a decisão dela.
    const novo = { ...op, origem: 'pessoa', entregaveis: [...op.entregaveis.slice(0, -1), { id: 'x', tipo: 'checklist', rotulo: 'Checklist final' }] };
    const up = await ana.put(`/api/quick-wins/${qw.id}`, { assistente: { descricao: frase, operacao: novo } });
    assert.equal(up.status, 200, JSON.stringify(up.dados));
    const e2 = json(um(S.app.db, 'select especificacao from quick_wins where id = ?', qw.id).especificacao);
    assert.equal(e2.operacao.origem, 'pessoa');
    assert.equal(e2.operacao.entregaveis.at(-1).rotulo, 'Checklist final');
    // Teste real: material fictício do tipo da entrada e execução completa, com um resultado por entregável.
    const ex = (await ana.post(`/api/quick-wins/${qw.id}/exemplo-teste`, {})).dados;
    assert.equal(ex.modo, 'texto', `${nome}: exemplo pronto`);
    const r = await executar(qw.id, { texto: ex.texto });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
    assert.equal(r.falha, undefined, `${nome}: ${JSON.stringify(r.falha)}`);
    if (e2.operacao.entregaveis.length > 1) {
      for (const e of e2.operacao.entregaveis) assert.match(r.texto, new RegExp(`## ${OP.rotuloEntregavel(e).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${nome}: ${OP.rotuloEntregavel(e)}`);
      assert.deepEqual(r.fim.qualidade.entregaveis, { esperados: e2.operacao.entregaveis.length, encontrados: e2.operacao.entregaveis.length }, nome);
    }
  }
});

test('A. social media continua: canal é só um metadado do entregável', async () => {
  const { espec } = await criarComPlano(FRASES.social);
  assert.deepEqual(espec.operacao.canais, ['linkedin', 'instagram']);
  assert.deepEqual(espec.operacao.entregaveis.map(OP.rotuloEntregavel), ['LinkedIn · Copy', 'LinkedIn · Carrossel', 'Instagram · Legenda', 'Instagram · Carrossel', 'Instagram · Reels']);
  const p = C.promptExecucao(espec, { nome: 'x' });
  assert.match(p, /Adapte cada peça ao canal dela/);
  assert.match(p, /Use o contexto da empresa/);
  // Sem IA, a heurística liga cada peça aos canais em que faz sentido (o pedido compartilha a lista).
  assert.deepEqual(OP.inferirOperacao(FRASES.social).entregaveis.map(OP.rotuloEntregavel), ['LinkedIn · Copy', 'Instagram · Legenda', 'LinkedIn · Carrossel', 'Instagram · Carrossel', 'Instagram · Reels']);
});

test('B. contrato: documento → resumo, riscos e obrigações, com dependências, critérios e sugestão opcional', async () => {
  const { it, espec, qw } = await criarComPlano(FRASES.contratos);
  assert.deepEqual(it.operacao.entradas.map(x => [x.tipo, x.obrigatoria]), [['documento', true]]);
  assert.deepEqual(it.operacao.entregaveis.map(OP.rotuloEntregavel), ['Resumo executivo', 'Riscos', 'Obrigações', 'Pontos para revisão']);
  assert.deepEqual(it.operacao.entregaveis[3].depende_de, ['e2', 'e3']);
  // A sugestão não entra sozinha: fica para a pessoa decidir.
  assert.equal(it.operacao.sugestoes[0].entregavel.rotulo, 'Prazos e multas');
  assert.ok(!espec.operacao.entregaveis.some(e => e.rotulo === 'Prazos e multas'));
  const p = C.promptExecucao(espec, { nome: 'x' });
  assert.match(p, /Material deste trabalho:\n- Contrato do fornecedor: obrigatório/);
  assert.match(p, /4\. ## Pontos para revisão\n {3}Feito a partir de: Riscos; Obrigações/);
  assert.match(p, /O resultado precisa atender a:\n- Cada risco cita a cláusula/);
  assert.ok(espec.criterios_qualidade.some(c => c.texto === 'Cada risco cita a cláusula de onde veio'));
  // Com o contrato anexado (PDF/Word), a execução produz cada entregável.
  const r = await executar(qw.id, { texto: 'Analise este contrato.', anexos: [arquivo('contrato.docx', docx(['CONTRATO DE FORNECIMENTO (fictício). Multa de 10% por atraso. Prazo: 12 meses.']))] });
  assert.equal(r.falha, undefined);
  for (const t of ['Resumo executivo', 'Riscos', 'Obrigações', 'Pontos para revisão']) assert.match(r.texto, new RegExp(`## ${t}`));
  assert.match(JSON.stringify(exec(r.chamadas).messages), /CONTRATO DE FORNECIMENTO/);
});

test('C. fornecedores: 3 propostas → tabela, análise e riscos; sem os arquivos, pede antes de responder', async () => {
  const { espec, qw } = await criarComPlano(FRASES.propostas);
  assert.deepEqual(espec.operacao.entradas[0], { id: 'i1', tipo: 'documento', rotulo: 'Propostas dos fornecedores', quantidade: 3, obrigatoria: true });
  assert.deepEqual(espec.operacao.entregaveis[0].config.colunas, ['Fornecedor', 'Preço', 'Prazo', 'Escopo', 'Risco']);
  assert.match(C.promptExecucao(espec, { nome: 'x' }), /1\. ## Tabela comparativa \(colunas: Fornecedor \| Preço \| Prazo \| Escopo \| Risco\)/);
  // O exemplo pronto é das três propostas fictícias (o tipo real da entrada).
  const ex = (await ana.post(`/api/quick-wins/${qw.id}/exemplo-teste`, {})).dados;
  assert.match(ex.texto, /Propostas dos fornecedores \(Documento \(PDF, Word\), 3 itens\)/);
  // Sem material: o prompt manda pedir; a execução pausa com a pergunta, sem resposta genérica.
  const r = await executar(qw.id, { texto: 'SEM MATERIAL: compare.' });
  assert.match(C.promptExecucao(espec, { nome: 'x' }), /não faça o trabalho com dados de exemplo nem inventados: peça o que falta/);
  assert.equal(r.fim.qualidade.status, 'pergunta');
  assert.match(r.texto, /envie as 3 propostas/);
});

test('D. pesquisa de mercado: web + contexto da empresa, em etapas; a lacuna de mercado é perguntada', async () => {
  const { it, espec, qw } = await criarComPlano(FRASES.concorrentes);
  assert.deepEqual(it.lacunas.map(l => [l.id, l.obrigatoria]), [['mercado', true]]);
  assert.deepEqual(espec.ferramentas_permitidas, ['pesquisa_web'], 'só a ferramenta executável entra na governança');
  assert.ok(espec.operacao.ferramentas.includes('base_empresa'));
  // A pessoa responde a lacuna; a resposta entra no contexto da execução.
  const op = { ...espec.operacao, contexto_respostas: [{ id: 'mercado', resposta: 'Software B2B no Brasil' }] };
  await ana.put(`/api/quick-wins/${qw.id}`, { assistente: { descricao: FRASES.concorrentes, operacao: op } });
  const r = await executar(qw.id, { texto: 'Execute agora.' });
  const [coleta, producao] = r.chamadas.filter(b => ['coleta', 'execucao'].includes(tipoDe(b)));
  assert.equal(tipoDe(coleta), 'coleta');
  assert.ok(coleta.plugins, 'a coleta pesquisa');
  assert.equal(producao.plugins, undefined);
  assert.match(sis(producao), /Em qual mercado e região a empresa compete\? Software B2B no Brasil/);
  assert.match(sis(producao), /software B2B para gestão de fornecedores/, 'contexto da empresa (base)');
  for (const t of ['Concorrentes', 'Matriz de posicionamento', 'Análise de posicionamento', 'Oportunidades']) assert.match(r.texto, new RegExp(`## ${t}`));
  assert.equal(r.fim.qualidade.pesquisa.feita, true);
  assert.deepEqual(r.fim.fontes.filter(f => f.url).map(f => f.url), FONTES_FALSAS.map(f => f.url));
});

test('E. planilha: dados → resumo, desvios e prioridades; sugestão aceita vira entregável', async () => {
  const { espec, qw, it } = await criarComPlano(FRASES.planilha);
  assert.deepEqual(espec.operacao.ferramentas, ['analise_planilha']);
  assert.equal(espec.operacao.entradas[0].tipo, 'planilha');
  const ex = (await ana.post(`/api/quick-wins/${qw.id}/exemplo-teste`, {})).dados;
  assert.match(ex.texto, /Planilha mensal de custos \(Planilha\)/, 'exemplo de dados tabulares fictícios');
  const sugestao = it.operacao.sugestoes[0];
  const op = { ...espec.operacao, entregaveis: [...espec.operacao.entregaveis, { id: 'n', ...sugestao.entregavel, depende_de: ['e2'] }] };
  await ana.put(`/api/quick-wins/${qw.id}`, { assistente: { descricao: FRASES.planilha, operacao: op } });
  const e2 = json(um(S.app.db, 'select especificacao from quick_wins where id = ?', qw.id).especificacao);
  // Rótulo igual ao do catálogo não é repetido no plano.
  assert.deepEqual(e2.operacao.entregaveis.at(-1), { id: 'e4', tipo: 'plano_acao', canal: null, config: {}, depende_de: ['e2'] });
  assert.equal(OP.rotuloEntregavel(e2.operacao.entregaveis.at(-1)), 'Plano de ação');
});

test('F. reunião: transcrição → ata, decisões, próximos passos e pendências', async () => {
  const { espec } = await criarComPlano(FRASES.reuniao);
  assert.equal(espec.operacao.entradas[0].tipo, 'transcricao');
  assert.deepEqual(espec.operacao.entregaveis.map(e => e.rotulo || OP.ENTREGAVEIS[e.tipo].rotulo), ['Ata', 'Decisões', 'Próximos passos', 'Pendências']);
  assert.match(C.promptExecucao(espec, { nome: 'x' }), /3\. ## Próximos passos\n {3}O que é: Com responsável e prazo/);
});

test('G. relatório: um entregável só é o contrato do formato (relatório), com a lacuna da origem dos dados', async () => {
  const { espec, it } = await criarComPlano(FRASES.relatorio);
  assert.equal(espec.formato_saida.tipo, 'relatorio');
  assert.equal(OP.entregaMultipla(espec.operacao), false);
  assert.deepEqual(it.lacunas.map(l => l.pergunta), ['De onde virão os dados do relatório?']);
});

test('H. pedido vago: o Quick Win pergunta o mínimo necessário', async () => {
  const it = await interpretar(VAGO);
  assert.ok(it.lacunas.length >= 1 && it.lacunas.length <= 3);
  assert.ok(it.lacunas.every(l => l.obrigatoria));
  assert.match(it.lacunas[0].pergunta, /desempenho, custo, risco ou conformidade/);
});

test('I. ferramenta ausente: a GreenIA explica e entrega a alternativa possível (nunca simula)', async () => {
  const { it, espec } = await criarComPlano(IMAGEM);
  assert.deepEqual(it.ferramentasIndisponiveis.map(f => f.id), ['geracao_imagem']);
  const p = C.promptExecucao(espec, { nome: 'x' });
  assert.match(p, /Ferramenta indisponível: "Geração de imagem" não existe nesta execução\. Não simule a ferramenta: entregue o briefing da imagem/);
  assert.match(p, /Briefing \(a arte final não é gerada aqui\)/);
});

test('J. Quick Win antigo: continua funcionando e é atualizado sem perder histórico (só vale ao publicar)', async () => {
  const antigo = (await ana.post('/api/quick-wins', { nome: 'Resumo de propostas', para_que_serve: 'Resume propostas comerciais', instrucoes: 'Resuma a proposta em 5 linhas.', areas: [A.id], status: 'em_uso', modelo: 'classe:rapido' })).dados;
  assert.equal(antigo.v2, undefined);
  const conv = (await ana.post('/api/conversas', { quick_win_id: antigo.id })).dados.conversa;
  await enviarMensagem(ana, conv.id, { texto: 'Proposta fictícia: R$ 10,00.' });
  // Atualizar: a GreenIA sugere o plano a partir do que ele faz; a pessoa confirma e salva.
  const it = await interpretar('Resume propostas comerciais');
  const up = await ana.put(`/api/quick-wins/${antigo.id}`, { assistente: { descricao: 'Resume propostas comerciais', operacao: { ...(it.operacao || C.planoHeuristico('Resume propostas comerciais')), origem: 'pessoa' } } });
  assert.equal(up.status, 200, JSON.stringify(up.dados));
  assert.equal(up.dados.v2, true);
  const linha = um(S.app.db, 'select formato, pode_trocar, modelo from quick_wins where id = ?', antigo.id);
  assert.deepEqual([linha.modelo], ['classe:rapido'], 'a configuração antiga não muda');
  // Antes de publicar, quem usa continua no comportamento antigo (as instruções antigas).
  const antes = OR.chamadas.length;
  const c2 = (await ana.post('/api/conversas', { quick_win_id: antigo.id })).dados.conversa;
  await enviarMensagem(ana, c2.id, { texto: 'Outra proposta fictícia.' });
  assert.match(sis(OR.chamadas.slice(antes)[0]), /Resuma a proposta em 5 linhas/);
  assert.doesNotMatch(sis(OR.chamadas.slice(antes)[0]), /Você está executando o Quick Win/);
  // O histórico continua: a conversa antiga segue legível com as mensagens.
  assert.ok(todos(S.app.db, 'select 1 from mensagens where conversa_id = ?', conv.id).length >= 2);
  assert.equal((await ana.get(`/api/conversas/${conv.id}`)).status, 200);
  // Publicado: passa a valer o novo.
  assert.equal((await ana.post(`/api/quick-wins/${antigo.id}/publicar`, {})).status, 200);
  const c3 = (await ana.post('/api/conversas', { quick_win_id: antigo.id })).dados.conversa;
  const n = OR.chamadas.length;
  await enviarMensagem(ana, c3.id, { texto: 'Proposta 3.', executar_quick_win: true });
  assert.match(sis(OR.chamadas.slice(n)[0]), /Você está executando o Quick Win/);
});

test('interpretação: sem IA usável, plano heurístico (nunca trava); resposta com segredo ou fora do catálogo é descartada', async () => {
  interpretacaoQuebrada = true;
  const it = await interpretar('Organize as anotações da equipe em tarefas com responsável e prazo, versão 2.');
  interpretacaoQuebrada = false;
  assert.equal(it.fonte, 'heuristica');
  assert.equal(it.operacao.v, 2);
  assert.ok(it.operacao.etapas.length >= 3);
  // Validação do que a IA devolve: tipo desconhecido sai, dependência inválida sai, segredo derruba o plano.
  const op = lerInterpretacao(JSON.stringify({ entregaveis: [{ id: 'a', tipo: 'hack' }, { id: 'b', tipo: 'resumo', rotulo: 'Resumo', depende_de: ['zz', 'b'] }], ferramentas: ['email', 'pesquisa_web'], entradas: [{ tipo: 'nuvem' }] }));
  assert.deepEqual(op.entregaveis, [{ id: 'e1', tipo: 'resumo', canal: null, config: {}, rotulo: 'Resumo' }]);
  assert.deepEqual(op.ferramentas, ['pesquisa_web']);
  assert.equal(op.entradas, undefined);
  assert.equal(lerInterpretacao(JSON.stringify({ entregaveis: [{ tipo: 'resumo', rotulo: 'token sk-or-v1-1234567890abcdef1234567890abcdef' }] })), null);
  // A categoria só organiza: o mesmo plano com outra categoria executa igual.
  const a = C.construir({ descricao: 'x y z w', operacao: { ...PLANOS[FRASES.reuniao], categoria: 'operacoes', origem: 'ia' } });
  const b = C.construir({ descricao: 'x y z w', operacao: { ...PLANOS[FRASES.reuniao], categoria: 'juridico', origem: 'ia' } });
  assert.equal(C.promptExecucao(a, { nome: 'x' }), C.promptExecucao(b, { nome: 'x' }));
  // Segredo no plano enviado pela tela: recusado.
  const seg = await ana.post('/api/quick-wins', { assistente: { descricao: FRASES.reuniao, operacao: { ...PLANOS[FRASES.reuniao], etapas: [{ texto: 'usar a senha: Abc123!@#xyz token sk-or-v1-1234567890abcdef1234567890abcdef' }] } }, areas: [A.id] });
  assert.equal(seg.status, 422);
  // Mesmo pedido de novo: nenhuma chamada nova.
  const n = OR.chamadas.length;
  await interpretar(FRASES.reuniao);
  assert.equal(OR.chamadas.length, n, 'interpretação reaproveitada');
  assert.ok(todos(S.app.db, "select 1 from roteamento where origem = 'quick_win_interpretacao'").length >= 7, 'decisão registrada com a finalidade');
});

test('homologação real: plano da IA sem canal para peças de um pedido com canais recupera os canais do pedido', () => {
  // Fixture sanitizada do formato que o modelo devolveu numa rodada real: peças sem "canal".
  const resposta = JSON.stringify({ resumo: 'Cria conteúdo.', entradas: [], etapas: [{ texto: 'Definir temas' }, { texto: 'Escrever as peças' }],
    entregaveis: [{ id: 'e1', tipo: 'temas', rotulo: 'Temas e ganchos' }, { id: 'e2', tipo: 'copy' }, { id: 'e3', tipo: 'carrossel', depende_de: ['e1'] }, { id: 'e4', tipo: 'reels' }], ferramentas: ['base_empresa'], contexto_empresa: true });
  const op = lerInterpretacao(resposta, FRASES.social);
  assert.deepEqual(op.entregaveis.map(OP.rotuloEntregavel), ['Temas e ganchos', 'LinkedIn · Copy', 'Instagram · Legenda', 'LinkedIn · Carrossel', 'Instagram · Carrossel', 'Instagram · Reels']);
  assert.deepEqual(op.canais, ['linkedin', 'instagram']);
  // Pedido sem canal: nada muda.
  assert.deepEqual(lerInterpretacao(resposta, 'Crie conteúdo sobre segurança').entregaveis.map(e => e.tipo), ['temas', 'copy', 'carrossel', 'reels']);
});

test('trabalho que depende da empresa: o contexto da base chega mesmo sem palavra em comum com o pedido', async () => {
  const { qw } = await criarComPlano(FRASES.concorrentes);
  const r = await executar(qw.id, { texto: 'Execute agora.' });
  const producao = r.chamadas.find(b => tipoDe(b) === 'execucao');
  assert.match(sis(producao), /software B2B para gestão de fornecedores/);
});

test('rótulo vindo da IA não repete o canal do entregável', () => {
  const op = OP.limparOperacao({ entregaveis: [{ tipo: 'copy', canal: 'linkedin', rotulo: 'Copy LinkedIn' }, { tipo: 'copy', canal: 'instagram', rotulo: 'Legenda para Instagram' }, { tipo: 'roteiro', canal: 'instagram', rotulo: 'Roteiro para Reels' }] });
  assert.deepEqual(op.entregaveis.map(OP.rotuloEntregavel), ['LinkedIn · Copy', 'Instagram · Legenda', 'Instagram · Roteiro para Reels']);
});
