# Auditoria final de qualidade do roteador de modelos

Data: 28/09/2026. Parte da versão 2.0 (commit `2e51b9a`) e cobre só o que a auditoria anterior deixou como PARCIAL ou NÃO COMPROVADO. A arquitetura não foi refeita. As mudanças abaixo corrigem defeitos encontrados por testes e acrescentam o mínimo para representar capacidade real.

Evidência reproduzível:

| Evidência | O que confere | Como reproduzir |
|---|---|---|
| `test/roteamento-propriedades.test.js` | 9 propriedades sobre 400 cenários sorteados com semente fixa: catálogo, preços, janelas, liberação, homologação, reservas, acesso, sigilo, plano, quick win, preferência e pedido | `CENARIOS=2000 node --test test/roteamento-propriedades.test.js` amplia |
| `test/roteamento-matriz.test.js` | 22 testes de casos, capacidades, dominância, "não serviu" e quick win | `node --test` |
| `test/roteamento.test.js` | 12 testes do fluxo HTTP completo, incluindo feedback, tentativa ligada e latência | `node --test` |
| `docs/roteamento-matriz.md` | Casos, experimento controlado das preferências em dois catálogos e ablação de sinais | `node scripts/matriz-roteamento.js` |
| `docs/roteamento-classificacao.md` | Medição da classificação: 30 pedidos do produto e 20 sondas com gabarito | `node scripts/medir-classificacao.js` |

## Defeitos encontrados nesta auditoria

Todos foram encontrados por teste antes de qualquer correção.

| # | Defeito | Como apareceu | Efeito | Correção |
|---|---|---|---|---|
| 1 | O bônus "padrão da classe" fazia Qualidade escolher um Equilibrado **mais caro** que um Avançado mais barato | Propriedade "Qualidade não reduz capacidade" falhou na v2.0 | Menos capacidade por mais custo | **Dominância:** modelo mais capaz que custa o mesmo ou menos elimina o outro antes da utilidade |
| 2 | Quando a janela obrigava a descer de classe, a causa registrada era "nenhum modelo liberado com esta capacidade" | Propriedade de monotonicidade de contexto falhou | Auditoria com causa errada | As causas agora vêm dos modelos **mais capazes que o usado**, e dizem por que cada um saiu |
| 3 | O registro não expunha "cabe todo o histórico" | Propriedade de Economia não conseguia verificar a equivalência | Decisão não reconstruível por inteiro | Candidato registrado com `cabeTudo`, capacidades explícitas e `dominadoPor` |
| 4 | O "não serviu" da conversa **nunca expirava** | Leitura do código, confirmada rodando a v2.0: o feedback antigo sobe toda mensagem | Toda mensagem seguinte ia uma classe acima: custo crescente, o laço que você descreveu | O feedback fica na decisão da resposta a que se refere e só pesa na próxima mensagem |
| 5 | Falsos positivos de insatisfação: "O login não funcionou para o cliente…", "Encontre o que está errado…", "O que está faltando…" | 5 de 7 frases de assunto ou tarefa nova disparavam na v2.0 | Subida de classe sem falha | Só falha explícita: no início da mensagem ou com referência à resposta, mensagem curta e sem anexo novo. Frases ambíguas ficam registradas sem efeito |
| 6 | Nova tentativa podia subir em cadeia (Rápido → Equilibrado → Avançado com duas reclamações) | Teste de limite | Custo sem limite | No máximo uma classe acima do que a **tarefa** pede, e nunca abaixo da classe que acabou de falhar |
| 7 | Quick win fixo, sem janela suficiente, podia trocar para classe **maior** | Teste direcionado | O quick win fixo seria ignorado | Troca só dentro da classe do quick win. Se o quick win fixou um modelo técnico, não troca: bloqueia com 413 |
| 8 | Anexo sem tipo reconhecido virava "análise" (Equilibrado) em edições simples ("Tire a coluna…", "Ordene por prazo") | Medição nas 30 sugestões do produto | Consumo a mais em pedidos triviais | Tipos "edição e formatação" e localização ("onde está", "qual é o prazo") |
| 9 | Negação ignorada: "Não precisa analisar, só traduza" ia ao Equilibrado | Sondas | Consumo a mais | Tipo mencionado só para ser dispensado não conta |

