# GreenIA

A IA do dia a dia, multi-cliente. O repositório tem duas partes:

- **Frontend**: `GreenIA.dc.html` e `Política GreenIA.dc.html`, que rodam no runtime `support.js`. A lógica compartilhada fica em `lib/greenia-core.js`, que é copiada para dentro das páginas por `npm run sync`.
- **Servidor** (`server/`): Node 24 + Fastify + Postgres com RLS. Ele atende a API, entrega o frontend e processa a fila no mesmo processo.

Sem `backendUrl`, as páginas continuam funcionando como protótipo (modo demonstração). Quando entregues pelo servidor, elas recebem `window.__GREENIA__ = { backendUrl: "/" }`. Nesse modo, todo o chat passa pelo servidor. Não há volta silenciosa para o modelo do navegador: se o servidor falha, a tela mostra o erro.

## Rodar localmente

### Com Docker Compose (ambiente completo)

```sh
docker compose up --build
docker compose run --rm app node src/scripts/create-tenant.ts deploy/tenant-local.json
```

- App: http://localhost:8080. Entre com `admin@exemplo.com.br`, pelo código por email.
- Emails (código de login): http://localhost:8025 (Mailpit).
- Console do MinIO: http://localhost:9001 (`greenia` / `greenia-local-123`).

Sem `ANTHROPIC_API_KEY` em `.env.local.example`, o servidor responde com o provedor simulado. Isso só acontece fora de produção: em produção a chave é obrigatória e a partida falha sem ela.

### Sem Docker (desenvolvimento)

Requisitos: Node 24, Postgres 16, Redis 7 e um S3 compatível (MinIO, ou `moto_server` do pacote Python `moto[server]`, com `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true` e o bucket criado). O SMTP é opcional fora de produção: sem `SMTP_URL`, os emails ficam em memória e o código de login não chega a ninguém. Para testar o login, use o Mailpit (`SMTP_URL=smtp://localhost:1025`).

```sh
cd server && npm ci
DATABASE_OWNER_URL=postgres://dono@localhost/greenia APP_DB_USER=greenia_srv APP_DB_PASSWORD=... npm run migrate
DATABASE_OWNER_URL=postgres://dono@localhost/greenia node src/scripts/create-tenant.ts deploy/tenant-local.json
DATABASE_URL=postgres://greenia_srv:...@localhost/greenia COOKIE_SECURE=false \
  S3_ENDPOINT=http://localhost:9000 S3_FORCE_PATH_STYLE=true npm start
```

### Testes

```sh
npm test                  # raiz: lib, sincronia lib ↔ páginas, templates .dc.html, contraste
npm run test:e2e          # raiz: protótipo no navegador (Playwright)
cd server && npm test     # servidor: isolamento, auth, RBAC, chat, política, KB, retenção, limites, e2e
cd server && npm run typecheck
```

Os testes do servidor criam um banco novo por execução, em `TEST_PG_ADMIN_URL`, com padrão `postgres://postgres@localhost:5432/postgres`.

## Banco de dados e papéis

| Papel | Uso | Observação |
|---|---|---|
| dono (`DATABASE_OWNER_URL`) | migrações, criar tenant, rotinas da plataforma | precisa de `CREATEROLE`; no RDS, o usuário mestre (ou um papel criado por ele) |
| `greenia_app` | papel de grupo, sem login, sem `BYPASSRLS` | criado pela migração; recebe só os privilégios de tabela |
| servidor (`APP_DB_USER`) | conexão do app (`DATABASE_URL`) | criado/atualizado pelo migrador como membro de `greenia_app` |

O isolamento entre clientes é feito pelo Postgres (RLS), não só pelo código. Cada requisição abre uma transação que define `app.tenant_id`, `app.user_id` e as áreas da pessoa. As políticas filtram todas as tabelas por esses valores.

Os papéis são globais no cluster. Se o cluster tiver mais de um banco com GreenIA, o dono de cada banco precisa de admin sobre `greenia_app`: `grant greenia_app to <dono> with admin option`.

## Variáveis de ambiente

