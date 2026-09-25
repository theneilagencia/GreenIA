# Plano da Fase 4: validação real da plataforma, antes de qualquer oferta

Situação em 24/09/2026, revisado depois da Fase 3B. Este plano espera o seu aval. Nada da Fase 4 foi executado.

A validação é da plataforma, não de um cliente. A Repet é o primeiro cliente e uma das empresas que o corpus representa; o layout de exportação do sistema dela, se vier, entra como uma variação entre outras.

## Objetivo

Medir se os assistentes montados só por configuração funcionam com o modelo real e com documentos no formato que as empresas usam. O corpus cobre as quatro frentes atuais (Fiscal, RH, Financeiro, LGPD) e duas áreas do segundo tenant de demonstração, a construtora (Suprimentos e Jurídico), com assistentes criados a partir do catálogo. Nenhuma oferta a cliente sai antes do relatório desta fase.

A Fase 4 responde a quatro perguntas, por assistente:
1. Quanto acerta, campo a campo, contra um gabarito escrito antes de rodar?
2. Quantas saídas vão para a revisão com pendência ou aviso?
3. Quanto tempo leva do envio ao rascunho, incluindo a espera pelo modelo?
4. Quanto custa de verdade, e onde o simulador errou a estimativa, e por quanto?

A comparação entre Haiku 4.5 e Sonnet 5 é feita na extração estruturada, onde o modelo decide o resultado. O modelo é escolhido por assistente, não para a plataforma inteira.

## O que não muda

- A plataforma roda como está. Os assistentes são criados pelo painel ou pela API a partir dos modelos do catálogo (`server/catalog/modelos/`), sem código específico. As áreas dos tenants de avaliação são criadas pela API, como num cliente. Uma falha que peça código específico é falha de generalização da plataforma, e o relatório registra.
- Os modelos são escolhidos pela configuração do tenant (`llm.model`). São dois tenants de avaliação, iguais exceto pelo modelo: um com `claude-haiku-4-5` e outro com `claude-sonnet-5`. O resultado é lido por assistente.
- A chave do modelo vem só da variável de ambiente `ANTHROPIC_API_KEY`. Ela nunca vai para o repositório, o log ou o relatório.
- Nenhuma premissa do simulador muda durante a medição. Ajustes vêm depois, como proposta, com o seu aval.

## Corpus

Todos os arquivos ficam fora do repositório, num bucket privado da TheNeil em sa-east-1, com criptografia. No repositório ficam só o manifesto (nome, sha256, tipo, origem) e o gabarito.

| Conjunto | Conteúdo | Quantidade proposta | Quem providencia |
|---|---|---|---|
| Fiscal: notas reais | XML e DANFE (PDF) de notas de compra da própria TheNeil | 30 notas, com XML e DANFE de cada | TheNeil (financeiro) |
| Fiscal: pedidos | Planilhas de pedido montadas a partir dessas notas, em layouts de exportação diferentes (CSV Latin-1 com títulos acima da tabela e rodapé, XLSX com aba "Campo \| Valor", texto de largura fixa, JSON, XML). Nenhum layout é o principal: todos entram com o mesmo peso. Cada layout entra só por um mapeamento de importação criado pela API de configuração ou pela tela; nenhum nome de sistema existe no código. Cada pedido recebe divergências plantadas e registradas no gabarito: quantidade, preço acima e abaixo da tolerância, item sem par dos dois lados, prazo de emissão. | 30 pedidos (1 por nota) | eu gero, você confere o layout |
| Fiscal: DANFE sem XML | Parte das notas enviada só com o DANFE, para conferir o "pedir o XML ao fornecedor" | 8 casos | reaproveita as notas |
| RH: pastas de admissão | Documentos fictícios (RG, CPF, CTPS, comprovante de residência, ASO, título, dados bancários), com a marca "ESPÉCIME" e dados inventados. Uma parte em PDF digital; uma parte impressa e escaneada (150 e 300 dpi); uma parte impressa e fotografada com celular (iPhone em HEIC, Android em JPG), com ângulo, sombra, luz baixa e desfoque leve. Cada pasta tem documentos faltando de propósito. | 15 pastas, cerca de 100 arquivos, com pelo menos 40 fotos reais | eu gero os PDFs; alguém da TheNeil imprime e fotografa |
| RH: degradação sintética | As mesmas páginas com perspectiva, ruído, compressão e rotação aplicadas por script, para ter volume | cerca de 100 imagens | eu gero |
| Financeiro: pacotes do mês | DRE, balancete e razão em PDF longo (30 a 300 páginas, parte escaneada), fluxo de caixa em XLSX no layout de ERP e inadimplência em CSV, todos fictícios | 10 pacotes | eu gero |
| Construtora, Suprimentos: cotações | Cotações de fornecedores de material de obra (PDF digital, escaneado e foto de celular) contra planilhas de especificação de compra, com divergências plantadas de quantidade, unidade e item faltante | 20 casos, cerca de 60 cotações | eu gero |
| Construtora, Jurídico: contratos | Contratos fictícios de fornecimento e empreitada (DOCX, PDF digital e escaneado, 5 a 40 páginas) e 20 perguntas sobre cláusulas de multa, reajuste, garantia e rescisão, com o trecho esperado | 25 contratos, 20 perguntas | eu gero |
| LGPD: evidências | Políticas, atas, listas de presença, contratos, relatórios de incidente e planilhas sem relação, em PDF digital, escaneado, DOCX, DOC e XLSX; 20 perguntas de busca com os documentos esperados | 60 documentos, 20 perguntas | eu gero |

