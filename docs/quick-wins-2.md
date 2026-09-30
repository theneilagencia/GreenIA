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
   Em *+ Adicionar regra*, a pessoa escreve regras próprias (até 5, com até 160 caracteres cada), que entram na mesma
   lista e podem ser removidas antes de continuar.
4. **Formato.** Resumo, Lista, Tabela, Relatório ou Outro. O formato sugerido vem com o motivo e é aceito com um clique.
   Na tabela, "O que deve aparecer em cada linha?" mostra as colunas. A pessoa pode adicionar, remover, renomear e
   mudar a ordem (ver "Colunas pedidas no objetivo").
5. **Testar.** Com exemplo automático (sintético), texto colado ou arquivo. O teste roda o Quick Win completo, com a
   conferência de qualidade, e não entra na medição.

A publicação vem depois do teste:
- mostra o nome e a descrição automáticos, usados se a pessoa não mexer;
- mostra o resultado do teste e as regras principais;
- termina no botão *Publicar Quick Win*.

O construtor (`src/quickwin-construtor.js`) é determinístico. A única chamada de IA da criação é a estruturação do
objetivo, descrita abaixo.

## Colunas pedidas no objetivo

"Gere uma tabela com Cliente, Valor e Status." precisa virar as colunas Cliente, Valor e Status do contrato, sem
exemplo e sem ler o texto com regras frágeis.

- **Quem interpreta:** a IA, em `src/quickwin-estrutura.js`, com `POST /api/quick-wins/assistente/estrutura`.
  - Devolve `{"colunas":[{"nome","evidencia"}]}`: só os campos que a pessoa nomeou, cada um com o trecho do objetivo
    de onde veio.
  - Pedido aberto ("os principais pontos") devolve a lista vazia.
- **Quem valida:** o servidor, de forma determinística (`validarColunas`). A evidência precisa existir no objetivo
  e conter o nome do campo, sem diferenciar maiúsculas, acentos e espaços. O que não passa é descartado. Não há uma
  segunda IA.
- **Quando roda:** uma vez por objetivo, ao preparar a etapa Resultado.
  - A estrutura fica guardada com a chave do objetivo (`chaveObjetivo`, um hash).
  - Voltar, avançar, reabrir ou mudar regras não chama de novo.
  - Mudar o objetivo chama uma vez.
- **Governança:** a chamada usa os mecanismos existentes, sem alterar nenhum deles:
  - política de uso;
  - limites e tetos;
  - plano: na reserva, não há chamada;
  - filtro de credenciais e dados: com dado protegido ou Quick Win sigiloso, não há chamada;
  - proteção reforçada da área;
  - roteamento, na classe rápida, se a pessoa tiver acesso;
  - conferência final do recurso;
  - registro da decisão (`roteamento.origem = 'quick_win_estrutura'`), do uso e do evento de créditos, sem conteúdo.
- **Precedência das colunas** (`formato_saida.colunas`, com `origem_colunas`):
  1. definidas pela pessoa (`pessoa`, soberanas);
  2. do exemplo (`exemplo`, como antes);
  3. do objetivo (`objetivo`);
  4. estruturação falhou (`livre`): nenhuma coluna fixa;
  5. nada pedido (`sugestao`): a sugestão do tipo de trabalho, como antes.
- **Objetivo × exemplo em conflito:** o exemplo continua valendo e nada é somado. O conflito fica em
  `origem.conflito_colunas`, para uma decisão posterior.
- **Objetivo mudou depois de a pessoa ajustar as colunas:** o ajuste fica, e a nova estrutura aparece só como
  sugestão ("Usar estas colunas" ou "Manter as minhas").
- **Falha:** "Não conseguimos sugerir a estrutura agora. Você pode defini-la abaixo." A criação não é bloqueada. A
  tabela sem colunas fixas pede ao modelo "as colunas que o objetivo pede" e não cobra nenhuma coluna na conferência.
- **Fonte única:** execução, Quality Check (contrato determinístico e critério da IA), correção e versões leem só
  `formato_saida.colunas`. Nada interpreta o objetivo de novo depois de confirmado.
