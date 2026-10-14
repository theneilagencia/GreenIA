# Backups e restauração

Estado em 14 de outubro de 2026. Responde: o que é copiado, onde, quando, como se sabe que falhou, como recuperar a
chave-mestra e como ensaiar a restauração sem tocar em produção. **O ensaio real em produção ainda não foi feito**:
os resultados abaixo são do ensaio local com dados sintéticos. Metas de **RPO 24 h** e **RTO 4 h** são *propostas*,
não garantias.

## 1. O que precisa existir para recuperar

| Dado | Onde fica | Backup diário? | Como |
|---|---|---|---|
| Banco da plataforma (`plataforma.sqlite`: empresas, usuários, papéis, planos, auditoria, ajustes do console, SMTP do console, chave do OpenRouter do console **cifrada**, impressão digital da chave-mestra) | `dados/plataforma.sqlite` | Sim | `backupDaPlataforma` → `dados/backups/plataforma/greenia-AAAAMMDD-HHMMSS.sqlite.gz` (VACUUM INTO + gzip) e, com S3 ligado, objeto cifrado |
| Banco de cada empresa (conversas, mensagens, quick wins, programações, bases, documentos e imagens em BLOB, artefatos visuais, credenciais de conectores **cifradas**, eventos) | `dados/empresas/emp_*.sqlite` | Sim, **todas as empresas cadastradas** (inclusive as que não estejam abertas) | idem, em `dados/backups/<emp_id>/` |
| Instalação única importada (`dados/greenia.sqlite`) | é o banco da empresa importada (`companies.banco`) | Sim | como banco de empresa |
| Arquivos enviados, logos, favicons, imagens de landing, artefatos visuais | **dentro dos bancos** (BLOB / data URL); nada disso é gravado em disco fora do SQLite | Sim | junto do banco (conferido no código: as únicas escritas em disco fora dos bancos são `.chave-mestra`, exportações e cópias de exclusão) |
| Chave-mestra (`dados/.chave-mestra`, ou `CHAVE_MESTRA`) | disco do serviço (sem `CHAVE_MESTRA` em `render.yaml`, produção usa o arquivo) | **Não vai em claro para backup nenhum** | impressão digital no banco da plataforma; recuperação na seção 4 |
| Exportações operacionais (`dados/exportacoes`) | disco | Não (cópias temporárias com prazo próprio) | — |
| Cópias de empresas excluídas (`dados/excluidas`) | disco | Não (já são cópias de recuperação, 30 dias) | snapshot do provedor |
| Os próprios backups locais (`dados/backups`) | **o mesmo disco** | — | snapshot diário do Render; cópia fora do servidor só com S3 |
| Variáveis de ambiente (`OPENROUTER_API_KEY`, `SMTP_*`/`EMAIL_API_CHAVE`, `PLATAFORMA_ADMINS`, `CONTATO_VENDAS_EMAIL`, `RENDER_API_KEY`, `BACKUP_*`, `S3_*`, `CHAVE_MESTRA`) | painel do Render | Não | valores não secretos em `render.yaml`; segredos precisam estar no cofre de quem opera |
| Código, páginas, imagens da LP, fontes, `modelos-quick-win.json`, `deploy/admins-plataforma.txt` | repositório | — | git |

**Risco principal hoje:** com S3 desligado, todos os backups ficam no mesmo disco do banco. Perder o disco (ou o
serviço/conta no Render) leva os backups juntos; resta só o snapshot do provedor, que vive na mesma conta.

## 2. Agenda, estado e alertas

- `BACKUP_HORA=06:00` (UTC no contêiner; já em `render.yaml`). A rodada copia o banco da plataforma e o de todas as
  empresas cadastradas. Se o processo estava fora do ar na hora marcada, a rodada do dia roda assim que ele volta
  (antes, um reinício depois das 06:00 pulava o dia).
- Cada banco: `backup.completed` ou `backup.failed` na auditoria da plataforma (só id do banco, tamanho, SHA-256,
  objeto no S3, código do erro). Cada rodada: `backup.run` ou `backup.run_incomplete`. Estado por banco em
  `platform_settings.backup_estado` (último local, último no S3, última falha).
- Conferência do conjunto de hora em hora (com `BACKUP_HORA` ou em produção): banco sem backup local com menos de
  26 h, banco sem cópia no S3 com menos de 26 h (com S3 ligado), falha nas últimas 26 h (inclusive S3 recusado por
  falta de expiração conferida), chave-mestra divergente, backup automático desligado.
