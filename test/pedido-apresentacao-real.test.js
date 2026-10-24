import { autorizarAdvancedFalso } from './advanced-fixture.js';
// O pedido real que falhou em produção: PowerPoint + PDF de outra apresentação como referência de layout + contrato
// com CPF + proposta, com "o design/layout o mais próximo possível da apresentação X.pdf". Esperado: a apresentação
// é montada no layout do PDF (arquivo para baixar), o CPF não sai para a IA, e a resposta nunca promete um arquivo
// que não existe (se a montagem falhar, ela diz isso no fim, e o aviso vem depois da resposta).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { exec, todos } from '../src/db.js';
import { docx, pptx } from '../src/escritorio.js';
import { caminhoChromium } from '../src/visual/chromium.js';
import { pdfColorido } from './estilo-arquivo.test.js';

const semNavegador = !caminhoChromium();
const ADAPTA = 'Você adapta uma apresentação MODELO', PLANO = 'Você monta a apresentação da pessoa', REESTILO = 'Você coloca o conteúdo';
const PEDIDO = 'preciso que os seguintes ajustes sejam feitos no documento Apresentacao-Kickoff-Rafisa.pptx: 1) quero o design/layout o mais proximo possivel com a apresentacao Apresentacao-Kickoff-Repet.pdf 2) Evidências, documentos, dados, relatórios e sistemas, acho que fica muito amplo. Use a proposta e o contrato anexo como forma de enriquecer estes pontos. os capitulos, pulam do 7 pro 9. e nos dois ultimos, as divisórias tem o mesmo nome do slide seguinte, pra uma apresentação falada fica repetitivo.';
const CPF = '123.456.789-09';
let S, OR, ana, falharAdaptacao = false;
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const sis = typeof b.messages[0].content === 'string' ? b.messages[0].content : b.messages[0].content.map(p => p.text).join('');
    // Reestilo: o plano usa a apresentação da pessoa (3 slides, todos na única página do modelo) e um número inventado
    // ("R$ 7.777") que precisa sair; o preenchimento devolve o conteúdo do slide.
    if (sis.startsWith(PLANO)) return JSON.stringify({ slides: [{ pagina: 1, conteudo: 'Kickoff Rafisa\nAgenda' }, { pagina: 1, conteudo: '07 · Papéis\nTexto\nEconomia de R$ 7.777 por ano' }, { pagina: 1, conteudo: '08 · Escopo R$ 7.777\nDiagnóstico com até seis visitas' }] });
    if (sis.startsWith(REESTILO)) {
      const u = b.messages[1].content;
      return JSON.stringify(Object.fromEntries([...u.matchAll(/^Slide (\d+):\nConteúdo deste slide:\n([^\n]*)[\s\S]*?^(\d+\.\d+) \[/gm)].map(m => [m[3], m[2]])));
    }
    if (sis.startsWith(ADAPTA)) {
      if (falharAdaptacao) return 'sem json';
      const ids = [...b.messages[1].content.matchAll(/^(\d+\.\d+) \[/gm)].map(m => m[1]);
      return JSON.stringify(Object.fromEntries(ids.map(id => [id, `Kickoff Rafisa ${id}`])));
    }
    if (/em PowerPoint, com estes slides/.test(JSON.stringify(b.messages.at(-1)))) return 'Segue a apresentação.\n\n```\n## Slide 1\n**01 · ABERTURA**\n\nKickoff do projeto\n\n---\n\n## Slide 2\n**02 · ESCOPO**\n\n- Diagnóstico\n- Seis visitas\n```\n\nO arquivo agora está estruturado em Markdown e a plataforma monta o .pptx para download.';
    return 'Entendi: vou montar a apresentação da Rafisa no layout da Repet.\n\nO arquivo está pronto para download abaixo.\n\n## O que foi feito\n- Ajustes.';
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], acessoPerfis: { equilibrado: { todos: true }, avancado: { todos: true } }, acoesChat: { cpf: 'proteger' } });
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, autorizacao_plataforma = null');   // como na empresa: sem recurso de sigilo
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  const admin=await S.cliente().entrar('admin@exemplo.com.br');
  await autorizarAdvancedFalso(S,admin,ana.pessoa,['anthropic/claude-sonnet-5']);
});
after(async () => { await S.fechar(); await OR.fechar(); });
const anexos = () => [
  { nome: 'Apresentacao-Kickoff-Rafisa.pptx', base64: pptx('# Kickoff Rafisa\n\nAgenda\n\n# 07 · Papéis\n\nTexto\n\n# 09 · Escopo\n\nTexto', { titulo: 'Rafisa' }).toString('base64') },
  { nome: 'Apresentacao-Kickoff-Repet.pdf', papel:'REFERENCE', base64: pdfColorido().toString('base64') },
  { nome: 'Contrato_Rafisa_assinado.docx', base64: docx(`# Contrato\n\nContratante: Fulano de Tal, CPF ${CPF}.\n\nEscopo: diagnóstico com até seis visitas.`, { titulo: 'Contrato' }).toString('base64') },
];

