# GreenIA — QA profundo dos pedidos recentes — 09/10/2026

## Parecer e limites

A revisão cobre implementação, navegação no navegador, APIs, persistência e efeitos posteriores. O pedido comercial sobre LinkedIn foi expressamente excluído do escopo. O critério é concluir a tarefa com orientação compreensível, preservando permissões, ciência de políticas, aprovações, rastreabilidade, sigilo e limites.

**Não existe garantia absoluta de ausência de defeitos.** A aprovação é restrita aos cenários efetivamente executados. Testes locais usam empresas, pessoas e materiais fictícios, com provedores controlados. Verificações de produção são identificadas separadamente. Uma simulação local não prova execução automática em produção ou recebimento de email.

Versão de produção no início: `03e10d8`. Correções principais publicadas pelo PR #41: `b2facb9`, com nome criado/editado/recarregado em produção. Complemento da descrição automática publicado pelo PR #42: **`aff718c`**, confirmado pelo serviço de saúde e pela interface. Criação, cancelamento, edição e recarga foram novamente conferidos nessa versão.

## Rastreabilidade dos pedidos

| Pedido / jornada | Implementação e evidência | Verificação |
|---|---|---|
| Navegação simples para usar e administrar | Trabalho no primeiro nível; Administração separada por permissão; histórico recente limitado a cinco conversas; navegação móvel | `lateral`, `fluxo`, `ux`; produção: navegação entre uso/admin |
| Primeiro acesso didático | Guia com próximos passos; preparação diferencia o que está disponível para conferir de algo já comprovado; integrações opcionais | `onboarding-conhecimento`, `ajude-comecar`, `acompanhamento`, login/API |
| Conversas e arquivos | Anexar, link, enviar e sair com texto visível; erros de material próximos da ação; proteção de credenciais, OCR e retenção | `fontes`, `auditoria`, `governanca-persistencia`; testes de OCR e upload |
| Criar Quick Win com orientação | Objetivo cotidiano, plano com entradas/etapas/entregas; contexto disponível aproveitado; rascunho salvo; nome opcional escolhido pela pessoa | `quickwin2`, `quickwin-generalista`, `qw-preparacao`, `quickwin-nome` |
| Definir/editar nome — reforçado pelo usuário nesta rodada | Nome opcional no início; “Editar nome” no detalhe; salvar/cancelar; alteração no catálogo sem republicar a operação | `quickwin-nome`: persistência, erro, cancelamento, usuário comum, versão/agenda/histórico |
| Refinar sem retornar à edição inicial | Jornada própria: contexto do resultado → explicar ajuste → conferir proposta → repetir caso e comparar; recupera resultado próprio disponível | `quickwin2`, `quickwin-refinamento`; contexto protegido pela API |
| Testar e conferir resultado | Teste fora da medição; estados completo/parcial/inconsistente/pergunta diferenciados; ressalvas não se tornam aprovação | `quickwin2`, `quickwin-resultado`, `jornadas`, conferência/API |
| Publicar com consequências claras | Rascunho separado da versão utilizada; revisão e ciência de ressalvas; publicação gera versão e conserva histórico | `quickwins-v2`, `quickwin2`, permissões/tenants |
| Usar Quick Win | Entrada orientada pelas necessidades do trabalho; execução explícita; resultado por entregável; revisão antes de uso | `quickwin-operacao`, `quickwin-generalista`, `quickwin-resultado` |
| Agendar de forma direta | “Agendar” na lista e no detalhe; trabalho já selecionado; material → frequência/horário → conferir → ativar; custos e opções em bloco adicional | `qw-programacao` no navegador e servidor |
| Agendamento realmente salvo/executado | Preview calculado no servidor; criação idempotente; rotina salva pausada quando ativação falha; execução por responsável e versão | Testes de banco/worker; disparo real em produção às 09:07 de Brasília, registrado em `agendamento-producao-20261009.md` |
| Acompanhar resultado agendado | Fila/processamento não oferecem conversa vazia como resultado; atualização automática; link ao terminar; histórico preservado | Produção: resultado fictício persistido; navegador: estados controlados e atualização automática |
| Bloqueios e resultados parciais | Explica efeito e próximo passo; links às configurações existentes respeitam autorização; sem permissão, pede responsável/admin | `governanca`, `qw-preparacao`, `jornadas`, integrações/segurança |
| Pendências reais | Decisões acionáveis separadas dos registros históricos; conexão leva à solicitação correta; aprovações permanecem necessárias | `acompanhamento`, `integracoes`, `qw-preparacao`; produção: consulta de pendências |
| Configurações/admin sem excesso inicial | Blocos progressivos; confirmação de consequências em configuração/perfis/página pública; consumo reúne uso e testes do mesmo período | `config-integracoes`, `modelos-admin`, `marca-branca`, `planos-console`, testes de consumo/perfis |
| Ações identificadas e acessibilidade | Texto visível em menus, renomear/excluir, menu móvel, anexos/envio; teclado, foco, redução de movimento e layouts estreitos | 29 telas privadas × 3 larguras; nove telas do console × 3; cenários móveis preenchidos |

