// QA 2026-10 (QA-04): contexto externo de pesquisa sanitizado. A pesquisa de mercado e concorrentes entregava a
// matriz vazia ("Concorrente A–E"): a busca recebia a última mensagem da pessoa ("Execute agora.") e o contexto
// da empresa só existia nos documentos internos, que não podem sair. Agora a coleta (a única chamada com a busca)
// leva só o contexto externo seguro: o tema do Quick Win, o perfil público que o admin classificou como apto, a
// resposta de mercado do responsável e o que a pessoa escreveu nesta execução. Faltando contexto de mercado, a
// execução pergunta o mínimo, sem pesquisar e sem inventar. Os casos usam dados fictícios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, docx } from './arquivos.js';
import { json, todos } from '../src/db.js';
import * as OP from '../src/quickwin-operacao.js';
import * as C from '../src/quickwin-construtor.js';

const PEDIDO = 'Pesquise os principais concorrentes da empresa e monte uma matriz de posicionamento.';
// Contexto interno fictício: nada disto pode aparecer numa chamada com a busca na internet.
const INTERNO = ['Cliente Sigma Mineração', 'preço interno de R$ 48.000', 'estratégia de entrada no Chile em 2027', 'carlos.souza@alfaqa.exemplo'];
const BASE = `Sobre a empresa Alfa (fictícia): software de gestão de fornecedores. Principal cliente: ${INTERNO[0]}. Tabela: ${INTERNO[1]}. Plano: ${INTERNO[2]}. Contato: ${INTERNO[3]}.`;

