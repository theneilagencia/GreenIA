# Integration Builder governado

Permite que um Quick Win leia dados de sistemas da empresa e, com política e aprovação, grave resultados
neles. Não é um "Zapier": não existe HTTP arbitrário, nem código gerado executado, nem escrita silenciosa.
Toda chamada externa passa por um runtime central, com política, cofre de credenciais, proteções de rede e
auditoria.

```
QUICK WIN → necessidades → resolução (capability) → conector → configuração → teste → política
          → aprovação → publicação → execução (runtime) → auditoria
```

## Ligar e desligar

| Chave | Onde | Padrão | Efeito |
|---|---|---|---|
| `integracoes.ativa` | Configurações da empresa (`PUT /api/admin/config`) | `false` | Liga o recurso na empresa. Desligado: todas as rotas respondem 404 e o Quick Win funciona como antes. |
| `integracoes.pessoas` | idem | `[]` | Lista de e-mails que veem o recurso (vazia = todos da empresa com a permissão). Usada para liberar só a conta de QA. |
| `integracoes.politicas` | idem | `[]` (usa a política padrão) | Regras da empresa (dados, não código). |
| `integracoes.rede_privada_autorizada` | idem | `false` | Segunda chave para rede interna (a primeira fica no conector). |
| `integracoes.limite_minuto_empresa` | idem | `300` | Teto de chamadas por minuto da empresa. |
| `INTEGRATION_BUILDER_ENABLED` | variável de ambiente | não definida | `false`/`0`/`off` desliga o recurso em todas as empresas (chave de emergência). |

Permissões (RBAC): `integrations.manage` (configurar, testar, publicar, pausar, revogar) e
`integrations.approve` (aprovar publicação e execuções sensíveis). O admin da empresa tem as duas.

## Modelo

- **Conector** (`connectors`): tipo (REST, GraphQL, Webhook executáveis; SFTP, Email, Database,
  BrowserAutomation e Custom só modelados), `auth_type`, `base_url`, `allowed_hosts`, especificação
  declarativa (operações), `config` (tempo limite, repetição, limite de taxa, rede interna, escopos),
  `status`, `origem` (`builtin`, `generated`, `configured`, `imported`, `admin`), `versao`, `secret_ref`.
- **Status**: `DRAFT → DISCOVERED → CONFIGURED → TESTING → REVIEW_REQUIRED → APPROVED → ACTIVE`, com
  `PAUSED`, `FAILED` e `REVOKED`. Nunca `DRAFT → ACTIVE`: publicar exige teste aprovado e aprovação da
  MESMA versão.
- **Capability** (`capabilities`): a ação que um Quick Win usa (`read_data`, `create_record`,
  `update_record`, `delete_record`, `send_message`, `generate_document`, `upload_file`,
  `trigger_workflow`, ...), com efeitos (`read`, `write`, `external_side_effect`, `irreversible`,
  `financial`, `personal_data`, `privileged`, `communication`, `bulk`), classe (`SAFE_READ`,
  `SIDE_EFFECT`, `DESTRUCTIVE`) e risco (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). O admin só pode tornar a
  classe mais restrita, nunca afrouxar.
- **Versões** (`connector_versions`): cada mudança de comportamento (endpoint, hosts, auth, operações,
  parâmetros) gera versão nova com hash; a aprovação anterior deixa de valer e o conector volta para
  `CONFIGURED` (precisa de novo teste e nova aprovação). Trocar só o valor da credencial é rotação e
  não muda a versão.
- **Reutilização**: o catálogo é por empresa; uma capability publicada serve a qualquer Quick Win da
  mesma empresa, nunca de outra.

Tabelas: `connectors`, `connector_versions`, `capabilities`, `capability_mappings`,
`connector_secrets_ref`, `integration_approvals`, `connector_runs`, `webhook_configs`,
`webhook_entregas`, `oauth_estados`, `integ_planos` — todas com `tenant_id`, num banco por empresa.

## Credenciais

- Cofre: AES-256-GCM com a chave mestra da plataforma; o conector guarda só `secret_ref`
  (`provider`, `key_id`, `tenant_id`).
- Nunca aparecem em prompt, log, auditoria, URL, resposta da API ou tela (a tela mostra `••••••••`).
  Erros de sistemas externos que ecoam a chave são redigidos.
- Tipos: chave de API (cabeçalho), Bearer, Basic, OAuth2 client credentials, OAuth2 authorization code
  (state de uso único ligado à pessoa, redirect exato, PKCE S256, refresh com rotação), cabeçalho
  personalizado. mTLS, requisição assinada e service account estão modelados para depois.
- Revogar apaga a credencial do cofre.

## Rede (SSRF)

