# QA aprofundado: resultado, histórico e integração contínua

Data: 10/10/2026. Código funcional auditado: `d795447b0d04ca8a82100ea9dd6dbeda8d414507`, produção `greenia-lite`. Foram acrescentados nove testes de serviços e três de navegador, sem alterar o código do produto.

**Resultado:** os comportamentos automatizados de preparação e histórico passaram. A integração contínua de sistemas externos com os indicadores não está implementada como entrega padronizada nesta versão e não recebe homologação. Conectores, webhooks e tarefas programadas existentes foram avaliados como infraestrutura distinta. O [QA global](qa-global-greenia-20261010.md) registra as falhas e os limites de aceite.

## Evidência executada

As suítes aprofundadas `test/paineis.test.js` e `test/qw-programacao.test.js` passaram com **44/44** casos em Node 22.23.3. A suíte `e2e/paineis.test.js` passou com **7/7**, Chromium, Node 22.23.3. A repetição global passou com **849/849 serviços em Node 24.19.0 e 132/132 navegador em Node 22.23.3**. Foi trocada uma identidade fictícia de operador por um domínio reservado de teste, com repetição das suítes afetadas. Os totais incluem os casos preexistentes e os novos; não devem ser somados novamente ao total global. As chamadas de IA, email e serviços externos dessas suítes usam simulações locais. Nenhum registro empresarial de produção foi criado ou excluído.

## Painel de um resultado

| Cenário | Verificação e evidência | Conclusão |
|---|---|---|
| Escolher processo pronto | Catálogo fechado, campos definidos, criação em preparo e publicação após teste; serviços e navegador | Aprovado no ambiente de teste |
| Sugestão não é confirmação | Rascunho não compõe indicadores; confirmação humana e ciência do resultado parcial obrigatórias | Aprovado |
| Pergunta, inconsistência ou resultado não guardado | Preparação recusada; execução de teste não entra no histórico | Aprovado |
| IA indisponível ou sigilo | Caminho manual; sem chamada adicional sob sigilo; sem publicação automática | Aprovado |
| Duas preparações simultâneas | Um registro e uma extração contabilizada para a mesma mensagem | Aprovado |
| Excluir origem enquanto IA processa | Novo teste com barreira determinística: retorno 404, nenhum órfão e mapa de preparação liberado | Aprovado |
| Política muda durante IA | Novo teste: bloqueio de CPF antes da persistência, nenhum registro e liberação da preparação | Aprovado |
| Calendário de ações | Novo teste: rejeita 29/02 não bissexto, 31/04, formato brasileiro e estado de outro modelo; aceita 29/02 bissexto e prazo opcional vazio | Aprovado |
| Acrescentar/remover item em 320 px | Novo teste: foco no campo novo, primeiro item preservado, escopo privado e confirmação desmarcada, sem transbordamento | Aprovado |
| Falha temporária ao confirmar | Teste de navegador com HTTP 503 mantém dados e permite nova tentativa | Aprovado |
| Duas abas corrigem o mesmo registro | Novo teste com alteração real no servidor: 409, mensagem orienta reabrir, formulário preservado, outra correção não sobrescrita | Aprovado |
| Limites e evidência literal | Validação de campos, estados, quantidade e extração governada existentes | Aprovado para os casos executados; evidência literal não prova veracidade de negócio |

## Histórico consolidado

| Cenário | Verificação e evidência | Conclusão |
|---|---|---|
| Indicadores contam itens e execuções separadamente | Novo teste: dois resultados, três documentos, dois pendentes e um conferido | Aprovado |
| Correção concorrente | Novo teste: uma resposta 200 e outra 409, uma atualização, versão 3 e duas revisões | Aprovado |
| Correção mensal | Mês da primeira confirmação em Brasília; correção altera situação no mesmo mês | Aprovado; não é fotografia histórica |
| Repetir preparação da mesma mensagem | Não duplica registro; repetir confirmação antiga não altera o histórico | Aprovado |
| Mesmo caso em outra conversa | Novo teste confirma contagem novamente; não existe chave de deduplicação de caso empresarial | Limite funcional declarado na ajuda |
| Busca e paginação | Todos os indicadores mantidos entre páginas; novo teste de navegador confirma que busca local esconde linhas sem alterar totais | Aprovado; busca somente na página atual |
| Privacidade e equipe | Privado por padrão; compartilhamento explícito; terceiros não recebem IDs nem texto da conversa | Aprovado |
| Sigilo alterado após compartilhamento | Novo teste no Quick Win recolhe visibilidade da equipe sem apagar registro do proprietário; caso de sigilo da conversa também existente | Aprovado |
| Consulta repetida | Novo teste: 12 leituras simultâneas não modificam custos, versões ou dados | Aprovado |
| Retirada com motivo | Recalcula indicadores; não permite reconfirmar registro cancelado | Aprovado |
| Apagar conversa | Registros e revisões removidos por cascata | Aprovado |
| Expiração real por retenção | Novo teste chama `apagarVencidas`: remove origem, registro e revisões; indicadores de proprietário/equipe zerados e detalhe retorna 404 | Aprovado |
| Isolamento entre empresas e consulta sem escrita | Testes específicos existentes de tenant e de bloqueio de gravação | Aprovado nos cenários executados |

