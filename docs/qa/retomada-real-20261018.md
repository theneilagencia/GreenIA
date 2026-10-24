# Análise da retomada com IA real

Fonte: resumo entregue pelo usuário em `Texto colado(20261018-133840).txt`. Candidata `c54a621b281ab47ec50e92da3fc8ece0a5d4a449`, pasta do serviço existente `/tmp/greenia-candidata-hd7JM0/qa-candidato-saida`. O log informa SHA-256 do relatório integral `a7963cb227a0aeab08d43b4c0264a58e2e004228d3d2ed2ad4af227aff2a4430`; a saída anexada é um resumo e não permite recalcular esse hash do arquivo integral.

## Recibos e limites

109 tentativas, 109 recibos com geração e modelo, custo informado pelo provedor de US$ 0,92152660, nenhuma tentativa com custo pendente nesta rodada. A coleta JSON de imagens funcionou. Esses valores não foram conciliados independentemente com o extrato do provedor; o custo da primeira rodada continua incompleto. Não se soma esse valor a um total financeiro presumido da primeira rodada.

## O que a evidência permite afirmar

| Ocorrência | Diagnóstico |
|---|---|
| Planilha marcada PASS | Falso positivo confirmado na aprovação automática: ranking incorreto e percentuais incorretos. O conferente também rejeitou contas legítimas como invenção. A execução não está aceita |
| E-mail marcado FAIL | O teste rejeitava qualquer canal quando o pedido não citava redes sociais; `email` é um canal válido para esse pedido. A correção do teste não dispensa conferir o texto entregue |
| Pendências, cobrança e atendimento: 403 | Código `advanced_necessario`. A preparação de QA não concedeu autorização: `autorizacoesLocais` está vazio. Causa reproduzida localmente: a API da empresa retira preços do catálogo, mas o roteiro exigia esses campos para preparar a rota. Além disso, só considerava o modelo antigo já habilitado. Não é prova de credencial recusada nem motivo para desativar autorização |
| Classe Advanced: cinco bloqueios | Mesmo problema de preparação. Não houve inferência Advanced nessa amostra |
| Rápido em contrato, fornecedores e reunião | `sem_modelo`, sem inferência de execução. Não reduzir requisitos para obter uma resposta; precisam ser tratados como casos de capacidade, não presumidos defeitos |
| Facilities U05 | `inconsistente`, sem os itens detalhados da conferência no resumo. Texto e material anterior precisam ser inspecionados antes de mudar o produto |
| Auditoria U10 | `sigilo_nao_permitido`, sem envio na etapa de execução. O conteúdo sintético que causou a classificação precisa ser recuperado; não se presume falso bloqueio nem se desliga a política |

## Conferência independente da planilha

O ranking calculado sobre os 116 realizados conhecidos começa por `L118`, `L012`, `L092`, `L039`, `L103`, nessa ordem. O texto entregue trocou posições e chamou gastos menores de maiores sem preservar o ranking. `L092` representa 1,36498783% do total conhecido, arredondado a **1,36%**, não 1,37%; `L103` representa 1,34478142%, arredondado a **1,34%**, não 1,35%. A participação de `L118` em 11,49% e a diferença de R$ 184.032 são cálculos válidos, não invenções.

O texto também combina totais de grupos com números de variação apurados só nas linhas comparáveis sem explicitar seus dois denominadores. O código já comparava pares corretamente, mas não apresentava as duas somas desses pares. A extração agora inclui ranking e participações calculadas, além dos totais comparáveis, para execução e conferência. Valores ausentes continuam distintos de zero. O teto de texto calculado aumenta de 4.000 para 8.000 caracteres; isso pode aumentar o contexto e o consumo da análise e requer revalidação real.

`qa-planilha-oraculo.mjs` confere o ranking e os percentuais dessa fixture específica por código, sem aceitar a nota do modelo como prova. Formato que o oráculo não consegue conferir fica pendente, nunca aprovado por ausência de erro. A resposta real reprovada foi preservada como fixture de regressão. O oráculo não pretende validar toda análise financeira nem todos os fatos do texto.

## Outras correções preparadas

- Canais do QA: compara cada canal com o pedido. Pedir email não autoriza LinkedIn, nem citar uma rede autoriza todas
- Preparação Advanced: usa `lerModelos(db)` no banco temporário da empresa fictícia, onde o catálogo conserva os preços consultados. A API pública da empresa continua ocultando-os. Considera a curadoria atual, inclusive modelos inicialmente desabilitados na empresa fictícia. Seleciona uma rota com contexto, saída, parâmetros e preços confirmados, respeita vetos, registra habilitação, revisão, autorização, orçamento e validade pelas APIs administrativas locais. Se não houver rota, mantém a etapa pendente. Não amplia metadados nem concede acesso em produção
- Quick Wins sem status positivo da conferência não recebem aprovação automática
- Retomada: o PASS antigo da planilha sem conferência numérica independente não é herdado como aprovação

## Validação local e pendências

20 testes específicos passaram, incluindo reprodução do falso PASS com o texto real e bloqueio de catálogo Advanced vencido, vetado, sem contexto ou sem preço. Uma integração com servidor HTTP e banco locais comprova que a API da empresa continua ocultando o preço e que a preparação pelo catálogo interno registra revisão, habilitação, autorização e teto de US$ 2 pelas APIs administrativas. Inferência dos testes locais é simulada. A nova preparação Advanced ainda não foi executada contra IA real.

A regressão ampla local detectou ausência do executável de composição em três casos visuais. Depois de instalar o Chromium Headless Shell no ambiente local transitório, os três passaram em retestes específicos sem alterar o produto para fazê-los passar. O arquivo `visual-design-ia.test.js` também ficava preso após falhar a composição: seu servidor de teste não era fechado se `comPagina` lançasse erro. O fechamento agora ocorre em `finally`, mantendo as mesmas exigências de isolamento de rede e JavaScript. O arquivo completo passou em 16 testes. A rodada ampla anterior foi interrompida com código 130 e continua incompleta; não é reescrita como uma execução integral sem falhas, nem somada aos retestes como casos extras.

Os logs desta continuação ficam em `evidencias/20261018/pos-retomada/`. O arquivo de serviços registra a rodada interrompida; os demais registram verificações específicas concluídas. Não houve nova bateria completa de navegador.

Antes de nova rodada paga de IA, recuperar os materiais já salvos de email, facilities, atendimento e auditoria e o catálogo registrado nessa rodada. A coleta é somente leitura de arquivos sintéticos temporários, sem nova inferência, credenciais ou leitura dos bancos de produção. Sem esses materiais, as causas dos casos restantes não estão resolvidas. Produção permanece sem liberação e sem deploy.
