# Bucket dos documentos dos clientes: privado, KMS próprio, versionado, só TLS,
# só gravação criptografada com a chave da plataforma (S3_SSE=aws:kms).
resource "aws_s3_bucket" "documentos" {
  bucket = "${local.nome}-documentos-${local.conta_producao}"
}

resource "aws_s3_bucket_public_access_block" "documentos" {
  bucket                  = aws_s3_bucket.documentos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "documentos" {
  bucket = aws_s3_bucket.documentos.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "documentos" {
  bucket = aws_s3_bucket.documentos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documentos" {
  bucket = aws_s3_bucket.documentos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.principal["documentos"].arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documentos" {
  bucket = aws_s3_bucket.documentos.id
  rule {
    id     = "versoes-antigas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  depends_on = [aws_s3_bucket_versioning.documentos]
}

resource "aws_s3_bucket_policy" "documentos" {
  bucket     = aws_s3_bucket.documentos.id
  policy     = local.politica_documentos
  depends_on = [aws_s3_bucket_public_access_block.documentos]
}

locals {
  politica_documentos = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SoTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.documentos.arn, "${aws_s3_bucket.documentos.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "SoTLS12"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.documentos.arn, "${aws_s3_bucket.documentos.arn}/*"]
        Condition = { NumericLessThan = { "s3:TlsVersion" = "1.2" } }
      },
      {
        Sid       = "SoChaveDaPlataforma"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.documentos.arn}/*"
        Condition = { StringNotEqualsIfExists = { "s3:x-amz-server-side-encryption-aws-kms-key-id" = aws_kms_key.principal["documentos"].arn } }
      },
    ]
  })
}