## 1 e 2. Classe × capacidade

**Problema real.** Com só a classe, o roteador trata como iguais dois modelos da mesma classe. Também não consegue preferir um Equilibrado forte em programação a um Avançado, nem recusar um Avançado fraco em leitura longa para análise de volume. O experimento com capacidades explícitas (`docs/roteamento-matriz.md`) mostra três efeitos concretos:

- **C e D (contrato e demonstrações):** com o Avançado curto declarado precisão 2, ele sai da lista, e as três preferências passam a concordar no Avançado padrão.
- **P (correção de código):** com o Equilibrado declarado programação 3, Qualidade fica nele em vez de pagar 2× pelo Avançado.
- **N (análise de volume):** um Avançado com leitura longa 2 fica fora (teste).

**Menor modelo de dados necessário, implementado.** Coluna opcional `modelos.capacidades` (JSON), com as dimensões `geral`, `raciocinio`, `programacao`, `precisao` e `leitura_longa`, de 1 a 3.
- Só as dimensões informadas mudam; as outras valem o nível da classe.
- Sem capacidades informadas, a escolha é **a mesma** que a classe daria: os testes da v2.0 continuam passando, e a única mudança de expectativa foi o nome da dimensão `volume` → `leitura_longa`.
- O admin edita em Modelos → Classes e modelos → coluna "Capacidades".

**`instrucoes` (seguir instruções) não entrou.** Não há sinal no pedido que exija essa dimensão, e ela seria decorativa: o teste "nenhum sinal decorativo" existe justamente para impedir isso. Ela entra quando houver um requisito, por exemplo quick win com formato rígido ou instruções longas.

**Arquitetura resultante:** requisitos → capacidades necessárias (por dimensão) + classe mínima → restrições (governança, permissão, janela) → preferências → modelo.

**A classe continua necessária**, mas como política, não como capacidade:
- acesso por grupo e área;
- reserva do plano (só Rápido);
- classe do quick win;
- seletor da pessoa;
- faixa de custo;
- homologação por classe no sigilo;
- nova tentativa e piso do quick win, que são decisões de classe.

Ela **só vira capacidade** quando o admin não declarou capacidades para o modelo.

Sobre qual das duas arquiteturas é mais consistente com o GreenIA:
- **"requisitos → classe mínima → elegíveis"** é mais simples, mas confunde governança com capacidade.
- **"requisitos → capacidades → elegíveis → classe como política"** é a correta.

A implementação atual é a segunda, com a primeira como padrão quando não há declaração. Isso evita exigir configuração de quem não precisa.

## 3. Preferência Qualidade

A margem agora mede a **capacidade relevante**: as dimensões que definiram a exigência. Não mede a classe.

- Um modelo da mesma classe mais forte na dimensão exigida ganha a margem.
- Um de classe acima, igual naquela dimensão, não ganha.
- Duas classes acima do mínimo é penalizado.
- Tarefa simples (tradução, resumo, classificação) nunca compra margem.
- Leitura longa pede janela (restrição) e, só em análise ou extração sobre muito conteúdo, a dimensão `leitura_longa`. Não pede raciocínio.

**Suficiente?** Sim para representar a distinção pedida. **Ressalva numérica (item 6):** hoje Qualidade aceita pagar até ~14× pela margem de uma classe. Com o catálogo de referência isso resulta em 2×, mas um catálogo com Avançado muito caro faria Qualidade pagá-lo. Não alterei o peso (item 4 pede para não alterar ainda). A proposta está no item 6.

## 4. Experimento controlado: Economia × Equilíbrio × Qualidade

