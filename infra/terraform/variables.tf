variable "regiao" {
  description = "Região da AWS. Os dados em repouso ficam no Brasil."
  type        = string
  default     = "sa-east-1"
}

variable "ambiente" {
  description = "Nome do ambiente (entra nos nomes dos recursos)."
  type        = string
  default     = "producao"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.ambiente))
    error_message = "Use letras minúsculas, números e hífen."
  }
}

variable "zonas" {
  description = "Duas ou três zonas de disponibilidade da região."
  type        = list(string)
  default     = ["sa-east-1a", "sa-east-1c"]
  validation {
    condition     = length(var.zonas) >= 2
    error_message = "Multi-AZ exige pelo menos duas zonas."
  }
}

variable "cidr_vpc" {
  type    = string
  default = "10.40.0.0/16"
}

variable "nat_por_zona" {
  description = "Um NAT por zona (mais disponível) ou um só (mais barato)."
  type        = bool
  default     = false
}

variable "endpoints_de_interface" {
  description = "Endpoints privados para Secrets Manager, ECR, CloudWatch Logs e STS (o tráfego não passa pelo NAT)."
  type        = bool
  default     = true
}

variable "dominio" {
  description = "Domínio público da aplicação (ex.: greenia.exemplo.com.br)."
  type        = string
}

variable "dominio_email" {
  description = "Domínio do remetente dos emails (SES). Pode ser o mesmo da aplicação."
  type        = string
}

variable "certificado_acm_arn" {
  description = "ARN do certificado do ACM (sa-east-1) já validado para o domínio."
  type        = string
}

variable "imagem_tag" {
  description = "Tag da imagem no ECR (imutável)."
  type        = string
}

variable "banco_classe" {
  type    = string
  default = "db.t4g.medium"
}

variable "banco_armazenamento_gb" {
  type    = number
  default = 100
}

variable "banco_armazenamento_max_gb" {
  description = "Teto do crescimento automático do disco."
  type        = number
  default     = 500
}

variable "redis_classe" {
  type    = string
  default = "cache.t4g.small"
}

variable "redis_auth_token" {
  description = "Senha do Redis (AUTH). Informe por TF_VAR_redis_auth_token; o mesmo valor entra no segredo REDIS_URL."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.redis_auth_token) >= 32 && length(var.redis_auth_token) <= 128
    error_message = "O AUTH do ElastiCache exige de 32 a 128 caracteres (use pelo menos 32)."
  }
}

variable "api_tarefas" {
  type    = number
  default = 2
}

variable "api_cpu" {
  type    = number
  default = 1024
}

variable "api_memoria" {
  type    = number
  default = 2048
}

variable "fila_tarefas" {
  type    = number
  default = 1
}

variable "fila_cpu" {
  type    = number
  default = 1024
}

variable "fila_memoria" {
  type    = number
  default = 2048
}

variable "conversor_tarefas" {
  type    = number
  default = 1
}

variable "conversor_cpu" {
  description = "O conversor roda OCR e LibreOffice: mais CPU e memória."
  type        = number
  default     = 2048
}

variable "conversor_memoria" {
  type    = number
  default = 4096
}

variable "retencao_logs_dias" {
  type    = number
  default = 365
}

variable "backup_diario_dias" {
  type    = number
  default = 35
}

variable "backup_mensal_dias" {
  type    = number
  default = 365
}

variable "email_alarmes" {
  description = "Quem recebe os alarmes (inscrição confirmada por email)."
  type        = string
}

variable "segredos_oidc" {
  description = "Nomes das variáveis com segredos OIDC dos clientes (ex.: OIDC_CLIENTE_ENTRA_SECRET). O valor é gravado fora do Terraform."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for n in var.segredos_oidc : can(regex("^OIDC_[A-Z0-9_]+$", n))])
    error_message = "Cada nome começa com OIDC_ e usa letras maiúsculas, números e sublinhado."
  }
}

# ------------------------------------------------------------ conta de auditoria

variable "auditoria_papel_terraform_arn" {
  description = "Papel que o Terraform assume na conta de auditoria para criar o bucket e o papel das âncoras."
  type        = string
}

variable "auditoria_external_id" {
  description = "ExternalId exigido para assumir o papel das âncoras. Informe por TF_VAR_auditoria_external_id."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.auditoria_external_id) >= 16
    error_message = "Use pelo menos 16 caracteres."
  }
}

variable "auditoria_retencao_dias" {
  description = "Retenção de cada âncora (modo compliance). Tem de bater com AUDIT_ANCHOR_RETENTION_DAYS."
  type        = number
  default     = 1825
}
