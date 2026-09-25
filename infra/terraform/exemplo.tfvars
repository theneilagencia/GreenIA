# Exemplo de valores. Os sensíveis (redis_auth_token, auditoria_external_id) vão
# por variável de ambiente (TF_VAR_...), nunca em arquivo.
dominio                       = "greenia.exemplo.com.br"
dominio_email                 = "greenia.exemplo.com.br"
certificado_acm_arn           = "arn:aws:acm:sa-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000"
imagem_tag                    = "2026-09-25-e7cf0ac"
email_alarmes                 = "operacao@exemplo.com.br"
auditoria_papel_terraform_arn = "arn:aws:iam::222222222222:role/terraform-greenia-auditoria"
segredos_oidc                 = []
