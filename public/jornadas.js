// Resumos de experiência: nunca concedem acesso ou substituem a conferência do servidor.
export function resumoConferencia(q) {
  if (!q) return 'Ainda não há uma conferência deste resultado.';
  if (q.problemas?.length) return q.problemas.slice(0, 3).join(' ');
  if (q.status === 'parcial') return 'A conferência ficou incompleta. Isso não confirma que o resultado está correto. Confira as informações antes de usar.';
  if (q.status === 'inconsistente') return 'O teste encontrou pontos que precisam de revisão. Veja a conferência e explique o resultado que esperava.';
  if (q.status === 'pergunta') return 'Faltam informações para concluir este trabalho. Complete o que foi pedido antes de publicar.';
  if (['aprovado', 'corrigido'].includes(q.status)) return 'A conferência não encontrou problemas. Você ainda pode pedir uma melhoria e deve revisar antes de usar.';
  return 'Não foi possível reconhecer a conclusão da conferência. Confira o resultado e repita o teste antes de publicar.';
}

const EVENTOS = {
  'quickwin.schedule_created': 'Agendamento salvo', 'quickwin.schedule_updated': 'Agendamento revisado',
  'quickwin.schedule_state_changed': 'Agendamento ativado ou pausado', 'quickwin.scheduled_finished': 'Execução agendada finalizada',
  'quickwin.refinement_proposed': 'Ajustes de Quick Win preparados', 'quickwin.refinement_applied': 'Ajustes de Quick Win aplicados',
  'quickwin.created': 'Quick Win criado', 'quickwin.updated': 'Quick Win atualizado', 'quickwin.tested': 'Quick Win testado',
  'quickwin.published': 'Versão de Quick Win publicada', 'quickwin.executed': 'Quick Win executado',
  'quickwin.quality_checked': 'Resultado conferido', 'quickwin.status_changed': 'Estado do Quick Win alterado',
  'conversation.created': 'Conversa iniciada', 'conversation.completed': 'Resposta concluída', 'conversation.deleted': 'Conversa excluída',
  'conversation.confidential': 'Conversa protegida como sigilosa', 'credits.consumed': 'Créditos utilizados',
  'config.changed': 'Configurações alteradas', 'policy.updated': 'Política atualizada', 'policy.acknowledged': 'Ciência da política registrada',
  'governance.blocked': 'Processamento bloqueado pela proteção de dados', 'policy.blocked': 'Envio bloqueado pela política',
  'email.failed': 'Falha no envio de email', APPROVAL_REQUESTED: 'Aprovação solicitada', APPROVAL_GRANTED: 'Operação aprovada',
  APPROVAL_DENIED: 'Operação não aprovada', CONNECTOR_FAILED: 'Falha de integração', CONNECTOR_PUBLISHED: 'Integração publicada',
  PLAN_CREATED: 'Plano de ações preparado', PLAN_EXECUTED: 'Plano de ações executado', CAPABILITY_EXECUTED: 'Ação de integração executada',
  CONNECTOR_CREATED: 'Integração criada', CONNECTOR_APPROVED: 'Integração aprovada', CONNECTOR_DISCOVERED: 'Conexão identificada',
  CONNECTOR_DISCOVERY: 'Conexão consultada', CONNECTOR_TESTED: 'Integração testada', CONNECTOR_USED: 'Integração utilizada',
  'area.created': 'Área criada', 'area.updated': 'Área atualizada', 'area.members_added': 'Pessoas adicionadas à área',
  'area.member_removed': 'Pessoa removida da área', 'area.permission_changed': 'Permissão da área alterada', 'area.kb_admin_notified': 'Responsável pelo conhecimento avisado',
  'group.created': 'Grupo criado', 'group.removed': 'Grupo removido', 'people.updated': 'Cadastro de pessoa atualizado',
  'knowledge.added': 'Conhecimento adicionado', 'knowledge.updated': 'Conhecimento atualizado', 'knowledge.removed': 'Conhecimento removido',
  'source.added': 'Material adicionado', 'source.updated': 'Material atualizado', 'source.failed': 'Falha ao preparar material', 'source.role_changed': 'Uso do material alterado',
  'model.certified': 'Modelo verificado', 'model.changed': 'Modelo alterado', 'model.config_changed': 'Configuração de modelos alterada', 'model.pool_expanded': 'Opções de modelos ampliadas',
  'conversation.reclassified': 'Proteção da conversa reavaliada', 'governance.admin_alert': 'Administrador avisado sobre proteção de dados',
  'governance.mode_changed': 'Proteção de dados alterada', 'policy.sensitive_processing_changed': 'Tratamento de dados sensíveis alterado',
  'quickwin.autonomy_checked': 'Condições de execução automática conferidas', 'quickwin.connection_requested': 'Conexão solicitada para Quick Win',
  'quickwin.context_requested': 'Informações solicitadas para Quick Win', 'quickwin.decided': 'Decisão sobre Quick Win registrada',
  'quickwin.deleted': 'Quick Win excluído', 'quickwin.discarded': 'Quick Win arquivado', 'quickwin.evaluated': 'Quick Win avaliado',
  'quickwin.example_generated': 'Exemplo fictício preparado', 'quickwin.interpreted': 'Etapas do Quick Win organizadas',
  'quickwin.permissions_changed': 'Acesso ao Quick Win alterado', 'quickwin.structured': 'Estrutura de Quick Win preparada',
  'quickwin.version_restored': 'Versão anterior de Quick Win recuperada', 'quickwin.scheduled_notification_failed': 'Falha no aviso de execução agendada',
  'visual.derived': 'Variação visual criada', 'visual.edited': 'Peça visual ajustada', 'visual.exported': 'Peça visual exportada',
  'visual.image_generated': 'Imagem criada', 'visual.produced': 'Peça visual criada', 'visual.restored': 'Versão visual anterior recuperada',
};
export const nomeEvento = tipo => EVENTOS[tipo] || 'Registro de atividade';

export function orientacaoAgendamento(motivo) {
  const ajuda = {
    versao_alterada: 'Uma nova versão foi publicada. Confira o trabalho e revise este agendamento antes de ativar.',
    politica_alterada: 'O responsável precisa ler a política atual. Depois, poderá ativar o agendamento novamente.',
    responsavel_inativo: 'O responsável perdeu o acesso. Peça ao administrador para conferir o acesso antes de continuar.',
    limite_programacao: 'O limite deste agendamento foi atingido. Confira o consumo e o limite antes de continuar.',
    sem_creditos: 'O plano ficou sem créditos disponíveis. Peça ao administrador para conferir o consumo.',
    plano: 'O plano atual não permite continuar. Peça ao administrador para conferir os limites e recursos.',
    evento_indisponivel: 'A conexão ou o evento deste trabalho não está disponível. Peça a quem administra as integrações para conferir.',
    entrada_bloqueada: 'O material foi bloqueado pela política. Revise o material; o conteúdo bloqueado não foi enviado.',
    retencao: 'A política não permite guardar este material para execuções futuras. Peça ao administrador para avaliar o caso.',
    reinicio_durante_execucao: 'A execução foi interrompida. Confira o resultado e as ações no sistema antes de tentar novamente, para evitar repetição.',
    aprovacao_negada: 'Uma ação não foi aprovada. Nenhuma nova tentativa será feita sem a conferência necessária.',
    aprovacao_expirada_ou_invalidada: 'A aprovação deixou de valer. Confira a ação e solicite a aprovação novamente pelo trabalho.',
  };
  return ajuda[motivo] || 'Confira o resultado e as condições do trabalho antes de tentar novamente.';
}
