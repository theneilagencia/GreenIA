# Infraestrutura de produção (AWS sa-east-1)

Terraform em `infra/terraform/`. **Nada foi aplicado.** O repositório só valida:

- `terraform validate`: a configuração é válida para o provedor AWS 6.x;
- `terraform test`: um plano completo e as conferências de segurança sobre um
  **provedor simulado** (`mock_provider`). Nada vai para a AWS e nenhuma
  credencial é usada.

## O que é criado

| Peça | Recursos | Pontos de segurança |
|---|---|---|
| Rede | VPC com sub-redes públicas (ALB e NAT), de aplicação (ECS) e de dados (RDS e Redis), em 2 zonas; NAT (um ou um por zona); endpoint do S3; endpoints privados de Secrets Manager, ECR, Logs e STS | dados sem rota para fora da VPC; grupo padrão sem regras; registro de tráfego da VPC; banco e Redis só aceitam as tarefas |
| Banco | RDS PostgreSQL 16, Multi-AZ, gp3 com crescimento automático | KMS próprio, `rds.force_ssl=1`, privado, proteção contra exclusão, 35 dias de backup com PITR, senha do dono gerenciada pelo RDS. pgvector disponível (`CREATE EXTENSION vector`), ainda não usado |
| Fila | ElastiCache Redis 7, primário e réplica em zonas diferentes | TLS, criptografia em repouso, AUTH, `noeviction` (exigência do BullMQ) |
| Documentos | S3 | KMS próprio, versionamento, bloqueio público, só TLS 1.2+, gravação só com a chave da plataforma, versões antigas apagadas em 90 dias |
| Âncoras da auditoria | S3 na **conta de auditoria** (provedor `aws.auditoria`) e o papel `greenia-ancora-auditoria` | Object Lock em modo compliance com retenção padrão; papel que só grava e lê, com `ExternalId`, confiando só no papel da tarefa de produção |
| Email | SES: domínio com Easy DKIM (2048 bits), MAIL FROM próprio, conjunto de configuração com TLS obrigatório e supressão de bounces | usuário SMTP que só envia do domínio; a credencial SMTP é gerada fora do Terraform |
| Execução | ECR (tags imutáveis, varredura), cluster ECS Fargate, serviço `api` (2 a 6 tarefas atrás do ALB), serviço `fila` (`PROCESS_ROLE=worker`), serviço `conversor` (OCR, ImageMagick, LibreOffice), tarefa avulsa `migracao` | sem IP público, sem ECS Exec, capabilities do Linux descartadas; só a migração recebe a senha do papel do servidor (a conexão do dono vai para a migração, a API e a fila: operações de plataforma e âncora da auditoria); circuito de implantação com volta automática. O `conversor` fica em sub-redes sem rota para a internet, só sai para os endpoints privados e o S3, não tem papel de tarefa e recebe só o próprio token; a API e a fila chamam `CONVERTER_URL` (nome interno no Cloud Map) |
| Entrada | ALB com HTTPS (certificado do ACM), HTTP redireciona | TLS 1.2+, cabeçalhos inválidos descartados, proteção contra exclusão |
| Segredos | Secrets Manager, um por variável (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `SMTP_URL`, OIDC...) | KMS próprio; o Terraform cria só o recipiente, o valor é gravado fora dele e não fica no estado |
| Logs | CloudWatch Logs por processo (1 ano) e da VPC (90 dias) | KMS próprio; alarmes de 5xx, tarefas saudáveis, CPU e disco do banco, memória do Redis, CPU da fila e âncora não publicada, por email (SNS) |
| Backups | AWS Backup: diário (35 dias) e mensal (12 meses) do banco e do bucket de documentos | cofre com KMS próprio e trava de retenção |

## Como validar (sem aplicar)

```sh
cd infra/terraform
terraform init -backend=false
terraform validate
terraform test
```

Resultado neste repositório (25/09/2026, Terraform 1.16.4, provedor AWS 6.66.0):
`Success! The configuration is valid.` e `Success! 5 passed, 0 failed.`

O registro do Terraform (`registry.terraform.io`) estava bloqueado neste ambiente:
o provedor foi baixado de `releases.hashicorp.com` e instalado por um espelho
local (`provider_installation { filesystem_mirror { ... } }`). Em uma máquina com
acesso ao registro, basta `terraform init`.

## Como aplicar (quando for a hora)

1. Conta de auditoria: criar o papel que o Terraform assume lá
   (`auditoria_papel_terraform_arn`), com permissão para criar o bucket e o papel
   das âncoras.
2. Estado remoto: copiar `backend.hcl.exemplo` para `backend.hcl` e rodar
   `terraform init -backend-config=backend.hcl`.
3. Valores: copiar `exemplo.tfvars`; os sensíveis vão por ambiente:
   `TF_VAR_redis_auth_token` (32 a 128 caracteres) e `TF_VAR_auditoria_external_id`.
