# GreenIA em produção: AWS sa-east-1.
# Duas contas: a de produção (provedor padrão) e a de auditoria (alias
# "auditoria"), onde ficam só as âncoras da cadeia de auditoria, com Object Lock.
# Nada aqui foi aplicado: o repositório valida com `terraform validate` e com um
# plano sobre provedor simulado (`terraform test`). Veja infra/README.md.
terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = ">= 6.0, < 7.0"
      configuration_aliases = [aws.auditoria]
    }
  }
  # Estado remoto: bucket S3 com versionamento e criptografia, na conta de
  # produção. Configuração parcial na hora do init:
  #   terraform init -backend-config=backend.hcl
  backend "s3" {}
}

provider "aws" {
  region = var.regiao
  default_tags {
    tags = local.tags
  }
}

provider "aws" {
  alias  = "auditoria"
  region = var.regiao
  assume_role {
    role_arn = var.auditoria_papel_terraform_arn
  }
  default_tags {
    tags = local.tags
  }
}
