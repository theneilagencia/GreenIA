# Fechamento da correção de pendências · 18/10/2026

## Estado

As pendências de código identificadas nesta continuação foram corrigidas e revalidadas localmente. Os resultados completos e a falha do teste de prontidão estão preservados abaixo. Não há aprovação de produção nem execução comprovada com IA real.

Código da bateria final: commit local `4a48156`, posterior às correções de produto e de preparação dos testes. O reteste de prontidão administrativa usa `286b6f25b9f8eefd5349883131a5f70eca6661c4`, publicado como `28a742eeacf8cbca7efbb7e3baafe119b0697f5e`, ambos com árvore `2d583bd064ed03892332c0b543f226cd3d9f9619`; a única diferença é a espera de renderização no arquivo de teste `e2e/qa-caminho-admin.test.js`, sem alteração de runtime. Equivalente publicado no PR: `736f55aeb3c5700e3e76dd13f504127065c285f7`. Ambos têm exatamente a árvore `a5aa4e978c3264a49fa2f0da6e8cf85e78907cfd`, conferida antes da atualização da branch. Os SHAs de commit diferem porque a publicação usa a API Git. A base de comparação do PR #67 é `3a133e3425a6e574cff39a788c90797a91e79864`.

## Defeitos do produto corrigidos nesta continuação

| Caso | Comportamento corrigido | Evidência executável |
|---|---|---|
| Dois formatos no mesmo pedido | PowerPoint não impede materializar também o Word solicitado. Arquivos especializados não são duplicados | `e2e/assistente-mensagens.test.js`: baixa os dois arquivos e abre os pacotes Office |
| Fontes da referência | Uma fonte indisponível deixa de ser substituída silenciosamente quando o pedido exige as mesmas fontes. Solicita PDF de referência antes de inferência ou consumo | `test/producao-visual.test.js`: fonte Inter presente no XML dos slides; Montserrat bloqueada com zero chamadas, uso e arquivos |
| Motivo do bloqueio | Falta de capacidade fica registrada como capacidade insuficiente, em vez de indisponibilidade genérica | `src/roteador.js`, bateria de roteamento |
| Estimativas de Quick Wins | Resposta declara unidade de créditos, mantendo a conversão de valores no contexto da empresa | `test/quickwins.test.js`, `test/plano.test.js` |
| Faixas de consumo | Os rótulos econômico, médio e alto deixam de virar zero na conversão financeira. Valores numéricos continuam convertidos; preços e financeiro permanecem ocultos | `test/plano.test.js`, `test/sugestao-modelos.test.js`, `test/multiempresa.test.js` |
| Marca da empresa | Opções nativas do seletor deixam de expor o nome GreenIA em instalações com marca própria | `e2e/marca-branca.test.js` |
| Títulos no celular | Cabeçalho passa a permitir quebra de linha e altura adequada para nomes longos | `e2e/qa-caminho-admin.test.js`, `e2e/qa-caminho-console.test.js` |
| Contexto de Administração | Uso e resultados da empresa preserva o menu administrativo e a indicação de item ativo, incluindo parâmetro de consulta | `e2e/qa-caminho-uso.test.js`, `e2e/qa-ux-admin.test.js` |
| Resposta após navegação | A atualização tardia da conversa deixa de manipular elementos de outra tela ou gerar erro de JavaScript | `e2e/quickwin2.test.js`: atraso na leitura da conversa, navegação e ausência de erro |
| Configuração de modelos | Salvar uma sugestão preserva os detalhes abertos pela pessoa; a tela continua simples e fechada por padrão | `e2e/sugestao-modelos.test.js` |
| Crédito versus resultado | Título Créditos do plano acompanha o menu e recebe ícone próprio | `e2e/qa-ux-admin.test.js` |
| Promessa comercial | Removida a promessa de limites por equipe e ausência de surpresas sem sustentação na implementação | `test/claims-lp.test.js`, `test/vendas.test.js` |

As correções anteriores deste mesmo PR — URLs de fontes, pesquisa obrigatória em Quick Wins, intenção de pesquisa, limpeza do streaming e encerramento do servidor quando o navegador falha — estão descritas em [correcoes-pesquisa-fontes-20261018.md](correcoes-pesquisa-fontes-20261018.md) e também integram a bateria final.

## Correções da própria validação

