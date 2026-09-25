# SES: domínio com Easy DKIM e MAIL FROM próprio. Os registros DNS saem nas
# saídas (dkim_tokens, mail_from) e são criados no provedor de DNS do domínio.
resource "aws_sesv2_email_identity" "dominio" {
  email_identity         = var.dominio_email
  configuration_set_name = aws_sesv2_configuration_set.principal.configuration_set_name
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "dominio" {
  email_identity         = aws_sesv2_email_identity.dominio.email_identity
  mail_from_domain       = "bounce.${var.dominio_email}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_sesv2_configuration_set" "principal" {
  configuration_set_name = local.nome
  delivery_options {
    tls_policy = "REQUIRE"
  }
  reputation_options {
    reputation_metrics_enabled = true
  }
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

# Usuário só para a interface SMTP. A credencial SMTP é gerada no console (ou
# com a chave de acesso convertida) e gravada no segredo SMTP_URL, fora do
# Terraform, para não ficar no estado.
resource "aws_iam_user" "smtp" {
  name = "${local.nome}-smtp"
}

resource "aws_iam_user_policy" "smtp" {
  name = "enviar"
  user = aws_iam_user.smtp.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "ses:SendRawEmail"
      Resource  = "*"
      Condition = { StringLike = { "ses:FromAddress" = "*@${var.dominio_email}" } }
    }]
  })
}
