# Execução da candidata com IA real no serviço existente

Preparação executável, ainda sem inferência real nesta continuação. PR #67 integrado na branch de QA em `f91a45534229b2df3672bff0e038a3ad67b6f3a8`, árvore `e6269f32dd53893a724d58121fba194a3d11062c`. Produção continua em `9d4780f`, conforme consulta anterior desta continuação. Esta preparação altera apenas scripts de QA e seus testes; não altera o runtime do produto.

## Como funciona

`scripts/qa-baixar-candidata.mjs` baixa um SHA imutável do repositório público para `/tmp`, reutiliza `/app/node_modules` e executa `scripts/qa-render-isolado.mjs`. Não precisa de novo serviço, deploy, reinício ou instalação npm. Exige Shell autenticado no serviço existente, Node compatível, `tar`, acesso HTTPS e as dependências já instaladas.

O launcher abre apenas `platform_settings.openrouter_chave` no SQLite de produção em modo **somente leitura**, decifra o valor em memória com a chave-mestra existente e fecha a conexão. Se não houver chave salva no console, usa a variável já configurada no serviço; se a chave salva não abrir, interrompe em vez de trocar silenciosamente de credencial. Não lê usuários, OTPs, sessões, documentos ou conversas do cliente. Não imprime a credencial, não a coloca em argumentos ou em arquivo de chave, nem a envia ao GitHub.

O processo filho recebe a chave pelo descritor 3 e uma lista explícita de variáveis, sem bancos, SMTP ou segredos de integrações da produção. Cria banco e empresa fictícios sob diretório temporário privado, com chave de cifragem aleatória, e escuta exclusivamente em `127.0.0.1` numa porta efêmera. A limpeza do diretório de bancos é feita pelo launcher inclusive após falha ou encerramento do filho. Os relatórios com materiais fictícios permanecem na pasta temporária da candidata; são efêmeros e precisam ser recolhidos antes da remoção do container.

## Execução e consumo

O roteiro cobre os 15 cenários principais, 10 surpresas e a amostra de cinco trabalhos nas três classes. As contas, a empresa e os materiais são sintéticos. A inferência usa a implementação real do cliente OpenRouter. O catálogo e as rotas Advanced são consultados no provedor, sem usar `advanced-fixture.js`. As aprovações e autorizações explícitas existem somente no banco temporário e têm orçamento e validade. Nenhuma proteção de retenção, treino, capacidade ou autorização da produção é alterada. Um bloqueio por capacidade ou rota indisponível fica registrado e requer classificação; não é convertido automaticamente em defeito nem em aprovação.

Parada antes de nova inferência após **180 tentativas** ou **US$ 2 de custo observado**, e prazo de 45 minutos. **US$ 2 não é teto rígido**: o custo só é conhecido depois da chamada, que pode ultrapassar esse valor. Recibo com custo pendente ou streaming interrompido bloqueia a próxima inferência. Chamadas reais consomem o saldo existente de IA; não há nova assinatura de servidor.

Cada tentativa registra modelo pedido e retornado, geração, provedor quando informado, duração, HTTP, tokens e custo informado pelo provedor. Ausência de custo permanece `null`; o total também permanece pendente. A parcela confirmada é identificada separadamente. Tentativas que falharam não desaparecem do relatório. Identificador de geração é uma referência para conciliação posterior, não prova independente de correção da resposta. O coletor não promete uma auditoria financeira completa do provedor.

HTTP 200, presença de texto e autoavaliação do modelo não bastam: o roteiro verifica evento final, recibo, uso do material e critérios de cada cenário. Arquivos e adequação do trabalho ainda precisam ser conferidos; login de Homologação A, configurações do cliente e casos negativos implantados têm aceitação própria. O relatório mantém `liberacaoProducao: false`, inclusive se a execução terminar sem erros. Código de saída 2 significa falha, interrupção ou cobertura incompleta; zero significa apenas que as verificações automatizadas configuradas não reprovaram.

## Verificações locais desta preparação

- Quatro testes do coletor passaram: custo ausente/textual, zero explícito, tentativas cobradas que falharam, recibos, resposta vazia, evento final ausente e streaming interrompido
- Sintaxe dos scripts e `git diff --check` passaram
- Autoteste do modo interativo com provedor HTTP falso concluiu 32 chamadas locais; não prova IA real, não é aprovação e não foi somado às 1.200 verificações anteriores

Não há sessão Render autenticada disponível ao agente. Por isso o próximo passo concreto é executar o bootstrap no Shell do serviço já contratado e recolher o relatório. Até lá a validação com IA real permanece pendente.
