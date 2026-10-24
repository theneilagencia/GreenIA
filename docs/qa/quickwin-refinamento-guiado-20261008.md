# Refinamento guiado de Quick Wins

Implementação na branch `feat/quickwin-guided-refinement`, a partir de `greenia-lite`, incorporando a atualização de acesso ao refinamento até `e2c3cd805d4afb556e7e1bae33cf90a23af9515c`.

## Comportamento

Os pontos de entrada no detalhe e na conversa foram preservados. Quando o editor é reaberto sem um resultado em memória, o botão **Testar para refinar** permite executar um teste atual sem voltar à etapa inicial.

O botão **Refinar Quick Win** abre o refinamento na própria tela do resultado. Não navega para a primeira etapa do editor. A pessoa descreve o problema; a GreenIA analisa a configuração, o resultado guardado, o material do teste e a conferência e sugere textos para objetivo, processo, regras ou descrição dos entregáveis. Cada sugestão mostra o valor atual, o valor proposto e a justificativa. Nenhuma caixa começa selecionada. A pessoa pode editar a proposta e aprovar somente os campos desejados.

A aprovação salva apenas o rascunho e invalida sua conferência anterior. A versão publicada e seu histórico permanecem intactos. O plano confirmado conserva ferramentas, canais, tipos de entregáveis e controles. Uma regra adicional preserva todas as regras atuais e respeita o limite existente de cinco regras próprias. A orientação dos entregáveis também participa da execução e da conferência, sem mudar o formato por conta própria.

O teste anterior aparece na comparação; o botão **Executar novamente o mesmo teste** reutiliza o texto ou arquivo original, inclusive o exemplo pronto. A comparação mostra conteúdo e conferência antes e depois. Mudança manual do material é identificada na comparação. Testes desta sessão têm links para suas conversas. A comparação e o arquivo original permanecem em memória durante a sessão do editor; o histórico das conversas segue a política de retenção existente. Não se cria armazenamento adicional de conteúdo protegido.

## Segurança

- A API exige autorização para gerir o Quick Win e uma conversa de teste pertencente à própria pessoa e ao mesmo Quick Win, no banco da empresa atual. Nem um administrador recebe acesso ao teste de outra pessoa.
- A análise usa `chamarGovernado`: política, ciência, sigilo, filtros, modelos autorizados, limites, créditos, registro de uso e prazo da chamada.
- Sigilo, conteúdo não guardado, bloqueios, reserva, falha ou resposta inválida impedem a análise automática. Nesse caso, a interface identifica claramente que as opções apenas organizam a orientação da pessoa.
- Só quatro campos textuais são aceitos nas propostas. Credenciais e propostas fora dos limites são descartadas. A resposta da IA não pode alterar permissões, fontes, ferramentas ou publicar.
- O rascunho e as fontes têm uma assinatura. Mudanças anteriores à proposta ou posteriores a ela impedem sua aprovação. Uma resposta atrasada não é aplicada a outro editor ou feedback.
- A auditoria da proposta registra identificadores, origem e nomes de campos, sem o conteúdo do teste ou feedback.

## QA concluído

Ambiente local isolado, dados sintéticos, Chromium Headless Shell e provedor de IA simulado. Nenhum dado ou Quick Win de produção foi alterado.

| Verificação | Resultado |
| --- | --- |
| `node --test test/quickwin-refinamento.test.js` | 9/9 aprovados |
| Regressões do construtor e API de versões, incluindo os testes de refinamento | 33/33 aprovados |
| `node --test e2e/quickwin2.test.js` | 8/8 aprovados |
| Suíte geral `node --test --test-concurrency=1 test/*.test.js` | 796/796 aprovados |
| Suíte completa de navegador `node --test --test-concurrency=1 e2e/*.test.js` | 110/110 aprovados |
| Sintaxe dos módulos alterados e `git diff --check` | Aprovados |

O navegador validou: aprovação obrigatória por campo, orientação salva sem publicação, botão que permanece no resultado, resultado inconsistente, conferência parcial, criação e edição de versões, restauração, estrutura das colunas, respostas atrasadas, mudança de fontes e uso em celular. O cenário novo validou sugestões de IA, aprovação de objetivo/processo/entregáveis, regra não selecionada intacta, versão publicada e governança intactas, preservação de arquivo, repetição da mesma entrada e comparação antes/depois. Não houve erro JavaScript nesse cenário nem rolagem horizontal.

A suíte geral concluiu com **796/796 testes aprovados**, sem falhas, cancelamentos ou testes ignorados, usando `CHROMIUM_PATH` para o Chromium Headless Shell e `--test-concurrency=1`. A tentativa anterior que não concluiu não é usada como evidência de aprovação. A execução atual levou 365 segundos e inclui as regressões de OCR, retenção, governança, versões e renderização real.

## Publicação

A implantação do código em produção foi autorizada pelo usuário em 08/10/2026. O estado do merge, do deploy e do QA com o provedor real é registrado no PR #31. Nenhuma migração de banco é necessária. Publicar o rascunho de um Quick Win continua sendo uma ação separada da pessoa autorizada.

Destino confirmado: serviço Render `greenia`, `srv-darrnsfavr4c73fu4m9g`, workspace `tea-d4d77godl3ps73bsu3l0`, branch `greenia-lite`. O merge dispara o deploy automático, sem disparo manual duplicado. A versão de referência para reversão é `e2c3cd805d4afb556e7e1bae33cf90a23af9515c`, deploy `dep-db41cuuq1p3s73dalh6g`. Os logs confirmam o backup diário concluído em 08/10/2026 às 06:00 UTC; este trabalho não afirma ter criado um backup adicional. Se o QA reprovar, reverter somente os arquivos da implementação, preservando alterações concorrentes, e acompanhar o novo deploy. Não há restauração automática de bancos.

O QA de produção utiliza um Quick Win novo com fornecedores fictícios, sem publicar o rascunho nem modificar Quick Wins preexistentes. A entrada fixa contém Alfa (R$ 100, 10 dias) e Beta (R$ 80, prazo não informado). O controle anterior ao deploy foi executado com IA real e aprovado pela conferência.


## QA funcional com IA real

Na versão `d22f608`, o acesso pelo detalhe abriu o refinamento sem voltar ao objetivo. Um teste atual é exigido quando o resultado não está na sessão. As sugestões reais consideraram o feedback e o prazo ausente do Beta. Aprovar sem selecionar campo foi recusado. Apenas a regra selecionada foi aprovada no Quick Win de QA, ainda não publicado. A repetição usou o mesmo texto e passou pela conferência. A comparação preservou o teste anterior (conversa 47) e apresentou o posterior (conversa 48), agora com recomendação de menor preço e ressalva do prazo ausente. Nenhum Quick Win preexistente foi modificado.

O QA detectou um aviso falso de edição pendente após a aprovação, causado pelo listener genérico de clique marcar edição depois de a gravação começar. O ajuste isola os controles de refinamento desse listener: feedback e seleção de proposta não editam o rascunho; a aprovação continua marcando e salvando os campos aprovados. A regressão de navegador verifica o aviso de rascunho salvo após a aprovação. O resultado da validação e do deploy desse ajuste é registrado no PR correspondente.
