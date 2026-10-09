# Controle de pedidos da GreenIA — 09/10/2026

Este controle reúne os pedidos presentes na conversa e os registros de QA do repositório. Repetições de “avance”, “continue” e “siga” representam autorização para executar o mesmo escopo; não foram tratadas como novos recursos. O pedido sobre leads do LinkedIn está **excluído**, conforme instrução explícita.

Um pedido só pode ser encerrado com: implementação identificável, cenário de aceite aprovado, versão realmente servida em produção e evidência do efeito correspondente. “Código pronto”, “teste local aprovado” e “produção validada” são estados diferentes. Pendências de validação humana ou de acesso continuam explícitas.

A consulta complementar ao histórico de conversas retornou erro nesta rodada. Não é possível afirmar que foram recuperados pedidos ausentes tanto da conversa disponível quanto do repositório. Datas originais não disponíveis não foram inventadas. O pedido de nome está registrado como **anterior**, reafirmado em 09/10; não como funcionalidade recém-solicitada.

| ID | Pedido / fonte | Aceite que encerra o item | Código / teste | Implementação | Produção |
|---|---|---|---|---|---|
| RQ-01 | “Refinar Quick Win” para leigos | Explicar problema em palavras comuns; ajuste com contexto e comparação, sem voltar ao editor inicial | `quickwin2.js`, refinamento API; `quickwin2`, `quickwin-refinamento` | Implementado | Base publicada; contexto e resultado próprios revalidados no QA |
| RQ-02 | Aproveitar teste e problemas anteriores | Recuperar somente resultado autorizado, diagnóstico e material disponível; retenção impede recuperação indevida | Contexto de refinamento/API, testes de isolamento | Implementado | Base publicada; testes reais anteriores documentados; não confundir contexto indisponível com falha |
| RQ-03 | “Agendar ... simples e direto” | Partir do trabalho escolhido, identificar material/horário/fuso/destino, conferir e ativar | `qw-programacao.js`; `qw-programacao` E2E/API | Implementado | Disparo real às 09:07 de Brasília e resultado persistente documentados |
| RQ-04 | “A programação ... continua sem funcionar” | Salvar, ativar, persistir após fechar navegador e executar pelo relógio real | Worker/DB/idempotência; teste de ativação com falha | Implementado | Validado em produção com tarefa fictícia; rotina pausada ao terminar |
| RQ-05 | “Esta tela ... induz ao erro” | Não oferecer resultado vazio como pronto; indicar execução em andamento e depois conclusão | Estados da lista/atualização; teste automático | Implementado | Base `03e10d8` publicada; atualização com preservação de leitura nesta rodada |
| RQ-06 | Nome de Quick Win — pedido anterior, reafirmado em 09/10 | Definir no início ou editar diretamente; persistir para a equipe; cancelar/erro recuperáveis | `quickwin2.js`, `quickwin.js`, validação nome; `quickwin-nome` | Implementado; E2E e regressão afetada aprovados | **Validado em `aff718c`: definir, cancelar, editar, salvar e recarregar; descrição usa o objetivo** |
| RQ-07 | Interface com poucos passos e pouca interpretação | Ação principal clara; próximos passos orientados; contexto conhecido não é novamente exigido | Assistente, biblioteca, ajuda, preparação | Implementado nos fluxos auditados | Base publicada; compreensão sem ajuda externa ainda exige participantes |
| RQ-08 | Segurança, sigilo e governança preservados | API impede acesso indevido; políticas, ciência, filtros e isolamento mantidos | Testes de segurança/governança/tenants | Implementado | Controles publicados; casos negativos em empresas isoladas |
| RQ-09 | Aprovações e rastreabilidade preservadas | Escrita externa só após aprovação válida; auditoria sem conteúdo protegido | Motor de integração/pendências/eventos | Implementado | Base publicada; integrações reais além das disponíveis dependem de verificação |
| RQ-10 | Custos e limites preservados | Consumo do período consistente; limites e créditos respeitados; bloqueio orienta resolução | Uso/consumo/schedule/modelos; testes de limites | Implementado | Base publicada; consulta de gestão realizada sem mudar valores |
| RQ-11 | Navegação e primeiro acesso | Trabalho/gestão distinguíveis; histórico não oculta destinos; guia sem aprovação fictícia | Lateral/onboarding; matriz móvel | Implementado | Base publicada e navegação conferida |
| RQ-12 | Conversas e arquivos | Anexar/link/enviar identificados; formato inválido/segredo/ausência de texto com recuperação | Conversa/fontes/OCR/upload | Implementado | Base publicada; bateria sintética completa de arquivos/proteção |
| RQ-13 | Testes e conferência de resultados | Teste fora da medição; resultado parcial não aparece como aprovação completa | Checker/jornadas/Quick Wins | Implementado | Base publicada; resultado fictício atual conferido |
| RQ-14 | Publicação e execução | Rascunho não muda versão usada; publicação explícita; nova execução explícita | Versões/execução/E2E | Implementado | Publicação e execução reais anteriores documentadas |
| RQ-15 | Resultados parciais, bloqueios, limitações | O que houve, efeito e próximo passo; link com autorização ou pedido ao responsável | Jornadas/qualidade/governança | Implementado | Base publicada; cenários negativos simulados com permissões reais do servidor |
| RQ-16 | Pendências | Decisões separadas de registros históricos; solicitação correta aberta | Acompanhamento/integrações | Implementado | Base publicada; consulta real |
| RQ-17 | Configurações/admin | Divulgação progressiva e confirmação de consequência relevante; cancelamento não grava | Admin/empresa/perfis/configurações | Implementado | Base publicada; controles reais não alterados para QA |
| RQ-18 | Ícones, mensagens e ajuda sem ação essencial escondida | Texto visível além de nome acessível; ajuda contextual | Menus/ações/conversa/app; matriz móvel | Correções publicadas; testes afetados aprovados | **`aff718c` servida; apresentação real conferida; erros controlados validados em ambiente isolado** |
| RQ-19 | Espera, sucesso e falha compreensíveis | Descrever processamento; retirar controles de tela anterior; sucesso só após efeito | Assistente/app/schedule | Correções publicadas; testes afetados aprovados | **`aff718c` servida; apresentação real conferida; erros controlados validados em ambiente isolado** |
| RQ-20 | Recuperar sem perder trabalho | Repetir/voltar preserva texto; retry não duplica; resposta tardia não troca rota | Testes de erro, nome e agendamento | Correções publicadas; testes afetados aprovados | **`aff718c` servida; apresentação real conferida; erros controlados validados em ambiente isolado** |
| RQ-21 | Consistência, legibilidade, acessibilidade e mobile | 29 telas privadas e nove de console em 1280/390/320; teclado/diálogos/foco; layouts preenchidos | Interface/lateral/Quick Wins/visual E2E | Cenários técnicos aprovados; resultados/repetições no relatório | Inspeção técnica; leitor de tela real e matriz ampliada não certificados |
| RQ-22 | Auditoria completa com evidência e prioridade | Problema, impacto, gravidade, recomendação e validação por achado | `qa-profundo-pedidos-20261009.md` | Registrado com 12 achados priorizados | Relatório vinculado aos PRs #41/#42; evidências finais atualizadas |
| RQ-23 | Jornadas propostas, textos, erros e sucesso | Roteiros de criar/nomear, refinar, agendar e administrar | Relatório de QA | Registrado | Vinculado à versão `aff718c` validada |
| RQ-24 | Critérios objetivos e testes | Cenários verificáveis, falhas iniciais preservadas, resultados finais e limitações explícitos | Relatório e logs de regressão | Baterias concluídas; servidor 806/806; navegador 118/119 + suíte afetada 8/8; complemento 60/60 | Versão `aff718c` confirmada; recarga e efeitos reais registrados |
| RQ-25 | Novo QA profundo de todos os últimos pedidos | Cruzar pedido → código → teste → produção; corrigir falhas e repetir verificações afetadas | Este controle + relatório | QA concluído para os cenários registrados | Correções desta rodada validadas em `aff718c`; limites e pendências históricas mantidos |
| RQ-26 | Tracking e implementação em produção | Estado por pedido; nome e correções publicados e persistência real comprovada | Este controle + PR/versionamento | 27 pedidos rastreados, estados e evidências separados | PRs #41/#42 integrados; `aff718c` em produção; pendências sem evidência não encerradas |
| RQ-27 | Localização do nome; composição rejeitada pelo usuário às 12:17 de 09/10 | Editar nome visível junto ao título, sem competir com ações de execução; formulário contextual | `quickwin.js`, CSS; `quickwin-nome`, `qw-detalhe-layout` | Função validada anteriormente; apresentação refeita após rejeição | **Revalidado tecnicamente em `f45a851`: edição abre no contexto, cancelamento/foco corretos, captura real** |
| RQ-28 | “A UX-UI ficou horrível, amadora” — 09/10 | Identificação e ações separadas; hierarquia visual clara; nome e formulário legíveis; sem colisão em celular | `quickwin.js`, `estilo.css`, `interface.css`; matriz de telas e detalhe | Composição corrigida; evidência e aceite em `ux-detalhe-quickwin-20261009.md` | **Publicado e conferido em `f45a851`; captura real da mesma tela do usuário. Avaliação por participantes permanece pendente** |

