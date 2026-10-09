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
| RQ-06 | Nome de Quick Win — pedido anterior, reafirmado em 09/10 | Definir no início ou editar diretamente; persistir para a equipe; cancelar/erro recuperáveis | `quickwin2.js`, `quickwin.js`, validação nome; `quickwin-nome` | Correção pronta; 2/2 E2E aprovados | **Aguardando publicação e teste real nesta rodada** |
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
| RQ-18 | Ícones, mensagens e ajuda sem ação essencial escondida | Texto visível além de nome acessível; ajuda contextual | Menus/ações/conversa/app; matriz móvel | Correções adicionais nesta rodada | **Aguardando publicação** |
| RQ-19 | Espera, sucesso e falha compreensíveis | Descrever processamento; retirar controles de tela anterior; sucesso só após efeito | Assistente/app/schedule | Correções adicionais nesta rodada | **Aguardando publicação** |
| RQ-20 | Recuperar sem perder trabalho | Repetir/voltar preserva texto; retry não duplica; resposta tardia não troca rota | Testes de erro, nome e agendamento | Correções adicionais nesta rodada | **Aguardando publicação** |
| RQ-21 | Consistência, legibilidade, acessibilidade e mobile | 29 telas privadas e nove de console em 1280/390/320; teclado/diálogos/foco; layouts preenchidos | Interface/lateral/Quick Wins/visual E2E | Regressão em andamento | Inspeção técnica; leitor de tela real e matriz ampliada não certificados |
| RQ-22 | Auditoria completa com evidência e prioridade | Problema, impacto, gravidade, recomendação e validação por achado | `qa-profundo-pedidos-20261009.md` | Registrado | Publicação do relatório com o código ao encerrar |
| RQ-23 | Jornadas propostas, textos, erros e sucesso | Roteiros de criar/nomear, refinar, agendar e administrar | Relatório de QA | Registrado | Vinculado à versão que será validada |
| RQ-24 | Critérios objetivos e testes | Cenários verificáveis, falhas iniciais preservadas, resultados finais e limitações explícitos | Relatório e logs de regressão | Em execução | Não encerrado antecipadamente |
| RQ-25 | Novo QA profundo de todos os últimos pedidos | Cruzar pedido → código → teste → produção; corrigir falhas e repetir verificações afetadas | Este controle + relatório | Em execução | Não encerrado antecipadamente |
| RQ-26 | Tracking e implementação em produção | Estado por pedido; nome e correções publicados e persistência real comprovada | Este controle + PR/versionamento | Em execução | Não encerrado antecipadamente |

## Pendências históricas que não serão apagadas pelo novo QA

| Registro | Última evidência encontrada | Tratamento |
|---|---|---|
| QF-05 — qualidade do design pela IA | `qa-final-relatorio.md`: parcial; design pode cair no motor clássico após reprovação | A suíte atual valida composição, exportação, revisão e fallback; isso não prova que todo pedido visual real usará design de IA. **Não encerrado por esta bateria.** |
| QF-09 — pesquisa indisponível também gerar inconsistência | `qa-final-relatorio.md`: aberto; link de resolução correto | Orientação atual validada; classificação de todos os resultados reais com pesquisa indisponível exige nova evidência. **Não encerrado por inferência.** |
| Recebimento de email | Sem acesso à caixa; ausência de evento de erro hoje | Texto corrigido para tentativa de envio. **Recebimento não comprovado.** |
| Entendimento por usuários leigos | Auditoria especializada e testes técnicos | Depende de participantes representativos; **não aprovado por testes automáticos** |
| Histórico de pedidos fora das fontes disponíveis | Consulta complementar retornou erro | Controle cobre conversa e documentos disponíveis; completude histórica externa **não comprovada** |

## Registro de encerramento desta rodada

Preencher somente após: baterias finais aprovadas; publicação concluída; versão atual servida; nome definido/alterado/recarregado em tarefa fictícia de produção; menus e status conferidos; dados de teste recuperavelmente arquivados/rotinas pausadas. Não mudar segurança nem permissões corporativas para obter um teste aprovado.
