# Inventário de IA e de processamento externo (Etapa 4 da auditoria operacional)

Data: 14 de outubro de 2026. Escopo: todo ponto em que a GreenIA chama IA ou outro serviço externo que pode
receber conteúdo de usuários, e a aplicação dos guardrails de sigilo em cada um.

**Limite desta auditoria.** Não houve acesso à conta da TheNeil no OpenRouter (chave, painel, configurações de
privacidade, contrato ou DPA). Tudo o que depende da conta está marcado **"não verificado"**. A documentação
pública do OpenRouter foi lida e citada, mas ela descreve o serviço, e não a configuração da conta nem o contrato
da GreenIA. Nenhuma chamada real ao OpenRouter foi feita; os testes usam o OpenRouter falso
(`test/openrouter-falso.js`), que grava o corpo de cada requisição.

Legenda das colunas de evidência:

- **Conta/contrato:** configuração da conta OpenRouter, contrato, DPA. Aqui sempre "não verificado".
- **Doc. pública:** link, trecho e data de leitura (todas lidas em 14/10/2026).
- **Código:** arquivo:linha no commit desta etapa.

## 1. Serviços externos

| # | Serviço | Endpoint | Quem chama | Recebe conteúdo? | Sigiloso? |
|---|---|---|---|---|---|
| S1 | OpenRouter, chat completions (streaming) | `POST {base}/chat/completions`, base `https://openrouter.ai/api/v1` | `src/ia.js:96` (`enviar`), via `iaTrocavel` (`src/plataforma/servidor.js:531`) | Sim: mensagem, anexos em texto (inclusive o texto lido por OCR), histórico, instruções e arquivos do Quick Win, trechos da base | Sim, só pela rota homologada (seção 3) |
| S2 | OpenRouter, plugin `web` (motor Exa), pesquisa na internet | o mesmo endpoint, com `plugins: [{ id: 'web', engine: 'exa', max_results }]` | `src/ia.js:37`; único uso: etapa de coleta do Quick Win, `src/conversas.js:736` | Sim, mas só o "contexto externo seguro" (tema do Quick Win, perfil público, resposta de mercado, o que a pessoa escreveu na execução, filtrado por `pecaSegura`), `src/quickwin-operacao.js:469` | **Não.** Bloqueado (seção 4) |
| S3 | OpenRouter, geração de imagem | `POST {base}/chat/completions` com `modalities: ['image','text']`, sem streaming | `src/ia.js:79`; `src/visual/producao.js:213`, `src/visual/rotas.js:418` | Só o tema e o estilo da peça (título e objetivo, sem números), filtrados por `detectar`/`contemCredencial` | **Não.** Bloqueado |
| S4 | OpenRouter, catálogo | `GET {base}/models` | `src/ia.js:67`, `src/modelos.js:168` | Não | n/a |
| S5 | OpenRouter, conta | `GET {base}/key`, `GET {base}/credits` | `src/ia.js:47`, `src/plataforma/consumo.js:16` | Não | n/a |
| S6 | OpenRouter, custo de geração | `GET {base}/generation?id=` | `src/ia.js:57`, `src/custo-ia.js:63` | Não (só o id) | n/a |
| S7 | Links das fontes do Quick Win | `GET` na URL informada, pela rede segura | `src/fontes.js`, `src/integracoes/rede.js` | Não envia conteúdo; só busca a página | n/a (o texto lido entra como anexo e é classificado) |
| S8 | Integration Builder (sistemas do Cliente) | APIs configuradas pelo Cliente | `src/integracoes/*` | Lê dados (viram anexo classificado) e escreve dados do resultado, com aprovação | Ver decisão D5 |
| S9 | OCR | **local**: tesseract.js no servidor, processo próprio por arquivo | `src/ocr.js`, `src/ocr-processo.js` | Não sai do servidor | n/a |
| S10 | Busca na base | **local**: busca por palavras (SQLite), sem embeddings | `src/busca.js:30` | Não sai do servidor | n/a |
| S11 | Email (SMTP) | provedor de email configurado | `src/email.js` | Notificações; não levam conteúdo de conversa (testado em `qw-programacao.test.js`) | n/a |