const sis = b => JSON.stringify(b.messages[0].content);
const tipo = b => sis(b).includes('conferente de qualidade') ? 'conferencia' : sis(b).includes('Etapa 1 de 2') ? 'coleta' : sis(b).includes('Você está executando o Quick Win') ? 'execucao' : 'outra';
function roteiro(b) {
  const t = tipo(b);
  if (t === 'conferencia') return '{"criterios":[],"objetivo_atingido":true}';
  if (t === 'coleta') return 'Notas da pesquisa:\n- Fornecedora Real Um (fonte: Revista Exemplo, https://revista.exemplo/a)';
  if (t !== 'execucao') return 'Certo.';
  const titulos = [...sis(b).matchAll(/\d+\. ## ([^\\(]+?)(?: \(|\\n|")/g)].map(m => m[1].trim());
  return (titulos.length ? titulos : ['Resultado']).map(x => `## ${x}\n| Item | Posição |\n|---|---|\n| Fornecedora Real Um | líder em preço |`).join('\n\n') + `\n\n## ${OP.SECAO_FONTES}\n- Revista Exemplo: https://revista.exemplo/a`;
}

let S, OR, A, B, ana, bia;
async function empresa(ops, nome, slug, email) {
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name.includes('Company'));
  const c = (await ops.post('/api/plataforma/empresas', { name: nome, slug, plan_id: plano.id, admin_email: email, status: 'ativa' })).dados;
  const n = S.navegador();
  await n.get(`/${slug}`);
  assert.equal((await n.entrarEmpresa(email)).status, 200);
  await n.post('/api/politica/ciencia', { versao: (await n.get('/api/politica')).dados.versao });
  return { c, n };
}
async function criarQw(cli, descricao = PEDIDO) {
  const area = (await cli.post('/api/admin/areas', { nome: `Mercado ${Math.random()}` })).dados.id;
  const r = await cli.post('/api/quick-wins', { assistente: { descricao }, areas: [area] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r.dados;
}
async function executar(cli, qwId, corpo, conv = null) {
  conv ??= (await cli.post('/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(cli, conv.id, { executar_quick_win: true, ...corpo });
  return { ...r, conv, chamadas: OR.chamadas.slice(antes) };
}
const comBusca = chamadas => chamadas.filter(b => b.plugins?.some(p => p.id === 'web'));

before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subirPlataforma({ ia: OR.ia });
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  ({ c: A, n: ana } = await empresa(ops, 'Alfa Fictícia', 'alfapx', 'ana@alfapx.exemplo'));
  ({ c: B, n: bia } = await empresa(ops, 'Beta Fictícia', 'betapx', 'bia@betapx.exemplo'));
  for (const n of [ana, bia]) assert.equal((await n.put('/api/admin/config', { pesquisaWeb: { ativa: true } })).status, 200);
  assert.equal((await ana.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo('sobre.docx', docx([BASE])) })).status, 200);
});
after(async () => { await S?.fechar(); await OR?.fechar(); });

test('só contexto interno: nenhuma busca, a pergunta mínima de mercado, sem "Concorrente A"', async () => {
  const q = await criarQw(ana);
  const r = await executar(ana, q.id, { texto: 'Execute agora.' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(r.chamadas.length, 0, 'sem contexto externo seguro, nada é enviado');
  assert.equal(r.fim.qualidade.status, 'pergunta');
  assert.ok(r.texto.startsWith(C.MARCADOR_PERGUNTA));
  assert.match(r.texto, /qual mercado ou categoria devo considerar para identificar os concorrentes\?/);
  assert.doesNotMatch(r.texto, /Concorrente [A-E]\b/);
  const ev = todos(S.P.tenant(A.id).db, "select detalhes from eventos where tipo = 'quickwin.context_requested' order by id desc limit 1")[0].detalhes;
  assert.match(ev, /contexto_externo_insuficiente/);
  assert.doesNotMatch(ev, /Sigma|Chile|48\.000/, 'auditoria só com metadados');

  // A pessoa responde na mesma conversa: a resposta é contexto desta execução e segue para a busca; o interno não.
  const r2 = await executar(ana, q.id, { texto: 'Software de gestão de fornecedores para mineradoras no Brasil.' }, r.conv);
  const [coleta] = comBusca(r2.chamadas);
  assert.ok(coleta, 'com o mercado informado, a coleta pesquisa');
  assert.deepEqual(coleta.messages.map(m => m.role), ['system', 'user']);
  assert.match(coleta.messages[1].content, /Pedido desta execução: Software de gestão de fornecedores para mineradoras no Brasil\./);
  for (const x of INTERNO) assert.ok(!JSON.stringify(coleta).includes(x), `interno na busca externa: ${x}`);
  const producao = r2.chamadas.find(b => tipo(b) === 'execucao');
  assert.equal(producao.plugins, undefined, 'a produção nunca pesquisa');
  assert.match(sis(producao), /Principal cliente: Cliente Sigma/, 'a base interna continua indo para a produção');
  assert.ok(sis(producao).includes('nunca use nomes de exemplo (\\"Concorrente A\\", \\"Empresa X\\")'), 'a produção sabe que não pode usar nomes de exemplo');
});

test('contexto público disponível: o perfil classificado pelo admin vai para a busca, e só ele', async () => {
  assert.equal((await ana.put('/api/admin/config', { pesquisaWeb: { ativa: true, perfil: { nome: 'Alfa Fictícia', setor: 'Software B2B', regiao: 'Brasil', mercado: 'Mineradoras de médio porte' } } })).status, 200);
  const q = await criarQw(ana);
  const r = await executar(ana, q.id, { texto: 'Execute agora.' });
  const [coleta] = comBusca(r.chamadas);
  assert.ok(coleta);
  const consulta = coleta.messages.at(-1).content;
  assert.match(consulta, /^Tema da pesquisa: Pesquise os principais concorrentes/);
  assert.match(consulta, /Setor: Software B2B\nPaís ou região: Brasil\nMercado-alvo: Mineradoras de médio porte/);
  assert.doesNotMatch(consulta, /Execute agora/, 'o gatilho não diz nada e não vai');
  for (const x of [...INTERNO, 'Ana', 'ana@alfapx']) assert.ok(!JSON.stringify(coleta).includes(x), `privado na busca externa: ${x}`);
  assert.equal(r.fim.qualidade.pesquisa.feita, true);
  assert.equal(comBusca(r.chamadas).length, 1, 'uma busca só, na coleta');
});

test('perfil público com dado que não pode sair é recusado; o perfil salvo continua', async () => {
  for (const perfil of [{ setor: 'Software B2B, contato carlos.souza@alfaqa.exemplo' }, { mercado: 'Uso interno: mineradoras' }, { nome: 'Alfa token sk-or-v1-0123456789abcdef0123456789abcdef' }]) {
    const r = await ana.put('/api/admin/config', { pesquisaWeb: { ativa: true, perfil } });
    assert.equal(r.status, 400, JSON.stringify(perfil));
  }
  assert.equal((await ana.get('/api/admin/config')).dados.config?.pesquisaWeb?.perfil?.setor ?? (await ana.get('/api/admin/config')).dados.pesquisaWeb?.perfil?.setor, 'Software B2B');
  // Salvar só a chave liga/desliga (a tela antiga) não apaga o perfil.
  assert.equal((await ana.put('/api/admin/config', { pesquisaWeb: { ativa: true } })).status, 200);
  const cfg = (await ana.get('/api/admin/config')).dados;
  assert.equal((cfg.config || cfg).pesquisaWeb.perfil.mercado, 'Mineradoras de médio porte');
});

test('sem contexto nenhum (empresa sem base e sem perfil): pergunta; pedido com o mercado no próprio objetivo: pesquisa', async () => {
  const q = await criarQw(bia);
  let r = await executar(bia, q.id, { texto: 'Execute agora.' });
  assert.equal(r.fim.qualidade.status, 'pergunta');
  assert.equal(r.chamadas.length, 0);
  const especifico = await criarQw(bia, 'Pesquise os principais concorrentes de plataformas de telemedicina veterinária e monte uma matriz de posicionamento.');
  r = await executar(bia, especifico.id, { texto: 'Execute agora.' });
  const [coleta] = comBusca(r.chamadas);
  assert.ok(coleta, 'o assunto concreto está no objetivo');
  assert.match(coleta.messages.at(-1).content, /telemedicina veterinária/);
});

test('isolamento: o perfil e a base de uma empresa nunca vão para a busca da outra', async () => {
  assert.equal((await bia.put('/api/admin/config', { pesquisaWeb: { ativa: true, perfil: { setor: 'Logística refrigerada', regiao: 'Portugal' } } })).status, 200);
  const qa = await criarQw(ana), qb = await criarQw(bia);
  const ra = await executar(ana, qa.id, { texto: 'Execute agora.' }), rb = await executar(bia, qb.id, { texto: 'Execute agora.' });
  const ca = JSON.stringify(comBusca(ra.chamadas)), cb = JSON.stringify(comBusca(rb.chamadas));
  assert.match(ca, /Software B2B/); assert.doesNotMatch(ca, /Logística refrigerada|Portugal/);
  assert.match(cb, /Logística refrigerada/); assert.doesNotMatch(cb, /Software B2B|Mineradoras|Sigma/);
});

test('o que a pessoa cola de material na execução (texto longo, anexo, dado pessoal) não vai para a busca', async () => {
  const q = await criarQw(ana);
  const longo = `Relatório interno de vendas (uso interno). ${'Cliente Sigma comprou 30 licenças. '.repeat(20)}`;
  const r = await executar(ana, q.id, { texto: longo, anexos: [arquivo('estrategia.docx', docx([`Estratégia: ${INTERNO[2]}.`]))] });
  const busca = JSON.stringify(comBusca(r.chamadas));
  assert.ok(busca.length > 0);
  for (const x of ['Cliente Sigma', 'licenças', INTERNO[2], 'estrategia.docx']) assert.ok(!busca.includes(x), `privado na busca externa: ${x}`);
  const curtoComEmail = await executar(ana, q.id, { texto: 'Mercado de mineradoras; retorno para carlos.souza@alfaqa.exemplo' });
  assert.doesNotMatch(JSON.stringify(comBusca(curtoComEmail.chamadas)), /carlos\.souza/);
});

test('unidade: o contexto externo só junta peças seguras e diz quando falta mercado', () => {
  for (const pedido of ['Sugira temas atuais relacionados ao meu assunto.', 'Apresente pautas recentes sobre mineração.', 'Liste notícias atuais do setor.']) assert.equal(OP.pedePesquisaWeb(pedido),true,pedido);
  for (const pedido of ['Atualize esta pesquisa interna.', 'Resuma a pesquisa de clima enviada.', 'Organize os temas do documento.']) assert.equal(OP.pedePesquisaWeb(pedido),false,pedido);
  const op = { ferramentas: ['pesquisa_web'], contexto_respostas: [{ id: 'mercado', pergunta: 'Em qual mercado a empresa compete?', resposta: 'Varejo de moda no Nordeste' }, { id: 'empresa', pergunta: 'O que a empresa faz?', resposta: 'Somos a Loja X, faturamos R$ 3 mi' }] };
  const x = OP.contextoExternoDaPesquisa({ objetivo: PEDIDO, op, perfil: { setor: 'Moda', nome: 'Loja X', extra: 'não entra' }, textosDaPessoa: ['Execute agora.', 'ok'] });
  assert.equal(x.suficiente, true);
  assert.match(x.consulta, /Mercado informado pelo responsável: Varejo de moda no Nordeste/);
  assert.doesNotMatch(x.consulta, /faturamos|não entra|Execute agora/);
  assert.equal(OP.contextoExternoDaPesquisa({ objetivo: PEDIDO, op: { ferramentas: ['pesquisa_web'] } }).suficiente, false);
  assert.equal(OP.contextoExternoDaPesquisa({ objetivo: 'Pesquise os temas em alta da semana sobre mineração.', op: { ferramentas: ['pesquisa_web'] } }).suficiente, true, 'sem pedir mercado, o tema basta');
  assert.equal(OP.contextoExternoDaPesquisa({ objetivo: PEDIDO, op: { ferramentas: ['pesquisa_web'] }, textosDaPessoa: ['Use a planilha que mandei'] }).suficiente, false, 'frase sem assunto não é mercado');
});

test('checker: matriz com "Concorrente A–E" que não está no material é invenção; tabela sem dados é parcial, não aprovada', () => {
  const op = OP.limparOperacao({ v: 2, ferramentas: ['pesquisa_web'], entregaveis: [{ tipo: 'matriz', rotulo: 'Matriz de posicionamento' }, { tipo: 'lista', rotulo: 'Concorrentes' }] });
  const inventado = '## Matriz de posicionamento\n| Concorrente | Preço |\n|---|---|\n| Concorrente A | alto |\n| Concorrente B | baixo |\n\n## Concorrentes\n- Concorrente A';
  assert.ok(OP.conferirOperacao(op, inventado, { pesquisa: { disponivel: true, fontes: [{}] } }).falhas.includes('invencao'));
  assert.ok(!OP.conferirOperacao(op, inventado.replace(/Concorrente (A|B)/g, 'Fornecedor $1'), { entrada: 'Proposta do Fornecedor A e do Fornecedor B' }).falhas.includes('invencao'), 'nome que veio do material vale');
  const honesto = '## Matriz de posicionamento\n| Concorrente | Preço | Público | Canal |\n|---|---|---|---|\n| Não identificado | não encontrado | não encontrado | — |\n| Não identificado | não encontrado | n/a | — |\n\n## Concorrentes\nA pesquisa não identificou concorrentes com fonte.';
  const c = OP.conferirOperacao(op, honesto, { pesquisa: { disponivel: true, fontes: [{}] } });
  assert.deepEqual(c.falhas, []);
  assert.equal(c.objetivo.atingido, false);
});

test('checker: honesto não é aprovado — a conferência diz que o objetivo não foi atingido, e o status é parcial', async () => {
  const espec = C.construir({ descricao: 'Pesquise os concorrentes de software de RH e monte a lista.', operacao: { v: 2, ferramentas: ['pesquisa_web'], entregaveis: [{ tipo: 'lista', rotulo: 'Concorrentes' }, { tipo: 'analise', rotulo: 'Análise' }] } });
  const chamar = async () => ({ texto: '{"criterios":[],"objetivo_atingido":false,"motivo_objetivo":"nenhum concorrente identificado"}' });
  const r = await C.conferirComCorrecao({ espec, resposta: '## Concorrentes\nA pesquisa não identificou concorrentes.\n\n## Análise\nSem dados.\n\n## Informações não encontradas\nOs concorrentes.', mensagens: [], chamar, pesquisa: { disponivel: true, fontes: [{ url: 'https://x.exemplo' }] } });
  assert.equal(r.registro.status, 'parcial');
  assert.deepEqual(r.registro.objetivo, { atingido: false, motivo: 'conferencia' });
  assert.match(C.resumoQualidade(r.registro).avisos.join(' '), /objetivo central não foi atingido/);
  const ok = await C.conferirComCorrecao({ espec, resposta: '## Concorrentes\n- Real Um\n\n## Análise\nTexto.\n\n## Informações não encontradas\nNenhuma', mensagens: [], chamar: async () => ({ texto: '{"criterios":[],"objetivo_atingido":true}' }), pesquisa: { disponivel: true, fontes: [{ url: 'https://x.exemplo' }] } });
  assert.equal(ok.registro.status, 'aprovado');
});

test('pesquisa bloqueada chega à conferência e à revisão como estado confiável; falta de pesquisa não vira erro de conteúdo', async () => {
  const espec = C.construir({ descricao: 'Pesquise temas atuais sobre mineração.', operacao: { v: 2, ferramentas: ['pesquisa_web'], entregaveis: [{ tipo: 'texto', rotulo: 'Temas' }] } });
  const resultado = '## Temas\nNão foi possível pesquisar na internet. Os temas atuais não foram verificados.\n\n## Informações não encontradas\nTendências atuais.';
  for (const motivo of ['nao_liberada', 'area_reforcada', 'sem_fontes']) {
    const pesquisa = { disponivel: motivo === 'sem_fontes', motivo, fontes: [] };
    let chamadas = 0;
    const r = await C.conferirComCorrecao({ espec, resposta: resultado, mensagens: [], pesquisa, chamar: async msgs => {
      chamadas++;
      assert.match(msgs[0].content, /Estado da pesquisa confirmado pela plataforma: não realizada/);
      if (msgs[0].content.includes('revisor da conferência')) return {texto:'{"achados":[{"id":"pesquisa","confirmado":false,"trecho":"","prova":"O texto admite a limitação da pesquisa."}]}'};
      // Exercita revisão de falso positivo, não apenas um primeiro veredito favorável.
      return {texto:'{"criterios":[{"id":"pesquisa","ok":false,"motivo":"Não houve pesquisa nem fontes atuais."}],"objetivo_atingido":false}'};
    }});
    assert.equal(r.registro.status, 'parcial');
    assert.deepEqual(r.registro.falhas, []);
    assert.equal(r.registro.tentativas, 0, 'não tenta corrigir bloqueio escrevendo outro texto');
    assert.equal(r.registro.pesquisa.feita, false);
    assert.equal(chamadas, 2);
  }
});

test('bloqueio não apaga invenção; pesquisa concluída não recebe instrução de limitação e continua sendo conferida', async () => {
  const espec = C.construir({ descricao: 'Pesquise temas atuais sobre mineração.', operacao: { v: 2, ferramentas: ['pesquisa_web'], entregaveis: [{ tipo: 'texto', rotulo: 'Temas' }] } });
  const resultado = 'Tendência verificada: Mercado Inventado cresceu 900%.\n\n## Informações não encontradas\nNenhuma.';
  const r = await C.conferirComCorrecao({ espec, resposta: resultado, mensagens: [], pesquisa: { disponivel:false, motivo:'area_reforcada', fontes:[] }, chamar: async msgs => {
    if (msgs[0].content.includes('revisor da conferência')) return {texto:JSON.stringify({achados:[{id:'nao_inventar',confirmado:true,trecho:'Mercado Inventado cresceu 900%',prova:'Dado ausente da entrada.'}]})};
    if (msgs[0].content.includes('conferente de qualidade')) return {texto:'{"criterios":[{"id":"nao_inventar","ok":false,"motivo":"Mercado Inventado cresceu 900% não tem fonte."}]}'};
    return {texto:resultado};
  }});
  assert.equal(r.registro.status,'inconsistente');
  assert.ok(r.registro.falhas.includes('invencao'));
  assert.equal(r.registro.pesquisa.feita,false);
  const msgs = C.mensagensQualidade(espec,{entrada:'Material de QA',resultado,pesquisa:{disponivel:true,fontes:[{url:'https://fonte.exemplo'}]}});
  assert.match(msgs[0].content,/Estado da pesquisa confirmado pela plataforma: realizada nesta execução/);
  assert.doesNotMatch(msgs[0].content,/A ausência de pesquisa é uma limitação/);
});
