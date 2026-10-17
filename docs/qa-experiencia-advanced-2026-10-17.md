# Experiência orientada por recomendação — QA em 17/10/2026

## Comportamento implementado

- Novas conversas comuns seguem a recomendação por padrão. Preferências de resposta ficam em área opcional. Não há seleção obrigatória de modelo ou provedor.
- A solicitação Advanced usa “Pedir liberação”, explica a necessidade, preserva o pedido e os nomes dos materiais para o próprio solicitante. O administrador não recebe o conteúdo privado.
- “Ver alternativa” revela o escopo reduzido antes de qualquer aceite ou consumo. A execução depende de escolha expressa.
- A aprovação recomenda capacidade adequada de menor custo entre modelos e rotas já aprovados. Alcance padrão: somente a conversa e seus ajustes, por 24 horas. O teto proposto considera o saldo autorizado. A recomendação não aprova segurança nem aumenta o orçamento.
- O administrador pode aprovar a recomendação, ajustar consumo/validade ou recusar. Parâmetros técnicos enviados pelo cliente não substituem a recomendação recalculada no servidor. Mudanças relevantes invalidam a versão exibida.
- Configuração técnica detalhada fica disponível sob demanda. O limite mensal tem unidade financeira explícita.
- A aprovação não inicia inferência. “Continuar meu pedido” retoma os materiais, com nova validação. Concessões aplicáveis existentes evitam solicitar novamente apenas porque um pedido anterior ainda está pendente.
- Arquivos Office solicitados são materializados e armazenados antes do evento de conclusão, em vez de registrar um marcador que só tenta gerá-los ao clicar. Tabelas com separador omitido podem ter a sintaxe normalizada sem completar ou modificar células. Falhas não mantêm promessa de download.

## Evidências locais concluídas

`node --test --test-force-exit test/advanced-migracao.test.js test/planilha-entrega.test.js test/advanced.test.js test/advanced-multiempresa.test.js test/escritorio.test.js`: **26 aprovados, zero falhas**.

Inclui autorização, privacidade, recomendação adulterada/desatualizada, orçamento e segurança separados, retomada, roteamento sem redução silenciosa, migração 23→24, geração de pacote Office, download autenticado, persistência e releitura de datas/nomes/aba da planilha. A resposta sem tabela válida não recebe arquivo nem mantém promessa de download.

`CHROMIUM_PATH=/tmp/greenia-chromium node --test --test-force-exit --test-timeout=45000 e2e/advanced.test.js e2e/modelos-admin.test.js`: **4 aprovados, zero falhas**.

Inclui pedido→solicitação→aprovação→notificação→retomada pelo navegador e servidor, recomendação padrão, preferências opcionais, ausência de seletores técnicos na aprovação, alternativa sem consumo ao abrir, largura de 390 px e nenhuma chamada paga antes da ação de retomada.

**Os provedores nesses testes são simulados. Esses resultados não comprovam a qualidade de inferência real. Não houve teste com pessoas leigas reais.**

## Reprovações e limites da homologação

A execução ampla anterior dos serviços terminou com **1.167 testes: 1.064 aprovados e 103 falhas**. As falhas não foram descartadas como irrelevantes: há expectativas antigas incompatíveis com autorização Advanced obrigatória e outros casos ainda por investigar. A suíte ampla não está aprovada.

A execução ampla de navegador abrangeu alterações em andamento e encontrou falhas. Ela não constitui aprovação de um commit fechado; os quatro testes acima foram repetidos após as alterações específicas.

Em produção, um pedido sintético de apresentação exigente foi bloqueado antes de execução e gerou uma solicitação administrativa persistente. A consulta real do catálogo identificou uma falha de encaminhamento de rotas no ambiente multiempresa, corrigida na versão 056b99c.

Outro teste real pediu XLSX com três tarefas, nomes e datas fixos. O modelo retornou linhas de tabela sem separador e afirmou que o arquivo estava disponível, sem entregar cartão de arquivo. **Caso reprovado.** Esse caso motivou a correção de materialização e o teste de regressão. O reteste após publicação foi concluído e está registrado abaixo.

A conta de produção não tinha concessão Advanced, teto mensal Advanced disponível nem aprovação das rotas necessárias. Nenhuma proteção ou autorização foi concedida automaticamente para fazer o teste passar. A execução real Advanced e a qualidade final de entregas sofisticadas continuam sem homologação.


