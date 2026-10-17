# Política Advanced — implementação e evidências

Revisão: 17/10/2026. A homologação funcional com provedores pagos e a inspeção de entregas reais em produção ainda estão pendentes. Não considerar a qualidade das entregas homologada com base nos testes de protocolo.

## Curadoria oficial

Consulta real de `https://openrouter.ai/api/v1/models` e `/models/{id}/endpoints`, em 17/10/2026. Registro reproduzível em `src/advanced-catalogo.json`, incluindo instante, fonte, capacidades publicadas, limites, preços e slugs das rotas. Inclusão não aprova tratamento de dados.

| Modelo | Contexto publicado | Saída máxima publicada | Fundamentação da seleção |
| --- | ---: | ---: | --- |
| anthropic/claude-opus-5.5 | 1.000.000 | 128.000 | Flagship para raciocínio, código e trabalho em várias etapas |
| openai/gpt-5.6-sol | 1.050.000 | 128.000 | Flagship Sol para raciocínio complexo e execução de código em várias etapas |
| anthropic/claude-sonnet-5.5 | 1.000.000 | 128.000 | Código, correções e produção estruturada; opção de menor custo para tarefas adequadas |
| google/gemini-3.1-pro-preview | 1.048.576 | 65.536 | Raciocínio de fronteira, materiais multimodais e contexto longo; preview exige acompanhamento |

As descrições oficiais fundamentam a curadoria; não são uma avaliação comparativa independente. Preço não serve como nota de capacidade. A rota pode ter limites menores que os do modelo: a execução usa a interseção. Novos modelos continuam cadastráveis no Catálogo técnico. Cada um exige revisão individual de capacidade e segurança.

Fontes oficiais: páginas de cada modelo em `https://openrouter.ai/{id}`; documentação de seleção de provedores em `https://openrouter.ai/docs/guides/routing/provider-selection`; pesquisa em `https://openrouter.ai/docs/guides/features/plugins/web-search`.

## Operação administrativa

Em **Modelos → Níveis e acesso → Advanced**:

1. Consultar catálogo oficial e confirmar a disponibilidade. Catálogo com mais de 48 horas bloqueia a execução Advanced até nova consulta. A rotina diária existente também o atualiza. Ausência do catálogo retira elegibilidade; falha de rede não concede segurança.
2. No Catálogo técnico, liberar os modelos pretendidos. No painel Advanced, aprovar slugs de rotas efetivamente presentes no catálogo e justificar capacidade e tratamento dos dados. Homologação de sigilo e vetos da plataforma continuam independentes.
3. Definir teto mensal da empresa em USD. O padrão zero mantém Advanced fechado financeiramente, sem orçamento implícito.
4. Autorizar pessoa, grupo ou perfil, modelos, provedores, orçamento total e por chamada, limite de saída, validade e, opcionalmente, conversa específica. Administradores também precisam de autorização para executar. A antiga seleção de acesso por nível não concede a autorização nova.
5. Aprovar ou recusar solicitações com registro. A aprovação aplica os parâmetros preenchidos e restringe o acesso à conversa solicitada; o conteúdo da conversa e dos anexos não aparece na solicitação administrativa. A execução não começa na aprovação.

Pesquisa Exa requer autorização adicional na concessão, política geral de pesquisa ligada e ausência de sigilo. Reserva também a taxa publicada de USD 0,007 por consulta e o limite integral de entrada do modelo para acomodar resultados, sem presumir seu tamanho. Os outros controles existentes de execução, publicação, integrações e geração de imagens continuam valendo. Autorizar um modelo não instala ferramentas. Modelos Advanced de texto não podem ser invocados pelo caminho de geração de imagens.

## Execução e privacidade

