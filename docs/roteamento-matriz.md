# Matriz de decisões do roteador (versão 2.0)

Gerada por `node scripts/matriz-roteamento.js` com o roteador real, sem servidor e sem chamada a modelo. Os mesmos casos são conferidos em `test/roteamento-matriz.test.js`.

## Catálogo usado

| Modelo | Classe | Entrada (US$/1M) | Saída (US$/1M) | Janela | Padrão da classe |
|---|---|---:|---:|---:|---|
| `google/gemini-3.5-flash-lite` | Rápido | 0.3 | 2.5 | 1.048.576 | sim |
| `anthropic/claude-haiku-4.5` | Equilibrado | 1 | 5 | 200.000 | sim |
| `anthropic/claude-sonnet-5` | Avançado | 2 | 10 | 1.000.000 | sim |
| `x/rapido-curto` | Rápido | 0.1 | 0.4 | 32.000 |  |
| `x/equilibrado-longo` | Equilibrado | 1.2 | 6 | 1.000.000 |  |
| `x/avancado-curto` | Avançado | 1.5 | 8 | 128.000 |  |

Custo relativo = custo estimado da escolha ÷ custo do mesmo pedido no Avançado padrão (`anthropic/claude-sonnet-5`).

## Resumo: modelo escolhido por preferência