- Havendo problema: faixa vermelha no topo do console da plataforma (admins com `platform.settings.manage`),
  `backup.alert` na auditoria, linha `ATENÇÃO` no log e **email aos admins da plataforma** pelo módulo de email
  existente, no máximo um por dia para o mesmo conjunto de problemas. Nos testes, o email é o transporte em memória.
- Código: `src/plataforma/backup-estado.js`, `src/iniciar.js` (`backupDaPlataforma`, `rodadaDevida`).

## 3. Cópia fora do servidor (S3) — desligada até ser configurada

Nada muda em produção enquanto `BACKUP_DESTINO` não existir. Para ligar:

| Variável | Valor |
|---|---|
| `BACKUP_DESTINO` | `s3://<bucket>/greenia` |
| `S3_ENDPOINT`, `S3_REGIAO` | ex.: `https://s3.us-east-1.amazonaws.com`, `us-east-1` (estilo de caminho: `endpoint/bucket/objeto`) |
| `S3_CHAVE`, `S3_SEGREDO` | chave IAM só com a política abaixo |
| `BACKUP_CHAVE_CIFRA` | 32 bytes aleatórios em base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`); **diferente** da chave-mestra (o código recusa se for igual) |
| `S3_SSE` (opcional) | `AES256` ou `aws:kms` (+ `S3_SSE_KMS_ID`): pedido no envio e conferido no cabeçalho da resposta |
| `BACKUP_ENVELOPE_SEGREDO` (opcional, recomendado) | 32+ caracteres, diferente das outras chaves; liga o envelope selado da chave-mestra |

Como o envio funciona (`src/backup-s3.js`):

1. **Expiração conferida no bucket, não declarada.** Antes do primeiro envio de cada rodada:
   `GetBucketLifecycleConfiguration`, `GetBucketVersioning` e `GetObjectLockConfiguration`
   (`conferirExpiracaoS3`/`avaliarLifecycle`, as mesmas da frente de retenção). Só vale regra **ativa**, sem filtro por
   etiqueta ou tamanho, cobrindo o prefixo, com `Expiration Days` ≤ 7 (prazo dos backups automáticos). Com
   versionamento ligado ou suspenso, também `NoncurrentVersionExpiration NoncurrentDays` (sem `NewerNoncurrentVersions`)
   e a soma dos dois ≤ 7. Object Lock ligado bloqueia. Sem isso: **nada é enviado**, o backup local continua, a falha
   vai para a auditoria e para o alerta. `S3_LIFECYCLE_DIAS` é ignorada.
2. **Objeto sem ambiguidade:** `greenia/<banco>/greenia-<banco>-AAAAMMDD-HHMMSS.sqlite.gz.enc` (`<banco>` =
   `plataforma` ou `emp_…`).
3. **Cifra no cliente:** AES-256-GCM com `BACKUP_CHAVE_CIFRA`; o nome do objeto é dado autenticado (um objeto copiado
   para outro nome é recusado).
4. **Integridade:** `x-amz-meta-sha256` (do .gz) e `x-amz-meta-sha256-cifrado`; o S3 confere o corpo pela assinatura
   (`x-amz-content-sha256`); depois do envio, um `HEAD` confere tamanho e metadados; a restauração confere os dois
   hashes antes de decifrar e depois de decifrar.
5. **Novas tentativas** (3) para erro de rede, 429 e 5xx. Achado do ensaio com volume: o servidor fecha a conexão
   ociosa enquanto o banco seguinte é compactado, e o envio seguinte falhava sem nova tentativa.
6. **Envelope da chave-mestra** (com `BACKUP_ENVELOPE_SEGREDO`): `greenia/chave-mestra/envelope-AAAAMMDD-HHMMSS.json.enc`
   a cada rodada (expira com a mesma regra).
7. Nenhum `DeleteObject`: quem apaga é a regra do bucket.

**Configuração proposta do bucket** (dedicado, sem acesso público, sem Object Lock):

```json
{ "Rules": [ { "ID": "greenia-backups-7d", "Status": "Enabled", "Filter": { "Prefix": "greenia/" },
  "Expiration": { "Days": 6 }, "NoncurrentVersionExpiration": { "NoncurrentDays": 1 },
  "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } } ] }
```

(Sem versionamento, `Expiration Days` pode ser 7 e a regra de versões antigas é dispensável.) A remoção física depois
do vencimento é feita pelo provedor, no tempo dele (a AWS processa as regras de forma assíncrona, normalmente em até
1–2 dias).

**Política IAM mínima** (usuário da aplicação):

```json
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "ObjetosDoPrefixo", "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::<bucket>/greenia/*" },
  { "Sid": "ListarSoOPrefixo", "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::<bucket>",
    "Condition": { "StringLike": { "s3:prefix": ["greenia/*"] } } },
  { "Sid": "ConferirExpiracao", "Effect": "Allow",
    "Action": ["s3:GetLifecycleConfiguration", "s3:GetBucketVersioning", "s3:GetBucketObjectLockConfiguration"],
    "Resource": "arn:aws:s3:::<bucket>" } ] }
