# Quick Wins 2.0

Um Quick Win deixa de ser um prompt salvo e vira a especificação de um trabalho. A pessoa descreve o que quer com as
próprias palavras. A GreenIA monta o resto: especificação, prompt de execução, conferência de qualidade e contrato de
saída. Quem usa nunca vê prompt, modelo, fornecedor, tokens, temperatura ou JSON.

## Criação (até 5 etapas, uma página, uma pergunta por vez)

1. **O que você quer que a IA faça?** Campo livre e sugestões clicáveis. O tipo de trabalho é inferido pela descrição.
2. **Como você normalmente faz isso?** Três opções, nenhuma obrigatória:
   - *Explicar*: o passo a passo vira o procedimento.
   - *Mostrar*: de um exemplo, só a estrutura é extraída (colunas, seções, detalhe e tom). O exemplo não é guardado.
   - *Começar pronto*: usa a estrutura sugerida.
3. **Regras importantes.** Poucas, sugeridas pelo tipo de trabalho. *Não inventar informações* fica sempre ligada.
4. **Formato.** Resumo, Lista, Tabela, Relatório ou Outro. O formato sugerido vem com o motivo e é aceito com um clique.
5. **Testar.** Com exemplo automático (sintético), texto colado ou arquivo. O teste roda o Quick Win completo, com a
   conferência de qualidade, e não entra na medição.

A publicação vem depois do teste:
- mostra o nome e a descrição automáticos, usados se a pessoa não mexer;
- mostra o resultado do teste e as regras principais;
- termina no botão *Publicar Quick Win*.

Criar não chama a IA e não gasta créditos. O construtor (`src/quickwin-construtor.js`) é determinístico.

## Especificação interna (`quick_wins.especificacao`)

Campos: `objetivo`, `contexto`, `procedimento`, `regras`, `restricoes`, `criterios_decisao`, `formato_saida`
(tipo, colunas, seções), `exemplos` (só a estrutura), `perguntas_esclarecimento`, `nivel_autonomia`,
`fontes_permitidas`, `ferramentas_permitidas`, `criterios_qualidade`, `dicas_roteamento`, `origem`.

A especificação só é gravada pelo construtor:
- Um corpo JSON não consegue escrever `especificacao` diretamente, porque a chave interna é um `Symbol`.
- Regras fora do catálogo são descartadas.
- `ferramentas_permitidas` é sempre vazio.
- A autonomia é limitada a: apenas analisar, sugerir ou preparar para executar. Nunca há ação externa.

## Execução

O pipeline é: entrada → governança → contexto autorizado → execução → Quality Check → resposta.

Tudo passa pelo mesmo caminho governado de antes (`enviarMensagem`):
- filtro de dados e credenciais;
- contexto autorizado;
- sigilo e área reforçada;
- análise do pedido e roteador;
- conferência final;
- defesa final de credenciais;
- retenção, créditos, reserva e fallback.

O Quick Win entra só no texto das instruções, com o prompt gerado da especificação. A classe sugerida é apenas uma
dica: o Quick Win deixa trocar e o roteamento automático decide.

## Ciclo de vida: execução × conversa

O Quality Check valida uma **execução** do Quick Win, não a conversa inteira. É execução (definido pelo estado da
conversa, nunca pelo texto da mensagem):

- a primeira mensagem de uma conversa do Quick Win;
- um pedido explícito de nova execução (`executar_quick_win: true`), que a ação *Executar* da tela envia;
- a resposta a uma pergunta de esclarecimento feita pela própria execução (último registro com estado `pergunta`).

As demais mensagens (ajustar, perguntar, resumir, transformar o resultado) são conversa normal:
- vão pelo mesmo fluxo de governança, com streaming;
- não passam pelo Quality Check nem pela correção;
- não recebem o contrato de saída.

O modelo continua sabendo qual foi o trabalho, com o objetivo, o histórico e o contexto autorizado, e a regra de não
inventar.

## Quality Check

- **Conferência determinística do contrato:**
  - formato, colunas e seções;
  - seção de informações não encontradas;
  - números do resultado que não aparecem na entrada (só como indício para a IA).
- **Conferência pela IA:** critérios gerados da especificação, com resposta só em JSON. Usa o mesmo recurso e a mesma
  rota da execução: mesmo sigilo, fornecedor fixo e preferência de não treino. A defesa final de credenciais vale
  também nessas chamadas.
- **Falha:** uma correção automática e uma nova conferência (`MAX_CORRECOES = 1`), ou seja, no máximo 4 chamadas.
- **Reserva do plano:** só a conferência determinística, sem chamadas extras.
- **O que a pessoa vê:** "Teste concluído ✓ / Regras respeitadas ✓ / Resultado completo ✓ / Formato correto ✓ /
  Nenhuma informação inventada detectada ✓".
- **Falha final:** "O GreenIA encontrou uma inconsistência no resultado. [Ver o que aconteceu] [Ajustar Quick Win]".
- **Sem conferência da IA:** o estado é `parcial`, nunca aprovado. A tela mostra "Conferência incompleta", sem ✓ nem
  linguagem de aprovação.
- **Pergunta de esclarecimento:** no máximo 2 perguntas, numa mensagem só. Não passa pela conferência.
- **Registro sem conteúdo:** `roteamento.qualidade` guarda estado, falhas, tentativas e itens conferidos. O evento
  `quickwin.quality_checked` registra o mesmo. O custo das chamadas é somado em `uso` e `roteamento`.

## Versões (`quick_win_versoes`)

- *Publicar* grava o rascunho como v1, v2… e aponta `quick_wins.versao_publicada`.
- Quem usa recebe a versão publicada. O teste de quem gere usa o rascunho.
- *Restaurar versão anterior* torna a versão escolhida a atual e também o rascunho.
- Só o trabalho é versionado: especificação, nome, descrição e formato. Áreas, regras de dados, sigilo e bases valem
  sempre na versão atual, porque são governança.

## Compatibilidade

- Quick Wins sem especificação continuam exatamente no fluxo anterior: instruções, formato e exemplos.
- O formulário antigo continua disponível para quem gere, para acesso, dados e ciclo. Num Quick Win 2.0, ele esconde as
  instruções e a classe de modelo.
- A migração 12 é idempotente e só acrescenta: duas colunas em `quick_wins`, `roteamento.qualidade` e a tabela de
  versões pelo esquema.