Não existem: embeddings, provedor de OCR externo, visão (a imagem nunca vai ao modelo), resumo ou título gerado
por IA (o título é o começo do texto, `src/conversas.js:671`), filas ou workers de IA fora do envio.

**Cabeçalhos enviados ao OpenRouter** (`src/ia.js:42`): `authorization: Bearer <chave>`, `content-type`,
`x-title: GreenIA`. Não há `HTTP-Referer` nem identificador de usuário (`user`). A chave é uma só para todas as
empresas da plataforma (`iaTrocavel`), guardada cifrada no console ou em `OPENROUTER_API_KEY`.

## 2. Modelos, roteamento e fallbacks

| Item | O que existe | Código |
|---|---|---|
| Curadoria (pools) | 9 modelos em três níveis (Rápido, Equilibrado, Avançado) de Google, OpenAI e Anthropic | `src/pools-modelos.js` |
| Padrões e catálogo | O admin libera modelos do catálogo `/models`; o padrão de cada nível vem da configuração | `src/modelos.js`, `src/config.js` |
| Automático do serviço (`openrouter/auto`) | Opcional (`automatico`), fora dos níveis | `src/roteador.js` |
| Gratuitos (`:free`, `openrouter/free`) | Podem ser liberados; restrição `gratuito_treina_com_dados` | `src/roteador.js:242` |
| Reserva do modelo (fallback no fornecedor) | `models: [principal, reserva]` só em conversa **não sigilosa** | `src/ia.js:28`; `src/conversas.js:757` (`reserva: sigilosa ? null`) |
| Fallback de fornecedor | Em conversa normal, o OpenRouter escolhe o fornecedor (padrão do serviço). Em sigilosa, `only` + `allow_fallbacks: false` | `src/ia.js:25` |
| Fallback da GreenIA em sigilosa | Reroteia sem o recurso que falhou, passando de novo pelo roteador e por `conferirEnvio`; até 3 recursos | `src/conversas.js:798-805` |
| Novas tentativas automáticas (retry HTTP) | **Não existem** no cliente (`src/ia.js`), nem no `iaTrocavel` | — |
| Reserva do plano (créditos no fim) | Só Rápido; em sigilosa, só Rápido homologado | `src/plano.js:96` |
| Modo sem provedor | Sem chave: `criarIndisponivel` (nenhuma chamada). A IA simulada nunca substitui a real em produção | `src/ia.js:144` |
| Sem provedor na saída | O nome do provedor é removido das respostas da empresa | `src/sem-provedor.js` |

## 3. Parâmetros de roteamento enviados, por tipo de chamada

| Chamada | `provider` | `models` | `plugins` | Evidência de teste |
|---|---|---|---|---|
| Conversa normal | `{ data_collection: 'deny' }` (ou `'allow'` se o admin desligar "sem treino") | `[principal, reserva]` se houver reserva | — | `chat.test.js`, `provedores-ia-sigilo.test.js` ("permitido") |
| Conversa **sigilosa** (resposta, conferência, revisão da conferência, plano visual, preparação de escolha, autonomia, gerar de novo, execução programada, fallback da GreenIA) | `{ order: [f], only: [f], allow_fallbacks: false, zdr: true, data_collection: 'deny' }`, `f` = endpoint homologado | nunca | nunca | `provedores-ia-sigilo.test.js` (todas as chamadas, inclusive `revisoes`) |
| Coleta de pesquisa (Quick Win) | como a conversa normal | reserva, se houver | `web`, motor `exa`, até 5 resultados | `quickwin-pesquisa-externa.test.js` |
| Chamadas curtas da criação (interpretação, estrutura, exemplo, refinamento, painel) | como a conversa normal | reserva, se houver | — | Recusadas para sigiloso e para dado protegido (`provedores-ia-sigilo.test.js`) |
| Geração de imagem | `{ data_collection: 'deny' }` | — | — (`modalities`) | `producao-visual.test.js`; recusada para sigiloso |

`require_parameters` e `ignore` não são enviados. Não se usa a região dedicada (`eu.openrouter.ai`).

## 4. Enforcement para conteúdo sigiloso

