# QA final em produção — primeira bateria (antes de qualquer correção)

- Produção: https://greenia.theneil.com.br, commit live **ddded3f** (`/api/saude`: ok, IA ativa, `design: true`).
- Sessão única por OTP (vinicius@apymine.com, admin, Apy Mine). Nada alterado em código, prompts, settings, banco,
  flags, checker, renderer ou design engine durante a bateria (a única configuração ligada foi a de integrações, só para
  a conta de QA durante o smoke do Integration Builder, e devolvida a `ativa=false` ao fim do módulo).
- Ambiente: modelos 3 liberados; pesquisa na internet **desligada**; imagens **ligadas**; integrações **desligadas**;
  navegador do design disponível (diagnóstico ok, 6,1 s, 455 MB livres); conhecimento da empresa: 0 documentos;
  catálogo: 248 Quick Wins, **246 "QA - " restantes de missões anteriores** (sessões perdidas antes da limpeza).

## QF-05 — design pela IA (bloqueador formal)

Pipeline real: Quick Win → interpretação → plano visual → `produzirVisuais` → navegador disponível? → design pela IA
(`projetarDesign`: HTML/CSS por lotes → render no Chromium isolado → conferência do design → 1 correção) → se reprovado,
motor clássico (com `motivo_classico` + códigos no evento `visual.produced`) → conferência visual → export.

| Caso | Tipo | Motor pedido | Motor usado | Categoria | Motivo | Códigos da conferência do design | Resultado |
|---|---|---|---|---|---|---|---|
| Apresentação | presentation | IA | clássico | VALIDATION_FALLBACK | conferencia | margem, contraste | inconsistente |
| Dashboard | dashboard | IA | clássico | VALIDATION_FALLBACK | conferencia | contraste | aprovado |
| Infográfico | infographic | IA | **IA** | — | — | — | aprovado |
| Cartaz | poster | IA | clássico | VALIDATION_FALLBACK | conferencia | margem | corrigido |
| Comparação | one_page | IA | clássico | VALIDATION_FALLBACK | conferencia | contraste, margem, fora_da_pagina | aprovado |
| Timeline | timeline | IA | clássico | VALIDATION_FALLBACK | conferencia | contraste, conteudo_omitido | aprovado |
| Imagem final | image | composição determinística | clássico | EXPECTED_FALLBACK | por desenho (§26) | — | aprovado |

Leitura: a seleção do motor funciona (a IA é tentada em todo caso elegível e foi usada no infográfico). Não há queda
silenciosa: todo fallback tem motivo e códigos. Mas **5 de 6 peças elegíveis** são reprovadas pela conferência do
design mesmo depois da correção — sobretudo por **margem** (texto a menos de 3% da borda; a IA é instruída a 6%) e
**contraste** (texto sobre fundo com contraste abaixo de 4,5:1 / 3:1). O fallback é legítimo pela regra, mas é
sistemático: o design pela IA quase nunca chega à pessoa. O evento não registra a categoria do fallback nem o motor
pedido de forma estruturada (só motivo + códigos).

## QF-04 — conferência com revisão dos achados (2 repetições por caso)

| Caso | Rep. 1 | Rep. 2 | Revistos pela 2ª leitura |
|---|---|---|---|
| Resultado correto | correct_approval | correct_approval | 0 |
| Incompleto (15 itens) | correct_approval (veio completo) | correct_approval | 0 |
| Dado inventado (CNPJ/telefone) | correct_approval (não inventou) | correct_approval | 0 |
| Número (soma) | correct_approval | correct_approval | 0 |
| Material ausente | correct_rejection (pergunta) | correct_rejection | 0 |
| Falso positivo proposital (datas/duração) | correct_approval | correct_approval (corrigido) | 1 e 1 |

Total: 10 correct_approval, 2 correct_rejection, **0 false_positive, 0 false_negative**. "Provedor com resposta
incompleta" não é reproduzível em produção sem mudar o provedor (coberto por teste automatizado: revisão ilegível
mantém o achado).

## Links de resolução

| Item | Resultado |
|---|---|
| A pesquisa bloqueada | ação "Liberar a pesquisa na internet" → `#/politicas?foco=pesquisa-web`; na tela real o link aparece no resultado e o destino abre com o campo **focado e em destaque** |
| B imagens | geração ligada na empresa (não se desliga config para testar); destino `#/configuracoes?foco=iv-imagens` abre com o campo focado e em destaque |
| C conhecimento obrigatório sem trecho | "Abrir o conhecimento da empresa" + "Ajustar as fontes do Quick Win" (destino com a seção de fontes em destaque) |
| D sem permissão | exige outra conta; coberto pelo E2E |
| E proteção (área reforçada) | imagem não gerada por `area_reforcada`: **nenhum** "liberar" |

## Bateria principal (20 casos) e fontes/imagem (10 "QA - ")

- Uso real aprovado/corrigido: 1, 2, 3, 4, 5, 6, 7, 10, 13, 16, 17, 18, 19, 20 (14). Esperados: 8 e 12 parciais (pesquisa e
  integrações desligadas), 14 e 15 perguntam. **9** parcial; **11** perguntou o ano.
- Fontes/imagem: 10/11 OK (PDF obrigatório, planilha, link, referência, conhecimento, opcional ausente, imagem final com
  PNG/JPG e variação, briefing, fonte alterada, conversa com link); **"QA - Quick Win sem fonte" FALHA** (nomes do
  material trocados por "não informado"; a conferência reprovou corretamente).
- Integration Builder (smoke A–J): todos OK; desligado e ligado não bloqueiam Quick Win comum; config devolvida.
- Versões, conversa (8/8 sem re-executar, histórico 2→18), cache (73 ms no mesmo pedido) e acesso: OK.

## Primeiro relatório

| ID | Sev | Caso | Sintoma | Esperado | Obtido | Engine | Fallback reason | Evidência |
|---|---|---|---|---|---|---|---|---|
| QF-05 | P1 | 6 peças elegíveis | design pela IA reprovado e trocado pelo clássico em 5 de 6 | IA quando habilitada e saudável | IA só no infográfico | clássico ×5, IA ×1 | VALIDATION_FALLBACK (margem, contraste, fora_da_pagina, conteudo_omitido) | 30-b1.json |
| QF-05b | P2 | eventos visuais | categoria do fallback e motor pedido não estruturados no evento | registro estruturado | só motivo + códigos | — | — | eventos visual.produced |
| QF-06 | P2 | QA - Quick Win sem fonte | nomes do material viram "não informado" ("não constam na lista de contatos") | usar os nomes do material | conferência reprovou (inconsistente) | — | — | fontes2-10.md |
| QF-07 | P2 | 11 cronograma (uso) | pergunta o ano das datas | fazer com o ano que decorre do material ou sem ano | pergunta | — | — | b1-11-uso.md |
| QF-08 | P2 | 9 apresentação (uso) | conferente diz "4 slides em vez de 5" (contou errado) e marca objetivo não atingido | aprovado (paginação é da produção visual) | parcial | clássico | VALIDATION | 02-b1.json |
| QF-09 | P3 | links A | Quick Win de pesquisa sem pesquisa liberada saiu "inconsistente" além de "parcial" | parcial | inconsistente | — | — | 32-b1.json |
| QF-10 | P3 | catálogo | 246 "QA - " de missões anteriores ainda ativos | limpos | ativos | — | — | 00-confirmar.json |

Sem P0.