A tabela completa, com requisitos, classe mínima, elegíveis, escolhas, preço relativo e capacidade relevante, está em `docs/roteamento-matriz.md`.

| Catálogo | Iguais nas três | Mudam o modelo sem mudar a capacidade | Qualidade compra capacidade relevante |
|---|---:|---:|---:|
| Referência (capacidade = classe) | 6 | 6 (C, D, E, G, I, L) | 4 (J, K, O, P) |
| Com capacidades explícitas | 9 | 4 (E, G, I, L) | 3 (J, K, O) |

- **Iguais:** A, B, F, H, M e N nos dois catálogos. Não existe alternativa melhor ou mais barata; é o comportamento correto.
- **"Muda o modelo sem mudar a capacidade":** Economia escolhe o Avançado curto e Equilíbrio/Qualidade o Avançado padrão, a 1,26–1,31× do preço, com a **mesma capacidade declarada**.
  - Pelos dados que o sistema tem, é uma diferença de curadoria, não de resultado esperado.
  - Só se justifica se o padrão da classe for de fato melhor. Nesse caso, a forma correta de dizer isso é declarar as capacidades, e o experimento mostra exatamente isso: com a declaração, C e D deixam de divergir.
  - Conclusão: o peso D é um substituto de capacidade não declarada.
- **Qualidade compra capacidade:** J, K, O e P, a 2×. É justificável quando a tarefa não é simples, que é o que a regra exige. Se a qualidade da resposta melhora de fato, **não está comprovado**: exige os dados do item 6.

## 5. "Consumo poupado" não é economia financeira

O indicador foi renomeado e desdobrado na tela Modelos → Roteamento:

| Nome na tela | O que é | Fonte |
|---|---|---|
| Consumo realizado | O que foi cobrado, em créditos | `custo_real`, informado pelo fornecedor em cada resposta |
| Consumo estimado | O que o roteador previu para as escolhas feitas | `custo_estimado` |
| Referência hipotética | Os mesmos pedidos, se fossem todos para o Avançado padrão | `custo_referencia`, estimado |
| **Consumo evitado (estimativa)** | 1 − estimado ÷ referência, com a legenda "Não é economia medida" | As duas estimativas |
| Acerto da estimativa | Realizado ÷ estimado nas respostas com os dois valores | Calibra a estimativa |

**Economia financeira real** exigiria saber quanto o Avançado teria custado *e* se entregaria o mesmo resultado. O GreenIA não tem nenhum dos dois, então não apresenta economia financeira.

## 6. Pesos e parâmetros: origem e dono

| Parâmetro | Valor | Justificativa | Depende do catálogo | Quem define |
|---|---|---|---|---|
| Margem da janela | 90% | Técnica: variação entre tokenizadores e sobrecarga do fornecedor | Não | Sistema |
| Caracteres por token (média / segura) | 3,6 / 3,0 prosa; 2,8 / 2,2 denso | Parcial: faixa típica do português; a segura tem folga de 20–27% | Não | Sistema, a calibrar com `usage.prompt_tokens` |
| Limiar de conteúdo denso | 25% de não letras | Arbitrário | Não | Sistema |
| Reserva de saída | 1,5 × saída típica, mínimo 1.000 | Arbitrário | Não | Sistema, a calibrar com `completion_tokens` |
| Níveis por tipo e regras de precisão, risco e critérios | tabelas em `roteador.js` | Julgamento, com efeito provado por ablação | Não | Sistema |
| Limiares de volume | 30 mil / 150 mil tokens | Arbitrário | Não | Sistema |
| C (custo, em log) | 1 / 1 / 0,6 | O log torna o custo relativo (independe da escala de preço); C=1 é a âncora | Sim: relativo ao mais barato do conjunto | Sistema |
| Q (margem) | 0 / 0,2 / 1,6 | Arbitrário. Equivale a pagar até **1,22×** (Equilíbrio) ou **~14×** (Qualidade) por uma classe de margem | Sim | Sistema; proposta: teto de multiplicador configurável |
| D (padrão da classe) | 0 / 0,7 / 0,5 | Arbitrário: pagar até **~2×** pelo modelo curado. É um substituto de capacidade não declarada | Sim: só age com mais de um modelo por classe | Sistema; tende a encolher quando houver capacidades declaradas |
| H (histórico inteiro) | 0,3 / 0,5 / 0,8 | Arbitrário: pagar até 1,35× / 1,65× / 3,8× para não cortar o histórico | Sim: janelas diferentes | Sistema |
| Preferência | Economia / Equilíbrio / Qualidade | Escolha de negócio | — | **Admin** |
| Capacidades por modelo | 1–3 por dimensão | Conhecimento do modelo | — | **Admin** |
| Padrão de cada classe | um modelo por classe | Curadoria | — | **Admin** |

