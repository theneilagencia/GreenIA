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

Outro teste real pediu XLSX com três tarefas, nomes e datas fixos. O modelo retornou linhas de tabela sem separador e afirmou que o arquivo estava disponível, sem entregar cartão de arquivo. **Caso reprovado.** Esse caso motivou a correção de materialização e o teste de regressão. O reteste com inferência real após publicação ainda precisa ser registrado.

A conta de produção não tinha concessão Advanced, teto mensal Advanced disponível nem aprovação das rotas necessárias. Nenhuma proteção ou autorização foi concedida automaticamente para fazer o teste passar. A execução real Advanced e a qualidade final de entregas sofisticadas continuam sem homologação.