Nomes na coluna de verificação correspondem aos arquivos `.test.js` de `e2e/` ou `test/`. A cobertura de uma tela não significa que todas as combinações possíveis de dados e permissões foram percorridas em produção.

## Problemas encontrados, impacto e prioridade

P1: impede concluir ou pode induzir ação errada. P2: dificulta compreensão ou recuperação. Nenhum controle corporativo foi removido para resolver usabilidade.

| ID | Jornada / evidência | Natureza / impacto | Gravidade | Correção e validação |
|---|---|---|---|---|
| QA-01 | Usuário informa que definir/editar nome não chegou à produção. Na revisão anterior, a edição estava concentrada na revisão de publicação, sem acesso direto no detalhe | Compreensão/funcionamento: pessoa não encontra como identificar o trabalho; editar exige caminho desnecessário | P1 | Nome opcional no início e edição direta; testar cancelar, vazio, erro 503, repetir, recarregar, acesso da equipe e histórico inalterado; validar em produção |
| QA-02 | `desenhar` do assistente substituía uma etapa com falha apenas pelo aviso de erro | Funcionamento: falha transitória deixa a pessoa sem recuperação clara | P1 | “Tentar novamente” e “Voltar à etapa anterior”; objetivo preservado e único rascunho; teste com resposta atrasada e falha controlada |
| QA-03 | Lista de agendamentos redesenha todo o conteúdo a cada atualização; histórico aberto e foco não eram conservados | Funcionamento/apresentação: interrompe leitura e uso por teclado | P2 | Preservar histórico aberto e foco; teste termina execução automaticamente enquanto a pessoa está no histórico |
| QA-04 | Atualização assíncrona de agendamentos podia terminar após sair da rota | Funcionamento: resposta tardia pode desenhar tela diferente do destino escolhido | P1 | Conferir rota e ordem da atualização antes de desenhar; resposta atrasada não substitui nova conversa |
| QA-05 | Produção: menus de Quick Win sem texto visível; conversas e ações recentes com ícone/“···” | Compreensão: exige conhecer símbolos ou descobrir ajuda escondida | P2 | “Mais ações”, “Ações”, “Renomear”, “Excluir”, “Menu” e “Fechar”; preservar nomes acessíveis e testar layout/teclado |
| QA-06 | Produção/implementação: “Cada um também chega por email”; configuração afirmava “isso já funciona” | Compreensão: promete recebimento que a plataforma não pode confirmar | P2 | Distinguir registro na plataforma de tentativa de aviso; orientar email de teste e caixa de entrada/spam; recebimento continua dependente de comprovação |
| QA-07 | Interpretação demorada mostrava apenas “Carregando…” | Compreensão: pessoa não sabe o que está acontecendo e pode reenviar | P2 | Explicar que a plataforma organiza etapas e aproveita informações já dadas; estado de processamento identificável; sem percentual fictício |
| QA-08 | Primeira bateria: histórico de modelos não abriu em uma passagem a 320 px; execução selecionada apresentou classe divergente em outra passagem | Funcionamento/transição: tela anterior podia oferecer controles enquanto novo destino carregava | P1 | Ao navegar, retirar controles anteriores e mostrar “Abrindo a tela escolhida…” com estado ocupado; testar atraso de rede e regressão completa; registrar primeira falha e repetição |
| QA-09 | Atividade exibia vários tipos conhecidos como “Registro de atividade” seguido de código técnico | Compreensão: administrador precisa interpretar o código para entender o ocorrido | P2 | Rótulos cotidianos para tipos conhecidos; preservar código e detalhes para rastreabilidade |
| QA-10 | Erro de leitura na atualização da lista de programações conservava o último status sem informar a falha | Compreensão/funcionamento: status antigo pode parecer informação atual | P1 | Avisar que são os últimos dados recebidos, manter a lista e oferecer “Atualizar”; repetir automaticamente; teste 503 seguido de recuperação |
| QA-11 | Usuário relata dificuldade para localizar o nome mesmo após descrição da correção | Compreensão: recurso existente continua difícil de descobrir | P1 | Campo visível antes do objetivo na criação e “Editar nome” ao lado do título, fora de menus; teste verifica posição/visibilidade e funcionamento em 320 px |
| QA-12 | Teste real do nome em `b2facb9`: “O que ele faz” repetiu o nome personalizado, embora o objetivo estivesse salvo corretamente | Compreensão: nome arbitrário não explica a tarefa e pode induzir interpretação errada | P1 | Descrição automática deriva do objetivo; nome identifica o trabalho. Preservar descrições explicitamente informadas e manter operação intacta ao renomear; regressão de API e navegador |

