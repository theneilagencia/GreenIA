# Plano e criação sobre provedor simulado: nada é criado na AWS e nenhuma
# credencial é usada.
#   terraform init -backend=false && terraform test
# Confere as propriedades de segurança que o README e PENDENCIAS-SEGURANCA.md
# prometem.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  # ARNs com formato válido: o provedor confere o formato antes de "criar".
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/simulado" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:sa-east-1:111111111111:simulado" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:sa-east-1:111111111111:log-group:simulado" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:sa-east-1:111111111111:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:sa-east-1:111111111111:secret:simulado" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::simulado" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:sa-east-1:111111111111:loadbalancer/app/simulado/0" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:sa-east-1:111111111111:targetgroup/simulado/0" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:sa-east-1:111111111111:task-definition/simulado:1" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:sa-east-1:111111111111:cluster/simulado" }
  }
  mock_resource "aws_db_instance" {
    defaults = { arn = "arn:aws:rds:sa-east-1:111111111111:db:simulado" }
  }
  mock_resource "aws_backup_vault" {
    defaults = { arn = "arn:aws:backup:sa-east-1:111111111111:backup-vault:simulado" }
  }
  mock_resource "aws_backup_plan" {
    defaults = { arn = "arn:aws:backup:sa-east-1:111111111111:backup-plan:simulado" }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:sa-east-1:111111111111:service/srv-simulado" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = { arn = "arn:aws:ecr:sa-east-1:111111111111:repository/simulado" }
  }
}

mock_provider "aws" {
  alias = "auditoria"
  mock_data "aws_caller_identity" {
    defaults = { account_id = "222222222222" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::222222222222:role/greenia-ancora-auditoria" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::simulado-ancoras" }
  }
}

variables {
  dominio                       = "greenia.exemplo.com.br"
  dominio_email                 = "greenia.exemplo.com.br"
  certificado_acm_arn           = "arn:aws:acm:sa-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000"
  imagem_tag                    = "teste"
  email_alarmes                 = "operacao@exemplo.com.br"
  auditoria_papel_terraform_arn = "arn:aws:iam::222222222222:role/terraform-greenia-auditoria"
  redis_auth_token              = "0123456789abcdef0123456789abcdef"
  auditoria_external_id         = "externo-0123456789"
  segredos_oidc                 = ["OIDC_CLIENTE_ENTRA_SECRET"]
}

# O plano completo, sem nenhuma conferência: tudo tem de planejar sem erro.
run "plano" {
  command = plan
}

