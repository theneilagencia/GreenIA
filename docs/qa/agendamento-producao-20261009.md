# GreenIA — validação real do agendamento em 09/10/2026

## Resultado observado

A jornada foi percorrida em produção com acesso seguro e uma tarefa temporária exclusivamente fictícia. Não foram alterados Quick Wins corporativos existentes nem permissões.

| Etapa | Evidência | Resultado |
|---|---|---|
| Testar e publicar | Resumo, riscos/decisões e números-chave; conferência completa; versão 3 publicada no escopo anterior da tarefa fictícia | Validado |
| Conferir programação | Hoje às 09:07 de Brasília, texto repetido, limites e destino apresentados antes da ativação | Validado |
| Salvar e ativar | Rotina ativa persistida na lista; programação anterior permaneceu pausada | Validado |
| Disparo automático | Após 09:07, rotina em execução e próxima ocorrência em 10/10/2026; nenhuma ação “Executar agora” usada | Validado |
| Resultado final | Estado concluído, conversa privada com os três entregáveis e conferência de qualidade; dados preservados após recarregar | Validado |
| Encerrar teste | Nova rotina pausada, tarefa arquivada, histórico mantido; consumo registrado de 4,5 créditos | Validado |
| Receber email | Caixa de entrada não disponível para conferência | Não comprovado |

## Defeitos encontrados e correções

1. **Confirmação e gravação duplicadas ao navegar entre biblioteca e detalhe.** Eventos acumulavam no contêiner permanente e podiam redesenhar a biblioteca anterior. Correção vincula a ação aos botões da tela atual e impede cliques durante a execução. PR 39: https://github.com/theneilagencia/GreenIA/pull/39. Produção `0f3bf6e`; arquivamento final confirmado com uma única confirmação, mantendo o detalhe.
2. **Resultado oferecido antes de estar pronto.** Durante o processamento, abrir a conversa mostrava apenas a entrada. O ajuste mostra orientação de espera, mantém resultado indisponível na fila/em processamento e atualiza o estado automaticamente. A execução manual fica indisponível enquanto há trabalho em andamento. Quando concluído, o link do resultado fica disponível.
3. **Ausência de avaliação confundida com ausência de resposta.** “Sem retorno ainda” descrevia a avaliação do usuário. O rótulo passa a “Sem avaliação”.

## Validação da correção

- Navegador: 7 cenários de navegação, recuperação, configuração e agendamento aprovados. O teste de estados usa respostas controladas da API; comprova que o resultado só é oferecido depois da conclusão e aparece pela atualização automática.
- Navegador: 3 cenários de operação, exclusão controlada e celular aprovados.
- Servidor: 17 cenários de jornadas/agendamento aprovados, incluindo persistência, isolamento por responsável, versionamento, limites, aprovação e idempotência.
- O disparo real foi verificado separadamente em produção. A simulação local não foi usada como prova desse disparo.

## Pontos ainda em acompanhamento

- Recebimento do aviso por email; conclusão na plataforma não comprova entrega na caixa de entrada.
- Espera prolongada na interpretação do processo mostrou apenas “Carregando…”. A orientação durante esse processamento precisa ser melhorada.
- Uma navegação durante a troca do serviço falhou com mensagem genérica. Recarregar após a publicação recuperou a tela, autenticação e dados.
- Validação funcional e visual não substitui teste de compreensão com usuários leigos nem certifica conformidade integral de acessibilidade.
