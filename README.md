# GreenIA

A IA do dia a dia, multi-cliente. A GreenIA é uma plataforma para qualquer empresa: cada cliente define as próprias áreas, as bases de conhecimento de cada uma, os próprios assistentes e os próprios quick wins. Nenhum cliente, área ou setor está escrito no código (um teste falha se estiver: `server/test/genericity.test.ts`).

O repositório tem duas partes:

- **Frontend**: `GreenIA.dc.html` (chat), `Assistentes GreenIA.dc.html` (assistentes, revisão, quick wins e administração) e `Política GreenIA.dc.html`, que rodam no runtime `support.js`. A lógica compartilhada fica em `lib/greenia-core.js`, que é copiada para dentro das páginas por `npm run sync`.
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

### Ferramentas de OCR e conversão

A imagem Docker já traz tudo. Para rodar fora dela (Ubuntu ou Debian):

```sh
sudo apt-get install ocrmypdf tesseract-ocr tesseract-ocr-por imagemagick libheif1 \
  libreoffice-writer-nogui libreoffice-calc-nogui fonts-dejavu-core
```

Sem essas ferramentas o servidor funciona, mas PDF escaneado, foto, DOC, XLS, ODT e ODS não são lidos (a execução avisa). `GET /health/ready` mostra o estado de cada uma em `ferramentas`. Os testes que usam as ferramentas reais (`test/convert.test.ts`) são pulados quando elas faltam.

### Testes

```sh
npm test                  # raiz: lib, sincronia lib ↔ páginas, templates .dc.html, contraste
npm run test:e2e          # raiz: protótipo no navegador (Playwright)
cd server && npm test     # servidor: isolamento, auth, RBAC, chat, política, KB, retenção, limites, e2e
cd server && npm run typecheck
```

Os testes do servidor criam um banco novo por execução, em `TEST_PG_ADMIN_URL`, com padrão `postgres://postgres@localhost:5432/postgres`.

## Frontend no modo com servidor

O servidor entrega as páginas `.dc.html` e o React da própria GreenIA. Nada vem de unpkg ou de outro CDN de terceiros:

- React e ReactDOM 18.3.1 saem do pacote npm, em `/vendor/react@18.3.1/...`, com `integrity` (SHA-384) e cache imutável.
- A versão e o hash estão fixados em `server/src/web/static.ts`. Se o arquivo instalado for outro, o servidor não sobe.
- A política de conteúdo (CSP) só aceita scripts da própria origem.
- As fontes do Google continuam como opção de estilo. Sem elas, a página usa a fonte do sistema.
- O teste `web.e2e` cobre a página com unpkg, jsdelivr, cdnjs e Google Fonts bloqueados.
- O modo demonstração (Claude Design, sem servidor) continua buscando o React no unpkg, com SRI.

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
| `PROCESS_ROLE` | não | `all` (padrão: API e fila no mesmo processo), `api` (só API) ou `worker` (só fila; a API fica de pé para o `/health`). Na AWS, um serviço de cada, com a mesma imagem |
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
| `AUDIT_ANCHOR_BUCKET` | não (sim em produção) | bucket com Object Lock, na conta AWS separada, para a âncora diária da auditoria. Sem valor, a publicação fica desligada |
| `AUDIT_ANCHOR_ROLE_ARN`, `AUDIT_ANCHOR_EXTERNAL_ID` | não | papel na conta separada (sts:AssumeRole) e o ExternalId dele |
| `AUDIT_ANCHOR_REGION`, `AUDIT_ANCHOR_PREFIX` | não | região do bucket (padrão `sa-east-1`) e prefixo das chaves (padrão `greenia/`) |
| `AUDIT_ANCHOR_RETENTION_DAYS` | não | retenção em modo compliance de cada âncora (padrão 1825 dias, 5 anos) |
| `OCRMYPDF_CMD`, `OCR_LANG` | não | OCR local: comando do OCRmyPDF (padrão `ocrmypdf`) e idioma do Tesseract (padrão `por`) |
| `MAGICK_CMD`, `SOFFICE_CMD` | não | ImageMagick (padrão `convert`; TIFF, HEIC) e LibreOffice (padrão `soffice`; DOC, XLS, ODT, ODS) |
| `CONVERT_TIMEOUT_S` | não | tempo máximo base de cada OCR ou conversão (padrão 120 s, mais 20 s por página) |
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