As notas reais da TheNeil têm dados de fornecedores (razão social, CNPJ, endereço). Elas passam pela API da Anthropic, fora do Brasil, como qualquer documento de cliente. A TheNeil é a controladora desses dados; se alguma nota tiver CPF de fornecedor pessoa física, ela fica fora do corpus.

## Gabarito

- Escrito antes de qualquer rodada, em JSON, um arquivo por caso: arquivos (sha256, tipo: digital, escaneado ou foto) e resultado esperado.
- Fiscal: divergências esperadas (chave, campo, valores) e notas que devem virar "pedir o XML".
- RH: situação esperada de cada item (presente, ausente ou duvidoso) e o arquivo que prova.
- Financeiro: cada campo extraído com valor e página de origem; tópicos obrigatórios do resumo.
- LGPD: categoria, período e nome esperado de cada documento; documentos esperados para cada pergunta.
- Suprimentos: itens de cada cotação (descrição, quantidade, unidade, preço) e divergências esperadas contra a especificação.
- Jurídico: para cada pergunta, o contrato, a cláusula e o trecho esperados.
- Uma segunda pessoa confere 20% dos casos. Divergência entre as duas vira discussão e correção antes de rodar.

## Execução

- Um script de avaliação (`server/eval/fase4/`) sobe a plataforma no próprio processo, com o provedor real da Anthropic, o OCR e as conversões reais, Postgres e a fila em memória. Ele envia cada caso pela API de execuções, como uma pessoa faria.
- O script envolve o provedor e o conversor para medir o tempo de cada chamada ao modelo e de cada OCR, sem mudar o código da plataforma.
- Cada caso roda nos dois tenants (Haiku 4.5 e Sonnet 5). A extração estruturada (Financeiro, cotações de Suprimentos e um conjunto extra de documentos de despesa, se precisar de mais volume) roda 3 vezes em cada modelo, para medir a estabilidade.
- Cada assistente fica ligado a um quick win no tenant de avaliação, com janelas de ponto de partida e de medição e ponto de partida informado. Isso valida também a medição automática do quick win (volume, tempo, revisão, consumo) contra os números do script, e que nenhuma execução é contada em dois quick wins (um assistente fica em dois quick wins ativos, com o contexto escolhido na execução).
- O Fiscal não chama o modelo (XML e planilha são lidos em código). Ele roda uma vez e serve de referência de tempo e de acerto sem modelo.
- O fallback de visão fica como nas definições (desligado, exceto no RH). Uma rodada extra do RH com o fallback desligado mostra o que se perde.
- Limite de gasto: cota do tenant de avaliação com bloqueio (`hardLimit`) em R$ 300. Pela estimativa abaixo, a fase inteira fica bem abaixo disso.

## Rodada final (conjunto reservado)

A rodada final só acontece depois das rodadas com o modelo real no desenvolvimento. Depende da chave da API e da conferência dos 20% dos gabaritos.