4. `terraform plan -var-file=producao.tfvars`, revisar e aplicar.
5. Gravar os segredos (`aws secretsmanager put-secret-value`), criar os registros
   DNS do DKIM e do MAIL FROM (saída `dkim_tokens`), confirmar a inscrição do email
   dos alarmes.
6. Publicar a imagem no ECR, rodar a tarefa `migracao` e só então atualizar os
   serviços (`imagem_tag`).

## Custo mensal estimado

**Estimativa.** Preços de tabela, sob demanda, sem impostos, da lista pública de
preços da AWS para sa-east-1 (`pricing.us-east-1.amazonaws.com`, consultada em
25/09/2026). Os volumes (tráfego, logs, armazenamento) são suposições, indicadas
em cada linha. Não inclui o custo do modelo (veja o simulador de custo por
execução) nem suporte da AWS. Conferir na calculadora da AWS antes de fechar
preço.

### Infraestrutura base (valores padrão das variáveis)

| Item | Suposição | US$/mês |
|---|---|---:|
| Fargate, API | 2 tarefas × (1 vCPU, 2 GB), 730 h; US$ 0,0696 por vCPU-h e US$ 0,0076 por GB-h | 123,81 |
| Fargate, fila | 1 tarefa × (1 vCPU, 2 GB), 730 h | 61,90 |
| Fargate, conversor | 1 tarefa × (2 vCPU, 4 GB), 730 h | 123,81 |
| RDS PostgreSQL | db.t4g.medium Multi-AZ, US$ 0,275/h | 200,75 |
| RDS disco | 100 GB gp3 Multi-AZ, US$ 0,438/GB | 43,80 |
| ElastiCache | 2 × cache.t4g.small, US$ 0,061/h | 89,06 |
| NAT | 1 NAT, US$ 0,093/h, e 50 GB processados | 72,54 |
| Endpoints privados | 5 serviços × 2 zonas, US$ 0,021/h | 153,30 |
| ALB | US$ 0,034/h e 1 LCU em média | 32,85 |
| IPv4 públicos | 3 endereços (NAT e ALB), US$ 0,005/h | 10,95 |
| CloudWatch | 15 GB de logs por mês (US$ 0,90/GB), guarda e 7 alarmes; Container Insights (cerca de US$ 10, não conferido na tabela) | 30,00 |
| AWS Backup | snapshots do banco (cerca de 125 GB, US$ 0,095/GB) e cópia do bucket (cerca de 130 GB, US$ 0,07/GB) | 22,00 |
| S3 documentos | 100 GB, US$ 0,0405/GB, e requisições | 5,00 |
| KMS | 5 chaves | 5,00 |
| Secrets Manager | 8 segredos | 3,20 |
| Saída para a internet | 50 GB (preço não conferido na tabela; cerca de US$ 0,15/GB) | 7,50 |
| SES, ECR, conta de auditoria | 10 mil emails, imagens, âncoras | 2,50 |
| **Total** | | **≈ 988** |

Em reais, com o câmbio da tabela da plataforma (5,5): **≈ R$ 5.430 por mês (estimativa)**.

Onde dá para economizar, com o efeito aproximado:

| Mudança | US$/mês |
|---|---:|
| Conversor com 1 vCPU e 2 GB (conversões mais lentas) | −62 |
| `banco_classe = "db.t4g.small"` | −101 |
| `banco_armazenamento_gb = 50` | −22 |
| API com 0,5 vCPU e 1 GB por tarefa | −62 |
| Configuração mínima (as quatro acima) | **≈ 740** |
| Os endpoints privados não saem: sem eles, o conversor isolado não baixa a imagem nem escreve log | 0 |
| `nat_por_zona = true` (mais disponibilidade) | +72 |
| Reservas de 1 ano (RDS, ElastiCache) e Savings Plans (Fargate) | de −20% a −40% nesses itens |

### Por tenant adicional

**Estimativa**, para um cliente típico: 30 usuários, 1.000 execuções por mês,
5 GB de documentos novos por mês e retenção de 12 meses (cerca de 60 GB guardados
em regime).

| Item | Suposição | US$/mês |
|---|---|---:|
| S3 documentos | 75 GB (60 GB e versões antigas de 90 dias) | 3,04 |
| Backup do bucket | 60 GB × US$ 0,07, com as cópias mensais | 5,46 |
| Banco | +2 GB em disco Multi-AZ e nos snapshots | 1,17 |
| Logs | +1 GB por mês | 1,40 |
| Computação das conversões | 1 tarefa do conversor atende cerca de 26 mil execuções por mês (2 simultâneas, 60 s cada, 30% de ocupação); a fração de 1.000 execuções | 4,80 |
| SES, NAT | emails e chamadas ao modelo | 0,15 |
| **Total** | | **≈ 16** |

Em reais: **≈ R$ 88 por tenant adicional por mês (estimativa)**, mais o custo do
modelo, que depende dos assistentes e do volume. A infraestrutura base atende
vários tenants sem mudança; acima de cerca de 25 mil execuções por mês no total,
some uma tarefa do conversor (+US$ 124) e, com mais de 150 usuários simultâneos, uma
tarefa da API (+US$ 62).
