# Rede: sub-redes públicas (só o ALB e o NAT), privadas de aplicação (tarefas do
# ECS) e privadas de dados (RDS e Redis, sem rota para a internet).
resource "aws_vpc" "principal" {
  cidr_block           = var.cidr_vpc
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.nome }
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = local.nome }
}

resource "aws_subnet" "publica" {
  count                   = length(var.zonas)
  vpc_id                  = aws_vpc.principal.id
  availability_zone       = var.zonas[count.index]
  cidr_block              = cidrsubnet(var.cidr_vpc, 8, count.index)
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.nome}-publica-${var.zonas[count.index]}", Camada = "publica" }
}

resource "aws_subnet" "aplicacao" {
  count             = length(var.zonas)
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 10 + count.index)
  tags              = { Name = "${local.nome}-aplicacao-${var.zonas[count.index]}", Camada = "aplicacao" }
}

resource "aws_subnet" "dados" {
  count             = length(var.zonas)
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 20 + count.index)
  tags              = { Name = "${local.nome}-dados-${var.zonas[count.index]}", Camada = "dados" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }
  tags = { Name = "${local.nome}-publica" }
}

resource "aws_route_table_association" "publica" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

locals {
  nats = var.nat_por_zona ? length(var.zonas) : 1
}

resource "aws_eip" "nat" {
  count  = local.nats
  domain = "vpc"
  tags   = { Name = "${local.nome}-nat-${count.index}" }
}

resource "aws_nat_gateway" "principal" {
  count         = local.nats
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id
  tags          = { Name = "${local.nome}-nat-${count.index}" }
  depends_on    = [aws_internet_gateway.principal]
}

resource "aws_route_table" "aplicacao" {
  count  = length(var.zonas)
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.principal[var.nat_por_zona ? count.index : 0].id
  }
  tags = { Name = "${local.nome}-aplicacao-${var.zonas[count.index]}" }
}

resource "aws_route_table_association" "aplicacao" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.aplicacao[count.index].id
  route_table_id = aws_route_table.aplicacao[count.index].id
}

# Dados: sem rota para fora da VPC.
resource "aws_route_table" "dados" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nome}-dados" }
}

resource "aws_route_table_association" "dados" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.dados[count.index].id
  route_table_id = aws_route_table.dados.id
}

# O grupo padrão da VPC fica sem regra nenhuma.
resource "aws_default_security_group" "padrao" {
  vpc_id = aws_vpc.principal.id
}

# Registro do tráfego da VPC (aceito e recusado), para investigação.
resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.principal.id
  traffic_type         = "ALL"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.vpc.arn
  iam_role_arn         = aws_iam_role.flow_log.arn
}

resource "aws_iam_role" "flow_log" {
  name = "${local.nome}-flow-log"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "vpc-flow-logs.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "flow_log" {
  name = "logs"
  role = aws_iam_role.flow_log.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.vpc.arn}:*"
    }]
  })
}

# ------------------------------------------------------------ endpoints privados

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${var.regiao}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.aplicacao[*].id
  tags              = { Name = "${local.nome}-s3" }
}

locals {
  servicos_interface = var.endpoints_de_interface ? toset(["secretsmanager", "ecr.api", "ecr.dkr", "logs", "sts"]) : toset([])
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = local.servicos_interface
  vpc_id              = aws_vpc.principal.id
  service_name        = "com.amazonaws.${var.regiao}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.aplicacao[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = { Name = "${local.nome}-${each.key}" }
}

# ------------------------------------------------------------ grupos de segurança

resource "aws_security_group" "alb" {
  name        = "${local.nome}-alb"
  description = "ALB publico: 80 (redireciona) e 443"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_para_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}

# Tarefas da API e da fila.
resource "aws_security_group" "app" {
  name        = "${local.nome}-app"
  description = "Tarefas do ECS (API e fila)"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "app_do_alb" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}

# Saída HTTPS: API do modelo, SES, provedores OIDC dos clientes. Grupo de
# segurança não filtra por nome; a lista de domínios fica em PENDENCIAS-SEGURANCA.md.
resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "app_smtp" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 465
  to_port           = 465
}

resource "aws_vpc_security_group_egress_rule" "app_banco" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.banco.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "app_redis" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.redis.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}

resource "aws_security_group" "banco" {
  name        = "${local.nome}-banco"
  description = "RDS: so as tarefas do ECS"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "banco_do_app" {
  security_group_id            = aws_security_group.banco.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_security_group" "redis" {
  name        = "${local.nome}-redis"
  description = "ElastiCache: so as tarefas do ECS"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "redis_do_app" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}

resource "aws_security_group" "endpoints" {
  name        = "${local.nome}-endpoints"
  description = "Endpoints privados: HTTPS de dentro da VPC"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  security_group_id = aws_security_group.endpoints.id
  cidr_ipv4         = var.cidr_vpc
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}
