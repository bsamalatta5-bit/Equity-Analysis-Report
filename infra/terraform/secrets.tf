# The remaining secrets from docs/secrets.md's inventory that aren't
# generated alongside another resource (database.tf/cache.tf/storage.tf
# each create their own connection-string secret next to the resource it
# describes). Random values generated here, never typed in by a human —
# consistent with Section 13.3: nothing in this repository ever holds the
# real value.

resource "random_password" "recording_encryption_key" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "recording_encryption_key" {
  name                    = "${local.name_prefix}/recording-encryption-key"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "recording_encryption_key" {
  secret_id = aws_secretsmanager_secret.recording_encryption_key.id
  # AES-256-GCM needs exactly 32 raw bytes, base64-encoded — matching
  # loadBase64Secret("RECORDING_ENCRYPTION_KEY", 32, ...)'s own check.
  secret_string = base64encode(random_password.recording_encryption_key.result)
}

resource "random_password" "recording_signing_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "recording_signing_secret" {
  name                    = "${local.name_prefix}/recording-signing-secret"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "recording_signing_secret" {
  secret_id     = aws_secretsmanager_secret.recording_signing_secret.id
  secret_string = random_password.recording_signing_secret.result
}

resource "random_password" "voice_gateway_service_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "voice_gateway_service_token" {
  name                    = "${local.name_prefix}/voice-gateway-service-token"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "voice_gateway_service_token" {
  secret_id     = aws_secretsmanager_secret.voice_gateway_service_token.id
  secret_string = random_password.voice_gateway_service_token.result
}

# TELEPHONY_WEBHOOK_SIGNING_SECRET, SPEECH_RECOGNITION_API_KEY, and the
# other real-provider credentials in docs/secrets.md's inventory are
# deliberately NOT generated here: a `random_password` can stand in for a
# value this application itself originates (an encryption key, a signing
# secret), but a telephony/speech-provider credential comes from that
# provider's own console once Module 1's halt gate clears and a provider
# is actually selected (docs/adr/dialect-feasibility-verdict.md) — a
# random placeholder here would be actively misleading, implying a
# decision this repository hasn't made.