# As conferências usam valores que só existem depois de "criar"; o provedor
# simulado cria tudo em memória (nada vai para a AWS).
run "conferencias" {
  command = apply

  # Rede: dados sem rota para fora; banco e Redis só aceitam as tarefas.
  assert {
    condition     = length(aws_route_table.dados.route) == 0
    error_message = "As sub-redes de dados não podem ter rota para fora da VPC."
  }
  assert {
    condition     = alltrue([for s in aws_subnet.publica : s.map_public_ip_on_launch == false])
    error_message = "Nenhuma sub-rede entrega IP público automaticamente."
  }

  # Banco.
  assert {
    condition     = aws_db_instance.principal.multi_az && aws_db_instance.principal.storage_encrypted && !aws_db_instance.principal.publicly_accessible
    error_message = "O banco é Multi-AZ, criptografado e privado."
  }
  assert {
    condition     = aws_db_instance.principal.deletion_protection && aws_db_instance.principal.backup_retention_period >= 35
    error_message = "O banco tem proteção contra exclusão e 35 dias de backup."
  }
  assert {
    condition     = one([for p in aws_db_parameter_group.pg16.parameter : p.value if p.name == "rds.force_ssl"]) == "1"
    error_message = "O banco só aceita TLS."
  }
  assert {
    condition     = aws_db_instance.principal.engine == "postgres" && startswith(aws_db_instance.principal.engine_version, "16")
    error_message = "PostgreSQL 16 (pgvector disponível)."
  }

  # Redis.
  assert {
    condition     = aws_elasticache_replication_group.principal.transit_encryption_enabled && aws_elasticache_replication_group.principal.at_rest_encryption_enabled
    error_message = "O Redis usa TLS e criptografia em repouso."
  }

  # Documentos.
  assert {
    condition = alltrue([aws_s3_bucket_public_access_block.documentos.block_public_acls, aws_s3_bucket_public_access_block.documentos.block_public_policy,
    aws_s3_bucket_public_access_block.documentos.ignore_public_acls, aws_s3_bucket_public_access_block.documentos.restrict_public_buckets])
    error_message = "O bucket de documentos bloqueia todo acesso público."
  }
  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.documentos.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "Os documentos são criptografados com KMS."
  }
  assert {
    condition     = strcontains(local.politica_documentos, "aws:SecureTransport") && strcontains(local.politica_documentos, "s3:TlsVersion")
    error_message = "O bucket de documentos recusa acesso sem TLS 1.2."
  }
  assert {
    condition     = aws_s3_bucket_versioning.documentos.versioning_configuration[0].status == "Enabled"
    error_message = "Versionamento ligado nos documentos."
  }

  # Âncoras: outra conta, Object Lock em compliance, papel sem exclusão.
  assert {
    condition     = aws_s3_bucket.ancoras.object_lock_enabled && one(aws_s3_bucket_object_lock_configuration.ancoras.rule).default_retention[0].mode == "COMPLIANCE"
    error_message = "O bucket das âncoras tem Object Lock em modo compliance."
  }
  assert {
    condition     = strcontains(aws_s3_bucket.ancoras.bucket, "222222222222") && !strcontains(aws_s3_bucket.ancoras.bucket, "111111111111")
    error_message = "O bucket das âncoras fica na conta de auditoria."
  }
  assert {
    condition     = length([for a in local.acoes_ancoras : a if can(regex("Delete|Bypass|ObjectLockConfiguration|PutBucket", a))]) == 0
    error_message = "O papel das âncoras não apaga, não contorna a retenção e não muda a configuração do bucket."
  }
  assert {
    condition     = strcontains(aws_iam_role.ancoras.assume_role_policy, "sts:ExternalId")
    error_message = "O papel das âncoras exige ExternalId."
  }

  # Execução: API e fila separadas, sem IP público, sem ECS Exec.
  assert {
    condition     = aws_ecs_service.api.desired_count >= 2 && aws_ecs_service.fila.desired_count >= 1
    error_message = "Pelo menos duas tarefas da API e uma da fila."
  }
  assert {
    condition     = alltrue([for s in [aws_ecs_service.api, aws_ecs_service.fila] : !s.network_configuration[0].assign_public_ip && !s.enable_execute_command])
    error_message = "Tarefas sem IP público e sem ECS Exec."
  }
  assert {
    condition     = strcontains(aws_ecs_task_definition.principal["api"].container_definitions, "\"PROCESS_ROLE\",\"value\":\"api\"") && strcontains(aws_ecs_task_definition.principal["fila"].container_definitions, "\"PROCESS_ROLE\",\"value\":\"worker\"")
    error_message = "A API roda com PROCESS_ROLE=api e a fila com PROCESS_ROLE=worker."
  }
  assert {
    condition = (!strcontains(aws_ecs_task_definition.principal["api"].container_definitions, "APP_DB_PASSWORD") && !strcontains(aws_ecs_task_definition.principal["fila"].container_definitions, "APP_DB_PASSWORD")
    && strcontains(aws_ecs_task_definition.principal["migracao"].container_definitions, "APP_DB_PASSWORD"))
    error_message = "Só a migração recebe a senha do papel do servidor."
  }
  assert {
    condition     = strcontains(aws_ecs_task_definition.principal["fila"].container_definitions, "DATABASE_OWNER_URL") && strcontains(aws_ecs_task_definition.principal["api"].container_definitions, "DATABASE_OWNER_URL")
    error_message = "A âncora da auditoria (fila) e as operações de plataforma (API) têm a conexão do dono."
  }
  assert {
    condition     = !strcontains(aws_ecs_task_definition.conversor.container_definitions, "DATABASE") && !strcontains(aws_ecs_task_definition.conversor.container_definitions, "ANTHROPIC")
    error_message = "O conversor não recebe banco nem chave do modelo."
  }
  assert {
    condition     = strcontains(aws_ecs_task_definition.principal["fila"].container_definitions, "\"drop\":[\"ALL\"]")
    error_message = "Os contêineres descartam todas as capabilities do Linux."
  }

  # Conversor: sem rota para a internet, só sai para endpoints privados e S3,
  # sem papel de tarefa e só com o próprio token.
  assert {
    condition     = length(aws_route_table.conversor.route) == 0
    error_message = "As sub-redes do conversor não têm rota para fora da VPC (nem NAT)."
  }
  assert {
    condition = alltrue([for r in [aws_vpc_security_group_egress_rule.conversor_endpoints, aws_vpc_security_group_egress_rule.conversor_s3] :
    r.cidr_ipv4 == null && r.cidr_ipv6 == null])
    error_message = "O conversor não tem saída para endereços da internet."
  }
  assert {
    condition     = aws_ecs_task_definition.conversor.task_role_arn == null && length(jsondecode(aws_ecs_task_definition.conversor.container_definitions)[0].secrets) == 1
    error_message = "O conversor não tem papel de tarefa e recebe só o CONVERTER_TOKEN."
  }
  assert {
    condition     = strcontains(aws_ecs_task_definition.principal["fila"].container_definitions, "CONVERTER_URL") && strcontains(aws_ecs_task_definition.principal["api"].container_definitions, "http://conversor.")
    error_message = "A API e a fila convertem pelo serviço (CONVERTER_URL)."
  }
  assert {
    condition     = !aws_ecs_service.conversor.network_configuration[0].assign_public_ip && !aws_ecs_service.conversor.enable_execute_command
    error_message = "Conversor sem IP público e sem ECS Exec."
  }

  # ALB: só TLS 1.2+, HTTP redireciona.
  assert {
    condition     = aws_lb_listener.https.ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06" && aws_lb_listener.http.default_action[0].type == "redirect"
    error_message = "O ALB usa TLS 1.2+ e redireciona HTTP para HTTPS."
  }

  # Segredos: nenhum valor no Terraform.
  assert {
    condition     = contains(keys(aws_secretsmanager_secret.app), "ANTHROPIC_API_KEY") && contains(keys(aws_secretsmanager_secret.app), "OIDC_CLIENTE_ENTRA_SECRET")
    error_message = "Os segredos da aplicação existem como recipientes."
  }

  # Logs e backups.
  assert {
    condition     = alltrue([for g in aws_cloudwatch_log_group.app : g.retention_in_days == 365])
    error_message = "Logs da aplicação guardados por um ano."
  }
  assert {
    condition     = length(aws_backup_plan.principal.rule) == 2 && length(aws_backup_selection.principal.resources) == 2
    error_message = "Backup diário e mensal do banco e dos documentos."
  }
  assert {
    condition     = alltrue([for k in aws_kms_key.principal : k.enable_key_rotation])
    error_message = "Todas as chaves com rotação."
  }
}

run "um_nat_por_zona" {
  command = plan
  variables {
    nat_por_zona = true
  }
  assert {
    condition     = length(aws_nat_gateway.principal) == 2 && length(aws_vpc_endpoint.interface) == 5
    error_message = "Com nat_por_zona, um NAT por zona."
  }
}

run "conversor_exige_endpoints" {
  command = plan
  variables {
    endpoints_de_interface = false
  }
  expect_failures = [aws_ecs_service.conversor]
}

run "token_curto_recusado" {
  command = plan
  variables {
    redis_auth_token = "curto"
  }
  expect_failures = [var.redis_auth_token]
}
