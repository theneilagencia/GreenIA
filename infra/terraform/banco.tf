# PostgreSQL 16 gerenciado (RDS), Multi-AZ, criptografado, só TLS.
# pgvector: disponível no RDS for PostgreSQL 16 (CREATE EXTENSION vector); a
# plataforma ainda não usa (a busca da base de conhecimento é por palavra-chave).
resource "aws_db_subnet_group" "principal" {
  name       = local.nome
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_db_parameter_group" "pg16" {
  name   = "${local.nome}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "2000"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
}

resource "aws_db_instance" "principal" {
  identifier                          = local.nome
  engine                              = "postgres"
  engine_version                      = "16"
  instance_class                      = var.banco_classe
  allocated_storage                   = var.banco_armazenamento_gb
  max_allocated_storage               = var.banco_armazenamento_max_gb
  storage_type                        = "gp3"
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.principal["banco"].arn
  db_name                             = "greenia"
  username                            = "greenia_dono"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = aws_kms_key.principal["segredos"].arn
  multi_az                            = true
  db_subnet_group_name                = aws_db_subnet_group.principal.name
  vpc_security_group_ids              = [aws_security_group.banco.id]
  parameter_group_name                = aws_db_parameter_group.pg16.name
  publicly_accessible                 = false
  backup_retention_period             = var.backup_diario_dias
  backup_window                       = "05:00-06:00"
  maintenance_window                  = "sun:06:30-sun:07:30"
  copy_tags_to_snapshot               = true
  deletion_protection                 = true
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "${local.nome}-final"
  auto_minor_version_upgrade          = true
  iam_database_authentication_enabled = false
  performance_insights_enabled        = true
  performance_insights_kms_key_id     = aws_kms_key.principal["banco"].arn
  enabled_cloudwatch_logs_exports     = ["postgresql"]
}
