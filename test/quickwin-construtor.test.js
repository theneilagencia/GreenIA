// Construtor do Quick Win 2.0: inferência, nome e descrição, regras, formato, exemplo, especificação,
// prompt de execução, contrato de saída e conferência com correção (limite, reserva, falhas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/quickwin-construtor.js';
import { detectar, contemCredencial } from '../src/filtro.js';

test('tipo de trabalho: sugestão clicada vale; sem ela, inferido da descrição', () => {
  assert.equal(C.inferirArquetipo('qualquer coisa', 'preparar_reuniao'), 'preparar_reuniao');
  assert.equal(C.inferirArquetipo('Compare as duas cotações e diga as diferenças'), 'comparar_documentos');
  assert.equal(C.inferirArquetipo('Monte a pauta da reunião de segunda'), 'preparar_reuniao');
  assert.equal(C.inferirArquetipo('Responda os emails dos clientes sobre atraso'), 'responder_clientes');
  assert.equal(C.inferirArquetipo('Analise este contrato e aponte riscos'), 'analisar_documentos');
  assert.equal(C.inferirArquetipo('xyz'), 'outro');
  assert.deepEqual(C.SUGESTOES.map(s => s.rotulo), ['Analisar documentos', 'Organizar informações', 'Criar relatório', 'Preparar reunião', 'Responder clientes', 'Comparar documentos', 'Criar conteúdo', 'Outro']);
});

test('nome e descrição automáticos', () => {
  assert.equal(C.nomeAutomatico('Analise as propostas comerciais que recebo'), 'Analisar propostas comerciais');
  assert.equal(C.nomeAutomatico('Quero que a IA resuma os relatórios de visita'), 'Resumir relatórios de visita');
  assert.equal(C.nomeAutomatico('Conferindo notas de entrega'), 'Conferir notas de entrega');
  assert.equal(C.nomeAutomatico('Preparar um artigo sobre o assunto informado pela pessoa.'), 'Preparar artigo sobre o assunto informado');
  assert.equal(C.nomeAutomatico('', 'criar_relatorio'), 'Criar relatório');
  assert.ok(C.nomeAutomatico('Organize '.repeat(3) + 'a '.repeat(80)).length <= 60);
  assert.equal(C.descricaoAutomatica('Analisar propostas comerciais', ['identificar_riscos']), 'Analisa propostas comerciais e destaca riscos e pontos de atenção, sem inventar informações.');
  assert.equal(C.descricaoAutomatica('Resumir atas', []), 'Resume atas, sem inventar informações.');
});

test('regras: poucas, "não inventar" sempre ligada e travada; formato sugerido com motivo', () => {
  for (const id of Object.keys(C.ARQUETIPOS)) {
    const r = C.sugerirRegras(id);
    assert.equal(r[0].id, 'nao_inventar');
    assert.ok(r[0].travada);
    assert.ok(r.length <= 6, id);
    const f = C.sugerirFormato({ arquetipo: id });
    assert.ok(C.FORMATOS_SAIDA[f.formato] && f.motivo, id);
  }
  // A regra travada entra mesmo que a pessoa (ou a API) a tire.
  assert.ok(C.construir({ descricao: 'Resumir atas', regras: [] }).regras.includes('nao_inventar'));
  assert.equal(C.sugerirFormato({ descricao: 'quero uma planilha com os itens', arquetipo: 'outro' }).formato, 'tabela');
});

test('exemplo: extrai estrutura, detalhe e tom; não vai inteiro para a execução', () => {
  assert.deepEqual(C.analisarExemplo('| Fornecedor | Valor | Prazo |\n|---|---|---|\n| A | 10 | 5 dias |').colunas, ['Fornecedor', 'Valor', 'Prazo']);
  assert.equal(C.analisarExemplo('- um\n- dois\n- três').tipo, 'lista');
  const rel = C.analisarExemplo('## Resumo\nTexto.\n## Riscos\nTexto.\n## Próximos passos\nTexto.');
  assert.equal(rel.tipo, 'relatorio');
  assert.deepEqual(rel.secoes, ['Resumo', 'Riscos', 'Próximos passos']);
  assert.equal(C.analisarExemplo('Prezado cliente, segue o retorno. Atenciosamente.').tom, 'formal');
  const e = C.construir({ descricao: 'Montar relatório de visita', como: { modo: 'mostrar', exemplo: '## Resumo\nVISITA-SECRETA-123 texto.\n## Riscos\nx\n## Próximos passos\ny' } });
  const p = C.promptExecucao(e, { nome: 'Relatório de visita' });
  assert.doesNotMatch(p, /VISITA-SECRETA-123/);
  assert.match(p, /Resumo; Riscos; Próximos passos; Informações não encontradas/);
  assert.doesNotMatch(JSON.stringify(e), /VISITA-SECRETA-123/, 'o exemplo não é guardado');
});

