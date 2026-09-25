# Fase 4: corpus, gabarito e avaliação

Validação da plataforma (não de um cliente), conforme `PLANO-FASE-4.md`. Esta pasta tem o que não depende de insumos externos: os geradores dos documentos fictícios, o formato do gabarito, os gabaritos congelados e um primeiro comparador.

Tudo é fictício: pessoas, empresas, CNPJs e valores inventados, com a marca "ESPÉCIME · DOCUMENTO FICTÍCIO" em todas as páginas. Os CPFs têm dígitos verificadores válidos, para o filtro de dados agir como agiria com um documento real; os números são sorteados. A mesma semente gera os mesmos arquivos (mesmo sha256).

## O que existe

| Peça | Arquivo | O que faz |
|---|---|---|
| Formato do gabarito | `gabarito.schema.json` | JSON Schema de um caso: arquivos (nome, sha256, tipo, origem), resultado esperado por frente, conferência pela segunda pessoa |
| Validador | `validar.ts` | Confere cada `gabarito.json` no schema e o sha256 de cada arquivo em disco |
| RH | `gerar-rh.ts` | 15 pastas de admissão, cada uma de uma pessoa inventada, com documentos faltando de propósito (ausente) ou só citados na ficha (duvidoso). Gera o roteiro das fotos de celular |
| Degradação sintética | `degradar.ts` | Renderiza as páginas e simula escaneamento ruim e foto de celular (perspectiva, rotação, ruído, desfoque, sombra, JPEG); cria a variação `-sintetica` de cada caso |
| Variação por imagens | `variante.ts` | Cria a variação de um caso a partir das fotos reais (ou de escaneamentos), com o mesmo esperado e os sha256 das imagens |
| Construtora, Suprimentos | `gerar-construtora.ts` | 20 especificações de compra (XLSX) × 3 cotações (PDF ou DOCX) = 60 casos, com divergências plantadas: quantidade, unidade, item faltante na cotação, item cotado sem especificação. A primeira cotação de cada especificação vem limpa (controle) |
| Construtora, Jurídico | `gerar-construtora.ts` | 25 contratos (DOCX ou PDF, 5 a 40 páginas) com partes, vigência, reajuste, multa, rescisão, confidencialidade e foro; um terço sem alguma cláusula (esperado: nulo). Mais 20 perguntas com o contrato, a cláusula e o trecho esperados |
| Fiscal | `gerar-fiscal.ts`, `mapeamentos/` | 30 casos: NF-e fictícia (XML de homologação e DANFE) × pedido de compra em cinco layouts neutros de exportação (layout-a CSV Latin-1 com títulos e rodapé, layout-b XLSX com aba Campo \| Valor e código e descrição na mesma coluna, layout-c TXT de largura fixa, layout-d JSON em caixas com fator 10, layout-e XML). O mapeamento de cada layout fica em `mapeamentos/`, no formato do núcleo; o gabarito usa só os campos normalizados. Divergências plantadas: quantidade, preço fora da tolerância, item só na nota, item só no pedido, emissão fora do prazo e o total. Preço dentro da tolerância fica em `dentroDaTolerancia`. 6 casos limpos, 8 só com a DANFE (pedir o XML) |
| Financeiro | `gerar-financeiro.ts` | 10 pacotes do mês: DRE, balancete e razão em PDF (30 a 300 páginas), fluxo de caixa em XLSX e inadimplência em CSV. Gabarito: periodo, receita_total, despesa_total e resultado de cada PDF, com a página; tópicos do resumo; fatos de caixa e inadimplência |
| LGPD | `gerar-lgpd.ts` | 60 documentos em 6 lotes de 10 (PDF, DOCX e XLSX): categoria da taxonomia, período e nome padronizado de cada um; planilha sem relação com categoria nula; 20 perguntas de busca. DOC fica de fora (gerar exige o LibreOffice) |
| Peças comuns das três frentes | `lib-extra.ts` | CNPJ fictício válido, Latin-1, datas, e a leitura de referência de um pedido pelo mapeamento |
| Gabaritos congelados | `gabaritos/`, `congelar.ts` | Os 100 gabaritos do corpus oficial, versionados antes de qualquer rodada. O teste `fase4-corpus` gera o corpus de novo e compara |
| Comparador RH sem modelo | `avaliar-rh-offline.ts` | Roda a leitura e o checklist por regras da plataforma, com a definição do modelo do catálogo, e compara item a item. Com `--ocr sim`, as imagens passam pelo OCR local |

