# QA profundo do Quick Win em produção — primeira bateria (antes de qualquer correção)

- Ambiente: produção GreenIA, empresa Apy Mine, conta vinicius@apymine.com (admin), sessão única por OTP.
- Commit live: **cffe219** (a missão citava 2d3cba1; cffe219 é posterior — design por IA). `/api/saude`: ok, IA ativa,
  `design: true`. Integration Builder: desligado na empresa. Imagens ilustrativas: ligadas. Catálogo: 1 Quick Win real.
- Nada foi alterado em código, prompts ou dados reais durante a bateria (só Quick Wins "QA - " e conversas de teste).
- Casos: 20 da jornada + 5 do checker + 7 visuais + Integration Builder A–J + fontes/imagem final + conversa, versões,
  cache, acesso, erros e telas (320/390/768/1280).

## Correção do próprio teste (registrada, não escondida)

Na primeira passada, o roteiro de QA mandava o formato sugerido em todo Quick Win, o que a tela NÃO faz quando o plano
tem vários entregáveis; e alguns módulos reaproveitavam uma cópia antiga desse roteiro. Os casos foram repetidos do
jeito da tela (com a estrutura do objetivo e sem formato forçado). Os números abaixo são os da repetição fiel; os da
primeira passada viraram o achado QW-01 (escolha manual de formato conflita com vários entregáveis).

## Resultados (jornada fiel à tela)

- Criar, interpretar, publicar, executar (teste e uso real): 20/20 executaram; nenhuma resposta 5xx.
- Conferência: aprovado/corrigido em 13 de 20 usos reais; 4 "parcial" (pesquisa na internet não liberada ou critério),
  1 "inconsistente" de fato, 2 perguntas; material ausente recusado antes de executar.
- Conversa depois da execução: 8/8 comandos atendidos sem re-executar o Quick Win; histórico preservado (2 → 18).
- Versões: rascunho não afeta o uso; v2 publicada vale; restaurar v1 volta; histórico correto.
- Cache da interpretação: mesmo pedido reaproveita (87 ms); pedido alterado gera plano novo.
- Visual: 5 tipos com peça, prévia e exportações PDF (páginas certas), PNG, JPG e SVG; **todas pelo motor clássico**
  (o design pela IA falhou em produção em 100% das peças).
- Integration Builder: desligado não interfere; ligado não bloqueia Quick Win comum; leitura, falha 503, tempo
  esgotado, esquema e reuso ok; escrita nunca chega à aprovação (a conferência reprova o texto).
- Telas: sem rolagem horizontal nas 4 larguras; botões fora da tela só no menu lateral recolhido (esperado).

## Achados