Invariante (`docs/sigilo-guardrails.md`): sigiloso + política ligada + rota homologada elegível → envia; qualquer
outra combinação → não envia. Esta etapa conferiu cada caminho pelos corpos que chegam ao fornecedor.

| Caminho | Situação encontrada | Ação nesta etapa | Teste (`test/provedores-ia-sigilo.test.js`) |
|---|---|---|---|
| Envio permitido | Rota fixada com `zdr` e `deny`; uma única requisição | — | "permitido" (corpo exato; nenhuma chamada de título ou resumo) |
| Sem rota elegível | 409, nada enviado, registro `bloqueado/sem_recurso_elegivel`, aviso ao admin | — | "negado" (também pedindo Rápido, `openrouter/auto` e `classe:rapido`) |
| Provedor fora (503) e limite (429) | Sem reserva no fornecedor; reroteio só para outro homologado; sem outro, erro para a pessoa e `falha_na_execucao` | Fake ganhou `statusFalha` para simular 429 | "indisponível (503)", "indisponível (429)", "segundo recurso homologado" |
| Reserva do plano | Só Rápido homologado | — | "reserva do plano" |
| Gerar de novo | Mesmo caminho; reavalia a autorização | — | "gerar de novo" |
| Quick Win com conferência | Conferência e revisão pela mesma rota fixada | — | "Quick Win sigiloso com pesquisa liberada" (inclui `revisoes`) |
| Execução programada | Mesmo envio (`executarConversaProgramada`) | — | "execução programada" |
| Pesquisa na internet | Bloqueada no roteamento (`emEtapas` exige não sigiloso, `src/conversas.js:506`) | **Lacuna corrigida (defesa final):** `montarCorpo` recusa `pesquisaWeb` em pedido sigiloso | "montarCorpo…" e "Quick Win sigiloso…" (nenhum `plugins`) |
| Variante `:online` e roteadores `openrouter/*` | `semRotaFixa` cobria só `:free`, `openrouter/free` e `openrouter/auto`. Um modelo `x/y:online` (pesquisa embutida) ou um novo roteador `openrouter/...` podia ser homologado e receber sigiloso | **Lacuna corrigida:** `semRotaFixa` cobre `:online` e qualquer `openrouter/*` (`src/sigilo.js:37`); a homologação da empresa (`src/modelos.js`) e a autorização da plataforma (`src/plataforma/api-plataforma.js`) recusam esses ids; `montarCorpo` recusa pedido sigiloso para eles | "montarCorpo…", "homologação: variante :online…" |
| Fornecedor ausente ou inválido | `montarCorpo` já exigia fornecedor | Passa a recusar também valor que não seja texto | "montarCorpo…" |
| Geração de imagem | `decisaoImagem` barra sigiloso, área reforçada, dado protegido e reserva | **Defesa final:** `gerarImagem` recusa `op.sigilosa` sem chamar a rede | "gerarImagem…" |
| Chamadas curtas da criação | `chamarGovernado` recusa Quick Win sigiloso e dado protegido; o refinamento passa `conv.sigilosa`; o painel recusa resultado reservado | — | "chamadas curtas…" |
| Relaxamento silencioso | Nenhum caminho troca para automático, gratuito ou não homologado por saldo, indisponibilidade, reserva, limite ou erro | — | Todos os acima, mais `sigilo-guardrails.test.js` ("invariante absoluta") |

**Limites que continuam (não são resolvidos por código):**

1. O enforcement é do lado do pedido. A GreenIA não confere o fornecedor que de fato atendeu antes de entregar a
   resposta; o campo `provider` da resposta fica registrado em `uso.fornecedor` e `mensagens.fornecedor` para
   auditoria posterior. O OpenRouter devolve o nome de exibição (ex.: "Google Vertex"), e não o slug, então uma
   comparação automática daria falsos alarmes.
2. O `endpoint` homologado precisa ser um slug válido de fornecedor do OpenRouter (ex.: `anthropic`,
   `google-vertex`). A tela não valida o slug. Um valor inválido falha fechado: o OpenRouter não encontra
   fornecedor e responde erro, e nada é processado.