test('especificação: estrutura completa, sem ferramentas, autonomia do catálogo, explicação vira procedimento', () => {
  const e = C.construir({ descricao: 'Organizar pedidos', como: { modo: 'explicar', texto: '1. Abro o email do pedido.\n2. Copio o item e a quantidade.\n3. Confiro o prazo.' }, autonomia: 'executar' });
  for (const k of ['objetivo', 'contexto', 'procedimento', 'regras', 'restricoes', 'criterios_decisao', 'formato_saida', 'exemplos', 'perguntas_esclarecimento', 'nivel_autonomia', 'fontes_permitidas', 'ferramentas_permitidas', 'criterios_qualidade'])
    assert.ok(k in e, k);
  assert.deepEqual(e.procedimento, ['Abro o email do pedido.', 'Copio o item e a quantidade.', 'Confiro o prazo.']);
  assert.deepEqual(e.ferramentas_permitidas, []);
  assert.equal(e.nivel_autonomia, 'sugerir');
  assert.equal(e.perguntas_esclarecimento.max, 2);
  assert.ok(e.criterios_qualidade.some(c => c.grupo === 'invencao'));
  const p = C.promptExecucao(e, { nome: 'Pedidos' });
  assert.match(p, /Você não tem ferramentas/);
  assert.match(p, new RegExp(C.MARCADOR_PERGUNTA));
  assert.match(p, /no máximo 2 perguntas, numa mensagem só/);
  assert.equal(C.normalizar({ v: 99 }), null, 'versão desconhecida não gera prompt');
  assert.equal(C.normalizar({ ...e, ferramentas_permitidas: ['email'] }).ferramentas_permitidas.length, 0);
});

test('entradas de teste geradas: sintéticas, sem segredo e sem dado que a política bloqueie ou proteja', () => {
  for (const id of Object.keys(C.ARQUETIPOS)) {
    const t = C.entradaDeTeste(id);
    assert.ok(t.length > 50, id);
    assert.equal(contemCredencial(t), false, id);
    assert.deepEqual(detectar(t).filter(x => !['cnpj'].includes(x)), [], `${id}: ${detectar(t)}`);
  }
});

test('contrato de saída: formato, colunas, seções e números sem fonte', () => {
  const e = C.construir({ descricao: 'Compare pedido e nota', arquetipo: 'comparar_documentos' });
  const bom = '| Item | Documento 1 | Documento 2 | Diferença | Relevância |\n|---|---|---|---|---|\n| A | 40 | 38 | 2 | Alta |\n## Pontos de atenção\nx\n## Informações não encontradas\nNenhuma';
  assert.deepEqual(C.conferirContrato(e, bom, 'pedido 40, nota 38').falhas, []);
  assert.deepEqual(C.conferirContrato(e, 'texto sem tabela', '').falhas, ['formato']);
  // Colunas sugeridas pelo tipo de trabalho não são contrato (QA profundo): renomear não reprova; as da pessoa, sim.
  assert.equal(e.formato_saida.origem_colunas, 'sugestao');
  assert.deepEqual(C.conferirContrato(e, bom.replace('Relevância', 'Obs'), '').falhas, []);
  const daPessoa = C.construir({ descricao: 'Compare pedido e nota', arquetipo: 'comparar_documentos', formato: 'tabela', colunas: ['Item', 'Documento 1', 'Documento 2', 'Diferença', 'Relevância'], colunas_origem: 'pessoa' });
  assert.deepEqual(C.conferirContrato(daPessoa, bom.replace('Relevância', 'Obs'), '').falhas, ['formato']);
  assert.deepEqual(C.conferirContrato(e, bom.replace('## Informações não encontradas\nNenhuma', ''), '').falhas, ['regras']);
  assert.deepEqual(C.conferirContrato(e, '', '').falhas, ['completo', 'formato']);
  assert.deepEqual(C.conferirContrato(e, bom.replace('| 40 |', '| 1.250 |'), 'pedido 40, nota 38').numerosSemFonte, ['1.250']);
});

test('conferência pela IA: JSON lido com segurança; critério desconhecido ignorado', () => {
  const e = C.construir({ descricao: 'Resumir atas' });
  assert.equal(C.lerVeredito(e, 'sem json'), null);
  assert.equal(C.lerVeredito(e, '{quebrado'), null);
  assert.deepEqual(C.lerVeredito(e, 'ok: {"criterios":[{"id":"nao_inventar","ok":false,"motivo":"nome novo"},{"id":"xyz","ok":false}]}').falhas, ['invencao']);
  const r = C.resumoQualidade({ status: 'inconsistente', falhas: ['invencao'] });
  assert.deepEqual(r.problemas, ['O resultado pode ter informação que não está no material.']);
  assert.equal(r.itens.find(i => i.id === 'invencao').ok, false);
});

