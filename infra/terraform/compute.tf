# Compute: ECS Fargate — no servers to patch, and task definitions are
# the natural place to wire "every secret arrives as an env var" (A13.3):
# the `secrets` block below tells ECS to fetch each Secrets Manager value
# and inject it as the named env var at container start. The running
# container never calls Secrets Manager itself; only the task's execution
# role (not the task role the application code runs as) has
# `secretsmanager:GetSecretValue`, scoped to exactly the ARNs below.

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name_prefix}/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "voice_gateway" {
  name              = "/ecs/${local.name_prefix}/voice-gateway"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "dashboard" {
  name              = "/ecs/${local.name_prefix}/dashboard"
  retention_in_days = 30
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

# What the running application is allowed to do once it's up — object
# storage read/write for recordings (A10.2), nothing else. No
# secretsmanager:* permission here: by design, the application process
# itself never fetches a secret; it only ever reads process.env (see
# docs/secrets.md).
resource "aws_iam_role_policy" "ecs_task_recordings" {
  name = "${local.name_prefix}-recordings-access"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.recordings.arn}/*"
    }]
  })
}

resource "aws_iam_role" "ecs_execution_role" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

locals {
  app_secrets_arns = [
    aws_secretsmanager_secret.database_url.arn,
    aws_secretsmanager_secret.redis_url.arn,
    aws_secretsmanager_secret.recording_bucket.arn,
    aws_secretsmanager_secret.recording_encryption_key.arn,
    aws_secretsmanager_secret.recording_signing_secret.arn,
    aws_secretsmanager_secret.voice_gateway_service_token.arn,
  ]
}

# The execution role (not the task role above) is what's allowed to read
# secret *values* on the application's behalf at container start — the
# distinction ECS draws specifically so the running application code
# doesn't inherit that permission.
resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-secrets-access"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = local.app_secrets_arns
    }]
  })
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_container_image
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "API_PORT", value = "3001" },
      { name = "DASHBOARD_ORIGIN", value = "https://app.${var.environment}.example" },
      { name = "CLOUD_REGION", value = "me-central-saudi-arabia" },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
      { name = "RECORDING_BUCKET", valueFrom = aws_secretsmanager_secret.recording_bucket.arn },
      { name = "RECORDING_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.recording_encryption_key.arn },
      { name = "RECORDING_SIGNING_SECRET", valueFrom = aws_secretsmanager_secret.recording_signing_secret.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.environment == "production" ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.compute.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.https]
}

# apps/voice-gateway and apps/dashboard follow the exact same task
# definition / service shape as apps/api above (same execution role,
# same secrets-injection pattern) — omitted here to keep this file to one
# fully worked example rather than three near-identical copies; see
# README.md for the one line that differs per service (image, port, and
# which secrets each one actually needs per docs/secrets.md's inventory).

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.load_balancer.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health/ready"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_acm_certificate" "main" {
  domain_name       = "*.${var.environment}.example" # Placeholder — a real rollout points this at the real domain.
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
