# Correções das pendências de QA do GreenIA

O diagnóstico anterior encontrou quatro falhas reproduzíveis. Esta alteração corrige comportamento do produto e acrescenta regressões; não é somente um relatório de testes.

## Correções

| Pendência | Alteração | Evidência |
|---|---|---|
| QA-G01: cabeçalho móvel comprimido | Título e ações em linhas separadas no estilo compartilhado, com quebra por palavra | Inspeção de 83 telas/estados em 1280, 390, 360 e 320 px; teste de largura real do título |
| QA-G02: campos sem identificação | Rótulos visíveis por função e posição nos grupos da página; nomes dos seletores de cor; associação do método da integração; nomes de plano/chave no console | Empresa e console: preenchimento, salvamento, recarga, nomes acessíveis; documentação manual de integração |
| QA-G03: áreas de toque pequenas | Interruptor com caixa real de 48×44 px, trilhas, resumo expansível, material do teste, nova execução e links de resultado/histórico ampliados | Medições no celular e regressões de teclado, confirmação e operação dos painéis |
| QA-G04: entradas malformadas causam 500 | Cookies inválidos descartados; parâmetros/arquivos inválidos recebem 400; origem inválida recebe 400 e origem externa mantém 403; retirada de decodificações duplicadas | Instalação e multiempresa: sessão válida preservada, sessão corrompida recusada, percentuais/UTF-8 inválidos, parâmetros válidos e origem |

A exclusão de uma conversa e o sigilo continuam sujeitos às confirmações e permissões existentes. A área de toque do interruptor é ampliada mantendo o desenho do controle com dimensões discretas. Os editores compartilhados mantêm seus atributos de dados e salvam pelo mesmo caminho anterior.

## Verificação

Os totais finais estão em `pendencias-20261010/validacao.json`. Os testes novos são `test/http-robustez.test.js` e `e2e/qa-pendencias.test.js`. As suítes de painéis, programação, login, isolamento, sigilo, integração e motor visual integram as baterias globais. Provedores de IA, email e serviços externos são simulados nessas baterias.

A inspeção complementar produziu 332 observações, sem falha de abertura, transbordamento, campos sem rótulo ou títulos comprimidos. O resumo público contém somente contagens e dimensões; capturas e textos completos não são publicados. A repetição das quatro telas de conversa, resultado, biblioteca e teste após ampliar os controles não encontrou áreas menores que 32 px no celular na medição automática. Essa medição não substitui avaliação completa de acessibilidade.

Uma execução inicial de serviços estava sem o caminho do Chromium, não terminou com resumo final e foi descartada. A repetição com o navegador configurado aprovou 853 casos antes do último caso adicional de origem HTTP. A rodada final repete todos os casos sobre as correções finais.

Na primeira bateria de navegador houve timeout do teste do menu entre mudanças de tela. Os 13 casos da lateral passaram em repetição independente. O teste agora aguarda o compositor da conversa antes de abrir o menu, em vez de usar a existência da lateral persistente como sinal de prontidão. A rodada final inclui essa sincronização. Os testes novos também passaram após corrigir a aceitação de diálogos locais fictícios e a espera pela resposta de salvamento; essas falhas de roteiro não foram classificadas como correção do produto.

## Limites restantes

Estas evidências são locais, com identidades e registros fictícios. A abertura de `/app` em produção redirecionou ao login; não houve validação autenticada nem alteração em dados produtivos nesta rodada. As correções só podem ser consideradas publicadas após integração, deploy e conferência da versão efetivamente servida.

Não foram executadas sessões com participantes leigos, teste com leitor de tela real, homologação de conectores empresariais contratados, recebimento de email real ou avaliação das respostas de fornecedores reais de IA. Esses aceites continuam pendentes e não recebem garantia automática.

Painel do resultado, histórico confirmado e integração contínua permanecem entregas distintas. Os testes preservam a confirmação humana antes de incorporar resultados ao histórico, a retenção vinculada à conversa e a ausência de confirmação automática pela programação. A integração contínua externa dos indicadores não está implementada como entrega padronizada; depende de escopo e contratação próprios. Sua ausência não é apresentada como teste aprovado.
