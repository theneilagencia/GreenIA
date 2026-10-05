# UX/UI: clareza, orientação e recuperação — 5 de outubro de 2026

Base de produção: `a7f769d85313117d4a09240fb1a21652980c9d95`. Implementação em worktree isolada,
sem incorporar nem sobrescrever o trabalho anterior da cópia original.

## Comportamento entregue

- Entrada com reenvio de código, identificação do destinatário, orientação para usar o email mais recente e erros associados aos campos. Mantidos os limites e a invalidação do código anterior no servidor.
- Destinos principais antes do histórico na navegação. Conversas recentes continuam disponíveis; o menu funciona também em 320 × 568. Entrada orientada a duas tarefas: usar um Quick Win ou escrever um pedido.
- Tipografia, contraste de textos secundários, espaçamento e controles mais confortáveis. Link para pular ao conteúdo; contenção de foco em diálogos e menu móvel; Escape e retorno de foco nos diálogos de política e relato. A ciência obrigatória da política continua obrigatória.
- Salvamento explícito e ao continuar nas etapas iniciais do Quick Win, indicação persistente do estado do rascunho, proteção contra abandono e preservação dos dados após falha de rede. O rascunho não altera a versão publicada.
- Busca de Quick Wins sem depender de acentos, descoberta de arquivados e restauração em preparo, com confirmação e histórico preservado. A restauração não publica automaticamente.
- Explicações do uso de cada fonte próximas ao seletor; distinção entre materiais do Quick Win e materiais de uma conversa; erros persistentes na área de fontes.
- Estado atual das ações externas acima da resposta. Conferência do texto, autorização e execução são estados distintos. Consultar a autorização usa GET e não executa ações. Executar só é oferecido após autorização; a política e a autorização continuam verificadas pelo servidor. Autorização negada, invalidada, parcial e gravação bloqueada são diferenciadas.
- Retorno da aprovação à conversa de origem, sem permitir destinos arbitrários. Estado atualizado preservado ao redesenhar a conversa. "Usar em outro caso" abre o fluxo de um novo caso; o campo atual continua a conversa existente.
- Termos administrativos mais claros, créditos adicionais identificados e alertas atuais separados de ocorrências históricas. Falha de logout não indica sucesso; avisos de erro podem ser fechados e não desaparecem por temporizador.

## Regressão

| Verificação | Resultado |
|---|---|
| Suíte unitária completa | 744/744 |
| Suíte E2E completa em Chromium headless | 62/62 |
| Integrações: E2E e motor, após revisão final dos estados | 21/21 |
| Auditoria responsiva existente, 360 a 1440 px | 143 telas; nenhum transbordamento horizontal ou corte detectado |
| Capturas adicionais, 320/390/1280 px | 15 telas e 2 menus; sem transbordamento horizontal nem erro JavaScript |
| Integridade do diff | `git diff --check` sem erros |

Os testes usam contas, email, IA e sistemas externos fictícios e locais. Cobrem, entre outros,
invalidação e reenvio do código, recuperação de rede, rascunhos, versão publicada, fontes,
acesso entre pessoas e empresas, sigilo, roteamento, permissões, integrações, aprovação,
execução sem duplicação, teclado, menu móvel, arquivos e logout.

Os testes de texto foram atualizados para a nova linguagem. O teste de fontes espera o fim
do carregamento antes de verificar o conteúdo; não remove a verificação de leitura, papel,
sigilo do endereço, persistência ou anexos. A simulação da integração agora verifica também
que nenhuma fatura é gravada no sistema externo.

## Publicação e reversão

Nenhuma dependência, migração, configuração de produção, dado de cliente, motor de IA,
contrato de créditos ou regra de autorização foi alterado. O backend acrescenta apenas
metadados de leitura do estado da aprovação e da atualização do plano, com filtro por empresa.
Publicação pelo fluxo existente de merge e deploy automático; reversão possível para a imagem
anterior `a7f769d`, sem transformação de dados por este release.

## Limites da validação

Esta entrega não equivale a certificação WCAG nem a pesquisa de usabilidade com pessoas
não nativas digitais. A auditoria automatizada ainda sinaliza controles compactos existentes
e texto pequeno em áreas do console de operação. Switches mantêm a área de toque ampliada
existente no CSS. A hierarquia do Conhecimento foi preservada; redesenho de organização e
onboarding guiado devem ser validados com usuários antes de mudanças estruturais.

O QA funcional automatizado está aprovado para este release. Não se declara uma nova bateria
completa autenticada em produção nem resolução de toda ressalva histórica de geração pela IA.