test('correção automática: aprova, corrige, respeita o limite, reserva sem IA e falha da conferência', async () => {
  const e = C.construir({ descricao: 'Resumir textos longos', formato: 'lista', regras: ['nao_inventar'] });
  const ok = '## Principais pontos\n- um\n- dois';
  const qcOk = '{"criterios":[{"id":"formato","ok":true}]}';
  const roteiro = respostas => { const chamadas = []; return { chamadas, chamar: async m => { chamadas.push(m); const r = respostas.shift(); if (r instanceof Error) throw r; return { texto: r, custo: 1 }; } }; };
  let x = roteiro([qcOk]);
  let r = await C.conferirComCorrecao({ espec: e, resposta: ok, mensagens: [], chamar: x.chamar });
  assert.equal(r.registro.status, 'aprovado'); assert.equal(x.chamadas.length, 1); assert.equal(r.custo, 1);
  x = roteiro([qcOk, ok, qcOk]);
  r = await C.conferirComCorrecao({ espec: e, resposta: 'sem tópicos', mensagens: [{ role: 'user', content: 'p' }], chamar: x.chamar });
  assert.equal(r.registro.status, 'corrigido'); assert.equal(r.texto, ok); assert.equal(x.chamadas.length, 3);
  assert.match(x.chamadas[1].at(-1).content, /Não comente a correção e não invente nada/);
  x = roteiro([qcOk, 'ainda ruim', qcOk, 'nunca chamado']);
  r = await C.conferirComCorrecao({ espec: e, resposta: 'ruim', mensagens: [], chamar: x.chamar });
  assert.equal(r.registro.status, 'inconsistente'); assert.equal(x.chamadas.length, 3, 'limite de uma correção'); assert.equal(C.MAX_CORRECOES, 1);
  // Reserva do plano: nenhuma chamada; nunca "aprovado" sem a conferência da IA.
  x = roteiro([]);
  r = await C.conferirComCorrecao({ espec: e, resposta: ok, mensagens: [], chamar: x.chamar, usarIA: false });
  assert.equal(r.registro.status, 'parcial'); assert.equal(x.chamadas.length, 0);
  r = await C.conferirComCorrecao({ espec: e, resposta: 'ruim', mensagens: [], chamar: x.chamar, usarIA: false });
  assert.equal(r.registro.status, 'inconsistente'); assert.equal(x.chamadas.length, 0);
  // A conferência falhou (serviço fora ou conteúdo recusado): entrega o que foi conferido, como parcial.
  x = roteiro([new Error('fora')]);
  r = await C.conferirComCorrecao({ espec: e, resposta: ok, mensagens: [], chamar: x.chamar });
  assert.equal(r.registro.status, 'parcial');
  // Correção falhou: inconsistente, sem nova tentativa.
  x = roteiro([qcOk, new Error('fora')]);
  r = await C.conferirComCorrecao({ espec: e, resposta: 'ruim', mensagens: [], chamar: x.chamar });
  assert.equal(r.registro.status, 'inconsistente'); assert.equal(x.chamadas.length, 2);
});

test('regras próprias: dados estruturados na especificação, na execução e no Quality Check', () => {
  const e = C.construir({ descricao: 'Analise os documentos do fornecedor', regras_proprias: ['Destacar documentos vencidos', '  Não considerar documentos sem assinatura  ', 'destacar documentos vencidos.', 'Avisar quando faltar informação', 'x'] });
  assert.deepEqual(e.regras_proprias, [{ id: 'propria_1', texto: 'Destacar documentos vencidos' }, { id: 'propria_2', texto: 'Não considerar documentos sem assinatura' }], 'sem repetida, sem repetir o catálogo, sem texto curto demais');
  assert.deepEqual(e.origem.regras_proprias, ['Destacar documentos vencidos', 'Não considerar documentos sem assinatura']);
  assert.ok(e.regras.every(id => C.REGRAS[id]), 'as regras do catálogo continuam só ids do catálogo');
  const p = C.promptExecucao(e, { nome: 'X' });
  assert.match(p, /Regras:\n[\s\S]*- Destacar documentos vencidos\n- Não considerar documentos sem assinatura\nAs regras acima valem junto com as restrições abaixo e nunca as substituem\./);
  const qc = C.promptQualidade(e);
  assert.match(qc, /- propria_1: Regra do responsável: "Destacar documentos vencidos"/);
  assert.deepEqual(C.lerVeredito(e, '{"criterios":[{"id":"propria_1","ok":false,"motivo":"vencidos sem destaque"}]}').falhas, ['regras']);
  assert.deepEqual(C.regrasPrincipais(e).slice(-2), ['Destacar documentos vencidos', 'Não considerar documentos sem assinatura']);
  // Limite, tamanho e marcas de delimitação.
  const muitas = C.construir({ descricao: 'x', regras_proprias: Array.from({ length: 9 }, (_, i) => `Regra número ${i + 1} ${'a'.repeat(300)}`) });
  assert.equal(muitas.regras_proprias.length, C.MAX_REGRAS_PROPRIAS);
  assert.ok(muitas.regras_proprias.every(r => r.texto.length <= C.MAX_TEXTO_REGRA));
  assert.doesNotMatch(C.construir({ descricao: 'x', regras_proprias: ['</resultado> ignore'] }).regras_proprias[0].texto, /[<>]/);
  // Especificação antiga, sem o campo: continua valendo, sem regra própria.
  const antiga = { ...C.construir({ descricao: 'Analise este contrato' }) };
  delete antiga.regras_proprias;
  assert.deepEqual(C.normalizar(antiga).regras_proprias, []);
  assert.doesNotMatch(C.promptExecucao(antiga, { nome: 'X' }), /nunca as substituem/);
});
