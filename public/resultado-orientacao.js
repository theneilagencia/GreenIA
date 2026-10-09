// Orientação a partir da conferência existente. Não reavalia o resultado nem concede permissões.
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const GRUPOS = {
  completo: ['A entrega ficou incompleta', 'Peça para completar as partes apontadas pela conferência.'],
  regras: ['Uma orientação não foi seguida', 'Peça para seguir a orientação indicada e conferir o texto novamente.'],
  formato: ['O formato precisa mudar', 'Peça para reorganizar o resultado no formato combinado.'],
  invencao: ['Há informações sem confirmação', 'Confira as informações indicadas no material original. Peça para retirar o que não tiver fonte.'],
};
export function pontosDoResultado(q) {
  const problemas = (q?.problemas || []).filter(p => typeof p === 'string');
  return problemas.map((detalhe, i) => {
    const item = (q.itens || []).find(x => x.conferido && !x.ok && (x.motivos || []).some(m => detalhe.includes(m)));
    const t = norm(detalhe);
    const grupo = item?.id || (/faltou parte/.test(t) ? 'completo' : /formato combinado/.test(t) ? 'formato' : /informacao que nao esta/.test(t) ? 'invencao' : 'regras');
    let [titulo, padrao] = GRUPOS[grupo] || GRUPOS.regras;
    const motivo = detalhe.replace(/^(Uma das regras do Quick Win não foi seguida\.|Faltou parte do que foi pedido\.|O resultado não veio no formato combinado\.|O resultado pode ter informação que não está no material\.)\s*/,'');
    let observacao = motivo.split(/\s*\(critério:/i)[0].split(/(?<=[.!?])\s+/)[0] || titulo + '.';
    let fazer = padrao;
    if (/responsave|prazos|kpis|indicadores/.test(t) && grupo === 'completo') fazer = 'Peça para incluir um plano de ação com responsáveis, prazos e indicadores de acompanhamento. Use apenas dados confirmados; o que faltar deve ser indicado.';
    if (/linguagem|tom |narrativa|frases|marcas de ia|termos tecnicos/.test(t)) {
      titulo = 'A linguagem precisa de ajuste';
      observacao = 'A conferência apontou problemas no tom ou na construção das frases.';
      fazer = 'Peça para simplificar a linguagem, variar as frases e retirar construções artificiais, preservando o conteúdo.';
    }
    return { id: i, titulo, observacao, fazer, detalhe };
  });
}
export function pedidoMelhoria(q) {
  const pontos = pontosDoResultado(q);
  return `Melhore o último resultado desta execução usando o material já enviado.\n${[...new Set(pontos.map(p=>p.fazer))].map(p=>`- ${p}`).join('\n')}\nConfira também os demais pontos da conferência. Não invente informações nem faça ações em sistemas externos.`;
}
export function orientacaoConfiguracao(a) {
  const textos = {
    pesquisa_area_reforcada: ['A pesquisa na internet foi bloqueada pela proteção da área.', 'Os temas atuais não foram confirmados na internet. A proteção da área continua ativa.', 'Peça a quem administra os acessos para avaliar se este trabalho pode pesquisar na internet.'],
    pesquisa_nao_liberada: ['A pesquisa na internet está desativada.', 'O resultado usou o material disponível, sem confirmar informações atuais na internet.', 'Revise a regra de pesquisa da empresa. A liberação deve respeitar a proteção dos dados.'],
    pesquisa_sigilosa: ['Esta conversa é sigilosa.', 'A pesquisa na internet não foi feita para preservar o sigilo.', 'Use fontes autorizadas enviadas nesta conversa. Consulte a política para entender a restrição.'],
    pesquisa_dados_protegidos: ['O material exige proteção de dados.', 'A pesquisa na internet não foi feita com este conteúdo.', 'Use material sem dados protegidos ou peça ao administrador para avaliar as regras.'],
    pesquisa_reserva_do_plano: ['O limite disponível impediu a pesquisa.', 'As informações atuais não foram confirmadas na internet.', 'Confira o consumo e os limites antes de repetir o trabalho.'],
    imagem_nao_liberada: ['A imagem final não foi gerada.', 'O resultado não contém a imagem pedida.', 'Confira se a empresa permite gerar imagens e se o serviço está configurado.'],
    fonte_obrigatoria: ['Um material obrigatório não pôde ser usado.', 'A análise pode estar incompleta por falta desse material.', 'Revise as fontes deste Quick Win e repita o teste com o material disponível.'],
    base_sem_trecho: ['A base de conhecimento não forneceu o material necessário.', 'O resultado não foi conferido com essa fonte.', 'Confira se o documento está disponível e autorizado para sua área.'],
  };
  const [aconteceu, impacto, fazer] = textos[a.motivo] || ['Uma configuração limitou este resultado.', 'Confira a limitação antes de usar o resultado.', `Revise ${a.onde || 'a configuração indicada'}.`];
  return { aconteceu, impacto, fazer };
}
export function orientacaoIntegracao(p, integ = {}) {
  const leitura = p.modo === 'read', t = norm(p.motivo);
  if (p.status === 'SUCCESS') return { impacto: leitura ? 'Os dados desta consulta ficaram disponíveis para o trabalho.' : 'Esta etapa foi concluída no sistema externo.', fazer: '' };
  if (p.status === 'SIMULATED') return { impacto: 'Esta etapa foi apenas simulada. Nenhuma ação real foi feita.', fazer: 'Confira o teste antes de usar a integração em um trabalho real.' };
  if (p.status === 'APPROVAL_REQUIRED') return { impacto: p.aprovacao_status === 'aprovada' ? 'A autorização foi recebida, mas a etapa ainda não foi executada.' : 'Esta etapa não foi executada enquanto a autorização não estiver válida.', fazer: p.aprovacao_status === 'negada' ? 'A autorização foi negada. Revise a necessidade com quem decide; não tente contornar a decisão.' : p.aprovacao_status === 'invalidada' ? 'A autorização deixou de valer. Revise o pedido antes de solicitar outra aprovação.' : p.aprovacao_status === 'aprovada' ? 'Use “Executar etapas aprovadas” para realizar somente o que foi autorizado.' : `Acompanhe a aprovação${p.aprovador ? ` com ${p.aprovador}` : ' com uma pessoa autorizada'}.`, destino: 'aprovacao' };
  if (!leitura && integ.motivo === 'resultado_nao_conferido') return { impacto: 'Nenhuma alteração desta etapa foi feita no sistema: o resultado precisa de revisão.', fazer: 'Corrija o resultado e repita o teste antes de solicitar ou executar uma alteração.', destino: 'resultado' };
  if (/configurar|ativa|conexao|conexão/.test(t)) return { impacto: leitura ? 'Os dados desta consulta não foram obtidos. Não considere o resultado completo com essa fonte.' : 'Esta ação não foi realizada no sistema.', fazer: 'Confira se o sistema e a ação estão corretos. Se isto for apenas uma etapa de pesquisa ou redação, revise o Quick Win; não crie uma conexão para uma etapa editorial.', destino: 'conexao' };
  if (p.status === 'DENIED' || /politica|política|nao permite/.test(t)) return { impacto: 'Esta etapa não foi executada porque a política da empresa não permite.', fazer: 'Peça ao responsável pelas integrações para avaliar a regra. A restrição continua válida.', destino: 'politica' };
  if (/anterior/.test(t)) return { impacto: 'Esta etapa depende de outra que não terminou.', fazer: 'Resolva primeiro a etapa anterior indicada nos detalhes. Não repita ações já concluídas.' };
  if (p.status === 'PARTIAL') return { impacto: leitura ? 'Só parte das informações foi obtida.' : 'A ação foi concluída apenas em parte.', fazer: 'Confira o que o sistema concluiu antes de pedir outra execução, para evitar repetir alterações.', destino: 'conexao' };
  return { impacto: leitura ? 'Não foi possível confirmar os dados desta consulta.' : 'Não foi possível confirmar a conclusão desta ação.', fazer: 'Peça ao responsável pela integração para conferir o estado no sistema antes de tentar novamente.', destino: 'conexao' };
}
