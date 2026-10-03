# Cache: ElastiCache Redis — sessions (A3.x), auth rate limiting (A3.5),
# the per-tenant concurrent-call ceiling (A11.2), and the voice-gateway's
# session store. A replication group (not a bare cluster) so production
# gets automatic failover; staging runs a single node to control cost.

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-cache"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Sessions, auth rate limiting, concurrency guard (Module 3, A11.2)."

  engine         = "redis"
  engine_version = "7.1"
  node_type      = var.redis_node_type
  port           = 6379

  num_cache_clusters         = var.environment == "production" ? 2 : 1
  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled           = var.environment == "production"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.cache.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = { Name = "${local.name_prefix}-redis" }
}

resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "${local.name_prefix}/redis-url"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}
