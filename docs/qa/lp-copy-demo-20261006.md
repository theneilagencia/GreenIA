# LP da GreenIA: copy e demonstração de Quick Win

Revisão de 6 de outubro de 2026. Base de produção: 1404812. Branch: feat/lp-copy-demo.

A LP passa a apresentar os trabalhos da equipe antes da comparação comercial. As cinco entradas incluem exemplos de propostas, documentos, projetos, conhecimento e processos. O acesso à demonstração está no hero. Conhecimento ganha uma seção própria e o formulário distingue os campos opcionais. O CTA solicita demonstração por contato comercial; não sugere agendamento imediato.

A seção de integrações explica consulta, preparação e execução com aprovação quando exigida. A capacidade depende de conexão ativa, ação disponível e permissões. O pedido de conexão é uma solicitação interna para administração; não conecta sistemas automaticamente. O texto do Prumo distingue diagnóstico de configuração e implementação, conforme o escopo contratado.

## Demonstração

O componente usa HTML, CSS e JavaScript locais, sem bibliotecas externas ou chamadas de rede. É uma ilustração de um fluxo possível, não uma execução real de IA ou integração. O rótulo de simulação e a legenda com as condições permanecem visíveis.

O pedido 4502 e a nota 8812 trazem dados fictícios: toner com cinco e quatro unidades; papel com preço unitário de R$ 25,00 e R$ 27,50. As etapas mostram documentos, comparação, consulta simulada ao cadastro e proposta de um registro de divergência, pendente de aprovação de Marina, pessoa fictícia. O exemplo explicita uma ação e um registro como limites. Nenhuma alteração é enviada. A conferência de formato e regras não é apresentada como garantia de correção dos documentos.

A animação dura 24 segundos e para na revisão. O visitante pode pausar, reiniciar e escolher uma etapa. Ela pausa quando o componente sai da tela ou a aba fica oculta. Movimento reduzido desativa a reprodução inicial automática e as transições; as etapas continuam disponíveis manualmente. Conteúdo inicial e resumo permanecem disponíveis sem JavaScript.

## Verificação

78 testes aprovados, com zero falhas: 76 testes de servidor e registro comercial; 2 testes de navegador. Execução com Chromium Headless Shell 141, usando o caminho indicado por CHROMIUM_PATH.

Comando: `node --test test/claims-lp.test.js test/vendas.test.js test/landing-modelo.test.js test/qw-preparacao.test.js test/integracoes-tenants.test.js test/integracoes-motor.test.js test/bases.test.js test/pools-modelos.test.js e2e/lp-demo.test.js`.

Os testes cobrem governança dos textos, contato válido, validação e limitação do formulário, condições de acesso aos documentos, roteamento permitido, controles de integração, aprovação, limites e idempotência. No navegador foram verificados pausa, término finito, reinício, etapas manuais, ausência de chamadas externas ou mutações pela demonstração, redução de movimento, recuperação após erro no contato e envio válido no servidor de teste. Nenhum contato comercial real foi enviado.

As quatro etapas foram verificadas em larguras de 320, 390, 768 e 1280 pixels, sem transbordamento horizontal. Capturas de desktop e celular foram inspecionadas. `git diff --check` passou. O registro de verdade comercial foi atualizado com evidências de produto e condições materiais; as proibições de promessas absolutas foram preservadas. Valores em reais são restritos aos documentos fictícios da demonstração, sem preços de plano.

## Limites da verificação

A alteração é de LP e não configura integrações reais para clientes. A prova dos controles descritos vem da regressão de servidor; o gráfico é uma simulação editorial. A melhoria de compreensão ou conversão ainda exige observação com usuários e dados de uso. A confirmação do deploy e a leitura no navegador de produção são realizadas após o merge.
