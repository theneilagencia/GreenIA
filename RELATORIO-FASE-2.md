# Relatório da Fase 2: base de produção multi-cliente

Situação em 24/09/2026, branch `claude/descompactar-enviar-arquivos-hkx9is`. A Fase 2 terminou com os 12 itens do plano entregues, um commit por item, mais uma correção de segurança encontrada no item 11. A Fase 3 só começa depois da sua confirmação.

## Resumo

- O servidor (`server/`) faz o login, guarda a sessão, aplica a política de dados, chama o modelo com streaming, mantém a base de conhecimento, a retenção, os limites e a cota. Ele também entrega o frontend.
- O isolamento entre clientes é feito pelo Postgres (RLS), com o app conectado por um papel sem `BYPASSRLS`. Os testes rodam contra um banco real, com um dono que não é superusuário, para que uma falha de política apareça.
- O `.dc.html` continua abrindo no Claude Design em modo demonstração. Servido pelo backend, ele fala só com o servidor, sem volta silenciosa ao modelo do navegador.
- Testes, todos passando nesta data:

  | Suíte | Resultado |
  |---|---|
  | servidor | 92/92 |
  | raiz (lib, sincronia, templates, contraste) | 71/71 |
  | e2e do protótipo no navegador | 10/10 |
  | `tsc --noEmit` do servidor | sem erros |

## Ajustes que você pediu na aprovação

| Ajuste | Como ficou |
|---|---|
| 1. Node 24 se for LTS ativo | Node 24 (`engines: >=24 <25`). LTS ativo desde 28/10/2025, entra em manutenção em 20/10/2026 e termina em 30/04/2028. O TypeScript roda direto no Node (remoção de tipos), sem etapa de build; `tsc --noEmit` só confere os tipos. |
| 2. Embeddings locais, medidos antes | Não medidos: o download do modelo falha em `huggingface.co`. A avaliação está pronta (seção "Medições"), e a busca continua só por palavra-chave, atrás da interface `KnowledgeSource`. Voyage não foi considerado. |
| 3. Liberação do HuggingFace | Ainda bloqueado neste ambiente. Os hosts exatos estão na seção "O que não foi possível". |
| 4. Login pelo servidor | Cookie `__Host-gia_session` (HttpOnly, Secure, SameSite=Lax). As escritas exigem `Origin` permitido e o cabeçalho `X-CSRF-Token` da sessão. |
| 5. Email por SMTP atrás de interface | `EmailSender` com `SmtpEmailSender` (nodemailer) e `MemoryEmailSender` (testes). SPF, DKIM e DMARC estão documentados no `README.md`. |
| 6. AWS sa-east-1 sem acoplamento | Banco, documentos, Redis e email mapeados para RDS, S3, ElastiCache e SES em sa-east-1 no README e em `server/.env.example`. O código só vê interfaces e variáveis de ambiente. |
| 6. Claude via Bedrock no Brasil | **Não é possível**: não há perfil de inferência do Bedrock para o Brasil, e o Haiku 4.5 tem só perfis global, US e EU. Detalhes em `docs/fase-2/bedrock-regiao-brasil.md`. Por isso o segundo `LlmProvider` não foi implementado. |
| Modo `backendUrl` sem fallback | Com backend, o frontend nunca chama `window.claude.complete`. Erros do servidor (401, 409, 413, 422, 429, 5xx, rede) viram mensagem na tela e o texto volta ao campo. O filtro do navegador só avisa antes; quem decide é o servidor. |
| NER em três conjuntos | Medido nos dois conjuntos existentes. O terceiro, do time, ainda não chegou: a coluna está reservada na tabela. |

## Itens entregues

### 1. Esqueleto e migrações com RLS
- Migrações SQL numeradas (`server/migrations/001` a `006`), aplicadas por `src/db/migrate.ts` e registradas em `schema_migrations`.
- Funções de contexto `app_tenant()`, `app_user()`, `app_area_ids()` e `app_can_see_area()`. Cada requisição roda em `withTenant()`, que define o contexto com `set_config(..., true)`, válido só na transação.
- O papel `greenia_app` não tem `BYPASSRLS` e o servidor loga como membro dele. As funções que precisam enxergar antes do login (`public_tenant`, `session_lookup`, `auth_flow_take`) e a limpeza da retenção são `SECURITY DEFINER` do dono, com `search_path` fixo.
- `audit_log` só aceita inserções. Há uma exceção, controlada, para apagar um tenant inteiro.
- Testes: um tenant não lê nem altera linhas de outro, mesmo tentando pelo SQL direto.

