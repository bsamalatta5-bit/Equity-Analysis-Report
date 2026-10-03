# Alerting: the infrastructure-level half of A9.5/A11.3's escalation and
# spend-circuit-breaker logic, which already raises an application-level
# audit alert (`usage.spend_cap_breached`, apps/voice-gateway's
# spend-circuit-breaker.ts) — that alert needs a human-reaching channel in
# a real deployment, which is what this file provides. Nothing here
# duplicates the application's own breaker logic; it only makes sure
# infrastructure-level failures (the database going down, the API
# erroring, a task failing health checks) reach a human the same way a
# spend-cap breach already does at the application layer.

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_notification_email
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${local.name_prefix}-database-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "database_storage_low" {
  alarm_name          = "${local.name_prefix}-database-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5 * 1024 * 1024 * 1024 # 5 GiB
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  dimensions          = { ReplicationGroupId = aws_elasticache_replication_group.main.replication_group_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name_prefix}-api-5xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  dimensions          = { TargetGroup = aws_lb_target_group.api.arn_suffix, LoadBalancer = aws_lb.main.arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy_hosts" {
  alarm_name          = "${local.name_prefix}-api-unhealthy-targets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  dimensions          = { TargetGroup = aws_lb_target_group.api.arn_suffix, LoadBalancer = aws_lb.main.arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
