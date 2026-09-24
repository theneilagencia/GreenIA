# Documentos reais do PNCP: o que baixar

O ambiente da Fase 4 não alcança o `pncp.gov.br`: a rede do ambiente recusa o endereço. Os arquivos são baixados à mão, pelo portal. Nenhum documento entra no repositório: só o gabarito e o sha256 de cada arquivo.

## Quantidades

| Frente | Tipo de documento | Quantidade | Uso |
|---|---|---|---|
| Jurídico | Contrato | 30 | Localizar cláusulas: partes, vigência, reajuste, multa, rescisão, confidencialidade, foro |
| Jurídico | Ata de registro de preços | 10 | As mesmas cláusulas, num documento de outro formato |
| Suprimentos | Termo de referência + ata de registro de preços da mesma contratação | 20 pares (40 arquivos) | Especificação (itens do termo) × itens registrados na ata |

Total: 80 arquivos. Com a divisão 60/40, o Jurídico fica com 24 casos no desenvolvimento e 16 no reservado; Suprimentos, com 12 e 8.

## Como escolher

**Contratos (30).**
- 10 de obras ou serviços de engenharia, 10 de serviços contínuos (limpeza, vigilância, manutenção, TI) e 10 de fornecimento de bens.
- Pelo menos 10 órgãos diferentes, nas três esferas (federal, estadual, municipal).
- 25 pela Lei 14.133/2021 e 5 pela Lei 8.666/1993.
- Pelo menos 6 em PDF escaneado (imagem, sem texto selecionável). O resto em PDF com texto.
- Tamanhos variados: de 5 a mais de 40 páginas.
- Inclua contratos sem cláusula de reajuste ou sem confidencialidade. Eles medem o "não encontrado".

**Atas do Jurídico (10).** De órgãos diferentes dos contratos. Pelo menos 2 escaneadas.

**Pares de Suprimentos (20).**
- Termo de referência (ou projeto básico) e ata da mesma contratação, com 5 a 60 itens.
- 10 de materiais de construção, 5 de material de escritório ou limpeza e 5 de equipamentos.
- Pelo menos 4 com item fracassado ou deserto (item do termo que não está na ata).
- Pelo menos 4 com unidade diferente entre o termo e a ata (ex.: caixa × unidade).
- Pelo menos 3 termos em PDF escaneado.
- As atas não se repetem com as 10 do Jurídico.

## Como entregar

1. Uma pasta com os arquivos, com nomes simples e sem espaço (ex.: `contrato-01.pdf`, `tr-sup-01.pdf`, `ata-sup-01.pdf`).
2. A planilha de controle (`controle.exemplo.csv` como modelo, separador `;`), com uma linha por arquivo:
   - `caso`: o nome do caso (ex.: `pncp-jur-01`, `pncp-sup-01`). O par de Suprimentos tem o mesmo caso nas duas linhas.
   - `frente`: `juridico` ou `suprimentos`.
   - `tipo_documento`: `contrato`, `termo_de_referencia` ou `ata_registro_precos`.
   - `arquivo`, `id_pncp` (número de controle que o portal mostra), `url` (endereço da página no PNCP), `orgao`, `cnpj_orgao`, `esfera` (`federal`, `estadual`, `municipal`), `ano`, `baixado_em` (aaaa-mm-dd).
   - `digitalizacao`: `digital` ou `escaneado`.
3. Rode `node --experimental-strip-types eval/fase4/importar-pncp.ts importar --origem <pasta> --controle <planilha>`. Cada caso ganha um `gabarito.rascunho.json` com "A PREENCHER".

## Gabaritos: escritos e congelados antes de qualquer rodada

- Alguém lê cada documento e preenche o rascunho.
  - Jurídico: a cláusula e um trecho curto de cada campo, ou `null` quando o contrato não tem aquele campo.
  - Suprimentos: os itens do termo (código, descrição, quantidade, unidade, página) e os da ata, com as divergências esperadas.
- A segunda pessoa confere os casos marcados como amostra (20%).
- `importar-pncp.ts congelar` recusa qualquer rascunho com "A PREENCHER" ou fora do schema. Com tudo certo, grava os gabaritos em `gabaritos/<frente>/`, com o sha256 em `gabaritos/pncp-manifesto.json`, e congela a divisão dos lotes `juridico/pncp` e `suprimentos/pncp`.
- Em Suprimentos, a planilha de especificação do caso é gerada dos itens do termo, como a do comprador.
- Caso fora da divisão congelada não roda. Gabarito congelado não muda.

## Dados pessoais

Contratos públicos trazem nome e às vezes CPF de quem assina. Os arquivos ficam fora do repositório. O gabarito guarda só trechos curtos, e nenhum trecho com CPF.