3. `retencaoZero` e `semTreino` da rota são **declarados** por quem homologa. O que a GreenIA garante é o pedido
   `zdr: true` + `data_collection: 'deny'` + `only` em cada chamada; quem filtra os endpoints é o OpenRouter, pela
   lista dele.

## 5. Por rota: treino, retenção, cifragem, localização, obrigação contratual

Rotas: **R1** conversa normal; **R2** conversa sigilosa (rota homologada); **R3** pesquisa na internet; **R4**
geração de imagem; **R5** metadados no OpenRouter (todas as chamadas).

| Garantia | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| Não uso para treino | Pedido `data_collection: 'deny'` (desligável pelo admin). Doc. pública: "`deny`: use only providers which do not collect user data" | `deny` + `zdr: true`; "Providers that do not retain your data are also unable to train on your data" | Pedido `deny` vale para o modelo; o motor de busca não é coberto | Pedido `deny` | OpenRouter: uso de entradas/saídas para melhorar o produto é opt-in, "off by default" — **não verificado na conta** |
| Ausência de retenção (ZDR) | Não pedida | Pedida (`zdr: true`): "the request will only be routed to endpoints that have a Zero Data Retention policy". Cache em memória do fornecedor não conta como retenção para o OpenRouter | **Não coberta**: "ZDR enforcement only applies to provider routing for inference requests" (não cobre plugins como a busca) | Não pedida | OpenRouter: "does not store your prompts or responses, unless you opt in"; guarda metadados (tokens, latência) e amostra prompts para categorização anônima. Registro de prompts (logging) da conta: **não verificado** |
| Cifragem | TLS até o OpenRouter (HTTPS). Cifragem em repouso no OpenRouter e nos fornecedores: **não documentada nas páginas lidas; não verificada** | idem | idem | idem | idem |
| Localização | Estados Unidos ou outros países, conforme o fornecedor; a região dedicada (`eu.`/`us.openrouter.ai`, planos Business/Enterprise) **não é usada** | idem | idem, mais o motor de busca | idem | EUA (OpenRouter, Inc.) |
| Obrigação contratual | **Não verificada** (tipo de conta, DPA, termos aceitos) | **Não verificada**; o filtro ZDR é do serviço, não um contrato da GreenIA | **Não verificada** | **Não verificada** | **Não verificada** |
| Evidência de código | `src/ia.js:27` | `src/ia.js:25` | `src/ia.js:37` | `src/ia.js:79` | — |

### Documentação pública citada (lida em 14/10/2026)

- Privacidade e coleta de dados — <https://openrouter.ai/docs/guides/privacy/data-collection>: "OpenRouter does not
  store your prompts or responses, *unless* you opt in"; "Any prompt retention on OpenRouter is always opt-in";
  "OpenRouter does store metadata (e.g. number of prompt and completion tokens, latency, etc) for each request";
  "OpenRouter samples a small number of prompts for categorization". A página não trata de cifragem nem de local.
- Privacidade e registro — <https://openrouter.ai/docs/features/privacy-and-logging>: "If you opt out of training
  in your account settings, OpenRouter will not route to providers that train"; "Wherever possible, OpenRouter
  works with providers to ensure that prompts will not be trained on, but there are exceptions"; região: "its
  prompts and completions are processed within that region and do not leave it" (só `eu.`/`us.openrouter.ai`).
- ZDR — <https://openrouter.ai/docs/features/zdr>: "Zero Data Retention (ZDR) means that a provider will not store
  your data for any period of time"; "When `zdr` is set to `true`, the request will only be routed to endpoints
  that have a Zero Data Retention policy"; "OpenRouter itself has a ZDR policy; your prompts are not retained
  unless you specifically opt in to prompt logging"; "ZDR enforcement only applies to provider routing for
  inference requests"; sem política clara, o OpenRouter "assume[s] that the endpoint both retains and trains on data".
- Roteamento de fornecedor — <https://openrouter.ai/docs/features/provider-routing>: `only` "List of provider slugs to
  allow for this request"; `allow_fallbacks` "Whether to allow backup providers when the primary is unavailable";
  `data_collection` "`deny`: use only providers which do not collect user data"; `zdr` "Restrict routing to only
  ZDR (Zero Data Retention) endpoints".