## Pendências históricas que não serão apagadas pelo novo QA

| Registro | Última evidência encontrada | Tratamento |
|---|---|---|
| QF-05 — qualidade do design pela IA | `qa-final-relatorio.md`: parcial; design pode cair no motor clássico após reprovação | A suíte atual valida composição, exportação, revisão e fallback; isso não prova que todo pedido visual real usará design de IA. **Não encerrado por esta bateria.** |
| QF-09 — pesquisa indisponível também gerar inconsistência | `qa-final-relatorio.md`: aberto; link de resolução correto | Orientação atual validada; classificação de todos os resultados reais com pesquisa indisponível exige nova evidência. **Não encerrado por inferência.** |
| Recebimento de email | Sem acesso à caixa; ausência de evento de erro hoje | Texto corrigido para tentativa de envio. **Recebimento não comprovado.** |
| Entendimento por usuários leigos | Auditoria especializada e testes técnicos | Depende de participantes representativos; **não aprovado por testes automáticos** |
| Histórico de pedidos fora das fontes disponíveis | Consulta complementar retornou erro | Controle cobre conversa e documentos disponíveis; completude histórica externa **não comprovada** |

## Registro de encerramento desta rodada

**09/10/2026 — versão final `aff718c`, PRs #41 e #42 integrados.** Nome definido no início, salvo como rascunho e retomado após recarga. Cancelamento não gravou; edição pelo botão junto ao título persistiu após nova recarga. A descrição correta do objetivo permaneceu após renomear. Dois rascunhos fictícios arquivados recuperavelmente; duas rotinas de teste conferidas como pausadas, com resultados disponíveis. Segurança, permissões, políticas e recursos corporativos não foram alterados para fazer cenários passarem.

