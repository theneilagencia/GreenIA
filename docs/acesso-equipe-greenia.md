# Acesso da equipe de operação (GreenIA) aos ambientes das empresas

Governança mínima do acesso operacional (Etapa 1). Vale para todo admin da plataforma (`platform_members`).

## Regras

| Regra | Como funciona | Onde |
|---|---|---|
| Só pelo console | `POST /api/plataforma/empresas/:id/entrar`. O login da empresa recusa admin da plataforma sem vínculo nela (mensagem `operador`) | `src/plataforma/api-publica.js` → `acesso` |
| Motivo obrigatório | `tipo` ∈ suporte, solicitacao_cliente, incidente, outro; `justificativa` de 10 a 500 caracteres. Sem os dois: 400, sem registro e sem sessão | `src/plataforma/acessos.js` → `validarMotivo` |
| Registro estruturado | `operator_access`: operador (id e email), empresa, tipo, justificativa, início, prazo, fim, duração, status, motivo do fim, quem encerrou, resultado do aviso | `ESQUEMA_ACESSOS` |
| Temporário | 60 minutos (`DURACAO_ACESSO_MS`); a sessão de operador vence junto (a sessão comum dura 12 h). Novo acesso do mesmo operador à mesma empresa encerra o anterior | `abrirAcesso`, `abrirSessao` |
| Poderes só durante o acesso | O admin da plataforma tem todas as permissões da empresa só numa sessão presa a um acesso aberto, no prazo, da mesma empresa. Fora disso valem só as permissões do vínculo dele, se houver | `src/plataforma/rbac.js` → `permissoesNaEmpresa`, `src/plataforma/servidor.js` → `sessaoDaEmpresa` |
| Visível para o cliente | Administração > "Acessos da equipe de operação" (`audit.read`): acessos e exportações só desta empresa, sem IP nem navegador. Rótulo neutro (marca branca), com a identidade do operador sempre visível: email, tipo, justificativa, início, fim, duração, status e exportações. Emails falam em "equipe de operação da plataforma" | `GET /api/empresa/acessos-greenia`, `public/empresa.js` → `telaAcessos` |
| Controle do cliente | Admin da empresa (`company.manage`) encerra um acesso aberto; a sessão do operador cai na hora | `POST /api/empresa/acessos-greenia/:id/encerrar` |
| Encerramento | Sair, expirar, encerrar (empresa ou operador), substituição, suspensão, cancelamento, exclusão da empresa, pessoa desativada ou removida, usuário bloqueado e admin removido fecham o registro com fim e duração. Acesso vencido nunca aparece aberto: toda leitura fecha os vencidos e os sem sessão | `encerrarAcesso`, `varrerExpirados`, `encerrarAcessosAbertos` |
| Aviso | Email aos admins da empresa, assíncrono, quando há envio de email. A segurança não depende dele: o resultado (`enviado`, `parcial`, `falhou`, `sem_destinatarios`) fica no registro | `avisarAdmins` |
| Exportação | Só `POST /api/plataforma/empresas/:id/exportar` com tipo e justificativa (o GET saiu). Registro próprio em `operator_exports`: operador, empresa, data, tipo, justificativa, formato `banco_completo`, sucesso ou falha, tamanho. Aparece na tela da empresa e gera aviso | `api-plataforma.js`, `registrarExportacao` |
| Auditoria da plataforma | `company.accessed`, `company.access_ended`, `company.exported` e `company.export_failed`, com o motivo | `audit_log` |
| Conversas | Nada mudou: a sessão de operador não lê conversas de outras pessoas, e a tela de acessos não traz conteúdo | testes em `test/acesso-greenia.test.js` |

## Risco residual conhecido: operador com vínculo

Um admin da plataforma pode, pelo console, adicionar a si próprio como membro de uma empresa e depois entrar pela
tela de login como usuário comum, sem o fluxo de acesso operacional (sem motivo nem prazo). Não foi corrigido nesta
etapa. Nesse caso:

- a inclusão aparece em Usuários da empresa;
- a inclusão aparece na auditoria (da plataforma e da empresa);
- ele não recebe poderes de operador: só as permissões da role que recebeu;
- ele não acessa conversas como operador: vale o isolamento por pessoa de qualquer usuário.

Aprovação prévia e controles adicionais (alerta específico, bloqueio de autoinclusão) ficam para fase futura.

## Fora desta etapa (fase futura)

- Aprovação prévia pela empresa (pedido → aprovação → acesso), acesso de emergência com justificativa reforçada e
  aprovação da exportação pelo cliente.
- Cifrar o arquivo exportado e registrar a entrega.
- Controles para o risco residual acima.
- Cópia guardada em `dados/excluidas` na exclusão definitiva: tratada na política de retenção (Etapas 2 e 3).
