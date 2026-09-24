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
| Gabaritos congelados | `gabaritos/`, `congelar.ts` | Os 100 gabaritos do corpus oficial, versionados antes de qualquer rodada. O teste `fase4-corpus` gera o corpus de novo e compara |
| Comparador RH sem modelo | `avaliar-rh-offline.ts` | Roda a leitura e o checklist por regras da plataforma, com a definição do modelo do catálogo, e compara item a item. Com `--ocr sim`, as imagens passam pelo OCR local |

## Como rodar

```sh
cd server
node --experimental-strip-types eval/fase4/congelar.ts --saida eval/fase4/saida      # corpus oficial + gabaritos congelados
node --experimental-strip-types eval/fase4/degradar.ts --saida eval/fase4/saida --frente rh
node --experimental-strip-types eval/fase4/validar.ts --saida eval/fase4/saida
node --experimental-strip-types eval/fase4/avaliar-rh-offline.ts --saida eval/fase4/saida [--ocr sim]
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
  - Fiscal, financeiro e LGPD: formatos definidos no schema; os geradores dessas frentes vêm a seguir.
- `conferencia`: 20% dos casos marcados como amostra para a segunda pessoa conferir (`por`, `em`, `divergencias`).

## Divisão: desenvolvimento e reservado

`dividir.ts` separa cada lote (frente + procedência: `gerado`, depois `pncp`) em desenvolvimento (60%) e reservado (40%). O resultado fica congelado em `divisao.json`, com o sha256 em `divisao.sha256`. O teste `fase4-divisao.test.ts` confere o hash, a cobertura de todos os gabaritos e que a divisão refeita dá o mesmo resultado.

- Unidade: o caso. Em Suprimentos, a especificação inteira (todas as cotações dela), porque as cotações dividem a mesma planilha.
- Estratos: tipo de caso (completo, ausente, duvidoso, cada tipo de divergência, cláusula faltante), formato e origem (digital, escaneado, foto).
- As variações escaneada (`-sintetica`) e fotografada (`-fotos`) herdam o conjunto do caso de origem. Cada origem fica com a mesma proporção.
- A divisão usa só o gabarito congelado e uma semente fixa (4401). Não olha resultado.
- Lote congelado não é refeito. Casos novos (construtora, PNCP, fiscal, financeiro, LGPD) entram em lotes próprios.
- O reservado só roda com `--conjunto reservado --rodada-final sim`. Cada uso fica em `resultados/uso-do-reservado.log`, e a saída traz só números agregados.

Resultado: RH 9 casos no desenvolvimento e 6 no reservado; Suprimentos 12 especificações (36 cotações) e 8 (24); Jurídico 15 e 10 contratos.

Ressalva: a linha de base abaixo, com resultado por caso dos 15 casos, foi gravada antes da divisão. As categorias de erro foram vistas em todos os casos. As correções seguem estas categorias gerais e são medidas só no desenvolvimento; nenhum caso do reservado é aberto para corrigir.

### Linha de base por conjunto (antes das correções)

| Conjunto | Casos | Itens | Acerto | Erros graves |
|---|---|---|---|---|
| Desenvolvimento | 9 | 63 | 84,1% | 1 |
| Reservado | 6 | 42 | 78,6% | 3 |

Arquivos: `resultados/rh-linha-de-base-desenvolvimento.json` (por caso) e `resultados/rh-linha-de-base-reservado.json` (só o resumo). O uso do reservado para esta linha de base foi pedido e está no registro.

## Linha de base sem modelo (RH), antes da divisão

`resultados/rh-linha-de-base-sem-modelo.json`: os 15 casos digitais pelo checklist por regras, sem chamar o modelo. Acerto de 81,9% dos itens e 4 erros graves. Os erros apontam o que a rodada com o modelo precisa medir:

- CPF marcado presente quando o comprovante não veio: o número e o rótulo "CPF:" aparecem no ASO, na CTPS e no comprovante bancário.
- "Título eleitoral" (o nome no documento) não casa com "Título de eleitor": o modelo do catálogo não tem sinônimo para esse item.
- Item só citado na ficha de admissão contado como presente: a ficha é curta e a citação cai no início do conteúdo, que as regras tratam como evidência forte.
- PDF com dois documentos (RG e CPF): um dos dois itens se perde.

Nada disso foi ajustado: a Fase 4 mede como está e o relatório propõe as mudanças.

## O que depende de você

- `ANTHROPIC_API_KEY` no ambiente da avaliação (rodada com Haiku 4.5 e Sonnet 5).
- As 30 notas de compra da TheNeil (XML e DANFE) para a frente fiscal.
- Pessoas para imprimir e fotografar as pastas de RH (roteiro em `saida/rh/ROTEIRO-FOTOS.md`).
- Os layouts de ERP para os pedidos (qualquer cliente, sem dados; o SyGeCom entra como uma variação).
- O bucket privado para o corpus.
- A pessoa que confere os 20% de amostra dos gabaritos.
