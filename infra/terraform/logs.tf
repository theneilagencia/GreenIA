resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "fila", "migracao"])
  name              = "/greenia/${var.ambiente}/${each.key}"
  retention_in_days = var.retencao_logs_dias
  kms_key_id        = aws_kms_key.principal["logs"].arn
}

resource "aws_cloudwatch_log_group" "vpc" {
  name              = "/greenia/${var.ambiente}/vpc"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.principal["logs"].arn
}

# ------------------------------------------------------------ alarmes

resource "aws_sns_topic" "alarmes" {
  name              = "${local.nome}-alarmes"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "alarmes_email" {
  topic_arn = aws_sns_topic.alarmes.arn
  protocol  = "email"
  endpoint  = var.email_alarmes
}

locals {
  alarmes = {
    alb_5xx = {
      descricao = "Respostas 5xx da aplicação acima de 10 em 5 minutos"
      namespace = "AWS/ApplicationELB", metrica = "HTTPCode_Target_5XX_Count", estatistica = "Sum", limite = 10, comparacao = "GreaterThanThreshold"
      dimensoes = { LoadBalancer = aws_lb.principal.arn_suffix }
    }
    alvos_saudaveis = {
      descricao = "Menos de uma tarefa da API saudável"
      namespace = "AWS/ApplicationELB", metrica = "HealthyHostCount", estatistica = "Minimum", limite = 1, comparacao = "LessThanThreshold"
      dimensoes = { LoadBalancer = aws_lb.principal.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
    }
    banco_cpu = {
      descricao = "CPU do banco acima de 80%"
      namespace = "AWS/RDS", metrica = "CPUUtilization", estatistica = "Average", limite = 80, comparacao = "GreaterThanThreshold"
      dimensoes = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
    }
    banco_disco = {
      descricao = "Menos de 10 GB livres no banco"
      namespace = "AWS/RDS", metrica = "FreeStorageSpace", estatistica = "Minimum", limite = 10 * 1024 * 1024 * 1024, comparacao = "LessThanThreshold"
      dimensoes = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
    }
    redis_memoria = {
      descricao = "Memória do Redis acima de 80% (com noeviction, a fila para ao encher)"
      namespace = "AWS/ElastiCache", metrica = "DatabaseMemoryUsagePercentage", estatistica = "Maximum", limite = 80, comparacao = "GreaterThanThreshold"
      dimensoes = { ReplicationGroupId = aws_elasticache_replication_group.principal.id }
    }
    fila_cpu = {
      descricao = "CPU das tarefas da fila acima de 85% (OCR e conversões)"
      namespace = "AWS/ECS", metrica = "CPUUtilization", estatistica = "Average", limite = 85, comparacao = "GreaterThanThreshold"
      dimensoes = { ClusterName = aws_ecs_cluster.principal.name, ServiceName = aws_ecs_service.fila.name }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "principal" {
  for_each            = local.alarmes
  alarm_name          = "${local.nome}-${each.key}"
  alarm_description   = each.value.descricao
  namespace           = each.value.namespace
  metric_name         = each.value.metrica
  statistic           = each.value.estatistica
  threshold           = each.value.limite
  comparison_operator = each.value.comparacao
  dimensions          = each.value.dimensoes
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmes.arn]
  ok_actions          = [aws_sns_topic.alarmes.arn]
}

# Cadeia de auditoria quebrada ou âncora não publicada: o servidor escreve no
# log; o filtro vira métrica e alarme.
resource "aws_cloudwatch_log_metric_filter" "ancora" {
  name           = "${local.nome}-ancora-nao-publicada"
  log_group_name = aws_cloudwatch_log_group.app["fila"].name
  pattern        = "ancora_nao_publicada"
  metric_transformation {
    name      = "AncoraNaoPublicada"
    namespace = "GreenIA"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "ancora" {
  alarm_name          = "${local.nome}-ancora-nao-publicada"
  alarm_description   = "Âncora da auditoria não publicada (cadeia quebrada ou falha na gravação)"
  namespace           = "GreenIA"
  metric_name         = "AncoraNaoPublicada"
  statistic           = "Sum"
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  period              = 3600
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmes.arn]
}
