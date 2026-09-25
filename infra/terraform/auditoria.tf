# Conta de auditoria: bucket das âncoras com Object Lock (compliance) e o papel
# que a aplicação assume para gravar. Nem a conta de produção nem o dono do
# banco conseguem apagar ou mudar uma âncora antes do fim da retenção.
data "aws_caller_identity" "auditoria" {
  provider = aws.auditoria
}

resource "aws_s3_bucket" "ancoras" {
  provider            = aws.auditoria
  bucket              = "${local.nome}-ancoras-${data.aws_caller_identity.auditoria.account_id}"
  object_lock_enabled = true
}

resource "aws_s3_bucket_versioning" "ancoras" {
  provider = aws.auditoria
  bucket   = aws_s3_bucket.ancoras.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Retenção padrão: cada âncora já vai com COMPLIANCE e a data de retenção; esta
# é a rede de segurança para qualquer objeto gravado sem cabeçalho.
resource "aws_s3_bucket_object_lock_configuration" "ancoras" {
  provider = aws.auditoria
  bucket   = aws_s3_bucket.ancoras.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.auditoria_retencao_dias
    }
  }
  depends_on = [aws_s3_bucket_versioning.ancoras]
}

resource "aws_s3_bucket_public_access_block" "ancoras" {
  provider                = aws.auditoria
  bucket                  = aws_s3_bucket.ancoras.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "ancoras" {
  provider = aws.auditoria
  bucket   = aws_s3_bucket.ancoras.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ancoras" {
  provider = aws.auditoria
  bucket   = aws_s3_bucket.ancoras.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "ancoras" {
  provider = aws.auditoria
  bucket   = aws_s3_bucket.ancoras.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SoTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.ancoras.arn, "${aws_s3_bucket.ancoras.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.ancoras]
}

resource "aws_iam_role" "ancoras" {
  provider = aws.auditoria
  name     = "greenia-ancora-auditoria"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = aws_iam_role.tarefa.arn }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "sts:ExternalId" = var.auditoria_external_id } }
    }]
  })
  max_session_duration = 3600
}

# Sem s3:DeleteObject*, s3:BypassGovernanceRetention nem
# s3:PutBucketObjectLockConfiguration.
locals {
  acoes_ancoras = ["s3:PutObject", "s3:PutObjectRetention", "s3:GetObject", "s3:GetObjectVersion"]
}

resource "aws_iam_role_policy" "ancoras" {
  provider = aws.auditoria
  name     = "gravar-ancoras"
  role     = aws_iam_role.ancoras.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = local.acoes_ancoras
      Resource = "${aws_s3_bucket.ancoras.arn}/greenia/*"
    }]
  })
}
