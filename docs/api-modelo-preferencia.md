# Contrato da API: `modelo` é preferência, nunca garantia

> O modelo solicitado é considerado uma **preferência**. A GreenIA pode selecionar outro modelo quando o
> modelo solicitado não é elegível segundo as regras de governança, segurança, disponibilidade ou requisitos
> da solicitação.

```text
modelo = preferência de modelo          (sim)
modelo = garantia de execução           (não)

pedido (tela, API ou integração) → governança → roteamento → modelo efetivamente usado
```

A tela e a API chamam o **mesmo endpoint**. Existe uma única rota que executa modelo:
`app.ia.enviar` em `src/conversas.js`, chamada com o modelo e a reserva que o roteador decidiu. O teste
`uma só rota de execução` falha se aparecer outra chamada, ou outro uso do endpoint `chat/completions` do
provedor fora de `src/ia.js`.

## Onde o campo aparece

| Endpoint | Campo | Semântica |
|---|---|---|
| `POST /api/conversas/:id/mensagens` | `modelo` (id técnico, `classe:rapido` / `classe:equilibrado` / `classe:avancado`, `classe:auto` ou `openrouter/auto`) | Preferência de execução. Passa por todas as regras abaixo. A última escolha fica salva na conversa e continua sendo só preferência. |
| `POST/PUT /api/quick-wins` | `modelo`, `pode_trocar` | Configuração de quem gere o quick win, validada na hora de salvar (nível liberado, nível permitido para quick win, homologado se o quick win for sigiloso). Na execução passa pelo mesmo roteador, e o nível do quick win vale como piso. |
| `PUT /api/admin/modelos/:id`, `PUT /api/admin/modelos-config`, `PUT /api/admin/governanca` | liberação, nível, reserva, `automatico`, `roteamento`, `modo` | Configuração do admin. Não é pedido de execução, e nenhum desses campos desliga as regras obrigatórias. |
| `/api/plataforma/homologacoes`, `/api/plataforma/vetos-sigilo` | id do modelo | Camada da plataforma: autoriza ou proíbe um modelo para dado sigiloso em todas as empresas. |

Nenhum endpoint aceita `provider` ou `fornecedor` para execução. O fornecedor de uma conversa sigilosa vem da
homologação, e nas outras conversas quem decide é o OpenRouter, sob a exigência de fornecedor sem treino.

## O que o modelo solicitado nunca fura

Estas regras são avaliadas, na ordem, sobre o modelo solicitado. A primeira que falha define o motivo.

| Ordem | Regra | Motivo registrado |
|---|---|---|
| 1 | Existe no catálogo da empresa | `requested_model_not_found` |
| 2 | Liberado pela empresa (inclui o Automático do OpenRouter desligado) | `requested_model_not_authorized` |
| 3 | Nível sem modelo disponível | `requested_model_not_available` |
| 4 | Acesso da pessoa ao nível (grupo ou área) | `requested_model_permission_restricted` |
| 5 | Conversa sigilosa: modelo homologado | `requested_model_not_homologated` |
| 6 | Conversa sigilosa: modelo que nunca pode receber o dado (vetado pela plataforma, gratuito, Automático do OpenRouter) | `requested_model_not_allowed_for_sensitive_data` |
| 7 | Plano: créditos no fim, só o nível Rápido | `requested_model_plan_restricted` |
| 8 | Política da empresa: fornecedor sem treino com os dados | `requested_model_policy_restricted` |
| 9 | Classe mínima (piso do quick win, nova tentativa depois de "não serviu") | `requested_model_insufficient_capacity` |
| 10 | Janela de contexto | `requested_model_context_limit` |
| 11 | Falha no fornecedor com uma reserva que passou pelas mesmas regras | `requested_model_not_available` |

**Capacidade estimada** pela análise do texto (por exemplo, a pessoa pede Rápido para um contrato
complexo) **não** é uma regra obrigatória. É uma estimativa, e a escolha é respeitada. O registro marca
`abaixo_do_necessario_por_escolha`, como já acontecia antes. Obrigatória é a classe mínima definida pela
governança (item 9).

## Decisão

```text
modelo X solicitado
  ↓
X é elegível? ── sim → usa X                        decisao = respeitado
  └─ não → existe alternativa elegível?
            ├─ sim → roteamento automático          decisao = substituido, motivo = código acima
            └─ não → bloqueio seguro, nada enviado  decisao = bloqueado
```

Nunca `modelo = X → executar X ignorando a governança`. O teste de propriedade faz 120 entradas aleatórias
de API e verifica, com um oráculo independente do roteador, que todo modelo executado era permitido.

## Registro (o mesmo do roteador)

Tabela `roteamento`. É o mesmo registro que reconstrói toda decisão.

| Coluna | Conteúdo |
|---|---|
| `modelo_solicitado` | O que a tela ou a API pediu. Fica `null` quando não houve pedido (automático) ou quando o quick win fixa o modelo. |
| `decisao_solicitado` | `respeitado`, `substituido` ou `bloqueado` |
| `motivo_substituicao` | Um dos códigos acima. Fica `null` quando a escolha foi respeitada. |
| `modelo` / `modelo_usado` | O que foi selecionado e o que de fato respondeu |
| `explicacao` | A explicação técnica. Na substituição ganha a frase "Modelo solicitado não usado: …", montada a partir do código. |

A explicação mostrada à pessoa sai dos mesmos campos gravados (`explicarParaPessoa`), nunca de outro cálculo.

## Resposta

No streaming, os eventos `inicio` e `fim` trazem `rota.solicitacao`. No bloqueio, a solicitação vem no corpo do erro, também em `rota.solicitacao`:

```json
{ "modelo_solicitado": "google/gemini-3.5-flash-lite", "modelo_selecionado": "anthropic/claude-haiku-4.5",
  "decisao": "substituido", "motivo": "requested_model_not_eligible" }
```

- **Quem não é admin** recebe o motivo genérico `requested_model_not_eligible`. Isso basta para diferenciar
  `solicitado = selecionado` de `solicitado ≠ selecionado`, sem expor a regra.
- **O admin** recebe o código exato.
- **Sem modelo solicitado**, `solicitacao` é `null`.
- **O fornecedor técnico** não vai para quem não é admin, nem no streaming nem no histórico.

## Hierarquia e modos

```text
plataforma autoriza e proíbe (mínimo de segurança)
        ↓
empresa acrescenta homologações e restrições, nunca para um modelo proibido pela plataforma
        ↓
pessoa não altera nada disso
```

`governanca.modo` pode ser `recomendado` ou `manual`. Em `recomendado`, a GreenIA mantém um modelo sugerido por
nível, o roteamento automático em Equilíbrio, a exigência de fornecedor sem treino e o Automático do OpenRouter
desligado. Em `manual`, o admin ajusta esses pontos, e qualquer ajuste feito pelo admin muda para esse modo,
com registro. **Nos dois modos** continuam valendo sigilo, homologação, vetos e autorizações da plataforma,
acesso por grupo, plano e janela. Voltar para `recomendado` restaura os ajustes de modelos e mantém as
homologações e os vetos.