test('pedido real: monta no layout do PDF (arquivo para baixar), sem CPF para a IA, sem conversa bloqueada', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO, anexos: anexos() });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const a = r.fim?.arquivos?.[0];
  assert.ok(a, `arquivo gerado: ${JSON.stringify(r.fim)}`);
  assert.equal(a.modelo, 'Apresentacao-Kickoff-Repet.pdf', 'no layout do PDF de referência');
  // Reestilo: os slides são os da apresentação da pessoa (3 no plano), não as páginas do modelo; nome da apresentação dela.
  assert.equal(a.slides, 3);
  assert.equal(a.nome, 'Apresentacao-Kickoff-Rafisa-novo-design.pptx');
  const d = await fetch(`${S.base}/api/conversas/${conv.id}/arquivos/${a.id}`, { headers: { cookie: ana.cookie } });
  assert.equal(d.status, 200);
  assert.ok(!JSON.stringify(OR.chamadas.slice(n)).includes('789-09'), 'o CPF não saiu para a IA');
  const { lerPacote } = await import('../src/edicao-arquivo.js');
  const xml = lerPacote(Buffer.from(await d.arrayBuffer())).filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.nome)).map(e => e.dados.toString()).join('\n');
  assert.match(xml, /Kickoff Rafisa/);
  assert.match(xml, /07 · Papéis/);
  assert.match(xml, /08 · Escopo/, 'número de capítulo pedido fica');
  assert.ok(!/7\.777|Kickoff do projeto/.test(xml), 'nem número inventado nem texto do modelo');
});

test('arquivo não gerado: a resposta não promete arquivo, diz que não foi gerado, e o aviso vem depois dela', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  // Ajuste no próprio PowerPoint; a IA da edição não devolve operações (falha garantida).
  const r = await enviarMensagem(ana, conv.id, { texto: 'Corrija a ortografia no próprio arquivo anexo, mantendo todo o resto igual.', anexos: [anexos()[0]] });
  assert.equal(r.status, 200);
  assert.ok(!r.fim?.arquivos?.length, 'nenhum arquivo');
  const final = r.eventos.filter(e => e.t === 'substituir').at(-1)?.v;
  const msgs = todos(S.app.db, 'select papel, texto from mensagens where conversa_id = ? order by id', conv.id);
  const resp = msgs.filter(m => m.papel === 'assistant').at(-1).texto;
  assert.doesNotMatch(resp, /pronto para download/);
  assert.match(resp, /O arquivo ajustado não foi gerado nesta resposta\.\*\* Não foi possível aplicar as alterações/);
  assert.equal(final, resp, 'a tela recebe a versão corrigida');
  assert.ok(msgs.findLastIndex(m => m.papel === 'aviso') < msgs.findIndex(m => m.papel === 'assistant') || !msgs.some(m => m.papel === 'aviso' && /arquivo original/.test(m.texto)), 'o motivo vai na resposta, não num aviso solto acima dela');
});

test('falha ao corrigir PPTX não entrega um PowerPoint contendo apenas o resumo da resposta', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, {
    texto: 'Corrija a ortografia no próprio arquivo PowerPoint PPTX anexo, mantendo todo o resto igual.', anexos: [anexos()[0]],
  });
  assert.equal(r.status, 200);
  assert.ok(!r.fim?.arquivos?.length, 'sem PPTX genérico para disfarçar a falha na edição');
  const eventos = r.eventos;
  const etapa = eventos.findIndex(e => e.t === 'etapa' && e.arquivo);
  const texto = eventos.findIndex(e => e.t === 'texto');
  assert.ok(etapa >= 0 && etapa < texto, 'o progresso do arquivo começa antes do texto');
  const resposta = todos(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).at(-1).texto;
  assert.match(resposta, /não foi gerado nesta resposta/);
  assert.doesNotMatch(resposta, /Logo abaixo há uma versão simples|pronto para download/);
});