`buscaSegura` resolve o DNS, bloqueia loopback, `0.0.0.0/8`, RFC1918, link-local e metadados de nuvem
(`169.254.169.254`, `fd00:ec2::/32`), CGNAT, multicast/reservados, IPv6 local/ULA/mapeado; conecta no IP
conferido (sem nova resolução: DNS rebinding não passa); revalida cada redirecionamento (máx. 3) e
descarta a credencial ao mudar de host; só hosts da allowlist; só https (http apenas em rede interna
autorizada); tempo limite obrigatório (≤ 60 s); tamanho máximo da resposta; cabeçalhos sem quebra de linha
nem nomes proibidos; parâmetros de caminho sem `..`, `/`, `\`, controle ou codificações disfarçadas.
Rede interna só com as duas chaves: `config.rede_privada` no conector **e**
`integracoes.rede_privada_autorizada` na empresa.

## Execução

- **Runtime central** (`runtime.js`): o Quick Win nunca chama HTTP. Fluxo: capability ativa → política →
  aprovação (quando exigida) → limite de taxa (empresa, conector, operação) → idempotência → requisição
  segura → validação do esquema da resposta → mapeamento → auditoria.
- **Política** (`politicas.js`): `ALLOW`, `DENY`, `REQUIRE_APPROVAL`. Padrão: destrutivo → DENY; risco
  crítico → DENY; financeiro, dado pessoal e comunicação → aprovação; escrita → aprovação; leitura de risco
  baixo/médio → ALLOW. Regras da empresa são dados. Invariantes que nenhuma regra afrouxa: conector
  inativo → DENY; destrutivo ou crítico nunca ALLOW; escrita de conector gerado nunca ALLOW.
- **Aprovação**: a tela mostra em linguagem simples o que a integração **poderá** e **não poderá** fazer,
  hosts, escopos, efeitos, risco e exemplos. Aprovação de execução vale para a mesma etapa, a mesma versão
  e a mesma entrada (hash). A etapa aprovada executa com a entrada guardada no plano.
- **Repetição**: só leitura (`SAFE_READ`) ou escrita com chave de idempotência; status 429/502/503/504;
  backoff; nunca repete operação destrutiva.
- **Esquema**: resposta fora do esquema declarado vira `PARTIAL` (campos opcionais) ou falha (obrigatórios).
- **Mapeamento**: DSL declarativa (renomear, `trim`, número, data, enum, juntar, dividir, limitar, padrão);
  sem `eval`, sem `__proto__`/`constructor`.
- **Modo teste**: leituras rodam de verdade; escritas são simuladas (nada é enviado) com amostra sintética
  do esquema. O contrato de teste confere credencial, autenticação, conectividade, esquema, mapeamento,
  tempo limite, repetição, paginação, erros, limite de taxa e efeitos.
- **Plano** (`plano.js`): necessidades → etapas com dependências e ordem topológica; estados `SUCCESS`,
  `PARTIAL`, `FAILED`, `BLOCKED`, `APPROVAL_REQUIRED`; dependente de etapa que falhou fica `BLOCKED`;
  compensação só sugerida a uma pessoa (nunca automática).
- **Gatilhos**: `manual`, `scheduled`, `event`, `webhook` (modelados no plano; o webhook de entrada cria
  um plano "aguardando").
- **Webhook de entrada**: assinatura HMAC-SHA256 de `timestamp.corpo`, janela de ±300 s, proteção contra
  replay por id de entrega, 120/min, rotação de segredo com 24 h de transição, isolado por empresa.

## Quick Win

1. **Criação**: com o recurso ligado, a interpretação detecta ações em sistemas nomeados ("consulte ... no
   CRM", "registre ... no ERP", "envie ... por e-mail") sem regra de setor, e mostra "Este Quick Win precisa
   acessar X" com ✓ disponível, ⚠ precisa configurar / com aprovação, ✕ não permitido, e o botão
   "Configurar integração". Pedido só de texto não ganha integração. Gravação feita pela integração não
   vira entregável de texto.
2. **Execução**: leituras rodam antes da IA e entram como material (entre marcas, não instrução), pelo
   mesmo filtro de dados e sigilo; a credencial nunca vai ao modelo. As escritas rodam depois da conferência
   de qualidade, com os dados de um bloco estruturado que sai do texto mostrado. Resultado inconsistente
   ou pergunta pendente não grava nada. A conversa mostra cada etapa com o status e, quando há aprovação
   pendente, o botão "Executar etapas aprovadas".

## Telas

- Administração → **Integrações**: lista, aprovações pendentes, métricas.
- **Nova integração** (8 passos): sistema; documentação (colar OpenAPI/Swagger/GraphQL ou descrever ações
  em formulário, sem JSON); autenticação (credencial vai para o cofre); ações; permissões e limites;
  teste; aprovação; publicação.
- **Detalhe**: status, ações, credencial (máscara), uso, execuções recentes, versões; pausar, retomar,
  revogar.

## Auditoria e métricas

Eventos (só metadados, nunca credencial nem payload): `CONNECTOR_DISCOVERED`, `CONNECTOR_CREATED`,
`CONNECTOR_TESTED`, `CONNECTOR_APPROVED`, `CONNECTOR_PUBLISHED`, `CONNECTOR_USED`, `CONNECTOR_FAILED`,
`CONNECTOR_PAUSED`, `CONNECTOR_REVOKED`, `CAPABILITY_EXECUTED`, `APPROVAL_REQUESTED`, `APPROVAL_GRANTED`,
`APPROVAL_DENIED`, além de `CONNECTOR_BLOCKED`, `CONNECTOR_SECRET_SET/ROTATED`, `PLAN_CREATED`,
`PLAN_EXECUTED`. Métricas por conector: execuções, taxa de sucesso, falhas, repetições, latência média e
máxima, aprovações e bloqueios. O custo de IA continua contado por etapa da execução do Quick Win; chamadas
de integração não mudam preço nem créditos.

## Testes

- `test/integracoes-seguranca.test.js`: SSRF (localhost, 127.0.0.1, 169.254.169.254, rede privada, CGNAT,
  IPv6), DNS rebinding, allowlist, redirecionamento para IP interno, credencial em redirecionamento,
  header injection, tempo limite, resposta grande, redação de segredos, path traversal.
- `test/integracoes-motor.test.js`: risco, políticas, mapeamento, esquema, descoberta, ciclo de vida,
  versões, runtime, aprovação, idempotência, repetição, modo teste, reutilização, plano, OAuth, webhook,
  limite de taxa.
- `test/integracoes-tenants.test.js`: recurso desligado por padrão, ciclo completo pela API, Quick Win com
  leitura e escrita aprovada, isolamento entre empresas (conector, credencial, aprovação, plano, execução,
  catálogo), permissão.
- `test/integracoes-generalizacao.test.js`: 42 pedidos inéditos de 10 áreas em duas rodadas e 3 casos de
  negócio (Financeiro, Gestão, RH/Administrativo).
- `e2e/integracoes.test.js`: navegador + servidores falsos — assistente completo e cenários A–H.

## Recuperação (recovery)

- **Desligar tudo agora**: `INTEGRATION_BUILDER_ENABLED=false` no ambiente (todas as empresas) ou
  `integracoes.ativa = false` na empresa. As rotas passam a responder 404 e os Quick Wins executam sem
  integração; nada é apagado.
- **Um conector com problema**: Pausar (para de executar; volta com Retomar, se a versão continua aprovada)
  ou Revogar (apaga a credencial, desliga as ações e invalida aprovações pendentes; não volta).
- **Credencial vazada no sistema de origem**: troque-a lá e cadastre a nova (rotação, sem nova versão); se
  houver dúvida sobre o que foi feito, Revogar e criar outra integração.
- **Escrita feita e etapa seguinte falhou**: o plano mostra a compensação sugerida; uma pessoa decide
  desfazer no sistema de origem (a GreenIA não desfaz sozinha).
- **Execução repetida por engano**: a chave de idempotência por plano/etapa evita gravar de novo; a
  segunda execução devolve o resultado da primeira.
- **Migração**: as tabelas são criadas com `create table if not exists` e não alteram tabelas antigas;
  voltar o código para a versão anterior deixa as tabelas novas sem uso.

## Limitações

- Executáveis nesta versão: REST, GraphQL e Webhook (entrada). SFTP, Email, Database e BrowserAutomation
  estão modelados (tipo, risco, política), mas não executam; BrowserAutomation tem risco HIGH por padrão e
  Database só aceitaria consultas por template (não há SQL gerado por IA).
- mTLS, requisição assinada e service account estão só modelados.
- Gatilhos agendado e por evento estão no modelo do plano; não há agendador novo nesta versão.
- O detector de necessidades é genérico e conservador: reconhece verbo de ação + sistema nomeado ("no X",
  "pelo X", "por e-mail"). Na generalização com pedidos inéditos acertou 19/22 (rodada 1) e 18/20
  (rodada 2), sem nenhum falso positivo; quando erra, erra para o lado seguro (o Quick Win roda sem
  integração e a pessoa pode ajustar).
- A política padrão trata e-mail em campos da resposta como dado pessoal: ler uma lista de clientes com
  e-mail pede aprovação até a empresa mudar a política (por dado) ou o admin revisar os efeitos.
- Limites de taxa ficam na memória do processo (um processo por serviço); com várias instâncias, cada uma
  conta o seu.
