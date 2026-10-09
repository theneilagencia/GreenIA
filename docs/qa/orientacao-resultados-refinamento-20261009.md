# Correção do alerta e entrada do refinamento — 09/10/2026

## Falha confirmada

Produção `f45a851`, conversa 67, Quick Win 490: o alerta “Encontramos pontos para revisar” apresentava “Ajustar Quick Win” com destino `#/qw/490/ajustar`. Abriu edição em vez do refinamento guiado. **Crítica:** impede a jornada solicitada e invalida o aceite amplo anterior. O rodapé correto não compensava o botão errado.

A mesma tela apresentava uma consulta de leitura como “Gravações bloqueadas”; motivos extensos e repetidos não forneciam instrução simples; a proteção da pesquisa tinha link sem causa/impacto. **Alta:** induz interpretação errada e não orienta recuperação.

## Correções

| Jornada | Comportamento e próximo passo | Validação |
|---|---|---|
| Alerta → refinamento | Botão principal “Refinar Quick Win” abre conversa e mensagem exatas. Não abre o editor. | Regressão específica de navegador; produção a conferir após deploy. |
| Refinar | Mostra resultado, pontos e material anterior. “Usar estes pontos como orientação” prepara feedback editável; “Preparar ajustes” apresenta proposta; revisão aplica somente ao rascunho; teste compara e publicação permanece separada. | Bateria guiada cobre aplicar, repetir arquivo e comparar; falha 503 conserva texto e versão publicada. |
| Melhorar uma resposta | “Preparar pedido de melhoria” preenche mensagem baseada no diagnóstico, sem enviar ou executar automaticamente. | Contagem de mensagens não muda; entrada focada. |
| Resultado limitado | Explica acontecimento, impacto e o que fazer. Mostra link apenas com permissão; sem ela abre formulário existente de solicitação, sem envio automático. | Pesquisa liberada/bloqueada, administrador/usuário comum; cancelamento não perde conversa. |
| Integrações | Consulta e alteração são diferenciadas. Falha/parcial exige conferir efeitos antes de repetir; aprovações continuam obrigatórias. | Integração/segurança/tenants e navegador. |
| Contexto editorial | “na Fase Zero” e “na internet” não viram sistemas externos. “no sistema Fase Zero” continua explícito. Declarações já publicadas não são apagadas nem modificadas silenciosamente. | Generalização e casos negativos. |

## Resultados técnicos

- Serviços: **57/57** em qualidade, refinamento, integração, segurança e isolamento.
- Complemento de interpretação: **14/14** (inclui três testes também presentes nos 57; não somar como testes distintos).
- Navegador: **18/18**, incluindo fontes/permissões, oito jornadas guiadas, cinco integrações e a entrada específica pelo alerta.
- Repetição final da regressão após tornar o refinamento a ação principal: **1/1 aprovado**, sem erros de página.
- Larguras 1280, 390 e 320: sem rolagem horizontal na regressão específica. Inspeção de captura local feita; a captura focada após preenchimento comprova entrada/foco, não toda a composição do alerta.

## Critérios de aceite

1. O botão do alerta abre `/refinar/<conversa>/<mensagem>`, nunca `/ajustar`.
2. O caso exato, diagnóstico e material autorizado estão disponíveis sem preenchimento repetido.
3. Preparar orientação/pedido não envia mensagem, publica ou executa ação externa.
4. Falha de proposta conserva orientação e permite tentar novamente.
5. Mudanças de proposta atingem rascunho; versão publicada exige decisão posterior.
6. Consulta bloqueada nunca é descrita como gravação impedida pela qualidade.
7. Limitação informa causa, impacto e ação; link respeita permissão; solicitação não é enviada automaticamente.
8. Nenhum caminho ignora aprovação, sigilo, limite ou isolamento.

## Limites e pendências

Produção ainda não certificada neste commit. Depois do deploy, repetir o botão do alerta real e verificar orientação/proposta; registrar versão e efeito observado. Não alterar nem publicar o Quick Win real apenas para provar o teste.

A bateria técnica não comprova compreensão por usuários leigos. Recebimento de email, integrações externas de negócio e todos os 24 itens da auditoria continuam sujeitos aos limites do controle de pedidos. Este relatório não declara auditoria completa encerrada.
