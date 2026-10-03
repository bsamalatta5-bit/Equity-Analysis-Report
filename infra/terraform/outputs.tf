output "load_balancer_dns_name" {
  value = aws_lb.main.dns_name
}

output "database_endpoint" {
  value     = aws_db_instance.main.address
  sensitive = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "recordings_bucket_name" {
  value = aws_s3_bucket.recordings.id
}

output "secrets_manager_arns" {
  description = "Every secret this configuration provisions, for a deploy pipeline to cross-reference against docs/secrets.md's inventory."
  value = {
    database_migrator_url       = aws_secretsmanager_secret.database_migrator_url.arn
    database_url                = aws_secretsmanager_secret.database_url.arn
    redis_url                   = aws_secretsmanager_secret.redis_url.arn
    recording_bucket            = aws_secretsmanager_secret.recording_bucket.arn
    recording_encryption_key    = aws_secretsmanager_secret.recording_encryption_key.arn
    recording_signing_secret    = aws_secretsmanager_secret.recording_signing_secret.arn
    voice_gateway_service_token = aws_secretsmanager_secret.voice_gateway_service_token.arn
  }
}
