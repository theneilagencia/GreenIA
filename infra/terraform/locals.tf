locals {
  nome = "greenia-${var.ambiente}"
  tags = {
    Projeto  = "greenia"
    Ambiente = var.ambiente
    Gerencia = "terraform"
  }
  conta_producao = data.aws_caller_identity.producao.account_id
  particao       = data.aws_partition.atual.partition
}

data "aws_caller_identity" "producao" {}
data "aws_partition" "atual" {}
