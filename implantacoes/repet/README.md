# Implantação: Repet

Primeiro cliente da GreenIA. Este arquivo e o `tenant.json` guardam o que é próprio da Repet. O checklist geral está em `docs/IMPLANTACAO.md`; aqui ficam só os dados e os ajustes deste cliente.

## A confirmar com o cliente

- Domínio de email e host (o `tenant.json` usa `repet.com.br` e `repet.greenia.theneil.com.br` como provisórios).
- Provedor de login: Entra ID ou Google, com o `issuer` (id do diretório) e o `clientId` reais. O segredo vai na variável `OIDC_REPET_ENTRA_SECRET`, nunca no arquivo.
- Admins e key users de cada área (a lista `keyUsers` está vazia até a confirmação).

## Áreas

As quatro frentes da proposta: Fiscal, RH / DP, Financeiro e LGPD & Compliance. Subáreas, se houver, entram pelo painel depois da criação.

## Leitores

`nfe` e `danfe` ligados: a Fiscal recebe XML de NF-e e DANFE em PDF.

## Assistentes (a partir do catálogo da TheNeil)

| Área | Modelo do catálogo | Ajustes da Repet |
|---|---|---|
| Fiscal | `conferencia-nota-pedido` | Colunas reais do pedido exportado do SyGeCom; tolerâncias de quantidade e preço; prazo de emissão. |
| RH / DP | `checklist-documentos-admissao` | Lista real de documentos de admissão e sinônimos usados pelo DP. |
| Financeiro | `resumo-financeiro-mensal` | Tópicos e indicadores do resumo mensal. |
| LGPD & Compliance | `organizacao-evidencias` | Taxonomia de evidências e padrão de nome. |

O layout do SyGeCom é uma variação entre outras de planilha de pedido: o assistente lê as colunas pela configuração, sem código próprio.

## Oportunidades iniciais

Registradas pelos key users no painel, no primeiro encontro de cada área. Os quatro assistentes acima nasceram de oportunidades da proposta; cada um vira quick win só depois de avaliado e selecionado, com ponto de partida registrado.