Correções anteriores revalidadas: confirmação/gravação duplicadas após navegar entre biblioteca e detalhe; resultado agendado oferecido antes de concluir; “Sem retorno ainda” confundindo ausência de avaliação com ausência de resposta. Evidências e PRs estão no relatório de agendamento.

## Jornadas críticas e textos

### Criar e nomear

1. “Nome do Quick Win (opcional)” aparece primeiro, com exemplo reconhecível pela equipe. Deixar vazio permite sugestão automática. Logo abaixo, “O que você quer que a IA faça?” orienta a descrição do trabalho.
2. A GreenIA organiza o trabalho usando o contexto autorizado. Pergunta somente o que faltar; etapas, regras e entregas seguem o assistente existente.
3. Testar, conferir e publicar. Sucesso identifica versão e disponibilidade para a equipe.

Para mudar somente o nome: abrir o trabalho → “Editar nome”, ao lado do título → escrever → “Salvar nome”. A ação está visível, fora de menus e blocos recolhidos. Cancelar não grava. Vazio pede um nome; falha mantém texto e permite repetir. Alterar nome não publica nova operação, não ativa agendas, não amplia acesso e não reescreve o nome de versões históricas.

### Refinar

1. Mostrar qual resultado será melhorado, data, trecho e diagnóstico. Usar somente resultados acessíveis à própria pessoa. Material protegido/não guardado não pode ser reconstruído: explicar e pedir reenvio quando necessário.
2. “O que deve mudar no próximo resultado?” — a pessoa descreve problema e resultado esperado. A plataforma prepara propostas usando teste e contexto disponíveis.
3. Mostrar mudanças e justificativas. A pessoa confere e aplica. Novo teste repete o material disponível e compara antes/depois. A publicação continua sendo uma decisão explícita.

