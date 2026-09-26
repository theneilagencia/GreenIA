# Modelos sugeridos para uma instalação nova

Análise de 26/09/2026. É a sugestão inicial de um modelo por perfil. O admin pode trocar tudo pela tela.

**De onde vêm os números.** O OpenRouter está bloqueado neste ambiente, tanto a API quanto o site. Os preços, janelas de contexto e fornecedores abaixo saíram das páginas dos modelos em openrouter.ai, lidas por um buscador. Isso é uma leitura indireta, não uma chamada à API. Numa instalação com a chave configurada, a atualização diária do catálogo traz os valores oficiais e avisa no painel se algum modelo sair do ar ou mudar de preço mais de 20%.

**O que não foi medido.** A qualidade das respostas em português não foi testada aqui. Isso exige chamadas reais ao modelo. A tela de cada quick win compara, por modelo, as conversas, o feedback, o custo médio e o tempo de resposta. É com esses dados de uso real que o responsável escolhe o modelo padrão.

## A sugestão anterior tinha três problemas

| Perfil | Sugestão anterior | Problema |
|---|---|---|
| Rápido | `google/gemini-2.5-flash` | O Google encerra este modelo no Vertex em 16/10/2026, daqui a três semanas. Uma instalação nova começaria com um padrão prestes a sair do ar. |
| Equilibrado | `openai/gpt-5-mini` | Continua disponível e barato, mas não tem cache explícito de prompt: os arquivos do quick win são cobrados inteiros a cada mensagem. |
| Avançado | `anthropic/claude-sonnet-4.5` | Foi superado pelo Claude Sonnet 5 (lançado em 30/06/2026), que custa menos: US$ 2 / US$ 10 por milhão de tokens, contra US$ 3 / US$ 15. |

## Critérios

1. **Horizonte de disponibilidade.** Nada com data de encerramento anunciada. Nada lançado há poucos dias, quando a família troca de versão a cada poucas semanas.
2. **Custo de uma conversa típica.** Três perguntas e três respostas, com instruções e arquivos de um quick win comum: cerca de 12 mil tokens de entrada e 1.500 de saída. É a mesma conta da estimativa na tela do quick win.
3. **Caminho para homologação.** Para conversa sigilosa, o fornecedor é fixado e a retenção zero é exigida. Isso só funciona se o modelo tiver um fornecedor com contrato de retenção zero no OpenRouter. Para os modelos comerciais, esse caminho é normalmente o Google Vertex, o Amazon Bedrock ou o Azure.
4. **Mais de um fornecedor para o mesmo modelo.** Nas conversas normais, o OpenRouter pode trocar de fornecedor se um falhar.
5. **Cache de prompt.** Instruções e arquivos do quick win se repetem em todas as mensagens. Com cache, essa parte sai bem mais barata. A GreenIA marca o cache nos modelos da Anthropic e do Google; a OpenAI faz cache automático.
6. **Janela de contexto.** Precisa ser folgada para anexos e histórico. Todos os candidatos têm 200 mil tokens ou mais.

## Candidatos

Preços em US$ por milhão de tokens (entrada / saída). O custo por conversa típica foi calculado com 12 mil tokens de entrada e 1.500 de saída, sem cache.

| Modelo (id no OpenRouter) | Preço | Contexto | Fornecedores | Custo por conversa típica | Observação |
|---|---|---|---|---|---|
| `mistralai/mistral-small-2603` (Mistral Small 4) | 0,15 / 0,60 | 262 mil | não confirmado | US$ 0,003 | O mais barato dos citados; fornecedor com retenção zero não confirmado |
| `openai/gpt-5-mini` | 0,25 / 2,00 | 400 mil | OpenAI, Azure | US$ 0,006 | Barato; retenção zero possível via Azure; sem cache explícito |
| `google/gemini-3.5-flash-lite` | 0,30 / 2,50 | 1 milhão | Google Vertex, Google AI Studio | US$ 0,007 | Barato, contexto enorme, cache, Vertex com retenção zero |
| `google/gemini-3.1-flash-lite` | 0,25 / 1,50 | 1 milhão | não confirmado | US$ 0,005 | Mais barato, mas de geração anterior |
| `google/gemini-3.8-flash` | 0,75 / 3,75 | 1 milhão | não confirmado | US$ 0,015 | Lançado em 02/09/2026; a família Flash teve três versões em um mês (3.6, 3.7 e 3.8) |
| `openai/gpt-5.4-mini` | 0,75 / 4,50 | 400 mil | não confirmado | US$ 0,016 | Bom intermediário da OpenAI |
| `anthropic/claude-haiku-4.5` | 1,00 / 5,00 | 200 mil | não confirmado | US$ 0,020 | Estável há um ano; cache explícito (leitura a US$ 0,10) |
| `google/gemini-3.5-flash` | 1,50 / 9,00 | 1 milhão | Google Vertex, Google AI Studio | US$ 0,032 | Caro para um "Flash" |
| `anthropic/claude-sonnet-5` | 2,00 / 10,00 | 1 milhão | Anthropic, Amazon Bedrock, Google Vertex, Azure, Claude Platform on AWS | US$ 0,039 | O mais bem servido: cinco fornecedores, três com caminho de retenção zero |
| `openai/gpt-5.5` | 5,00 / 30,00 | 1 milhão | não confirmado | US$ 0,105 | Quase três vezes o custo do Sonnet 5 |
| `anthropic/claude-opus-5` | 5,00 / 25,00 | não confirmado | não confirmado | US$ 0,098 | Para tarefas raras e difíceis |