| ID | Severidade | Área | Quick Win | Sintoma | Esperado | Obtido | Reproduzível | Evidência |
|---|---|---|---|---|---|---|---|---|
| QW-01 | P1 | Contrato de saída | 1,4,5,6,7,17,19 (1ª passada) | Formato escolhido (lista/tabela/resumo) com vários entregáveis impõe seções genéricas | Entregáveis do plano | "Principais pontos", "Item\|Descrição\|Responsável\|Prazo\|Situação"; recomendação some; "inconsistente" | sim (formato manual) | 02-bateria.json, 5-uso.md, 7-teste.md |
| QW-02 | P1 | Contrato de tabela | checker correto/incompleto, 17 | Colunas genéricas do tipo de trabalho aplicadas sem o pedido | Colunas pedidas ou livres | Tabela com "não informado" em 3 colunas; quantidades perdidas; "parcial: tabela sem dados" | sim, quando a estrutura do objetivo não traz colunas | checker-c-incompleto.md |
| QW-03 | P1 | Interpretação | 5,11,18,19, visuais | Atributos viram entregáveis ("Número", "Melhor", "Critérios de preço", "Datas", "Gráfico", "Página visual") | Só peças que a pessoa recebe | Conferência cobra seções inexistentes: "Faltaram entregáveis: Número, Resumo" | sim | 02-ui.json #18 |
| QW-04 | P1 | Conferência | 1,4,5,11 | Reprova por regra que a pessoa não pediu (riscos num resumo), seção extra, cálculo derivado (diferença), ano inferido | Aprovar resultado correto; avisar o leve | "inconsistente" alternando entre execuções do mesmo material | sim (intermitente) | 02-ui.json |
| QW-05 | P1 | Design pela IA | todos os visuais | Navegador de composição falha em produção | Peça desenhada pela IA | 100% caiu no motor clássico, motivo `falha_render` | sim | 09-visual.json (eventos) |
| QW-06 | P1 | Integration Builder | integração leitura+escrita | A conferência exige que a escrita externa esteja feita no texto | Escrita feita depois, com aprovação | "inconsistente" → escrita bloqueada (`resultado_nao_conferido`); aprovação nunca pedida | sim | ibq.md, 11-integracao.json |
| QW-07 | P1 | Integration Builder | resolução | Pedido "no ERP" resolvido para capability de outro sistema | ⚠ precisa configurar | ✓ disponível (capability do Sandbox Tarefas) | sim | 11-integracao.json A_B |
| QW-08 | P1 | Integração (fidelidade) | integração leitura | Lista de 200 itens cortada em 50 sem avisar a IA | Total correto ou aviso de corte | "Total de tarefas: 50 registros" (eram 200) | sim | ibq.md |
| QW-09 | P1 | Fontes | link | Link enviado não é lido | Página usada como fonte | Pergunta pelo link; nenhum conteúdo lido | sim | 12-fontes.json |
| QW-10 | P1 | Imagem final | pedido de imagem final | Só existe "Imagem (briefing)" | Arquivo de imagem pronto | Entregável `imagem` sem visual (briefing) | sim | 12-fontes.json |
| QW-11 | P2 | Ferramentas | 12, 16 | Pesquisa na internet adicionada sem o pedido precisar | Sem dependência inventada | Resultado sempre "parcial" (pesquisa não liberada) | sim | 02-ui.json |
| QW-12 | P2 | Material ausente | 15, checker ausente | Executar sem texto é recusado ("Escreva uma mensagem") | Quick Win pede o material obrigatório | 400 antes da execução | sim | 02-ui.json |
| QW-13 | P2 | Perguntas | 18 (uso) | Pergunta se o contrato é "fictício ou real" | Fazer o trabalho | Pergunta desnecessária | intermitente | ui-18-uso.md |
| QW-14 | P2 | Visual | 11, timeline, dashboard | "Timeline visual" não vira peça; dashboard visual sem artefato | Peça visual | Só texto | sim | 09-visual.json |
| QW-15 | P2 | Imagens | visuais | Imagem não gerada na área com proteção reforçada | Governança (correto) | `area_reforcada` | sim (esperado) | 09-visual.json |
| QW-16 | P3 | Texto da tela | criação | "Ensine ao IA" | "Ensine à IA" | erro de concordância | sim | criacao-390.png |
| QW-17 | P3 | Integration Builder | conector lento | `max_tentativas: 1` ainda faz 2 tentativas | 1 | 2 | sim | 11-integracao.json H |
| QW-18 | P3 | Limite de rajada | bateria | Limite por pessoa atingido em uso intenso (espera 65 s) | — | 429 pontual | sim | log da sessão |

Sem P0. Não verificável daqui: logs do Render (SMTP 535 / fallback Resend — o código chegou por e-mail com atraso,
o que confirma a entrega pelo fallback, mas não vejo o log); falha real do provedor de IA (não simulável sem mudar
configuração de produção).

## Causas raiz (agrupadas)

1. **Dois contratos de saída concorrendo** (QW-01, QW-02): o formato/colunas do tipo de trabalho são impostos mesmo
   quando o plano tem entregáveis próprios ou o pedido não definiu colunas.
2. **Interpretação sem filtro de entregável** (QW-03): fragmentos do pedido viram entregáveis.
3. **Conferência sem graduação** (QW-04, QW-06): regra sugerida (não pedida), ação externa feita depois e cálculo
   derivado tratados como falha grave.
4. **Navegador de composição em produção** (QW-05): falha sem diagnóstico guardado.
5. **Resolução e dados de integração** (QW-07, QW-08): sistema não é obrigatório na resolução; corte silencioso.
6. **Capacidades ausentes** (QW-09, QW-10): fontes por link e imagem final não existem.