O histórico acompanha a retenção da conversa de origem, hoje configurável por empresa. Não é um arquivo empresarial independente de longo prazo. Os números mensais refletem o estado atual dos registros agrupados pela primeira confirmação; não permitem reconstruir automaticamente o estado de um mês passado.

## Integração contínua

| Camada | Verificação | Situação |
|---|---|---|
| Execução programada com painel configurado | Novo teste produz conversa e resposta sem criar ou confirmar registro; segunda rodada não duplica execução | Aprovado para essa fronteira |
| Comunicação da entrega adicional | Novo teste de navegador abre “O que este acompanhamento inclui” e verifica explicação da contratação adicional | Aprovado para presença e acesso ao texto |
| Publicação de conector | Suíte `integracoes-motor`: teste e aprovação da mesma versão; alteração invalida autorização | Coberto pela bateria global |
| Escrita externa e idempotência | Suíte de motor: aprovação da entrada, execução idempotente, negativa de operação destrutiva | Coberto pela bateria global, com serviço simulado |
| Timeout, 503 e esquema inválido | Repetição apenas quando segura; falha não passa silenciosamente | Coberto pela bateria global, com serviço simulado |
| Segredos e isolamento | Suítes de segurança/tenants: SSRF, redirects, redação, autorização e isolamento | Coberto pela bateria global |
| Webhooks | Assinatura, janela temporal, replay e rotação; programação tem recuperação e bloqueios de responsável/versão | Coberto pela bateria global |
| Sistemas externos → registros de negócio → atualização permanente dos indicadores | Não há fluxo padronizado ligando esses mecanismos às tabelas do painel; programação não substitui confirmação humana | Não implementado; não homologado |
| Disponibilidade e manutenção de provedores reais | Sem conector empresarial real autorizado nesta auditoria, sem amostra de carga ou duração suficiente | Pendente para a contratação específica |

Para uma futura entrega de integração contínua, o aceite precisa executar com o sistema contratado: identidade estável do caso; repetição do mesmo evento; evento fora de ordem; atualização e exclusão; reconciliação após indisponibilidade; expiração/rotação/revogação de credenciais; recuperação após reinício; volume acordado; alerta legível de dados desatualizados; monitoramento e responsável pela manutenção. Esses cenários são pendências de uma entrega futura, não funcionalidades aprovadas deste produto.

## UX/UI para leigos e limites de aceite

As verificações de navegador incluem larguras de 320, 390, 768 e 1280 px; nomes acessíveis dos campos do painel; foco ao adicionar item; erro recuperável; escopo privado; revisão, retirada, busca e recarga. A presença de textos explicativos foi testada, mas a compreensão por pessoas não nativas digitais ainda requer sessões com participantes reais.

Pontos a verificar nessas sessões: distinguir resultado parcial de registro confirmado; entender quem verá o registro; entender que o mesmo caso em outra conversa pode contar novamente; interpretar busca da página sem confundir com totais; entender a perda do histórico ao apagar/expirar origem; distinguir contagem mensal de fotografia histórica; reconhecer que integração contínua exige outra contratação.

A inspeção global encontrou links de revisão/histórico com altura de 17 px, botões pequenos em outras jornadas e cabeçalhos móveis comprimidos fora das telas específicas de painel. Portanto, não há aceite integral de usabilidade do GreenIA. Não foi medida conformidade WCAG completa, uso com leitor de tela real, carga prolongada ou qualidade de extrações por provedores de IA reais.