O tenant novo começa vazio: sem áreas, sem assistentes. As áreas vêm da lista `areas` do arquivo, de um modelo de áreas do catálogo (`modeloAreas`) ou do painel depois. O checklist de implantação de qualquer cliente está em `docs/IMPLANTACAO.md`. O que é próprio de um cliente fica em `implantacoes/<cliente>/` (arquivo do tenant e ajustes dos assistentes), fora do código; `npm test` do servidor valida esses arquivos.

## O que cada cliente configura

| O quê | Onde | Observação |
|---|---|---|
| Áreas e subáreas | Administração › Áreas | Nome, descrição, área mãe, herança de permissão, ordem, desativação. Key users e revisores por área |
| Bases de conhecimento | Administração › Base de conhecimento | Uma por área; cada documento pode ser compartilhado com outras áreas ou com a empresa toda |
| Assistentes | Administração › Assistentes | Do zero, a partir de um modelo do catálogo da TheNeil ou duplicando outro. Compartilháveis entre áreas |
| Tipos de dado próprios | Administração › Tipos de dado e leitores | Padrão, validação opcional (CPF, CNPJ, Luhn, módulo 11) e ação padrão, além dos de fábrica |
| Leitores especializados | Administração › Tipos de dado e leitores | Formatos de um setor (hoje: XML de NF-e e chave de DANFE), ligados só no cliente que usa |
| Critérios de avaliação | Administração › Critérios de avaliação | Padrão Valor, Complexidade, Risco e Dependências; escala, pesos e critérios editáveis |
| Oportunidades e quick wins | aba Quick wins | Portfólio por área, roadmap e arquivo com motivo, seleção e decisão pelo patrocinador, janelas, indicadores escolhidos pelo cliente, relatórios em PDF e XLSX |
| Papéis | Administração › Pessoas e Áreas | usuário, revisor, key user, patrocinador (tenant ou área), admin do cliente |

## Catálogo de modelos (TheNeil)

Os arquivos em `server/catalog/modelos/` (assistentes) e `server/catalog/areas/` (modelos de áreas) são publicados na tabela `catalog_templates` pelo migrador. Versão publicada não muda; versão nova entra com número maior (`POST /api/platform/catalog`). Um assistente criado a partir de um modelo é do cliente: não muda quando o modelo muda, o painel só avisa que há versão nova.

## Quick wins

Um quick win é uma melhoria num processo de uma área, não uma ferramenta. Pode usar um ou mais assistentes, uma ou mais bases, ou só uma base com consulta. A medição é do processo.

