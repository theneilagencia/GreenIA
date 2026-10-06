# Onboarding guiado e Conhecimento — 5 de outubro de 2026

Base: produção `717a178cee78b6200d3a0f10221d05bea7b978cf` (PR #9).
Implementação em branch isolada, sem alterar banco, documentos, configurações ou permissões de produção.

## Onboarding

Guia não bloqueante com quatro passos para uso cotidiano, um passo adicional para quem administra
bases e outro para quem pode administrar a política. Ensina a escolher o trabalho, enviar materiais,
conferir resultados, distinguir autorização de execução e consultar o Conhecimento.

O convite aparece na conversa nova; a ajuda pode ser reaberta pelo botão de interrogação no cabeçalho
ou pela busca de comandos. O progresso e a opção de adiar ficam no navegador, separados por pessoa
e empresa. Não guardam materiais, conteúdo de conversa nem credenciais. Se o armazenamento local
não estiver disponível, o guia funciona com estado em memória. A conclusão é do guia, não de tarefas
executadas, configurações ou ciência da política. O usuário continua podendo sair a qualquer momento.

## Conhecimento

- Duas visões: **Disponível para mim** e **Gerenciar bases**, esta somente quando o servidor permite.
- Biblioteca em cartões com navegação por base, busca em título/arquivo/pasta sem depender de acentos,
  filtros por pasta, revisão e sigilo, ordenação e paginação de vinte documentos.
- Estado de revisão explícito, pasta, base de destino e uso por Quick Wins acessíveis ao usuário.
- Envio em duas etapas: escolher arquivo e destino; revisar a audiência e confirmar a disponibilização.
- Edição de título, pasta e sigilo; substituição de arquivo sem mudar a base nem os vínculos.
- Confirmação para registrar revisão ou remover permanentemente um documento. Remoção em seção separada.
- Preservação de arquivo e campos após falha de rede; proteção contra abandono de envio/edição e contra
  nova navegação durante gravação. Limpar filtros não descarta um arquivo preparado.
- Atualização da biblioteca remove ações de gestão quando a permissão é revogada.
- Pastas existentes preservadas, inclusive nomes que poderiam colidir com o filtro de documentos sem pasta.

As APIs e os controles de acesso existentes foram mantidos. Busca e filtros são locais sobre o conjunto
autorizado; não consultam conteúdos de outras áreas. A biblioteca não oferece visualização ou download
do conteúdo bruto que não existia nas APIs. Documentos usados em Quick Wins mantêm IDs e relacionamentos.
Não houve movimentação em lote, mudança de audiência ou conversão de arquivos existentes.

## Validação

| Bateria | Resultado |
|---|---|
| Unitários completos | 744/744 |
| E2E completos em Chromium headless | 71/71 |
| Jornadas finais de onboarding e Conhecimento | 9/9 |
| Layouts de guia e biblioteca | 320, 390, 768 e 1280 px sem transbordamento horizontal |
| Sintaxe dos módulos e integridade do diff | Aprovadas |

As novas jornadas cobrem retomada e conclusão do guia, isolamento da preferência entre pessoas,
orientação por perfil, leitura restrita por área, envio com confirmação e recuperação de rede, edição,
substituição, confirmação de revisão, teclado e foco, proteção de dados não salvos, paginação,
revogação de gestão e cancelamento/confirmação de remoção apenas do documento escolhido.

Os testes usam contas, arquivos, email e serviços fictícios e locais. O teste existente de OCR segue
verificando o fluxo de gestão após abrir a nova visão e o formulário de envio. As regras de login,
sigilo, guardrails, aprovação, roteamento e créditos continuam cobertas pela regressão existente.

## Publicação e reversão

Publicação pelo merge e deploy automático existentes. Nenhuma dependência, migração ou configuração
de infraestrutura foi adicionada. Pode-se reverter a imagem para `717a178` sem transformação de dados
por este release. As preferências do guia são opcionais e ignoradas pela versão anterior.

Esta validação não representa certificação de acessibilidade nem pesquisa de usabilidade com pessoas
não nativas digitais. Também não constitui uma nova bateria completa autenticada em produção.