### 2. Tenants e configuração
- A configuração do tenant é validada por zod: marca, textos, `policyUrl`, `privacyNote`, `privacyDetail`, contato do key user, política de dados, provedor e modelo, limites, retenção e auto-provisionamento.
- As cores são validadas contra os fundos do tema com a mesma lógica de `lib/contrast.mjs`. Abaixo de 4,5:1, a cor é escurecida no mesmo matiz e o ajuste é informado.
- `GET /api/tenant/config` devolve só o público, sem `clientId`, sem nome de segredo e sem configuração dos provedores.

### 3. Autenticação
- OIDC (Entra ID, Google e genérico) com PKCE, `state` e `nonce`. O servidor confere o diretório (`tid`) no Entra e o domínio (`hd`, com email verificado) no Google, além do domínio do email.
- Código por email: 6 dígitos, validade de 10 minutos, 5 tentativas, no máximo 3 códigos a cada 15 minutos. Só o hash é guardado.
- Sessão pelo hash do token, com expiração. Logout apaga a sessão.
- Login negado vai para a auditoria com o motivo.
- Testes: um emissor OIDC simulado cobre assinatura, `aud`, `iss`, `nonce`, diretório e domínio errados. O teste com Entra e Google reais depende de registrar o app em cada um (pendência de implantação).

### 4. Papéis e áreas
- Papéis `usuario`, `revisor`, `key_user`, `admin_cliente` e `admin_theneil`, numa matriz em `auth/rbac.ts`.
- O acesso por área é aplicado pelo banco. O teste confirma que quem não é do RH não vê documento do RH, nem pela API nem pelo SQL.
- Criação de tenant pela plataforma (`POST /api/platform/tenants`, só `admin_theneil`) e pelo script `create-tenant.ts`.

### 5. Proxy do modelo com streaming
- `POST /api/chat` com eventos SSE `meta`, `delta`, `done` e `error`.
- A persona é montada no servidor, no parâmetro `system`. A chave fica só no servidor.
- `LlmProvider` tem duas implementações: `AnthropicProvider` (`@anthropic-ai/sdk`, padrão `claude-haiku-4-5`, até 4096 tokens de saída) e `FakeProvider` (testes e desenvolvimento).
- O pipeline é feito de etapas: uso, assistente, política de dados, base de conhecimento, retenção. A Fase 3 acrescenta etapas sem mexer nas existentes.

### 6. Política de dados no servidor
- O mesmo `decideAction` da lib roda antes de qualquer chamada ao modelo, com a política do tenant e, quando há, a do assistente.
- As ações são `bloquear`, `avisar`, `mascarar`, `permitir_com_registro` e `permitir`, nessa ordem de prioridade. Credencial é sempre bloqueada.
- A classe de dado do assistente (verde, amarela, vermelha) limita as ações aceitas na configuração.
- Bloqueio responde 422, só com o tipo. Aviso responde 409 até a pessoa confirmar. A confirmação vai para a auditoria com os tipos, nunca o valor.
- Teste: CPF bloqueado no servidor com o filtro do navegador desligado.

### 7. Base de conhecimento
- Documentos com versões. O arquivo fica no S3, com criptografia no servidor, sob o prefixo do tenant, e o hash sha256 fica no banco.
- A indexação roda na fila (BullMQ) e quebra o texto em trechos de até cerca de 1.200 caracteres.
- A busca por palavra-chave (`KeywordKnowledgeSource`) usa um índice `tsvector` sobre termos normalizados pela lib e a mesma pontuação da Fase 1. O filtro de tenant e área vem da RLS. Cada resposta registra documento e versão usados.
- **Desvio:** o plano previa busca híbrida com embeddings. Ela fica para depois da medição, que não foi possível (ajuste 2).

### 8. Retenção
- A conversa livre não é gravada.
- A saída de assistente com `keepOutputs` é gravada com `expires_at`, pelo prazo do assistente ou pelo padrão do tenant (90 dias), junto com os hashes de entrada e saída e as fontes.
- A limpeza roda de hora em hora pela fila, com uma função `SECURITY DEFINER` que só apaga o que venceu.

### 9. Limites e cotas
- Limite por minuto, por usuário e por tenant (Redis, janela fixa). Tamanho máximo de mensagem e de arquivo por tenant.
- O consumo fica em `usage_events`: tokens e custo em reais pela tabela de preços de referência de 24/06/2026 e pelo câmbio `USD_BRL`, que por padrão é 5,5 e é uma suposição.
- Cota mensal com alerta por email aos administradores em 80% e 100%, uma vez por mês. Com `hardLimit`, a cota bloqueia ao chegar em 100%.

