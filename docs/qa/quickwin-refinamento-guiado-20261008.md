# Refinamento guiado de Quick Wins

Implementação na branch `feat/quickwin-guided-refinement`, a partir de `greenia-lite` (`4aa27532052d0ace6048d8958a3e5cf8aff043c4`).

## Comportamento

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
| Regressões do construtor e API de versões, com os testes de refinamento então presentes | 32/32 aprovados |
| `node --test e2e/quickwin2.test.js` | 8/8 aprovados |
| Sintaxe dos módulos alterados e `git diff --check` | Aprovados |

O navegador validou: aprovação obrigatória por campo, orientação salva sem publicação, botão que permanece no resultado, resultado inconsistente, conferência parcial, criação e edição de versões, restauração, estrutura das colunas, respostas atrasadas, mudança de fontes e uso em celular. O cenário novo validou sugestões de IA, aprovação de objetivo/processo/entregáveis, regra não selecionada intacta, versão publicada e governança intactas, preservação de arquivo, repetição da mesma entrada e comparação antes/depois. Não houve erro JavaScript nesse cenário nem rolagem horizontal.

A suíte geral `npm test` registrou 746 testes aprovados, mas não terminou neste ambiente; foi interrompida após deixar de avançar. Portanto, este relatório não declara aprovação da suíte geral. Os testes específicos e de navegador acima concluíram normalmente. Antes de merge/deploy, completar a suíte geral no ambiente de CI e validar sugestões com o provedor real em homologação.

## Publicação

Sem merge, deploy ou publicação automática de Quick Wins. Nenhuma migração de banco é necessária. Publicar o rascunho continua sendo uma ação separada da pessoa autorizada.