| Caso | Pedido | Requisitos (dimensão: nível) | Janela mínima | Economia | Equilíbrio | Qualidade |
|---|---|---|---:|---|---|---|
| A | Tradução curta | geral: 1 | 1.660 | `x/rapido-curto` (Rápido, 4%) | `x/rapido-curto` (Rápido, 4%) | `x/rapido-curto` (Rápido, 4%) |
| B | Resumo em cinco linhas | geral: 1 | 5.612 | `x/rapido-curto` (Rápido, 5%) | `x/rapido-curto` (Rápido, 5%) | `x/rapido-curto` (Rápido, 5%) |
| C | Contrato: riscos jurídicos | geral: 2, precisao: 3 | 22.433 | `x/avancado-curto` (Avançado, 76%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| D | Demonstrações financeiras | geral: 2, precisao: 3 | 25.160 | `x/avancado-curto` (Avançado, 76%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| E | Arquitetura | geral: 3, raciocinio: 3 | 2.886 | `x/avancado-curto` (Avançado, 80%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| F | Função Python simples | geral: 1, programacao: 1 | 2.874 | `x/rapido-curto` (Rápido, 4%) | `x/rapido-curto` (Rápido, 4%) | `x/rapido-curto` (Rápido, 4%) |
| G | Código: concorrência e segurança | geral: 3, raciocinio: 3, programacao: 3 | 4.889 | `x/avancado-curto` (Avançado, 79%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| H | Pedido simples, contexto enorme | geral: 1 | 301.613 | `google/gemini-3.5-flash-lite` (Rápido, 15%) | `google/gemini-3.5-flash-lite` (Rápido, 15%) | `google/gemini-3.5-flash-lite` (Rápido, 15%) |
| I | Pedido complexo, pouco contexto | geral: 1, raciocinio: 3 | 2.894 | `x/avancado-curto` (Avançado, 80%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| J | Nova tentativa | geral: 1, nova_tentativa: 2 | 1.620 | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| K | Simples com precisão alta | geral: 1, precisao: 2 | 2.986 | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| L | Complexa sem precisão de domínio | geral: 2, raciocinio: 3 | 2.879 | `x/avancado-curto` (Avançado, 80%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| M | Síntese curta | geral: 1 | 3.280 | `x/rapido-curto` (Rápido, 4%) | `x/rapido-curto` (Rápido, 4%) | `x/rapido-curto` (Rápido, 4%) |
| O | Análise intermediária | geral: 2 | 5.090 | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| P | Correção de código colado | geral: 1, programacao: 2 | 2.896 | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-haiku-4.5` (Equilibrado, 50%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |
| N | Análise sobre janela grande | geral: 2, leitura_longa: 3 | 235.757 | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) | `anthropic/claude-sonnet-5` (Avançado, 100%) |

## Detalhe de cada caso (preferência Equilíbrio)

### A. Tradução curta

Pedido: "Traduza 'bom dia' para inglês."

1. **Classificação:** tipos traducao; complexidade simples; domínio de precisão: nenhum.
2. **Sinais:** 30 caracteres; 0 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 10, histórico 0, reserva de saída 1050 (conteúdo prosa).
   **Requisitos:** geral 1 (tradução) → classe **Rápido**; janela mínima 1.660 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade -1.988), `x/avancado-curto` (utilidade -2.457), `anthropic/claude-haiku-4.5` (utilidade -1.294), `x/equilibrado-longo` (utilidade -2.177), `google/gemini-3.5-flash-lite` (utilidade -0.549), `x/rapido-curto` (utilidade 0.5).
4. **Excluídos:** nenhum.
5. **Escolhido:** `x/rapido-curto` (Rápido).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `x/rapido-curto` (o de menor consumo entre os que atendem); Qualidade, `x/rapido-curto` (o de menor consumo entre os que atendem).
7. **Custo relativo:** 4% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (tradução) exige a classe Rápido: tradução. Escolhido o de menor consumo entre os que atendem."

### B. Resumo em cinco linhas

Pedido: "Resuma este texto em cinco linhas." + texto.docx (12.000 caracteres)

1. **Classificação:** tipos sintese; complexidade simples; domínio de precisão: nenhum.
2. **Sinais:** 34 caracteres; 1 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 4012, histórico 0, reserva de saída 1000 (conteúdo prosa).
   **Requisitos:** geral 1 (síntese) → classe **Rápido**; janela mínima 5.612 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade -1.887), `x/avancado-curto` (utilidade -2.329), `anthropic/claude-haiku-4.5` (utilidade -1.194), `x/equilibrado-longo` (utilidade -2.077), `google/gemini-3.5-flash-lite` (utilidade -0.247), `x/rapido-curto` (utilidade 0.5).
4. **Excluídos:** nenhum.
5. **Escolhido:** `x/rapido-curto` (Rápido).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `x/rapido-curto` (o de menor consumo entre os que atendem); Qualidade, `x/rapido-curto` (o de menor consumo entre os que atendem).
7. **Custo relativo:** 5% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (síntese; 1 anexo) exige a classe Rápido: síntese. Escolhido o de menor consumo entre os que atendem."

### C. Contrato: riscos jurídicos

Pedido: "Analise este contrato e identifique riscos jurídicos, obrigações e possíveis pontos de exposição." + contrato.pdf (60.000 caracteres)

1. **Classificação:** tipos analise; complexidade complexa; domínio de precisão: juridico.
2. **Sinais:** 97 caracteres; 1 anexo(s); etapas 0; critérios 0; risco sim; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 20033, histórico 0, reserva de saída 1800 (conteúdo prosa).
   **Requisitos:** geral 2 (análise); precisao 3 (assunto que pede precisão, com riscos ou inconsistências a apontar) → classe **Avançado**; janela mínima 22.433 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.929), `x/avancado-curto` (utilidade 0.5).
4. **Excluídos:** `anthropic/claude-haiku-4.5`: capacidade_insuficiente; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o modelo padrão da classe, com consumo próximo do menor. Economia escolheria `x/avancado-curto` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (o modelo padrão da classe, com consumo próximo do menor).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio)."

### D. Demonstrações financeiras

Pedido: "Compare estas demonstrações financeiras e identifique inconsistências." + 2025.xlsx (25.000 caracteres), 2026.xlsx (25.000 caracteres)

1. **Classificação:** tipos analise; complexidade complexa; domínio de precisão: financeiro.
2. **Sinais:** 70 caracteres; 2 anexo(s); etapas 0; critérios 0; risco sim; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 22760, histórico 0, reserva de saída 1800 (conteúdo denso).
   **Requisitos:** geral 2 (análise); precisao 3 (assunto que pede precisão, com riscos ou inconsistências a apontar) → classe **Avançado**; janela mínima 25.160 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.929), `x/avancado-curto` (utilidade 0.5).
4. **Excluídos:** `anthropic/claude-haiku-4.5`: capacidade_insuficiente; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o modelo padrão da classe, com consumo próximo do menor. Economia escolheria `x/avancado-curto` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (o modelo padrão da classe, com consumo próximo do menor).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise; 2 anexos) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio)."

### E. Arquitetura

Pedido: "Analise este problema de arquitetura e proponha uma solução considerando escalabilidade, segurança e custo."

1. **Classificação:** tipos analise, raciocinio; complexidade complexa; domínio de precisão: nenhum.
2. **Sinais:** 107 caracteres; 0 anexo(s); etapas 0; critérios 3; risco sim; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 36, histórico 0, reserva de saída 2250 (conteúdo prosa).
   **Requisitos:** geral 3 (várias etapas ou critérios); raciocinio 3 (raciocínio com vários critérios) → classe **Avançado**; janela mínima 2.886 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.973), `x/avancado-curto` (utilidade 0.5).
4. **Excluídos:** `anthropic/claude-haiku-4.5`: capacidade_insuficiente; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o modelo padrão da classe, com consumo próximo do menor. Economia escolheria `x/avancado-curto` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (o modelo padrão da classe, com consumo próximo do menor).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise, raciocínio) exige a classe Avançado: várias etapas ou critérios; raciocínio com vários critérios. Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio)."

### F. Função Python simples

Pedido: "Escreva uma função Python simples para converter uma lista de valores."

1. **Classificação:** tipos redacao, programacao; complexidade simples; domínio de precisão: nenhum.
2. **Sinais:** 70 caracteres; 0 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito sim; código não; insatisfação não; tokens: fixo 600, mensagem 24, histórico 0, reserva de saída 2250 (conteúdo prosa).
   **Requisitos:** geral 1 (geração de texto); programacao 1 (programação simples) → classe **Rápido**; janela mínima 2.874 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade -2.003), `x/avancado-curto` (utilidade -2.476), `anthropic/claude-haiku-4.5` (utilidade -1.31), `x/equilibrado-longo` (utilidade -2.192), `google/gemini-3.5-flash-lite` (utilidade -0.59), `x/rapido-curto` (utilidade 0.5).
4. **Excluídos:** nenhum.
5. **Escolhido:** `x/rapido-curto` (Rápido).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `x/rapido-curto` (o de menor consumo entre os que atendem); Qualidade, `x/rapido-curto` (o de menor consumo entre os que atendem).
7. **Custo relativo:** 4% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (geração de texto, programação) exige a classe Rápido: geração de texto. Escolhido o de menor consumo entre os que atendem."

### G. Código: concorrência e segurança

Pedido: "Analise este código, encontre o problema e proponha uma correção considerando concorrência, performance e segurança." + fila.js (6.000 caracteres)

1. **Classificação:** tipos analise, programacao, raciocinio; complexidade complexa; domínio de precisão: nenhum.
2. **Sinais:** 116 caracteres; 1 anexo(s); etapas 0; critérios 3; risco sim; "simples" explícito não; código sim; insatisfação não; tokens: fixo 600, mensagem 2039, histórico 0, reserva de saída 2250 (conteúdo prosa).
   **Requisitos:** geral 3 (várias etapas ou critérios); raciocinio 3 (raciocínio com vários critérios); programacao 3 (código com análise ou riscos (segurança, concorrência, desempenho)) → classe **Avançado**; janela mínima 4.889 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.963), `x/avancado-curto` (utilidade 0.5).
4. **Excluídos:** `anthropic/claude-haiku-4.5`: capacidade_insuficiente; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o modelo padrão da classe, com consumo próximo do menor. Economia escolheria `x/avancado-curto` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (o modelo padrão da classe, com consumo próximo do menor).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise, programação, raciocínio; 1 anexo) exige a classe Avançado: várias etapas ou critérios; raciocínio com vários critérios; código com análise ou riscos (segurança, concorrência, desempenho). Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio)."

### H. Pedido simples, contexto enorme

Pedido: "Resuma este documento em dez tópicos." + relatorio.pdf (900.000 caracteres)

1. **Classificação:** tipos sintese; complexidade simples; domínio de precisão: nenhum.
2. **Sinais:** 37 caracteres; 1 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 300013, histórico 0, reserva de saída 1000 (conteúdo prosa).
   **Requisitos:** geral 1 (síntese) → classe **Rápido**; janela mínima 301.613 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade -0.689), `x/equilibrado-longo` (utilidade -0.878), `google/gemini-3.5-flash-lite` (utilidade 1.2).
4. **Excluídos:** `x/avancado-curto`: janela de contexto pequena para este conteúdo; `anthropic/claude-haiku-4.5`: janela de contexto pequena para este conteúdo; `x/rapido-curto`: janela de contexto pequena para este conteúdo.
5. **Escolhido:** `google/gemini-3.5-flash-lite` (Rápido).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `google/gemini-3.5-flash-lite` (o de menor consumo entre os que atendem); Qualidade, `google/gemini-3.5-flash-lite` (o de menor consumo entre os que atendem).
7. **Custo relativo:** 15% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (síntese; 1 anexo) exige a classe Rápido: síntese. 3 modelos ficaram de fora por janela de contexto pequena (cerca de 302 mil tokens necessários). Escolhido o de menor consumo entre os que atendem."

### I. Pedido complexo, pouco contexto

Pedido: "Qual a melhor estratégia de precificação para entrar num mercado com dois concorrentes dominantes, considerando riscos e trade-offs?"

1. **Classificação:** tipos raciocinio; complexidade complexa; domínio de precisão: nenhum.
2. **Sinais:** 132 caracteres; 0 anexo(s); etapas 1; critérios 2; risco sim; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 44, histórico 0, reserva de saída 2250 (conteúdo prosa).
   **Requisitos:** geral 1 (raciocínio); raciocinio 3 (raciocínio com vários critérios) → classe **Avançado**; janela mínima 2.894 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.973), `x/avancado-curto` (utilidade 0.5).
4. **Excluídos:** `anthropic/claude-haiku-4.5`: capacidade_insuficiente; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o modelo padrão da classe, com consumo próximo do menor. Economia escolheria `x/avancado-curto` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (o modelo padrão da classe, com consumo próximo do menor).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (raciocínio) exige a classe Avançado: raciocínio com vários critérios. Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio)."

### J. Nova tentativa

Pedido: "Não resolveu o problema, a resposta anterior não funcionou." (tentativa anterior na classe Rápido)

1. **Classificação:** tipos consulta; complexidade simples; domínio de precisão: nenhum.
2. **Sinais:** 59 caracteres; 0 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação sim; tokens: fixo 600, mensagem 20, histórico 1334, reserva de saída 1000 (conteúdo prosa).
   **Requisitos:** geral 1 (consulta simples); nova_tentativa 2 (a resposta anterior não resolveu) → classe **Equilibrado**; janela mínima 1.620 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.707), `x/avancado-curto` (utilidade 0.255), `anthropic/claude-haiku-4.5` (utilidade 1.2), `x/equilibrado-longo` (utilidade 0.318).
4. **Excluídos:** `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-haiku-4.5` (Equilibrado).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `anthropic/claude-haiku-4.5` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (uma classe acima do mínimo, pela preferência da empresa).
7. **Custo relativo:** 50% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Equilibrado, escolhida automaticamente pela GreenIA. O pedido (consulta) exige a classe Equilibrado: a resposta anterior não resolveu. Escolhido o de menor consumo entre os que atendem."

### K. Simples com precisão alta

Pedido: "Extraia o valor exato de cada linha desta tabela." + itens.csv (3.000 caracteres)

1. **Classificação:** tipos extracao; complexidade intermediaria; domínio de precisão: exatidao.
2. **Sinais:** 49 caracteres; 1 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 1386, histórico 0, reserva de saída 1000 (conteúdo denso).
   **Requisitos:** geral 1 (extração de informações); precisao 2 (exatidão pedida item a item) → classe **Equilibrado**; janela mínima 2.986 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.707), `x/avancado-curto` (utilidade 0.252), `anthropic/claude-haiku-4.5` (utilidade 1.2), `x/equilibrado-longo` (utilidade 0.318).
4. **Excluídos:** `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-haiku-4.5` (Equilibrado).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `anthropic/claude-haiku-4.5` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (uma classe acima do mínimo, pela preferência da empresa).
7. **Custo relativo:** 50% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Equilibrado, escolhida automaticamente pela GreenIA. O pedido (extração de informações; 1 anexo) exige a classe Equilibrado: exatidão pedida item a item. Escolhido o de menor consumo entre os que atendem."

### L. Complexa sem precisão de domínio

Pedido: "Planeje uma campanha interna de integração considerando público, canais e calendário."

1. **Classificação:** tipos raciocinio; complexidade complexa; domínio de precisão: nenhum.
2. **Sinais:** 85 caracteres; 0 anexo(s); etapas 0; critérios 3; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 29, histórico 0, reserva de saída 2250 (conteúdo prosa).
   **Requisitos:** geral 2 (várias etapas ou critérios); raciocinio 3 (raciocínio com vários critérios) → classe **Avançado**; janela mínima 2.879 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.973), `x/avancado-curto` (utilidade 0.5).
4. **Excluídos:** `anthropic/claude-haiku-4.5`: capacidade_insuficiente; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o modelo padrão da classe, com consumo próximo do menor. Economia escolheria `x/avancado-curto` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (o modelo padrão da classe, com consumo próximo do menor).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (raciocínio) exige a classe Avançado: raciocínio com vários critérios. Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio)."

### M. Síntese curta

Pedido: "Resuma os principais pontos desta ata." + ata.docx (5.000 caracteres)

1. **Classificação:** tipos sintese; complexidade simples; domínio de precisão: nenhum.
2. **Sinais:** 38 caracteres; 1 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 1680, histórico 0, reserva de saída 1000 (conteúdo prosa).
   **Requisitos:** geral 1 (síntese) → classe **Rápido**; janela mínima 3.280 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade -1.926), `x/avancado-curto` (utilidade -2.379), `anthropic/claude-haiku-4.5` (utilidade -1.233), `x/equilibrado-longo` (utilidade -2.116), `google/gemini-3.5-flash-lite` (utilidade -0.372), `x/rapido-curto` (utilidade 0.5).
4. **Excluídos:** nenhum.
5. **Escolhido:** `x/rapido-curto` (Rápido).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `x/rapido-curto` (o de menor consumo entre os que atendem); Qualidade, `x/rapido-curto` (o de menor consumo entre os que atendem).
7. **Custo relativo:** 4% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (síntese; 1 anexo) exige a classe Rápido: síntese. Escolhido o de menor consumo entre os que atendem."

### O. Análise intermediária

Pedido: "Compare estas duas propostas de fornecedores e aponte as diferenças." + propostas.docx (8.000 caracteres)

1. **Classificação:** tipos analise; complexidade intermediaria; domínio de precisão: nenhum.
2. **Sinais:** 68 caracteres; 1 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 2690, histórico 0, reserva de saída 1800 (conteúdo prosa).
   **Requisitos:** geral 2 (análise) → classe **Equilibrado**; janela mínima 5.090 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.707), `x/avancado-curto` (utilidade 0.25), `anthropic/claude-haiku-4.5` (utilidade 1.2), `x/equilibrado-longo` (utilidade 0.318).
4. **Excluídos:** `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-haiku-4.5` (Equilibrado).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `anthropic/claude-haiku-4.5` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (uma classe acima do mínimo, pela preferência da empresa).
7. **Custo relativo:** 50% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Equilibrado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Equilibrado: análise. Escolhido o de menor consumo entre os que atendem."

### P. Correção de código colado

Pedido: "Corrija o bug desta função:
```js
function soma(lista) { let t = 0; for (let i = 1; i <= lista.length; i++) t += lista[i]; return t; }
```"

1. **Classificação:** tipos programacao; complexidade intermediaria; domínio de precisão: nenhum.
2. **Sinais:** 138 caracteres; 0 anexo(s); etapas 0; critérios 0; risco não; "simples" explícito não; código sim; insatisfação não; tokens: fixo 600, mensagem 46, histórico 0, reserva de saída 2250 (conteúdo prosa).
   **Requisitos:** geral 1 (programação); programacao 2 (programação) → classe **Equilibrado**; janela mínima 2.896 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 0.707), `x/avancado-curto` (utilidade 0.234), `anthropic/claude-haiku-4.5` (utilidade 1.2), `x/equilibrado-longo` (utilidade 0.318).
4. **Excluídos:** `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente.
5. **Escolhido:** `anthropic/claude-haiku-4.5` (Equilibrado).
6. **Motivo:** o de menor consumo entre os que atendem. Economia escolheria `anthropic/claude-haiku-4.5` (o de menor consumo entre os que atendem); Qualidade, `anthropic/claude-sonnet-5` (uma classe acima do mínimo, pela preferência da empresa).
7. **Custo relativo:** 50% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Equilibrado, escolhida automaticamente pela GreenIA. O pedido (programação) exige a classe Equilibrado: programação. Escolhido o de menor consumo entre os que atendem."

### N. Análise sobre janela grande

Pedido: "Analise este relatório e identifique inconsistências entre as seções." + relatorio.pdf (700.000 caracteres)

1. **Classificação:** tipos analise; complexidade intermediaria; domínio de precisão: nenhum.
2. **Sinais:** 69 caracteres; 1 anexo(s); etapas 0; critérios 0; risco sim; "simples" explícito não; código não; insatisfação não; tokens: fixo 600, mensagem 233357, histórico 0, reserva de saída 1800 (conteúdo prosa).
   **Requisitos:** geral 2 (análise); leitura_longa 3 (análise sobre grande volume de conteúdo) → classe **Avançado**; janela mínima 235.757 tokens.
3. **Candidatos que atendem:** `anthropic/claude-sonnet-5` (utilidade 1.2).
4. **Excluídos:** `x/avancado-curto`: janela de contexto pequena para este conteúdo; `anthropic/claude-haiku-4.5`: capacidade_insuficiente, janela de contexto pequena para este conteúdo; `x/equilibrado-longo`: capacidade_insuficiente; `google/gemini-3.5-flash-lite`: capacidade_insuficiente; `x/rapido-curto`: capacidade_insuficiente, janela de contexto pequena para este conteúdo.
5. **Escolhido:** `anthropic/claude-sonnet-5` (Avançado).
6. **Motivo:** o único modelo permitido que atende. Economia escolheria `anthropic/claude-sonnet-5` (o único modelo permitido que atende); Qualidade, `anthropic/claude-sonnet-5` (o único modelo permitido que atende).
7. **Custo relativo:** 100% do Avançado padrão.
8. **Governança:** fornecedor_sem_treino.
   **Explicação exibida:** "Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: análise sobre grande volume de conteúdo. 3 modelos ficaram de fora por janela de contexto pequena (cerca de 236 mil tokens necessários). Escolhido o único modelo permitido que atende."

## Mesmo pedido, restrições diferentes (caso C)

| Situação | Escolhido | Motivo | Fallback | Explicação |
|---|---|---|---|---|
| Sem restrição | `anthropic/claude-sonnet-5` | o modelo padrão da classe, com consumo próximo do menor | — | Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. Escolhido o modelo padrão da classe, com consumo próximo do menor (preferência Equilíbrio). |
| Pessoa sem acesso ao Avançado | `anthropic/claude-haiku-4.5` | o mais capaz entre os permitidos | abaixo_do_necessario: a pessoa não tem acesso à classe | Classe Equilibrado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. A tarefa pedia a classe Avançado, mas a pessoa não tem acesso à classe: usado o mais capaz permitido. |
| Conversa sigilosa, homologado só no Rápido | `google/gemini-3.5-flash-lite` | o mais capaz entre os permitidos | abaixo_do_necessario: conversa sigilosa (só homologados) | Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. A tarefa pedia a classe Avançado, mas conversa sigilosa (só homologados): usado o mais capaz permitido. Regras aplicadas: conversa sigilosa: só modelos homologados. |
| Conversa sigilosa, homologados no Rápido e no Avançado | `anthropic/claude-sonnet-5` | o único modelo permitido que atende | — | Classe Avançado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. Escolhido o único modelo permitido que atende. Regras aplicadas: conversa sigilosa: só modelos homologados. |
| Créditos do mês no fim (reserva) | `x/rapido-curto` | o mais capaz entre os permitidos | abaixo_do_necessario: créditos do mês no fim (só Rápido) | Classe Rápido, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. A tarefa pedia a classe Avançado, mas créditos do mês no fim (só Rápido): usado o mais capaz permitido. Regras aplicadas: créditos do mês no fim: só a classe Rápido. |
| Empresa sem modelo Avançado liberado | `anthropic/claude-haiku-4.5` | o mais capaz entre os permitidos | abaixo_do_necessario: a empresa não liberou modelo desta classe | Classe Equilibrado, escolhida automaticamente pela GreenIA. O pedido (análise; 1 anexo) exige a classe Avançado: assunto que pede precisão, com riscos ou inconsistências a apontar. A tarefa pedia a classe Avançado, mas a empresa não liberou modelo desta classe: usado o mais capaz permitido. |

## Experimento controlado: Economia × Equilíbrio × Qualidade

Mesmos pedidos, mesmo catálogo, só a preferência muda. Preço relativo: custo estimado da escolha ÷ o mais barato entre os que atendem. Capacidade relevante: as dimensões que definiram a exigência.

### Catálogo de referência (capacidade = classe)

| Caso | Requisitos | Classe mínima | Atendem | Economia | Equilíbrio | Qualidade | Preço relativo (E / Eq / Q) | Capacidade relevante (E / Eq / Q) | Diferença |
|---|---|---|---:|---|---|---|---|---|---|
| A | geral 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| B | geral 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| C | geral 2, precisao 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,31× / 1,31× | precisao 3 / precisao 3 / precisao 3 | muda o modelo, não a capacidade (curadoria/custo) |
| D | geral 2, precisao 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,31× / 1,31× | precisao 3 / precisao 3 / precisao 3 | muda o modelo, não a capacidade (curadoria/custo) |
| E | geral 3, raciocinio 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,26× / 1,26× | geral 3, raciocinio 3 / geral 3, raciocinio 3 / geral 3, raciocinio 3 | muda o modelo, não a capacidade (curadoria/custo) |
| F | geral 1, programacao 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1, programacao 1 / geral 1, programacao 1 / geral 1, programacao 1 | iguais: não há alternativa melhor ou mais barata |
| G | geral 3, raciocinio 3, programacao 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,27× / 1,27× | geral 3, raciocinio 3, programacao 3 / geral 3, raciocinio 3, programacao 3 / geral 3, raciocinio 3, programacao 3 | muda o modelo, não a capacidade (curadoria/custo) |
| H | geral 1 | — | 3 | `google/gemini-3.5-flash-lite` | `google/gemini-3.5-flash-lite` | `google/gemini-3.5-flash-lite` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| I | geral 1, raciocinio 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,26× / 1,26× | raciocinio 3 / raciocinio 3 / raciocinio 3 | muda o modelo, não a capacidade (curadoria/custo) |
| J | geral 1 | Equilibrado | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | geral 2 / geral 2 / geral 3 | Qualidade compra capacidade relevante |
| K | geral 1, precisao 2 | — | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | precisao 2 / precisao 2 / precisao 3 | Qualidade compra capacidade relevante |
| L | geral 2, raciocinio 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,26× / 1,26× | raciocinio 3 / raciocinio 3 / raciocinio 3 | muda o modelo, não a capacidade (curadoria/custo) |
| M | geral 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| O | geral 2 | — | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | geral 2 / geral 2 / geral 3 | Qualidade compra capacidade relevante |
| P | geral 1, programacao 2 | — | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | programacao 2 / programacao 2 / programacao 3 | Qualidade compra capacidade relevante |
| N | geral 2, leitura_longa 3 | — | 1 | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 1,00× | leitura_longa 3 / leitura_longa 3 / leitura_longa 3 | iguais: não há alternativa melhor ou mais barata |

Resumo: 6 casos iguais nas três; 6 mudam o modelo sem mudar a capacidade relevante; 4 em que Qualidade compra capacidade relevante; 0 outros.

### Catálogo com capacidades explícitas (Equilibrado forte em programação; Avançado curto fraco em leitura longa e precisão)

| Caso | Requisitos | Classe mínima | Atendem | Economia | Equilíbrio | Qualidade | Preço relativo (E / Eq / Q) | Capacidade relevante (E / Eq / Q) | Diferença |
|---|---|---|---:|---|---|---|---|---|---|
| A | geral 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| B | geral 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| C | geral 2, precisao 3 | — | 1 | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 1,00× | precisao 3 / precisao 3 / precisao 3 | iguais: não há alternativa melhor ou mais barata |
| D | geral 2, precisao 3 | — | 1 | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 1,00× | precisao 3 / precisao 3 / precisao 3 | iguais: não há alternativa melhor ou mais barata |
| E | geral 3, raciocinio 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,26× / 1,26× | geral 3, raciocinio 3 / geral 3, raciocinio 3 / geral 3, raciocinio 3 | muda o modelo, não a capacidade (curadoria/custo) |
| F | geral 1, programacao 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1, programacao 1 / geral 1, programacao 1 / geral 1, programacao 1 | iguais: não há alternativa melhor ou mais barata |
| G | geral 3, raciocinio 3, programacao 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,27× / 1,27× | geral 3, raciocinio 3, programacao 3 / geral 3, raciocinio 3, programacao 3 / geral 3, raciocinio 3, programacao 3 | muda o modelo, não a capacidade (curadoria/custo) |
| H | geral 1 | — | 3 | `google/gemini-3.5-flash-lite` | `google/gemini-3.5-flash-lite` | `google/gemini-3.5-flash-lite` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| I | geral 1, raciocinio 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,26× / 1,26× | raciocinio 3 / raciocinio 3 / raciocinio 3 | muda o modelo, não a capacidade (curadoria/custo) |
| J | geral 1 | Equilibrado | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | geral 2 / geral 2 / geral 3 | Qualidade compra capacidade relevante |
| K | geral 1, precisao 2 | — | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | precisao 2 / precisao 2 / precisao 3 | Qualidade compra capacidade relevante |
| L | geral 2, raciocinio 3 | — | 2 | `x/avancado-curto` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,26× / 1,26× | raciocinio 3 / raciocinio 3 / raciocinio 3 | muda o modelo, não a capacidade (curadoria/custo) |
| M | geral 1 | — | 6 | `x/rapido-curto` | `x/rapido-curto` | `x/rapido-curto` | 1,00× / 1,00× / 1,00× | geral 1 / geral 1 / geral 1 | iguais: não há alternativa melhor ou mais barata |
| O | geral 2 | — | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 2,00× | geral 2 / geral 2 / geral 3 | Qualidade compra capacidade relevante |
| P | geral 1, programacao 2 | — | 4 | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | `anthropic/claude-haiku-4.5` | 1,00× / 1,00× / 1,00× | programacao 3 / programacao 3 / programacao 3 | iguais: não há alternativa melhor ou mais barata |
| N | geral 2, leitura_longa 3 | — | 1 | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | 1,00× / 1,00× / 1,00× | leitura_longa 3 / leitura_longa 3 / leitura_longa 3 | iguais: não há alternativa melhor ou mais barata |

Resumo: 9 casos iguais nas três; 4 mudam o modelo sem mudar a capacidade relevante; 3 em que Qualidade compra capacidade relevante; 0 outros.

## Ablação de sinais: quais sinais mudam a escolha

Cada linha desliga um sinal na análise e roteia de novo (16 casos × 3 preferências = 48 decisões). "Muda" conta as decisões em que o modelo escolhido mudou.

| Sinal desligado | Decisões que mudam | Casos afetados |
|---|---:|---|
| tipo análise | 12 | C, D, O, N |
| tipo raciocínio | 6 | I, L |
| tipo programação | 3 | P |
| domínio de precisão | 7 | C, D, K |
| risco | 4 | C, D |
| critérios/etapas | 6 | E, I, L |
| "simples" explícito | 3 | F |
| insatisfação | 3 | J |
| volume/janela | 5 | H, N |