Leitura dos pesos como multiplicador: a utilidade compara −C·ln(custo relativo) com os bônus. Então um bônus B equivale a aceitar pagar até e^(B/C) vezes mais.

**Proposta, sem implementar agora:** trocar Q e D por dois números configuráveis e fáceis de explicar:
- "Qualidade paga no máximo X× por uma classe de margem" (padrão sugerido: 3×);
- "Equilíbrio paga no máximo Y× pelo modelo padrão" (padrão: 2×).

**Coleta para calibração futura, implementada.** Cada decisão agora fecha o ciclo completo em `roteamento`, sem conteúdo:

pedido (sinais, tipos, requisitos) → decisão (candidatos, utilidade, motivo, preferência, versão) → modelo usado → custo estimado e realizado → latência (`ms_primeiro_token`, `ms_total`) → feedback da resposta (`feedback`) → nova tentativa (`refeito` na anterior, `nova_tentativa_de` na nova).

**Calibração sugerida, quando houver volume.** Taxa de "não serviu" e de refeitos por (classe exigida × classe usada):
- se o Rápido em pedidos exigidos Rápido tem taxa semelhante ao Equilibrado, a régua está certa;
- se a taxa é muito maior, o limiar está baixo.

## 7. "Não serviu" e laço de realimentação

**O risco que você descreveu existia (defeitos 4 e 5).** Na v2.0, um "não serviu" antigo e frases de assunto subiam a classe de toda mensagem seguinte. **Agora:**

- **Falha explícita**, que sobe:
  - frase de falha no início da mensagem ("Não resolveu.", "Ainda está errado.", "Refaça") ou com referência à resposta ("o código que você mandou não funcionou");
  - mensagem de até 400 caracteres, sem anexo novo;
  - ou "não serviu" marcado na **última** resposta.
- **Continuação ou assunto**, que não sobe: "O login não funcionou para o cliente", "Agora faça o mesmo para o segundo trimestre", "Encontre o que está errado", "O que está faltando". As ambíguas ficam em `insatisfacaoAmbigua`, para calibração.
- **Limite:** no máximo uma classe acima do que a tarefa pede, sem cadeia, e nunca abaixo da classe que falhou.

**Não é possível distinguir com segurança total.** "Não funcionou", sozinho no início, pode ainda se referir a outra coisa. Por isso a subida é conservadora, limitada e registrada; o custo máximo de um falso positivo é uma resposta uma classe acima.

## 8. O caso "consulta"

Medido em `docs/roteamento-classificacao.md`:

- **Pedidos que o produto sugere (30):** 26 classificados (87%) e 4 em "consulta" (13%). Os 4 são perguntas sobre procedimentos respondidas pela base ("Como faço para pedir este serviço?"), para as quais o Rápido é o correto.
- **Sondas de paráfrase, negação e idioma (20, com gabarito da auditoria):**
  - antes da correção: 11 iguais, 6 abaixo, 3 acima;
  - depois: **16 iguais, 3 abaixo e 1 acima**;
  - os 3 abaixo: duas perguntas de decisão que vão para o Equilibrado em vez do Avançado, e um pedido complexo em inglês.
