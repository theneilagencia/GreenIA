// Primeira bateria: jornada A–J para 20 Quick Wins "QA - " com material fictício. Só observa e registra
// (interpretação, plano, perguntas, criação, teste, publicação, execução real, conferência, artefatos, tempos).
// Uso: rodar bateria [ids separados por vírgula]  (sem ids: todos)
export const CASOS = [
  { id: 1, nome: 'Resumo de documento', descricao: 'Resuma este documento em tópicos curtos para a diretoria.',
    material: 'POLÍTICA DE VIAGENS 2026 (fictícia, Empresa Exemplo QA). 1. Viagens nacionais precisam de aprovação do gestor com 7 dias de antecedência. 2. Hospedagem até R$ 380 por noite em capitais e R$ 280 nas demais cidades. 3. Reembolso em até 10 dias úteis com comprovante de despesa. 4. Voos com mais de 4 horas podem ser em classe executiva só para diretores. 5. Adiantamento máximo de R$ 1.500 por viagem.' },
  { id: 2, nome: 'Análise de contrato', descricao: 'Analise este contrato e aponte riscos, prazos, multas e obrigações de cada parte.',
    material: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº QA-77/2026 (fictício). Contratante: Indústria Modelo QA S.A. Contratada: Limpeza Exemplo QA Ltda. Objeto: limpeza industrial de 3 galpões. Valor: R$ 48.000 mensais, reajuste anual pelo IPCA. Vigência: 12 meses a partir de 01/11/2026, renovação automática. Multa por rescisão: 30% do saldo. Atraso no pagamento: multa de 2% e juros de 1% ao mês. A contratada responde por danos causados por seus empregados. Não há cláusula de limite de responsabilidade. Foro: Belo Horizonte.' },
  { id: 3, nome: 'Ata de reunião', descricao: 'Transforme as anotações da reunião em uma ata com decisões, responsáveis e prazos.',
    material: 'Reunião de operações 30/09/2026 (fictícia). Presentes: Ana (produção), Bruno (compras), Carla (qualidade). Ana disse que a linha 2 parou 3 vezes na semana por falta de peça. Bruno vai cotar novo fornecedor de rolamentos até 10/10. Carla vai revisar o plano de inspeção até 15/10. Ficou decidido manter estoque mínimo de 20 rolamentos. Próxima reunião 14/10.' },
  { id: 4, nome: 'Análise de planilha', descricao: 'Analise esta planilha de vendas e diga quais produtos cresceram, quais caíram e o total do trimestre.',
    material: 'Produto | Julho | Agosto | Setembro\nCaixa A | 120 | 135 | 150\nCaixa B | 200 | 180 | 160\nCaixa C | 90 | 90 | 95\nFita D | 300 | 310 | 280\n(dados fictícios, unidades vendidas)' },
  { id: 5, nome: 'Comparação de fornecedores', descricao: 'Compare as três propostas de fornecedores e recomende a melhor, com critérios de preço, prazo e garantia.',
    material: 'Propostas fictícias de transporte. Alfa QA: R$ 18.000/mês, início em 15 dias, garantia de reposição de veículo em 24h. Beta QA: R$ 16.500/mês, início em 30 dias, reposição em 48h. Gama QA: R$ 19.200/mês, início em 7 dias, reposição em 12h e seguro incluso.' },
  { id: 6, nome: 'Relatório executivo', descricao: 'Escreva um relatório executivo do mês com resultados, problemas e próximos passos.',
    material: 'Setembro 2026 (fictício): faturamento R$ 2,1 milhões (meta R$ 2,0 milhões). Devoluções 3,2% (agosto 2,1%). Novo cliente: Rede Exemplo QA. Problema: atraso de 5 dias em 12 pedidos por falta de embalagem. Próximo passo: contratar segundo fornecedor de embalagem até 20/10.' },
  { id: 7, nome: 'Checklist de abertura', descricao: 'Monte um checklist de abertura da loja a partir deste procedimento.',
    material: 'Procedimento (fictício): chegar 30 minutos antes; desligar o alarme; conferir o caixa com R$ 200 de troco; ligar as luzes e o ar; conferir a limpeza dos corredores; abrir as portas às 9h; registrar a abertura no caderno.' },
  { id: 8, nome: 'Pesquisa de tendências', descricao: 'Pesquise as principais tendências de logística sustentável para centros de distribuição e resuma com fontes.',
    material: 'Foco: centros de distribuição de médio porte no Brasil.' },
  { id: 9, nome: 'Apresentação', descricao: 'Transforme estes resultados em uma apresentação de 5 slides para a diretoria.',
    material: 'Resultados do 3º trimestre de 2026 (fictícios): receita R$ 12,4 milhões (meta R$ 12,0 milhões); margem 18%; clientes ativos 1.240; custo de frete subiu 9%; riscos: atraso de fornecedor de embalagens e câmbio; próximos passos: renegociar frete até 30/11 e concluir o novo CD em dezembro.' },
  { id: 10, nome: 'Dashboard de manutenção', descricao: 'Monte um dashboard visual com os indicadores de manutenção do mês.',
    material: 'Manutenção setembro 2026 (fictício): ordens abertas 142; concluídas 128; backlog 14; disponibilidade linha 1 96%, linha 2 91%, linha 3 94%; custo de peças julho R$ 84 mil, agosto R$ 91 mil, setembro R$ 78 mil.' },
  { id: 11, nome: 'Cronograma do projeto', descricao: 'Crie uma timeline do projeto de implantação do ERP com as etapas e datas.',
    material: 'Projeto ERP (fictício): levantamento 01/10 a 15/10; configuração 16/10 a 30/11; testes 01/12 a 20/12; treinamento 05/01 a 16/01; entrada em produção 02/02/2027.' },
  { id: 12, nome: 'Tarefa com integração', descricao: 'Consulte os pedidos atrasados no ERP e registre um alerta para o responsável no CRM.',
    material: 'Considerar apenas pedidos com mais de 5 dias de atraso (fictício).' },
  { id: 13, nome: 'Texto de comunicado', descricao: 'Escreva um comunicado interno avisando sobre a mudança do horário do refeitório.',
    material: 'A partir de 13/10/2026 o refeitório funciona das 11h às 14h (antes 11h30 às 13h30), por causa do novo turno (fictício).' },
  { id: 14, nome: 'Pedido ambíguo', descricao: 'Melhore isso.',
    material: 'Nosso processo de compras demora muito e as áreas reclamam (fictício).' },
  { id: 15, nome: 'Material ausente', descricao: 'Analise o contrato anexo e liste as multas previstas.', material: '' },
  { id: 16, nome: 'Material opcional', descricao: 'Sugira 5 ideias de ações de engajamento para a equipe de vendas; se houver pesquisa de clima, use-a.',
    material: 'Sem pesquisa de clima desta vez.' },
  { id: 17, nome: 'Critérios objetivos', descricao: 'Liste os pedidos acima de R$ 10.000 desta lista, em uma tabela com número, cliente e valor, ordenada do maior para o menor.',
    material: 'Pedidos (fictícios): 101 Cliente A R$ 8.500; 102 Cliente B R$ 12.300; 103 Cliente C R$ 25.000; 104 Cliente D R$ 9.999; 105 Cliente E R$ 10.001; 106 Cliente F R$ 31.750.' },
  { id: 18, nome: 'Correção pelo checker', descricao: 'Liste todas as 12 cláusulas do contrato com o número e o resumo de cada uma, sem omitir nenhuma.',
    material: 'Contrato fictício QA: Cláusula 1 objeto; Cláusula 2 prazo de 12 meses; Cláusula 3 preço R$ 5.000; Cláusula 4 reajuste IPCA; Cláusula 5 pagamento em 30 dias; Cláusula 6 multa de 10%; Cláusula 7 confidencialidade; Cláusula 8 rescisão com 30 dias; Cláusula 9 garantia de 90 dias; Cláusula 10 seguro; Cláusula 11 subcontratação proibida; Cláusula 12 foro de Curitiba.' },
  { id: 19, nome: 'Múltiplos entregáveis', descricao: 'A partir do relatório do mês, entregue: um resumo executivo, uma tabela de indicadores, uma lista de riscos e um e-mail para a diretoria.',
    material: 'Outubro 2026 (fictício): vendas R$ 3,4 milhões; margem 21%; inadimplência 2,8%; NPS 64; riscos: dependência de um cliente com 30% da receita, alta do diesel, rotatividade de 6% no armazém.' },
  { id: 20, nome: 'Pedido inesperado', descricao: 'Crie um roteiro de treinamento de 30 minutos sobre como usar o extintor, com perguntas de quiz no final.',
    material: 'Público: brigada de incêndio recém-formada (fictício). Extintores disponíveis: água, pó químico ABC e CO2.' },
];

const resumoPlano = it => ({
  fonte: it.fonte || null, resumo: it.operacao?.resumo || null,
  entregaveis: (it.operacao?.entregaveis || []).map(e => `${e.tipo}${e.visual ? `/visual:${e.visual.tipo}` : ''}:${e.rotulo || ''}`),
  entradas: (it.operacao?.entradas || []).map(x => `${x.rotulo}${x.obrigatoria ? ' (obrig.)' : ' (opc.)'}`),
  lacunas: (it.lacunas || []).map(l => `${l.pergunta}${l.obrigatoria ? ' (obrig.)' : ''}`).slice(0, 8),
  etapas: (it.operacao?.etapas || []).length, criterios: (it.operacao?.criterios || []).length, ferramentas: it.operacao?.ferramentas || [],
  indisponiveis: (it.ferramentasIndisponiveis || []).map(f => f.id), integracoes: it.integracoes ? it.integracoes.map(n => `${n.categoria}:${n.estado}`) : null,
});
const textoDe = r => r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
export const resumoExec = r => {
  const fim = r.linhas?.find(l => l.t === 'fim'), q = fim?.qualidade;
  const texto = textoDe(r);
  return { status: r.status, ms: r.ms, erro: r.erro || r.linhas?.find(l => l.t === 'erro')?.mensagem || null, pergunta: texto.trim().startsWith('Antes de começar') || q?.status === 'pergunta',
    qualidade: q ? { status: q.status, tentativas: q.tentativas, falhas: (q.itens || []).filter(i => !i.ok).map(i => `${i.id}: ${(i.motivos || []).join(' | ').slice(0, 200)}`), problemas: (q.problemas || []).slice(0, 4), avisos: (q.avisos || []).slice(0, 4), entregaveis: q.entregaveis || null, objetivo: q.objetivo || null } : null,
    caracteres: texto.length, secoes: (texto.match(/^#{1,3} .+$/gm) || []).slice(0, 12), artefatos: (fim?.artefatos || []).map(a => ({ id: a.id, tipo: a.tipo, paginas: a.paginas, status: a.status, avisos: a.avisos })),
    etapas: (r.linhas || []).filter(l => l.t === 'etapa').map(l => `${l.v}@${l.ms}`), primeiro_texto_ms: r.linhas?.find(l => l.t === 'texto')?.ms ?? null, mensagem: fim?.id || null, integracoes: q?.integracoes || null };
};

export async function criarQw(c, caso, { responder = true } = {}) {
  const t0 = Date.now();
  const sug = await c.api('POST', '/api/quick-wins/assistente/sugerir', { descricao: caso.descricao });
  const t1 = Date.now();
  const it = await c.api('POST', '/api/quick-wins/assistente/interpretar', { descricao: caso.descricao });
  const t2 = Date.now();
  const reg = { sugerir: { status: sug.status, ms: t1 - t0, formato: sug.dados?.formato?.sugerido || null }, interpretar: { status: it.status, ms: t2 - t1, ...(it.status === 200 ? resumoPlano(it.dados) : { erro: JSON.stringify(it.dados).slice(0, 200) }) } };
  if (it.status !== 200) return { reg };
  const op = structuredClone(it.dados.operacao || null);
  // D. Responder as perguntas (como uma pessoa leiga responderia: curto, com o que sabe).
  if (op && responder) {
    const lac = [...(op.lacunas || []), ...(it.dados.lacunas || []).filter(l => !(op.lacunas || []).some(x => x.id === l.id))];
    op.contexto_respostas = lac.filter(l => l.obrigatoria).map(l => ({ id: l.id, pergunta: l.pergunta, resposta: 'Use o material enviado em cada execução; o público é a equipe interna da empresa (fictício).' }));
  }
  // Como a tela: a estrutura do objetivo (colunas pedidas no texto) é buscada ao preparar a etapa Resultado; com um
  // entregável só de tabela, o formato é tabela e as colunas vêm do objetivo (ou da sugestão, ou livres).
  const est = (await c.api('POST', '/api/quick-wins/assistente/estrutura', { descricao: caso.descricao })).dados || {};
  const ents = op?.entregaveis || [];
  const soTabela = ents.length === 1 && ['tabela', 'matriz'].includes(ents[0].tipo) && !ents[0].canal;
  const doObj = (est.colunas || []).map(x => x.nome);
  const colunas = soTabela ? (doObj.length ? { colunas: doObj, colunas_origem: 'objetivo' } : est.falhou ? { colunas: [], colunas_origem: 'livre' } : { colunas: sug.dados?.colunasSugeridas || [], colunas_origem: 'sugestao' }) : {};
  reg.estrutura = { colunas: doObj, falhou: !!est.falhou, enviadas: colunas.colunas || null };
  const corpo = { nome: `QA - ${caso.nome}`, ...c.destino, assistente: { descricao: caso.descricao, como: { modo: 'pronto' }, ...(caso.formatoManual ? { formato: sug.dados?.formato?.sugerido } : soTabela ? { formato: 'tabela', ...colunas } : {}),
    estrutura_objetivo: est.chave ? { chave: est.chave, colunas: est.colunas || [], falhou: !!est.falhou } : null, ...(op ? { operacao: { ...op, origem: 'pessoa' } } : {}),
    ...(it.dados.fonte === 'ia' && it.dados.chave ? { interpretacao: { chave: it.dados.chave, operacao: it.dados.operacao } } : {}) } };
  const t3 = Date.now();
  const q = await c.api('POST', '/api/quick-wins', corpo);
  reg.criar = { status: q.status, ms: Date.now() - t3, ...(q.status === 200 ? { id: q.dados.id, status_qw: q.dados.status } : { erro: JSON.stringify(q.dados).slice(0, 300) }) };
  if (q.status === 200) { c.estado.criados.quick_wins.push(q.dados.id); await c.api('PUT', `/api/quick-wins/${q.dados.id}`, { nome: `QA - ${caso.nome}` }); }
  return { reg, qw: q.status === 200 ? q.dados : null, it: it.dados };
}
export async function executar(c, qwId, material, { teste = true } = {}) {
  const conv = await c.api('POST', '/api/conversas', { quick_win_id: qwId, teste });
  if (conv.status !== 200) return { conv: null, exec: { status: conv.status, erro: JSON.stringify(conv.dados).slice(0, 300) } };
  const cid = conv.dados.conversa.id;
  (c.estado.conversas[qwId] ||= []).push(cid);
  const r = await c.enviar(cid, { executar_quick_win: true, texto: material || '' });
  return { conv: cid, exec: resumoExec(r), bruto: r };
}

export default async function bateria(c, ids = '', rodada = 'bateria') {
  c.rodada = rodada;
  const alvo = ids ? new Set(ids.split(',').map(Number)) : null;
  c.destino = c.eu.quickWins?.areas?.length ? { areas: [c.eu.quickWins.areas[0].id] } : { toda_empresa: true };
  const pasta = c.pasta('bateria');
  const chave = c.rodada || 'bateria'; const saida = c.estado[chave] ||= {};
  for (const caso of CASOS.filter(x => !alvo || alvo.has(x.id))) {
    const reg = { caso: caso.id, nome: caso.nome, descricao: caso.descricao };
    try {
      const cr = await criarQw(c, caso);
      Object.assign(reg, cr.reg);
      if (cr.qw) {
        c.estado.casos[caso.id] = { qw: cr.qw.id };
        // H/I/J. Teste (rascunho) com o material.
        const t = await executar(c, cr.qw.id, caso.material, { teste: true });
        reg.teste = t.exec; c.estado.casos[caso.id].convTeste = t.conv;
        if (t.bruto) c.arquivo(`bateria/${chave}-${caso.id}-teste.md`, textoDe(t.bruto));
        // E. Publicar v1.
        const p0 = Date.now();
        const pub = await c.api('POST', `/api/quick-wins/${cr.qw.id}/publicar`, {});
        reg.publicar = { status: pub.status, ms: Date.now() - p0, status_qw: pub.dados?.status, versao: pub.dados?.versao_publicada ?? null, erro: pub.status !== 200 ? JSON.stringify(pub.dados).slice(0, 200) : null };
        // F/G/H. Uso real (versão publicada).
        if (pub.status === 200) {
          const u = await executar(c, cr.qw.id, caso.material, { teste: false });
          reg.uso = u.exec; c.estado.casos[caso.id].convUso = u.conv;
          if (u.bruto) c.arquivo(`bateria/${chave}-${caso.id}-uso.md`, textoDe(u.bruto));
        }
      }
    } catch (err) { reg.excecao = String(err.message || err).slice(0, 300); }
    saida[caso.id] = reg;
    c.salvar(`02-${chave}`, saida);
    const q = x => (x?.qualidade ? `${x.qualidade.status}${x.qualidade.falhas.length ? `[${x.qualidade.falhas.map(f => f.split(':')[0]).join(',')}]` : ''}` : x?.pergunta ? 'pergunta' : x?.erro ? `erro:${String(x.erro).slice(0, 60)}` : '-');
    c.log(`${caso.id} ${caso.nome}: interp=${reg.interpretar?.status}/${reg.interpretar?.ms}ms ent=${(reg.interpretar?.entregaveis || []).length} lac=${(reg.interpretar?.lacunas || []).length} criar=${reg.criar?.status} teste=${q(reg.teste)}/${reg.teste?.ms}ms art=${(reg.teste?.artefatos || []).length} pub=${reg.publicar?.status} uso=${q(reg.uso)}/${reg.uso?.ms}ms ${reg.excecao || ''}`);
  }
  void pasta;
}
