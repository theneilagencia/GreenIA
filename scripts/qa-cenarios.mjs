// Cenários do QA com IA real (produção e candidato). Dados 100% fictícios. Os 20 pedidos surpresa foram escritos para
// a rodada com IA real e não aparecem em código do motor, catálogo, prompt, testes ou fixtures.
export const BATERIA = [
  ['A-contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', { entrada: 'documento', itens: ['risco', 'obriga', 'prazo', 'multa'] }],
  ['B-fornecedores', 'Compare três propostas de fornecedores considerando preço, prazo, escopo e risco.', { entrada: 'documento', qtd: 3, itens: ['compar|matriz|tabela', 'preco', 'prazo', 'escopo', 'risco'] }],
  ['C-planilha', 'Analise esta planilha mensal e identifique desvios relevantes, maiores gastos e itens fora do padrão.', { entrada: 'planilha', itens: ['desvio', 'gasto', 'fora do padr|exce|anomal'] }],
  ['D-reuniao', 'Transforme esta reunião em ata, decisões, responsáveis e próximos passos.', { entrada: 'transcricao|texto|documento', itens: ['ata', 'decis', 'respons', 'proximos passos'] }],
  ['E-concorrentes', 'Pesquise os principais concorrentes e monte uma matriz de posicionamento.', { ferramenta: 'pesquisa_web', itens: ['matriz', 'concorr'] }],
  ['F-relatorio', 'Prepare um relatório executivo mensal com principais fatos, riscos e decisões necessárias.', { itens: ['fatos', 'risco', 'decis'] }],
  ['G-curriculos', 'Analise estes currículos e monte uma comparação objetiva com base nos requisitos da vaga.', { entrada: 'documento', itens: ['compar|tabela|matriz'] }],
  ['H-operacoes', 'Organize estas pendências operacionais e gere um plano de ação com prioridade e responsável.', { entrada: 'texto|documento|planilha', itens: ['plano', 'priorid', 'respons'] }],
  ['I-compliance', 'Confira estes documentos e identifique requisitos ausentes, inconsistências e evidências pendentes.', { entrada: 'documento', itens: ['requisit', 'inconsist', 'evid'] }],
  ['J-marketing', 'Crie uma campanha com conceito, mensagens principais e peças recomendadas.', { itens: ['conceito', 'mensag', 'pec'] }],
  ['K-social', 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.', { canais: ['linkedin', 'instagram'], itens: ['copy|legenda', 'carrossel', 'reels'] }],
  ['L-vago', 'Melhore isso.', { vago: true }],
  ['M-ferramenta', 'Crie o vídeo final desta campanha.', { itens: ['video|roteiro|storyboard|briefing'] }],
  // Fidelidade do tipo de material (casos em que o plano sem IA errou o tipo na branch auditada).
  ['S7', 'Compare o orçamento aprovado com o realizado por centro de custo e explique as maiores variações.', { entrada: 'planilha' }],
  ['N04', 'Quantifique as horas extras por departamento na folha de março e sinalize os casos acima de 20 horas.', { entrada: 'planilha|documento' }],
  ['N08', 'Verifique se o cronograma da obra está coerente com as medições aprovadas e aponte as etapas atrasadas.', { entrada: 'documento|planilha' }],
  ['N25', 'Calcule o custo por quilômetro de cada veículo da frota com base nas notas de abastecimento.', { entrada: 'documento|planilha' }],
  ['N26', 'Prepare um resumo de uma página do relatório anual de sustentabilidade para o conselho.', { entrada: 'documento' }],
  ['Q08', 'Revise esta pesquisa de clima e corrija o texto.', { semFerramenta: 'pesquisa_web' }],
];

export const SURPRESA = [
  ['P01', 'logística', 'Mapeie as entregas devolvidas no último mês e agrupe os motivos por transportadora.', { entrada: 'planilha|documento|texto', itens: ['motivo|transportadora'] }],
  ['P02', 'estoque', 'Indique quais itens do estoque estão parados há mais de 90 dias e sugira o destino de cada um.', { itens: ['iten|parad|destino'] }],
  ['P03', 'cobrança', 'Redija uma sequência de três lembretes de cobrança, do mais cordial ao mais firme, para faturas em atraso.', { itens: ['lembrete|cobranc'] }],
  ['P04', 'treinamento', 'Monte uma trilha de capacitação de quatro semanas para novos operadores de empilhadeira, com objetivos e avaliação.', { itens: ['trilha|semana|capacit', 'avalia|objetiv'] }],
  ['P05', 'facilities', 'Liste as salas de reunião com maior taxa de reserva sem uso e proponha uma regra de liberação.', { itens: ['sala|reserva', 'regra|libera'] }],
  ['P06', 'orçamento', 'Projete o orçamento de manutenção do próximo trimestre a partir dos gastos dos últimos doze meses.', { itens: ['orcament|projec|manutenc'] }],
  ['P07', 'governança', 'Elabore a pauta e a matriz de decisões da próxima reunião do comitê de riscos.', { itens: ['pauta', 'matriz|decis'] }],
  ['P08', 'compras', 'Avalie se vale consolidar os pedidos de material de escritório em um único fornecedor e explique os prós e contras.', { itens: ['pro|contra|consolid'] }],
  ['P09', 'documentação', 'Converta estas anotações soltas de procedimento em um POP com objetivo, responsáveis, passos e registros.', { entrada: 'texto|documento', itens: ['objetiv|pop|procediment', 'passo|respons|registro'] }],
  ['P10', 'atendimento', 'Leia estes tickets de suporte e identifique os três problemas que mais geram retrabalho.', { entrada: 'texto|planilha|documento', itens: ['problema|retrabalho'] }],
  ['P11', 'operações', 'Compare a produtividade dos três turnos da linha de envase e aponte onde está a maior perda.', { qtd: 3, itens: ['compar|tabela|matriz', 'perda'] }],
  ['P12', 'qualidade', 'Analise estes laudos de inspeção e classifique os defeitos por criticidade e origem provável.', { entrada: 'documento', itens: ['defeito|criticidade|origem'] }],
  ['P13', 'RH', 'Sugira cinco perguntas de pesquisa de desligamento que ajudem a entender por que as pessoas saem.', { semFerramenta: 'pesquisa_web', itens: ['pergunt'] }],
  ['P14', 'jurídico', 'Revise este termo aditivo e aponte o que muda em relação ao contrato original.', { entrada: 'documento', itens: ['muda|diferen|alterac|compar'] }],
  ['P15', 'financeiro', 'Concilie o extrato bancário com o razão contábil de setembro e liste as diferenças não explicadas.', { entrada: 'planilha|documento', itens: ['diferen'] }],
  ['P16', 'segurança', 'Crie um checklist de inspeção diária para a área de carga e descarga.', { itens: ['checklist'] }],
  ['P17', 'TI', 'Pesquise as vulnerabilidades críticas recentes do servidor web que usamos e recomende o que atualizar primeiro.', { ferramenta: 'pesquisa_web', itens: ['vulnerab|recomend|atualiz'] }],
  ['P18', 'comercial', 'Prepare um resumo das objeções mais comuns dos clientes nas propostas perdidas deste semestre.', { itens: ['obje|resum'] }],
  ['P19', 'ambiental', 'Organize os indicadores de consumo de energia das plantas em uma tabela comparativa com tendência mensal.', { itens: ['tabela|compar|indicador'] }],
  ['P20', 'vago', 'Pode dar uma olhada nisso?', { vago: true }],
];

export const CONTRATO = ['CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº QA-77/2026 (FICTÍCIO)', 'CONTRATANTE: Indústria Modelo QA S.A. (fictícia). CONTRATADA: Serviços Exemplo QA Ltda. (fictícia).',
  'CLÁUSULA 1 – OBJETO. Manutenção preventiva e corretiva de 14 correias transportadoras.', 'CLÁUSULA 2 – OBRIGAÇÕES DA CONTRATADA. Equipe de 6 técnicos; chamados críticos em até 4 horas; relatório mensal até o dia 5.',
  'CLÁUSULA 3 – OBRIGAÇÕES DA CONTRATANTE. Liberar acesso em até 24 horas; pagar faturas em até 30 dias do aceite.', 'CLÁUSULA 4 – PRAZO E RENOVAÇÃO. Vigência de 24 meses a partir de 01/03/2026, renovação automática se ninguém se manifestar com 90 dias de antecedência.',
  'CLÁUSULA 5 – PREÇO. R$ 186.500,00 por mês, reajuste anual pelo IPCA.', 'CLÁUSULA 6 – MULTAS. Atraso em chamado crítico: 2% do valor mensal por ocorrência, limitada a 10% ao mês. Falta do relatório mensal: R$ 5.000,00.',
  'CLÁUSULA 7 – RESCISÃO. Aviso de 60 dias. Rescisão antecipada sem justa causa pela CONTRATANTE: multa de 30% sobre os meses restantes.', 'CLÁUSULA 8 – CONFIDENCIALIDADE. Sigilo por 5 anos após o término.', 'CLÁUSULA 9 – FORO. Belo Horizonte/MG.'];
export const PROPOSTAS = [['PROPOSTA — Alfa QA Manutenção Ltda. (fictícia)', 'Escopo: preventiva mensal, inclui peças de desgaste.', 'Preço: R$ 182.000,00 por mês.', 'Prazo de mobilização: 30 dias.', 'Garantia: 6 meses.'],
  ['PROPOSTA — Beta QA Serviços S.A. (fictícia)', 'Escopo: preventiva e corretiva, sem peças.', 'Preço: R$ 158.500,00 por mês.', 'Prazo de mobilização: 45 dias.', 'Garantia: 3 meses.'],
  ['PROPOSTA — Gama QA Engenharia (fictícia)', 'Escopo: preventiva, corretiva e preditiva; peças até R$ 10.000/mês.', 'Preço: R$ 205.900,00 por mês.', 'Prazo de mobilização: 20 dias.', 'Risco declarado: depende de subcontratada.']];
export const TRANSCRICAO = ['Reunião de operação — 14/09/2026 (fictícia). Presentes: Carla (operação), Davi (manutenção), Elisa (compras).', 'Carla: Decidido: a parada da correia TC-04 será no sábado, dia 20. Davi é o responsável e entrega o checklist até quinta.',
  'Davi: Eu acho que talvez valha trocar o fornecedor de rolos, mas não tenho certeza.', 'Elisa: Ficou acordado que eu peço três cotações de rolos até o dia 25.', 'Carla: Ficou pendente: o orçamento extra de manutenção já foi aprovado? Ninguém soube responder.'];
export const CVS = [['CURRÍCULO — Candidato A (fictício)', 'Engenharia de Produção. 6 anos em planejamento de manutenção; SAP PM avançado. Inglês intermediário.'],
  ['CURRÍCULO — Candidato B (fictício)', 'Técnico em Mecânica. 9 anos em manutenção de correias; liderança de 8 pessoas. Idiomas: não informado.'],
  ['CURRÍCULO — Candidato C (fictício)', 'Engenharia Mecânica. 2 anos em confiabilidade; análise de falhas. Inglês fluente.']];
export function planilha() {
  const L = [['ID', 'Data', 'Categoria', 'Centro de custo', 'Previsto (R$)', 'Realizado (R$)']], cats = ['Manutenção', 'Combustível', 'Peças', 'Serviços', 'Energia', 'Transporte'];
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 1; i <= 120; i++) { const p = Math.round(5000 + rnd() * 20000); let r = Math.round(p * (0.95 + rnd() * 0.1)); if (i === 23) r = Math.round(p * 1.42); if (i === 67) r = Math.round(p * 0.55); if (i === 118) r = p * 9;
    L.push([`L${String(i).padStart(3, '0')}`, `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, cats[i % 6], `CC-${100 + (i % 9)}`, p, [41, 77, 95, 109].includes(i) ? '' : r]); }
  return L;
}

// ---- Homologação do candidato: 15 casos principais (pedido, material fictício e o que um leigo precisa ver) -------
export const SMOKE15 = [
  ['01-contrato', 'Analise este contrato e destaque riscos, obrigações, prazos e multas.', 'contrato', /risco/i],
  ['02-fornecedores', 'Compare três propostas de fornecedores considerando preço, prazo, escopo e risco.', 'propostas', /182\.000[\s\S]*158\.500|158\.500[\s\S]*182\.000/],
  ['03-planilha', 'Analise esta planilha mensal e identifique desvios relevantes, maiores gastos e itens fora do padrão.', 'planilha', /L118/],
  ['04-ata', 'Transforme esta reunião em ata, decisões e próximos passos.', 'reuniao', /TC-04|sábado/i],
  ['05-relatorio', 'Prepare um relatório executivo mensal com principais fatos, riscos e decisões necessárias.', 'indicadores', /1,92/],
  ['06-concorrentes', 'Pesquise os principais concorrentes de software de gestão documental para mineradoras no Brasil e monte uma matriz de posicionamento.', null, /\|.*\|/],
  ['07-curriculos', 'Analise estes currículos e monte uma comparação objetiva com base nos requisitos da vaga.', 'curriculos', /Candidato A[\s\S]*Candidato B|Candidato B[\s\S]*Candidato A/],
  ['08-reclamacoes', 'Analise estas reclamações de clientes e agrupe os principais motivos, frequência e prioridade.', 'reclamacoes', /atraso/i],
  ['09-pendencias', 'Organize estas pendências operacionais e gere um plano de ação com prioridade e responsável.', 'pendencias', /Carla|Rafael/],
  ['10-nao-conformidades', 'Analise estes registros de não conformidade e agrupe por causa, frequência e impacto.', 'nc', /EPI|treinamento/i],
  ['11-checklist', 'Transforme este procedimento em um checklist operacional.', 'procedimento', /bloqueio|etiqueta/i],
  ['12-apresentacao', 'Estruture uma apresentação executiva com problema, análise, recomendação e próximos passos.', 'indicadores', /recomend/i],
  ['13-email', 'Transforme estas informações em um e-mail executivo curto e objetivo.', 'indicadores', /assunto/i],
  ['14-social', 'Crie conteúdo para LinkedIn e Instagram com copy, carrossel e Reels.', 'tema', /LinkedIn[\s\S]*Instagram|Instagram[\s\S]*LinkedIn/],
  ['15-vago', 'Melhore isso.', null, null],
];
export const MATERIAIS_TEXTO = {
  reclamacoes: ['Reclamações de setembro (fictícias):', '1. Pedido 5531 chegou 10 dias atrasado.', '2. Produto veio com a embalagem danificada.', '3. Atraso de 7 dias, sem aviso.', '4. Cobrança em duplicidade no boleto.', '5. Atraso de 12 dias; atendente não soube informar.', '6. Embalagem rasgada, item riscado.'].join('\n'),
  pendencias: ['Pendências (fictícias):', '- Comprar luvas para o almoxarifado — pedido da Carla, até sexta.', '- Revisar a escala do turno da noite — Rafael, sem prazo.', '- Trocar lâmpadas do galpão 2 — aguardando fornecedor.', '- Atualizar a planilha de estoque — Carla, até dia 15.'].join('\n'),
  nc: ['Registros de não conformidade (fictícios):', 'NC-01: operador sem EPI na área de carga — impacto alto.', 'NC-02: checklist de empilhadeira não preenchido — causa: falta de treinamento.', 'NC-03: operador sem EPI no turno da noite — impacto alto.', 'NC-04: extintor vencido no galpão 3 — impacto médio.', 'NC-05: checklist não preenchido — causa: falta de treinamento.'].join('\n'),
  procedimento: ['Procedimento (fictício) de manutenção na correia:', 'Antes de intervir, desligue a correia no painel, aplique o bloqueio com cadeado pessoal e coloque a etiqueta de "Não ligar".', 'Teste a partida para confirmar que está desenergizada. Faça a manutenção. Retire ferramentas, remova o bloqueio e avise o operador antes de religar.'].join(' '),
  indicadores: ['Indicadores de setembro/2026 (fictícios):', 'Receita: R$ 1,92 mi (meta R$ 2,10 mi; agosto R$ 1,85 mi).', 'Chamados de suporte: 318 (agosto: 240); tempo médio 6,4 h (meta 4 h).', 'Projeto Norte QA: 3 semanas de atraso por falta de acesso ao ambiente do cliente.', 'Decisão pendente: contratar mais 2 analistas de suporte (R$ 28 mil/mês).'].join('\n'),
  tema: 'Tema (fictício): lançamento do módulo de compliance documental da Empresa QA.',
};
// 10 pedidos surpresa da homologação do candidato: escritos com o motor congelado (351ce9e); o material de cada um é
// o "Exemplo pronto" gerado pela própria GreenIA (o fluxo que reprovou em produção).
export const SURPRESA10 = [
  ['U01', 'Revise as cotações de frete recebidas e indique a transportadora mais vantajosa para cada rota.'],
  ['U02', 'Identifique no relatório de estoque os itens abaixo do ponto de pedido e sugira a quantidade a comprar.'],
  ['U03', 'Prepare a régua de cobrança para clientes com faturas vencidas há mais de 30 dias.'],
  ['U04', 'Avalie as respostas da avaliação de reação do treinamento e aponte o que melhorar na próxima turma.'],
  ['U05', 'Liste as ordens de serviço de facilities abertas há mais de 15 dias e agrupe por tipo de serviço.'],
  ['U06', 'Compare o orçamento de marketing previsto com o gasto real do trimestre e explique os desvios.'],
  ['U07', 'Resuma a ata do conselho e destaque as deliberações que dependem da diretoria.'],
  ['U08', 'Verifique se as notas de entrega batem com os pedidos de compra e aponte as divergências.'],
  ['U09', 'Classifique os chamados do atendimento por urgência e sugira uma resposta padrão para cada grupo.'],
  ['U10', 'Analise o relatório de auditoria de qualidade e monte o plano de ação para cada achado.'],
];
