output "alb_dns" {
  description = "Nome do ALB: o CNAME (ou alias) do domínio aponta para ele."
  value       = aws_lb.principal.dns_name
}

output "ecr_repositorio" {
  value = aws_ecr_repository.principal.repository_url
}

output "banco_endereco" {
  value = aws_db_instance.principal.address
}

output "banco_segredo_dono" {
  description = "Segredo com a senha do dono do banco (gerenciado pelo RDS)."
  value       = try(aws_db_instance.principal.master_user_secret[0].secret_arn, null)
}

output "redis_endereco" {
  value = aws_elasticache_replication_group.principal.primary_endpoint_address
}

output "bucket_documentos" {
  value = aws_s3_bucket.documentos.id
}

output "bucket_ancoras" {
  value = aws_s3_bucket.ancoras.id
}

output "papel_ancoras" {
  value = aws_iam_role.ancoras.arn
}

output "dkim_tokens" {
  description = "Tokens do Easy DKIM: <token>._domainkey.<dominio> CNAME <token>.dkim.amazonses.com"
  value       = try(aws_sesv2_email_identity.dominio.dkim_signing_attributes[0].tokens, [])
}

output "segredos" {
  description = "Segredos a preencher antes do primeiro deploy."
  value       = { for k, s in aws_secretsmanager_secret.app : k => s.arn }
}

output "migracao" {
  description = "Definição da tarefa de migração (rodar antes de atualizar os serviços)."
  value       = aws_ecs_task_definition.principal["migracao"].arn
}