Erro de análise não aplica ajustes silenciosamente. Falha de gravação preserva a proposta. Conflito de rascunho exige atualizar o contexto; não sobrescreve trabalho concorrente. Retenção, sigilo ou ausência de resultado geram orientação concreta, sem devolver a pessoa à edição inicial.

### Agendar

1. “Agendar” no trabalho escolhido. Mostrar o que será executado e os materiais necessários. Usar materiais/consultas preparados quando disponíveis; esclarecer que material salvo não se atualiza sozinho.
2. Escolher frequência e horário; fuso identificado. Limites seguros e opções adicionais disponíveis sem dominar a tela.
3. “Conferir programação”: tarefa, material, próxima execução real, limites e resultado na área Programados. “Ativar programação” salva e ativa.
4. Confirmar estado ativo e próxima execução. Em processamento, explicar espera, permitir sair e voltar e impedir execução manual simultânea. Ao terminar, oferecer o resultado e a conferência.

Se salvar funcionar e ativar falhar: “A programação foi salva, mas ainda está pausada. Tente ativar novamente.” Repetir não duplica a rotina. Mudança de versão/política/acesso/créditos bloqueia com motivo e próximo passo. Aprovação de ação externa continua obrigatória quando prevista. Aviso por email é complementar; resultado na plataforma é o destino confiável.

### Erro, bloqueio e administração

Na falha de abertura: “Não foi possível abrir esta tela”, ação principal “Tentar novamente”, destino conservado e alternativa de voltar. Durante a navegação, controles da tela anterior deixam de ficar disponíveis. Na falha de etapa, repetir ou voltar conservam informações.

Em pendências: mostrar primeiro decisões que precisam de ação; registros históricos ficam separados. Em configurações: abrir apenas o bloco relevante, explicar alcance da mudança, conferir consequências, confirmar quando necessário e salvar. Perfil comum recebe orientação para pedir ajuste ao responsável; servidor continua autorizando cada ação.

## Critérios objetivos de aceitação

| Critério | Cenário e resultado exigido |
|---|---|
| Nome criado | Informar nome e objetivo, continuar, recarregar: ambos persistem em um único rascunho |
| Nome sugerido | Deixar nome opcional vazio: criação mantém sugestão automática existente, sem exigir outro passo |
| Nome editado | Salvar novo nome: detalhe, catálogo e leitura pela equipe exibem o nome após recarga |
| Nome seguro | Sem autorização: ação ausente e API 403; credencial no nome: API recusa; versão, operação, status e agenda preservados |
| Nome com erro | Cancelar não grava; vazio informa correção; 503 mantém texto; repetir salva uma vez |
| Nome fácil de encontrar | Campo antes do objetivo e botão junto ao título; ambos visíveis sem abrir menu/ajuda; sem transbordamento a 320 px |
| Refinamento contextual | Entrada pelo resultado/detalhe abre refinamento próprio; mostra resultado acessível e aproveita diagnóstico/contexto |
| Refinamento controlado | Aplicar somente o ajuste conferido; rascunho não altera versão publicada; conflito não sobrescreve |
| Repetição comparável | Mesmo material disponível gera novo teste e comparação; troca de material fica identificada |
| Ressalvas verdadeiras | Parcial/desconhecido/pergunta/inconsistente nunca aparecem como aprovação completa |
| Publicação explícita | Nova versão somente após revisão e ação de publicar; não por refinamento, renomear ou teste |
| Agenda simples | Partir de Agendar sem selecionar novamente o trabalho; confirmar material, horário/fuso, próxima ocorrência e destino |
| Agenda persistente | Salvar/ativar persiste no banco e após fechar navegador; retry não cria segunda programação |
| Ativação recuperável | Falha de ativação deixa rotina pausada e orienta tentativa; não apresenta ativo falso |
| Disparo real | Horário vencido dispara sem “Executar agora”; resultado final persiste e pode ser aberto depois |
| Resultado pronto | Fila/em execução sem link prematuro; conclusão disponibiliza resultado pela atualização automática |
| Leitura preservada | Atualização mantém histórico aberto/foco; resposta atrasada não substitui outra rota |
| Status com leitura falha | Falha 503 conserva lista, identifica informação anterior e oferece recuperação; leitura seguinte remove aviso e atualiza os dados |
| Governança preservada | Tenants e resultados privados isolados; sigilo, ciência, aprovações, permissões, retenção e limites continuam aplicados |
| Recuperação de etapa | Erro permite repetir/voltar com objetivo intacto e único rascunho; processamento explica o que acontece |
| Ações compreensíveis | Ações essenciais possuem texto visível e nome acessível; não dependem de tooltip/ícone |
| Mobile e teclado | Sem transbordamento de conteúdo principal nas larguras verificadas; foco visível, diálogos navegáveis, controles adequados para toque |
| Compreensão humana | Usuários leigos concluem tarefa e explicam o que foi executado e onde está o resultado sem ajuda externa — depende de teste com participantes |

