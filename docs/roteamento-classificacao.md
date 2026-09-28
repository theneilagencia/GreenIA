# Medição da classificação por regras

Gerado por `node scripts/medir-classificacao.js`. Sem dados de produção nesta instalação: os números abaixo vêm do texto do produto e de sondas escritas pela auditoria. Em produção, a mesma medição sai da tela Modelos → Roteamento (tabela "Classificação dos pedidos"), a partir do registro de decisões.

## 1. Sugestões de pedido do produto (30)

- Classificados em algum tipo: **26 de 30** (87%).
- Em "consulta": **4** (13%); em 4 deles a "consulta" definiu a exigência (Rápido).

| Pedido | Quick win | Tipos | Exigência |
|---|---|---|---|
| Resuma este documento em poucos pontos | Resumir documento para análise | sintese | Rápido |
| Quais pontos pedem decisão? | Resumir documento para análise | analise | Equilibrado |
| Resuma em 3 linhas | Resumir documento para análise | sintese | Rápido |
| Confira estes dois documentos e liste as diferenças | Conferir dois documentos | extracao, analise | Equilibrado |
| Os valores dos dois documentos batem? | Conferir dois documentos | analise | Equilibrado |
| Tire a coluna de relevância | Conferir dois documentos | edicao | Rápido |
| Confira o que falta nestes documentos | Checklist de documentos pendentes | analise | Equilibrado |
| Monte o checklist deste caso | Checklist de documentos pendentes | analise | Equilibrado |
| Escreva uma mensagem pedindo o que falta | Checklist de documentos pendentes | redacao | Rápido |
| Como faço para pedir este serviço? | Tirar dúvida com base nos procedimentos | consulta | Rápido |
| Qual é o prazo para esta etapa? | Tirar dúvida com base nos procedimentos | extracao | Rápido |
| Quem aprova este tipo de pedido? | Tirar dúvida com base nos procedimentos | consulta | Rápido |
| Organize estas anotações em pendências | Organizar lista de pendências | edicao | Rápido |
| Ordene por prazo | Organizar lista de pendências | edicao | Rápido |
| Separe o que é urgente | Organizar lista de pendências | edicao | Rápido |
| Onde está a cláusula de multa? | Localizar cláusula em contrato | extracao | Equilibrado |
| O que o contrato diz sobre rescisão? | Localizar cláusula em contrato | extracao | Equilibrado |
| Qual é o prazo de vigência? | Localizar cláusula em contrato | extracao | Rápido |
| Compare estas cotações | Comparar cotações | analise | Equilibrado |
| Qual cotação tem o menor prazo? | Comparar cotações | analise | Equilibrado |
| O que falta em cada cotação? | Comparar cotações | analise | Equilibrado |
| Responda esta mensagem | Redigir resposta padrão | consulta | Rápido |
| Deixe a resposta mais curta | Redigir resposta padrão | consulta | Rápido |
| Escreva num tom mais formal | Redigir resposta padrão | redacao | Rápido |
| Extraia os itens e valores deste documento | Extrair dados para tabela | extracao | Rápido |
| Coloque as datas numa coluna separada | Extrair dados para tabela | edicao | Rápido |
| Tire a coluna de observações | Extrair dados para tabela | edicao | Rápido |
| Revise este texto | Revisar texto antes de enviar | analise | Equilibrado |
| Deixe mais curto | Revisar texto antes de enviar | edicao, redacao | Rápido |
| Deixe mais formal | Revisar texto antes de enviar | edicao, redacao | Rápido |

## 2. Sondas de paráfrase, negação e idioma (20, com gabarito da auditoria)

- Exigência igual ao gabarito: **16**; abaixo (risco de resposta fraca): **3**; acima (consumo a mais): **1**.
- Das que ficaram abaixo, 0 caíram em "consulta".

| Pedido | O que testa | Tipos | Exigência | Gabarito | Resultado |
|---|---|---|---|---|---|
| Vale a pena trocar de fornecedor agora ou esperar o fim do contrato? | decisão sem palavra-chave de raciocínio | raciocinio | Equilibrado | Avançado | **abaixo** |
| Me ajuda a entender por onde começar a reorganizar o estoque. | pedido aberto sem tipo | raciocinio | Equilibrado | Equilibrado | igual |
| Esses números fecham? | conferência sem o verbo "conferir" | analise | Equilibrado | Equilibrado | igual |
| O que muda para nós com a nova regra de férias? | interpretação de regra | raciocinio | Equilibrado | Equilibrado | igual |
| Isso aqui tem algum problema? | código em anexo, pergunta vaga | analise, programacao | Equilibrado | Equilibrado | igual |
| Tem como deixar isso mais rápido? | otimização implícita | analise, programacao | Equilibrado | Equilibrado | igual |
| Quem ganha e quem perde se mudarmos o horário do turno? | análise de impacto sem palavra-chave | raciocinio | Equilibrado | Avançado | **abaixo** |
| Qual seria o impacto de dobrar o preço do frete? | impacto | raciocinio | Equilibrado | Equilibrado | igual |
| Não precisa analisar, só traduza para o inglês: bom dia a todos. | negação de análise | traducao | Rápido | Rápido | igual |
| Sem análise profunda: diga em uma frase o que é um aditivo contratual. | negação + domínio | consulta | Rápido | Rápido | igual |
| Não quero um resumo; compare os dois contratos cláusula por cláusula e aponte riscos. | negação de síntese | analise | Avançado | Avançado | igual |
| Summarize this document in five bullet points. | inglês, simples | analise | Equilibrado | Rápido | acima |
| Review this contract and flag the legal risks. | inglês, complexo | analise | Equilibrado | Avançado | **abaixo** |
| Qual é o horário de atendimento do RH? | consulta simples (correta) | consulta | Rápido | Rápido | igual |
| Como faço para pedir reembolso? | consulta simples (correta) | consulta | Rápido | Rápido | igual |
| Onde fica o formulário de férias? | consulta simples (correta) | extracao | Rápido | Rápido | igual |
| Resuma em três linhas. | síntese | sintese | Rápido | Rápido | igual |
| Traduza para o espanhol. | tradução com anexo | traducao | Rápido | Rápido | igual |
| Analise este contrato e identifique riscos jurídicos. | complexo com palavra-chave | analise | Avançado | Avançado | igual |
| Proponha um plano de migração considerando prazo, custo e risco. | raciocínio multicritério | raciocinio | Avançado | Avançado | igual |
