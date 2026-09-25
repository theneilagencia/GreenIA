# AWS Backup: cópias diárias e mensais do banco e do bucket de documentos, num
# cofre com chave própria e trava contra exclusão antecipada.
resource "aws_backup_vault" "principal" {
  name        = local.nome
  kms_key_arn = aws_kms_key.principal["backup"].arn
}

resource "aws_backup_vault_lock_configuration" "principal" {
  backup_vault_name  = aws_backup_vault.principal.name
  min_retention_days = 7
  max_retention_days = var.backup_mensal_dias
}

resource "aws_backup_plan" "principal" {
  name = local.nome
  rule {
    rule_name         = "diario"
    target_vault_name = aws_backup_vault.principal.name
    schedule          = "cron(0 6 * * ? *)"
    lifecycle {
      delete_after = var.backup_diario_dias
    }
  }
  rule {
    rule_name         = "mensal"
    target_vault_name = aws_backup_vault.principal.name
    schedule          = "cron(0 7 1 * ? *)"
    lifecycle {
      delete_after = var.backup_mensal_dias
    }
  }
}

resource "aws_iam_role" "backup" {
  name = "${local.nome}-backup"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "backup.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "backup" {
  for_each = toset([
    "service-role/AWSBackupServiceRolePolicyForBackup",
    "service-role/AWSBackupServiceRolePolicyForRestores",
    "AWSBackupServiceRolePolicyForS3Backup",
    "AWSBackupServiceRolePolicyForS3Restore",
  ])
  role       = aws_iam_role.backup.name
  policy_arn = "arn:${local.particao}:iam::aws:policy/${each.key}"
}

resource "aws_backup_selection" "principal" {
  name         = local.nome
  plan_id      = aws_backup_plan.principal.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = [aws_db_instance.principal.arn, aws_s3_bucket.documentos.arn]
}
