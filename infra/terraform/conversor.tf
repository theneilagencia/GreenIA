# Serviço de conversão (OCR, ImageMagick, LibreOffice): recebe arquivos de fora,
# possivelmente maliciosos. No Fargate não dá para tirar a rede de um processo
# filho (unshare é bloqueado), então o isolamento de rede é da infraestrutura:
#  - sub-redes próprias, sem rota para a internet (nem NAT);
#  - grupo de segurança que só aceita a API e a fila, e só sai para os endpoints
#    privados (ECR, Logs, Secrets Manager) e para o S3 (camadas da imagem);
#  - nenhum papel de tarefa (sem acesso a S3, KMS ou outra conta) e um segredo só.
# A API e a fila chamam http://conversor.<namespace>:8081 (CONVERTER_URL).
resource "aws_subnet" "conversor" {
  count             = length(var.zonas)
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 30 + count.index)
  tags              = { Name = "${local.nome}-conversor-${var.zonas[count.index]}", Camada = "conversor" }
}

# Só a rota local da VPC e o endpoint do S3: nada sai para a internet.
resource "aws_route_table" "conversor" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nome}-conversor" }
}

resource "aws_route_table_association" "conversor" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.conversor[count.index].id
  route_table_id = aws_route_table.conversor.id
}

resource "aws_vpc_endpoint_route_table_association" "conversor_s3" {
  vpc_endpoint_id = aws_vpc_endpoint.s3.id
  route_table_id  = aws_route_table.conversor.id
}

data "aws_ec2_managed_prefix_list" "s3" {
  name = "com.amazonaws.${var.regiao}.s3"
}

resource "aws_security_group" "conversor" {
  name        = "${local.nome}-conversor"
  description = "Conversor: entra so da API e da fila; sai so para endpoints privados e S3"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "conversor_do_app" {
  security_group_id            = aws_security_group.conversor.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 8081
  to_port                      = 8081
}

resource "aws_vpc_security_group_egress_rule" "conversor_endpoints" {
  security_group_id            = aws_security_group.conversor.id
  referenced_security_group_id = aws_security_group.endpoints.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}

resource "aws_vpc_security_group_egress_rule" "conversor_s3" {
  security_group_id = aws_security_group.conversor.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.s3.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "app_conversor" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.conversor.id
  ip_protocol                  = "tcp"
  from_port                    = 8081
  to_port                      = 8081
}

# Nome interno do conversor (Cloud Map).
resource "aws_service_discovery_private_dns_namespace" "interno" {
  name = "${local.nome}.interno"
  vpc  = aws_vpc.principal.id
}

resource "aws_service_discovery_service" "conversor" {
  name = "conversor"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.interno.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}

locals {
  conversor_url = "http://conversor.${aws_service_discovery_private_dns_namespace.interno.name}:8081"
}

resource "aws_cloudwatch_log_group" "conversor" {
  name              = "/greenia/${var.ambiente}/conversor"
  retention_in_days = var.retencao_logs_dias
  kms_key_id        = aws_kms_key.principal["logs"].arn
}

resource "aws_ecs_task_definition" "conversor" {
  family                   = "${local.nome}-conversor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.conversor_cpu
  memory                   = var.conversor_memoria
  execution_role_arn       = aws_iam_role.execucao.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([{
    name         = "conversor"
    image        = local.imagem
    essential    = true
    command      = ["node", "src/converter-main.ts"]
    stopTimeout  = 120
    portMappings = [{ containerPort = 8081, protocol = "tcp" }]
    environment = [for k, v in {
      NODE_ENV          = "production"
      CONVERTER_PORT    = "8081"
      CONVERT_ISOLATION = "auto"
      CONVERT_MEM_MB    = tostring(floor(var.conversor_memoria * 0.6))
    } : { name = k, value = v }]
    secrets = [{ name = "CONVERTER_TOKEN", valueFrom = aws_secretsmanager_secret.app["CONVERTER_TOKEN"].arn }]
    linuxParameters = {
      initProcessEnabled = true
      capabilities       = { drop = ["ALL"] }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:8081/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.conversor.name
        awslogs-region        = var.regiao
        awslogs-stream-prefix = "conversor"
      }
    }
  }])
}

resource "aws_ecs_service" "conversor" {
  name                   = "conversor"
  cluster                = aws_ecs_cluster.principal.id
  task_definition        = aws_ecs_task_definition.conversor.arn
  desired_count          = var.conversor_tarefas
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = aws_subnet.conversor[*].id
    security_groups  = [aws_security_group.conversor.id]
    assign_public_ip = false
  }
  service_registries {
    registry_arn = aws_service_discovery_service.conversor.arn
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle {
    # Sem os endpoints privados, a tarefa não baixa a imagem nem escreve log.
    precondition {
      condition     = var.endpoints_de_interface
      error_message = "O conversor isolado exige endpoints_de_interface = true."
    }
  }
}