- Pesquisa na internet — <https://openrouter.ai/docs/features/web-search>: "`:online` is a shortcut for using the
  `web` plugin"; Exa é o motor quando não há busca nativa; a página não diz o que é enviado ao motor nem fala de
  retenção, exceto que o Firecrawl é rejeitado com ZDR imposto na conta.

## 6. Textos corrigidos nesta etapa

| Onde | Antes | Depois |
|---|---|---|
| Ajuda do admin, Modelos (`public/ajuda-admin.js`) | "Conversas sigilosas sempre usam fornecedor fixado e retenção zero" | Fornecedor fixado e pedido, em cada chamada, de rotas com retenção zero e sem coleta; filtro do serviço de acesso, não garantia contratual |
| Ajuda do admin, Políticas | "retenção zero e ausência de uso para treino comprovadas" | Declaradas na aprovação e pedidas em cada chamada (filtro, não garantia contratual) |
| Ajuda do admin, Políticas (sugestão) | "garantias já conferidas pela plataforma: fornecedor fixo, nada guardado (retenção zero)…" | Rota autorizada pela plataforma, com retenção zero e não treino declarados conforme a documentação dos fornecedores |
| Ajuda do admin, Políticas (pesquisa) | "o pedido sai para o serviço de busca do provedor de IA" | Acrescenta que a busca tem política de retenção própria e que a retenção zero das rotas aprovadas não vale para ela |
| Política de Privacidade, nova cláusula 6.6 (**proposta, não publicada**: em `docs/legal/revisao-pendente/`, aguardando revisão jurídica) | Não mencionava a pesquisa na internet nem a geração de imagem | Descreve o que vai para a busca e para o gerador de imagem, que ambos ficam fora do conteúdo sigiloso e que a retenção zero não cobre a busca (nota técnica em `docs/legal/revisao-pendente/registro-secoes-8-e-9.md`) |

A LP (`public/vendas.html`) e os Termos já descrevem o filtro como "não equivale a uma garantia contratual" e os
atributos das rotas sigilosas como "declarados"; não foram alterados.

## 7. Decisões e ações necessárias do responsável (comerciais e contratuais)

| # | Decisão ou ação | Por quê | Enquanto isso |
|---|---|---|---|
| D1 | Conferir no painel do OpenRouter: tipo de conta, "Private Input & Output Logging" (deve estar desligado), "OpenRouter Use of Inputs/Outputs" (desligado), "ZDR Endpoints Only" e "training opt-out" na conta, provedores ignorados | Nada disso é verificável por código; a LP e a política dependem dessas configurações | Os textos só afirmam o pedido por chamada |
| D2 | Decidir se contrata DPA/termos empresariais com o OpenRouter (e região dedicada, se houver demanda de localização) | Sem contrato, "sem treino" e "retenção zero" são filtros do serviço, não obrigação | Os textos dizem "não é garantia contratual" |
| D3 | Registrar, para cada rota homologada, o slug exato do fornecedor no OpenRouter e a página de política dele, com data | O `endpoint` vira `provider.only`; um slug errado bloqueia o envio | Falha fechada (erro, nada processado) |
| D4 | Pesquisa na internet (Exa via OpenRouter) e geração de imagem: manter ligadas por padrão? A geração de imagem nasce ligada (`src/config.js:33`) | Ambos enviam texto derivado do Quick Win a serviços fora da rota homologada, sem ZDR | Bloqueados para sigiloso, área reforçada, dado protegido e reserva do plano |
| D5 | Integration Builder em conversa sigilosa: a escrita em sistema do Cliente segue as aprovações do Quick Win, mas não é bloqueada pelo sigilo | O destino é sistema do próprio Cliente, configurado por ele; ainda assim é saída de conteúdo sigiloso | Sem mudança; decisão de produto |
| D6 | Validar o slug do fornecedor na homologação contra a lista de endpoints do modelo (`/models/{id}/endpoints`) | Evita homologação com nome de exibição em vez de slug | Falha fechada |