## Reteste em produção da versão 96b1e6a

Implantação Render `dep-db9lbvjm8hqs73ajpisg` concluída em 17/10/2026, 11:04:04 UTC (08:04:04 em São Paulo). `/api/saude` confirmou `ok=true`, `ia=true`, `design=true`, versão `96b1e6a`.

- Nova conversa com recomendação automática: não foi necessário escolher modelo ou provedor.
- Botão “Interromper execução” visível durante a inferência real. Esta observação comprova a presença; não substitui um teste de cancelamento efetivo.
- Solicitação de XLSX com três tarefas: resposta real gerou o arquivo armazenado, com cartão próprio de download. O cartão persistiu após recarregar a conversa.
- Download do arquivo armazenado: **3.507 bytes**, SHA-256 `c591de23c34028edd56dfbf083222d9990f1b126337f609086799e7563fbba7b`.
- Leitura independente com openpyxl: somente aba `Tarefas`, quatro colunas e quatro linhas incluindo cabeçalho. Nomes, tarefas, status e datas 26/10/2026, 27/10/2026 e 28/10/2026 exatamente preservados. Datas são valores nativos; nenhuma fórmula ou gráfico extra. **Caso aprovado no reteste real.**
- Solicitação sintética Advanced: decisão real de recusa registrada pelo administrador; solicitante viu “Liberação não aprovada”, motivo, pedido original recuperável e ação para pedir novamente. Nova solicitação sem reescrever o pedido chegou ao estado “Aguardando liberação”. Não foi concedido acesso nem iniciada inferência Advanced.
- Painel administrativo preservou o bloqueio por rotas sem aprovação de proteção. Não ofereceu aprovação simplificada enquanto faltava essa revisão.

A inspeção detectou linguagem técnica em justificativas antigas e concordância incorreta da recomendação no ambiente com marca própria. As duas apresentações foram corrigidas sem alterar permissões.

**Resultado parcial:** implantação e XLSX simples verificados em produção; autorização e execução real Advanced, entregas sofisticadas e revisão de todas as falhas da suíte ampla continuam pendentes. Não houve validação com participantes leigos reais.


## Refatoração por tipo de trabalho

As telas Escolha automática, Níveis e acesso e Liberações agora explicam atividades de comunicação, análise de materiais e execução em várias etapas. Os exemplos não vinculam cada atividade a um nível. A recomendação principal é deixar a plataforma escolher conforme o trabalho; ajustes de consumo ficam recolhidos.

As solicitações descrevem etapas identificadas no pedido e quantidade real de arquivos. O resumo administrativo contém apenas categorias de atividade e contagens, sem nomes de arquivos, clientes ou trechos privados. Apresentações, planilhas, relatórios e comparação de materiais recebem explicações diferentes. As justificativas históricas são preservadas no banco; a nova apresentação deriva metadados de atividade.

As ações são “Pedir liberação para este trabalho”, “Aprovar para este trabalho”, “Ajustar autorização” e “Não aprovar”. A retomada mantém “Continuar meu pedido”.

A alternativa também depende da atividade: roteiro de slides, planejamento das abas/colunas de uma planilha, resumo descritivo de materiais ou roteiro das etapas. Antes do aceite, a tela informa as ações excluídas. O servidor executa a instrução correspondente ao escopo exibido; nesse caminho não monta arquivos Office, artefatos visuais, imagens, código, pesquisa ou automações. A viabilidade continua passando pelo roteador com os materiais preservados.

Validação específica atualizada: **29 testes de serviços/arquivos aprovados** e **5 testes de navegador aprovados**, com provedores simulados. Inclui duas propostas sintéticas preservadas na retomada, privacidade do resumo administrativo, explicações diferentes por trabalho e execução da alternativa textual sem gerar apresentação. No navegador, os exemplos ficam visíveis, as opções de consumo são secundárias e não há mudança de configuração apenas por consultar a tela.

A suíte ampla de navegador anterior atingiu o prazo de 25 minutos: **328 testes, 292 aprovados, 27 falhas e 9 cancelados**. Abrangeu uma árvore em alteração e não homologa a versão final. As 103 falhas da suíte ampla de serviços também permanecem sem encerramento. Esses resultados não foram convertidos em aprovação pela repetição apenas dos testes específicos.