- **Produção:** **não medido**. Não há dados de uso nesta instalação. A tela Modelos → Roteamento agora mostra, por tipo principal:
  - percentual do total;
  - "não serviu";
  - refeitos;
  - quando o tipo decidiu a exigência.

**Ressalva de método.** As sondas foram escritas por quem ajustou as regras: há risco de sobreajuste. O número que vale é o de produção.

**Recomendação.** Manter as regras. "Consulta" é parcela pequena no texto do produto e não concentra erro. Os erros restantes estão em perguntas abertas de decisão, e o piso é o Rápido (risco de resposta fraca, não de violação), mitigado pela nova tentativa.

**Reavaliar se, em produção:**
- "consulta" passar de ~20% dos pedidos;
- ou sua taxa de "não serviu" ou refeito for bem maior que a dos outros tipos.

Nesse caso, o próximo passo incremental é o classificador por IA **só para "consulta"** acima de ~100 caracteres, nas condições da auditoria anterior: só sobe a exigência, nunca em sigilosa sem homologado.

## 9. Latência

**Decisão: métrica de observabilidade agora; desempate depois, com dados.** Não será requisito nem peso.

- **Implementado:** tempo até o primeiro trecho (o que a pessoa sente, com streaming) e tempo total, por decisão. A mediana por modelo aparece na tela.
- **Não é requisito:** nenhuma tarefa do GreenIA tem prazo técnico, e a pessoa aceita esperar mais por resposta melhor.
- **Não é peso:** misturar tempo com custo e capacidade tornaria a escolha menos previsível.
- **Uso futuro proposto:** desempate entre modelos **não dominados e equivalentes** (mesma capacidade, custo até 1,2× um do outro), só em tarefa simples, pelo menor tempo até o primeiro trecho. Exige pelo menos 20 respostas do modelo nos últimos 30 dias.

## 10 a 12. Propriedades, monotonicidade e separação entre restrições e preferências

**Propriedades testadas em 400 cenários sorteados.** Na v2.0, 3 das 9 falhavam; agora todas passam:

| Propriedade | v2.0 | Agora |
|---|---|---|
| Governança: nenhum proibido escolhido (sigilo, plano, sem treino, liberação), inclusive a reserva | passa | passa |
| Janela: nenhum escolhido sem janela suficiente | passa | passa |
| Permissão: nunca acima do acesso da pessoa (o quick win libera só a classe dele) | passa | passa |
| Capacidade: sem fallback, atende a todos os requisitos | passa | passa |
| Economia não paga mais que um equivalente | **falha** (o registro não permitia verificar) | passa |
| Qualidade não reduz capacidade em relação às outras | **falha** (defeito 1) | passa |
| Quick win fixo nunca ignorado; flexível é piso e permite subir | passa (mais o teste direcionado do defeito 7) | passa |
| Monotonicidade: requisito maior nunca dá capacidade menor na dimensão exigida (6 exigências) | passa | passa |
| Monotonicidade de contexto: mais conteúdo dá o mesmo modelo ou janela maior; queda de capacidade só com causa registrada | **falha** (defeito 2) | passa |
| Monotonicidade de nova tentativa: classe igual ou maior | passa | passa |
| Auditoria: determinística; todo modelo liberado aparece com status e motivos; bloqueadas reconstruíveis | passa | passa |

**Separação no código:**
- `RESTRICOES` (lista explícita): capacidade e classe mínima, sigilo, reserva do plano, sem treino, permissão, janela.
- `PESOS` (preferências): custo, margem, padrão, histórico.
- **Disponibilidade** é a liberação do modelo mais a reserva validada.
- **Fornecedor permitido:** homologação com fornecedor fixo no sigilo e `data_collection` no envio.
- **Compliance:** o filtro de dados, anterior ao roteamento, bloqueia antes de qualquer escolha.
- **Nenhuma preferência passa por cima de uma restrição:** a utilidade só é calculada para quem passou por todas, e a propriedade "governança" confere isso nos 400 cenários.