test('mesmo pedido numa mensagem seguinte (PDF já guardado na conversa): também monta no layout do PDF', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, conv.id, { texto: 'analise o material', anexos: anexos() });
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(r.fim?.arquivos?.[0]?.modelo, 'Apresentacao-Kickoff-Repet.pdf', JSON.stringify(r.fim));
});

test('pediu arquivo, recebe arquivo: slides dentro de bloco de código viram o PowerPoint registrado na resposta', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Os slides do kickoff em PowerPoint, com estes slides: abertura e escopo, por favor.' });
  assert.equal(r.status, 200);
  const a = r.fim?.arquivos?.find(x => x.origem === 'resposta_materializada');
  assert.equal(a?.formato, 'pptx', JSON.stringify({ arquivos: r.fim?.arquivos, artefatos: r.fim?.artefatos?.map(x => x.tipo), etapas: r.eventos.filter(e => e.t === 'etapa') }));
  // Reaberta, a conversa mostra o arquivo (não depende da tela adivinhar o pedido).
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.ok(JSON.stringify(d).includes('"resposta_materializada"'));
  // O arquivo tem os slides (o bloco de código foi desembrulhado), não um slide de código.
  const b = await fetch(`${S.base}/api/conversas/${conv.id}/mensagens/${r.fim.id}/arquivo/pptx`, { headers: { cookie: ana.cookie } });
  assert.equal(b.status, 200);
  const { extrairTexto } = await import('../src/texto.js');
  const t = (await extrairTexto({ nome: 'x.pptx', base64: Buffer.from(await b.arrayBuffer()).toString('base64') })).texto;
  assert.match(t, /Kickoff do projeto/); assert.match(t, /Seis visitas/);
  assert.doesNotMatch(t, /## Slide/, 'sem marcação crua de Markdown no arquivo');
});

// Produção (empresa com recurso autorizado para dado sigiloso): a conversa vira sigilosa (CPF do contrato) e segue pela
// rota sigilosa, sem mascarar. A resposta dizia "o arquivo está pronto para download" e nenhum arquivo aparecia.
test('conversa sigilosa com recurso autorizado: o mesmo pedido entrega o PowerPoint para baixar', { skip: semNavegador }, async () => {
  const { POLITICA_SIGILO } = await import('../src/sigilo.js');
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: true });
  exec(S.app.db, "update modelos set liberado = 1, homologado = 1, homologacao = ? where id in ('anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-5')", JSON.stringify({ fornecedor: 'anthropic', endpoint: 'anthropic', retencaoZero: true, semTreino: true }));
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO, anexos: anexos() });
  assert.equal(r.status, 200, JSON.stringify(r.erro || r.falha));
  const c = todos(S.app.db, 'select sigilosa from conversas where id = ?', conv.id)[0];
  assert.equal(c.sigilosa, 1, 'rota sigilosa');
  const a = r.fim?.arquivos?.[0];
  assert.ok(a, `arquivo gerado: ${JSON.stringify({ fim: r.fim, etapas: r.eventos.filter(e => e.t === 'etapa').map(e => e.v), avisos: todos(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'aviso'", conv.id) })}`);
  const d = await fetch(`${S.base}/api/conversas/${conv.id}/arquivos/${a.id}`, { headers: { cookie: ana.cookie } });
  assert.equal(d.status, 200);
  // Enquanto o arquivo é montado, a tela não lê "pronto para download": a frase sai assim que o texto termina e a
  // etapa avisa que o arquivo está sendo preparado.
  const k = r.eventos.findIndex(e => e.t === 'etapa' && e.arquivo && /Preparando o PowerPoint/.test(e.v));
  assert.ok(k > 0, 'etapa de arquivo');
  const antes = r.eventos.slice(0, k).filter(e => e.t === 'substituir').at(-1)?.v;
  assert.ok(antes && !/pronto para download/.test(antes), String(antes));
  assert.doesNotMatch(todos(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).at(-1).texto, /pronto para download/);
});