- Análise de complexidade define capacidade mínima. Ajustes pontuais preservam a lógica anterior de custo/contexto; reformulações e novas tentativas conservam o piso relevante. O roteador escolhe o menor custo entre candidatos adequados e autorizados. Não aceita candidato insuficiente para acomodar orçamento, escolha manual ou indisponibilidade.
- Sem acesso: pedido privado preservado com anexos e contexto da conversa; botão de solicitar; estado persistente. Com aprovação: botão de retomar; nova validação de acesso, catálogo, segurança, contexto e orçamento.
- Quando a análise confirma uma alternativa autorizada, oferece síntese preliminar de até 600 palavras, sem arquivos finais, reformulação visual ou análise aprofundada. O usuário precisa escolher expressamente. O pedido integral permanece separado e pendente. Não se oferece esta alternativa automaticamente a operações de Quick Win.
- A política de não armazenamento impede guardar material proibido para retomada: o usuário recebe orientação de obter acesso antes e reenviar. Exclusão e retenção da conversa eliminam o pedido e seus anexos pendentes. Auditoria guarda identificadores, decisões, limites e consumo; não guarda texto ou anexos.
- A última barreira envolve todas as chamadas de IA e auxiliares pelo contabilizador: autorização atual por pessoa e modelo, escopo, validade, aprovação da rota, veto, catálogo e orçamento. O roteador externo `openrouter/auto` fica impedido porque não garante o controle de acesso Advanced.
- Provedor fixado com `only`, sem fallback oculto; `data_collection=deny`, `require_parameters=true`, ZDR para sigilo, `max_tokens` e teto de preço. Cache explícito é retirado dessas chamadas para não gerar custos de escrita não reservados. O fallback explícito do servidor continua sujeito às mesmas verificações; nunca é inferior ao requisito.
- Reserva transacional por chamada inclui concorrência e todos os estágios. Limites gerais de empresa e pessoa continuam aplicados. Reservas sem custo confirmado permanecem comprometidas; custos recuperáveis usam a identificação da geração. Nenhum gasto pago começa em aprovar/retomar a preparação do pedido: só ao enviar explicitamente a execução.
- Resposta encerrada por limite de tokens é incompleta e não validada. As verificações existentes de geração, persistência e download dos arquivos permanecem no fluxo; esta mudança não substitui inspeção real de conteúdo e aparência.

## Evidências executadas

`node --test test/advanced.test.js test/custo-ia.test.js test/seguranca.test.js test/editar-pedido.test.js test/cancelamento-chat.test.js`

20 aprovados, zero falhas, um teste de leitor PDF pulado por condição de ambiente. Cobertura: aprovação/recusa HTTP, isolamento, contexto preservado, ausência de execução automática, modelo e rota efetivamente enviados ao servidor de protocolo, revogação, expiração, escopo, teto geral, reserva concorrente, catálogo vencido, aprovação de segurança, chamadas auxiliares, alternativa com consentimento e exclusão da conversa após consumo.

`CHROMIUM_PATH=/tmp/greenia-chromium node --test e2e/advanced.test.js e2e/modelos-admin.test.js`

Quatro aprovados. Chromium real, UI e servidor reais: solicitar, aprovar no painel, notificar pelo estado persistido e retomar por clique. Sem execução antes desse clique. O provedor nesses testes é HTTP local com protocolo OpenRouter simulado, não inferência real.

Não se declara a suíte inteira aprovada: os dois casos de sigilo que presumiam escalada Advanced sem concessão e redução automática pela reserva foram atualizados para verificar os novos bloqueios. As demais matrizes históricas ainda exigem revisão de fixtures de autorização. A execução combinada de verificações gráficas antigas também não produziu encerramento utilizável neste ambiente. As evidências acima são específicas dos comandos concluídos.

## Pendências de homologação

Não há chave OpenRouter local. A sessão de produção disponível permanece na tela de login. Assim, não foi possível executar uma entrega paga por modelo autorizado, baixar seus arquivos, inspecionar integridade/conteúdo/apresentação e demonstrar custo real conciliado em produção. Também falta avaliar a qualidade comparativa por tarefa e testar falhas reais de provedores. Essas pendências impedem afirmar que todos os critérios de conclusão foram cumpridos.