Exemplos: `server/.env.example` (produção, AWS) e `.env.local.example` (compose local).

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NODE_ENV` | sim (prod) | `production` exige chave do modelo e cookie seguro |
| `PORT`, `HOST` | não | padrão `8080`, `0.0.0.0` |
| `PUBLIC_URL` | sim | URL pública. Usada nos redirects do login e na checagem de `Origin` das escritas |
| `DATABASE_URL` | sim | conexão do servidor (papel sem `BYPASSRLS`) |
| `DATABASE_OWNER_URL` | sim | dono das tabelas (migrações e plataforma) |
| `APP_DB_USER`, `APP_DB_PASSWORD` | só no migrador | cria/atualiza o papel do servidor |
| `REDIS_URL` | sim | fila (BullMQ) e limite por minuto. `rediss://` para TLS |
| `S3_REGION`, `S3_BUCKET` | sim | documentos da base de conhecimento |
| `S3_SSE`, `S3_KMS_KEY_ID` | não | `AES256` (padrão), `aws:kms` (com a chave) ou `none` |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | só fora da AWS | MinIO local |
| `SMTP_URL`, `EMAIL_FROM` | sim (prod) | envio dos códigos de login e avisos de cota |
| `ANTHROPIC_API_KEY` | sim (prod) | chave do modelo; nunca vai para o navegador |
| `USD_BRL` | não | câmbio de reserva para o custo em reais (padrão 5,5). Vale só para modelo sem linha vigente na tabela de preços (`price_tables`), que tem câmbio próprio |
| `PLATFORM_SUPPORT_EMAIL` | não | suporte da TheNeil: recebe o aviso de cada incidente reportado, sem a descrição |
| `SESSION_TTL_HOURS` | não | duração da sessão (padrão 12 h) |
| `COOKIE_SECURE` | não | `true` por padrão. Com `false` (só local), o cookie perde o prefixo `__Host-` |
| `KB_UPLOAD_BODY_LIMIT_MB` | não | corpo máximo do envio de documento (padrão 30) |
| `LOG_LEVEL` | não | padrão `info` |
| `OIDC_*` (nome livre) | por provedor | segredo do cliente OIDC. A configuração do tenant guarda só o nome da variável, em `clientSecretEnv` |

## Criar um cliente (tenant)

```sh
DATABASE_OWNER_URL=... node src/scripts/create-tenant.ts tenant.json
```

Veja o exemplo em `server/deploy/tenant-local.json`. Para login corporativo, os provedores têm este formato:

```json
{ "kind": "entra", "label": "Entrar com Microsoft",
  "config": { "issuer": "https://login.microsoftonline.com/<ID-DO-DIRETORIO>/v2.0",
              "clientId": "<ID-DO-APP>", "clientSecretEnv": "OIDC_CLIENTE_ENTRA_SECRET",
              "tenantId": "<ID-DO-DIRETORIO>" } }
{ "kind": "google", "label": "Entrar com Google",
  "config": { "issuer": "https://accounts.google.com", "clientId": "<ID>",
              "clientSecretEnv": "OIDC_CLIENTE_GOOGLE_SECRET", "hostedDomain": "cliente.com.br" } }
```

- URL de retorno a registrar no Entra ou no Google: `<PUBLIC_URL>/api/auth/oidc/callback`.
- O servidor confere o diretório (`tid`) no Entra e o domínio (`hd`, com email verificado) no Google. Além disso, o domínio do email precisa estar em `domains` do tenant.
- O tenant é escolhido pelo host da requisição (`hosts`). Fora de produção, também pelo parâmetro `?tenant=<slug>`. Em produção, esse parâmetro é ignorado, para que o host de um cliente não abra o login de outro.
- As cores da marca que não passam em contraste AA são escurecidas automaticamente, e o script mostra os ajustes.

### Tenant de demonstração (Fase 3)

```sh
DATABASE_OWNER_URL=... node src/scripts/seed-demo.ts              # cria o tenant demo com os 4 assistentes de referência
node src/scripts/seed-demo.ts --amostras ./amostras               # só grava os arquivos de exemplo em disco
```

O tenant `demo` abre pelo host `demo.localhost`. As definições dos assistentes estão em `server/deploy/demo/assistentes/` e podem ser coladas no editor de assistentes, na aba Administração da página `Assistentes GreenIA.dc.html`, para criar o mesmo assistente em outro tenant.

## Produção na AWS (sa-east-1)

O código não depende da AWS: cada peça fica atrás de uma interface (`ObjectStore`, `EmailSender`, `JobQueue`, `LlmProvider`) e é configurada por variável de ambiente. O mapeamento assumido é este:

| Peça | Serviço (sa-east-1) | Configuração |
|---|---|---|
| App | ECS Fargate (ou App Runner) com esta imagem | 2+ tarefas atrás de um ALB com HTTPS (ACM); health check `GET /health`, prontidão `GET /health/ready` |
| Banco | RDS for PostgreSQL 16 | Multi-AZ, criptografia em repouso (KMS), `rds.force_ssl=1`, `sslmode=require` nas URLs, extensão `pgvector` disponível para a fase de embeddings |
| Documentos | S3 | bloqueio de acesso público, `S3_SSE=aws:kms` com chave própria, versionamento ligado, política do bucket exigindo TLS (`aws:SecureTransport`) |
| Fila e limites | ElastiCache for Redis (ou Valkey) | TLS em trânsito (`rediss://`), AUTH ou RBAC, sem acesso público |
| Email | Amazon SES, interface SMTP | `SMTP_URL=smtps://...@email-smtp.sa-east-1.amazonaws.com:465`, domínio verificado, fora do sandbox. **Confirmar no console que o SES está habilitado em sa-east-1 na conta**: não consegui consultar a documentação da AWS deste ambiente |
| Segredos | Secrets Manager (ou SSM Parameter Store) | injetados como variáveis na definição da tarefa; nada em arquivo |
| Logs | CloudWatch Logs | o servidor escreve JSON (pino) em stdout; o driver `awslogs` coleta |