Os modelos abertos mais baratos (DeepSeek, Qwen, GLM) ficaram de fora da sugestão inicial. O próprio OpenRouter informa que a API oficial da DeepSeek guarda e treina com os dados. Os fornecedores ocidentais que não treinam cobram cerca do dobro. Com a exigência de "sem treino", que a GreenIA manda em toda chamada, parte dos fornecedores deles fica de fora. Podem entrar depois, liberados pelo admin, se passarem nesse filtro.

## Sugestão

| Perfil | Modelo padrão | Reserva sugerida (mesmo perfil) | Por quê |
|---|---|---|---|
| **Rápido e econômico** (todos) | `google/gemini-3.5-flash-lite` | `openai/gpt-5-mini` | Custo por conversa perto de US$ 0,007, contexto de 1 milhão de tokens, cache, e Google Vertex com retenção zero. A reserva é de outro fornecedor: se o Google cair, o chat continua. |
| **Equilibrado** (todos, por padrão) | `anthropic/claude-haiku-4.5` | `openai/gpt-5.4-mini` | Modelo estável, com cache explícito, que barateia os quick wins com arquivos grandes. Custa cerca de US$ 0,02 por conversa. |
| **Avançado** (ninguém, por padrão) | `anthropic/claude-sonnet-5` | `google/gemini-3.5-flash` | O melhor da faixa de preço: custa menos que o antecessor e tem cinco fornecedores, com três caminhos de retenção zero (Bedrock, Vertex, Azure). |

**Chat.** O padrão do chat é o modelo Rápido. Tarefas leves do dia a dia não precisam de mais.

**Homologado padrão (conversas sigilosas).** A homologação é decisão do admin, com registro, por isso não vem feita na instalação. A sugestão é homologar `google/gemini-3.5-flash-lite` com o fornecedor `google-vertex` fixado. Ele está no perfil Rápido, disponível para todos, então cumpre a garantia de que ninguém fica sem modelo numa conversa sigilosa. Para quem precisa de mais qualidade em conversa sigilosa, homologue também `anthropic/claude-sonnet-5` com `amazon-bedrock` fixado.

Antes de homologar, confira na página do modelo no OpenRouter (aba de fornecedores) se o fornecedor escolhido aparece como retenção zero. Depois faça uma chamada de teste numa conversa sigilosa e veja o fornecedor que respondeu, que fica registrado no log de eventos.

**Nomes com "latest".** Evite os ids que terminam em `latest` (por exemplo `~google/gemini-flash-latest`). O modelo por trás muda sozinho, e isso quebra o sentido da homologação e da comparação por modelo.

## Revisão

- A cada trimestre, ou quando o painel avisar que um modelo saiu do ar ou mudou de preço.
- Use a tabela "por modelo" de cada quick win (feedback, custo médio, tempo de resposta) para trocar o padrão com base em uso real.

## Fontes

Páginas do OpenRouter consultadas pelo buscador em 26/09/2026:

- [Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5)
- [Claude Haiku 4.5](https://openrouter.ai/anthropic/claude-haiku-4.5)
- [Claude Sonnet 4.5](https://openrouter.ai/anthropic/claude-sonnet-4.5)
- [GPT-5 Mini](https://openrouter.ai/openai/gpt-5-mini)
- [GPT-5.4 Mini](https://openrouter.ai/openai/gpt-5.4-mini)
- [GPT-5.5](https://openrouter.ai/openai/gpt-5.5)
- [Gemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash)
- [Gemini 3.5 Flash Lite](https://openrouter.ai/google/gemini-3.5-flash-lite)
- [Gemini 3.5 Flash](https://openrouter.ai/google/gemini-3.5-flash/providers)
- [Gemini 3.8 Flash](https://openrouter.ai/google/gemini-3.8-flash)
- [Gemini 3.1 Flash Lite](https://openrouter.ai/google/gemini-3.1-flash-lite)
- [Mistral Small 4](https://openrouter.ai/mistralai/mistral-small-2603)
- [Retenção zero no OpenRouter](https://openrouter.ai/docs/guides/features/zdr)
- [Retenção zero: o que significa](https://openrouter.ai/blog/insights/zero-data-retention/)
- [Modelos abertos que importam, junho de 2026](https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/)
