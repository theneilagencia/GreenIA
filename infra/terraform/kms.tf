# Chaves próprias, com rotação anual. Uma por finalidade: apagar ou restringir
# uma não afeta as outras.
locals {
  chaves = {
    banco      = "RDS e backups do banco"
    documentos = "Bucket de documentos"
    segredos   = "Secrets Manager"
    logs       = "CloudWatch Logs"
    backup     = "Cofre do AWS Backup"
  }
}

resource "aws_kms_key" "principal" {
  for_each                = local.chaves
  description             = "${local.nome}: ${each.value}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = each.key == "logs" ? jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Conta"
        Effect    = "Allow"
        Principal = { AWS = "arn:${local.particao}:iam::${local.conta_producao}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.regiao}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:${local.particao}:logs:${var.regiao}:${local.conta_producao}:log-group:*" } }
      },
    ]
  }) : null
}

resource "aws_kms_alias" "principal" {
  for_each      = local.chaves
  name          = "alias/${local.nome}-${each.key}"
  target_key_id = aws_kms_key.principal[each.key].key_id
}
