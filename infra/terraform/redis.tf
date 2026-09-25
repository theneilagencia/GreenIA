# Fila (BullMQ) e contadores de limite por minuto. Sem dados de cliente de longo
# prazo; sem backup (veja "Backup e restauração" no README).
resource "aws_elasticache_subnet_group" "principal" {
  name       = local.nome
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_elasticache_parameter_group" "principal" {
  name   = "${local.nome}-redis7"
  family = "redis7"
  # BullMQ exige que as chaves da fila não sejam despejadas.
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "principal" {
  replication_group_id       = local.nome
  description                = "GreenIA: fila e limites"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_classe
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.principal.name
  security_group_ids         = [aws_security_group.redis.id]
  parameter_group_name       = aws_elasticache_parameter_group.principal.name
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token
  snapshot_retention_limit   = 0
  apply_immediately          = false
}
