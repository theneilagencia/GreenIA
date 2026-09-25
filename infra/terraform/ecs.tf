# Execução: uma imagem, três usos.
#  - api: atende o HTTP atrás do ALB (PROCESS_ROLE=api);
#  - fila: processa a fila, OCR e conversões, e as tarefas de hora em hora
#    (PROCESS_ROLE=worker);
#  - migracao: tarefa avulsa, rodada antes de atualizar os serviços.
resource "aws_ecr_repository" "principal" {
  name                 = local.nome
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
  }
}

resource "aws_ecr_lifecycle_policy" "principal" {
  repository = aws_ecr_repository.principal.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém as 30 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_ecs_cluster" "principal" {
  name = local.nome
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ------------------------------------------------------------ papéis

locals {
  confianca_ecs = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.conta_producao } }
    }]
  })
}

# Execução: puxar a imagem, escrever o log e ler os segredos na partida.
resource "aws_iam_role" "execucao" {
  name               = "${local.nome}-execucao"
  assume_role_policy = local.confianca_ecs
}

resource "aws_iam_role_policy_attachment" "execucao" {
  role       = aws_iam_role.execucao.name
  policy_arn = "arn:${local.particao}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execucao_segredos" {
  name = "segredos"
  role = aws_iam_role.execucao.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = [for s in aws_secretsmanager_secret.app : s.arn] },
      { Effect = "Allow", Action = "kms:Decrypt", Resource = aws_kms_key.principal["segredos"].arn },
    ]
  })
}

# Tarefa (o que o código pode fazer): documentos, chave dos documentos e o papel
# das âncoras na conta de auditoria. Nada além disso.
resource "aws_iam_role" "tarefa" {
  name               = "${local.nome}-tarefa"
  assume_role_policy = local.confianca_ecs
}

resource "aws_iam_role_policy" "tarefa" {
  name = "aplicacao"
  role = aws_iam_role.tarefa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.documentos.arn}/*" },
      { Effect = "Allow", Action = "s3:ListBucket", Resource = aws_s3_bucket.documentos.arn },
      { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = aws_kms_key.principal["documentos"].arn },
      { Effect = "Allow", Action = "sts:AssumeRole", Resource = "arn:${local.particao}:iam::${data.aws_caller_identity.auditoria.account_id}:role/greenia-ancora-auditoria" },
    ]
  })
}

# ------------------------------------------------------------ tarefas

locals {
  imagem = "${aws_ecr_repository.principal.repository_url}:${var.imagem_tag}"
  ambiente_comum = {
    NODE_ENV                    = "production"
    PUBLIC_URL                  = "https://${var.dominio}"
    S3_REGION                   = var.regiao
    S3_BUCKET                   = aws_s3_bucket.documentos.id
    S3_SSE                      = "aws:kms"
    S3_KMS_KEY_ID               = aws_kms_key.principal["documentos"].arn
    EMAIL_FROM                  = "GreenIA <nao-responda@${var.dominio_email}>"
    AUDIT_ANCHOR_BUCKET         = aws_s3_bucket.ancoras.id
    AUDIT_ANCHOR_REGION         = var.regiao
    AUDIT_ANCHOR_ROLE_ARN       = aws_iam_role.ancoras.arn
    AUDIT_ANCHOR_RETENTION_DAYS = tostring(var.auditoria_retencao_dias)
  }
  processos = {
    api = { papel = "api", cpu = var.api_cpu, memoria = var.api_memoria, segredos = local.segredos_app, comando = null, parada = 30 }
    # A fila termina a tarefa em andamento antes de parar (até 2 minutos).
    fila     = { papel = "worker", cpu = var.fila_cpu, memoria = var.fila_memoria, segredos = local.segredos_app, comando = null, parada = 120 }
    migracao = { papel = "api", cpu = 512, memoria = 1024, segredos = local.segredos_migracao, comando = ["node", "src/db/migrate.ts"], parada = 30 }
  }
}

resource "aws_ecs_task_definition" "principal" {
  for_each                 = local.processos
  family                   = "${local.nome}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  # A migração não precisa de S3 nem da conta de auditoria.
  task_role_arn = each.key == "migracao" ? null : aws_iam_role.tarefa.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([{
    name         = "greenia"
    image        = local.imagem
    essential    = true
    command      = each.value.comando
    stopTimeout  = each.value.parada
    portMappings = each.key == "api" ? [{ containerPort = 8080, protocol = "tcp" }] : []
    environment  = [for k, v in merge(local.ambiente_comum, { PROCESS_ROLE = each.value.papel }, each.key == "migracao" ? { APP_DB_USER = "greenia_app" } : {}) : { name = k, value = v }]
    secrets      = [for n in each.value.segredos : { name = n, valueFrom = aws_secretsmanager_secret.app[n].arn }]
    linuxParameters = {
      initProcessEnabled = true
      capabilities       = { drop = ["ALL"] }
    }
    healthCheck = each.key == "migracao" ? null : {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.regiao
        awslogs-stream-prefix = each.key
      }
    }
  }])
}

# ------------------------------------------------------------ serviços

resource "aws_ecs_service" "api" {
  name                   = "api"
  cluster                = aws_ecs_cluster.principal.id
  task_definition        = aws_ecs_task_definition.principal["api"].arn
  desired_count          = var.api_tarefas
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = aws_subnet.aplicacao[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "greenia"
    container_port   = 8080
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  health_check_grace_period_seconds = 60
  depends_on                        = [aws_lb_listener.https]
}

resource "aws_ecs_service" "fila" {
  name                   = "fila"
  cluster                = aws_ecs_cluster.principal.id
  task_definition        = aws_ecs_task_definition.principal["fila"].arn
  desired_count          = var.fila_tarefas
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = aws_subnet.aplicacao[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}

# A API cresce com a CPU, de 2 a 6 tarefas.
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.principal.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_tarefas
  max_capacity       = max(var.api_tarefas, 6)
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.nome}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"
  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