### 10. Frontend ligado ao backend
- Props `backendUrl` e `tenantSlug`. O servidor injeta `window.__GREENIA__ = { backendUrl: "/" }` e o React local, sem unpkg.
- A página tem login real (provedores do tenant e fluxo de email com código), textos e marca do tenant e streaming lido do SSE.
- `heroTitle` existe na configuração, mas **não está ligado na tela**: o título tem quebra e ênfase no meio, e ligar pediria mudar a marcação. Fica para quando houver o texto de um cliente real.
- A CSP das páginas precisa de `'unsafe-eval'`, porque o runtime `support.js` compila os templates com `new Function`. Isso só sai se o frontend deixar esse runtime.

### 11. Operação
- `Dockerfile` (dois estágios, `node:24-alpine`, usuário sem privilégio, `HEALTHCHECK`) e `docker-compose.yml`: Postgres com pgvector, Redis, MinIO com SSE, Mailpit, migrador e app.
- Exemplos de variáveis: local e AWS. O `README.md` cobre execução local, papéis do banco, variáveis, criação de tenant e OIDC, mapeamento AWS, SPF/DKIM/DMARC, backup, restauração, saúde e logs.
- Validado aqui:
  - `SmtpEmailSender` contra o Mailpit;
  - `S3ObjectStore` contra o moto, com SSE AES256 confirmado no objeto;
  - o servidor em modo produção rodando na mesma árvore de arquivos da imagem. O teste passou por migração, criação de tenant, login com o código lido do Mailpit, envio de documento, indexação pelo worker e busca.
- **Não validado:** o `docker build` e o `docker compose up`. O Docker Hub respondeu 429 para `node:24-alpine` e `redis:7-alpine`, e o proxy recusou `quay.io` (MinIO) e o ECR público.
- **Correção de segurança encontrada aqui:** em produção, o parâmetro `?tenant=` deixava o host de um cliente abrir o login de outro e gravar o cookie desse outro. Os dados não vazavam, porque a sessão guarda o próprio tenant, mas o comportamento confunde e facilita phishing. Agora, em produção, só o host decide (commit à parte, com teste).

### 12. Testes finais e medições
Veja a seção "Medições" abaixo.

## Desvios do plano

- **Kysely → `pg` puro.** As consultas são SQL parametrizado com `pg`, e o isolamento está no banco (RLS). Um construtor de consultas não acrescentava segurança e era mais uma dependência.
- **Node 22 → 24** (ajuste 1).
- **Busca híbrida → só palavra-chave**, até medir os embeddings.
- **Encadeamento por hash da auditoria** continua na Fase 3, como previsto.

## Medições

### Segunda camada do filtro: nomes de pessoa soltos no texto

Rodar: `SPACY_PYTHON=<venv>/bin/python node eval/nomes/avaliar.mjs <conjunto> --spacy`. Com `--detalhe`, mostra os erros.

| Sistema | Conjunto | Precisão | Cobertura (nomes achados) | F1 | Frases sem nome com aviso indevido | Tempo |
|---|---|---|---|---|---|---|
| A. regras atuais | teste (91 frases, 63 nomes) | 100% | 6,3% | 11,9% | 0% | < 0,1 ms/frase |
| B. candidato local | teste (**viciado**: ajustado nele) | 100% | 100% | 100% | 0% | < 0,1 ms/frase |
| C. spaCy `pt_core_news_lg` | teste | 95,2% | 95,2% | 95,2% | 5,6% | ~4,5 ms/frase |
| A. regras atuais | validação (55 frases, 32 nomes) | – | 0% | 0% | 0% | < 0,1 ms/frase |
| B. candidato local | validação | 84,2% | 50,0% | 62,7% | 12,0% | < 0,1 ms/frase |
| **C. spaCy `pt_core_news_lg`** | **validação** | **88,2%** | **93,8%** | **90,9%** | **12,0%** | ~4,4 ms/frase |
| A, B, C | terceiro conjunto (do time) | aguardando o conjunto | | | | |

O tempo do spaCy foi medido em CPU, com uma frase por vez.

**Leitura:**
- O spaCy acha quase todos os nomes que o candidato local perde (prenomes fora da lista, como Genivaldo, Nilton e Talita).
- Os erros de detecção do spaCy são de três tipos:
  - verbo no início da frase tomado por nome ("Agradecer");
  - instituição e prédio com nome de pessoa ("Fundação Getúlio Vargas", "prédio Pedro Álvares Cabral");
  - prenome sozinho ("Maria", "Pedro", "Luana"), que os conjuntos não rotulam como nome, por convenção minha. Se o prenome sozinho também deve gerar aviso, esses três deixam de ser erro.