```

Sem `s3:DeleteObject`, `s3:PutLifecycleConfiguration` nem `s3:PutBucketVersioning`. Para o ensaio, outro usuário com o
mesmo texto **sem** `s3:PutObject` (só leitura).

## 4. Chave-mestra: recuperação sem expor a chave

A chave-mestra cifra a chave do OpenRouter salva no console e os segredos dos conectores das empresas. Sem ela, esses
segredos ficam ilegíveis (as empresas precisam informá-los de novo). Regras: nunca em claro num backup que sai do
servidor, nunca em log; só a **impressão digital** (`cm1-…`, HMAC-SHA256 com rótulo fixo, não reversível) aparece.

- **Impressão no banco:** na subida, a plataforma grava `platform_settings.chave_mestra_impressao`. Se a chave em uso
  for outra, o registro original é mantido, o console mostra o aviso, a auditoria recebe `master_key.mismatch` e a
  conferência de backups avisa os admins. Aceitar uma chave nova é passo explícito:
  `node scripts/chave-mestra.js aceitar --confirmar`.
- **Caminhos de recuperação**, em ordem de preferência:
  1. `CHAVE_MESTRA` guardada no cofre de senhas de quem opera e definida no serviço (recomendado; hoje **não** está
     em `render.yaml`, então produção usa o arquivo `dados/.chave-mestra`). Atenção: trocar de arquivo para variável
     muda a chave; antes, recupere o valor atual por envelope (abaixo) e use o arquivo.
  2. **Envelope selado:** `BACKUP_ENVELOPE_SEGREDO=… node scripts/chave-mestra.js selar --saida envelope.json` (no
     shell do serviço) gera um JSON cifrado (scrypt + AES-256-GCM) para guardar fora do servidor; com S3 ligado, o
     envelope também vai a cada rodada. Recuperar: `node scripts/chave-mestra.js recuperar --envelope envelope.json
     --destino <dados-novos>/.chave-mestra --banco <dados-novos>/plataforma.sqlite` (confere a impressão com a do
     banco restaurado e grava com permissão 0600, sem imprimir).
  3. Arquivo `.chave-mestra` de um snapshot do disco do Render.
- Conferir a qualquer momento: `node scripts/chave-mestra.js impressao`.

## 5. Ensaio de restauração

`scripts/ensaio-restauracao.mjs` (código em `src/ensaio-restauracao.js`; teste rápido em
`test/ensaio-restauracao.test.js`). Em todos os modos:

- restaura numa pasta **nova e vazia**, recusa a pasta de origem e `/app/dados`; remapeia `companies.banco` **só na
  cópia** e confere que nenhum caminho aponta para fora dela;
- sobe a aplicação **isolada**: `127.0.0.1` em porta aleatória, IA simulada (mesmo com chave salva no console), email
  só em memória (inclusive o SMTP próprio das empresas), sem provedor de domínios, sem nenhuma tarefa periódica
  (programações de Quick Win, backup, retenção, exclusões, avisos de saldo e de chave) e com **toda conexão TCP para
  fora de 127.0.0.1 bloqueada no processo** (contadas no relatório);
- valida: `PRAGMA integrity_check` + `foreign_key_check` + tabelas esperadas em cada banco; marcadores por empresa
  (sintético); isolamento (A não vê conversas da B; a sessão de A não abre o ambiente de B); credenciais de conectores
  decifram com a chave recuperada (só contagem e impressão); login (código pelo email em memória), lista de conversas
  e abertura de um Quick Win; a escrita feita depois do backup não está na cópia (janela do RPO); origem intocada
  (SHA-256 dos bancos e da chave antes e depois);
- mede **RTO** (início da listagem/restauração até a aplicação responder `/api/saude`) e **RPO** (última escrita, ou
  início do ensaio no modo real, menos o carimbo do backup mais antigo usado);
- **descarte:** fecha servidor e bancos e apaga as pastas do ensaio, conferindo que sumiram (`--manter` guarda para
  inspeção; apague depois com `rm -rf <pasta>`). O relatório (`--relatorio r.json`) não tem chave nem conteúdo.

Modos:

```bash
node scripts/ensaio-restauracao.mjs                                   # sintético (S3 falso local), ~1 s
node scripts/ensaio-restauracao.mjs --volume-mb 100                   # sintético com ~100 MB por empresa
node scripts/ensaio-restauracao.mjs --s3 s3://<bucket>/greenia --relatorio /tmp/r.json      # real, a partir do S3
node scripts/ensaio-restauracao.mjs --backups <cópia de dados/backups> --chave-arquivo <.chave-mestra> # real, pasta
```

`ENSAIO_ISOLADO=1 node src/iniciar.js` sobe uma cópia já restaurada e remapeada (`BANCO_PLATAFORMA`) com as mesmas
travas, escutando em `127.0.0.1` (ou `ENSAIO_HOST`), e recusa subir se algum banco de empresa estiver fora da pasta.

### Resultados medidos (local, dados sintéticos, 14/10/2026)

Máquina do ambiente de desenvolvimento (contêiner Linux, Node 22.22), S3 falso local. **Não é produção.**

| Ensaio | Bancos | Tamanho dos backups (.gz) | Backup (3 bancos, local + S3 cifrado) | Restauração | Subida da app | **RTO** | **RPO** | Verificações |
|---|---|---|---|---|---|---|---|---|
| Sintético 1 | 3 | ~13 KB cada | 302 ms | 47 ms | 157 ms | **0,21 s** | 1 s | 24/24 |
| Sintético 2 | 3 | ~13 KB cada | 422 ms | 43 ms | 188 ms | **0,24 s** | 0 s | 24/24 |
| Sintético 3 | 3 | ~13 KB cada | 297 ms | 30 ms | 158 ms | **0,20 s** | 0 s | 24/24 |
| Volume (`--volume-mb 100`) | 3 | plataforma 13 KB; 2 empresas com 79,2 MB cada (~100 MB de texto cada); 158 MB cifrados no S3 | 16,4 s | 5,99 s | 529 ms | **6,53 s** | 16 s (duração da rodada) | 24/24 |

Leitura: o tempo de restauração cresce com o tamanho (gunzip + conferência de integridade) e o da subida com o número
de empresas. No ensaio real, somam-se o download do S3 (tamanho total ÷ banda) e, se houver, a criação do serviço. O
RPO medido localmente é de segundos porque o backup foi feito logo antes; em produção, com backup diário, o RPO de
pior caso é **até ~24 h** (a última escrita antes do desastre menos o backup das 06:00), mais a duração da rodada.

## 6. Procedimento do ensaio real (não executado)

Nunca restaurar snapshot sobre o disco de produção (no Render, "restore" de snapshot volta o **próprio** disco).

**Opção A, recomendada: serviço separado a partir do S3.**

1. Ligar o S3 em produção (seção 3) e esperar pelo menos uma rodada com `backup.run` na auditoria.
2. No Render, criar um serviço novo do mesmo repositório (Dockerfile), do tipo **Private Service** (sem URL pública)
   ou **Background Worker**, plano com memória ≥ 1 GB, **sem disco persistente** (o ensaio usa `/tmp`) e **sem**
   herdar o grupo de variáveis de produção.
3. Variáveis do serviço de ensaio (só estas): `S3_ENDPOINT`, `S3_REGIAO`, `S3_CHAVE`/`S3_SEGREDO` do usuário **só
   leitura**, `BACKUP_CHAVE_CIFRA`, `BACKUP_ENVELOPE_SEGREDO` (ou `CHAVE_MESTRA`), `DESIGN_IA=0`. **Não** definir:
   `SMTP_*`, `EMAIL_API*`, `OPENROUTER_API_KEY`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `BACKUP_HORA`,
   `BACKUP_DESTINO`, `RETENCAO_APLICAR`, `EXCLUSAO_APLICAR`, `MULTIEMPRESA`, `PLATAFORMA_HOST`, domínios.
4. Comando (Start Command ou shell do serviço):
   `node --disable-warning=ExperimentalWarning scripts/ensaio-restauracao.mjs --s3 s3://<bucket>/greenia --relatorio /tmp/ensaio.json`
   — o relatório imprime RTO, RPO, tamanhos e verificações; guardar a saída (sem segredos) como evidência.