Relatório registra resultados integrais e repetições, incluindo o seletor antigo corrigido. O encerramento das correções desta rodada não encerra automaticamente as pendências históricas acima. A versão e a captura reais são a evidência de publicação; o registro final fica no ramo de QA para manter a versão de produção estável.

## Reabertura da apresentação — 09/10, após captura das 12:17

A funcionalidade de nome persistia, mas a aceitação visual anterior não se sustenta diante da captura do usuário. RQ-27 foi reaberto e RQ-28 registra explicitamente a qualidade da composição. A nova correção separa nome/status das ações, reduz o peso das ações secundárias, identifica “Editar instruções” e contém a edição do nome. QA-13 registra apresentação; QA-14 registra erro assíncrono de medição descoberto na regressão; QA-15 registra colisão Menu/título no celular. Não se declara compreensão por usuários leigos comprovada sem participantes. O relatório desta correção preserva os resultados das baterias e diferencia testes locais da conferência de produção.

## Produção desta correção visual

PR #43 integrado; Render live em 09/10/2026 às 15:39:10 UTC; saúde servindo `f45a851`. Tela real “Analisar documentos” conferida após recarga, com nome/status separados da barra de ações. Editar nome abriu campo preenchido e focado; cancelar fechou o formulário e devolveu foco sem gravar. Captura real registrada. Matriz final 7/7 e jornadas 8/8 aprovadas. Registro final no ramo de QA e corpo do PR; não foi criado outro deploy somente para documentar o mesmo resultado.


## Reabertura — alerta de resultado e refinamento, 09/10 às 14:36 de Brasília

**RQ-01, RQ-07, RQ-15 e RQ-25 não estavam integralmente encerrados.** O botão mais visível do alerta da conversa 67 apontava para `#/qw/490/ajustar`, embora o rodapé apontasse para o refinamento. Os testes anteriores cobriam a jornada guiada, mas não esta entrada. A evidência do usuário invalidou a conclusão ampla anterior.

| ID | Pedido | Evidência e correção | Aceite e situação |
|---|---|---|---|
| RQ-29 | Mensagens com causa, impacto e ação direta | Diagnóstico repetitivo substituído por pontos legíveis e “Como melhorar”; diagnóstico integral mantido em detalhes. Limitações de pesquisa e integração explicadas, com destino autorizado ou solicitação de revisão existente. Consulta não recebe mensagem de gravação. | Testes de serviço e navegador aprovados; produção depende da conferência do deploy desta correção. Compreensão por participantes não comprovada. |
| RQ-30 | Refinar pelo botão do alerta, sem voltar à edição | Ação principal “Refinar Quick Win” leva ao caso exato, incluindo conversa e mensagem. Diagnóstico prepara orientação editável; material anterior é reaproveitado. Melhorar somente uma resposta é ação separada e não envia automaticamente. | Teste do caminho exato em 1280/390/320, erro 503 sem perder orientação, versão publicada preservada. Aplicação e comparação cobertas pela bateria guiada. Produção ainda pendente neste commit. |

Relatório e evidências: `orientacao-resultados-refinamento-20261009.md`. Corrigir estes problemas não encerra automaticamente os 24 itens do documento de auditoria nem comprova usabilidade com participantes.


### Evidência real da reabertura

PR #44, produção `81b5deb`: botão do alerta da conversa 67 abriu refinamento do resultado 174; material anterior disponível, diagnóstico preparou orientação e a IA gerou proposta. Nenhum editor inicial apareceu. A versão da equipe não foi publicada durante a verificação. Testes fictícios cobrem aplicar/retestar/comparar. A consulta histórica deixou de ser apresentada como gravação bloqueada; proteção de pesquisa permaneceu ativa. Pequeno ajuste posterior de título distingue problema de linguagem de entrega incompleta; 4/4 testes de serviço e 1/1 de navegador passaram.