## Como rodar

```sh
cd server
node --experimental-strip-types eval/fase4/congelar.ts --saida eval/fase4/saida      # corpus oficial + gabaritos congelados
node --experimental-strip-types eval/fase4/degradar.ts --saida eval/fase4/saida --frente rh
node --experimental-strip-types eval/fase4/validar.ts --saida eval/fase4/saida
node --experimental-strip-types eval/fase4/avaliar-rh-offline.ts --saida eval/fase4/saida [--ocr sim]
node --experimental-strip-types eval/fase4/gerar-fiscal.ts --saida eval/fase4/saida --casos 30 --semente 4301
node --experimental-strip-types eval/fase4/gerar-financeiro.ts --saida eval/fase4/saida --pacotes 10 --semente 4302
node --experimental-strip-types eval/fase4/gerar-lgpd.ts --saida eval/fase4/saida --casos 6 --semente 4303
```

`eval/fase4/saida/` fica fora do repositório (`.gitignore`); o corpus vai para o bucket privado da TheNeil quando ele existir.

## Formato do gabarito

Um `gabarito.json` por caso, ao lado dos arquivos:

- `caso`, `frente` (fiscal, rh, financeiro, lgpd, suprimentos, juridico), `tenant` (demonstracao ou construtora), `modelo` (modelo do catálogo de onde o assistente é criado), `variacao`.
- `arquivos`: nome, sha256, tipo (digital, escaneado, foto, xml, planilha) e origem (gerado, degradacao-sintetica, foto-manual, theneil).
- `esperado`, por frente:
  - RH: situação de cada item (presente, ausente, duvidoso) e o arquivo que prova. Erro grave: item marcado presente quando está ausente.
  - Suprimentos: itens da cotação (código, descrição, quantidade, unidade, preço) e divergências contra a especificação. Erro grave: divergência de quantidade ou unidade não apontada.
  - Jurídico: para cada campo, a cláusula e o trecho que precisa aparecer na saída; nulo quando o contrato não tem a cláusula. Erro grave: trecho citado que não está no contrato.
  - Fiscal: nota (chave, XML, DANFE), pedido (layout, mapeamento e registros normalizados), divergências nos campos normalizados (esperado = pedido, encontrado = nota), diferenças dentro da tolerância e as chaves para pedir o XML. Erro grave: divergência não apontada.
  - Financeiro: cada campo extraído de cada PDF, com valor, página e trecho; nulo quando o documento não tem o campo. Tópicos obrigatórios e fatos de caixa e inadimplência. Erro grave: valor errado com origem aparentemente válida.
  - LGPD: categoria, período e nome padronizado de cada documento (nulos para o que não tem relação) e os documentos esperados de cada pergunta.
- `conferencia`: 20% dos casos marcados como amostra para a segunda pessoa conferir (`por`, `em`, `divergencias`).

## Como reportar: de qual conjunto vem cada número

Todo número deste README e do relatório final traz o conjunto de origem e a natureza. `pontuar.ts` recusa qualquer outra combinação:

| Natureza | Conjunto | Uso |
|---|---|---|
| Estimativa de acerto | só o reservado, na rodada final | O que o relatório final promete ao cliente. Uma por frente, pela matriz de três estados. |
| Medição de desenvolvimento | desenvolvimento | Serve para corrigir e comparar versões (antes × depois). Não é estimativa: as correções foram feitas olhando para esses casos. |
| Prova de generalização | desenvolvimento, casos equivalentes de outra área (construtora) | Mostra que uma correção feita por causa de uma frente vale em outra área e em outro modelo sem mudança de código. Não é estimativa de acerto. |

Hoje não há nenhuma estimativa de acerto: o reservado só roda na rodada final, depois das rodadas com o modelo real no desenvolvimento. A única exceção foi a linha de base do RH, pedida explicitamente e registrada em `resultados/uso-do-reservado.log`. Ela está rotulada abaixo e não é estimativa da plataforma corrigida.

## Divisão: desenvolvimento e reservado

`dividir.ts` separa cada lote (frente + procedência: `gerado`, depois `pncp`) em desenvolvimento (60%) e reservado (40%). O resultado fica congelado em `divisao.json`, com o sha256 em `divisao.sha256`. O teste `fase4-divisao.test.ts` confere o hash, a cobertura de todos os gabaritos e que a divisão refeita dá o mesmo resultado.