O reservado roda duas vezes, e cada versão da plataforma usa o reservado uma única vez:

| Rodada | Versão da plataforma | Para quê |
|---|---|---|
| 1 | Tag `fase4-antes-correcoes-checklist` (commit `d4b9f76`): a plataforma antes das correções do checklist (evidência por item, leitura por página, siglas) | Referência: quanto a plataforma acertava antes das correções |
| 2 | Versão final (commit a registrar no relatório no dia da rodada) | Estimativa de acerto que o relatório final apresenta |

- As duas rodadas usam o mesmo corpus (versão 2, com nomes genéricos), a mesma divisão congelada e a mesma matriz de pontuação de três estados (`server/eval/fase4/matriz.json`, com hash). O avaliador e a matriz são os de hoje; muda só o código da plataforma (`server/src`), tirado da tag ou da versão final.
- Cada rodada gera acerto, erros graves, erros comuns e taxa de revisão, por frente e por conjunto.
- Cada uso do reservado fica em `server/eval/fase4/resultados/uso-do-reservado.log`, com a versão da plataforma. Uma segunda rodada da mesma versão não vale: o avaliador recusa.
- Nenhuma correção é feita entre as duas rodadas. A diferença entre elas é o efeito das correções, medido num conjunto que ninguém olhou.

## Modos de classificação: regras × modelo (rodadas com o modelo real, desenvolvimento)

Dois assistentes de referência classificam hoje só por regras. Nas rodadas com o modelo real, cada um é medido nos dois modos, no conjunto de desenvolvimento do corpus versão 2:

| Assistente | Casos | Modo 1 | Modo 2 |
|---|---|---|---|
| Organização de evidências (LGPD) | lotes do LGPD | `classificar.metodo = "regras"` | `classificar.metodo = "modelo"` (Haiku 4.5 e Sonnet 5) |
| Checklist de admissão, PDF digital | pastas do RH, variação digital | `checklist.metodo = "regras"` | `checklist.metodo = "modelo"` (Haiku 4.5 e Sonnet 5) |

- **Para cada modo:** acerto, erros graves, erros comuns e taxa de revisão pela matriz de três estados, por tipo de nome (genérico × descritivo). Também custo por execução medido (tokens e reais) e tempo por execução.
- **A escolha é configuração.** O modo vira o campo `metodo` do assistente, que o cliente troca na definição (versão nova, com auditoria). Nenhum código muda. O relatório recomenda o modo por assistente, pelo menor número de erros graves e, no empate, pelo custo.
- **O reservado roda só no modo escolhido,** nas duas versões da plataforma da rodada final.

## Relatório final: o que registrar sobre o reservado

- **Versão 1 do corpus.** O reservado foi usado uma vez, a pedido, para o resumo da linha de base do RH antes das correções: 6 casos, 42 itens, 78,6% de acerto item a item, 3 erros graves. Só o resumo foi gravado (`resultados/rh-linha-de-base-reservado.json`), e o uso está em `resultados/uso-do-reservado.log`. Nenhum caso do reservado foi aberto para corrigir, e não houve rodada final na versão 1.
- **Versão 2 do corpus.** Mantém os conjuntos da versão 1, com o estrato de tipo de nome sorteado dentro de cada conjunto. O reservado da versão 2 só é usado na rodada final.

## Medidas, por assistente e por modelo

| Medida | Como é calculada |
|---|---|
| Acerto campo a campo | Campo certo depois de normalizar número (±0,01), data e texto. Listas (divergências, itens do checklist, categorias) com precisão e cobertura. Tudo com intervalo de confiança de 95%, separado por tipo de arquivo: digital, escaneado e foto. |
| Erro grave | Fiscal: divergência não apontada. RH: item marcado presente quando está ausente. Financeiro: valor errado com origem aparentemente válida. Suprimentos: divergência de quantidade ou unidade não apontada. Jurídico: cláusula citada com trecho que não está no contrato. Conta à parte, porque é o erro que passa pela revisão. |
| Origem | Percentual de campos com página e trecho que existem no documento. |
| Saída para a revisão | Percentual de execuções com pendência ou aviso (OCR abaixo do limiar, saída fora do schema, campo sem origem, DANFE sem XML, item duvidoso) e percentual de saídas fora do schema. |
| Fallback de visão | Percentual de páginas escaneadas e fotos que caíram no fallback. |
| Tempo total | Do envio ao rascunho, com mediana e percentil 90, separando OCR, conversão, espera pelo modelo e o resto da plataforma. |
| Custo real | Tokens e páginas de cada execução, pela tabela de preços vigente (`usage_events`). Custo por execução e custo por campo certo. |
| Erro do simulador | Para cada execução, o simulador roda com as mesmas entradas (páginas, percentual escaneado) e as premissas atuais. O relatório mostra o erro percentual por assistente e por modelo e decompõe a diferença: tokens por página de texto, tokens por página de visão, taxa de fallback, parte fixa e saída. |

