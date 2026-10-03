variable "aws_region" {
  description = "AWS region. CLOUD_REGION in .env.example names Saudi Arabia for data residency (Section 1); no AWS region there exists today, so this defaults to the nearest real region with the needed services and must be revisited once one does."
  type        = string
  default     = "me-south-1" # Bahrain — the nearest existing AWS region to Saudi Arabia at the time this was written.
}

variable "environment" {
  description = "Deployment environment name, used to namespace every resource (staging, production)."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "project_name" {
  description = "Short name prefixed onto every resource."
  type        = string
  default     = "voice-receptionist"
}

variable "database_instance_class" {
  description = "RDS instance class for the Postgres+pgvector database."
  type        = string
  default     = "db.t4g.medium"
}

variable "database_allocated_storage_gb" {
  type    = number
  default = 50
}

variable "redis_node_type" {
  description = "ElastiCache node type for session/rate-limit/concurrency-guard Redis."
  type        = string
  default     = "cache.t4g.micro"
}

variable "api_container_image" {
  description = "Full image URI for apps/api, built and pushed by CI before `terraform apply` (not built by Terraform itself)."
  type        = string
}

variable "voice_gateway_container_image" {
  description = "Full image URI for apps/voice-gateway."
  type        = string
}

variable "dashboard_container_image" {
  description = "Full image URI for apps/dashboard."
  type        = string
}

variable "alert_notification_email" {
  description = "Email address CloudWatch alarms (A13.?/alerting) notify — e.g. the on-call rotation's address."
  type        = string
}