## 13. Resultado

### A. Definitivamente correto (demonstrado por testes)

- **Governança, janela, permissão e plano** nunca são violados, inclusive em fallback e na reserva de execução (400 cenários).
- **O escolhido atende a todos os requisitos** quando não há fallback registrado.
- **Monotonicidade** de capacidade, contexto e nova tentativa.
- **Quick win:** o fixo é respeitado até na troca por janela; o flexível é piso e permite subir.
- **Economia** não paga mais que uma alternativa equivalente.
- **Qualidade** não reduz capacidade.
- **Dominância:** nunca escolhe um modelo menos capaz e mais caro.
- **Explicação** derivada dos códigos da decisão; **auditoria** determinística e reconstruível, sem conteúdo, incluindo bloqueios.
- **"Não serviu"** não se perpetua e não sobe em cadeia; frases de assunto não disparam.
- **Capacidades explícitas** mudam a escolha como esperado; sem elas, o comportamento é idêntico ao da classe.

### B. Ainda heurístico

- **Classificação por palavras-chave**, em português: paráfrases de decisão e outros idiomas ainda escapam (3 de 20 sondas).
- **Classe como capacidade padrão** enquanto o admin não declarar capacidades.
- **Pesos C, Q, D e H** e os limiares, com as origens da tabela do item 6.
- **Qualidade** paga até ~14× por uma classe de margem, em teoria.
- **Estimativa de consumo:** razão de caracteres por token e saída típica por tipo. O indicador "acerto da estimativa" passa a medir isso.

### C. Corrigir antes de produção

**Os nove defeitos da tabela do início já foram corrigidos e testados.** Não resta defeito conhecido que cause violação de governança, e todas as propriedades passam.

**Condição de uso.** Capacidades explícitas são declaração do admin, e uma declaração errada leva a escolha errada. A tela orienta a informar só quando o modelo foge da classe. O padrão, sem declaração, é seguro.

### D. Pode esperar

- **Custo e qualidade:**
  - teto configurável de "quanto pagar pela margem" e "pelo padrão" (substitui Q e D);
  - desempate por latência entre equivalentes.
- **Calibração:**
  - calibração da razão de caracteres por token e da saída com o uso real;
  - calibração dos limiares com "não serviu" e refeitos por classe exigida × usada.
- **Capacidades:** dimensão `instrucoes`, quando houver um requisito que a use.
- **Classificação:** classificador por IA só para "consulta" longa, se a medição em produção justificar.

### E. Recomendação de arquitetura

**O GreenIA pode ser considerado Intelligent Model Routing determinístico, ainda não adaptativo.** Os motivos:

- **É mais que "routing por regras".** A escolha não sai de uma tabela pedido → modelo. Ela sai de:
  1. requisitos derivados do pedido, por dimensão, cada um com efeito comprovado por ablação;
  2. capacidades por modelo;
  3. restrições que só filtram;
  4. otimização multicritério com dominância.

  O resultado é previsível, monotônico e auditável, e as propriedades foram verificadas em cenários aleatórios, não só em casos escolhidos.
- **Não é adaptativo.** Não aprende com o resultado. A coleta para isso está pronta (custo, latência, feedback e nova tentativa por decisão), mas os pesos e as regras continuam fixos até haver dados.
- **O entendimento do pedido é lexical.** Pedidos sem as palavras esperadas caem no piso, e isso está medido.

Na ordem de prioridade pedida (correção → governança → adequação técnica → custo → qualidade → otimização contínua), os três primeiros níveis estão demonstrados. **Custo e qualidade** estão representados, com pesos ainda arbitrários. A **otimização contínua** está preparada, não ativa. Usar outro modelo para decidir não é necessário agora e só deve entrar se a medição em produção mostrar ganho.