// Produção (o pedido real, com os anexos reais): contrato .docx primeiro, a apresentação com acento no nome, o PDF de
// referência e a proposta comercial em PDF por último. Saía a proposta "adaptada" (28 slides da proposta, sem o
// conteúdo da apresentação): o modelo era o último PDF e a apresentação não era achada pelo nome.
test('pedido real com dois PDFs e nome com acento: modelo é o PDF citado e o conteúdo é a apresentação citada', { skip: semNavegador }, async () => {
  const [deck, ref, contrato] = anexos();
  const lista = [contrato, { ...deck, nome: 'Apresentação-Kickoff-Rafisa.pptx' }, ref, { nome: 'Proposta-comercial-Rafisa.pdf', base64: pdfColorido({ cor: '0.1 0.2 0.6' }).toString('base64') }];
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO, anexos: lista });
  assert.equal(r.status, 200, JSON.stringify(r.erro || r.falha));
  const a = r.fim?.arquivos?.[0];
  assert.equal(a?.modelo, 'Apresentacao-Kickoff-Repet.pdf', JSON.stringify(r.fim?.arquivos));
  assert.equal(a.nome, 'Apresentação-Kickoff-Rafisa-novo-design.pptx');
  assert.equal(a.fonte, 'Apresentação-Kickoff-Rafisa.pptx');
  // E numa mensagem seguinte, sem anexos (tudo guardado na conversa): a mesma escolha.
  const conv2 = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, conv2.id, { texto: 'analise o material', anexos: lista });
  const r2 = await enviarMensagem(ana, conv2.id, { texto: PEDIDO });
  assert.equal(r2.fim?.arquivos?.[0]?.modelo, 'Apresentacao-Kickoff-Repet.pdf', JSON.stringify(r2.fim?.arquivos));
  assert.equal(r2.fim.arquivos[0].fonte, 'Apresentação-Kickoff-Rafisa.pptx');
});

test('trava final: montagem com slides de conteúdo repetido não é entregue; a resposta diz por quê', { skip: semNavegador }, async () => {
  const repetido = 'Contexto do projeto\n• A RAFISA deseja estruturar seus processos para gerar resultados mensais';
  const antes = OR.chamadas.length;
  OR.responder = b => {
    const sis = typeof b.messages[0].content === 'string' ? b.messages[0].content : b.messages[0].content.map(p => p.text).join('');
    if (sis.startsWith(PLANO)) return JSON.stringify({ slides: [{ pagina: 1, conteudo: repetido }, { pagina: 1, conteudo: repetido }, { pagina: 1, conteudo: 'Kickoff Rafisa' }] });
    return 'Entendi: vou montar a apresentação.\n\n## O que foi feito\n- Ajustes.';
  };
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const fonte = { nome: 'Apresentacao-Kickoff-Rafisa.pptx', base64: pptx('# Kickoff Rafisa\n\nA RAFISA deseja estruturar seus processos para gerar resultados mensais\n\n# 07 · Papéis\n\nTexto\n\n# 09 · Escopo\n\nTexto', { titulo: 'Rafisa' }).toString('base64') };
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO, anexos: [fonte, anexos()[1]] });
  assert.equal(r.status, 200);
  assert.ok(!r.fim?.arquivos?.length, 'nenhum arquivo entregue');
  const resp = todos(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant'", conv.id).at(-1).texto;
  assert.match(resp, /não foi gerado[\s\S]*conteúdo repetido/);
  assert.ok(OR.chamadas.length > antes);
});

test('pedido de gerar sem repetir o nome usa o PPTX da pessoa como conteúdo e o PDF apenas como design', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, conv.id, { texto: 'Analise os materiais para preparar a próxima etapa.', anexos: anexos().slice(0, 2) });
  const r = await enviarMensagem(ana, conv.id, { texto: 'Gere uma apresentação em PPTX a partir do material enviado.' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const a = r.fim?.arquivos?.[0];
  assert.equal(a?.fonte, 'Apresentacao-Kickoff-Rafisa.pptx', JSON.stringify(a));
  assert.equal(a.slides, 3, 'a quantidade vem do conteúdo da pessoa, não do modelo');
});