## Estimativa de gasto com o modelo

Pelas premissas atuais: cerca de 3.300 páginas no corpus, 2 modelos, 3 repetições na extração. Isso dá menos de R$ 200 no total, sendo a maior parte o Sonnet 5 nos PDFs longos do Financeiro. O próprio erro dessa estimativa entra no relatório.

## Entregáveis

1. `server/eval/fase4/`: script de avaliação, formato do gabarito, manifesto do corpus e comparador. Um commit por peça.
2. Resultados brutos em CSV (sem conteúdo de documento: só identificadores, medidas e hashes).
3. `RELATORIO-FASE-4.md`:
   - tabelas por assistente e por modelo;
   - os tipos de documento que falham e por quê;
   - a recomendação de modelo por assistente, com custo por campo certo;
   - onde o simulador errou, por quanto e a proposta de novas premissas;
   - o que precisa mudar na plataforma antes da oferta, se algo precisar.
4. Parada para o seu aval antes de qualquer oferta a cliente ou mudança de premissa.

## Critério de decisão sugerido

- Por assistente: fica o Haiku 4.5, a menos que o Sonnet 5 acerte pelo menos 5 pontos percentuais a mais nos campos daquele assistente (ou reduza erro grave) por um custo por campo certo aceitável. Um assistente pode ficar com um modelo e outro com o outro. Esse limite é sugestão; você decide antes de rodar.
- Um assistente só entra no catálogo como pronto para oferta com erro grave abaixo de um limite combinado com você. Sugestão: nenhum item "presente" falso no RH, nenhuma divergência de valor não apontada no Fiscal e nenhuma divergência de quantidade não apontada em Suprimentos, no corpus inteiro.

## O que preciso de você

1. Aval deste plano, do corpus e do critério de decisão.
2. A variável `ANTHROPIC_API_KEY` configurada no ambiente onde a avaliação vai rodar.
3. As 30 notas de compra da TheNeil (XML e DANFE).
4. Uma pessoa para imprimir e fotografar as pastas de RH (iPhone e Android). Sem isso, o RH fica só com escaneamento e degradação sintética, e o relatório diz isso.
5. Um exemplo real de exportação de pedido de qualquer cliente (só o cabeçalho, sem dados), inclusive o do SyGeCom. Entra como mais um mapeamento de importação no corpus (e, para a Repet, no arquivo de implantação), sem substituir os outros layouts.
6. O bucket privado para o corpus (ou autorização para eu criar a estrutura, se a conta estiver acessível daqui).

## Riscos

- **Corpus pequeno.** Com 15 pastas de RH, 10 pacotes financeiros e 20 casos de cotação, os intervalos de confiança ficam largos. O relatório mostra os intervalos, não só a média.
- **Gabarito com viés.** Eu gero parte dos documentos e parte do gabarito. A conferência por uma segunda pessoa reduz esse viés, e as notas reais da TheNeil não são minhas.
- **Fotos reais.** Sem fotos tiradas por uma pessoa, a medida do OCR em celular fica otimista.
- **PDF longo.** Com o limite padrão de 50 páginas por arquivo, um PDF de 300 páginas é lido só em parte, e a execução avisa. Uma rodada com o limite em 300 mostra o custo, o tempo e se a entrada ainda cabe na janela de contexto do modelo (um PDF desse tamanho passa de 200 mil tokens).
- **Rede deste ambiente.** A API da Anthropic está liberada. O HuggingFace e as camadas do `public.ecr.aws` não estão, mas a Fase 4 não depende deles.