Referências de avaliação: [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/), [mensagens de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages) e [tamanho de alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Essas referências orientam verificações; não constituem declaração de conformidade integral. O projeto adota controles móveis de 44 px onde verificados; critérios WCAG têm níveis e exceções próprios.

## Registro das baterias

- Primeira execução de servidor: **796 aprovados / 10 falhos / 806 cenários**. As dez falhas se concentraram no design visual e identificaram Chromium indisponível no processo de teste. A bateria foi reiniciada com `CHROMIUM_PATH` correto; não foram consideradas aprovação do recurso.
- Primeira execução de navegador: **114 aprovados / 2 falhos / 116 cenários**. Histórico de modelos e seleção de nível divergente foram investigados, com correção da transição; execução isolada de interface/pools: **8/8 aprovados**. Uma execução isolada aprovada não apaga a falha inicial.
- Novo teste de recuperação inicialmente falhou porque a asserção lia `dados.length` em vez de `dados.quickWins.length`. O fluxo já havia passado pelas ações; a asserção foi corrigida e a regressão repetida.
- Regressão final de servidor: **806/806 aprovados**, sem cancelamentos ou testes ignorados.
- Regressão de APIs afetadas pelo nome: **58/58 aprovados**.
- Segunda bateria completa de navegador: **115 aprovados / 2 falhos / 117 cenários**. O texto visível de “Mais ações” revelou transbordamento da biblioteca móvel, corrigido com quebra de linha e alinhamento do menu. O teste de login avançava o relógio antes da atualização da interface; passou a esperar os estados visíveis. Repetição isolada do login: **1/1 aprovado**.
- Execuções intermediárias interrompidas não foram contabilizadas como aprovação completa.
- Última bateria integral de navegador: **118 aprovados / 1 falho / 119 cenários**, sem cancelamentos ou testes ignorados. O teste antigo de edição procurava qualquer botão contendo “Editar”, acionou o novo “Editar nome” e aguardou indevidamente o editor de regras. A seleção foi corrigida para o link de nome exato “Editar”. A suíte completa de criação/publicação/refinamento foi repetida após esse ajuste; resultado registrado abaixo. Nenhum comportamento da plataforma foi alterado para fazer essa asserção passar.
- Repetição da suíte afetada (`e2e/quickwin2.test.js`): **8/8 aprovados**, sem cancelamentos ou testes ignorados. Com a correção somente do seletor de teste, os 119 cenários têm resultado aprovado entre a bateria integral e a repetição afetada; não se apresenta a execução integral anterior como 119/119.
- Nome visível e atualização de agendamentos, após os ajustes finais: **5/5 cenários de navegador aprovados**, incluindo persistência, permissões, erro/repetição, localização da ação, histórico/foco e status desatualizado.
- Complemento após o achado real QA-12: **60/60 cenários afetados aprovados**, incluindo as duas jornadas de nome no navegador e APIs de criação, versões, refinamento, preparação, governança e programação. O objetivo continua distinto do nome e a descrição se mantém ao renomear.

Comandos: Node 24, `--test-concurrency=1`, servidor `test/*.test.js`, navegador `e2e/*.test.js`, Chromium Headless Shell explicitamente configurado. Logs completos são mantidos no ambiente de QA; o relatório não publica dados corporativos, credenciais nem identificadores de infraestrutura.

## Produção e verificações pendentes

A execução automática real de hoje está documentada no relatório de agendamento: task fictícia, publicação v3, rotina ativa, disparo às 09:07 de Brasília sem execução manual, resultado privado com três entregáveis, números/riscos/data preservados, resultado mantido após recarga. Rotina foi pausada e tarefa arquivada ao terminar. Nesta rodada foi reaberto o histórico e conferida a persistência do resultado e de “Sem avaliação”.

Refinamento real também foi reaberto nesta rodada: o item fictício foi restaurado em preparo, abriu a jornada própria “Refinar Quick Win”, recuperou a execução das 09:07 como resultado selecionado, mostrou o trecho do resultado/conferência e identificou material disponível para repetir. A pergunta “O que deve mudar no próximo resultado?” apareceu com orientação cotidiana. Não foram preparados nem aplicados novos ajustes; nenhuma versão foi publicada. O item foi novamente arquivado e a versão v3 permaneceu identificada.

Em Atividade, filtro `email.failed` desde 09/10/2026 retornou zero eventos. Há falhas históricas anteriores. **Zero eventos de falha não prova recebimento de um aviso específico.** Email permanece não comprovado sem acesso à caixa de entrada ou evidência de entrega.

Ainda não comprovado: compreensão por participantes leigos/não nativos digitais; uso com leitores de tela reais; dispositivos e navegadores fora da matriz Chromium; todas as combinações de conectores corporativos reais e suas indisponibilidades. Não foram alteradas permissões, políticas, retenção, credenciais nem recursos corporativos reais para testar caminhos negativos em produção; esses casos foram executados em empresas isoladas.

Validação pós-publicação de `b2facb9`: saúde confirmou a nova versão; campo de nome visível antes do objetivo; rascunho fictício salvo e retomado após recarga; “Editar nome” junto ao título; novo nome salvo e conservado após segunda recarga. Item fictício arquivado de forma recuperável, sem publicação/execução/agendamento. O achado QA-12 gerou o PR #42, publicado em `aff718c`. Na nova criação fictícia, nome e objetivo foram recuperados após recarga; “O que ele faz” exibiu “Resume anotações fictícias de reunião, sem inventar informações.”; cancelar não gravou; salvar um novo nome e recarregar manteve o nome e a descrição correta. Os dois novos rascunhos foram arquivados recuperavelmente. A lista Programados foi reaberta nessa versão: as duas rotinas fictícias estavam pausadas, com resultados concluídos disponíveis. Nenhuma nova programação, execução ou publicação de Quick Win foi feita nessa etapa.

## Encerramento verificável desta rodada

Correções integradas pelos PRs #41 e #42; versão final servida: `aff718c`. Durante a troca de versão houve uma resposta transitória 502; a consulta seguinte respondeu com saúde positiva e a versão nova. Navegação autenticada, gravação e recarga foram concluídas depois da atualização. A captura `greenia-editar-nome-producao-1791552423320.jpg` registra o botão ao lado do título, campo, salvar/cancelar, descrição correta e versão publicada, usando somente um item fictício arquivado.

A descrição automática corrigida é utilizada na criação ou quando precisa ser gerada. Descrições existentes e explicitamente informadas são preservadas; não foi executada substituição em massa de textos de Quick Wins existentes. Os achados históricos QF-05/QF-09, recebimento de email e validação com participantes continuam registrados no controle de pedidos.