- **Oportunidade**: registrada pelo key user ou admin na área (processo, problema, quem executa hoje, volume, evidência comprovada ou hipótese) e avaliada pelos critérios do cliente. Ciclo: registrada → avaliada → selecionada como quick win, enviada ao roadmap (grande ou complexa demais) ou arquivada. Roadmap e arquivo sempre com motivo; dá para reabrir.
- **Quick win**: nasce da oportunidade selecionada, com responsável, áreas, objetivo, indicadores escolhidos pelo cliente, janelas de ponto de partida e de medição, recursos, revisores e prazo. Ciclo: em implantação → em medição → decisão (manter, descartar, ampliar) → encerrado. Na implantação, se ficar complexo demais, volta ao portfólio como oportunidade no roadmap, com motivo, e outra pode entrar no lugar.
- **Quem decide**: key users propõem; selecionar e registrar a decisão final exigem patrocinador (papel `patrocinador`, no tenant ou numa área) ou admin do cliente. Toda mudança de etapa vai para a auditoria com quem decidiu e por quê. O patrocinador do tenant vê oportunidades e quick wins de todas as áreas, mas não a base nem as execuções delas.
- **Medição**: o automático vem das execuções vinculadas ao quick win (volume, tempo, revisão, divergências, consumo); o resto é lançado à mão, com origem e período. Cada execução pertence a no máximo um quick win: com o assistente em mais de um quick win ativo, a pessoa escolhe ao executar, ou vale a área de quem executa quando ela aponta um só. As janelas definem o período; a comparação pode ser pelo valor, por mês ou por item, e o relatório avisa quando as janelas não são comparáveis (duração ou volume mais de duas vezes diferente, sobreposição). Sem valor "antes", não há comparação.
- **Ampliar**: cria outro quick win em outra área, unidade ou processo, com baseline próprio e vínculo com a origem. Os recursos são compartilhados (os mesmos) ou duplicados (cópia independente na área nova), à escolha de quem amplia.
- **Cota**: nenhuma na plataforma. A cota, se houver, é do plano (`PUT /api/platform/tenants/<slug>/quick-wins-quota`), com aviso quando atingida.
- **Relatórios** em PDF e XLSX: portfólio de oportunidades (avaliação, situação e motivo de roadmap e arquivo) e resultados dos quick wins (antes × depois, janelas, decisões e trajetória).
- **Da Fase 3**: a medição que ficava no assistente foi trazida para quick wins pela migração `020` (um quick win por assistente com valores ou decisões, com os indicadores, os valores com origem, a última decisão e as execuções), e as tabelas antigas saíram na `022`. O teste `legacy-reconciliation` confere os totais antes e depois.

### Tenants de demonstração

```sh
DATABASE_OWNER_URL=... node src/scripts/seed-demo.ts              # cria o tenant demo (empresa de serviços) com 4 assistentes do catálogo
node src/scripts/seed-demo.ts --amostras ./amostras               # só grava os arquivos de exemplo em disco
```

O tenant `demo` abre pelo host `demo.localhost`. Os dados dele estão em `server/deploy/demo/tenant-demo.json` (áreas e assistentes criados a partir do catálogo).

O segundo tenant de demonstração, uma construtora, é montado só pela API em `server/test/second-tenant.test.ts`: áreas com subárea, patrocinador, tipo de dado próprio, quatro assistentes, duas bases, seis oportunidades (uma no roadmap, uma arquivada), três quick wins (um com dois assistentes, um só com a base e um ampliado), um assistente em dois quick wins ativos sem contagem em dobro, e os dois relatórios. Com `GREENIA_RELATORIOS_DIR=<pasta>`, o teste grava os relatórios; a última saída está em `docs/fase-3b/relatorios-construtora/`.

## Produção na AWS (sa-east-1)

A infraestrutura está descrita em Terraform em `infra/terraform/`, com a estimativa de custo em `infra/README.md` (validada, nunca aplicada).

O código não depende da AWS: cada peça fica atrás de uma interface (`ObjectStore`, `EmailSender`, `JobQueue`, `LlmProvider`) e é configurada por variável de ambiente. O mapeamento assumido é este:

| Peça | Serviço (sa-east-1) | Configuração |
|---|---|---|
| App | ECS Fargate com esta imagem | serviço `api` (`PROCESS_ROLE=api`, 2+ tarefas atrás de um ALB com HTTPS/ACM) e serviço `fila` (`PROCESS_ROLE=worker`); health check `GET /health`, prontidão `GET /health/ready` |
| Banco | RDS for PostgreSQL 16 | Multi-AZ, criptografia em repouso (KMS), `rds.force_ssl=1`, `sslmode=require` nas URLs, extensão `pgvector` disponível para a fase de embeddings |
| Documentos | S3 | bloqueio de acesso público, `S3_SSE=aws:kms` com chave própria, versionamento ligado, política do bucket exigindo TLS (`aws:SecureTransport`) |
| Fila e limites | ElastiCache for Redis (ou Valkey) | TLS em trânsito (`rediss://`), AUTH ou RBAC, sem acesso público |
| Email | Amazon SES, interface SMTP | `SMTP_URL=smtps://...@email-smtp.sa-east-1.amazonaws.com:465`, domínio verificado, fora do sandbox. **Confirmar no console que o SES está habilitado em sa-east-1 na conta**: não consegui consultar a documentação da AWS deste ambiente |
| Segredos | Secrets Manager (ou SSM Parameter Store) | injetados como variáveis na definição da tarefa; nada em arquivo |
| Logs | CloudWatch Logs | o servidor escreve JSON (pino) em stdout; o driver `awslogs` coleta |

