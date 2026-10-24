# Correções da auditoria GreenIA — 14/10/2026

Base auditada: `069fd05646e699292ae82b5050775f69a7f39f57`, branch de produção `greenia-lite`.

## Correções implementadas

| Achado | Correção | Evidência de regressão |
| --- | --- | --- |
| F01 — Negação interpretada como entregável | O parser retira orações negativas antes de separar listas. Preserva tarefas afirmativas seguintes e substantivos como “não conformidades”. A interpretação pela IA recebe a mesma orientação. | `test/auditoria-regressoes.test.js`; testes existentes da interpretação |
| F02 — Refinamento mantém contrato antigo | Feedback explícito de tabela gera proposta visível de contrato. Somente após aprovação, colunas, operação e seções são reconciliadas. Tabela exclusiva rejeita conteúdo fora da tabela. A regra de indicar ausências continua válida nas células necessárias. O teste e a versão anteriores permanecem. | API de refinamento, construção/conferência e teste de aprovação no celular em `e2e/quickwin2.test.js` |
| F03 — Conferência manda completar em vez de retirar | Processo usa grupo “regras”; orientação usa o grupo real do critério. Excesso de conteúdo recebe ação de retirar extras e preservar a tabela confirmada. | `test/resultado-orientacao.test.js`; regressão específica |
| F04 — Estados divergem no catálogo e Visão geral | Função pura compartilhada define os estados. Administração conta o teste válido do rascunho; edição invalida esse estado. Circulação e alertas de responsável consideram publicados. | API: teste, edição e reconciliação dos contadores; função de estado compartilhada |
| Observação de privacidade | Homologação explicita documentação e condições contratuais da rota; filtros não substituem comprovação e não eliminam metadados. | Suítes de gestão e governança |
| Observação de fontes | “Materiais consultados” esclarece disponibilização à IA, sem atribuir automaticamente fundamentação a cada documento. | Suítes de fontes e interface |

## Validação

- Suíte completa de servidor, incluindo visual: **902 aprovados**, zero falhas, cancelamentos ou casos ignorados.
- Regressões após o último ajuste de contrato: **51 aprovadas**; indicadores e claims: **38 aprovadas**. São retestes, não devem ser somados à contagem de cobertura.
- Rodada completa de navegador: **323 casos** inicialmente, com falha no transporte do domínio fictício de prévia; correção do executor mantém a origem fictícia e dirige o transporte ao servidor local. A prévia não exigiu mudança no produto.
- Reteste dos seis casos de gestão: **6 aprovados**, incluindo prévia, datas e largura. Foram corrigidas esperas por formulário reconstruído e editor renderizado.
- Rodada final completa de navegador: **324 aprovados**, zero falhas, cancelamentos ou casos ignorados.
- Novo caso de refinamento no celular: aprovado; prova persistência do contrato e repetição de material.
- Smoke de **270 declarações literais de rotas**: nenhuma resposta 5xx nos cenários anônimos utilizados. Não representa validação funcional de todas as rotas.

## Limites de conclusão

Estas correções tratam os defeitos confirmados e a coerência de duas observações da interface. Não constituem aprovação de 100% da oferta.

Continuam requerendo evidência específica: integrações com sistemas externos contratados e seus eventos; documentação contratual das rotas de IA; configurações efetivas de retenção/backup; execução programada e recebimento real do aviso; permissões, isolamento e orçamento em tenants de produção controlados; compreensão por participantes leigos e leitor de tela.

Conexões fictícias antigas não foram apagadas. Histórico empresarial com deduplicação e fotografias, painéis personalizados e integração contínua são projetos adicionais na LP atual; não foram criadas novas promessas nem considerados recursos da assinatura.

Rascunhos preexistentes não foram migrados silenciosamente: a reconciliação de contrato ocorre na aprovação de refinamento. A auditoria original e seus testes reais permanecem como evidência histórica.

## Complemento encontrado no reteste real

A versão `88a9761` foi publicada pela PR #57. No Apy Mine, o teste 77 entregou a tabela correta com duas divergências e sem seções extras, mas a IA marcou o objetivo parcial exigindo uma linha de preço igual.

A correção complementar preserva o recorte “somente divergências” na execução, conferência e revisão, inclusive em especificações anteriores. O achado de objetivo central passa pela revisão focada; omissão, resposta ilegível ou rejeição sem justificativa conservam o estado parcial. Divergência real omitida continua sendo falha.

Retestes reais concluídos na primeira publicação:
- F01: novo rascunho QA 498, objetivo original com negações, apenas o entregável de divergências.
- F03: orientação do teste 75 agora manda retirar conteúdo extra.
- F04: cinco Quick Wins em teste no catálogo e na Visão geral; circulação zero, com rótulo de publicados.
- F02: tabela de quatro colunas e duas linhas correta no teste 77; conferência exigiu o complemento acima.

Validação do complemento: suíte completa de servidor com 903 casos aprovada; após os últimos ajustes, 52 regressões de conferência/contrato e 14 casos de navegador relacionados aprovados. Essas são rodadas e retestes; não devem ser somados como cobertura distinta.
