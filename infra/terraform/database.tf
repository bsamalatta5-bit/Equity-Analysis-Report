# Database: RDS for PostgreSQL. AWS RDS supports the pgvector extension
# natively on Postgres 15+ (Section 5's embedding column, Module 8) — no
# self-managed Postgres host needed. Multi-AZ for production so a single
# AZ failure doesn't take the database down; single-AZ for staging to
# control cost.
#
# A13.3: the application never receives its own database password from
# this file. `random_password` generates it, `aws_secretsmanager_secret`
# stores it, and the compute layer (compute.tf) reads it back by ARN —
# the value itself never appears in a `terraform plan`/`apply` log beyond
# the resource graph, and never in application source or CI config.

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name_prefix}-db-subnet-group" }
}

resource "random_password" "database_migrator" {
  length  = 32
  special = false # Postgres connection-string-safe; avoids URL-encoding edge cases.
}

resource "random_password" "database_application" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.database_instance_class

  allocated_storage     = var.database_allocated_storage_gb
  max_allocated_storage = var.database_allocated_storage_gb * 4 # storage autoscaling ceiling
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "voice_receptionist"
  username = "postgres" # The DATABASE_MIGRATOR_URL role (superuser) — see docs/secrets.md.
  password = random_password.database_migrator.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false

  multi_az                  = var.environment == "production"
  backup_retention_period   = var.environment == "production" ? 30 : 7
  deletion_protection       = var.environment == "production"
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-final" : null

  # pgvector ships in RDS's own parameter group defaults for Postgres 15+;
  # no custom parameter group is required to enable it — only
  # `CREATE EXTENSION vector;`, which apps/api/prisma's migrations already
  # run (20240101000200_pgvector or equivalent — see apps/api/prisma/migrations).

  tags = { Name = "${local.name_prefix}-db" }
}

# The least-privileged application role (DATABASE_URL) — RLS applies only
# to this role, never to the migrator superuser above. Terraform can't run
# arbitrary SQL against RDS directly; a real rollout runs this exact
# statement once via a one-shot ECS task or a bootstrap Lambda using the
# migrator credential, mirroring infra/scripts/init-db.local.sql. Recorded
# here as the authoritative statement rather than left undocumented.
#
# CREATE ROLE voice_app LOGIN PASSWORD '<random_password.database_application.result>';
# GRANT CONNECT ON DATABASE voice_receptionist TO voice_app;

resource "aws_secretsmanager_secret" "database_migrator_url" {
  name                    = "${local.name_prefix}/database-migrator-url"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "database_migrator_url" {
  secret_id     = aws_secretsmanager_secret.database_migrator_url.id
  secret_string = "postgresql://${aws_db_instance.main.username}:${random_password.database_migrator.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/database-url"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://voice_app:${random_password.database_application.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
}
