# Segredos: o Terraform cria só o recipiente; o valor é gravado fora dele
# (aws secretsmanager put-secret-value), para não ficar no estado. A senha do
# dono do banco é gerenciada pelo próprio RDS (manage_master_user_password).
locals {
  segredos = merge({
    ANTHROPIC_API_KEY        = "Chave da API do modelo"
    DATABASE_URL             = "Conexão do servidor (papel sem BYPASSRLS), sslmode=require"
    DATABASE_OWNER_URL       = "Conexão do dono das tabelas, usada só pela tarefa de migração"
    APP_DB_PASSWORD          = "Senha do papel do servidor, criada pelo migrador"
    REDIS_URL                = "rediss://:<AUTH>@<endpoint>:6379"
    SMTP_URL                 = "smtps://<usuario>:<senha>@email-smtp.${var.regiao}.amazonaws.com:465"
    AUDIT_ANCHOR_EXTERNAL_ID = "ExternalId do papel das âncoras (igual a var.auditoria_external_id)"
  }, { for n in var.segredos_oidc : n => "Segredo OIDC de um cliente" })
  # O que cada processo recebe. A migração é o único que vê o dono do banco.
  segredos_app      = [for n in keys(local.segredos) : n if !contains(["DATABASE_OWNER_URL", "APP_DB_PASSWORD"], n)]
  segredos_migracao = ["DATABASE_OWNER_URL", "APP_DB_PASSWORD"]
}

resource "aws_secretsmanager_secret" "app" {
  for_each                = local.segredos
  name                    = "${local.nome}/${each.key}"
  description             = each.value
  kms_key_id              = aws_kms_key.principal["segredos"].arn
  recovery_window_in_days = 30
}