5. Descarte: o script apaga `/tmp`; em seguida, **apagar o serviço de ensaio** e revogar a chave IAM de leitura se
   ela não for reutilizada. Registrar data, responsável e resultado.
6. Para inspeção manual prolongada: rodar com `--manter --destino /tmp/ensaio` e depois
   `ENSAIO_ISOLADO=1 BANCO_PLATAFORMA=/tmp/ensaio/plataforma.sqlite node src/iniciar.js` (acesso pelo shell do Render
   com `curl http://127.0.0.1:$PORT/...`; em Private Service, `ENSAIO_HOST=0.0.0.0` só se for preciso acessar pela
   rede privada). Apagar o serviço ao fim.

**Opção B, só com autorização explícita: dentro do serviço de produção, sem S3.** No shell do Render:
`node scripts/ensaio-restauracao.mjs --backups /app/dados/backups --chave-arquivo /app/dados/.chave-mestra`.
Só lê os backups e escreve em `/tmp` (recusa `/app/dados`), com rede externa bloqueada e email em memória no processo
do ensaio, mas divide CPU e memória (plano starter, 512 MB) com o serviço no ar e roda com as variáveis de produção
no ambiente (não usadas pelo ensaio, mas presentes). Fazer fora do horário de uso.

## 7. Recursos necessários para o ensaio real (quem precisa fornecer)