- **Rede**: o banco, o Redis e as tarefas ficam em sub-redes privadas, e só o ALB é público. As saídas necessárias são `api.anthropic.com` (modelo), SES, S3 e os provedores OIDC dos clientes (`login.microsoftonline.com`, `accounts.google.com`).
- **Modelo e região**: o processamento do modelo acontece fora do Brasil. A API da Anthropic não tem região Brasil. O Bedrock também não tem perfil de inferência no Brasil: veja `docs/fase-2/bedrock-regiao-brasil.md`. Os dados em repouso (banco, documentos, filas) ficam em sa-east-1. É um ponto jurídico (transferência internacional), registrado em `PENDENCIAS-SEGURANCA.md`.
- **Migrações no deploy**: rode uma tarefa avulsa com a mesma imagem, com `node src/db/migrate.ts`, antes de atualizar o serviço. As migrações são aditivas e registradas em `schema_migrations`.

## Email: SPF, DKIM e DMARC

O login por código depende de o email chegar. Sem autenticação do domínio, ele cai no spam ou é recusado. Para o domínio do remetente (ex.: `greenia.theneil.com.br`), configure:

1. **Verificar o domínio no SES** com **Easy DKIM**. O SES gera três registros CNAME:
   ```
   <token1>._domainkey.greenia.theneil.com.br  CNAME  <token1>.dkim.amazonses.com
   <token2>._domainkey.greenia.theneil.com.br  CNAME  <token2>.dkim.amazonses.com
   <token3>._domainkey.greenia.theneil.com.br  CNAME  <token3>.dkim.amazonses.com
   ```
2. **MAIL FROM personalizado** (ex.: `bounce.greenia.theneil.com.br`), para o SPF alinhar com o domínio do remetente:
   ```
   bounce.greenia.theneil.com.br  MX   10 feedback-smtp.sa-east-1.amazonses.com
   bounce.greenia.theneil.com.br  TXT  "v=spf1 include:amazonses.com -all"
   ```
   Se o próprio domínio do remetente já tiver SPF, acrescente `include:amazonses.com` ao registro existente. Nunca crie um segundo registro SPF.
3. **DMARC**: comece monitorando e aperte depois de ver os relatórios.
   ```
   _dmarc.greenia.theneil.com.br  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@theneil.com.br; adkim=s; aspf=r"
   ```
   Depois de 2 a 4 semanas sem falhas legítimas, passe para `p=quarantine` e, por fim, para `p=reject`.
4. **Reputação**: configure SNS (ou EventBridge) para bounces e reclamações, e monitore as taxas no console do SES.

Validação: envie um código para uma caixa Gmail e para uma Outlook e confira `spf=pass`, `dkim=pass` e `dmarc=pass` no cabeçalho `Authentication-Results`.

## Backup e restauração

| O quê | Como | Retenção sugerida |
|---|---|---|
| Postgres | backups automáticos do RDS com PITR | 35 dias |
| Postgres (lógico) | `pg_dump -Fc` semanal, com o papel dono, para um bucket separado com Object Lock | 12 meses |
| Documentos | versionamento do S3 com regra de ciclo de vida para versões antigas; replicação opcional para outro bucket na mesma região (dados ficam no Brasil) | 90 dias para versões não correntes |
| Redis | não precisa de backup | só guarda fila e contadores de minuto. Tarefas perdidas: a indexação é refeita reenviando a versão, e a limpeza de retenção roda de hora em hora |

- **Restauração do banco**: restaure por PITR para uma nova instância, aponte `DATABASE_URL`/`DATABASE_OWNER_URL` para ela e rode o migrador, que não faz nada se as migrações estiverem em dia. Com dump lógico: `pg_restore --no-owner --role=<dono> -d greenia dump.pgc`, e depois o migrador, para recriar o papel do servidor e as concessões.
- **Teste de restauração**: restaure a cada trimestre em um ambiente separado e rode `npm test` do servidor apontado para ele. Registre a data e o resultado.
- **Retenção vs. backup**: apagar um resultado por retenção remove a linha do banco, mas ela continua nos backups até eles expirarem. O prazo de backup deve constar da política de retenção comunicada ao cliente.

## Saúde e logs

- `GET /health`: o processo está vivo (usado pelo `HEALTHCHECK` da imagem).
- `GET /health/ready`: banco e Redis respondem (usado pelo ALB); dá 503 se algum falhar.
- Logs em JSON em stdout, sem conteúdo das conversas, só metadados. A trilha de auditoria de cada cliente fica na tabela `audit_log`, que só aceita inserções.