1. **Advanced**: cenários positivos antigos habilitavam somente um grupo. Agora recebem autorização administrativa explícita com pessoa, modelos, rota, orçamento e validade. `test/advanced-fixture.js` identifica o catálogo como fictício; não confirma existência, capacidade ou preço atual de modelo real. Casos negativos continuam exigindo bloqueio e nenhuma chamada ao provedor.
2. **Capacidade e reserva**: removidas expectativas de responder com capacidade inferior quando o trabalho exige mais, ou usar uma reserva não autorizada. Preferência manual, roteamento desligado e Quick Win fixo não concedem autorização nem dispensam capacidade. A delegação automática ao provedor continua vedada.
3. **Matriz e propriedades**: catálogo e concessões sintéticas explícitos; dimensão `leitura_longa` correspondente ao código; cada banco é encerrado. Exige avaliação dos 400 cenários, cobertura de bloqueio e execução nas três classes e conferência independente das autorizações. Não usa uma porcentagem arbitrária de execuções como justificativa para reduzir capacidade.
4. **Layout e materialização**: referência genérica de layout declarada com `REFERENCE`; metadado atual `resposta_materializada`; conteúdo do arquivo conferido após download. Não basta encontrar um cartão ou texto prometendo a entrega.
5. **UX atual**: navegação, seis abas do console, FAQ dedicada, captura comercial atual e painéis opcionais substituem seletores antigos. Contraste, dimensões e ausência de rolagem horizontal continuam verificados. Editor verifica carregamento efetivo do frame e estabilidade da navegação.
6. **Claims**: textos removidos da LP ficam como obsoletos no registro; novos textos têm evidência e testes. A quantidade mínima arbitrária de frases foi substituída por presença dos claims obrigatórios e validação de todas as linhas sustentadas.
7. **Prontidão da primeira tela**: a ausência de `aria-busy` num `main` ainda vazio não é prova de renderização. O teste administrativo agora exige o título renderizado, ausência de carregamento e fontes prontas antes de medir. A reprovação observada na bateria completa fica preservada, sem flexibilizar o número de ações ou os limites de layout.
8. **Infraestrutura de teste**: executável explícito do navegador tem prioridade. O processo de teste encerra o navegador e o servidor mesmo se o lançamento indevidamente tiver sucesso. Não foi acrescentado `force-exit` para ocultar vazamento.

As 73 reprovações de serviço originais permanecem identificadas e classificadas em [pendencias-varredura-20261018.md](pendencias-varredura-20261018.md). A rodada inicial completa de navegador encontrou 353 testes: 313 aprovados, 39 falhas e um cancelamento; esse resultado foi usado para reproduzir as falhas e não foi tratado como aprovação. Rodadas interrompidas também não contam como aprovadas. Retestes específicos não são somados à bateria global.

## Bateria final

| Execução | Total | Aprovados | Falhas | Cancelados | Ignorados |
|---|---:|---:|---:|---:|---:|
| Serviços completos | 1.200 | 1.200 | 0 | 0 | 0 |
| Navegador completo, antes do ajuste da espera | 353 | 352 | 1 | 0 | 0 |
| Reteste do arquivo administrativo após ajustar a espera | 9 | 9 | 0 | 0 | 0 |

A falha da rodada de navegador foi `caminho claro em 1366 px`: o teste registrou zero ações na primeira vista de Visão geral. Sua condição de prontidão aceitava o `main` inicial vazio. O ajuste passou a exigir título renderizado e fontes prontas; o reteste mantém exatamente os limites de UX. A rodada completa **permanece registrada como 352 aprovados e uma falha**, sem reescrever o histórico.

A consolidação usa a última evidência de cada caso: **353 cenários únicos com evidência final aprovada**, substituindo os nove resultados administrativos pelos nove retestes, sem somar execuções repetidas. Não é apresentada como uma nova rodada completa de 353 testes com zero falhas. Não houve mudança de runtime após a rodada completa de serviços e navegador.

Evidências: [TAP de serviços](evidencias/20261018/servicos.tap), [TAP completo de navegador](evidencias/20261018/navegador-completo.tap), [reteste administrativo](evidencias/20261018/navegador-prontidao.tap), [consolidação por caso](evidencias/20261018/navegador-consolidado.json) e [manifesto com hashes SHA-256](evidencias/20261018/manifesto.json). As 39 falhas e um cancelamento da primeira rodada de navegador também estão preservados em [reprovações iniciais](evidencias/20261018/navegador-reprovacoes-iniciais.json).

Comandos:

```sh
node --test --test-reporter=tap --test-concurrency=4 test/*.test.js
node --test --test-reporter=tap --test-concurrency=4 e2e/*.test.js
node --test --test-reporter=tap --test-concurrency=1 e2e/qa-caminho-admin.test.js
```

Node 24.19.0. Banco SQLite, servidor HTTP, navegação, downloads, arquivos Office, leitura de PDF e OCR são executados pelos testes. Inferência de IA usa servidor HTTP simulado. Chromium Headless Shell instalado pelo Playwright, exposto localmente no caminho esperado pelos testes; o Chromium completo não inicia neste ambiente. Nenhuma instalação desse atalho foi feita no produto.

## Limite de aprovação

A aprovação local não valida respostas de modelos reais, disponibilidade, preços ou catálogo atual do provedor. A validação com IA real não foi executada nesta continuação. No histórico recebido, o acesso à Homologação A havia sido recusado e a versão implantada diferia da candidata; não se presume que esses bloqueios tenham sido resolvidos. Uma tentativa de consulta pelo conector Render nesta continuação retornou `no workspace selected`; nenhum workspace foi selecionado, serviço consultado ou configuração alterada. A versão atualmente implantada não foi reconfirmada.

Para concluir a aceitação com IA real, é necessário usar uma conta autorizada em um ambiente com a mesma versão candidata, executar entregas representativas e casos negativos, conferir os arquivos e confrontar chamadas, tentativas, consumo e registros com o provedor. Sem essa evidência, produção continua sem liberação.

Nenhum serviço pago foi criado. Não houve publicação, alteração de produção ou enfraquecimento de autorização para viabilizar os testes.