| Recurso | Para quê | Quem |
|---|---|---|
| Bucket S3 compatível dedicado, região à escolha, sem acesso público, sem Object Lock, com a regra de ciclo de vida da seção 3 (6 d + 1 d de versões antigas, ou 7 d sem versionamento) | cópia fora do servidor e fonte do ensaio | responsável pela conta AWS (ou R2/B2) da TheNeil |
| Usuário IAM da aplicação com a política da seção 3 (Put/Get no prefixo, List no prefixo, leitura de lifecycle/versionamento/Object Lock; sem Delete) | envio diário | idem |
| Usuário IAM de ensaio só leitura | ensaio | idem |
| `BACKUP_CHAVE_CIFRA` e `BACKUP_ENVELOPE_SEGREDO` gerados e guardados no cofre de senhas (fora do Render) | cifra dos objetos e recuperação da chave-mestra | responsável pela operação da plataforma |
| Variáveis acima no serviço `greenia` do Render | ligar o S3 | quem administra o serviço no Render |
| Um segundo serviço no Render (Private Service/Worker, ≥ 1 GB) **ou** uma chave da API do Render para criá-lo e apagá-lo por script | ambiente isolado do ensaio | dono da conta/workspace no Render |
| Janela combinada e um responsável para registrar o resultado | evidência | operação |

Sem esses recursos, nada disso foi testado contra a nuvem: o caminho S3 completo (lifecycle, versionamento, Object
Lock, envio cifrado, HEAD, listagem paginada, download, decifra, envelope) foi testado só contra o S3 falso local
(`scripts/ensaio/s3-falso.js`, que confere a assinatura SigV4 e o hash do corpo).

## 8. Riscos em aberto

- Backups no mesmo disco do banco enquanto o S3 não for ligado (ver seção 1).
- Chave-mestra sem cópia fora do servidor até alguém rodar `scripts/chave-mestra.js selar` (ou definir o envelope no
  S3) e guardar o segredo no cofre. Hoje a única cópia é o arquivo no disco e os snapshots do Render.
- Variáveis secretas do Render sem inventário fora dele.
- A conferência da expiração é feita uma vez por rodada (antes do primeiro envio); uma regra removida no meio da
  rodada só é percebida na seguinte.
- Restaurar em produção ainda é manual (`scripts/restaurar.js` por banco, com o serviço parado); a recuperação de
  todos os bancos de uma vez só existe no ensaio, sobre cópia.
- Os tempos medidos são locais e com bancos pequenos; o RTO real depende do download e da criação do serviço.
