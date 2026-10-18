# Correções de pesquisa, fontes e encerramento de execução

Base: `3a133e3425a6e574cff39a788c90797a91e79864`, branch de QA. Sem criação de serviço, cobrança nova ou publicação em produção.

## Defeitos reproduzidos e alterações

1. **URLs externas corrompidas**: o filtro transformava `https://github.com/OpenRouterTeam/docs/blob/main/README.md` em um endereço contendo `serviço de IATeam`. O teste novo reprovou antes da alteração. URLs externas agora são preservadas integralmente; endereços da infraestrutura do provedor continuam ocultos. Conferência por HTTP inclui citações no resultado e no histórico reaberto.
2. **Pesquisa obrigatória substituída em Quick Wins**: com pesquisa desabilitada, o servidor respondia HTTP 200 e executava IA para uma entrega reduzida. O cenário atualizado reprovou antes da alteração. A execução agora bloqueia antes da inferência, registra o motivo e não gera débito ou resposta substituta. Inclui Quick Win publicado, retomada na mesma conversa após liberação e execução programada sigilosa.
3. **Consulta externa acionada por data**: `pedePesquisa('Escreva um email para a equipe hoje.')` devolvia `true` na base. Datas de execução isoladas deixam de acionar a busca. Pedidos de notícias, consulta à documentação e pesquisa continuam identificados; criar um agente não executa antecipadamente a pesquisa que ele fará depois. Testes de HTTP verificam ausência do plugin externo, não apenas o classificador.
4. **Temporizador de streaming sobrevivendo ao agendamento**: a limpeza escutava apenas `close`; a saída do agendador emite `finish`. A execução deixava um intervalo ativo e o processo de teste não encerrava. Agora ambos os eventos encerram o intervalo e removem os listeners; um `finally` também garante a limpeza em retorno antecipado, erro ou saída que não emita esses eventos. A regressão de processo exige execução do cenário e término normal dentro do prazo, sem `--test-force-exit`.
5. **QA preso se o navegador não inicia**: o servidor de apoio ficava aberto quando a criação do navegador falhava. A inicialização agora fecha os recursos e propaga o erro original. Teste em processo separado usa um executável que falha deliberadamente e exige saída de erro normal, sem timeout.

## Preparação dos testes

- O cenário positivo de imagem passa por bloqueio real sem acesso antes de receber uma autorização Advanced por API administrativa. Não foi alterada a política para liberar o teste.
- O teste de pesquisa desabilitada conferia a última chamada antiga do provedor. Agora exige HTTP 409 e nenhuma chamada nova, evitando inspecionar uma execução anterior como evidência.
- Política e suporte à empresa utilizam a semântica atual de Advanced e créditos; grupos legados não concedem Advanced, e o contexto da empresa não exibe dólares nem quando acessado pelo suporte.
- O cenário de sigilo programado sem pesquisa continua testando fornecedor fixado. Um cenário separado exige o bloqueio quando a própria programação depende de pesquisa externa.

## Validação

Inferência simulada por servidor HTTP local. Arquivos Office, banco, rotas e navegador utilizados nos cenários não são substituídos por declarações de sucesso. Esses resultados não comprovam qualidade de IA real nem disponibilidade em produção.

Resultado da regressão específica: **89 testes de serviço aprovados, zero falhas/cancelados/ignorados**. A bateria de navegador abaixo aprovou **7 cenários**, sem falhas/cancelados/ignorados. Não somar retestes ou contagens anteriores a esses totais.

Comandos de regressão:

```sh
node --test --test-concurrency=2 test/provedor-oculto.test.js test/quickwin-operacao.test.js test/quickwin-pesquisa-externa.test.js test/provedores-ia-sigilo.test.js test/chat-pesquisa-intencao.test.js test/paridade-chat.test.js test/admin.test.js test/area-reforcada.test.js test/advanced.test.js test/qa-navegador-falha.test.js
node --test --test-concurrency=1 e2e/pesquisa-orientacao.test.js e2e/advanced.test.js
```

Na máquina desta rodada, o Chromium completo não inicia por restrição de socket do ambiente. O Chromium Headless Shell instalado pelo Playwright inicia; a bateria de navegador usa esse executável padrão, sem alterar o isolamento do produto.

## Limites e pendências

A varredura ampla também encontrou reprovações fora destas correções, incluindo testes de roteamento/Advanced, retenção, adaptação de apresentações e consistência da LP. Não foram convertidas em aprovação, ignoradas ou removidas. A lista está em [pendencias-varredura-20261018.md](pendencias-varredura-20261018.md) e foi investigada na continuação, documentada em [fechamento-pendencias-20261018.md](fechamento-pendencias-20261018.md). Este relatório preserva os resultados da primeira bateria e não representa o estado final da continuação.

Não foram executadas chamadas ao provedor real nem publicação. Não há aprovação para liberar o cliente. A infraestrutura de homologação adicional não é condição para aceitar estas correções locais e não foi criada nesta rodada.