- **Precedência da configuração confirmada** (`configuracao_confirmada`): o objetivo continua no prompt, porque
  explica o trabalho. Mas a execução e a conferência recebem uma instrução explícita: para estrutura, formato,
  campos, ordem e regras, vale a configuração confirmada, mesmo que o objetivo cite outra coisa. Assim, um campo
  removido ou renomeado não volta na execução, na conferência nem na correção. Especificações sem confirmação
  (antigas) ficam como estavam.
- **Resposta atrasada:** cada estrutura fica guardada com o objetivo que a originou. Uma resposta que chega depois
  de a pessoa trocar o objetivo não vale para o objetivo novo. Uma etapa que a pessoa já deixou não se redesenha,
  não navega e não pega o foco.

## Especificação interna (`quick_wins.especificacao`)

Campos: `objetivo`, `contexto`, `procedimento`, `regras`, `regras_proprias`, `restricoes`, `criterios_decisao`, `formato_saida`
(tipo, colunas, seções, origem das colunas), `exemplos` (só a estrutura), `perguntas_esclarecimento`, `nivel_autonomia`,
`fontes_permitidas`, `ferramentas_permitidas`, `criterios_qualidade`, `dicas_roteamento`, `origem`.

A especificação só é gravada pelo construtor:
- Um corpo JSON não consegue escrever `especificacao` diretamente, porque a chave interna é um `Symbol`.
- `regras` só aceita ids do catálogo. Os ids fora dele são descartados.
- `regras_proprias` guarda as regras escritas pelo responsável como `{id: "propria_N", texto}`. O texto é limpo, sem
  repetidas nem cópias do catálogo, e passa pela recusa de segredos. Cada uma vira uma linha em "Regras" na execução
  e um critério do Quality Check no grupo "Regras respeitadas". Elas nunca ampliam fontes, ferramentas, autonomia ou
  restrições. Ajustar sem mandar a lista mantém as regras atuais. Uma lista vazia remove todas. Especificações
  antigas, sem o campo, valem como lista vazia.
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

- um pedido explícito de execução (`executar_quick_win: true`), que a ação *Executar* da tela envia;
- a resposta a uma pergunta de esclarecimento feita pela própria execução (último registro com estado `pergunta`): a
  execução ainda não terminou, e o Quality Check só roda quando houver um resultado a validar;
- por compatibilidade, a primeira mensagem de uma conversa nova criada a partir do Quick Win (tela de teste e clientes
  da API): é o início daquela execução.

A existência de um Quick Win ou de uma especificação na conversa é contexto, não evidência de execução. A regra é
"primeira mensagem de uma nova conversa do Quick Win = início daquela execução", nunca "conversa com Quick Win = toda
mensagem é execução".

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

## Experiência (telas)

- **Componentes comuns:** `public/qw-ui.js` (cabeçalho, progresso, estado, conferência, avisos, menu, estado vazio) e o
  bloco "Quick Wins" de `public/estilo.css`, só com tokens do tema.
- **Biblioteca** (`#/quick-wins`):
  - listas "Publicados" e "Em preparo", com estado, versão, "Usar" e menu "…";
  - estado vazio de boas-vindas;
  - acompanhamento de uso e arquivados recolhidos.
- **Criar** (`#/qw/nova`) e **Editar** (`#/qw/:id/ajustar`):
  - uma etapa por vez (Objetivo · Processo · Regras · Resultado · Testar), com Voltar e Continuar;
  - o que foi preenchido não se perde;
  - o teste roda na mesma tela, depois vêm Revisar e publicar e a confirmação.
  - Editar um Quick Win publicado prepara a próxima versão; a equipe segue na atual até publicar.
- **Detalhe** (`#/qw/:id`): "Usar" e "Editar", com as seções O que ele faz, Regras, Formato do resultado, Último teste e
  Versão publicada.
- **Usar** (`#/qw/:id/usar`): o que enviar, depois Executar e o resultado na conversa.
- **Conversa:**
  - a execução tem rótulo e progresso (Analisando · Organizando · Conferindo);
  - a conferência aparece logo abaixo do resultado;
  - as mensagens seguintes são conversa normal;
  - "Nova execução" roda o trabalho de novo, com conferência, no próximo envio.