- Unidade: o caso. Em Suprimentos, a especificação inteira (todas as cotações dela), porque as cotações dividem a mesma planilha.
- Estratos: tipo de caso (completo, ausente, duvidoso, cada tipo de divergência, cláusula faltante), formato e origem (digital, escaneado, foto).
- As variações escaneada (`-sintetica`) e fotografada (`-fotos`) herdam o conjunto do caso de origem. Cada origem fica com a mesma proporção.
- A divisão usa só o gabarito congelado e uma semente fixa (4401). Não olha resultado.
- Lote congelado não é refeito. Casos novos (construtora, PNCP, fiscal, financeiro, LGPD) entram em lotes próprios.
- O reservado só roda com `--conjunto reservado --rodada-final sim`. Cada uso fica em `resultados/uso-do-reservado.log`, e a saída traz só números agregados.

Resultado: RH 9 casos no desenvolvimento e 6 no reservado; Suprimentos 12 especificações (36 cotações) e 8 (24); Jurídico 15 e 10 contratos; Fiscal 18 e 12 (os cinco layouts nos dois conjuntos); Financeiro 6 e 4 pacotes; LGPD 4 e 2 casos. No Fiscal, o layout de exportação também é estrato.

### Fiscal: importação pelos mapeamentos

Os pedidos do Fiscal chegam em cinco layouts (`mapeamentos/layout-a.json` a `layout-e.json`). O teste `fase4-fiscal-importacao.test.ts` cria cada mapeamento pela API de configuração, com um arquivo de exemplo do próprio layout, e roda o modelo `conferencia-nota-pedido` do catálogo, sem ajuste, nos casos do desenvolvimento. Resultado [desenvolvimento · medição de desenvolvimento, não é estimativa de acerto]: 18 de 18 casos (layout-a 3, b 4, c 3, d 4, e 4); pela matriz, acerto 98,6%, 0 erro grave, 0 erro comum, revisão 1,4%. O leitor do núcleo também lê os 30 pedidos exatamente como o gabarito.

Ressalva: antes de congelar a divisão das frentes novas, o teste rodou uma vez nos 30 casos do Fiscal, desenvolvimento e reservado juntos (30 de 30) [antes da divisão · não é estimativa de acerto]. Nada foi corrigido depois disso; a partir da divisão, o teste usa só o desenvolvimento.

Ressalva: a linha de base abaixo, com resultado por caso dos 15 casos, foi gravada antes da divisão. As categorias de erro foram vistas em todos os casos. As correções seguem estas categorias gerais e são medidas só no desenvolvimento; nenhum caso do reservado é aberto para corrigir.

### Linha de base por conjunto (antes das correções)

| Conjunto | Natureza | Casos | Itens | Acerto item a item | Erros graves |
|---|---|---|---|---|---|
| Desenvolvimento | medição de desenvolvimento, não é estimativa | 9 | 63 | 84,1% | 1 |
| Reservado | linha de base antes das correções, pedida à parte; não é estimativa da plataforma corrigida | 6 | 42 | 78,6% | 3 |

Contagem item a item, anterior à matriz; os erros graves eram só "ausente → presente". Pela matriz, a linha do desenvolvimento está na seção "Matriz de pontuação".

Arquivos: `resultados/rh-linha-de-base-desenvolvimento.json` (por caso) e `resultados/rh-linha-de-base-reservado.json` (só o resumo). O uso do reservado para esta linha de base foi pedido e está no registro.

## Matriz de pontuação de três estados

Congelada em `matriz.json` (sha256 em `matriz.sha256`) antes da rodada final. Vale para todas as frentes. Cada unidade avaliada é um par (gabarito, plataforma):

| Gabarito | Plataforma | Resultado |
|---|---|---|
| ausente | presente | erro grave |
| presente | ausente | erro comum |
| qualquer | duvidoso | revisão (nem acerto nem erro) |
| presente | presente | acerto |
| ausente | ausente | acerto |
| duvidoso | presente | erro grave |
| duvidoso | ausente | acerto |

- **Gabarito duvidoso.** O documento está ausente e só é mencionado. Por isso, "presente" é erro grave e "ausente" é acerto. Essa leitura está congelada na matriz.
- **"Presente" em cada frente.** Nos checklists, o documento está na pasta. Nas conferências (Fiscal, Suprimentos), o campo está conforme. Assim, uma divergência não apontada é erro grave. Os significados das demais frentes estão em `matriz.json`.
- **Denominador.** Todas as unidades da frente no conjunto. As quatro taxas somam 100%.
- **Reaplicação.** `pontuar.ts` reaplica a matriz a todas as medições gravadas do desenvolvimento e grava `resultados/pontuacao-desenvolvimento.json`. O teste `fase4-matriz.test.ts` confere o hash, as regras e a pontuação gravada.

