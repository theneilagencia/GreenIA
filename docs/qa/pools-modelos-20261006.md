# Modelos por nível e roteamento 3.1

## Comportamento

Automático decide o nível conforme a tarefa, capacidade necessária, permissões e plano, e refina a escolha de modelo dentro desse nível. Rápido, Equilibrado e Avançado selecionam entre modelos elegíveis no nível pedido, em vez de fixar o padrão. Quick Win com classe fixa conserva a classe; Quick Win com identificador técnico fixo continua fixando o recurso. Roteamento desativado pelo administrador mantém o comportamento de escolha pelo padrão.

O motor avalia capacidade declarada por dimensão, precisão e complexidade do pedido, contexto mínimo e histórico, custo estimado, preferência da empresa e proteção exigida. A afinidade editorial da curadoria só refina modelos do mesmo nível com custo até 1,5 vez o menor custo comparável; é uma preferência limitada, não um benchmark ou garantia de qualidade. Economia ignora esse bônus. Capacidades explícitas e regras obrigatórias sempre prevalecem.

## Curadoria recomendada

| Nível | Modelos previstos |
| --- | --- |
| Rápido | Gemini 3.5 Flash Lite; GPT-5 Mini; Gemini 3.1 Flash Lite |
| Equilibrado | Claude Haiku 4.5; GPT-5.4 Mini; Gemini 3.8 Flash |
| Avançado | Claude Sonnet 5; GPT-5.5; Gemini 3.5 Flash |

A sincronização normal do catálogo inclui os modelos adicionais apenas no modo recomendado, após confirmar identificação, preços positivos e contexto de pelo menos 32 mil tokens. Tetos de inclusão por milhão de tokens (entrada/saída): Rápido US$ 0,50/3; Equilibrado US$ 1,50/10; Avançado US$ 5/30. Preços efetivos vêm do fornecedor. Um recurso ausente, com preço inválido ou fora desses tetos não é adicionado automaticamente. A quantidade efetiva depende dessa confirmação e da configuração da empresa.

Modo manual, modelos já cadastrados ou desativados, capacidades manuais, padrões, grupos, áreas, autorizações de sigilo e vetos não são sobrescritos pela ampliação. O retorno explícito às recomendações mantém as regras existentes dessa ação. Sem mudanças de planos, créditos, esquema ou dependências.

IDs adicionais conferidos nas páginas oficiais do OpenRouter em 06/10/2026:

- https://openrouter.ai/openai/gpt-5-mini
- https://openrouter.ai/google/gemini-3.1-flash-lite
- https://openrouter.ai/openai/gpt-5.4-mini
- https://openrouter.ai/google/gemini-3.8-flash
- https://openrouter.ai/openai/gpt-5.5
- https://openrouter.ai/google/gemini-3.5-flash

## Continuidade e observação

Uma alternativa automática de execução é escolhida no mesmo nível, entre modelos que passam nas regras de capacidade, contexto, acesso e dados. Prefere outro fabricante quando disponível. Reserva explícita existente continua validada pelas mesmas regras. Em informação sigilosa não há reserva livre do fornecedor: após falha antes de qualquer resposta, a GreenIA reavalia recursos autorizados pelos guardrails; escolhas de classe conservam o conjunto pedido e modelos técnicos fixos não são trocados.

Desempenho é calculado dos últimos 200 resultados de execução da própria empresa nos últimos sete dias. Menos de cinco observações é neutro. Falhas e mediana do primeiro token geram penalidade limitada; bloqueios de governança e envios ainda incompletos não entram. Resposta pela reserva conta como falha do primário e sucesso do recurso que respondeu. Não lê conteúdo de conversa, anexos ou documentos. Registro de roteamento contém candidatos, capacidade, afinidade, evidência de desempenho, motivo e alternativa.

Modelos retirados do catálogo são excluídos. Catálogo vazio ou falha de consulta preserva a configuração anterior. Inclusões são transacionais e registradas no evento model.pool_expanded. A Administração mostra quantidade e nomes de modelos por nível; o consumo exibido continua como estimativa do modelo de preferência.

## Regressão e limites

Onze testes novos de servidor cobrem inclusão idempotente, três modelos por nível, modo manual, preservação de veto/capacidade/desativação, preço/contexto inválido, seleção por classe/tarefa/capacidade, sigilo, pin técnico, retirada do catálogo, desempenho e ausência de contaminação por bloqueios/observações antigas. Dois E2E novos cobrem a Administração em mobile e escolhas dos quatro modos com execução e registro real no servidor de teste.

A regressão encontrou um evento de rolagem atrasado de uma conversa já fechada, corrigido com uso do elemento do evento e proteção para DOM desconectado. Um teste provoca explicitamente esse evento após abrir Administração. Testes anteriores foram atualizados quando a premissa era fixar um modelo técnico ao pedir apenas uma classe; regras de segurança e piso de Quick Win continuam verificadas.

Os testes usam navegador Chromium real e provedor/IA simulados localmente. Não constituem benchmark de qualidade dos nove modelos nem QA autenticado de cada novo modelo em produção. A publicação é confirmada no Render; confirmação do catálogo e autorizações continuam necessárias na instalação de produção. Recarregar abas abertas para obter a atualização.

Rollback de código possível para a base fcd8c2f sem apagar registros novos de modelos ou auditoria. Não restaurar um banco antigo sobre conversas recentes e não reverter o backend de governança para versões anteriores às regras de suspensão/validade de documentos.

Resultados: suíte ampla de servidor 765/765; após os ajustes finais de afinidade, 120/120 testes de roteamento, governança, sigilo, usuário leigo, áreas reforçadas e plano. Suíte final de navegador 93/93; verificação adicional de lateral, rolagem atrasada e conjuntos 15/15. Nenhuma falha, cancelamento ou teste pulado nas execuções finais.