- Nomes perdidos pelo spaCy: nome todo em maiúsculas ("ELISÂNGELA MARTINS") e alguns nomes compostos em posição incomum.
- **Custo de adoção:** o spaCy roda em Python e o modelo ocupa cerca de 600 MB. No servidor Node, isso vira um serviço à parte (um contêiner pequeno, na mesma rede, sem saída para a internet). A alternativa é um modelo de NER em ONNX dentro do próprio Node, que ainda depende do HuggingFace para ser medido.
- Os modelos BERTimbau de NER continuam sem medição: ficam no HuggingFace.
- **Nada da segunda camada foi implementado**, conforme combinado. A decisão fica para depois do terceiro conjunto.

### Busca da base de conhecimento (embeddings locais)

Rodar: `node eval/busca/avaliar.mjs [--embeddings] [--detalhe]`. O conjunto tem 24 documentos fictícios de RH, fiscal e financeiro e 67 perguntas, escritas antes de rodar qualquer sistema: 24 literais, 31 paráfrases e 12 sem resposta na base.

| Sistema | Literal: acerto@3 | Paráfrase: acerto@1 | Paráfrase: acerto@3 | Sem resposta: silêncio correto |
|---|---|---|---|---|
| Palavra-chave (em uso) | 95,8% | 22,6% | 35,5% (38,7% sem resultado) | 100% |
| `paraphrase-multilingual-MiniLM-L12-v2` (local, CPU) | não medido | | | |
| `multilingual-e5-small` / `-base` (local, CPU) | não medido | | | |

**Leitura:**
- A busca atual funciona quando a pessoa usa as palavras do documento. Ela falha na maioria das perguntas com outras palavras ("convênio médico" para plano de saúde, "vender parte do descanso" para abono), e aí o modelo responde sem a base.
- É exatamente o caso que os embeddings devem melhorar. O script mede também a troca entre responder e ficar em silêncio, com vários limiares, para não trocar "sem resultado" por "resultado errado".
- O runtime local (transformers.js com ONNX Runtime, CPU, no mesmo processo Node) instala pelo npm e roda. Só o download dos modelos falha.

## O que não foi possível

| O quê | Por quê | O que destrava |
|---|---|---|
| Medir embeddings locais e o NER BERTimbau | O proxy do ambiente recusa `huggingface.co`, `cdn-lfs.huggingface.co`, `cdn-lfs-us-1.hf.co` e `cas-bridge.xethub.hf.co` (403 no CONNECT). Os arquivos grandes dos modelos vêm desses três últimos. | Liberar esses quatro hosts em Acesso à rede, nas configurações do ambiente (menu do ambiente na barra de título → Editar). Os releases do GitHub já estão acessíveis: foi assim que o spaCy baixou. |
| `docker build` e `docker compose up` | O Docker Hub respondeu 429 (limite de downloads anônimos). O proxy recusou `quay.io` e `d2glxqk2uabbnd.cloudfront.net` (ECR público). | Tentar de novo mais tarde, ou em outra máquina com login no Docker Hub. |
| Consultar a documentação da AWS | O proxy recusa `docs.aws.amazon.com`. | A conclusão sobre o Bedrock e a disponibilidade do SES em sa-east-1 vieram do meu conhecimento. Estão marcadas como "confirmar no console" no README e em `docs/fase-2/`. |
| Login real com Entra ID e Google | Precisa registrar o app em cada provedor. | Pendência de implantação (`PENDENCIAS-SEGURANCA.md`, seção 7). |

## Decisões que preciso de você antes ou durante a Fase 3

1. **Segunda camada do filtro:** quando o terceiro conjunto chegar, eu meço os três sistemas nele e você decide entre spaCy como serviço à parte, esperar a medição do BERTimbau ou ficar com as regras atuais.
2. **Embeddings:** com os hosts do HuggingFace liberados, meço os três candidatos locais e trago a tabela antes de adotar.
3. **Prenome sozinho** ("A Maria pediu...") deve gerar aviso?
4. **`heroTitle`:** ligar na tela (muda a marcação do título) ou manter fixo?

## Como conferir

```sh
npm test && npm run test:e2e                 # raiz
cd server && npm run typecheck && npm test   # servidor (precisa de Postgres 16 e Redis)
node eval/busca/avaliar.mjs --detalhe
node eval/nomes/avaliar.mjs conjunto-validacao.json
```

O ambiente completo local está no `README.md` (`docker compose up --build`).