**Medições do desenvolvimento pela matriz.** Nenhum destes números é estimativa de acerto. As linhas da construtora são prova de generalização.

| Frente | Medição | Conjunto · natureza | Casos | Unidades | Acerto | Erros graves | Erros comuns | Revisão |
|---|---|---|---|---|---|---|---|---|
| RH | checklist anterior, catálogo v1 (linha de base) | desenvolvimento · medição | 9 | 63 | 84,1% | 5 (7,9%) | 5 (7,9%) | 0% |
| RH | checklist anterior, catálogo v2 | desenvolvimento · medição | 9 | 63 | 92,1% | 5 (7,9%) | 0 | 0% |
| RH | plataforma corrigida, catálogo v2 | desenvolvimento · medição | 9 | 63 | 92,1% | 0 | 0 | 7,9% |
| Construtora (contratação) | checklist anterior | desenvolvimento · prova de generalização | 9 | 63 | 69,8% | 6 (9,5%) | 4 (6,3%) | 14,3% |
| Construtora (contratação) | plataforma corrigida | desenvolvimento · prova de generalização | 9 | 63 | 90,5% | 0 | 0 | 9,5% |
| Fiscal | conferência pelos mapeamentos, cinco layouts | desenvolvimento · medição | 18 | 353 | 98,6% | 0 | 0 | 1,4% |

- Pela matriz, o RH corrigido tem o mesmo acerto que o checklist anterior (92,1%). Os 5 erros graves viraram revisão: 4 itens só citados na ficha e o CPF citado em outros documentos. Na conta item a item de antes, "duvidoso = duvidoso" contava como acerto (98,4%). Pela matriz, conta como revisão.
- A linha de base do reservado (78,6%) foi gravada só como resumo, antes da matriz. Ela não é pontuada pela matriz: isso exigiria rodar o reservado, o que fica para a rodada final.
- Jurídico, Suprimentos, Financeiro e LGPD ainda não têm medição no desenvolvimento. Dependem das rodadas com o modelo real.

## Correções da plataforma no checklist (medidas só no desenvolvimento)

Os erros da linha de base do RH foram corrigidos no bloco de checklist, não no modelo de RH:

- **Evidência por item.** Cada item declara o que o satisfaz: `documento` (padrão), `mencao` (dado mencionado), `documento_ou_mencao` ou `documento_e_mencao`. Menção em outro documento não satisfaz item que exige documento; o item fica duvidoso com "mencionado em [arquivo], documento não encontrado".
- **Vários documentos por arquivo.** A classificação é por página. O título de cada página vale como identificação: a primeira linha útil ou uma linha de título em maiúsculas, sem contar linhas repetidas em muitas páginas (marca d'água, rodapé) nem linhas "rótulo: número". Um arquivo pode satisfazer vários itens, e a saída diz a página de cada um (também na revisão e na planilha exportada).
- **Siglas.** Sigla escrita em maiúsculas na configuração (RG, CPF, ART) só casa com maiúsculas no conteúdo: "art. 55" de lei não vira ART. Quando termos de itens diferentes se sobrepõem, vale o mais longo.
- **Sinônimos na tela do assistente.** Administração › Assistentes › Itens e sinônimos: sinônimos e "vale como" de cada item, gravados como versão nova da definição.
- **Catálogo.** Sinônimos comuns acrescentados em `checklist-documentos-admissao` (v2), `organizacao-evidencias` (v2) e `comercial-proposta-requisitos` (v2, com os requisitos como dado mencionado). Novo modelo `checklist-documentos-contratacao` (obra ou serviço de engenharia).

**Casos equivalentes da construtora** (`gerar-contratacao.ts`, 15 pastas, semente 4501, gabaritos congelados antes de qualquer rodada; 9 no desenvolvimento, 6 no reservado). ART citada no contrato sem a ART anexada; CND e cartão CNPJ no mesmo PDF (uma pasta a cada três); contrato que cita "art." de lei; garantia por caução mencionada no contrato; matrícula CNO como dado mencionado; contrato em DOCX.

**Nova medição** [desenvolvimento · medição de desenvolvimento; a construtora é prova de generalização; nenhum número é estimativa de acerto] (sem modelo, blocos reais da plataforma, contagem item a item anterior à matriz):

| Conjunto de desenvolvimento | Checklist anterior | Plataforma corrigida | Erros graves (antes → depois) |
|---|---|---|---|
| RH, 9 pastas, catálogo v1 | 84,1% | — | 1 → — |
| RH, 9 pastas, catálogo v2 (sinônimos) | 92,1% | 98,4% | 1 → 0 |
| Construtora, 9 pastas | 69,8% | 100% (página certa em 49 de 49) | 0 → 0 |

O que sobra no RH é um caso: o número do CPF aparece como dado em outros documentos (ASO, CTPS, conta salário). A plataforma deixa o item duvidoso, com "mencionado em [arquivo], documento não encontrado", e ele vai para a revisão. O gabarito diz ausente. Não é erro grave. O gabarito não foi mudado.

Arquivos: `resultados/rh-desenvolvimento-depois-das-correcoes.json` e `resultados/contratacao-desenvolvimento.json`. O reservado não foi rodado depois das correções; fica para a rodada final. Os casos da construtora foram gerados de novo uma vez, antes de qualquer rodada, porque o sorteio não produziu nenhum PDF com dois documentos (a divisão desse lote foi refeita junto). Teste de regressão: `test/fase4-checklist.test.ts`.

## Linha de base sem modelo (RH), antes da divisão

`resultados/rh-linha-de-base-sem-modelo.json`: os 15 casos digitais pelo checklist por regras, sem chamar o modelo. Acerto de 81,9% dos itens e 4 erros graves. Os erros apontam o que a rodada com o modelo precisa medir:

- CPF marcado presente quando o comprovante não veio: o número e o rótulo "CPF:" aparecem no ASO, na CTPS e no comprovante bancário.
- "Título eleitoral" (o nome no documento) não casa com "Título de eleitor": o modelo do catálogo não tem sinônimo para esse item.
- Item só citado na ficha de admissão contado como presente: a ficha é curta e a citação cai no início do conteúdo, que as regras tratam como evidência forte.
- PDF com dois documentos (RG e CPF): um dos dois itens se perde.

Nada disso foi ajustado: a Fase 4 mede como está e o relatório propõe as mudanças.

## Documentos reais do PNCP (Jurídico e Suprimentos)

O ambiente não alcança `pncp.gov.br`: a política de rede do ambiente recusa o endereço (403 no proxy). Para baixar daqui, o endereço precisa entrar na lista de domínios permitidos do ambiente. Enquanto isso, a lista do que baixar está em `pncp/LISTA.md`: 30 contratos e 10 atas para o Jurídico, e 20 pares de termo de referência e ata para Suprimentos (80 arquivos).

- `importar-pncp.ts importar` lê a pasta baixada e a planilha de controle (`pncp/controle.exemplo.csv`). Copia os arquivos para a saída, fora do repositório, calcula o sha256 e escreve um gabarito em rascunho por caso, com "A PREENCHER".
- `importar-pncp.ts congelar` recusa qualquer rascunho incompleto ou fora do schema. Com tudo certo, grava os gabaritos e o sha256 em `gabaritos/pncp-manifesto.json` e congela a divisão dos lotes `juridico/pncp` e `suprimentos/pncp`.
- Os gabaritos são escritos e congelados antes de qualquer rodada. Caso fora da divisão congelada não roda.
- Em Suprimentos, a planilha de especificação sai dos itens do termo de referência transcritos no gabarito.
- O schema do gabarito ganhou `procedencia` (`gerado` ou `pncp`) e `pncp` (número de controle, endereço, órgão, esfera e ano de cada documento).
- Teste: `test/fase4-pncp.test.ts`.

## O que depende de você

- `ANTHROPIC_API_KEY` no ambiente da avaliação (rodada com Haiku 4.5 e Sonnet 5).
- As 30 notas de compra da TheNeil (XML e DANFE) para a frente fiscal.
- Pessoas para imprimir e fotografar as pastas de RH (roteiro em `saida/rh/ROTEIRO-FOTOS.md`).
- Os layouts de ERP para os pedidos (qualquer cliente, sem dados). Os cinco de hoje são aproximações neutras; cada layout real (o SyGeCom é um deles) vira mais um `mapeamentos/layout-x.json`.
- Os documentos do PNCP da lista `pncp/LISTA.md` e a planilha de controle, ou a liberação de `pncp.gov.br` na rede do ambiente.
- O bucket privado para o corpus.
- A pessoa que confere os 20% de amostra dos gabaritos.