- **Rede**: o banco, o Redis e as tarefas ficam em sub-redes privadas, e só o ALB é público. As saídas necessárias são `api.anthropic.com` (modelo), SES, S3 e os provedores OIDC dos clientes (`login.microsoftonline.com`, `accounts.google.com`).
- **Modelo e região**: o processamento do modelo acontece fora do Brasil. A API da Anthropic não tem região Brasil. O Bedrock também não tem perfil de inferência no Brasil: veja `docs/fase-2/bedrock-regiao-brasil.md`. Os dados em repouso (banco, documentos, filas) ficam em sa-east-1. É um ponto jurídico (transferência internacional), registrado em `PENDENCIAS-SEGURANCA.md`.
- **Migrações no deploy**: rode uma tarefa avulsa com a mesma imagem, com `node src/db/migrate.ts`, antes de atualizar o serviço. As migrações são aditivas e registradas em `schema_migrations`. Uma migração que remove algo tem volta em `migrations/down/` com o mesmo nome: `node src/db/migrate.ts --down <nome>.sql` (só a última aplicada). A `022` remove as tabelas da medição por assistente, depois de a `020` trazer os dados para quick wins; a volta recria as tabelas vazias.

## Âncora da auditoria (conta AWS separada)

Todo dia, o hash final da cadeia de auditoria de cada tenant vai para um bucket S3 com Object Lock em modo compliance, numa conta AWS que não é a de produção. Nem a conta de produção nem o dono do banco conseguem apagar ou mudar uma âncora antes do fim da retenção. `GET /api/audit/verify` refaz a cadeia e compara com a última âncora lida do bucket; o admin do cliente vê e exporta o histórico na aba Administração › Auditoria.

Na conta separada (uma vez):

1. Criar o bucket em sa-east-1 com Object Lock ligado na criação (o versionamento liga junto). Não é preciso retenção padrão: cada âncora já vai com `COMPLIANCE` e a data de retenção.
2. Criar o papel `greenia-ancora-auditoria`, confiando só na conta de produção (com `ExternalId`), com esta política:

   ```json
   { "Version": "2012-10-17", "Statement": [
     { "Effect": "Allow", "Action": ["s3:PutObject", "s3:PutObjectRetention", "s3:GetObject", "s3:GetObjectVersion"],
       "Resource": "arn:aws:s3:::<BUCKET>/greenia/*" } ] }
   ```

   Sem `s3:DeleteObject*`, `s3:BypassGovernanceRetention` nem `s3:PutBucketObjectLockConfiguration`.
3. Na produção, liberar `sts:AssumeRole` nesse papel para o papel da aplicação e definir `AUDIT_ANCHOR_BUCKET`, `AUDIT_ANCHOR_ROLE_ARN` e `AUDIT_ANCHOR_EXTERNAL_ID`.
4. Conferir com `POST /api/platform/audit/anchors/run` (TheNeil): cada tenant deve voltar `publicada`, e a segunda chamada no mesmo dia, `ja_publicada`.

A tarefa roda de hora em hora e publica uma âncora por tenant por dia. Cadeia quebrada não é ancorada: vira registro `ancora_nao_publicada` na auditoria do tenant e erro no log.

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
